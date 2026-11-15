import crypto from 'node:crypto';
import { MongoDatabase } from '../db/mongo.ts';
import { reconcileCustomerLoyalty } from './loyaltyService.ts';

export interface FinancialReconciliationOptions {
  dryRun?: boolean;
  stalledThresholdMs?: number; // default 10 minutes
}

export interface RefundDiscrepancy {
  orderNumber: string;
  orderId: string;
  totalAmount: number;
  refundedOnOrder: number;
  refundedInPayments: number;
  discrepancy: number;
  error: string;
}

export interface StalledRefundOp {
  refundOpId: string;
  orderNumber: string;
  amount: number;
  createdAt: string;
  resolvedStatus: string;
}

export interface LoyaltyDiscrepancy {
  customerId: string;
  customerEmail: string;
  cachedBalance: number;
  ledgerSum: number;
  discrepancy: number;
  adjusted: boolean;
}

export interface FinancialReconciliationReport {
  timestamp: string;
  dryRun: boolean;
  totalOrdersAudited: number;
  refundDiscrepancies: RefundDiscrepancy[];
  stalledRefundOperations: StalledRefundOp[];
  loyaltyDiscrepancies: LoyaltyDiscrepancy[];
  healthy: boolean;
}

export const RECONCILIATION_LOCK_KEY = 'financial_reconciliation_distributed_lock';

/**
 * Atomically acquires a distributed reconciliation lock with an owner token (fencing token).
 * Fails safely if another worker currently holds an unexpired lock lease.
 */
export async function acquireReconciliationLock(
  db: MongoDatabase,
  leaseMs: number = 60_000
): Promise<{ acquired: boolean; ownerToken: string | null }> {
  const ownerToken = crypto.randomUUID();
  const now = new Date();
  const nowIso = now.toISOString();

  try {
    const lock = await db.models.IdempotencyRecord.findOneAndUpdate(
      {
        customerId: 'system',
        idempotencyKey: RECONCILIATION_LOCK_KEY,
        $or: [
          { status: 'completed' },
          { status: 'failed' },
          { lockedUntil: { $lt: nowIso } },
        ],
      },
      {
        $setOnInsert: {
          id: `idem_${crypto.randomUUID()}`,
          customerId: 'system',
          idempotencyKey: RECONCILIATION_LOCK_KEY,
          createdAt: nowIso,
        },
        $set: {
          status: 'processing',
          requestFingerprint: ownerToken,
          responseSnapshot: { ownerToken },
          lockedUntil: new Date(now.getTime() + leaseMs).toISOString(),
          updatedAt: nowIso,
        },
      },
      { upsert: true, returnDocument: 'after' }
    ).lean();

    if (!lock) return { acquired: false, ownerToken: null };
    return { acquired: true, ownerToken };
  } catch (err: any) {
    if (err?.code === 11000) {
      return { acquired: false, ownerToken: null };
    }
    throw err;
  }
}

/**
 * Releases a distributed reconciliation lock conditionally on owner token matching.
 * Guarantees that a worker whose lease expired cannot accidentally release another worker's newly acquired lock.
 */
export async function releaseReconciliationLock(
  db: MongoDatabase,
  ownerToken: string
): Promise<boolean> {
  const res = await db.models.IdempotencyRecord.updateOne(
    {
      customerId: 'system',
      idempotencyKey: RECONCILIATION_LOCK_KEY,
      requestFingerprint: ownerToken,
    },
    { $set: { status: 'completed', updatedAt: new Date().toISOString() } }
  );
  return res.modifiedCount > 0;
}

/**
 * Renews the lease for an active reconciliation lock if the caller holds the owner token.
 */
export async function renewReconciliationLock(
  db: MongoDatabase,
  ownerToken: string,
  extensionMs: number = 60_000
): Promise<boolean> {
  const now = new Date();
  const res = await db.models.IdempotencyRecord.updateOne(
    {
      customerId: 'system',
      idempotencyKey: RECONCILIATION_LOCK_KEY,
      requestFingerprint: ownerToken,
      status: 'processing',
    },
    {
      $set: {
        lockedUntil: new Date(now.getTime() + extensionMs).toISOString(),
        updatedAt: now.toISOString(),
      },
    }
  );
  return res.modifiedCount > 0;
}

/**
 * Reconciles financial ledgers, refund operations, and customer loyalty balances across the database.
 * Default mode is safe dry-run (dryRun: true).
 */
