import { Redis } from 'ioredis';

import { env } from '../config/env.js';
import { logger } from './logger.js';

const globalForRedis = globalThis as unknown as { settleflowRedis?: Redis };

function createRedisClient(maxRetriesPerRequest: number | null): Redis {
  const client = new Redis(env.REDIS_URL, {
    enableReadyCheck: true,
    lazyConnect: true,
    maxRetriesPerRequest,
  });
  client.on('error', (error: Error) => logger.warn({ err: error }, 'Redis connection error'));
  return client;
}

export const redis = globalForRedis.settleflowRedis ?? createRedisClient(1);

if (env.NODE_ENV !== 'production') globalForRedis.settleflowRedis = redis;

export function createBullRedisConnection(): Redis {
  return createRedisClient(null);
}

export async function redisReady(): Promise<boolean> {
  try {
    return (await redis.ping()) === 'PONG';
  } catch {
    return false;
  }
}

export async function disconnectRedis(): Promise<void> {
  if (redis.status === 'ready' || redis.status === 'connecting' || redis.status === 'connect') {
    await redis.quit().catch(() => redis.disconnect());
  } else {
    redis.disconnect();
  }
}
