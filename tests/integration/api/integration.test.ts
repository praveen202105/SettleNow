import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { OrderResponse } from '@settleflow/shared';

import { createApp } from '../../../apps/api/src/app.js';
import type {
  GoogleAuthorizationInput,
  GoogleCallbackInput,
  GoogleOidcClient,
  GoogleProfile,
} from '../../../apps/api/src/auth/google.js';
import { processOrderExport } from '../../../apps/api/src/jobs/exportProcessor.js';
import { notifyPaymentRecorded } from '../../../apps/api/src/jobs/notificationProcessor.js';
import { prisma } from '../../../apps/api/src/lib/prisma.js';
import { disconnectRedis, redis } from '../../../apps/api/src/lib/redis.js';
import type { MailMessage, MailTransport } from '../../../apps/api/src/services/mailer.js';

const app = createApp();

class FakeGoogleOidcClient implements GoogleOidcClient {
  profiles = new Map<string, GoogleProfile>();

  async createAuthorizationUrl(input: GoogleAuthorizationInput): Promise<string> {
    const url = new URL('https://accounts.google.test/authorize');
    url.searchParams.set('state', input.state);
    return Promise.resolve(url.toString());
  }

  async exchangeCallback(input: GoogleCallbackInput): Promise<GoogleProfile> {
    const code = input.callbackUrl.searchParams.get('code') ?? '';
    const profile = this.profiles.get(code);
    if (!profile) throw new Error('Unknown fake authorization code');
    return Promise.resolve(profile);
  }
}

const fakeGoogle = new FakeGoogleOidcClient();
const googleApp = createApp({ googleEnabled: true, googleOidcClient: fakeGoogle });
type TestAgent = ReturnType<typeof request.agent>;

const validOrder = {
  dueDate: '2099-01-15',
  lineItems: [{ description: 'Implementation', quantity: 1, unitPriceCents: 100_000 }],
};

let customerSequence = 0;

function signup(agent: TestAgent, email: string) {
  return agent.post('/api/v1/auth/signup').send({
    displayName: 'Test User',
    email,
    password: 'SecurePass123!',
  });
}

async function createCustomer(
  agent: TestAgent,
  name = 'Acme Corporation',
  mobile = `+919100${String(++customerSequence).padStart(6, '0')}`,
) {
  return agent.post('/api/v1/customers').send({ mobile, name });
}

async function createOrder(
  agent: TestAgent,
  overrides: Record<string, unknown> = {},
  customerName = 'Acme Corporation',
) {
  const customerId =
    typeof overrides.customerId === 'string'
      ? overrides.customerId
      : ((await createCustomer(agent, customerName)).body.data.id as string);
  return agent.post('/api/v1/orders').send({ ...validOrder, customerId, ...overrides });
}

async function startGoogle(
  agent: TestAgent,
  intent: 'signin' | 'link' = 'signin',
  returnTo = intent === 'link' ? '/settings/security?google=linked' : '/orders',
) {
  const response = await agent
    .post('/api/v1/auth/google/start')
    .set(
      'referer',
      intent === 'link' ? 'http://localhost:5173/settings/security' : 'http://localhost:5173/login',
    )
    .send({ intent, returnTo });
  expect(response.status).toBe(200);
  const authorizationUrl = new URL(response.body.data.authorizationUrl as string);
  return authorizationUrl.searchParams.get('state')!;
}

async function finishGoogle(
  agent: TestAgent,
  state: string,
  profile: GoogleProfile,
  code = `code-${Date.now()}-${Math.random()}`,
) {
  fakeGoogle.profiles.set(code, profile);
  return agent.get('/api/v1/auth/google/callback').query({ code, state });
}

beforeAll(async () => {
  await prisma.$connect();
});

beforeEach(async () => {
  await prisma.user.deleteMany();
  customerSequence = 0;
  fakeGoogle.profiles.clear();
  const keys = await redis.keys('settleflow:*');
  if (keys.length > 0) await redis.del(...keys);
});

afterAll(async () => {
  await Promise.all([prisma.$disconnect(), disconnectRedis()]);
});

