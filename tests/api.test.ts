import crypto from 'node:crypto';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp, type AppInstance } from '../server/app.ts';
import { clearRateLimitStore } from '../server/middleware/security.ts';
import { type MediaStorageService } from '../server/services/cloudinaryService.ts';
import { type EmailTransport, type OutboundEmailPayload } from '../server/services/emailProvider.ts';

function createSpyMediaStorage(): MediaStorageService & {
  uploaded: Array<{ folder: string; filename: string; url: string }>;
} {
  const uploaded: Array<{ folder: string; filename: string; url: string }> = [];
  const stored = new Map<string, { buffer: Buffer; contentType: string }>();
  return {
    uploaded,
    isConfigured: () => true,
    async uploadBuffer(params) {
      const extMatch = (params.filename || '').toLowerCase().match(/\.([a-z0-9]{1,8})$/);
      const ext = extMatch ? extMatch[1] : 'png';
      const rType = params.resourceType === 'raw' ? 'raw' : 'image';
      const publicId = `${params.folder}/asset_${uploaded.length + 1}${rType === 'raw' ? `.${ext}` : ''}`;
      const url =
        rType === 'raw'
          ? `https://res.cloudinary.com/asulesh-test/raw/upload/v1/${publicId}`
          : `https://res.cloudinary.com/asulesh-test/image/upload/v1/${publicId}.${ext}`;
      uploaded.push({ folder: params.folder, filename: params.filename, url });
      stored.set(url, {
        buffer: Buffer.from(params.buffer),
        contentType: params.mimeType || 'application/octet-stream',
      });
      return { url, publicId, format: ext, bytes: params.buffer.length };
    },
    isAllowedMediaUrl(rawUrl) {
      return rawUrl.startsWith('https://res.cloudinary.com/asulesh-test/');
    },
    async downloadAsset(opts) {
      const hit = stored.get(opts.url);
      if (hit) return hit;
      const err = new Error('Asset not found in spy storage') as Error & { statusCode?: number };
      err.statusCode = 404;
      throw err;
    },
  };
}

interface CapturedEmail extends OutboundEmailPayload {
  messageId: string;
}

