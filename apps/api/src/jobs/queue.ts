import { Queue, type JobsOptions } from 'bullmq';

import { createBullRedisConnection } from '../lib/redis.js';

export const queueName = 'settleflow-jobs';

export type SettleFlowJobName =
  | 'export.generate'
  | 'maintenance.export-cleanup'
  | 'maintenance.overdue-scan'
  | 'notification.export-ready'
  | 'notification.order-overdue'
  | 'notification.payment-recorded';

export interface SettleFlowJobData {
  exportId?: string;
  orderId?: string;
  paymentId?: string;
  userId?: string;
}

export const defaultJobOptions: JobsOptions = {
  attempts: 5,
  backoff: { delay: 5_000, type: 'exponential' },
  removeOnComplete: { age: 24 * 60 * 60, count: 1_000 },
  removeOnFail: { age: 7 * 24 * 60 * 60, count: 5_000 },
};

export function createSettleFlowQueue() {
  const connection = createBullRedisConnection();
  const queue = new Queue<SettleFlowJobData, void, string>(queueName, {
    connection,
    defaultJobOptions,
    prefix: 'settleflow:bull',
  });
  return { connection, queue };
}
