import crypto from 'node:crypto';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp, type AppInstance } from '../server/app.ts';
import { clearRateLimitStore } from '../server/middleware/security.ts';
import { markCartRecoveredForOrder } from '../server/services/cartRecoveryService.ts';
import { type MediaStorageService } from '../server/services/cloudinaryService.ts';
import { type EmailTransport, type OutboundEmailPayload } from '../server/services/emailProvider.ts';
import { hashPassword } from '../server/utils/crypto.ts';

function createSpyMediaStorage(): MediaStorageService {
  return {
    isConfigured: () => false,
    async uploadBuffer() {
      throw new Error('Unused in test');
    },
  };
}

function createSpyTransport(): EmailTransport & { sent: OutboundEmailPayload[] } {
  const sent: OutboundEmailPayload[] = [];
  return {
    sent,
    async send(payload) {
      sent.push(payload);
      return { provider: 'smtp', messageId: `<crm-test-${sent.length}@asuleshseth.com>` };
    },
    getSummary() {
      return {
        provider: 'smtp',
        mode: 'test-spy',
        configured: true,
        fromEmail: 'aseth9588@gmail.com',
        hostHint: 'test:587',
        trackingEnabled: false,
      };
    },
  };
}

function extractCookieValue(setCookies: string[] | string | undefined, name: string): string {
  if (!setCookies) return '';
  const list = Array.isArray(setCookies) ? setCookies : [setCookies];
  for (const c of list) {
    const match = c.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
    if (match) return decodeURIComponent(match[1]);
  }
  return '';
}

async function getAgentWithCsrf(app: AppInstance['app']) {
  const agent = request.agent(app);
  const res = await agent.get('/api/auth/me');
  const csrf = extractCookieValue(res.headers['set-cookie'], 'as_csrf');
  return { agent, csrf };
}

async function loginAdminViaOtp(
  agent: ReturnType<typeof request.agent>,
  csrf: string,
  sent: OutboundEmailPayload[],
  email = 'aseth9588@gmail.com'
) {
  const reqRes = await agent
    .post('/api/auth/admin-otp/request')
    .set('x-csrf-token', csrf)
    .send({ email });
  expect(reqRes.status).toBe(200);
  const mail = [...sent]
    .reverse()
    .find(m => m.to === email && m.subject.includes('Admin Portal Login OTP'));
  expect(mail).toBeTruthy();
  const otp = mail!.text.match(/\b(\d{6})\b/)?.[1];
  expect(otp).toBeTruthy();
  return agent
    .post('/api/auth/admin-otp/verify')
    .set('x-csrf-token', csrf)
    .send({ email, otp, rememberMe: true });
}

