import type { Job, Queue } from 'bullmq';

import { cleanupExpiredExports, processOrderExport } from './exportProcessor.js';
import {
  notifyExportReady,
  notifyOrderOverdue,
  notifyPaymentRecorded,
  notifyWelcome,
  overdueOrders,
} from './notificationProcessor.js';
import type { SettleFlowJobData } from './queue.js';
import { processProviderEvent } from '../services/payments.js';

function required(value: string | undefined, name: string): string {
  if (!value) throw new Error(`Job is missing ${name}.`);
  return value;
}

export async function processJob(
  job: Job<SettleFlowJobData, void, string>,
  queue: Queue<SettleFlowJobData, void, string>,
): Promise<void> {
  switch (job.name) {
    case 'export.generate':
      await processOrderExport(required(job.data.exportId, 'exportId'));
      return;
    case 'notification.export-ready':
      await notifyExportReady({
        exportId: required(job.data.exportId, 'exportId'),
        userId: required(job.data.userId, 'userId'),
      });
      return;
    case 'notification.payment-recorded':
      await notifyPaymentRecorded({
        orderId: required(job.data.orderId, 'orderId'),
        paymentId: required(job.data.paymentId, 'paymentId'),
        userId: required(job.data.userId, 'userId'),
      });
      return;
    case 'notification.user-welcome':
      await notifyWelcome({ userId: required(job.data.userId, 'userId') });
      return;
    case 'payment.provider-event':
      await processProviderEvent(required(job.data.providerEventId, 'providerEventId'));
      return;
    case 'notification.order-overdue':
      await notifyOrderOverdue({
        orderId: required(job.data.orderId, 'orderId'),
        userId: required(job.data.userId, 'userId'),
      });
      return;
    case 'maintenance.overdue-scan': {
      const orders = await overdueOrders();
      await Promise.all(
        orders.map((order) =>
          queue.add('notification.order-overdue', order, {
            jobId: `overdue-${order.orderId}`,
          }),
        ),
      );
      return;
    }
    case 'maintenance.export-cleanup':
      await cleanupExpiredExports();
  }
}