export async function reconcileFinancials(
  db: MongoDatabase,
  options: FinancialReconciliationOptions = { dryRun: true }
): Promise<FinancialReconciliationReport> {
  const dryRun = options.dryRun !== false;
  const stalledThresholdMs = options.stalledThresholdMs || 10 * 60 * 1000;
  const now = new Date();
  const nowIso = now.toISOString();

  let ownerToken: string | null = null;

  if (!dryRun) {
    const lockResult = await acquireReconciliationLock(db, 60_000);
    if (!lockResult.acquired || !lockResult.ownerToken) {
      throw new Error('A financial reconciliation job is already running concurrently on another worker.');
    }
    ownerToken = lockResult.ownerToken;
  }

  try {
    const refundDiscrepancies: RefundDiscrepancy[] = [];
    const stalledRefundOperations: StalledRefundOp[] = [];
    const loyaltyDiscrepancies: LoyaltyDiscrepancy[] = [];

    // 1. Audit Orders and Refund Payments
    const refundedOrders = await db.models.Order.find({
      $or: [
        { paymentStatus: { $in: ['refunded', 'partially_refunded'] } },
        { refundStatus: { $in: ['refunded', 'partially_refunded', 'refund_pending'] } },
        { refundAmount: { $gt: 0 } },
      ],
    }).lean();

    for (const order of refundedOrders) {
      const totalOrderPaise = Math.round(Number(order.totalAmount || 0) * 100);
      const orderRefundAmountPaise = Math.round(Number(order.refundAmount || 0) * 100);

      const paymentRecords = await db.models.Payment.find({
        orderNumber: order.orderNumber,
        paymentType: 'order_refund',
        status: 'completed',
      }).lean();

      const paymentRefundPaise = paymentRecords.reduce(
        (sum, p) => sum + Math.round(Number((p as any).amount || 0) * 100),
        0
      );

      // Check if refunds exceed captured total
      if (paymentRefundPaise > totalOrderPaise) {
        refundDiscrepancies.push({
          orderNumber: order.orderNumber,
          orderId: order.id,
          totalAmount: Number(order.totalAmount || 0),
          refundedOnOrder: Number(order.refundAmount || 0),
          refundedInPayments: paymentRefundPaise / 100,
          discrepancy: (paymentRefundPaise - totalOrderPaise) / 100,
          error: 'EXCEEDS_ORDER_TOTAL: Refunded payment records exceed original captured amount',
        });
      } else if (order.paymentStatus === 'refunded' && paymentRefundPaise < totalOrderPaise) {
        refundDiscrepancies.push({
          orderNumber: order.orderNumber,
          orderId: order.id,
          totalAmount: Number(order.totalAmount || 0),
          refundedOnOrder: Number(order.refundAmount || 0),
          refundedInPayments: paymentRefundPaise / 100,
          discrepancy: (totalOrderPaise - paymentRefundPaise) / 100,
          error: 'PREMATURE_FULL_REFUND_STATUS: Order marked fully refunded but payment records indicate partial amount',
        });
      }
    }

    // 2. Audit Stalled Refund Operations (Atomic Conditional Claims prevent two workers reconciling the same operation)
    const cutoffTime = new Date(now.getTime() - stalledThresholdMs).toISOString();
    const stalledOps = await db.models.RefundOperation.find({
      status: 'processing',
      createdAt: { $lt: cutoffTime },
    }).lean();

    for (const op of stalledOps) {
      // Check if a payment record exists matching this refund
      const matchingPayment = await db.models.Payment.findOne({
        orderNumber: op.orderNumber,
        paymentType: 'order_refund',
        transactionRef: op.refundReferenceId,
      }).lean();

      let resolvedStatus = 'reconciliation_required';
      if (matchingPayment) {
        resolvedStatus = 'succeeded';
        if (!dryRun) {
          const claimed = await db.models.RefundOperation.findOneAndUpdate(
            { id: op.id, status: 'processing' },
            { $set: { status: 'succeeded', updatedAt: nowIso } },
            { returnDocument: 'after' }
          ).lean();
          if (!claimed) continue; // Another worker reconciled it concurrently
        }
      } else {
        if (!dryRun) {
          const claimed = await db.models.RefundOperation.findOneAndUpdate(
            { id: op.id, status: 'processing' },
            {
              $set: {
                status: 'reconciliation_required',
                failureReason: 'Stalled in processing with no corresponding completed payment record',
                updatedAt: nowIso,
              },
            },
            { returnDocument: 'after' }
          ).lean();
          if (!claimed) continue;
        }
      }

      stalledRefundOperations.push({
        refundOpId: op.id,
        orderNumber: op.orderNumber,
        amount: op.amount,
        createdAt: op.createdAt,
        resolvedStatus: dryRun ? `[DRY RUN] Would set to ${resolvedStatus}` : resolvedStatus,
      });
    }

    // 3. Audit Customer Loyalty Points Balance vs Ledger & Deficit Resolution
    const customers = await db.models.Customer.find(
      { role: 'customer' },
      { id: 1, email: 1, loyaltyPoints: 1, loyaltyDeficit: 1 }
    ).lean();

    for (const cust of customers) {
      const loyaltyAudit = await reconcileCustomerLoyalty(db, cust.id, !dryRun);
      if (!loyaltyAudit) continue;

      if (loyaltyAudit.discrepancy !== 0 || loyaltyAudit.deficitDiscrepancy !== 0) {
        loyaltyDiscrepancies.push({
          customerId: cust.id,
          customerEmail: cust.email,
          cachedBalance: loyaltyAudit.currentBalance,
          ledgerSum: loyaltyAudit.ledgerSum,
          discrepancy: loyaltyAudit.discrepancy,
          adjusted: !dryRun,
        });
      }
    }

    const healthy =
      refundDiscrepancies.length === 0 &&
      stalledRefundOperations.length === 0 &&
      loyaltyDiscrepancies.length === 0;

    return {
      timestamp: nowIso,
      dryRun,
      totalOrdersAudited: refundedOrders.length,
      refundDiscrepancies,
      stalledRefundOperations,
      loyaltyDiscrepancies,
      healthy,
    };
  } finally {
    if (ownerToken) {
      await releaseReconciliationLock(db, ownerToken);
    }
  }
}
