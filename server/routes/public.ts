import crypto from 'node:crypto';
import path from 'node:path';
import { Router } from 'express';
import {
  parseWeightGrams,
  isSuratCity,
  SURAT_MARGIN_PERCENT,
  OTHER_CITY_MARGIN_PERCENT,
  GUEST_MARGIN_PERCENT,
  GUEST_HIDDEN_PRODUCT_IDS,
  getProductBaseCost,
  getVariantBaseCost,
  calculateDynamicSellingPrice,
} from '../../shared/catalogSeed.ts';
import { AppConfig } from '../config.ts';
import { getWebsiteSettingsDoc, getBusinessSettingsDoc, MongoDatabase } from '../db/mongo.ts';
import { createRateLimiter } from '../middleware/security.ts';
import { createCloudinaryStorage, MediaStorageService } from '../services/cloudinaryService.ts';
import { createEmailTransport, EmailTransport } from '../services/emailProvider.ts';
import { EmailQueueService } from '../services/emailQueue.ts';
import { runSystemPreflight } from '../services/preflightService.ts';
import { hashToken, normalizeEmail, verifyHmacSignature } from '../utils/crypto.ts';
import { CacheService, createCacheService } from '../services/cacheService.ts';

function parseProductRow(row: Record<string, any>) {
  const safeArr = (val: unknown, fallback: unknown[] = []) => {
    if (Array.isArray(val)) return val;
    if (typeof val === 'string') {
      try {
        const parsed = JSON.parse(val);
        return Array.isArray(parsed) ? parsed : fallback;
      } catch {
        return fallback;
      }
    }
    return fallback;
  };
  const safeObj = (val: unknown, fallback: Record<string, unknown> = {}) => {
    if (val && typeof val === 'object' && !Array.isArray(val)) return val;
    if (typeof val === 'string') {
      try {
        return JSON.parse(val);
      } catch {
        return fallback;
      }
    }
    return fallback;
  };
  const rawGallery = safeArr(row.gallery, [row.image]);
  // Single image policy on user side: keep only the 1st image and remove secondary images
  const primaryImg = (rawGallery[0] || row.image || '').trim();
  const gallery = primaryImg ? [primaryImg] : [];
  const images = gallery;

  return {
    id: row.id,
    name: row.name,
    hindiName: row.hindiName || undefined,
    subtitle: row.subtitle,
    sku: row.sku || undefined,
    barcode: row.barcode || undefined,
    purchasePrice: Number(row.purchasePrice || 0),
    price: Number(row.price),
    discountPrice: row.discountPrice ? Number(row.discountPrice) : null,
    gstRate: Number(row.gstRate ?? 0),
    stock: Number(row.stock ?? 0),
    minStockAlert: Number(row.minStockAlert ?? 5),
    unit: row.unit,
    weightLabel: row.weightLabel || undefined,
    step: Number(row.step),
    minQty: Number(row.minQty),
    category: row.category,
    categoryId: row.categoryId || undefined,
    image: row.image,
    images,
    gallery,
    fallbackImage: row.fallbackImage || undefined,
    videoUrl: row.videoUrl || undefined,
    videoDetails: row.videoDetails ? safeObj(row.videoDetails) : undefined,
    description: row.description,
    origin: row.origin,
    grade: row.grade,
    expiryDate: row.expiryDate || null,
    storageInstructions: row.storageInstructions || undefined,
    featured: Boolean(row.featured),
    features: safeArr(row.features, []),
    variants: safeArr(row.variants, []),
    tasteProfile: row.tasteProfile,
    jammuStory: row.jammuStory,
    inStock: Boolean(row.inStock && Number(row.stock ?? 0) > 0),
    harvestSeason: row.harvestSeason,
    nutrition: safeObj(row.nutrition, {}),
    status: row.status,
    createdAt: row.createdAt,
  };
}

let cachedSettings: { data: any; expiresAt: number } | null = null;
let cachedCategories: { data: any; expiresAt: number } | null = null;
let cachedProducts: { data: any; expiresAt: number } | null = null;
let activeCacheService: CacheService | null = null;

export function invalidatePublicCache(cache?: CacheService) {
  cachedSettings = null;
  cachedCategories = null;
  cachedProducts = null;
  const targetCache = cache || activeCacheService;
  if (targetCache) {
    targetCache.invalidateCatalog().catch(() => {});
  }
}