describe('authentication', () => {
  it('supports signup, current user, logout, and login with a revocable cookie', async () => {
    const agent = request.agent(app);
    const created = await signup(agent, 'auth@example.com');
    expect(created.status).toBe(201);
    expect(created.headers['set-cookie']?.[0]).toContain('HttpOnly');

    const me = await agent.get('/api/v1/auth/me');
    expect(me.status).toBe(200);
    expect(me.body.data.email).toBe('auth@example.com');

    expect((await agent.post('/api/v1/auth/logout')).status).toBe(200);
    const signedOut = await agent.get('/api/v1/auth/me');
    expect(signedOut.status).toBe(401);
    expect(signedOut.body.error).toMatchObject({ code: 'AUTH_REQUIRED' });
    expect(signedOut.body.error.requestId).toEqual(expect.any(String));

    const login = await agent.post('/api/v1/auth/login').send({
      email: 'auth@example.com',
      password: 'SecurePass123!',
    });
    expect(login.status).toBe(200);
    expect((await agent.get('/api/v1/auth/me')).status).toBe(200);
  });

  it('returns stable validation and duplicate-account error contracts', async () => {
    const first = request.agent(app);
    const second = request.agent(app);
    expect((await signup(first, 'same@example.com')).status).toBe(201);

    const duplicate = await signup(second, 'same@example.com');
    expect(duplicate.status).toBe(409);
    expect(duplicate.body.error.code).toBe('EMAIL_IN_USE');

    const invalid = await second.post('/api/v1/auth/signup').send({ email: 'bad', password: 'x' });
    expect(invalid.status).toBe(422);
    expect(invalid.body.error).toMatchObject({ code: 'VALIDATION_ERROR' });
    expect(invalid.body.error.fieldErrors).toBeTypeOf('object');
  });

  it('creates and returns a Google-only user through a single-use OAuth state', async () => {
    const agent = request.agent(googleApp);
    expect((await request(app).get('/api/v1/auth/config')).body.data.providers.google).toBe(false);
    expect((await request(googleApp).get('/api/v1/auth/config')).body.data.providers.google).toBe(
      true,
    );

    const profile = {
      displayName: 'Google User',
      email: 'google@example.com',
      emailVerified: true,
      subject: 'google-subject-1',
    };
    const state = await startGoogle(agent);
    const callback = await finishGoogle(agent, state, profile, 'google-code-1');
    expect(callback.status).toBe(302);
    expect(callback.headers.location).toBe('/orders');
    expect(callback.headers['set-cookie']?.[0]).toContain('HttpOnly');

    const me = await agent.get('/api/v1/auth/me');
    expect(me.body.data).toMatchObject({
      authMethods: ['google'],
      displayName: 'Google User',
      email: 'google@example.com',
    });
    expect((await agent.delete('/api/v1/auth/google/link')).body.error.code).toBe(
      'LAST_AUTH_METHOD',
    );
    const linkWithoutPasswordSession = await agent
      .post('/api/v1/auth/google/start')
      .send({ intent: 'link', returnTo: '/settings/security' });
    expect(linkWithoutPasswordSession.status).toBe(401);
    expect(linkWithoutPasswordSession.body.error.code).toBe('GOOGLE_PASSWORD_SESSION_REQUIRED');

    const replay = await finishGoogle(agent, state, profile, 'google-code-replay');
    expect(replay.status).toBe(302);
    expect(replay.headers.location).toContain('authError=GOOGLE_AUTH_EXPIRED');

    await agent.post('/api/v1/auth/logout');
    const returningState = await startGoogle(agent);
    expect((await finishGoogle(agent, returningState, profile, 'google-code-2')).status).toBe(302);
    expect(await prisma.user.count({ where: { email: profile.email } })).toBe(1);
  });

  it('requires explicit same-email linking and supports safe connect and disconnect', async () => {
    const agent = request.agent(googleApp);
    await signup(agent, 'linked@example.com');
    await agent.post('/api/v1/auth/logout');

    const profile = {
      displayName: 'Linked User',
      email: 'linked@example.com',
      emailVerified: true,
      subject: 'google-linked-subject',
    };
    const collisionState = await startGoogle(agent);
    const collision = await finishGoogle(agent, collisionState, profile, 'collision-code');
    expect(collision.headers.location).toContain('authError=GOOGLE_ACCOUNT_LINK_REQUIRED');

    await agent.post('/api/v1/auth/login').send({
      email: 'linked@example.com',
      password: 'SecurePass123!',
    });
    const linkState = await startGoogle(agent, 'link');
    const linked = await finishGoogle(agent, linkState, profile, 'link-code');
    expect(linked.headers.location).toBe('/settings/security?google=linked');
    expect((await agent.get('/api/v1/auth/me')).body.data.authMethods).toEqual([
      'password',
      'google',
    ]);

    const unlinked = await agent.delete('/api/v1/auth/google/link');
    expect(unlinked.status).toBe(200);
    expect(unlinked.body.data.authMethods).toEqual(['password']);
    const actions = await prisma.auditEvent.findMany({
      where: { action: { in: ['auth.google.linked', 'auth.google.unlinked'] } },
      orderBy: { createdAt: 'asc' },
    });
    expect(actions.map((event) => event.action)).toEqual([
      'auth.google.linked',
      'auth.google.unlinked',
    ]);
  });

  it('rejects mismatched and already-owned Google identities during linking', async () => {
    const first = request.agent(googleApp);
    const second = request.agent(googleApp);
    await signup(first, 'first-link@example.com');
    await signup(second, 'second-link@example.com');

    const firstState = await startGoogle(first, 'link');
    await finishGoogle(
      first,
      firstState,
      {
        displayName: 'First Link',
        email: 'first-link@example.com',
        emailVerified: true,
        subject: 'owned-google-subject',
      },
      'first-link-code',
    );

    const mismatchState = await startGoogle(second, 'link');
    const mismatch = await finishGoogle(
      second,
      mismatchState,
      {
        displayName: 'Wrong Account',
        email: 'wrong@example.com',
        emailVerified: true,
        subject: 'different-subject',
      },
      'mismatch-code',
    );
    expect(mismatch.headers.location).toContain('authError=GOOGLE_EMAIL_MISMATCH');

    const ownedState = await startGoogle(second, 'link');
    const owned = await finishGoogle(
      second,
      ownedState,
      {
        displayName: 'Second Link',
        email: 'second-link@example.com',
        emailVerified: true,
        subject: 'owned-google-subject',
      },
      'owned-code',
    );
    expect(owned.headers.location).toContain('authError=GOOGLE_IDENTITY_IN_USE');
  });
});

