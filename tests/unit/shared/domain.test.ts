import { describe, expect, it } from 'vitest';

import {
  calculateOrderFinancials,
  deriveOrderStatus,
} from '../../../packages/shared/src/domain.js';
import { orderInputSchema } from '../../../packages/shared/src/schemas.js';

describe('calculateOrderFinancials', () => {
  it('calculates totals using integer cents', () => {
    expect(
      calculateOrderFinancials(
        [
          { quantity: 2, unitPriceCents: 50_000 },
          { quantity: 1, unitPriceCents: 12_345 },
        ],
        [{ amountCents: 40_000 }],
      ),
    ).toEqual({
      orderTotalCents: 112_345,
      amountPaidCents: 40_000,
      amountDueCents: 72_345,
    });
  });
});

describe('order validation', () => {
  it('rejects totals above the supported cents range', () => {
    const result = orderInputSchema.safeParse({
      customerId: '00000000-0000-4000-8000-000000000001',
      dueDate: '2030-01-01',
      lineItems: [
        { description: 'Large contract', quantity: 2, unitPriceCents: 9_000_000_000_000 },
      ],
    });

    expect(result.success).toBe(false);
  });
});

describe('deriveOrderStatus', () => {
  const base = {
    orderTotalCents: 100_000,
    dueDate: '2026-08-15',
    today: '2026-08-08',
  };

  it.each([
    [{ ...base, amountPaidCents: 100_000, paymentCount: 1 }, 'paid'],
    [{ ...base, dueDate: '2026-08-01', amountPaidCents: 40_000, paymentCount: 1 }, 'overdue'],
    [{ ...base, amountPaidCents: 40_000, paymentCount: 1 }, 'partially_paid'],
    [{ ...base, amountPaidCents: 0, paymentCount: 0 }, 'pending'],
  ] as const)('returns the expected status', (input, expected) => {
    expect(deriveOrderStatus(input)).toBe(expected);
  });
});
