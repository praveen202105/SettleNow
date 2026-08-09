import { Prisma, type OrderItem, type Payment, type PrismaClient } from '@prisma/client';

import {
  calculateOrderFinancials,
  deriveOrderStatus,
  todayIsoUtc,
  type OrderInput,
  type OrderListItem,
  type OrderListQuery,
  type OrderResponse,
  type OrderSummaryResponse,
  type PaginationMeta,
  type PaymentInput,
} from '@settleflow/shared';

import { AppError } from '../http/errors.js';
import { prisma } from '../lib/prisma.js';
import { writeAuditEvent } from './audit.js';
import {
  dashboardDatabase,
  invalidateOrderReads,
  orderListCacheKey,
  orderSummaryCacheKey,
  readCachedJson,
  writeCachedJson,
} from './cache.js';

type DbClient = PrismaClient | Prisma.TransactionClient;
type OrderWithRelations = Prisma.OrderGetPayload<{
  include: { lineItems: true; payments: true };
}>;

function toSafeNumber(value: bigint): number {
  const number = Number(value);
  if (!Number.isSafeInteger(number)) {
    throw new AppError(500, 'MONEY_RANGE_ERROR', 'A stored amount exceeds the supported range.');
  }
  return number;
}

function dateOnly(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function parseDateOnly(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

function orderNumber(publicId: number): string {
  return `ORD-${publicId}`;
}

export function presentOrder(order: OrderWithRelations, today = todayIsoUtc()): OrderResponse {
  const lineItems = [...order.lineItems]
    .sort((a, b) => a.position - b.position)
    .map((item: OrderItem) => {
      const unitPriceMinor = toSafeNumber(item.unitPriceMinor);
      return {
        id: item.id,
        description: item.description,
        quantity: item.quantity,
        unitPriceMinor,
        lineTotalMinor: item.quantity * unitPriceMinor,
      };
    });
  const payments = [...order.payments]
    .sort((a, b) => b.date.getTime() - a.date.getTime())
    .map((payment: Payment) => ({
      id: payment.id,
      amountMinor: toSafeNumber(payment.amountMinor),
      currency: payment.currency as 'INR',
      date: dateOnly(payment.date),
      method: payment.method,
      mode: payment.mode as 'manual' | 'test',
      note: payment.note,
      providerPaymentId: payment.providerPaymentId,
      source: payment.source as 'offline' | 'razorpay',
      createdAt: payment.createdAt.toISOString(),
    }));
  const financials = calculateOrderFinancials(lineItems, payments);

  return {
    id: order.id,
    orderNumber: orderNumber(order.publicId),
    customer: order.customer,
    customerId: order.customerId,
    customerMobile: order.customerMobile,
    currency: 'INR' as const,
    dueDate: dateOnly(order.dueDate),
    createdAt: order.createdAt.toISOString(),
    updatedAt: order.updatedAt.toISOString(),
    lineItems,
    payments,
    ...financials,
    status: deriveOrderStatus({
      ...financials,
      dueDate: dateOnly(order.dueDate),
      paymentCount: payments.length,
      today,
    }),
    isLocked: payments.length > 0,
  };
}

async function findOwnedCustomer(db: DbClient, userId: string, id: string) {
  const customer = await db.customer.findFirst({ where: { id, userId } });
  if (!customer) {
    throw new AppError(
      404,
      'CUSTOMER_NOT_FOUND',
      'Customer not found. Refresh the customer list and select an available customer.',
    );
  }
  return customer;
}

export async function findOwnedOrder(
  db: DbClient,
  userId: string,
  id: string,
): Promise<OrderWithRelations | null> {
  return db.order.findFirst({
    where: { id, userId, deletedAt: null },
    include: { lineItems: true, payments: true },
  });
}

export async function lockOwnedOrder(
  transaction: Prisma.TransactionClient,
  userId: string,
  id: string,
): Promise<void> {
  const rows = await transaction.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    SELECT "id"
    FROM "orders"
    WHERE "id" = ${id} AND "user_id" = ${userId} AND "deleted_at" IS NULL
    FOR UPDATE
  `);

  if (rows.length === 0) {
    throw new AppError(404, 'ORDER_NOT_FOUND', 'Order not found.');
  }
}

export async function getOrder(userId: string, id: string): Promise<OrderResponse> {
  const order = await findOwnedOrder(prisma, userId, id);
  if (!order) throw new AppError(404, 'ORDER_NOT_FOUND', 'Order not found.');
  return presentOrder(order);
}

export async function createOrder(
  userId: string,
  input: OrderInput,
  requestId?: string,
): Promise<OrderResponse> {
  const order = await prisma.$transaction(async (transaction) => {
    const customer = await findOwnedCustomer(transaction, userId, input.customerId);
    const created = await transaction.order.create({
      data: {
        customer: customer.name,
        customerId: customer.id,
        customerMobile: customer.mobile,
        dueDate: parseDateOnly(input.dueDate),
        userId,
        lineItems: {
          create: input.lineItems.map((item, position) => ({
            description: item.description,
            position,
            quantity: item.quantity,
            unitPriceMinor: BigInt(item.unitPriceMinor),
          })),
        },
      },
      include: { lineItems: true, payments: true },
    });
    await writeAuditEvent(transaction, {
      action: 'order.created',
      entityId: created.id,
      entityType: 'order',
      metadata: { customer: created.customer, orderNumber: orderNumber(created.publicId) },
      orderId: created.id,
      requestId,
      userId,
    });
    return created;
  });

  await invalidateOrderReads(userId);
  return presentOrder(order);
}

export async function updateOrder(
  userId: string,
  id: string,
  input: OrderInput,
  requestId?: string,
): Promise<OrderResponse> {
  const order = await prisma.$transaction(async (transaction) => {
    await lockOwnedOrder(transaction, userId, id);
    const paymentCount = await transaction.payment.count({ where: { orderId: id } });

    if (paymentCount > 0) {
      throw new AppError(
        409,
        'ORDER_LOCKED',
        'Orders cannot be edited after the first payment is recorded.',
      );
    }

    const customer = await findOwnedCustomer(transaction, userId, input.customerId);

    await transaction.orderItem.deleteMany({ where: { orderId: id } });
    const updated = await transaction.order.update({
      where: { id },
      data: {
        customer: customer.name,
        customerId: customer.id,
        customerMobile: customer.mobile,
        dueDate: parseDateOnly(input.dueDate),
        lineItems: {
          create: input.lineItems.map((item, position) => ({
            description: item.description,
            position,
            quantity: item.quantity,
            unitPriceMinor: BigInt(item.unitPriceMinor),
          })),
        },
      },
      include: { lineItems: true, payments: true },
    });

    await writeAuditEvent(transaction, {
      action: 'order.updated',
      entityId: updated.id,
      entityType: 'order',
      metadata: { customer: updated.customer, orderNumber: orderNumber(updated.publicId) },
      orderId: updated.id,
      requestId,
      userId,
    });

    return updated;
  });
  await invalidateOrderReads(userId);
  return presentOrder(order);
}

export async function deleteOrder(
  userId: string,
  id: string,
  requestId?: string,
): Promise<{ id: string }> {
  const result = await prisma.$transaction(async (transaction) => {
    await lockOwnedOrder(transaction, userId, id);
    const paymentCount = await transaction.payment.count({ where: { orderId: id } });

    if (paymentCount > 0) {
      throw new AppError(
        409,
        'ORDER_LOCKED',
        'Orders cannot be deleted after the first payment is recorded.',
      );
    }

    const deleted = await transaction.order.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
    await writeAuditEvent(transaction, {
      action: 'order.deleted',
      entityId: deleted.id,
      entityType: 'order',
      metadata: { customer: deleted.customer, orderNumber: orderNumber(deleted.publicId) },
      orderId: deleted.id,
      requestId,
      userId,
    });
    return { id };
  });
  await invalidateOrderReads(userId);
  return result;
}

export async function recordPayment(
  userId: string,
  id: string,
  input: PaymentInput,
  requestId?: string,
): Promise<OrderResponse> {
  const order = await prisma.$transaction(
    async (transaction) => {
      await lockOwnedOrder(transaction, userId, id);
      const order = await findOwnedOrder(transaction, userId, id);
      if (!order) throw new AppError(404, 'ORDER_NOT_FOUND', 'Order not found.');

      await transaction.paymentAttempt.updateMany({
        where: {
          orderId: id,
          status: { in: ['creating', 'pending'] },
          expiresAt: { lte: new Date() },
        },
        data: { status: 'expired' },
      });
      const activeAttempt = await transaction.paymentAttempt.findFirst({
        where: {
          orderId: id,
          status: { in: ['creating', 'pending'] },
          expiresAt: { gt: new Date() },
        },
        select: { expiresAt: true, id: true },
      });
      if (activeAttempt) {
        throw new AppError(
          409,
          'PAYMENT_ATTEMPT_ACTIVE',
          'Cancel the active online checkout or wait for it to expire before recording an offline payment.',
          { attemptId: activeAttempt.id, expiresAt: activeAttempt.expiresAt.toISOString() },
        );
      }

      const current = presentOrder(order);
      if (input.amountMinor > current.amountDueMinor) {
        throw new AppError(
          409,
          'PAYMENT_EXCEEDS_BALANCE',
          'Payment exceeds the outstanding balance.',
          { maxAllowedMinor: current.amountDueMinor },
        );
      }

      if (current.amountDueMinor === 0) {
        throw new AppError(409, 'ORDER_ALREADY_PAID', 'This order is already fully paid.');
      }

      const payment = await transaction.payment.create({
        data: {
          amountMinor: BigInt(input.amountMinor),
          currency: 'INR',
          date: parseDateOnly(input.date),
          note: input.note || null,
          orderId: id,
          mode: 'manual',
          source: 'offline',
        },
      });

      await writeAuditEvent(transaction, {
        action: 'payment.recorded',
        entityId: payment.id,
        entityType: 'payment',
        metadata: {
          amountMinor: input.amountMinor,
          currency: 'INR',
          orderNumber: current.orderNumber,
        },
        orderId: id,
        requestId,
        userId,
      });
      await transaction.outboxEvent.create({
        data: {
          topic: 'payment.recorded',
          payload: {
            orderId: id,
            paymentId: payment.id,
            userId,
          },
        },
      });

      const updated = await findOwnedOrder(transaction, userId, id);
      if (!updated) throw new AppError(404, 'ORDER_NOT_FOUND', 'Order not found.');
      return updated;
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted, timeout: 10_000 },
  );
  await invalidateOrderReads(userId);
  return presentOrder(order);
}

interface OrderListRow {
  amountDueMinor: bigint;
  amountPaidMinor: bigint;
  createdAt: Date;
  customer: string;
  customerId: string | null;
  customerMobile: string | null;
  dueDate: Date;
  id: string;
  orderTotalMinor: bigint;
  paymentCount: bigint;
  publicId: number;
  status: string;
  updatedAt: Date;
}

function financialCte(userId: string, today: string): Prisma.Sql {
  return Prisma.sql`
    WITH financials AS (
      SELECT
        o."id",
        o."public_id" AS "publicId",
        o."customer",
        o."customer_id" AS "customerId",
        o."customer_mobile" AS "customerMobile",
        o."due_date" AS "dueDate",
        o."created_at" AS "createdAt",
        o."updated_at" AS "updatedAt",
        COALESCE(items."orderTotalMinor", 0)::bigint AS "orderTotalMinor",
        COALESCE(payments."amountPaidMinor", 0)::bigint AS "amountPaidMinor",
        COALESCE(payments."paymentCount", 0)::bigint AS "paymentCount"
      FROM "orders" o
      LEFT JOIN LATERAL (
        SELECT SUM(oi."quantity" * oi."unit_price_minor")::bigint AS "orderTotalMinor"
        FROM "order_items" oi
        WHERE oi."order_id" = o."id"
      ) items ON TRUE
      LEFT JOIN LATERAL (
        SELECT
          SUM(p."amount_minor")::bigint AS "amountPaidMinor",
          COUNT(*)::bigint AS "paymentCount"
        FROM "payments" p
        WHERE p."order_id" = o."id"
      ) payments ON TRUE
      WHERE o."user_id" = ${userId} AND o."deleted_at" IS NULL
    ), statuses AS (
      SELECT
        *,
        GREATEST(0, "orderTotalMinor" - "amountPaidMinor")::bigint AS "amountDueMinor",
        CASE
          WHEN "amountPaidMinor" >= "orderTotalMinor" THEN 'paid'
          WHEN "dueDate" < CAST(${today} AS DATE) THEN 'overdue'
          WHEN "paymentCount" > 0 THEN 'partially_paid'
          ELSE 'pending'
        END AS "status"
      FROM financials
    )
  `;
}

function listFilters(query: OrderListQuery): Prisma.Sql {
  const search = query.search ? `%${query.search}%` : null;
  return Prisma.sql`
    WHERE 1 = 1
      ${query.status ? Prisma.sql`AND "status" = ${query.status}` : Prisma.empty}
      ${
        search
          ? Prisma.sql`AND (
              "customer" ILIKE ${search}
              OR COALESCE("customerMobile", '') ILIKE ${search}
              OR CONCAT('ORD-', "publicId") ILIKE ${search}
            )`
          : Prisma.empty
      }
  `;
}

export async function listOrders(
  userId: string,
  query: OrderListQuery,
  options: { forcePrimary?: boolean; skipCache?: boolean } = {},
): Promise<{ data: OrderListItem[]; meta: PaginationMeta }> {
  const cacheKey = options.skipCache ? null : await orderListCacheKey(userId, query);
  if (cacheKey) {
    const cached = await readCachedJson<{ data: OrderListItem[]; meta: PaginationMeta }>(cacheKey);
    if (cached) return cached;
  }
  const today = todayIsoUtc();
  const cte = financialCte(userId, today);
  const filters = listFilters(query);
  const sortColumns: Record<OrderListQuery['sort'], Prisma.Sql> = {
    orderNumber: Prisma.sql`"publicId"`,
    customer: Prisma.sql`LOWER("customer")`,
    dueDate: Prisma.sql`"dueDate"`,
    total: Prisma.sql`"orderTotalMinor"`,
    status: Prisma.sql`"status"`,
  };
  const direction = query.direction === 'asc' ? Prisma.sql`ASC` : Prisma.sql`DESC`;
  const offset = (query.page - 1) * query.pageSize;

  const database = await dashboardDatabase(userId, options.forcePrimary);
  const [countRows, rows] = await database.$transaction([
    database.$queryRaw<Array<{ total: bigint }>>(Prisma.sql`
      ${cte}
      SELECT COUNT(*)::bigint AS "total" FROM statuses ${filters}
    `),
    database.$queryRaw<OrderListRow[]>(Prisma.sql`
      ${cte}
      SELECT * FROM statuses
      ${filters}
      ORDER BY ${sortColumns[query.sort]} ${direction}, "id" ASC
      LIMIT ${query.pageSize} OFFSET ${offset}
    `),
  ]);

  const total = Number(countRows[0]?.total ?? 0n);
  const data = rows.map((row) => ({
    id: row.id,
    orderNumber: orderNumber(row.publicId),
    customer: row.customer,
    customerId: row.customerId,
    customerMobile: row.customerMobile,
    currency: 'INR' as const,
    dueDate: dateOnly(row.dueDate),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    orderTotalMinor: toSafeNumber(row.orderTotalMinor),
    amountPaidMinor: toSafeNumber(row.amountPaidMinor),
    amountDueMinor: toSafeNumber(row.amountDueMinor),
    paymentCount: toSafeNumber(row.paymentCount),
    status: row.status as OrderListItem['status'],
    isLocked: row.paymentCount > 0n,
  }));

  const result = {
    data,
    meta: {
      page: query.page,
      pageSize: query.pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
    },
  };
  if (cacheKey) await writeCachedJson(cacheKey, result);
  return result;
}

export async function getOrderSummary(userId: string): Promise<OrderSummaryResponse> {
  const cacheKey = await orderSummaryCacheKey(userId);
  const cached = await readCachedJson<OrderSummaryResponse>(cacheKey);
  if (cached) return cached;
  const cte = financialCte(userId, todayIsoUtc());
  const database = await dashboardDatabase(userId);
  const rows = await database.$queryRaw<
    Array<{
      overdueOrders: bigint;
      outstandingMinor: bigint;
      paymentsReceivedMinor: bigint;
      totalOrders: bigint;
    }>
  >(Prisma.sql`
    ${cte}
    SELECT
      COUNT(*)::bigint AS "totalOrders",
      COALESCE(SUM("amountDueMinor"), 0)::bigint AS "outstandingMinor",
      COALESCE(SUM("amountPaidMinor"), 0)::bigint AS "paymentsReceivedMinor",
      COUNT(*) FILTER (WHERE "status" = 'overdue')::bigint AS "overdueOrders"
    FROM statuses
  `);
  const row = rows[0];

  const result = {
    currency: 'INR' as const,
    totalOrders: toSafeNumber(row?.totalOrders ?? 0n),
    outstandingMinor: toSafeNumber(row?.outstandingMinor ?? 0n),
    paymentsReceivedMinor: toSafeNumber(row?.paymentsReceivedMinor ?? 0n),
    overdueOrders: toSafeNumber(row?.overdueOrders ?? 0n),
  };
  await writeCachedJson(cacheKey, result);
  return result;
}
