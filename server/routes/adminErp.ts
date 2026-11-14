import crypto from 'node:crypto';
import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { BRAND_CONFIG, parseWeightGrams } from '../../shared/catalogSeed.ts';
import {
  ALL_ADMIN_PERMISSIONS,
  DEFAULT_BUSINESS_SETTINGS,
  DEFAULT_EMAIL_PREFERENCES,
  DEFAULT_WEBSITE_SETTINGS,
  getBusinessSettingsDoc,
  getWebsiteSettingsDoc,
  MongoDatabase,
  syncInventoryRecord,
} from '../db/mongo.ts';
import {
  checkAndEmitExpiryNotifications,
  clearResolvedStockAlerts,
  createAdminNotification,
  emitStockAlertIfNeeded,
  escapeRegex,
  logAudit,
  requireAdmin,
  requirePermission,
  requireSuperAdmin,
} from '../middleware/security.ts';
import { MediaStorageService } from '../services/cloudinaryService.ts';
import { EmailTransport } from '../services/emailProvider.ts';
import { EmailQueueService } from '../services/emailQueue.ts';
import { EmailService } from '../services/emailService.ts';
import {
  generateCsvString,
  generateExcelBuffer,
  generateOrderInvoicePdf,
  generatePdfBuffer,
  type ReportTableData,
} from '../services/exportService.ts';
import {
  escapeHtml,
  generateSecureToken,
  hashPassword,
  isValidEmail,
  normalizeEmail,
  normalizeMobile,
  validatePasswordStrength,
} from '../utils/crypto.ts';
import { AppConfig } from '../config.ts';
import { ctaButtonHtml, wrapInBrandEmailLayout } from '../emails/brandLayout.ts';
import { hydrateOrder } from './orders.ts';
import { invalidatePublicCache, parseProductRow } from './public.ts';

function makeUploader(allowPdf = false) {
  return multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
      const mimes = allowPdf
        ? ['image/png', 'image/jpeg', 'image/webp', 'application/pdf']
        : ['image/png', 'image/jpeg', 'image/webp'];
      if (mimes.includes(file.mimetype)) cb(null, true);
      else cb(new Error('Unsupported file format.'));
    },
  });
}

const productImgUpload = makeUploader(false);
const invoiceDocUpload = makeUploader(true);
const receiptUpload = makeUploader(true);

const erpProductSchema = z.object({
  name: z.string().trim().min(2, 'Product name is required'),
  hindiName: z.string().trim().optional().nullable(),
  subtitle: z.string().trim().optional().default('Jammu Heritage Reserve'),
  sku: z.string().trim().optional().default(''),
  barcode: z.string().trim().optional().nullable(),
  purchasePrice: z.number().min(0).default(0),
  price: z.number().positive('Selling price must be positive'),
  discountPrice: z.number().min(0).optional().nullable(),
  gstRate: z.number().min(0).max(28).default(5),
  stock: z.number().min(0).default(0),
  minStockAlert: z.number().min(0).default(5),
  unit: z.enum(['kg', 'gram', 'ml', 'piece']).default('kg'),
  weightLabel: z.string().trim().optional().default('1kg'),
  categoryId: z.string().trim().min(1),
  image: z.string().trim().optional(),
  images: z.array(z.string().trim()).optional(),
  description: z.string().trim().min(3),
  origin: z.string().trim().optional().default('Jammu & Kashmir Orchards'),
  grade: z.string().trim().optional().default('Royal Grade A++'),
  expiryDate: z.string().trim().optional().nullable(),
  storageInstructions: z.string().trim().optional().default('Store in a cool, dry airtight container.'),
  featured: z.boolean().optional().default(false),
  status: z.enum(['draft', 'published']).default('published'),
  weightVariants: z
    .array(
      z.object({
        id: z.string().optional(),
        weightLabel: z.string().trim().min(1),
        sku: z.string().trim().min(1),
        purchasePrice: z.number().min(0),
        sellingPrice: z.number().positive(),
        discountPrice: z.number().min(0).optional().nullable(),
        stock: z.number().min(0),
        active: z.boolean().optional().default(true),
      })
    )
    .optional()
    .default([]),
});

