import type {
  AUDIT_ACTIONS,
  AUTH_METHODS,
  EXPORT_STATUSES,
  ORDER_SORT_FIELDS,
  ORDER_STATUSES,
  SORT_DIRECTIONS,
} from './constants.js';

export type OrderStatus = (typeof ORDER_STATUSES)[number];
export type OrderSortField = (typeof ORDER_SORT_FIELDS)[number];
export type SortDirection = (typeof SORT_DIRECTIONS)[number];
export type AuditAction = (typeof AUDIT_ACTIONS)[number];
export type AuthMethod = (typeof AUTH_METHODS)[number];
export type ExportStatus = (typeof EXPORT_STATUSES)[number];

export interface UserResponse {
  authMethods: AuthMethod[];
  createdAt: string;
  displayName: string;
  email: string;
  id: string;
}

export interface AuthConfigResponse {
  providers: {
    google: boolean;
    password: true;
  };
}

export interface GoogleAuthorizationResponse {
  authorizationUrl: string;
}

export interface CustomerResponse {
  createdAt: string;
  id: string;
  mobile: string;
  name: string;
  updatedAt: string;
}

export interface LineItemResponse {
  description: string;
  id: string;
  lineTotalMinor: number;
  quantity: number;
  unitPriceMinor: number;
}

export type Currency = 'INR';
export type PaymentSource = 'offline' | 'razorpay';
export type PaymentMode = 'manual' | 'test';
export type PaymentAttemptStatus =
  'creating' | 'pending' | 'captured' | 'failed' | 'expired' | 'cancelled' | 'needs_review';

export interface PaymentResponse {
  amountMinor: number;
  createdAt: string;
  currency: Currency;
  date: string;
  id: string;
  method: string | null;
  mode: PaymentMode;
  note: string | null;
  providerPaymentId: string | null;
  source: PaymentSource;
}

export interface OrderResponse {
  amountDueMinor: number;
  amountPaidMinor: number;
  createdAt: string;
  customer: string;
  customerId: string | null;
  customerMobile: string | null;
  currency: Currency;
  dueDate: string;
  id: string;
  isLocked: boolean;
  lineItems: LineItemResponse[];
  orderNumber: string;
  orderTotalMinor: number;
  payments: PaymentResponse[];
  status: OrderStatus;
  updatedAt: string;
}

export interface OrderListItem extends Omit<OrderResponse, 'lineItems' | 'payments'> {
  paymentCount: number;
}

export interface OrderSummaryResponse {
  currency: Currency;
  overdueOrders: number;
  outstandingMinor: number;
  paymentsReceivedMinor: number;
  totalOrders: number;
}

export interface PaymentConfigResponse {
  currency: Currency;
  enabled: boolean;
  keyId: string | null;
  mode: 'test';
  provider: 'razorpay';
}

export interface PaymentLinkResponse {
  createdAt: string;
  id: string;
  revokedAt: string | null;
  shareUrl?: string;
  status: 'active' | 'revoked' | 'paid';
}

export interface PublicPaymentLinkResponse {
  amountDueMinor: number;
  amountPaidMinor: number;
  currency: Currency;
  customerLabel: string;
  id: string;
  orderNumber: string;
  orderTotalMinor: number;
  status: 'active' | 'paid';
}

export interface PaymentAttemptResponse {
  amountMinor: number;
  checkout: {
    contact: string | null;
    customerName: string;
    description: string;
    keyId: string;
    orderId: string;
    timeoutSeconds: number;
  } | null;
  createdAt: string;
  currency: Currency;
  expiresAt: string;
  id: string;
  status: PaymentAttemptStatus;
}

export interface PaginationMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface AuditEventResponse {
  action: AuditAction;
  createdAt: string;
  entityId: string | null;
  entityType: string;
  id: string;
  metadata: Record<string, unknown>;
  orderId: string | null;
}

export interface ExportResponse {
  completedAt: string | null;
  errorMessage: string | null;
  expiresAt: string | null;
  fileName: string | null;
  id: string;
  query: {
    direction: SortDirection;
    search?: string;
    sort: OrderSortField;
    status?: OrderStatus;
  };
  requestedAt: string;
  startedAt: string | null;
  status: ExportStatus;
}

export interface ApiSuccess<T, M = never> {
  data: T;
  meta?: M;
}

export interface ApiErrorBody {
  error: {
    code: string;
    fieldErrors?: Record<string, string[]>;
    message: string;
    requestId?: string;
    [key: string]: unknown;
  };
}