function createSpyTransport(options?: { failNext?: boolean; failCount?: number }): EmailTransport & { sent: CapturedEmail[] } {
  const sent: CapturedEmail[] = [];
  let failRemaining = options?.failCount ?? (options?.failNext ? 1 : 0);

  return {
    sent,
    async send(payload) {
      if (failRemaining > 0) {
        failRemaining -= 1;
        throw new Error('Simulated transient SMTP outage');
      }
      const messageId = `<msg-${sent.length + 1}@test.asuleshseth.com>`;
      sent.push({ ...payload, messageId });
      return {
        provider: 'spy-smtp',
        messageId,
      };
    },
    getSummary() {
      return {
        provider: 'smtp',
        mode: 'spy-smtp-test',
        configured: true,
        fromEmail: 'aseth9588@gmail.com',
        hostHint: 'test.smtp:587',
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

async function getCsrfAgent(app: AppInstance['app']) {
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
    .set('X-CSRF-Token', csrf)
    .send({ email });
  expect(reqRes.status).toBe(200);
  const otpMail = [...sent]
    .reverse()
    .find(m => m.to === email && m.subject.includes('Admin Portal Login OTP'));
  expect(otpMail).toBeTruthy();
  const otpCode = otpMail!.text.match(/\b(\d{6})\b/)?.[1];
  expect(otpCode).toBeTruthy();
  return agent
    .post('/api/auth/admin-otp/verify')
    .set('X-CSRF-Token', csrf)
    .send({ email, otp: otpCode, rememberMe: true });
}

describe('Seth And Sons DryFruits — Auth, Orders, Dispatch & Automated Email System', () => {
  let mongod: MongoMemoryServer;
  let dbCounter = 0;
  let instance: AppInstance;
  let spyTransport: ReturnType<typeof createSpyTransport>;
  let spyMedia: ReturnType<typeof createSpyMediaStorage>;

  beforeAll(async () => {
    mongod = await MongoMemoryServer.create();
  }, 60_000);

  afterAll(async () => {
    await mongod?.stop();
  });

  beforeEach(async () => {
    clearRateLimitStore();
    spyTransport = createSpyTransport();
    spyMedia = createSpyMediaStorage();
    const baseUri = mongod.getUri();
    instance = await createApp({
      config: {
        mongodbUri: `${baseUri}api_test_${++dbCounter}`,
        nodeEnv: 'test',
        isProduction: false,
        emailWebhookSecret: 'test-webhook-secret',
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

  it('registers customer, detects duplicates, enforces verification before checkout, and completes verification + welcome email', async () => {
    const { agent, csrf } = await getCsrfAgent(instance.app);

    // Rejects weak password
    const weakRes = await agent
      .post('/api/auth/register')
      .set('X-CSRF-Token', csrf)
      .send({
        fullName: 'Rohan Sharma',
        email: 'rohan@example.com',
        mobileNumber: '9876501234',
        password: 'weak',
        confirmPassword: 'weak',
        acceptTerms: true,
      });
    expect(weakRes.status).toBe(400);

    // Valid registration
    const regRes = await agent
      .post('/api/auth/register')
      .set('X-CSRF-Token', csrf)
      .send({
        fullName: 'Rohan Sharma',
        email: 'rohan@example.com',
        mobileNumber: '9876501234',
        password: 'RoyalPassword@99',
        confirmPassword: 'RoyalPassword@99',
        houseFlat: 'Flat 402, Krishna Tower',
        streetArea: 'Ring Road, Vesu',
        city: 'Surat',
        state: 'Gujarat',
        pincode: '395007',
        country: 'India',
        acceptTerms: true,
        marketingConsent: true,
      });
    expect(regRes.status).toBe(201);
    expect(regRes.body.user.emailVerified).toBe(false);
    expect(regRes.body.user.profitMargin).toBe(25);
    expect(regRes.body.user.shippingFee).toBe(0);

    // Verification email was sent with branded emerald-gold HTML & plain text
    expect(spyTransport.sent.length).toBe(1);
    const verifyMail = spyTransport.sent[0];
    expect(verifyMail.to).toBe('rohan@example.com');
    expect(verifyMail.html).toContain('#064e3b');
    expect(verifyMail.html).toContain('#dfc471');
    const tokenMatch = verifyMail.text.match(/verify-email\?token=([a-f0-9]+)/);
    expect(tokenMatch?.[1]).toBeTruthy();
    const rawVerifyToken = tokenMatch![1];

    // Duplicate email & mobile detection
    const dupEmailRes = await agent
      .post('/api/auth/register')
      .set('X-CSRF-Token', csrf)
      .send({
        fullName: 'Rohan Clone',
        email: 'rohan@example.com',
        mobileNumber: '9876599999',
        password: 'RoyalPassword@99',
        confirmPassword: 'RoyalPassword@99',
        houseFlat: 'Flat 101',
        streetArea: 'Main St',
        city: 'Mumbai',
        state: 'Maharashtra',
        pincode: '400001',
        country: 'India',
        acceptTerms: true,
      });
    expect(dupEmailRes.status).toBe(409);

    const dupPhoneRes = await agent
      .post('/api/auth/register')
      .set('X-CSRF-Token', csrf)
      .send({
        fullName: 'Rohan Clone 2',
        email: 'rohan2@example.com',
        mobileNumber: '9876501234',
        password: 'RoyalPassword@99',
        confirmPassword: 'RoyalPassword@99',
        houseFlat: 'Flat 102',
        streetArea: 'Main St',
        city: 'Mumbai',
        state: 'Maharashtra',
        pincode: '400001',
        country: 'India',
        acceptTerms: true,
      });
    expect(dupPhoneRes.status).toBe(409);

    // Unverified customer CANNOT complete checkout
    const blockedCheckout = await agent
      .post('/api/orders')
      .set('X-CSRF-Token', csrf)
      .send({
        items: [{ productId: 'kaju', quantity: 1 }],
        deliveryAddress: {
          fullName: 'Rohan Sharma',
          mobileNumber: '9876501234',
          deliveryAddress: '12 Residency Road',
          city: 'Jammu',
          state: 'Jammu & Kashmir',
          pincode: '180001',
        },
      });
    expect(blockedCheckout.status).toBe(403);
    expect(blockedCheckout.body.code).toBe('EMAIL_NOT_VERIFIED');

    // Resend cooldown enforced for authenticated owner
    const resendCooldown = await agent
      .post('/api/auth/resend-verification')
      .set('X-CSRF-Token', csrf)
      .send({ email: 'rohan@example.com' });
    expect(resendCooldown.status).toBe(429);

    // Anti-enumeration on unknown email resend
    const unknownResend = await agent
      .post('/api/auth/resend-verification')
      .set('X-CSRF-Token', csrf)
      .send({ email: 'nobody-does-not-exist@example.com' });
    expect(unknownResend.status).toBe(200);

    // Verify email using single-use token
    const verifyRes = await agent
      .post('/api/auth/verify-email')
      .set('X-CSRF-Token', csrf)
      .send({ token: rawVerifyToken });
    expect(verifyRes.status).toBe(200);
    expect(verifyRes.body.user.emailVerified).toBe(true);

    // Welcome email sent upon verification
    expect(spyTransport.sent.some(m => m.subject.includes('Welcome to Seth And Sons'))).toBe(true);

    // Single-use & duplicate verification prevention
    const replayVerify = await agent
      .post('/api/auth/verify-email')
      .set('X-CSRF-Token', csrf)
      .send({ token: rawVerifyToken });
    expect(replayVerify.status).toBe(400);

    // Verified customer CAN now complete checkout
    const orderRes = await agent
      .post('/api/orders')
      .set('X-CSRF-Token', csrf)
      .send({
        items: [{ productId: 'kaju', quantity: 2 }],
        couponCode: 'JAMMU10',
        deliveryAddress: {
          fullName: 'Rohan Sharma',
          mobileNumber: '9876501234',
          deliveryAddress: '12 Residency Road',
          city: 'Jammu',
          state: 'Jammu & Kashmir',
          pincode: '180001',
        },
      });
    expect(orderRes.status).toBe(201);
    expect(orderRes.body.order.orderNumber).toMatch(/^AS-ORD-/);
    expect(orderRes.body.order.discountAmount).toBe(274); // 10% of 2744 (2kg kaju @ 1372 with 40% margin)
    expect(
      spyTransport.sent.some(
        m => m.subject === 'Your Order Has Been Received! – Seth And Sons DryFruits'
      )
    ).toBe(true);
  });

  it('prevents customer access to admin routes, enforces CSRF, and invalidates sessions on password reset', async () => {
    const { agent, csrf } = await getCsrfAgent(instance.app);

    await agent
      .post('/api/auth/register')
      .set('X-CSRF-Token', csrf)
      .send({
        fullName: 'Meera Kapoor',
        email: 'meera@example.com',
        mobileNumber: '9811122233',
        password: 'StrongPassword@1',
        confirmPassword: 'StrongPassword@1',
        houseFlat: 'Flat 502',
        streetArea: 'Civil Lines',
        city: 'Surat',
        state: 'Gujarat',
        pincode: '395007',
        country: 'India',
        acceptTerms: true,
      });

    // Missing CSRF rejected
    const noCsrf = await agent.post('/api/account/addresses').send({ label: 'Home' });
    expect(noCsrf.status).toBe(403);

    // Customer cannot access admin routes
    const adminOrdersAttempt = await agent.get('/api/admin/orders');
    expect(adminOrdersAttempt.status).toBe(403);

    // Customer cannot login via admin portal (password login disabled + OTP strictly for admin role)
    const adminPortalAttempt = await agent
      .post('/api/auth/admin-login')
      .set('X-CSRF-Token', csrf)
      .send({ email: 'meera@example.com', password: 'StrongPassword@1' });
    expect(adminPortalAttempt.status).toBe(403);

    // Admin password login disabled on both login endpoints
    const adminPwPortalAttempt = await agent
      .post('/api/auth/admin-login')
      .set('X-CSRF-Token', csrf)
      .send({ email: 'aseth9588@gmail.com', password: 'RoyalAdmin@2026!' });
    expect(adminPwPortalAttempt.status).toBe(403);

    const adminCustomerLoginAttempt = await agent
      .post('/api/auth/login')
      .set('X-CSRF-Token', csrf)
      .send({ email: 'aseth9588@gmail.com', password: 'RoyalAdmin@2026!' });
    expect(adminCustomerLoginAttempt.status).toBe(403);

    // Forgot password returns generic 200 even for non-existent emails
    const unknownForgot = await agent
      .post('/api/auth/forgot-password')
      .set('X-CSRF-Token', csrf)
      .send({ email: 'nonexistent@example.com' });
    expect(unknownForgot.status).toBe(200);

    // Forgot password for Meera
    const forgotRes = await agent
      .post('/api/auth/forgot-password')
      .set('X-CSRF-Token', csrf)
      .send({ email: 'meera@example.com' });
    expect(forgotRes.status).toBe(200);

    const resetMail = spyTransport.sent.find(m => m.subject.includes('Reset Your Password'));
    expect(resetMail).toBeTruthy();
    const resetToken = resetMail!.text.match(/reset-password\?token=([a-f0-9]+)/)![1];

    // Confirm Meera is currently logged in
    const meBefore = await agent.get('/api/auth/me');
    expect(meBefore.body.user?.email).toBe('meera@example.com');

    // Reset password using single-use token
    const resetRes = await agent
      .post('/api/auth/reset-password')
      .set('X-CSRF-Token', csrf)
      .send({
        token: resetToken,
        password: 'NewRoyalPassword@2',
        confirmPassword: 'NewRoyalPassword@2',
      });
    expect(resetRes.status).toBe(200);

    // Existing sessions were invalidated
    const meAfter = await agent.get('/api/auth/me');
    expect(meAfter.body.user).toBeNull();

    // Replay reset token fails
    const replayReset = await agent
      .post('/api/auth/reset-password')
      .set('X-CSRF-Token', csrf)
      .send({
        token: resetToken,
        password: 'AnotherPassword@3',
        confirmPassword: 'AnotherPassword@3',
      });
    expect(replayReset.status).toBe(400);
  });

  it('executes full admin order lifecycle (confirm, dispatch with tracking, out for delivery, deliver, refund) and enforces owner-only tracking', async () => {
    const cust = await getCsrfAgent(instance.app);
    await cust.agent
      .post('/api/auth/login')
      .set('X-CSRF-Token', cust.csrf)
      .send({ email: 'vikram.seth@heritage.in', password: 'Patron@2026!' });

    // Place fresh order
    const ordRes = await cust.agent
      .post('/api/orders')
      .set('X-CSRF-Token', cust.csrf)
      .send({
        items: [{ productId: 'badam', quantity: 2 }],
        deliveryAddress: {
          fullName: 'Vikramaditya Seth',
          mobileNumber: '9812345678',
          deliveryAddress: '24/B Heritage Enclave',
          city: 'Jammu',
          state: 'Jammu & Kashmir',
          pincode: '180001',
        },
      });
    expect(ordRes.status).toBe(201);
    const orderNumber = ordRes.body.order.orderNumber;

    // Another customer CANNOT track Vikram's order
    const intruder = await getCsrfAgent(instance.app);
    await intruder.agent
      .post('/api/auth/register')
      .set('X-CSRF-Token', intruder.csrf)
      .send({
        fullName: 'Other User',
        email: 'other@example.com',
        mobileNumber: '9800011122',
        password: 'OtherPassword@1',
        confirmPassword: 'OtherPassword@1',
        houseFlat: 'Flat 101',
        streetArea: 'Sector 5',
        city: 'Surat',
        state: 'Gujarat',
        pincode: '395007',
        country: 'India',
        acceptTerms: true,
      });
    const forbiddenTrack = await intruder.agent.get(`/api/orders/${orderNumber}`);
    expect(forbiddenTrack.status).toBe(403);

    // Admin signs in via passwordless Email OTP (aseth9588@gmail.com)
    const admin = await getCsrfAgent(instance.app);
    const adminLogin = await loginAdminViaOtp(admin.agent, admin.csrf, spyTransport.sent, 'aseth9588@gmail.com');
    expect(adminLogin.status).toBe(200);
    expect(adminLogin.body.user?.email).toBe('aseth9588@gmail.com');

    // 1. Confirm order
    const confRes = await admin.agent
      .post(`/api/admin/orders/${orderNumber}/confirm`)
      .set('X-CSRF-Token', admin.csrf)
      .send({});
    expect(confRes.status).toBe(200);
    expect(
      spyTransport.sent.some(m => m.subject === `Your Order Is Confirmed! – Order #${orderNumber}`)
    ).toBe(true);

    // 2. Dispatch requires valid courier & tracking URL
    const badDispatch = await admin.agent
      .post(`/api/admin/orders/${orderNumber}/dispatch`)
      .set('X-CSRF-Token', admin.csrf)
      .send({
        courierPartner: 'Blue Dart',
        trackingNumber: 'BD123456789',
        trackingUrl: 'not-a-valid-url',
        dispatchDate: '2026-11-11',
      });
    expect(badDispatch.status).toBe(400);

    const dispatchRes = await admin.agent
      .post(`/api/admin/orders/${orderNumber}/dispatch`)
      .set('X-CSRF-Token', admin.csrf)
      .send({
        courierPartner: 'Blue Dart',
        trackingNumber: 'BD123456789',
        trackingUrl: 'https://www.bluedart.com/tracking?awb=BD123456789',
        dispatchDate: '2026-11-11',
        estimatedDeliveryDate: '2026-11-14',
        shipmentNotes: 'Insulated packaging',
      });
    expect(dispatchRes.status).toBe(200);
    expect(dispatchRes.body.emailDeliveryLog.status).toBe('sent');
    expect(
      spyTransport.sent.some(m => m.subject === `Your Order Is On Its Way! – Order #${orderNumber}`)
    ).toBe(true);

    // Customer sees tracking details on /api/orders/:orderNumber
    const trackRes = await cust.agent.get(`/api/orders/${orderNumber}`);
    expect(trackRes.status).toBe(200);
    expect(trackRes.body.order.shipment.trackingNumber).toBe('BD123456789');

    // 3. Out for delivery & Delivered
    await admin.agent
      .post(`/api/admin/orders/${orderNumber}/status`)
      .set('X-CSRF-Token', admin.csrf)
      .send({ status: 'out_for_delivery' });
    await admin.agent
      .post(`/api/admin/orders/${orderNumber}/status`)
      .set('X-CSRF-Token', admin.csrf)
      .send({ status: 'delivered' });

    expect(
      spyTransport.sent.some(
        m => m.subject === 'Your Order Has Been Delivered! – Seth And Sons DryFruits'
      )
    ).toBe(true);

    // 4. Unverified refund rejected; verified refund sends refund email
    const unverifiedRefund = await admin.agent
      .post(`/api/admin/orders/${orderNumber}/refund`)
      .set('X-CSRF-Token', admin.csrf)
      .send({
        verified: false,
        refundAmount: 500,
        refundReferenceId: 'RFND-001',
        paymentMethod: 'UPI',
      });
    expect(unverifiedRefund.status).toBe(400);

    const verifiedRefund = await admin.agent
      .post(`/api/admin/orders/${orderNumber}/refund`)
      .set('X-CSRF-Token', admin.csrf)
      .send({
        verified: true,
        refundAmount: 500,
        refundReferenceId: 'RFND-001',
        paymentMethod: 'UPI',
        refundBankEta: '3-5 business days',
      });
    expect(verifiedRefund.status).toBe(200);
    expect(
      spyTransport.sent.some(m => m.subject.includes(`Your Refund Has Been Processed – Order #${orderNumber}`))
    ).toBe(true);
  });

  it('sanitizes admin email templates, supports marketing segmentation, scheduling/cancellation, one-click unsubscribe, and signed webhook suppression', async () => {
    const admin = await getCsrfAgent(instance.app);
    const adminLogin = await loginAdminViaOtp(admin.agent, admin.csrf, spyTransport.sent, 'aseth9588@gmail.com');
    expect(adminLogin.status).toBe(200);

    // All 21 templates seeded (customer & admin transactional + marketing)
    const tplRes = await admin.agent.get('/api/admin/communications/templates');
    expect(tplRes.status).toBe(200);
    expect(tplRes.body.templates.length).toBe(21);

    // Script injection stripped from edited template
    const editRes = await admin.agent
      .put('/api/admin/communications/templates/welcome')
      .set('X-CSRF-Token', admin.csrf)
      .send({
        htmlContent: `<p>Hello {{customer_name}}</p><script>alert('xss')</script><a href="javascript:evil()">Click</a>`,
      });
    expect(editRes.status).toBe(200);
    expect(editRes.body.template.htmlContent).not.toContain('<script');
    expect(editRes.body.template.htmlContent).not.toContain('javascript:');

    // Product creation with publish_only triggers ZERO emails
    const beforeProdCount = spyTransport.sent.length;
    const prodRes = await admin.agent
      .post('/api/admin/products')
      .set('X-CSRF-Token', admin.csrf)
      .send({
        name: 'Kishtwar Pine Nuts (Chilgoza)',
        price: 3800,
        unit: 'kg',
        category: 'nuts',
        description: 'Hand-roasted Himalayan pine nuts.',
        publishAction: 'publish_only',
      });
    expect(prodRes.status).toBe(201);
    expect(spyTransport.sent.length).toBe(beforeProdCount);

    // Festival campaign creation, scheduling, and cancellation before execution
    const campRes = await admin.agent
      .post('/api/admin/marketing/campaigns')
      .set('X-CSRF-Token', admin.csrf)
      .send({
        campaignName: 'Diwali Saffron Gala',
        campaignType: 'festival',
        festivalName: 'Diwali',
        subject: 'Celebrate Diwali with Premium Dry Fruits – Special Festive Offers Inside!',
        content: '<p>Enjoy 15% off festive dry fruits.</p>',
        discountPercentage: 15,
        couponCode: 'DIWALI15',
        targetSegment: 'all_opted_in',
      });
    expect(campRes.status).toBe(201);
    const campId = campRes.body.campaign.id;

    // Schedule for future & cancel before execution
    const futureIso = new Date(Date.now() + 3600_000).toISOString();
    const schedRes = await admin.agent
      .post(`/api/admin/marketing/campaigns/${campId}/schedule`)
      .set('X-CSRF-Token', admin.csrf)
      .send({ scheduledAt: futureIso });
    expect(schedRes.status).toBe(200);

    const cancelCampRes = await admin.agent
      .post(`/api/admin/marketing/campaigns/${campId}/cancel`)
      .set('X-CSRF-Token', admin.csrf)
      .send({});
    expect(cancelCampRes.status).toBe(200);
    expect(cancelCampRes.body.campaign.status).toBe('cancelled');

    // Create & immediately send new festival campaign (requires confirmed: true)
    const camp2 = await admin.agent
      .post('/api/admin/marketing/campaigns')
      .set('X-CSRF-Token', admin.csrf)
      .send({
        campaignName: 'Holi Royal Reserve',
        campaignType: 'festival',
        festivalName: 'Holi',
        subject: 'Celebrate Holi with Jammu Dry Fruits',
        content: '<p>Pure dry fruit hampers.</p>',
        targetSegment: 'all_opted_in',
      });
    const camp2Id = camp2.body.campaign.id;

    const unconfirmedSend = await admin.agent
      .post(`/api/admin/marketing/campaigns/${camp2Id}/send`)
      .set('X-CSRF-Token', admin.csrf)
      .send({});
    expect(unconfirmedSend.status).toBe(400);

    const confirmedSend = await admin.agent
      .post(`/api/admin/marketing/campaigns/${camp2Id}/send`)
      .set('X-CSRF-Token', admin.csrf)
      .send({ confirmed: true });
    expect(confirmedSend.status).toBe(200);

    const mktEmail = spyTransport.sent.find(m => m.subject.includes('Celebrate Holi'));
    expect(mktEmail).toBeTruthy();
    const unsubToken = mktEmail!.html.match(/unsubscribe\?token=([a-f0-9]+)/)?.[1];
    expect(unsubToken).toBeTruthy();

    // One-click unsubscribe removes marketing consent
    const unsubRes = await request(instance.app)
      .post('/api/unsubscribe')
      .send({ token: unsubToken });
    expect(unsubRes.status).toBe(200);

    const segsAfterUnsub = await admin.agent.get('/api/admin/marketing/segments');
    const optedInSeg = segsAfterUnsub.body.segments.find((s: any) => s.id === 'all_opted_in');
    expect(optedInSeg.count).toBe(0);

    // Signed webhook marks bounce & suppresses future emails to that address
    const bouncePayload = JSON.stringify({
      event: 'bounced',
      messageId: mktEmail!.messageId,
      recipient: 'vikram.seth@heritage.in',
      reason: '550 User unknown',
    });
    const badWebhook = await request(instance.app)
      .post('/api/webhooks/email')
      .set('Content-Type', 'application/json')
      .set('X-Webhook-Signature', 'invalid-sig')
      .send(bouncePayload);
    expect(badWebhook.status).toBe(401);

    const validSig = crypto
      .createHmac('sha256', 'test-webhook-secret')
      .update(bouncePayload)
      .digest('hex');

    const goodWebhook = await request(instance.app)
      .post('/api/webhooks/email')
      .set('Content-Type', 'application/json')
      .set('X-Webhook-Signature', validSig)
      .send(bouncePayload);
    expect(goodWebhook.status).toBe(200);

    const supRes = await admin.agent.get('/api/admin/communications/suppressions');
    expect(supRes.body.suppressions.some((s: any) => s.email === 'vikram.seth@heritage.in')).toBe(true);
  });

  it('persists order even when email transport fails transiently and retries via queue', async () => {
    await instance.close();
    clearRateLimitStore();

    const flakyTransport = createSpyTransport({ failCount: 2 });
    instance = await createApp({
      config: {
        mongodbUri: `${mongod.getUri()}api_test_${++dbCounter}`,
        nodeEnv: 'test',
        isProduction: false,
      },
      emailTransport: flakyTransport,
      mediaStorage: spyMedia,
      startQueueWorker: false,
    });

    const cust = await getCsrfAgent(instance.app);
    await cust.agent
      .post('/api/auth/login')
      .set('X-CSRF-Token', cust.csrf)
      .send({ email: 'vikram.seth@heritage.in', password: 'Patron@2026!' });

    // Avatar upload goes to Cloudinary and persists avatarUrl on Customer
    const png1x1 = Buffer.from(
      '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c63000100000500010d0a2db40000000049454e44ae426082',
      'hex'
    );
    const avatarRes = await cust.agent
      .post('/api/account/avatar')
      .set('X-CSRF-Token', cust.csrf)
      .attach('avatar', png1x1, { filename: 'patron.png', contentType: 'image/png' });
    expect(avatarRes.status).toBe(200);
    expect(avatarRes.body.profilePicture).toMatch(/^https:\/\/res\.cloudinary\.com\//);
    expect(spyMedia.uploaded.some(u => u.folder === 'avatars')).toBe(true);

    // Order succeeds despite first email transport attempt throwing
    const ordRes = await cust.agent
      .post('/api/orders')
      .set('X-CSRF-Token', cust.csrf)
      .send({
        items: [{ productId: 'kaju', quantity: 1 }],
        deliveryAddress: {
          fullName: 'Vikramaditya Seth',
          mobileNumber: '9812345678',
          deliveryAddress: '24/B Heritage Enclave',
          city: 'Jammu',
          state: 'Jammu & Kashmir',
          pincode: '180001',
        },
      });
    expect(ordRes.status).toBe(201);
    expect(flakyTransport.sent.length).toBe(0);

    // Retry job recovers delivery
    const jobRow = await instance.db.models.EmailJob.findOne({ status: 'pending' }).lean();
    expect(jobRow?.id).toBeTruthy();
    await instance.queue.retryJob(jobRow!.id);
    expect(flakyTransport.sent.length).toBe(1);
  }, 30_000);

  it('drains unauthenticated multipart avatar upload cleanly with 401 and isolates storefront vs admin portal sessions', async () => {
    const sharedAgent = request.agent(instance.app);
    const csrfRes = await sharedAgent.get('/api/auth/me');
    const csrf = extractCookieValue(csrfRes.headers['set-cookie'], 'as_csrf');

    // Unauthenticated large multipart upload to /api/account/avatar receives clean 401 JSON (no ECONNRESET)
    const bigPng = Buffer.alloc(128 * 1024, 0x41);
    const unauthAvatar = await sharedAgent
      .post('/api/account/avatar')
      .set('X-CSRF-Token', csrf)
      .set('X-Portal-Scope', 'storefront')
      .attach('avatar', bigPng, { filename: 'big.png', contentType: 'image/png' });
    expect(unauthAvatar.status).toBe(401);
    expect(unauthAvatar.body.error).toContain('Authentication required');

    // Log in customer on storefront scope -> sets as_session
    const custLogin = await sharedAgent
      .post('/api/auth/login')
      .set('X-CSRF-Token', csrf)
      .set('X-Portal-Scope', 'storefront')
      .send({ email: 'vikram.seth@heritage.in', password: 'Patron@2026!' });
    expect(custLogin.status).toBe(200);

    // Log in admin on admin scope -> sets as_admin_session WITHOUT clobbering as_session
    await sharedAgent
      .post('/api/auth/admin-otp/request')
      .set('X-CSRF-Token', csrf)
      .set('X-Portal-Scope', 'admin')
      .send({ email: 'aseth9588@gmail.com' });
    const otpCode = [...spyTransport.sent]
      .reverse()
      .find(m => m.to === 'aseth9588@gmail.com' && m.subject.includes('Admin Portal Login OTP'))!
      .text.match(/\b(\d{6})\b/)![1];
    const adminVerify = await sharedAgent
      .post('/api/auth/admin-otp/verify')
      .set('X-CSRF-Token', csrf)
      .set('X-Portal-Scope', 'admin')
      .send({ email: 'aseth9588@gmail.com', otp: otpCode });
    expect(adminVerify.status).toBe(200);

    // Storefront session stays customer even after admin login + admin logout
    const adminLogout = await sharedAgent
      .post('/api/auth/logout')
      .set('X-CSRF-Token', csrf)
      .set('X-Portal-Scope', 'admin')
      .send({});
    expect(adminLogout.status).toBe(200);

    const meStorefront = await sharedAgent.get('/api/auth/me').set('X-Portal-Scope', 'storefront');
    expect(meStorefront.body.user?.email).toBe('vikram.seth@heritage.in');

    const meAdminAfterLogout = await sharedAgent.get('/api/auth/me').set('X-Portal-Scope', 'admin');
    expect(meAdminAfterLogout.body.user).toBeNull();
  });

  it('uses configured AVIF logo across every customer and admin email template including welcome, forgot/changed password, reset email, admin welcome, admin OTP, and admin order alert', async () => {
    const EXPECTED_LOGO_URL =
      'https://res.cloudinary.com/n0b8m1qk/image/upload/v1794500281/asulesh-seth/branding/seth_and_sons_logo_emblem_3f4e8923.jpg';

    const admin = await getCsrfAgent(instance.app);
    const adminLogin = await loginAdminViaOtp(admin.agent, admin.csrf, spyTransport.sent, 'aseth9588@gmail.com');
    expect(adminLogin.status).toBe(200);

    // 1. Every seeded template preview includes the configured AVIF email logo URL
    const tplRes = await admin.agent.get('/api/admin/communications/templates');
    expect(tplRes.status).toBe(200);
    const keys: string[] = tplRes.body.templates.map((t: any) => t.templateKey);
    expect(keys).toEqual(
      expect.arrayContaining([
        'welcome',
        'email_verification',
        'email_change_verification',
        'password_reset',
        'password_changed',
        'admin_welcome',
        'admin_login_otp',
        'admin_order_alert',
        'customer_service_ack',
        'admin_support_alert',
      ])
    );

    for (const key of keys) {
      const prevRes = await admin.agent
        .post(`/api/admin/communications/templates/${key}/preview`)
        .set('X-CSRF-Token', admin.csrf)
        .send({});
      expect(prevRes.status).toBe(200);
      expect(prevRes.body.html).toContain(EXPECTED_LOGO_URL);
      expect(prevRes.body.html).not.toMatch(/\{\{[a-zA-Z0-9_]+\}\}/);
    }

    // 2. Creating admin staff triggers admin_welcome email with role, permissions, and logo
    const staffRes = await admin.agent
      .post('/api/admin/staff')
      .set('X-CSRF-Token', admin.csrf)
      .send({
        name: 'Meera Kapoor',
        email: 'meera.manager@asuleshseth.com',
        phone: '9811223344',
        adminRole: 'staff',
        permissions: ['dashboard', 'orders', 'communications'],
      });
    expect(staffRes.status).toBe(201);
    const adminWelcomeMail = spyTransport.sent.find(m => m.to === 'meera.manager@asuleshseth.com');
    expect(adminWelcomeMail).toBeTruthy();
    expect(adminWelcomeMail!.subject).toContain('Admin Portal');
    expect(adminWelcomeMail!.html).toContain(EXPECTED_LOGO_URL);
    expect(adminWelcomeMail!.html).toContain('Store Staff');
    expect(adminWelcomeMail!.html).toContain('dashboard, orders, communications');

    // 3. Customer email change uses email_change_verification template + logo
    const cust = await getCsrfAgent(instance.app);
    const loginRes = await cust.agent
      .post('/api/auth/login')
      .set('X-CSRF-Token', cust.csrf)
      .send({ email: 'vikram.seth@heritage.in', password: 'Patron@2026!' });
    expect(loginRes.status).toBe(200);

    const chgEmailRes = await cust.agent
      .post('/api/account/change-email')
      .set('X-CSRF-Token', cust.csrf)
      .send({ newEmail: 'vikram.updated@heritage.in', currentPassword: 'Patron@2026!' });
    expect(chgEmailRes.status).toBe(200);

    const emailChangeMail = spyTransport.sent.find(m => m.to === 'vikram.updated@heritage.in');
    expect(emailChangeMail).toBeTruthy();
    expect(emailChangeMail!.subject).toContain('Confirm Your New Email Address');
    expect(emailChangeMail!.html).toContain(EXPECTED_LOGO_URL);
    expect(emailChangeMail!.html).toContain('vikram.updated@heritage.in');

    // 4. Forgot password -> reset password sends templated password_reset + password_changed with logo
    const forgotRes = await cust.agent
      .post('/api/auth/forgot-password')
      .set('X-CSRF-Token', cust.csrf)
      .send({ email: 'vikram.seth@heritage.in' });
    expect(forgotRes.status).toBe(200);
    const resetMail = spyTransport.sent.find(
      m => m.to === 'vikram.seth@heritage.in' && m.subject.includes('Reset Your Password')
    );
    expect(resetMail).toBeTruthy();
    expect(resetMail!.html).toContain(EXPECTED_LOGO_URL);
    const resetToken = decodeURIComponent(resetMail!.text.match(/token=([^\s&]+)/)![1]);

    const doResetRes = await cust.agent
      .post('/api/auth/reset-password')
      .set('X-CSRF-Token', cust.csrf)
      .send({
        token: resetToken,
        password: 'NewPatron@2027!',
        confirmPassword: 'NewPatron@2027!',
      });
    expect(doResetRes.status).toBe(200);
    const pwChangedMail = spyTransport.sent.find(
      m => m.to === 'vikram.seth@heritage.in' && m.subject.includes('Password Changed')
    );
    expect(pwChangedMail).toBeTruthy();
    expect(pwChangedMail!.html).toContain(EXPECTED_LOGO_URL);

    // 5. Customer login + placing order sends order_placed (user) and admin_order_alert (admin), both with logo
    const reLoginRes = await cust.agent
      .post('/api/auth/login')
      .set('X-CSRF-Token', cust.csrf)
      .send({ email: 'vikram.seth@heritage.in', password: 'NewPatron@2027!' });
    expect(reLoginRes.status).toBe(200);

    const ordRes = await cust.agent
      .post('/api/orders')
      .set('X-CSRF-Token', cust.csrf)
      .send({
        items: [{ productId: 'kaju', quantity: 1 }],
        deliveryAddress: {
          fullName: 'Vikramaditya Seth',
          mobileNumber: '9812345678',
          deliveryAddress: '24/B Heritage Enclave',
          city: 'Jammu',
          state: 'Jammu & Kashmir',
          pincode: '180001',
        },
      });
    expect(ordRes.status).toBe(201);
    const orderNumber = ordRes.body.order.orderNumber;
    const adminOrderAlert = spyTransport.sent.find(
      m => m.to === 'aseth9588@gmail.com' && m.subject.includes(`New Order #${orderNumber}`)
    );
    expect(adminOrderAlert).toBeTruthy();
    expect(adminOrderAlert!.html).toContain(EXPECTED_LOGO_URL);

    // 6. Every single captured email sent during this flow embeds the configured AVIF logo URL
    for (const msg of spyTransport.sent) {
      expect(msg.html).toContain(EXPECTED_LOGO_URL);
    }
  });

  it('supports Customer Service submissions with images/PDFs within limits, admin review, and admin custom email reply', async () => {
    const EXPECTED_LOGO_URL =
      'https://res.cloudinary.com/n0b8m1qk/image/upload/v1794500281/asulesh-seth/branding/seth_and_sons_logo_emblem_3f4e8923.jpg';

    const { agent: custAgent, csrf: custCsrf } = await getCsrfAgent(instance.app);

    // 1. Check user & higher admin upload limits endpoint
    const limitsRes = await custAgent.get('/api/support/limits');
    expect(limitsRes.status).toBe(200);
    expect(limitsRes.body.user.maxFiles).toBe(5);
    expect(limitsRes.body.user.maxFileSizeBytes).toBe(5 * 1024 * 1024);
    expect(limitsRes.body.admin.maxFiles).toBe(15);
    expect(limitsRes.body.admin.maxFileSizeBytes).toBe(25 * 1024 * 1024);
    expect(limitsRes.body.admin.maxTotalSizeBytes).toBe(100 * 1024 * 1024);
    expect(limitsRes.body.allowedExtensions).toEqual(
      expect.arrayContaining(['.pdf', '.png', '.jpg', '.docx', '.xlsx', '.csv', '.txt', '.zip'])
    );

    // 2. Reject spoofed / blocked format and user-oversized (> 5 MB) file
    const fakePdf = Buffer.from('NOT_A_REAL_PDF_PAYLOAD', 'utf8');
    const badFormatRes = await custAgent
      .post('/api/support')
      .set('X-CSRF-Token', custCsrf)
      .field('name', 'Aarav Mahajan')
      .field('email', 'aarav.patron@example.com')
      .field('category', 'Quality / Packaging')
      .field('subject', 'Invalid attachment test')
      .field('description', 'Testing strict magic-byte validation on uploaded files.')
      .attach('attachments', fakePdf, { filename: 'spoof.pdf', contentType: 'application/pdf' });
    expect(badFormatRes.status).toBe(400);

    const blockedScript = Buffer.from('<script>alert(1)</script>', 'utf8');
    const blockedExtRes = await custAgent
      .post('/api/support')
      .set('X-CSRF-Token', custCsrf)
      .field('name', 'Aarav Mahajan')
      .field('email', 'aarav.patron@example.com')
      .field('category', 'Other')
      .field('subject', 'Blocked script attachment')
      .field('description', 'Testing blocked HTML/script upload rejection cleanly.')
      .attach('attachments', blockedScript, { filename: 'evil.html', contentType: 'text/html' });
    expect(blockedExtRes.status).toBe(400);

    const oversizedUserPdf = Buffer.concat([
      Buffer.from('%PDF-1.4\n', 'utf8'),
      Buffer.alloc(5 * 1024 * 1024 + 128, 0x20),
    ]);
    const oversizeRes = await custAgent
      .post('/api/support')
      .set('X-CSRF-Token', custCsrf)
      .field('name', 'Aarav Mahajan')
      .field('email', 'aarav.patron@example.com')
      .field('category', 'Quality / Packaging')
      .field('subject', 'Oversized attachment test')
      .field('description', 'Testing 5 MB user per-file cap on customer service uploads.')
      .attach('attachments', oversizedUserPdf, { filename: 'huge_user.pdf', contentType: 'application/pdf' });
    expect(oversizeRes.status).toBe(400);

    // 3. Log in verified customer and submit PNG image + PDF + CSV within user limits
    const custLogin = await custAgent
      .post('/api/auth/login')
      .set('X-CSRF-Token', custCsrf)
      .send({ email: 'vikram.seth@heritage.in', password: 'Patron@2026!' });
    expect(custLogin.status).toBe(200);

    const validPng = Buffer.from(
      '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c63000100000500010d0a2db40000000049454e44ae426082',
      'hex'
    );
    const validPdf = Buffer.from('%PDF-1.4\n1 0 obj << /Type /Catalog >> endobj\n%%EOF\n', 'utf8');
    const validCsv = Buffer.from('batch,weight,issue\nJMU-102,1kg,dented_corner\n', 'utf8');

    const submitRes = await custAgent
      .post('/api/support')
      .set('X-CSRF-Token', custCsrf)
      .field('name', 'Vikramaditya Seth')
      .field('email', 'vikram.seth@heritage.in')
      .field('phone', '9812345678')
      .field('category', 'Quality / Packaging')
      .field('orderNumber', 'AS-REQ-2026-4819')
      .field('subject', 'Outer velvet tin dented during transit')
      .field('description', 'Attached photo of the tin corner, invoice PDF, and batch CSV for inspection.')
      .attach('attachments', validPng, { filename: 'tin_photo.png', contentType: 'image/png' })
      .attach('attachments', validPdf, { filename: 'gst_invoice.pdf', contentType: 'application/pdf' })
      .attach('attachments', validCsv, { filename: 'batch_summary.csv', contentType: 'text/csv' });

    expect(submitRes.status).toBe(201);
    expect(submitRes.body.ticket.ticketNumber).toMatch(/^AS-SUP-/);
    expect(submitRes.body.ticket.attachments.length).toBe(3);
    expect(spyMedia.uploaded.filter(u => u.folder === 'support').length).toBe(3);

    const ticketId = submitRes.body.ticket.id;
    const ticketNumber = submitRes.body.ticket.ticketNumber;

    // Customer cannot access Admin support endpoints
    const custForbidden = await custAgent.get('/api/admin/support');
    expect(custForbidden.status).toBe(403);

    // BOTH user acknowledgement email AND Admin complaint alert email were dispatched with AVIF logo
    const ackMail = spyTransport.sent.find(
      m => m.to === 'vikram.seth@heritage.in' && m.subject.includes(ticketNumber)
    );
    expect(ackMail).toBeTruthy();
    expect(ackMail!.html).toContain(EXPECTED_LOGO_URL);
    expect(ackMail!.text).toContain(ticketNumber);

    const adminAlertMail = spyTransport.sent.find(
      m => m.to === 'aseth9588@gmail.com' && m.subject.includes(ticketNumber)
    );
    expect(adminAlertMail).toBeTruthy();
    expect(adminAlertMail!.html).toContain(EXPECTED_LOGO_URL);
    expect(adminAlertMail!.html).toContain('gst_invoice.pdf');

    // Public tracking endpoint verifies Ticket # + matching email (and blocks wrong email)
    const unauth = await getCsrfAgent(instance.app);
    const badTrack = await unauth.agent.get(
      `/api/support/track?ticketNumber=${encodeURIComponent(ticketNumber)}&email=stranger@example.com`
    );
    expect(badTrack.status).toBe(404);

    const goodTrack = await unauth.agent.get(
      `/api/support/track?ticketNumber=${encodeURIComponent(ticketNumber)}&email=vikram.seth@heritage.in`
    );
    expect(goodTrack.status).toBe(200);
    expect(goodTrack.body.ticket.ticketNumber).toBe(ticketNumber);
    expect(goodTrack.body.ticket.adminNotes).toBeUndefined();

    // 4. Admin logs in, reviews ticket, uploads 6 MB PDF using HIGHER Admin limit (would fail User 5 MB limit), and replies with PDF attached
    const admin = await getCsrfAgent(instance.app);
    const adminLogin = await loginAdminViaOtp(admin.agent, admin.csrf, spyTransport.sent, 'aseth9588@gmail.com');
    expect(adminLogin.status).toBe(200);

    const listRes = await admin.agent.get('/api/admin/support?status=open');
    expect(listRes.status).toBe(200);
    expect(listRes.body.tickets.some((t: any) => t.id === ticketId)).toBe(true);

    const detailRes = await admin.agent.get(`/api/admin/support/${ticketId}`);
    expect(detailRes.status).toBe(200);
    expect(detailRes.body.ticket.attachments.length).toBe(3);

    const largeAdminPdf = Buffer.concat([
      Buffer.from('%PDF-1.4\n', 'utf8'),
      Buffer.alloc(6 * 1024 * 1024, 0x20),
      Buffer.from('\n%%EOF\n', 'utf8'),
    ]);
    const adminUploadRes = await admin.agent
      .post(`/api/admin/support/${ticketId}/attachments`)
      .set('X-CSRF-Token', admin.csrf)
      .attach('attachments', largeAdminPdf, { filename: 'lab_report_6mb.pdf', contentType: 'application/pdf' });
    expect(adminUploadRes.status).toBe(201);
    expect(adminUploadRes.body.attachments.length).toBe(1);
    expect(adminUploadRes.body.ticket.adminAttachments.length).toBe(1);

    const patchRes = await admin.agent
      .patch(`/api/admin/support/${ticketId}`)
      .set('X-CSRF-Token', admin.csrf)
      .send({
        status: 'in_review',
        priority: 'high',
        adminNotes: 'Verified corner dent photo and invoice PDF; approved complimentary replacement tin.',
      });
    expect(patchRes.status).toBe(200);
    expect(patchRes.body.ticket.status).toBe('in_review');

    // Admin writes Custom Mail with an attached replacement invoice PDF
    const replyRes = await admin.agent
      .post(`/api/admin/support/${ticketId}/reply`)
      .set('X-CSRF-Token', admin.csrf)
      .field('subject', `Complimentary Replacement Dispatched [#${ticketNumber}]`)
      .field(
        'message',
        'Namaste Vikramaditya,\n\nWe inspected your photo and invoice PDF and are dispatching a fresh velvet tin today with no extra charge.'
      )
      .field('nextStatus', 'responded')
      .attach('attachments', validPdf, { filename: 'replacement_dispatch_slip.pdf', contentType: 'application/pdf' });
    expect(replyRes.status).toBe(200);
    expect(replyRes.body.ticket.status).toBe('responded');
    expect(replyRes.body.ticket.replies.length).toBe(1);
    expect(replyRes.body.ticket.replies[0].attachments.length).toBe(1);
    expect(replyRes.body.emailLog?.status).toBe('sent');

    // Custom Admin email was sent to concerned user containing custom message, PDF link & AVIF logo
    const customMail = spyTransport.sent.find(
      m =>
        m.to === 'vikram.seth@heritage.in' &&
        m.subject === `Complimentary Replacement Dispatched [#${ticketNumber}]`
    );
    expect(customMail).toBeTruthy();
    expect(customMail!.html).toContain('fresh velvet tin today');
    expect(customMail!.html).toContain('replacement_dispatch_slip.pdf');
    expect(customMail!.html).toContain(EXPECTED_LOGO_URL);

    // 5. Customer posts follow-up message with extra PDF upload on tracked complaint -> emails Admin again
    const sentBeforeFollowup = spyTransport.sent.length;
    const followupRes = await custAgent
      .post(`/api/support/${ticketNumber}/reply`)
      .set('X-CSRF-Token', custCsrf)
      .field('message', 'Thank you! Attaching my preferred delivery window slip PDF.')
      .attach('attachments', validPdf, { filename: 'delivery_window.pdf', contentType: 'application/pdf' });
    expect(followupRes.status).toBe(200);
    expect(followupRes.body.ticket.replies.length).toBe(2);
    expect(followupRes.body.ticket.replies[1].senderType).toBe('customer');
    expect(followupRes.body.ticket.replies[1].attachments.length).toBe(1);
    expect(followupRes.body.ticket.status).toBe('in_review');
    expect(
      spyTransport.sent
        .slice(sentBeforeFollowup)
        .some(m => m.to === 'aseth9588@gmail.com' && m.subject.includes(ticketNumber))
    ).toBe(true);

    // Authenticated customer sees full thread in /api/support/my-tickets
    const myTicketsRes = await custAgent.get('/api/support/my-tickets');
    expect(myTicketsRes.status).toBe(200);
    const mine = myTicketsRes.body.tickets.find((t: any) => t.id === ticketId);
    expect(mine).toBeTruthy();
    expect(mine.replies.length).toBe(2);
    expect(mine.adminAttachments.length).toBe(2);

    // 6. Verify authenticated backend attachment/media proxy streams PDF bytes cleanly
    //    (mitigates Cloudinary public PDF/raw 401 ACL restrictions)
    const pdfAtt = submitRes.body.ticket.attachments.find((a: any) => a.filename === 'gst_invoice.pdf');
    expect(pdfAtt?.id).toBeTruthy();
    expect(adminAlertMail!.html).toContain(`/api/support/${ticketNumber}/attachments/${pdfAtt.id}/file`);
    expect(customMail!.html).toContain(`/api/support/${ticketNumber}/attachments/`);

    const custAdminProxyBlocked = await custAgent.get(
      `/api/admin/support/${ticketId}/attachments/${pdfAtt.id}/file`
    );
    expect(custAdminProxyBlocked.status).toBe(403);

    const adminPdfRes = await admin.agent
      .get(`/api/admin/support/${ticketId}/attachments/${pdfAtt.id}/file`)
      .buffer(true);
    expect(adminPdfRes.status).toBe(200);
    expect(adminPdfRes.headers['content-type']).toContain('application/pdf');
    expect(adminPdfRes.headers['content-disposition']).toContain('inline;');
    const adminPdfBytes = Buffer.isBuffer(adminPdfRes.body)
      ? adminPdfRes.body.toString('utf8')
      : String(adminPdfRes.text || '');
    expect(adminPdfBytes).toContain('%PDF-1.4');

    const strangerPdfBlocked = await unauth.agent.get(
      `/api/support/${ticketNumber}/attachments/${pdfAtt.id}/file?email=stranger@example.com`
    );
    expect(strangerPdfBlocked.status).toBe(403);

    const customerDownloadRes = await unauth.agent
      .get(
        `/api/support/${ticketNumber}/attachments/${pdfAtt.id}/file?email=${encodeURIComponent(
          'vikram.seth@heritage.in'
        )}&download=1`
      )
      .buffer(true);
    expect(customerDownloadRes.status).toBe(200);
    expect(customerDownloadRes.headers['content-type']).toContain('application/pdf');
    expect(customerDownloadRes.headers['content-disposition']).toContain('attachment;');
    expect(customerDownloadRes.headers['content-disposition']).toContain('gst_invoice.pdf');

    const evilProxyBlocked = await admin.agent.get(
      `/api/admin/media/proxy?url=${encodeURIComponent('https://evil.example.com/secret.pdf')}`
    );
    expect(evilProxyBlocked.status).toBe(403);

    const adminMediaProxyRes = await admin.agent
      .get(`/api/admin/media/proxy?url=${encodeURIComponent(pdfAtt.url)}`)
      .buffer(true);
    expect(adminMediaProxyRes.status).toBe(200);
    expect(adminMediaProxyRes.headers['content-type']).toContain('application/pdf');
    expect(adminMediaProxyRes.headers['content-disposition']).toContain('inline;');
    const proxyPdfBytes = Buffer.isBuffer(adminMediaProxyRes.body)
      ? adminMediaProxyRes.body.toString('utf8')
      : String(adminMediaProxyRes.text || '');
    expect(proxyPdfBytes).toContain('%PDF-1.4');
  });

  it('calculates 250g, 500g, and 1kg cost prices and 25% margin selling prices accurately', async () => {
    const { calculateKgMarginTiers, parseWeightGrams } = await import('../src/utils/priceCalculator.ts');

    // Test with ₹800 cost per 1 kg
    const tiers800 = calculateKgMarginTiers(800, 25, 'AS-ALM');
    expect(tiers800).toHaveLength(3);

    // 250g tier: cost is 800 * 0.25 = 200; selling price with 25% margin = 200 * 1.25 = 250
    const t250 = tiers800.find(t => t.weightLabel === '250g')!;
    expect(t250).toBeDefined();
    expect(t250.sku).toBe('AS-ALM-250G');
    expect(t250.purchasePrice).toBe(200);
    expect(t250.sellingPrice).toBe(250);

    // 500g tier: cost is 800 * 0.5 = 400; selling price with 25% margin = 400 * 1.25 = 500
    const t500 = tiers800.find(t => t.weightLabel === '500g')!;
    expect(t500).toBeDefined();
    expect(t500.sku).toBe('AS-ALM-500G');
    expect(t500.purchasePrice).toBe(400);
    expect(t500.sellingPrice).toBe(500);

    // 1kg tier: cost is 800; selling price with 25% margin = 800 * 1.25 = 1000
    const t1kg = tiers800.find(t => t.weightLabel === '1kg')!;
    expect(t1kg).toBeDefined();
    expect(t1kg.sku).toBe('AS-ALM-1KG');
    expect(t1kg.purchasePrice).toBe(800);
    expect(t1kg.sellingPrice).toBe(1000);

    // Default 40% margin when marginPercent argument is omitted
    const defaultTiers800 = calculateKgMarginTiers(800, undefined, 'AS-ALM');
    expect(defaultTiers800.find(t => t.weightLabel === '250g')?.sellingPrice).toBe(280);
    expect(defaultTiers800.find(t => t.weightLabel === '500g')?.sellingPrice).toBe(560);
    expect(defaultTiers800.find(t => t.weightLabel === '1kg')?.sellingPrice).toBe(1120);

    // Test weight parsing helper
    expect(parseWeightGrams('250g')).toBe(250);
    expect(parseWeightGrams('500gm')).toBe(500);
    expect(parseWeightGrams('1kg')).toBe(1000);
    expect(parseWeightGrams('100g')).toBe(100);
    expect(parseWeightGrams('2kg')).toBe(2000);
    expect(parseWeightGrams('500g Vacuum Tin')).toBe(500);
  });

  it('orders selected pack variants (250g / 500g / 1kg / admin pack) with server-side pricing and proportional stock deduction', async () => {
    const { getProductPackOptions } = await import('../src/utils/priceCalculator.ts');

    // Public catalog exposes seeded 250g, 500g, 1kg packs for walnut products
    const pubRes = await request(instance.app).get('/api/products');
    expect(pubRes.status).toBe(200);
    const walnut = pubRes.body.products.find((p: any) => p.id === 'akhrot-best');
    expect(walnut).toBeDefined();
    const packOptions = getProductPackOptions(walnut);
    expect(packOptions.map((v: any) => v.weightLabel)).toEqual(['250g', '500g', '1kg']);
    const pack250 = packOptions.find((v: any) => v.weightLabel === '250g')!;
    // For guest visitors before login, 25% profit margin applies (base cost 150 * 1.25 = 188)
    expect(pack250.sellingPrice).toBe(188);

    // Register & verify a customer
    const { agent, csrf } = await getCsrfAgent(instance.app);
    const reg = await agent
      .post('/api/auth/register')
      .set('X-CSRF-Token', csrf)
      .send({
        fullName: 'Pack Buyer',
        email: 'packbuyer@example.com',
        mobileNumber: '9876543299',
        password: 'RoyalPassword@99',
        confirmPassword: 'RoyalPassword@99',
        houseFlat: 'Flat 101',
        streetArea: 'Andheri West',
        city: 'Mumbai',
        state: 'Maharashtra',
        pincode: '400053',
        country: 'India',
        acceptTerms: true,
      });
    expect(reg.status).toBe(201);
    const verifyMail = spyTransport.sent.find(m => m.to === 'packbuyer@example.com');
    const token = verifyMail!.text.match(/verify-email\?token=([a-f0-9]+)/)![1];
    await agent.post('/api/auth/verify-email').set('X-CSRF-Token', csrf).send({ token });

    const beforeStock = Number((await instance.db.models.Product.findOne({ id: 'akhrot-best' }).lean())!.stock);

    // Order 2 × 250g pack of akhrot-best for Mumbai customer (40% margin applies: 2 * 210 = 420 subtotal, and deduct 0.5 kg stock)
    const orderRes = await agent
      .post('/api/orders')
      .set('X-CSRF-Token', csrf)
      .send({
        items: [{ productId: 'akhrot-best', variantId: pack250.id, weightLabel: '250g', quantity: 2 }],
        deliveryAddress: {
          fullName: 'Pack Buyer',
          mobileNumber: '9876543299',
          deliveryAddress: '14 Residency Road',
          city: 'Jammu',
          state: 'Jammu & Kashmir',
          pincode: '180001',
        },
      });
    expect(orderRes.status).toBe(201);
    expect(orderRes.body.order.subtotal).toBe(420);
    expect(orderRes.body.order.items[0].weightLabel).toBe('250g');
    expect(orderRes.body.order.items[0].unitPrice).toBe(210);
    expect(orderRes.body.order.items[0].quantity).toBe(2);

    const afterStock = Number((await instance.db.models.Product.findOne({ id: 'akhrot-best' }).lean())!.stock);
    expect(afterStock).toBeCloseTo(beforeStock - 0.5, 2);

    // Order 2 × 100ml cold-pressed almond oil bottle (unit: 'ml', 1000ml opening stock -> 800ml remaining)
    const oilProd = pubRes.body.products.find((p: any) => p.id === 'oil-almond-100ml');
    expect(oilProd).toBeDefined();
    expect(oilProd.unit).toBe('ml');
    const oil100 = oilProd.weightVariants.find((v: any) => v.weightLabel === '100ml');
    expect(oil100).toBeDefined();

    const oilOrderRes = await agent
      .post('/api/orders')
      .set('X-CSRF-Token', csrf)
      .send({
        items: [{ productId: 'oil-almond-100ml', variantId: oil100.id, weightLabel: '100ml', quantity: 2 }],
        deliveryAddress: {
          fullName: 'Pack Buyer',
          mobileNumber: '9876543299',
          deliveryAddress: '14 Residency Road',
          city: 'Jammu',
          state: 'Jammu & Kashmir',
          pincode: '180001',
        },
      });
    expect(oilOrderRes.status).toBe(201);
    expect(oilOrderRes.body.order.subtotal).toBe(698);
    expect(oilOrderRes.body.order.items[0].weightLabel).toBe('100ml');
    const oilStockAfter = Number((await instance.db.models.Product.findOne({ id: 'oil-almond-100ml' }).lean())!.stock);
    expect(oilStockAfter).toBe(800);
  });

  it('enforces location-based shipping charges (Surat ₹0 vs other cities ₹158) and location-based profit margins (Surat 25% vs other cities 40%)', async () => {
    const { calculateOrderShippingCharge, isSuratCity } = await import('../shared/catalogSeed.ts');
    expect(isSuratCity('Surat')).toBe(true);
    expect(isSuratCity('Surat, Gujarat')).toBe(true);
    expect(isSuratCity('Mumbai')).toBe(false);

    // Location-based shipping: ₹0 for Surat, ₹158 for any other city
    expect(calculateOrderShippingCharge([{ productId: 'kaju', productName: 'Kaju' }], 1372, { shippingCity: 'Surat' })).toBe(0);
    expect(calculateOrderShippingCharge([{ productId: 'kaju', productName: 'Kaju' }], 1372, { shippingCity: 'Mumbai' })).toBe(158);
    expect(calculateOrderShippingCharge([{ productId: 'kaju', productName: 'Kaju' }], 1372, { shippingCity: 'Jammu' })).toBe(158);

    const { agent, csrf } = await getCsrfAgent(instance.app);

    // Register a Surat patron (mandatory shipping address in Surat)
    const regSurat = await agent
      .post('/api/auth/register')
      .set('X-CSRF-Token', csrf)
      .send({
        fullName: 'Surat Patron',
        email: 'suratpatron@example.com',
        mobileNumber: '9876543277',
        password: 'RoyalPassword@77',
        confirmPassword: 'RoyalPassword@77',
        houseFlat: 'B-304, Green Heights',
        streetArea: 'Ghod Dod Road',
        city: 'Surat',
        state: 'Gujarat',
        pincode: '395007',
        country: 'India',
        acceptTerms: true,
      });
    expect(regSurat.status).toBe(201);
    expect(regSurat.body.user.profitMargin).toBe(25);
    expect(regSurat.body.user.shippingFee).toBe(0);

    const verifyMail = spyTransport.sent.find(m => m.to === 'suratpatron@example.com');
    const token = verifyMail!.text.match(/verify-email\?token=([a-f0-9]+)/)![1];
    await agent.post('/api/auth/verify-email').set('X-CSRF-Token', csrf).send({ token });

    // 1. Surat order -> Free shipping (₹0) and 25% margin applied
    const suratOrderRes = await agent
      .post('/api/orders')
      .set('X-CSRF-Token', csrf)
      .send({
        items: [{ productId: 'kaju', quantity: 1 }],
        deliveryAddress: {
          fullName: 'Surat Patron',
          mobileNumber: '9876543277',
          houseFlat: 'B-304, Green Heights',
          streetArea: 'Ghod Dod Road',
          city: 'Surat',
          state: 'Gujarat',
          pincode: '395007',
        },
      });
    expect(suratOrderRes.status).toBe(201);
    expect(suratOrderRes.body.order.shippingCharge).toBe(0);
    expect(suratOrderRes.body.order.appliedProfitMargin).toBe(25);
    // Kaju base cost = 980. At 25% margin = 980 * 1.25 = 1225
    expect(suratOrderRes.body.order.subtotal).toBe(1225);

    // 2. Non-Surat order -> Fixed ₹158 shipping fee and 40% margin applied
    const outstationOrderRes = await agent
      .post('/api/orders')
      .set('X-CSRF-Token', csrf)
      .send({
        items: [{ productId: 'kaju', quantity: 1 }],
        deliveryAddress: {
          fullName: 'Delhi Patron',
          mobileNumber: '9876543277',
          deliveryAddress: '15 Connaught Place',
          city: 'New Delhi',
          state: 'Delhi',
          pincode: '110001',
        },
      });
    expect(outstationOrderRes.status).toBe(201);
    expect(outstationOrderRes.body.order.shippingCharge).toBe(158);
    expect(outstationOrderRes.body.order.appliedProfitMargin).toBe(40);
    // Kaju base cost = 980. At 40% margin = 980 * 1.40 = 1372
    expect(outstationOrderRes.body.order.subtotal).toBe(1372);

    // 3. Mandatory shipping address check: Incomplete address rejected with 400
    const incompleteRes = await agent
      .post('/api/orders')
      .set('X-CSRF-Token', csrf)
      .send({
        items: [{ productId: 'kaju', quantity: 1 }],
        deliveryAddress: {
          fullName: 'No Address Patron',
          mobileNumber: '9876543277',
          deliveryAddress: '',
          city: '',
          state: '',
          pincode: '',
        },
      });
    expect(incompleteRes.status).toBe(400);
    expect(incompleteRes.body.error).toContain('mandatory before placing an order');
  });
});

