import { Prisma } from '@prisma/client';

import { env } from '../config/env.js';
import {
  exportReadyEmail,
  orderOverdueEmail,
  paymentRecordedEmail,
  welcomeEmail,
} from '../emails/templates.js';
import { prisma } from '../lib/prisma.js';
import { writeAuditEvent } from '../services/audit.js';
import {
  createConfiguredMailTransport,
  notificationMessageId,
  type MailTransport,
} from '../services/mailer.js';

const configuredMailTransport = createConfiguredMailTransport();

export interface NotificationDeliveryOptions {
  enabled?: boolean;
  from?: string;
  mailTransport?: MailTransport;
}

interface EmailMessage {
  eventKey: string;
  html: string;
  orderId?: string;
  subject: string;
  text: string;
  type: string;
  userId: string;
}

async function deliver(
  message: EmailMessage,
  options: NotificationDeliveryOptions = {},
): Promise<void> {
  const enabled = options.enabled ?? env.EMAIL_ENABLED;
  const from = options.from ?? env.EMAIL_FROM;
  const mailTransport = options.mailTransport ?? configuredMailTransport;
  const user = await prisma.user.findUnique({ where: { id: message.userId } });
  if (!user) return;

  const existing = await prisma.notificationDelivery.findUnique({
    where: { eventKey: message.eventKey },
  });
  if (existing?.status === 'sent' || existing?.status === 'skipped') return;

  const delivery = existing
    ? await prisma.notificationDelivery.update({
        where: { id: existing.id },
        data: { errorMessage: null, status: 'pending' },
      })
    : await prisma.notificationDelivery.create({
        data: {
          eventKey: message.eventKey,
          recipient: user.email,
          type: message.type,
          userId: user.id,
          ...(message.orderId ? { orderId: message.orderId } : {}),
        },
      });

  if (!enabled || !mailTransport || !from) {
    await prisma.notificationDelivery.update({
      where: { id: delivery.id },
      data: { status: 'skipped' },
    });
    return;
  }

  try {
    const response = await mailTransport.sendMail({
      from,
      html: message.html,
      messageId: notificationMessageId(message.eventKey),
      subject: message.subject,
      text: message.text,
      to: user.email,
    });
    await prisma.$transaction(async (transaction) => {
      await transaction.notificationDelivery.update({
        where: { id: delivery.id },
        data: { providerMessageId: response.messageId, sentAt: new Date(), status: 'sent' },
      });
      await writeAuditEvent(transaction, {
        action: 'notification.sent',
        entityId: delivery.id,
        entityType: 'notification',
        metadata: { recipient: user.email, type: message.type },
        userId: user.id,
        ...(message.orderId ? { orderId: message.orderId } : {}),
      });
    });
  } catch (error) {
    await prisma.notificationDelivery.update({
      where: { id: delivery.id },
      data: {
        errorMessage: error instanceof Error ? error.message.slice(0, 1_000) : 'Email failed.',
        status: 'failed',
      },
    });
    throw error;
  }
}

export async function notifyPaymentRecorded(
  data: { orderId: string; paymentId: string; userId: string },
  options?: NotificationDeliveryOptions,
): Promise<void> {
  const [order, payment] = await Promise.all([
    prisma.order.findFirst({ where: { id: data.orderId, userId: data.userId } }),
    prisma.payment.findUnique({ where: { id: data.paymentId } }),
  ]);
  if (!order || !payment) return;
  const amount = Number(payment.amountMinor);
  const content = paymentRecordedEmail({
    amountMinor: amount,
    appOrigin: env.APP_ORIGIN,
    orderId: order.id,
    orderNumber: `ORD-${order.publicId}`,
  });
  await deliver(
    {
      ...content,
      eventKey: `payment-recorded-${payment.id}`,
      orderId: order.id,
      type: 'payment.recorded',
      userId: data.userId,
    },
    options,
  );
}

export async function notifyExportReady(
  data: { exportId: string; userId: string },
  options?: NotificationDeliveryOptions,
): Promise<void> {
  const job = await prisma.exportJob.findFirst({
    where: { id: data.exportId, userId: data.userId },
  });
  if (!job || job.status !== 'completed') return;
  const content = exportReadyEmail({
    appOrigin: env.APP_ORIGIN,
    fileName: job.fileName ?? 'SettleFlow order export',
  });
  await deliver(
    {
      ...content,
      eventKey: `export-ready-${job.id}`,
      type: 'export.ready',
      userId: data.userId,
    },
    options,
  );
}

export async function notifyOrderOverdue(
  data: { orderId: string; userId: string },
  options?: NotificationDeliveryOptions,
): Promise<void> {
  const order = await prisma.order.findFirst({ where: { id: data.orderId, userId: data.userId } });
  if (!order) return;
  const orderNumber = `ORD-${order.publicId}`;
  const content = orderOverdueEmail({
    appOrigin: env.APP_ORIGIN,
    customer: order.customer,
    dueDate: order.dueDate.toISOString().slice(0, 10),
    orderId: order.id,
    orderNumber,
  });
  await deliver(
    {
      ...content,
      eventKey: `order-overdue-${order.id}-${order.dueDate.toISOString().slice(0, 10)}`,
      orderId: order.id,
      type: 'order.overdue',
      userId: data.userId,
    },
    options,
  );
}

export async function notifyWelcome(
  data: { userId: string },
  options?: NotificationDeliveryOptions,
): Promise<void> {
  const user = await prisma.user.findUnique({ where: { id: data.userId } });
  if (!user) return;
  const content = welcomeEmail({
    appOrigin: env.APP_ORIGIN,
    displayName: user.displayName,
  });
  await deliver(
    {
      ...content,
      eventKey: `user-welcome-${user.id}`,
      type: 'user.welcome',
      userId: user.id,
    },
    options,
  );
}

export async function overdueOrders(): Promise<Array<{ orderId: string; userId: string }>> {
  const rows = await prisma.$queryRaw<Array<{ orderId: string; userId: string }>>(Prisma.sql`
    SELECT o."id" AS "orderId", o."user_id" AS "userId"
    FROM "orders" o
    WHERE
      o."deleted_at" IS NULL
      AND o."due_date" < CURRENT_DATE
      AND COALESCE((
        SELECT SUM(p."amount_minor") FROM "payments" p WHERE p."order_id" = o."id"
      ), 0) < COALESCE((
        SELECT SUM(oi."quantity" * oi."unit_price_minor") FROM "order_items" oi WHERE oi."order_id" = o."id"
      ), 0)
  `);
  return rows;
}
