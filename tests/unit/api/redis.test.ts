import { afterAll, afterEach, describe, expect, it } from 'vitest';

import { createSession, deleteSession, sessionKey } from '../../../apps/api/src/auth/session.js';
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

    await createSession('user-1', response);
    expect(cookieToken).not.toBe('');
    const key = sessionKey(cookieToken);
    expect(key).not.toContain(cookieToken);
    expect(await redis.ttl(key)).toBeGreaterThan(60);

    await deleteSession(cookieToken);
    expect(await redis.exists(key)).toBe(0);
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
