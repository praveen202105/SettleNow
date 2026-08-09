import { Router, type Request } from 'express';

import { paymentAttemptInputSchema, paymentLinkSessionSchema } from '@settleflow/shared';

import { AppError } from '../http/errors.js';
import { requestId } from '../http/request.js';
import { createPaymentSession, getPaymentSession } from '../services/paymentSession.js';
import {
  createPublicPaymentAttempt,
  exchangePaymentLink,
  getPaymentAttempt,
  getPublicPaymentLink,
} from '../services/payments.js';
import { createRazorpayProvider, type PaymentProvider } from '../services/razorpay.js';

async function linkId(request: Request): Promise<string> {
  const session = await getPaymentSession(request);
  if (!session) {
    throw new AppError(
      401,
      'PAYMENT_SESSION_REQUIRED',
      'Open the original payment link and try again.',
    );
  }
  return session.linkId;
}

export function createPublicPaymentsRouter(provider: PaymentProvider = createRazorpayProvider()) {
  const router = Router();

  router.post('/payment-links/session', async (request, response) => {
    const input = paymentLinkSessionSchema.parse(request.body);
    const summary = await exchangePaymentLink(input.token);
    await createPaymentSession(summary.id, response);
    response.json({ data: summary });
  });
  router.get('/payment-links/:id', async (request, response) => {
    const sessionLinkId = await linkId(request);
    if (sessionLinkId !== request.params.id) {
      throw new AppError(404, 'PAYMENT_LINK_INVALID', 'This payment link is no longer available.');
    }
    response.json({ data: await getPublicPaymentLink(sessionLinkId) });
  });
  router.post('/payment-links/:id/attempts', async (request, response) => {
    const sessionLinkId = await linkId(request);
    if (sessionLinkId !== request.params.id) {
      throw new AppError(404, 'PAYMENT_LINK_INVALID', 'This payment link is no longer available.');
    }
    const input = paymentAttemptInputSchema.parse(request.body);
    response.status(201).json({
      data: await createPublicPaymentAttempt(sessionLinkId, input, provider, requestId(request)),
    });
  });
  router.get('/payment-attempts/:id', async (request, response) => {
    response.json({
      data: await getPaymentAttempt(request.params.id, { linkId: await linkId(request) }),
    });
  });

  return router;
}
