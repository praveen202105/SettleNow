import { randomBytes } from 'node:crypto';

import { Prisma, type PaymentAttempt } from '@prisma/client';

import type {
  PaymentAttemptInput,
  PaymentAttemptResponse,
  PaymentConfirmationInput,
  PaymentLinkResponse,
  PublicPaymentLinkResponse,
} from '@settleflow/shared';

import { env } from '../config/env.js';
import { AppError } from '../http/errors.js';
import { prisma } from '../lib/prisma.js';
import { writeAuditEvent } from './audit.js';
import { invalidateOrderReads } from './cache.js';
import { findOwnedOrder, lockOwnedOrder, presentOrder } from './orders.js';
import {
  hashPaymentLinkToken,
  isPaymentAttemptExpired,
  paymentAttemptExpiresAt,
} from './paymentTokens.js';
import {
  createRazorpayProvider,
  type PaymentProvider,
  type ProviderPayment,
  verifyCheckoutSignature,
} from './razorpay.js';

function requirePaymentsEnabled(): void {
  if (!env.PAYMENTS_ENABLED || !env.RAZORPAY_KEY_ID || !env.RAZORPAY_KEY_SECRET) {
    throw new AppError(503, 'PAYMENTS_DISABLED', 'Online test payments are not configured yet.');
  }
}

function toSafeNumber(value: bigint): number {
  const number = Number(value);
  if (!Number.isSafeInteger(number)) {
    throw new AppError(500, 'MONEY_RANGE_ERROR', 'A stored amount exceeds the supported range.');
  }
  return number;
}

function maskedCustomer(name: string): string {
  const first = name.trim().split(/\s+/)[0] ?? 'Customer';
  return first.length < 2
    ? `${first}••`
    : `${first.slice(0, 1)}${'•'.repeat(Math.min(first.length - 1, 5))}`;
}

async function attemptWithOrder(id: string) {
  return prisma.paymentAttempt.findUnique({
    where: { id },
    include: { order: { include: { lineItems: true, payments: true } } },
  });
}

function presentAttempt(
  attempt: NonNullable<Awaited<ReturnType<typeof attemptWithOrder>>>,
): PaymentAttemptResponse {
  const remainingSeconds = Math.max(
    1,
    Math.floor((attempt.expiresAt.getTime() - Date.now()) / 1_000),
  );
  return {
    amountMinor: toSafeNumber(attempt.amountMinor),
    checkout:
      attempt.status === 'pending' && attempt.providerOrderId && env.RAZORPAY_KEY_ID
        ? {
            contact: attempt.order.customerMobile,
            customerName: attempt.order.customer,
            description: `Payment for ORD-${attempt.order.publicId}`,
            keyId: env.RAZORPAY_KEY_ID,
            orderId: attempt.providerOrderId,
            timeoutSeconds: Math.min(900, remainingSeconds),
          }
        : null,
    createdAt: attempt.createdAt.toISOString(),
    currency: 'INR',
    expiresAt: attempt.expiresAt.toISOString(),
    id: attempt.id,
    status: attempt.status as PaymentAttemptResponse['status'],
  };
}

async function publicSummary(linkId: string): Promise<PublicPaymentLinkResponse> {
  const link = await prisma.paymentCollectionLink.findUnique({
    where: { id: linkId },
    include: { order: { include: { lineItems: true, payments: true } } },
  });
  if (!link || link.revokedAt || link.order.deletedAt) {
    throw new AppError(410, 'PAYMENT_LINK_INVALID', 'This payment link is no longer available.');
  }
  const order = presentOrder(link.order);
  return {
    amountDueMinor: order.amountDueMinor,
    amountPaidMinor: order.amountPaidMinor,
    currency: 'INR',
    customerLabel: maskedCustomer(order.customer),
    id: link.id,
    orderNumber: order.orderNumber,
    orderTotalMinor: order.orderTotalMinor,
    status: order.amountDueMinor === 0 ? 'paid' : 'active',
  };
}

