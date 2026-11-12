import crypto from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import { calculateOrderShippingCharge, getVariantStockUnits, parseWeightGrams } from '../../shared/catalogSeed.ts';
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

const createOrderSchema = z.object({
  orderType: z.enum(['standard', 'custom']).optional().default('standard'),
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
  deliveryAddress: z.object({
    fullName: z.string().trim().min(2),
    mobileNumber: z.string().trim().min(10),
    whatsappNumber: z.string().trim().optional(),
    email: z.string().trim().optional(),
    deliveryAddress: z.string().trim().min(4),
    city: z.string().trim().min(2),
    state: z.string().trim().min(2),
    pincode: z.string().trim().min(4),
  }),
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
    } catch {}
  } else if (orderRow.deliveryAddress && typeof orderRow.deliveryAddress === 'object') {
    parsedAddress = orderRow.deliveryAddress;
  }
  if (typeof orderRow.customerSnapshot === 'string') {
    try {
      parsedCustomer = JSON.parse(orderRow.customerSnapshot);
    } catch {}
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
      res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid order details' });
      return;
    }

    const { orderType, items, couponCode, paymentMethod, deliveryAddress, instructions } = parsed.data;
    const customer = req.user!;

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
      const baseEffectivePrice =
        prod.discountPrice && prod.discountPrice > 0 && prod.discountPrice < prod.price
          ? prod.discountPrice
          : prod.price;

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

      let effectivePrice = baseEffectivePrice;
      let effectiveCost = Number(prod.purchasePrice || 0);
      let resolvedVariantId: string | null = null;
      let resolvedWeightLabel: string | null = null;
      let stockUnitsPerPack = 1;
      let variantStockRemaining: number | null = null;

      if (matchedVariant) {
        resolvedVariantId = String(matchedVariant.id);
        resolvedWeightLabel = String(matchedVariant.weightLabel);
        effectivePrice =
          matchedVariant.discountPrice &&
          matchedVariant.discountPrice > 0 &&
          matchedVariant.discountPrice < matchedVariant.sellingPrice
            ? Number(matchedVariant.discountPrice)
            : Number(matchedVariant.sellingPrice);
        effectiveCost = Number(matchedVariant.purchasePrice || 0);
        stockUnitsPerPack = getVariantStockUnits(resolvedWeightLabel, prodBaseUnit);
        variantStockRemaining = Math.max(0, Number(matchedVariant.stock || 0) - item.quantity);
      } else if (item.weightLabel) {
        resolvedWeightLabel = item.weightLabel.trim();
        stockUnitsPerPack = getVariantStockUnits(resolvedWeightLabel, prodBaseUnit);
        const priceRatio = stockUnitsPerPack / basePackUnits;
        effectivePrice = Math.round(baseEffectivePrice * priceRatio);
        effectiveCost = Math.round(effectiveCost * priceRatio);
      }

      const lineSubtotal = Math.round(effectivePrice * item.quantity);
      const lineCost = Math.round(effectiveCost * item.quantity);
      const stockDeduction = Number((stockUnitsPerPack * item.quantity).toFixed(3));
      subtotal += lineSubtotal;
      totalCostOfGoods += lineCost;
      resolvedItems.push({
        productId: prod.id,
        variantId: resolvedVariantId,
        weightLabel: resolvedWeightLabel,
        productName: prod.name,
        productImage: prod.image,
        category: prod.category,
        unit: prod.unit,
        purchasePrice: effectiveCost,
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
      appliedCoupon = coupon.code;
      await db.models.Coupon.updateOne({ id: coupon.id }, { $inc: { usedCount: 1 } });
    }

    const biz = await getBusinessSettingsDoc(db);
    const freeThreshold = typeof biz.freeShippingThreshold === 'number' ? biz.freeShippingThreshold : 5000;
    const defaultShip = typeof biz.defaultShippingCharge === 'number' ? biz.defaultShippingCharge : 120;
    const defaultGst = typeof biz.defaultGstRate === 'number' ? biz.defaultGstRate : 5;

    const netAfterDiscount = Math.max(0, subtotal - discountAmount);
    const shippingCharge = calculateOrderShippingCharge(resolvedItems, netAfterDiscount, {
      freeThreshold,
      defaultShippingCharge: defaultShip,
      orderType,
    });
    const taxAmount = Math.round(netAfterDiscount * (defaultGst / 100));
    const totalAmount = netAfterDiscount + shippingCharge + taxAmount;

    const orderId = `ord_${crypto.randomUUID()}`;
    const orderNumber = generateOrderNumber();
    const now = new Date().toISOString();
    const paymentStatus = paymentMethod.toLowerCase().includes('cod') ? 'cod' : 'pending';

    const addressPayload = {
      ...deliveryAddress,
      whatsappNumber: deliveryAddress.whatsappNumber || deliveryAddress.mobileNumber,
      email: customer.email,
    };
    const customerSnapshot = {
      id: customer.id,
      name: customer.name,
      email: customer.email,
      phone: customer.phone,
    };

    const createdOrder = await db.models.Order.create({
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
      shippingCharge,
      taxAmount,
      totalAmount,
      costOfGoods: totalCostOfGoods,
      deliveryAddress: addressPayload,
      customerSnapshot,
      instructions,
      estimatedDeliveryEstimate: '3-5 Business Days',
      createdAt: now,
      updatedAt: now,
    });

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

      const newStock = Math.max(0, Number((ri.currentStock - ri.stockQuantity).toFixed(2)));
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
        movementType: 'order_deduct',
        quantity: ri.stockQuantity,
        previousStock: ri.currentStock,
        updatedStock: newStock,
        unitCost: ri.purchasePrice,
        reason: `Order #${orderNumber}${ri.weightLabel ? ` (${ri.quantity} × ${ri.weightLabel})` : ''}`,
        adminId: customer.id,
        adminName: customer.name,
        timestamp: now,
      });

      if (newStock === 0) {
        await createAdminNotification(db, {
          type: 'out_of_stock',
          title: `Out of Stock: ${ri.productName}`,
          message: `Stock reached 0 after order #${orderNumber}.`,
          severity: 'critical',
          entityType: 'product',
          entityId: ri.productId,
        });
      } else if (newStock <= ri.minStockAlert) {
        await createAdminNotification(db, {
          type: 'low_stock',
          title: `Low Stock Alert: ${ri.productName}`,
          message: `Remaining stock is ${newStock} ${ri.unit} (alert threshold: ${ri.minStockAlert}).`,
          severity: 'warning',
          entityType: 'product',
          entityId: ri.productId,
        });
      }
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

    const earnedPoints = Math.floor(totalAmount / 100);
    if (earnedPoints > 0) {
      await db.models.Customer.updateOne(
        { id: customer.id },
        { $inc: { loyaltyPoints: earnedPoints }, $set: { updatedAt: now } }
      );
    }

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

    res.status(201).json({
      message: 'Order placed successfully!',
      order: await hydrateOrder(db, savedOrderObj),
      emailStatus,
    });
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
      { id: row.id },
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
      { new: true }
    ).lean();

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
      const pRow = await db.models.Product.findOne({ id: ci.productId }).lean();
      if (pRow) {
        const prev = Number(pRow.stock || 0);
        const next = Number((prev + ci.quantity).toFixed(2));
        await db.models.Product.updateOne(
          { id: ci.productId },
          { $set: { stock: next, inStock: true, updatedAt: now } }
        );
        await syncInventoryRecord(db, ci.productId);
        await db.models.InventoryTransaction.create({
          id: `invtx_${crypto.randomUUID()}`,
          productId: ci.productId,
          movementType: 'order_return',
          quantity: ci.quantity,
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
