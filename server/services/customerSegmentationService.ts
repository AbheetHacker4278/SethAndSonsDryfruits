import crypto from 'node:crypto';
import { MongoDatabase } from '../db/mongo.ts';
import { logAudit } from '../middleware/security.ts';
import { getCrmConfig, type CrmSegmentationConfig } from './crmConfigService.ts';
import { generateCsvString } from './exportService.ts';
import { isCustomerWhatsAppEligible } from './cartRecoveryService.ts';

export type CustomerSegmentKey = 'vip' | 'high_value' | 'returning' | 'new' | 'inactive' | 'prospect';

export interface CustomerProductPurchaseStat {
  productId: string;
  productName: string;
  quantity: number;
  spent: number;
  orderCount: number;
}

export interface SegmentedCustomerSummary {
  id: string;
  name: string;
  email: string;
  phone: string;
  tier: string;
  loyaltyPoints: number;
  createdAt: string;
  emailVerified: boolean;
  isActive: boolean;
  isOneTime: boolean;
  marketingConsent: boolean;
  whatsappEligible: boolean;
  optOutReason: string | null;
  lifetimeSpending: number;
  successfulOrdersCount: number;
  averageOrderValue: number;
  lastPurchaseDate: string | null;
  daysSinceLastPurchase: number | null;
  segment: CustomerSegmentKey;
  segmentLabel: string;
  secondaryTags: string[];
  mostPurchasedProducts: CustomerProductPurchaseStat[];
}

const SEGMENT_META: Record<CustomerSegmentKey, { label: string; priority: number; description: string }> = {
  inactive: {
    label: 'Inactive Customers',
    priority: 1,
    description: 'No successful purchase within the configured inactivity window (dormant / churn risk).',
  },
  vip: {
    label: 'VIP Customers',
    priority: 2,
    description: 'Active customers meeting or exceeding the configurable VIP lifetime spend threshold.',
  },
  high_value: {
    label: 'High-Value Customers',
    priority: 3,
    description: 'Active customers meeting the High-Value spend threshold below VIP.',
  },
  returning: {
    label: 'Returning Customers',
    priority: 4,
    description: 'Active customers with 2 or more successful orders below High-Value spend.',
  },
  new: {
    label: 'New Customers',
    priority: 5,
    description: 'Active customers with exactly 1 successful order.',
  },
  prospect: {
    label: 'Registered Prospects',
    priority: 6,
    description: 'Recently registered accounts with 0 successful orders yet.',
  },
};

function normalizeWhatsAppDigits(phone?: string | null): string | null {
  const digits = String(phone || '').replace(/\D/g, '');
  if (digits.length < 10) return null;
  if (digits.length === 10) return `91${digits}`;
  if (digits.length === 11 && digits.startsWith('0')) return `91${digits.slice(1)}`;
  return digits;
}

function isSuccessfulOrder(order: any): boolean {
  if (!order) return false;
  if (order.isTest) return false;
  if (order.status === 'cancelled' || order.status === 'returned') return false;
  if (order.paymentStatus === 'failed') return false;
  return true;
}

/**
 * Assigns exactly ONE mutually-exclusive primary segment per customer so summary reporting never double-counts.
 * Priority: Inactive (> N days without successful purchase) > VIP > High-Value > Returning (2+) > New (1) > Prospect (0).
 */
