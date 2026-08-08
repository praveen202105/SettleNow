import type { OrderStatus } from '@settleflow/shared';

import { Badge } from './ui/Badge';

const config = {
  overdue: { dot: 'bg-red-500', label: 'Overdue', variant: 'danger' },
  paid: { dot: 'bg-emerald-500', label: 'Paid', variant: 'success' },
  partially_paid: { dot: 'bg-blue-500', label: 'Partially Paid', variant: 'info' },
  pending: { dot: 'bg-amber-500', label: 'Pending', variant: 'warning' },
} as const;

export function StatusBadge({ status }: { status: OrderStatus }) {
  const item = config[status];
  return (
    <Badge variant={item.variant}>
      <span className={`size-1.5 rounded-full ${item.dot}`} aria-hidden="true" />
      {item.label}
    </Badge>
  );
}
