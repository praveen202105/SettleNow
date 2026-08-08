import { afterAll, afterEach, describe, expect, it } from 'vitest';

import {
  consumeGoogleOAuthState,
  createGoogleOAuthState,
  googleOAuthStateKey,
  safeReturnTo,
  type GoogleOidcClient,
} from '../../../apps/api/src/auth/google.js';
import {
  createSession,
  deleteSession,
  getSession,
  rotateSession,
  sessionKey,
} from '../../../apps/api/src/auth/session.js';
import { redis } from '../../../apps/api/src/lib/redis.js';
import {
  cacheKeysForTest,
  invalidateOrderReads,
  orderListCacheKey,
} from '../../../apps/api/src/services/cache.js';

afterEach(async () => {
  const keys = await redis.keys('settleflow:*');
  if (keys.length > 0) await redis.del(...keys);
});

afterAll(() => {
  redis.disconnect();
});

describe('Redis architecture primitives', () => {
  it('stores only a hashed session key with an expiry and supports revocation', async () => {
    let cookieToken = '';
    const response = {
      cookie: (_name: string, value: string) => {
        cookieToken = value;
      },
    } as unknown as Parameters<typeof createSession>[1];

    await createSession('user-1', response, 'google');
    expect(cookieToken).not.toBe('');
    const key = sessionKey(cookieToken);
    expect(key).not.toContain(cookieToken);
    expect(await redis.ttl(key)).toBeGreaterThan(60);
    expect(await getSession(cookieToken)).toMatchObject({ authenticatedWith: 'google' });

    await deleteSession(cookieToken);
    expect(await redis.exists(key)).toBe(0);
  });

  it('rotates a session and revokes the previous cookie token', async () => {
    let firstToken = '';
    const firstResponse = {
      cookie: (_name: string, value: string) => {
        firstToken = value;
      },
    } as unknown as Parameters<typeof createSession>[1];
    await createSession('user-1', firstResponse);

    let secondToken = '';
    const request = { cookies: { settleflow_session: firstToken } } as unknown as Parameters<
      typeof rotateSession
    >[0];
    const secondResponse = {
      cookie: (_name: string, value: string) => {
        secondToken = value;
      },
    } as unknown as Parameters<typeof rotateSession>[1];
    await rotateSession(request, secondResponse, 'user-1');

    expect(secondToken).not.toBe(firstToken);
    expect(await redis.exists(sessionKey(firstToken))).toBe(0);
    expect(await redis.exists(sessionKey(secondToken))).toBe(1);
  });

  it('stores hashed single-use Google OAuth state with a short TTL', async () => {
    const fakeClient: GoogleOidcClient = {
      createAuthorizationUrl: ({ state }) =>
        Promise.resolve(`https://accounts.test/auth?state=${state}`),
      exchangeCallback: () => Promise.reject(new Error('Not used in this unit test')),
    };
    const authorization = await createGoogleOAuthState(fakeClient, {
      failurePath: '/login',
      intent: 'signin',
      returnTo: '/orders',
    });
    const key = googleOAuthStateKey(authorization.state);
    expect(key).not.toContain(authorization.state);
    expect(await redis.ttl(key)).toBeGreaterThan(60);

    expect(await consumeGoogleOAuthState(authorization.state)).toMatchObject({
      failurePath: '/login',
      intent: 'signin',
      returnTo: '/orders',
    });
    expect(await consumeGoogleOAuthState(authorization.state)).toBeNull();
  });

  it('allows only local OAuth return paths', () => {
    expect(safeReturnTo('/settings/security?google=linked')).toBe(
      '/settings/security?google=linked',
    );
    expect(safeReturnTo('https://evil.example/phish')).toBe('/orders');
    expect(safeReturnTo('//evil.example/phish')).toBe('/orders');
    expect(safeReturnTo('/\\evil.example')).toBe('/orders');
  });

  it('isolates query caches by user and versions them after writes', async () => {
    const query = { direction: 'desc', page: 1, pageSize: 10, sort: 'orderNumber' } as const;
    const first = await orderListCacheKey('user-1', query);
    const otherUser = await orderListCacheKey('user-2', query);
    expect(first).not.toBe(otherUser);

    await invalidateOrderReads('user-1');
    const invalidated = await orderListCacheKey('user-1', query);
    expect(invalidated).not.toBe(first);
    expect(await redis.exists(cacheKeysForTest.primaryReadKey('user-1'))).toBe(1);
  });
});
