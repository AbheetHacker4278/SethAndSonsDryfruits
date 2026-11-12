import express from 'express';
import net from 'node:net';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp, wrapRouterAsync, type AppInstance } from '../server/app.ts';
import { clearRateLimitStore } from '../server/middleware/security.ts';
import { type MediaStorageService } from '../server/services/cloudinaryService.ts';
import { createEmailTransport, type EmailTransport, type OutboundEmailPayload } from '../server/services/emailProvider.ts';
import { loadConfig } from '../server/config.ts';

function createSpyMediaStorage(): MediaStorageService {
  return {
    isConfigured: () => true,
    async uploadBuffer(params) {
      const publicId = `${params.folder}/test_asset`;
      return {
        url: `https://res.cloudinary.com/asulesh-test/image/upload/v1/${publicId}.png`,
        publicId,
        format: 'png',
        bytes: params.buffer.length,
      };
    },
  };
}

function createSpyTransport(): EmailTransport & { sent: OutboundEmailPayload[] } {
  const sent: OutboundEmailPayload[] = [];
  return {
    sent,
    async send(payload) {
      sent.push(payload);
      return { provider: 'spy-smtp', messageId: `<id-${sent.length}@test>` };
    },
    getSummary() {
      return {
        provider: 'smtp',
        mode: 'spy-smtp-test',
        configured: true,
        fromEmail: 'aseth9588@gmail.com',
        trackingEnabled: false,
      };
    },
  };
}

function extractCookie(setCookies: string[] | string | undefined, name: string): string {
  const list = Array.isArray(setCookies) ? setCookies : setCookies ? [setCookies] : [];
  for (const c of list) {
    const m = c.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
    if (m) return decodeURIComponent(m[1]);
  }
  return '';
}

async function getAgent(app: AppInstance['app']) {
  const agent = request.agent(app);
  const res = await agent.get('/api/auth/me');
  return { agent, csrf: extractCookie(res.headers['set-cookie'], 'as_csrf') };
}

