import crypto from 'node:crypto';
import { MongoDatabase } from '../db/mongo.ts';

export interface CreditLoyaltyParams {
  customerId: string;
  orderId?: string;
  orderNumber?: string;
  amount: number;
  reason?: string;
  idempotencyKey?: string;
}

export interface ReverseLoyaltyParams {
  customerId: string;
  orderId?: string;
  orderNumber?: string;
  pointsToReverse: number;
  reason?: string;
  idempotencyKey?: string;
  relatedTransactionId?: string;
}

export interface RedeemLoyaltyParams {
  customerId: string;
  pointsToRedeem: number;
  orderId?: string;
  orderNumber?: string;
  reason?: string;
  idempotencyKey?: string;
}

/**
 * Calculates standard loyalty points earned for an eligible order amount.
 * Baseline: 1 loyalty point per 100 spent (e.g. 550 -> 5 points).
 */
export function calculateLoyaltyPoints(amount: number): number {
  if (!amount || amount <= 0 || !Number.isFinite(amount)) return 0;
  return Math.floor(amount / 100);
}

/**
 * Atomically credit loyalty points to customer with an immutable ledger entry.
 * Idempotent: Subsequent calls with the same idempotencyKey return the existing record without duplicate credit.
 */
export async function creditLoyaltyPoints(db: MongoDatabase, params: CreditLoyaltyParams) {
  const { customerId, orderId, orderNumber, amount, reason, idempotencyKey: customKey } = params;
  if (!customerId) return null;

  const points = calculateLoyaltyPoints(amount);
  if (points <= 0) return null;

  const idempotencyKey = customKey || (orderId ? `earn_${orderId}` : `earn_${crypto.randomUUID()}`);
  const now = new Date().toISOString();

  // Check if already credited
  const existing = await db.models.LoyaltyLedger.findOne({ customerId, idempotencyKey }).lean();
  if (existing) {
    return existing;
  }

  // Check if customer exists
  const cust = await db.models.Customer.findOne({ id: customerId }).lean();
  if (!cust) return null;

  const currentDeficit = Math.max(0, Number(cust.loyaltyDeficit || 0));
  const offset = Math.min(points, currentDeficit);
  const netCredit = points - offset;

  // Atomically update customer deficit and points
  const updatedCustomer = await db.models.Customer.findOneAndUpdate(
    { id: customerId },
    {
      $inc: {
        loyaltyDeficit: -offset,
        loyaltyPoints: netCredit,
      },
      $set: { updatedAt: now },
    },
    { returnDocument: 'after' }
  ).lean();

  if (!updatedCustomer) {
    return null;
  }

  try {
    const entry = await db.models.LoyaltyLedger.create({
      id: `ll_${crypto.randomUUID()}`,
      customerId,
      orderId: orderId || null,
      orderNumber: orderNumber || null,
      transactionType: 'earned',
      pointsDelta: netCredit,
      deficitOffset: offset,
      balanceAfter: Number(updatedCustomer.loyaltyPoints || 0),
      status: 'posted',
      reason: reason || (orderNumber ? `Earned from Order #${orderNumber}` : 'Earned loyalty points'),
      relatedTransactionId: null,
      idempotencyKey,
      createdAt: now,
    });
    return (entry as any).toObject ? (entry as any).toObject() : entry;
  } catch (err: any) {
    if (err?.code === 11000) {
      // Revert speculative increment if concurrent race won
      await db.models.Customer.updateOne(
        { id: customerId },
        {
          $inc: {
            loyaltyDeficit: offset,
            loyaltyPoints: -netCredit,
          },
          $set: { updatedAt: now },
        }
      );
      return await db.models.LoyaltyLedger.findOne({ customerId, idempotencyKey }).lean();
    }
    throw err;
  }
}

/**
 * Atomically reverses loyalty points (e.g. on cancellation or partial/full refund).
 * Guarantee: Customer loyalty balance never drops below zero.
 * Idempotent: Subsequent calls with the same idempotencyKey return the existing record.
 */
