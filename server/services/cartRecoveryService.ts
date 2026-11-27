import crypto from 'node:crypto';
import {
  BRAND_CONFIG,
  calculateDynamicSellingPrice,
  getProductBaseCost,
  getVariantBaseCost,
  getVariantStockUnits,
  GUEST_MARGIN_PERCENT,
  isSuratCity,
  OTHER_CITY_MARGIN_PERCENT,
  parseWeightGrams,
  SURAT_MARGIN_PERCENT,
} from '../../shared/catalogSeed.ts';
import { MongoDatabase } from '../db/mongo.ts';
import { logAudit } from '../middleware/security.ts';
import { getCrmConfig, type CrmSegmentationConfig } from './crmConfigService.ts';

export interface SyncedCartLine {
  productId: string;
  variantId: string | null;
  productName: string;
  unit: string;
  weightLabel: string | null;
  unitPrice: number;
  quantity: number;
  subtotal: number;
}

export interface FollowUpEntry {
  id: string;
  channel: 'whatsapp';
  message: string;
  sentByAdminId: string;
  sentByAdminName: string;
  sentAt: string;
  status: 'initiated';
}

export interface CartFollowUpEligibility {
  eligible: boolean;
  reasonCode: 'eligible' | 'recovered' | 'expired' | 'missing_phone' | 'opted_out' | 'cooldown_active' | 'max_reached';
  reasonLabel: string;
  cooldownRemainingMinutes?: number;
}

function normalizeWhatsAppPhone(phone?: string | null): string | null {
  const digits = String(phone || '').replace(/\D/g, '');
  if (digits.length < 10) return null;
  if (digits.length === 10) return `91${digits}`;
  if (digits.length === 11 && digits.startsWith('0')) return `91${digits.slice(1)}`;
  return digits;
}

export function isCustomerWhatsAppEligible(customer?: {
  marketingConsent?: boolean;
  unsubscribedAt?: string | null;
  emailPreferences?: { marketing?: { promotionalDiscounts?: boolean } };
} | null): boolean {
  if (!customer) return false;
  if (customer.unsubscribedAt) return false;
  if (!customer.marketingConsent) return false;
  if (customer.emailPreferences?.marketing?.promotionalDiscounts === false) return false;
  return true;
}

function itemsSignature(items: Array<{ productId: string; variantId?: string | null; quantity: number }>): string {
  return [...items]
    .map(i => `${i.productId}::${i.variantId || ''}::${i.quantity}`)
    .sort()
    .join('|');
}

