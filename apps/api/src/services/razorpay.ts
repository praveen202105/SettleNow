import { createHmac, timingSafeEqual } from 'node:crypto';

import { AppError } from '../http/errors.js';
import { env } from '../config/env.js';

export interface ProviderPayment {
  amountMinor: number;
  currency: string;
  id: string;
  method: string | null;
  orderId: string;
  status: string;
}

export interface PaymentProvider {
  createOrder(input: {
    amountMinor: number;
    orderId: string;
    receipt: string;
  }): Promise<{ id: string }>;
  fetchPayment(id: string): Promise<ProviderPayment>;
}

interface RazorpayOrderBody {
  id: string;
}

interface RazorpayPaymentBody {
  amount: number;
  currency: string;
  id: string;
  method?: string | null;
  order_id: string;
  status: string;
}

async function razorpayRequest<T>(
  path: string,
  init: RequestInit,
  credentials: { keyId: string; keySecret: string },
): Promise<T> {
  const response = await fetch(`https://api.razorpay.com/v1${path}`, {
    ...init,
    headers: {
      authorization: `Basic ${Buffer.from(`${credentials.keyId}:${credentials.keySecret}`).toString('base64')}`,
      'content-type': 'application/json',
      ...init.headers,
    },
    signal: AbortSignal.timeout(8_000),
  });

  if (!response.ok) {
    const requestId = response.headers.get('x-request-id');
    throw new AppError(
      502,
      'PAYMENT_PROVIDER_UNAVAILABLE',
      'Razorpay could not start or verify this test payment. Try again shortly.',
      requestId ? { providerRequestId: requestId } : undefined,
    );
  }

  return (await response.json()) as T;
}

export function createRazorpayProvider(
  credentials = {
    keyId: env.RAZORPAY_KEY_ID,
    keySecret: env.RAZORPAY_KEY_SECRET,
  },
): PaymentProvider {
  if (!credentials.keyId || !credentials.keySecret) {
    return {
      createOrder: () =>
        Promise.reject(
          new AppError(503, 'PAYMENTS_DISABLED', 'Online test payments are not configured yet.'),
        ),
      fetchPayment: () =>
        Promise.reject(
          new AppError(503, 'PAYMENTS_DISABLED', 'Online test payments are not configured yet.'),
        ),
    };
  }

  if (env.RAZORPAY_FAKE_PROVIDER) {
    return {
      createOrder(input) {
        return Promise.resolve({ id: `order_test_${input.receipt}` });
      },
      fetchPayment(id) {
        const match = /^pay_test_(\d+)_(.+)$/.exec(id);
        if (!match) {
          return Promise.reject(new Error('Unknown fake Razorpay payment.'));
        }
        return Promise.resolve({
          amountMinor: Number(match[1]),
          currency: 'INR',
          id,
          method: 'upi',
          orderId: `order_test_${match[2]}`,
          status: 'captured',
        });
      },
    };
  }

  const configured = { keyId: credentials.keyId, keySecret: credentials.keySecret };
  return {
    async createOrder(input) {
      const result = await razorpayRequest<RazorpayOrderBody>(
        '/orders',
        {
          body: JSON.stringify({
            amount: input.amountMinor,
            currency: 'INR',
            notes: { settleflow_order_id: input.orderId },
            receipt: input.receipt,
          }),
          method: 'POST',
        },
        configured,
      );
      return { id: result.id };
    },
    async fetchPayment(id) {
      const result = await razorpayRequest<RazorpayPaymentBody>(
        `/payments/${encodeURIComponent(id)}`,
        { method: 'GET' },
        configured,
      );
      return {
        amountMinor: result.amount,
        currency: result.currency,
        id: result.id,
        method: result.method ?? null,
        orderId: result.order_id,
        status: result.status,
      };
    },
  };
}

function secureHexEqual(expected: string, received: string): boolean {
  if (!/^[a-f0-9]{64}$/i.test(received)) return false;
  const expectedBuffer = Buffer.from(expected, 'hex');
  const receivedBuffer = Buffer.from(received, 'hex');
  return (
    expectedBuffer.length === receivedBuffer.length &&
    timingSafeEqual(expectedBuffer, receivedBuffer)
  );
}

export function verifyCheckoutSignature(input: {
  orderId: string;
  paymentId: string;
  signature: string;
  secret: string;
}): boolean {
  const expected = createHmac('sha256', input.secret)
    .update(`${input.orderId}|${input.paymentId}`)
    .digest('hex');
  return secureHexEqual(expected, input.signature);
}

export function verifyWebhookSignature(
  rawBody: Buffer,
  signature: string,
  secret: string,
): boolean {
  const expected = createHmac('sha256', secret).update(rawBody).digest('hex');
  return secureHexEqual(expected, signature);
}
