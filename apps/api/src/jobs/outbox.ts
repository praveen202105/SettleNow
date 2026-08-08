import { Prisma } from '@prisma/client';
import type { Queue } from 'bullmq';

import { logger } from '../lib/logger.js';
import { prisma } from '../lib/prisma.js';
import type { SettleFlowJobData, SettleFlowJobName } from './queue.js';

interface ClaimedOutboxEvent {
  attempts: number;
  id: string;
  payload: Prisma.JsonValue;
  topic: string;
}

function jobName(topic: string): SettleFlowJobName {
  const names: Record<string, SettleFlowJobName> = {
    'export.ready': 'notification.export-ready',
    'export.requested': 'export.generate',
    'payment.recorded': 'notification.payment-recorded',
  };
  const name = names[topic];
  if (!name) throw new Error(`Unsupported outbox topic: ${topic}`);
  return name;
}

function jobData(payload: Prisma.JsonValue): SettleFlowJobData {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('Outbox payload must be an object.');
  }
  return payload;
}

async function claimBatch(): Promise<ClaimedOutboxEvent[]> {
  return prisma.$transaction((transaction) =>
    transaction.$queryRaw<ClaimedOutboxEvent[]>(Prisma.sql`
      WITH picked AS (
        SELECT "id"
        FROM "outbox_events"
        WHERE "published_at" IS NULL AND "available_at" <= NOW()
        ORDER BY "created_at" ASC
        FOR UPDATE SKIP LOCKED
        LIMIT 25
      )
      UPDATE "outbox_events" AS event
      SET
        "attempts" = event."attempts" + 1,
        "available_at" = NOW() + INTERVAL '60 seconds'
      FROM picked
      WHERE event."id" = picked."id"
      RETURNING event."id", event."topic", event."payload", event."attempts"
    `),
  );
}

export async function dispatchOutbox(queue: Queue<SettleFlowJobData>): Promise<number> {
  const events = await claimBatch();
  for (const event of events) {
    try {
      await queue.add(jobName(event.topic), jobData(event.payload), { jobId: event.id });
      await prisma.outboxEvent.update({
        where: { id: event.id },
        data: { lastError: null, publishedAt: new Date() },
      });
      logger.info({ eventId: event.id, topic: event.topic }, 'Outbox event published');
    } catch (error) {
      const delaySeconds = Math.min(300, 2 ** Math.min(event.attempts, 8));
      await prisma.outboxEvent.update({
        where: { id: event.id },
        data: {
          availableAt: new Date(Date.now() + delaySeconds * 1_000),
          lastError: error instanceof Error ? error.message.slice(0, 1_000) : 'Unknown error',
        },
      });
      logger.error({ err: error, eventId: event.id, topic: event.topic }, 'Outbox publish failed');
    }
  }
  return events.length;
}