/** Synchronize active storefront cart cleanly into MongoDB for abandonment tracking. */
export async function syncCartSession(
  db: MongoDatabase,
  params: {
    user?: {
      id: string;
      role: string;
      name: string;
      email: string;
      phone?: string;
      shippingAddress?: { city?: string } | null;
      profitMargin?: number;
    } | null;
    visitorToken?: string;
    clearReason?: 'user_cleared' | 'item_expired';
    items: Array<{ productId: string; variantId?: string | null; quantity: number }>;
    isTest?: boolean;
  }
) {
  if (params.user?.role === 'admin') {
    return { synced: false, skipped: 'admin_session' };
  }

  const isCustomer = Boolean(params.user && params.user.role === 'customer');
  const visitorToken = typeof params.visitorToken === 'string' ? params.visitorToken.trim().slice(0, 64) : '';
  if (!isCustomer && visitorToken.length < 12) {
    return { synced: false, skipped: 'missing_identity' };
  }

  const openCartKey = isCustomer ? `cust:${params.user!.id}` : `guest:${visitorToken}`;
  const now = new Date().toISOString();

  // Handle cart empty cleanly without removing past recovered/expired carts
  if (!Array.isArray(params.items) || params.items.length === 0) {
    if (params.clearReason === 'item_expired') {
      await db.models.CartSession.updateMany(
        { openCartKey: { $in: [openCartKey, ...(isCustomer && visitorToken.length >= 12 ? [`guest:${visitorToken}`] : [])] }, status: 'active' },
        { $set: { status: 'abandoned', abandonedAt: now, updatedAt: now } }
      );
      return { synced: true, expiredFromStorefront: true, cart: null };
    }
    await db.models.CartSession.deleteOne({ openCartKey, status: 'active' });
    if (isCustomer && visitorToken.length >= 12) {
      await db.models.CartSession.deleteOne({ openCartKey: `guest:${visitorToken}`, status: 'active' });
    }
    return { synced: true, cleared: true, cart: null };
  }

  const appliedMargin = isCustomer
    ? (params.user!.profitMargin ??
        (params.user!.shippingAddress?.city && !isSuratCity(params.user!.shippingAddress.city)
          ? OTHER_CITY_MARGIN_PERCENT
          : SURAT_MARGIN_PERCENT))
    : GUEST_MARGIN_PERCENT;

  const productIds = Array.from(new Set(params.items.map(i => i.productId)));
  const [products, variants] = await Promise.all([
    db.models.Product.find({ id: { $in: productIds } }, { _id: 0 }).lean(),
    db.models.ProductVariant.find({ productId: { $in: productIds }, active: true }, { _id: 0 }).lean(),
  ]);
  const prodMap = new Map(products.map(p => [String(p.id), p]));

  const resolvedItems: SyncedCartLine[] = [];
  for (const rawItem of params.items) {
    const prod = prodMap.get(String(rawItem.productId));
    const qty = Number(rawItem.quantity || 0);
    if (!prod || !Number.isFinite(qty) || qty <= 0) continue;

    const prodBaseCost = getProductBaseCost(prod as any);
    const prodWeight =
      parseWeightGrams(String(prod.weightLabel || (prod.unit === 'gram' ? '1g' : '1kg'))) ||
      (prod.unit === 'gram' ? 1 : 1000);
    let unitPrice = calculateDynamicSellingPrice(prodBaseCost, appliedMargin, prodWeight);
    let resolvedVariantId: string | null = null;
    let resolvedWeightLabel: string | null = prod.weightLabel ? String(prod.weightLabel) : null;

    const matchedVar = rawItem.variantId
      ? variants.find(v => v.id === rawItem.variantId && v.productId === prod.id)
      : null;

    if (matchedVar) {
      resolvedVariantId = String(matchedVar.id);
      resolvedWeightLabel = String(matchedVar.weightLabel);
      const varWeight = parseWeightGrams(resolvedWeightLabel) || 1000;
      let varBaseCost = getVariantBaseCost(matchedVar as any);
      if ((!varBaseCost || varBaseCost <= 0) && prodBaseCost > 0) {
        varBaseCost = Number(((prodBaseCost / prodWeight) * varWeight).toFixed(2));
      }
      unitPrice = calculateDynamicSellingPrice(varBaseCost, appliedMargin, varWeight);
      if (
        matchedVar.discountPrice &&
        Number(matchedVar.discountPrice) > 0 &&
        Number(matchedVar.discountPrice) < Number(matchedVar.sellingPrice)
      ) {
        const discBase = Math.round(Number(matchedVar.discountPrice) / 1.4);
        unitPrice = calculateDynamicSellingPrice(discBase, appliedMargin, varWeight);
      }
    } else if (prod.discountPrice && Number(prod.discountPrice) > 0 && Number(prod.discountPrice) < Number(prod.price)) {
      const discBase = Math.round(Number(prod.discountPrice) / 1.4);
      const stockRatio = resolvedWeightLabel
        ? getVariantStockUnits(resolvedWeightLabel, prod.unit as any)
        : 1;
      unitPrice = calculateDynamicSellingPrice(Number((discBase * stockRatio).toFixed(2)), appliedMargin, prodWeight);
    }

    const cleanQty = Math.max(0.25, Math.min(999, Number(qty)));
    resolvedItems.push({
      productId: String(prod.id),
      variantId: resolvedVariantId,
      productName: String(prod.name),
      unit: String(prod.unit || 'kg'),
      weightLabel: resolvedWeightLabel,
      unitPrice: Math.round(unitPrice),
      quantity: cleanQty,
      subtotal: Math.round(unitPrice * cleanQty),
    });
  }

  if (resolvedItems.length === 0) {
    return { synced: false, skipped: 'no_valid_items' };
  }

  const cartTotal = resolvedItems.reduce((sum, it) => sum + it.subtotal, 0);

  // Merge any active guest cart for this visitor when the customer authenticates
  if (isCustomer && visitorToken.length >= 12) {
    const guestKey = `guest:${visitorToken}`;
    const existingCust = await db.models.CartSession.findOne({ openCartKey }).lean();
    if (!existingCust) {
      const guestRow = await db.models.CartSession.findOne({ openCartKey: guestKey }).lean();
      if (guestRow) {
        await db.models.CartSession.updateOne(
          { id: guestRow.id },
          {
            $set: {
              openCartKey,
              customerId: params.user!.id,
              customerName: params.user!.name,
              customerEmail: params.user!.email,
              customerPhone: params.user!.phone || '',
              items: resolvedItems,
              cartTotal,
              status: 'active',
              abandonedAt: null,
              lastActivityAt: now,
              updatedAt: now,
            },
          }
        );
        const updatedGuest = await db.models.CartSession.findOne({ id: guestRow.id }, { _id: 0 }).lean();
        return { synced: true, mergedGuest: true, cart: updatedGuest };
      }
    } else {
      await db.models.CartSession.deleteOne({ openCartKey: guestKey });
    }
  }

  const existingOpen = await db.models.CartSession.findOne({ openCartKey }).lean();
  const nextSig = itemsSignature(resolvedItems);
  const prevSig = existingOpen ? itemsSignature(existingOpen.items as any[]) : '';

  if (existingOpen && prevSig === nextSig && existingOpen.customerId === (params.user?.id || null)) {
    return { synced: true, unchanged: true, cart: existingOpen };
  }

  const doc = await db.models.CartSession.findOneAndUpdate(
    { openCartKey },
    {
      $setOnInsert: {
        id: `cart_${crypto.randomUUID()}`,
        createdAt: now,
        followUpCount: 0,
        followUps: [],
        lastFollowUpAt: null,
        recoveredAt: null,
        recoveredOrderId: null,
        recoveredOrderNumber: null,
        recoveredAmount: 0,
        expiredAt: null,
      },
      $set: {
        openCartKey,
        customerId: isCustomer ? params.user!.id : null,
        visitorToken: visitorToken || null,
        customerName: isCustomer ? params.user!.name : 'Guest Visitor',
        customerEmail: isCustomer ? params.user!.email : '',
        customerPhone: isCustomer ? params.user!.phone || '' : '',
        items: resolvedItems,
        cartTotal,
        status: 'active',
        abandonedAt: null,
        lastActivityAt: now,
        updatedAt: now,
        isTest: Boolean(params.isTest),
      },
    },
    { upsert: true, returnDocument: 'after', projection: { _id: 0 } }
  ).lean();

  return { synced: true, cart: doc };
}

