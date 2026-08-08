import { createHash } from 'node:crypto';

import nodemailer from 'nodemailer';

import { env } from '../config/env.js';

export interface MailMessage {
  from: string;
  html: string;
  messageId: string;
  subject: string;
  text: string;
  to: string;
}

export interface MailTransport {
  sendMail(message: MailMessage): Promise<{ messageId: string }>;
}

export function notificationMessageId(eventKey: string): string {
  const digest = createHash('sha256').update(eventKey).digest('hex');
  return `<${digest}@kindratech.co>`;
}

export function createConfiguredMailTransport(): MailTransport | null {
  if (!env.EMAIL_ENABLED || !env.SMTP_USER || !env.SMTP_PASSWORD) return null;

  const transporter = nodemailer.createTransport({
    auth: { pass: env.SMTP_PASSWORD, user: env.SMTP_USER },
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_SECURE,
  });

  return {
    async sendMail(message) {
      const info = await transporter.sendMail(message);
      return { messageId: info.messageId };
    },
  };
}
