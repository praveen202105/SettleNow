import { describe, expect, it } from 'vitest';

import { ordersToCsv } from '../../../apps/api/src/services/csv.js';

describe('ordersToCsv', () => {
  it('formats USD decimals and safely escapes spreadsheet cells', () => {
    const csv = ordersToCsv([
      {
        amountDueCents: 6_000,
        amountPaidCents: 4_000,
        createdAt: '2026-08-08T00:00:00.000Z',
        customer: 'Acme, "Global"',
        dueDate: '2026-08-31',
        id: 'order-1',
        isLocked: true,
        orderNumber: 'ORD-1001',
        orderTotalCents: 10_000,
        paymentCount: 1,
        status: 'partially_paid',
        updatedAt: '2026-08-08T01:00:00.000Z',
      },
    ]);

    expect(csv).toContain('100.00,40.00,60.00');
    expect(csv).toContain('"Acme, ""Global"""');
    expect(csv.endsWith('\r\n')).toBe(true);
  });
});