export async function reverseLoyaltyPoints(db: MongoDatabase, params: ReverseLoyaltyParams) {
  const { customerId, orderId, orderNumber, pointsToReverse, reason, idempotencyKey: customKey, relatedTransactionId } = params;
  if (!customerId || pointsToReverse <= 0) return null;

  const idempotencyKey = customKey || (orderId ? `reverse_cancel_${orderId}` : `reverse_${crypto.randomUUID()}`);
  const now = new Date().toISOString();

  const existing = await db.models.LoyaltyLedger.findOne({ customerId, idempotencyKey }).lean();
  if (existing) {
    return existing;
  }

  // Non-negative balance check
  const customer = await db.models.Customer.findOne({ id: customerId }).lean();
  if (!customer) return null;

  const currentBalance = Math.max(0, Number(customer.loyaltyPoints || 0));
  const actualDeduction = Math.min(pointsToReverse, currentBalance);
  const deficit = pointsToReverse - actualDeduction;

  let balanceAfter = currentBalance;
  if (actualDeduction > 0) {
    const updatedCustomer = await db.models.Customer.findOneAndUpdate(
      { id: customerId, loyaltyPoints: { $gte: actualDeduction } },
      {
        $inc: { loyaltyPoints: -actualDeduction },
        $set: { updatedAt: now },
      },
      { returnDocument: 'after' }
    ).lean();

    if (updatedCustomer) {
      balanceAfter = Number(updatedCustomer.loyaltyPoints || 0);
    } else {
      // In case balance was reduced concurrently, re-read and deduct remaining positive balance
      const retryCustomer = await db.models.Customer.findOne({ id: customerId }).lean();
      const retryBalance = Math.max(0, Number(retryCustomer?.loyaltyPoints || 0));
      const retryDeduction = Math.min(pointsToReverse, retryBalance);
      if (retryDeduction > 0) {
        const retried = await db.models.Customer.findOneAndUpdate(
          { id: customerId, loyaltyPoints: { $gte: retryDeduction } },
          {
            $inc: { loyaltyPoints: -retryDeduction },
            $set: { updatedAt: now },
          },
          { returnDocument: 'after' }
        ).lean();
        balanceAfter = Number(retried?.loyaltyPoints || 0);
      } else {
        balanceAfter = retryBalance;
      }
    }
  }

  if (deficit > 0) {
    await db.models.Customer.updateOne(
      { id: customerId },
      { $inc: { loyaltyDeficit: deficit }, $set: { updatedAt: now } }
    );
  }

  try {
    const entry = await db.models.LoyaltyLedger.create({
      id: `ll_${crypto.randomUUID()}`,
      customerId,
      orderId: orderId || null,
      orderNumber: orderNumber || null,
      transactionType: 'reversed',
      pointsDelta: actualDeduction === 0 ? 0 : -actualDeduction,
      reversalDeficit: deficit,
      balanceAfter,
      status: 'posted',
      reason: reason || (orderNumber ? `Points reversed for Order #${orderNumber}` : 'Points reversed'),
      relatedTransactionId: relatedTransactionId || null,
      idempotencyKey,
      createdAt: now,
    });
    return (entry as any).toObject ? (entry as any).toObject() : entry;
  } catch (err: any) {
    if (err?.code === 11000) {
      if (actualDeduction > 0) {
        await db.models.Customer.updateOne(
          { id: customerId },
          { $inc: { loyaltyPoints: actualDeduction }, $set: { updatedAt: now } }
        );
      }
      if (deficit > 0) {
        await db.models.Customer.updateOne(
          { id: customerId },
          { $inc: { loyaltyDeficit: -deficit }, $set: { updatedAt: now } }
        );
      }
      return await db.models.LoyaltyLedger.findOne({ customerId, idempotencyKey }).lean();
    }
    throw err;
  }
}

/**
 * Redeems loyalty points for an order discount.
 */
