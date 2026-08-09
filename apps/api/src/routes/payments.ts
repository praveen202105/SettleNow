import { Router, type Request } from 'express';

import { paymentAttemptInputSchema, paymentConfirmationSchema } from '@settleflow/shared';

import { requireAuth } from '../auth/middleware.js';
import { getSession, readSessionToken } from '../auth/session.js';
import { AppError } from '../http/errors.js';
import { requestId } from '../http/request.js';
import { getPaymentSession } from '../services/paymentSession.js';
import {
  cancelPaymentAttempt,
  confirmPaymentAttempt,
  createOwnerPaymentAttempt,
  createPaymentLink,
  getPaymentAttempt,
  getPaymentLink,
  paymentConfig,
  revokePaymentLink,
} from '../services/payments.js';
import { createRazorpayProvider, type PaymentProvider } from '../services/razorpay.js';

function userId(request: Request): string {
  const id = request.auth?.userId;
  if (!id) throw new AppError(401, 'AUTH_REQUIRED', 'Sign in to continue.');
  return id;
}

export function createPaymentsRouter() {
  const router = Router();

  router.get('/config', (_request, response) => response.json({ data: paymentConfig() }));

  return router;
}

export function createPaymentAttemptsRouter(provider: PaymentProvider = createRazorpayProvider()) {
  const router = Router();

  router.post('/:id/confirm', async (request, response) => {
    const owner = await getSession(readSessionToken(request));
    const paymentSession = await getPaymentSession(request);
    if (!owner && !paymentSession) {
      throw new AppError(
        401,
        'PAYMENT_SESSION_REQUIRED',
        'Open the original payment link and try again.',
      );
    }
    const input = paymentConfirmationSchema.parse(request.body);
    const access = {
      ...(owner ? { userId: owner.userId } : {}),
      ...(paymentSession ? { linkId: paymentSession.linkId } : {}),
    };
    response.json({
      data: await confirmPaymentAttempt(String(request.params.id), access, input, provider),
    });
  });

  router.delete('/:id', requireAuth, async (request, response) => {
    response.json({ data: await cancelPaymentAttempt(String(request.params.id), userId(request)) });
  });
  router.get('/:id', requireAuth, async (request, response) => {
    response.json({
      data: await getPaymentAttempt(String(request.params.id), { userId: userId(request) }),
    });
  });

  return router;
}

export function createOwnerPaymentRouter(provider: PaymentProvider = createRazorpayProvider()) {
  const router = Router();
  router.use(requireAuth);

  router.get('/:id/payment-link', async (request, response) => {
    response.json({ data: await getPaymentLink(userId(request), request.params.id) });
  });
  router.post('/:id/payment-link', async (request, response) => {
    response.status(201).json({
      data: await createPaymentLink(userId(request), request.params.id, requestId(request)),
    });
  });
  router.delete('/:id/payment-link', async (request, response) => {
    response.json({
      data: await revokePaymentLink(userId(request), request.params.id, requestId(request)),
    });
  });
  router.post('/:id/payment-attempts', async (request, response) => {
    const input = paymentAttemptInputSchema.parse(request.body);
    response.status(201).json({
      data: await createOwnerPaymentAttempt(
        userId(request),
        request.params.id,
        input,
        provider,
        requestId(request),
      ),
    });
  });

  return router;
}
