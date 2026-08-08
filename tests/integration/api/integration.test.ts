import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { OrderResponse } from '@settleflow/shared';

import { createApp } from '../../../apps/api/src/app.js';
import { processOrderExport } from '../../../apps/api/src/jobs/exportProcessor.js';
import { notifyPaymentRecorded } from '../../../apps/api/src/jobs/notificationProcessor.js';
import { prisma } from '../../../apps/api/src/lib/prisma.js';
import { disconnectRedis, redis } from '../../../apps/api/src/lib/redis.js';

const app = createApp();
type TestAgent = ReturnType<typeof request.agent>;

const validOrder = {
  customer: 'Acme Corporation',
  dueDate: '2099-01-15',
  lineItems: [{ description: 'Implementation', quantity: 1, unitPriceCents: 100_000 }],
};

function signup(agent: TestAgent, email: string) {
  return agent.post('/api/v1/auth/signup').send({
    displayName: 'Test User',
    email,
    password: 'SecurePass123!',
  });
}

function createOrder(agent: TestAgent, overrides: Record<string, unknown> = {}) {
  return agent.post('/api/v1/orders').send({ ...validOrder, ...overrides });
}

beforeAll(async () => {
  await prisma.$connect();
});

beforeEach(async () => {
  await prisma.user.deleteMany();
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

    const overdue = await createOrder(owner, {
      customer: 'Past Due Client',
      dueDate: '2020-01-01',
    });
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

    const updated = await owner.patch(`/api/v1/orders/${order.id}`).send({
      ...validOrder,
      customer: 'Acme Updated',
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
    await notifyPaymentRecorded({
      orderId: order.id,
      paymentId: partialPaymentId,
      userId: currentUserId,
    });
    await notifyPaymentRecorded({
      orderId: order.id,
      paymentId: partialPaymentId,
      userId: currentUserId,
    });
    expect(
      await prisma.notificationDelivery.count({
        where: { eventKey: `payment-recorded-${partialPaymentId}` },
      }),
    ).toBe(1);

    const lockedEdit = await agent.patch(`/api/v1/orders/${order.id}`).send(validOrder);
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
    expect(download.text).toContain('Order number,Customer,Due date');
    expect(download.text).toContain(order.orderNumber);
  });
});
