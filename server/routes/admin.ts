import crypto from 'node:crypto';
import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { AppConfig } from '../config.ts';
import { MongoDatabase } from '../db/mongo.ts';
import { DEFAULT_EMAIL_TEMPLATES } from '../emails/defaultTemplates.ts';
import {
  createAdminNotification,
  createCustomerNotification,
  logAudit,
  requireAdmin,
  requireAuth,
  requirePermission,
} from '../middleware/security.ts';
import { MediaStorageService } from '../services/cloudinaryService.ts';
import { EmailTransport } from '../services/emailProvider.ts';
import { EmailQueueService } from '../services/emailQueue.ts';
import { CustomerRecord, EmailService, OrderEmailRecord, ShipmentRecord } from '../services/emailService.ts';
import {
  calculateLoyaltyPoints,
  reverseLoyaltyPoints,
  migrateHistoricalLoyaltyLedger,
} from '../services/loyaltyService.ts';
import { recoverStaleWebhookEvents } from './payments.ts';
import { reconcileFinancials } from '../services/financialReconciliation.ts';
import { isValidEmail, isValidHttpUrl, normalizeEmail, sanitizeEmailHtml } from '../utils/crypto.ts';
import { hydrateOrder } from './orders.ts';
import { parseProductRow } from './public.ts';

function makeImageUpload() {
  return multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 4 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
      if (['image/png', 'image/jpeg', 'image/webp'].includes(file.mimetype)) {
        cb(null, true);
      } else {
        cb(new Error('Only PNG, JPEG, and WEBP image uploads are allowed.'));
      }
    },
  });
}

const brandingUpload = makeImageUpload();
const bannerUpload = makeImageUpload();

const dispatchSchema = z.object({
  courierPartner: z.string().trim().min(2, 'Courier Partner is required').max(100),
  trackingNumber: z.string().trim().min(3, 'Tracking / AWB number is required').max(100),
  trackingUrl: z.string().trim().optional().default(''),
  dispatchDate: z.string().trim().min(4, 'Dispatch Date is required'),
  estimatedDeliveryDate: z.string().trim().optional().default(''),
  shipmentNotes: z.string().trim().max(500).optional().default(''),
  notifyCustomer: z.boolean().optional().default(true),
});

const refundSchema = z.object({
  verified: z.literal(true, {
    message: 'Refund must be verified with the payment provider before sending notification.',
  }),
  refundAmount: z.number().positive('Refund amount must be positive'),
  refundReferenceId: z.string().trim().min(3, 'Refund Reference ID is required').max(120),
  paymentMethod: z.string().trim().min(2).max(80),
  refundBankEta: z.string().trim().max(120).optional().default(''),
  idempotencyKey: z.string().trim().max(120).optional(),
});

const ALLOWED_SEGMENTS = [
  'all_opted_in',
  'recently_registered',
  'returning_customers',
  'vip_customers',
  'category_buyers',
  'lapsed_customers',
] as const;

