import { createHash, randomBytes, randomUUID } from 'node:crypto';

import type { Request, Response } from 'express';

import { env } from '../config/env.js';
import { redis } from '../lib/redis.js';

interface SessionRecord {
  createdAt: string;
  id: string;
  userId: string;
}

export function hashSessionToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function sessionKey(token: string): string {
  return `settleflow:session:${hashSessionToken(token)}`;
}

export function readSessionToken(request: Request): string | undefined {
  const cookies: unknown = request.cookies;
  if (!cookies || typeof cookies !== 'object') return undefined;
  const token = (cookies as Record<string, unknown>)[env.SESSION_COOKIE_NAME];
  return typeof token === 'string' ? token : undefined;
}

export async function getSession(token: string | undefined): Promise<SessionRecord | null> {
  if (!token) return null;
  const value = await redis.get(sessionKey(token));
  return value ? (JSON.parse(value) as SessionRecord) : null;
}

export async function createSession(userId: string, response: Response): Promise<void> {
  const token = randomBytes(32).toString('base64url');
  const ttlSeconds = env.SESSION_TTL_DAYS * 24 * 60 * 60;
  const expiresAt = new Date(Date.now() + ttlSeconds * 1_000);
  const session: SessionRecord = {
    createdAt: new Date().toISOString(),
    id: randomUUID(),
    userId,
  };

  await redis.set(sessionKey(token), JSON.stringify(session), 'EX', ttlSeconds);
  response.cookie(env.SESSION_COOKIE_NAME, token, {
    expires: expiresAt,
    httpOnly: true,
    path: '/',
    sameSite: 'lax',
    secure: env.NODE_ENV === 'production',
  });
}

export async function deleteSession(token: string | undefined): Promise<void> {
  if (!token) return;
  await redis.del(sessionKey(token));
}

export function clearSessionCookie(response: Response): void {
  response.clearCookie(env.SESSION_COOKIE_NAME, {
    httpOnly: true,
    path: '/',
    sameSite: 'lax',
    secure: env.NODE_ENV === 'production',
  });
}
