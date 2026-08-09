import { describe, expect, it } from 'vitest';

import { ordersToCsv } from '../../../apps/api/src/services/csv.js';

describe('ordersToCsv', () => {
  it('formats INR decimals and safely escapes spreadsheet cells', () => {
    const csv = ordersToCsv([
      {
        amountDueMinor: 6_000,
        amountPaidMinor: 4_000,
        createdAt: '2026-08-08T00:00:00.000Z',
        currency: 'INR',
        customer: 'Acme, "Global"',
        customerId: 'customer-1',
        customerMobile: '+919876543210',
        dueDate: '2026-08-31',
        id: 'order-1',
        isLocked: true,
        orderNumber: 'ORD-1001',
        orderTotalMinor: 10_000,
        paymentCount: 1,
        status: 'partially_paid',
        updatedAt: '2026-08-08T01:00:00.000Z',
      },
    ]);

    expect(csv).toContain('100.00,40.00,60.00');
    expect(csv).toContain('INR');
    expect(csv).toContain('"Acme, ""Global"""');
    expect(csv).toContain('Customer mobile');
    expect(csv).toContain('+919876543210');
    expect(csv.endsWith('\r\n')).toBe(true);
  });
});
