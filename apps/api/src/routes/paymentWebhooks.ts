import type { RequestHandler } from 'express';
import { z } from 'zod';

import { env } from '../config/env.js';
import { AppError } from '../http/errors.js';
import { storeProviderEvent } from '../services/payments.js';
import { verifyWebhookSignature } from '../services/razorpay.js';

const webhookSchema = z.object({
  event: z.string(),
  payload: z.object({
    payment: z.object({
      entity: z.object({
        amount: z.number().int().positive(),
        currency: z.string(),
        id: z.string(),
        method: z.string().nullable().optional(),
        order_id: z.string().nullable(),
        status: z.string(),
      }),
    }),
  }),
});

export const razorpayWebhookHandler: RequestHandler = async (request, response) => {
  if (!env.PAYMENTS_ENABLED || !env.RAZORPAY_WEBHOOK_SECRET) {
    throw new AppError(503, 'PAYMENTS_DISABLED', 'Online test payments are not configured yet.');
  }
  if (!Buffer.isBuffer(request.body)) {
    throw new AppError(400, 'WEBHOOK_BODY_INVALID', 'Webhook body must be raw JSON.');
  }
  const signature = request.get('x-razorpay-signature') ?? '';
  if (!verifyWebhookSignature(request.body, signature, env.RAZORPAY_WEBHOOK_SECRET)) {
    throw new AppError(400, 'WEBHOOK_SIGNATURE_INVALID', 'Webhook signature was invalid.');
  }
  const providerEventId = request.get('x-razorpay-event-id');
  if (!providerEventId || providerEventId.length > 200) {
    throw new AppError(400, 'WEBHOOK_EVENT_ID_REQUIRED', 'Webhook event id is required.');
  }
  const parsed = webhookSchema.parse(JSON.parse(request.body.toString('utf8')));
  if (!['payment.captured', 'payment.failed'].includes(parsed.event)) {
    response.json({ data: { accepted: true } });
    return;
  }
  const payment = parsed.payload.payment.entity;
  await storeProviderEvent({
    amountMinor: payment.amount,
    currency: payment.currency,
    eventType: parsed.event,
    method: payment.method ?? null,
    paymentStatus: payment.status,
    providerEventId,
    providerOrderId: payment.order_id,
    providerPaymentId: payment.id,
  });
  response.json({ data: { accepted: true } });
};
