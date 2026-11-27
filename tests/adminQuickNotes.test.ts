import { MongoMemoryServer } from 'mongodb-memory-server';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp, type AppInstance } from '../server/app.ts';
import { clearRateLimitStore } from '../server/middleware/security.ts';
import { type MediaStorageService } from '../server/services/cloudinaryService.ts';
import { type EmailTransport, type OutboundEmailPayload } from '../server/services/emailProvider.ts';

function createSpyMediaStorage(): MediaStorageService {
  return {
    isConfigured: () => false,
    async uploadBuffer() {
      throw new Error('Unused in quick notes test');
    },
  };
}

function createSpyTransport(): EmailTransport & { sent: OutboundEmailPayload[] } {
  const sent: OutboundEmailPayload[] = [];
  return {
    sent,
    async send(payload) {
      sent.push(payload);
      return { provider: 'smtp', messageId: `<qnote-${sent.length}@asuleshseth.com>` };
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

describe('Admin Quick Notes API — Auth, Isolation, CRUD & Persistence', () => {
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
        mongodbUri: `${mongod.getUri()}qnotes_test_${++dbCounter}`,
        nodeEnv: 'test',
        isProduction: false,
        emailWebhookSecret: 'qnote-webhook-secret',
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

  it('rejects unauthenticated and non-admin requests to Quick Notes', async () => {
    const { agent: anonAgent, csrf: anonCsrf } = await getAgentWithCsrf(instance.app);
    expect((await anonAgent.get('/api/admin/quick-notes')).status).toBe(401);
    expect(
      (
        await anonAgent
          .post('/api/admin/quick-notes')
          .set('x-csrf-token', anonCsrf)
          .send({ title: 'Unauthorized', description: 'Nope' })
      ).status
    ).toBe(401);

    const { agent: custAgent, csrf: custCsrf0 } = await getAgentWithCsrf(instance.app);
    const custLogin = await custAgent
      .post('/api/auth/login')
      .set('x-csrf-token', custCsrf0)
      .send({ email: 'vikram.seth@heritage.in', password: 'Patron@2026!' });
    expect(custLogin.status).toBe(200);
    const custCsrf = extractCookieValue(custLogin.headers['set-cookie'], 'as_csrf') || custCsrf0;

    expect((await custAgent.get('/api/admin/quick-notes')).status).toBe(403);
    expect(
      (
        await custAgent
          .post('/api/admin/quick-notes')
          .set('x-csrf-token', custCsrf)
          .send({ title: 'Customer attempt', description: 'Blocked' })
      ).status
    ).toBe(403);
    expect(
      (
        await custAgent
          .put('/api/admin/quick-notes/fake-id')
          .set('x-csrf-token', custCsrf)
          .send({ title: 'Blocked' })
      ).status
    ).toBe(403);
    expect(
      (
        await custAgent
          .delete('/api/admin/quick-notes/fake-id')
          .set('x-csrf-token', custCsrf)
      ).status
    ).toBe(403);
  });

  it('supports create, multiple notes, edit timestamps, persistence across sessions, delete, and per-admin isolation', async () => {
    // 1. Login as Super Admin
    const { agent: superAgent, csrf: initCsrf } = await getAgentWithCsrf(instance.app);
    const loginRes = await loginAdminViaOtp(superAgent, initCsrf, spyTransport.sent, 'aseth9588@gmail.com');
    expect(loginRes.status).toBe(200);
    const superCsrf = extractCookieValue(loginRes.headers['set-cookie'], 'as_csrf') || initCsrf;

    // Initial list is empty & existing dashboard endpoints work normally
    const emptyRes = await superAgent.get('/api/admin/quick-notes');
    expect(emptyRes.status).toBe(200);
    expect(emptyRes.body.notes).toEqual([]);
    expect((await superAgent.get('/api/admin/overview')).status).toBe(200);
    expect((await superAgent.get('/api/admin/notifications')).status).toBe(200);

    // 2. Reject invalid note creation
    const badCreate = await superAgent
      .post('/api/admin/quick-notes')
      .set('x-csrf-token', superCsrf)
      .send({ title: '   ', description: 'Missing title' });
    expect(badCreate.status).toBe(400);

    // 3. Create multiple notes
    const create1 = await superAgent
      .post('/api/admin/quick-notes')
      .set('x-csrf-token', superCsrf)
      .send({
        title: 'Purchase reminder',
        description: 'Contact supplier regarding new cashew stock.',
        pinned: true,
        status: 'note',
      });
    expect(create1.status).toBe(201);
    const note1 = create1.body.note;
    expect(note1.title).toBe('Purchase reminder');
    expect(note1.pinned).toBe(true);
    expect(note1.createdAt).toBeTruthy();
    expect(note1.updatedAt).toBe(note1.createdAt);

    const create2 = await superAgent
      .post('/api/admin/quick-notes')
      .set('x-csrf-token', superCsrf)
      .send({
        title: 'Pending tasks',
        description: "- Verify today's payments\n- Check low-stock products",
        pinned: false,
        status: 'pending',
      });
    expect(create2.status).toBe(201);
    const note2 = create2.body.note;

    // 4. Edit note2 -> preserves createdAt, advances updatedAt
    await new Promise(r => setTimeout(r, 15));
    const editRes = await superAgent
      .put(`/api/admin/quick-notes/${note2.id}`)
      .set('x-csrf-token', superCsrf)
      .send({
        title: 'Pending tasks updated',
        description: "- Verify today's payments\n- Check low-stock products\n- Follow up on pending orders",
        status: 'done',
      });
    expect(editRes.status).toBe(200);
    expect(editRes.body.note.title).toBe('Pending tasks updated');
    expect(editRes.body.note.status).toBe('done');
    expect(editRes.body.note.createdAt).toBe(note2.createdAt);
    expect(editRes.body.note.updatedAt).not.toBe(note2.createdAt);

    // Empty PUT rejected cleanly
    expect(
      (
        await superAgent
          .put(`/api/admin/quick-notes/${note2.id}`)
          .set('x-csrf-token', superCsrf)
          .send({})
      ).status
    ).toBe(400);

    // 5. Simulate page refresh / brand-new session -> notes remain persisted and sorted (pinned first)
    const { agent: refreshedAgent, csrf: refreshCsrf0 } = await getAgentWithCsrf(instance.app);
    const refreshLogin = await loginAdminViaOtp(
      refreshedAgent,
      refreshCsrf0,
      spyTransport.sent,
      'aseth9588@gmail.com'
    );
    expect(refreshLogin.status).toBe(200);
    const afterRefresh = await refreshedAgent.get('/api/admin/quick-notes');
    expect(afterRefresh.status).toBe(200);
    expect(afterRefresh.body.notes).toHaveLength(2);
    expect(afterRefresh.body.notes[0].id).toBe(note1.id);
    expect(afterRefresh.body.notes[1].id).toBe(note2.id);
    expect(afterRefresh.body.notes[1].title).toBe('Pending tasks updated');

    // 6. Staff admin isolation: create staff admin & verify separate note space + cross-admin block
    const createStaff = await superAgent
      .post('/api/admin/staff')
      .set('x-csrf-token', superCsrf)
      .send({
        name: 'Inventory Lead',
        email: 'lead@asuleshseth.com',
        phone: '9988776611',
        adminRole: 'staff',
        permissions: ['dashboard'],
      });
    expect(createStaff.status).toBe(201);
    const staffId = createStaff.body.id;

    const { agent: staffAgent, csrf: staffCsrf0 } = await getAgentWithCsrf(instance.app);
    const staffLogin = await loginAdminViaOtp(staffAgent, staffCsrf0, spyTransport.sent, 'lead@asuleshseth.com');
    expect(staffLogin.status).toBe(200);
    const staffCsrf = extractCookieValue(staffLogin.headers['set-cookie'], 'as_csrf') || staffCsrf0;

    // Staff cannot see, modify, or delete Super Admin notes
    const staffList0 = await staffAgent.get('/api/admin/quick-notes');
    expect(staffList0.status).toBe(200);
    expect(staffList0.body.notes).toEqual([]);
    expect(
      (
        await staffAgent
          .put(`/api/admin/quick-notes/${note1.id}`)
          .set('x-csrf-token', staffCsrf)
          .send({ title: 'Tamper attempt' })
      ).status
    ).toBe(404);
    expect(
      (
        await staffAgent
          .delete(`/api/admin/quick-notes/${note1.id}`)
          .set('x-csrf-token', staffCsrf)
      ).status
    ).toBe(404);

    // Staff can create & delete their own note
    const staffNote = await staffAgent
      .post('/api/admin/quick-notes')
      .set('x-csrf-token', staffCsrf)
      .send({ title: 'Staff checklist', description: 'Seal tins before 5 PM' });
    expect(staffNote.status).toBe(201);
    expect((await staffAgent.get('/api/admin/quick-notes')).body.notes).toHaveLength(1);

    // Deactivated staff cannot access Quick Notes
    await superAgent
      .put(`/api/admin/staff/${staffId}`)
      .set('x-csrf-token', superCsrf)
      .send({ isActive: false });
    expect((await staffAgent.get('/api/admin/quick-notes')).status).toBe(401);

    // 7. Super Admin deletes note1 -> persists deletion across refresh
    const refreshCsrf = extractCookieValue(refreshLogin.headers['set-cookie'], 'as_csrf') || refreshCsrf0;
    const delRes = await refreshedAgent
      .delete(`/api/admin/quick-notes/${note1.id}`)
      .set('x-csrf-token', refreshCsrf);
    expect(delRes.status).toBe(200);
    expect(delRes.body.deletedId).toBe(note1.id);

    const finalList = await refreshedAgent.get('/api/admin/quick-notes');
    expect(finalList.status).toBe(200);
    expect(finalList.body.notes).toHaveLength(1);
    expect(finalList.body.notes[0].id).toBe(note2.id);
  });
});