/**
 * Automatically recovers matching open cart upon successful order completion.
 * Strictly idempotent via unique recoveredOrderId index and atomic filter.
 */
export async function markCartRecoveredForOrder(
  db: MongoDatabase,
  order: {
    id: string;
    orderNumber: string;
    customerId: string;
    totalAmount: number;
    status?: string;
    isTest?: boolean;
  }
): Promise<{ recovered: boolean; reason?: string; cartId?: string }> {
  if (!order?.id || !order?.customerId) {
    return { recovered: false, reason: 'missing_order_or_customer' };
  }
  if (order.isTest || order.status === 'cancelled' || order.status === 'returned') {
    return { recovered: false, reason: 'excluded_order_status' };
  }

  const alreadyRecovered = await db.models.CartSession.findOne({ recoveredOrderId: order.id }).lean();
  if (alreadyRecovered) {
    return { recovered: false, reason: 'duplicate_recovery_prevented', cartId: alreadyRecovered.id };
  }

  const candidate = await db.models.CartSession.findOne({
    customerId: order.customerId,
    status: { $in: ['active', 'abandoned'] },
    recoveredOrderId: null,
    isTest: { $ne: true },
  })
    .sort({ updatedAt: -1 })
    .lean();

  if (!candidate) {
    return { recovered: false, reason: 'no_open_cart_found' };
  }

  const now = new Date().toISOString();
  try {
    const updated = await db.models.CartSession.findOneAndUpdate(
      {
        id: candidate.id,
        status: { $in: ['active', 'abandoned'] },
        recoveredOrderId: null,
      },
      {
        $set: {
          status: 'recovered',
          openCartKey: null,
          recoveredAt: now,
          recoveredOrderId: order.id,
          recoveredOrderNumber: order.orderNumber,
          recoveredAmount: Number(order.totalAmount || candidate.cartTotal || 0),
          updatedAt: now,
        },
      },
      { returnDocument: 'after' }
    ).lean();

    if (!updated) {
      return { recovered: false, reason: 'concurrent_recovery_conflict' };
    }
    return { recovered: true, cartId: updated.id };
  } catch (err: any) {
    if (err?.code === 11000 || String(err?.message || '').includes('E11000')) {
      return { recovered: false, reason: 'duplicate_recovery_prevented' };
    }
    throw err;
  }
}