export async function redeemLoyaltyPoints(db: MongoDatabase, params: RedeemLoyaltyParams) {
  const { customerId, pointsToRedeem, orderId, orderNumber, reason, idempotencyKey: customKey } = params;
  if (!customerId || pointsToRedeem <= 0) return null;

  const idempotencyKey = customKey || (orderId ? `redeem_${orderId}` : `redeem_${crypto.randomUUID()}`);
  const now = new Date().toISOString();

  const existing = await db.models.LoyaltyLedger.findOne({ customerId, idempotencyKey }).lean();
  if (existing) {
    return existing;
  }

  const updatedCustomer = await db.models.Customer.findOneAndUpdate(
    { id: customerId, loyaltyPoints: { $gte: pointsToRedeem } },
    {
      $inc: { loyaltyPoints: -pointsToRedeem },
      $set: { updatedAt: now },
    },
    { returnDocument: 'after' }
  ).lean();

  if (!updatedCustomer) {
    throw new Error('INSUFFICIENT_LOYALTY_POINTS');
  }

  try {
    const entry = await db.models.LoyaltyLedger.create({
      id: `ll_${crypto.randomUUID()}`,
      customerId,
      orderId: orderId || null,
      orderNumber: orderNumber || null,
      transactionType: 'redeemed',
      pointsDelta: -pointsToRedeem,
      balanceAfter: Number(updatedCustomer.loyaltyPoints || 0),
      status: 'posted',
      reason: reason || (orderNumber ? `Redeemed on Order #${orderNumber}` : 'Redeemed points'),
      relatedTransactionId: null,
      idempotencyKey,
      createdAt: now,
    });
    return (entry as any).toObject ? (entry as any).toObject() : entry;
  } catch (err: any) {
    if (err?.code === 11000) {
      await db.models.Customer.updateOne(
        { id: customerId },
        { $inc: { loyaltyPoints: pointsToRedeem }, $set: { updatedAt: now } }
      );
      return await db.models.LoyaltyLedger.findOne({ customerId, idempotencyKey }).lean();
    }
    throw err;
  }
}

/**
 * Returns full loyalty transaction history for a customer.
 */
export async function getCustomerLoyaltyHistory(db: MongoDatabase, customerId: string) {
  return await db.models.LoyaltyLedger.find({ customerId }).sort({ createdAt: -1 }).lean();
}

/**
 * Reconciles customer's cached loyalty balance against the immutable ledger entries.
 */
export async function reconcileCustomerLoyalty(
  db: MongoDatabase,
  customerId: string,
  fixDiscrepancy: boolean = false
) {
  const customer = await db.models.Customer.findOne({ id: customerId }).lean();
  if (!customer) return null;

  const ledgerEntries = await db.models.LoyaltyLedger.find({ customerId, status: 'posted' }).lean();
  const ledgerSum = ledgerEntries.reduce((sum, entry) => sum + Number((entry as any).pointsDelta || 0), 0);
  const totalReversalDeficits = ledgerEntries.reduce((sum, entry) => sum + Number((entry as any).reversalDeficit || 0), 0);
  const totalDeficitOffsets = ledgerEntries.reduce((sum, entry) => sum + Number((entry as any).deficitOffset || 0), 0);
  const expectedDeficit = Math.max(0, totalReversalDeficits - totalDeficitOffsets);

  const currentBalance = Number(customer.loyaltyPoints || 0);
  const currentDeficit = Number(customer.loyaltyDeficit || 0);
  const discrepancy = currentBalance - ledgerSum;
  const deficitDiscrepancy = currentDeficit - expectedDeficit;

  if ((discrepancy !== 0 || deficitDiscrepancy !== 0) && fixDiscrepancy) {
    const now = new Date().toISOString();
    await db.models.Customer.updateOne(
      { id: customerId },
      {
        $set: {
          loyaltyPoints: Math.max(0, ledgerSum),
          loyaltyDeficit: expectedDeficit,
          updatedAt: now,
        },
      }
    );
    if (discrepancy !== 0) {
      await db.models.LoyaltyLedger.create({
        id: `ll_${crypto.randomUUID()}`,
        customerId,
        transactionType: 'adjustment',
        pointsDelta: -discrepancy,
        balanceAfter: Math.max(0, ledgerSum),
        status: 'posted',
        reason: 'Automated financial reconciliation adjustment',
        idempotencyKey: `reconcile_${customerId}_${Date.now()}`,
        createdAt: now,
      });
    }
  }

  return {
    customerId,
    currentBalance,
    currentDeficit,
    expectedDeficit,
    ledgerSum,
    discrepancy,
    deficitDiscrepancy,
    reconciled: (discrepancy === 0 && deficitDiscrepancy === 0) || fixDiscrepancy,
  };
}

