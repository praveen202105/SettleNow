import { randomUUID } from 'node:crypto';
import { orderExportInputSchema, type OrderListItem } from '@settleflow/shared';

import { prisma } from '../lib/prisma.js';
import { writeAuditEvent } from '../services/audit.js';
import { ordersToCsv } from '../services/csv.js';
import { listOrders } from '../services/orders.js';
import { deleteExportObject, putExportObject } from '../services/storage.js';

export async function processOrderExport(exportId: string): Promise<void> {
  const job = await prisma.exportJob.findUnique({ where: { id: exportId } });
  if (!job || job.status === 'completed' || job.status === 'expired') return;

  await prisma.exportJob.update({
    where: { id: exportId },
    data: { errorMessage: null, startedAt: new Date(), status: 'processing' },
  });

  try {
    const query = orderExportInputSchema.parse(job.query);
    const orders: OrderListItem[] = [];
    let page = 1;
    let totalPages = 1;
    do {
      const result = await listOrders(
        job.userId,
        { ...query, page, pageSize: 100 },
        { forcePrimary: true, skipCache: true },
      );
      orders.push(...result.data);
      totalPages = result.meta.totalPages;
      page += 1;
    } while (page <= totalPages);

    const completedAt = new Date();
    const expiresAt = new Date(completedAt.getTime() + 24 * 60 * 60 * 1_000);
    const fileName = `settleflow-orders-${completedAt.toISOString().slice(0, 10)}-${exportId.slice(0, 8)}.csv`;
    const objectKey = `exports/${job.userId}/${randomUUID()}.csv`;
    await putExportObject(objectKey, ordersToCsv(orders));

    await prisma.$transaction(async (transaction) => {
      await transaction.exportJob.update({
        where: { id: exportId },
        data: { completedAt, expiresAt, fileName, objectKey, status: 'completed' },
      });
      await writeAuditEvent(transaction, {
        action: 'export.completed',
        entityId: exportId,
        entityType: 'export',
        metadata: { fileName, rowCount: orders.length },
        userId: job.userId,
      });
      await transaction.outboxEvent.create({
        data: {
          payload: { exportId, userId: job.userId },
          topic: 'export.ready',
        },
      });
    });
  } catch (error) {
    await prisma.exportJob.update({
      where: { id: exportId },
      data: {
        errorMessage: error instanceof Error ? error.message.slice(0, 1_000) : 'Export failed.',
        status: 'failed',
      },
    });
    throw error;
  }
}

export async function cleanupExpiredExports(): Promise<number> {
  const jobs = await prisma.exportJob.findMany({
    where: { expiresAt: { lte: new Date() }, objectKey: { not: null }, status: 'completed' },
    take: 100,
  });
  for (const job of jobs) {
    await deleteExportObject(job.objectKey!);
    await prisma.exportJob.update({
      where: { id: job.id },
      data: { objectKey: null, status: 'expired' },
    });
  }
  return jobs.length;
}
