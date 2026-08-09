export const ORDER_STATUSES = ['pending', 'partially_paid', 'paid', 'overdue'] as const;
export const ORDER_SORT_FIELDS = ['orderNumber', 'customer', 'dueDate', 'total', 'status'] as const;
export const SORT_DIRECTIONS = ['asc', 'desc'] as const;
export const EXPORT_STATUSES = ['queued', 'processing', 'completed', 'failed', 'expired'] as const;
export const AUDIT_ACTIONS = [
  'auth.signup',
  'auth.login',
  'auth.logout',
  'auth.google.linked',
  'auth.google.unlinked',
  'customer.created',
  'order.created',
  'order.updated',
  'order.deleted',
  'payment.recorded',
  'payment.link.created',
  'payment.link.revoked',
  'payment.checkout.started',
  'payment.checkout.failed',
  'export.requested',
  'export.completed',
  'export.downloaded',
  'notification.sent',
] as const;

export const AUTH_METHODS = ['password', 'google'] as const;
export const GOOGLE_AUTH_INTENTS = ['signin', 'link'] as const;

export const MAX_MONEY_MINOR = 9_000_000_000_000;
export const MAX_LINE_ITEMS = 100;
export const DEFAULT_PAGE_SIZE = 10;
export const MAX_PAGE_SIZE = 100;
