import { Router } from 'express';

import { prisma } from '../lib/prisma.js';
import { redis } from '../lib/redis.js';

export const healthRouter = Router();

healthRouter.get('/live', (_request, response) => {
  response.json({ data: { status: 'ok' } });
});

healthRouter.get('/ready', async (_request, response) => {
  const [, redisResponse] = await Promise.all([prisma.$queryRaw`SELECT 1`, redis.ping()]);
  response.json({
    data: {
      database: 'connected',
      redis: redisResponse === 'PONG' ? 'connected' : 'unavailable',
      status: 'ready',
    },
  });
});