export function classifyCustomerSegment(
  metrics: {
    lifetimeSpending: number;
    successfulOrdersCount: number;
    lastPurchaseDate: string | null;
    createdAt: string;
  },
  cfg: CrmSegmentationConfig,
  nowMs = Date.now()
): {
  segment: CustomerSegmentKey;
  daysSinceLastPurchase: number | null;
  secondaryTags: string[];
} {
  const lastPurchaseMs = metrics.lastPurchaseDate ? new Date(metrics.lastPurchaseDate).getTime() : null;
  const daysSinceLastPurchase =
    lastPurchaseMs !== null && !Number.isNaN(lastPurchaseMs)
      ? Math.max(0, Math.floor((nowMs - lastPurchaseMs) / 86400_000))
      : null;

  const signupMs = new Date(metrics.createdAt).getTime();
  const daysSinceSignup = !Number.isNaN(signupMs)
    ? Math.max(0, Math.floor((nowMs - signupMs) / 86400_000))
    : 0;

  const isDormantByOrder = daysSinceLastPurchase !== null && daysSinceLastPurchase > cfg.inactiveDaysThreshold;
  const isDormantZeroOrder = metrics.successfulOrdersCount === 0 && daysSinceSignup > cfg.inactiveDaysThreshold;

  const secondaryTags: string[] = [];
  if (metrics.lifetimeSpending >= cfg.vipSpendThreshold) secondaryTags.push('VIP Spend');
  else if (metrics.lifetimeSpending >= cfg.highValueSpendThreshold) secondaryTags.push('High-Value Spend');
  if (metrics.successfulOrdersCount >= 2) secondaryTags.push('Repeat Buyer');
  else if (metrics.successfulOrdersCount === 1) secondaryTags.push('First-Time Buyer');
  if (isDormantByOrder || isDormantZeroOrder) secondaryTags.push('Needs Win-Back');

  let segment: CustomerSegmentKey;
  if (isDormantByOrder || isDormantZeroOrder) {
    segment = 'inactive';
  } else if (metrics.lifetimeSpending >= cfg.vipSpendThreshold) {
    segment = 'vip';
  } else if (metrics.lifetimeSpending >= cfg.highValueSpendThreshold) {
    segment = 'high_value';
  } else if (metrics.successfulOrdersCount >= 2) {
    segment = 'returning';
  } else if (metrics.successfulOrdersCount === 1) {
    segment = 'new';
  } else {
    segment = 'prospect';
  }

  return { segment, daysSinceLastPurchase, secondaryTags };
}

async function computeAllSegmentedCustomers(
  db: MongoDatabase,
  cfg?: CrmSegmentationConfig
): Promise<{
  config: CrmSegmentationConfig;
  customers: SegmentedCustomerSummary[];
  ordersByCustomer: Map<string, any[]>;
  itemsByOrder: Map<string, any[]>;
}> {
  const config = cfg || (await getCrmConfig(db));
  const [rawCustomers, rawOrders, rawOrderItems] = await Promise.all([
    db.models.Customer.find({ role: 'customer' }, { passwordHash: 0, _id: 0 }).sort({ createdAt: -1 }).lean(),
    db.models.Order.find({}, { _id: 0 }).sort({ createdAt: -1 }).lean(),
    db.models.OrderItem.find({}, { _id: 0 }).lean(),
  ]);

  const itemsByOrder = new Map<string, any[]>();
  for (const it of rawOrderItems) {
    const oid = String(it.orderId);
    const list = itemsByOrder.get(oid) || [];
    list.push(it);
    itemsByOrder.set(oid, list);
  }

  const ordersByCustomer = new Map<string, any[]>();
  for (const ord of rawOrders) {
    const cid = String(ord.customerId);
    const list = ordersByCustomer.get(cid) || [];
    list.push(ord);
    ordersByCustomer.set(cid, list);
  }

  const nowMs = Date.now();
  const customers: SegmentedCustomerSummary[] = [];

  for (const c of rawCustomers) {
    const cid = String(c.id);
    const custOrders = ordersByCustomer.get(cid) || [];
    const successfulOrders = custOrders.filter(isSuccessfulOrder);

    let lifetimeSpending = 0;
    let lastPurchaseDate: string | null = null;
    const productAgg = new Map<string, CustomerProductPurchaseStat>();

    for (const o of successfulOrders) {
      lifetimeSpending += Number(o.totalAmount || 0);
      const dt = String(o.createdAt || '');
      if (!lastPurchaseDate || dt > lastPurchaseDate) {
        lastPurchaseDate = dt;
      }
      const oItems = itemsByOrder.get(String(o.id)) || [];
      for (const it of oItems) {
        const pid = String(it.productId);
        const prev = productAgg.get(pid) || {
          productId: pid,
          productName: String(it.productName || pid),
          quantity: 0,
          spent: 0,
          orderCount: 0,
        };
        prev.quantity += Number(it.quantity || 0);
        prev.spent += Number(it.subtotal || 0);
        prev.orderCount += 1;
        productAgg.set(pid, prev);
      }
    }

    const successfulOrdersCount = successfulOrders.length;
    const averageOrderValue =
      successfulOrdersCount > 0 ? Math.round(lifetimeSpending / successfulOrdersCount) : 0;

    const { segment, daysSinceLastPurchase, secondaryTags } = classifyCustomerSegment(
      {
        lifetimeSpending,
        successfulOrdersCount,
        lastPurchaseDate,
        createdAt: String(c.createdAt),
      },
      config,
      nowMs
    );

    const consentOk = isCustomerWhatsAppEligible(c as any);
    const phoneDigits = normalizeWhatsAppDigits(c.phone);
    const optOutReason = !consentOk
      ? c.unsubscribedAt
        ? 'Unsubscribed'
        : 'No marketing consent'
      : !phoneDigits
      ? 'No phone number'
      : null;

    const mostPurchasedProducts = Array.from(productAgg.values())
      .sort((a, b) => b.quantity - a.quantity || b.spent - a.spent)
      .slice(0, 5);

    customers.push({
      id: cid,
      name: String(c.name || ''),
      email: String(c.email || ''),
      phone: String(c.phone || ''),
      tier: String(c.tier || 'Privileged Patron'),
      loyaltyPoints: Number(c.loyaltyPoints || 0),
      createdAt: String(c.createdAt || ''),
      emailVerified: Boolean(c.emailVerified),
      isActive: c.isActive === undefined ? true : Boolean(c.isActive),
      isOneTime: Boolean(c.isOneTime),
      marketingConsent: Boolean(c.marketingConsent),
      whatsappEligible: Boolean(consentOk && phoneDigits),
      optOutReason,
      lifetimeSpending: Math.round(lifetimeSpending),
      successfulOrdersCount,
      averageOrderValue,
      lastPurchaseDate,
      daysSinceLastPurchase,
      segment,
      segmentLabel: SEGMENT_META[segment].label,
      secondaryTags,
      mostPurchasedProducts,
    });
  }

  return { config, customers, ordersByCustomer, itemsByOrder };
}

