import { describe, expect, it } from 'vitest';

import { notificationMessageId } from '../../../apps/api/src/services/mailer.js';

describe('Nodemailer notification identity', () => {
  it('creates stable, opaque RFC message IDs from event keys', () => {
    const first = notificationMessageId('payment-recorded-payment-1');
    expect(first).toBe(notificationMessageId('payment-recorded-payment-1'));
    expect(first).not.toContain('payment-1');
    expect(first).toMatch(/^<[a-f0-9]{64}@kindratech\.co>$/);
    expect(notificationMessageId('payment-recorded-payment-2')).not.toBe(first);
  });
});
