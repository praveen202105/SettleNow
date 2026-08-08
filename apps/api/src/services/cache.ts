import { createHash } from 'node:crypto';

import type { OrderListQuery } from '@settleflow/shared';

import { env } from '../config/env.js';
import { logger } from '../lib/logger.js';
import { prisma, readPrisma } from '../lib/prisma.js';
import { redis } from '../lib/redis.js';

const prefix = 'settleflow:orders';

function versionKey(userId: string): string {
  return `${prefix}:version:${userId}`;
}

function primaryReadKey(userId: string): string {
  return `${prefix}:primary-read:${userId}`;
}

async function currentVersion(userId: string): Promise<string> {
  try {
    return (await redis.get(versionKey(userId))) ?? '0';
  } catch (error) {
    logger.warn({ err: error, userId }, 'Order cache version lookup failed');
    return '0';
  }
}

export async function orderListCacheKey(userId: string, query: OrderListQuery): Promise<string> {
  const version = await currentVersion(userId);
  const digest = createHash('sha256').update(JSON.stringify(query)).digest('hex').slice(0, 24);
  return `${prefix}:${userId}:v${version}:list:${digest}`;
}

export async function orderSummaryCacheKey(userId: string): Promise<string> {
  return `${prefix}:${userId}:v${await currentVersion(userId)}:summary`;
}

export async function readCachedJson<T>(key: string): Promise<T | null> {
  try {
    const value = await redis.get(key);
    return value ? (JSON.parse(value) as T) : null;
  } catch (error) {
    logger.warn({ err: error, key }, 'Redis cache read failed');
    return null;
  }
}

export async function writeCachedJson(key: string, value: unknown): Promise<void> {
  try {
    await redis.set(key, JSON.stringify(value), 'EX', env.CACHE_TTL_SECONDS);
  } catch (error) {
    logger.warn({ err: error, key }, 'Redis cache write failed');
  }
}

export async function invalidateOrderReads(userId: string): Promise<void> {
  try {
    const transaction = redis.multi();
    transaction.incr(versionKey(userId));
    transaction.set(primaryReadKey(userId), '1', 'EX', env.READ_AFTER_WRITE_SECONDS);
    await transaction.exec();
  } catch (error) {
    logger.warn({ err: error, userId }, 'Order cache invalidation failed');
  }
}

export async function dashboardDatabase(userId: string, forcePrimary = false) {
  if (forcePrimary || readPrisma === prisma) return prisma;
  try {
    return (await redis.exists(primaryReadKey(userId))) > 0 ? prisma : readPrisma;
  } catch (error) {
    logger.warn({ err: error, userId }, 'Read routing lookup failed; using primary database');
    return prisma;
  }
}

export const cacheKeysForTest = { primaryReadKey, versionKey };