export async function getCustomerSegmentationOverview(
  db: MongoDatabase,
  query: { segment?: string; search?: string; consentOnly?: boolean; page?: number; limit?: number }
) {
  const { config, customers } = await computeAllSegmentedCustomers(db);

  const segOrder: CustomerSegmentKey[] = ['vip', 'high_value', 'returning', 'new', 'inactive', 'prospect'];
  const bucketMap = new Map<
    CustomerSegmentKey,
    {
      key: CustomerSegmentKey;
      label: string;
      priority: number;
      description: string;
      customerCount: number;
      revenue: number;
      totalOrders: number;
      whatsappEligibleCount: number;
    }
  >();

  for (const key of segOrder) {
    bucketMap.set(key, {
      key,
      label: SEGMENT_META[key].label,
      priority: SEGMENT_META[key].priority,
      description: SEGMENT_META[key].description,
      customerCount: 0,
      revenue: 0,
      totalOrders: 0,
      whatsappEligibleCount: 0,
    });
  }

  let totalRevenue = 0;
  for (const c of customers) {
    totalRevenue += c.lifetimeSpending;
    const bucket = bucketMap.get(c.segment)!;
    bucket.customerCount += 1;
    bucket.revenue += c.lifetimeSpending;
    bucket.totalOrders += c.successfulOrdersCount;
    if (c.whatsappEligible) bucket.whatsappEligibleCount += 1;
  }

  const revenueBySegment = segOrder.map(k => {
    const b = bucketMap.get(k)!;
    return {
      ...b,
      revenueSharePercent: totalRevenue > 0 ? Number(((b.revenue / totalRevenue) * 100).toFixed(1)) : 0,
      avgCustomerSpend: b.customerCount > 0 ? Math.round(b.revenue / b.customerCount) : 0,
      avgOrderValue: b.totalOrders > 0 ? Math.round(b.revenue / b.totalOrders) : 0,
    };
  });

  const segmentFilter = (query.segment || 'all').toLowerCase();
  const searchTerm = (query.search || '').trim().toLowerCase();
  const filtered = customers.filter(c => {
    if (segmentFilter !== 'all' && c.segment !== segmentFilter) return false;
    if (query.consentOnly && !c.whatsappEligible) return false;
    if (searchTerm) {
      const hay = `${c.name} ${c.email} ${c.phone} ${c.segmentLabel}`.toLowerCase();
      if (!hay.includes(searchTerm)) return false;
    }
    return true;
  });

  const segmentSummary = {
    selectedSegment: segmentFilter,
    customerCount: filtered.length,
    revenue: filtered.reduce((s, c) => s + c.lifetimeSpending, 0),
    totalOrders: filtered.reduce((s, c) => s + c.successfulOrdersCount, 0),
    whatsappEligibleCount: filtered.filter(c => c.whatsappEligible).length,
    avgCustomerSpend:
      filtered.length > 0
        ? Math.round(filtered.reduce((s, c) => s + c.lifetimeSpending, 0) / filtered.length)
        : 0,
  };

  const page = Math.max(1, Number(query.page || 1));
  const limit = Math.max(1, Math.min(100, Number(query.limit || 20)));
  const total = filtered.length;
  const paginated = filtered.slice((page - 1) * limit, page * limit);

  const recentCampaigns = await db.models.SegmentCampaignLog.find({}, { _id: 0 })
    .sort({ createdAt: -1 })
    .limit(10)
    .lean();

  return {
    summary: {
      totalCustomers: customers.length,
      totalRevenue,
      newCustomersCount: bucketMap.get('new')!.customerCount,
      returningCustomersCount: bucketMap.get('returning')!.customerCount,
      vipCustomersCount: bucketMap.get('vip')!.customerCount,
      highValueCustomersCount: bucketMap.get('high_value')!.customerCount,
      inactiveCustomersCount: bucketMap.get('inactive')!.customerCount,
      prospectsCount: bucketMap.get('prospect')!.customerCount,
    },
    revenueBySegment,
    selectedSegmentAnalytics: segmentSummary,
    config,
    customers: paginated,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    },
    recentCampaigns,
  };
}

