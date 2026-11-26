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

  it('consolidates multiple pending orders per customer into one email and supports Edit/Update/Hide/Delete of Direct Payment Instructions', async () => {
    const { agent, csrf } = await getAgentWithCsrf(instance.app);
    const loginRes = await loginAdminViaOtp(agent, csrf, spyTransport.sent);
    expect(loginRes.status).toBe(200);
    const csrfAfter = extractCookieValue(loginRes.headers['set-cookie'], 'as_csrf') || csrf;

    // 1. Create two separate unpaid/pending orders for the same customer
    const ord1Res = await agent
      .post('/api/admin/orders')
      .set('x-csrf-token', csrfAfter)
      .send({
        orderSource: 'direct',
        customerName: 'Kinjal Shah',
        customerPhone: '9725394956',
        customerEmail: 'kinjal.shah@example.com',
        deliveryAddress: '401 Solaris Bay View, Piplod',
        city: 'Surat',
        state: 'Gujarat',
        pincode: '395007',
        items: [{ productId: 'kaju', quantity: 1, unitPrice: 688 }],
        paymentMethod: 'upi',
        paymentStatus: 'pending',
        shippingCharge: 0,
        discountAmount: 0,
      });
    expect(ord1Res.status).toBe(201);

    const ord2Res = await agent
      .post('/api/admin/orders')
      .set('x-csrf-token', csrfAfter)
      .send({
        orderSource: 'whatsapp',
        customerName: 'Kinjal Shah',
        customerPhone: '9725394956',
        customerEmail: 'kinjal.shah@example.com',
        deliveryAddress: '401 Solaris Bay View, Piplod',
        city: 'Surat',
        state: 'Gujarat',
        pincode: '395007',
        items: [{ productId: 'badam-california-giri', quantity: 2, unitPrice: 725 }],
        paymentMethod: 'upi',
        paymentStatus: 'pending',
        shippingCharge: 0,
        discountAmount: 0,
      });
    expect(ord2Res.status).toBe(201);

    const ordNum1 = ord1Res.body.order.orderNumber;
    const ordNum2 = ord2Res.body.order.orderNumber;
    // Expected combined outstanding: 688 + 1450 = 2138
    const expectedCombined = 688 + 1450;

    // 2. Get default Direct Payment Instructions
    const getInstrRes = await agent.get('/api/admin/payment-instructions');
    expect(getInstrRes.status).toBe(200);
    expect(getInstrRes.body.instructions.enabled).toBe(true);
    expect(getInstrRes.body.instructions.upiId).toBe('aseth9588-1@okhdfcbank');

    // 3. Edit & Update Direct Payment Instructions
    const putInstrRes = await agent
      .put('/api/admin/payment-instructions')
      .set('x-csrf-token', csrfAfter)
      .send({
        enabled: true,
        heading: 'Updated UPI Settlement Details',
        upiId: 'sethsons.reserve@okicici',
        beneficiary: 'Seth And Sons Reserve LLP',
        extraDetails: 'Bank Transfer: HDFC A/C 50200012345678',
      });
    expect(putInstrRes.status).toBe(200);
    expect(putInstrRes.body.instructions.upiId).toBe('sethsons.reserve@okicici');

    // 4. Consolidated preview includes BOTH orders, items, quantities, combined total, and updated payment instructions
    const previewRes = await agent
      .post('/api/admin/orders/preview-payment-reminder')
      .set('x-csrf-token', csrfAfter)
      .send({ orderNumbers: [ordNum1, ordNum2] });
    expect(previewRes.status).toBe(200);
    expect(previewRes.body.orderCount).toBe(2);
    expect(previewRes.body.totalAmount).toBe(expectedCombined);
    expect(previewRes.body.html).toContain(ordNum1);
    expect(previewRes.body.html).toContain(ordNum2);
    expect(previewRes.body.html).toContain('Qty: 1');
    expect(previewRes.body.html).toContain('Qty: 2');
    expect(previewRes.body.html).toContain('2,138');
    expect(previewRes.body.html).toContain('Updated UPI Settlement Details');
    expect(previewRes.body.html).toContain('sethsons.reserve@okicici');
    expect(previewRes.body.html).toContain('HDFC A/C 50200012345678');

    // 5. Hide Direct Payment Instructions for preview
    const hiddenPreviewRes = await agent
      .post('/api/admin/orders/preview-payment-reminder')
      .set('x-csrf-token', csrfAfter)
      .send({
        orderNumbers: [ordNum1, ordNum2],
        directPaymentInstructions: { enabled: false },
      });
    expect(hiddenPreviewRes.status).toBe(200);
    expect(hiddenPreviewRes.body.html).toContain(ordNum1);
    expect(hiddenPreviewRes.body.html).toContain(ordNum2);
    expect(hiddenPreviewRes.body.html).not.toContain('sethsons.reserve@okicici');
    expect(hiddenPreviewRes.body.html).not.toContain('Updated UPI Settlement Details');

    // 6. Dispatch batch payment reminders -> MUST send only 1 consolidated email to Kinjal Shah
    const sentBefore = spyTransport.sent.length;
    const sendRes = await agent
      .post('/api/admin/orders/send-payment-reminders')
      .set('x-csrf-token', csrfAfter)
      .send({
        orderNumbers: [ordNum1, ordNum2],
        customerOverrides: [
          {
            customerKey: 'email:kinjal.shah@example.com',
            instructions: { enabled: false },
          },
        ],
      });
    expect(sendRes.status).toBe(200);
    expect(sendRes.body.dispatchedCount).toBe(1);
    expect(sendRes.body.customerCount).toBe(1);
    expect(sendRes.body.orderCount).toBe(2);

    const newEmails = spyTransport.sent.slice(sentBefore).filter(m => m.to === 'kinjal.shah@example.com');
    expect(newEmails).toHaveLength(1);
    expect(newEmails[0].subject).toContain('2 Pending Orders');
    expect(newEmails[0].html).toContain(ordNum1);
    expect(newEmails[0].html).toContain(ordNum2);
    expect(newEmails[0].html).toContain('2,138');
    // Hidden for this customer via customerOverrides
    expect(newEmails[0].html).not.toContain('sethsons.reserve@okicici');

    // 7. Delete Direct Payment Instructions
    const delInstrRes = await agent
      .delete('/api/admin/payment-instructions')
      .set('x-csrf-token', csrfAfter);
    expect(delInstrRes.status).toBe(200);
    expect(delInstrRes.body.instructions.deleted).toBe(true);
    expect(delInstrRes.body.instructions.enabled).toBe(false);

    const afterDeletePreview = await agent
      .post('/api/admin/orders/preview-payment-reminder')
      .set('x-csrf-token', csrfAfter)
      .send({ orderNumbers: [ordNum1] });
    expect(afterDeletePreview.status).toBe(200);
    expect(afterDeletePreview.body.html).not.toContain('Direct Payment Instructions');
    expect(afterDeletePreview.body.html).not.toContain('aseth9588-1@okhdfcbank');
  });
});
