export const ORDER_STATUSES = ['pending', 'partially_paid', 'paid', 'overdue'] as const;
export const ORDER_SORT_FIELDS = ['orderNumber', 'customer', 'dueDate', 'total', 'status'] as const;
export const SORT_DIRECTIONS = ['asc', 'desc'] as const;
export const EXPORT_STATUSES = ['queued', 'processing', 'completed', 'failed', 'expired'] as const;
export const AUDIT_ACTIONS = [
  'auth.signup',
  'auth.login',
  'auth.logout',
  'order.created',
  'order.updated',
  'order.deleted',
  'payment.recorded',
  'export.requested',
  'export.completed',
  'export.downloaded',
  'notification.sent',
] as const;

export const MAX_MONEY_CENTS = 9_000_000_000_000;
export const MAX_LINE_ITEMS = 100;
export const DEFAULT_PAGE_SIZE = 10;
export const MAX_PAGE_SIZE = 100;