export interface LoyaltyMigrationOptions {
  dryRun?: boolean;
}

export interface LoyaltyMigrationCustomerResult {
  customerId: string;
  email: string;
  loyaltyPoints: number;
  loyaltyDeficit: number;
  ledgerEntriesCount: number;
  action: 'migrated' | 'skipped_has_ledger' | 'skipped_zero_balance' | 'dry_run_candidate';
  openingBalance?: number;
}

export interface LoyaltyMigrationReport {
  timestamp: string;
  dryRun: boolean;
  totalCustomersAudited: number;
  migratedCount: number;
  skippedCount: number;
  results: LoyaltyMigrationCustomerResult[];
}

/**
 * Migrates pre-existing customer loyalty balances to immutable LoyaltyLedger opening balance entries.
 * Safe and idempotent:
 * - In dry-run mode (default), only inspects and reports candidates without writing.
 * - In live mode (dryRun: false), creates an 'opening_balance' record with idempotencyKey 'opening_balance_${customerId}'.
 * - Never decreases or resets customer.loyaltyPoints or customer.loyaltyDeficit.
 */
export async function migrateHistoricalLoyaltyLedger(
  db: MongoDatabase,
  options: LoyaltyMigrationOptions = { dryRun: true }
): Promise<LoyaltyMigrationReport> {
  const dryRun = options.dryRun !== false;
  const now = new Date().toISOString();
  const customers = await db.models.Customer.find({}).lean();

  const results: LoyaltyMigrationCustomerResult[] = [];
  let migratedCount = 0;
  let skippedCount = 0;

  for (const cust of customers) {
    const custId = String(cust.id);
    const email = String(cust.email || '');
    const points = Number(cust.loyaltyPoints || 0);
    const deficit = Number(cust.loyaltyDeficit || 0);

    const ledgerCount = await db.models.LoyaltyLedger.countDocuments({ customerId: custId });

    if (ledgerCount > 0) {
      skippedCount++;
      results.push({
        customerId: custId,
        email,
        loyaltyPoints: points,
        loyaltyDeficit: deficit,
        ledgerEntriesCount: ledgerCount,
        action: 'skipped_has_ledger',
      });
      continue;
    }

    if (points <= 0) {
      skippedCount++;
      results.push({
        customerId: custId,
        email,
        loyaltyPoints: points,
        loyaltyDeficit: deficit,
        ledgerEntriesCount: 0,
        action: 'skipped_zero_balance',
      });
      continue;
    }

    // Customer has points > 0 but no ledger entries -> candidate for opening balance migration
    if (dryRun) {
      results.push({
        customerId: custId,
        email,
        loyaltyPoints: points,
        loyaltyDeficit: deficit,
        ledgerEntriesCount: 0,
        action: 'dry_run_candidate',
        openingBalance: points,
      });
      continue;
    }

    // Live migration: Idempotently create opening_balance entry
    const idempotencyKey = `opening_balance_${custId}`;
    try {
      await db.models.LoyaltyLedger.create({
        id: `ll_${crypto.randomUUID()}`,
        customerId: custId,
        orderId: null,
        orderNumber: null,
        transactionType: 'opening_balance',
        pointsDelta: points,
        balanceAfter: points,
        reversalDeficit: 0,
        deficitOffset: 0,
        status: 'posted',
        reason: 'Historical loyalty balance migration opening balance',
        relatedTransactionId: null,
        idempotencyKey,
        createdAt: now,
      });
      migratedCount++;
      results.push({
        customerId: custId,
        email,
        loyaltyPoints: points,
        loyaltyDeficit: deficit,
        ledgerEntriesCount: 1,
        action: 'migrated',
        openingBalance: points,
      });
    } catch (err: any) {
      if (err?.code === 11000) {
        skippedCount++;
        results.push({
          customerId: custId,
          email,
          loyaltyPoints: points,
          loyaltyDeficit: deficit,
          ledgerEntriesCount: 1,
          action: 'skipped_has_ledger',
        });
      } else {
        throw err;
      }
    }
  }

  return {
    timestamp: now,
    dryRun,
    totalCustomersAudited: customers.length,
    migratedCount,
    skippedCount,
    results,
  };
}
