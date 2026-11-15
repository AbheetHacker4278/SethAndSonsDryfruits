import crypto from 'node:crypto';
import { MongoDatabase, syncInventoryRecord } from '../db/mongo.ts';

export interface RecoveryResult {
  recoveredCount: number;
  operations: Array<{
    opId: string;
    action: 'committed' | 'compensated' | 'failed';
    details?: string;
  }>;
  couponReservationsRecovered: number;
}

/**
 * Reconciles incomplete, crashed, or abandoned inventory operations and expired coupon reservations.
 * Fully multi-instance safe using atomic leases (recoveryClaimedBy/recoveryClaimedAt).
 */
export async function reconcileOrphanedInventory(
  db: MongoDatabase,
  options?: {
    workerId?: string;
    leaseTimeoutMs?: number;
  }
): Promise<RecoveryResult> {
  const workerId = options?.workerId || `worker_${crypto.randomUUID()}`;
  const nowIso = new Date().toISOString();
  const leaseClaimCutoff = new Date(Date.now() - 60000).toISOString();

  const result: RecoveryResult = {
    recoveredCount: 0,
    operations: [],
    couponReservationsRecovered: 0,
  };

  // 1. Find operations that need recovery
  const candidates = await db.models.InventoryOperation.find({
    status: { $in: ['initiated', 'reserved', 'compensation_pending'] },
    leaseExpiresAt: { $lte: nowIso },
    $or: [
      { recoveryClaimedBy: null },
      { recoveryClaimedAt: { $lt: leaseClaimCutoff } },
    ],
  })
    .limit(50)
    .lean();

  for (const candidate of candidates) {
    // Atomically claim this operation to prevent worker contention
    const claimed = await db.models.InventoryOperation.findOneAndUpdate(
      {
        id: candidate.id,
        status: { $in: ['initiated', 'reserved', 'compensation_pending'] },
        $or: [
          { recoveryClaimedBy: null },
          { recoveryClaimedAt: { $lt: leaseClaimCutoff } },
        ],
      },
      {
        $set: {
          recoveryClaimedBy: workerId,
          recoveryClaimedAt: nowIso,
          updatedAt: nowIso,
        },
        $inc: { recoveryAttempts: 1 },
      },
      { returnDocument: 'after' }
    ).lean();

    if (!claimed) {
      // Another worker claimed it
      continue;
    }

    try {
      // Check if an Order was actually created and committed for this operation
      const orderQueries: Array<Record<string, unknown>> = [];
      if (claimed.orderId) {
        orderQueries.push({ id: claimed.orderId });
      }
      if (claimed.idempotencyKey && claimed.customerId) {
        orderQueries.push({ customerId: claimed.customerId, idempotencyKey: claimed.idempotencyKey });
      }

      const matchingOrder = orderQueries.length > 0
        ? await db.models.Order.findOne({ $or: orderQueries }).lean()
        : null;

      if (matchingOrder) {
        // The order was committed before the process crash!
        await db.models.InventoryOperation.updateOne(
          { id: claimed.id },
          {
            $set: {
              status: 'committed',
              orderId: matchingOrder.id,
              orderNumber: matchingOrder.orderNumber,
              recoveryClaimedBy: null,
              updatedAt: new Date().toISOString(),
            },
          }
        );

        if (claimed.idempotencyKey) {
          await db.models.IdempotencyRecord.updateOne(
            { customerId: claimed.customerId, idempotencyKey: claimed.idempotencyKey },
            { $set: { status: 'completed', orderId: matchingOrder.id, orderNumber: matchingOrder.orderNumber, updatedAt: new Date().toISOString() } }
          );
        }

        if (claimed.couponReservationId) {
          await db.models.CouponReservation.updateOne(
            { id: claimed.couponReservationId, status: 'claimed' },
            { $set: { status: 'consumed', orderId: matchingOrder.id, consumedAt: new Date().toISOString(), updatedAt: new Date().toISOString() } }
          );
        }

        result.recoveredCount++;
        result.operations.push({ opId: claimed.id, action: 'committed', details: `Linked to existing order #${matchingOrder.orderNumber}` });
      } else {
        // No committed order exists! The process crashed after inventory deduction.
        // Perform idempotent compensation (restocking).
        const compensationTime = new Date().toISOString();
        for (const it of claimed.items) {
          await db.models.Product.updateOne(
            { id: it.productId },
            {
              $inc: { stock: it.weightDeducted },
              $set: { inStock: true, updatedAt: compensationTime },
            }
          );

          if (it.variantId) {
            await db.models.ProductVariant.updateOne(
              { id: it.variantId },
              {
                $inc: { stock: it.quantity },
                $set: { active: true, updatedAt: compensationTime },
              }
            );
          }

          await syncInventoryRecord(db, it.productId);

          await db.models.InventoryTransaction.create({
            id: `invtx_${crypto.randomUUID()}`,
            productId: it.productId,
            variantId: it.variantId,
            movementType: 'order_return',
            quantity: it.weightDeducted,
            previousStock: 0,
            updatedStock: 0,
            unitCost: 0,
            reason: `Orphaned crash recovery for operation ${claimed.id}`,
            adminId: 'system_recovery',
            adminName: `Recovery Worker (${workerId})`,
            timestamp: compensationTime,
          });
        }

        // Release associated coupon reservation if any
        if (claimed.couponReservationId) {
          const resv = await db.models.CouponReservation.findOneAndUpdate(
            { id: claimed.couponReservationId, status: 'claimed' },
            {
              $set: {
                status: 'released',
                releasedAt: compensationTime,
                releaseReason: `orphaned_operation_recovery_${claimed.id}`,
                updatedAt: compensationTime,
              },
            },
            { returnDocument: 'after' }
          );

          if (resv) {
            await db.models.Coupon.updateOne(
              { id: resv.couponId, usedCount: { $gt: 0 } },
              { $inc: { usedCount: -1 } }
            );
          }
        }

        // Mark operation as compensated
        await db.models.InventoryOperation.updateOne(
          { id: claimed.id },
          {
            $set: {
              status: 'compensated',
              recoveryClaimedBy: null,
              updatedAt: compensationTime,
            },
          }
        );

        if (claimed.idempotencyKey) {
          await db.models.IdempotencyRecord.updateOne(
            { customerId: claimed.customerId, idempotencyKey: claimed.idempotencyKey },
            { $set: { status: 'failed', updatedAt: compensationTime } }
          );
        }

        try {
          await db.models.AuditLog.create({
            id: `audit_${crypto.randomUUID()}`,
            action: 'orphaned_inventory_reconciled',
            entityType: 'inventory_operation',
            entityId: claimed.id,
            details: {
              workerId,
              customerId: claimed.customerId,
              itemsCount: claimed.items.length,
              couponReservationId: claimed.couponReservationId,
            },
            timestamp: compensationTime,
          });
        } catch {}

        result.recoveredCount++;
        result.operations.push({ opId: claimed.id, action: 'compensated', details: `Restocked ${claimed.items.length} items` });
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      await db.models.InventoryOperation.updateOne(
        { id: claimed.id },
        {
          $set: {
            recoveryClaimedBy: null,
            lastRecoveryError: errMsg,
            updatedAt: new Date().toISOString(),
          },
        }
      );
      result.operations.push({ opId: claimed.id, action: 'failed', details: errMsg });
    }
  }

  // 2. Scan and reconcile expired coupon reservations
  const expiredReservations = await db.models.CouponReservation.find({
    status: 'claimed',
    expiresAt: { $lte: nowIso },
  })
    .limit(50)
    .lean();

  for (const cpnResv of expiredReservations) {
    const orderQueries: Array<Record<string, unknown>> = [];
    if (cpnResv.orderId) {
      orderQueries.push({ id: cpnResv.orderId });
    }
    if (cpnResv.idempotencyKey && cpnResv.customerId) {
      orderQueries.push({ customerId: cpnResv.customerId, idempotencyKey: cpnResv.idempotencyKey });
    }

    const matchingOrder = orderQueries.length > 0
      ? await db.models.Order.findOne({ $or: orderQueries }).lean()
      : null;

    if (matchingOrder) {
      await db.models.CouponReservation.updateOne(
        { id: cpnResv.id, status: 'claimed' },
        {
          $set: {
            status: 'consumed',
            orderId: matchingOrder.id,
            consumedAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        }
      );
    } else {
      const updated = await db.models.CouponReservation.findOneAndUpdate(
        { id: cpnResv.id, status: 'claimed' },
        {
          $set: {
            status: 'expired',
            releasedAt: new Date().toISOString(),
            releaseReason: 'expired_reservation_recovery',
            updatedAt: new Date().toISOString(),
          },
        },
        { returnDocument: 'after' }
      );

      if (updated) {
        await db.models.Coupon.updateOne(
          { id: cpnResv.couponId, usedCount: { $gt: 0 } },
          { $inc: { usedCount: -1 } }
        );
        result.couponReservationsRecovered++;
      }
    }
  }

  return result;
}
