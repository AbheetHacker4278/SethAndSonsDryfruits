import crypto from 'node:crypto';
import path from 'node:path';
import { Router, type Request, type Response, type NextFunction } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { BRAND_CONFIG, parseWeightGrams, calculateOrderShippingCharge, getVariantStockUnits, isSuratCity } from '../../shared/catalogSeed.ts';
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
const paymentProofUpload = makeUploader(true);

const ALLOWED_BROADCAST_ATTACHMENT_EXTS = [
  '.png', '.jpg', '.jpeg', '.webp', '.gif',
  '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.csv', '.txt', '.ppt', '.pptx', '.zip',
];

const ALLOWED_BROADCAST_ATTACHMENT_MIMES = [
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/csv',
  'application/csv',
  'text/plain',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/zip',
  'application/x-zip-compressed',
  'application/octet-stream',
];

function isImageMime(mime: string, name: string): boolean {
  const m = (mime || '').toLowerCase();
  const ext = path.extname(name || '').toLowerCase();
  return (
    m.startsWith('image/') ||
    ['.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg', '.bmp', '.ico'].includes(ext)
  );
}

const broadcastDocUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB per file
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase();
    if (ALLOWED_BROADCAST_ATTACHMENT_MIMES.includes(file.mimetype) || ALLOWED_BROADCAST_ATTACHMENT_EXTS.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Unsupported file format. Supported: Images (PNG, JPG, WEBP) and Documents (PDF, Word, Excel, CSV, TXT, ZIP).'));
    }
  },
});

function maybeBroadcastMultipart(req: Request, res: Response, next: NextFunction) {
  if (req.is('multipart/form-data')) {
    broadcastDocUpload.array('attachments', 5)(req, res, (err: unknown) => {
      if (!err) return next();
      if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          res.status(400).json({ error: 'Each attachment must be 10 MB or smaller.' });
          return;
        }
        if (err.code === 'LIMIT_FILE_COUNT' || err.code === 'LIMIT_UNEXPECTED_FILE') {
          res.status(400).json({ error: 'You can upload at most 5 attachments.' });
          return;
        }
        res.status(400).json({ error: err.message || 'Invalid attachment upload.' });
        return;
      }
      res.status(400).json({ error: err instanceof Error ? err.message : 'Upload failed.' });
    });
    return;
  }
  next();
}

interface BroadcastEmailAttachment {
  filename: string;
  url: string;
  mimeType: string;
  sizeBytes: number;
  publicId?: string;
  content?: string;
}

function generateEmailAttachmentsHtml(attachments: BroadcastEmailAttachment[], baseUrl?: string): {
  imagesHtml: string;
  docsHtml: string;
} {
  if (!attachments || attachments.length === 0) {
    return { imagesHtml: '', docsHtml: '' };
  }

  const images = attachments.filter(a => isImageMime(a.mimeType, a.filename));
  const docs = attachments.filter(a => !isImageMime(a.mimeType, a.filename));

  let imagesHtml = '';
  if (images.length > 0) {
    imagesHtml = `
      <div style="margin:20px 0 24px 0;">
        ${images
        .map(
          img => {
            const safeImgUrl = baseUrl && !img.url.startsWith('http')
              ? `${baseUrl.replace(/\/+$/, '')}/${img.url.replace(/^\/+/, '')}`
              : img.url;
            return `
          <div style="margin:16px 0;text-align:center;">
            <a href="${escapeHtml(safeImgUrl)}" target="_blank" style="text-decoration:none;display:inline-block;">
              <img src="${escapeHtml(safeImgUrl)}" alt="${escapeHtml(img.filename)}" style="max-width:100%;height:auto;border-radius:12px;border:1px solid #E9E4D9;box-shadow:0 4px 14px rgba(0,0,0,0.06);display:block;margin:0 auto;" />
            </a>
            <div style="font-size:12px;color:#888B83;margin-top:6px;font-style:italic;">${escapeHtml(img.filename)}</div>
          </div>
        `;
          }
        )
        .join('')}
      </div>
    `;
  }

  let docsHtml = '';
  if (docs.length > 0) {
    docsHtml = `
      <div style="margin:24px 0;padding:16px 20px;background-color:#F8F6F0;border:1px solid #E9E4D9;border-radius:12px;">
        <div style="font-size:12px;font-weight:700;color:#183D32;margin-bottom:12px;text-transform:uppercase;letter-spacing:1px;">
          Attached Documents &amp; Files (${docs.length})
        </div>
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="border-collapse:collapse;width:100%;">
          ${docs
        .map(
          doc => {
            const ext = path.extname(doc.filename || '').toLowerCase();
            const extLabel = ext ? ext.replace('.', '').toUpperCase() : 'DOC';
            const safeDownloadUrl = baseUrl
              ? `${baseUrl.replace(/\/+$/, '')}/api/media/attachment?url=${encodeURIComponent(doc.url)}&name=${encodeURIComponent(doc.filename)}&download=1`
              : doc.url;
            const sizeLabel = doc.sizeBytes && doc.sizeBytes > 0
              ? `${Math.max(1, Math.round(doc.sizeBytes / 1024))} KB`
              : '';
            return `
            <tr>
              <td style="padding:10px 0;border-bottom:1px solid #EAE6DB;">
                <div style="font-size:14px;font-weight:600;color:#183D32;margin-bottom:4px;">
                  📄 <span style="display:inline-block;padding:1px 6px;margin-right:6px;background-color:#064E3B;color:#DFC471;border-radius:4px;font-size:10px;font-weight:bold;letter-spacing:0.5px;">${escapeHtml(extLabel)}</span>
                  ${escapeHtml(doc.filename)}
                  ${sizeLabel ? `<span style="font-size:11px;color:#888B83;font-weight:normal;margin-left:6px;">(${sizeLabel})</span>` : ''}
                </div>
                <div style="margin-top:6px;">
                  <a href="${escapeHtml(safeDownloadUrl)}" target="_blank" download="${escapeHtml(doc.filename)}" style="display:inline-block;padding:6px 14px;background-color:#183D32;color:#FFFFFF;text-decoration:none;border-radius:6px;font-size:12px;font-weight:600;letter-spacing:0.3px;">
                    Download ${escapeHtml(extLabel)} &rarr;
                  </a>
                </div>
              </td>
            </tr>
          `;
          }
        )
        .join('')}
        </table>
      </div>
    `;
  }

  return { imagesHtml, docsHtml };
}