export function createAdminRouter(
  db: MongoDatabase,
  _config: AppConfig,
  transport: EmailTransport,
  queue: EmailQueueService,
  emailService: EmailService,
  mediaStorage: MediaStorageService
) {
  const router = Router();
  router.use(requireAuth, requireAdmin);
  router.use('/overview', requirePermission('dashboard'));
  router.use('/orders', requirePermission('orders'));
  router.use('/communications', requirePermission('communications'));
  router.use('/marketing', requirePermission('marketing'));
  router.use('/products', (req, res, next) => {
    if (req.path === '/') {
      return requirePermission('products')(req, res, next);
    }
    return next();
  });

  // Authenticated Administrative Diagnostics (Internal / Operations Only)
  router.get('/system/diagnostics', requirePermission('dashboard'), async (_req, res) => {
    const memory = process.memoryUsage();
    const isDbConnected = db.conn.readyState === 1;
    res.json({
      status: isDbConnected ? 'operational' : 'degraded',
      nodeVersion: process.version,
      uptimeSeconds: Math.floor(process.uptime()),
      memoryUsage: {
        rssMb: Math.round(memory.rss / (1024 * 1024)),
        heapUsedMb: Math.round(memory.heapUsed / (1024 * 1024)),
        heapTotalMb: Math.round(memory.heapTotal / (1024 * 1024)),
      },
      database: {
        readyState: db.conn.readyState,
        modelsRegistered: Object.keys(db.models).length,
      },
      timestamp: new Date().toISOString(),
    });
  });

  async function querySegmentCustomers(segment: string, category?: string | null): Promise<CustomerRecord[]> {
    const suppressedDocs = await db.models.EmailSuppression.find({}, { email: 1, _id: 0 }).lean();
    const suppressedSet = new Set(suppressedDocs.map(s => normalizeEmail(s.email)));

    const optedInDocs = await db.models.Customer.find({
      role: 'customer',
      marketingConsent: true,
      unsubscribedAt: null,
    })
      .sort({ createdAt: -1 })
      .lean();

    const eligible = optedInDocs.filter(c => !suppressedSet.has(normalizeEmail(c.email)));
    if (segment === 'all_opted_in') {
      return eligible as unknown as CustomerRecord[];
    }

    if (segment === 'recently_registered') {
      const cutoff = new Date(Date.now() - 30 * 86400_000).toISOString();
      return eligible.filter(c => String(c.createdAt) >= cutoff) as unknown as CustomerRecord[];
    }

    const activeOrders = await db.models.Order.find(
      { status: { $ne: 'cancelled' } },
      { id: 1, customerId: 1, totalAmount: 1, createdAt: 1, _id: 0 }
    ).lean();

    if (segment === 'returning_customers') {
      const counts = new Map<string, number>();
      for (const o of activeOrders) counts.set(o.customerId, (counts.get(o.customerId) || 0) + 1);
      return eligible.filter(c => (counts.get(c.id) || 0) >= 2) as unknown as CustomerRecord[];
    }

    if (segment === 'vip_customers') {
      const stats = new Map<string, { count: number; spend: number }>();
      for (const o of activeOrders) {
        const prev = stats.get(o.customerId) || { count: 0, spend: 0 };
        prev.count += 1;
        prev.spend += Number(o.totalAmount || 0);
        stats.set(o.customerId, prev);
      }
      return eligible.filter(c => {
        const s = stats.get(c.id);
        return s ? s.spend >= 10000 || s.count >= 3 : false;
      }) as unknown as CustomerRecord[];
    }

    if (segment === 'category_buyers') {
      const cat = category || 'nuts';
      const matchingItems = await db.models.OrderItem.find(
        { category: cat },
        { orderId: 1, _id: 0 }
      ).lean();
      const orderIdSet = new Set(matchingItems.map(i => i.orderId));
      const custSet = new Set(
        activeOrders.filter(o => orderIdSet.has(o.id)).map(o => o.customerId)
      );
      return eligible.filter(c => custSet.has(c.id)) as unknown as CustomerRecord[];
    }

    if (segment === 'lapsed_customers') {
      const sixtyDaysAgo = new Date(Date.now() - 60 * 86400_000).toISOString();
      const thirtyDaysAgo = new Date(Date.now() - 30 * 86400_000).toISOString();
      const allOrders = await db.models.Order.find({}, { customerId: 1, createdAt: 1, _id: 0 }).lean();
      const lastOrderMap = new Map<string, string>();
      for (const o of allOrders) {
        const cur = lastOrderMap.get(o.customerId) || '';
        if (o.createdAt > cur) lastOrderMap.set(o.customerId, o.createdAt);
      }
      return eligible.filter(c => {
        if (String(c.createdAt) > thirtyDaysAgo) return false;
        const lastAt = lastOrderMap.get(c.id) || '';
        return lastAt < sixtyDaysAgo;
      }) as unknown as CustomerRecord[];
    }

    return eligible as unknown as CustomerRecord[];
  }

  // Overview
  router.get('/overview', async (_req, res) => {
    const [allOrders, customers, recentAudit, queueStats] = await Promise.all([
      db.models.Order.find({}, { status: 1, totalAmount: 1, _id: 0 }).lean(),
      db.models.Customer.find(
        { role: 'customer' },
        { emailVerified: 1, marketingConsent: 1, unsubscribedAt: 1, _id: 0 }
      ).lean(),
      db.models.AuditLog.find({}, { _id: 0 }).sort({ createdAt: -1 }).limit(15).lean(),
      queue.getQueueStats(),
    ]);

    const orderStats = {
      totalOrders: allOrders.length,
      pendingConfirm: allOrders.filter(o => o.status === 'placed' || o.status === 'pending').length,
      preparing: allOrders.filter(o => ['confirmed', 'processing', 'packed'].includes(o.status)).length,
      inTransit: allOrders.filter(o => ['dispatched', 'shipped', 'out_for_delivery'].includes(o.status)).length,
      delivered: allOrders.filter(o => o.status === 'delivered').length,
      totalRevenue: allOrders
        .filter(o => o.status !== 'cancelled')
        .reduce((s, o) => s + Number(o.totalAmount || 0), 0),
    };

    const customerStats = {
      totalCustomers: customers.length,
      verifiedCustomers: customers.filter(c => Boolean(c.emailVerified)).length,
      optedInCustomers: customers.filter(c => Boolean(c.marketingConsent) && !c.unsubscribedAt).length,
    };

    res.json({
      orderStats,
      customerStats,
      recentAudit,
      provider: transport.getSummary(),
      queue: queueStats,
    });
  });

  // Orders Management (supports optional page & limit pagination)
  router.get('/orders', async (req, res) => {
    const statusFilter = typeof req.query.status === 'string' ? req.query.status.trim() : '';
    const page = Math.max(1, Number(req.query.page || 1));
    const limit = req.query.limit ? Math.max(1, Math.min(100, Number(req.query.limit))) : 0;

    const filter: Record<string, unknown> = {};
    if (statusFilter && statusFilter !== 'all') {
      if (statusFilter === 'placed') {
        filter.status = { $in: ['placed', 'pending'] };
      } else if (statusFilter === 'dispatched') {
        filter.status = { $in: ['dispatched', 'shipped'] };
      } else {
        filter.status = statusFilter;
      }
    }

    const total = await db.models.Order.countDocuments(filter);
    let q = db.models.Order.find(filter, { _id: 0 }).sort({ createdAt: -1 });
    if (limit > 0) {
      q = q.skip((page - 1) * limit).limit(limit);
    }
    const rows = await q.lean();

    const ordersWithLogs = await Promise.all(
      rows.map(async r => {
        const [hydrated, emailLogs] = await Promise.all([
          hydrateOrder(db, r),
          db.models.EmailLog.find(
            { relatedOrderId: r.id },
            { id: 1, emailType: 1, recipient: 1, status: 1, providerMessageId: 1, previewUrl: 1, errorMessage: 1, sentAt: 1, createdAt: 1, _id: 0 }
          )
            .sort({ createdAt: -1 })
            .lean(),
        ]);
        return { ...hydrated, emailLogs };
      })
    );

    res.json({
      orders: ordersWithLogs,
      pagination: {
        page,
        limit: limit || total,
        total,
        totalPages: limit > 0 ? Math.max(1, Math.ceil(total / limit)) : 1,
      },
    });
  });

  router.get('/orders/:orderNumber', async (req, res) => {
    const row = await db.models.Order.findOne(
      { $or: [{ orderNumber: req.params.orderNumber }, { id: req.params.orderNumber }] },
      { _id: 0 }
    ).lean();
    if (!row) {
      res.status(404).json({ error: 'Order not found.' });
      return;
    }
    const [hydrated, emailLogs] = await Promise.all([
      hydrateOrder(db, row),
      db.models.EmailLog.find(
        { relatedOrderId: row.id },
        { id: 1, emailType: 1, recipient: 1, status: 1, providerMessageId: 1, previewUrl: 1, errorMessage: 1, sentAt: 1, createdAt: 1, _id: 0 }
      )
        .sort({ createdAt: -1 })
        .lean(),
    ]);

    res.json({ order: { ...hydrated, emailLogs } });
  });

  router.post('/orders/:orderNumber/confirm', async (req, res) => {
    const row = await db.models.Order.findOne({
      $or: [{ orderNumber: req.params.orderNumber }, { id: req.params.orderNumber }],
    }).lean();

    if (!row) {
      res.status(404).json({ error: 'Order not found.' });
      return;
    }
    if (row.status === 'cancelled' || row.status === 'delivered') {
      res.status(400).json({ error: `Cannot confirm an order in "${row.status}" state.` });
      return;
    }

    const now = new Date().toISOString();
    const notes =
      typeof req.body?.notes === 'string' && req.body.notes.trim()
        ? req.body.notes.trim()
        : 'Order confirmed by Jammu concierge';

    const updated = await db.models.Order.findOneAndUpdate(
      { id: row.id },
      {
        $set: {
          status: 'confirmed',
          confirmedAt: row.confirmedAt || now,
          updatedAt: now,
        },
      },
      { new: true }
    ).lean();

    await db.models.OrderStatusHistory.create({
      id: `osh_${crypto.randomUUID()}`,
      orderId: row.id,
      previousStatus: row.status,
      newStatus: 'confirmed',
      updatedBy: req.user!.name,
      notes,
      timestamp: now,
    });

    await createCustomerNotification(db, {
      customerId: row.customerId,
      type: 'order_confirmed',
      title: `Order #${row.orderNumber} Confirmed`,
      message: 'Great news! Your order has been confirmed and is being prepared in Jammu.',
      relatedOrderId: row.orderNumber,
    });

    await logAudit(db, {
      actorId: req.user!.id,
      actorEmail: req.user!.email,
      action: 'order_confirmed',
      entityType: 'order',
      entityId: row.orderNumber,
      details: { previousStatus: row.status, notes },
      ipAddress: req.ip || '',
    });

    const updatedObj = updated as unknown as OrderEmailRecord;
    let emailStatus: Record<string, unknown> = {};
    try {
      emailStatus = await emailService.sendOrderConfirmedEmail(updatedObj);
    } catch (err) {
      emailStatus = { error: err instanceof Error ? err.message : 'Queued for retry' };
    }

    res.json({
      message: 'Order confirmed and customer email queued.',
      order: await hydrateOrder(db, updatedObj),
      emailStatus,
    });
  });

  router.post('/orders/:orderNumber/status', async (req, res) => {
    const allowedStatuses = ['processing', 'packed', 'out_for_delivery', 'delivered', 'cancelled'] as const;
    const targetStatus = String(req.body?.status || '') as (typeof allowedStatuses)[number];
    const notes = typeof req.body?.notes === 'string' ? req.body.notes.trim() : '';

    if (!allowedStatuses.includes(targetStatus)) {
      res.status(400).json({ error: 'Invalid status transition. Use dispatch endpoint for dispatched status.' });
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
    const updateSet: Record<string, unknown> = {
      status: targetStatus,
      updatedAt: now,
    };

    if (targetStatus === 'delivered') {
      updateSet.deliveredAt = now;
      if (row.paymentStatus === 'pending' || row.paymentStatus === 'unpaid') {
        updateSet.paymentStatus = 'paid';
      }
    } else if (targetStatus === 'cancelled') {
      updateSet.cancelledAt = now;
      updateSet.cancellationReason = notes || 'Cancelled by administrator';
      if (row.paymentStatus === 'paid') {
        updateSet.refundStatus = 'refund_pending';
        updateSet.refundAmount = row.totalAmount;
      }
    }

    const updated = await db.models.Order.findOneAndUpdate(
      { id: row.id },
      { $set: updateSet },
      { returnDocument: 'after' }
    ).lean();

    if (targetStatus === 'cancelled' && row.status !== 'cancelled') {
      const items = await db.models.OrderItem.find({ orderId: row.id }).lean();
      for (const ci of items) {
        const restockWeight = Number((ci as any).stockQuantity ?? (ci as any).quantity ?? 1);
        await db.models.Product.findOneAndUpdate(
          { id: (ci as any).productId },
          { $inc: { stock: restockWeight }, $set: { inStock: true, updatedAt: now } },
          { returnDocument: 'after' }
        );
        if ((ci as any).variantId) {
          await db.models.ProductVariant.updateOne(
            { id: (ci as any).variantId },
            { $inc: { stock: (ci as any).quantity }, $set: { active: true, updatedAt: now } }
          );
        }
      }

      if (row.customerId) {
        const pointsToReverse = calculateLoyaltyPoints(row.totalAmount);
        if (pointsToReverse > 0) {
          await reverseLoyaltyPoints(db, {
            customerId: row.customerId,
            orderId: row.id,
            orderNumber: row.orderNumber,
            pointsToReverse,
            reason: notes || `Admin cancellation reversal for Order #${row.orderNumber}`,
            idempotencyKey: `reverse_cancel_${row.id}`,
          });
        }
      }
    }

    await db.models.OrderStatusHistory.create({
      id: `osh_${crypto.randomUUID()}`,
      orderId: row.id,
      previousStatus: row.status,
      newStatus: targetStatus,
      updatedBy: req.user!.name,
      notes: notes || `Order updated to ${targetStatus.replace(/_/g, ' ')}`,
      timestamp: now,
    });

    await createCustomerNotification(db, {
      customerId: row.customerId,
      type: `order_${targetStatus}`,
      title: `Order #${row.orderNumber} ${targetStatus.replace(/_/g, ' ')}`,
      message: notes || `Your order status is now ${targetStatus.replace(/_/g, ' ')}.`,
      relatedOrderId: row.orderNumber,
    });

    if (targetStatus === 'cancelled') {
      await createAdminNotification(db, {
        type: 'order_cancelled',
        title: `Order #${row.orderNumber} Cancelled`,
        message: `Cancelled by ${req.user!.name} (${notes || 'Administrator cancellation'}).`,
        severity: 'warning',
        entityType: 'order',
        entityId: row.orderNumber,
      });
    }

    await logAudit(db, {
      actorId: req.user!.id,
      actorEmail: req.user!.email,
      action: `order_status_${targetStatus}`,
      entityType: 'order',
      entityId: row.orderNumber,
      details: { previousStatus: row.status, newStatus: targetStatus, notes },
      ipAddress: req.ip || '',
    });

    const updatedObj = updated as unknown as OrderEmailRecord;
    const shipment = (await db.models.OrderShipment.findOne({ orderId: row.id }).lean()) as unknown as
      | ShipmentRecord
      | undefined;

    let emailStatus: Record<string, unknown> = { skipped: true };
    try {
      if (targetStatus === 'out_for_delivery') {
        emailStatus = await emailService.sendOutForDeliveryEmail(updatedObj, shipment || null);
      } else if (targetStatus === 'delivered') {
        emailStatus = await emailService.sendOrderDeliveredEmail(updatedObj);
      } else if (targetStatus === 'cancelled') {
        emailStatus = await emailService.sendOrderCancelledEmail(updatedObj);
      }
    } catch (err) {
      emailStatus = { error: err instanceof Error ? err.message : 'Queued for retry' };
    }

    res.json({
      message: `Order updated to ${targetStatus.replace(/_/g, ' ')}.`,
      order: await hydrateOrder(db, updatedObj),
      emailStatus,
    });
  });

  // Mark as Dispatched
  router.post('/orders/:orderNumber/dispatch', async (req, res) => {
    const parsed = dispatchSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid dispatch details' });
      return;
    }

    const { courierPartner, trackingNumber, trackingUrl, dispatchDate, estimatedDeliveryDate, shipmentNotes } =
      parsed.data;

    if (trackingUrl && !isValidHttpUrl(trackingUrl)) {
      res.status(400).json({ error: 'Tracking URL must be a valid http:// or https:// link.' });
      return;
    }
    const dispatchTs = Date.parse(dispatchDate);
    if (Number.isNaN(dispatchTs)) {
      res.status(400).json({ error: 'Please provide a valid Dispatch Date.' });
      return;
    }
    if (estimatedDeliveryDate) {
      const estTs = Date.parse(estimatedDeliveryDate);
      if (Number.isNaN(estTs) || estTs < dispatchTs) {
        res.status(400).json({ error: 'Estimated Delivery Date must be valid and on or after Dispatch Date.' });
        return;
      }
    }

    const row = await db.models.Order.findOne({
      $or: [{ orderNumber: req.params.orderNumber }, { id: req.params.orderNumber }],
    }).lean();

    if (!row) {
      res.status(404).json({ error: 'Order not found.' });
      return;
    }

    const now = new Date().toISOString();
    await db.models.OrderShipment.updateOne(
      { orderId: row.id },
      {
        $set: {
          courierPartner,
          trackingNumber,
          trackingUrl: trackingUrl || null,
          dispatchDate,
          estimatedDeliveryDate: estimatedDeliveryDate || null,
          shipmentNotes: shipmentNotes || null,
          updatedBy: req.user!.name,
          updatedAt: now,
        },
        $setOnInsert: {
          id: `ship_${crypto.randomUUID()}`,
          orderId: row.id,
          createdAt: now,
        },
      },
      { upsert: true }
    );

    const updated = await db.models.Order.findOneAndUpdate(
      { id: row.id },
      { $set: { status: 'dispatched', updatedAt: now } },
      { new: true }
    ).lean();

    await db.models.OrderStatusHistory.create({
      id: `osh_${crypto.randomUUID()}`,
      orderId: row.id,
      previousStatus: row.status,
      newStatus: 'dispatched',
      updatedBy: req.user!.name,
      notes: `Dispatched via ${courierPartner} (AWB: ${trackingNumber})`,
      timestamp: now,
    });

    await createCustomerNotification(db, {
      customerId: row.customerId,
      type: 'order_dispatched',
      title: `Order #${row.orderNumber} Dispatched`,
      message: `Shipped via ${courierPartner}. Tracking #: ${trackingNumber}`,
      relatedOrderId: row.orderNumber,
    });

    await logAudit(db, {
      actorId: req.user!.id,
      actorEmail: req.user!.email,
      action: 'order_dispatched',
      entityType: 'order',
      entityId: row.orderNumber,
      details: { courierPartner, trackingNumber, trackingUrl, dispatchDate, estimatedDeliveryDate },
      ipAddress: req.ip || '',
    });

    const updatedObj = updated as unknown as OrderEmailRecord;
    const shipment: ShipmentRecord = {
      courierPartner,
      trackingNumber,
      trackingUrl: trackingUrl || null,
      dispatchDate,
      estimatedDeliveryDate: estimatedDeliveryDate || null,
      shipmentNotes: shipmentNotes || null,
    };

    let emailResult: Record<string, unknown> = {};
    let emailDeliveryLog: Record<string, unknown> | null = null;
    try {
      emailResult = await emailService.sendOrderDispatchedEmail(updatedObj, shipment, false);
      if (typeof emailResult.logId === 'string') {
        emailDeliveryLog = (await db.models.EmailLog.findOne(
          { id: emailResult.logId },
          { id: 1, status: 1, providerMessageId: 1, previewUrl: 1, errorMessage: 1, sentAt: 1, _id: 0 }
        ).lean()) as Record<string, unknown> | null;
      }
    } catch (err) {
      emailResult = { error: err instanceof Error ? err.message : 'Queued for retry' };
    }

    res.json({
      message: 'Order marked as dispatched and shipment tracking saved.',
      order: await hydrateOrder(db, updatedObj),
      emailResult,
      emailDeliveryLog,
    });
  });

  // Correct courier details
  router.put('/orders/:orderNumber/shipment', async (req, res) => {
    const parsed = dispatchSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid courier details' });
      return;
    }

    const {
      courierPartner,
      trackingNumber,
      trackingUrl,
      dispatchDate,
      estimatedDeliveryDate,
      shipmentNotes,
      notifyCustomer,
    } = parsed.data;

    if (trackingUrl && !isValidHttpUrl(trackingUrl)) {
      res.status(400).json({ error: 'Tracking URL must be a valid http:// or https:// link.' });
      return;
    }
    if (estimatedDeliveryDate) {
      const dispatchTs = Date.parse(dispatchDate);
      const estTs = Date.parse(estimatedDeliveryDate);
      if (Number.isNaN(dispatchTs) || Number.isNaN(estTs) || estTs < dispatchTs) {
        res.status(400).json({ error: 'Estimated Delivery Date must be on or after Dispatch Date.' });
        return;
      }
    }

    const row = await db.models.Order.findOne({
      $or: [{ orderNumber: req.params.orderNumber }, { id: req.params.orderNumber }],
    }).lean();

    if (!row) {
      res.status(404).json({ error: 'Order not found.' });
      return;
    }

    const now = new Date().toISOString();
    const existing = await db.models.OrderShipment.findOne({ orderId: row.id }).lean();
    if (!existing) {
      res.status(400).json({ error: 'Order has not been dispatched yet.' });
      return;
    }

    await db.models.OrderShipment.updateOne(
      { orderId: row.id },
      {
        $set: {
          courierPartner,
          trackingNumber,
          trackingUrl: trackingUrl || null,
          dispatchDate,
          estimatedDeliveryDate: estimatedDeliveryDate || null,
          shipmentNotes: shipmentNotes || null,
          updatedBy: req.user!.name,
          updatedAt: now,
        },
      }
    );

    await db.models.OrderStatusHistory.create({
      id: `osh_${crypto.randomUUID()}`,
      orderId: row.id,
      previousStatus: row.status,
      newStatus: row.status,
      updatedBy: req.user!.name,
      notes: `Tracking details corrected: ${courierPartner} (${trackingNumber})`,
      timestamp: now,
    });

    await logAudit(db, {
      actorId: req.user!.id,
      actorEmail: req.user!.email,
      action: 'shipment_details_corrected',
      entityType: 'order',
      entityId: row.orderNumber,
      details: { courierPartner, trackingNumber, trackingUrl, notifyCustomer },
      ipAddress: req.ip || '',
    });

    let emailResult: Record<string, unknown> = { skipped: !notifyCustomer };
    if (notifyCustomer) {
      await createCustomerNotification(db, {
        customerId: row.customerId,
        type: 'tracking_updated',
        title: `Tracking Updated for #${row.orderNumber}`,
        message: `Updated courier details: ${courierPartner} — AWB ${trackingNumber}`,
        relatedOrderId: row.orderNumber,
      });

      try {
        emailResult = await emailService.sendOrderDispatchedEmail(
          row as unknown as OrderEmailRecord,
          {
            courierPartner,
            trackingNumber,
            trackingUrl: trackingUrl || null,
            dispatchDate,
            estimatedDeliveryDate: estimatedDeliveryDate || null,
            shipmentNotes: shipmentNotes || null,
          },
          true,
          Date.now()
        );
      } catch (err) {
        emailResult = { error: err instanceof Error ? err.message : 'Queued for retry' };
      }
    }

    const updated = await db.models.Order.findOne({ id: row.id }, { _id: 0 }).lean();
    res.json({
      message: 'Courier tracking details updated.',
      order: await hydrateOrder(db, updated as Record<string, unknown>),
      emailResult,
    });
  });

  // Verified Refund Processed (NEW-SEC-01: Financial Integrity, Cumulative Limit & Concurrency Protection)
  router.post('/orders/:orderNumber/refund', async (req, res) => {
    const parsed = refundSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid refund data' });
      return;
    }

    const { refundAmount, refundReferenceId, paymentMethod, refundBankEta } = parsed.data;
    const rawKey =
      req.get('idempotency-key') ||
      req.get('x-idempotency-key') ||
      (parsed.data.idempotencyKey ? String(parsed.data.idempotencyKey).trim() : null);

    // 1. Idempotency Check
    if (rawKey) {
      const existingRefundOp = await db.models.RefundOperation.findOne({ idempotencyKey: rawKey }).lean();
      if (existingRefundOp) {
        if ((existingRefundOp as any).status === 'processing') {
          res.status(409).json({ error: 'A refund operation with this idempotency key is currently processing.' });
          return;
        }
        if (
          (existingRefundOp as any).orderNumber !== req.params.orderNumber &&
          (existingRefundOp as any).orderId !== req.params.orderNumber
        ) {
          res.status(409).json({ error: 'Idempotency key reuse across different orders is forbidden.' });
          return;
        }
        if (Math.round(Number((existingRefundOp as any).amount) * 100) !== Math.round(Number(refundAmount) * 100)) {
          res.status(409).json({ error: 'Idempotency key reuse with different refund amount is forbidden.' });
          return;
        }
        if ((existingRefundOp as any).status === 'succeeded') {
          const currentOrder = await db.models.Order.findOne({
            $or: [{ orderNumber: req.params.orderNumber }, { id: req.params.orderNumber }],
          }).lean();
          res.status(200).json({
            message: 'Verified refund recorded and refund notification queued. (idempotent replay)',
            order: currentOrder ? await hydrateOrder(db, currentOrder as unknown as OrderEmailRecord) : null,
            refundOperation: existingRefundOp,
            idempotentReplay: true,
          });
          return;
        }
        if ((existingRefundOp as any).status === 'reconciliation_required') {
          res.status(409).json({
            error: 'Refund operation with this idempotency key requires manual reconciliation before retry.',
            code: 'REFUND_RECONCILIATION_REQUIRED',
            refundOperation: existingRefundOp,
          });
          return;
        }
      }
    }

    // 2. Order Lookup
    const row = await db.models.Order.findOne({
      $or: [{ orderNumber: req.params.orderNumber }, { id: req.params.orderNumber }],
    }).lean();

    if (!row) {
      res.status(404).json({ error: 'Order not found.' });
      return;
    }

    const totalAmountPaise = Math.round(Number(row.totalAmount || 0) * 100);
    const requestedPaise = Math.round(Number(refundAmount) * 100);

    // 3. Payment Status Check (Prevent refunding unpaid orders)
    if (['refunded'].includes(row.paymentStatus)) {
      res.status(400).json({
        error: `Order #${row.orderNumber} has already been fully refunded.`,
        code: 'REFUND_EXCEEDS_CAPTURED_AMOUNT',
        totalCaptured: Number((totalAmountPaise / 100).toFixed(2)),
        alreadyRefunded: Number((totalAmountPaise / 100).toFixed(2)),
        remainingRefundable: 0,
      });
      return;
    }

    const isCaptured =
      ['paid', 'partially_refunded'].includes(row.paymentStatus) ||
      row.status === 'delivered';

    if (!isCaptured) {
      res.status(400).json({
        error: `Cannot issue a refund for order #${row.orderNumber} with payment status '${row.paymentStatus}'. Only paid or partially refunded orders can be refunded.`,
        code: 'ORDER_NOT_PAID',
      });
      return;
    }

    // 4. Cumulative Refund Accounting in Integer Paise
    if (requestedPaise <= 0) {
      res.status(400).json({ error: 'Refund amount must be positive.' });
      return;
    }

    const priorRefundPayments = await db.models.Payment.find({
      orderNumber: row.orderNumber,
      paymentType: 'order_refund',
      status: 'completed',
    }).lean();
    const priorRefundedPaise = priorRefundPayments.reduce(
      (sum, p) => sum + Math.round(Number((p as any).amount || 0) * 100),
      0
    );

    const remainingRefundablePaise = Math.max(0, totalAmountPaise - priorRefundedPaise);
    if (requestedPaise > remainingRefundablePaise) {
      res.status(400).json({
        error: `Requested refund of ₹${refundAmount} exceeds remaining refundable amount of ₹${(remainingRefundablePaise / 100).toFixed(2)}.`,
        code: 'REFUND_EXCEEDS_CAPTURED_AMOUNT',
        totalCaptured: Number((totalAmountPaise / 100).toFixed(2)),
        alreadyRefunded: Number((priorRefundedPaise / 100).toFixed(2)),
        remainingRefundable: Number((remainingRefundablePaise / 100).toFixed(2)),
      });
      return;
    }

    const cumulativeRefundedPaise = priorRefundedPaise + requestedPaise;
    const cumulativeRefunded = Number((cumulativeRefundedPaise / 100).toFixed(2));
    const isFullRefund = cumulativeRefundedPaise >= totalAmountPaise;
    const nextPaymentStatus = isFullRefund ? 'refunded' : 'partially_refunded';
    const nextRefundStatus = isFullRefund ? 'refunded' : 'partially_refunded';

    const now = new Date().toISOString();
    const refundOpId = `refop_${crypto.randomUUID()}`;
    const idempotencyKey = rawKey || refundOpId;

    // 5. Create RefundOperation State Machine Record (processing)
    let refundOp: any;
    try {
      refundOp = await db.models.RefundOperation.create({
        id: refundOpId,
        orderId: row.id,
        orderNumber: row.orderNumber,
        customerId: row.customerId,
        idempotencyKey,
        amount: refundAmount,
        amountPaise: requestedPaise,
        currency: 'INR',
        status: 'processing',
        paymentMethod,
        refundReferenceId,
        refundBankEta: refundBankEta || null,
        reason: 'Verified refund issued by administrator',
        initiatedBy: req.user!.email,
        createdAt: now,
        updatedAt: now,
      });
    } catch (err: any) {
      if (err?.code === 11000) {
        res.status(409).json({ error: 'Concurrent refund operation with this idempotency key already initiated.' });
        return;
      }
      throw err;
    }

    // 6. Atomically Update Order with Conditional Reservation in a Single Aggregation Pipeline (Eliminates separate updateOne race window)
    const updated = await db.models.Order.findOneAndUpdate(
      {
        id: row.id,
        $or: [
          { paymentStatus: { $in: ['paid', 'partially_refunded'] } },
          { status: 'delivered' },
        ],
        $expr: {
          $lte: [
            { $add: [{ $ifNull: ['$refundedPaise', 0] }, requestedPaise] },
            totalAmountPaise,
          ],
        },
      },
      [
        {
          $set: {
            refundedPaise: { $add: [{ $ifNull: ['$refundedPaise', 0] }, requestedPaise] },
            refundMethod: paymentMethod,
            refundReferenceId,
            refundDate: now,
            refundBankEta: refundBankEta || null,
            paymentMethod,
            updatedAt: now,
          },
        },
        {
          $set: {
            refundAmount: { $round: [{ $divide: ['$refundedPaise', 100] }, 2] },
            paymentStatus: {
              $cond: [{ $gte: ['$refundedPaise', totalAmountPaise] }, 'refunded', 'partially_refunded'],
            },
            refundStatus: {
              $cond: [{ $gte: ['$refundedPaise', totalAmountPaise] }, 'refunded', 'partially_refunded'],
            },
          },
        },
      ] as any,
      { updatePipeline: true, returnDocument: 'after' } as any
    ).lean();

    if (!updated) {
      await db.models.RefundOperation.updateOne(
        { id: refundOpId },
        {
          $set: {
            status: 'failed',
            failureReason: 'Refund exceeds available balance due to concurrent contention',
            updatedAt: new Date().toISOString(),
          },
        }
      );
      res.status(400).json({
        error: `Requested refund of ₹${refundAmount} exceeds remaining refundable amount due to concurrent operations.`,
        code: 'REFUND_EXCEEDS_CAPTURED_AMOUNT',
      });
      return;
    }

    // Determine actual cumulative post-atomic state from the atomic pipeline result
    const confirmedCumulativePaise = Number(updated.refundedPaise || requestedPaise);
    const confirmedCumulativeRefunded = Number(updated.refundAmount ?? Number((confirmedCumulativePaise / 100).toFixed(2)));
    const confirmedFullRefund = confirmedCumulativePaise >= totalAmountPaise;
    const confirmedPaymentStatus = (updated.paymentStatus as any) || (confirmedFullRefund ? 'refunded' : 'partially_refunded');
    const confirmedRefundStatus = (updated.refundStatus as any) || (confirmedFullRefund ? 'refunded' : 'partially_refunded');

    const finalCumulativeRefunded = confirmedCumulativeRefunded;
    const finalIsFullRefund = confirmedFullRefund;

    try {
      // 7. Record Completed Refund Payment
      await db.models.Payment.create({
        id: `pay_${crypto.randomUUID()}`,
        paymentType: 'order_refund',
        referenceId: row.orderNumber,
        orderNumber: row.orderNumber,
        customerId: row.customerId,
        amount: refundAmount,
        method: paymentMethod,
        status: 'completed',
        transactionRef: refundReferenceId,
        notes: refundBankEta || 'Verified refund issued',
        recordedBy: req.user!.email,
        createdAt: now,
      });

      // 8. Update RefundOperation to 'succeeded'
      await db.models.RefundOperation.updateOne(
        { id: refundOpId },
        { $set: { status: 'succeeded', updatedAt: new Date().toISOString() } }
      );
    } catch (postResvErr: any) {
      const isAmbiguousTimeout =
        postResvErr?.name === 'TimeoutError' ||
        postResvErr?.message?.includes('timeout') ||
        postResvErr?.code === 'ETIMEDOUT';

      if (isAmbiguousTimeout) {
        await db.models.RefundOperation.updateOne(
          { id: refundOpId },
          {
            $set: {
              status: 'reconciliation_required',
              failureReason: `Ambiguous failure during post-reservation execution: ${postResvErr.message}`,
              updatedAt: new Date().toISOString(),
            },
          }
        );
        res.status(502).json({
          error: 'Refund reservation completed, but payment recording timed out. Marked for automated reconciliation.',
          code: 'REFUND_RECONCILIATION_REQUIRED',
          refundOpId,
        });
        return;
      }

      // Definitive failure -> compensate by releasing reserved paise in a single atomic pipeline update
      await db.models.Order.updateOne(
        { id: row.id },
        [
          {
            $set: {
              refundedPaise: {
                $max: [0, { $subtract: [{ $ifNull: ['$refundedPaise', 0] }, requestedPaise] }],
              },
              updatedAt: new Date().toISOString(),
            },
          },
          {
            $set: {
              refundAmount: { $round: [{ $divide: ['$refundedPaise', 100] }, 2] },
              paymentStatus: {
                $cond: [
                  { $gt: ['$refundedPaise', 0] },
                  { $cond: [{ $gte: ['$refundedPaise', totalAmountPaise] }, 'refunded', 'partially_refunded'] },
                  'paid',
                ],
              },
              refundStatus: {
                $cond: [
                  { $gt: ['$refundedPaise', 0] },
                  { $cond: [{ $gte: ['$refundedPaise', totalAmountPaise] }, 'refunded', 'partially_refunded'] },
                  'none',
                ],
              },
            },
          },
        ] as any,
        { updatePipeline: true } as any
      );

      await db.models.RefundOperation.updateOne(
        { id: refundOpId },
        {
          $set: {
            status: 'failed',
            failureReason: postResvErr.message || 'Post-reservation failure',
            updatedAt: new Date().toISOString(),
          },
        }
      );

      res.status(500).json({
        error: 'Refund operation failed downstream; capacity reservation safely released.',
        code: 'REFUND_EXECUTION_FAILED',
      });
      return;
    }

    // 9. Reverse Proportional Loyalty Points
    if (row.customerId) {
      const pointsToReverse = Math.floor(refundAmount / 100);
      if (pointsToReverse > 0) {
        await reverseLoyaltyPoints(db, {
          customerId: row.customerId,
          orderId: row.id,
          orderNumber: row.orderNumber,
          pointsToReverse,
          reason: `Proportional loyalty reversal for refund of ₹${refundAmount} on Order #${row.orderNumber}`,
          idempotencyKey: `reverse_refund_${refundOpId}`,
          relatedTransactionId: refundOpId,
        });
      }
    }

    // 10. Audit & Notifications
    await db.models.OrderStatusHistory.create({
      id: `osh_${crypto.randomUUID()}`,
      orderId: row.id,
      previousStatus: row.status,
      newStatus: row.status,
      updatedBy: req.user!.name,
      notes: `Verified ${finalIsFullRefund ? 'full' : 'partial'} refund processed: ₹${refundAmount} (Cumulative: ₹${finalCumulativeRefunded}, Ref: ${refundReferenceId})`,
      timestamp: now,
    });

    await createCustomerNotification(db, {
      customerId: row.customerId,
      type: 'refund_processed',
      title: `Refund Processed for #${row.orderNumber}`,
      message: `₹${refundAmount} refunded (Ref: ${refundReferenceId}).`,
      relatedOrderId: row.orderNumber,
    });

    await logAudit(db, {
      actorId: req.user!.id,
      actorEmail: req.user!.email,
      action: 'refund_processed',
      entityType: 'order',
      entityId: row.orderNumber,
      details: {
        refundAmount,
        refundReferenceId,
        paymentMethod,
        refundBankEta,
        isFullRefund: finalIsFullRefund,
        cumulativeRefunded: finalCumulativeRefunded,
        refundOpId,
      },
      ipAddress: req.ip || '',
    });

    const updatedObj = updated as unknown as OrderEmailRecord;
    let emailResult: Record<string, unknown> = {};
    try {
      emailResult = await emailService.sendRefundProcessedEmail(updatedObj);
    } catch (err) {
      emailResult = { error: err instanceof Error ? err.message : 'Queued for retry' };
    }

    res.json({
      message: 'Verified refund recorded and refund notification queued.',
      order: await hydrateOrder(db, updatedObj),
      refundOperation: refundOp,
      cumulativeRefunded: finalCumulativeRefunded,
      isFullRefund: finalIsFullRefund,
      emailResult,
    });
  });

  // Automated Financial & Loyalty Ledger Reconciliation Audit
  router.post('/financials/reconcile', async (req, res) => {
    try {
      const dryRun = req.body?.dryRun !== false;
      const stalledThresholdMs = typeof req.body?.stalledThresholdMs === 'number' ? req.body.stalledThresholdMs : undefined;
      const report = await reconcileFinancials(db, { dryRun, stalledThresholdMs });

      await logAudit(db, {
        actorId: req.user!.id,
        actorEmail: req.user!.email,
        action: 'financials_reconcile',
        entityType: 'financials',
        entityId: 'reconciliation_audit',
        details: { dryRun, healthy: report.healthy, totalOrdersAudited: report.totalOrdersAudited },
        ipAddress: req.ip || '',
      });

      res.json(report);
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Financial reconciliation failed.' });
    }
  });

  // Historical Loyalty Ledger Opening Balance Migration
  router.post('/financials/loyalty-migration', async (req, res) => {
    try {
      const dryRun = req.body?.dryRun !== false;
      const report = await migrateHistoricalLoyaltyLedger(db, { dryRun });

      await logAudit(db, {
        actorId: req.user!.id,
        actorEmail: req.user!.email,
        action: 'loyalty_migration',
        entityType: 'financials',
        entityId: 'loyalty_migration_audit',
        details: { dryRun, totalAudited: report.totalCustomersAudited, migratedCount: report.migratedCount },
        ipAddress: req.ip || '',
      });

      res.json(report);
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Loyalty migration failed.' });
    }
  });

  // Stale Webhook Processing Lease Recovery
  router.post('/payments/webhooks/recover', async (req, res) => {
    try {
      const maxAgeMs = typeof req.body?.maxAgeMs === 'number' ? req.body.maxAgeMs : undefined;
      const maxRetries = typeof req.body?.maxRetries === 'number' ? req.body.maxRetries : undefined;
      const report = await recoverStaleWebhookEvents(db, { maxAgeMs, maxRetries });

      await logAudit(db, {
        actorId: req.user!.id,
        actorEmail: req.user!.email,
        action: 'webhooks_recover',
        entityType: 'payments',
        entityId: 'webhook_recovery_job',
        details: { scanned: report.scanned, recovered: report.recovered, exhausted: report.exhausted },
        ipAddress: req.ip || '',
      });

      res.json(report);
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Webhook recovery failed.' });
    }
  });

  // =============================================
  // COMMUNICATIONS MANAGEMENT
  // =============================================
  router.get('/communications/stats', async (_req, res) => {
    const [logs, trackingRow, logoRow, queueStats] = await Promise.all([
      db.models.EmailLog.find({}, { status: 1, opensCount: 1, clicksCount: 1, _id: 0 }).lean(),
      db.models.SiteSetting.findOne({ key: 'tracking_enabled' }).lean(),
      db.models.SiteSetting.findOne({ key: 'brand_logo_url' }).lean(),
      queue.getQueueStats(),
    ]);

    const total = logs.length;
    const sentOrDelivered = logs.filter(l => l.status === 'sent' || l.status === 'delivered').length;
    const delivered = logs.filter(l => l.status === 'delivered').length;
    const failed = logs.filter(l => ['failed', 'bounced', 'complained'].includes(l.status)).length;
    const pending = logs.filter(l => l.status === 'queued').length;
    const suppressed = logs.filter(l => l.status === 'suppressed').length;
    const uniqueOpens = logs.filter(l => Number(l.opensCount || 0) > 0).length;
    const uniqueClicks = logs.filter(l => Number(l.clicksCount || 0) > 0).length;

    const trackingEnabled = Boolean(trackingRow?.value);
    const brandLogoUrl = typeof logoRow?.value === 'string' ? logoRow.value : '/assets/seth_and_sons_logo.jpg';

    res.json({
      metrics: {
        totalSent: total,
        delivered: delivered || sentOrDelivered,
        confirmedProviderDelivered: delivered,
        failed,
        pending,
        suppressed,
        trackingEnabled,
        openRate: trackingEnabled && sentOrDelivered > 0 ? Math.round((uniqueOpens / sentOrDelivered) * 1000) / 10 : null,
        clickRate: trackingEnabled && sentOrDelivered > 0 ? Math.round((uniqueClicks / sentOrDelivered) * 1000) / 10 : null,
      },
      brandLogoUrl,
      provider: transport.getSummary(),
      queue: queueStats,
    });
  });

  router.get('/communications/templates', async (_req, res) => {
    const rows = await db.models.EmailTemplate.find({}, { _id: 0 })
      .sort({ category: 1, templateName: 1 })
      .lean();
    res.json({
      templates: rows.map(r => ({
        ...r,
        enabled: Boolean(r.enabled),
        variables: Array.isArray(r.variables) ? r.variables : [],
      })),
    });
  });

  router.put('/communications/templates/:key', async (req, res) => {
    const existing = await db.models.EmailTemplate.findOne({ templateKey: req.params.key }).lean();
    if (!existing) {
      res.status(404).json({ error: 'Email template not found.' });
      return;
    }

    const subject =
      typeof req.body?.subject === 'string' && req.body.subject.trim()
        ? req.body.subject.replace(/[\r\n]+/g, ' ').trim()
        : String(existing.subject);
    const htmlContent =
      typeof req.body?.htmlContent === 'string'
        ? sanitizeEmailHtml(req.body.htmlContent)
        : String(existing.htmlContent);
    const textContent =
      typeof req.body?.textContent === 'string' ? req.body.textContent : String(existing.textContent);
    const enabled = req.body?.enabled !== undefined ? Boolean(req.body.enabled) : Boolean(existing.enabled);

    const now = new Date().toISOString();
    const updated = await db.models.EmailTemplate.findOneAndUpdate(
      { templateKey: req.params.key },
      { $set: { subject, htmlContent, textContent, enabled, updatedAt: now, updatedBy: req.user!.email } },
      { new: true }
    ).lean();

    await logAudit(db, {
      actorId: req.user!.id,
      actorEmail: req.user!.email,
      action: 'email_template_updated',
      entityType: 'email_template',
      entityId: req.params.key,
      details: { subject, enabled },
      ipAddress: req.ip || '',
    });

    res.json({
      message: 'Template saved.',
      template: { ...updated, enabled: Boolean(updated?.enabled) },
    });
  });

  router.post('/communications/templates/:key/restore', async (req, res) => {
    const def = DEFAULT_EMAIL_TEMPLATES.find(t => t.templateKey === req.params.key);
    if (!def) {
      res.status(404).json({ error: 'Default template not found.' });
      return;
    }

    const now = new Date().toISOString();
    const updated = await db.models.EmailTemplate.findOneAndUpdate(
      { templateKey: req.params.key },
      {
        $set: {
          subject: def.subject,
          htmlContent: def.htmlContent,
          textContent: def.textContent,
          variables: def.variables,
          enabled: true,
          updatedAt: now,
          updatedBy: req.user!.email,
        },
      },
      { new: true }
    ).lean();

    await logAudit(db, {
      actorId: req.user!.id,
      actorEmail: req.user!.email,
      action: 'email_template_restored',
      entityType: 'email_template',
      entityId: req.params.key,
      ipAddress: req.ip || '',
    });

    res.json({
      message: 'Default template restored.',
      template: { ...updated, enabled: Boolean(updated?.enabled) },
    });
  });

  router.post('/communications/templates/:key/preview', async (req, res) => {
    try {
      const preview = await emailService.previewTemplate(
        req.params.key,
        typeof req.body?.subject === 'string' ? req.body.subject : undefined,
        typeof req.body?.htmlContent === 'string' ? req.body.htmlContent : undefined,
        typeof req.body?.textContent === 'string' ? req.body.textContent : undefined
      );
      res.json(preview);
    } catch (err) {
      res.status(404).json({ error: err instanceof Error ? err.message : 'Template not found' });
    }
  });

  router.post('/communications/templates/:key/test', async (req, res) => {
    const recipient = typeof req.body?.recipient === 'string' ? req.body.recipient.trim() : req.user!.email;
    if (!recipient || !isValidEmail(recipient)) {
      res.status(400).json({ error: 'Please provide a valid recipient email address for testing.' });
      return;
    }

    const log = await emailService.sendTestTemplateEmail(req.params.key, recipient);
    await logAudit(db, {
      actorId: req.user!.id,
      actorEmail: req.user!.email,
      action: 'email_template_test_sent',
      entityType: 'email_template',
      entityId: req.params.key,
      details: { recipient },
      ipAddress: req.ip || '',
    });

    res.json({ message: `Test email processed for ${recipient}.`, log });
  });

  router.post('/communications/logo', brandingUpload.single('logo'), async (req, res) => {
    if (!req.file) {
      res.status(400).json({ error: 'Please upload a valid logo image (PNG, JPG, WEBP).' });
      return;
    }
    try {
      const uploaded = await mediaStorage.uploadBuffer({
        buffer: req.file.buffer,
        filename: req.file.originalname,
        folder: 'branding',
        mimeType: req.file.mimetype,
        resourceType: 'image',
      });
      const logoUrl = uploaded.url;
      const now = new Date().toISOString();

      await db.models.SiteSetting.updateOne(
        { key: 'brand_logo_url' },
        { $set: { value: logoUrl, updatedAt: now } },
        { upsert: true }
      );

      await logAudit(db, {
        actorId: req.user!.id,
        actorEmail: req.user!.email,
        action: 'email_brand_logo_updated',
        entityType: 'site_setting',
        entityId: 'brand_logo_url',
        details: { logoUrl },
        ipAddress: req.ip || '',
      });

      res.json({ message: 'Email brand logo uploaded to Cloudinary.', brandLogoUrl: logoUrl });
    } catch (err) {
      const status = (err as { statusCode?: number }).statusCode || 500;
      res.status(status).json({ error: err instanceof Error ? err.message : 'Cloudinary logo upload failed.' });
    }
  });

  router.put('/communications/settings', async (req, res) => {
    const trackingEnabled = Boolean(req.body?.trackingEnabled);
    const now = new Date().toISOString();
    await db.models.SiteSetting.updateOne(
      { key: 'tracking_enabled' },
      { $set: { value: trackingEnabled, updatedAt: now } },
      { upsert: true }
    );

    await logAudit(db, {
      actorId: req.user!.id,
      actorEmail: req.user!.email,
      action: 'email_tracking_setting_updated',
      entityType: 'site_setting',
      entityId: 'tracking_enabled',
      details: { trackingEnabled },
      ipAddress: req.ip || '',
    });

    res.json({ trackingEnabled });
  });

  router.get('/communications/logs', async (req, res) => {
    const status = typeof req.query.status === 'string' ? req.query.status.trim() : '';
    const filter = status && status !== 'all' ? { status } : {};
    const logDocs = await db.models.EmailLog.find(filter, { _id: 0 })
      .sort({ createdAt: -1 })
      .limit(100)
      .lean();

    const logIds = logDocs.map(l => l.id);
    const jobs = await db.models.EmailJob.find(
      { emailLogId: { $in: logIds } },
      { id: 1, status: 1, emailLogId: 1, _id: 0 }
    ).lean();
    const jobMap = new Map(jobs.map(j => [j.emailLogId, j]));

    res.json({
      logs: logDocs.map(l => {
        const job = jobMap.get(l.id);
        return { ...l, jobId: job?.id || null, jobStatus: job?.status || null };
      }),
    });
  });

  router.post('/communications/jobs/:id/retry', async (req, res) => {
    const ok = await queue.retryJob(req.params.id);
    if (!ok) {
      res.status(404).json({ error: 'Email job not found.' });
      return;
    }
    res.json({ message: 'Email job re-queued for delivery.' });
  });

  router.get('/communications/suppressions', async (_req, res) => {
    const rows = await db.models.EmailSuppression.find({}, { _id: 0 })
      .sort({ suppressedAt: -1 })
      .lean();
    res.json({ suppressions: rows });
  });

  router.delete('/communications/suppressions/:email', async (req, res) => {
    const clean = normalizeEmail(req.params.email);
    await db.models.EmailSuppression.deleteOne({ email: clean });
    res.json({ message: `Removed ${clean} from suppression list.` });
  });

  // =============================================
  // PRODUCTS & MARKETING CAMPAIGNS
  // =============================================
  router.get('/products', async (_req, res) => {
    const rows = await db.models.Product.find({}, { _id: 0 }).sort({ createdAt: -1 }).lean();
    res.json({ products: rows.map(r => parseProductRow(r)) });
  });

  router.post('/products', async (req, res) => {
    const body = req.body || {};
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    const price = Number(body.price);
    const unit =
      body.unit === 'gram' ? 'gram' : body.unit === 'ml' ? 'ml' : body.unit === 'piece' ? 'piece' : 'kg';
    const category = ['nuts', 'saffron', 'dried-fruits'].includes(body.category) ? body.category : 'nuts';
    const description = typeof body.description === 'string' ? body.description.trim() : '';
    const image =
      typeof body.image === 'string' && body.image.trim()
        ? body.image.trim()
        : '/assets/aistudio/00c7c9248fdf2e9e3c775c5368483218_ceac05b8.jpg';
    const variants = Array.isArray(body.variants)
      ? body.variants.map(String)
      : typeof body.variants === 'string'
      ? body.variants.split(',').map((s: string) => s.trim()).filter(Boolean)
      : ['500g Pack', '1kg Reserve'];
    const features = Array.isArray(body.features)
      ? body.features.map(String)
      : typeof body.features === 'string'
      ? body.features.split(',').map((s: string) => s.trim()).filter(Boolean)
      : ['Direct Jammu Provenance', 'Zero Preservatives'];

    const publishAction: 'draft' | 'publish_only' | 'publish_and_send' | 'publish_and_schedule' =
      ['draft', 'publish_only', 'publish_and_send', 'publish_and_schedule'].includes(body.publishAction)
        ? body.publishAction
        : 'publish_only';

    if (name.length < 2 || !Number.isFinite(price) || price <= 0 || description.length < 5) {
      res.status(400).json({ error: 'Product name, positive price, and description are required.' });
      return;
    }

    if (publishAction === 'publish_and_send' && body.confirmCampaignSend !== true) {
      res.status(400).json({
        error: 'Explicit campaign confirmation (confirmCampaignSend: true) is required before sending bulk product launch emails.',
      });
      return;
    }

    if (publishAction === 'publish_and_schedule' && !body.scheduledAt) {
      res.status(400).json({ error: 'Scheduled date/time is required when scheduling a product launch campaign.' });
      return;
    }

    const slug = `${name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}-${crypto.randomInt(100, 999)}`;
    const now = new Date().toISOString();
    const status = publishAction === 'draft' ? 'draft' : 'published';

    const createdDoc = await db.models.Product.create({
      id: slug,
      name,
      hindiName: typeof body.hindiName === 'string' ? body.hindiName.trim() : null,
      subtitle: typeof body.subtitle === 'string' && body.subtitle.trim() ? body.subtitle.trim() : 'Jammu Heritage Reserve',
      price,
      unit,
      step: unit === 'gram' || unit === 'piece' ? 1 : unit === 'ml' ? 100 : 0.5,
      minQty: unit === 'gram' || unit === 'piece' ? 1 : unit === 'ml' ? 100 : 0.5,
      category,
      image,
      images: [image],
      gallery: [image],
      description,
      origin: typeof body.origin === 'string' && body.origin.trim() ? body.origin.trim() : 'Jammu & Kashmir Orchards',
      grade: typeof body.grade === 'string' && body.grade.trim() ? body.grade.trim() : 'Royal Grade A++',
      features,
      variants,
      tasteProfile:
        typeof body.tasteProfile === 'string' && body.tasteProfile.trim()
          ? body.tasteProfile.trim()
          : 'Rich artisanal flavor',
      jammuStory:
        typeof body.jammuStory === 'string' && body.jammuStory.trim()
          ? body.jammuStory.trim()
          : 'Curated directly by Seth And Sons DryFruits in Jammu.',
      inStock: true,
      harvestSeason:
        typeof body.harvestSeason === 'string' && body.harvestSeason.trim()
          ? body.harvestSeason.trim()
          : 'Fresh Harvest',
      nutrition: {
        calories: '560 kcal / 100g',
        protein: '16g Plant Protein',
        keyNutrient: 'Natural Antioxidants & Essential Fats',
        minerals: 'Magnesium, Vitamin E & Potassium',
        healthPillars: features.slice(0, 3).map((f: string) => ({ title: f, desc: 'Verified Jammu purity.' })),
      },
      status,
      createdAt: now,
      updatedAt: now,
    });

    await logAudit(db, {
      actorId: req.user!.id,
      actorEmail: req.user!.email,
      action: 'product_created',
      entityType: 'product',
      entityId: slug,
      details: { name, publishAction, status },
      ipAddress: req.ip || '',
    });

    let campaignResult: Record<string, unknown> | null = null;
    if (publishAction === 'publish_and_send' || publishAction === 'publish_and_schedule') {
      const targetSegment = ALLOWED_SEGMENTS.includes(body.targetSegment)
        ? body.targetSegment
        : 'all_opted_in';
      const recipients = await querySegmentCustomers(targetSegment, body.segmentCategory);
      const campaignId = `camp_${crypto.randomUUID()}`;
      const isScheduled = publishAction === 'publish_and_schedule';

      await db.models.MarketingCampaign.create({
        id: campaignId,
        campaignName: `New Arrival: ${name}`,
        campaignType: 'new_product',
        productId: slug,
        subject: `New Arrival from Jammu: ${name} – Seth And Sons DryFruits`,
        content: description,
        bannerImage: image,
        ctaText: 'Shop Now',
        ctaUrl: `/catalog?highlight=${slug}`,
        targetSegment,
        segmentCategory: body.segmentCategory || null,
        scheduledAt: isScheduled ? body.scheduledAt : null,
        sentAt: isScheduled ? null : now,
        status: isScheduled ? 'scheduled' : recipients.length > 0 ? 'sending' : 'sent',
        totalRecipients: recipients.length,
        createdBy: req.user!.email,
        createdAt: now,
        updatedAt: now,
      });

      for (const customer of recipients) {
        await emailService.sendNewProductEmail(
          { id: slug, name, image, description, price, unit, variants, features },
          customer,
          campaignId,
          isScheduled ? body.scheduledAt : undefined
        );
      }
      campaignResult = {
        campaignId,
        status: isScheduled ? 'scheduled' : 'sending',
        recipientCount: recipients.length,
      };
    }

    res.status(201).json({
      message:
        publishAction === 'draft'
          ? 'Product saved as draft.'
          : publishAction === 'publish_only'
          ? 'Product published (no marketing emails triggered).'
          : 'Product published and launch campaign queued.',
      product: parseProductRow(createdDoc.toObject()),
      campaign: campaignResult,
    });
  });

  // Segmentation overview
  router.get('/marketing/segments', async (req, res) => {
    const category = typeof req.query.category === 'string' ? req.query.category : 'nuts';
    const [allIn, recent, returning, vip, catBuyers, lapsed] = await Promise.all([
      querySegmentCustomers('all_opted_in'),
      querySegmentCustomers('recently_registered'),
      querySegmentCustomers('returning_customers'),
      querySegmentCustomers('vip_customers'),
      querySegmentCustomers('category_buyers', category),
      querySegmentCustomers('lapsed_customers'),
    ]);
    const segments = [
      { id: 'all_opted_in', label: 'All Opted-In Customers', count: allIn.length },
      { id: 'recently_registered', label: 'Recently Registered (30 Days)', count: recent.length },
      { id: 'returning_customers', label: 'Returning Customers (2+ Orders)', count: returning.length },
      { id: 'vip_customers', label: 'VIP Customers (₹10,000+ or 3+ Orders)', count: vip.length },
      { id: 'category_buyers', label: `Purchased Category (${category})`, count: catBuyers.length },
      { id: 'lapsed_customers', label: 'Have Not Purchased Recently (60+ Days)', count: lapsed.length },
    ];
    res.json({ segments });
  });

  router.post('/marketing/upload-banner', bannerUpload.single('banner'), async (req, res) => {
    if (!req.file) {
      res.status(400).json({ error: 'Please upload a valid banner image (PNG, JPG, WEBP).' });
      return;
    }
    try {
      const uploaded = await mediaStorage.uploadBuffer({
        buffer: req.file.buffer,
        filename: req.file.originalname,
        folder: 'banners',
        mimeType: req.file.mimetype,
        resourceType: 'image',
      });
      res.json({ bannerImage: uploaded.url, publicId: uploaded.publicId });
    } catch (err) {
      const status = (err as { statusCode?: number }).statusCode || 500;
      res.status(status).json({ error: err instanceof Error ? err.message : 'Cloudinary banner upload failed.' });
    }
  });

  router.get('/marketing/campaigns', async (_req, res) => {
    const rows = await db.models.MarketingCampaign.find({}, { _id: 0 })
      .sort({ createdAt: -1 })
      .lean();
    res.json({
      campaigns: rows.map(r => ({
        ...r,
        applicableProducts: Array.isArray(r.applicableProducts) ? r.applicableProducts : [],
      })),
    });
  });

  router.post('/marketing/campaigns', async (req, res) => {
    const b = req.body || {};
    const campaignName = typeof b.campaignName === 'string' ? b.campaignName.trim() : '';
    const campaignType = ['new_product', 'festival', 'promotional'].includes(b.campaignType)
      ? b.campaignType
      : 'festival';
    const subject = typeof b.subject === 'string' ? b.subject.trim() : '';
    const content = typeof b.content === 'string' ? sanitizeEmailHtml(b.content) : '';
    if (!campaignName || !subject || !content) {
      res.status(400).json({ error: 'Campaign Name, Subject, and Content are required.' });
      return;
    }

    const id = `camp_${crypto.randomUUID()}`;
    const now = new Date().toISOString();
    const applicableProducts = Array.isArray(b.applicableProducts) ? b.applicableProducts.map(String) : [];
    const couponCode =
      typeof b.couponCode === 'string' && b.couponCode.trim() ? b.couponCode.trim().toUpperCase() : null;
    const discountPercentage = b.discountPercentage ? Number(b.discountPercentage) : null;

    const created = await db.models.MarketingCampaign.create({
      id,
      campaignName,
      campaignType,
      festivalName: b.festivalName || null,
      productId: b.productId || null,
      subject,
      content,
      bannerImage: b.bannerImage || null,
      discountPercentage,
      couponCode,
      startDate: b.startDate || null,
      endDate: b.endDate || null,
      applicableProducts,
      minOrderValue: Number(b.minOrderValue || 0),
      maxDiscount: b.maxDiscount ? Number(b.maxDiscount) : null,
      ctaText: b.ctaText || 'Shop Royal Harvests',
      ctaUrl: b.ctaUrl || '/catalog',
      targetSegment: ALLOWED_SEGMENTS.includes(b.targetSegment) ? b.targetSegment : 'all_opted_in',
      segmentCategory: b.segmentCategory || null,
      status: 'draft',
      createdBy: req.user!.email,
      createdAt: now,
      updatedAt: now,
    });

    if (couponCode && discountPercentage && discountPercentage > 0) {
      await db.models.Coupon.updateOne(
        { code: couponCode },
        {
          $set: {
            title: campaignName,
            description: `${b.festivalName ? `${b.festivalName} Special: ` : ''}${discountPercentage}% off`,
            discountType: 'percentage',
            discountValue: discountPercentage,
            minOrderValue: Number(b.minOrderValue || 0),
            maxDiscount: b.maxDiscount ? Number(b.maxDiscount) : null,
            startDate: b.startDate || null,
            endDate: b.endDate || null,
            applicableProducts,
            active: true,
          },
          $setOnInsert: {
            id: `cpn_${crypto.randomUUID()}`,
            code: couponCode,
            createdAt: now,
          },
        },
        { upsert: true }
      );
    }

    await logAudit(db, {
      actorId: req.user!.id,
      actorEmail: req.user!.email,
      action: 'campaign_created',
      entityType: 'marketing_campaign',
      entityId: id,
      details: { campaignName, campaignType, couponCode },
      ipAddress: req.ip || '',
    });

    res.status(201).json({ campaign: created.toObject() });
  });

  router.put('/marketing/campaigns/:id', async (req, res) => {
    const existing = await db.models.MarketingCampaign.findOne({ id: req.params.id }).lean();
    if (!existing) {
      res.status(404).json({ error: 'Campaign not found.' });
      return;
    }
    if (existing.status === 'sent' || existing.status === 'sending') {
      res.status(400).json({ error: 'Cannot edit a campaign that is already sending or sent.' });
      return;
    }

    const b = req.body || {};
    const now = new Date().toISOString();
    const updated = await db.models.MarketingCampaign.findOneAndUpdate(
      { id: req.params.id },
      {
        $set: {
          campaignName: b.campaignName || existing.campaignName,
          festivalName: b.festivalName || null,
          subject: b.subject || existing.subject,
          content: b.content ? sanitizeEmailHtml(b.content) : existing.content,
          bannerImage: b.bannerImage || null,
          discountPercentage: b.discountPercentage ? Number(b.discountPercentage) : null,
          couponCode: b.couponCode ? String(b.couponCode).trim().toUpperCase() : null,
          startDate: b.startDate || null,
          endDate: b.endDate || null,
          applicableProducts: Array.isArray(b.applicableProducts) ? b.applicableProducts : [],
          minOrderValue: Number(b.minOrderValue || 0),
          maxDiscount: b.maxDiscount ? Number(b.maxDiscount) : null,
          ctaText: b.ctaText || existing.ctaText,
          ctaUrl: b.ctaUrl || existing.ctaUrl,
          targetSegment: b.targetSegment || existing.targetSegment,
          segmentCategory: b.segmentCategory || null,
          updatedAt: now,
        },
      },
      { new: true }
    ).lean();

    res.json({ campaign: updated });
  });

  router.post('/marketing/campaigns/:id/test', async (req, res) => {
    const camp = await db.models.MarketingCampaign.findOne({ id: req.params.id }).lean();
    if (!camp) {
      res.status(404).json({ error: 'Campaign not found.' });
      return;
    }

    const recipient = typeof req.body?.recipient === 'string' ? req.body.recipient.trim() : req.user!.email;
    if (!isValidEmail(recipient)) {
      res.status(400).json({ error: 'Please provide a valid test email address.' });
      return;
    }

    const productIds = Array.isArray(camp.applicableProducts) ? camp.applicableProducts : [];
    const products = productIds.length
      ? ((await db.models.Product.find(
          { id: { $in: productIds } },
          { id: 1, name: 1, image: 1, price: 1, unit: 1, _id: 0 }
        ).lean()) as Array<{ id: string; name: string; image: string; price: number; unit: string }>)
      : [];

    const testCustomer: CustomerRecord = {
      id: req.user!.id,
      name: req.user!.name,
      email: recipient,
      marketingConsent: true,
      emailPreferences: {
        marketing: {
          newProductAnnouncements: true,
          festivalOffers: true,
          promotionalDiscounts: true,
          specialCampaigns: true,
          newsletter: true,
        },
      },
    };

    const result = await emailService.sendFestivalCampaignEmail(
      {
        ...(camp as any),
        subject: `[TEST] ${camp.subject}`,
      },
      testCustomer,
      products
    );
    res.json({ message: `Test campaign sent to ${recipient}.`, result });
  });

  router.post('/marketing/campaigns/:id/send', async (req, res) => {
    if (req.body?.confirmed !== true) {
      res.status(400).json({
        error: 'Final bulk send confirmation (confirmed: true) is required before dispatching marketing emails.',
      });
      return;
    }

    const camp = await db.models.MarketingCampaign.findOne({ id: req.params.id }).lean();
    if (!camp) {
      res.status(404).json({ error: 'Campaign not found.' });
      return;
    }
    if (camp.status === 'sent' || camp.status === 'sending') {
      res.status(400).json({ error: 'Campaign has already been dispatched.' });
      return;
    }

    const recipients = await querySegmentCustomers(camp.targetSegment, camp.segmentCategory);
    const productIds = Array.isArray(camp.applicableProducts) ? camp.applicableProducts : [];
    const products = productIds.length
      ? ((await db.models.Product.find(
          { id: { $in: productIds } },
          { id: 1, name: 1, image: 1, price: 1, unit: 1, _id: 0 }
        ).lean()) as Array<{ id: string; name: string; image: string; price: number; unit: string }>)
      : [];

    const now = new Date().toISOString();
    await db.models.MarketingCampaign.updateOne(
      { id: camp.id },
      {
        $set: {
          status: recipients.length > 0 ? 'sending' : 'sent',
          totalRecipients: recipients.length,
          sentAt: now,
          updatedAt: now,
        },
      }
    );

    let queuedCount = 0;
    for (const cust of recipients) {
      const r = await emailService.sendFestivalCampaignEmail(camp as any, cust, products);
      if (!r.skipped) queuedCount += 1;
    }

    await logAudit(db, {
      actorId: req.user!.id,
      actorEmail: req.user!.email,
      action: 'campaign_sent',
      entityType: 'marketing_campaign',
      entityId: camp.id,
      details: { campaignName: camp.campaignName, targetSegment: camp.targetSegment, queuedCount },
      ipAddress: req.ip || '',
    });

    const updated = await db.models.MarketingCampaign.findOne({ id: camp.id }, { _id: 0 }).lean();
    res.json({
      message: `Campaign queued for ${queuedCount} opted-in customer(s).`,
      campaign: updated,
      queuedCount,
    });
  });

  router.post('/marketing/campaigns/:id/schedule', async (req, res) => {
    const scheduledAt = typeof req.body?.scheduledAt === 'string' ? req.body.scheduledAt.trim() : '';
    const ts = Date.parse(scheduledAt);
    if (!scheduledAt || Number.isNaN(ts)) {
      res.status(400).json({ error: 'Please provide a valid scheduled date/time.' });
      return;
    }

    const camp = await db.models.MarketingCampaign.findOne({ id: req.params.id }).lean();
    if (!camp) {
      res.status(404).json({ error: 'Campaign not found.' });
      return;
    }

    const recipients = await querySegmentCustomers(camp.targetSegment, camp.segmentCategory);
    const productIds = Array.isArray(camp.applicableProducts) ? camp.applicableProducts : [];
    const products = productIds.length
      ? ((await db.models.Product.find(
          { id: { $in: productIds } },
          { id: 1, name: 1, image: 1, price: 1, unit: 1, _id: 0 }
        ).lean()) as Array<{ id: string; name: string; image: string; price: number; unit: string }>)
      : [];

    const isoScheduled = new Date(ts).toISOString();
    const now = new Date().toISOString();
    await db.models.MarketingCampaign.updateOne(
      { id: camp.id },
      {
        $set: {
          status: 'scheduled',
          scheduledAt: isoScheduled,
          totalRecipients: recipients.length,
          updatedAt: now,
        },
      }
    );

    let queuedCount = 0;
    for (const cust of recipients) {
      const r = await emailService.sendFestivalCampaignEmail(camp as any, cust, products, isoScheduled);
      if (!r.skipped) queuedCount += 1;
    }

    await logAudit(db, {
      actorId: req.user!.id,
      actorEmail: req.user!.email,
      action: 'campaign_scheduled',
      entityType: 'marketing_campaign',
      entityId: camp.id,
      details: { scheduledAt: isoScheduled, queuedCount },
      ipAddress: req.ip || '',
    });

    const updated = await db.models.MarketingCampaign.findOne({ id: camp.id }, { _id: 0 }).lean();
    res.json({
      message: `Campaign scheduled for ${isoScheduled} (${queuedCount} recipients).`,
      campaign: updated,
    });
  });

  router.post('/marketing/campaigns/:id/cancel', async (req, res) => {
    const camp = await db.models.MarketingCampaign.findOne({ id: req.params.id }).lean();
    if (!camp) {
      res.status(404).json({ error: 'Campaign not found.' });
      return;
    }
    if (camp.status === 'sent') {
      res.status(400).json({ error: 'Completed campaigns cannot be cancelled.' });
      return;
    }

    const now = new Date().toISOString();
    const updated = await db.models.MarketingCampaign.findOneAndUpdate(
      { id: camp.id },
      { $set: { status: 'cancelled', updatedAt: now } },
      { new: true }
    ).lean();
    const cancelledJobs = await queue.cancelCampaignJobs(camp.id);

    await logAudit(db, {
      actorId: req.user!.id,
      actorEmail: req.user!.email,
      action: 'campaign_cancelled',
      entityType: 'marketing_campaign',
      entityId: camp.id,
      details: { cancelledJobs },
      ipAddress: req.ip || '',
    });

    res.json({
      message: `Campaign cancelled (${cancelledJobs} queued email job(s) aborted).`,
      campaign: updated,
    });
  });

  return router;
}
