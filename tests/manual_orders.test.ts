import { MongoMemoryServer } from 'mongodb-memory-server';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp, type AppInstance } from '../server/app.ts';
import { clearRateLimitStore } from '../server/middleware/security.ts';
import { type EmailTransport, type OutboundEmailPayload } from '../server/services/emailProvider.ts';
import { type MediaStorageService } from '../server/services/cloudinaryService.ts';

function createSpyTransport(): EmailTransport & { sent: OutboundEmailPayload[] } {
  const sent: OutboundEmailPayload[] = [];
  return {
    sent,
    async send(payload) {
      sent.push(payload);
      return {
        provider: 'smtp',
        messageId: `<manual-orders-test-${sent.length}@asuleshseth.com>`,
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

function createSpyMediaStorage(): MediaStorageService {
  return {
    isConfigured: () => true,
    async verifyConnection() {
      return { ok: true, configured: true, latencyMs: 5, detail: 'Test media storage OK' };
    },
    async uploadBuffer(params) {
      return {
        url: `https://res.cloudinary.com/demo/image/upload/v1/${params.filename}`,
        publicId: `orders/payments/${params.filename}`,
        bytes: params.buffer.length,
      };
    },
    async deleteAsset() {
      return true;
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

describe('Admin Manual Orders (WhatsApp / Phone) & Invoice Generation', () => {
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
        mongodbUri: `${mongod.getUri()}orders_test_${++dbCounter}`,
        nodeEnv: 'test',
        isProduction: false,
        emailWebhookSecret: 'orders-webhook-secret',
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

  it('uploads payment proof (screenshot/receipt) to media storage', async () => {
    const { agent, csrf } = await getAgentWithCsrf(instance.app);
    const loginRes = await loginAdminViaOtp(agent, csrf, spyTransport.sent);
    expect(loginRes.status).toBe(200);

    const fakeScreenshot = Buffer.from('fake-screenshot-image-content');
    const res = await agent
      .post('/api/admin/orders/upload-payment-proof')
      .set('x-csrf-token', csrf)
      .attach('paymentProof', fakeScreenshot, 'whatsapp_payment.png');

    expect(res.status).toBe(200);
    expect(res.body.paymentScreenshotUrl).toContain('https://res.cloudinary.com/demo/image/upload/');
  });

  it('creates manual order received via WhatsApp with payment screenshot, reference & catalog product', async () => {
    const { agent, csrf } = await getAgentWithCsrf(instance.app);
    const loginRes = await loginAdminViaOtp(agent, csrf, spyTransport.sent);
    expect(loginRes.status).toBe(200);

    // 1. Check starting stock for kaju
    const initialProduct = await instance.db.models.Product.findOne({ id: 'kaju' }).lean();
    expect(initialProduct).toBeDefined();
    const initialStock = Number(initialProduct!.stock || 0);

    // 2. Submit manual order
    const payload = {
      orderSource: 'whatsapp',
      customerName: 'Vikram Jamwal',
      customerPhone: '9876501234',
      customerEmail: 'vikram.jamwal@example.com',
      deliveryAddress: 'House 42, Circular Road',
      city: 'Jammu',
      state: 'Jammu & Kashmir',
      pincode: '180001',
      items: [
        {
          productId: 'kaju',
          quantity: 2,
          unitPrice: 1372,
        },
      ],
      paymentMethod: 'upi',
      paymentStatus: 'paid',
      paymentReference: 'UPI-UTR-998877665544',
      paymentScreenshotUrl: 'https://res.cloudinary.com/demo/image/upload/v1/payment_screenshot.png',
      shippingCharge: 0,
      discountAmount: 100,
      internalNotes: 'Order received via WhatsApp chat. Dispatched via BlueDart express.',
    };

    const res = await agent
      .post('/api/admin/orders')
      .set('x-csrf-token', csrf)
      .send(payload);

    expect(res.status).toBe(201);
    expect(res.body.ok).toBe(true);
    expect(res.body.order).toBeDefined();
    expect(res.body.order.orderSource).toBe('whatsapp');
    expect(res.body.order.paymentMethod).toBe('UPI');
    expect(res.body.order.paymentStatus).toBe('paid');
    expect(res.body.order.paymentReference).toBe('UPI-UTR-998877665544');
    expect(res.body.order.paymentScreenshotUrl).toBe('https://res.cloudinary.com/demo/image/upload/v1/payment_screenshot.png');
    expect(res.body.invoiceUrl).toContain('/api/admin/orders/');

    // 3. Verify stock deduction
    const updatedProduct = await instance.db.models.Product.findOne({ id: 'kaju' }).lean();
    expect(Number(updatedProduct!.stock)).toBe(Math.max(0, initialStock - 2));

    // 4. Fetch the final invoice PDF
    const orderNumber = res.body.order.orderNumber;
    const invoiceRes = await agent
      .get(`/api/admin/orders/${encodeURIComponent(orderNumber)}/invoice.pdf`);

    expect(invoiceRes.status).toBe(200);
    expect(invoiceRes.headers['content-type']).toBe('application/pdf');
    expect(invoiceRes.body).toBeInstanceOf(Buffer);
    expect(invoiceRes.body.length).toBeGreaterThan(100);

    // 5. Verify customer is marked as isOneTime: true and segregated from primary registered list
    const customer = await instance.db.models.Customer.findOne({ email: 'vikram.jamwal@example.com' }).lean();
    expect(customer).toBeDefined();
    expect(customer!.isOneTime).toBe(true);
    expect(customer!.source).toBe('whatsapp');

    // Default registered patrons list MUST NOT include one-time manual patrons
    const regCustRes = await agent
      .get('/api/admin/customers')
      .set('x-csrf-token', csrf);
    expect(regCustRes.status).toBe(200);
    const foundInReg = (regCustRes.body.customers || []).some((c: any) => c.email === 'vikram.jamwal@example.com');
    expect(foundInReg).toBe(false);

    // One-time customers list MUST include the manual patron
    const oneTimeCustRes = await agent
      .get('/api/admin/customers?customerType=one_time')
      .set('x-csrf-token', csrf);
    expect(oneTimeCustRes.status).toBe(200);
    const foundInOneTime = (oneTimeCustRes.body.customers || []).some((c: any) => c.email === 'vikram.jamwal@example.com');
    expect(foundInOneTime).toBe(true);

    // 6. Verify uploading / replacing payment screenshot after invoice generation
    const proofRes = await agent
      .put(`/api/admin/orders/${encodeURIComponent(orderNumber)}/payment-proof`)
      .set('x-csrf-token', csrf)
      .send({
        paymentScreenshotUrl: 'https://res.cloudinary.com/demo/image/upload/v2/new_receipt.png',
        paymentReference: 'UPI-NEW-REF-1234',
      });
    expect(proofRes.status).toBe(200);
    expect(proofRes.body.ok).toBe(true);
    expect(proofRes.body.order.paymentScreenshotUrl).toBe('https://res.cloudinary.com/demo/image/upload/v2/new_receipt.png');
    expect(proofRes.body.order.paymentReference).toBe('UPI-NEW-REF-1234');

    // 7. Verify editing manual order details (items, custom price, customer info)
    const editRes = await agent
      .put(`/api/admin/orders/${encodeURIComponent(orderNumber)}/manual-edit`)
      .set('x-csrf-token', csrf)
      .send({
        customerName: 'Vikram Jamwal (Updated)',
        customerPhone: '9876509999',
        customerEmail: 'vikram.jamwal@example.com',
        deliveryAddress: 'House 99, Gandhi Nagar',
        city: 'Jammu',
        state: 'Jammu & Kashmir',
        pincode: '180004',
        items: [
          {
            productId: 'kaju',
            quantity: 3,
            unitPrice: 1250,
          },
        ],
        paymentMethod: 'upi',
        paymentStatus: 'paid',
        paymentReference: 'UPI-NEW-REF-1234',
        paymentScreenshotUrl: 'https://res.cloudinary.com/demo/image/upload/v2/new_receipt.png',
        shippingCharge: 50,
        discountAmount: 50,
        internalNotes: 'Updated order quantities from 2 to 3 units with custom price 1250.',
      });

    expect(editRes.status).toBe(200);
    expect(editRes.body.ok).toBe(true);
    expect(editRes.body.order.deliveryAddressObj.fullName).toBe('Vikram Jamwal (Updated)');
    expect(editRes.body.order.items).toHaveLength(1);
    expect(editRes.body.order.items[0].quantity).toBe(3);
    expect(editRes.body.order.items[0].unitPrice).toBe(1250);
    // Subtotal: 3 * 1250 = 3750, Total: 3750 - 50 + 50 = 3750
    expect(editRes.body.order.totalAmount).toBe(3750);

    // Stock should now reflect 3 units deducted from initialStock (restored 2, deducted 3)
    const stockAfterEdit = await instance.db.models.Product.findOne({ id: 'kaju' }).lean();
    expect(Number(stockAfterEdit!.stock)).toBe(Math.max(0, initialStock - 3));
  });
});