export function createAdminErpRouter(
  db: MongoDatabase,
  transport: EmailTransport,
  queue: EmailQueueService,
  mediaStorage: MediaStorageService,
  emailService?: EmailService,
  config?: AppConfig
) {
  const router = Router();
  router.use(requireAdmin);

  function getRequestOrigin(req: any, fallback: string): string {
    const forwardedHost = (req.headers?.['x-forwarded-host'] || req.headers?.host || '').toString();
    if (forwardedHost && !forwardedHost.includes('localhost') && !forwardedHost.includes('127.0.0.1')) {
      const proto = (req.headers?.['x-forwarded-proto'] || (req.secure ? 'https' : 'http')).toString();
      return `${proto}://${forwardedHost}`.replace(/\/+$/, '');
    }
    return fallback;
  }

  async function getBrandLogoUrl(): Promise<string> {
    const row = await db.models.SiteSetting.findOne({ key: 'brand_logo_url' }).lean();
    let logoPath = BRAND_CONFIG.emailLogoUrl;
    if (typeof row?.value === 'string' && row.value.trim().length > 0) {
      logoPath = row.value.trim();
    }
    return logoPath;
  }

  async function syncVariants(
    productId: string,
    variants: z.infer<typeof erpProductSchema>['weightVariants'],
    now: string
  ) {
    await db.models.ProductVariant.deleteMany({ productId });
    if (variants.length > 0) {
      await db.models.ProductVariant.insertMany(
        variants.map(v => ({
          id: v.id && v.id.startsWith('var_') ? v.id : `var_${crypto.randomUUID()}`,
          productId,
          weightLabel: v.weightLabel,
          sku: v.sku,
          purchasePrice: v.purchasePrice,
          sellingPrice: v.sellingPrice,
          discountPrice: v.discountPrice ?? null,
          stock: v.stock,
          active: Boolean(v.active),
          createdAt: now,
          updatedAt: now,
        }))
      );
    }
  }

  async function applyPurchaseToInventory(purchaseId: string, adminId: string, adminName: string) {
    const purchase = await db.models.Purchase.findOne({ id: purchaseId }).lean();
    if (!purchase) return;

    const items = await db.models.PurchaseItem.find({ purchaseId }).lean();
    const now = new Date().toISOString();

    for (const it of items) {
      const prod = await db.models.Product.findOne({ id: it.productId }).lean();
      if (!prod) continue;

      const prevStock = Number(prod.stock || 0);
      const nextStock = Number((prevStock + it.quantity).toFixed(2));
      const batchId = `batch_${crypto.randomUUID()}`;

      await db.models.InventoryBatch.create({
        id: batchId,
        productId: it.productId,
        purchaseId: purchase.id,
        supplierId: purchase.supplierId,
        batchNumber: it.batchNumber || `PO-${purchase.purchaseNumber}`,
        quantity: it.quantity,
        remainingQty: it.quantity,
        purchaseCost: it.purchasePrice,
        expiryDate: it.expiryDate || null,
        notes: `Received via Purchase #${purchase.purchaseNumber}`,
        receivedAt: now,
      });

      await db.models.Product.updateOne(
        { id: it.productId },
        { $set: { stock: nextStock, purchasePrice: it.purchasePrice, inStock: nextStock > 0, updatedAt: now } }
      );
      await syncInventoryRecord(db, it.productId);
      await clearResolvedStockAlerts(db, it.productId, nextStock, Number(prod.minStockAlert ?? 5));

      await db.models.InventoryTransaction.create({
        id: `invtx_${crypto.randomUUID()}`,
        productId: it.productId,
        movementType: 'purchase_receive',
        quantity: it.quantity,
        previousStock: prevStock,
        updatedStock: nextStock,
        unitCost: it.purchasePrice,
        batchNumber: it.batchNumber || `PO-${purchase.purchaseNumber}`,
        reason: `Purchase #${purchase.purchaseNumber} received`,
        adminId,
        adminName,
        timestamp: now,
      });
    }

    const unpaid = Math.max(0, Number(purchase.totalAmount) - Number(purchase.paidAmount));
    if (unpaid > 0) {
      await db.models.Supplier.updateOne(
        { id: purchase.supplierId },
        { $inc: { outstandingBalance: unpaid }, $set: { updatedAt: now } }
      );
      await createAdminNotification(db, {
        type: 'supplier_payment_due',
        title: `Supplier Balance Due: PO #${purchase.purchaseNumber}`,
        message: `₹${unpaid.toLocaleString('en-IN')} pending payment to supplier.`,
        severity: 'warning',
        entityType: 'purchase',
        entityId: purchase.purchaseNumber,
      });
    }
  }

  async function reversePurchaseFromInventory(purchaseId: string, adminId: string, adminName: string, reasonLabel: string) {
    const purchase = await db.models.Purchase.findOne({ id: purchaseId }).lean();
    if (!purchase) return;
    const items = await db.models.PurchaseItem.find({ purchaseId }).lean();
    const now = new Date().toISOString();

    for (const it of items) {
      const prod = await db.models.Product.findOne({ id: it.productId }).lean();
      if (!prod) continue;
      const prevStock = Number(prod.stock || 0);
      const nextStock = Math.max(0, Number((prevStock - Number(it.quantity || 0)).toFixed(2)));
      await db.models.Product.updateOne(
        { id: it.productId },
        { $set: { stock: nextStock, inStock: nextStock > 0, updatedAt: now } }
      );
      await syncInventoryRecord(db, it.productId);
      await emitStockAlertIfNeeded(
        db,
        { id: prod.id, name: prod.name, unit: prod.unit, stock: nextStock, minStockAlert: prod.minStockAlert },
        reasonLabel
      );
      await db.models.InventoryTransaction.create({
        id: `invtx_${crypto.randomUUID()}`,
        productId: it.productId,
        movementType: 'adjustment',
        quantity: Number(it.quantity || 0),
        previousStock: prevStock,
        updatedStock: nextStock,
        unitCost: it.purchasePrice,
        batchNumber: it.batchNumber || `PO-${purchase.purchaseNumber}`,
        reason: `${reasonLabel} (PO #${purchase.purchaseNumber})`,
        adminId,
        adminName,
        timestamp: now,
      });
    }

    await db.models.InventoryBatch.deleteMany({ purchaseId });

    const unpaid = Math.max(0, Number(purchase.totalAmount) - Number(purchase.paidAmount));
    if (unpaid > 0) {
      const sup = await db.models.Supplier.findOne({ id: purchase.supplierId }).lean();
      if (sup) {
        const nextBal = Math.max(0, Number(sup.outstandingBalance || 0) - unpaid);
        await db.models.Supplier.updateOne(
          { id: purchase.supplierId },
          { $set: { outstandingBalance: nextBal, updatedAt: now } }
        );
      }
    }
  }

  async function computeFinanceMetrics(from?: string, to?: string) {
    const orderFilter: Record<string, unknown> = {};
    if (from || to) {
      const range: Record<string, string> = {};
      if (from) range.$gte = from;
      if (to) range.$lte = `${to}T23:59:59.999Z`;
      orderFilter.createdAt = range;
    }

    const orders = await db.models.Order.find(orderFilter).lean();

    let grossSales = 0;
    let totalDiscounts = 0;
    let totalRefunds = 0;
    let gstCollected = 0;
    let cogs = 0;

    for (const o of orders) {
      const st = String(o.status);
      if (st === 'cancelled' || st === 'returned') {
        totalRefunds += Number(o.refundAmount || 0);
        continue;
      }
      grossSales += Number(o.subtotal || 0) + Number(o.shippingCharge || 0);
      totalDiscounts += Number(o.discountAmount || 0);
      gstCollected += Number(o.taxAmount || 0);
      totalRefunds += Number(o.refundAmount || 0);
      cogs += Number(o.costOfGoods || 0);
    }

    const netSales = Math.max(0, grossSales - totalDiscounts - totalRefunds);

    const poFilter: Record<string, unknown> = { status: { $ne: 'cancelled' } };
    if (from || to) {
      const range: Record<string, string> = {};
      if (from) range.$gte = from.slice(0, 10);
      if (to) range.$lte = to.slice(0, 10);
      poFilter.purchaseDate = range;
    }
    const purchases = await db.models.Purchase.find(poFilter, { totalAmount: 1, _id: 0 }).lean();
    const purchaseCosts = purchases.reduce((s, p) => s + Number(p.totalAmount || 0), 0);

    const expFilter: Record<string, unknown> = {};
    if (from || to) {
      const range: Record<string, string> = {};
      if (from) range.$gte = from.slice(0, 10);
      if (to) range.$lte = to.slice(0, 10);
      expFilter.expenseDate = range;
    }
    const expDocs = await db.models.Expense.find(expFilter, { category: 1, amount: 1, _id: 0 }).lean();
    const catTotals = new Map<string, number>();
    for (const e of expDocs) {
      catTotals.set(e.category, (catTotals.get(e.category) || 0) + Number(e.amount || 0));
    }
    const expRows = Array.from(catTotals.entries()).map(([category, total]) => ({ category, total }));

    const operatingExpenses = expRows.reduce((s, r) => s + r.total, 0);
    const grossProfit = netSales - cogs;
    const netProfit = grossProfit - operatingExpenses;

    return {
      grossSales: Math.round(grossSales),
      totalDiscounts: Math.round(totalDiscounts),
      totalRefunds: Math.round(totalRefunds),
      netSales: Math.round(netSales),
      gstCollected: Math.round(gstCollected),
      cogs: Math.round(cogs),
      purchaseCosts: Math.round(purchaseCosts),
      operatingExpenses: Math.round(operatingExpenses),
      estimatedGrossProfit: Math.round(grossProfit),
      estimatedNetProfit: Math.round(netProfit),
      expensesByCategory: expRows,
    };
  }

  // =============================================
  // 1. DASHBOARD ANALYTICS, SEARCH & NOTIFICATIONS
  // =============================================
  router.get('/dashboard/analytics', requirePermission('dashboard'), async (req, res) => {
    const period = String(req.query.period || 'monthly');
    const nowMs = Date.now();
    const thirtyDaysAgo = new Date(nowMs - 30 * 86400_000).toISOString();
    const sixtyDaysAgo = new Date(nowMs - 60 * 86400_000).toISOString();
    const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();

    await checkAndEmitExpiryNotifications(db);

    const [ordersList, productsList, categoriesList, customersList, emailLogs, expensesList, orderItemsList, upcomingCampaigns, batchesList, queueStats] =
      await Promise.all([
        db.models.Order.find({}, { _id: 0 }).sort({ createdAt: -1 }).lean(),
        db.models.Product.find({}, { _id: 0 }).lean(),
        db.models.Category.find({}, { id: 1, name: 1, _id: 0 }).lean(),
        db.models.Customer.find({ role: 'customer' }, { id: 1, createdAt: 1, _id: 0 }).lean(),
        db.models.EmailLog.find({}, { status: 1, _id: 0 }).lean(),
        db.models.Expense.find({}, { amount: 1, expenseDate: 1, _id: 0 }).lean(),
        db.models.OrderItem.find({}, { _id: 0 }).lean(),
        db.models.MarketingCampaign.find(
          { status: { $in: ['draft', 'scheduled'] } },
          { id: 1, campaignName: 1, campaignType: 1, festivalName: 1, scheduledAt: 1, status: 1, createdAt: 1, _id: 0 }
        )
          .sort({ scheduledAt: 1, createdAt: 1 })
          .limit(3)
          .lean(),
        db.models.InventoryBatch.find({ remainingQty: { $gt: 0 } }, { expiryDate: 1, _id: 0 }).lean(),
        queue.getQueueStats(),
      ]);

    const activeOrders = ordersList.filter(o => !['cancelled', 'returned'].includes(o.status));
    const revCurr = activeOrders
      .filter(o => o.createdAt >= thirtyDaysAgo)
      .reduce((s, o) => s + Number(o.totalAmount || 0), 0);
    const revPrev = activeOrders
      .filter(o => o.createdAt >= sixtyDaysAgo && o.createdAt < thirtyDaysAgo)
      .reduce((s, o) => s + Number(o.totalAmount || 0), 0);

    const growthPercent =
      revPrev > 0 ? Math.round(((revCurr - revPrev) / revPrev) * 1000) / 10 : revCurr > 0 ? 100 : 0;

    const totalRevenue = activeOrders.reduce((s, o) => s + Number(o.totalAmount || 0), 0);
    const completedOrders = ordersList.filter(o => o.status === 'delivered').length;
    const pendingOrders = ordersList.filter(o =>
      ['placed', 'pending', 'confirmed', 'processing', 'packed'].includes(o.status)
    ).length;

    const activeProducts = productsList.filter(p => p.status === 'published').length;
    const outOfStock = productsList.filter(p => Number(p.stock || 0) <= 0).length;
    const lowStock = productsList.filter(
      p => Number(p.stock || 0) > 0 && Number(p.stock || 0) <= Number(p.minStockAlert ?? 5)
    ).length;
    const valuation = productsList.reduce((s, p) => {
      const baseUnitsPerPack =
        p.unit === 'ml'
          ? parseWeightGrams(String(p.weightLabel || '100ml')) || 100
          : p.unit === 'gram'
          ? parseWeightGrams(String(p.weightLabel || '1g')) || 1
          : 1;
      return s + (Number(p.stock || 0) / baseUnitsPerPack) * Number(p.purchasePrice || 0);
    }, 0);
    const totalStockQty = productsList.reduce((s, p) => s + Number(p.stock || 0), 0);

    const orderCountsByCust = new Map<string, number>();
    for (const o of ordersList) {
      if (o.status !== 'cancelled') {
        orderCountsByCust.set(o.customerId, (orderCountsByCust.get(o.customerId) || 0) + 1);
      }
    }
    const newThisMonth = customersList.filter(c => c.createdAt >= monthStart).length;
    const returningCount = customersList.filter(c => (orderCountsByCust.get(c.id) || 0) >= 2).length;

    const deliveredEmails = emailLogs.filter(l => l.status === 'sent' || l.status === 'delivered').length;

    // Group revenue/profit series by period
    const seriesMap = new Map<string, { label: string; revenue: number; cost: number; orders: number }>();
    for (const o of activeOrders) {
      const d = new Date(o.createdAt);
      if (Number.isNaN(d.getTime())) continue;
      let key = '';
      if (period === 'daily') {
        key = d.toISOString().slice(0, 10);
      } else if (period === 'weekly') {
        const weekStart = new Date(d);
        weekStart.setDate(d.getDate() - d.getDay());
        key = `Wk ${weekStart.toISOString().slice(5, 10)}`;
      } else if (period === 'yearly') {
        key = String(d.getFullYear());
      } else {
        key = d.toLocaleDateString('en-IN', { month: 'short', year: '2-digit' });
      }
      const prev = seriesMap.get(key) || { label: key, revenue: 0, cost: 0, orders: 0 };
      prev.revenue += Number(o.totalAmount || 0);
      prev.cost += Number(o.costOfGoods || 0);
      prev.orders += 1;
      seriesMap.set(key, prev);
    }

    const revenueSeries = Array.from(seriesMap.values())
      .reverse()
      .slice(-12)
      .map(s => ({ ...s, profit: Math.max(0, s.revenue - s.cost) }));

    // Profit vs Expense Comparison monthly
    const pveMap = new Map<string, { month: string; grossProfit: number; expenses: number }>();
    for (const o of activeOrders) {
      const ym = String(o.createdAt).slice(0, 7);
      const cur = pveMap.get(ym) || { month: ym, grossProfit: 0, expenses: 0 };
      cur.grossProfit += Number(o.subtotal || 0) - Number(o.discountAmount || 0) - Number(o.costOfGoods || 0);
      pveMap.set(ym, cur);
    }
    for (const e of expensesList) {
      const ym = String(e.expenseDate || '').slice(0, 7);
      if (!ym) continue;
      const cur = pveMap.get(ym) || { month: ym, grossProfit: 0, expenses: 0 };
      cur.expenses += Number(e.amount || 0);
      pveMap.set(ym, cur);
    }
    const profitVsExpense = Array.from(pveMap.values())
      .sort((a, b) => a.month.localeCompare(b.month))
      .slice(-6)
      .map(r => ({ ...r, netProfit: Math.round(r.grossProfit - r.expenses) }));

    const activeOrderIds = new Set(activeOrders.map(o => o.id));
    const catNameMap = new Map(categoriesList.map(c => [c.id, c.name]));
    const prodMap = new Map(productsList.map(p => [p.id, p]));

    const bestSellingMap = new Map<
      string,
      { productId: string; productName: string; productImage: string; unitsSold: number; revenue: number }
    >();
    const catRevMap = new Map<string, { category: string; revenue: number; units: number }>();

    for (const oi of orderItemsList) {
      if (!activeOrderIds.has(oi.orderId)) continue;
      const bs = bestSellingMap.get(oi.productId) || {
        productId: oi.productId,
        productName: oi.productName,
        productImage: oi.productImage,
        unitsSold: 0,
        revenue: 0,
      };
      bs.unitsSold += Number(oi.quantity || 0);
      bs.revenue += Number(oi.subtotal || 0);
      bestSellingMap.set(oi.productId, bs);

      const p = prodMap.get(oi.productId);
      const catLabel = (p?.categoryId && catNameMap.get(p.categoryId)) || oi.category;
      const cr = catRevMap.get(catLabel) || { category: catLabel, revenue: 0, units: 0 };
      cr.revenue += Number(oi.subtotal || 0);
      cr.units += Number(oi.quantity || 0);
      catRevMap.set(catLabel, cr);
    }

    const bestSellingProducts = Array.from(bestSellingMap.values())
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 6);
    const categoryRevenue = Array.from(catRevMap.values()).sort((a, b) => b.revenue - a.revenue);

    const statusCountMap = new Map<string, number>();
    for (const o of ordersList) {
      statusCountMap.set(o.status, (statusCountMap.get(o.status) || 0) + 1);
    }
    const orderStatusDistribution = Array.from(statusCountMap.entries()).map(([status, count]) => ({
      status,
      count,
    }));

    const custAcqMap = new Map<string, number>();
    for (const c of customersList) {
      const m = String(c.createdAt).slice(0, 7);
      custAcqMap.set(m, (custAcqMap.get(m) || 0) + 1);
    }
    const customerAcquisition = Array.from(custAcqMap.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .slice(-12)
      .map(([month, customers]) => ({ month, customers }));

    const recentOrders = ordersList.slice(0, 6).map(o => {
      const snap = (
        typeof o.customerSnapshot === 'string'
          ? (() => {
              try {
                return JSON.parse(o.customerSnapshot);
              } catch {
                return {};
              }
            })()
          : o.customerSnapshot || {}
      ) as { name?: string };
      return {
        id: o.id,
        orderNumber: o.orderNumber,
        customerName: snap.name || 'Patron',
        totalAmount: o.totalAmount,
        status: o.status,
        createdAt: o.createdAt,
      };
    });

    const expensesTotal = expensesList.reduce((s, e) => s + Number(e.amount || 0), 0);
    const expiringThreshold = new Date(nowMs + 45 * 86400_000).toISOString().slice(0, 10);
    const expiringSoonCount = batchesList.filter(b => b.expiryDate && b.expiryDate <= expiringThreshold).length;

    res.json({
      kpis: {
        revenue: {
          total: Math.round(totalRevenue),
          current30d: Math.round(revCurr),
          previous30d: Math.round(revPrev),
          growthPercent,
        },
        orders: {
          total: ordersList.length,
          completed: completedOrders,
          pending: pendingOrders,
        },
        products: {
          active: activeProducts,
          outOfStock,
          lowStock,
        },
        customers: {
          total: customersList.length,
          newThisMonth,
          returning: returningCount,
        },
        inventory: {
          valuation: Math.round(valuation),
          totalStockQty,
          lowStockAlerts: lowStock + outOfStock,
          expiringSoonCount,
        },
        expensesTotal: Math.round(expensesTotal),
        email: {
          totalSent: emailLogs.length,
          deliveryRate:
            emailLogs.length > 0 ? Math.round((deliveredEmails / emailLogs.length) * 1000) / 10 : 100,
        },
      },
      charts: {
        revenueSeries,
        profitVsExpense,
        bestSellingProducts,
        categoryRevenue,
        orderStatusDistribution,
        customerAcquisition,
      },
      recentOrders,
      upcomingCampaigns,
      provider: transport.getSummary(),
      queue: queueStats,
    });
  });

  router.get('/search', async (req, res) => {
    const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    if (!q) {
      res.json({ orders: [], products: [], customers: [], suppliers: [] });
      return;
    }
    const rx = new RegExp(escapeRegex(q), 'i');
    const [orders, products, customers, suppliers] = await Promise.all([
      db.models.Order.find(
        { $or: [{ orderNumber: rx }, { 'customerSnapshot.name': rx }, { 'customerSnapshot.email': rx }] },
        { id: 1, orderNumber: 1, status: 1, totalAmount: 1, customerSnapshot: 1, _id: 0 }
      )
        .limit(5)
        .lean(),
      db.models.Product.find(
        { $or: [{ name: rx }, { sku: rx }] },
        { id: 1, name: 1, sku: 1, price: 1, stock: 1, _id: 0 }
      )
        .limit(5)
        .lean(),
      db.models.Customer.find(
        { role: 'customer', $or: [{ name: rx }, { email: rx }, { phone: rx }] },
        { id: 1, name: 1, email: 1, phone: 1, _id: 0 }
      )
        .limit(5)
        .lean(),
      db.models.Supplier.find(
        { $or: [{ supplierName: rx }, { businessName: rx }] },
        { id: 1, supplierName: 1, businessName: 1, _id: 0 }
      )
        .limit(5)
        .lean(),
    ]);

    res.json({ orders, products, customers, suppliers });
  });

  router.get('/notifications', async (_req, res) => {
    await checkAndEmitExpiryNotifications(db);

    const [zeroStockProds, lowStockCount, biz] = await Promise.all([
      db.models.Product.find(
        { status: 'published', stock: { $lte: 0 } },
        { id: 1, name: 1, sku: 1, unit: 1, stock: 1, minStockAlert: 1, _id: 0 }
      )
        .sort({ name: 1 })
        .lean(),
      db.models.Product.countDocuments({
        status: 'published',
        stock: { $gt: 0 },
        $expr: { $lte: ['$stock', { $ifNull: ['$minStockAlert', 5] }] },
      }).catch(() => 0),
      getBusinessSettingsDoc(db),
    ]);

    const outOfStockCount = zeroStockProds.length;
    if (outOfStockCount > 0 && biz.notificationPreferences?.lowStockAlerts !== false) {
      const existingOutNotifs = await db.models.AdminNotification.countDocuments({
        type: 'out_of_stock',
        isRead: false,
      });
      if (existingOutNotifs === 0) {
        const previewNames = zeroStockProds
          .slice(0, 3)
          .map(p => p.name)
          .join(', ');
        await createAdminNotification(db, {
          type: 'out_of_stock',
          title: `Out of Stock Alert: ${outOfStockCount} product${outOfStockCount === 1 ? '' : 's'} at 0`,
          message:
            outOfStockCount === 1
              ? `${previewNames} has reached 0 stock. Restock via Purchases or Inventory.`
              : `${previewNames}${outOfStockCount > 3 ? ` +${outOfStockCount - 3} more` : ''} at 0 stock. Restock via Purchases.`,
          severity: 'critical',
          entityType: 'inventory',
          entityId: 'summary_zero_stock',
        });
      }
    }

    const [notifications, unreadCount] = await Promise.all([
      db.models.AdminNotification.find({}, { _id: 0 }).sort({ createdAt: -1 }).limit(40).lean(),
      db.models.AdminNotification.countDocuments({ isRead: false }),
    ]);

    res.json({
      notifications,
      unreadCount,
      stockAlerts: {
        outOfStockCount,
        lowStockCount,
        outOfStockItems: zeroStockProds.slice(0, 12),
      },
    });
  });

  router.post('/notifications/read', async (req, res) => {
    const id = typeof req.body?.id === 'string' ? req.body.id : '';
    if (id) {
      await db.models.AdminNotification.updateOne({ id }, { $set: { isRead: true } });
    } else {
      await db.models.AdminNotification.updateMany({}, { $set: { isRead: true } });
    }
    res.json({ ok: true });
  });

  // =============================================
  // 2. PRODUCTS, VARIANTS & CATEGORIES CRUD
  // =============================================
  router.get('/erp/products', requirePermission('products'), async (req, res) => {
    const search = typeof req.query.search === 'string' ? req.query.search.trim().toLowerCase() : '';
    const categoryId = typeof req.query.categoryId === 'string' ? req.query.categoryId.trim() : '';
    const status = typeof req.query.status === 'string' ? req.query.status.trim() : '';
    const page = Math.max(1, Number(req.query.page || 1));
    const limit = req.query.limit ? Math.max(1, Math.min(100, Number(req.query.limit))) : 0;

    const filter: Record<string, unknown> = {};
    if (status && status !== 'all') filter.status = status;
    if (categoryId && categoryId !== 'all') filter.categoryId = categoryId;

    const [rows, variantsAll, cats] = await Promise.all([
      db.models.Product.find(filter, { _id: 0 }).sort({ createdAt: -1 }).lean(),
      db.models.ProductVariant.find({}, { _id: 0 }).sort({ sellingPrice: 1 }).lean(),
      db.models.Category.find({}, { id: 1, name: 1, _id: 0 }).lean(),
    ]);

    const catMap = new Map(cats.map(c => [c.id, c.name]));

    const filtered = rows
      .map(r => {
        const base = parseProductRow(r);
        const prodVariants = variantsAll.filter(v => v.productId === r.id);
        return {
          ...base,
          categoryName: r.categoryId ? catMap.get(String(r.categoryId)) || String(r.category) : String(r.category),
          weightVariants: prodVariants.map(v => ({ ...v, active: Boolean(v.active) })),
        };
      })
      .filter(p => {
        if (!search) return true;
        const hay = `${p.name} ${p.sku || ''} ${p.categoryName} ${p.origin}`.toLowerCase();
        return hay.includes(search);
      });

    const total = filtered.length;
    const sliced = limit > 0 ? filtered.slice((page - 1) * limit, page * limit) : filtered;

    res.json({
      products: sliced,
      pagination: {
        page,
        limit: limit || total,
        total,
        totalPages: limit > 0 ? Math.max(1, Math.ceil(total / limit)) : 1,
      },
    });
  });

  router.post(
    '/products/upload-image',
    requirePermission('products'),
    productImgUpload.single('image'),
    async (req, res) => {
      if (!req.file) {
        res.status(400).json({ error: 'Please upload a PNG, JPEG, or WEBP image.' });
        return;
      }
      try {
        const uploaded = await mediaStorage.uploadBuffer({
          buffer: req.file.buffer,
          filename: req.file.originalname,
          folder: 'products',
          mimeType: req.file.mimetype,
          resourceType: 'image',
        });
        res.json({ imageUrl: uploaded.url, publicId: uploaded.publicId });
      } catch (err) {
        const sc = (err as { statusCode?: number }).statusCode || 500;
        res.status(sc).json({ error: err instanceof Error ? err.message : 'Cloudinary upload failed.' });
      }
    }
  );

  router.post('/erp/products', requirePermission('products'), async (req, res) => {
    const parsed = erpProductSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid product data' });
      return;
    }
    const d = parsed.data;
    const cat = await db.models.Category.findOne({ id: d.categoryId }).lean();
    const storefrontCat = cat?.storefrontGroup || 'nuts';
    const id = `${d.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}-${crypto.randomInt(100, 999)}`;
    const sku = d.sku || `AS-${id.slice(0, 6).toUpperCase()}`;
    const img = d.image || '/assets/aistudio/00c7c9248fdf2e9e3c775c5368483218_ceac05b8.jpg';
    const imgs = d.images?.length ? d.images : [img];
    const now = new Date().toISOString();

    await db.models.Product.create({
      id,
      name: d.name,
      hindiName: d.hindiName || null,
      subtitle: d.subtitle,
      sku,
      barcode: d.barcode || null,
      purchasePrice: d.purchasePrice,
      price: d.price,
      discountPrice: d.discountPrice ?? null,
      gstRate: d.gstRate,
      stock: d.stock,
      minStockAlert: d.minStockAlert,
      unit: d.unit,
      weightLabel: d.weightLabel,
      step: d.unit === 'gram' || d.unit === 'piece' ? 1 : d.unit === 'ml' ? 100 : 0.5,
      minQty: d.unit === 'gram' || d.unit === 'piece' ? 1 : d.unit === 'ml' ? 100 : 0.5,
      category: storefrontCat,
      categoryId: d.categoryId,
      image: img,
      images: imgs,
      gallery: imgs,
      description: d.description,
      origin: d.origin,
      grade: d.grade,
      expiryDate: d.expiryDate || null,
      storageInstructions: d.storageInstructions,
      featured: Boolean(d.featured),
      features: ['Direct Jammu Provenance', 'Zero Preservatives'],
      variants: d.weightVariants.map(v => v.weightLabel),
      tasteProfile: 'Artisanal heritage taste',
      jammuStory: 'Curated directly in Jammu & Kashmir.',
      inStock: d.stock > 0,
      harvestSeason: 'Current Harvest',
      nutrition: { calories: '560 kcal / 100g', protein: '16g', keyNutrient: 'Natural Oils', minerals: 'Magnesium, Vitamin E', healthPillars: [] },
      status: d.status,
      createdAt: now,
      updatedAt: now,
    });

    await syncInventoryRecord(db, id);
    if (d.weightVariants.length > 0) {
      await syncVariants(id, d.weightVariants, now);
    }

    if (d.stock > 0) {
      await db.models.InventoryTransaction.create({
        id: `invtx_${crypto.randomUUID()}`,
        productId: id,
        movementType: 'stock_in',
        quantity: d.stock,
        previousStock: 0,
        updatedStock: d.stock,
        unitCost: d.purchasePrice,
        reason: 'Opening product stock',
        adminId: req.user!.id,
        adminName: req.user!.name,
        timestamp: now,
      });
    }

    await logAudit(db, {
      actorId: req.user!.id,
      actorEmail: req.user!.email,
      action: 'product_created',
      entityType: 'product',
      entityId: id,
      details: { name: d.name, sku, price: d.price, stock: d.stock },
      ipAddress: req.ip || '',
    });

    res.status(201).json({ message: 'Product created.', id });
  });

  router.put('/erp/products/:id', requirePermission('products'), async (req, res) => {
    const existing = await db.models.Product.findOne({ id: req.params.id }).lean();
    if (!existing) {
      res.status(404).json({ error: 'Product not found.' });
      return;
    }

    const parsed = erpProductSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid product data' });
      return;
    }
    const d = parsed.data;
    const cat = await db.models.Category.findOne({ id: d.categoryId }).lean();
    const storefrontCat = cat?.storefrontGroup || String(existing.category || 'nuts');
    const now = new Date().toISOString();
    const img = d.image || String(existing.image);
    const imgs = d.images?.length ? d.images : [img];

    await db.models.Product.updateOne(
      { id: req.params.id },
      {
        $set: {
          name: d.name,
          hindiName: d.hindiName || null,
          subtitle: d.subtitle,
          sku: d.sku || existing.sku || null,
          barcode: d.barcode || null,
          purchasePrice: d.purchasePrice,
          price: d.price,
          discountPrice: d.discountPrice ?? null,
          gstRate: d.gstRate,
          stock: d.stock,
          minStockAlert: d.minStockAlert,
          unit: d.unit,
          weightLabel: d.weightLabel,
          category: storefrontCat,
          categoryId: d.categoryId,
          image: img,
          images: imgs,
          gallery: imgs,
          description: d.description,
          origin: d.origin,
          grade: d.grade,
          expiryDate: d.expiryDate || null,
          storageInstructions: d.storageInstructions,
          featured: Boolean(d.featured),
          variants: d.weightVariants.map(v => v.weightLabel),
          inStock: d.stock > 0,
          status: d.status,
          updatedAt: now,
        },
      }
    );

    await syncInventoryRecord(db, req.params.id);
    await syncVariants(req.params.id, d.weightVariants, now);

    const prevStock = Number(existing.stock || 0);
    if (d.stock !== prevStock) {
      await db.models.InventoryTransaction.create({
        id: `invtx_${crypto.randomUUID()}`,
        productId: req.params.id,
        movementType: 'adjustment',
        quantity: Math.abs(d.stock - prevStock),
        previousStock: prevStock,
        updatedStock: d.stock,
        unitCost: d.purchasePrice,
        reason: 'Updated in product editor',
        adminId: req.user!.id,
        adminName: req.user!.name,
        timestamp: now,
      });
    }
    await emitStockAlertIfNeeded(
      db,
      { id: req.params.id, name: d.name, unit: d.unit, stock: d.stock, minStockAlert: d.minStockAlert },
      'product update'
    );

    await logAudit(db, {
      actorId: req.user!.id,
      actorEmail: req.user!.email,
      action: 'product_updated',
      entityType: 'product',
      entityId: req.params.id,
      details: { name: d.name, price: d.price, stock: d.stock },
      ipAddress: req.ip || '',
    });

    res.json({ message: 'Product updated.' });
  });

  router.post('/erp/products/:id/duplicate', requirePermission('products'), async (req, res) => {
    const src = await db.models.Product.findOne({ id: req.params.id }, { _id: 0 }).lean();
    if (!src) {
      res.status(404).json({ error: 'Product not found.' });
      return;
    }
    const newId = `${String(src.id)}-copy-${crypto.randomInt(100, 999)}`;
    const now = new Date().toISOString();

    await db.models.Product.create({
      ...src,
      id: newId,
      name: `${src.name} (Copy)`,
      sku: `${src.sku || src.id}-COPY-${crypto.randomInt(10, 99)}`,
      barcode: null,
      featured: false,
      status: 'draft',
      createdAt: now,
      updatedAt: now,
    });
    await syncInventoryRecord(db, newId);

    res.status(201).json({ message: 'Product duplicated as draft.', id: newId });
  });

  router.patch('/erp/products/:id/status', requirePermission('products'), async (req, res) => {
    const status = req.body?.status === 'draft' ? 'draft' : 'published';
    const upd = await db.models.Product.updateOne(
      { id: req.params.id },
      { $set: { status, updatedAt: new Date().toISOString() } }
    );
    if (upd.matchedCount === 0) {
      res.status(404).json({ error: 'Product not found.' });
      return;
    }
    res.json({ message: `Product ${status === 'published' ? 'activated' : 'deactivated'}.`, status });
  });

  async function recordDeletedSeedId(settingKey: string, id: string) {
    const row = await db.models.SiteSetting.findOne({ key: settingKey }).lean();
    const prevIds = Array.isArray(row?.value) ? row.value.map(String) : [];
    if (!prevIds.includes(id)) {
      await db.models.SiteSetting.updateOne(
        { key: settingKey },
        { $set: { key: settingKey, value: [...prevIds, id], updatedAt: new Date().toISOString() } },
        { upsert: true }
      );
    }
  }

  router.delete('/erp/products/:id', requirePermission('products'), async (req, res) => {
    const refInPurchase = await db.models.PurchaseItem.countDocuments({ productId: req.params.id });
    if (refInPurchase > 0) {
      await db.models.Product.updateOne(
        { id: req.params.id },
        { $set: { status: 'draft', updatedAt: new Date().toISOString() } }
      );
      res.json({ message: 'Product archived to draft (referenced by historical purchase records).' });
      return;
    }
    const del = await db.models.Product.deleteOne({ id: req.params.id });
    if (del.deletedCount === 0) {
      res.status(404).json({ error: 'Product not found.' });
      return;
    }
    await Promise.all([
      db.models.ProductVariant.deleteMany({ productId: req.params.id }),
      db.models.Inventory.deleteMany({ productId: req.params.id }),
      db.models.InventoryBatch.deleteMany({ productId: req.params.id }),
      recordDeletedSeedId('deleted_seed_product_ids', req.params.id),
    ]);
    await logAudit(db, {
      actorId: req.user!.id,
      actorEmail: req.user!.email,
      action: 'product_deleted',
      entityType: 'product',
      entityId: req.params.id,
      ipAddress: req.ip || '',
    });
    res.json({ message: 'Product permanently deleted.' });
  });

  // Categories CRUD
  router.get('/categories', requirePermission('categories'), async (_req, res) => {
    const [cats, products] = await Promise.all([
      db.models.Category.find({}, { _id: 0 }).sort({ displayOrder: 1, name: 1 }).lean(),
      db.models.Product.find({}, { categoryId: 1, _id: 0 }).lean(),
    ]);
    const counts = new Map<string, number>();
    for (const p of products) {
      if (p.categoryId) counts.set(p.categoryId, (counts.get(p.categoryId) || 0) + 1);
    }
    res.json({
      categories: cats.map(c => ({
        ...c,
        active: Boolean(c.active),
        productCount: counts.get(c.id) || 0,
      })),
    });
  });

  router.post('/categories', requirePermission('categories'), async (req, res) => {
    const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
    const storefrontGroup = ['nuts', 'saffron', 'dried-fruits'].includes(req.body?.storefrontGroup)
      ? req.body.storefrontGroup
      : 'nuts';
    const description = typeof req.body?.description === 'string' ? req.body.description.trim() : '';
    if (name.length < 2) {
      res.status(400).json({ error: 'Category name is required.' });
      return;
    }
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const id = `cat_${slug}_${crypto.randomInt(10, 99)}`;
    const now = new Date().toISOString();
    try {
      await db.models.Category.create({
        id,
        name,
        slug: `${slug}-${crypto.randomInt(10, 99)}`,
        storefrontGroup,
        description,
        displayOrder: 50,
        active: true,
        createdAt: now,
        updatedAt: now,
      });
      res.status(201).json({ message: 'Category created.', id });
    } catch (err: any) {
      if (err?.code === 11000) {
        res.status(400).json({ error: `Category "${name}" already exists.` });
        return;
      }
      throw err;
    }
  });

  router.put('/categories/:id', requirePermission('categories'), async (req, res) => {
    const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
    if (name.length < 2) {
      res.status(400).json({ error: 'Category name is required.' });
      return;
    }
    const active = req.body?.active !== false;
    const description = typeof req.body?.description === 'string' ? req.body.description.trim() : '';
    const storefrontGroup = ['nuts', 'saffron', 'dried-fruits'].includes(req.body?.storefrontGroup)
      ? req.body.storefrontGroup
      : 'nuts';
    await db.models.Category.updateOne(
      { id: req.params.id },
      { $set: { name, description, storefrontGroup, active, updatedAt: new Date().toISOString() } }
    );
    res.json({ message: 'Category updated.' });
  });

  router.delete('/categories/:id', requirePermission('categories'), async (req, res) => {
    await db.models.Product.updateMany({ categoryId: req.params.id }, { $set: { categoryId: 'cat_other' } });
    await db.models.Category.deleteOne({ id: req.params.id });
    await recordDeletedSeedId('deleted_seed_category_ids', req.params.id);
    res.json({ message: 'Category permanently deleted.' });
  });

  // =============================================
  // 3. INVENTORY & BATCH MANAGEMENT
  // =============================================
  router.get('/inventory/overview', requirePermission('inventory'), async (_req, res) => {
    await checkAndEmitExpiryNotifications(db);

    const [rawProducts, batchDocs, txDocs, suppliers, categoryDocs] = await Promise.all([
      db.models.Product.find(
        {},
        {
          id: 1,
          name: 1,
          sku: 1,
          unit: 1,
          weightLabel: 1,
          categoryId: 1,
          image: 1,
          fallbackImage: 1,
          stock: 1,
          minStockAlert: 1,
          purchasePrice: 1,
          price: 1,
          expiryDate: 1,
          status: 1,
          _id: 0,
        }
      )
        .sort({ stock: 1 })
        .lean(),
      db.models.InventoryBatch.find().select('-_id').sort({ expiryDate: 1, receivedAt: -1 }).lean(),
      db.models.InventoryTransaction.find().select('-_id').sort({ timestamp: -1 }).limit(100).lean(),
      db.models.Supplier.find({}, { id: 1, supplierName: 1, _id: 0 }).lean(),
      db.models.Category.find({}, { id: 1, name: 1, displayOrder: 1, _id: 0 })
        .sort({ displayOrder: 1 })
        .lean(),
    ]);

    const catMap = new Map(categoryDocs.map(c => [c.id, c.name]));
    const products = rawProducts.map(p => {
      const baseUnitsPerPack =
        p.unit === 'ml'
          ? parseWeightGrams(String(p.weightLabel || '100ml')) || 100
          : p.unit === 'gram'
          ? parseWeightGrams(String(p.weightLabel || '1g')) || 1
          : 1;
      const itemValuation = Math.round(
        (Number(p.stock || 0) / baseUnitsPerPack) * Number(p.purchasePrice || 0)
      );
      return {
        ...p,
        categoryName: p.categoryId ? catMap.get(p.categoryId) || 'Other Products' : 'Other Products',
        valuation: itemValuation,
      };
    });

    const prodMap = new Map(products.map(p => [p.id, p]));
    const supMap = new Map(suppliers.map(s => [s.id, s.supplierName]));

    const batches = batchDocs.map(b => {
      const p = prodMap.get(b.productId);
      return {
        ...b,
        productName: p?.name || b.productId,
        unit: p?.unit || 'kg',
        supplierName: b.supplierId ? supMap.get(b.supplierId) || '' : '',
      };
    });

    const transactions = txDocs.map(t => {
      const p = prodMap.get(t.productId);
      return {
        ...t,
        productName: p?.name || t.productId,
        unit: p?.unit || 'kg',
      };
    });

    const valuation = products.reduce((sum, p) => sum + Number(p.valuation || 0), 0);
    const totalQuantity = products.reduce((sum, p) => sum + Number(p.stock || 0), 0);
    const lowStock = products.filter(
      p => Number(p.stock || 0) > 0 && Number(p.stock || 0) <= Number(p.minStockAlert ?? 5)
    );
    const outOfStock = products.filter(p => Number(p.stock || 0) <= 0);
    const expCutoff = new Date(Date.now() + 45 * 86400_000).toISOString().slice(0, 10);
    const expiringBatches = batches.filter(
      b => Number(b.remainingQty || 0) > 0 && b.expiryDate && String(b.expiryDate) <= expCutoff
    );

    res.json({
      summary: {
        valuation: Math.round(valuation),
        totalQuantity,
        lowStockCount: lowStock.length,
        outOfStockCount: outOfStock.length,
        expiringBatchesCount: expiringBatches.length,
      },
      categories: categoryDocs,
      products,
      batches,
      transactions,
      alerts: {
        lowStock,
        outOfStock,
        expiringBatches,
      },
    });
  });

  router.post('/inventory/adjust', requirePermission('inventory'), async (req, res) => {
    const schema = z.object({
      productId: z.string().min(1),
      movementType: z.enum(['stock_in', 'stock_out', 'adjustment']),
      quantity: z.number().nonnegative(),
      reason: z.string().trim().min(2, 'Reason is required for inventory audit trail'),
      unitCost: z.number().min(0).optional(),
      batchNumber: z.string().trim().optional(),
      expiryDate: z.string().trim().optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid adjustment input' });
      return;
    }
    const { productId, movementType, quantity, reason, unitCost, batchNumber, expiryDate } = parsed.data;
    const prod = await db.models.Product.findOne({ id: productId }).lean();
    if (!prod) {
      res.status(404).json({ error: 'Product not found.' });
      return;
    }

    const prevStock = Number(prod.stock || 0);
    let updatedStock = prevStock;
    if (movementType === 'stock_in') updatedStock = prevStock + quantity;
    else if (movementType === 'stock_out') updatedStock = Math.max(0, prevStock - quantity);
    else updatedStock = quantity;

    const now = new Date().toISOString();
    const resolvedBatchNo = batchNumber || `BAT-${new Date().getFullYear()}-${crypto.randomInt(1000, 9999)}`;
    if (movementType === 'stock_in') {
      await db.models.InventoryBatch.create({
        id: `batch_${crypto.randomUUID()}`,
        productId,
        batchNumber: resolvedBatchNo,
        quantity,
        remainingQty: quantity,
        purchaseCost: unitCost ?? prod.purchasePrice,
        expiryDate: expiryDate || null,
        notes: reason,
        receivedAt: now,
      });
    }

    await db.models.Product.updateOne(
      { id: productId },
      { $set: { stock: updatedStock, inStock: updatedStock > 0, updatedAt: now } }
    );
    await syncInventoryRecord(db, productId);
    await clearResolvedStockAlerts(db, productId, updatedStock, Number(prod.minStockAlert ?? 5));

    await db.models.InventoryTransaction.create({
      id: `invtx_${crypto.randomUUID()}`,
      productId,
      movementType,
      quantity,
      previousStock: prevStock,
      updatedStock,
      unitCost: unitCost ?? prod.purchasePrice,
      batchNumber: movementType === 'stock_in' ? resolvedBatchNo : null,
      reason,
      adminId: req.user!.id,
      adminName: req.user!.name,
      timestamp: now,
    });

    if (updatedStock <= 0) {
      await createAdminNotification(db, {
        type: 'out_of_stock',
        title: `Out of Stock: ${prod.name}`,
        message: `${prod.name} stock reached 0 (${reason}).`,
        severity: 'critical',
        entityType: 'product',
        entityId: productId,
      });
    } else if (updatedStock <= Number(prod.minStockAlert ?? 5)) {
      await createAdminNotification(db, {
        type: 'low_stock',
        title: `Low Stock Alert: ${prod.name}`,
        message: `Stock is ${updatedStock} ${prod.unit} (alert level: ${prod.minStockAlert}).`,
        severity: 'warning',
        entityType: 'product',
        entityId: productId,
      });
    }

    await checkAndEmitExpiryNotifications(db);

    await logAudit(db, {
      actorId: req.user!.id,
      actorEmail: req.user!.email,
      action: `inventory_${movementType}`,
      entityType: 'product',
      entityId: productId,
      details: { previousStock: prevStock, updatedStock, quantity, reason },
      ipAddress: req.ip || '',
    });

    res.json({ message: 'Inventory updated and audit trail recorded.', previousStock: prevStock, updatedStock });
  });

  // =============================================
  // 4. ORDER PAYMENT STATUS, NOTES, RETURN & PDF INVOICE
  // =============================================
  router.put('/orders/:orderNumber/payment-status', requirePermission('orders'), async (req, res) => {
    const paymentStatus = String(req.body?.paymentStatus || '');
    if (!['pending', 'paid', 'cod', 'refund_pending', 'refunded'].includes(paymentStatus)) {
      res.status(400).json({ error: 'Invalid payment status.' });
      return;
    }
    const row = await db.models.Order.findOne({
      $or: [{ orderNumber: req.params.orderNumber }, { id: req.params.orderNumber }],
    }).lean();
    if (!row) {
      res.status(404).json({ error: 'Order not found.' });
      return;
    }
    const now = new Date().toISOString();
    const updated = await db.models.Order.findOneAndUpdate(
      { id: row.id },
      { $set: { paymentStatus, updatedAt: now } },
      { new: true }
    ).lean();

    if (paymentStatus === 'paid') {
      await db.models.Payment.create({
        id: `pay_${crypto.randomUUID()}`,
        paymentType: 'order_payment',
        referenceId: row.orderNumber,
        orderNumber: row.orderNumber,
        customerId: row.customerId,
        amount: Number(row.totalAmount || 0),
        method: row.paymentMethod,
        status: 'completed',
        notes: `Marked paid by ${req.user!.name}`,
        recordedBy: req.user!.email,
        createdAt: now,
      });

      await createAdminNotification(db, {
        type: 'payment_received',
        title: `Payment Received: #${row.orderNumber}`,
        message: `₹${Number(row.totalAmount).toLocaleString('en-IN')} marked paid by ${req.user!.name}.`,
        severity: 'info',
        entityType: 'order',
        entityId: row.orderNumber,
      });
    }

    await logAudit(db, {
      actorId: req.user!.id,
      actorEmail: req.user!.email,
      action: 'order_payment_status_updated',
      entityType: 'order',
      entityId: row.orderNumber,
      details: { paymentStatus },
      ipAddress: req.ip || '',
    });

    res.json({
      message: 'Payment status updated.',
      order: await hydrateOrder(db, updated as Record<string, unknown>),
    });
  });

  router.put('/orders/:orderNumber/notes', requirePermission('orders'), async (req, res) => {
    const notes = typeof req.body?.internalNotes === 'string' ? req.body.internalNotes.trim() : '';
    const row = await db.models.Order.findOne({
      $or: [{ orderNumber: req.params.orderNumber }, { id: req.params.orderNumber }],
    }).lean();
    if (!row) {
      res.status(404).json({ error: 'Order not found.' });
      return;
    }
    const updated = await db.models.Order.findOneAndUpdate(
      { id: row.id },
      { $set: { internalNotes: notes, updatedAt: new Date().toISOString() } },
      { new: true }
    ).lean();

    res.json({
      message: 'Internal notes saved.',
      order: await hydrateOrder(db, updated as Record<string, unknown>),
    });
  });

  router.post('/orders/:orderNumber/return', requirePermission('orders'), async (req, res) => {
    const reason =
      typeof req.body?.reason === 'string' && req.body.reason.trim()
        ? req.body.reason.trim()
        : 'Returned by customer';
    const row = await db.models.Order.findOne({
      $or: [{ orderNumber: req.params.orderNumber }, { id: req.params.orderNumber }],
    }).lean();
    if (!row) {
      res.status(404).json({ error: 'Order not found.' });
      return;
    }

    const now = new Date().toISOString();
    const updated = await db.models.Order.findOneAndUpdate(
      { id: row.id },
      { $set: { status: 'returned', returnedAt: now, returnReason: reason, updatedAt: now } },
      { new: true }
    ).lean();

    await db.models.OrderStatusHistory.create({
      id: `osh_${crypto.randomUUID()}`,
      orderId: String(row.id),
      previousStatus: String(row.status),
      newStatus: 'returned',
      updatedBy: req.user!.name,
      notes: reason,
      timestamp: now,
    });

    const items = await db.models.OrderItem.find({ orderId: String(row.id) }).lean();
    for (const it of items) {
      const pRow = await db.models.Product.findOne({ id: it.productId }).lean();
      if (pRow) {
        const restoreQty = Number(it.stockQuantity || it.quantity);
        const prev = Number(pRow.stock || 0);
        const next = Number((prev + restoreQty).toFixed(2));
        await db.models.Product.updateOne(
          { id: it.productId },
          { $set: { stock: next, inStock: true, updatedAt: now } }
        );
        if (it.variantId) {
          await db.models.ProductVariant.updateOne(
            { id: it.variantId },
            { $inc: { stock: it.quantity }, $set: { updatedAt: now } }
          );
        }
        await syncInventoryRecord(db, it.productId);
        await db.models.InventoryTransaction.create({
          id: `invtx_${crypto.randomUUID()}`,
          productId: it.productId,
          variantId: it.variantId || null,
          movementType: 'order_return',
          quantity: restoreQty,
          previousStock: prev,
          updatedStock: next,
          unitCost: it.purchasePrice || 0,
          reason: `Order returned #${row.orderNumber}`,
          adminId: req.user!.id,
          adminName: req.user!.name,
          timestamp: now,
        });
      }
    }

    await logAudit(db, {
      actorId: req.user!.id,
      actorEmail: req.user!.email,
      action: 'order_returned',
      entityType: 'order',
      entityId: String(row.orderNumber),
      details: { reason },
      ipAddress: req.ip || '',
    });

    res.json({
      message: 'Order marked as returned and inventory restored.',
      order: await hydrateOrder(db, updated as Record<string, unknown>),
    });
  });

  router.get('/orders/:orderNumber/invoice.pdf', requirePermission('orders'), async (req, res) => {
    const row = await db.models.Order.findOne({
      $or: [{ orderNumber: req.params.orderNumber }, { id: req.params.orderNumber }],
    }).lean();
    if (!row) {
      res.status(404).json({ error: 'Order not found.' });
      return;
    }
    const hydrated = (await hydrateOrder(db, row)) as any;
    const biz = await getBusinessSettingsDoc(db);
    const addr = hydrated.deliveryAddressObj || {};
    const customerAddrStr = [addr.deliveryAddress, addr.city, addr.state, addr.pincode].filter(Boolean).join(', ');

    const pdfBuf = await generateOrderInvoicePdf({
      businessName: biz.businessName,
      businessAddress: biz.businessAddress,
      gstin: biz.gstin,
      contactNumber: biz.contactNumber,
      businessEmail: biz.businessEmail,
      invoiceNumber: `${biz.invoicePrefix}-${hydrated.orderNumber}`,
      orderNumber: hydrated.orderNumber,
      orderDate: hydrated.createdAt,
      paymentMethod: hydrated.paymentMethod,
      paymentStatus: hydrated.paymentStatus,
      customerName: addr.fullName || hydrated.customerObj?.name || 'Patron',
      customerPhone: addr.mobileNumber || hydrated.customerObj?.phone || '',
      customerAddress: customerAddrStr,
      items: hydrated.items || [],
      subtotal: Number(hydrated.subtotal || 0),
      discountAmount: Number(hydrated.discountAmount || 0),
      couponCode: hydrated.couponCode || null,
      shippingCharge: Number(hydrated.shippingCharge || 0),
      taxAmount: Number(hydrated.taxAmount || 0),
      totalAmount: Number(hydrated.totalAmount || 0),
    });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="Invoice-${hydrated.orderNumber}.pdf"`);
    res.send(pdfBuf);
  });

  // =============================================
  // 5. CUSTOMER MANAGEMENT
  // =============================================
  router.get('/customers', requirePermission('customers'), async (req, res) => {
    const search = typeof req.query.search === 'string' ? req.query.search.trim().toLowerCase() : '';
    const segment = typeof req.query.segment === 'string' ? req.query.segment : 'all';
    const page = Math.max(1, Number(req.query.page || 1));
    const limit = req.query.limit ? Math.max(1, Math.min(100, Number(req.query.limit))) : 0;

    const [rows, orders] = await Promise.all([
      db.models.Customer.find({ role: 'customer' }, { passwordHash: 0, _id: 0 })
        .sort({ createdAt: -1 })
        .lean(),
      db.models.Order.find({}, { customerId: 1, status: 1, totalAmount: 1, createdAt: 1, _id: 0 }).lean(),
    ]);

    const statsMap = new Map<string, { totalOrders: number; totalSpent: number; lastOrderAt: string | null }>();
    for (const o of orders) {
      const cur = statsMap.get(o.customerId) || { totalOrders: 0, totalSpent: 0, lastOrderAt: null };
      if (o.status !== 'cancelled') cur.totalOrders += 1;
      if (o.status !== 'cancelled' && o.status !== 'returned') cur.totalSpent += Number(o.totalAmount || 0);
      if (!cur.lastOrderAt || o.createdAt > cur.lastOrderAt) cur.lastOrderAt = o.createdAt;
      statsMap.set(o.customerId, cur);
    }

    const thirtyDaysAgo = new Date(Date.now() - 30 * 86400_000).toISOString();
    const sixtyDaysAgo = new Date(Date.now() - 60 * 86400_000).toISOString();

    const filtered = rows
      .map(r => {
        const st = statsMap.get(r.id) || { totalOrders: 0, totalSpent: 0, lastOrderAt: null };
        return {
          id: String(r.id),
          name: String(r.name),
          email: String(r.email),
          phone: String(r.phone || ''),
          tier: String(r.tier || ''),
          loyaltyPoints: Number(r.loyaltyPoints || 0),
          internalNotes: String(r.internalNotes || ''),
          createdAt: String(r.createdAt),
          lastOrderAt: st.lastOrderAt,
          emailVerified: Boolean(r.emailVerified),
          isActive: r.isActive === undefined ? true : Boolean(r.isActive),
          marketingConsent: Boolean(r.marketingConsent),
          totalOrders: st.totalOrders,
          totalSpent: st.totalSpent,
        };
      })
      .filter(c => {
        if (segment === 'new' && String(c.createdAt) < thirtyDaysAgo) return false;
        if (segment === 'returning' && c.totalOrders < 2) return false;
        if (segment === 'frequent' && c.totalOrders < 2) return false;
        if (segment === 'unverified' && c.emailVerified) return false;
        if (segment === 'vip' && c.totalSpent < 10000 && c.totalOrders < 3) return false;
        if (segment === 'inactive') {
          const last = c.lastOrderAt ? String(c.lastOrderAt) : '';
          if (c.isActive && (!last || last >= sixtyDaysAgo)) return false;
        }
        if (search) {
          const hay = `${c.name} ${c.email} ${c.phone}`.toLowerCase();
          if (!hay.includes(search)) return false;
        }
        return true;
      });

    const total = filtered.length;
    const sliced = limit > 0 ? filtered.slice((page - 1) * limit, page * limit) : filtered;

    res.json({
      customers: sliced,
      pagination: {
        page,
        limit: limit || total,
        total,
        totalPages: limit > 0 ? Math.max(1, Math.ceil(total / limit)) : 1,
      },
    });
  });

  router.get('/customers/stats', requirePermission('customers'), async (_req, res) => {
    const [customers, orders] = await Promise.all([
      db.models.Customer.find({ role: 'customer' }, { passwordHash: 0, _id: 0 }).lean(),
      db.models.Order.find({}, { customerId: 1, status: 1, totalAmount: 1, createdAt: 1, _id: 0 }).lean(),
    ]);

    const orderStats = new Map<string, { totalOrders: number; totalSpent: number; lastOrderAt: string | null }>();
    for (const o of orders) {
      const cur = orderStats.get(o.customerId) || { totalOrders: 0, totalSpent: 0, lastOrderAt: null };
      if (o.status !== 'cancelled') cur.totalOrders += 1;
      if (o.status !== 'cancelled' && o.status !== 'returned') cur.totalSpent += Number(o.totalAmount || 0);
      if (!cur.lastOrderAt || o.createdAt > cur.lastOrderAt) cur.lastOrderAt = o.createdAt;
      orderStats.set(o.customerId, cur);
    }

    const twoDaysAgo = new Date(Date.now() - 48 * 3600_000).toISOString();
    const totalCustomers = customers.length;
    let verifiedCount = 0;
    let unverifiedCount = 0;
    let unverifiedEligibleForPurge = 0;
    let frequentBuyersCount = 0;
    let frequentBuyersRevenue = 0;
    let totalRepeatOrders = 0;
    let vipCount = 0;

    const frequentList: any[] = [];

    for (const c of customers) {
      const isVerified = Boolean(c.emailVerified);
      if (isVerified) {
        verifiedCount++;
      } else {
        unverifiedCount++;
        if (c.createdAt <= twoDaysAgo) {
          unverifiedEligibleForPurge++;
        }
      }

      const st = orderStats.get(c.id) || { totalOrders: 0, totalSpent: 0, lastOrderAt: null };
      if (st.totalOrders >= 2) {
        frequentBuyersCount++;
        frequentBuyersRevenue += st.totalSpent;
        totalRepeatOrders += st.totalOrders;
        frequentList.push({
          id: c.id,
          name: c.name,
          email: c.email,
          phone: c.phone || '',
          tier: c.tier || 'Privileged Patron',
          totalOrders: st.totalOrders,
          totalSpent: st.totalSpent,
          averageOrderValue: st.totalOrders > 0 ? Math.round(st.totalSpent / st.totalOrders) : 0,
          lastOrderAt: st.lastOrderAt,
          createdAt: c.createdAt,
        });
      }

      if (st.totalSpent >= 10000 || st.totalOrders >= 3) {
        vipCount++;
      }
    }

    frequentList.sort((a, b) => b.totalOrders - a.totalOrders || b.totalSpent - a.totalSpent);

    const repeatPurchaseRate = totalCustomers > 0 ? Math.round((frequentBuyersCount / totalCustomers) * 100) : 0;
    const frequentBuyersAov = totalRepeatOrders > 0 ? Math.round(frequentBuyersRevenue / totalRepeatOrders) : 0;

    res.json({
      totalCustomers,
      verifiedCount,
      unverifiedCount,
      unverifiedEligibleForPurge,
      frequentBuyersCount,
      frequentBuyersRevenue,
      frequentBuyersAov,
      repeatPurchaseRate,
      vipCount,
      topFrequentBuyers: frequentList.slice(0, 20),
    });
  });

  router.post('/customers/mass-email', requirePermission('customers'), async (req, res) => {
    const massSchema = z.object({
      segment: z.enum(['all', 'frequent', 'vip', 'unverified', 'inactive', 'selected']),
      customerIds: z.array(z.string()).optional(),
      subject: z.string().trim().min(2, 'Subject must be at least 2 characters'),
      message: z.string().trim().min(5, 'Message body must be at least 5 characters'),
      previewText: z.string().trim().optional(),
      ctaText: z.string().trim().optional(),
      ctaUrl: z.string().trim().optional(),
    });

    const parsed = massSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid parameters.' });
      return;
    }

    const { segment, customerIds, subject, message, previewText, ctaText, ctaUrl } = parsed.data;

    let targetDocs: any[] = [];
    if (segment === 'selected' && customerIds && customerIds.length > 0) {
      targetDocs = await db.models.Customer.find({ id: { $in: customerIds }, role: 'customer' }).lean();
    } else if (segment === 'unverified') {
      targetDocs = await db.models.Customer.find({ role: 'customer', emailVerified: { $ne: true } }).lean();
    } else {
      const allCustomers = await db.models.Customer.find({ role: 'customer' }).lean();
      if (segment === 'all') {
        targetDocs = allCustomers;
      } else {
        const orders = await db.models.Order.find({}, { customerId: 1, status: 1, totalAmount: 1, createdAt: 1, _id: 0 }).lean();
        const counts = new Map<string, { count: number; spend: number; lastOrder: string }>();
        for (const o of orders) {
          const cur = counts.get(o.customerId) || { count: 0, spend: 0, lastOrder: '' };
          if (o.status !== 'cancelled') cur.count++;
          if (o.status !== 'cancelled' && o.status !== 'returned') cur.spend += Number(o.totalAmount || 0);
          if (o.createdAt > cur.lastOrder) cur.lastOrder = o.createdAt;
          counts.set(o.customerId, cur);
        }

        if (segment === 'frequent') {
          targetDocs = allCustomers.filter(c => (counts.get(c.id)?.count || 0) >= 2);
        } else if (segment === 'vip') {
          targetDocs = allCustomers.filter(c => (counts.get(c.id)?.spend || 0) >= 10000 || (counts.get(c.id)?.count || 0) >= 3);
        } else if (segment === 'inactive') {
          const sixtyDaysAgo = new Date(Date.now() - 60 * 86400_000).toISOString();
          targetDocs = allCustomers.filter(c => {
            const last = counts.get(c.id)?.lastOrder || '';
            return !last || last < sixtyDaysAgo;
          });
        }
      }
    }

    if (targetDocs.length === 0) {
      res.status(400).json({ error: 'No recipients matched the selected segment criteria.' });
      return;
    }

    const brandLogoUrl = await getBrandLogoUrl();

    let dispatched = 0;
    for (const cust of targetDocs) {
      let bodyHtml = `
        <p style="margin:0 0 16px 0;font-size:16px;line-height:24px;color:#183D32;font-weight:600;">
          Namaste ${escapeHtml(cust.name)},
        </p>
        <div style="font-size:15px;line-height:26px;color:#27332D;white-space:pre-wrap;margin-bottom:24px;">
          ${escapeHtml(message).replace(/\n/g, '<br/>')}
        </div>
      `;

      if (ctaText && ctaUrl) {
        bodyHtml += `
          <div style="margin:28px 0;text-align:center;">
            ${ctaButtonHtml(ctaText, ctaUrl)}
          </div>
        `;
      }

      const html = wrapInBrandEmailLayout({
        brandLogoUrl,
        brandName: BRAND_CONFIG.name,
        supportEmail: BRAND_CONFIG.supportEmail,
        preheader: previewText || subject,
        bodyHtml,
      });

      const job = await queue.enqueue({
        recipient: cust.email,
        customerId: cust.id,
        emailType: 'admin_broadcast',
        subject,
        html,
        text: `${message}\n\n${ctaText && ctaUrl ? `${ctaText}: ${ctaUrl}\n\n` : ''}Warm regards,\nSeth And Sons DryFruits`,
      });

      if (job.jobId) {
        await queue.processJobNow(job.jobId);
      }
      dispatched++;
    }

    await logAudit(db, {
      actorId: req.user?.id || 'admin',
      actorEmail: req.user?.email || 'admin@sethandsons.com',
      action: 'customer_mass_email_sent',
      entityType: 'customer',
      entityId: segment,
      details: { segment, recipientsCount: dispatched, subject },
      ipAddress: req.ip || '',
    });

    res.json({
      dispatchedCount: dispatched,
      message: `Mass broadcast successfully delivered to ${dispatched} patrons.`,
    });
  });

  router.post('/customers/unverified/remind', requirePermission('customers'), async (req, res) => {
    const unverifiedList = await db.models.Customer.find({
      role: 'customer',
      emailVerified: { $ne: true },
    }).lean();

    if (unverifiedList.length === 0) {
      res.json({ count: 0, message: 'All customer accounts are already verified.' });
      return;
    }

    const brandLogoUrl = await getBrandLogoUrl();
    const origin = getRequestOrigin(req, config?.appUrl || 'http://localhost:3000');
    const now = new Date().toISOString();
    const expiresAt = new Date(Date.now() + 48 * 3600_000).toISOString();

    let sent = 0;
    for (const patron of unverifiedList) {
      const { raw, hash } = generateSecureToken(32);

      await db.models.VerificationToken.deleteMany({ customerId: patron.id, purpose: 'email_verify' });
      await db.models.VerificationToken.create({
        id: `vtok_${crypto.randomUUID()}`,
        customerId: patron.id,
        emailTarget: patron.email,
        purpose: 'email_verify',
        tokenHash: hash,
        expiresAt,
        createdAt: now,
      });

      const verifyUrl = `${origin}/verify-email?token=${raw}`;

      const bodyHtml = `
        <div style="background-color:#FFF8EE;border-left:4px solid #C8A96B;padding:16px;margin-bottom:20px;border-radius:4px;">
          <strong style="color:#8F6C2B;font-size:14px;">Urgent Security Notice: 48-Hour Verification Window</strong>
        </div>
        <p style="margin:0 0 16px 0;font-size:16px;line-height:24px;color:#183D32;font-weight:600;">
          Namaste ${escapeHtml(patron.name)},
        </p>
        <p style="margin:0 0 16px 0;font-size:15px;line-height:24px;color:#27332D;">
          Our patron registry indicates that your email address (<strong style="color:#183D32;">${escapeHtml(patron.email)}</strong>) remains unverified.
        </p>
        <p style="margin:0 0 16px 0;font-size:15px;line-height:24px;color:#27332D;">
          To safeguard patron security and ensure pristine order fulfillment, <strong>accounts unverified within 48 hours are automatically purged</strong> along with all associated profile data.
        </p>
        <p style="margin:0 0 24px 0;font-size:15px;line-height:24px;color:#27332D;">
          Please confirm your email address immediately by clicking the verification button below:
        </p>
        <div style="margin:28px 0;text-align:center;">
          ${ctaButtonHtml('Verify Email Address Now', verifyUrl)}
        </div>
        <p style="font-size:12px;color:#888B83;line-height:18px;">
          This link is valid for 48 hours. If the button does not work, copy and paste this link into your browser:<br/>
          <a href="${verifyUrl}" style="color:#183D32;word-break:break-all;">${verifyUrl}</a>
        </p>
      `;

      const html = wrapInBrandEmailLayout({
        brandLogoUrl,
        brandName: BRAND_CONFIG.name,
        supportEmail: BRAND_CONFIG.supportEmail,
        preheader: 'Action Required: Verify your email address within 48 hours',
        bodyHtml,
      });

      const job = await queue.enqueue({
        recipient: patron.email,
        customerId: patron.id,
        emailType: 'verification_reminder_urgent',
        subject: 'Action Required: Verify Your Seth And Sons DryFruits Account within 48 Hours',
        html,
        text: `Namaste ${patron.name},\n\nPlease verify your email address within 48 hours or your unverified account will be permanently cleared.\nVerify now: ${verifyUrl}`,
      });

      if (job.jobId) {
        await queue.processJobNow(job.jobId);
      }
      sent++;
    }

    await logAudit(db, {
      actorId: req.user?.id || 'admin',
      actorEmail: req.user?.email || 'admin@sethandsons.com',
      action: 'unverified_reminders_sent',
      entityType: 'customer',
      entityId: 'unverified_all',
      details: { recipientsCount: sent },
      ipAddress: req.ip || '',
    });

    res.json({
      remindedCount: sent,
      message: `Dispatched 48-hour verification reminders to ${sent} unverified patron(s).`,
    });
  });

  router.post('/customers/unverified/purge', requirePermission('customers'), async (req, res) => {
    const twoDaysAgo = new Date(Date.now() - 48 * 3600_000).toISOString();

    const expiredUnverified = await db.models.Customer.find({
      role: 'customer',
      emailVerified: { $ne: true },
      createdAt: { $lte: twoDaysAgo },
    }).lean();

    if (expiredUnverified.length === 0) {
      res.json({
        purgedCount: 0,
        message: 'No expired unverified accounts found older than 48 hours.',
      });
      return;
    }

    const ids = expiredUnverified.map(c => c.id);
    const emails = expiredUnverified.map(c => c.email);

    // Delete uploaded avatars from Cloudinary
    for (const u of expiredUnverified) {
      if (u.profilePicture) {
        try {
          await mediaStorage.deleteAsset?.({ url: u.profilePicture });
        } catch {}
      }
    }

    // Cascade delete all data related to these unverified accounts
    await Promise.all([
      db.models.CustomerAddress.deleteMany({ customerId: { $in: ids } }),
      db.models.Session.deleteMany({ customerId: { $in: ids } }),
      db.models.VerificationToken.deleteMany({
        $or: [{ customerId: { $in: ids } }, { emailTarget: { $in: emails } }],
      }),
      db.models.CustomerNotification.deleteMany({ customerId: { $in: ids } }),
      db.models.WishlistItem.deleteMany({ customerId: { $in: ids } }),
      db.models.Coupon.deleteMany({ targetCustomerId: { $in: ids } }),
      db.models.Customer.deleteMany({ id: { $in: ids } }),
    ]);

    await logAudit(db, {
      actorId: req.user?.id || 'admin',
      actorEmail: req.user?.email || 'admin@sethandsons.com',
      action: 'unverified_accounts_purged',
      entityType: 'customer',
      entityId: 'purge_batch',
      details: { purgedCount: expiredUnverified.length, purgedCustomerIds: ids },
      ipAddress: req.ip || '',
    });

    res.json({
      purgedCount: expiredUnverified.length,
      message: `Permanently purged ${expiredUnverified.length} expired unverified account(s) and all associated data.`,
    });
  });

  router.get('/customers/export.csv', requirePermission('customers'), async (_req, res) => {
    const [customers, orders] = await Promise.all([
      db.models.Customer.find({ role: 'customer' }, { _id: 0 }).sort({ createdAt: -1 }).lean(),
      db.models.Order.find({}, { customerId: 1, status: 1, totalAmount: 1, _id: 0 }).lean(),
    ]);

    const agg = new Map<string, { orders: number; spent: number }>();
    for (const o of orders) {
      const cur = agg.get(o.customerId) || { orders: 0, spent: 0 };
      if (o.status !== 'cancelled') cur.orders += 1;
      if (o.status !== 'cancelled' && o.status !== 'returned') cur.spent += Number(o.totalAmount || 0);
      agg.set(o.customerId, cur);
    }

    const rows = customers.map(c => {
      const s = agg.get(c.id) || { orders: 0, spent: 0 };
      return {
        name: c.name,
        email: c.email,
        phone: c.phone || '',
        emailVerified: c.emailVerified ? 'Yes' : 'No',
        isActive: c.isActive !== false ? 'Active' : 'Inactive',
        totalOrders: s.orders,
        totalSpent: s.spent,
        createdAt: c.createdAt,
      };
    });

    const csv = generateCsvString({
      title: 'Customers Export',
      subtitle: '',
      columns: [
        { header: 'Name', key: 'name' },
        { header: 'Email', key: 'email' },
        { header: 'Phone', key: 'phone' },
        { header: 'Verified', key: 'emailVerified' },
        { header: 'Active', key: 'isActive' },
        { header: 'Total Orders', key: 'totalOrders' },
        { header: 'Total Spent (INR)', key: 'totalSpent' },
        { header: 'Registered', key: 'createdAt' },
      ],
      rows,
    });
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="customers-export.csv"');
    res.send(csv);
  });

  router.get('/customers/:id', requirePermission('customers'), async (req, res) => {
    const cust = await db.models.Customer.findOne({ id: req.params.id, role: 'customer' }, { _id: 0 }).lean();
    if (!cust) {
      res.status(404).json({ error: 'Customer not found.' });
      return;
    }
    const [orders, addresses] = await Promise.all([
      db.models.Order.find({ customerId: req.params.id }, { _id: 0 }).sort({ createdAt: -1 }).lean(),
      db.models.CustomerAddress.find({ customerId: req.params.id }, { _id: 0 }).lean(),
    ]);

    const lifetimeSpending = orders
      .filter(o => o.status !== 'cancelled' && o.status !== 'returned')
      .reduce((s, o) => s + Number(o.totalAmount || 0), 0);

    const hydratedOrders = await Promise.all(orders.map(o => hydrateOrder(db, o)));

    res.json({
      customer: {
        id: cust.id,
        name: cust.name,
        email: cust.email,
        phone: cust.phone,
        emailVerified: Boolean(cust.emailVerified),
        isActive: Boolean(cust.isActive),
        tier: cust.tier,
        loyaltyPoints: cust.loyaltyPoints,
        marketingConsent: Boolean(cust.marketingConsent),
        internalNotes: cust.internalNotes || '',
        createdAt: cust.createdAt,
        lifetimeSpending,
      },
      orders: hydratedOrders,
      addresses,
    });
  });

  router.put('/customers/:id', requirePermission('customers'), async (req, res) => {
    const existing = await db.models.Customer.findOne({ id: req.params.id, role: 'customer' }).lean();
    if (!existing) {
      res.status(404).json({ error: 'Customer not found.' });
      return;
    }
    const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
    const phone = typeof req.body?.phone === 'string' ? normalizeMobile(req.body.phone) : '';
    const tier = typeof req.body?.tier === 'string' ? req.body.tier.trim() : 'Privileged Patron';
    const isActive = req.body?.isActive !== false;
    const internalNotes = typeof req.body?.internalNotes === 'string' ? req.body.internalNotes : '';
    if (name.length < 2) {
      res.status(400).json({ error: 'Name is required.' });
      return;
    }
    await db.models.Customer.updateOne(
      { id: req.params.id },
      { $set: { name, phone, tier, isActive, internalNotes, updatedAt: new Date().toISOString() } }
    );
    res.json({ message: 'Customer record updated.' });
  });

  router.get('/customers/:id/orders', requirePermission('customers'), async (req, res) => {
    const orders = await db.models.Order.find({ customerId: req.params.id }, { _id: 0 })
      .sort({ createdAt: -1 })
      .lean();
    const hydrated = await Promise.all(orders.map(o => hydrateOrder(db, o)));
    res.json({ orders: hydrated });
  });

  router.delete('/customers/:id', requirePermission('customers'), async (req, res) => {
    const target = await db.models.Customer.findOne({ id: req.params.id }).lean();
    if (!target) {
      res.status(404).json({ error: 'Customer not found.' });
      return;
    }
    if (target.role === 'admin') {
      res.status(403).json({ error: 'Cannot delete an administrator account via the customer directory.' });
      return;
    }

    if (target.profilePicture) {
      try {
        await mediaStorage.deleteAsset?.({ url: target.profilePicture });
      } catch {}
    }

    await Promise.all([
      db.models.CustomerAddress.deleteMany({ customerId: target.id }),
      db.models.Session.deleteMany({ customerId: target.id }),
      db.models.VerificationToken.deleteMany({
        $or: [{ customerId: target.id }, { emailTarget: target.email }],
      }),
      db.models.CustomerNotification.deleteMany({ customerId: target.id }),
      db.models.WishlistItem.deleteMany({ customerId: target.id }),
      db.models.Coupon.deleteMany({ targetCustomerId: target.id }),
    ]);

    await db.models.Order.updateMany(
      { customerId: target.id },
      { $set: { customerSnapshot: JSON.stringify({ name: '[Deleted Patron]', email: target.email, id: target.id }) } }
    );

    await db.models.Customer.deleteOne({ id: target.id });

    await logAudit(db, {
      actorId: req.user?.id || 'admin',
      actorEmail: req.user?.email || 'admin@sethandsons.com',
      action: 'customer_deleted',
      entityType: 'customer',
      entityId: target.id,
      details: { name: target.name, email: target.email },
      ipAddress: req.ip || '',
    });

    res.json({
      message: `Patron "${target.name}" and all associated data have been permanently deleted.`,
    });
  });

  router.post('/customers/:id/send-email', requirePermission('customers'), async (req, res) => {
    const target = await db.models.Customer.findOne({ id: req.params.id, role: 'customer' }).lean();
    if (!target) {
      res.status(404).json({ error: 'Customer not found.' });
      return;
    }

    const emailSchema = z.object({
      subject: z.string().trim().min(2, 'Subject must be at least 2 characters'),
      message: z.string().trim().min(5, 'Message body must be at least 5 characters'),
      previewText: z.string().trim().optional(),
      ctaText: z.string().trim().optional(),
      ctaUrl: z.string().trim().optional(),
    });

    const parsed = emailSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid email parameters.' });
      return;
    }

    const { subject, message, previewText, ctaText, ctaUrl } = parsed.data;
    const brandLogoUrl = await getBrandLogoUrl();

    let bodyHtml = `
      <p style="margin:0 0 16px 0;font-size:16px;line-height:24px;color:#183D32;font-weight:600;">
        Namaste ${escapeHtml(target.name)},
      </p>
      <div style="font-size:15px;line-height:26px;color:#27332D;white-space:pre-wrap;margin-bottom:24px;">
        ${escapeHtml(message).replace(/\n/g, '<br/>')}
      </div>
    `;

    if (ctaText && ctaUrl) {
      bodyHtml += `
        <div style="margin:28px 0;text-align:center;">
          ${ctaButtonHtml(ctaText, ctaUrl)}
        </div>
      `;
    }

    const html = wrapInBrandEmailLayout({
      brandLogoUrl,
      brandName: BRAND_CONFIG.name,
      supportEmail: BRAND_CONFIG.supportEmail,
      preheader: previewText || subject,
      bodyHtml,
    });

    const job = await queue.enqueue({
      recipient: target.email,
      customerId: target.id,
      emailType: 'admin_direct_message',
      subject,
      html,
      text: `${message}\n\n${ctaText && ctaUrl ? `${ctaText}: ${ctaUrl}\n\n` : ''}Warm regards,\nSeth And Sons DryFruits`,
    });

    if (job.jobId) {
      await queue.processJobNow(job.jobId);
    }

    await logAudit(db, {
      actorId: req.user?.id || 'admin',
      actorEmail: req.user?.email || 'admin@sethandsons.com',
      action: 'customer_email_sent',
      entityType: 'customer',
      entityId: target.id,
      details: { email: target.email, subject },
      ipAddress: req.ip || '',
    });

    res.json({ message: `Custom email dispatched to ${target.name} (${target.email}).` });
  });

  router.post('/customers/:id/coupon', requirePermission('customers'), async (req, res) => {
    const cust = await db.models.Customer.findOne({ id: req.params.id, role: 'customer' }).lean();
    if (!cust) {
      res.status(404).json({ error: 'Customer not found.' });
      return;
    }

    const couponSchema = z.object({
      code: z.string().trim().optional(),
      title: z.string().trim().min(2).default('Exclusive Patron Privilege'),
      description: z.string().trim().optional().default(''),
      discountType: z.enum(['percentage', 'flat']),
      discountValue: z.number().positive('Discount value must be greater than zero'),
      minOrderValue: z.number().min(0).default(0),
      maxDiscount: z.number().positive().optional().nullable(),
      usageLimit: z.number().min(1).default(1),
      endDate: z.string().trim().optional().nullable(),
      sendEmail: z.boolean().default(false),
    });

    const parsed = couponSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid coupon details.' });
      return;
    }

    const data = parsed.data;
    const cleanCode = data.code
      ? data.code.toUpperCase().replace(/[^A-Z0-9_-]/g, '')
      : `SETH-${cust.name.split(' ')[0].toUpperCase()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;

    const existingCoupon = await db.models.Coupon.findOne({ code: cleanCode }).lean();
    if (existingCoupon) {
      res.status(400).json({ error: `Coupon code "${cleanCode}" already exists. Please choose a different code.` });
      return;
    }

    const now = new Date().toISOString();
    const newCoupon = await db.models.Coupon.create({
      id: `coup_${crypto.randomUUID()}`,
      code: cleanCode,
      title: data.title,
      description: data.description || `Personal discount exclusively granted to ${cust.name}`,
      discountType: data.discountType,
      discountValue: data.discountValue,
      minOrderValue: data.minOrderValue,
      maxDiscount: data.maxDiscount || null,
      startDate: now,
      endDate: data.endDate || null,
      applicableProducts: [],
      usageLimit: data.usageLimit,
      usedCount: 0,
      targetCustomerId: cust.id,
      targetEmail: cust.email,
      active: true,
      createdAt: now,
    });

    if (data.sendEmail) {
      const brandLogoUrl = await getBrandLogoUrl();
      const discountLabel = data.discountType === 'percentage' ? `${data.discountValue}% OFF` : `₹${data.discountValue} OFF`;
      const expiryText = data.endDate ? `Valid through: ${new Date(data.endDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}` : 'No expiry date';
      const origin = getRequestOrigin(req, config?.appUrl || 'http://localhost:3000');

      const bodyHtml = `
        <p style="margin:0 0 16px 0;font-size:16px;line-height:24px;color:#183D32;font-weight:600;">
          Namaste ${escapeHtml(cust.name)},
        </p>
        <p style="margin:0 0 16px 0;font-size:15px;line-height:24px;color:#27332D;">
          We are pleased to present you with an exclusive private coupon created specifically for your account.
        </p>
        <div style="background-color:#F8F6F0;border:2px dashed #C8A96B;border-radius:12px;padding:24px;text-align:center;margin:24px 0;">
          <div style="font-size:12px;letter-spacing:2px;text-transform:uppercase;color:#888B83;margin-bottom:8px;">Your Private Code</div>
          <div style="font-size:28px;font-weight:bold;letter-spacing:3px;color:#183D32;font-family:monospace;">${cleanCode}</div>
          <div style="font-size:18px;font-weight:600;color:#C8A96B;margin-top:10px;">${discountLabel}</div>
          <div style="font-size:12px;color:#5C6058;margin-top:8px;">
            ${data.minOrderValue > 0 ? `Minimum order: ₹${data.minOrderValue} • ` : ''}Usage limit: ${data.usageLimit} time(s) • ${expiryText}
          </div>
        </div>
        <div style="margin:28px 0;text-align:center;">
          ${ctaButtonHtml('Shop Our Reserve Now', `${origin}/catalog`)}
        </div>
      `;

      const html = wrapInBrandEmailLayout({
        brandLogoUrl,
        brandName: BRAND_CONFIG.name,
        supportEmail: BRAND_CONFIG.supportEmail,
        preheader: `Exclusive Coupon: Use code ${cleanCode} for ${discountLabel}`,
        bodyHtml,
      });

      const job = await queue.enqueue({
        recipient: cust.email,
        customerId: cust.id,
        emailType: 'targeted_coupon',
        subject: `A Special Gift For You: ${discountLabel} With Code ${cleanCode}`,
        html,
        text: `Namaste ${cust.name},\n\nEnjoy an exclusive discount code: ${cleanCode} (${discountLabel}).\n${expiryText}\n\nShop now: ${origin}/catalog`,
      });

      if (job.jobId) {
        await queue.processJobNow(job.jobId);
      }
    }

    await logAudit(db, {
      actorId: req.user?.id || 'admin',
      actorEmail: req.user?.email || 'admin@sethandsons.com',
      action: 'targeted_coupon_created',
      entityType: 'coupon',
      entityId: newCoupon.id,
      details: {
        customerId: cust.id,
        code: cleanCode,
        discountType: data.discountType,
        discountValue: data.discountValue,
      },
      ipAddress: req.ip || '',
    });

    res.json({
      coupon: newCoupon,
      message: `Exclusive coupon "${cleanCode}" generated for ${cust.name}${data.sendEmail ? ' and emailed to patron' : ''}.`,
    });
  });

  // =============================================
  // 6. SUPPLIERS & PURCHASES
  // =============================================
  router.get('/suppliers', requirePermission('suppliers'), async (_req, res) => {
    const [suppliers, purchases] = await Promise.all([
      db.models.Supplier.find({}, { _id: 0 }).sort({ createdAt: -1 }).lean(),
      db.models.Purchase.find({}, { supplierId: 1, status: 1, totalAmount: 1, _id: 0 }).lean(),
    ]);

    const agg = new Map<string, { count: number; volume: number }>();
    for (const p of purchases) {
      const cur = agg.get(p.supplierId) || { count: 0, volume: 0 };
      cur.count += 1;
      if (p.status !== 'cancelled') cur.volume += Number(p.totalAmount || 0);
      agg.set(p.supplierId, cur);
    }

    res.json({
      suppliers: suppliers.map(s => {
        const st = agg.get(s.id) || { count: 0, volume: 0 };
        return {
          ...s,
          active: Boolean(s.active),
          totalPurchases: st.count,
          totalVolume: st.volume,
        };
      }),
    });
  });

  router.post('/suppliers', requirePermission('suppliers'), async (req, res) => {
    const b = req.body || {};
    const supplierName = typeof b.supplierName === 'string' ? b.supplierName.trim() : '';
    const businessName = typeof b.businessName === 'string' ? b.businessName.trim() : supplierName;
    const contactPerson = typeof b.contactPerson === 'string' ? b.contactPerson.trim() : supplierName;
    const phone = typeof b.phone === 'string' ? b.phone.trim() : '';
    if (!supplierName || !phone) {
      res.status(400).json({ error: 'Supplier name and phone are required.' });
      return;
    }
    const id = `sup_${crypto.randomUUID()}`;
    const now = new Date().toISOString();
    await db.models.Supplier.create({
      id,
      supplierName,
      businessName,
      contactPerson,
      phone,
      email: b.email || '',
      address: b.address || '',
      gstin: b.gstin || '',
      paymentTerms: b.paymentTerms || 'Net 15 Days',
      outstandingBalance: 0,
      notes: b.notes || '',
      active: true,
      createdAt: now,
      updatedAt: now,
    });
    res.status(201).json({ message: 'Supplier added.', id });
  });

  router.put('/suppliers/:id', requirePermission('suppliers'), async (req, res) => {
    const b = req.body || {};
    const supplierName = typeof b.supplierName === 'string' ? b.supplierName.trim() : '';
    if (!supplierName) {
      res.status(400).json({ error: 'Supplier name is required.' });
      return;
    }
    await db.models.Supplier.updateOne(
      { id: req.params.id },
      {
        $set: {
          supplierName,
          businessName: b.businessName || supplierName,
          contactPerson: b.contactPerson || supplierName,
          phone: b.phone || '',
          email: b.email || '',
          address: b.address || '',
          gstin: b.gstin || '',
          paymentTerms: b.paymentTerms || 'Net 15 Days',
          notes: b.notes || '',
          active: b.active !== false,
          updatedAt: new Date().toISOString(),
        },
      }
    );
    res.json({ message: 'Supplier updated.' });
  });

  router.delete('/suppliers/:id', requirePermission('suppliers'), async (req, res) => {
    const linked = await db.models.Purchase.countDocuments({ supplierId: req.params.id });
    if (linked > 0) {
      res.status(400).json({ error: 'Cannot delete supplier with existing purchase orders.' });
      return;
    }
    await db.models.Supplier.deleteOne({ id: req.params.id });
    res.json({ message: 'Supplier removed.' });
  });

  router.get('/suppliers/:id/history', requirePermission('suppliers'), async (req, res) => {
    const purchases = await db.models.Purchase.find({ supplierId: req.params.id }, { _id: 0 })
      .sort({ purchaseDate: -1 })
      .lean();
    res.json({ purchases });
  });

  router.get('/purchases', requirePermission('purchases'), async (_req, res) => {
    const [purchases, suppliers, items, products] = await Promise.all([
      db.models.Purchase.find({}, { _id: 0 }).sort({ createdAt: -1 }).lean(),
      db.models.Supplier.find({}, { id: 1, supplierName: 1, businessName: 1, _id: 0 }).lean(),
      db.models.PurchaseItem.find({}, { _id: 0 }).lean(),
      db.models.Product.find({}, { id: 1, name: 1, unit: 1, weightLabel: 1, sku: 1, _id: 0 }).lean(),
    ]);
    const supMap = new Map(suppliers.map(s => [s.id, s]));
    const prodMap = new Map(products.map(p => [p.id, p]));

    res.json({
      purchases: purchases.map(p => {
        const s = supMap.get(p.supplierId);
        return {
          ...p,
          supplierName: s?.supplierName || 'Supplier',
          businessName: s?.businessName || '',
          items: items
            .filter(it => it.purchaseId === p.id)
            .map(it => {
              const pr = prodMap.get(it.productId);
              return {
                ...it,
                productName: it.productName || pr?.name || it.productId,
                unit: pr?.unit || 'kg',
                weightLabel: pr?.weightLabel || null,
                sku: pr?.sku || '',
              };
            }),
        };
      }),
    });
  });

  router.post(
    '/purchases/upload-invoice',
    requirePermission('purchases'),
    invoiceDocUpload.single('invoice'),
    async (req, res) => {
      if (!req.file) {
        res.status(400).json({ error: 'Upload a valid invoice image or PDF.' });
        return;
      }
      try {
        const uploaded = await mediaStorage.uploadBuffer({
          buffer: req.file.buffer,
          filename: req.file.originalname,
          folder: 'invoices',
          mimeType: req.file.mimetype,
          resourceType: req.file.mimetype === 'application/pdf' ? 'raw' : 'auto',
        });
        res.json({ invoiceFile: uploaded.url, publicId: uploaded.publicId });
      } catch (err) {
        const sc = (err as { statusCode?: number }).statusCode || 500;
        res.status(sc).json({ error: err instanceof Error ? err.message : 'Cloudinary invoice upload failed.' });
      }
    }
  );

  router.post('/purchases', requirePermission('purchases'), async (req, res) => {
    const schema = z.object({
      supplierId: z.string().min(1),
      purchaseDate: z.string().min(4),
      additionalExpenses: z.number().min(0).default(0),
      paidAmount: z.number().min(0).default(0),
      paymentStatus: z.enum(['pending', 'partial', 'paid']).default('pending'),
      receiveImmediately: z.boolean().default(true),
      invoiceFile: z.string().optional().nullable(),
      notes: z.string().optional().default(''),
      items: z
        .array(
          z.object({
            productId: z.string().min(1),
            quantity: z.number().positive(),
            purchasePrice: z.number().positive(),
            gstRate: z.number().min(0).max(28).default(5),
            batchNumber: z.string().optional(),
            expiryDate: z.string().optional(),
          })
        )
        .min(1, 'At least one purchase item is required'),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid purchase order' });
      return;
    }

    const d = parsed.data;
    const supp = await db.models.Supplier.findOne({ id: d.supplierId }).lean();
    if (!supp) {
      res.status(404).json({ error: 'Selected supplier not found.' });
      return;
    }

    const prodIds = d.items.map(i => i.productId);
    const prods = await db.models.Product.find({ id: { $in: prodIds } }, { id: 1, name: 1, _id: 0 }).lean();
    const prodNameMap = new Map(prods.map(p => [p.id, p.name]));

    let subtotal = 0;
    let gstAmount = 0;
    const computedItems = d.items.map(it => {
      const lineSub = Math.round(it.quantity * it.purchasePrice);
      const lineGst = Math.round(lineSub * (it.gstRate / 100));
      subtotal += lineSub;
      gstAmount += lineGst;
      return { ...it, lineTotal: lineSub + lineGst, lineGst };
    });

    const totalAmount = subtotal + gstAmount + d.additionalExpenses;
    const paidAmount = d.paymentStatus === 'paid' ? totalAmount : d.paidAmount;
    const id = `po_${crypto.randomUUID()}`;
    const purchaseNumber = `AS-PO-${new Date().getFullYear()}-${crypto.randomInt(1000, 9999)}`;
    const now = new Date().toISOString();
    const status = d.receiveImmediately ? 'received' : 'ordered';

    await db.models.Purchase.create({
      id,
      purchaseNumber,
      supplierId: d.supplierId,
      subtotal,
      gstAmount,
      additionalExpenses: d.additionalExpenses,
      totalAmount,
      paidAmount,
      paymentStatus: d.paymentStatus,
      status,
      invoiceFile: d.invoiceFile || null,
      notes: d.notes,
      purchaseDate: d.purchaseDate,
      receivedAt: d.receiveImmediately ? now : null,
      createdBy: req.user!.email,
      createdAt: now,
      updatedAt: now,
    });

    await db.models.PurchaseItem.insertMany(
      computedItems.map(ci => ({
        id: `poi_${crypto.randomUUID()}`,
        purchaseId: id,
        productId: ci.productId,
        productName: prodNameMap.get(ci.productId) || ci.productId,
        quantity: ci.quantity,
        purchasePrice: ci.purchasePrice,
        gstRate: ci.gstRate,
        totalCost: ci.lineTotal,
        batchNumber: ci.batchNumber || null,
        expiryDate: ci.expiryDate || null,
      }))
    );

    if (paidAmount > 0) {
      await db.models.Payment.create({
        id: `pay_${crypto.randomUUID()}`,
        paymentType: 'supplier_payment',
        referenceId: purchaseNumber,
        purchaseId: id,
        supplierId: d.supplierId,
        amount: paidAmount,
        method: 'Bank Transfer',
        status: 'completed',
        notes: `Initial payment for PO #${purchaseNumber}`,
        recordedBy: req.user!.email,
        createdAt: now,
      });
    }

    if (d.receiveImmediately) {
      await applyPurchaseToInventory(id, req.user!.id, req.user!.name);
    }

    await logAudit(db, {
      actorId: req.user!.id,
      actorEmail: req.user!.email,
      action: 'purchase_created',
      entityType: 'purchase',
      entityId: purchaseNumber,
      details: { totalAmount, status, itemCount: d.items.length },
      ipAddress: req.ip || '',
    });

    res.status(201).json({ message: `Purchase order ${purchaseNumber} saved (${status}).`, id, purchaseNumber });
  });

  router.post('/purchases/:id/receive', requirePermission('purchases'), async (req, res) => {
    const po = await db.models.Purchase.findOne({ id: req.params.id }).lean();
    if (!po) {
      res.status(404).json({ error: 'Purchase order not found.' });
      return;
    }
    if (po.status === 'received') {
      res.status(400).json({ error: 'Purchase has already been received into inventory.' });
      return;
    }
    const now = new Date().toISOString();
    await db.models.Purchase.updateOne(
      { id: po.id },
      { $set: { status: 'received', receivedAt: now, updatedAt: now } }
    );
    await applyPurchaseToInventory(po.id, req.user!.id, req.user!.name);
    res.json({ message: `Purchase #${po.purchaseNumber} received and stock updated.` });
  });

  router.post('/purchases/:id/payment', requirePermission('purchases'), async (req, res) => {
    const amount = Number(req.body?.amount || 0);
    if (!Number.isFinite(amount) || amount <= 0) {
      res.status(400).json({ error: 'Valid positive payment amount is required.' });
      return;
    }
    const po = await db.models.Purchase.findOne({ id: req.params.id }).lean();
    if (!po) {
      res.status(404).json({ error: 'Purchase not found.' });
      return;
    }
    const newPaid = Math.min(po.totalAmount, Number(po.paidAmount) + amount);
    const paymentStatus = newPaid >= po.totalAmount ? 'paid' : 'partial';
    const now = new Date().toISOString();

    await db.models.Purchase.updateOne(
      { id: po.id },
      { $set: { paidAmount: newPaid, paymentStatus, updatedAt: now } }
    );

    const supp = await db.models.Supplier.findOne({ id: po.supplierId }).lean();
    const nextBalance = Math.max(0, Number(supp?.outstandingBalance || 0) - amount);
    await db.models.Supplier.updateOne(
      { id: po.supplierId },
      { $set: { outstandingBalance: nextBalance, updatedAt: now } }
    );

    await db.models.Payment.create({
      id: `pay_${crypto.randomUUID()}`,
      paymentType: 'supplier_payment',
      referenceId: po.purchaseNumber,
      purchaseId: po.id,
      supplierId: po.supplierId,
      amount,
      method: 'Bank Transfer',
      status: 'completed',
      notes: `Payable settlement on PO #${po.purchaseNumber}`,
      recordedBy: req.user!.email,
      createdAt: now,
    });

    res.json({ message: 'Supplier payment recorded.', paymentStatus, paidAmount: newPaid });
  });

  router.put('/purchases/:id', requirePermission('purchases'), async (req, res) => {
    const existing = await db.models.Purchase.findOne({ id: req.params.id }).lean();
    if (!existing) {
      res.status(404).json({ error: 'Purchase order not found.' });
      return;
    }

    const schema = z.object({
      supplierId: z.string().min(1),
      purchaseDate: z.string().min(4),
      additionalExpenses: z.number().min(0).default(0),
      paidAmount: z.number().min(0).default(0),
      paymentStatus: z.enum(['pending', 'partial', 'paid']).default('pending'),
      receiveImmediately: z.boolean().optional(),
      invoiceFile: z.string().optional().nullable(),
      notes: z.string().optional().default(''),
      items: z
        .array(
          z.object({
            productId: z.string().min(1),
            quantity: z.number().positive(),
            purchasePrice: z.number().positive(),
            gstRate: z.number().min(0).max(28).default(5),
            batchNumber: z.string().optional(),
            expiryDate: z.string().optional(),
          })
        )
        .min(1, 'At least one purchase item is required'),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid purchase order update' });
      return;
    }

    const d = parsed.data;
    const supp = await db.models.Supplier.findOne({ id: d.supplierId }).lean();
    if (!supp) {
      res.status(404).json({ error: 'Selected supplier not found.' });
      return;
    }

    const wasReceived = existing.status === 'received';
    if (wasReceived) {
      await reversePurchaseFromInventory(existing.id, req.user!.id, req.user!.name, 'Purchase edited reversal');
    }

    const prodIds = d.items.map(i => i.productId);
    const prods = await db.models.Product.find({ id: { $in: prodIds } }, { id: 1, name: 1, _id: 0 }).lean();
    const prodNameMap = new Map(prods.map(p => [p.id, p.name]));

    let subtotal = 0;
    let gstAmount = 0;
    const computedItems = d.items.map(it => {
      const lineSub = Math.round(it.quantity * it.purchasePrice);
      const lineGst = Math.round(lineSub * (it.gstRate / 100));
      subtotal += lineSub;
      gstAmount += lineGst;
      return { ...it, lineTotal: lineSub + lineGst };
    });

    const totalAmount = subtotal + gstAmount + d.additionalExpenses;
    const paidAmount = d.paymentStatus === 'paid' ? totalAmount : Math.min(totalAmount, d.paidAmount);
    const nextStatus =
      d.receiveImmediately !== undefined
        ? d.receiveImmediately
          ? 'received'
          : 'ordered'
        : existing.status;
    const now = new Date().toISOString();

    await db.models.Purchase.updateOne(
      { id: existing.id },
      {
        $set: {
          supplierId: d.supplierId,
          subtotal,
          gstAmount,
          additionalExpenses: d.additionalExpenses,
          totalAmount,
          paidAmount,
          paymentStatus: d.paymentStatus,
          status: nextStatus,
          invoiceFile: d.invoiceFile !== undefined ? d.invoiceFile : existing.invoiceFile,
          notes: d.notes,
          purchaseDate: d.purchaseDate,
          receivedAt: nextStatus === 'received' ? existing.receivedAt || now : null,
          updatedAt: now,
        },
      }
    );

    await db.models.PurchaseItem.deleteMany({ purchaseId: existing.id });
    await db.models.PurchaseItem.insertMany(
      computedItems.map(ci => ({
        id: `poi_${crypto.randomUUID()}`,
        purchaseId: existing.id,
        productId: ci.productId,
        productName: prodNameMap.get(ci.productId) || ci.productId,
        quantity: ci.quantity,
        purchasePrice: ci.purchasePrice,
        gstRate: ci.gstRate,
        totalCost: ci.lineTotal,
        batchNumber: ci.batchNumber || null,
        expiryDate: ci.expiryDate || null,
      }))
    );

    if (nextStatus === 'received') {
      await applyPurchaseToInventory(existing.id, req.user!.id, req.user!.name);
    }

    await logAudit(db, {
      actorId: req.user!.id,
      actorEmail: req.user!.email,
      action: 'purchase_updated',
      entityType: 'purchase',
      entityId: existing.purchaseNumber,
      details: { totalAmount, status: nextStatus, itemCount: d.items.length },
      ipAddress: req.ip || '',
    });

    res.json({ message: `Purchase order #${existing.purchaseNumber} updated.`, id: existing.id });
  });

  router.delete('/purchases/:id', requirePermission('purchases'), async (req, res) => {
    const existing = await db.models.Purchase.findOne({ id: req.params.id }).lean();
    if (!existing) {
      res.status(404).json({ error: 'Purchase order not found.' });
      return;
    }

    if (existing.status === 'received') {
      await reversePurchaseFromInventory(existing.id, req.user!.id, req.user!.name, 'Purchase deleted');
    }

    await Promise.all([
      db.models.PurchaseItem.deleteMany({ purchaseId: existing.id }),
      db.models.Payment.deleteMany({ purchaseId: existing.id }),
      db.models.Purchase.deleteOne({ id: existing.id }),
    ]);

    await logAudit(db, {
      actorId: req.user!.id,
      actorEmail: req.user!.email,
      action: 'purchase_deleted',
      entityType: 'purchase',
      entityId: existing.purchaseNumber,
      details: { totalAmount: existing.totalAmount, status: existing.status },
      ipAddress: req.ip || '',
    });

    res.json({
      message: `Purchase order #${existing.purchaseNumber} deleted${
        existing.status === 'received' ? ' and stock reversed' : ''
      }.`,
    });
  });

  // =============================================
  // 7. FINANCIAL OVERVIEW & EXPENSE MANAGEMENT
  // =============================================
  router.get('/finance/summary', requirePermission('sales'), async (req, res) => {
    const from = typeof req.query.from === 'string' && req.query.from ? req.query.from : undefined;
    const to = typeof req.query.to === 'string' && req.query.to ? req.query.to : undefined;
    res.json({ summary: await computeFinanceMetrics(from, to) });
  });

  router.get('/expenses', requirePermission('expenses'), async (req, res) => {
    const category = typeof req.query.category === 'string' ? req.query.category : '';
    const filter = category && category !== 'all' ? { category } : {};
    const rows = await db.models.Expense.find(filter, { _id: 0 }).sort({ expenseDate: -1 }).lean();
    res.json({ expenses: rows });
  });

  router.post(
    '/expenses/upload-receipt',
    requirePermission('expenses'),
    receiptUpload.single('receipt'),
    async (req, res) => {
      if (!req.file) {
        res.status(400).json({ error: 'Upload a valid image or PDF receipt.' });
        return;
      }
      try {
        const uploaded = await mediaStorage.uploadBuffer({
          buffer: req.file.buffer,
          filename: req.file.originalname,
          folder: 'receipts',
          mimeType: req.file.mimetype,
          resourceType: req.file.mimetype === 'application/pdf' ? 'raw' : 'auto',
        });
        res.json({ receiptUrl: uploaded.url, publicId: uploaded.publicId });
      } catch (err) {
        const sc = (err as { statusCode?: number }).statusCode || 500;
        res.status(sc).json({ error: err instanceof Error ? err.message : 'Cloudinary receipt upload failed.' });
      }
    }
  );

  router.post('/expenses', requirePermission('expenses'), async (req, res) => {
    const schema = z.object({
      category: z.enum([
        'Packaging',
        'Transportation',
        'Shipping',
        'Electricity',
        'Rent',
        'Employee Salary',
        'Staff Salary',
        'Utilities',
        'Maintenance',
        'Marketing',
        'Miscellaneous',
      ]),
      title: z.string().trim().min(2),
      amount: z.number().positive(),
      expenseDate: z.string().min(4),
      vendor: z.string().optional().default(''),
      paymentMode: z.string().optional().default('Bank Transfer'),
      receiptUrl: z.string().optional().nullable(),
      notes: z.string().optional().default(''),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid expense data' });
      return;
    }
    const d = parsed.data;
    const id = `exp_${crypto.randomUUID()}`;
    const now = new Date().toISOString();
    await db.models.Expense.create({
      id,
      category: d.category,
      title: d.title,
      amount: d.amount,
      expenseDate: d.expenseDate,
      vendor: d.vendor,
      paymentMode: d.paymentMode,
      receiptUrl: d.receiptUrl || null,
      notes: d.notes,
      createdBy: req.user!.email,
      createdAt: now,
      updatedAt: now,
    });

    await logAudit(db, {
      actorId: req.user!.id,
      actorEmail: req.user!.email,
      action: 'expense_created',
      entityType: 'expense',
      entityId: id,
      details: { category: d.category, amount: d.amount },
      ipAddress: req.ip || '',
    });
    res.status(201).json({ message: 'Expense recorded.', id });
  });

  router.put('/expenses/:id', requirePermission('expenses'), async (req, res) => {
    const b = req.body || {};
    await db.models.Expense.updateOne(
      { id: req.params.id },
      {
        $set: {
          category: b.category,
          title: b.title,
          amount: Number(b.amount),
          expenseDate: b.expenseDate,
          vendor: b.vendor || '',
          paymentMode: b.paymentMode || 'Bank Transfer',
          receiptUrl: b.receiptUrl || null,
          notes: b.notes || '',
          updatedAt: new Date().toISOString(),
        },
      }
    );
    res.json({ message: 'Expense updated.' });
  });

  router.delete('/expenses/:id', requirePermission('expenses'), async (req, res) => {
    await db.models.Expense.deleteOne({ id: req.params.id });
    res.json({ message: 'Expense deleted.' });
  });

  // =============================================
  // 8. COUPONS MANAGEMENT
  // =============================================
  router.get('/coupons', requirePermission('coupons'), async (_req, res) => {
    const rows = await db.models.Coupon.find({}, { _id: 0 }).sort({ createdAt: -1 }).lean();
    res.json({ coupons: rows.map(c => ({ ...c, active: Boolean(c.active) })) });
  });

  router.post('/coupons', requirePermission('coupons'), async (req, res) => {
    const b = req.body || {};
    const code = typeof b.code === 'string' ? b.code.trim().toUpperCase() : '';
    const title = typeof b.title === 'string' && b.title.trim() ? b.title.trim() : code;
    const discountType = b.discountType === 'flat' ? 'flat' : 'percentage';
    const discountValue = Number(b.discountValue || 0);
    if (!code || discountValue <= 0) {
      res.status(400).json({ error: 'Coupon code and positive discount value are required.' });
      return;
    }
    const id = `cpn_${crypto.randomUUID()}`;
    try {
      await db.models.Coupon.create({
        id,
        code,
        title,
        description: b.description || '',
        discountType,
        discountValue,
        minOrderValue: Number(b.minOrderValue || 0),
        maxDiscount: b.maxDiscount ? Number(b.maxDiscount) : null,
        startDate: b.startDate || null,
        endDate: b.endDate || null,
        applicableProducts: Array.isArray(b.applicableProducts) ? b.applicableProducts.map(String) : [],
        active: b.active !== false,
        createdAt: new Date().toISOString(),
      });
      res.status(201).json({ message: `Coupon ${code} created.`, id });
    } catch (err: any) {
      if (err?.code === 11000) {
        res.status(409).json({ error: `Coupon code "${code}" already exists.` });
        return;
      }
      throw err;
    }
  });

  router.put('/coupons/:id', requirePermission('coupons'), async (req, res) => {
    const b = req.body || {};
    const existing = await db.models.Coupon.findOne({ id: req.params.id }).lean();
    if (!existing) {
      res.status(404).json({ error: 'Coupon not found.' });
      return;
    }
    await db.models.Coupon.updateOne(
      { id: req.params.id },
      {
        $set: {
          code: b.code ? String(b.code).trim().toUpperCase() : existing.code,
          title: b.title !== undefined ? String(b.title) : existing.title,
          description: b.description !== undefined ? String(b.description) : existing.description,
          discountType: b.discountType ? (b.discountType === 'flat' ? 'flat' : 'percentage') : existing.discountType,
          discountValue: b.discountValue !== undefined ? Number(b.discountValue) : existing.discountValue,
          minOrderValue: b.minOrderValue !== undefined ? Number(b.minOrderValue) : existing.minOrderValue,
          maxDiscount: b.maxDiscount !== undefined ? (b.maxDiscount ? Number(b.maxDiscount) : null) : existing.maxDiscount,
          startDate: b.startDate !== undefined ? b.startDate || null : existing.startDate,
          endDate: b.endDate !== undefined ? b.endDate || null : existing.endDate,
          applicableProducts: Array.isArray(b.applicableProducts)
            ? b.applicableProducts.map(String)
            : existing.applicableProducts,
          active: b.active !== undefined ? Boolean(b.active) : existing.active,
        },
      }
    );
    res.json({ message: 'Coupon updated.' });
  });

  router.delete('/coupons/:id', requirePermission('coupons'), async (req, res) => {
    await db.models.Coupon.deleteOne({ id: req.params.id });
    res.json({ message: 'Coupon deleted.' });
  });

  // =============================================
  // 9. REPORTS (10 REPORTS × PDF / EXCEL / CSV)
  // =============================================
  async function buildReport(
    type: string,
    from?: string,
    to?: string,
    categoryId?: string,
    productId?: string
  ): Promise<ReportTableData> {
    const rangeLabel = `Range: ${from || 'All-time'} to ${to || 'Present'}`;
    const isoRange = () => {
      if (!from && !to) return undefined;
      const r: Record<string, string> = {};
      if (from) r.$gte = from;
      if (to) r.$lte = `${to}T23:59:59.999Z`;
      return r;
    };

    if (type === 'daily_sales' || type === 'monthly_sales' || type === 'yearly_sales') {
      const fmtLen = type === 'daily_sales' ? 10 : type === 'monthly_sales' ? 7 : 4;
      const f: Record<string, unknown> = { status: { $nin: ['cancelled', 'returned'] } };
      const r = isoRange();
      if (r) f.createdAt = r;

      const orders = await db.models.Order.find(f).lean();
      const map = new Map<string, { period: string; orders: number; grossSales: number; discounts: number; gst: number; totalCollected: number }>();
      for (const o of orders) {
        const period = String(o.createdAt).slice(0, fmtLen);
        const cur = map.get(period) || { period, orders: 0, grossSales: 0, discounts: 0, gst: 0, totalCollected: 0 };
        cur.orders += 1;
        cur.grossSales += Number(o.subtotal || 0);
        cur.discounts += Number(o.discountAmount || 0);
        cur.gst += Number(o.taxAmount || 0);
        cur.totalCollected += Number(o.totalAmount || 0);
        map.set(period, cur);
      }
      const rows = Array.from(map.values()).sort((a, b) => b.period.localeCompare(a.period));
      return {
        title: type === 'daily_sales' ? 'Daily Sales Report' : type === 'monthly_sales' ? 'Monthly Sales Report' : 'Yearly Sales Report',
        subtitle: rangeLabel,
        columns: [
          { header: 'Period', key: 'period', width: 16 },
          { header: 'Orders', key: 'orders', width: 12 },
          { header: 'Gross Sales (INR)', key: 'grossSales', width: 18 },
          { header: 'Discounts (INR)', key: 'discounts', width: 16 },
          { header: 'GST (INR)', key: 'gst', width: 14 },
          { header: 'Net Total (INR)', key: 'totalCollected', width: 18 },
        ],
        rows,
      };
    }

    if (type === 'product_performance') {
      const f: Record<string, unknown> = { status: { $nin: ['cancelled', 'returned'] } };
      const r = isoRange();
      if (r) f.createdAt = r;
      const [orders, items, products, categories] = await Promise.all([
        db.models.Order.find(f, { id: 1, _id: 0 }).lean(),
        db.models.OrderItem.find({}, { _id: 0 }).lean(),
        db.models.Product.find({}, { id: 1, categoryId: 1, _id: 0 }).lean(),
        db.models.Category.find({}, { id: 1, name: 1, _id: 0 }).lean(),
      ]);
      const orderIds = new Set(orders.map(o => o.id));
      const prodCat = new Map(products.map(p => [p.id, p.categoryId]));
      const catNames = new Map(categories.map(c => [c.id, c.name]));

      const map = new Map<string, { productName: string; category: string; unitsSold: number; revenue: number; cogs: number }>();
      for (const oi of items) {
        if (!orderIds.has(oi.orderId)) continue;
        if (productId && oi.productId !== productId) continue;
        const pCatId = prodCat.get(oi.productId) || '';
        if (categoryId && pCatId !== categoryId) continue;

        const categoryLabel = (pCatId && catNames.get(pCatId)) || oi.category;
        const cur = map.get(oi.productId) || { productName: oi.productName, category: categoryLabel, unitsSold: 0, revenue: 0, cogs: 0 };
        cur.unitsSold += Number(oi.quantity || 0);
        cur.revenue += Number(oi.subtotal || 0);
        cur.cogs += Number(oi.quantity || 0) * Number(oi.purchasePrice || 0);
        map.set(oi.productId, cur);
      }
      const rows = Array.from(map.values()).sort((a, b) => b.revenue - a.revenue);
      return {
        title: 'Product Performance Report',
        subtitle: rangeLabel,
        columns: [
          { header: 'Product', key: 'productName', width: 28 },
          { header: 'Category', key: 'category', width: 22 },
          { header: 'Units Sold', key: 'unitsSold', width: 14 },
          { header: 'Revenue (INR)', key: 'revenue', width: 16 },
          { header: 'COGS (INR)', key: 'cogs', width: 16 },
        ],
        rows,
      };
    }

    if (type === 'inventory') {
      const f: Record<string, unknown> = {};
      if (categoryId) f.categoryId = categoryId;
      if (productId) f.id = productId;
      const [products, cats] = await Promise.all([
        db.models.Product.find(f, { _id: 0 }).sort({ stock: 1 }).lean(),
        db.models.Category.find({}, { id: 1, name: 1, _id: 0 }).lean(),
      ]);
      const catNames = new Map(cats.map(c => [c.id, c.name]));
      const rows = products.map(p => {
        const baseUnitsPerPack =
          p.unit === 'ml'
            ? parseWeightGrams(String(p.weightLabel || '100ml')) || 100
            : p.unit === 'gram'
            ? parseWeightGrams(String(p.weightLabel || '1g')) || 1
            : 1;
        return {
          sku: p.sku || '',
          name: p.name,
          category: (p.categoryId && catNames.get(p.categoryId)) || p.category,
          stock: Number(p.stock || 0),
          unit: p.unit,
          purchasePrice: Number(p.purchasePrice || 0),
          price: Number(p.price || 0),
          valuation: Math.round((Number(p.stock || 0) / baseUnitsPerPack) * Number(p.purchasePrice || 0)),
        };
      });
      return {
        title: 'Inventory Valuation Report',
        subtitle: rangeLabel,
        columns: [
          { header: 'SKU', key: 'sku', width: 16 },
          { header: 'Product', key: 'name', width: 26 },
          { header: 'Category', key: 'category', width: 20 },
          { header: 'Stock', key: 'stock', width: 10 },
          { header: 'Unit', key: 'unit', width: 10 },
          { header: 'Cost (INR)', key: 'purchasePrice', width: 14 },
          { header: 'Valuation (INR)', key: 'valuation', width: 16 },
        ],
        rows,
      };
    }

    if (type === 'customer') {
      const [customers, orders] = await Promise.all([
        db.models.Customer.find({ role: 'customer' }, { _id: 0 }).lean(),
        db.models.Order.find({}, { customerId: 1, status: 1, totalAmount: 1, _id: 0 }).lean(),
      ]);
      const agg = new Map<string, { ordersCount: number; lifetimeSpend: number }>();
      for (const o of orders) {
        const cur = agg.get(o.customerId) || { ordersCount: 0, lifetimeSpend: 0 };
        if (o.status !== 'cancelled') cur.ordersCount += 1;
        if (o.status !== 'cancelled' && o.status !== 'returned') cur.lifetimeSpend += Number(o.totalAmount || 0);
        agg.set(o.customerId, cur);
      }
      const rows = customers
        .map(c => {
          const st = agg.get(c.id) || { ordersCount: 0, lifetimeSpend: 0 };
          return {
            name: c.name,
            email: c.email,
            phone: c.phone || '',
            tier: c.tier,
            ordersCount: st.ordersCount,
            lifetimeSpend: st.lifetimeSpend,
          };
        })
        .sort((a, b) => b.lifetimeSpend - a.lifetimeSpend);

      return {
        title: 'Customer Directory Report',
        subtitle: rangeLabel,
        columns: [
          { header: 'Name', key: 'name', width: 24 },
          { header: 'Email', key: 'email', width: 28 },
          { header: 'Phone', key: 'phone', width: 16 },
          { header: 'Tier', key: 'tier', width: 20 },
          { header: 'Orders', key: 'ordersCount', width: 10 },
          { header: 'Lifetime Spend (INR)', key: 'lifetimeSpend', width: 18 },
        ],
        rows,
      };
    }

    if (type === 'supplier_purchase') {
      const [purchases, suppliers] = await Promise.all([
        db.models.Purchase.find({}, { _id: 0 }).sort({ purchaseDate: -1 }).lean(),
        db.models.Supplier.find({}, { id: 1, supplierName: 1, _id: 0 }).lean(),
      ]);
      const supNames = new Map(suppliers.map(s => [s.id, s.supplierName]));
      const rows = purchases.map(p => ({
        purchaseNumber: p.purchaseNumber,
        supplierName: supNames.get(p.supplierId) || 'Supplier',
        purchaseDate: p.purchaseDate,
        subtotal: p.subtotal,
        gstAmount: p.gstAmount,
        totalAmount: p.totalAmount,
        paymentStatus: p.paymentStatus,
        status: p.status,
      }));
      return {
        title: 'Supplier Purchase Report',
        subtitle: rangeLabel,
        columns: [
          { header: 'PO Number', key: 'purchaseNumber', width: 18 },
          { header: 'Supplier', key: 'supplierName', width: 24 },
          { header: 'Date', key: 'purchaseDate', width: 14 },
          { header: 'Total (INR)', key: 'totalAmount', width: 15 },
          { header: 'Payment', key: 'paymentStatus', width: 12 },
          { header: 'Status', key: 'status', width: 12 },
        ],
        rows,
      };
    }

    if (type === 'expense') {
      const f: Record<string, unknown> = {};
      if (from || to) {
        const range: Record<string, string> = {};
        if (from) range.$gte = from.slice(0, 10);
        if (to) range.$lte = to.slice(0, 10);
        f.expenseDate = range;
      }
      const rows = await db.models.Expense.find(f, { expenseDate: 1, category: 1, title: 1, vendor: 1, paymentMode: 1, amount: 1, _id: 0 })
        .sort({ expenseDate: -1 })
        .lean();
      return {
        title: 'Operating Expense Report',
        subtitle: rangeLabel,
        columns: [
          { header: 'Date', key: 'expenseDate', width: 14 },
          { header: 'Category', key: 'category', width: 18 },
          { header: 'Title', key: 'title', width: 28 },
          { header: 'Vendor', key: 'vendor', width: 20 },
          { header: 'Amount (INR)', key: 'amount', width: 14 },
        ],
        rows: rows as Array<Record<string, string | number>>,
      };
    }

    if (type === 'gst_summary') {
      const f: Record<string, unknown> = { status: { $nin: ['cancelled', 'returned'] } };
      const r = isoRange();
      if (r) f.createdAt = r;
      const orders = await db.models.Order.find(f, { _id: 0 }).sort({ createdAt: -1 }).lean();
      const rows = orders.map(o => ({
        orderNumber: o.orderNumber,
        orderDate: String(o.createdAt).slice(0, 10),
        subtotal: o.subtotal,
        discountAmount: o.discountAmount,
        gstCollected: o.taxAmount,
        totalAmount: o.totalAmount,
      }));
      return {
        title: 'GST Summary Report',
        subtitle: rangeLabel,
        columns: [
          { header: 'Order ID', key: 'orderNumber', width: 20 },
          { header: 'Date', key: 'orderDate', width: 14 },
          { header: 'Taxable Base (INR)', key: 'subtotal', width: 18 },
          { header: 'Discounts (INR)', key: 'discountAmount', width: 16 },
          { header: 'GST Collected (INR)', key: 'gstCollected', width: 18 },
          { header: 'Invoice Total (INR)', key: 'totalAmount', width: 18 },
        ],
        rows,
      };
    }

    const fin = await computeFinanceMetrics(from, to);
    return {
      title: 'Profit & Loss Statement',
      subtitle: rangeLabel,
      columns: [
        { header: 'Accounting Line Item', key: 'item', width: 38 },
        { header: 'Amount (INR)', key: 'amount', width: 20 },
      ],
      rows: [
        { item: 'Gross Sales (Products + Shipping)', amount: fin.grossSales },
        { item: 'Less: Customer Discounts', amount: -fin.totalDiscounts },
        { item: 'Less: Refunds & Returns', amount: -fin.totalRefunds },
        { item: 'Net Sales (Revenue Excl. Tax)', amount: fin.netSales },
        { item: 'GST Collected (Tax Liability)', amount: fin.gstCollected },
        { item: 'Less: Cost of Goods Sold (COGS)', amount: -fin.cogs },
        { item: 'Estimated Gross Profit', amount: fin.estimatedGrossProfit },
        { item: 'Less: Operating Expenses', amount: -fin.operatingExpenses },
        { item: 'Estimated Net Profit', amount: fin.estimatedNetProfit },
      ],
      summary: [
        { label: 'Net Sales', value: `INR ${fin.netSales}` },
        { label: 'Estimated Gross Profit', value: `INR ${fin.estimatedGrossProfit}` },
        { label: 'Estimated Net Profit', value: `INR ${fin.estimatedNetProfit}` },
      ],
    };
  }

  router.get('/reports/preview', requirePermission('reports'), async (req, res) => {
    const type = String(req.query.type || 'profit_loss');
    const from = typeof req.query.from === 'string' && req.query.from ? req.query.from : undefined;
    const to = typeof req.query.to === 'string' && req.query.to ? req.query.to : undefined;
    const categoryId = typeof req.query.categoryId === 'string' && req.query.categoryId ? req.query.categoryId : undefined;
    const productId = typeof req.query.productId === 'string' && req.query.productId ? req.query.productId : undefined;
    res.json({ report: await buildReport(type, from, to, categoryId, productId) });
  });

  router.get('/reports/export', requirePermission('reports'), async (req, res) => {
    const type = String(req.query.type || 'profit_loss');
    const format = String(req.query.format || 'csv').toLowerCase();
    const from = typeof req.query.from === 'string' && req.query.from ? req.query.from : undefined;
    const to = typeof req.query.to === 'string' && req.query.to ? req.query.to : undefined;
    const categoryId = typeof req.query.categoryId === 'string' && req.query.categoryId ? req.query.categoryId : undefined;
    const productId = typeof req.query.productId === 'string' && req.query.productId ? req.query.productId : undefined;
    const report = await buildReport(type, from, to, categoryId, productId);

    if (format === 'xlsx' || format === 'excel') {
      const buf = await generateExcelBuffer(report);
      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      );
      res.setHeader('Content-Disposition', `attachment; filename="${type}-report.xlsx"`);
      res.send(buf);
      return;
    }

    if (format === 'pdf') {
      const buf = await generatePdfBuffer(report);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${type}-report.pdf"`);
      res.send(buf);
      return;
    }

    const csv = generateCsvString(report);
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${type}-report.csv"`);
    res.send(csv);
  });

  // =============================================
  // 10. STAFF MANAGEMENT (SUPER ADMIN) & SETTINGS
  // =============================================
  router.get('/staff', requireSuperAdmin, async (_req, res) => {
    const rows = await db.models.Customer.find(
      { role: 'admin' },
      { id: 1, name: 1, email: 1, phone: 1, adminRole: 1, permissions: 1, isActive: 1, createdAt: 1, _id: 0 }
    )
      .sort({ createdAt: 1 })
      .lean();

    res.json({
      allPermissions: ALL_ADMIN_PERMISSIONS,
      staff: rows.map(r => ({
        ...r,
        isActive: r.isActive === undefined ? true : Boolean(r.isActive),
        permissions: Array.isArray(r.permissions) ? r.permissions : [],
      })),
    });
  });

  router.post('/staff', requireSuperAdmin, async (req, res) => {
    const b = req.body || {};
    const name = typeof b.name === 'string' ? b.name.trim() : '';
    const email = typeof b.email === 'string' ? normalizeEmail(b.email) : '';
    const phone = typeof b.phone === 'string' ? b.phone.trim() : '';
    const password = typeof b.password === 'string' ? b.password : '';
    const adminRole = b.adminRole === 'super_admin' ? 'super_admin' : 'staff';
    const permissions = Array.isArray(b.permissions) ? b.permissions.map(String) : ['dashboard', 'orders'];

    if (!name || !isValidEmail(email) || (password.trim() && !validatePasswordStrength(password).valid)) {
      res.status(400).json({ error: 'Valid name and email are required (if supplying a password, use 8+ chars with upper, lower, number, special).' });
      return;
    }
    const exists = await db.models.Customer.findOne({ email }).lean();
    if (exists) {
      res.status(409).json({ error: 'An account with this email already exists.' });
      return;
    }

    const id = `staff_${crypto.randomUUID()}`;
    const rawCredential = password.trim() || crypto.randomBytes(24).toString('hex');
    const hash = await hashPassword(rawCredential);
    const now = new Date().toISOString();

    const effectivePermissions = adminRole === 'super_admin' ? [...ALL_ADMIN_PERMISSIONS] : permissions;

    await db.models.Customer.create({
      id,
      name,
      email,
      emailVerified: true,
      emailVerifiedAt: now,
      phone,
      passwordHash: hash,
      role: 'admin',
      adminRole,
      permissions: effectivePermissions,
      isActive: true,
      tier: adminRole === 'super_admin' ? 'Super Admin' : 'Store Staff',
      loyaltyPoints: 0,
      marketingConsent: false,
      emailPreferences: DEFAULT_EMAIL_PREFERENCES,
      createdAt: now,
      updatedAt: now,
    });

    await logAudit(db, {
      actorId: req.user!.id,
      actorEmail: req.user!.email,
      action: 'staff_created',
      entityType: 'staff',
      entityId: email,
      details: { adminRole, permissions: effectivePermissions },
      ipAddress: req.ip || '',
    });

    try {
      await emailService?.sendAdminWelcomeEmail({
        id,
        name,
        email,
        adminRole,
        permissions: effectivePermissions,
      });
    } catch {
      // non-fatal admin welcome notification
    }

    res.status(201).json({ message: `Staff account created for ${email}.`, id });
  });

  router.put('/staff/:id', requireSuperAdmin, async (req, res) => {
    const b = req.body || {};
    const adminRole = b.adminRole === 'super_admin' ? 'super_admin' : 'staff';
    const permissions = Array.isArray(b.permissions) ? b.permissions.map(String) : [];
    const isActive = b.isActive !== false;

    if (req.params.id === req.user!.id && !isActive) {
      res.status(400).json({ error: 'You cannot deactivate your own Super Admin account.' });
      return;
    }

    const updateSet: Record<string, unknown> = {
      adminRole,
      permissions: adminRole === 'super_admin' ? [...ALL_ADMIN_PERMISSIONS] : permissions,
      isActive,
      updatedAt: new Date().toISOString(),
    };
    if (typeof b.name === 'string' && b.name.trim()) updateSet.name = b.name.trim();
    if (typeof b.phone === 'string') updateSet.phone = b.phone.trim();
    if (typeof b.password === 'string' && b.password.trim()) {
      if (!validatePasswordStrength(b.password).valid) {
        res.status(400).json({ error: 'New password must satisfy strong password rules.' });
        return;
      }
      updateSet.passwordHash = await hashPassword(b.password);
    }

    await db.models.Customer.updateOne(
      { id: req.params.id, role: 'admin' },
      { $set: updateSet }
    );

    if (!isActive) {
      await db.models.Session.updateMany(
        { customerId: req.params.id },
        { $set: { revokedAt: new Date().toISOString() } }
      );
    }

    res.json({ message: 'Staff permissions updated.' });
  });

  router.delete('/staff/:id', requireSuperAdmin, async (req, res) => {
    if (req.params.id === req.user!.id) {
      res.status(400).json({ error: 'You cannot delete your own account.' });
      return;
    }
    await db.models.Session.deleteMany({ customerId: req.params.id });
    await db.models.Customer.deleteOne({ id: req.params.id, role: 'admin' });
    res.json({ message: 'Staff account removed.' });
  });

  const safeAssetOrWebUrl = (val: string) =>
    !val ||
    val.startsWith('/') ||
    val.startsWith('https://') ||
    val.startsWith('http://');

  const websiteSettingsSchema = z.object({
    logoUrl: z.string().trim().max(500).refine(safeAssetOrWebUrl, 'Invalid logo URL').optional(),
    faviconUrl: z.string().trim().max(500).refine(safeAssetOrWebUrl, 'Invalid favicon URL').optional(),
    brandName: z.string().trim().min(2, 'Brand name must be at least 2 characters').max(120).optional(),
    tagline: z.string().trim().max(200).optional(),
    heroBanners: z
      .array(z.string().trim().min(1).max(500).refine(safeAssetOrWebUrl, 'Invalid banner URL'))
      .max(20)
      .optional(),
    featuredProductIds: z.array(z.string().trim().min(1).max(80)).max(30).optional(),
    promotionalSections: z
      .array(
        z.object({
          title: z.string().trim().max(160),
          subtitle: z.string().trim().max(400).optional().default(''),
          active: z.boolean().optional().default(true),
        })
      )
      .max(20)
      .optional(),
    footerAbout: z.string().trim().max(800).optional(),
    contactPhone: z.string().trim().max(40).optional(),
    contactEmail: z
      .string()
      .trim()
      .refine(v => !v || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), 'Please enter a valid support email address.')
      .optional(),
    dispatchLocation: z.string().trim().max(240).optional(),
    socialLinks: z
      .object({
        instagram: z.string().trim().max(300).refine(safeAssetOrWebUrl, 'Invalid Instagram URL').optional(),
        facebook: z.string().trim().max(300).refine(safeAssetOrWebUrl, 'Invalid Facebook URL').optional(),
        whatsapp: z.string().trim().max(40).optional(),
      })
      .optional(),
    shippingInfo: z.string().trim().max(1500).optional(),
    returnPolicy: z.string().trim().max(1500).optional(),
    privacyPolicy: z.string().trim().max(3000).optional(),
    termsAndConditions: z.string().trim().max(3000).optional(),
  });

  const businessSettingsSchema = z.object({
    businessName: z.string().trim().min(2, 'Registered business name is required').max(150).optional(),
    businessAddress: z.string().trim().max(400).optional(),
    gstin: z.string().trim().max(30).optional(),
    contactNumber: z.string().trim().max(40).optional(),
    businessEmail: z
      .string()
      .trim()
      .refine(v => !v || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), 'Please enter a valid billing email address.')
      .optional(),
    currency: z.string().trim().min(1).max(20).optional(),
    defaultGstRate: z.coerce.number().min(0, 'GST rate cannot be negative').max(28, 'GST rate cannot exceed 28%').optional(),
    invoicePrefix: z.string().trim().min(1).max(20).optional(),
    nextInvoiceNumber: z.coerce.number().int().min(1, 'Next invoice sequence must be at least 1').optional(),
    defaultShippingCharge: z.coerce.number().min(0, 'Shipping fee cannot be negative').optional(),
    freeShippingThreshold: z.coerce.number().min(0, 'Free shipping threshold cannot be negative').optional(),
    notificationPreferences: z
      .object({
        lowStockAlerts: z.boolean().optional(),
        newOrderAlerts: z.boolean().optional(),
        expiryAlerts: z.boolean().optional(),
        supplierPaymentAlerts: z.boolean().optional(),
      })
      .optional(),
  });

  // Website & Business Settings
  router.get('/settings/website', requirePermission('settings'), async (_req, res) => {
    res.json({ settings: await getWebsiteSettingsDoc(db) });
  });

  router.put('/settings/website', requirePermission('settings'), async (req, res) => {
    const parsed = websiteSettingsSchema.safeParse(req.body || {});
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid website settings payload.' });
      return;
    }

    const current = await getWebsiteSettingsDoc(db);
    const input = parsed.data;
    const merged = {
      ...DEFAULT_WEBSITE_SETTINGS,
      ...current,
      ...input,
      heroBanners: input.heroBanners ?? current.heroBanners,
      featuredProductIds: input.featuredProductIds ?? current.featuredProductIds,
      promotionalSections: input.promotionalSections
        ? input.promotionalSections.filter(s => s.title.length > 0 || s.subtitle.length > 0)
        : current.promotionalSections,
      socialLinks: {
        ...DEFAULT_WEBSITE_SETTINGS.socialLinks,
        ...current.socialLinks,
        ...(input.socialLinks || {}),
      },
    };
    const now = new Date().toISOString();

    await db.models.WebsiteSetting.updateOne(
      { id: 'singleton' },
      { $set: { data: merged, updatedAt: now } },
      { upsert: true }
    );
    await db.models.SiteSetting.updateOne(
      { key: 'website_settings' },
      { $set: { value: merged, updatedAt: now } },
      { upsert: true }
    );
    if (merged.logoUrl && merged.logoUrl !== BRAND_CONFIG.logoPath) {
      await db.models.SiteSetting.updateOne(
        { key: 'brand_logo_url' },
        { $set: { value: merged.logoUrl, updatedAt: now } },
        { upsert: true }
      );
    }

    invalidatePublicCache();
    await logAudit(db, {
      actorId: req.user!.id,
      actorEmail: req.user!.email,
      action: 'website_settings_updated',
      entityType: 'site_setting',
      entityId: 'website_settings',
      ipAddress: req.ip || '',
    });
    res.json({ message: 'Website settings saved.', settings: merged });
  });

  router.get('/settings/business', requirePermission('settings'), async (_req, res) => {
    res.json({ settings: await getBusinessSettingsDoc(db) });
  });

  router.put('/settings/business', requirePermission('settings'), async (req, res) => {
    const parsed = businessSettingsSchema.safeParse(req.body || {});
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid business settings payload.' });
      return;
    }

    const current = await getBusinessSettingsDoc(db);
    const input = parsed.data;
    const merged = {
      ...DEFAULT_BUSINESS_SETTINGS,
      ...current,
      ...input,
      gstin: input.gstin !== undefined ? input.gstin.toUpperCase() : current.gstin,
      notificationPreferences: {
        ...DEFAULT_BUSINESS_SETTINGS.notificationPreferences,
        ...current.notificationPreferences,
        ...(input.notificationPreferences || {}),
      },
    };
    const now = new Date().toISOString();

    await db.models.BusinessSetting.updateOne(
      { id: 'singleton' },
      { $set: { data: merged, updatedAt: now } },
      { upsert: true }
    );
    await db.models.SiteSetting.updateOne(
      { key: 'business_settings' },
      { $set: { value: merged, updatedAt: now } },
      { upsert: true }
    );

    invalidatePublicCache();
    await logAudit(db, {
      actorId: req.user!.id,
      actorEmail: req.user!.email,
      action: 'business_settings_updated',
      entityType: 'site_setting',
      entityId: 'business_settings',
      ipAddress: req.ip || '',
    });
    res.json({ message: 'Business settings saved.', settings: merged });
  });

  // Authenticated Admin proxy for Cloudinary-hosted PDFs/receipts/bills when public PDF delivery is ACL-restricted
  router.get('/media/proxy', async (req, res) => {
    const rawUrl = typeof req.query.url === 'string' ? req.query.url.trim() : '';
    const forceDownload = req.query.download === '1';
    if (!rawUrl) {
      res.status(400).json({ error: 'Media URL is required.' });
      return;
    }

    const allowed = mediaStorage.isAllowedMediaUrl
      ? mediaStorage.isAllowedMediaUrl(rawUrl)
      : rawUrl.startsWith('https://res.cloudinary.com/');

    if (!allowed) {
      res.status(403).json({ error: 'Invalid or unauthorized media URL.' });
      return;
    }

    try {
      const downloaded = mediaStorage.downloadAsset
        ? await mediaStorage.downloadAsset({ url: rawUrl })
        : await (async () => {
            const r = await fetch(rawUrl);
            if (!r.ok) throw new Error(`Unable to fetch media (HTTP ${r.status}).`);
            return {
              buffer: Buffer.from(await r.arrayBuffer()),
              contentType: r.headers.get('content-type') || 'application/octet-stream',
            };
          })();

      const pathname = new URL(rawUrl).pathname;
      const filename = decodeURIComponent(pathname.split('/').pop() || 'document.pdf').replace(/["\r\n]/g, '_');
      const isPdf = filename.toLowerCase().endsWith('.pdf') || downloaded.buffer.subarray(0, 5).toString('ascii') === '%PDF-';
      res.setHeader('Content-Type', isPdf ? 'application/pdf' : downloaded.contentType);
      res.setHeader('Content-Disposition', `${forceDownload ? 'attachment' : 'inline'}; filename="${filename}"`);
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Cache-Control', 'private, max-age=300');
      res.send(downloaded.buffer);
    } catch (err) {
      const sc = (err as { statusCode?: number }).statusCode || 502;
      res.status(sc).json({ error: err instanceof Error ? err.message : 'Unable to retrieve stored media.' });
    }
  });

  return router;
}
