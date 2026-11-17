import crypto from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import {
  calculateOrderShippingCharge,
  getVariantStockUnits,
  parseWeightGrams,
  isSuratCity,
  SURAT_MARGIN_PERCENT,
  OTHER_CITY_MARGIN_PERCENT,
  SURAT_SHIPPING_FEE,
  OTHER_CITY_SHIPPING_FEE,
  NON_SURAT_FREE_SHIPPING_THRESHOLD,
  getProductBaseCost,
  getVariantBaseCost,
  calculateDynamicSellingPrice,
} from '../../shared/catalogSeed.ts';
import { getBusinessSettingsDoc, MongoDatabase, syncInventoryRecord } from '../db/mongo.ts';
import {
  createAdminNotification,
  createCustomerNotification,
  createRateLimiter,
  requireAuth,
  requireVerifiedEmail,
} from '../middleware/security.ts';
import { EmailService, OrderEmailRecord } from '../services/emailService.ts';
import { generateOrderNumber } from '../utils/crypto.ts';
import {
  calculateLoyaltyPoints,
  creditLoyaltyPoints,
  reverseLoyaltyPoints,
} from '../services/loyaltyService.ts';

export function computeOrderFingerprint(
  customerId: string,
  payload: {
    orderType?: string;
    items: Array<{ productId: string; quantity: number; variantId?: string | null; weightLabel?: string | null }>;
    couponCode?: string | null;
    paymentMethod?: string;
    deliveryAddress?: Record<string, any>;
  }
): string {
  const normalizedItems = [...payload.items]
    .map(i => ({
      productId: String(i.productId).trim(),
      variantId: i.variantId ? String(i.variantId).trim() : null,
      weightLabel: i.weightLabel ? String(i.weightLabel).trim() : null,
      quantity: Number(i.quantity),
    }))
    .sort((a, b) => {
      const pCmp = a.productId.localeCompare(b.productId);
      if (pCmp !== 0) return pCmp;
      return (a.variantId || '').localeCompare(b.variantId || '');
    });

  const addr = payload.deliveryAddress || {};
  const normalizedAddress = {
    houseFlat: String(addr.houseFlat || '').trim().toLowerCase(),
    streetArea: String(addr.streetArea || '').trim().toLowerCase(),
    deliveryAddress: String(addr.deliveryAddress || '').trim().toLowerCase(),
    city: String(addr.city || '').trim().toLowerCase(),
    state: String(addr.state || '').trim().toLowerCase(),
    pincode: String(addr.pincode || '').trim(),
    country: String(addr.country || 'india').trim().toLowerCase(),
  };

  const normalized = {
    customerId: String(customerId).trim(),
    orderType: String(payload.orderType || 'standard').trim().toLowerCase(),
    couponCode: payload.couponCode ? String(payload.couponCode).trim().toUpperCase() : null,
    paymentMethod: String(payload.paymentMethod || 'Concierge Invoice / COD').trim().toLowerCase(),
    items: normalizedItems,
    deliveryAddress: normalizedAddress,
  };

  return crypto
    .createHash('sha256')
    .update(JSON.stringify(normalized))
    .digest('hex');
}

const createOrderSchema = z.object({
  orderType: z.enum(['standard', 'custom']).optional().default('standard'),
  idempotencyKey: z.string().trim().max(128).optional().nullable(),
  items: z
    .array(
      z.object({
        productId: z.string().min(1),
        quantity: z.number().positive(),
        variantId: z.string().trim().optional().nullable(),
        weightLabel: z.string().trim().optional().nullable(),
      })
    )
    .min(1, 'Please select at least one product'),
  couponCode: z.string().trim().optional().nullable(),
  paymentMethod: z.string().trim().min(2).max(80).optional().default('Concierge Invoice / COD'),
  deliveryAddress: z
    .object({
      fullName: z.string().trim().min(2).optional().or(z.literal('')),
      mobileNumber: z.string().trim().min(10).optional().or(z.literal('')),
      whatsappNumber: z.string().trim().optional().or(z.literal('')),
      email: z.string().trim().optional().or(z.literal('')),
      houseFlat: z.string().trim().optional(),
      streetArea: z.string().trim().optional(),
      deliveryAddress: z.string().trim().optional().default(''),
      city: z.string().trim().optional(),
      state: z.string().trim().optional(),
      pincode: z.string().trim().optional(),
      country: z.string().trim().optional().default('India'),
    })
    .optional(),
  instructions: z.string().trim().max(1000).optional().default(''),
});

export async function hydrateOrder(db: MongoDatabase, orderRow: Record<string, any>) {
  const orderId = String(orderRow.id);
  const [items, shipment, history] = await Promise.all([
    db.models.OrderItem.find({ orderId }, { _id: 0 }).lean(),
    db.models.OrderShipment.findOne({ orderId }, { _id: 0 }).lean(),
    db.models.OrderStatusHistory.find({ orderId }, { _id: 0 }).sort({ timestamp: 1 }).lean(),
  ]);

  let parsedAddress = {};
  let parsedCustomer = {};
  if (typeof orderRow.deliveryAddress === 'string') {
    try {
      parsedAddress = JSON.parse(orderRow.deliveryAddress);
    } catch { }
  } else if (orderRow.deliveryAddress && typeof orderRow.deliveryAddress === 'object') {
    parsedAddress = orderRow.deliveryAddress;
  }
  if (typeof orderRow.customerSnapshot === 'string') {
    try {
      parsedCustomer = JSON.parse(orderRow.customerSnapshot);
    } catch { }
  } else if (orderRow.customerSnapshot && typeof orderRow.customerSnapshot === 'object') {
    parsedCustomer = orderRow.customerSnapshot;
  }

  return {
    ...orderRow,
    deliveryAddressObj: parsedAddress,
    customerObj: parsedCustomer,
    items,
    shipment: shipment || null,
    statusHistory: history,
  };
}

