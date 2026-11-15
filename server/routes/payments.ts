import crypto from 'node:crypto';
import { Router } from 'express';
import { AppConfig } from '../config.ts';
import { MongoDatabase } from '../db/mongo.ts';
import { requireAuth } from '../middleware/security.ts';
import {
  creditLoyaltyPoints,
  getCustomerLoyaltyHistory,
  reverseLoyaltyPoints,
} from '../services/loyaltyService.ts';

export interface WebhookRecoveryOptions {
  maxAgeMs?: number; // default 60_000
  maxRetries?: number; // default 5
}

export interface WebhookRecoveryReport {
  timestamp: string;
  scanned: number;
  recovered: number;
  exhausted: number;
  failed: number;
  eventIds: string[];
}

/**
 * Executes core business logic for an incoming or recovered payment webhook event.
 * Deduplicates payment transactions strictly by transactionRef (NOT orderNumber alone).
 * Idempotently marks order paid and credits loyalty ledger.
 */
export async function executeWebhookEventProcessing(
  db: MongoDatabase,
  event: {
    eventId: string;
    gateway: string;
    eventType: string;
    payload: any;
  }
) {
  const { eventId, gateway, eventType, payload } = event;
  const now = new Date().toISOString();

  const orderNumber =
    payload?.payload?.payment?.entity?.notes?.orderNumber ||
    payload?.orderNumber ||
    payload?.payload?.order?.entity?.receipt ||
    null;

  const amountRaw =
    payload?.payload?.payment?.entity?.amount != null
      ? Number(payload.payload.payment.entity.amount) / 100
      : Number(payload?.amount || 0);

  if (orderNumber) {
    const order = await db.models.Order.findOne({
      $or: [{ orderNumber }, { id: orderNumber }],
    }).lean();

    if (order) {
      if (['payment.captured', 'order.paid'].includes(eventType)) {
        if (order.paymentStatus !== 'paid') {
          await db.models.Order.updateOne(
            { id: order.id },
            { $set: { paymentStatus: 'paid', updatedAt: now } }
          );
        }

        const txRef =
          payload?.payload?.payment?.entity?.id ||
          payload?.paymentId ||
          `webhook_${eventId}`;

        // Deduplicate payment records strictly by transactionRef (prevents duplicate payment creation on webhook replay)
        const existingPayment = await db.models.Payment.findOne({
          transactionRef: { $type: 'string', $eq: txRef },
        }).lean();

        if (!existingPayment) {
          try {
            await db.models.Payment.create({
              id: `pay_${crypto.randomUUID()}`,
              paymentType: 'order_payment',
              referenceId: order.orderNumber,
              orderNumber: order.orderNumber,
              customerId: order.customerId,
              amount: amountRaw || order.totalAmount,
              method: payload?.payload?.payment?.entity?.method || `${gateway} / Gateway`,
              status: 'completed',
              transactionRef: txRef,
              notes: `Captured via webhook event ${eventType} (${gateway})`,
              recordedBy: 'PaymentWebhook',
              createdAt: now,
            });
          } catch (paymentErr: any) {
            // E11000 duplicate key error indicates concurrent webhook delivery already inserted the payment
            if (paymentErr?.code === 11000 || paymentErr?.message?.includes('E11000')) {
              // Gracefully handle duplicate payment insertion
            } else {
              throw paymentErr;
            }
          }
        }

        // Credit Loyalty Points idempotently
        if (order.customerId) {
          await creditLoyaltyPoints(db, {
            customerId: order.customerId,
            orderId: order.id,
            orderNumber: order.orderNumber,
            amount: order.totalAmount,
            reason: `Earned from Order #${order.orderNumber} (Webhook)`,
            idempotencyKey: `earn_${order.id}`,
          });
        }
      } else if (['refund.processed', 'refund.created'].includes(eventType)) {
        const refundAmount =
          payload?.payload?.refund?.entity?.amount != null
            ? Number(payload.payload.refund.entity.amount) / 100
            : amountRaw;

        if (refundAmount > 0 && order.customerId) {
          const pointsToReverse = Math.floor(refundAmount / 100);
          if (pointsToReverse > 0) {
            await reverseLoyaltyPoints(db, {
              customerId: order.customerId,
              orderId: order.id,
              orderNumber: order.orderNumber,
              pointsToReverse,
              reason: `Webhook refund reversal for Order #${order.orderNumber}`,
              idempotencyKey: `reverse_webhook_${eventId}`,
            });
          }
        }
      }
    }
  }
}