describe('customer directory', () => {
  it('normalizes, isolates and reuses customers while preserving legacy orders', async () => {
    const owner = request.agent(app);
    const stranger = request.agent(app);
    await signup(owner, 'customer-owner@example.com');
    await signup(stranger, 'customer-stranger@example.com');

    const created = await createCustomer(owner, 'Northstar Labs', '+91 98765-43210');
    expect(created.status).toBe(201);
    expect(created.body.data).toMatchObject({
      mobile: '+919876543210',
      name: 'Northstar Labs',
    });
    const customerId = created.body.data.id as string;

    const duplicate = await createCustomer(owner, 'Northstar Duplicate', '+919876543210');
    expect(duplicate.status).toBe(409);
    expect(duplicate.body.error).toMatchObject({
      code: 'CUSTOMER_MOBILE_IN_USE',
      existingCustomerId: customerId,
    });
    expect((await createCustomer(stranger, 'Independent Customer', '+919876543210')).status).toBe(
      201,
    );

    const byName = await owner.get('/api/v1/customers').query({ search: 'northstar' });
    expect(byName.body.data).toHaveLength(1);
    const byMobile = await owner.get('/api/v1/customers').query({ search: '9876543210' });
    expect(byMobile.body.data[0].id).toBe(customerId);
    expect(
      (await stranger.get('/api/v1/customers').query({ search: 'Northstar' })).body.data,
    ).toEqual([]);

    const order = await createOrder(owner, { customerId });
    expect(order.body.data).toMatchObject({
      customer: 'Northstar Labs',
      customerId,
      customerMobile: '+919876543210',
    });
    expect((await createOrder(stranger, { customerId })).body.error.code).toBe(
      'CUSTOMER_NOT_FOUND',
    );

    const me = await owner.get('/api/v1/auth/me');
    const legacy = await prisma.order.create({
      data: {
        customer: 'Legacy Customer',
        dueDate: new Date('2099-02-01T00:00:00.000Z'),
        userId: me.body.data.id as string,
        lineItems: {
          create: {
            description: 'Legacy service',
            position: 0,
            quantity: 1,
            unitPriceCents: 5_000n,
          },
        },
      },
    });
    expect((await owner.get(`/api/v1/orders/${legacy.id}`)).body.data).toMatchObject({
      customer: 'Legacy Customer',
      customerId: null,
      customerMobile: null,
    });

    const activity = await owner.get('/api/v1/activity').query({ action: 'customer.created' });
    expect(activity.body.data[0]).toMatchObject({
      action: 'customer.created',
      entityId: customerId,
    });
  });
});