export function createOrdersRouter(db: MongoDatabase, emailService: EmailService) {
  const router = Router();
  const orderRateLimit = createRateLimiter({ windowMs: 15 * 60 * 1000, max: 30, keyPrefix: 'orders' });

  router.use(requireAuth);

  // Place verified order
  router.post('/', orderRateLimit, requireVerifiedEmail, async (req, res) => {
    const parsed = createOrderSchema.safeParse(req.body);
    if (!parsed.success) {
      console.warn('[ORDERS ROUTE] Order schema validation failed:', parsed.error.issues.map(i => i.message).join('; '));
      res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid order details' });
      return;
    }

    const { orderType, items, couponCode, paymentMethod, deliveryAddress, instructions } = parsed.data;
    const customer = req.user!;

    // DISTRIBUTED DATABASE-ENFORCED ORDER IDEMPOTENCY (PHASE 1.3 TASK 1)
    const headerKey = req.get('idempotency-key') || req.get('x-idempotency-key');
    const idempotencyKey = (typeof headerKey === 'string' && headerKey.trim())
      ? headerKey.trim()
      : (typeof parsed.data.idempotencyKey === 'string' && parsed.data.idempotencyKey.trim())
        ? parsed.data.idempotencyKey.trim()
        : null;

    if (idempotencyKey) {
      const fingerprint = computeOrderFingerprint(customer.id, parsed.data);
      const existingRecord = await db.models.IdempotencyRecord.findOne({
        customerId: customer.id,
        idempotencyKey,
      }).lean();

      if (existingRecord) {
        if (existingRecord.requestFingerprint !== fingerprint) {
          res.status(409).json({
            error: 'Idempotency key mismatch: this idempotency key was previously submitted with different order details.',
            code: 'IDEMPOTENCY_MISMATCH',
          });
          return;
        }

        if (existingRecord.status === 'completed') {
          if (existingRecord.orderId) {
            const existingOrder = await db.models.Order.findOne({ id: existingRecord.orderId }).lean();
            if (existingOrder) {
              res.status(200).json({
                message: 'Order retrieved (idempotent replay).',
                order: await hydrateOrder(db, existingOrder),
                idempotentReplay: true,
              });
              return;
            }
          }
          if (existingRecord.responseSnapshot) {
            res.status(200).json({
              ...existingRecord.responseSnapshot,
              idempotentReplay: true,
            });
            return;
          }
        }

        const nowIso = new Date().toISOString();
        if (existingRecord.status === 'processing' && existingRecord.lockedUntil > nowIso) {
          res.status(409).json({
            error: 'An order request with this idempotency key is currently processing. Please wait or retry shortly.',
            code: 'IDEMPOTENCY_IN_FLIGHT',
          });
          return;
        }

        // Lock expired or previous attempt failed: atomically acquire lock
        const lockDurationMs = 60000;
        const newLockUntil = new Date(Date.now() + lockDurationMs).toISOString();
        const acquired = await db.models.IdempotencyRecord.findOneAndUpdate(
          {
            customerId: customer.id,
            idempotencyKey,
            $or: [
              { lockedUntil: { $lte: nowIso } },
              { status: { $in: ['failed', 'recovering'] } },
            ],
          },
          {
            $set: {
              status: 'processing',
              lockedUntil: newLockUntil,
              updatedAt: nowIso,
            },
          },
          { returnDocument: 'after' }
        ).lean();

        if (!acquired) {
          res.status(409).json({
            error: 'An order request with this idempotency key is currently processing. Please wait or retry shortly.',
            code: 'IDEMPOTENCY_IN_FLIGHT',
          });
          return;
        }
      } else {
        // Check for legacy orders created before IdempotencyRecord was introduced
        const legacyOrder = await db.models.Order.findOne({
          customerId: customer.id,
          idempotencyKey,
        }).lean();
        if (legacyOrder) {
          res.status(200).json({
            message: 'Order retrieved (idempotent replay).',
            order: await hydrateOrder(db, legacyOrder),
            idempotentReplay: true,
          });
          return;
        }

        // Insert new IdempotencyRecord
        const nowIso = new Date().toISOString();
        try {
          await db.models.IdempotencyRecord.create({
            id: `idemp_${crypto.randomUUID()}`,
            customerId: customer.id,
            idempotencyKey,
            requestFingerprint: fingerprint,
            status: 'processing',
            lockedUntil: new Date(Date.now() + 60000).toISOString(),
            createdAt: nowIso,
            updatedAt: nowIso,
          });
        } catch (err: any) {
          if (err?.code === 11000 || err?.name === 'MongoServerError') {
            // Concurrent race from another instance
            const raced = await db.models.IdempotencyRecord.findOne({
              customerId: customer.id,
              idempotencyKey,
            }).lean();
            if (raced && raced.requestFingerprint !== fingerprint) {
              res.status(409).json({
                error: 'Idempotency key mismatch: this idempotency key was previously submitted with different order details.',
                code: 'IDEMPOTENCY_MISMATCH',
              });
              return;
            }
            if (raced && raced.status === 'completed' && raced.orderId) {
              const racedOrder = await db.models.Order.findOne({ id: raced.orderId }).lean();
              if (racedOrder) {
                res.status(200).json({
                  message: 'Order retrieved (idempotent replay).',
                  order: await hydrateOrder(db, racedOrder),
                  idempotentReplay: true,
                });
                return;
              }
            }
            res.status(409).json({
              error: 'An order request with this idempotency key is currently processing. Please wait or retry shortly.',
              code: 'IDEMPOTENCY_IN_FLIGHT',
            });
            return;
          }
          throw err;
        }
      }
    }

    try {
      const now = new Date().toISOString();
      // Enforce user's verified saved default address from DB, or use explicit deliveryAddress
      const savedAddress = (await db.models.CustomerAddress.findOne({ customerId: customer.id, isDefault: true }).lean())
        || (await db.models.CustomerAddress.findOne({ customerId: customer.id }).sort({ createdAt: -1 }).lean());

      const hasExplicitAddress = deliveryAddress && typeof deliveryAddress === 'object';
      const addr: Record<string, any> = hasExplicitAddress ? deliveryAddress : (savedAddress || {});
      const targetCity = (addr.city || '').trim();
      const targetState = (addr.state || '').trim();
      const targetPincode = (addr.pincode || '').trim();
      const targetHouseFlat = (addr.houseFlat || '').trim();
      const targetStreetArea = (addr.streetArea || '').trim();
      const targetAddressLine = (
        addr.deliveryAddress ||
        addr.addressLine ||
        [targetHouseFlat, targetStreetArea].filter(Boolean).join(', ')
      ).trim();

      // Mandatory shipping address validation before ordering
      if (!targetCity || !targetState || !/^\d{6}$/.test(targetPincode) || (!targetAddressLine && (!targetHouseFlat || !targetStreetArea))) {
        console.warn('[ORDERS ROUTE] Shipping address incomplete:', { targetCity, targetState, targetPincode, targetAddressLine, targetHouseFlat, targetStreetArea });
        res.status(400).json({
          error: 'A complete shipping address (House/Flat, Street/Locality, City, State, 6-digit PIN) is mandatory before placing an order. Please update your shipping address in your profile.',
          code: 'SHIPPING_ADDRESS_REQUIRED',
        });
        return;
      }

      const isSurat = isSuratCity(targetCity);
      const appliedProfitMargin = isSurat ? SURAT_MARGIN_PERCENT : OTHER_CITY_MARGIN_PERCENT;

      const resolvedItems: Array<{
        productId: string;
        variantId: string | null;
        weightLabel: string | null;
        productName: string;
        productImage: string;
        category: string;
        categoryId?: string;
        unit: string;
        purchasePrice: number;
        baseCostPrice: number;
        appliedProfitMargin: number;
        unitPrice: number;
        quantity: number;
        stockQuantity: number;
        variantStockRemaining: number | null;
        subtotal: number;
        currentStock: number;
        minStockAlert: number;
        gstRate: number;
      }> = [];

      let subtotal = 0;
      let totalCostOfGoods = 0;
      for (const item of items) {
        const prod = await db.models.Product.findOne({ id: item.productId }).lean();
        if (!prod || prod.status !== 'published') {
          res.status(400).json({ error: `Product "${item.productId}" is unavailable.` });
          return;
        }

        const prodBaseUnit: 'kg' | 'gram' | 'ml' | 'piece' =
          prod.unit === 'gram' ? 'gram' : prod.unit === 'ml' ? 'ml' : prod.unit === 'piece' ? 'piece' : 'kg';
        const basePackUnits =
          prodBaseUnit === 'ml'
            ? parseWeightGrams(String(prod.weightLabel || '100ml')) || 100
            : prodBaseUnit === 'gram'
              ? parseWeightGrams(String(prod.weightLabel || '1g')) || 1
              : 1;

        let matchedVariant: Record<string, any> | null = null;
        if (item.variantId && !item.variantId.startsWith('pack_')) {
          matchedVariant = await db.models.ProductVariant.findOne({
            id: item.variantId,
            productId: prod.id,
            active: true,
          }).lean();
        }
        if (!matchedVariant && item.weightLabel) {
          matchedVariant = await db.models.ProductVariant.findOne({
            productId: prod.id,
            weightLabel: item.weightLabel,
            active: true,
          }).lean();
        }

        const prodBaseCost = getProductBaseCost(prod);
        let itemBaseCost = prodBaseCost;
        let effectivePrice = calculateDynamicSellingPrice(prodBaseCost, appliedProfitMargin);
        let effectiveCost = prodBaseCost;
        let resolvedVariantId: string | null = null;
        let resolvedWeightLabel: string | null = null;
        let stockUnitsPerPack = 1;
        let variantStockRemaining: number | null = null;

        if (matchedVariant) {
          resolvedVariantId = String(matchedVariant.id);
          resolvedWeightLabel = String(matchedVariant.weightLabel);
          const variantBaseCost = getVariantBaseCost(matchedVariant as any);
          itemBaseCost = variantBaseCost;
          effectiveCost = variantBaseCost;
          effectivePrice = calculateDynamicSellingPrice(variantBaseCost, appliedProfitMargin);

          if (
            matchedVariant.discountPrice &&
            matchedVariant.discountPrice > 0 &&
            matchedVariant.discountPrice < matchedVariant.sellingPrice
          ) {
            const discountBaseCost = Math.round(Number(matchedVariant.discountPrice) / 1.40);
            effectivePrice = calculateDynamicSellingPrice(discountBaseCost, appliedProfitMargin);
          }

          stockUnitsPerPack = getVariantStockUnits(resolvedWeightLabel, prodBaseUnit);
          variantStockRemaining = Math.max(0, Number(matchedVariant.stock || 0) - item.quantity);
        } else if (item.weightLabel) {
          resolvedWeightLabel = item.weightLabel.trim();
          stockUnitsPerPack = getVariantStockUnits(resolvedWeightLabel, prodBaseUnit);
          const priceRatio = stockUnitsPerPack / basePackUnits;
          itemBaseCost = Math.round(prodBaseCost * priceRatio);
          effectiveCost = itemBaseCost;
          effectivePrice = calculateDynamicSellingPrice(itemBaseCost, appliedProfitMargin);

          if (prod.discountPrice && prod.discountPrice > 0 && prod.discountPrice < prod.price) {
            const discountBaseCost = Math.round(Number(prod.discountPrice) / 1.40);
            effectivePrice = calculateDynamicSellingPrice(Math.round(discountBaseCost * priceRatio), appliedProfitMargin);
          }
        } else {
          if (prod.discountPrice && prod.discountPrice > 0 && prod.discountPrice < prod.price) {
            const discountBaseCost = Math.round(Number(prod.discountPrice) / 1.40);
            effectivePrice = calculateDynamicSellingPrice(discountBaseCost, appliedProfitMargin);
          }
        }

        const lineSubtotal = Math.round(effectivePrice * item.quantity);
        const lineCost = Math.round(effectiveCost * item.quantity);
        const stockDeduction = Number((stockUnitsPerPack * item.quantity).toFixed(3));

        // PRE-FLIGHT INVENTORY VALIDATION (SEC-02)
        let currentProdStock = Number(prod.stock || 0);
        if (matchedVariant && Number(matchedVariant.stock || 0) >= item.quantity && currentProdStock < stockDeduction) {
          // Parent stock is desynchronized from active variant stock - heal parent stock
          const neededStock = stockDeduction - currentProdStock;
          await db.models.Product.updateOne(
            { id: prod.id },
            { $inc: { stock: neededStock }, $set: { inStock: true, updatedAt: now } }
          );
          currentProdStock = stockDeduction;
        }

        if (currentProdStock < stockDeduction) {
          console.warn('[ORDERS ROUTE] Insufficient stock:', prod.name, { currentProdStock, stockDeduction });
          res.status(400).json({
            error: `Insufficient stock for "${prod.name}". Only ${currentProdStock} ${prod.unit} available (requested: ${stockDeduction} ${prod.unit}).`,
          });
          return;
        }
        if (matchedVariant && Number(matchedVariant.stock || 0) < item.quantity) {
          console.warn('[ORDERS ROUTE] Insufficient variant stock:', prod.name, matchedVariant.weightLabel, { stock: matchedVariant.stock, requested: item.quantity });
          res.status(400).json({
            error: `Pack "${matchedVariant.weightLabel}" for "${prod.name}" has only ${matchedVariant.stock} units remaining.`,
          });
          return;
        }

        subtotal += lineSubtotal;
        totalCostOfGoods += lineCost;
        resolvedItems.push({
          productId: prod.id,
          variantId: resolvedVariantId,
          weightLabel: resolvedWeightLabel,
          productName: prod.name,
          productImage: prod.image,
          category: prod.category,
          categoryId: (prod as any).categoryId || prod.category,
          unit: prod.unit,
          purchasePrice: effectiveCost,
          baseCostPrice: itemBaseCost,
          appliedProfitMargin,
          unitPrice: effectivePrice,
          quantity: item.quantity,
          stockQuantity: stockDeduction,
          variantStockRemaining,
          subtotal: lineSubtotal,
          currentStock: Number(prod.stock || 0),
          minStockAlert: Number(prod.minStockAlert || 5),
          gstRate: Number(prod.gstRate ?? 5),
        });
      }

      let discountAmount = 0;
      let appliedCoupon: string | null = null;
      let claimedCouponId: string | null = null;
      const couponReservationId = couponCode ? `cres_${crypto.randomUUID()}` : null;

      const compensateCoupon = async (reason: string) => {
        if (!claimedCouponId || !couponReservationId) return;
        // Atomic state transition: claimed -> released (DURABLE COMPENSATION - TASK 2)
        const resv = await db.models.CouponReservation.findOneAndUpdate(
          { id: couponReservationId, status: 'claimed' },
          {
            $set: {
              status: 'released',
              releasedAt: new Date().toISOString(),
              releaseReason: reason,
              updatedAt: new Date().toISOString(),
            },
          },
          { returnDocument: 'after' }
        );
        if (resv) {
          try {
            // Bounded decrement: prevents underflow below 0 (TASK 2)
            await db.models.Coupon.updateOne(
              { id: claimedCouponId, usedCount: { $gt: 0 } },
              { $inc: { usedCount: -1 } }
            );
          } catch (err: any) {
            // Persist failure to reservation for recovery worker retry
            await db.models.CouponReservation.updateOne(
              { id: couponReservationId },
              {
                $inc: { retryCount: 1 },
                $set: { lastError: err?.message || String(err), updatedAt: new Date().toISOString() },
              }
            );
            throw err;
          }
          try {
            await db.models.AuditLog.create({
              id: `audit_${crypto.randomUUID()}`,
              action: 'coupon_reservation_released',
              entityType: 'coupon',
              entityId: claimedCouponId,
              details: { reservationId: couponReservationId, reason, customerId: customer.id },
              timestamp: new Date().toISOString(),
            });
          } catch { }
        }
      };

      if (couponCode) {
        const cleanCode = couponCode.trim().toUpperCase();
        const nowIso = new Date().toISOString();
        const coupon = await db.models.Coupon.findOne({
          code: cleanCode,
          active: true,
          $and: [
            { $or: [{ startDate: null }, { startDate: { $lte: nowIso } }] },
            { $or: [{ endDate: null }, { endDate: { $gte: nowIso } }] },
          ],
        }).lean();

        if (!coupon) {
          res.status(400).json({ error: `Coupon code "${cleanCode}" is invalid or expired.` });
          return;
        }
        if (coupon.usageLimit && (coupon.usedCount || 0) >= coupon.usageLimit) {
          res.status(400).json({ error: `Coupon code "${cleanCode}" has reached its maximum usage limit.` });
          return;
        }
        if (
          coupon.targetCustomerId &&
          coupon.targetCustomerId !== customer.id &&
          (!coupon.targetEmail || coupon.targetEmail.toLowerCase() !== customer.email.toLowerCase())
        ) {
          res.status(403).json({ error: `Coupon "${cleanCode}" is exclusively reserved for an invited patron account.` });
          return;
        }
        if (subtotal < coupon.minOrderValue) {
          res.status(400).json({
            error: `Coupon "${cleanCode}" requires a minimum order of ₹${coupon.minOrderValue}.`,
          });
          return;
        }
        discountAmount =
          coupon.discountType === 'percentage'
            ? Math.round((subtotal * coupon.discountValue) / 100)
            : Math.round(coupon.discountValue);
        if (coupon.maxDiscount && discountAmount > coupon.maxDiscount) {
          discountAmount = Math.round(coupon.maxDiscount);
        }
        discountAmount = Math.min(discountAmount, subtotal);

        // ATOMIC CONDITIONAL USAGE-LIMIT & TEMPORAL VALIDATION (SEC-03, TASK 2 & TASK 3)
        const lockedCoupon = await db.models.Coupon.findOneAndUpdate(
          {
            id: coupon.id,
            active: true,
            $and: [
              { $or: [{ startDate: null }, { startDate: { $exists: false } }, { startDate: { $lte: nowIso } }] },
              { $or: [{ endDate: null }, { endDate: { $exists: false } }, { endDate: { $gte: nowIso } }] },
              {
                $or: [
                  { usageLimit: null },
                  { usageLimit: { $exists: false } },
                  { $expr: { $lt: [{ $ifNull: ['$usedCount', 0] }, '$usageLimit'] } },
                ],
              },
            ],
          },
          { $inc: { usedCount: 1 } },
          { returnDocument: 'after' }
        );

        if (!lockedCoupon) {
          res.status(409).json({ error: `Coupon code "${cleanCode}" has reached its maximum usage limit or has expired.` });
          return;
        }

        appliedCoupon = coupon.code;
        claimedCouponId = coupon.id;

        if (couponReservationId) {
          await db.models.CouponReservation.create({
            id: couponReservationId,
            couponId: coupon.id,
            couponCode: cleanCode,
            customerId: customer.id,
            orderId: null,
            idempotencyKey: idempotencyKey || null,
            status: 'claimed',
            discountAmount,
            claimedAt: nowIso,
            expiresAt: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
            createdAt: nowIso,
            updatedAt: nowIso,
          });

          try {
            await db.models.AuditLog.create({
              id: `audit_${crypto.randomUUID()}`,
              action: 'coupon_reserved',
              entityType: 'coupon',
              entityId: coupon.id,
              details: { reservationId: couponReservationId, code: cleanCode, customerId: customer.id },
              timestamp: nowIso,
            });
          } catch { }
        }
      }

    const biz = await getBusinessSettingsDoc(db);
    const defaultGst = typeof biz.defaultGstRate === 'number' ? biz.defaultGstRate : 0;

      const netAfterDiscount = Math.max(0, subtotal - discountAmount);
      // Shipping charge: ₹0 for Surat. Non-Surat: weight-based calculation ceil(weight/500)*30, strictly excluding Oil products (Free over ₹5,000)
      const shippingCharge = calculateOrderShippingCharge(
        resolvedItems,
        netAfterDiscount,
        {
          shippingCity: targetCity,
        }
      );
      const taxAmount = Math.round(netAfterDiscount * (defaultGst / 100));
      const totalAmount = netAfterDiscount + shippingCharge + taxAmount;

      const orderId = `ord_${crypto.randomUUID()}`;
      const orderNumber = generateOrderNumber();
      const paymentStatus = paymentMethod.toLowerCase().includes('cod') ? 'cod' : 'pending';

      const addressPayload = {
        fullName: addr.fullName || savedAddress?.fullName || customer.name,
        mobileNumber: addr.mobileNumber || savedAddress?.phone || customer.phone,
        whatsappNumber: addr.whatsappNumber || addr.mobileNumber || customer.phone,
        email: customer.email,
        houseFlat: targetHouseFlat,
        streetArea: targetStreetArea,
        deliveryAddress: targetAddressLine,
        city: targetCity,
        state: targetState,
        pincode: targetPincode,
        country: addr.country || savedAddress?.country || 'India',
      };

      if (!savedAddress) {
        await db.models.CustomerAddress.create({
          id: `addr_${crypto.randomUUID()}`,
          customerId: customer.id,
          label: 'Home',
          fullName: addressPayload.fullName,
          phone: addressPayload.mobileNumber,
          houseFlat: targetHouseFlat,
          streetArea: targetStreetArea,
          addressLine: targetAddressLine,
          city: targetCity,
          state: targetState,
          pincode: targetPincode,
          country: addressPayload.country,
          isDefault: true,
          createdAt: now,
          updatedAt: now,
        });
      }

      // DURABLE INVENTORY OPERATION TRACKING (TASK 4)
      const inventoryOpId = `invop_${crypto.randomUUID()}`;
      const leaseExpiresAt = new Date(Date.now() + 30000).toISOString();
      await db.models.InventoryOperation.create({
        id: inventoryOpId,
        orderId: null,
        orderNumber: null,
        customerId: customer.id,
        idempotencyKey: idempotencyKey || null,
        couponReservationId: couponReservationId || null,
        items: [],
        status: 'initiated',
        leaseExpiresAt,
        createdAt: now,
        updatedAt: now,
      });

      // ATOMIC CONDITIONAL STOCK RESERVATION (SEC-02)
      const successfullyDeducted: Array<{
        productId: string;
        stockQuantity: number;
        variantId: string | null;
        variantQuantity: number;
        previousStock: number;
        updatedStock: number;
        ri: (typeof resolvedItems)[0];
      }> = [];

      let stockAllocationFailed = false;
      let failedItemName = '';

      for (const ri of resolvedItems) {
        let updatedProd = await db.models.Product.findOneAndUpdate(
          {
            id: ri.productId,
            stock: { $gte: ri.stockQuantity },
          },
          {
            $inc: { stock: -ri.stockQuantity },
            $set: { updatedAt: now },
          },
          { returnDocument: 'after' }
        );

        if (!updatedProd && ri.variantId) {
          // If variant is present and has stock, heal parent product stock and re-attempt
          const varDoc = await db.models.ProductVariant.findOne({ id: ri.variantId, stock: { $gte: ri.quantity } }).lean();
          if (varDoc) {
            await db.models.Product.updateOne(
              { id: ri.productId },
              { $inc: { stock: ri.stockQuantity }, $set: { inStock: true, updatedAt: now } }
            );
            updatedProd = await db.models.Product.findOneAndUpdate(
              {
                id: ri.productId,
                stock: { $gte: ri.stockQuantity },
              },
              {
                $inc: { stock: -ri.stockQuantity },
                $set: { updatedAt: now },
              },
              { returnDocument: 'after' }
            );
          }
        }

        if (!updatedProd) {
          stockAllocationFailed = true;
          failedItemName = ri.productName;
          break;
        }

        if (ri.variantId) {
          const updatedVar = await db.models.ProductVariant.findOneAndUpdate(
            {
              id: ri.variantId,
              stock: { $gte: ri.quantity },
            },
            {
              $inc: { stock: -ri.quantity },
              $set: { updatedAt: now },
            },
            { returnDocument: 'after' }
          );

          if (!updatedVar) {
            // Compensate: restore product stock for this item
            await db.models.Product.updateOne(
              { id: ri.productId },
              { $inc: { stock: ri.stockQuantity }, $set: { updatedAt: now } }
            );
            stockAllocationFailed = true;
            failedItemName = `${ri.productName} (${ri.weightLabel || 'Pack'})`;
            break;
          }

          if (Number(updatedVar.stock || 0) <= 0) {
            await db.models.ProductVariant.updateOne(
              { id: ri.variantId },
              { $set: { active: false, updatedAt: now } }
            );
          }
        }

        const newStockVal = Number(updatedProd.stock || 0);
        if (newStockVal <= 0) {
          await db.models.Product.updateOne(
            { id: ri.productId, stock: { $lte: 0 } },
            { $set: { inStock: false, updatedAt: now } }
          );
        }

        successfullyDeducted.push({
          productId: ri.productId,
          stockQuantity: ri.stockQuantity,
          variantId: ri.variantId,
          variantQuantity: ri.quantity,
          previousStock: Number((newStockVal + ri.stockQuantity).toFixed(2)),
          updatedStock: newStockVal,
          ri,
        });

        // Update durable inventory operation record
        await db.models.InventoryOperation.updateOne(
          { id: inventoryOpId },
          {
            $push: {
              items: {
                productId: ri.productId,
                variantId: ri.variantId,
                packWeight: ri.quantity > 0 ? Number((ri.stockQuantity / ri.quantity).toFixed(3)) : ri.stockQuantity,
                quantity: ri.quantity,
                weightDeducted: ri.stockQuantity,
                previousStock: Number((newStockVal + ri.stockQuantity).toFixed(2)),
                updatedStock: newStockVal,
              },
            },
            $set: { status: 'reserved', updatedAt: now },
          }
        );
      }

      if (stockAllocationFailed) {
        await db.models.InventoryOperation.updateOne(
          { id: inventoryOpId },
          { $set: { status: 'compensation_pending', updatedAt: now } }
        );

        // Roll back prior deducted items
        for (const prior of successfullyDeducted) {
          await db.models.Product.updateOne(
            { id: prior.productId },
            { $inc: { stock: prior.stockQuantity }, $set: { inStock: true, updatedAt: now } }
          );
          if (prior.variantId) {
            await db.models.ProductVariant.updateOne(
              { id: prior.variantId },
              { $inc: { stock: prior.variantQuantity }, $set: { active: true, updatedAt: now } }
            );
          }
          await syncInventoryRecord(db, prior.productId);
        }

        await compensateCoupon('stock_allocation_failure');

        await db.models.InventoryOperation.updateOne(
          { id: inventoryOpId },
          { $set: { status: 'compensated', updatedAt: now } }
        );

        if (idempotencyKey) {
          await db.models.IdempotencyRecord.updateOne(
            { customerId: customer.id, idempotencyKey },
            { $set: { status: 'failed', updatedAt: now } }
          );
        }

        res.status(409).json({
          error: `Stock allocation failed: "${failedItemName}" was just purchased by another patron or has insufficient inventory.`,
          code: 'INVENTORY_CONFLICT',
        });
        return;
      }

      let createdOrder: any = null;
      try {
        createdOrder = await db.models.Order.create({
          id: orderId,
          orderNumber,
          customerId: customer.id,
          orderType,
          status: 'placed',
          paymentMethod,
          paymentStatus,
          subtotal,
          discountAmount,
          couponCode: appliedCoupon,
          idempotencyKey: idempotencyKey || null,
          shippingCharge,
          appliedProfitMargin,
          shippingCity: targetCity,
          taxAmount,
          totalAmount,
          costOfGoods: totalCostOfGoods,
          deliveryAddress: addressPayload,
          customerSnapshot: {
            id: customer.id,
            name: customer.name,
            email: customer.email,
            phone: customer.phone,
          },
          instructions,
          internalNotes: couponReservationId ? `Coupon Reservation: ${couponReservationId}` : '',
          estimatedDeliveryEstimate: '3-5 Business Days',
          createdAt: now,
          updatedAt: now,
        });

        await db.models.InventoryOperation.updateOne(
          { id: inventoryOpId },
          { $set: { status: 'order_created', orderId, orderNumber, updatedAt: now } }
        );

        for (const it of successfullyDeducted) {
          await db.models.OrderItem.create({
            id: `oi_${crypto.randomUUID()}`,
            orderId,
            productId: it.ri.productId,
            variantId: it.ri.variantId,
            weightLabel: it.ri.weightLabel,
            productName: it.ri.productName,
            productImage: it.ri.productImage,
            category: it.ri.category,
            unit: it.ri.unit,
            purchasePrice: it.ri.purchasePrice,
            baseCostPrice: it.ri.baseCostPrice,
            appliedProfitMargin: it.ri.appliedProfitMargin,
            unitPrice: it.ri.unitPrice,
            quantity: it.ri.quantity,
            stockQuantity: it.ri.stockQuantity,
            subtotal: it.ri.subtotal,
          });

          await syncInventoryRecord(db, it.productId);

          await db.models.InventoryTransaction.create({
            id: `invtx_${crypto.randomUUID()}`,
            productId: it.productId,
            variantId: it.variantId,
            movementType: 'order_deduct',
            quantity: it.stockQuantity,
            previousStock: it.previousStock,
            updatedStock: it.updatedStock,
            unitCost: it.ri.purchasePrice,
            reason: `Order #${orderNumber}${it.ri.weightLabel ? ` (${it.ri.quantity} × ${it.ri.weightLabel})` : ''}`,
            adminId: customer.id,
            adminName: customer.name,
            timestamp: now,
          });

          if (it.updatedStock === 0) {
            await createAdminNotification(db, {
              type: 'out_of_stock',
              title: `Out of Stock: ${it.ri.productName}`,
              message: `Stock reached 0 after order #${orderNumber}.`,
              severity: 'critical',
              entityType: 'product',
              entityId: it.productId,
            });
          } else if (it.updatedStock <= it.ri.minStockAlert) {
            await createAdminNotification(db, {
              type: 'low_stock',
              title: `Low Stock Alert: ${it.ri.productName}`,
              message: `Remaining stock is ${it.updatedStock} ${it.ri.unit} (alert threshold: ${it.ri.minStockAlert}).`,
              severity: 'warning',
              entityType: 'product',
              entityId: it.productId,
            });
          }
        }
      } catch (orderErr) {
        await db.models.InventoryOperation.updateOne(
          { id: inventoryOpId },
          { $set: { status: 'compensation_pending', updatedAt: now } }
        );
        // Roll back all deductions and coupon upon order creation failure
        for (const prior of successfullyDeducted) {
          await db.models.Product.updateOne(
            { id: prior.productId },
            { $inc: { stock: prior.stockQuantity }, $set: { inStock: true, updatedAt: now } }
          );
          if (prior.variantId) {
            await db.models.ProductVariant.updateOne(
              { id: prior.variantId },
              { $inc: { stock: prior.variantQuantity }, $set: { active: true, updatedAt: now } }
            );
          }
          await syncInventoryRecord(db, prior.productId);
        }
        await compensateCoupon('order_creation_exception');
        await db.models.InventoryOperation.updateOne(
          { id: inventoryOpId },
          { $set: { status: 'compensated', updatedAt: now } }
        );
        if (idempotencyKey) {
          await db.models.IdempotencyRecord.updateOne(
            { customerId: customer.id, idempotencyKey },
            { $set: { status: 'failed', updatedAt: now } }
          );
        }
        throw orderErr;
      }

      await db.models.InventoryOperation.updateOne(
        { id: inventoryOpId },
        { $set: { status: 'committed', updatedAt: now } }
      );

      if (couponReservationId) {
        await db.models.CouponReservation.updateOne(
          { id: couponReservationId, status: 'claimed' },
          {
            $set: {
              status: 'consumed',
              orderId,
              consumedAt: now,
              updatedAt: now,
            },
          }
        );
      }

      await createAdminNotification(db, {
        type: 'new_order',
        title: `New Order #${orderNumber}`,
        message: `${customer.name} placed a ${orderType} order for ₹${totalAmount.toLocaleString('en-IN')}.`,
        severity: 'info',
        entityType: 'order',
        entityId: orderNumber,
      });

      await db.models.OrderStatusHistory.create({
        id: `osh_${crypto.randomUUID()}`,
        orderId,
        previousStatus: null,
        newStatus: 'placed',
        updatedBy: customer.name,
        notes:
          orderType === 'custom'
            ? 'Bespoke custom demand order submitted'
            : 'Order placed via Jammu Heritage Storefront',
        timestamp: now,
      });

      await creditLoyaltyPoints(db, {
        customerId: customer.id,
        orderId,
        orderNumber,
        amount: totalAmount,
        reason: `Earned from Order #${orderNumber}`,
        idempotencyKey: `earn_${orderId}`,
      });

      await createCustomerNotification(db, {
        customerId: customer.id,
        type: 'order_placed',
        title: `Order #${orderNumber} Received`,
        message: `Thank you! Your order for ₹${totalAmount.toLocaleString('en-IN')} has been received and is awaiting confirmation.`,
        relatedOrderId: orderNumber,
      });

      const savedOrderObj = createdOrder.toObject() as unknown as OrderEmailRecord;

      let emailStatus: Record<string, unknown> = { queued: true };
      try {
        emailStatus = await emailService.sendOrderPlacedEmail(savedOrderObj);
      } catch (err) {
        emailStatus = {
          queued: false,
          warning: err instanceof Error ? err.message : 'Email queued for retry',
        };
      }

      try {
        await emailService.sendAdminOrderAlertEmail(savedOrderObj);
      } catch {
        // non-fatal admin alert notification
      }

      const responseSnapshot = {
        message: 'Order placed successfully!',
        order: await hydrateOrder(db, savedOrderObj),
        emailStatus,
      };

      if (idempotencyKey) {
        await db.models.IdempotencyRecord.updateOne(
          { customerId: customer.id, idempotencyKey },
          {
            $set: {
              status: 'completed',
              orderId,
              orderNumber,
              responseSnapshot,
              updatedAt: now,
            },
          }
        );
      }

      res.status(201).json(responseSnapshot);
    } finally {
      // Idempotency state and operations are tracked durably in database
    }
  });

  // List authenticated customer's own orders
  router.get('/', async (req, res) => {
    const rows = await db.models.Order.find({ customerId: req.user!.id }, { _id: 0 })
      .sort({ createdAt: -1 })
      .lean();
    const hydrated = await Promise.all(rows.map(row => hydrateOrder(db, row)));
    res.json({ orders: hydrated });
  });

  // Track specific order
  router.get('/:orderNumber', async (req, res) => {
    const row = await db.models.Order.findOne(
      { $or: [{ orderNumber: req.params.orderNumber }, { id: req.params.orderNumber }] },
      { _id: 0 }
    ).lean();

    if (!row) {
      res.status(404).json({ error: 'Order not found.' });
      return;
    }

    if (String(row.customerId) !== req.user!.id && req.user!.role !== 'admin') {
      res.status(403).json({ error: 'You do not have permission to view this order.' });
      return;
    }

    res.json({ order: await hydrateOrder(db, row) });
  });

  // Authorized customer cancellation
  router.post('/:orderNumber/cancel', async (req, res) => {
    const reason =
      typeof req.body?.reason === 'string' && req.body.reason.trim()
        ? req.body.reason.trim()
        : 'Cancelled by customer';

    const row = await db.models.Order.findOne({
      $or: [{ orderNumber: req.params.orderNumber }, { id: req.params.orderNumber }],
    }).lean();

    if (!row) {
      res.status(404).json({ error: 'Order not found.' });
      return;
    }

    if (row.customerId !== req.user!.id && req.user!.role !== 'admin') {
      res.status(403).json({ error: 'You are not authorized to cancel this order.' });
      return;
    }

    if (!['placed', 'confirmed'].includes(row.status)) {
      res.status(400).json({
        error: `Orders in "${row.status}" stage cannot be self-cancelled. Please contact Jammu concierge.`,
      });
      return;
    }

    const now = new Date().toISOString();
    const refundStatus = row.paymentStatus === 'paid' ? 'refund_pending' : 'none';
    const refundAmount = row.paymentStatus === 'paid' ? row.totalAmount : null;

    const updated = await db.models.Order.findOneAndUpdate(
      { id: row.id, status: { $in: ['placed', 'confirmed'] } },
      {
        $set: {
          status: 'cancelled',
          cancelledAt: now,
          cancellationReason: reason,
          refundStatus,
          refundAmount,
          updatedAt: now,
        },
      },
      { returnDocument: 'after' }
    ).lean();

    if (!updated) {
      res.status(400).json({ error: 'This order has already been cancelled or cannot be self-cancelled.' });
      return;
    }

    await db.models.OrderStatusHistory.create({
      id: `osh_${crypto.randomUUID()}`,
      orderId: row.id,
      previousStatus: row.status,
      newStatus: 'cancelled',
      updatedBy: req.user!.name,
      notes: reason,
      timestamp: now,
    });

    await createCustomerNotification(db, {
      customerId: row.customerId,
      type: 'order_cancelled',
      title: `Order #${row.orderNumber} Cancelled`,
      message: `Your order has been cancelled (${reason}).`,
      relatedOrderId: row.orderNumber,
    });

    await createAdminNotification(db, {
      type: 'order_cancelled',
      title: `Order #${row.orderNumber} Cancelled`,
      message: `Cancelled by ${req.user!.name} (${reason}).`,
      severity: 'warning',
      entityType: 'order',
      entityId: row.orderNumber,
    });

    const cancelledItems = await db.models.OrderItem.find({ orderId: row.id }).lean();
    for (const ci of cancelledItems) {
      const restockWeight = Number(ci.stockQuantity ?? ci.quantity ?? 1);
      // ATOMIC CONDITIONAL RESTORATION (TASK 1: Eliminates read-calculate-$set overwrite risk)
      const updatedProduct = await db.models.Product.findOneAndUpdate(
        { id: ci.productId },
        {
          $inc: { stock: restockWeight },
          $set: { inStock: true, updatedAt: now },
        },
        { returnDocument: 'after' }
      );

      if (ci.variantId) {
        await db.models.ProductVariant.updateOne(
          { id: ci.variantId },
          { $inc: { stock: ci.quantity }, $set: { active: true, updatedAt: now } }
        );
      }
      await syncInventoryRecord(db, ci.productId);

      if (updatedProduct) {
        const next = Number(updatedProduct.stock || 0);
        const prev = Number((next - restockWeight).toFixed(2));
        await db.models.InventoryTransaction.create({
          id: `invtx_${crypto.randomUUID()}`,
          productId: ci.productId,
          variantId: ci.variantId,
          movementType: 'order_return',
          quantity: restockWeight,
          previousStock: prev,
          updatedStock: next,
          unitCost: ci.purchasePrice || 0,
          reason: `Restored from cancelled order #${row.orderNumber}`,
          adminId: req.user!.id,
          adminName: req.user!.name,
          timestamp: now,
        });
      }
    }

    const pointsToReverse = calculateLoyaltyPoints(row.totalAmount);
    if (pointsToReverse > 0 && row.customerId) {
      await reverseLoyaltyPoints(db, {
        customerId: row.customerId,
        orderId: row.id,
        orderNumber: row.orderNumber,
        pointsToReverse,
        reason: `Cancellation reversal for Order #${row.orderNumber}`,
        idempotencyKey: `reverse_cancel_${row.id}`,
      });
    }

    const updatedObj = updated as unknown as OrderEmailRecord;
    try {
      await emailService.sendOrderCancelledEmail(updatedObj);
    } catch {
      // queued
    }

    res.json({
      message: 'Order cancelled.',
      order: await hydrateOrder(db, updatedObj),
    });
  });

  return router;
}