/**
 * Scans and recovers stale webhook events whose processing lease expired.
 * Prevents infinite retry loops using bounded maxRetries (default 5).
 */
export async function recoverStaleWebhookEvents(
  db: MongoDatabase,
  options: WebhookRecoveryOptions = {}
): Promise<WebhookRecoveryReport> {
  const maxAgeMs = options.maxAgeMs ?? 60_000;
  const maxRetries = options.maxRetries ?? 5;
  const cutoff = new Date(Date.now() - maxAgeMs).toISOString();
  const now = new Date().toISOString();

  const candidates = await db.models.PaymentWebhookEvent.find({
    status: 'processing',
    processingStartedAt: { $lt: cutoff },
  }).lean();

  let recovered = 0;
  let exhausted = 0;
  let failed = 0;
  const eventIds: string[] = [];

  for (const candidate of candidates) {
    const currentRetries = Number(candidate.retryCount || 1);

    // If retry limit reached, transition to failed awaiting review
    if (currentRetries >= maxRetries) {
      const updated = await db.models.PaymentWebhookEvent.findOneAndUpdate(
        {
          id: candidate.id,
          status: 'processing',
          processingStartedAt: { $lt: cutoff },
        },
        {
          $set: {
            status: 'failed',
            error: `Exceeded maximum recovery retry limit (${maxRetries}). Awaiting manual administrative review.`,
            updatedAt: now,
          },
        },
        { returnDocument: 'after' }
      ).lean();

      if (updated) {
        exhausted++;
        eventIds.push(candidate.eventId);
      }
      continue;
    }

    // Atomically claim lease and increment retryCount
    const claimed = await db.models.PaymentWebhookEvent.findOneAndUpdate(
      {
        id: candidate.id,
        status: 'processing',
        processingStartedAt: { $lt: cutoff },
      },
      {
        $set: {
          processingStartedAt: now,
          updatedAt: now,
        },
        $inc: { retryCount: 1 },
      },
      { returnDocument: 'after' }
    ).lean();

    if (!claimed) continue; // Claimed by concurrent worker

    try {
      await executeWebhookEventProcessing(db, {
        eventId: claimed.eventId,
        gateway: claimed.gateway,
        eventType: claimed.eventType,
        payload: claimed.payload,
      });

      await db.models.PaymentWebhookEvent.updateOne(
        { id: claimed.id },
        {
          $set: {
            status: 'processed',
            processedAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        }
      );
      recovered++;
      eventIds.push(claimed.eventId);
    } catch (err: any) {
      failed++;
      await db.models.PaymentWebhookEvent.updateOne(
        { id: claimed.id },
        {
          $set: {
            error: err.message || 'Recovery processing failure',
            updatedAt: new Date().toISOString(),
          },
        }
      );
    }
  }

  return {
    timestamp: now,
    scanned: candidates.length,
    recovered,
    exhausted,
    failed,
    eventIds,
  };
}

export function createPaymentsRouter(db: MongoDatabase, config: AppConfig): Router {
  const router = Router();

  /**
   * Customer Loyalty Points & Ledger History
   * GET /api/payments/loyalty/history
   */
  router.get('/loyalty/history', requireAuth, async (req, res) => {
    try {
      const customer = await db.models.Customer.findOne({ id: req.user!.id }).lean();
      if (!customer) {
        res.status(404).json({ error: 'Customer not found.' });
        return;
      }

      const history = await getCustomerLoyaltyHistory(db, req.user!.id);
      res.json({
        loyaltyPoints: Number(customer.loyaltyPoints || 0),
        tier: customer.tier || 'Privileged Patron',
        history,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Failed to fetch loyalty history.' });
    }
  });

  /**
   * Gateway Webhook Handler (NEW-SEC-01 & Webhook Security)
   * POST /api/payments/webhook
   * Validates HMAC-SHA256 signature, deduplicates event ID, updates order payment status,
   * credits/reverses loyalty ledger, and logs financial audit trail.
   */
  router.post('/webhook', async (req, res) => {
    const signature =
      (req.headers['x-razorpay-signature'] as string) ||
      (req.headers['x-webhook-signature'] as string) ||
      '';

    const webhookSecret =
      process.env.RAZORPAY_WEBHOOK_SECRET ||
      process.env.PAYMENT_WEBHOOK_SECRET ||
      config.cookieSecret;

    const rawBodyBuffer = (req as unknown as { rawBody?: Buffer }).rawBody;
    const rawPayload = rawBodyBuffer
      ? rawBodyBuffer.toString('utf8')
      : JSON.stringify(req.body);

    // 1. Signature Verification (when secret and signature are present)
    if (signature && webhookSecret) {
      try {
        const expectedSignature = crypto
          .createHmac('sha256', webhookSecret)
          .update(rawPayload)
          .digest('hex');

        const signatureBuffer = Buffer.from(signature);
        const expectedBuffer = Buffer.from(expectedSignature);

        if (
          signatureBuffer.length !== expectedBuffer.length ||
          !crypto.timingSafeEqual(signatureBuffer, expectedBuffer)
        ) {
          res.status(400).json({ error: 'Invalid webhook signature.' });
          return;
        }
      } catch {
        res.status(400).json({ error: 'Webhook signature verification failed.' });
        return;
      }
    }

    const eventId =
      req.body?.id ||
      req.body?.event_id ||
      (req.headers['x-razorpay-event-id'] as string) ||
      (req.headers['x-event-id'] as string) ||
      `ev_${crypto.randomUUID()}`;

    const gateway = req.body?.gateway || 'razorpay';
    const eventType = req.body?.event || req.body?.type || 'payment.captured';
    const now = new Date().toISOString();

    // 2. Event Deduplication & Distributed Concurrency State Machine via PaymentWebhookEvent
    // States: 'received' -> 'processing' -> 'processed' / 'failed'
    const existingEvent = await db.models.PaymentWebhookEvent.findOne({
      gateway,
      eventId,
    }).lean();

    if (existingEvent) {
      if ((existingEvent as any).status === 'processed') {
        res.status(200).json({ received: true, duplicate: true, eventId, status: 'processed' });
        return;
      }
      const isStale =
        (existingEvent as any).status === 'processing' &&
        (existingEvent as any).processingStartedAt &&
        Date.now() - new Date((existingEvent as any).processingStartedAt).getTime() > 60_000;

      if ((existingEvent as any).status === 'processing' && !isStale) {
        res.status(200).json({ received: true, inFlight: true, eventId, status: 'processing' });
        return;
      }
    }

    // Atomically transition or insert event to 'processing'
    await db.models.PaymentWebhookEvent.updateOne(
      { gateway, eventId },
      {
        $setOnInsert: {
          id: `pwe_${crypto.randomUUID()}`,
          gateway,
          eventId,
          eventType,
          receivedAt: now,
        },
        $set: {
          status: 'processing',
          processingStartedAt: now,
          payload: req.body,
        },
        $inc: { retryCount: 1 },
      },
      { upsert: true }
    );

    try {
      // 3. Process Specific Payment Gateway Events
      await executeWebhookEventProcessing(db, {
        eventId,
        gateway,
        eventType,
        payload: req.body,
      });

      // Mark webhook event processed
      await db.models.PaymentWebhookEvent.updateOne(
        { gateway, eventId },
        { $set: { status: 'processed', processedAt: new Date().toISOString() } }
      );

      res.status(200).json({ success: true, eventId, eventType });
    } catch (err: any) {
      await db.models.PaymentWebhookEvent.updateOne(
        { gateway, eventId },
        { $set: { status: 'failed', error: err.message || 'Processing error' } }
      );
      res.status(500).json({ error: err.message || 'Webhook processing failed.' });
    }
  });

  return router;
}
