import { createServer } from 'node:http';
import { Worker } from 'bullmq';

import { env } from './config/env.js';
import { dispatchOutbox } from './jobs/outbox.js';
import { processJob } from './jobs/processor.js';
import { createSettleFlowQueue, queueName, type SettleFlowJobData } from './jobs/queue.js';
import { logger } from './lib/logger.js';
import { disconnectPrisma, prisma } from './lib/prisma.js';
import { createBullRedisConnection, disconnectRedis, redis } from './lib/redis.js';

const { connection: queueConnection, queue } = createSettleFlowQueue();
const workerConnection = createBullRedisConnection();
const worker = new Worker<SettleFlowJobData, void, string>(
  queueName,
  (job) => processJob(job, queue),
  { concurrency: 5, connection: workerConnection, prefix: 'settleflow:bull' },
);

worker.on('completed', (job) => logger.info({ jobId: job.id, jobName: job.name }, 'Job completed'));
worker.on('failed', (job, error) =>
  logger.error({ err: error, jobId: job?.id, jobName: job?.name }, 'Job failed'),
);

await Promise.all([
  queue.upsertJobScheduler(
    'daily-overdue-scan',
    { pattern: '10 0 * * *' },
    { data: {}, name: 'maintenance.overdue-scan' },
  ),
  queue.upsertJobScheduler(
    'daily-export-cleanup',
    { pattern: '30 0 * * *' },
    { data: {}, name: 'maintenance.export-cleanup' },
  ),
]);

let dispatching = false;
const dispatchTimer = setInterval(() => {
  if (dispatching) return;
  dispatching = true;
  void dispatchOutbox(queue)
    .catch((error) => logger.error({ err: error }, 'Outbox dispatcher failed'))
    .finally(() => {
      dispatching = false;
    });
}, env.OUTBOX_POLL_INTERVAL_MS);
dispatchTimer.unref();

const healthServer = createServer(async (request, response) => {
  if (request.url === '/health/live') {
    response.setHeader('content-type', 'application/json');
    response.end(JSON.stringify({ data: { status: 'ok' } }));
    return;
  }
  if (request.url === '/health/ready') {
    try {
      await Promise.all([
        prisma.$queryRaw`SELECT 1`,
        redis.ping(),
        queue.getJobCounts('wait', 'active'),
      ]);
      response.setHeader('content-type', 'application/json');
      response.end(
        JSON.stringify({
          data: { database: 'connected', queue: 'connected', redis: 'connected', status: 'ready' },
        }),
      );
    } catch (error) {
      logger.error({ err: error }, 'Worker readiness check failed');
      response.statusCode = 503;
      response.end(
        JSON.stringify({
          error: { code: 'WORKER_NOT_READY', message: 'Worker dependencies are unavailable.' },
        }),
      );
    }
    return;
  }
  response.statusCode = 404;
  response.end();
});

healthServer.listen(env.WORKER_PORT, '0.0.0.0', () => {
  logger.info({ port: env.WORKER_PORT }, 'SettleFlow worker is ready');
});

let shuttingDown = false;
async function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  clearInterval(dispatchTimer);
  logger.info({ signal }, 'Worker shutdown started');
  healthServer.close();
  await Promise.all([
    worker.close(),
    queue.close(),
    workerConnection.quit(),
    queueConnection.quit(),
  ]);
  await Promise.all([disconnectPrisma(), disconnectRedis()]);
  process.exit(0);
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