export function createPublicRouter(
  db: MongoDatabase,
  config: AppConfig,
  deps?: {
    transport?: EmailTransport;
    queue?: EmailQueueService;
    mediaStorage?: MediaStorageService;
    cache?: CacheService;
  }
) {
  const router = Router();
  const cache = deps?.cache || createCacheService(config);
  activeCacheService = cache;

  const preflightRateLimit = createRateLimiter({
    windowMs: 60 * 1000,
    max: 60,
    keyPrefix: 'system-preflight',
  });
  const transport = deps?.transport || createEmailTransport(config);
  const mediaStorage = deps?.mediaStorage || createCloudinaryStorage(config);

  // Public Liveness Probe (Kubernetes / Cloud Load Balancers)
  router.get('/health/live', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // Internal Readiness Probe (checks essential service dependencies)
  router.get('/health/ready', (_req, res) => {
    const isDbReady = db.conn.readyState === 1;
    if (!isDbReady) {
      res.status(503).json({ status: 'unready', database: 'disconnected', timestamp: new Date().toISOString() });
      return;
    }
    res.json({ status: 'ready', database: 'connected', timestamp: new Date().toISOString() });
  });

  router.get('/health', (_req, res) => {
    const isDbConnected = db.conn.readyState === 1;
    const cacheStats = cache.getStats();
    const memory = process.memoryUsage();

    res.json({
      status: isDbConnected ? 'ok' : 'degraded',
      database: isDbConnected ? 'mongodb-connected' : 'mongodb-connecting',
      databaseState: {
        status: isDbConnected ? 'mongodb-connected' : 'mongodb-connecting',
        readyState: db.conn.readyState,
      },
      cache: {
        backend: cacheStats.backend,
        isRedisConnected: cacheStats.isRedisConnected,
        hits: cacheStats.hits,
        misses: cacheStats.misses,
      },
      queue: {
        provider: config.emailProvider,
        running: deps?.queue ? true : false,
      },
      process: {
        uptimeSeconds: Math.round(process.uptime()),
        memoryRssMb: Math.round(memory.rss / (1024 * 1024)),
        memoryHeapUsedMb: Math.round(memory.heapUsed / (1024 * 1024)),
      },
      emailProvider: config.emailProvider,
      timestamp: new Date().toISOString(),
    });
  });

  router.get('/system/preflight', preflightRateLimit, async (req, res) => {
    const localPort = req.socket?.localPort;
    const selfBaseUrl = localPort && localPort > 0 ? `http://127.0.0.1:${localPort}` : null;
    const report = await runSystemPreflight({
      db,
      config,
      transport,
      queue: deps?.queue || null,
      mediaStorage,
      selfBaseUrl,
      forceRefresh: req.query.fresh === '1',
    });
    res.json(report);
  });

  router.get('/settings/public', async (_req, res) => {
    res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=300, stale-while-revalidate=600');
    const cached = await cache.get<any>('public:settings');
    if (cached) {
      return res.json(cached);
    }
    const website = await getWebsiteSettingsDoc(db);
    const biz = await getBusinessSettingsDoc(db);
    const data = {
      website,
      currency: biz.currency || 'INR ₹',
      business: {
        businessName: biz.businessName,
        defaultGstRate: Number(biz.defaultGstRate ?? 0),
        defaultShippingCharge: Number(biz.defaultShippingCharge ?? 0),
        freeShippingThreshold: Number(biz.freeShippingThreshold ?? 0),
        contactNumber: biz.contactNumber,
        businessEmail: biz.businessEmail,
      },
    };
    await cache.set('public:settings', data, 60);
    res.json(data);
  });

  router.get('/categories', async (_req, res) => {
    res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=300, stale-while-revalidate=600');
    const cached = await cache.get<{ categories: any[] }>('public:categories');
    if (cached) {
      return res.json(cached);
    }
    const categories = await db.models.Category.find(
      { active: true },
      { id: 1, name: 1, slug: 1, description: 1, sortOrder: 1, _id: 0 }
    )
      .sort({ sortOrder: 1, name: 1 })
      .lean();
    const data = { categories };
    await cache.set('public:categories', data, 120);
    res.json(data);
  });

  router.get('/products', async (req, res) => {
    res.setHeader('Vary', 'Cookie');
    const userMargin = req.user
      ? (req.user.profitMargin ?? (req.user.shippingAddress?.city && !isSuratCity(req.user.shippingAddress.city) ? OTHER_CITY_MARGIN_PERCENT : SURAT_MARGIN_PERCENT))
      : GUEST_MARGIN_PERCENT;

    const [rows, variantsAll, categories] = await Promise.all([
      db.models.Product.find({ status: 'published' }).sort({ createdAt: 1 }).lean(),
      db.models.ProductVariant.find(
        { active: true },
        { id: 1, productId: 1, weightLabel: 1, sku: 1, sellingPrice: 1, discountPrice: 1, stock: 1, active: 1, purchasePrice: 1, _id: 0 }
      )
        .sort({ sellingPrice: 1 })
        .lean(),
      db.models.Category.find({}, { id: 1, name: 1, _id: 0 }).lean(),
    ]);

    const catMap = new Map(categories.map(c => [String(c.id), String(c.name)]));

    const isSuratUser = Boolean(req.user && isSuratCity(req.user.shippingAddress?.city));
    const visibleRows = rows;

    const products = visibleRows.map(r => {
      const base = parseProductRow(r);
      const effectiveInStock = isSuratUser ? Boolean(r.inStock && Number(r.stock ?? 0) > 0) : true;
      const baseCost = getProductBaseCost(base);
      const prodWeight = parseWeightGrams(base.weightLabel || (base.unit === 'gram' ? '1g' : '1kg')) || (base.unit === 'gram' ? 1 : 1000);
      const dynamicPrice = calculateDynamicSellingPrice(baseCost, userMargin, prodWeight);
      const dynamicDiscountPrice =
        base.discountPrice && base.discountPrice > 0
          ? calculateDynamicSellingPrice(Math.round(base.discountPrice / 1.40), userMargin, prodWeight)
          : null;

      const weightVariants = variantsAll
        .filter(v => v.productId === r.id)
        .sort((a, b) => {
          const ga = parseWeightGrams(String(a.weightLabel)) ?? Number.MAX_SAFE_INTEGER;
          const gb = parseWeightGrams(String(b.weightLabel)) ?? Number.MAX_SAFE_INTEGER;
          if (ga !== gb) return ga - gb;
          return Number(a.sellingPrice || 0) - Number(b.sellingPrice || 0);
        })
        .map(v => {
          const vWeight = parseWeightGrams(String(v.weightLabel)) || 1000;
          let vBaseCost = getVariantBaseCost(v as any);
          if ((!vBaseCost || vBaseCost <= 0) && baseCost > 0) {
            vBaseCost = Number(((baseCost / prodWeight) * vWeight).toFixed(2));
          }
          const vDynamicPrice = calculateDynamicSellingPrice(vBaseCost, userMargin, vWeight);
          const vDynamicDiscount =
            v.discountPrice && Number(v.discountPrice) > 0
              ? calculateDynamicSellingPrice(Math.round(Number(v.discountPrice) / 1.40), userMargin, vWeight)
              : null;
          return {
            id: String(v.id),
            productId: String(v.productId),
            weightLabel: String(v.weightLabel),
            sku: String(v.sku),
            appliedProfitMargin: userMargin,
            sellingPrice: vDynamicPrice,
            discountPrice: vDynamicDiscount,
            stock: isSuratUser ? Number(v.stock ?? 0) : 999,
            active: isSuratUser ? Boolean(v.active) : true,
          };
        });

      const {
        purchasePrice: _sensitivePurchasePrice,
        minStockAlert: _sensitiveMinStockAlert,
        ...publicBase
      } = base;

      return {
        ...publicBase,
        inStock: effectiveInStock,
        appliedProfitMargin: userMargin,
        price: dynamicPrice,
        discountPrice: dynamicDiscountPrice,
        categoryName: r.categoryId ? catMap.get(String(r.categoryId)) || String(r.category) : String(r.category),
        weightVariants,
      };
    });

    res.json({ products });
  });

  router.post('/coupons/validate', async (req, res) => {
    const code = typeof req.body?.code === 'string' ? req.body.code.trim().toUpperCase() : '';
    const subtotal = Number(req.body?.subtotal || 0);
    if (!code) {
      res.status(400).json({ error: 'Please enter a coupon code.' });
      return;
    }

    const now = new Date().toISOString();
    const coupon = await db.models.Coupon.findOne({ code, active: true }).lean();

    if (!coupon) {
      res.status(404).json({ error: 'Invalid or inactive coupon code.' });
      return;
    }
    if (coupon.startDate && coupon.startDate > now) {
      res.status(400).json({ error: 'This promotional code is not active yet.' });
      return;
    }
    if (coupon.endDate && coupon.endDate < now) {
      res.status(400).json({ error: 'This coupon code has expired.' });
      return;
    }
    if (coupon.usageLimit && (coupon.usedCount || 0) >= coupon.usageLimit) {
      res.status(400).json({ error: 'This coupon code has reached its maximum usage limit.' });
      return;
    }
    if (subtotal < coupon.minOrderValue) {
      res.status(400).json({
        error: `Minimum order value of ₹${coupon.minOrderValue} is required for code ${coupon.code}.`,
      });
      return;
    }

    let discount =
      coupon.discountType === 'percentage'
        ? Math.round((subtotal * coupon.discountValue) / 100)
        : Math.round(coupon.discountValue);

    if (coupon.maxDiscount && discount > coupon.maxDiscount) {
      discount = Math.round(coupon.maxDiscount);
    }
    discount = Math.min(discount, subtotal);

    res.json({
      valid: true,
      coupon: {
        code: coupon.code,
        title: coupon.title,
        discountType: coupon.discountType,
        discountValue: coupon.discountValue,
      },
      discountAmount: discount,
    });
  });

  async function processUnsubscribe(token: string, reason?: string) {
    const tokenHash = hashToken(token);
    const unsubRow = await db.models.EmailUnsubscribe.findOne({ unsubscribeTokenHash: tokenHash }).lean();

    if (!unsubRow) {
      return { ok: false, status: 404, error: 'Invalid or expired unsubscribe link.' };
    }

    const now = new Date().toISOString();
    await db.models.EmailUnsubscribe.updateOne(
      { id: unsubRow.id },
      {
        $set: {
          unsubscribedAt: unsubRow.unsubscribedAt || now,
          reason: reason || unsubRow.reason || 'one_click_unsubscribe',
        },
      }
    );

    const zeroMarketing = {
      transactional: {
        orderConfirmation: true,
        shipmentUpdates: true,
        deliveryUpdates: true,
        cancellationAndRefund: true,
        accountSecurity: true,
      },
      marketing: {
        newProductAnnouncements: false,
        festivalOffers: false,
        promotionalDiscounts: false,
        specialCampaigns: false,
        newsletter: false,
      },
    };

    const filter = unsubRow.customerId
      ? { id: unsubRow.customerId }
      : { email: normalizeEmail(unsubRow.email) };

    await db.models.Customer.updateOne(filter, {
      $set: {
        marketingConsent: false,
        unsubscribedAt: now,
        emailPreferences: zeroMarketing,
        updatedAt: now,
      },
    });

    return { ok: true, email: unsubRow.email };
  }

  router.get('/unsubscribe', async (req, res) => {
    const token = typeof req.query.token === 'string' ? req.query.token.trim() : '';
    if (!token) {
      res.status(400).json({ error: 'Unsubscribe token is required.' });
      return;
    }
    const result = await processUnsubscribe(token);
    if (!result.ok) {
      res.status(result.status || 400).json({ error: result.error });
      return;
    }
    res.json({
      message: 'You have been unsubscribed from all promotional and marketing emails.',
      email: result.email,
    });
  });

  router.post('/unsubscribe', async (req, res) => {
    const token =
      typeof req.body?.token === 'string'
        ? req.body.token.trim()
        : typeof req.query.token === 'string'
          ? req.query.token.trim()
          : '';
    const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim() : undefined;
    if (!token) {
      res.status(400).json({ error: 'Unsubscribe token is required.' });
      return;
    }
    const result = await processUnsubscribe(token, reason);
    if (!result.ok) {
      res.status(result.status || 400).json({ error: result.error });
      return;
    }
    res.json({
      message: 'You have been unsubscribed from all marketing communications.',
      email: result.email,
    });
  });

  // Signed Email Provider Webhook (delivered, bounced, complained, opened, clicked)
  router.post('/webhooks/email', async (req, res) => {
    const sig = req.get('x-webhook-signature') || req.get('x-resend-signature') || '';
    const rawPayload = (req as unknown as { rawBody?: Buffer }).rawBody || JSON.stringify(req.body || {});
    if (!verifyHmacSignature(rawPayload, sig, config.emailWebhookSecret)) {
      res.status(401).json({ error: 'Invalid webhook signature.' });
      return;
    }

    const eventType = String(req.body?.event || req.body?.type || '').toLowerCase();
    const messageId = typeof req.body?.messageId === 'string' ? req.body.messageId : '';
    const recipient = typeof req.body?.recipient === 'string' ? normalizeEmail(req.body.recipient) : '';
    const reason = typeof req.body?.reason === 'string' ? req.body.reason : '';
    const now = new Date().toISOString();

    const logRow = messageId
      ? await db.models.EmailLog.findOne({ providerMessageId: messageId }).lean()
      : null;

    const targetEmail = recipient || (logRow?.recipient ? normalizeEmail(logRow.recipient) : '');

    if (eventType === 'delivered' && logRow) {
      await db.models.EmailLog.updateOne(
        { id: logRow.id },
        { $set: { status: 'delivered', deliveredAt: now, updatedAt: now } }
      );
    } else if (eventType === 'opened' && logRow) {
      await db.models.EmailLog.updateOne(
        { id: logRow.id },
        { $inc: { opensCount: 1 }, $set: { updatedAt: now } }
      );
    } else if (eventType === 'clicked' && logRow) {
      await db.models.EmailLog.updateOne(
        { id: logRow.id },
        { $inc: { clicksCount: 1 }, $set: { updatedAt: now } }
      );
    } else if (eventType === 'bounced' || eventType === 'complained') {
      const mappedStatus = eventType === 'complained' ? 'complained' : 'bounced';
      if (logRow) {
        await db.models.EmailLog.updateOne(
          { id: logRow.id },
          { $set: { status: mappedStatus, errorMessage: reason || mappedStatus, updatedAt: now } }
        );
      }

      if (targetEmail) {
        const supReason = eventType === 'complained' ? 'complaint' : 'bounce';
        const existingSup = await db.models.EmailSuppression.findOne({ email: targetEmail }).lean();
        if (existingSup) {
          await db.models.EmailSuppression.updateOne(
            { id: existingSup.id },
            {
              $inc: { bounceCount: 1 },
              $set: { reason: supReason, details: reason || eventType, suppressedAt: now },
            }
          );
        } else {
          await db.models.EmailSuppression.create({
            id: `sup_${crypto.randomUUID()}`,
            email: targetEmail,
            reason: supReason,
            bounceCount: 1,
            details: reason || eventType,
            suppressedAt: now,
          });
        }
      }
    }

    res.json({ received: true });
  });

  // Public secure attachment stream/download endpoint for broadcast email attachments & documents
  router.get('/media/attachment', async (req, res) => {
    const rawUrl = typeof req.query.url === 'string' ? req.query.url.trim() : '';
    const forceDownload = req.query.download === '1';
    const customName = typeof req.query.name === 'string' ? req.query.name.trim() : '';
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
      const defaultFilename = decodeURIComponent(pathname.split('/').pop() || 'document.pdf');
      const filename = (customName || defaultFilename).replace(/["\r\n]/g, '_');
      const ext = path.extname(filename).toLowerCase();
      let contentType = downloaded.contentType;
      if (ext === '.pdf' || downloaded.buffer.subarray(0, 5).toString('ascii') === '%PDF-') {
        contentType = 'application/pdf';
      } else if (ext === '.doc') {
        contentType = 'application/msword';
      } else if (ext === '.docx') {
        contentType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
      } else if (ext === '.xls') {
        contentType = 'application/vnd.ms-excel';
      } else if (ext === '.xlsx') {
        contentType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
      } else if (ext === '.csv') {
        contentType = 'text/csv';
      } else if (ext === '.txt') {
        contentType = 'text/plain';
      } else if (ext === '.zip') {
        contentType = 'application/zip';
      } else if (ext === '.png') {
        contentType = 'image/png';
      } else if (ext === '.jpg' || ext === '.jpeg') {
        contentType = 'image/jpeg';
      } else if (ext === '.webp') {
        contentType = 'image/webp';
      } else if (ext === '.gif') {
        contentType = 'image/gif';
      }

      res.setHeader('Content-Type', contentType);
      res.setHeader('Content-Disposition', `${forceDownload ? 'attachment' : 'inline'}; filename="${filename}"`);
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Cache-Control', 'public, max-age=3600');
      res.send(downloaded.buffer);
    } catch (err) {
      const sc = (err as { statusCode?: number }).statusCode || 502;
      res.status(sc).json({ error: err instanceof Error ? err.message : 'Unable to retrieve media.' });
    }
  });

  return router;
}

export { parseProductRow };
