import { MongoMemoryServer } from 'mongodb-memory-server';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp, type AppInstance } from '../server/app.ts';
import { clearRateLimitStore } from '../server/middleware/security.ts';
import { type EmailTransport, type OutboundEmailPayload } from '../server/services/emailProvider.ts';
import { type MediaStorageService } from '../server/services/cloudinaryService.ts';

function createSpyMediaStorage(): MediaStorageService & { deleted: string[] } {
  const deleted: string[] = [];
  return {
    deleted,
    isConfigured: () => true,
    async uploadBuffer(params) {
      return { url: 'https://res.cloudinary.com/asulesh-test/image/upload/v1/avatar.png', publicId: 'avatar_1', format: 'png', bytes: params.buffer.length };
    },
    async deleteAsset(opts) {
      if (opts.url) deleted.push(opts.url);
      return true;
    },
  };
}

function createSpyTransport(): EmailTransport & { sent: OutboundEmailPayload[] } {
  const sent: OutboundEmailPayload[] = [];
  return {
    sent,
    async send(payload) {
      sent.push(payload);
      return {
        provider: 'smtp',
        messageId: `<customer-test-${sent.length}@asuleshseth.com>`,
      };
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

describe('Admin Customer Management, Frequent Buyers, Targeted Coupons & 48h Unverified Purge', () => {
  let mongod: MongoMemoryServer;
  let dbCounter = 0;
  let instance: AppInstance;
  let spyMedia: ReturnType<typeof createSpyMediaStorage>;
  let spyTransport: ReturnType<typeof createSpyTransport>;

  beforeAll(async () => {
    mongod = await MongoMemoryServer.create();
  }, 60_000);

  afterAll(async () => {
    await mongod?.stop();
  });

  beforeEach(async () => {
    clearRateLimitStore();
    spyMedia = createSpyMediaStorage();
    spyTransport = createSpyTransport();
    instance = await createApp({
      config: {
        mongodbUri: `${mongod.getUri()}cust_test_${++dbCounter}`,
        nodeEnv: 'test',
        isProduction: false,
        emailWebhookSecret: 'cust-webhook-secret',
        adminSeedEmail: 'aseth9588@gmail.com',
        adminSeedPassword: 'RoyalAdmin@2026!',
      },
      emailTransport: spyTransport,
      mediaStorage: spyMedia,
      startQueueWorker: false,
    });
  }, 30_000);

  afterEach(async () => {
    await instance?.close();
  });

  it('manages customer lifecycle: reads profile, itemized orders, updates info, and deletes account cleanly', async () => {
    const { agent: superAgent, csrf } = await getAgentWithCsrf(instance.app);
    const loginRes = await loginAdminViaOtp(superAgent, csrf, spyTransport.sent);
    expect(loginRes.status).toBe(200);
    const csrfAfter = extractCookieValue(loginRes.headers['set-cookie'], 'as_csrf') || csrf;

    const now = new Date().toISOString();
    const custId = 'cust_test_lifecycle';
    await instance.db.models.Customer.create({
      id: custId,
      name: 'Rohan Sharma',
      email: 'rohan.sharma@example.com',
      phone: '9876543210',
      role: 'customer',
      emailVerified: true,
      profilePicture: 'https://res.cloudinary.com/asulesh-test/image/upload/v1/avatar.png',
      createdAt: now,
      updatedAt: now,
    });

    await instance.db.models.CustomerAddress.create({
      id: 'addr_rohan_1',
      customerId: custId,
      label: 'Home',
      fullName: 'Rohan Sharma',
      phone: '9876543210',
      addressLine: '12 Residency Road',
      city: 'Jammu',
      state: 'Jammu & Kashmir',
      pincode: '180001',
      createdAt: now,
      updatedAt: now,
    });

    const orderId = 'ord_rohan_101';
    await instance.db.models.Order.create({
      id: orderId,
      orderNumber: 'ORD-2026-RH1',
      customerId: custId,
      customerEmail: 'rohan.sharma@example.com',
      totalAmount: 2400,
      subtotal: 2400,
      paymentMethod: 'prepaid',
      status: 'delivered',
      deliveryAddress: {
        fullName: 'Rohan Sharma',
        mobileNumber: '9876543210',
        addressLine: '12 Residency Road',
        city: 'Jammu',
        state: 'Jammu & Kashmir',
        pincode: '180001',
      },
      customerSnapshot: {
        name: 'Rohan Sharma',
        email: 'rohan.sharma@example.com',
      },
      createdAt: now,
      updatedAt: now,
    });

    await instance.db.models.OrderItem.create({
      id: 'item_rohan_1',
      orderId,
      productId: 'prod_walnut',
      productName: 'Kashmiri Giri Walnut Reserve',
      productImage: '/assets/walnut.jpg',
      category: 'Walnuts',
      unit: 'kg',
      weightLabel: '1kg',
      unitPrice: 1200,
      quantity: 2,
      subtotal: 2400,
    });

    // 1. Read customer profile & itemized ordered items
    const getRes = await superAgent
      .get(`/api/admin/customers/${custId}`)
      .set('x-csrf-token', csrfAfter)
      .expect(200);

    expect(getRes.body.customer.name).toBe('Rohan Sharma');
    expect(getRes.body.customer.lifetimeSpending).toBe(2400);
    expect(getRes.body.orders.length).toBe(1);
    expect(getRes.body.orders[0].items.length).toBe(1);
    expect(getRes.body.orders[0].items[0].productName).toBe('Kashmiri Giri Walnut Reserve');

    // 2. Read dedicated customer orders endpoint
    const ordersRes = await superAgent
      .get(`/api/admin/customers/${custId}/orders`)
      .set('x-csrf-token', csrfAfter)
      .expect(200);

    expect(ordersRes.body.orders.length).toBe(1);
    expect(ordersRes.body.orders[0].orderNumber).toBe('ORD-2026-RH1');

    // 3. Update customer details
    await superAgent
      .put(`/api/admin/customers/${custId}`)
      .set('x-csrf-token', csrfAfter)
      .send({
        name: 'Rohan V. Sharma',
        phone: '9876543211',
        tier: 'Royal Circle VIP',
        isActive: true,
        internalNotes: 'Prefers shade-cured walnuts only.',
      })
      .expect(200);

    const updatedCust = await instance.db.models.Customer.findOne({ id: custId }).lean();
    expect(updatedCust?.name).toBe('Rohan V. Sharma');
    expect(updatedCust?.tier).toBe('Royal Circle VIP');

    // 4. Delete customer account permanently
    const deleteRes = await superAgent
      .delete(`/api/admin/customers/${custId}`)
      .set('x-csrf-token', csrfAfter)
      .expect(200);

    expect(deleteRes.body.message).toContain('permanently deleted');

    const deletedDoc = await instance.db.models.Customer.findOne({ id: custId }).lean();
    expect(deletedDoc).toBeNull();
    const deletedAddr = await instance.db.models.CustomerAddress.findOne({ customerId: custId }).lean();
    expect(deletedAddr).toBeNull();
    expect(spyMedia.deleted).toContain('https://res.cloudinary.com/asulesh-test/image/upload/v1/avatar.png');
  });

  it('calculates frequent buyers stats and repeat purchase metrics accurately', async () => {
    const { agent: superAgent, csrf } = await getAgentWithCsrf(instance.app);
    const loginRes = await loginAdminViaOtp(superAgent, csrf, spyTransport.sent);
    expect(loginRes.status).toBe(200);
    const csrfAfter = extractCookieValue(loginRes.headers['set-cookie'], 'as_csrf') || csrf;

    const now = new Date().toISOString();
    const fbId = 'cust_fb_1';
    await instance.db.models.Customer.create({
      id: fbId,
      name: 'Priya Verma',
      email: 'priya.verma@example.com',
      role: 'customer',
      emailVerified: true,
      tier: 'VIP Patron',
      createdAt: now,
      updatedAt: now,
    });

    for (let i = 1; i <= 3; i++) {
      await instance.db.models.Order.create({
        id: `ord_fb_${i}`,
        orderNumber: `ORD-FB-${i}`,
        customerId: fbId,
        customerEmail: 'priya.verma@example.com',
        totalAmount: 3000,
        subtotal: 3000,
        status: 'delivered',
        deliveryAddress: {
          fullName: 'Priya Verma',
          mobileNumber: '9876543212',
          addressLine: '45 Gandhi Nagar',
          city: 'Jammu',
          state: 'Jammu & Kashmir',
          pincode: '180004',
        },
        customerSnapshot: {
          name: 'Priya Verma',
          email: 'priya.verma@example.com',
        },
        createdAt: now,
        updatedAt: now,
      });
    }

    const statsRes = await superAgent
      .get('/api/admin/customers/stats')
      .set('x-csrf-token', csrfAfter)
      .expect(200);

    expect(statsRes.body.frequentBuyersCount).toBeGreaterThanOrEqual(1);
    expect(statsRes.body.frequentBuyersRevenue).toBeGreaterThanOrEqual(9000);
    expect(statsRes.body.topFrequentBuyers.length).toBeGreaterThanOrEqual(1);
    expect(statsRes.body.topFrequentBuyers[0].name).toBe('Priya Verma');
    expect(statsRes.body.topFrequentBuyers[0].totalOrders).toBe(3);
  });

  it('generates targeted customer coupons and delivers email notifications', async () => {
    const { agent: superAgent, csrf } = await getAgentWithCsrf(instance.app);
    const loginRes = await loginAdminViaOtp(superAgent, csrf, spyTransport.sent);
    expect(loginRes.status).toBe(200);
    const csrfAfter = extractCookieValue(loginRes.headers['set-cookie'], 'as_csrf') || csrf;

    const now = new Date().toISOString();
    const patronId = 'cust_targeted_coupon';
    await instance.db.models.Customer.create({
      id: patronId,
      name: 'Aditya Khanna',
      email: 'aditya.khanna@example.com',
      role: 'customer',
      emailVerified: true,
      createdAt: now,
      updatedAt: now,
    });

    // Admin creates custom coupon for Aditya
    const couponRes = await superAgent
      .post(`/api/admin/customers/${patronId}/coupon`)
      .set('x-csrf-token', csrfAfter)
      .send({
        code: 'ADITYA-SPECIAL-20',
        title: 'Special 20% for Aditya',
        discountType: 'percentage',
        discountValue: 20,
        minOrderValue: 2000,
        usageLimit: 1,
        sendEmail: true,
      })
      .expect(200);

    expect(couponRes.body.coupon.code).toBe('ADITYA-SPECIAL-20');
    expect(couponRes.body.coupon.targetCustomerId).toBe(patronId);

    // Verify targeted coupon email sent
    const couponMail = spyTransport.sent.find(m => m.to === 'aditya.khanna@example.com');
    expect(couponMail).toBeDefined();
    expect(couponMail?.subject).toContain('ADITYA-SPECIAL-20');
  });

  it('delivers individual and mass broadcast emails from the admin portal', async () => {
    const { agent: superAgent, csrf } = await getAgentWithCsrf(instance.app);
    const loginRes = await loginAdminViaOtp(superAgent, csrf, spyTransport.sent);
    expect(loginRes.status).toBe(200);
    const csrfAfter = extractCookieValue(loginRes.headers['set-cookie'], 'as_csrf') || csrf;

    const now = new Date().toISOString();
    const cust1 = 'cust_mail_1';
    await instance.db.models.Customer.create({
      id: cust1,
      name: 'Sunita Mehra',
      email: 'sunita.mehra@example.com',
      role: 'customer',
      emailVerified: true,
      createdAt: now,
      updatedAt: now,
    });

    // 1. Send Individual Email
    await superAgent
      .post(`/api/admin/customers/${cust1}/send-email`)
      .set('x-csrf-token', csrfAfter)
      .send({
        subject: 'Bespoke Reserve Gift Box Notification',
        message: 'Dear Sunita,\nYour custom wooden gift box has been shade-cured and is ready for dispatch.',
        ctaText: 'View Your Order Tracking',
        ctaUrl: '/track',
      })
      .expect(200);

    const indMail = spyTransport.sent.find(m => m.to === 'sunita.mehra@example.com');
    expect(indMail).toBeDefined();
    expect(indMail?.subject).toBe('Bespoke Reserve Gift Box Notification');

    // 2. Send Mass Email
    await superAgent
      .post('/api/admin/customers/mass-email')
      .set('x-csrf-token', csrfAfter)
      .send({
        segment: 'all',
        subject: 'Festival Harvest Reserve Opening',
        message: 'Announcing our fresh harvest of Mamra Almonds and Organic Walnut Kernels.',
        ctaText: 'Explore Harvest',
        ctaUrl: '/catalog',
      })
      .expect(200);

    expect(spyTransport.sent.length).toBeGreaterThanOrEqual(2);
  });

  it('sends 48-hour verification reminder blast and purges unverified accounts older than 48 hours', async () => {
    const { agent: superAgent, csrf } = await getAgentWithCsrf(instance.app);
    const loginRes = await loginAdminViaOtp(superAgent, csrf, spyTransport.sent);
    expect(loginRes.status).toBe(200);
    const csrfAfter = extractCookieValue(loginRes.headers['set-cookie'], 'as_csrf') || csrf;

    // 1. Fresh unverified account (< 48h old)
    const freshNow = new Date().toISOString();
    await instance.db.models.Customer.create({
      id: 'cust_unverified_fresh',
      name: 'Fresh Unverified',
      email: 'fresh.unverified@example.com',
      role: 'customer',
      emailVerified: false,
      createdAt: freshNow,
      updatedAt: freshNow,
    });

    // 2. Expired unverified account (3 days / 72 hours old)
    const threeDaysAgo = new Date(Date.now() - 72 * 3600_000).toISOString();
    await instance.db.models.Customer.create({
      id: 'cust_unverified_expired',
      name: 'Expired Unverified',
      email: 'expired.unverified@example.com',
      role: 'customer',
      emailVerified: false,
      profilePicture: 'https://res.cloudinary.com/asulesh-test/image/upload/v1/expired_avatar.png',
      createdAt: threeDaysAgo,
      updatedAt: threeDaysAgo,
    });

    await instance.db.models.CustomerAddress.create({
      id: 'addr_expired_unverified',
      customerId: 'cust_unverified_expired',
      label: 'Home',
      fullName: 'Expired Unverified',
      phone: '9999999999',
      addressLine: 'Old Lane',
      city: 'Jammu',
      state: 'J&K',
      pincode: '180001',
      createdAt: threeDaysAgo,
      updatedAt: threeDaysAgo,
    });

    // 3. Send 48h Reminder Blast
    const remindRes = await superAgent
      .post('/api/admin/customers/unverified/remind')
      .set('x-csrf-token', csrfAfter)
      .expect(200);

    expect(remindRes.body.remindedCount).toBeGreaterThanOrEqual(2);
    const reminderEmail = spyTransport.sent.find(e => e.to === 'fresh.unverified@example.com');
    expect(reminderEmail).toBeDefined();
    expect(reminderEmail?.subject).toContain('Verify Your Seth And Sons DryFruits Account within 48 Hours');

    // Check stats shows 1 eligible for purge
    const statsRes = await superAgent
      .get('/api/admin/customers/stats')
      .set('x-csrf-token', csrfAfter)
      .expect(200);

    expect(statsRes.body.unverifiedEligibleForPurge).toBeGreaterThanOrEqual(1);

    // 4. Single-click Purge of Expired Unverified Accounts (> 48h)
    const purgeRes = await superAgent
      .post('/api/admin/customers/unverified/purge')
      .set('x-csrf-token', csrfAfter)
      .expect(200);

    expect(purgeRes.body.purgedCount).toBeGreaterThanOrEqual(1);

    // Expired account deleted
    const expiredDoc = await instance.db.models.Customer.findOne({ id: 'cust_unverified_expired' }).lean();
    expect(expiredDoc).toBeNull();
    const expiredAddr = await instance.db.models.CustomerAddress.findOne({ customerId: 'cust_unverified_expired' }).lean();
    expect(expiredAddr).toBeNull();
    expect(spyMedia.deleted).toContain('https://res.cloudinary.com/asulesh-test/image/upload/v1/expired_avatar.png');

    // Fresh unverified account preserved
    const freshDoc = await instance.db.models.Customer.findOne({ id: 'cust_unverified_fresh' }).lean();
    expect(freshDoc).not.toBeNull();
  });
});
