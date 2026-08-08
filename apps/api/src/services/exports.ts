import type { Prisma } from '@prisma/client';

import {
  orderExportInputSchema,
  type ExportListQuery,
  type ExportResponse,
  type OrderExportInput,
  type PaginationMeta,
} from '@settleflow/shared';

import { AppError } from '../http/errors.js';
import { prisma } from '../lib/prisma.js';
import { writeAuditEvent } from './audit.js';
import { getExportObject } from './storage.js';

function presentExport(job: {
  completedAt: Date | null;
  errorMessage: string | null;
  expiresAt: Date | null;
  fileName: string | null;
  id: string;
  query: Prisma.JsonValue;
  requestedAt: Date;
  startedAt: Date | null;
  status: string;
}): ExportResponse {
  const query = orderExportInputSchema.parse(job.query);
  return {
    completedAt: job.completedAt?.toISOString() ?? null,
    errorMessage: job.errorMessage,
    expiresAt: job.expiresAt?.toISOString() ?? null,
    fileName: job.fileName,
    id: job.id,
    query: {
      direction: query.direction,
      sort: query.sort,
      ...(query.search ? { search: query.search } : {}),
      ...(query.status ? { status: query.status } : {}),
    },
    requestedAt: job.requestedAt.toISOString(),
    startedAt: job.startedAt?.toISOString() ?? null,
    status: job.status as ExportResponse['status'],
  };
}

export async function requestOrderExport(
  userId: string,
  query: OrderExportInput,
  requestId?: string,
): Promise<ExportResponse> {
  const job = await prisma.$transaction(async (transaction) => {
    const created = await transaction.exportJob.create({
      data: { query, userId },
    });
    await writeAuditEvent(transaction, {
      action: 'export.requested',
      entityId: created.id,
      entityType: 'export',
      metadata: { query },
      requestId,
      userId,
    });
    await transaction.outboxEvent.create({
      data: {
        payload: { exportId: created.id, userId },
        topic: 'export.requested',
      },
    });
    return created;
  });
  return presentExport(job);
}

export async function retryOrderExport(
  userId: string,
  id: string,
  requestId?: string,
): Promise<ExportResponse> {
  const existing = await prisma.exportJob.findFirst({ where: { id, userId } });
  if (!existing) throw new AppError(404, 'EXPORT_NOT_FOUND', 'Export not found.');
  if (!['failed', 'expired'].includes(existing.status)) {
    throw new AppError(
      409,
      'EXPORT_NOT_RETRYABLE',
      'Only failed or expired exports can be retried.',
    );
  }
  return requestOrderExport(userId, orderExportInputSchema.parse(existing.query), requestId);
}

export async function listExports(
  userId: string,
  query: ExportListQuery,
): Promise<{ data: ExportResponse[]; meta: PaginationMeta }> {
  const where = { userId };
  const [total, jobs] = await prisma.$transaction([
    prisma.exportJob.count({ where }),
    prisma.exportJob.findMany({
      where,
      orderBy: [{ requestedAt: 'desc' }, { id: 'desc' }],
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
  ]);
  return {
    data: jobs.map(presentExport),
    meta: {
      page: query.page,
      pageSize: query.pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
    },
  };
}

export async function getExport(userId: string, id: string): Promise<ExportResponse> {
  const job = await prisma.exportJob.findFirst({ where: { id, userId } });
  if (!job) throw new AppError(404, 'EXPORT_NOT_FOUND', 'Export not found.');
  return presentExport(job);
}

export async function downloadExport(userId: string, id: string, requestId?: string) {
  const job = await prisma.exportJob.findFirst({ where: { id, userId } });
  if (!job) throw new AppError(404, 'EXPORT_NOT_FOUND', 'Export not found.');
  if (job.expiresAt && job.expiresAt <= new Date()) {
    await prisma.exportJob.update({ where: { id }, data: { status: 'expired' } });
    throw new AppError(410, 'EXPORT_EXPIRED', 'This export has expired. Create a new export.');
  }
  if (job.status !== 'completed' || !job.objectKey || !job.fileName) {
    throw new AppError(409, 'EXPORT_NOT_READY', 'This export is not ready to download.');
  }
  await writeAuditEvent(prisma, {
    action: 'export.downloaded',
    entityId: job.id,
    entityType: 'export',
    metadata: { fileName: job.fileName },
    requestId,
    userId,
  });
  return { fileName: job.fileName, stream: await getExportObject(job.objectKey) };
}
