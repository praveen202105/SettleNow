import type { OrderStatus } from './types.js';

export interface FinancialLineItem {
  quantity: number;
  unitPriceCents: number;
}

export interface FinancialPayment {
  amountCents: number;
}

export interface OrderFinancials {
  amountDueCents: number;
  amountPaidCents: number;
  orderTotalCents: number;
}

export function calculateOrderFinancials(
  lineItems: readonly FinancialLineItem[],
  payments: readonly FinancialPayment[],
): OrderFinancials {
  const orderTotalCents = lineItems.reduce(
    (sum, item) => sum + item.quantity * item.unitPriceCents,
    0,
  );
  const amountPaidCents = payments.reduce((sum, payment) => sum + payment.amountCents, 0);

  if (!Number.isSafeInteger(orderTotalCents) || !Number.isSafeInteger(amountPaidCents)) {
    throw new RangeError('Calculated amount exceeds the supported range.');
  }

  return {
    orderTotalCents,
    amountPaidCents,
    amountDueCents: Math.max(0, orderTotalCents - amountPaidCents),
  };
}

export function deriveOrderStatus(input: {
  amountPaidCents: number;
  dueDate: string;
  orderTotalCents: number;
  paymentCount: number;
  today: string;
}): OrderStatus {
  if (input.amountPaidCents >= input.orderTotalCents) return 'paid';
  if (input.dueDate < input.today) return 'overdue';
  if (input.paymentCount > 0) return 'partially_paid';
  return 'pending';
}