export async function getCustomerSegmentationProfile(db: MongoDatabase, customerId: string) {
  const { config, customers, ordersByCustomer, itemsByOrder } = await computeAllSegmentedCustomers(db);
  const cust = customers.find(c => c.id === customerId);
  if (!cust) return null;

  const rawOrders = ordersByCustomer.get(customerId) || [];
  const purchaseHistory = rawOrders.map(o => ({
    id: o.id,
    orderNumber: o.orderNumber,
    status: o.status,
    paymentStatus: o.paymentStatus,
    totalAmount: Number(o.totalAmount || 0),
    subtotal: Number(o.subtotal || 0),
    discountAmount: Number(o.discountAmount || 0),
    couponCode: o.couponCode || null,
    createdAt: o.createdAt,
    items: (itemsByOrder.get(String(o.id)) || []).map(it => ({
      productId: it.productId,
      productName: it.productName,
      quantity: it.quantity,
      weightLabel: it.weightLabel || null,
      unit: it.unit,
      subtotal: it.subtotal,
    })),
  }));

  const targetedCoupons = await db.models.Coupon.find(
    { targetCustomerId: customerId, active: true },
    { _id: 0 }
  )
    .sort({ createdAt: -1 })
    .limit(10)
    .lean();

  return {
    customer: cust,
    config,
    purchaseHistory,
    targetedCoupons,
  };
}

