import { MongoMemoryServer } from 'mongodb-memory-server';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp, type AppInstance } from '../server/app.ts';
import { seedDatabase } from '../server/db/mongo.ts';
import { clearRateLimitStore } from '../server/middleware/security.ts';
import { createCloudinaryStorage, type MediaStorageService } from '../server/services/cloudinaryService.ts';
import { loadConfig } from '../server/config.ts';
import { type EmailTransport, type OutboundEmailPayload } from '../server/services/emailProvider.ts';

function createSpyMediaStorage(): MediaStorageService & { uploaded: Array<{ folder: string; filename: string; url: string }> } {
  const uploaded: Array<{ folder: string; filename: string; url: string }> = [];
  return {
    uploaded,
    isConfigured: () => true,
    async uploadBuffer(params) {
      const publicId = `${params.folder}/asset_${uploaded.length + 1}`;
      const url = `https://res.cloudinary.com/asulesh-test/image/upload/v1/${publicId}.png`;
      uploaded.push({ folder: params.folder, filename: params.filename, url });
      return { url, publicId, format: 'png', bytes: params.buffer.length };
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
        messageId: `<erp-test-${sent.length}@asuleshseth.com>`,
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

function binaryParser(res: any, callback: (err: Error | null, body: Buffer) => void) {
  const chunks: Buffer[] = [];
  res.on('data', (chunk: Buffer) => chunks.push(chunk));
  res.on('end', () => callback(null, Buffer.concat(chunks)));
}

describe('Seth And Sons DryFruits ERP — RBAC, Catalog, Inventory, Purchases, Returns, P&L & Reports', () => {
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
        mongodbUri: `${mongod.getUri()}erp_test_${++dbCounter}`,
        nodeEnv: 'test',
        isProduction: false,
        emailWebhookSecret: 'erp-webhook-secret',
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

  it('enforces Super Admin vs Staff module RBAC and account deactivation', async () => {
    const { agent: superAgent, csrf: superCsrf } = await getAgentWithCsrf(instance.app);

    const loginRes = await loginAdminViaOtp(superAgent, superCsrf, spyTransport.sent, 'aseth9588@gmail.com');
    expect(loginRes.status).toBe(200);
    const csrfAfter = extractCookieValue(loginRes.headers['set-cookie'], 'as_csrf') || superCsrf;

    // Create Staff scoped strictly to dashboard + inventory (without requiring a password)
    const createStaffRes = await superAgent
      .post('/api/admin/staff')
      .set('x-csrf-token', csrfAfter)
      .send({
        name: 'Warehouse Clerk',
        email: 'clerk@asuleshseth.com',
        phone: '9988776655',
        adminRole: 'staff',
        permissions: ['dashboard', 'inventory'],
      });
    expect(createStaffRes.status).toBe(201);
    const staffId = createStaffRes.body.id;
    expect(staffId).toBeTruthy();

    // Staff login via Admin Email OTP
    const { agent: staffAgent, csrf: staffCsrf0 } = await getAgentWithCsrf(instance.app);
    const staffLogin = await loginAdminViaOtp(staffAgent, staffCsrf0, spyTransport.sent, 'clerk@asuleshseth.com');
    expect(staffLogin.status).toBe(200);
    expect(staffLogin.body.user.adminRole).toBe('staff');
    const staffCsrf = extractCookieValue(staffLogin.headers['set-cookie'], 'as_csrf') || staffCsrf0;

    // Allowed module succeeds
    const invAllowed = await staffAgent.get('/api/admin/inventory/overview');
    expect(invAllowed.status).toBe(200);

    // Unpermitted modules return 403
    const ordersForbidden = await staffAgent.get('/api/admin/orders');
    expect(ordersForbidden.status).toBe(403);

    const prodCreateForbidden = await staffAgent
      .post('/api/admin/erp/products')
      .set('x-csrf-token', staffCsrf)
      .send({ name: 'Unauthorized Item', price: 500, description: 'Forbidden' });
    expect(prodCreateForbidden.status).toBe(403);

    const staffMgmtForbidden = await staffAgent.get('/api/admin/staff');
    expect(staffMgmtForbidden.status).toBe(403);

    // Issue fresh OTP before deactivation, then deactivate staff -> session revoked & OTP verify rejected (403)
    await instance.db.models.VerificationToken.updateMany(
      { emailTarget: 'clerk@asuleshseth.com', purpose: 'admin_login_otp' },
      { $set: { usedAt: new Date().toISOString() } }
    );
    await staffAgent
      .post('/api/auth/admin-otp/request')
      .set('x-csrf-token', staffCsrf)
      .send({ email: 'clerk@asuleshseth.com' });
    const staffOtp2 = [...spyTransport.sent]
      .reverse()
      .find(m => m.to === 'clerk@asuleshseth.com' && m.subject.includes('Admin Portal Login OTP'))!
      .text.match(/\b(\d{6})\b/)![1];

    const deactivateRes = await superAgent
      .put(`/api/admin/staff/${staffId}`)
      .set('x-csrf-token', csrfAfter)
      .send({ isActive: false });
    expect(deactivateRes.status).toBe(200);

    const invAfterDeactivate = await staffAgent.get('/api/admin/inventory/overview');
    expect(invAfterDeactivate.status).toBe(401);

    const reloginBlocked = await staffAgent
      .post('/api/auth/admin-otp/verify')
      .set('x-csrf-token', staffCsrf)
      .send({ email: 'clerk@asuleshseth.com', otp: staffOtp2 });
    expect(reloginBlocked.status).toBe(403);
  });

  it('handles Categories, ERP Products + variants CRUD, and Inventory adjustments with audit logs', async () => {
    const { agent, csrf: initCsrf } = await getAgentWithCsrf(instance.app);
    const login = await loginAdminViaOtp(agent, initCsrf, spyTransport.sent, 'aseth9588@gmail.com');
    const csrf = extractCookieValue(login.headers['set-cookie'], 'as_csrf') || initCsrf;

    // Create category
    const catRes = await agent
      .post('/api/admin/categories')
      .set('x-csrf-token', csrf)
      .send({
        name: 'Gift Hampers & Brass Boxes',
        description: 'Royal wedding assortments',
        storefrontGroup: 'nuts',
      });
    expect(catRes.status).toBe(201);
    const catId = catRes.body.id;

    // Create product with weight variants
    const prodRes = await agent
      .post('/api/admin/erp/products')
      .set('x-csrf-token', csrf)
      .send({
        name: 'Shahi Assorted Dry Fruit Hamper',
        hindiName: '',
        subtitle: 'Gift Edition',
        sku: 'AS-HAMP-01',
        barcode: '',
        purchasePrice: 1400,
        price: 2200,
        discountPrice: 1999,
        gstRate: 5,
        stock: 20,
        minStockAlert: 5,
        unit: 'kg',
        weightLabel: '1kg',
        categoryId: catId,
        image: '/assets/aistudio/00c7c9248fdf2e9e3c775c5368483218_ceac05b8.jpg',
        description: 'Royal hand-packed dry fruit brass gift box.',
        origin: 'Jammu & Kashmir Orchards',
        grade: 'Royal Grade A++',
        expiryDate: null,
        storageInstructions: 'Store cool & dry',
        featured: false,
        status: 'published',
        weightVariants: [
          {
            weightLabel: '500g',
            sku: 'AS-HAMP-500G',
            purchasePrice: 720,
            sellingPrice: 1150,
            stock: 15,
            active: true,
          },
          {
            weightLabel: '1kg',
            sku: 'AS-HAMP-1KG',
            purchasePrice: 1400,
            sellingPrice: 2200,
            stock: 20,
            active: true,
          },
        ],
      });
    expect(prodRes.status).toBe(201);
    const prodId = prodRes.body.id;

    const prodList = await agent.get('/api/admin/erp/products');
    const createdProd = prodList.body.products.find((p: any) => p.id === prodId);
    expect(createdProd.weightVariants).toHaveLength(2);

    // Edit product pricing: set 1 kg cost to ₹800 and save 250g, 500g, and 1kg tiers with 25% margin
    const updateRes = await agent
      .put(`/api/admin/erp/products/${prodId}`)
      .set('x-csrf-token', csrf)
      .send({
        name: 'Shahi Assorted Dry Fruit Hamper',
        subtitle: 'Gift Edition',
        sku: 'AS-HAMP-01',
        purchasePrice: 800,
        price: 1000, // 800 * 1.25 = 1000 (25% margin)
        discountPrice: null,
        gstRate: 5,
        stock: 20,
        minStockAlert: 5,
        unit: 'kg',
        weightLabel: '1kg',
        categoryId: catId,
        image: '/assets/aistudio/00c7c9248fdf2e9e3c775c5368483218_ceac05b8.jpg',
        description: 'Royal hand-packed dry fruit brass gift box.',
        origin: 'Jammu & Kashmir Orchards',
        grade: 'Royal Grade A++',
        storageInstructions: 'Store cool & dry',
        status: 'published',
        weightVariants: [
          {
            weightLabel: '250g',
            sku: 'AS-HAMP-250G',
            purchasePrice: 200, // 800 * 0.25
            sellingPrice: 250,  // 200 * 1.25
            stock: 20,
            active: true,
          },
          {
            weightLabel: '500g',
            sku: 'AS-HAMP-500G',
            purchasePrice: 400, // 800 * 0.5
            sellingPrice: 500,  // 400 * 1.25
            stock: 15,
            active: true,
          },
          {
            weightLabel: '1kg',
            sku: 'AS-HAMP-1KG',
            purchasePrice: 800, // 800 * 1.0
            sellingPrice: 1000, // 800 * 1.25
            stock: 10,
            active: true,
          },
        ],
      });
    expect(updateRes.status).toBe(200);

    // Verify persisted product and variants
    const afterUpdateList = await agent.get('/api/admin/erp/products');
    const updatedHamper = afterUpdateList.body.products.find((p: any) => p.id === prodId);
    expect(updatedHamper.purchasePrice).toBe(800);
    expect(updatedHamper.price).toBe(1000);
    expect(updatedHamper.weightVariants).toHaveLength(3);
    const v250 = updatedHamper.weightVariants.find((v: any) => v.weightLabel === '250g');
    const v500 = updatedHamper.weightVariants.find((v: any) => v.weightLabel === '500g');
    const v1kg = updatedHamper.weightVariants.find((v: any) => v.weightLabel === '1kg');
    expect(v250.purchasePrice).toBe(200);
    expect(v250.sellingPrice).toBe(250);
    expect(v500.purchasePrice).toBe(400);
    expect(v500.sellingPrice).toBe(500);
    expect(v1kg.purchasePrice).toBe(800);
    expect(v1kg.sellingPrice).toBe(1000);

    // Public catalog & categories endpoints expose Admin-configured weight variants & categories
    const pubCats = await request(instance.app).get('/api/categories');
    expect(pubCats.status).toBe(200);
    expect(pubCats.body.categories.some((c: any) => c.id === catId)).toBe(true);

    const pubProds = await request(instance.app).get('/api/products');
    expect(pubProds.status).toBe(200);
    const pubHamper = pubProds.body.products.find((p: any) => p.id === prodId);
    expect(pubHamper).toBeDefined();
    expect(pubHamper.categoryName).toBe('Gift Hampers & Brass Boxes');
    expect(pubHamper.weightVariants).toHaveLength(3);
    expect(pubHamper.weightVariants.map((v: any) => v.weightLabel)).toEqual(['250g', '500g', '1kg']);

    // Duplicate & toggle & delete duplicate
    const dupRes = await agent
      .post(`/api/admin/erp/products/${prodId}/duplicate`)
      .set('x-csrf-token', csrf)
      .send({});
    expect(dupRes.status).toBe(201);
    const dupId = dupRes.body.id;

    const statusRes = await agent
      .patch(`/api/admin/erp/products/${dupId}/status`)
      .set('x-csrf-token', csrf)
      .send({ status: 'published' });
    expect(statusRes.status).toBe(200);

    const delDupRes = await agent
      .delete(`/api/admin/erp/products/${dupId}`)
      .set('x-csrf-token', csrf);
    expect(delDupRes.status).toBe(200);

    // Deleting a seeded product removes it permanently and seedDatabase will NOT re-insert it
    const delSeededRes = await agent
      .delete('/api/admin/erp/products/badam-kagzi-shell')
      .set('x-csrf-token', csrf);
    expect(delSeededRes.status).toBe(200);

    await seedDatabase(instance.db, loadConfig());
    const afterReseed = await instance.db.models.Product.findOne({ id: 'badam-kagzi-shell' }).lean();
    expect(afterReseed).toBeNull();

    // Inventory stock_in + stock_out + audit trail verification
    const adjIn = await agent
      .post('/api/admin/inventory/adjust')
      .set('x-csrf-token', csrf)
      .send({
        productId: prodId,
        movementType: 'stock_in',
        quantity: 12,
        unitCost: 1380,
        batchNumber: 'BATCH-HAMP-09',
        expiryDate: '2027-06-01',
        reason: 'Festival reserve replenishment',
      });
    expect(adjIn.status).toBe(200);

    const adjOut = await agent
      .post('/api/admin/inventory/adjust')
      .set('x-csrf-token', csrf)
      .send({
        productId: prodId,
        movementType: 'stock_out',
        quantity: 5,
        reason: 'Sample showroom hampers',
      });
    expect(adjOut.status).toBe(200);

    const afterProdList = await agent.get('/api/admin/erp/products');
    const updatedProd = afterProdList.body.products.find((p: any) => p.id === prodId);
    expect(updatedProd.stock).toBe(27);

    const invOverview = await agent.get('/api/admin/inventory/overview');
    expect(invOverview.status).toBe(200);
    expect(
      invOverview.body.transactions.some(
        (t: any) =>
          t.productId === prodId &&
          t.movementType === 'stock_in' &&
          Number(t.updatedStock) - Number(t.previousStock) === 12
      )
    ).toBe(true);
    expect(
      invOverview.body.transactions.some(
        (t: any) =>
          t.productId === prodId &&
          t.movementType === 'stock_out' &&
          Number(t.updatedStock) - Number(t.previousStock) === -5
      )
    ).toBe(true);
  });

  it('tracks Supplier PO lifecycle: create ordered PO, receive into inventory, and clear supplier payables', async () => {
    const { agent, csrf: initCsrf } = await getAgentWithCsrf(instance.app);
    const login = await loginAdminViaOtp(agent, initCsrf, spyTransport.sent, 'aseth9588@gmail.com');
    const csrf = extractCookieValue(login.headers['set-cookie'], 'as_csrf') || initCsrf;

    const beforeProducts = await agent.get('/api/admin/erp/products');
    const badam = beforeProducts.body.products.find((p: any) => p.id === 'badam');
    const initialStock = Number(badam.stock);

    // Create supplier
    const supRes = await agent
      .post('/api/admin/suppliers')
      .set('x-csrf-token', csrf)
      .send({
        supplierName: 'Kashmir Crown Growers',
        businessName: 'Pampore Almonds & Kernels Pvt Ltd',
        contactPerson: 'Farooq Shah',
        phone: '9419001122',
        email: 'supply@pamporegrowers.in',
        gstin: '01AABCP9012L1Z2',
        paymentTerms: 'Net 15 Days',
      });
    expect(supRes.status).toBe(201);
    const supplierId = supRes.body.id;

    // Create ordered PO (not yet received, partially paid ₹2000)
    const poRes = await agent
      .post('/api/admin/purchases')
      .set('x-csrf-token', csrf)
      .send({
        supplierId,
        purchaseDate: '2026-11-10',
        additionalExpenses: 250,
        paymentStatus: 'partial',
        paidAmount: 2000,
        receiveImmediately: false,
        items: [
          {
            productId: 'badam',
            quantity: 10,
            purchasePrice: 780,
            gstRate: 5,
            batchNumber: 'BAD-2026-NOV',
          },
        ],
      });
    expect(poRes.status).toBe(201);
    const poId = poRes.body.id;

    const poList = await agent.get('/api/admin/purchases');
    const createdPo = poList.body.purchases.find((p: any) => p.id === poId);
    expect(createdPo.status).toBe('ordered');
    // Subtotal 7800 + GST 390 + Freight 250 = 8440
    expect(createdPo.totalAmount).toBe(8440);

    // Verify stock has NOT changed yet while PO is only ordered
    const midProducts = await agent.get('/api/admin/erp/products');
    const midBadam = midProducts.body.products.find((p: any) => p.id === 'badam');
    expect(Number(midBadam.stock)).toBe(initialStock);

    // Receive PO -> auto increments stock by 10
    const recRes = await agent
      .post(`/api/admin/purchases/${poId}/receive`)
      .set('x-csrf-token', csrf)
      .send({});
    expect(recRes.status).toBe(200);

    const afterProducts = await agent.get('/api/admin/erp/products');
    const afterBadam = afterProducts.body.products.find((p: any) => p.id === 'badam');
    expect(Number(afterBadam.stock)).toBe(initialStock + 10);

    // Record remaining payable balance (8440 - 2000 = 6440)
    const payRes = await agent
      .post(`/api/admin/purchases/${poId}/payment`)
      .set('x-csrf-token', csrf)
      .send({ amount: 6440 });
    expect(payRes.status).toBe(200);

    const supList = await agent.get('/api/admin/suppliers');
    const supEntry = supList.body.suppliers.find((s: any) => s.id === supplierId);
    expect(supEntry.outstandingBalance).toBe(0);
    expect(supEntry.totalVolume).toBe(8440);

    // Edit PO quantity from 10 to 15 and attach invoice URL -> stock adjusts cleanly to initialStock + 15
    const editPoRes = await agent
      .put(`/api/admin/purchases/${poId}`)
      .set('x-csrf-token', csrf)
      .send({
        supplierId,
        purchaseDate: '2026-11-10',
        additionalExpenses: 250,
        paymentStatus: 'paid',
        paidAmount: 0,
        invoiceFile: 'https://res.cloudinary.com/asulesh-test/raw/upload/v1/invoices/po_bill.pdf',
        notes: 'Updated quantity & uploaded bill',
        items: [
          {
            productId: 'badam',
            quantity: 15,
            purchasePrice: 780,
            gstRate: 5,
            batchNumber: 'BAD-2026-NOV',
          },
        ],
      });
    expect(editPoRes.status).toBe(200);
    const editedProds = await agent.get('/api/admin/erp/products');
    expect(Number(editedProds.body.products.find((p: any) => p.id === 'badam').stock)).toBe(initialStock + 15);

    // Set badam stock to 0 via adjustment -> Admin receives out_of_stock alert in notifications
    const zeroAdjRes = await agent
      .post('/api/admin/inventory/adjust')
      .set('x-csrf-token', csrf)
      .send({ productId: 'badam', movementType: 'adjustment', quantity: 0, reason: 'Zero stock test' });
    expect(zeroAdjRes.status).toBe(200);

    const notifRes = await agent.get('/api/admin/notifications');
    expect(notifRes.status).toBe(200);
    expect(notifRes.body.stockAlerts?.outOfStockCount).toBeGreaterThanOrEqual(1);
    expect(
      notifRes.body.notifications.some(
        (n: any) => n.type === 'out_of_stock' && n.entityId === 'badam' && !n.isRead
      )
    ).toBe(true);

    // Delete PO -> removes PO cleanly without error and restores badam stock back to baseline
    const delPoRes = await agent
      .delete(`/api/admin/purchases/${poId}`)
      .set('x-csrf-token', csrf);
    expect(delPoRes.status).toBe(200);
    const afterDelList = await agent.get('/api/admin/purchases');
    expect(afterDelList.body.purchases.some((p: any) => p.id === poId)).toBe(false);

    // Restore badam stock cleanly for subsequent tests
    await agent
      .post('/api/admin/inventory/adjust')
      .set('x-csrf-token', csrf)
      .send({ productId: 'badam', movementType: 'adjustment', quantity: initialStock, reason: 'Restore test stock' });
  });

  it('generates PDF invoices, restores stock on order return, computes P&L accurately, and exports PDF/XLSX/CSV reports', async () => {
    const { agent: adminAgent, csrf: adminInitCsrf } = await getAgentWithCsrf(instance.app);
    const adminLogin = await loginAdminViaOtp(adminAgent, adminInitCsrf, spyTransport.sent, 'aseth9588@gmail.com');
    const adminCsrf = extractCookieValue(adminLogin.headers['set-cookie'], 'as_csrf') || adminInitCsrf;

    // Login verified patron Vikram to place an order
    const { agent: custAgent, csrf: custCsrf0 } = await getAgentWithCsrf(instance.app);
    const custLogin = await custAgent
      .post('/api/auth/login')
      .set('x-csrf-token', custCsrf0)
      .send({ email: 'vikram.seth@heritage.in', password: 'Patron@2026!' });
    expect(custLogin.status).toBe(200);
    const custCsrf = extractCookieValue(custLogin.headers['set-cookie'], 'as_csrf') || custCsrf0;

    const beforeProds = await adminAgent.get('/api/admin/erp/products');
    const kajuStockBefore = Number(beforeProds.body.products.find((p: any) => p.id === 'kaju').stock);

    const orderRes = await custAgent
      .post('/api/orders')
      .set('x-csrf-token', custCsrf)
      .send({
        items: [{ productId: 'kaju', quantity: 2 }],
        deliveryAddress: {
          fullName: 'Vikramaditya Seth',
          mobileNumber: '9812345678',
          deliveryAddress: '14 Heritage Lane, Talab Tillo',
          city: 'Jammu',
          state: 'Jammu & Kashmir',
          pincode: '180002',
        },
        paymentMethod: 'upi',
      });
    expect(orderRes.status).toBe(201);
    const orderNumber = orderRes.body.order.orderNumber;

    // Confirm stock decreased by 2
    const duringProds = await adminAgent.get('/api/admin/erp/products');
    expect(Number(duringProds.body.products.find((p: any) => p.id === 'kaju').stock)).toBe(kajuStockBefore - 2);

    // Download PDF Invoice and inspect %PDF- header
    const invoiceRes = await adminAgent
      .get(`/api/admin/orders/${encodeURIComponent(orderNumber)}/invoice.pdf`)
      .buffer(true)
      .parse(binaryParser);
    expect(invoiceRes.status).toBe(200);
    expect(invoiceRes.headers['content-type']).toContain('application/pdf');
    expect((invoiceRes.body as Buffer).subarray(0, 5).toString('utf8')).toBe('%PDF-');

    // Mark order returned -> restores stock by 2
    const retRes = await adminAgent
      .post(`/api/admin/orders/${encodeURIComponent(orderNumber)}/return`)
      .set('x-csrf-token', adminCsrf)
      .send({ reason: 'Outer box dented in transit' });
    expect(retRes.status).toBe(200);

    const afterRetProds = await adminAgent.get('/api/admin/erp/products');
    expect(Number(afterRetProds.body.products.find((p: any) => p.id === 'kaju').stock)).toBe(kajuStockBefore);

    const beforeFinRes = await adminAgent.get('/api/admin/finance/summary');
    expect(beforeFinRes.status).toBe(200);
    const baseOpEx = Number(beforeFinRes.body.summary.operatingExpenses || 0);

    // Record operating expense ₹1,500 and verify P&L math
    const expRes = await adminAgent
      .post('/api/admin/expenses')
      .set('x-csrf-token', adminCsrf)
      .send({
        category: 'Packaging',
        title: 'Vacuum Pouches & Gold Ribbon',
        amount: 1500,
        expenseDate: '2026-11-11',
        vendor: 'Jammu Print Pack',
        paymentMode: 'UPI',
      });
    expect(expRes.status).toBe(201);

    const finRes = await adminAgent.get('/api/admin/finance/summary');
    expect(finRes.status).toBe(200);
    const s = finRes.body.summary;
    expect(s.operatingExpenses).toBe(baseOpEx + 1500);
    expect(s.estimatedGrossProfit).toBeCloseTo(s.netSales - s.cogs, 2);
    expect(s.estimatedNetProfit).toBeCloseTo(s.estimatedGrossProfit - s.operatingExpenses, 2);

    // Coupon CRUD
    const cpnCreate = await adminAgent
      .post('/api/admin/coupons')
      .set('x-csrf-token', adminCsrf)
      .send({
        code: 'WINTER20',
        title: 'Winter Reserve Offer',
        description: '20% off dry fruits',
        discountType: 'percentage',
        discountValue: 20,
        minOrderValue: 1500,
        maxDiscount: 600,
        active: true,
      });
    expect(cpnCreate.status).toBe(201);
    const cpnId = cpnCreate.body.id;

    const cpnUpdate = await adminAgent
      .put(`/api/admin/coupons/${cpnId}`)
      .set('x-csrf-token', adminCsrf)
      .send({ discountValue: 25, active: false });
    expect(cpnUpdate.status).toBe(200);

    const cpnDel = await adminAgent
      .delete(`/api/admin/coupons/${cpnId}`)
      .set('x-csrf-token', adminCsrf);
    expect(cpnDel.status).toBe(200);

    // Reports preview & exports (PDF, XLSX, CSV)
    for (const type of ['daily_sales', 'inventory', 'profit_loss', 'gst_summary', 'expense']) {
      const r = await adminAgent.get(`/api/admin/reports/preview?type=${type}`);
      expect(r.status).toBe(200);
      expect(Array.isArray(r.body.report.columns)).toBe(true);
    }

    const pdfExp = await adminAgent
      .get('/api/admin/reports/export?type=profit_loss&format=pdf')
      .buffer(true)
      .parse(binaryParser);
    expect(pdfExp.status).toBe(200);
    expect((pdfExp.body as Buffer).subarray(0, 5).toString('utf8')).toBe('%PDF-');

    const xlsxExp = await adminAgent
      .get('/api/admin/reports/export?type=inventory&format=xlsx')
      .buffer(true)
      .parse(binaryParser);
    expect(xlsxExp.status).toBe(200);
    expect((xlsxExp.body as Buffer).subarray(0, 2).toString('utf8')).toBe('PK');

    const csvExp = await adminAgent.get('/api/admin/reports/export?type=expense&format=csv');
    expect(csvExp.status).toBe(200);
    expect(csvExp.text).toContain('Vacuum Pouches & Gold Ribbon');

    // Website & Business Settings + Public settings reflection + Global Search
    const webPut = await adminAgent
      .put('/api/admin/settings/website')
      .set('x-csrf-token', adminCsrf)
      .send({
        brandName: 'Seth And Sons Heritage DryFruits',
        tagline: 'Finest Kashmiri & Jammu Harvests',
        featuredProductIds: ['badam', 'kesar'],
      });
    expect(webPut.status).toBe(200);

    const pubSet = await request(instance.app).get('/api/settings/public');
    expect(pubSet.status).toBe(200);
    expect(pubSet.body.website.brandName).toBe('Seth And Sons Heritage DryFruits');

    const bizPut = await adminAgent
      .put('/api/admin/settings/business')
      .set('x-csrf-token', adminCsrf)
      .send({ defaultGstRate: 12, freeShippingThreshold: 2500 });
    expect(bizPut.status).toBe(200);
    expect(bizPut.body.settings.defaultGstRate).toBe(12);

    const searchRes = await adminAgent.get('/api/admin/search?q=Badam');
    expect(searchRes.status).toBe(200);
    expect(searchRes.body.products.length).toBeGreaterThan(0);

    // Regex metacharacters in search query are escaped cleanly
    const regexSearchRes = await adminAgent.get('/api/admin/search?q=Badam[');
    expect(regexSearchRes.status).toBe(200);

    // Server-side pagination + Profit vs Expense dashboard chart + Health endpoint
    const pagedProducts = await adminAgent.get('/api/admin/erp/products?page=1&limit=2');
    expect(pagedProducts.status).toBe(200);
    expect(pagedProducts.body.products.length).toBe(2);
    expect(pagedProducts.body.pagination.total).toBeGreaterThanOrEqual(4);

    const dashRes = await adminAgent.get('/api/admin/dashboard/analytics?range=30d');
    expect(dashRes.status).toBe(200);
    expect(Array.isArray(dashRes.body.charts.profitVsExpense)).toBe(true);

    const healthRes = await request(instance.app).get('/api/health');
    expect(healthRes.status).toBe(200);
    expect(healthRes.body.database).toBe('mongodb-connected');
  });

  it('uploads admin assets to Cloudinary, fails cleanly when Cloudinary is unconfigured, and blocks NoSQL operator injection', async () => {
    const { agent, csrf } = await getAgentWithCsrf(instance.app);

    // NoSQL operator injection attempt cannot bypass OTP auth
    const nosqlOtpReq = await agent
      .post('/api/auth/admin-otp/request')
      .set('x-csrf-token', csrf)
      .send({ email: { $ne: '' } });
    expect(nosqlOtpReq.status).toBe(400);

    const nosqlOtpVerify = await agent
      .post('/api/auth/admin-otp/verify')
      .set('x-csrf-token', csrf)
      .send({ email: { $ne: '' }, otp: { $gt: '' } });
    expect(nosqlOtpVerify.status).toBe(400);

    // Legit admin OTP login
    const loginRes = await loginAdminViaOtp(agent, csrf, spyTransport.sent, 'aseth9588@gmail.com');
    expect(loginRes.status).toBe(200);
    const csrfAfter = extractCookieValue(loginRes.headers['set-cookie'], 'as_csrf') || csrf;

    const png1x1 = Buffer.from(
      '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c63000100000500010d0a2db40000000049454e44ae426082',
      'hex'
    );

    const endpoints = [
      { path: '/api/admin/products/upload-image', field: 'image', responseKey: 'imageUrl', expectedFolder: 'products' },
      { path: '/api/admin/communications/logo', field: 'logo', responseKey: 'brandLogoUrl', expectedFolder: 'branding' },
      { path: '/api/admin/marketing/upload-banner', field: 'banner', responseKey: 'bannerImage', expectedFolder: 'banners' },
      { path: '/api/admin/expenses/upload-receipt', field: 'receipt', responseKey: 'receiptUrl', expectedFolder: 'receipts' },
      { path: '/api/admin/purchases/upload-invoice', field: 'invoice', responseKey: 'invoiceFile', expectedFolder: 'invoices' },
    ];

    for (const ep of endpoints) {
      const res = await agent
        .post(ep.path)
        .set('x-csrf-token', csrfAfter)
        .attach(ep.field, png1x1, { filename: 'sample.png', contentType: 'image/png' });
      expect(res.status).toBe(200);
      expect(res.body[ep.responseKey]).toMatch(/^https:\/\/res\.cloudinary\.com\//);
      expect(spyMedia.uploaded.some(u => u.folder === ep.expectedFolder)).toBe(true);
    }

    // Real Cloudinary service fails cleanly with statusCode 503 if keys are missing
    const unconfiguredStorage = createCloudinaryStorage({
      ...loadConfig(),
      cloudinaryCloudName: '',
      cloudinaryApiKey: '',
      cloudinaryApiSecret: '',
      cloudinaryUrl: '',
    });
    expect(unconfiguredStorage.isConfigured()).toBe(false);
    await expect(
      unconfiguredStorage.uploadBuffer({ buffer: png1x1, filename: 'x.png', folder: 'products' })
    ).rejects.toMatchObject({ statusCode: 503 });
  });

  it('validates, deep-merges, persists, and publicly exposes Website & Business settings cleanly', async () => {
    const { agent, csrf } = await getAgentWithCsrf(instance.app);
    const loginRes = await loginAdminViaOtp(agent, csrf, spyTransport.sent, 'aseth9588@gmail.com');
    expect(loginRes.status).toBe(200);
    const csrfAfter = extractCookieValue(loginRes.headers['set-cookie'], 'as_csrf') || csrf;

    // 1. Website Settings validation rejects unsafe javascript: URL
    const badWeb = await agent
      .put('/api/admin/settings/website')
      .set('x-csrf-token', csrfAfter)
      .send({ logoUrl: 'javascript:alert(1)' });
    expect(badWeb.status).toBe(400);

    // 2. Partial Website update preserves nested socialLinks fields and updates public endpoint
    const saveWeb = await agent
      .put('/api/admin/settings/website')
      .set('x-csrf-token', csrfAfter)
      .send({
        brandName: 'Seth And Sons Reserve',
        contactEmail: 'aseth9588@gmail.com',
        socialLinks: { whatsapp: '+919900112233' },
      });
    expect(saveWeb.status).toBe(200);
    expect(saveWeb.body.settings.brandName).toBe('Seth And Sons Reserve');
    expect(saveWeb.body.settings.socialLinks.whatsapp).toBe('+919900112233');
    expect(saveWeb.body.settings.socialLinks.instagram).toContain('instagram.com');

    // 3. Business Settings validation rejects negative GST
    const badBiz = await agent
      .put('/api/admin/settings/business')
      .set('x-csrf-token', csrfAfter)
      .send({ defaultGstRate: -5 });
    expect(badBiz.status).toBe(400);

    // 4. Partial Business update preserves notificationPreferences & updates public checkout config
    const saveBiz = await agent
      .put('/api/admin/settings/business')
      .set('x-csrf-token', csrfAfter)
      .send({
        defaultGstRate: 12,
        defaultShippingCharge: 150,
        freeShippingThreshold: 3000,
        notificationPreferences: { lowStockAlerts: false },
      });
    expect(saveBiz.status).toBe(200);
    expect(saveBiz.body.settings.defaultGstRate).toBe(12);
    expect(saveBiz.body.settings.defaultShippingCharge).toBe(150);
    expect(saveBiz.body.settings.freeShippingThreshold).toBe(3000);
    expect(saveBiz.body.settings.notificationPreferences.lowStockAlerts).toBe(false);
    expect(saveBiz.body.settings.notificationPreferences.newOrderAlerts).toBe(true);

    const pubRes = await agent.get('/api/settings/public');
    expect(pubRes.status).toBe(200);
    expect(pubRes.body.website.brandName).toBe('Seth And Sons Reserve');
    expect(pubRes.body.business.defaultGstRate).toBe(12);
    expect(pubRes.body.business.defaultShippingCharge).toBe(150);
    expect(pubRes.body.business.freeShippingThreshold).toBe(3000);
  });
});
