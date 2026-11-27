import { Router } from 'express';
import { z } from 'zod';
import { MongoDatabase } from '../db/mongo.ts';
import { createRateLimiter } from '../middleware/security.ts';
import { syncCartSession } from '../services/cartRecoveryService.ts';

const syncCartSchema = z.object({
  visitorToken: z.string().trim().max(64).optional().default(''),
  clearReason: z.enum(['user_cleared', 'item_expired']).optional(),
  items: z
    .array(
      z.object({
        productId: z.string().trim().min(1).max(80),
        variantId: z.string().trim().max(80).optional().nullable(),
        quantity: z.coerce.number().min(0).max(999),
      })
    )
    .max(50),
});

/** Isolated customer/visitor cart synchronization router for abandonment tracking. */
export function createCartRouter(db: MongoDatabase): Router {
  const router = Router();
  const cartSyncLimit = createRateLimiter({ windowMs: 60_000, max: 60, keyPrefix: 'cart_sync' });

  router.post('/sync', cartSyncLimit, async (req, res) => {
    const parsed = syncCartSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid cart payload.' });
      return;
    }

    const result = await syncCartSession(db, {
      user: req.user || null,
      visitorToken: parsed.data.visitorToken,
      clearReason: parsed.data.clearReason,
      items: parsed.data.items,
    });

    res.json({ ok: true, ...result });
  });

  return router;
}
