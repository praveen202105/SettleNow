import type { Prisma, PrismaClient } from '@prisma/client';

import type {
  ActivityQuery,
  AuditAction,
  AuditEventResponse,
  PaginationMeta,
} from '@settleflow/shared';

import { prisma } from '../lib/prisma.js';

type DbClient = PrismaClient | Prisma.TransactionClient;

export interface AuditInput {
  action: AuditAction;
  entityId?: string | null | undefined;
  entityType: string;
  metadata?: Record<string, unknown>;
  orderId?: string | null | undefined;
  requestId?: string | undefined;
  userId: string;
}

export function writeAuditEvent(db: DbClient, input: AuditInput) {
  return db.auditEvent.create({
    data: {
      action: input.action,
      entityType: input.entityType,
      metadata: (input.metadata ?? {}) as Prisma.InputJsonValue,
      userId: input.userId,
      ...(input.entityId !== undefined ? { entityId: input.entityId } : {}),
      ...(input.orderId !== undefined ? { orderId: input.orderId } : {}),
      ...(input.requestId !== undefined ? { requestId: input.requestId } : {}),
    },
  });
}

function metadataRecord(value: Prisma.JsonValue): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

export function presentAuditEvent(event: {
  action: string;
  createdAt: Date;
  entityId: string | null;
  entityType: string;
  id: string;
  metadata: Prisma.JsonValue;
  orderId: string | null;
}): AuditEventResponse {
  return {
    action: event.action as AuditAction,
    createdAt: event.createdAt.toISOString(),
    entityId: event.entityId,
    entityType: event.entityType,
    id: event.id,
    metadata: metadataRecord(event.metadata),
    orderId: event.orderId,
  };
}

export async function listActivity(
  userId: string,
  query: ActivityQuery,
): Promise<{ data: AuditEventResponse[]; meta: PaginationMeta }> {
  const where = {
    userId,
    ...(query.action ? { action: query.action } : {}),
    ...(query.orderId ? { orderId: query.orderId } : {}),
  };
  const [total, events] = await prisma.$transaction([
    prisma.auditEvent.count({ where }),
    prisma.auditEvent.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
  ]);

  return {
    data: events.map(presentAuditEvent),
    meta: {
      page: query.page,
      pageSize: query.pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
    },
  };
}
