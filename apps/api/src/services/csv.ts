import type { OrderListItem } from '@settleflow/shared';

function csvCell(value: string | number): string {
  const text = String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function inrDecimal(minor: number): string {
  return (minor / 100).toFixed(2);
}

export function ordersToCsv(orders: OrderListItem[]): string {
  const rows: Array<Array<string | number>> = [
    [
      'Order number',
      'Customer',
      'Customer mobile',
      'Due date',
      'Status',
      'Currency',
      'Order total',
      'Amount paid',
      'Amount due',
      'Payment count',
      'Created at',
      'Updated at',
    ],
    ...orders.map((order) => [
      order.orderNumber,
      order.customer,
      order.customerMobile ?? '',
      order.dueDate,
      order.status,
      order.currency,
      inrDecimal(order.orderTotalMinor),
      inrDecimal(order.amountPaidMinor),
      inrDecimal(order.amountDueMinor),
      order.paymentCount,
      order.createdAt,
      order.updatedAt,
    ]),
  ];
  return `${rows.map((row) => row.map(csvCell).join(',')).join('\r\n')}\r\n`;
}