const erpProductSchema = z.object({
  name: z.string().trim().min(2, 'Product name is required'),
  hindiName: z.string().trim().optional().nullable(),
  subtitle: z.string().trim().optional().default('Jammu Heritage Reserve'),
  sku: z.string().trim().optional().default(''),
  barcode: z.string().trim().optional().nullable(),
  purchasePrice: z.number().min(0).default(0),
  price: z.number().positive('Selling price must be positive'),
  discountPrice: z.number().min(0).optional().nullable(),
  gstRate: z.number().min(0).max(28).default(0),
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

function inferStateFromCity(city: string): string {
  const c = city.trim().toLowerCase();
  if (['surat', 'ahmedabad', 'vadodara', 'rajkot', 'gandhinagar', 'bhavnagar', 'jamnagar', 'junagadh', 'anand', 'navsari', 'vapi', 'bharuch', 'morbi'].some(k => c === k || c.startsWith(k + ' ') || c.includes(' ' + k))) {
    return 'Gujarat';
  }
  if (['jammu', 'srinagar', 'anantnag', 'baramulla', 'udhampur', 'katra', 'kathua', 'sopore', 'pulwama'].some(k => c === k || c.startsWith(k + ' ') || c.includes(' ' + k))) {
    return 'Jammu & Kashmir';
  }
  if (['mumbai', 'pune', 'nagpur', 'nashik', 'thane', 'navi mumbai', 'aurangabad', 'solapur', 'kolhapur', 'amravati'].some(k => c === k || c.startsWith(k + ' ') || c.includes(' ' + k))) {
    return 'Maharashtra';
  }
  if (['delhi', 'new delhi', 'central delhi', 'south delhi', 'west delhi', 'north delhi', 'east delhi'].some(k => c === k || c.startsWith(k + ' ') || c.includes(' ' + k))) {
    return 'Delhi';
  }
  if (['bengaluru', 'bangalore', 'mysuru', 'mysore', 'hubli', 'mangaluru', 'mangalore', 'belgaum'].some(k => c === k || c.startsWith(k + ' ') || c.includes(' ' + k))) {
    return 'Karnataka';
  }
  if (['hyderabad', 'secunderabad', 'warangal', 'nizamabad', 'karimnagar'].some(k => c === k || c.startsWith(k + ' ') || c.includes(' ' + k))) {
    return 'Telangana';
  }
  if (['chennai', 'coimbatore', 'madurai', 'tiruchirappalli', 'salem', 'tiruppur', 'vellore'].some(k => c === k || c.startsWith(k + ' ') || c.includes(' ' + k))) {
    return 'Tamil Nadu';
  }
  if (['kolkata', 'howrah', 'darjeeling', 'siliguri', 'durgapur', 'asansol'].some(k => c === k || c.startsWith(k + ' ') || c.includes(' ' + k))) {
    return 'West Bengal';
  }
  if (['jaipur', 'jodhpur', 'udaipur', 'kota', 'bikaner', 'ajmer', 'bhilwara', 'alwar'].some(k => c === k || c.startsWith(k + ' ') || c.includes(' ' + k))) {
    return 'Rajasthan';
  }
  if (['lucknow', 'kanpur', 'varanasi', 'agra', 'noida', 'greater noida', 'ghaziabad', 'prayagraj', 'allahabad', 'meerut', 'bareilly', 'aligarh', 'moradabad', 'gorakhpur'].some(k => c === k || c.startsWith(k + ' ') || c.includes(' ' + k))) {
    return 'Uttar Pradesh';
  }
  if (['chandigarh'].some(k => c === k)) {
    return 'Chandigarh';
  }
  if (['amritsar', 'ludhiana', 'jalandhar', 'patiala', 'bathinda', 'mohali'].some(k => c === k || c.startsWith(k + ' ') || c.includes(' ' + k))) {
    return 'Punjab';
  }
  if (['gurugram', 'gurgaon', 'faridabad', 'panipat', 'ambala', 'karnal', 'rohtak', 'hisar'].some(k => c === k || c.startsWith(k + ' ') || c.includes(' ' + k))) {
    return 'Haryana';
  }
  if (['indore', 'bhopal', 'gwalior', 'jabalpur', 'ujjain'].some(k => c === k || c.startsWith(k + ' ') || c.includes(' ' + k))) {
    return 'Madhya Pradesh';
  }
  if (['patna', 'gaya', 'bhagalpur', 'muzaffarpur'].some(k => c === k || c.startsWith(k + ' ') || c.includes(' ' + k))) {
    return 'Bihar';
  }
  if (['kochi', 'cochin', 'thiruvananthapuram', 'trivandrum', 'kozhikode', 'calicut', 'thrissur'].some(k => c === k || c.startsWith(k + ' ') || c.includes(' ' + k))) {
    return 'Kerala';
  }
  if (['dehradun', 'haridwar', 'rishikesh', 'haldwani', 'roorkee', 'nainital'].some(k => c === k || c.startsWith(k + ' ') || c.includes(' ' + k))) {
    return 'Uttarakhand';
  }
  if (['shimla', 'manali', 'dharamshala', 'kullu', 'mandi', 'solan'].some(k => c === k || c.startsWith(k + ' ') || c.includes(' ' + k))) {
    return 'Himachal Pradesh';
  }
  if (['bhubaneswar', 'cuttack', 'rourkela', 'puri', 'sambalpur'].some(k => c === k || c.startsWith(k + ' ') || c.includes(' ' + k))) {
    return 'Odisha';
  }
  if (['guwahati', 'silchar', 'dibrugarh', 'jorhat'].some(k => c === k || c.startsWith(k + ' ') || c.includes(' ' + k))) {
    return 'Assam';
  }
  if (['raipur', 'bilaspur', 'bhilai', 'durg'].some(k => c === k || c.startsWith(k + ' ') || c.includes(' ' + k))) {
    return 'Chhattisgarh';
  }
  if (['ranchi', 'jamshedpur', 'dhanbad', 'bokaro'].some(k => c === k || c.startsWith(k + ' ') || c.includes(' ' + k))) {
    return 'Jharkhand';
  }
  if (['panaji', 'margao', 'vasco da gama', 'mapusa'].some(k => c === k || c.startsWith(k + ' ') || c.includes(' ' + k))) {
    return 'Goa';
  }
  return '';
}

function normalizeStateName(rawState: unknown, rawCity: unknown): string {
  const s = typeof rawState === 'string' ? rawState.trim() : '';
  const c = typeof rawCity === 'string' ? rawCity.trim() : '';
  if (!s && c) {
    const inferred = inferStateFromCity(c);
    if (inferred) return inferred;
  }
  if (!s) return 'Other';
  const lower = s.toLowerCase();
  if (lower.includes('jammu') || lower.includes('kashmir') || lower === 'j&k') return 'Jammu & Kashmir';
  if (lower.includes('gujarat') || lower.includes('gujrat')) return 'Gujarat';
  if (lower.includes('maharashtra') || lower.includes('maharastra')) return 'Maharashtra';
  if (lower.includes('delhi')) return 'Delhi';
  if (lower.includes('karnataka') || lower.includes('bangalore') || lower.includes('bengaluru')) return 'Karnataka';
  if (lower.includes('telangana')) return 'Telangana';
  if (lower.includes('tamil')) return 'Tamil Nadu';
  if (lower.includes('bengal')) return 'West Bengal';
  if (lower.includes('rajasthan')) return 'Rajasthan';
  if (lower.includes('uttar pradesh') || lower === 'up') return 'Uttar Pradesh';
  if (lower.includes('punjab')) return 'Punjab';
  if (lower.includes('haryana')) return 'Haryana';
  if (lower.includes('madhya pradesh') || lower === 'mp') return 'Madhya Pradesh';
  if (lower.includes('kerala')) return 'Kerala';
  if (lower.includes('uttarakhand')) return 'Uttarakhand';
  if (lower.includes('himachal')) return 'Himachal Pradesh';
  if (lower.includes('bihar')) return 'Bihar';
  if (lower.includes('odisha') || lower.includes('orissa')) return 'Odisha';
  if (lower.includes('assam')) return 'Assam';
  if (lower.includes('goa')) return 'Goa';
  if (lower.includes('chandigarh')) return 'Chandigarh';

  return s
    .split(/\s+/)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
}

function normalizeCityName(rawCity: unknown): string {
  if (typeof rawCity !== 'string' || !rawCity.trim()) return 'Other';
  const clean = rawCity.trim();
  const lower = clean.toLowerCase();
  if (lower === 'surat' || lower.startsWith('surat ') || lower.endsWith(' surat') || lower.includes('surat,')) return 'Surat';
  if (lower.includes('jammu')) return 'Jammu';
  if (lower.includes('srinagar')) return 'Srinagar';
  if (lower.includes('mumbai') || lower.includes('bombay')) return 'Mumbai';
  if (lower.includes('delhi')) return lower.includes('new') ? 'New Delhi' : 'Delhi';
  if (lower.includes('bangalore') || lower.includes('bengaluru')) return 'Bengaluru';
  if (lower.includes('hyderabad')) return 'Hyderabad';
  if (lower.includes('chennai') || lower.includes('madras')) return 'Chennai';
  if (lower.includes('kolkata') || lower.includes('calcutta')) return 'Kolkata';
  if (lower.includes('pune')) return 'Pune';
  if (lower.includes('ahmedabad')) return 'Ahmedabad';
  if (lower.includes('vadodara') || lower.includes('baroda')) return 'Vadodara';
  if (lower.includes('jaipur')) return 'Jaipur';
  if (lower.includes('lucknow')) return 'Lucknow';
  if (lower.includes('chandigarh')) return 'Chandigarh';
  if (lower.includes('gurgaon') || lower.includes('gurugram')) return 'Gurugram';
  if (lower.includes('noida')) return 'Noida';

  return clean
    .split(/\s+/)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
}

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

  router.get(
    ['/analytics/order-locations', '/order-locations'],
    requirePermission('orders'),
    async (req, res) => {
      const period = String(req.query.period || 'all');
      const from = typeof req.query.from === 'string' && req.query.from ? req.query.from : undefined;
      const to = typeof req.query.to === 'string' && req.query.to ? req.query.to : undefined;

      const filter: Record<string, unknown> = {
        status: { $nin: ['cancelled'] },
      };

      if (from || to) {
        const range: Record<string, string> = {};
        if (from) range.$gte = from;
        if (to) range.$lte = to.length === 10 ? `${to}T23:59:59.999Z` : to;
        filter.createdAt = range;
      } else if (period === '30d') {
        filter.createdAt = { $gte: new Date(Date.now() - 30 * 86400_000).toISOString() };
      } else if (period === '90d') {
        filter.createdAt = { $gte: new Date(Date.now() - 90 * 86400_000).toISOString() };
      } else if (period === 'year' || period === 'this_year') {
        const startOfYear = new Date(new Date().getFullYear(), 0, 1).toISOString();
        filter.createdAt = { $gte: startOfYear };
      }

      const orders = await db.models.Order.find(filter, { _id: 0 }).sort({ createdAt: -1 }).lean();

      // State aggregation map
      const stateMap = new Map<
        string,
        {
          state: string;
          orderCount: number;
          totalRevenue: number;
          customerIds: Set<string>;
          cityMap: Map<string, number>;
          latestOrderAt: string;
        }
      >();

      // City aggregation map
      const cityMap = new Map<
        string,
        {
          city: string;
          state: string;
          orderCount: number;
          totalRevenue: number;
          customerIds: Set<string>;
          isSurat: boolean;
          latestOrderAt: string;
        }
      >();

      let totalOrders = 0;
      let totalRevenue = 0;
      let suratOrders = 0;
      let suratRevenue = 0;
      let otherCitiesOrders = 0;
      let otherCitiesRevenue = 0;
      const allCustomers = new Set<string>();

      for (const o of orders) {
        let addr: any = {};
        if (typeof o.deliveryAddress === 'string') {
          try {
            addr = JSON.parse(o.deliveryAddress);
          } catch { }
        } else if (o.deliveryAddress && typeof o.deliveryAddress === 'object') {
          addr = o.deliveryAddress;
        }

        const rawCity = addr.city || o.shippingCity || '';
        const rawState = addr.state || '';
        const city = normalizeCityName(rawCity);
        const state = normalizeStateName(rawState, rawCity);
        const custId = String(o.customerId || addr.email || addr.mobileNumber || o.id);
        const orderAmount = Number(o.totalAmount || 0);
        const orderDate = String(o.createdAt || '');

        totalOrders += 1;
        totalRevenue += orderAmount;
        allCustomers.add(custId);

        const isSurat = isSuratCity(city);
        if (isSurat) {
          suratOrders += 1;
          suratRevenue += orderAmount;
        } else {
          otherCitiesOrders += 1;
          otherCitiesRevenue += orderAmount;
        }

        // State record
        let stRec = stateMap.get(state);
        if (!stRec) {
          stRec = {
            state,
            orderCount: 0,
            totalRevenue: 0,
            customerIds: new Set(),
            cityMap: new Map(),
            latestOrderAt: orderDate,
          };
          stateMap.set(state, stRec);
        }
        stRec.orderCount += 1;
        stRec.totalRevenue += orderAmount;
        stRec.customerIds.add(custId);
        stRec.cityMap.set(city, (stRec.cityMap.get(city) || 0) + 1);
        if (!stRec.latestOrderAt || orderDate > stRec.latestOrderAt) {
          stRec.latestOrderAt = orderDate;
        }

        // City record
        const cityKey = `${city.toLowerCase()}::${state.toLowerCase()}`;
        let ctRec = cityMap.get(cityKey);
        if (!ctRec) {
          ctRec = {
            city,
            state,
            orderCount: 0,
            totalRevenue: 0,
            customerIds: new Set(),
            isSurat,
            latestOrderAt: orderDate,
          };
          cityMap.set(cityKey, ctRec);
        }
        ctRec.orderCount += 1;
        ctRec.totalRevenue += orderAmount;
        ctRec.customerIds.add(custId);
        if (!ctRec.latestOrderAt || orderDate > ctRec.latestOrderAt) {
          ctRec.latestOrderAt = orderDate;
        }
      }

      // Convert and sort states
      const states = Array.from(stateMap.values())
        .map(st => {
          const topCities = Array.from(st.cityMap.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5)
            .map(([c, count]) => ({ city: c, count }));

          const orderShare = totalOrders > 0 ? Math.round((st.orderCount / totalOrders) * 1000) / 10 : 0;
          const revenueShare = totalRevenue > 0 ? Math.round((st.totalRevenue / totalRevenue) * 1000) / 10 : 0;
          const averageOrderValue = st.orderCount > 0 ? Math.round(st.totalRevenue / st.orderCount) : 0;

          return {
            state: st.state,
            orderCount: st.orderCount,
            totalRevenue: st.totalRevenue,
            uniqueCustomers: st.customerIds.size,
            averageOrderValue,
            orderShare,
            revenueShare,
            topCities,
            latestOrderAt: st.latestOrderAt,
          };
        })
        .sort((a, b) => b.orderCount - a.orderCount || b.totalRevenue - a.totalRevenue);

      // Convert and sort cities
      const cities = Array.from(cityMap.values())
        .map(ct => {
          const orderShare = totalOrders > 0 ? Math.round((ct.orderCount / totalOrders) * 1000) / 10 : 0;
          const revenueShare = totalRevenue > 0 ? Math.round((ct.totalRevenue / totalRevenue) * 1000) / 10 : 0;
          const averageOrderValue = ct.orderCount > 0 ? Math.round(ct.totalRevenue / ct.orderCount) : 0;

          return {
            city: ct.city,
            state: ct.state,
            orderCount: ct.orderCount,
            totalRevenue: ct.totalRevenue,
            uniqueCustomers: ct.customerIds.size,
            averageOrderValue,
            orderShare,
            revenueShare,
            isSurat: ct.isSurat,
            latestOrderAt: ct.latestOrderAt,
          };
        })
        .sort((a, b) => b.orderCount - a.orderCount || b.totalRevenue - a.totalRevenue);

      const summary = {
        totalOrders,
        totalRevenue,
        totalCustomers: allCustomers.size,
        totalStates: states.length,
        totalCities: cities.length,
        topState: states[0] || null,
        topCity: cities[0] || null,
        suratOrders,
        suratRevenue,
        otherCitiesOrders,
        otherCitiesRevenue,
        averageOrderValue: totalOrders > 0 ? Math.round(totalRevenue / totalOrders) : 0,
      };

      res.json({
        period,
        summary,
        states,
        cities,
      });
    }
  );

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
  router.get('/erp/products', (req, res, next) => {
    if (req.user?.adminRole === 'super_admin' || req.user?.permissions?.includes('products') || req.user?.permissions?.includes('orders') || req.user?.permissions?.includes('expenses') || req.user?.permissions?.includes('purchases')) {
      next();
    } else {
      res.status(403).json({ error: 'Access denied. Missing products, orders, expenses, or purchases permission.' });
    }
  }, async (req, res) => {
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
  router.get('/categories', (req, res, next) => {
    if (req.user?.adminRole === 'super_admin' || req.user?.permissions?.includes('categories') || req.user?.permissions?.includes('products') || req.user?.permissions?.includes('expenses') || req.user?.permissions?.includes('purchases')) {
      next();
    } else {
      res.status(403).json({ error: 'Access denied. Missing categories permission.' });
    }
  }, async (_req, res) => {
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

    const [rawProducts, batchDocs, txDocs, suppliers, categoryDocs, variantDocs] = await Promise.all([
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
      db.models.ProductVariant.find({}, { _id: 0 }).lean(),
    ]);

    const catMap = new Map(categoryDocs.map(c => [c.id, c.name]));
    const variantMap = new Map<string, typeof variantDocs>();
    for (const v of variantDocs) {
      const arr = variantMap.get(v.productId) || [];
      arr.push(v);
      variantMap.set(v.productId, arr);
    }

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

      const pVariants = variantMap.get(p.id) || [];
      const stockVal = Number(p.stock || 0);

      let packetsBreakdown: Array<{ label: string; count: number; inStock: boolean }>;
      if (pVariants.length > 0) {
        packetsBreakdown = pVariants
          .sort((a, b) => (parseWeightGrams(String(a.weightLabel)) ?? 0) - (parseWeightGrams(String(b.weightLabel)) ?? 0))
          .map(v => {
            const packUnits = Math.max(0.0001, getVariantStockUnits(String(v.weightLabel || '1kg'), (p.unit || 'kg') as any));
            const count = Math.max(0, Math.floor(stockVal / packUnits));
            return {
              label: String(v.weightLabel),
              count,
              inStock: count > 0,
            };
          });
      } else if (p.unit === 'kg') {
        packetsBreakdown = [
          { label: '1kg', count: Math.max(0, Math.floor(stockVal / 1)), inStock: stockVal >= 1 },
          { label: '0.5kg', count: Math.max(0, Math.floor(stockVal / 0.5)), inStock: stockVal >= 0.5 },
          { label: '0.250kg', count: Math.max(0, Math.floor(stockVal / 0.25)), inStock: stockVal >= 0.25 },
        ];
      } else {
        packetsBreakdown = [
          { label: p.weightLabel || `1 ${p.unit}`, count: stockVal > 0 ? stockVal : 0, inStock: stockVal > 0 },
        ];
      }

      return {
        ...p,
        categoryName: p.categoryId ? catMap.get(p.categoryId) || 'Other Products' : 'Other Products',
        valuation: itemValuation,
        packetsBreakdown,
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
    const schema = z
      .object({
        productId: z.string().trim().optional(),
        productIds: z.array(z.string().trim().min(1)).optional(),
        movementType: z.enum(['stock_in', 'stock_out', 'adjustment']),
        quantity: z.number().nonnegative(),
        reason: z.string().trim().min(2, 'Reason is required for inventory audit trail'),
        unitCost: z.number().min(0).optional(),
        batchNumber: z.string().trim().optional(),
        expiryDate: z.string().trim().optional(),
      })
      .refine(data => Boolean(data.productId || (data.productIds && data.productIds.length > 0)), {
        message: 'At least one product must be selected for stock movement.',
      });

    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid adjustment input' });
      return;
    }

    const { productId, productIds, movementType, quantity, reason, unitCost, batchNumber, expiryDate } = parsed.data;
    const targetProductIds: string[] = [];
    if (Array.isArray(productIds) && productIds.length > 0) {
      targetProductIds.push(...productIds);
    } else if (productId) {
      targetProductIds.push(productId);
    }
    const uniqueProductIds = Array.from(new Set(targetProductIds.filter(Boolean)));
    if (uniqueProductIds.length === 0) {
      res.status(400).json({ error: 'No valid products provided for stock adjustment.' });
      return;
    }

    const now = new Date().toISOString();
    const results: Array<{ productId: string; productName: string; previousStock: number; updatedStock: number }> = [];

    for (const pId of uniqueProductIds) {
      const prod = await db.models.Product.findOne({ id: pId }).lean();
      if (!prod) continue;

      const prevStock = Number(prod.stock || 0);
      let updatedStock = prevStock;
      if (movementType === 'stock_in') updatedStock = Number((prevStock + quantity).toFixed(3));
      else if (movementType === 'stock_out') updatedStock = Math.max(0, Number((prevStock - quantity).toFixed(3)));
      else updatedStock = Number(quantity.toFixed(3));

      const resolvedBatchNo = batchNumber || `BAT-${new Date().getFullYear()}-${crypto.randomInt(1000, 9999)}`;
      if (movementType === 'stock_in') {
        await db.models.InventoryBatch.create({
          id: `batch_${crypto.randomUUID()}`,
          productId: pId,
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
        { id: pId },
        { $set: { stock: updatedStock, inStock: updatedStock > 0, updatedAt: now } }
      );
      await syncInventoryRecord(db, pId);
      await clearResolvedStockAlerts(db, pId, updatedStock, Number(prod.minStockAlert ?? 5));

      await db.models.InventoryTransaction.create({
        id: `invtx_${crypto.randomUUID()}`,
        productId: pId,
        movementType,
        quantity,
        previousStock: prevStock,
        updatedStock,
        unitCost: unitCost ?? prod.purchasePrice,
        batchNumber: movementType === 'stock_in' ? resolvedBatchNo : null,
        reason: uniqueProductIds.length > 1 ? `[Bulk] ${reason}` : reason,
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
          entityId: pId,
        });
      } else if (updatedStock <= Number(prod.minStockAlert ?? 5)) {
        await createAdminNotification(db, {
          type: 'low_stock',
          title: `Low Stock Alert: ${prod.name}`,
          message: `Stock is ${updatedStock} ${prod.unit} (alert level: ${prod.minStockAlert}).`,
          severity: 'warning',
          entityType: 'product',
          entityId: pId,
        });
      }

      await logAudit(db, {
        actorId: req.user!.id,
        actorEmail: req.user!.email,
        action: `inventory_${movementType}`,
        entityType: 'product',
        entityId: pId,
        details: { previousStock: prevStock, updatedStock, quantity, reason, isBulk: uniqueProductIds.length > 1 },
        ipAddress: req.ip || '',
      });

      results.push({
        productId: pId,
        productName: prod.name,
        previousStock: prevStock,
        updatedStock,
      });
    }

    if (results.length === 0) {
      res.status(404).json({ error: 'None of the specified products were found in catalog.' });
      return;
    }

    await checkAndEmitExpiryNotifications(db);
    invalidatePublicCache();

    res.json({
      message:
        results.length === 1
          ? 'Inventory updated and audit trail recorded.'
          : `Bulk inventory updated for ${results.length} products and audit trail recorded.`,
      count: results.length,
      previousStock: results[0]?.previousStock ?? 0,
      updatedStock: results[0]?.updatedStock ?? 0,
      results,
    });
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

  router.post(
    '/orders/upload-payment-proof',
    requirePermission('orders'),
    paymentProofUpload.single('paymentProof'),
    async (req, res) => {
      if (!req.file) {
        res.status(400).json({ error: 'Please upload a valid image or PDF payment receipt.' });
        return;
      }
      try {
        const uploaded = await mediaStorage.uploadBuffer({
          buffer: req.file.buffer,
          filename: `payment_${Date.now()}_${req.file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_')}`,
          folder: 'sethandsons/orders/payments',
          mimeType: req.file.mimetype,
          resourceType: req.file.mimetype === 'application/pdf' ? 'raw' : 'image',
        });
        res.json({ paymentScreenshotUrl: uploaded.url, publicId: uploaded.publicId });
      } catch (err) {
        res.status(500).json({ error: err instanceof Error ? err.message : 'Upload failed.' });
      }
    }
  );

  router.post('/orders', requirePermission('orders'), async (req, res) => {
    let body = req.body || {};
    if (typeof body === 'string') {
      try {
        body = JSON.parse(body);
      } catch {
        body = {};
      }
    }
    const orderSource = ['whatsapp', 'phone', 'direct', 'instagram', 'manual'].includes(body.orderSource)
      ? body.orderSource
      : 'whatsapp';

    const customerName = typeof body.customerName === 'string' ? body.customerName.trim() : '';
    const customerPhone = typeof body.customerPhone === 'string' ? body.customerPhone.trim() : '';
    const customerEmail = typeof body.customerEmail === 'string' && body.customerEmail.trim()
      ? normalizeEmail(body.customerEmail.trim())
      : '';

    if (!customerName || customerName.length < 2) {
      res.status(400).json({ error: 'Customer name is required (min 2 characters).' });
      return;
    }
    if (!customerPhone || customerPhone.length < 5) {
      res.status(400).json({ error: 'Customer contact/phone number is required.' });
      return;
    }

    const deliveryAddress = typeof body.deliveryAddress === 'string' ? body.deliveryAddress.trim() : '';
    const city = typeof body.city === 'string' ? body.city.trim() : '';
    const state = typeof body.state === 'string' ? body.state.trim() : '';
    const pincode = typeof body.pincode === 'string' ? body.pincode.trim() : '';

    if (!deliveryAddress || !city || !state || !pincode) {
      res.status(400).json({ error: 'Complete delivery address, city, state, and pincode are required.' });
      return;
    }

    const rawItems = Array.isArray(body.items) ? body.items : [];
    if (rawItems.length === 0) {
      res.status(400).json({ error: 'Please select at least one product from the catalog.' });
      return;
    }

    const paymentMethodRaw = typeof body.paymentMethod === 'string' ? body.paymentMethod.toLowerCase() : 'upi';
    const paymentMethod = paymentMethodRaw === 'cash' ? 'Cash' : paymentMethodRaw === 'card' ? 'Card' : 'UPI';
    const paymentStatus = ['paid', 'pending', 'cod'].includes(body.paymentStatus) ? body.paymentStatus : 'paid';
    const paymentReference = typeof body.paymentReference === 'string' ? body.paymentReference.trim() : '';
    const paymentScreenshotUrl = typeof body.paymentScreenshotUrl === 'string' ? body.paymentScreenshotUrl.trim() : '';
    const internalNotes = typeof body.internalNotes === 'string' ? body.internalNotes.trim() : '';
    const instructions = typeof body.instructions === 'string' ? body.instructions.trim() : '';

    const now = new Date().toISOString();

    // 1. Lookup or create Customer
    let customer = await db.models.Customer.findOne({
      $or: [{ phone: customerPhone }, ...(customerEmail ? [{ email: customerEmail }] : [])],
    }).lean();

    if (!customer) {
      const generatedEmail = customerEmail || `patron-${customerPhone.replace(/\D/g, '') || Date.now()}@sethandsons.store`;
      const newCustDoc = await db.models.Customer.create({
        id: `cust_${crypto.randomUUID()}`,
        name: customerName,
        phone: customerPhone,
        email: generatedEmail,
        role: 'customer',
        status: 'active',
        emailVerified: true,
        source: orderSource,
        isOneTime: true,
        totalOrders: 0,
        totalSpent: 0,
        createdAt: now,
        updatedAt: now,
      });
      customer = newCustDoc.toObject ? newCustDoc.toObject() : newCustDoc;
    }

    // 2. Resolve items
    const resolvedItems: Array<{
      productId: string;
      variantId: string | null;
      weightLabel: string | null;
      productName: string;
      productImage: string;
      category: string;
      unit: string;
      purchasePrice: number;
      unitPrice: number;
      quantity: number;
      stockQuantity: number | null;
      subtotal: number;
      currentStock: number;
      variantStockRemaining: number | null;
    }> = [];

    let totalCostOfGoods = 0;

    for (const rawItem of rawItems) {
      const prodId = String(rawItem.productId || '').trim();
      const qty = Math.max(0.1, Number(rawItem.quantity || 1));
      if (!prodId) continue;

      const product = await db.models.Product.findOne({ id: prodId }).lean();
      if (!product) {
        res.status(400).json({ error: `Selected product '${prodId}' not found in catalog.` });
        return;
      }

      let variantId: string | null = null;
      let weightLabel: string | null = rawItem.weightLabel || null;
      let unitPrice = typeof rawItem.unitPrice === 'number' && rawItem.unitPrice > 0 ? rawItem.unitPrice : Number(product.price);
      let purchasePrice = Number(product.purchasePrice || 0);
      let variantStockRemaining: number | null = null;

      if (rawItem.variantId) {
        const variant = await db.models.ProductVariant.findOne({ id: rawItem.variantId, productId: prodId }).lean();
        if (variant) {
          variantId = variant.id;
          weightLabel = variant.weightLabel;
          if (!rawItem.unitPrice) {
            unitPrice = Number(variant.sellingPrice || product.price);
          }
          if (variant.purchasePrice) {
            purchasePrice = Number(variant.purchasePrice);
          }
          variantStockRemaining = Math.max(0, Number(((variant.stock || 0) - qty).toFixed(2)));
        }
      }

      const baseUnitsToDeduct = weightLabel
        ? getVariantStockUnits(weightLabel, (product.unit as any) || 'kg') * qty
        : qty;

      const packRatio = (!variantId && weightLabel)
        ? (qty > 0 ? baseUnitsToDeduct / qty : 1)
        : 1;
      const effectivePurchaseCost = Number((purchasePrice * packRatio).toFixed(2));
      const itemSubtotal = Math.round(unitPrice * qty);
      const itemCost = Math.round(effectivePurchaseCost * qty);
      totalCostOfGoods += itemCost;

      resolvedItems.push({
        productId: product.id,
        variantId,
        weightLabel,
        productName: product.name,
        productImage: product.image || '/assets/products/akhrot.jpg',
        category: product.category || 'nuts',
        unit: product.unit || 'kg',
        purchasePrice: effectivePurchaseCost,
        unitPrice,
        quantity: qty,
        stockQuantity: baseUnitsToDeduct,
        subtotal: itemSubtotal,
        currentStock: Number(product.stock || 0),
        variantStockRemaining,
      });
    }

    if (resolvedItems.length === 0) {
      res.status(400).json({ error: 'Please select valid items from the catalog.' });
      return;
    }

    // 3. Compute totals
    const subtotal = resolvedItems.reduce((acc, it) => acc + it.subtotal, 0);
    const shippingCharge =
      typeof body.shippingCharge === 'number' && Number.isFinite(body.shippingCharge)
        ? Math.max(0, body.shippingCharge)
        : calculateOrderShippingCharge(resolvedItems, subtotal, { shippingCity: city });
    const discountAmount = Math.max(0, Math.min(subtotal, Number(body.discountAmount || 0)));
    const totalAmount = Math.max(0, subtotal - discountAmount + shippingCharge);

    // 4. Create Order
    const orderNumber = `ORD-${Date.now().toString().slice(-6)}-${crypto.randomInt(100, 999)}`;
    const orderId = `ord_${crypto.randomUUID()}`;

    const deliveryAddressObj = {
      fullName: customerName,
      mobileNumber: customerPhone,
      email: customerEmail || customer.email || '',
      deliveryAddress,
      city,
      state,
      pincode,
    };

    const customerSnapshot = {
      id: customer.id,
      name: customer.name,
      phone: customer.phone,
      email: customer.email,
    };

    const createdOrder = await db.models.Order.create({
      id: orderId,
      orderNumber,
      customerId: customer.id,
      orderType: 'standard',
      status: 'confirmed',
      orderSource,
      paymentMethod,
      paymentStatus,
      paymentReference: paymentReference || null,
      paymentScreenshotUrl: paymentScreenshotUrl || null,
      subtotal,
      discountAmount,
      couponCode: body.couponCode ? String(body.couponCode).trim() : null,
      shippingCharge,
      taxAmount: 0,
      totalAmount,
      costOfGoods: totalCostOfGoods,
      deliveryAddress: deliveryAddressObj,
      customerSnapshot,
      instructions,
      internalNotes: internalNotes || `Manual order placed via ${orderSource.toUpperCase()} (logged by admin ${req.user!.email}).`,
      estimatedDeliveryEstimate: '2-4 Business Days',
      confirmedAt: now,
      createdAt: now,
      updatedAt: now,
    });

    // 5. Create OrderItems & Deduct Stock
    for (const ri of resolvedItems) {
      await db.models.OrderItem.create({
        id: `oi_${crypto.randomUUID()}`,
        orderId,
        productId: ri.productId,
        variantId: ri.variantId,
        weightLabel: ri.weightLabel,
        productName: ri.productName,
        productImage: ri.productImage,
        category: ri.category,
        unit: ri.unit,
        purchasePrice: ri.purchasePrice,
        unitPrice: ri.unitPrice,
        quantity: ri.quantity,
        stockQuantity: ri.stockQuantity,
        subtotal: ri.subtotal,
      });

      const deductAmt = ri.stockQuantity !== null ? ri.stockQuantity : ri.quantity;
      const newStock = Math.max(0, Number((ri.currentStock - deductAmt).toFixed(2)));
      await db.models.Product.updateOne(
        { id: ri.productId },
        { $set: { stock: newStock, inStock: newStock > 0, updatedAt: now } }
      );

      if (ri.variantId && ri.variantStockRemaining !== null) {
        await db.models.ProductVariant.updateOne(
          { id: ri.variantId },
          { $set: { stock: ri.variantStockRemaining, updatedAt: now } }
        );
      }

      await syncInventoryRecord(db, ri.productId);

      await db.models.InventoryTransaction.create({
        id: `invtx_${crypto.randomUUID()}`,
        productId: ri.productId,
        variantId: ri.variantId,
        movementType: 'sale',
        quantity: -deductAmt,
        previousStock: ri.currentStock,
        updatedStock: newStock,
        unitCost: ri.purchasePrice,
        reason: `Manual Order #${orderNumber} (${orderSource.toUpperCase()})`,
        adminId: req.user!.id,
        adminName: req.user!.email,
        timestamp: now,
      });
    }

    // 6. Create Initial Status History
    await db.models.OrderStatusHistory.create({
      id: `osh_${crypto.randomUUID()}`,
      orderId,
      previousStatus: null,
      newStatus: 'confirmed',
      notes: `Manual order created and confirmed via ${orderSource.toUpperCase()}.`,
      updatedBy: req.user!.email,
      timestamp: now,
    });

    // 7. Update Customer Metrics
    await db.models.Customer.updateOne(
      { id: customer.id },
      {
        $inc: { totalOrders: 1, totalSpent: totalAmount },
        $set: { lastOrderDate: now, updatedAt: now },
      }
    );

    // 8. Audit Log
    await logAudit(db, {
      actorId: req.user!.id,
      actorEmail: req.user!.email,
      action: 'manual_order_created',
      entityType: 'order',
      entityId: orderNumber,
      details: {
        orderNumber,
        orderSource,
        paymentMethod,
        paymentStatus,
        paymentReference,
        hasScreenshot: Boolean(paymentScreenshotUrl),
        totalAmount,
        itemCount: resolvedItems.length,
      },
      ipAddress: req.ip || '',
    });

    let paymentReminderSent = false;
    let paymentReminderRecipient = '';
    if (Boolean(body.sendPaymentEmail) && paymentStatus !== 'paid') {
      const origin = getRequestOrigin(req, config?.appUrl || 'http://localhost:3000');
      const reminderResult = await sendOrderPaymentReminder(createdOrder, origin, req.user);
      if (reminderResult.sent) {
        paymentReminderSent = true;
        paymentReminderRecipient = reminderResult.recipient || '';
      }
    }

    const hydrated = (await hydrateOrder(db, createdOrder.toObject ? createdOrder.toObject() : createdOrder)) as any;

    res.status(201).json({
      ok: true,
      message: paymentReminderSent
        ? `Manual order #${orderNumber} created! Payment request email sent to ${paymentReminderRecipient}.`
        : `Manual order #${orderNumber} created successfully.`,
      order: hydrated,
      paymentReminderSent,
      invoiceUrl: `/api/admin/orders/${encodeURIComponent(orderNumber)}/invoice.pdf`,
    });
  });

  router.put('/orders/:orderNumber/payment-proof', requirePermission('orders'), async (req, res) => {
    const orderNumber = req.params.orderNumber;
    const { paymentScreenshotUrl, paymentReference } = req.body || {};
    if (!paymentScreenshotUrl && !paymentReference) {
      res.status(400).json({ error: 'Please provide payment screenshot URL or reference.' });
      return;
    }
    const order = await db.models.Order.findOne({ orderNumber });
    if (!order) {
      res.status(404).json({ error: 'Order not found.' });
      return;
    }
    const updateData: Record<string, any> = { updatedAt: new Date().toISOString() };
    if (typeof paymentScreenshotUrl === 'string') updateData.paymentScreenshotUrl = paymentScreenshotUrl.trim();
    if (typeof paymentReference === 'string') updateData.paymentReference = paymentReference.trim();

    await db.models.Order.updateOne({ orderNumber }, { $set: updateData });
    const updated = await db.models.Order.findOne({ orderNumber }).lean();
    const hydrated = await hydrateOrder(db, updated!);

    await logAudit(db, {
      actorId: req.user?.id || 'admin',
      actorEmail: req.user?.email || 'admin@sethandsons.com',
      action: 'order_payment_proof_updated',
      entityType: 'order',
      entityId: orderNumber,
      details: updateData,
      ipAddress: req.ip || '',
    });

    res.json({
      ok: true,
      message: 'Payment screenshot attached to order successfully.',
      order: hydrated,
    });
  });

  router.put('/orders/:orderNumber/manual-edit', requirePermission('orders'), async (req, res) => {
    const orderNumber = req.params.orderNumber;
    let body = req.body || {};
    if (typeof body === 'string') {
      try {
        body = JSON.parse(body);
      } catch {
        body = {};
      }
    }

    const order = await db.models.Order.findOne({ orderNumber });
    if (!order) {
      res.status(404).json({ error: 'Order not found.' });
      return;
    }
    if (order.status === 'cancelled' || order.status === 'returned' || order.status === 'delivered' || order.status === 'completed') {
      res.status(400).json({ error: `Cannot edit an existing completed (${order.status}) order. Historical order data and revenue are locked.` });
      return;
    }

    const now = new Date().toISOString();
    const customerName = typeof body.customerName === 'string' ? body.customerName.trim() : '';
    const customerPhone = typeof body.customerPhone === 'string' ? body.customerPhone.trim() : '';
    const customerEmail = typeof body.customerEmail === 'string' && body.customerEmail.trim()
      ? normalizeEmail(body.customerEmail.trim())
      : '';
    const deliveryAddress = typeof body.deliveryAddress === 'string' ? body.deliveryAddress.trim() : '';
    const city = typeof body.city === 'string' ? body.city.trim() : '';
    const state = typeof body.state === 'string' ? body.state.trim() : '';
    const pincode = typeof body.pincode === 'string' ? body.pincode.trim() : '';
    const rawItems = Array.isArray(body.items) ? body.items : [];

    if (!customerName || !customerPhone || !deliveryAddress || !city || !state || !pincode) {
      res.status(400).json({ error: 'Customer name, phone, and complete delivery address are required.' });
      return;
    }
    if (rawItems.length === 0) {
      res.status(400).json({ error: 'At least one catalog product is required.' });
      return;
    }

    // 1. Restore previous inventory deductions from existing OrderItems
    const existingItems = await db.models.OrderItem.find({ orderId: order.id }).lean();
    for (const ei of existingItems) {
      const qtyToRestore = ei.stockQuantity !== null && ei.stockQuantity !== undefined ? ei.stockQuantity : ei.quantity;
      await db.models.Product.updateOne(
        { id: ei.productId },
        { $inc: { stock: qtyToRestore } }
      );
      if (ei.variantId) {
        await db.models.ProductVariant.updateOne(
          { id: ei.variantId },
          { $inc: { stock: ei.quantity } }
        );
      }
      await syncInventoryRecord(db, ei.productId);
    }

    // 2. Resolve new items and deduct stock
    const resolvedItems: any[] = [];
    let totalCostOfGoods = 0;

    for (const rawItem of rawItems) {
      const prodId = String(rawItem.productId || '').trim();
      const qty = Math.max(0.1, Number(rawItem.quantity || 1));
      if (!prodId) continue;

      const product = await db.models.Product.findOne({ id: prodId }).lean();
      if (!product) {
        res.status(400).json({ error: `Product '${prodId}' not found in catalog.` });
        return;
      }

      let variantId: string | null = null;
      let weightLabel: string | null = rawItem.weightLabel || null;
      let unitPrice = typeof rawItem.unitPrice === 'number' && rawItem.unitPrice >= 0 ? rawItem.unitPrice : Number(product.price);
      let purchasePrice = Number(product.purchasePrice || 0);

      if (rawItem.variantId) {
        const variant = await db.models.ProductVariant.findOne({ id: rawItem.variantId, productId: prodId }).lean();
        if (variant) {
          variantId = variant.id;
          weightLabel = variant.weightLabel;
          if (rawItem.unitPrice === undefined || rawItem.unitPrice === null) {
            unitPrice = Number(variant.sellingPrice || product.price);
          }
          if (variant.purchasePrice) purchasePrice = Number(variant.purchasePrice);
        }
      }

      const baseUnitsToDeduct = weightLabel
        ? getVariantStockUnits(weightLabel, (product.unit as any) || 'kg') * qty
        : qty;

      const packRatio = (!variantId && weightLabel)
        ? (qty > 0 ? baseUnitsToDeduct / qty : 1)
        : 1;
      const effectivePurchaseCost = Number((purchasePrice * packRatio).toFixed(2));
      const itemSubtotal = Math.round(unitPrice * qty);
      const itemCost = Math.round(effectivePurchaseCost * qty);
      totalCostOfGoods += itemCost;

      resolvedItems.push({
        productId: product.id,
        variantId,
        weightLabel,
        productName: product.name,
        productImage: product.image || '/assets/products/akhrot.jpg',
        category: product.category || 'nuts',
        unit: product.unit || 'kg',
        purchasePrice: effectivePurchaseCost,
        unitPrice,
        quantity: qty,
        stockQuantity: baseUnitsToDeduct,
        subtotal: itemSubtotal,
        currentStock: Number(product.stock || 0),
      });
    }

    // Delete old OrderItems and insert new OrderItems
    await db.models.OrderItem.deleteMany({ orderId: order.id });
    for (const ri of resolvedItems) {
      await db.models.OrderItem.create({
        id: `oi_${crypto.randomUUID()}`,
        orderId: order.id,
        productId: ri.productId,
        variantId: ri.variantId,
        weightLabel: ri.weightLabel,
        productName: ri.productName,
        productImage: ri.productImage,
        category: ri.category,
        unit: ri.unit,
        purchasePrice: ri.purchasePrice,
        unitPrice: ri.unitPrice,
        quantity: ri.quantity,
        stockQuantity: ri.stockQuantity,
        subtotal: ri.subtotal,
      });

      const deductAmt = ri.stockQuantity !== null ? ri.stockQuantity : ri.quantity;
      await db.models.Product.updateOne(
        { id: ri.productId },
        { $inc: { stock: -deductAmt }, $set: { updatedAt: now } }
      );
      if (ri.variantId) {
        await db.models.ProductVariant.updateOne(
          { id: ri.variantId },
          { $inc: { stock: -ri.quantity } }
        );
      }
      await syncInventoryRecord(db, ri.productId);
    }

    // 3. Compute totals
    const subtotal = resolvedItems.reduce((acc, it) => acc + it.subtotal, 0);
    const shippingCharge =
      typeof body.shippingCharge === 'number' && Number.isFinite(body.shippingCharge)
        ? Math.max(0, body.shippingCharge)
        : calculateOrderShippingCharge(resolvedItems, subtotal, { shippingCity: city });
    const discountAmount = Math.max(0, Math.min(subtotal, Number(body.discountAmount || 0)));
    const totalAmount = Math.max(0, subtotal - discountAmount + shippingCharge);

    const deliveryAddressObj = {
      fullName: customerName,
      mobileNumber: customerPhone,
      email: customerEmail || (typeof order.deliveryAddress === 'object' ? (order.deliveryAddress as any)?.email : '') || '',
      deliveryAddress,
      city,
      state,
      pincode,
    };

    const customerSnapshot = {
      id: order.customerId,
      name: customerName,
      phone: customerPhone,
      email: customerEmail || (typeof order.customerSnapshot === 'object' ? (order.customerSnapshot as any)?.email : '') || '',
    };

    const updateFields: Record<string, any> = {
      deliveryAddress: deliveryAddressObj,
      customerSnapshot,
      subtotal,
      discountAmount,
      shippingCharge,
      totalAmount,
      costOfGoods: totalCostOfGoods,
      updatedAt: now,
    };

    if (body.paymentMethod) {
      const pmRaw = String(body.paymentMethod).toLowerCase();
      updateFields.paymentMethod = pmRaw === 'cash' ? 'Cash' : pmRaw === 'card' ? 'Card' : 'UPI';
    }
    if (body.paymentStatus && ['paid', 'pending', 'cod'].includes(body.paymentStatus)) {
      updateFields.paymentStatus = body.paymentStatus;
    }
    if (typeof body.paymentReference === 'string') {
      updateFields.paymentReference = body.paymentReference.trim();
    }
    if (typeof body.paymentScreenshotUrl === 'string') {
      updateFields.paymentScreenshotUrl = body.paymentScreenshotUrl.trim();
    }
    if (typeof body.internalNotes === 'string') {
      updateFields.internalNotes = body.internalNotes.trim();
    }

    await db.models.Order.updateOne({ orderNumber }, { $set: updateFields });
    const updatedOrder = await db.models.Order.findOne({ orderNumber }).lean();
    const hydrated = await hydrateOrder(db, updatedOrder!);

    let paymentReminderSent = false;
    let paymentReminderRecipient = '';
    if (Boolean(body.sendPaymentEmail) && (updateFields.paymentStatus || order.paymentStatus) !== 'paid') {
      const origin = getRequestOrigin(req, config?.appUrl || 'http://localhost:3000');
      const reminderResult = await sendOrderPaymentReminder(updatedOrder, origin, req.user);
      if (reminderResult.sent) {
        paymentReminderSent = true;
        paymentReminderRecipient = reminderResult.recipient || '';
      }
    }

    await logAudit(db, {
      actorId: req.user?.id || 'admin',
      actorEmail: req.user?.email || 'admin@sethandsons.com',
      action: 'manual_order_edited',
      entityType: 'order',
      entityId: orderNumber,
      details: { newTotal: totalAmount, itemsCount: resolvedItems.length, paymentReminderSent },
      ipAddress: req.ip || '',
    });

    res.json({
      ok: true,
      message: paymentReminderSent
        ? `Manual order #${orderNumber} updated! Payment request email sent to ${paymentReminderRecipient}.`
        : `Manual order #${orderNumber} updated successfully.`,
      order: hydrated,
      paymentReminderSent,
    });
  });

  async function sendOrderPaymentReminder(order: any, origin: string, user: any) {
    try {
      const mailData = await buildPaymentReminderEmail(order, origin);
      if (!mailData.customerEmail) {
        return { sent: false, error: 'No recipient email on file' };
      }
      const job = await queue.enqueue({
        recipient: mailData.customerEmail,
        customerId: order.customerId,
        emailType: 'admin_direct_message',
        relatedOrderId: order.id,
        subject: mailData.subject,
        html: mailData.html,
        text: mailData.text,
      });
      if (job.jobId) {
        await queue.processJobNow(job.jobId);
      }
      await db.models.Order.updateOne(
        { id: order.id },
        { $set: { lastPaymentReminderSentAt: new Date().toISOString() } }
      );
      await logAudit(db, {
        actorId: user?.id || 'admin',
        actorEmail: user?.email || 'admin@sethandsons.com',
        action: 'payment_reminder_sent',
        entityType: 'order',
        entityId: order.orderNumber,
        details: { recipient: mailData.customerEmail, amount: order.totalAmount, trigger: 'manual_order_flow' },
        ipAddress: '',
      });
      return { sent: true, recipient: mailData.customerEmail };
    } catch (err) {
      console.warn('[PAYMENT REMINDER] Failed to dispatch payment email:', err);
      return { sent: false, error: err instanceof Error ? err.message : 'Send failed' };
    }
  }

  // =============================================
  // 4B. UNPAID PAYMENT REQUEST REMINDERS & DIRECT PAYMENT INSTRUCTIONS
  // =============================================
  interface DirectPaymentInstructionsConfig {
    enabled: boolean;
    deleted: boolean;
    heading: string;
    introTemplate: string;
    methodLabel: string;
    upiId: string;
    beneficiary: string;
    footerNote: string;
    extraDetails: string;
    updatedAt?: string;
  }

  const DEFAULT_DIRECT_PAYMENT_INSTRUCTIONS: DirectPaymentInstructionsConfig = {
    enabled: true,
    deleted: false,
    heading: 'Direct Payment Instructions',
    introTemplate: 'To settle your invoice balance of {amount}, please complete payment via UPI:',
    methodLabel: 'Store UPI ID (Google Pay / PhonePe / Paytm / BHIM)',
    upiId: 'aseth9588-1@okhdfcbank',
    beneficiary: 'Seth And Sons DryFruits',
    footerNote:
      'Once completed, please reply directly to this email or share your payment screenshot / UTR with our Whatsapp Number at +91 6356038361 for instant ledger clearance.',
    extraDetails: '',
  };

  async function getDirectPaymentInstructions(): Promise<DirectPaymentInstructionsConfig> {
    const row = await db.models.SiteSetting.findOne({ key: 'direct_payment_instructions' }).lean();
    if (row?.value && typeof row.value === 'object') {
      const v = row.value as Record<string, any>;
      return {
        ...DEFAULT_DIRECT_PAYMENT_INSTRUCTIONS,
        ...v,
        deleted: Boolean(v.deleted),
        enabled: v.deleted ? false : typeof v.enabled === 'boolean' ? v.enabled : true,
      };
    }
    return { ...DEFAULT_DIRECT_PAYMENT_INSTRUCTIONS };
  }

  function mergePaymentInstructions(
    base: DirectPaymentInstructionsConfig,
    override?: Partial<DirectPaymentInstructionsConfig> | null
  ): DirectPaymentInstructionsConfig {
    if (!override || typeof override !== 'object') return base;
    const deleted = typeof override.deleted === 'boolean' ? override.deleted : base.deleted;
    const enabled = deleted
      ? false
      : typeof override.enabled === 'boolean'
        ? override.enabled
        : base.enabled;
    return {
      ...base,
      ...override,
      deleted,
      enabled,
    };
  }

  async function resolveOrderCustomer(order: any): Promise<{ key: string; email: string; name: string }> {
    const cSnap = (order.customerSnapshot as any) || {};
    const dAddr = (order.deliveryAddress as any) || {};
    let customerEmail = normalizeEmail(cSnap.email || dAddr.email || '');
    let customerName = String(cSnap.name || dAddr.fullName || '').trim();

    if ((!customerEmail || !customerName) && order.customerId) {
      const cust = await db.models.Customer.findOne({ id: order.customerId }).lean();
      if (cust) {
        if (!customerEmail && cust.email) customerEmail = normalizeEmail(cust.email);
        if (!customerName && cust.name) customerName = String(cust.name).trim();
      }
    }

    const key = customerEmail
      ? `email:${customerEmail}`
      : order.customerId
        ? `id:${String(order.customerId)}`
        : `order:${String(order.orderNumber)}`;

    return {
      key,
      email: customerEmail,
      name: customerName || 'Valued Patron',
    };
  }

  function renderDirectPaymentBlock(
    cfg: DirectPaymentInstructionsConfig,
    totalStr: string
  ): { html: string; text: string } {
    if (!cfg.enabled || cfg.deleted) {
      return { html: '', text: '' };
    }

    const heading = (cfg.heading || '').trim() || 'Direct Payment Instructions';
    const introResolved = (cfg.introTemplate || 'To settle your invoice balance of {amount}, please complete payment via UPI:')
      .replace(/\{amount\}/gi, totalStr);
    const methodLabel = (cfg.methodLabel || '').trim();
    const upiId = (cfg.upiId || '').trim();
    const beneficiary = (cfg.beneficiary || '').trim();
    const footerNote = (cfg.footerNote || '').trim();
    const extraDetails = (cfg.extraDetails || '').trim();

    const html = `
      <!-- Direct Payment Modes -->
      <div style="margin:24px 0;padding:20px;background-color:#FAF8F5;border:1px solid #D9C48C;border-radius:12px;">
        <div style="font-size:12px;font-weight:bold;color:#064e3b;text-transform:uppercase;letter-spacing:1px;margin-bottom:8px;">
          ${escapeHtml(heading)}
        </div>
        ${
          introResolved
            ? `<div style="font-size:13px;line-height:20px;color:#27332D;margin-bottom:12px;">${escapeHtml(introResolved).replace(escapeHtml(totalStr), `<strong>${escapeHtml(totalStr)}</strong>`)}</div>`
            : ''
        }
        ${
          methodLabel || upiId || beneficiary
            ? `<div style="padding:12px 16px;background-color:#ffffff;border:1px solid #E9E4D9;border-radius:8px;margin-bottom:12px;">
                ${methodLabel ? `<div style="font-size:11px;color:#888B83;text-transform:uppercase;letter-spacing:0.5px;">${escapeHtml(methodLabel)}</div>` : ''}
                ${upiId ? `<div style="font-family:monospace;font-size:16px;font-weight:bold;color:#064e3b;margin:4px 0;">${escapeHtml(upiId)}</div>` : ''}
                ${beneficiary ? `<div style="font-size:11px;color:#5C6058;">Beneficiary: ${escapeHtml(beneficiary)}</div>` : ''}
              </div>`
            : ''
        }
        ${
          extraDetails
            ? `<div style="font-size:12px;color:#183D32;background-color:#ffffff;padding:10px 12px;border-left:3px solid #C8A96B;border-radius:4px;margin-bottom:12px;line-height:18px;">${escapeHtml(extraDetails).replace(/\n/g, '<br/>')}</div>`
            : ''
        }
        ${
          footerNote
            ? `<div style="font-size:12px;color:#5C6058;line-height:18px;">${escapeHtml(footerNote).replace(/\n/g, '<br/>')}</div>`
            : ''
        }
      </div>
    `;

    const textParts = [
      `${heading.toUpperCase()}:`,
      introResolved,
      upiId ? `${methodLabel ? `${methodLabel}: ` : ''}${upiId}` : '',
      beneficiary ? `Beneficiary: ${beneficiary}` : '',
      extraDetails,
      footerNote,
    ].filter(Boolean);

    return {
      html,
      text: `\n${textParts.join('\n')}\n`,
    };
  }

  async function buildConsolidatedPaymentReminderEmail(
    ordersInput: any | any[],
    _baseUrl: string,
    overrideInstructions?: Partial<DirectPaymentInstructionsConfig> | null
  ) {
    const orders = (Array.isArray(ordersInput) ? ordersInput : [ordersInput]).filter(Boolean);
    const primaryOrder = orders[0];
    const isConsolidated = orders.length > 1;
    const customer = await resolveOrderCustomer(primaryOrder);

    const orderIds = orders.map(o => o.id);
    const allItems = await db.models.OrderItem.find({ orderId: { $in: orderIds } }).lean();
    const itemsByOrderId = new Map<string, any[]>();
    for (const it of allItems) {
      const key = String(it.orderId);
      const list = itemsByOrderId.get(key) || [];
      list.push(it);
      itemsByOrderId.set(key, list);
    }

    const savedInstructions = await getDirectPaymentInstructions();
    const effectiveInstructions = mergePaymentInstructions(savedInstructions, overrideInstructions);
    const brandLogoUrl = await getBrandLogoUrl();

    const grandTotalAmount = orders.reduce((sum, o) => sum + Number(o.totalAmount || 0), 0);
    const totalStr = `₹${Math.round(grandTotalAmount).toLocaleString('en-IN')}`;
    const orderNumbers = orders.map(o => String(o.orderNumber));

    let totalItemsCount = 0;
    const textOrderBlocks: string[] = [];

    const ordersHtml = orders
      .map(ord => {
        const ordNum = String(ord.orderNumber);
        const ordItems = itemsByOrderId.get(String(ord.id)) || [];
        totalItemsCount += ordItems.length;

        const formattedOrdDate = new Date(ord.createdAt).toLocaleDateString('en-IN', {
          day: '2-digit',
          month: 'short',
          year: 'numeric',
        });

        const ordTotalStr = `₹${Math.round(Number(ord.totalAmount || 0)).toLocaleString('en-IN')}`;
        const ordSubtotalStr = `₹${Math.round(Number(ord.subtotal || ord.totalAmount || 0)).toLocaleString('en-IN')}`;
        const ordShippingStr =
          Number(ord.shippingCharge || 0) > 0
            ? `₹${Math.round(Number(ord.shippingCharge)).toLocaleString('en-IN')}`
            : 'FREE';
        const ordDiscountStr =
          Number(ord.discountAmount || 0) > 0
            ? `₹${Math.round(Number(ord.discountAmount)).toLocaleString('en-IN')}`
            : '';

        const itemsRowsHtml = ordItems
          .map(it => {
            const unitPriceStr = `₹${Math.round(Number(it.unitPrice || 0)).toLocaleString('en-IN')}`;
            const subtotalItemStr = `₹${Math.round(Number(it.subtotal || 0)).toLocaleString('en-IN')}`;
            const weightLabel = it.weightLabel || `${it.quantity} ${it.unit || 'unit'}`;
            return `
              <tr style="border-bottom:1px solid #E9E4D9;background-color:#ffffff;">
                <td style="padding:10px 12px;color:#183D32;vertical-align:middle;">
                  <div style="font-weight:600;color:#183D32;font-size:13px;">${escapeHtml(it.productName)}</div>
                  ${it.category ? `<div style="font-size:11px;color:#888B83;margin-top:2px;">Category: ${escapeHtml(it.category)}</div>` : ''}
                </td>
                <td style="padding:10px 12px;text-align:center;color:#4A5951;font-size:12px;vertical-align:middle;">
                  <span style="font-weight:700;color:#183D32;">Qty: ${Number(it.quantity || 1)}</span>
                  <span style="color:#5C6058;"> &bull; ${escapeHtml(weightLabel)}</span>
                  <div style="font-size:11px;color:#888B83;margin-top:2px;">(${Number(it.quantity || 1)} &times; ${unitPriceStr})</div>
                </td>
                <td style="padding:10px 12px;text-align:right;color:#183D32;font-weight:bold;font-size:13px;vertical-align:middle;">
                  ${subtotalItemStr}
                </td>
              </tr>
            `;
          })
          .join('');

        const textItems = ordItems
          .map(it => `  - ${it.productName} | Qty: ${it.quantity} (${it.weightLabel || it.unit || 'unit'}) | ₹${Math.round(Number(it.subtotal || 0))}`)
          .join('\n');
        textOrderBlocks.push(
          `Order #${ordNum} (${formattedOrdDate}) — Due: ${ordTotalStr}\n${textItems || '  - Standard order items'}`
        );

        return `
          <!-- Order Block #${escapeHtml(ordNum)} -->
          <div style="margin:18px 0;border:1px solid #D9C48C;border-radius:10px;overflow:hidden;">
            <div style="padding:12px 16px;background-color:#FDFBF7;border-bottom:1px solid #E9E4D9;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="border-collapse:collapse;width:100%;">
                <tr>
                  <td style="vertical-align:middle;">
                    <div style="font-size:13px;font-weight:bold;color:#183D32;">
                      Order #${escapeHtml(ordNum)}
                    </div>
                    <div style="font-size:11px;color:#888B83;margin-top:2px;">
                      Placed: ${formattedOrdDate} &bull; ${ordItems.length} ${ordItems.length === 1 ? 'Item' : 'Items'}
                    </div>
                  </td>
                  <td style="vertical-align:middle;text-align:right;">
                    <span style="display:inline-block;padding:3px 9px;background-color:#FFF4E5;border:1px solid #FFE2B8;border-radius:20px;color:#B25E09;font-weight:bold;font-size:11px;">
                      ${escapeHtml(ord.paymentMethod || 'Invoice / COD')} (UNPAID)
                    </span>
                    <div style="font-size:14px;font-weight:bold;color:#064e3b;margin-top:4px;">
                      ${ordTotalStr}
                    </div>
                  </td>
                </tr>
              </table>
            </div>

            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;border-collapse:collapse;font-size:13px;">
              <thead>
                <tr style="background-color:#064e3b;color:#dfc471;text-align:left;">
                  <th style="padding:9px 12px;font-weight:600;font-size:11px;letter-spacing:0.5px;text-transform:uppercase;">Product Details</th>
                  <th style="padding:9px 12px;font-weight:600;font-size:11px;letter-spacing:0.5px;text-transform:uppercase;text-align:center;">Qty Purchased</th>
                  <th style="padding:9px 12px;font-weight:600;font-size:11px;letter-spacing:0.5px;text-transform:uppercase;text-align:right;">Subtotal</th>
                </tr>
              </thead>
              <tbody>
                ${itemsRowsHtml}
              </tbody>
              <tfoot>
                <tr style="background-color:#FAF8F5;border-top:1px solid #E9E4D9;">
                  <td colspan="2" style="padding:7px 12px;text-align:right;color:#5C6058;font-size:12px;">Subtotal:</td>
                  <td style="padding:7px 12px;text-align:right;color:#183D32;font-size:12px;font-weight:600;">${ordSubtotalStr}</td>
                </tr>
                ${
                  Number(ord.shippingCharge || 0) > 0
                    ? `<tr style="background-color:#FAF8F5;">
                        <td colspan="2" style="padding:4px 12px;text-align:right;color:#5C6058;font-size:12px;">Shipping &amp; Handling:</td>
                        <td style="padding:4px 12px;text-align:right;color:#183D32;font-size:12px;">+${ordShippingStr}</td>
                      </tr>`
                    : ''
                }
                ${
                  Number(ord.discountAmount || 0) > 0
                    ? `<tr style="background-color:#FAF8F5;">
                        <td colspan="2" style="padding:4px 12px;text-align:right;color:#2E7D32;font-size:12px;">Exclusive Privilege Discount:</td>
                        <td style="padding:4px 12px;text-align:right;color:#2E7D32;font-size:12px;">-${ordDiscountStr}</td>
                      </tr>`
                    : ''
                }
                <tr style="background-color:#F5EEDC;border-top:1px solid #C8A96B;">
                  <td colspan="2" style="padding:10px 12px;text-align:right;color:#183D32;font-weight:bold;font-size:12px;text-transform:uppercase;">Order Pending Amount:</td>
                  <td style="padding:10px 12px;text-align:right;color:#064e3b;font-weight:bold;font-size:14px;">${ordTotalStr}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        `;
      })
      .join('');

    const formattedPrimaryDate = new Date(primaryOrder.createdAt).toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });

    const summaryCardHtml = isConsolidated
      ? `
        <div style="margin:20px 0;padding:18px 20px;background-color:#F5EEDC;border:2px solid #C8A96B;border-radius:12px;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="border-collapse:collapse;width:100%;">
            <tr>
              <td style="vertical-align:middle;">
                <div style="font-size:11px;text-transform:uppercase;color:#8F6C2B;font-weight:bold;letter-spacing:1px;">
                  Consolidated Statement &bull; ${orders.length} Pending Orders
                </div>
                <div style="font-size:13px;color:#183D32;margin-top:4px;font-weight:600;">
                  Orders: ${orderNumbers.map(n => `#${escapeHtml(n)}`).join(', ')}
                </div>
              </td>
              <td style="vertical-align:middle;text-align:right;">
                <div style="font-size:11px;text-transform:uppercase;color:#8F6C2B;font-weight:bold;letter-spacing:1px;">
                  Total Outstanding Due
                </div>
                <div style="font-size:22px;font-weight:bold;color:#064e3b;margin-top:2px;">
                  ${totalStr}
                </div>
              </td>
            </tr>
          </table>
        </div>
      `
      : '';

    const grandTotalBannerHtml = isConsolidated
      ? `
        <div style="margin:20px 0;padding:16px 20px;background-color:#064e3b;border:2px solid #C8A96B;border-radius:12px;color:#ffffff;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="border-collapse:collapse;width:100%;">
            <tr>
              <td style="vertical-align:middle;">
                <div style="font-size:11px;text-transform:uppercase;color:#dfc471;font-weight:bold;letter-spacing:1px;">
                  Combined Balance Across ${orders.length} Pending Orders
                </div>
                <div style="font-size:13px;color:#F8F6F0;margin-top:2px;">
                  ${totalItemsCount} total product line(s) awaiting settlement
                </div>
              </td>
              <td style="vertical-align:middle;text-align:right;">
                <div style="font-size:20px;font-weight:bold;color:#dfc471;">
                  ${totalStr}
                </div>
              </td>
            </tr>
          </table>
        </div>
      `
      : '';

    const directPaymentBlock = renderDirectPaymentBlock(effectiveInstructions, totalStr);

    const introParagraph = isConsolidated
      ? `This is a consolidated payment summary for your <strong>${orders.length} pending orders</strong> (${orderNumbers.map(n => `#${escapeHtml(n)}`).join(', ')}), with a combined outstanding balance of <strong>${totalStr}</strong>.`
      : `This is a courteous reminder regarding your recent harvest reservation <strong>#${escapeHtml(String(primaryOrder.orderNumber))}</strong> placed on <strong>${formattedPrimaryDate}</strong>, for which payment remains outstanding.`;

    const bodyHtml = `
      <div style="margin-bottom:20px;">
        <p style="margin:0 0 12px 0;font-size:16px;line-height:24px;color:#183D32;font-weight:600;">
          Namaste ${escapeHtml(customer.name)},
        </p>
        <p style="margin:0 0 16px 0;font-size:14px;line-height:24px;color:#27332D;">
          We hope you are savoring your selections from <strong>Seth And Sons DryFruits</strong>.
        </p>
        <p style="margin:0 0 20px 0;font-size:14px;line-height:24px;color:#27332D;">
          ${introParagraph}
        </p>
      </div>

      ${summaryCardHtml}
      ${ordersHtml}
      ${grandTotalBannerHtml}
      ${directPaymentBlock.html}
    `;

    const subject = isConsolidated
      ? `Payment Request: ${orders.length} Pending Orders (${totalStr} Outstanding) - Seth And Sons DryFruits`
      : `Payment Request: Order #${String(primaryOrder.orderNumber)} (${totalStr}) - Seth And Sons DryFruits`;

    const preheader = isConsolidated
      ? `Consolidated statement for ${orders.length} pending orders totaling ${totalStr}.`
      : `Kindly complete the outstanding balance of ${totalStr} for your harvest reservation #${String(primaryOrder.orderNumber)}.`;

    const html = wrapInBrandEmailLayout({
      brandLogoUrl,
      brandName: BRAND_CONFIG.name,
      supportEmail: BRAND_CONFIG.supportEmail,
      preheader,
      bodyHtml,
    });

    const text = `Namaste ${customer.name},\n\n${
      isConsolidated
        ? `This is a consolidated payment reminder for your ${orders.length} pending orders.`
        : `This is a payment reminder for your order #${String(primaryOrder.orderNumber)} placed on ${formattedPrimaryDate}.`
    }\n\n${textOrderBlocks.join('\n\n')}\n\nTOTAL OUTSTANDING AMOUNT DUE: ${totalStr}${directPaymentBlock.text}\nThank you for choosing Seth And Sons DryFruits.\nSupport: ${BRAND_CONFIG.supportEmail}`;

    return {
      customerKey: customer.key,
      customerName: customer.name,
      customerEmail: customer.email,
      subject,
      html,
      text,
      orderNumber: String(primaryOrder.orderNumber),
      orderNumbers,
      orderCount: orders.length,
      totalAmount: grandTotalAmount,
      totalStr,
      itemsCount: totalItemsCount,
      date: formattedPrimaryDate,
      directPaymentInstructionsUsed: effectiveInstructions,
    };
  }

  // Backward-compatible single-order wrapper
  async function buildPaymentReminderEmail(
    order: any,
    baseUrl: string,
    overrideInstructions?: Partial<DirectPaymentInstructionsConfig> | null
  ) {
    return buildConsolidatedPaymentReminderEmail([order], baseUrl, overrideInstructions);
  }

  router.get('/payment-instructions', requirePermission('orders'), async (_req, res) => {
    const instructions = await getDirectPaymentInstructions();
    res.json({ instructions });
  });

  router.put('/payment-instructions', requirePermission('orders'), async (req, res) => {
    const schema = z.object({
      enabled: z.boolean().optional().default(true),
      heading: z.string().trim().min(1).max(120).optional(),
      introTemplate: z.string().trim().max(400).optional(),
      methodLabel: z.string().trim().max(150).optional(),
      upiId: z.string().trim().max(120).optional(),
      beneficiary: z.string().trim().max(150).optional(),
      footerNote: z.string().trim().max(600).optional(),
      extraDetails: z.string().trim().max(600).optional(),
    });
    const parsed = schema.safeParse(req.body || {});
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid payment instructions.' });
      return;
    }

    const current = await getDirectPaymentInstructions();
    const now = new Date().toISOString();
    const updated: DirectPaymentInstructionsConfig = {
      ...current,
      ...parsed.data,
      deleted: false,
      enabled: parsed.data.enabled,
      updatedAt: now,
    };

    await db.models.SiteSetting.updateOne(
      { key: 'direct_payment_instructions' },
      { $set: { value: updated, updatedAt: now } },
      { upsert: true }
    );

    await logAudit(db, {
      actorId: req.user?.id || 'admin',
      actorEmail: req.user?.email || 'admin@sethandsons.com',
      action: 'payment_instructions_updated',
      entityType: 'site_setting',
      entityId: 'direct_payment_instructions',
      details: { enabled: updated.enabled, upiId: updated.upiId },
      ipAddress: req.ip || '',
    });

    res.json({ ok: true, message: 'Direct Payment Instructions updated.', instructions: updated });
  });

  router.delete('/payment-instructions', requirePermission('orders'), async (req, res) => {
    const now = new Date().toISOString();
    const cleared: DirectPaymentInstructionsConfig = {
      enabled: false,
      deleted: true,
      heading: '',
      introTemplate: '',
      methodLabel: '',
      upiId: '',
      beneficiary: '',
      footerNote: '',
      extraDetails: '',
      updatedAt: now,
    };

    await db.models.SiteSetting.updateOne(
      { key: 'direct_payment_instructions' },
      { $set: { value: cleared, updatedAt: now } },
      { upsert: true }
    );

    await logAudit(db, {
      actorId: req.user?.id || 'admin',
      actorEmail: req.user?.email || 'admin@sethandsons.com',
      action: 'payment_instructions_deleted',
      entityType: 'site_setting',
      entityId: 'direct_payment_instructions',
      details: { deleted: true },
      ipAddress: req.ip || '',
    });

    res.json({ ok: true, message: 'Direct Payment Instructions deleted and hidden from customer emails.', instructions: cleared });
  });

  router.post('/orders/preview-payment-reminder', requirePermission('orders'), async (req, res) => {
    const rawOrderNumbers = Array.isArray(req.body?.orderNumbers)
      ? req.body.orderNumbers.map((x: any) => String(x).trim()).filter(Boolean)
      : [];
    const singleOrderNumber = String(req.body?.orderNumber || '').trim();
    const targetNumbers = rawOrderNumbers.length > 0 ? rawOrderNumbers : singleOrderNumber ? [singleOrderNumber] : [];

    if (targetNumbers.length === 0) {
      res.status(400).json({ error: 'orderNumber or orderNumbers is required.' });
      return;
    }

    const matchedOrders = await db.models.Order.find({
      $or: [{ orderNumber: { $in: targetNumbers } }, { id: { $in: targetNumbers } }],
    })
      .sort({ createdAt: -1 })
      .lean();

    if (matchedOrders.length === 0) {
      res.status(404).json({ error: 'Order not found.' });
      return;
    }

    const origin = getRequestOrigin(req, config?.appUrl || 'http://localhost:3000');
    const override = req.body?.directPaymentInstructions || null;
    const preview = await buildConsolidatedPaymentReminderEmail(matchedOrders, origin, override);

    res.json({
      html: preview.html,
      subject: preview.subject,
      customerKey: preview.customerKey,
      customerName: preview.customerName,
      customerEmail: preview.customerEmail,
      totalAmount: preview.totalAmount,
      totalStr: preview.totalStr,
      orderNumber: preview.orderNumber,
      orderNumbers: preview.orderNumbers,
      orderCount: preview.orderCount,
      itemsCount: preview.itemsCount,
      date: preview.date,
      directPaymentInstructionsUsed: preview.directPaymentInstructionsUsed,
    });
  });

  router.post('/orders/send-payment-reminders', requirePermission('orders'), async (req, res) => {
    const rawOrderNumbers = req.body?.orderNumbers;
    const globalOverride = req.body?.directPaymentInstructions || null;
    const rawOverrides = req.body?.customerOverrides;
    const customerOverrideMap = new Map<string, Partial<DirectPaymentInstructionsConfig>>();
    if (Array.isArray(rawOverrides)) {
      for (const entry of rawOverrides) {
        if (entry && typeof entry === 'object' && entry.instructions && typeof entry.instructions === 'object') {
          if (typeof entry.customerKey === 'string' && entry.customerKey) {
            customerOverrideMap.set(entry.customerKey, entry.instructions);
          }
          if (typeof entry.customerEmail === 'string' && entry.customerEmail) {
            customerOverrideMap.set(`email:${normalizeEmail(entry.customerEmail)}`, entry.instructions);
          }
        }
      }
    } else if (rawOverrides && typeof rawOverrides === 'object') {
      for (const [k, v] of Object.entries(rawOverrides as Record<string, Partial<DirectPaymentInstructionsConfig>>)) {
        if (v && typeof v === 'object') customerOverrideMap.set(k, v);
      }
    }

    const query: Record<string, any> = {
      paymentStatus: { $in: ['pending', 'unpaid', 'cod'] },
      status: { $nin: ['cancelled', 'returned'] },
    };

    if (Array.isArray(rawOrderNumbers) && rawOrderNumbers.length > 0) {
      query.orderNumber = { $in: rawOrderNumbers.map(String) };
    }

    const eligibleOrders = await db.models.Order.find(query).sort({ createdAt: -1 }).lean();
    if (eligibleOrders.length === 0) {
      res.json({
        dispatchedCount: 0,
        customerCount: 0,
        orderCount: 0,
        totalEligible: 0,
        message: 'No eligible unpaid orders found.',
        results: [],
      });
      return;
    }

    // Group eligible unpaid orders by Customer (so multiple pending orders for one customer become ONE single email)
    const groupedMap = new Map<string, any[]>();
    for (const ord of eligibleOrders) {
      if (ord.paymentStatus === 'paid' || ord.paymentStatus === 'refunded') continue;
      const cust = await resolveOrderCustomer(ord);
      const list = groupedMap.get(cust.key) || [];
      list.push(ord);
      groupedMap.set(cust.key, list);
    }

    const origin = getRequestOrigin(req, config?.appUrl || 'http://localhost:3000');
    const results: Array<{
      customerKey: string;
      orderNumber: string;
      orderNumbers: string[];
      customerEmail: string;
      totalAmount: number;
      status: 'sent' | 'skipped' | 'failed';
      error?: string;
    }> = [];
    let dispatched = 0;
    let totalOrdersNotified = 0;

    for (const [customerKey, custOrders] of groupedMap.entries()) {
      const custOrderNumbers = custOrders.map(o => String(o.orderNumber));
      try {
        const firstCust = await resolveOrderCustomer(custOrders[0]);
        const custOverride =
          customerOverrideMap.get(customerKey) ||
          (firstCust.email ? customerOverrideMap.get(`email:${firstCust.email}`) : undefined) ||
          null;
        const effectiveOverride = custOverride
          ? { ...(globalOverride || {}), ...custOverride }
          : globalOverride;

        const mailData = await buildConsolidatedPaymentReminderEmail(custOrders, origin, effectiveOverride);
        if (!mailData.customerEmail) {
          results.push({
            customerKey,
            orderNumber: custOrderNumbers[0],
            orderNumbers: custOrderNumbers,
            customerEmail: '',
            totalAmount: mailData.totalAmount,
            status: 'skipped',
            error: 'No recipient email on record',
          });
          continue;
        }

        const job = await queue.enqueue({
          recipient: mailData.customerEmail,
          customerId: custOrders[0].customerId,
          emailType: 'admin_direct_message',
          relatedOrderId: custOrders[0].id,
          subject: mailData.subject,
          html: mailData.html,
          text: mailData.text,
        });

        if (job.jobId) {
          await queue.processJobNow(job.jobId);
        }

        const sentAt = new Date().toISOString();
        await db.models.Order.updateMany(
          { id: { $in: custOrders.map(o => o.id) } },
          { $set: { lastPaymentReminderSentAt: sentAt } }
        );

        await logAudit(db, {
          actorId: req.user?.id || 'admin',
          actorEmail: req.user?.email || 'admin@sethandsons.com',
          action: 'payment_reminder_sent',
          entityType: 'order',
          entityId: custOrderNumbers.join(','),
          details: {
            recipient: mailData.customerEmail,
            amount: mailData.totalAmount,
            orderNumbers: custOrderNumbers,
            consolidated: custOrders.length > 1,
            directPaymentVisible: mailData.directPaymentInstructionsUsed.enabled,
          },
          ipAddress: req.ip || '',
        });

        dispatched++;
        totalOrdersNotified += custOrders.length;
        results.push({
          customerKey,
          orderNumber: custOrderNumbers[0],
          orderNumbers: custOrderNumbers,
          customerEmail: mailData.customerEmail,
          totalAmount: mailData.totalAmount,
          status: 'sent',
        });
      } catch (err) {
        results.push({
          customerKey,
          orderNumber: custOrderNumbers[0],
          orderNumbers: custOrderNumbers,
          customerEmail: '',
          totalAmount: 0,
          status: 'failed',
          error: err instanceof Error ? err.message : 'Send failed',
        });
      }
    }

    res.json({
      dispatchedCount: dispatched,
      customerCount: dispatched,
      orderCount: totalOrdersNotified,
      totalEligible: eligibleOrders.length,
      message: `Dispatched ${dispatched} consolidated payment request email(s) covering ${totalOrdersNotified} pending order(s).`,
      results,
    });
  });

  router.post('/orders/:orderNumber/send-payment-reminder', requirePermission('orders'), async (req, res) => {
    const orderNumber = req.params.orderNumber;
    const order = await db.models.Order.findOne({
      $or: [{ orderNumber }, { id: orderNumber }],
    }).lean();

    if (!order) {
      res.status(404).json({ error: 'Order not found.' });
      return;
    }

    if (order.paymentStatus === 'paid' || order.paymentStatus === 'refunded') {
      res.status(400).json({ error: 'This order is already marked as paid or refunded.' });
      return;
    }

    if (order.status === 'cancelled' || order.status === 'returned') {
      res.status(400).json({ error: `Cannot send payment request for a ${order.status} order.` });
      return;
    }

    let targetOrders = [order];
    if (req.body?.includeAllPendingForCustomer) {
      const cust = await resolveOrderCustomer(order);
      const allPending = await db.models.Order.find({
        paymentStatus: { $in: ['pending', 'unpaid', 'cod'] },
        status: { $nin: ['cancelled', 'returned'] },
      })
        .sort({ createdAt: -1 })
        .lean();

      const matching: any[] = [];
      for (const candidate of allPending) {
        const candCust = await resolveOrderCustomer(candidate);
        if (candCust.key === cust.key) matching.push(candidate);
      }
      if (matching.length > 0) targetOrders = matching;
    }

    const origin = getRequestOrigin(req, config?.appUrl || 'http://localhost:3000');
    const override = req.body?.directPaymentInstructions || null;
    const mailData = await buildConsolidatedPaymentReminderEmail(targetOrders, origin, override);

    if (!mailData.customerEmail) {
      res.status(400).json({ error: 'No customer email address on file for this order.' });
      return;
    }

    const job = await queue.enqueue({
      recipient: mailData.customerEmail,
      customerId: order.customerId,
      emailType: 'admin_direct_message',
      relatedOrderId: order.id,
      subject: mailData.subject,
      html: mailData.html,
      text: mailData.text,
    });

    if (job.jobId) {
      await queue.processJobNow(job.jobId);
    }

    await db.models.Order.updateMany(
      { id: { $in: targetOrders.map(o => o.id) } },
      { $set: { lastPaymentReminderSentAt: new Date().toISOString() } }
    );

    await logAudit(db, {
      actorId: req.user?.id || 'admin',
      actorEmail: req.user?.email || 'admin@sethandsons.com',
      action: 'payment_reminder_sent',
      entityType: 'order',
      entityId: mailData.orderNumbers.join(','),
      details: {
        recipient: mailData.customerEmail,
        amount: mailData.totalAmount,
        consolidated: targetOrders.length > 1,
      },
      ipAddress: req.ip || '',
    });

    res.json({
      ok: true,
      message: `Payment request reminder sent directly to ${mailData.customerName} (${mailData.customerEmail})${
        targetOrders.length > 1 ? ` — consolidated ${targetOrders.length} orders (${mailData.totalStr})` : ''
      }.`,
      recipient: mailData.customerEmail,
      orderCount: targetOrders.length,
      totalAmount: mailData.totalAmount,
    });
  });

  // =============================================
  // 5. CUSTOMER MANAGEMENT
  // =============================================
  router.get('/customers', (req, res, next) => {
    if (req.user?.adminRole === 'super_admin' || req.user?.permissions?.includes('customers') || req.user?.permissions?.includes('orders')) {
      next();
    } else {
      res.status(403).json({ error: 'Access denied. Missing customers or orders permission.' });
    }
  }, async (req, res) => {
    const search = typeof req.query.search === 'string' ? req.query.search.trim().toLowerCase() : '';
    const segment = typeof req.query.segment === 'string' ? req.query.segment : 'all';
    const customerType = typeof req.query.customerType === 'string' ? req.query.customerType : 'registered';
    const page = Math.max(1, Number(req.query.page || 1));
    const limit = req.query.limit ? Math.max(1, Math.min(100, Number(req.query.limit))) : 0;

    const custFilter: Record<string, any> = { role: 'customer' };
    if (customerType === 'registered') {
      custFilter.isOneTime = { $ne: true };
    } else if (customerType === 'one_time') {
      custFilter.isOneTime = true;
    }

    const [rows, orders, addresses] = await Promise.all([
      db.models.Customer.find(custFilter, { passwordHash: 0, _id: 0 })
        .sort({ createdAt: -1 })
        .lean(),
      db.models.Order.find({}, { customerId: 1, status: 1, totalAmount: 1, createdAt: 1, shippingAddress: 1, _id: 0 }).sort({ createdAt: -1 }).lean(),
      db.models.CustomerAddress.find({}, { _id: 0 }).sort({ isDefault: -1, updatedAt: -1 }).lean(),
    ]);

    const statsMap = new Map<string, { totalOrders: number; totalSpent: number; lastOrderAt: string | null }>();
    const addressMap = new Map<string, { addressLine: string; city: string; state: string; pincode: string }>();

    for (const o of orders) {
      const cur = statsMap.get(o.customerId) || { totalOrders: 0, totalSpent: 0, lastOrderAt: null };
      if (o.status !== 'cancelled') cur.totalOrders += 1;
      if (o.status !== 'cancelled' && o.status !== 'returned') cur.totalSpent += Number(o.totalAmount || 0);
      if (!cur.lastOrderAt || o.createdAt > cur.lastOrderAt) cur.lastOrderAt = o.createdAt;
      statsMap.set(o.customerId, cur);

      if (o.customerId && o.shippingAddress && !addressMap.has(o.customerId)) {
        addressMap.set(o.customerId, {
          addressLine: (o.shippingAddress as any).address || (o.shippingAddress as any).street || '',
          city: (o.shippingAddress as any).city || '',
          state: (o.shippingAddress as any).state || '',
          pincode: (o.shippingAddress as any).pincode || '',
        });
      }
    }

    for (const a of addresses) {
      if (a.customerId && (!addressMap.has(a.customerId) || a.isDefault)) {
        addressMap.set(a.customerId, {
          addressLine: a.addressLine || `${a.houseFlat || ''} ${a.streetArea || ''}`.trim(),
          city: a.city || '',
          state: a.state || '',
          pincode: a.pincode || '',
        });
      }
    }

    const thirtyDaysAgo = new Date(Date.now() - 30 * 86400_000).toISOString();
    const sixtyDaysAgo = new Date(Date.now() - 60 * 86400_000).toISOString();

    const filtered = rows
      .map(r => {
        const st = statsMap.get(r.id) || { totalOrders: 0, totalSpent: 0, lastOrderAt: null };
        const addr = addressMap.get(r.id) || null;
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
          isOneTime: Boolean(r.isOneTime),
          source: String(r.source || 'web'),
          totalOrders: st.totalOrders,
          totalSpent: st.totalSpent,
          address: addr,
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
    const registeredCustomers = customers.filter(c => !c.isOneTime);
    const oneTimeCustomersCount = customers.filter(c => Boolean(c.isOneTime)).length;
    const totalCustomers = registeredCustomers.length;
    let verifiedCount = 0;
    let unverifiedCount = 0;
    let unverifiedEligibleForPurge = 0;
    let frequentBuyersCount = 0;
    let frequentBuyersRevenue = 0;
    let totalRepeatOrders = 0;
    let vipCount = 0;

    const frequentList: any[] = [];

    for (const c of registeredCustomers) {
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
      oneTimeCustomersCount,
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

  router.post(
    '/customers/upload-attachment',
    requirePermission('customers'),
    (req: Request, res: Response, next: NextFunction) => {
      broadcastDocUpload.single('file')(req, res, (err: unknown) => {
        if (!err) return next();
        if (err instanceof multer.MulterError) {
          if (err.code === 'LIMIT_FILE_SIZE') {
            res.status(400).json({ error: 'Attachment file size exceeds the 10 MB limit.' });
            return;
          }
          res.status(400).json({ error: err.message || 'File upload error.' });
          return;
        }
        res.status(400).json({ error: err instanceof Error ? err.message : 'Invalid attachment file.' });
      });
    },
    async (req, res) => {
      if (!req.file) {
        res.status(400).json({ error: 'Please choose an image, PDF, document, or spreadsheet file to attach.' });
        return;
      }
      try {
        const mime = req.file.mimetype || 'application/octet-stream';
        const isImg = isImageMime(mime, req.file.originalname);
        const uploaded = await mediaStorage.uploadBuffer({
          buffer: req.file.buffer,
          filename: req.file.originalname || 'attachment',
          folder: 'broadcast',
          mimeType: mime,
          resourceType: isImg ? 'image' : 'raw',
        });
        res.json({
          attachment: {
            filename: req.file.originalname || 'attachment',
            url: uploaded.url,
            mimeType: mime,
            sizeBytes: req.file.size || req.file.buffer.length,
            publicId: uploaded.publicId,
            content: req.file.buffer.toString('base64'),
          },
        });
      } catch (err) {
        const status = (err as { statusCode?: number }).statusCode || 500;
        res.status(status).json({
          error: err instanceof Error ? err.message : 'Attachment upload to media storage failed.',
        });
      }
    }
  );

  router.post('/customers/preview-email', requirePermission('customers'), maybeBroadcastMultipart, async (req, res) => {
    if (typeof req.body.attachments === 'string') {
      try { req.body.attachments = JSON.parse(req.body.attachments); } catch { }
    }

    const previewSchema = z.object({
      recipientName: z.string().optional().default('Valued Patron'),
      recipientEmail: z.string().optional().default('patron@sethandsons.com'),
      subject: z.string().trim().min(1, 'Subject is required'),
      message: z.string().trim().min(1, 'Message body is required'),
      previewText: z.string().trim().optional(),
      ctaText: z.string().trim().optional(),
      ctaUrl: z.string().trim().optional(),
      attachments: z.array(z.object({
        filename: z.string(),
        url: z.string(),
        mimeType: z.string().optional().default('application/octet-stream'),
        sizeBytes: z.number().optional().default(0),
        publicId: z.string().optional(),
        content: z.string().optional(),
      })).optional(),
    });

    const parsed = previewSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid preview parameters.' });
      return;
    }

    const { recipientName, recipientEmail, subject, message, previewText, ctaText, ctaUrl } = parsed.data;
    const allAttachments: BroadcastEmailAttachment[] = [...(parsed.data.attachments || [])];

    const files = (req.files as Express.Multer.File[] | undefined) || [];
    if (files.length > 0) {
      for (const file of files) {
        const mime = file.mimetype || 'application/octet-stream';
        allAttachments.push({
          filename: file.originalname || 'attachment',
          url: `data:${mime};base64,${file.buffer.toString('base64')}`,
          mimeType: mime,
          sizeBytes: file.size || file.buffer.length,
          content: file.buffer.toString('base64'),
        });
      }
    }

    const origin = getRequestOrigin(req, config?.appUrl || 'http://localhost:3000');
    const brandLogoUrl = await getBrandLogoUrl();
    const { imagesHtml, docsHtml } = generateEmailAttachmentsHtml(allAttachments, origin);

    let bodyHtml = `
      <p style="margin:0 0 16px 0;font-size:16px;line-height:24px;color:#183D32;font-weight:600;">
        Namaste ${escapeHtml(recipientName)},
      </p>
      <div style="font-size:15px;line-height:26px;color:#27332D;white-space:pre-wrap;margin-bottom:20px;">
        ${escapeHtml(message).replace(/\n/g, '<br/>')}
      </div>
      ${imagesHtml}
    `;

    if (ctaText && ctaUrl) {
      bodyHtml += `
        <div style="margin:28px 0;text-align:center;">
          ${ctaButtonHtml(ctaText, ctaUrl)}
        </div>
      `;
    }

    bodyHtml += docsHtml;

    const html = wrapInBrandEmailLayout({
      brandLogoUrl,
      brandName: BRAND_CONFIG.name,
      supportEmail: BRAND_CONFIG.supportEmail,
      preheader: previewText || subject,
      bodyHtml,
    });

    res.json({
      html,
      subject,
      recipientName,
      recipientEmail,
      attachmentsCount: allAttachments.length,
    });
  });

  router.post('/customers/mass-email', requirePermission('customers'), maybeBroadcastMultipart, async (req, res) => {
    if (typeof req.body.customerIds === 'string') {
      try { req.body.customerIds = JSON.parse(req.body.customerIds); } catch { }
    }
    if (typeof req.body.attachments === 'string') {
      try { req.body.attachments = JSON.parse(req.body.attachments); } catch { }
    }

    const massSchema = z.object({
      segment: z.enum(['all', 'frequent', 'vip', 'unverified', 'inactive', 'selected']),
      customerIds: z.array(z.string()).optional(),
      subject: z.string().trim().min(2, 'Subject must be at least 2 characters'),
      message: z.string().trim().min(5, 'Message body must be at least 5 characters'),
      previewText: z.string().trim().optional(),
      ctaText: z.string().trim().optional(),
      ctaUrl: z.string().trim().optional(),
      attachments: z.array(z.object({
        filename: z.string(),
        url: z.string(),
        mimeType: z.string().optional().default('application/octet-stream'),
        sizeBytes: z.number().optional().default(0),
        publicId: z.string().optional(),
        content: z.string().optional(),
      })).optional(),
    });

    const parsed = massSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid parameters.' });
      return;
    }

    const { segment, customerIds, subject, message, previewText, ctaText, ctaUrl } = parsed.data;
    const allAttachments: BroadcastEmailAttachment[] = [...(parsed.data.attachments || [])];

    const files = (req.files as Express.Multer.File[] | undefined) || [];
    if (files.length > 0) {
      for (const file of files) {
        const mime = file.mimetype || 'application/octet-stream';
        const isImg = isImageMime(mime, file.originalname);
        const uploaded = await mediaStorage.uploadBuffer({
          buffer: file.buffer,
          filename: file.originalname || 'attachment',
          folder: 'broadcast',
          mimeType: mime,
          resourceType: isImg ? 'image' : 'raw',
        });
        allAttachments.push({
          filename: file.originalname || 'attachment',
          url: uploaded.url,
          mimeType: mime,
          sizeBytes: file.size || file.buffer.length,
          publicId: uploaded.publicId,
          content: file.buffer.toString('base64'),
        });
      }
    }

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

    const origin = getRequestOrigin(req, config?.appUrl || 'http://localhost:3000');
    const brandLogoUrl = await getBrandLogoUrl();
    const { imagesHtml, docsHtml } = generateEmailAttachmentsHtml(allAttachments, origin);

    let dispatched = 0;
    for (const cust of targetDocs) {
      let bodyHtml = `
        <p style="margin:0 0 16px 0;font-size:16px;line-height:24px;color:#183D32;font-weight:600;">
          Namaste ${escapeHtml(cust.name)},
        </p>
        <div style="font-size:15px;line-height:26px;color:#27332D;white-space:pre-wrap;margin-bottom:20px;">
          ${escapeHtml(message).replace(/\n/g, '<br/>')}
        </div>
        ${imagesHtml}
      `;

      if (ctaText && ctaUrl) {
        bodyHtml += `
          <div style="margin:28px 0;text-align:center;">
            ${ctaButtonHtml(ctaText, ctaUrl)}
          </div>
        `;
      }

      bodyHtml += docsHtml;

      const html = wrapInBrandEmailLayout({
        brandLogoUrl,
        brandName: BRAND_CONFIG.name,
        supportEmail: BRAND_CONFIG.supportEmail,
        preheader: previewText || subject,
        bodyHtml,
      });

      const textAttachments = allAttachments.length > 0
        ? `\n\nAttachments:\n` + allAttachments.map(a => `- ${a.filename}: ${a.url}`).join('\n')
        : '';

      const job = await queue.enqueue({
        recipient: cust.email,
        customerId: cust.id,
        emailType: 'admin_broadcast',
        subject,
        html,
        text: `${message}\n\n${ctaText && ctaUrl ? `${ctaText}: ${ctaUrl}\n\n` : ''}${textAttachments}\n\nWarm regards,\nSeth And Sons DryFruits`,
        attachments: allAttachments.map(a => ({
          filename: a.filename,
          url: a.url,
          contentType: a.mimeType,
          sizeBytes: a.sizeBytes,
          publicId: a.publicId,
          content: a.content,
        })),
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
      details: { segment, recipientsCount: dispatched, subject, attachmentsCount: allAttachments.length },
      ipAddress: req.ip || '',
    });

    res.json({
      dispatchedCount: dispatched,
      message: `Mass broadcast successfully delivered to ${dispatched} patrons${allAttachments.length > 0 ? ` with ${allAttachments.length} attachment(s)` : ''}.`,
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
        } catch { }
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
      } catch { }
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

  router.post('/customers/:id/send-email', requirePermission('customers'), maybeBroadcastMultipart, async (req, res) => {
    let target: any = await db.models.Customer.findOne({ id: req.params.id, role: 'customer' }).lean();
    if (!target && req.params.id && req.params.id.length === 24) {
      target = await db.models.Customer.findOne({ _id: req.params.id, role: 'customer' }).lean();
    }
    if (!target) {
      const ord = await db.models.Order.findOne({
        $or: [{ customerId: req.params.id }, { id: req.params.id }, { orderNumber: req.params.id }]
      }).lean();
      if (ord) {
        const cSnap = (ord.customerSnapshot as any) || {};
        const dAddr = (ord.deliveryAddress as any) || {};
        const email = normalizeEmail(cSnap.email || dAddr.email || '');
        if (email) {
          target = {
            id: ord.customerId || ord.id,
            name: (cSnap.name || dAddr.fullName || 'Valued Patron').trim(),
            email,
            role: 'customer',
          };
        }
      }
    }

    if (!target || !target.email) {
      res.status(404).json({ error: 'Customer not found or no valid email on file.' });
      return;
    }

    if (typeof req.body.attachments === 'string') {
      try { req.body.attachments = JSON.parse(req.body.attachments); } catch { }
    }

    const emailSchema = z.object({
      subject: z.string().trim().min(2, 'Subject must be at least 2 characters'),
      message: z.string().trim().min(5, 'Message body must be at least 5 characters'),
      previewText: z.string().trim().optional(),
      ctaText: z.string().trim().optional(),
      ctaUrl: z.string().trim().optional(),
      attachments: z.array(z.object({
        filename: z.string(),
        url: z.string(),
        mimeType: z.string().optional().default('application/octet-stream'),
        sizeBytes: z.number().optional().default(0),
        publicId: z.string().optional(),
        content: z.string().optional(),
      })).optional(),
    });

    const parsed = emailSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid email parameters.' });
      return;
    }

    const { subject, message, previewText, ctaText, ctaUrl } = parsed.data;
    const allAttachments: BroadcastEmailAttachment[] = [...(parsed.data.attachments || [])];

    const files = (req.files as Express.Multer.File[] | undefined) || [];
    if (files.length > 0) {
      for (const file of files) {
        const mime = file.mimetype || 'application/octet-stream';
        const isImg = isImageMime(mime, file.originalname);
        const uploaded = await mediaStorage.uploadBuffer({
          buffer: file.buffer,
          filename: file.originalname || 'attachment',
          folder: 'broadcast',
          mimeType: mime,
          resourceType: isImg ? 'image' : 'raw',
        });
        allAttachments.push({
          filename: file.originalname || 'attachment',
          url: uploaded.url,
          mimeType: mime,
          sizeBytes: file.size || file.buffer.length,
          publicId: uploaded.publicId,
          content: file.buffer.toString('base64'),
        });
      }
    }

    const origin = getRequestOrigin(req, config?.appUrl || 'http://localhost:3000');
    const brandLogoUrl = await getBrandLogoUrl();
    const { imagesHtml, docsHtml } = generateEmailAttachmentsHtml(allAttachments, origin);

    let bodyHtml = `
      <p style="margin:0 0 16px 0;font-size:16px;line-height:24px;color:#183D32;font-weight:600;">
        Namaste ${escapeHtml(target.name)},
      </p>
      <div style="font-size:15px;line-height:26px;color:#27332D;white-space:pre-wrap;margin-bottom:20px;">
        ${escapeHtml(message).replace(/\n/g, '<br/>')}
      </div>
      ${imagesHtml}
    `;

    if (ctaText && ctaUrl) {
      bodyHtml += `
        <div style="margin:28px 0;text-align:center;">
          ${ctaButtonHtml(ctaText, ctaUrl)}
        </div>
      `;
    }

    bodyHtml += docsHtml;

    const html = wrapInBrandEmailLayout({
      brandLogoUrl,
      brandName: BRAND_CONFIG.name,
      supportEmail: BRAND_CONFIG.supportEmail,
      preheader: previewText || subject,
      bodyHtml,
    });

    const textAttachments = allAttachments.length > 0
      ? `\n\nAttachments:\n` + allAttachments.map(a => `- ${a.filename}: ${a.url}`).join('\n')
      : '';

    const job = await queue.enqueue({
      recipient: target.email,
      customerId: target.id,
      emailType: 'admin_direct_message',
      subject,
      html,
      text: `${message}\n\n${ctaText && ctaUrl ? `${ctaText}: ${ctaUrl}\n\n` : ''}${textAttachments}\n\nWarm regards,\nSeth And Sons DryFruits`,
      attachments: allAttachments.map(a => ({
        filename: a.filename,
        url: a.url,
        contentType: a.mimeType,
        sizeBytes: a.sizeBytes,
        publicId: a.publicId,
        content: a.content,
      })),
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
      details: { email: target.email, subject, attachmentsCount: allAttachments.length },
      ipAddress: req.ip || '',
    });

    res.json({ message: `Custom email dispatched to ${target.name} (${target.email})${allAttachments.length > 0 ? ` with ${allAttachments.length} attachment(s)` : ''}.` });
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
      message: `Purchase order #${existing.purchaseNumber} deleted${existing.status === 'received' ? ' and stock reversed' : ''
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
        'Sampling',
        'Product Sampling',
      ]),
      title: z.string().trim().min(2),
      amount: z.number().positive(),
      expenseDate: z.string().min(4),
      vendor: z.string().optional().default(''),
      paymentMode: z.string().optional().default('Bank Transfer'),
      receiptUrl: z.string().optional().nullable(),
      notes: z.string().optional().default(''),
      productId: z.string().optional().nullable(),
      productName: z.string().optional().nullable(),
      categoryId: z.string().optional().nullable(),
      categoryName: z.string().optional().nullable(),
      sampleWeight: z.number().optional().nullable(),
      sampleUnit: z.string().optional().nullable(),
      sampleGrams: z.number().optional().nullable(),
      costPerKg: z.number().optional().nullable(),
      recipientName: z.string().optional().nullable(),
      companyName: z.string().optional().nullable(),
      miscExpenseAmount: z.number().optional().nullable().default(0),
      miscExpenseNote: z.string().optional().default(''),
      miscExpenses: z
        .array(
          z.object({
            amount: z.number().optional().default(0),
            note: z.string().optional().default(''),
          })
        )
        .optional()
        .default([]),
      samplingItems: z
        .array(
          z.object({
            productId: z.string().optional().nullable(),
            productName: z.string().optional().nullable(),
            categoryId: z.string().optional().nullable(),
            categoryName: z.string().optional().nullable(),
            sampleWeight: z.number().optional().nullable(),
            sampleUnit: z.string().optional().nullable(),
            sampleGrams: z.number().optional().nullable(),
            costPerKg: z.number().optional().nullable(),
            itemCost: z.number().optional().nullable(),
          })
        )
        .optional()
        .default([]),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid expense data' });
      return;
    }
    const d = parsed.data;

    if (d.category === 'Sampling' || d.category === 'Product Sampling') {
      const rec = (d.recipientName || '').trim();
      const comp = (d.companyName || '').trim();
      if (!rec && !comp && !d.vendor.trim()) {
        res.status(400).json({ error: 'Please provide either the Recipient Name or Company Name for the product sample.' });
        return;
      }
    }

    const id = `exp_${crypto.randomUUID()}`;
    const now = new Date().toISOString();
    const vendorFormatted = (d.category === 'Sampling' || d.category === 'Product Sampling')
      ? [d.recipientName?.trim(), d.companyName?.trim() ? `(${d.companyName.trim()})` : ''].filter(Boolean).join(' ') || d.vendor || 'Owner Sample'
      : d.vendor;

    const firstSamplingItem = d.samplingItems?.[0];
    const derivedProductName =
      d.productName ||
      (d.samplingItems && d.samplingItems.length > 0
        ? d.samplingItems
            .map(i => i.productName)
            .filter(Boolean)
            .join(', ')
        : null);
    const derivedSampleGrams =
      typeof d.sampleGrams === 'number'
        ? d.sampleGrams
        : d.samplingItems && d.samplingItems.length > 0
          ? d.samplingItems.reduce((acc, i) => acc + (Number(i.sampleGrams) || 0), 0)
          : null;

    await db.models.Expense.create({
      id,
      category: d.category,
      title: d.title,
      amount: d.amount,
      expenseDate: d.expenseDate,
      vendor: vendorFormatted,
      paymentMode: d.paymentMode,
      receiptUrl: d.receiptUrl || null,
      notes: d.notes,
      createdBy: req.user!.email,
      productId: d.productId || firstSamplingItem?.productId || null,
      productName: derivedProductName,
      categoryId: d.categoryId || firstSamplingItem?.categoryId || null,
      categoryName: d.categoryName || firstSamplingItem?.categoryName || null,
      sampleWeight: typeof d.sampleWeight === 'number' ? d.sampleWeight : (firstSamplingItem?.sampleWeight ?? null),
      sampleUnit: d.sampleUnit || firstSamplingItem?.sampleUnit || null,
      sampleGrams: derivedSampleGrams,
      costPerKg: typeof d.costPerKg === 'number' ? d.costPerKg : (firstSamplingItem?.costPerKg ?? null),
      recipientName: d.recipientName || null,
      companyName: d.companyName || null,
      miscExpenseAmount: typeof d.miscExpenseAmount === 'number' ? d.miscExpenseAmount : 0,
      miscExpenseNote: d.miscExpenseNote || '',
      miscExpenses: d.miscExpenses || [],
      samplingItems: d.samplingItems || [],
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
    const vendorFormatted = (b.category === 'Sampling' || b.category === 'Product Sampling')
      ? [b.recipientName?.trim(), b.companyName?.trim() ? `(${b.companyName.trim()})` : ''].filter(Boolean).join(' ') || b.vendor || 'Owner Sample'
      : (b.vendor || '');

    const firstSamplingItem = Array.isArray(b.samplingItems) ? b.samplingItems[0] : null;
    const derivedProductName =
      b.productName ||
      (Array.isArray(b.samplingItems) && b.samplingItems.length > 0
        ? b.samplingItems
            .map((i: any) => i.productName)
            .filter(Boolean)
            .join(', ')
        : null);
    const derivedSampleGrams =
      typeof b.sampleGrams === 'number'
        ? Number(b.sampleGrams)
        : Array.isArray(b.samplingItems) && b.samplingItems.length > 0
          ? b.samplingItems.reduce((acc: number, i: any) => acc + (Number(i.sampleGrams) || 0), 0)
          : null;

    await db.models.Expense.updateOne(
      { id: req.params.id },
      {
        $set: {
          category: b.category,
          title: b.title,
          amount: Number(b.amount),
          expenseDate: b.expenseDate,
          vendor: vendorFormatted,
          paymentMode: b.paymentMode || 'Bank Transfer',
          receiptUrl: b.receiptUrl || null,
          notes: b.notes || '',
          productId: b.productId || firstSamplingItem?.productId || null,
          productName: derivedProductName,
          categoryId: b.categoryId || firstSamplingItem?.categoryId || null,
          categoryName: b.categoryName || firstSamplingItem?.categoryName || null,
          sampleWeight: typeof b.sampleWeight === 'number' ? Number(b.sampleWeight) : (firstSamplingItem?.sampleWeight ?? null),
          sampleUnit: b.sampleUnit || firstSamplingItem?.sampleUnit || null,
          sampleGrams: derivedSampleGrams,
          costPerKg: typeof b.costPerKg === 'number' ? Number(b.costPerKg) : (firstSamplingItem?.costPerKg ?? null),
          recipientName: b.recipientName || null,
          companyName: b.companyName || null,
          miscExpenseAmount: typeof b.miscExpenseAmount === 'number' ? Number(b.miscExpenseAmount) : 0,
          miscExpenseNote: b.miscExpenseNote || '',
          ...(Array.isArray(b.miscExpenses) ? { miscExpenses: b.miscExpenses } : {}),
          ...(Array.isArray(b.samplingItems) ? { samplingItems: b.samplingItems } : {}),
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

    if (type === 'order_locations') {
      const f: Record<string, unknown> = { status: { $nin: ['cancelled', 'returned'] } };
      const r = isoRange();
      if (r) f.createdAt = r;
      const orders = await db.models.Order.find(f, { _id: 0 }).lean();
      const cityMap = new Map<
        string,
        {
          city: string;
          state: string;
          orderCount: number;
          totalRevenue: number;
          custIds: Set<string>;
        }
      >();
      let totalOrders = 0;
      for (const o of orders) {
        let addr: any = {};
        if (typeof o.deliveryAddress === 'string') {
          try {
            addr = JSON.parse(o.deliveryAddress);
          } catch { }
        } else if (o.deliveryAddress && typeof o.deliveryAddress === 'object') {
          addr = o.deliveryAddress;
        }
        const rawCity = addr.city || o.shippingCity || '';
        const rawState = addr.state || '';
        const city = normalizeCityName(rawCity);
        const state = normalizeStateName(rawState, rawCity);
        const key = `${city}::${state}`;
        const cur = cityMap.get(key) || {
          city,
          state,
          orderCount: 0,
          totalRevenue: 0,
          custIds: new Set<string>(),
        };
        cur.orderCount += 1;
        cur.totalRevenue += Number(o.totalAmount || 0);
        cur.custIds.add(String(o.customerId || o.id));
        cityMap.set(key, cur);
        totalOrders += 1;
      }
      const rows = Array.from(cityMap.values())
        .sort((a, b) => b.orderCount - a.orderCount || b.totalRevenue - a.totalRevenue)
        .map(c => ({
          city: c.city,
          state: c.state,
          orderCount: c.orderCount,
          totalRevenue: c.totalRevenue,
          uniqueCustomers: c.custIds.size,
          aov: c.orderCount > 0 ? Math.round(c.totalRevenue / c.orderCount) : 0,
          share: totalOrders > 0 ? `${Math.round((c.orderCount / totalOrders) * 1000) / 10}%` : '0%',
        }));
      return {
        title: 'Most Customer Ordered State & City Report',
        subtitle: rangeLabel,
        columns: [
          { header: 'City', key: 'city', width: 22 },
          { header: 'State', key: 'state', width: 22 },
          { header: 'Orders Count', key: 'orderCount', width: 14 },
          { header: 'Total Revenue (INR)', key: 'totalRevenue', width: 18 },
          { header: 'Unique Customers', key: 'uniqueCustomers', width: 16 },
          { header: 'Avg Order Value (INR)', key: 'aov', width: 18 },
          { header: 'Order Share (%)', key: 'share', width: 14 },
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