export async function exportSegmentedCustomersCsv(
  db: MongoDatabase,
  query: { segment?: string; search?: string }
): Promise<string> {
  const { customers } = await computeAllSegmentedCustomers(db);
  const seg = (query.segment || 'all').toLowerCase();
  const term = (query.search || '').trim().toLowerCase();
  const filtered = customers.filter(c => {
    if (seg !== 'all' && c.segment !== seg) return false;
    if (term && !`${c.name} ${c.email} ${c.phone}`.toLowerCase().includes(term)) return false;
    return true;
  });

  return generateCsvString({
    title: `Customer Segmentation (${seg})`,
    subtitle: `Exported ${filtered.length} customers`,
    columns: [
      { header: 'Customer ID', key: 'id' },
      { header: 'Name', key: 'name' },
      { header: 'Email', key: 'email' },
      { header: 'Phone', key: 'phone' },
      { header: 'Segment', key: 'segmentLabel' },
      { header: 'Successful Orders', key: 'successfulOrdersCount' },
      { header: 'Lifetime Spending (INR)', key: 'lifetimeSpending' },
      { header: 'Average Order Value (INR)', key: 'averageOrderValue' },
      { header: 'Last Purchase Date', key: 'lastPurchaseDate' },
      { header: 'WhatsApp Consent Eligible', key: 'whatsappEligible' },
    ],
    rows: filtered.map(c => ({
      id: c.id,
      name: c.name,
      email: c.email,
      phone: c.phone,
      segmentLabel: c.segmentLabel,
      successfulOrdersCount: c.successfulOrdersCount,
      lifetimeSpending: c.lifetimeSpending,
      averageOrderValue: c.averageOrderValue,
      lastPurchaseDate: c.lastPurchaseDate || 'Never',
      whatsappEligible: c.whatsappEligible ? 'Yes' : `No (${c.optOutReason || 'Ineligible'})`,
    })),
  });
}

export async function executeSegmentWhatsAppCampaign(
  db: MongoDatabase,
  input: {
    segment: CustomerSegmentKey | 'all';
    title: string;
    messageTemplate: string;
    offerCode?: string;
    idempotencyKey?: string;
  },
  admin: { id: string; name: string; email: string }
) {
  if (input.idempotencyKey) {
    const existing = await db.models.SegmentCampaignLog.findOne(
      { idempotencyKey: input.idempotencyKey },
      { _id: 0 }
    ).lean();
    if (existing) {
      return { status: 409 as const, error: 'Duplicate campaign request prevented.', campaign: existing };
    }
  }

  const { customers } = await computeAllSegmentedCustomers(db);
  const matching = customers.filter(c => input.segment === 'all' || c.segment === input.segment);

  const recipients: any[] = [];
  let eligibleCount = 0;
  let skippedOptOutCount = 0;
  let skippedMissingPhoneCount = 0;

  for (const c of matching) {
    const phoneDigits = normalizeWhatsAppDigits(c.phone);
    if (!c.marketingConsent || c.optOutReason === 'Unsubscribed' || c.optOutReason === 'No marketing consent') {
      skippedOptOutCount += 1;
      continue;
    }
    if (!phoneDigits) {
      skippedMissingPhoneCount += 1;
      continue;
    }
    eligibleCount += 1;
    const personalized = input.messageTemplate
      .replace(/\{name\}/gi, c.name)
      .replace(/\{offer_code\}/gi, input.offerCode || '');
    recipients.push({
      customerId: c.id,
      customerName: c.name,
      phone: phoneDigits,
      segment: c.segmentLabel,
      consentEligible: true,
      whatsappUrl: `https://wa.me/${phoneDigits}?text=${encodeURIComponent(personalized)}`,
      status: 'ready',
    });
  }

  const now = new Date().toISOString();
  try {
    const created = await db.models.SegmentCampaignLog.create({
      id: `segcmp_${crypto.randomUUID()}`,
      campaignType: 'whatsapp_campaign',
      segmentKey: input.segment,
      title: input.title,
      messageTemplate: input.messageTemplate,
      offerCode: input.offerCode || null,
      idempotencyKey: input.idempotencyKey || null,
      targetCount: matching.length,
      eligibleCount,
      skippedOptOutCount,
      skippedMissingPhoneCount,
      appliedCount: eligibleCount,
      recipients,
      createdByAdminId: admin.id,
      createdByAdminName: admin.name,
      createdAt: now,
    });

    await logAudit(db, {
      actorId: admin.id,
      actorEmail: admin.email,
      action: 'segment_whatsapp_campaign_created',
      entityType: 'segment_campaign',
      entityId: created.id,
      details: {
        segment: input.segment,
        targetCount: matching.length,
        eligibleCount,
        skippedOptOutCount,
      },
    });

    const plain = created.toObject() as Record<string, unknown>;
    delete plain._id;
    return { status: 201 as const, campaign: plain };
  } catch (err: any) {
    if (err?.code === 11000 || String(err?.message || '').includes('E11000')) {
      return { status: 409 as const, error: 'Duplicate campaign request prevented.' };
    }
    throw err;
  }
}

