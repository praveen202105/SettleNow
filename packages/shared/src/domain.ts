import type { OrderStatus } from './types.js';

export interface FinancialLineItem {
  quantity: number;
  unitPriceMinor: number;
}

export interface FinancialPayment {
  amountMinor: number;
}

export interface OrderFinancials {
  amountDueMinor: number;
  amountPaidMinor: number;
  orderTotalMinor: number;
}

export function calculateOrderFinancials(
  lineItems: readonly FinancialLineItem[],
  payments: readonly FinancialPayment[],
): OrderFinancials {
  const orderTotalMinor = lineItems.reduce(
    (sum, item) => sum + item.quantity * item.unitPriceMinor,
    0,
  );
  const amountPaidMinor = payments.reduce((sum, payment) => sum + payment.amountMinor, 0);

  if (!Number.isSafeInteger(orderTotalMinor) || !Number.isSafeInteger(amountPaidMinor)) {
    throw new RangeError('Calculated amount exceeds the supported range.');
  }

  return {
    orderTotalMinor,
    amountPaidMinor,
    amountDueMinor: Math.max(0, orderTotalMinor - amountPaidMinor),
  };
}

export function deriveOrderStatus(input: {
  amountPaidMinor: number;
  dueDate: string;
  orderTotalMinor: number;
  paymentCount: number;
  today: string;
}): OrderStatus {
  if (input.amountPaidMinor >= input.orderTotalMinor) return 'paid';
  if (input.dueDate < input.today) return 'overdue';
  if (input.paymentCount > 0) return 'partially_paid';
  return 'pending';
}