/** Transitions inactive active/abandoned carts cleanly according to configured thresholds. */
export async function reconcileCartStatuses(db: MongoDatabase, cfg?: CrmSegmentationConfig): Promise<void> {
  const config = cfg || (await getCrmConfig(db));
  const nowMs = Date.now();
  const abandonCutoffIso = new Date(nowMs - config.abandonmentThresholdMinutes * 60_000).toISOString();
  const expireCutoffIso = new Date(nowMs - config.cartExpiryHours * 3600_000).toISOString();
  const nowIso = new Date(nowMs).toISOString();

  await db.models.CartSession.updateMany(
    {
      status: { $in: ['active', 'abandoned'] },
      lastActivityAt: { $lte: expireCutoffIso },
    },
    {
      $set: {
        status: 'expired',
        openCartKey: null,
        expiredAt: nowIso,
        updatedAt: nowIso,
      },
    }
  );

  const staleActive = await db.models.CartSession.find(
    {
      status: 'active',
      lastActivityAt: { $lte: abandonCutoffIso, $gt: expireCutoffIso },
    },
    { id: 1, lastActivityAt: 1, _id: 0 }
  ).lean();

  for (const row of staleActive) {
    const abandonedAt = new Date(
      Math.min(
        nowMs,
        new Date(row.lastActivityAt).getTime() + config.abandonmentThresholdMinutes * 60_000
      )
    ).toISOString();
    await db.models.CartSession.updateOne(
      { id: row.id, status: 'active' },
      { $set: { status: 'abandoned', abandonedAt, updatedAt: nowIso } }
    );
  }
}

