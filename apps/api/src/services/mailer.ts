import { createHash } from 'node:crypto';

import nodemailer from 'nodemailer';

import { env } from '../config/env.js';

const gmailApiBaseUrl = 'https://gmail.googleapis.com/gmail/v1';
const googleTokenUrl = 'https://oauth2.googleapis.com/token';
const accessTokenExpirySkewMs = 60_000;

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

interface GmailApiMailTransportOptions {
  apiBaseUrl?: string;
  clientId: string;
  clientSecret: string;
  fetchImplementation?: typeof fetch;
  refreshToken: string;
  senderEmail: string;
  tokenUrl?: string;
}

interface GmailSendResponse {
  id?: unknown;
}

interface GoogleTokenResponse {
  access_token?: unknown;
  expires_in?: unknown;
}

export function notificationMessageId(eventKey: string): string {
  const digest = createHash('sha256').update(eventKey).digest('hex');
  return `<${digest}@kindratech.co>`;
}

function toBase64Url(value: Buffer): string {
  return value.toString('base64url');
}

function gmailApiError(status: number, responseBody: GmailSendResponse): Error {
  const error = responseBody as {
    error?: { message?: unknown };
  };
  const detail =
    typeof error.error?.message === 'string' ? error.error.message.slice(0, 500) : null;
  return new Error(
    detail
      ? `Gmail API send failed with HTTP ${status}: ${detail}`
      : `Gmail API send failed with HTTP ${status}.`,
  );
}

export class GmailApiMailTransport implements MailTransport {
  private accessToken: string | null = null;
  private accessTokenExpiresAt = 0;
  private readonly apiBaseUrl: string;
  private readonly clientId: string;
  private readonly clientSecret: string;
  private readonly fetchImplementation: typeof fetch;
  private readonly mimeTransport = nodemailer.createTransport({
    buffer: true,
    newline: 'unix',
    streamTransport: true,
  });
  private readonly refreshToken: string;
  private readonly senderEmail: string;
  private readonly tokenUrl: string;

  constructor(options: GmailApiMailTransportOptions) {
    this.apiBaseUrl = options.apiBaseUrl ?? gmailApiBaseUrl;
    this.clientId = options.clientId;
    this.clientSecret = options.clientSecret;
    this.fetchImplementation = options.fetchImplementation ?? fetch;
    this.refreshToken = options.refreshToken;
    this.senderEmail = options.senderEmail;
    this.tokenUrl = options.tokenUrl ?? googleTokenUrl;
  }

  private async getAccessToken(forceRefresh = false): Promise<string> {
    if (
      !forceRefresh &&
      this.accessToken &&
      Date.now() + accessTokenExpirySkewMs < this.accessTokenExpiresAt
    ) {
      return this.accessToken;
    }

    const response = await this.fetchImplementation(this.tokenUrl, {
      body: new URLSearchParams({
        client_id: this.clientId,
        client_secret: this.clientSecret,
        grant_type: 'refresh_token',
        refresh_token: this.refreshToken,
      }),
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      method: 'POST',
    });

    if (!response.ok) {
      throw new Error(`Gmail OAuth token refresh failed with HTTP ${response.status}.`);
    }

    const body = (await response.json()) as GoogleTokenResponse;
    if (typeof body.access_token !== 'string' || body.access_token.length === 0) {
      throw new Error('Gmail OAuth token refresh returned no access token.');
    }

    const expiresInSeconds =
      typeof body.expires_in === 'number' && Number.isFinite(body.expires_in)
        ? body.expires_in
        : 3_600;
    this.accessToken = body.access_token;
    this.accessTokenExpiresAt = Date.now() + expiresInSeconds * 1_000;
    return body.access_token;
  }

  private async sendRawMessage(raw: string, forceTokenRefresh = false): Promise<Response> {
    const accessToken = await this.getAccessToken(forceTokenRefresh);
    return this.fetchImplementation(
      `${this.apiBaseUrl}/users/${encodeURIComponent(this.senderEmail)}/messages/send`,
      {
        body: JSON.stringify({ raw }),
        headers: {
          authorization: `Bearer ${accessToken}`,
          'content-type': 'application/json',
        },
        method: 'POST',
      },
    );
  }

  async sendMail(message: MailMessage): Promise<{ messageId: string }> {
    const compiled = await this.mimeTransport.sendMail(message);
    if (!Buffer.isBuffer(compiled.message)) {
      throw new Error('Gmail MIME compilation returned an invalid message.');
    }

    const raw = toBase64Url(compiled.message);
    let response = await this.sendRawMessage(raw);
    if (response.status === 401) {
      response = await this.sendRawMessage(raw, true);
    }

    const responseBody = (await response.json().catch(() => ({}))) as GmailSendResponse;
    if (!response.ok) throw gmailApiError(response.status, responseBody);
    if (typeof responseBody.id !== 'string' || responseBody.id.length === 0) {
      throw new Error('Gmail API send returned no provider message ID.');
    }

    return { messageId: responseBody.id };
  }
}

export function createConfiguredMailTransport(): MailTransport | null {
  if (
    !env.EMAIL_ENABLED ||
    !env.GMAIL_API_CLIENT_ID ||
    !env.GMAIL_API_CLIENT_SECRET ||
    !env.GMAIL_API_REFRESH_TOKEN ||
    !env.GMAIL_API_SENDER
  ) {
    return null;
  }

  return new GmailApiMailTransport({
    clientId: env.GMAIL_API_CLIENT_ID,
    clientSecret: env.GMAIL_API_CLIENT_SECRET,
    refreshToken: env.GMAIL_API_REFRESH_TOKEN,
    senderEmail: env.GMAIL_API_SENDER,
  });
}