export function paymentConfig() {
  return {
    currency: 'INR' as const,
    enabled: env.PAYMENTS_ENABLED,
    keyId: env.PAYMENTS_ENABLED ? (env.RAZORPAY_KEY_ID ?? null) : null,
    mode: 'test' as const,
    provider: 'razorpay' as const,
  };
}

export async function getPaymentLink(
  userId: string,
  orderId: string,
): Promise<PaymentLinkResponse | null> {
  const order = await findOwnedOrder(prisma, userId, orderId);
  if (!order) throw new AppError(404, 'ORDER_NOT_FOUND', 'Order not found.');
  const link = await prisma.paymentCollectionLink.findFirst({
    where: { orderId },
    orderBy: { createdAt: 'desc' },
  });
  if (!link) return null;
  const paid = presentOrder(order).amountDueMinor === 0;
  return {
    createdAt: link.createdAt.toISOString(),
    id: link.id,
    revokedAt: link.revokedAt?.toISOString() ?? null,
    status: paid ? 'paid' : link.revokedAt ? 'revoked' : 'active',
  };
}

export async function createPaymentLink(
  userId: string,
  orderId: string,
  requestId?: string,
): Promise<PaymentLinkResponse> {
  requirePaymentsEnabled();
  const token = randomBytes(32).toString('base64url');
  const link = await prisma.$transaction(async (transaction) => {
    await lockOwnedOrder(transaction, userId, orderId);
    const order = await findOwnedOrder(transaction, userId, orderId);
    if (!order) throw new AppError(404, 'ORDER_NOT_FOUND', 'Order not found.');
    if (presentOrder(order).amountDueMinor === 0) {
      throw new AppError(409, 'ORDER_ALREADY_PAID', 'This order is already fully paid.');
    }
    await transaction.paymentCollectionLink.updateMany({
      where: { orderId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    const created = await transaction.paymentCollectionLink.create({
      data: { orderId, tokenHash: hashPaymentLinkToken(token) },
    });
    await writeAuditEvent(transaction, {
      action: 'payment.link.created',
      entityId: created.id,
      entityType: 'payment_link',
      metadata: { orderNumber: `ORD-${order.publicId}` },
      orderId,
      requestId,
      userId,
    });
    return created;
  });
  return {
    createdAt: link.createdAt.toISOString(),
    id: link.id,
    revokedAt: null,
    shareUrl: `${env.APP_ORIGIN}/pay/${token}`,
    status: 'active',
  };
}

export async function revokePaymentLink(
  userId: string,
  orderId: string,
  requestId?: string,
): Promise<PaymentLinkResponse> {
  const link = await prisma.$transaction(async (transaction) => {
    await lockOwnedOrder(transaction, userId, orderId);
    const active = await transaction.paymentCollectionLink.findFirst({
      where: { orderId, revokedAt: null, order: { userId, deletedAt: null } },
      orderBy: { createdAt: 'desc' },
    });
    if (!active)
      throw new AppError(404, 'PAYMENT_LINK_NOT_FOUND', 'No active payment link exists.');
    const revoked = await transaction.paymentCollectionLink.update({
      where: { id: active.id },
      data: { revokedAt: new Date() },
    });
    await transaction.paymentAttempt.updateMany({
      where: { paymentLinkId: active.id, status: { in: ['creating', 'pending'] } },
      data: { status: 'cancelled' },
    });
    await writeAuditEvent(transaction, {
      action: 'payment.link.revoked',
      entityId: active.id,
      entityType: 'payment_link',
      metadata: {},
      orderId,
      requestId,
      userId,
    });
    return revoked;
  });
  return {
    createdAt: link.createdAt.toISOString(),
    id: link.id,
    revokedAt: link.revokedAt?.toISOString() ?? null,
    status: 'revoked',
  };
}

export async function exchangePaymentLink(token: string): Promise<PublicPaymentLinkResponse> {
  const link = await prisma.paymentCollectionLink.findUnique({
    where: { tokenHash: hashPaymentLinkToken(token) },
    select: { id: true, revokedAt: true },
  });
  if (!link || link.revokedAt) {
    throw new AppError(410, 'PAYMENT_LINK_INVALID', 'This payment link is no longer available.');
  }
  return publicSummary(link.id);
}

export async function getPublicPaymentLink(linkId: string): Promise<PublicPaymentLinkResponse> {
  return publicSummary(linkId);
}

async function createAttempt(
  access: { orderId: string; paymentLinkId?: string; userId: string },
  input: PaymentAttemptInput,
  provider: PaymentProvider,
  requestId?: string,
): Promise<PaymentAttemptResponse> {
  requirePaymentsEnabled();
  const attempt = await prisma.$transaction(async (transaction) => {
    await lockOwnedOrder(transaction, access.userId, access.orderId);
    if (access.paymentLinkId) {
      const link = await transaction.paymentCollectionLink.findFirst({
        where: { id: access.paymentLinkId, orderId: access.orderId, revokedAt: null },
      });
      if (!link)
        throw new AppError(
          410,
          'PAYMENT_LINK_INVALID',
          'This payment link is no longer available.',
        );
    }
    await transaction.paymentAttempt.updateMany({
      where: {
        orderId: access.orderId,
        status: { in: ['creating', 'pending'] },
        expiresAt: { lte: new Date() },
      },
      data: { status: 'expired' },
    });
    const active = await transaction.paymentAttempt.findFirst({
      where: {
        orderId: access.orderId,
        status: { in: ['creating', 'pending'] },
        expiresAt: { gt: new Date() },
      },
      select: { expiresAt: true, id: true },
    });
    if (active) {
      throw new AppError(
        409,
        'PAYMENT_ATTEMPT_ACTIVE',
        'A checkout is already active for this order.',
        {
          attemptId: active.id,
          expiresAt: active.expiresAt.toISOString(),
        },
      );
    }
    const order = await findOwnedOrder(transaction, access.userId, access.orderId);
    if (!order) throw new AppError(404, 'ORDER_NOT_FOUND', 'Order not found.');
    const current = presentOrder(order);
    if (current.amountDueMinor === 0) {
      throw new AppError(409, 'ORDER_ALREADY_PAID', 'This order is already fully paid.');
    }
    if (input.amountMinor > current.amountDueMinor) {
      throw new AppError(
        409,
        'PAYMENT_EXCEEDS_BALANCE',
        'Payment exceeds the outstanding balance.',
        {
          maxAllowedMinor: current.amountDueMinor,
        },
      );
    }
    const created = await transaction.paymentAttempt.create({
      data: {
        amountMinor: BigInt(input.amountMinor),
        currency: 'INR',
        expiresAt: paymentAttemptExpiresAt(),
        orderId: access.orderId,
        paymentLinkId: access.paymentLinkId ?? null,
        status: 'creating',
      },
    });
    await writeAuditEvent(transaction, {
      action: 'payment.checkout.started',
      entityId: created.id,
      entityType: 'payment_attempt',
      metadata: { amountMinor: input.amountMinor, currency: 'INR' },
      orderId: access.orderId,
      requestId,
      userId: access.userId,
    });
    return created;
  });

  try {
    const providerOrder = await provider.createOrder({
      amountMinor: input.amountMinor,
      orderId: access.orderId,
      receipt: attempt.id,
    });
    await prisma.paymentAttempt.update({
      where: { id: attempt.id },
      data: { providerOrderId: providerOrder.id, status: 'pending' },
    });
  } catch (error) {
    await prisma.paymentAttempt.updateMany({
      where: { id: attempt.id, status: 'creating' },
      data: {
        failureCode: error instanceof AppError ? error.code : 'PROVIDER_ERROR',
        failureMessage:
          error instanceof Error ? error.message.slice(0, 500) : 'Provider request failed.',
        status: 'failed',
      },
    });
    throw error;
  }

  const ready = await attemptWithOrder(attempt.id);
  if (!ready)
    throw new AppError(500, 'PAYMENT_ATTEMPT_MISSING', 'Payment attempt could not be loaded.');
  return presentAttempt(ready);
}

export async function createOwnerPaymentAttempt(
  userId: string,
  orderId: string,
  input: PaymentAttemptInput,
  provider: PaymentProvider = createRazorpayProvider(),
  requestId?: string,
): Promise<PaymentAttemptResponse> {
  return createAttempt({ orderId, userId }, input, provider, requestId);
}

export async function createPublicPaymentAttempt(
  linkId: string,
  input: PaymentAttemptInput,
  provider: PaymentProvider = createRazorpayProvider(),
  requestId?: string,
): Promise<PaymentAttemptResponse> {
  const link = await prisma.paymentCollectionLink.findUnique({
    where: { id: linkId },
    include: { order: { select: { deletedAt: true, userId: true } } },
  });
  if (!link || link.revokedAt || link.order.deletedAt) {
    throw new AppError(410, 'PAYMENT_LINK_INVALID', 'This payment link is no longer available.');
  }
  return createAttempt(
    { orderId: link.orderId, paymentLinkId: link.id, userId: link.order.userId },
    input,
    provider,
    requestId,
  );
}

async function requireAttemptAccess(
  attemptId: string,
  access: { linkId?: string; userId?: string },
) {
  const attempt = await attemptWithOrder(attemptId);
  if (!attempt || attempt.order.deletedAt) {
    throw new AppError(404, 'PAYMENT_ATTEMPT_NOT_FOUND', 'Payment attempt not found.');
  }
  const ownerAllowed = access.userId && attempt.order.userId === access.userId;
  const linkAllowed = access.linkId && attempt.paymentLinkId === access.linkId;
  if (!ownerAllowed && !linkAllowed) {
    throw new AppError(404, 'PAYMENT_ATTEMPT_NOT_FOUND', 'Payment attempt not found.');
  }
  if (
    ['creating', 'pending'].includes(attempt.status) &&
    isPaymentAttemptExpired(attempt.expiresAt)
  ) {
    await prisma.paymentAttempt.updateMany({
      where: { id: attempt.id, status: { in: ['creating', 'pending'] } },
      data: { status: 'expired' },
    });
    const expired = await attemptWithOrder(attempt.id);
    if (expired) return expired;
  }
  return attempt;
}

export async function getPaymentAttempt(
  attemptId: string,
  access: { linkId?: string; userId?: string },
): Promise<PaymentAttemptResponse> {
  return presentAttempt(await requireAttemptAccess(attemptId, access));
}

export async function cancelPaymentAttempt(
  attemptId: string,
  userId: string,
): Promise<PaymentAttemptResponse> {
  const attempt = await requireAttemptAccess(attemptId, { userId });
  if (['creating', 'pending'].includes(attempt.status)) {
    await prisma.paymentAttempt.update({
      where: { id: attempt.id },
      data: { status: 'cancelled' },
    });
  }
  const updated = await attemptWithOrder(attempt.id);
  if (!updated) throw new AppError(404, 'PAYMENT_ATTEMPT_NOT_FOUND', 'Payment attempt not found.');
  return presentAttempt(updated);
}

async function finalizeCapturedPayment(
  attempt: PaymentAttempt,
  payment: ProviderPayment,
): Promise<'captured' | 'needs_review'> {
  const owner = await prisma.order.findUnique({
    where: { id: attempt.orderId },
    select: { userId: true },
  });
  if (!owner) throw new AppError(404, 'ORDER_NOT_FOUND', 'Order not found.');
  const result = await prisma.$transaction(async (transaction) => {
    await lockOwnedOrder(transaction, owner.userId, attempt.orderId);
    const currentAttempt = await transaction.paymentAttempt.findUnique({
      where: { id: attempt.id },
    });
    if (!currentAttempt)
      throw new AppError(404, 'PAYMENT_ATTEMPT_NOT_FOUND', 'Payment attempt not found.');
    const existing = await transaction.payment.findFirst({
      where: { OR: [{ providerPaymentId: payment.id }, { paymentAttemptId: currentAttempt.id }] },
    });
    if (existing) return { orderId: currentAttempt.orderId, status: 'captured' as const };
    const order = await transaction.order.findUnique({
      where: { id: currentAttempt.orderId },
      include: { lineItems: true, payments: true },
    });
    if (!order || order.deletedAt) throw new AppError(404, 'ORDER_NOT_FOUND', 'Order not found.');
    const current = presentOrder(order);
    const amountMinor = toSafeNumber(currentAttempt.amountMinor);
    const invalid =
      payment.status !== 'captured' ||
      payment.orderId !== currentAttempt.providerOrderId ||
      payment.amountMinor !== amountMinor ||
      payment.currency !== 'INR' ||
      amountMinor > current.amountDueMinor;
    if (invalid) {
      await transaction.paymentAttempt.update({
        where: { id: currentAttempt.id },
        data: {
          failureCode: 'PAYMENT_REQUIRES_REVIEW',
          failureMessage: 'Captured provider data did not match the active SettleFlow balance.',
          providerPaymentId: payment.id,
          status: 'needs_review',
        },
      });
      return { orderId: currentAttempt.orderId, status: 'needs_review' as const };
    }
    const userId = order.userId;
    const paymentRecord = await transaction.payment.create({
      data: {
        amountMinor: BigInt(amountMinor),
        currency: 'INR',
        date: new Date(`${new Date().toISOString().slice(0, 10)}T00:00:00.000Z`),
        method: payment.method,
        mode: 'test',
        note: 'Razorpay test payment',
        orderId: order.id,
        paymentAttemptId: currentAttempt.id,
        providerPaymentId: payment.id,
        source: 'razorpay',
      },
    });
    await transaction.paymentAttempt.update({
      where: { id: currentAttempt.id },
      data: {
        completedAt: new Date(),
        providerMethod: payment.method,
        providerPaymentId: payment.id,
        status: 'captured',
      },
    });
    await writeAuditEvent(transaction, {
      action: 'payment.recorded',
      entityId: paymentRecord.id,
      entityType: 'payment',
      metadata: { amountMinor, currency: 'INR', mode: 'test', source: 'razorpay' },
      orderId: order.id,
      userId,
    });
    await transaction.outboxEvent.create({
      data: {
        topic: 'payment.recorded',
        payload: { orderId: order.id, paymentId: paymentRecord.id, userId },
      },
    });
    return { orderId: order.id, status: 'captured' as const };
  });
  await invalidateOrderReads(
    (await prisma.order.findUniqueOrThrow({ where: { id: result.orderId } })).userId,
  );
  return result.status;
}

export async function confirmPaymentAttempt(
  attemptId: string,
  access: { linkId?: string; userId?: string },
  input: PaymentConfirmationInput,
  provider: PaymentProvider = createRazorpayProvider(),
): Promise<PaymentAttemptResponse> {
  requirePaymentsEnabled();
  const attempt = await requireAttemptAccess(attemptId, access);
  if (!attempt.providerOrderId || attempt.providerOrderId !== input.razorpayOrderId) {
    throw new AppError(
      400,
      'PAYMENT_SIGNATURE_INVALID',
      'Payment confirmation did not match this checkout.',
    );
  }
  if (
    !env.RAZORPAY_KEY_SECRET ||
    !verifyCheckoutSignature({
      orderId: input.razorpayOrderId,
      paymentId: input.razorpayPaymentId,
      secret: env.RAZORPAY_KEY_SECRET,
      signature: input.razorpaySignature,
    })
  ) {
    throw new AppError(
      400,
      'PAYMENT_SIGNATURE_INVALID',
      'Payment confirmation signature was invalid.',
    );
  }
  const providerPayment = await provider.fetchPayment(input.razorpayPaymentId);
  if (providerPayment.status === 'captured') {
    await finalizeCapturedPayment(attempt, providerPayment);
  } else if (providerPayment.status === 'failed') {
    await prisma.paymentAttempt.updateMany({
      where: { id: attempt.id, status: { in: ['creating', 'pending'] } },
      data: { failureCode: 'PAYMENT_FAILED', status: 'failed' },
    });
  }
  return presentAttempt((await attemptWithOrder(attempt.id)) ?? attempt);
}

export interface ProviderEventInput {
  amountMinor: number | null;
  currency: string | null;
  eventType: string;
  method: string | null;
  paymentStatus: string | null;
  providerEventId: string;
  providerOrderId: string | null;
  providerPaymentId: string | null;
}

export async function storeProviderEvent(input: ProviderEventInput): Promise<void> {
  try {
    await prisma.$transaction(async (transaction) => {
      const existing = await transaction.paymentProviderEvent.findUnique({
        where: { providerEventId: input.providerEventId },
      });
      if (existing) return;
      const event = await transaction.paymentProviderEvent.create({
        data: {
          amountMinor: input.amountMinor === null ? null : BigInt(input.amountMinor),
          currency: input.currency,
          eventType: input.eventType,
          method: input.method,
          paymentStatus: input.paymentStatus,
          payload: {},
          providerEventId: input.providerEventId,
          providerOrderId: input.providerOrderId,
          providerPaymentId: input.providerPaymentId,
        },
      });
      await transaction.outboxEvent.create({
        data: { topic: 'payment.provider-event', payload: { providerEventId: event.id } },
      });
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') return;
    throw error;
  }
}

export async function processProviderEvent(id: string): Promise<void> {
  const event = await prisma.paymentProviderEvent.findUnique({ where: { id } });
  if (!event || event.processedAt) return;
  if (!event.providerOrderId) {
    await prisma.paymentProviderEvent.update({
      where: { id },
      data: {
        errorMessage: 'Provider order id was missing.',
        processedAt: new Date(),
        status: 'failed',
      },
    });
    return;
  }
  const attempt = await prisma.paymentAttempt.findUnique({
    where: { providerOrderId: event.providerOrderId },
  });
  if (!attempt) {
    await prisma.paymentProviderEvent.update({
      where: { id },
      data: { errorMessage: 'Matching payment attempt is not available yet.' },
    });
    throw new Error(
      `Payment attempt for provider event ${event.providerEventId} is not available yet.`,
    );
  }
  if (event.eventType === 'payment.failed') {
    await prisma.$transaction(async (transaction) => {
      const updated = await transaction.paymentAttempt.updateMany({
        where: { id: attempt.id, status: { in: ['creating', 'pending'] } },
        data: {
          failureCode: 'PAYMENT_FAILED',
          providerPaymentId: event.providerPaymentId,
          status: 'failed',
        },
      });
      if (updated.count > 0) {
        const order = await transaction.order.findUniqueOrThrow({
          where: { id: attempt.orderId },
          select: { userId: true },
        });
        await writeAuditEvent(transaction, {
          action: 'payment.checkout.failed',
          entityId: attempt.id,
          entityType: 'payment_attempt',
          metadata: { providerPaymentId: event.providerPaymentId },
          orderId: attempt.orderId,
          userId: order.userId,
        });
      }
      await transaction.paymentProviderEvent.update({
        where: { id },
        data: { errorMessage: null, processedAt: new Date(), status: 'processed' },
      });
    });
    return;
  }
  if (
    event.eventType === 'payment.captured' &&
    event.providerPaymentId &&
    event.amountMinor !== null &&
    event.currency &&
    event.paymentStatus
  ) {
    await finalizeCapturedPayment(attempt, {
      amountMinor: toSafeNumber(event.amountMinor),
      currency: event.currency,
      id: event.providerPaymentId,
      method: event.method,
      orderId: event.providerOrderId,
      status: event.paymentStatus,
    });
  }
  await prisma.paymentProviderEvent.update({
    where: { id },
    data: { errorMessage: null, processedAt: new Date(), status: 'processed' },
  });
}
