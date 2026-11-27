import { Router } from 'express';
import { z } from 'zod';
import { MongoDatabase } from '../db/mongo.ts';
import { requireAdmin, requireAuth, requirePermission } from '../middleware/security.ts';
import {
  getAbandonedCartAnalyticsAndList,
  initiateCartWhatsAppFollowUp,
} from '../services/cartRecoveryService.ts';
import { updateCrmConfig, updateCrmConfigSchema } from '../services/crmConfigService.ts';
import {
  applySegmentOffer,
  exportSegmentedCustomersCsv,
  executeSegmentWhatsAppCampaign,
  getCustomerSegmentationOverview,
  getCustomerSegmentationProfile,
} from '../services/customerSegmentationService.ts';

const followUpSchema = z.object({
  message: z.string().trim().max(1200).optional(),
});

const whatsappCampaignSchema = z.object({
  segment: z.enum(['all', 'vip', 'high_value', 'returning', 'new', 'inactive', 'prospect']),
  title: z.string().trim().min(2, 'Campaign title is required.').max(120),
  messageTemplate: z.string().trim().min(5, 'Message template is required.').max(1200),
  offerCode: z.string().trim().max(40).optional(),
  idempotencyKey: z.string().trim().max(80).optional(),
});

const applyOfferSchema = z.object({
  segment: z.enum(['all', 'vip', 'high_value', 'returning', 'new', 'inactive', 'prospect']),
  customerId: z.string().trim().max(80).optional(),
  title: z.string().trim().min(2, 'Offer title is required.').max(120),
  codePrefix: z.string().trim().max(16).optional(),
  discountType: z.enum(['percentage', 'flat']),
  discountValue: z.coerce.number().positive('Discount value must be positive.').max(100000),
  minOrderValue: z.coerce.number().min(0).max(500000).default(0),
  validDays: z.coerce.number().int().min(1).max(365).default(30),
  usageLimit: z.coerce.number().int().min(1).max(20).default(1),
  idempotencyKey: z.string().trim().max(80).optional(),
});

/** Isolated Abandoned Cart Tracker router mounted at /api/admin/abandoned-carts. */
export function createAdminAbandonedCartsRouter(db: MongoDatabase): Router {
  const router = Router();
  router.use(requireAuth, requireAdmin, requirePermission('customers'));

  router.get('/', async (req, res) => {
    const data = await getAbandonedCartAnalyticsAndList(db, {
      status: typeof req.query.status === 'string' ? req.query.status : 'all',
      search: typeof req.query.search === 'string' ? req.query.search : '',
      page: Number(req.query.page || 1),
      limit: Number(req.query.limit || 20),
    });
    res.json(data);
  });

  router.put('/config', async (req, res) => {
    const parsed = updateCrmConfigSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid threshold configuration.' });
      return;
    }
    try {
      const config = await updateCrmConfig(db, parsed.data, req.user!.email);
      res.json({ config, message: 'Abandoned cart thresholds updated.' });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Unable to save settings.' });
    }
  });

  router.post('/:id/follow-up', async (req, res) => {
    const parsed = followUpSchema.safeParse(req.body || {});
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid follow-up message.' });
      return;
    }

    const result = await initiateCartWhatsAppFollowUp(db, {
      cartId: String(req.params.id),
      customMessage: parsed.data.message,
      admin: {
        id: String(req.user!.id),
        name: String(req.user!.name),
        email: String(req.user!.email),
      },
    });

    if (result.status !== 200) {
      res.status(result.status).json({ error: result.error, eligibility: (result as any).eligibility });
      return;
    }
    res.json(result);
  });

  router.put('/:id/expire', async (req, res) => {
    const cartId = String(req.params.id || '').trim();
    const now = new Date().toISOString();
    const updated = await db.models.CartSession.findOneAndUpdate(
      { id: cartId, status: { $in: ['active', 'abandoned'] } },
      { $set: { status: 'expired', openCartKey: null, expiredAt: now, updatedAt: now } },
      { returnDocument: 'after', projection: { _id: 0 } }
    ).lean();
    if (!updated) {
      res.status(404).json({ error: 'Eligible active or abandoned cart not found.' });
      return;
    }
    res.json({ cart: updated, message: 'Cart marked as expired.' });
  });

  return router;
}

/** Isolated Customer Segmentation router mounted at /api/admin/segments. */
export function createAdminSegmentsRouter(db: MongoDatabase): Router {
  const router = Router();
  router.use(requireAuth, requireAdmin, requirePermission('customers'));

  router.get('/overview', async (req, res) => {
    const data = await getCustomerSegmentationOverview(db, {
      segment: typeof req.query.segment === 'string' ? req.query.segment : 'all',
      search: typeof req.query.search === 'string' ? req.query.search : '',
      consentOnly: req.query.consentOnly === 'true' || req.query.consentOnly === '1',
      page: Number(req.query.page || 1),
      limit: Number(req.query.limit || 20),
    });
    res.json(data);
  });

  router.put('/config', async (req, res) => {
    const parsed = updateCrmConfigSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid segment thresholds.' });
      return;
    }
    try {
      const config = await updateCrmConfig(db, parsed.data, req.user!.email);
      res.json({ config, message: 'Customer segmentation thresholds updated.' });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Unable to save thresholds.' });
    }
  });

  router.get('/customers/:id', async (req, res) => {
    const profile = await getCustomerSegmentationProfile(db, String(req.params.id));
    if (!profile) {
      res.status(404).json({ error: 'Customer not found.' });
      return;
    }
    res.json(profile);
  });

  router.get('/export.csv', async (req, res) => {
    const segment = typeof req.query.segment === 'string' ? req.query.segment : 'all';
    const search = typeof req.query.search === 'string' ? req.query.search : '';
    const csv = await exportSegmentedCustomersCsv(db, { segment, search });
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="customer-segment-${segment}.csv"`);
    res.send(csv);
  });

  router.post('/whatsapp-campaign', async (req, res) => {
    const parsed = whatsappCampaignSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid WhatsApp campaign input.' });
      return;
    }

    const resData = await executeSegmentWhatsAppCampaign(
      db,
      parsed.data as any,
      {
        id: String(req.user!.id),
        name: String(req.user!.name),
        email: String(req.user!.email),
      }
    );

    if (resData.status !== 201) {
      res.status(resData.status).json({ error: resData.error, campaign: (resData as any).campaign });
      return;
    }
    res.status(201).json(resData);
  });

  router.post('/apply-offer', async (req, res) => {
    const parsed = applyOfferSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid offer parameters.' });
      return;
    }

    if (parsed.data.discountType === 'percentage' && parsed.data.discountValue > 90) {
      res.status(400).json({ error: 'Percentage discount cannot exceed 90%.' });
      return;
    }

    const resData = await applySegmentOffer(
      db,
      parsed.data as any,
      {
        id: String(req.user!.id),
        name: String(req.user!.name),
        email: String(req.user!.email),
      }
    );

    if (resData.status !== 201) {
      res.status(resData.status).json({ error: resData.error, campaign: (resData as any).campaign });
      return;
    }
    res.status(201).json(resData);
  });

  return router;
}