describe('orders and settlements', () => {
  it('enforces ownership, supports CRUD, filters, pagination, and summary data', async () => {
    const owner = request.agent(app);
    const stranger = request.agent(app);
    await signup(owner, 'owner@example.com');
    await signup(stranger, 'stranger@example.com');

    const created = await createOrder(owner);
    expect(created.status).toBe(201);
    const order = created.body.data as OrderResponse;
    expect(order).toMatchObject({
      orderTotalCents: 100_000,
      amountDueCents: 100_000,
      status: 'pending',
    });
    expect((await stranger.get(`/api/v1/orders/${order.id}`)).status).toBe(404);

    const overdue = await createOrder(owner, { dueDate: '2020-01-01' }, 'Past Due Client');
    expect(overdue.status).toBe(201);

    const filtered = await owner.get('/api/v1/orders').query({
      search: 'Past Due',
      status: 'overdue',
      page: 1,
      pageSize: 1,
      sort: 'customer',
      direction: 'asc',
    });
    expect(filtered.status).toBe(200);
    expect(filtered.body.data).toHaveLength(1);
    expect(filtered.body.meta).toMatchObject({ page: 1, pageSize: 1, total: 1, totalPages: 1 });

    const updatedCustomer = await createCustomer(owner, 'Acme Updated');
    const updated = await owner.patch(`/api/v1/orders/${order.id}`).send({
      ...validOrder,
      customerId: updatedCustomer.body.data.id,
    });
    expect(updated.status).toBe(200);
    expect(updated.body.data.customer).toBe('Acme Updated');

    const summary = await owner.get('/api/v1/orders/summary');
    expect(summary.body.data).toMatchObject({
      totalOrders: 2,
      overdueOrders: 1,
      outstandingCents: 200_000,
    });

    const deletable = overdue.body.data as OrderResponse;
    expect((await owner.delete(`/api/v1/orders/${deletable.id}`)).status).toBe(200);
    expect((await owner.get(`/api/v1/orders/${deletable.id}`)).status).toBe(404);
  });

  it('handles the $1,000 to $400 to $600 flow and locks paid orders', async () => {
    const agent = request.agent(app);
    await signup(agent, 'payments@example.com');
    const currentUser = await agent.get('/api/v1/auth/me');
    const currentUserId = currentUser.body.data.id as string;
    const created = await createOrder(agent);
    const order = created.body.data as OrderResponse;

    const partial = await agent.post(`/api/v1/orders/${order.id}/payments`).send({
      amountCents: 40_000,
      date: '2026-08-08',
      note: 'Deposit',
    });
    expect(partial.status).toBe(201);
    expect(partial.body.data).toMatchObject({
      amountPaidCents: 40_000,
      amountDueCents: 60_000,
      status: 'partially_paid',
      isLocked: true,
    });
    const partialPaymentId = partial.body.data.payments[0].id as string;
    const sentMessages: MailMessage[] = [];
    const mailTransport: MailTransport = {
      sendMail: (message) => {
        sentMessages.push(message);
        return Promise.resolve({ messageId: message.messageId });
      },
    };
    const notificationOptions = {
      enabled: true,
      from: 'SettleFlow <coderpraveengupta@gmail.com>',
      mailTransport,
    };
    await notifyPaymentRecorded(
      { orderId: order.id, paymentId: partialPaymentId, userId: currentUserId },
      notificationOptions,
    );
    await notifyPaymentRecorded(
      { orderId: order.id, paymentId: partialPaymentId, userId: currentUserId },
      notificationOptions,
    );
    expect(sentMessages).toHaveLength(1);
    expect(sentMessages[0]).toMatchObject({
      from: 'SettleFlow <coderpraveengupta@gmail.com>',
      subject: expect.stringContaining(order.orderNumber),
      to: 'payments@example.com',
    });
    expect(sentMessages[0]?.messageId).toMatch(/^<[a-f0-9]{64}@kindratech\.co>$/);
    expect(
      await prisma.notificationDelivery.count({
        where: { eventKey: `payment-recorded-${partialPaymentId}` },
      }),
    ).toBe(1);

    const lockedEdit = await agent
      .patch(`/api/v1/orders/${order.id}`)
      .send({ ...validOrder, customerId: order.customerId });
    expect(lockedEdit.status).toBe(409);
    expect(lockedEdit.body.error.code).toBe('ORDER_LOCKED');
    const lockedDelete = await agent.delete(`/api/v1/orders/${order.id}`);
    expect(lockedDelete.status).toBe(409);
    expect(lockedDelete.body.error.code).toBe('ORDER_LOCKED');

    const paid = await agent.post(`/api/v1/orders/${order.id}/payments`).send({
      amountCents: 60_000,
      date: '2026-08-08',
      note: 'Final payment',
    });
    expect(paid.status).toBe(201);
    expect(paid.body.data).toMatchObject({
      amountPaidCents: 100_000,
      amountDueCents: 0,
      status: 'paid',
    });
    expect(paid.body.data.payments).toHaveLength(2);
    const finalPaymentId = (paid.body.data.payments as Array<{ id: string }>).find(
      (payment) => payment.id !== partialPaymentId,
    )?.id;
    expect(finalPaymentId).toBeTruthy();
    const failingTransport: MailTransport = {
      sendMail: () => Promise.reject(new Error('Gmail API unavailable')),
    };
    await expect(
      notifyPaymentRecorded(
        { orderId: order.id, paymentId: finalPaymentId!, userId: currentUserId },
        {
          enabled: true,
          from: 'SettleFlow <coderpraveengupta@gmail.com>',
          mailTransport: failingTransport,
        },
      ),
    ).rejects.toThrow('Gmail API unavailable');
    expect(
      await prisma.notificationDelivery.findUnique({
        where: { eventKey: `payment-recorded-${finalPaymentId}` },
      }),
    ).toMatchObject({ status: 'failed', errorMessage: 'Gmail API unavailable' });

    const extra = await agent.post(`/api/v1/orders/${order.id}/payments`).send({
      amountCents: 100,
      date: '2026-08-08',
      note: '',
    });
    expect(extra.status).toBe(409);
    expect(extra.body.error).toMatchObject({ code: 'PAYMENT_EXCEEDS_BALANCE', maxAllowedCents: 0 });
  });

  it('serializes concurrent payments so the balance cannot be exceeded', async () => {
    const agent = request.agent(app);
    await signup(agent, 'concurrency@example.com');
    const created = await createOrder(agent);
    const order = created.body.data as OrderResponse;
    const payment = { amountCents: 70_000, date: '2026-08-08', note: '' };

    const responses = await Promise.all([
      agent.post(`/api/v1/orders/${order.id}/payments`).send(payment),
      agent.post(`/api/v1/orders/${order.id}/payments`).send(payment),
    ]);
    expect(responses.map((response) => response.status).sort()).toEqual([201, 409]);
    expect(responses.find((response) => response.status === 409)?.body.error).toMatchObject({
      code: 'PAYMENT_EXCEEDS_BALANCE',
      maxAllowedCents: 30_000,
    });

    const final = await agent.get(`/api/v1/orders/${order.id}`);
    expect(final.body.data.amountPaidCents).toBe(70_000);
    expect(final.body.data.amountDueCents).toBe(30_000);
  });

  it('records activity and produces an owned asynchronous CSV export', async () => {
    const owner = request.agent(app);
    const stranger = request.agent(app);
    await signup(owner, 'exports@example.com');
    await signup(stranger, 'export-stranger@example.com');
    const created = await createOrder(owner);
    const order = created.body.data as OrderResponse;

    const activity = await owner.get('/api/v1/activity').query({ orderId: order.id });
    expect(activity.status).toBe(200);
    const activityBody = activity.body as { data: Array<{ action: string }> };
    expect(activityBody.data.map((event) => event.action)).toContain('order.created');

    const requested = await owner.post('/api/v1/exports/orders').send({
      direction: 'asc',
      search: 'Acme',
      sort: 'customer',
    });
    expect(requested.status).toBe(202);
    expect(requested.body.data.status).toBe('queued');
    const exportId = requested.body.data.id as string;
    expect((await stranger.get(`/api/v1/exports/${exportId}`)).status).toBe(404);

    await processOrderExport(exportId);
    const completed = await owner.get(`/api/v1/exports/${exportId}`);
    expect(completed.body.data).toMatchObject({ status: 'completed' });

    const download = await owner.get(`/api/v1/exports/${exportId}/download`);
    expect(download.status).toBe(200);
    expect(download.headers['content-type']).toContain('text/csv');
    expect(download.text).toContain('Order number,Customer,Customer mobile,Due date');
    expect(download.text).toContain(order.orderNumber);
  });
});
