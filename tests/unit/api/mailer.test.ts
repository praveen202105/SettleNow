import { describe, expect, it, vi } from 'vitest';

import {
  GmailApiMailTransport,
  notificationMessageId,
} from '../../../apps/api/src/services/mailer.js';

const message = {
  from: 'SettleFlow <coderpraveengupta@gmail.com>',
  html: '<p>Payment received.</p>',
  messageId: '<stable-message-id@kindratech.co>',
  subject: 'Payment received',
  text: 'Payment received.',
  to: 'owner@example.com',
};

describe('Gmail API mail transport', () => {
  it('creates stable, opaque RFC message IDs from event keys', () => {
    const first = notificationMessageId('payment-recorded-payment-1');
    expect(first).toBe(notificationMessageId('payment-recorded-payment-1'));
    expect(first).not.toContain('payment-1');
    expect(first).toMatch(/^<[a-f0-9]{64}@kindratech\.co>$/);
    expect(notificationMessageId('payment-recorded-payment-2')).not.toBe(first);
  });

  it('refreshes an OAuth token and sends an RFC message through Gmail over HTTPS', async () => {
    const fetchImplementation = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ access_token: 'access-token', expires_in: 3_600 }), {
          status: 200,
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ id: 'gmail-message-1' }), { status: 200 }),
      );
    const transport = new GmailApiMailTransport({
      apiBaseUrl: 'https://gmail.test/gmail/v1',
      clientId: 'client-id',
      clientSecret: 'client-secret',
      fetchImplementation,
      refreshToken: 'refresh-token',
      senderEmail: 'coderpraveengupta@gmail.com',
      tokenUrl: 'https://oauth.test/token',
    });

    await expect(transport.sendMail(message)).resolves.toEqual({ messageId: 'gmail-message-1' });

    expect(fetchImplementation).toHaveBeenCalledTimes(2);
    const [tokenUrl, tokenRequest] = fetchImplementation.mock.calls[0]!;
    expect(tokenUrl).toBe('https://oauth.test/token');
    expect(tokenRequest).toMatchObject({ method: 'POST' });
    expect(tokenRequest?.body).toBeInstanceOf(URLSearchParams);
    expect((tokenRequest?.body as URLSearchParams).get('grant_type')).toBe('refresh_token');

    const [sendUrl, sendRequest] = fetchImplementation.mock.calls[1]!;
    expect(sendUrl).toBe(
      'https://gmail.test/gmail/v1/users/coderpraveengupta%40gmail.com/messages/send',
    );
    expect(sendRequest?.headers).toMatchObject({ authorization: 'Bearer access-token' });
    expect(typeof sendRequest?.body).toBe('string');
    const raw = JSON.parse(sendRequest?.body as string).raw as string;
    const decoded = Buffer.from(raw, 'base64url').toString('utf8');
    expect(decoded).toContain('Message-ID: <stable-message-id@kindratech.co>');
    expect(decoded).toContain('Payment received');
    expect(decoded).toContain('owner@example.com');
  });

  it('caches access tokens and retries once with a fresh token after a 401', async () => {
    const fetchImplementation = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ access_token: 'first-token', expires_in: 3_600 })),
      )
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: {} }), { status: 401 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ access_token: 'second-token', expires_in: 3_600 })),
      )
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: 'gmail-message-2' })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: 'gmail-message-3' })));
    const transport = new GmailApiMailTransport({
      apiBaseUrl: 'https://gmail.test/gmail/v1',
      clientId: 'client-id',
      clientSecret: 'client-secret',
      fetchImplementation,
      refreshToken: 'refresh-token',
      senderEmail: 'coderpraveengupta@gmail.com',
      tokenUrl: 'https://oauth.test/token',
    });

    await expect(transport.sendMail(message)).resolves.toEqual({ messageId: 'gmail-message-2' });
    await expect(transport.sendMail(message)).resolves.toEqual({ messageId: 'gmail-message-3' });
    expect(fetchImplementation).toHaveBeenCalledTimes(5);
    expect(fetchImplementation.mock.calls[3]?.[1]?.headers).toMatchObject({
      authorization: 'Bearer second-token',
    });
    expect(fetchImplementation.mock.calls[4]?.[1]?.headers).toMatchObject({
      authorization: 'Bearer second-token',
    });
  });

  it('does not expose OAuth response bodies when token refresh fails', async () => {
    const fetchImplementation = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ error: 'invalid_grant', refresh_token: 'must-not-leak' }), {
        status: 400,
      }),
    );
    const transport = new GmailApiMailTransport({
      clientId: 'client-id',
      clientSecret: 'client-secret',
      fetchImplementation,
      refreshToken: 'refresh-token',
      senderEmail: 'coderpraveengupta@gmail.com',
    });

    await expect(transport.sendMail(message)).rejects.toThrow(
      'Gmail OAuth token refresh failed with HTTP 400.',
    );
    await expect(transport.sendMail(message)).rejects.not.toThrow('must-not-leak');
  });
});