function evaluateCartFollowUpEligibility(
  cart: any,
  customer: any | undefined,
  cfg: CrmSegmentationConfig
): CartFollowUpEligibility {
  if (cart.status === 'recovered') {
    return { eligible: false, reasonCode: 'recovered', reasonLabel: 'Already recovered' };
  }
  if (cart.status === 'expired') {
    return { eligible: false, reasonCode: 'expired', reasonLabel: 'Cart expired' };
  }
  const phone = normalizeWhatsAppPhone(customer?.phone || cart.customerPhone);
  if (!phone) {
    return { eligible: false, reasonCode: 'missing_phone', reasonLabel: 'No WhatsApp phone on file' };
  }
  if (!isCustomerWhatsAppEligible(customer)) {
    return {
      eligible: false,
      reasonCode: 'opted_out',
      reasonLabel: customer?.unsubscribedAt
        ? 'Unsubscribed / opted out'
        : 'No promotional messaging consent',
    };
  }
  const followUpCount = Number(cart.followUpCount || 0);
  if (followUpCount >= 3) {
    return {
      eligible: false,
      reasonCode: 'max_reached',
      reasonLabel: 'Max 3 follow-ups reached',
    };
  }
  if (cart.lastFollowUpAt) {
    const cooldownEnd = new Date(cart.lastFollowUpAt).getTime() + cfg.followUpCooldownHours * 3600_000;
    const remainingMs = cooldownEnd - Date.now();
    if (remainingMs > 0) {
      return {
        eligible: false,
        reasonCode: 'cooldown_active',
        reasonLabel: `Cooldown active (${Math.ceil(remainingMs / 60_000)}m remaining)`,
        cooldownRemainingMinutes: Math.ceil(remainingMs / 60_000),
      };
    }
  }
  return { eligible: true, reasonCode: 'eligible', reasonLabel: 'Ready for WhatsApp follow-up' };
}

