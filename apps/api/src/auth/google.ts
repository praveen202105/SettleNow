import { createHash, randomBytes } from 'node:crypto';

import * as oidc from 'openid-client';

import type { GoogleAuthStartInput } from '@settleflow/shared';

import { env } from '../config/env.js';
import { AppError } from '../http/errors.js';
import { redis } from '../lib/redis.js';

const OAUTH_STATE_TTL_SECONDS = 10 * 60;

export interface GoogleProfile {
  displayName: string;
  email: string;
  emailVerified: boolean;
  subject: string;
}

export interface GoogleAuthorizationInput {
  codeVerifier: string;
  nonce: string;
  state: string;
}

export interface GoogleCallbackInput extends GoogleAuthorizationInput {
  callbackUrl: URL;
}

export interface GoogleOidcClient {
  createAuthorizationUrl(input: GoogleAuthorizationInput): Promise<string>;
  exchangeCallback(input: GoogleCallbackInput): Promise<GoogleProfile>;
}

export interface GoogleOAuthState {
  codeVerifier: string;
  createdAt: string;
  failurePath: '/login' | '/signup' | '/settings/security';
  intent: GoogleAuthStartInput['intent'];
  nonce: string;
  returnTo: string;
  sessionId?: string;
  userId?: string;
}

function normalizeClaimEmail(value: unknown): string {
  if (typeof value !== 'string') {
    throw new AppError(401, 'GOOGLE_PROFILE_INVALID', 'Google did not provide a valid email.');
  }
  return value.trim().toLowerCase();
}

export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

export function safeReturnTo(value: string | undefined, fallback = '/orders'): string {
  if (!value || value.length > 300 || !value.startsWith('/') || value.startsWith('//')) {
    return fallback;
  }
  if (value.includes('\\') || value.includes('\0')) return fallback;

  try {
    const parsed = new URL(value, 'https://settleflow.local');
    if (parsed.origin !== 'https://settleflow.local') return fallback;
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return fallback;
  }
}

export function googleCallbackUrl(): string {
  return new URL('/api/v1/auth/google/callback', env.APP_ORIGIN).toString();
}

export function googleOAuthStateKey(state: string): string {
  const digest = createHash('sha256').update(state).digest('hex');
  return `settleflow:oauth:google:${digest}`;
}

export async function createGoogleOAuthState(
  client: GoogleOidcClient,
  input: Omit<GoogleOAuthState, 'codeVerifier' | 'createdAt' | 'nonce'>,
): Promise<{ authorizationUrl: string; state: string }> {
  const state = randomBytes(32).toString('base64url');
  const codeVerifier = oidc.randomPKCECodeVerifier();
  const nonce = oidc.randomNonce();
  const authorizationUrl = await client.createAuthorizationUrl({ codeVerifier, nonce, state });
  const record: GoogleOAuthState = {
    ...input,
    codeVerifier,
    createdAt: new Date().toISOString(),
    nonce,
  };

  await redis.set(
    googleOAuthStateKey(state),
    JSON.stringify(record),
    'EX',
    OAUTH_STATE_TTL_SECONDS,
  );
  return { authorizationUrl, state };
}

export async function consumeGoogleOAuthState(state: unknown): Promise<GoogleOAuthState | null> {
  if (typeof state !== 'string' || !/^[A-Za-z0-9_-]{32,128}$/.test(state)) return null;
  const value = await redis.getdel(googleOAuthStateKey(state));
  if (!value) return null;

  try {
    return JSON.parse(value) as GoogleOAuthState;
  } catch {
    return null;
  }
}

export class OpenIdGoogleClient implements GoogleOidcClient {
  private configuration: Promise<oidc.Configuration> | undefined;

  private getConfiguration(): Promise<oidc.Configuration> {
    if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) {
      throw new AppError(503, 'GOOGLE_AUTH_UNAVAILABLE', 'Google authentication is unavailable.');
    }
    const issuer = new URL(env.GOOGLE_OIDC_ISSUER);
    this.configuration ??= oidc.discovery(
      issuer,
      env.GOOGLE_CLIENT_ID,
      env.GOOGLE_CLIENT_SECRET,
      undefined,
      issuer.protocol === 'http:' ? { execute: [oidc.allowInsecureRequests] } : undefined,
    );
    return this.configuration;
  }

  async createAuthorizationUrl(input: GoogleAuthorizationInput): Promise<string> {
    const configuration = await this.getConfiguration();
    const codeChallenge = await oidc.calculatePKCECodeChallenge(input.codeVerifier);
    return oidc
      .buildAuthorizationUrl(configuration, {
        code_challenge: codeChallenge,
        code_challenge_method: 'S256',
        nonce: input.nonce,
        prompt: 'select_account',
        redirect_uri: googleCallbackUrl(),
        response_type: 'code',
        scope: 'openid email profile',
        state: input.state,
      })
      .toString();
  }

  async exchangeCallback(input: GoogleCallbackInput): Promise<GoogleProfile> {
    const configuration = await this.getConfiguration();
    const tokens = await oidc.authorizationCodeGrant(configuration, input.callbackUrl, {
      expectedNonce: input.nonce,
      expectedState: input.state,
      pkceCodeVerifier: input.codeVerifier,
    });
    const claims = tokens.claims();
    const subject = claims?.sub;
    if (!subject || typeof subject !== 'string') {
      throw new AppError(401, 'GOOGLE_PROFILE_INVALID', 'Google did not provide a valid identity.');
    }

    const email = normalizeClaimEmail(claims.email);
    const displayName =
      typeof claims.name === 'string' && claims.name.trim()
        ? claims.name.trim().slice(0, 100)
        : email.split('@')[0]!.slice(0, 100);

    return {
      displayName,
      email,
      emailVerified: claims.email_verified === true,
      subject,
    };
  }
}

export const defaultGoogleOidcClient = new OpenIdGoogleClient();

export const googleOAuthForTest = {
  stateTtlSeconds: OAUTH_STATE_TTL_SECONDS,
};
