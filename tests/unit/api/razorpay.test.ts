import { createHmac } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { paymentAttemptInputSchema } from '@settleflow/shared';

import {
  hashPaymentLinkToken,
  isPaymentAttemptExpired,
  PAYMENT_ATTEMPT_TTL_MS,
  paymentAttemptExpiresAt,
} from '../../../apps/api/src/services/paymentTokens.js';
import {
  verifyCheckoutSignature,
  verifyWebhookSignature,
} from '../../../apps/api/src/services/razorpay.js';

describe('Razorpay payment security', () => {
  it('hashes bearer payment-link tokens deterministically without retaining the token', () => {
    const token = 'payment-link-secret-token';
    const hash = hashPaymentLinkToken(token);

    expect(hash).toMatch(/^[a-f0-9]{64}$/);
    expect(hash).toBe(hashPaymentLinkToken(token));
    expect(hash).not.toContain(token);
    expect(hashPaymentLinkToken(`${token}-different`)).not.toBe(hash);
  });

  it('uses an exact 15-minute checkout expiry boundary', () => {
    const now = Date.parse('2026-08-09T10:00:00.000Z');
    const expiresAt = paymentAttemptExpiresAt(now);

    expect(expiresAt.getTime() - now).toBe(PAYMENT_ATTEMPT_TTL_MS);
    expect(isPaymentAttemptExpired(expiresAt, new Date(expiresAt.getTime() - 1))).toBe(false);
    expect(isPaymentAttemptExpired(expiresAt, expiresAt)).toBe(true);
  });

  it('verifies checkout signatures with timing-safe exact comparison', () => {
    const secret = 'test_checkout_secret';
    const orderId = 'order_test_123';
    const paymentId = 'pay_test_123';
    const signature = createHmac('sha256', secret).update(`${orderId}|${paymentId}`).digest('hex');

    expect(verifyCheckoutSignature({ orderId, paymentId, secret, signature })).toBe(true);
    const invalidSignature = `${signature.slice(0, -1)}${signature.endsWith('0') ? '1' : '0'}`;
    expect(
      verifyCheckoutSignature({ orderId, paymentId, secret, signature: invalidSignature }),
    ).toBe(false);
    expect(verifyCheckoutSignature({ orderId, paymentId, secret, signature: 'invalid' })).toBe(
      false,
    );
  });

  it('verifies webhook signatures over the unmodified raw body', () => {
    const secret = 'test_webhook_secret';
    const rawBody = Buffer.from('{"event":"payment.captured"}');
    const signature = createHmac('sha256', secret).update(rawBody).digest('hex');

    expect(verifyWebhookSignature(rawBody, signature, secret)).toBe(true);
    expect(verifyWebhookSignature(Buffer.from(`${rawBody.toString()} `), signature, secret)).toBe(
      false,
    );
  });

  it('accepts only ₹1 or more for online attempts', () => {
    expect(paymentAttemptInputSchema.safeParse({ amountMinor: 99 }).success).toBe(false);
    expect(paymentAttemptInputSchema.parse({ amountMinor: 100 })).toEqual({ amountMinor: 100 });
  });
});