describe('Extended Security, Token Expiry, Email Change, Segments & SMTP Provider Tests', () => {
  let mongod: MongoMemoryServer;
  let dbCounter = 0;
  let instance: AppInstance;
  let spy: ReturnType<typeof createSpyTransport>;

  beforeAll(async () => {
    mongod = await MongoMemoryServer.create();
  }, 60_000);

  afterAll(async () => {
    await mongod?.stop();
  });

  beforeEach(async () => {
    clearRateLimitStore();
    spy = createSpyTransport();
    instance = await createApp({
      config: {
        mongodbUri: `${mongod.getUri()}sec_test_${++dbCounter}`,
        nodeEnv: 'test',
        isProduction: false,
        adminSeedEmail: 'aseth9588@gmail.com',
      },
      emailTransport: spy,
      mediaStorage: createSpyMediaStorage(),
      startQueueWorker: false,
    });
  }, 30_000);

  afterEach(async () => {
    await instance?.close();
  });

  it('requires verification of new email before switching email address and rejects expired tokens', async () => {
    const { agent, csrf } = await getAgent(instance.app);
    await agent
      .post('/api/auth/login')
      .set('X-CSRF-Token', csrf)
      .send({ email: 'vikram.seth@heritage.in', password: 'Patron@2026!' });

    // Request email change
    const changeRes = await agent
      .post('/api/account/change-email')
      .set('X-CSRF-Token', csrf)
      .send({ newEmail: 'vikram.new@heritage.in', currentPassword: 'Patron@2026!' });
    expect(changeRes.status).toBe(200);
    expect(changeRes.body.user.email).toBe('vikram.seth@heritage.in');
    expect(changeRes.body.user.pendingEmail).toBe('vikram.new@heritage.in');

    const verifyMail = spy.sent.find(m => m.to === 'vikram.new@heritage.in');
    expect(verifyMail).toBeTruthy();
    const token = verifyMail!.text.match(/verify-email\?token=([a-f0-9]+)/)![1];

    // Verify new email
    const verifyRes = await agent
      .post('/api/auth/verify-email')
      .set('X-CSRF-Token', csrf)
      .send({ token });
    expect(verifyRes.status).toBe(200);
    expect(verifyRes.body.user.email).toBe('vikram.new@heritage.in');
    expect(verifyRes.body.user.pendingEmail).toBeNull();

    // Test expired verification token rejection
    const { agent: a2, csrf: c2 } = await getAgent(instance.app);
    await a2
      .post('/api/auth/register')
      .set('X-CSRF-Token', c2)
      .send({
        fullName: 'Expired User',
        email: 'expired@example.com',
        mobileNumber: '9822233344',
        password: 'ValidPassword@1',
        confirmPassword: 'ValidPassword@1',
        acceptTerms: true,
      });

    const expToken = spy.sent
      .find(m => m.to === 'expired@example.com')!
      .text.match(/verify-email\?token=([a-f0-9]+)/)![1];

    // Force expire in DB
    await instance.db.models.VerificationToken.updateMany(
      { emailTarget: 'expired@example.com' },
      { $set: { expiresAt: new Date(Date.now() - 1000).toISOString() } }
    );

    const expRes = await a2
      .post('/api/auth/verify-email')
      .set('X-CSRF-Token', c2)
      .send({ token: expToken });
    expect(expRes.status).toBe(400);
    expect(expRes.body.code).toBe('TOKEN_EXPIRED');
  });

  it('skips disabled templates without breaking orders, blocks suppressed recipients, and allows shipment corrections', async () => {
    const admin = await getAgent(instance.app);
    await admin.agent
      .post('/api/auth/admin-otp/request')
      .set('X-CSRF-Token', admin.csrf)
      .send({ email: 'aseth9588@gmail.com' });
    const otpCode = spy.sent
      .find(m => m.to === 'aseth9588@gmail.com' && m.subject.includes('Admin Portal Login OTP'))!
      .text.match(/\b(\d{6})\b/)![1];
    const otpVerify = await admin.agent
      .post('/api/auth/admin-otp/verify')
      .set('X-CSRF-Token', admin.csrf)
      .send({ email: 'aseth9588@gmail.com', otp: otpCode, rememberMe: true });
    expect(otpVerify.status).toBe(200);

    // Disable order_confirmed template
    await admin.agent
      .put('/api/admin/communications/templates/order_confirmed')
      .set('X-CSRF-Token', admin.csrf)
      .send({ enabled: false });

    const beforeCount = spy.sent.length;
    const confRes = await admin.agent
      .post('/api/admin/orders/AS-REQ-2026-4819/confirm')
      .set('X-CSRF-Token', admin.csrf)
      .send({});
    expect(confRes.status).toBe(200);
    expect(spy.sent.length).toBe(beforeCount); // skipped cleanly

    // Dispatch and then correct courier details
    await admin.agent
      .post('/api/admin/orders/AS-REQ-2026-4819/dispatch')
      .set('X-CSRF-Token', admin.csrf)
      .send({
        courierPartner: 'Delhivery',
        trackingNumber: 'DEL998877',
        trackingUrl: 'https://www.delhivery.com/track/package/DEL998877',
        dispatchDate: '2026-11-11',
      });

    const correctRes = await admin.agent
      .put('/api/admin/orders/AS-REQ-2026-4819/shipment')
      .set('X-CSRF-Token', admin.csrf)
      .send({
        courierPartner: 'DTDC',
        trackingNumber: 'DTDC554433',
        trackingUrl: 'https://www.dtdc.in/tracking.asp',
        dispatchDate: '2026-11-11',
        estimatedDeliveryDate: '2026-11-15',
        notifyCustomer: true,
      });
    expect(correctRes.status).toBe(200);
    expect(correctRes.body.order.shipment.courierPartner).toBe('DTDC');
    expect(spy.sent.some(m => m.text.includes('DTDC554433'))).toBe(true);

    // Suppress address directly & verify send is suppressed without hitting transport
    await instance.db.models.EmailSuppression.create({
      id: 'sup1',
      email: 'vikram.seth@heritage.in',
      reason: 'bounce',
      bounceCount: 1,
      suppressedAt: new Date().toISOString(),
    });

    const countBeforeSup = spy.sent.length;
    await admin.agent
      .post('/api/admin/communications/templates/welcome/test')
      .set('X-CSRF-Token', admin.csrf)
      .send({ recipient: 'vikram.seth@heritage.in' });
    expect(spy.sent.length).toBe(countBeforeSup);

    const suppressedLog = await instance.db.models.EmailLog.findOne({ recipient: 'vikram.seth@heritage.in' })
      .sort({ createdAt: -1 })
      .lean();
    expect(suppressedLog?.status).toBe('suppressed');
  });

  it('verifies SMTP provider fails closed in production when unconfigured and delivers real MIME messages over SMTP', async () => {
    const prodConfig = {
      ...loadConfig(),
      isProduction: true,
      nodeEnv: 'production',
      emailProvider: 'smtp' as const,
      smtpHost: '',
    };
    const prodTransport = createEmailTransport(prodConfig);
    await expect(
      prodTransport.send({
        to: 'customer@example.com',
        subject: 'Test',
        html: '<p>Test</p>',
        text: 'Test',
      })
    ).rejects.toThrow(/SMTP_HOST is not configured in production/);

    // Spin up a real local SMTP socket listener to verify nodemailer SMTP handshake & MIME output
    let receivedData = '';
    const smtpServer = net.createServer(socket => {
      socket.write('220 localhost ESMTP Test\r\n');
      let inData = false;
      socket.on('data', chunk => {
        const str = chunk.toString('utf8');
        if (inData) {
          receivedData += str;
          if (receivedData.includes('\r\n.\r\n')) {
            inData = false;
            socket.write('250 2.0.0 OK queued\r\n');
          }
          return;
        }
        const upper = str.trim().toUpperCase();
        if (upper.startsWith('EHLO') || upper.startsWith('HELO')) {
          socket.write('250-localhost\r\n250 OK\r\n');
        } else if (upper.startsWith('MAIL FROM') || upper.startsWith('RCPT TO')) {
          socket.write('250 OK\r\n');
        } else if (upper === 'DATA') {
          inData = true;
          socket.write('354 End data with <CR><LF>.<CR><LF>\r\n');
        } else if (upper === 'QUIT') {
          socket.write('221 Bye\r\n');
          socket.end();
        } else {
          socket.write('250 OK\r\n');
        }
      });
    });

    await new Promise<void>(resolve => smtpServer.listen(0, '127.0.0.1', resolve));
    const port = (smtpServer.address() as net.AddressInfo).port;

    try {
      const localSmtpTransport = createEmailTransport({
        ...loadConfig(),
        isProduction: false,
        emailProvider: 'smtp',
        smtpHost: '127.0.0.1',
        smtpPort: port,
        smtpSecure: false,
        smtpUser: '',
        smtpPass: '',
      });

      const result = await localSmtpTransport.send({
        to: 'patron@example.com',
        subject: 'SMTP Handshake Verification',
        html: '<p>Emerald Gold Ivory</p>',
        text: 'Plain text fallback',
      });
      expect(result.provider).toBe('configured-smtp');
      expect(result.messageId).toBeTruthy();
      expect(receivedData).toContain('Subject: SMTP Handshake Verification');
      expect(receivedData).toContain('Emerald Gold Ivory');
      expect(receivedData).toContain('Plain text fallback');
    } finally {
      await new Promise<void>(resolve => smtpServer.close(() => resolve()));
    }
  });

  it('enforces Admin OTP cooldown, single-use, expiry, customer rejection, and invalid-attempt lockout', async () => {
    const { agent, csrf } = await getAgent(instance.app);

    // Request OTP for customer email must NOT send an OTP
    const sentBeforeCust = spy.sent.length;
    const custOtpReq = await agent
      .post('/api/auth/admin-otp/request')
      .set('X-CSRF-Token', csrf)
      .send({ email: 'vikram.seth@heritage.in' });
    expect(custOtpReq.status).toBe(200);
    expect(spy.sent.length).toBe(sentBeforeCust);

    const custOtpVerify = await agent
      .post('/api/auth/admin-otp/verify')
      .set('X-CSRF-Token', csrf)
      .send({ email: 'vikram.seth@heritage.in', otp: '123456' });
    expect(custOtpVerify.status).toBe(403);

    // Request OTP for authorized Admin (aseth9588@gmail.com)
    const req1 = await agent
      .post('/api/auth/admin-otp/request')
      .set('X-CSRF-Token', csrf)
      .send({ email: 'aseth9588@gmail.com' });
    expect(req1.status).toBe(200);

    const otpMail = [...spy.sent]
      .reverse()
      .find(m => m.to === 'aseth9588@gmail.com' && m.subject.includes('Admin Portal Login OTP'));
    expect(otpMail).toBeTruthy();
    const otp1 = otpMail!.text.match(/\b(\d{6})\b/)![1];

    // Immediate resend triggers 30s cooldown
    const req2 = await agent
      .post('/api/auth/admin-otp/request')
      .set('X-CSRF-Token', csrf)
      .send({ email: 'aseth9588@gmail.com' });
    expect(req2.status).toBe(429);

    // Expire OTP in Mongo and verify OTP_EXPIRED error
    await instance.db.models.VerificationToken.updateMany(
      { emailTarget: 'aseth9588@gmail.com', purpose: 'admin_login_otp' },
      { $set: { expiresAt: new Date(Date.now() - 5000).toISOString() } }
    );
    const expVerify = await agent
      .post('/api/auth/admin-otp/verify')
      .set('X-CSRF-Token', csrf)
      .send({ email: 'aseth9588@gmail.com', otp: otp1 });
    expect(expVerify.status).toBe(400);
    expect(expVerify.body.code).toBe('OTP_EXPIRED');

    // Clear cooldown in DB and issue fresh OTP -> wrong code 5 times triggers lockout
    await instance.db.models.VerificationToken.updateMany(
      { emailTarget: 'aseth9588@gmail.com', purpose: 'admin_login_otp' },
      { $set: { usedAt: new Date().toISOString() } }
    );
    const { agent: agent2, csrf: csrf2 } = await getAgent(instance.app);
    await agent2
      .post('/api/auth/admin-otp/request')
      .set('X-CSRF-Token', csrf2)
      .send({ email: 'aseth9588@gmail.com' });

    for (let i = 0; i < 4; i += 1) {
      const badTry = await agent2
        .post('/api/auth/admin-otp/verify')
        .set('X-CSRF-Token', csrf2)
        .send({ email: 'aseth9588@gmail.com', otp: '000000' });
      expect([401, 429]).toContain(badTry.status);
    }
    const fifthBadTry = await agent2
      .post('/api/auth/admin-otp/verify')
      .set('X-CSRF-Token', csrf2)
      .send({ email: 'aseth9588@gmail.com', otp: '000000' });
    expect(fifthBadTry.status).toBe(429);

    // Brevo provider mode & xkeysib- API key routing on smtp-relay.brevo.com
    const brevoDirect = createEmailTransport({
      ...loadConfig(),
      emailProvider: 'brevo',
      brevoApiKey: 'xkeysib-sample-test',
    });
    expect(brevoDirect.getSummary()).toMatchObject({
      provider: 'brevo',
      mode: 'configured-brevo-api',
      configured: true,
    });

    const brevoFromSmtpEnv = createEmailTransport({
      ...loadConfig(),
      emailProvider: 'smtp',
      brevoApiKey: '',
      smtpHost: 'smtp-relay.brevo.com',
      smtpPass: 'xkeysib-sample-test',
    });
    expect(brevoFromSmtpEnv.getSummary()).toMatchObject({
      provider: 'brevo',
      mode: 'configured-brevo-api',
      configured: true,
    });
  });

  it('never inserts demo/mock orders, customers, suppliers, expenses, or coupons in non-test mode', async () => {
    const cleanInstance = await createApp({
      config: {
        mongodbUri: `${mongod.getUri()}sec_clean_${++dbCounter}`,
        nodeEnv: 'production',
        isProduction: true,
        smtpHost: 'smtp-relay.brevo.com',
        adminSeedEmail: 'aseth9588@gmail.com',
      },
      emailTransport: spy,
      mediaStorage: createSpyMediaStorage(),
      startQueueWorker: false,
    });
    try {
      const [custCount, ordCount, supCount, expCount, cpnCount, batchCount, notifCount] = await Promise.all([
        cleanInstance.db.models.Customer.countDocuments(),
        cleanInstance.db.models.Order.countDocuments(),
        cleanInstance.db.models.Supplier.countDocuments(),
        cleanInstance.db.models.Expense.countDocuments(),
        cleanInstance.db.models.Coupon.countDocuments(),
        cleanInstance.db.models.InventoryBatch.countDocuments(),
        cleanInstance.db.models.AdminNotification.countDocuments(),
      ]);
      expect(custCount).toBe(1); // Only Super Admin (aseth9588@gmail.com)
      expect(ordCount).toBe(0);
      expect(supCount).toBe(0);
      expect(expCount).toBe(0);
      expect(cpnCount).toBe(0);
      expect(batchCount).toBe(0);
      expect(notifCount).toBe(0);
    } finally {
      await cleanInstance.close();
    }
  }, 30_000);

  it('forwards async route rejections via wrapRouterAsync and tolerates malformed order dates in analytics', async () => {
    // 1. Verify Express 4 async wrapper converts async rejections into clean error middleware responses
    const testApp = express();
    const r = express.Router();
    r.get('/boom', async () => {
      const err = new Error('Simulated async DB failure') as Error & { statusCode?: number };
      err.statusCode = 503;
      throw err;
    });
    testApp.use('/t', wrapRouterAsync(r));
    testApp.use(
      (
        err: Error & { statusCode?: number },
        _req: express.Request,
        res: express.Response,
        _next: express.NextFunction
      ) => {
        res.status(err.statusCode || 500).json({ error: err.message });
      }
    );
    const boomRes = await request(testApp).get('/t/boom');
    expect(boomRes.status).toBe(503);
    expect(boomRes.body.error).toBe('Simulated async DB failure');

    // 2. Verify analytics tolerates malformed order timestamps cleanly
    await instance.db.models.Order.create({
      id: 'ord_bad_date',
      orderNumber: 'AS-REQ-BAD-DATE',
      customerId: 'cust_demo',
      orderType: 'standard',
      status: 'confirmed',
      paymentMethod: 'COD',
      paymentStatus: 'pending',
      subtotal: 1200,
      discountAmount: 0,
      shippingCharge: 0,
      taxAmount: 60,
      totalAmount: 1260,
      deliveryAddress: {},
      customerSnapshot: {},
      createdAt: 'not-a-valid-date',
      updatedAt: 'not-a-valid-date',
    });

    const { agent, csrf } = await getAgent(instance.app);
    await agent
      .post('/api/auth/admin-otp/request')
      .set('X-CSRF-Token', csrf)
      .send({ email: 'aseth9588@gmail.com' });
    const otpMail = [...spy.sent]
      .reverse()
      .find(m => m.to === 'aseth9588@gmail.com' && m.subject.includes('Admin Portal Login OTP'));
    const code = otpMail!.text.match(/\b(\d{6})\b/)![1];
    const verifyRes = await agent
      .post('/api/auth/admin-otp/verify')
      .set('X-CSRF-Token', csrf)
      .send({ email: 'aseth9588@gmail.com', otp: code, rememberMe: true });
    expect(verifyRes.status).toBe(200);

    const anaRes = await agent.get('/api/admin/dashboard/analytics?period=daily');
    expect(anaRes.status).toBe(200);
    expect(anaRes.body.kpis).toBeTruthy();
  });

  it('runs pre-login system preflight checking MongoDB, Email, Cloudinary, queue, and API endpoints without leaking secrets', async () => {
    const preRes = await request(instance.app).get('/api/system/preflight?fresh=1');
    expect(preRes.status).toBe(200);
    expect(preRes.body.overallOk).toBe(true);
    expect(preRes.body.readyForAdminLogin).toBe(true);
    const keys = (preRes.body.checks as Array<{ key: string; ok: boolean }>).map(c => c.key);
    expect(keys).toEqual(['mongodb', 'email', 'cloudinary', 'queue', 'endpoints']);
    expect(preRes.body.checks.every((c: { ok: boolean }) => c.ok)).toBe(true);
    expect((preRes.body.endpoints as Array<{ ok: boolean }>).length).toBeGreaterThanOrEqual(5);

    const rawJson = JSON.stringify(preRes.body);
    expect(rawJson).not.toContain('aseth9588@gmail.com');
    expect(rawJson).not.toContain('mongodb://');
    expect(rawJson).not.toContain('mongodb+srv://');
    expect(rawJson).not.toContain('xkeysib-');

    // Simulate failed Email + Cloudinary connection verification
    const failingTransport = {
      ...createSpyTransport(),
      async verifyConnection() {
        return {
          ok: false,
          provider: 'brevo',
          mode: 'configured-brevo-api',
          latencyMs: 12,
          detail: 'Brevo API rejected authentication (HTTP 401)',
        };
      },
    };
    const failingMedia: MediaStorageService = {
      ...createSpyMediaStorage(),
      async verifyConnection() {
        return {
          ok: false,
          configured: true,
          latencyMs: 18,
          detail: 'Cloudinary ping failed',
        };
      },
    };

    const failInst = await createApp({
      config: {
        mongodbUri: `${mongod.getUri()}sec_preflight_${++dbCounter}`,
        nodeEnv: 'test',
        isProduction: false,
        adminSeedEmail: 'aseth9588@gmail.com',
      },
      emailTransport: failingTransport,
      mediaStorage: failingMedia,
      startQueueWorker: false,
    });
    try {
      const badRes = await request(failInst.app).get('/api/system/preflight?fresh=1');
      expect(badRes.status).toBe(200);
      expect(badRes.body.overallOk).toBe(false);
      expect(badRes.body.readyForAdminLogin).toBe(false);
      const emailCheck = badRes.body.checks.find((c: { key: string }) => c.key === 'email');
      const cldCheck = badRes.body.checks.find((c: { key: string }) => c.key === 'cloudinary');
      expect(emailCheck.ok).toBe(false);
      expect(emailCheck.status).toBe('error');
      expect(cldCheck.ok).toBe(false);
      expect(cldCheck.status).toBe('error');
    } finally {
      await failInst.close();
    }
  }, 30_000);
});

