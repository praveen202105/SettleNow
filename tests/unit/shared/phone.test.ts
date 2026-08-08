import { describe, expect, it } from 'vitest';

import { customerInputSchema, normalizeE164Phone } from '../../../packages/shared/src/index.js';

describe('E.164 customer mobile numbers', () => {
  it('normalizes common visual separators', () => {
    expect(normalizeE164Phone('+91 (98765) 43210')).toBe('+919876543210');
    expect(customerInputSchema.parse({ mobile: '+91 98765-43210', name: ' Acme ' })).toEqual({
      mobile: '+919876543210',
      name: 'Acme',
    });
  });

  it.each(['9876543210', '+0123456789', '+123', '+1234567890123456'])('rejects %s', (mobile) => {
    expect(customerInputSchema.safeParse({ mobile, name: 'Acme' }).success).toBe(false);
  });
});
