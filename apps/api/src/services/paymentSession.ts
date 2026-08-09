import { randomBytes } from 'node:crypto';

import type { Request, Response } from 'express';

import { env } from '../config/env.js';
import { redis } from '../lib/redis.js';
import { hashSessionToken } from '../auth/session.js';

interface PaymentSessionRecord {
  linkId: string;
}

function paymentSessionKey(token: string): string {
  return `settleflow:payment-session:${hashSessionToken(token)}`;
}

export function readPaymentSessionToken(request: Request): string | undefined {
  const cookies: unknown = request.cookies;
  if (!cookies || typeof cookies !== 'object') return undefined;
  const token = (cookies as Record<string, unknown>)[env.PAYMENT_SESSION_COOKIE_NAME];
  return typeof token === 'string' ? token : undefined;
}

export async function getPaymentSession(request: Request): Promise<PaymentSessionRecord | null> {
  const token = readPaymentSessionToken(request);
  if (!token) return null;
  const value = await redis.get(paymentSessionKey(token));
  return value ? (JSON.parse(value) as PaymentSessionRecord) : null;
}

export async function createPaymentSession(linkId: string, response: Response): Promise<void> {
  const token = randomBytes(32).toString('base64url');
  const ttlSeconds = env.PAYMENT_SESSION_TTL_MINUTES * 60;
  await redis.set(paymentSessionKey(token), JSON.stringify({ linkId }), 'EX', ttlSeconds);
  response.cookie(env.PAYMENT_SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    maxAge: ttlSeconds * 1_000,
    path: '/api/v1',
    sameSite: 'lax',
    secure: env.NODE_ENV === 'production',
  });
}