export async function applySegmentOffer(
  db: MongoDatabase,
  input: {
    segment: CustomerSegmentKey | 'all';
    customerId?: string;
    title: string;
    codePrefix?: string;
    discountType: 'percentage' | 'flat';
    discountValue: number;
    minOrderValue: number;
    validDays: number;
    usageLimit: number;
    idempotencyKey?: string;
  },
  admin: { id: string; name: string; email: string }
) {
  if (input.idempotencyKey) {
    const existing = await db.models.SegmentCampaignLog.findOne(
      { idempotencyKey: input.idempotencyKey },
      { _id: 0 }
    ).lean();
    if (existing) {
      return { status: 409 as const, error: 'Duplicate segment offer prevented.', campaign: existing };
    }
  }

  const { customers } = await computeAllSegmentedCustomers(db);
  const targets = input.customerId
    ? customers.filter(c => c.id === input.customerId)
    : customers.filter(c => input.segment === 'all' || c.segment === input.segment);

  if (targets.length === 0) {
    return { status: 400 as const, error: 'No customers matched the selected segment or customer filter.' };
  }

  const cleanPrefix = (input.codePrefix || 'SETH')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 8) || 'SETH';
  const now = new Date().toISOString();
  const endDate = new Date(Date.now() + input.validDays * 86400_000).toISOString();

  const existingActiveCoupons = await db.models.Coupon.find(
    { targetCustomerId: { $in: targets.map(t => t.id) }, title: input.title, active: true },
    { targetCustomerId: 1, _id: 0 }
  ).lean();
  const alreadyHasOffer = new Set(existingActiveCoupons.map(c => String(c.targetCustomerId)));

  const recipients: any[] = [];
  let appliedCount = 0;

  for (const t of targets) {
    if (alreadyHasOffer.has(t.id)) {
      recipients.push({
        customerId: t.id,
        customerName: t.name,
        status: 'skipped_duplicate',
        couponCode: null,
      });
      continue;
    }

    const code = `${cleanPrefix}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
    await db.models.Coupon.create({
      id: `coup_${crypto.randomUUID()}`,
      code,
      title: input.title,
      description: `Targeted ${t.segmentLabel} privilege offer`,
      discountType: input.discountType,
      discountValue: input.discountValue,
      minOrderValue: input.minOrderValue,
      maxDiscount: null,
      startDate: now,
      endDate,
      applicableProducts: [],
      usageLimit: input.usageLimit,
      usedCount: 0,
      targetCustomerId: t.id,
      targetEmail: t.email,
      active: true,
      createdAt: now,
    });
    appliedCount += 1;
    recipients.push({
      customerId: t.id,
      customerName: t.name,
      status: 'applied',
      couponCode: code,
    });
  }

  try {
    const created = await db.models.SegmentCampaignLog.create({
      id: `segoff_${crypto.randomUUID()}`,
      campaignType: 'segment_offer',
      segmentKey: input.segment,
      title: input.title,
      offerCode: cleanPrefix,
      discountType: input.discountType,
      discountValue: input.discountValue,
      minOrderValue: input.minOrderValue,
      validDays: input.validDays,
      idempotencyKey: input.idempotencyKey || null,
      targetCount: targets.length,
      eligibleCount: targets.length,
      skippedOptOutCount: 0,
      skippedMissingPhoneCount: 0,
      appliedCount,
      recipients,
      createdByAdminId: admin.id,
      createdByAdminName: admin.name,
      createdAt: now,
    });

    await logAudit(db, {
      actorId: admin.id,
      actorEmail: admin.email,
      action: 'segment_offer_applied',
      entityType: 'segment_offer',
      entityId: created.id,
      details: { segment: input.segment, title: input.title, appliedCount },
    });

    const plain = created.toObject() as Record<string, unknown>;
    delete plain._id;
    return { status: 201 as const, campaign: plain };
  } catch (err: any) {
    if (err?.code === 11000 || String(err?.message || '').includes('E11000')) {
      return { status: 409 as const, error: 'Duplicate segment offer prevented.' };
    }
    throw err;
  }
}