export async function getAbandonedCartAnalyticsAndList(
  db: MongoDatabase,
  query: { status?: string; search?: string; page?: number; limit?: number }
) {
  const cfg = await getCrmConfig(db);
  await reconcileCartStatuses(db, cfg);

  const [allCarts, customers, orders] = await Promise.all([
    db.models.CartSession.find({ isTest: { $ne: true } }, { _id: 0 })
      .sort({ lastActivityAt: -1 })
      .lean(),
    db.models.Customer.find(
      { role: 'customer' },
      { id: 1, name: 1, email: 1, phone: 1, marketingConsent: 1, unsubscribedAt: 1, emailPreferences: 1, _id: 0 }
    ).lean(),
    db.models.Order.find(
      {},
      { id: 1, orderNumber: 1, status: 1, totalAmount: 1, createdAt: 1, _id: 0 }
    ).lean(),
  ]);

  const customerMap = new Map(customers.map(c => [String(c.id), c]));
  const orderMap = new Map(orders.map(o => [String(o.id), o]));

  // Exclude cancelled/returned/test recovered orders and deduplicate duplicate recoveredOrderIds
  const seenRecoveredOrderIds = new Set<string>();
  const validCarts: any[] = [];

  for (const cart of allCarts) {
    if (String(cart.customerEmail || '').toLowerCase().includes('@test.') && cart.isTest) continue;

    if (cart.status === 'recovered') {
      const ordId = cart.recoveredOrderId ? String(cart.recoveredOrderId) : '';
      const ord = ordId ? orderMap.get(ordId) : null;
      if (!ordId || !ord || ord.status === 'cancelled' || ord.status === 'returned') {
        continue;
      }
      if (seenRecoveredOrderIds.has(ordId)) {
        continue;
      }
      seenRecoveredOrderIds.add(ordId);
      validCarts.push({
        ...cart,
        recoveredAmount: Number(ord.totalAmount || cart.recoveredAmount || 0),
        recoveredOrderNumber: ord.orderNumber || cart.recoveredOrderNumber,
      });
    } else {
      validCarts.push(cart);
    }
  }

  let abandonedCount = 0;
  let potentialLostRevenue = 0;
  let recoveredCount = 0;
  let recoveredCartRevenue = 0;
  let expiredCount = 0;
  let activeCount = 0;
  let totalDurationMinutes = 0;
  let durationSampleCount = 0;
  const nowMs = Date.now();

  for (const c of validCarts) {
    if (c.status === 'abandoned') {
      abandonedCount += 1;
      potentialLostRevenue += Number(c.cartTotal || 0);
      const startIso = c.abandonedAt || c.lastActivityAt;
      const diffMins = Math.max(0, Math.round((nowMs - new Date(startIso).getTime()) / 60_000));
      totalDurationMinutes += diffMins;
      durationSampleCount += 1;
    } else if (c.status === 'recovered') {
      recoveredCount += 1;
      recoveredCartRevenue += Number(c.recoveredAmount || 0);
      if (c.abandonedAt && c.recoveredAt) {
        const diffMins = Math.max(
          0,
          Math.round((new Date(c.recoveredAt).getTime() - new Date(c.abandonedAt).getTime()) / 60_000)
        );
        totalDurationMinutes += diffMins;
        durationSampleCount += 1;
      }
    } else if (c.status === 'expired') {
      expiredCount += 1;
    } else if (c.status === 'active') {
      activeCount += 1;
    }
  }

  const totalEverAbandoned = abandonedCount + recoveredCount + expiredCount;
  const cartRecoveryRate =
    totalEverAbandoned > 0 ? Number(((recoveredCount / totalEverAbandoned) * 100).toFixed(1)) : 0;
  const avgAbandonmentDurationMinutes =
    durationSampleCount > 0 ? Math.round(totalDurationMinutes / durationSampleCount) : 0;

  // 7-day trend ending today
  const sevenDayTrend: Array<{
    date: string;
    label: string;
    abandonedCount: number;
    recoveredCount: number;
    potentialLostRevenue: number;
    recoveredRevenue: number;
  }> = [];

  for (let offset = 6; offset >= 0; offset -= 1) {
    const d = new Date(nowMs - offset * 86400_000);
    const key = d.toISOString().slice(0, 10);
    const label = d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
    let dayAb = 0;
    let dayRec = 0;
    let dayLost = 0;
    let dayRecRev = 0;

    for (const c of validCarts) {
      const abDay = c.abandonedAt ? String(c.abandonedAt).slice(0, 10) : null;
      const recDay = c.recoveredAt ? String(c.recoveredAt).slice(0, 10) : null;
      if (abDay === key && (c.status === 'abandoned' || c.status === 'expired')) {
        dayAb += 1;
        dayLost += Number(c.cartTotal || 0);
      }
      if (recDay === key && c.status === 'recovered') {
        dayRec += 1;
        dayRecRev += Number(c.recoveredAmount || 0);
      }
    }

    sevenDayTrend.push({
      date: key,
      label,
      abandonedCount: dayAb,
      recoveredCount: dayRec,
      potentialLostRevenue: dayLost,
      recoveredRevenue: dayRecRev,
    });
  }

  const statusFilter = (query.status || 'all').toLowerCase();
  const searchTerm = (query.search || '').trim().toLowerCase();

  const enrichedRows = validCarts
    .map(c => {
      const cust = c.customerId ? customerMap.get(String(c.customerId)) : undefined;
      const resolvedPhone = cust?.phone || c.customerPhone || '';
      const resolvedName = cust?.name || c.customerName || 'Guest Visitor';
      const resolvedEmail = cust?.email || c.customerEmail || '';
      const eligibility = evaluateCartFollowUpEligibility(c, cust, cfg);
      return {
        ...c,
        customerName: resolvedName,
        customerPhone: resolvedPhone,
        customerEmail: resolvedEmail,
        marketingConsent: isCustomerWhatsAppEligible(cust),
        followUpEligibility: eligibility,
      };
    })
    .filter(c => {
      if (statusFilter !== 'all' && c.status !== statusFilter) return false;
      if (searchTerm) {
        const itemsText = Array.isArray(c.items)
          ? c.items.map((it: any) => it.productName || '').join(' ')
          : '';
        const hay = `${c.customerName} ${c.customerPhone} ${c.customerEmail} ${itemsText}`.toLowerCase();
        if (!hay.includes(searchTerm)) return false;
      }
      return true;
    });

  const page = Math.max(1, Number(query.page || 1));
  const limit = Math.max(1, Math.min(100, Number(query.limit || 20)));
  const total = enrichedRows.length;
  const paginated = enrichedRows.slice((page - 1) * limit, page * limit);

  return {
    summary: {
      totalAbandonedCarts: abandonedCount,
      totalEverAbandoned,
      activeCartsCount: activeCount,
      expiredCartsCount: expiredCount,
      potentialLostRevenue,
      recoveredCartsCount: recoveredCount,
      recoveredCartRevenue,
      cartRecoveryRate,
      avgAbandonmentDurationMinutes,
    },
    sevenDayTrend,
    config: cfg,
    carts: paginated,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    },
  };
}