describe('Admin Abandoned Cart Tracker & Customer Segmentation', () => {
  let mongod: MongoMemoryServer;
  let dbCounter = 0;
  let instance: AppInstance;
  let spyTransport: ReturnType<typeof createSpyTransport>;

  beforeAll(async () => {
    mongod = await MongoMemoryServer.create();
  }, 60_000);

  afterAll(async () => {
    await mongod?.stop();
  });

  beforeEach(async () => {
    clearRateLimitStore();
    spyTransport = createSpyTransport();
    instance = await createApp({
      config: {
        mongodbUri: `${mongod.getUri()}crm_test_${++dbCounter}`,
        nodeEnv: 'test',
        isProduction: false,
        emailWebhookSecret: 'crm-test-webhook',
        adminSeedEmail: 'aseth9588@gmail.com',
        adminSeedPassword: 'RoyalAdmin@2026!',
      },
      emailTransport: spyTransport,
      mediaStorage: createSpyMediaStorage(),
      startQueueWorker: false,
    });
  }, 30_000);

  afterEach(async () => {
    await instance?.close();
  });

  it('enforces admin authorization (401/403) and RBAC permission checks on Abandoned Carts and Segments', async () => {
    // 1. Anonymous rejected (401)
    const { agent: anonAgent } = await getAgentWithCsrf(instance.app);
    expect((await anonAgent.get('/api/admin/abandoned-carts')).status).toBe(401);
    expect((await anonAgent.get('/api/admin/segments/overview')).status).toBe(401);

    // 2. Customer rejected (403)
    const { agent: custAgent, csrf: custCsrf } = await getAgentWithCsrf(instance.app);
    const custLogin = await custAgent
      .post('/api/auth/login')
      .set('x-csrf-token', custCsrf)
      .send({ email: 'vikram.seth@heritage.in', password: 'Patron@2026!' });
    expect(custLogin.status).toBe(200);
    expect((await custAgent.get('/api/admin/abandoned-carts')).status).toBe(403);
    expect((await custAgent.get('/api/admin/segments/overview')).status).toBe(403);

    // 3. Staff without 'customers' permission rejected (403); staff WITH 'customers' allowed (200)
    const { agent: superAgent, csrf: initCsrf } = await getAgentWithCsrf(instance.app);
    const superLogin = await loginAdminViaOtp(superAgent, initCsrf, spyTransport.sent);
    const superCsrf = extractCookieValue(superLogin.headers['set-cookie'], 'as_csrf') || initCsrf;

    await superAgent
      .post('/api/admin/staff')
      .set('x-csrf-token', superCsrf)
      .send({
        name: 'Catalog Staff',
        email: 'catalog@asuleshseth.com',
        phone: '9876500001',
        adminRole: 'staff',
        permissions: ['products'],
      });

    const { agent: noPermAgent, csrf: npCsrf } = await getAgentWithCsrf(instance.app);
    await loginAdminViaOtp(noPermAgent, npCsrf, spyTransport.sent, 'catalog@asuleshseth.com');
    expect((await noPermAgent.get('/api/admin/abandoned-carts')).status).toBe(403);
    expect((await noPermAgent.get('/api/admin/segments/overview')).status).toBe(403);

    await superAgent
      .post('/api/admin/staff')
      .set('x-csrf-token', superCsrf)
      .send({
        name: 'CRM Staff',
        email: 'crm@asuleshseth.com',
        phone: '9876500002',
        adminRole: 'staff',
        permissions: ['customers'],
      });

    const { agent: crmAgent, csrf: crmCsrf } = await getAgentWithCsrf(instance.app);
    await loginAdminViaOtp(crmAgent, crmCsrf, spyTransport.sent, 'crm@asuleshseth.com');
    expect((await crmAgent.get('/api/admin/abandoned-carts')).status).toBe(200);
    expect((await crmAgent.get('/api/admin/segments/overview')).status).toBe(200);
  });

  it('detects cart abandonment, excludes test/cancelled recoveries, enforces WhatsApp consent & anti-duplicate follow-ups, and recovers carts on checkout', async () => {
    const { agent: superAgent, csrf: initCsrf } = await getAgentWithCsrf(instance.app);
    const superLogin = await loginAdminViaOtp(superAgent, initCsrf, spyTransport.sent);
    const superCsrf = extractCookieValue(superLogin.headers['set-cookie'], 'as_csrf') || initCsrf;

    // Seed an opted-out customer too so we test consent blocking
    const optOutId = 'cust_opt_out_test';
    const optOutEmail = 'optout.patron@example.com';
    const optOutPassword = await hashPassword('Patron@2026!');
    const nowIso = new Date().toISOString();
    await instance.db.models.Customer.create({
      id: optOutId,
      name: 'OptOut Patron',
      email: optOutEmail,
      emailVerified: true,
      phone: '9876543299',
      passwordHash: optOutPassword,
      role: 'customer',
      isActive: true,
      marketingConsent: false,
      unsubscribedAt: nowIso,
      createdAt: nowIso,
      updatedAt: nowIso,
    });

    // Ensure seeded customer vikram.seth@heritage.in is opted in for follow-up test
    await instance.db.models.Customer.updateOne(
      { email: 'vikram.seth@heritage.in' },
      { $set: { marketingConsent: true, unsubscribedAt: null, phone: '9812345678' } }
    );

    // 1. Login opted-in patron Vikram and sync storefront cart
    const { agent: custAgent, csrf: custCsrf0 } = await getAgentWithCsrf(instance.app);
    const custLogin = await custAgent
      .post('/api/auth/login')
      .set('x-csrf-token', custCsrf0)
      .send({ email: 'vikram.seth@heritage.in', password: 'Patron@2026!' });
    expect(custLogin.status).toBe(200);
    const custCsrf = extractCookieValue(custLogin.headers['set-cookie'], 'as_csrf') || custCsrf0;

    const syncRes = await custAgent
      .post('/api/cart/sync')
      .set('x-csrf-token', custCsrf)
      .send({
        visitorToken: 'visitor_vikram_1234567890',
        items: [{ productId: 'badam', quantity: 2 }],
      });
    expect(syncRes.status).toBe(200);
    expect(syncRes.body.synced).toBe(true);
    const vikramCartId = syncRes.body.cart.id;
    expect(syncRes.body.cart.status).toBe('active');
    expect(syncRes.body.cart.cartTotal).toBeGreaterThan(0);

    // 2. Login opted-out patron and sync cart + add a test cart that must be excluded
    const { agent: optOutAgent, csrf: ooCsrf0 } = await getAgentWithCsrf(instance.app);
    const ooLogin = await optOutAgent
      .post('/api/auth/login')
      .set('x-csrf-token', ooCsrf0)
      .send({ email: optOutEmail, password: 'Patron@2026!' });
    expect(ooLogin.status).toBe(200);
    const ooCsrf = extractCookieValue(ooLogin.headers['set-cookie'], 'as_csrf') || ooCsrf0;

    const ooSync = await optOutAgent
      .post('/api/cart/sync')
      .set('x-csrf-token', ooCsrf)
      .send({
        visitorToken: 'visitor_optout_1234567890',
        items: [{ productId: 'kaju', quantity: 1 }],
      });
    expect(ooSync.status).toBe(200);
    const optOutCartId = ooSync.body.cart.id;

    // Insert a test cart (isTest: true) to verify exclusion from KPIs & list
    await instance.db.models.CartSession.create({
      id: 'cart_test_excluded',
      openCartKey: 'guest:test_excluded_token_1234',
      customerName: 'Test Sandbox Bot',
      cartTotal: 99999,
      status: 'abandoned',
      lastActivityAt: new Date(Date.now() - 2 * 3600_000).toISOString(),
      abandonedAt: new Date(Date.now() - 90 * 60_000).toISOString(),
      isTest: true,
      createdAt: nowIso,
      updatedAt: nowIso,
    });

    // 3. Backdate both real carts past 30-min abandonment threshold (2 hours ago)
    const twoHoursAgo = new Date(Date.now() - 2 * 3600_000).toISOString();
    await instance.db.models.CartSession.updateMany(
      { id: { $in: [vikramCartId, optOutCartId] } },
      { $set: { lastActivityAt: twoHoursAgo } }
    );

    // Fetch Abandoned Cart Dashboard -> reconciles active -> abandoned
    const dashRes1 = await superAgent.get('/api/admin/abandoned-carts');
    expect(dashRes1.status).toBe(200);
    expect(dashRes1.body.summary.totalAbandonedCarts).toBe(2);
    expect(dashRes1.body.summary.potentialLostRevenue).toBe(
      syncRes.body.cart.cartTotal + ooSync.body.cart.cartTotal
    ); // Test cart (99,999) strictly excluded
    expect(dashRes1.body.sevenDayTrend).toHaveLength(7);

    // 4. WhatsApp follow-up blocks opted-out customer cleanly (403)
    const blockedFollowUp = await superAgent
      .post(`/api/admin/abandoned-carts/${optOutCartId}/follow-up`)
      .set('x-csrf-token', superCsrf)
      .send({});
    expect(blockedFollowUp.status).toBe(403);

    // WhatsApp follow-up succeeds once for opted-in Vikram, then prevents duplicate in cooldown (409)
    const okFollowUp = await superAgent
      .post(`/api/admin/abandoned-carts/${vikramCartId}/follow-up`)
      .set('x-csrf-token', superCsrf)
      .send({});
    expect(okFollowUp.status).toBe(200);
    expect(okFollowUp.body.whatsappUrl).toContain('https://wa.me/919812345678?text=');
    expect(okFollowUp.body.cart.followUpCount).toBe(1);

    const dupFollowUp = await superAgent
      .post(`/api/admin/abandoned-carts/${vikramCartId}/follow-up`)
      .set('x-csrf-token', superCsrf)
      .send({});
    expect(dupFollowUp.status).toBe(409);

    // 5. Vikram completes checkout -> cart is automatically marked 'recovered'
    const orderRes = await custAgent
      .post('/api/orders')
      .set('x-csrf-token', custCsrf)
      .send({
        items: [{ productId: 'badam', quantity: 2 }],
        deliveryAddress: {
          fullName: 'Vikramaditya Seth',
          mobileNumber: '9812345678',
          deliveryAddress: '14 Heritage Lane',
          city: 'Jammu',
          state: 'Jammu & Kashmir',
          pincode: '180002',
        },
        paymentMethod: 'upi',
      });
    expect(orderRes.status).toBe(201);
    const placedOrder = orderRes.body.order;

    // Simulating onClearCart() sync after checkout must not delete the recovered cart
    await custAgent
      .post('/api/cart/sync')
      .set('x-csrf-token', custCsrf)
      .send({ visitorToken: 'visitor_vikram_1234567890', items: [] });

    // Re-running markCartRecoveredForOrder for the same order prevents duplicate recovery
    const dupRecovery = await markCartRecoveredForOrder(instance.db, {
      id: placedOrder.id,
      orderNumber: placedOrder.orderNumber,
      customerId: placedOrder.customerId,
      totalAmount: placedOrder.totalAmount,
      status: 'placed',
    });
    expect(dupRecovery.recovered).toBe(false);
    expect(dupRecovery.reason).toBe('duplicate_recovery_prevented');

    // Dashboard reflects 1 recovered order, 1 remaining abandoned cart, 50% recovery rate
    const dashRes2 = await superAgent.get('/api/admin/abandoned-carts');
    expect(dashRes2.status).toBe(200);
    expect(dashRes2.body.summary.totalAbandonedCarts).toBe(1);
    expect(dashRes2.body.summary.recoveredCartsCount).toBe(1);
    expect(dashRes2.body.summary.recoveredCartRevenue).toBe(placedOrder.totalAmount);
    expect(dashRes2.body.summary.cartRecoveryRate).toBe(50);

    // 6. If that recovered order is cancelled, it must be excluded from recovered revenue reporting
    await instance.db.models.Order.updateOne(
      { id: placedOrder.id },
      { $set: { status: 'cancelled' } }
    );
    const dashAfterCancel = await superAgent.get('/api/admin/abandoned-carts');
    expect(dashAfterCancel.body.summary.recoveredCartsCount).toBe(0);
    expect(dashAfterCancel.body.summary.recoveredCartRevenue).toBe(0);
  });

  it('classifies customer segments without overlap, computes lifetime spend & inactive detection, exports CSV, and enforces consent on campaigns & offers', async () => {
    const { agent: superAgent, csrf: initCsrf } = await getAgentWithCsrf(instance.app);
    const superLogin = await loginAdminViaOtp(superAgent, initCsrf, spyTransport.sent);
    const superCsrf = extractCookieValue(superLogin.headers['set-cookie'], 'as_csrf') || initCsrf;

    const nowMs = Date.now();
    const recent1 = new Date(nowMs - 3 * 86400_000).toISOString();
    const recent2 = new Date(nowMs - 1 * 86400_000).toISOString();
    const old120DaysAgo = new Date(nowMs - 120 * 86400_000).toISOString();

    const makeCustomer = async (
      id: string,
      name: string,
      email: string,
      phone: string,
      marketingConsent: boolean,
      unsubscribedAt: string | null = null
    ) => {
      await instance.db.models.Customer.create({
        id,
        name,
        email,
        emailVerified: true,
        phone,
        role: 'customer',
        isActive: true,
        marketingConsent,
        unsubscribedAt,
        createdAt: recent1,
        updatedAt: recent1,
      });
    };

    const makeOrder = async (
      orderId: string,
      orderNumber: string,
      customerId: string,
      totalAmount: number,
      status: string,
      createdAt: string,
      items: Array<{ productId: string; productName: string; quantity: number; subtotal: number }>
    ) => {
      await instance.db.models.Order.create({
        id: orderId,
        orderNumber,
        customerId,
        status,
        paymentStatus: 'paid',
        subtotal: totalAmount,
        totalAmount,
        deliveryAddress: { fullName: 'Test', city: 'Surat', state: 'Gujarat', pincode: '395007' },
        customerSnapshot: { id: customerId },
        createdAt,
        updatedAt: createdAt,
      });
      for (const it of items) {
        await instance.db.models.OrderItem.create({
          id: `oi_${crypto.randomUUID()}`,
          orderId,
          productId: it.productId,
          productName: it.productName,
          productImage: '/assets/products/test.jpg',
          category: 'nuts',
          unit: 'kg',
          unitPrice: Math.round(it.subtotal / it.quantity),
          quantity: it.quantity,
          subtotal: it.subtotal,
        });
      }
    };

    // Seed clean distinct profiles covering every segment
    await makeCustomer('seg_new', 'New Patron', 'new@example.com', '9800000001', true);
    await makeOrder('ord_new_1', 'ORD-SEG-1', 'seg_new', 1200, 'delivered', recent1, [
      { productId: 'badam', productName: 'California Badam', quantity: 1, subtotal: 1200 },
    ]);
    // Cancelled order must be ignored from spend & order count!
    await makeOrder('ord_new_cancel', 'ORD-SEG-1C', 'seg_new', 9000, 'cancelled', recent2, [
      { productId: 'kaju', productName: 'Goan Kaju', quantity: 9, subtotal: 9000 },
    ]);

    await makeCustomer('seg_ret', 'Returning Patron', 'ret@example.com', '9800000002', true);
    await makeOrder('ord_ret_1', 'ORD-SEG-2A', 'seg_ret', 1500, 'delivered', recent1, [
      { productId: 'kaju', productName: 'Goan Kaju', quantity: 1, subtotal: 1500 },
    ]);
    await makeOrder('ord_ret_2', 'ORD-SEG-2B', 'seg_ret', 1400, 'confirmed', recent2, [
      { productId: 'kaju', productName: 'Goan Kaju', quantity: 1, subtotal: 1400 },
    ]);

    await makeCustomer('seg_hv', 'HighValue Patron', 'hv@example.com', '9800000003', true);
    await makeOrder('ord_hv_1', 'ORD-SEG-3', 'seg_hv', 6500, 'delivered', recent1, [
      { productId: 'pista', productName: 'Iranian Pistachios', quantity: 5, subtotal: 6500 },
    ]);

    await makeCustomer('seg_vip_ok', 'VIP Consented', 'vip.ok@example.com', '9800000004', true);
    await makeOrder('ord_vip_1', 'ORD-SEG-4A', 'seg_vip_ok', 7500, 'delivered', recent1, [
      { productId: 'kesar', productName: 'Kashmiri Kesar', quantity: 2, subtotal: 7500 },
    ]);
    await makeOrder('ord_vip_2', 'ORD-SEG-4B', 'seg_vip_ok', 5000, 'delivered', recent2, [
      { productId: 'kesar', productName: 'Kashmiri Kesar', quantity: 1, subtotal: 5000 },
    ]);

    await makeCustomer(
      'seg_vip_no',
      'VIP Unsubscribed',
      'vip.no@example.com',
      '9800000005',
      true,
      new Date().toISOString()
    );
    await makeOrder('ord_vip_no', 'ORD-SEG-5', 'seg_vip_no', 11000, 'delivered', recent1, [
      { productId: 'badam', productName: 'California Badam', quantity: 10, subtotal: 11000 },
    ]);

    await makeCustomer('seg_inact', 'Inactive Patron', 'inactive@example.com', '9800000006', true);
    await makeOrder('ord_inact_1', 'ORD-SEG-6', 'seg_inact', 4000, 'delivered', old120DaysAgo, [
      { productId: 'akhrot', productName: 'Kashmiri Akhrot', quantity: 2, subtotal: 4000 },
    ]);

    // 1. Inspect Overview -> non-overlapping summary + exact lifetime spending
    const overviewRes = await superAgent.get('/api/admin/segments/overview');
    expect(overviewRes.status).toBe(200);
    const { summary, revenueBySegment } = overviewRes.body;

    // Total customers must equal exact sum across all mutually exclusive buckets
    const bucketSum =
      summary.newCustomersCount +
      summary.returningCustomersCount +
      summary.vipCustomersCount +
      summary.highValueCustomersCount +
      summary.inactiveCustomersCount +
      summary.prospectsCount;
    expect(bucketSum).toBe(summary.totalCustomers);

    const segRevSum = revenueBySegment.reduce((s: number, r: any) => s + Number(r.revenue || 0), 0);
    expect(segRevSum).toBe(summary.totalRevenue);

    expect(summary.vipCustomersCount).toBe(2); // seg_vip_ok + seg_vip_no
    expect(summary.highValueCustomersCount).toBe(1); // seg_hv
    expect(summary.returningCustomersCount).toBe(1); // seg_ret
    expect(summary.inactiveCustomersCount).toBe(1); // seg_inact

    // 2. Verify Customer Profile (lifetime spending, AOV, most purchased products, excludes cancelled order)
    const newProfileRes = await superAgent.get('/api/admin/segments/customers/seg_new');
    expect(newProfileRes.status).toBe(200);
    expect(newProfileRes.body.customer.segment).toBe('new');
    expect(newProfileRes.body.customer.successfulOrdersCount).toBe(1);
    expect(newProfileRes.body.customer.lifetimeSpending).toBe(1200);
    expect(newProfileRes.body.customer.averageOrderValue).toBe(1200);
    expect(newProfileRes.body.customer.mostPurchasedProducts[0].productId).toBe('badam');

    const vipProfileRes = await superAgent.get('/api/admin/segments/customers/seg_vip_ok');
    expect(vipProfileRes.status).toBe(200);
    expect(vipProfileRes.body.customer.segment).toBe('vip');
    expect(vipProfileRes.body.customer.lifetimeSpending).toBe(12500);
    expect(vipProfileRes.body.customer.averageOrderValue).toBe(6250);
    expect(vipProfileRes.body.customer.mostPurchasedProducts[0].quantity).toBe(3);

    const inactiveProfileRes = await superAgent.get('/api/admin/segments/customers/seg_inact');
    expect(inactiveProfileRes.status).toBe(200);
    expect(inactiveProfileRes.body.customer.segment).toBe('inactive');

    // 3. Configurable thresholds reclassify cleanly (lower VIP threshold to 6000 -> seg_hv moves to VIP)
    const cfgUpdate = await superAgent
      .put('/api/admin/segments/config')
      .set('x-csrf-token', superCsrf)
      .send({ vipSpendThreshold: 6000, highValueSpendThreshold: 2500, inactiveDaysThreshold: 90 });
    expect(cfgUpdate.status).toBe(200);

    const hvNowVip = await superAgent.get('/api/admin/segments/customers/seg_hv');
    expect(hvNowVip.body.customer.segment).toBe('vip');

    // Restore defaults for subsequent checks
    await superAgent
      .put('/api/admin/segments/config')
      .set('x-csrf-token', superCsrf)
      .send({ vipSpendThreshold: 10000, highValueSpendThreshold: 5000, inactiveDaysThreshold: 90 });

    // 4. CSV Export respects segment filter
    const csvRes = await superAgent.get('/api/admin/segments/export.csv?segment=inactive');
    expect(csvRes.status).toBe(200);
    expect(csvRes.text).toContain('inactive@example.com');
    expect(csvRes.text).not.toContain('vip.ok@example.com');

    // 5. Targeted WhatsApp campaign skips unsubscribed VIP customer & enforces duplicate idempotency
    const waPayload = {
      segment: 'vip',
      title: 'VIP Diwali Preview',
      messageTemplate: 'Namaste {name}, exclusive reserve awaits with {offer_code}!',
      offerCode: 'VIP2026',
      idempotencyKey: 'wa_cmp_unique_1',
    };
    const waRes = await superAgent
      .post('/api/admin/segments/whatsapp-campaign')
      .set('x-csrf-token', superCsrf)
      .send(waPayload);
    expect(waRes.status).toBe(201);
    expect(waRes.body.campaign.eligibleCount).toBe(1); // Only seg_vip_ok
    expect(waRes.body.campaign.skippedOptOutCount).toBe(1); // seg_vip_no skipped!
    expect(waRes.body.campaign.recipients[0].whatsappUrl).toContain('https://wa.me/919800000004?text=');

    const waDup = await superAgent
      .post('/api/admin/segments/whatsapp-campaign')
      .set('x-csrf-token', superCsrf)
      .send(waPayload);
    expect(waDup.status).toBe(409);

    // 6. Configurable Segment Offer creates targeted coupons and prevents duplicate offers
    const offerPayload = {
      segment: 'inactive',
      title: 'Win-Back Reserve 15%',
      codePrefix: 'WINBACK',
      discountType: 'percentage',
      discountValue: 15,
      minOrderValue: 1000,
      validDays: 14,
      usageLimit: 1,
      idempotencyKey: 'offer_unique_1',
    };
    const offRes = await superAgent
      .post('/api/admin/segments/apply-offer')
      .set('x-csrf-token', superCsrf)
      .send(offerPayload);
    expect(offRes.status).toBe(201);
    expect(offRes.body.campaign.appliedCount).toBe(1);
    const createdCoupon = await instance.db.models.Coupon.findOne({ targetCustomerId: 'seg_inact' }).lean();
    expect(createdCoupon).toBeTruthy();
    expect(createdCoupon!.discountValue).toBe(15);

    const offDup = await superAgent
      .post('/api/admin/segments/apply-offer')
      .set('x-csrf-token', superCsrf)
      .send(offerPayload);
    expect(offDup.status).toBe(409);
  });
});
