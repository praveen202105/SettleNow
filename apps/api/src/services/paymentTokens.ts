import { createHash } from 'node:crypto';

export const PAYMENT_ATTEMPT_TTL_MS = 15 * 60 * 1_000;

export function hashPaymentLinkToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function paymentAttemptExpiresAt(now = Date.now()): Date {
  return new Date(now + PAYMENT_ATTEMPT_TTL_MS);
}

export function isPaymentAttemptExpired(expiresAt: Date, now = new Date()): boolean {
  return expiresAt <= now;
}