export async function initiateCartWhatsAppFollowUp(
  db: MongoDatabase,
  params: {
    cartId: string;
    customMessage?: string;
    admin: { id: string; name: string; email: string };
  }
) {
  const cfg = await getCrmConfig(db);
  await reconcileCartStatuses(db, cfg);

  const cart = await db.models.CartSession.findOne({ id: params.cartId, isTest: { $ne: true } }).lean();
  if (!cart) {
    return { status: 404 as const, error: 'Cart record not found.' };
  }

  const cust = cart.customerId
    ? await db.models.Customer.findOne({ id: cart.customerId }, { _id: 0 }).lean()
    : null;

  const eligibility = evaluateCartFollowUpEligibility(cart, cust, cfg);
  if (!eligibility.eligible) {
    const httpCode =
      eligibility.reasonCode === 'opted_out'
        ? 403
        : eligibility.reasonCode === 'missing_phone'
        ? 400
        : 409;
    return { status: httpCode as 400 | 403 | 409, error: eligibility.reasonLabel, eligibility };
  }

  const phone = normalizeWhatsAppPhone(cust?.phone || cart.customerPhone)!;
  const itemsList = Array.isArray(cart.items)
    ? cart.items
        .map((it: any) => `${it.productName} (${it.quantity}${it.weightLabel ? ` × ${it.weightLabel}` : ` ${it.unit}`})`)
        .join(', ')
    : 'your selected items';
  const customerName = cust?.name || cart.customerName || 'Patron';

  const defaultMessage = [
    `Namaste ${customerName},`,
    `Your royal dry fruits selection (${itemsList}) worth ₹${Number(cart.cartTotal || 0).toLocaleString('en-IN')} is still reserved at ${BRAND_CONFIG.name}.`,
    `Reply to complete your order or reach our concierge team anytime.`,
  ].join('\n\n');

  const message = (params.customMessage || '').trim() || defaultMessage;
  const now = new Date().toISOString();
  const entry: FollowUpEntry = {
    id: `cfup_${crypto.randomUUID()}`,
    channel: 'whatsapp',
    message,
    sentByAdminId: params.admin.id,
    sentByAdminName: params.admin.name,
    sentAt: now,
    status: 'initiated',
  };

  // Atomic cooldown + followUpCount guard prevents concurrent duplicate follow-up writes
  const cooldownCutoffIso = new Date(Date.now() - cfg.followUpCooldownHours * 3600_000).toISOString();
  const updated = await db.models.CartSession.findOneAndUpdate(
    {
      id: cart.id,
      status: { $in: ['active', 'abandoned'] },
      followUpCount: { $lt: 3 },
      $or: [{ lastFollowUpAt: null }, { lastFollowUpAt: { $lte: cooldownCutoffIso } }],
    },
    {
      $push: { followUps: entry },
      $inc: { followUpCount: 1 },
      $set: { lastFollowUpAt: now, updatedAt: now },
    },
    { returnDocument: 'after', projection: { _id: 0 } }
  ).lean();

  if (!updated) {
    return {
      status: 409 as const,
      error: 'A follow-up was already initiated recently or the cart is no longer eligible.',
    };
  }

  await logAudit(db, {
    actorId: params.admin.id,
    actorEmail: params.admin.email,
    action: 'cart_whatsapp_followup_initiated',
    entityType: 'cart_session',
    entityId: cart.id,
    details: { customerId: cart.customerId, phone, followUpId: entry.id },
  });

  const whatsappUrl = `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
  return {
    status: 200 as const,
    whatsappUrl,
    followUp: entry,
    cart: {
      ...updated,
      followUpEligibility: evaluateCartFollowUpEligibility(updated, cust, cfg),
    },
  };
}
