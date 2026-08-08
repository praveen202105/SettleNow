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
  lineTotalCents: number;
  quantity: number;
  unitPriceCents: number;
}

export interface PaymentResponse {
  amountCents: number;
  createdAt: string;
  date: string;
  id: string;
  note: string | null;
}

export interface OrderResponse {
  amountDueCents: number;
  amountPaidCents: number;
  createdAt: string;
  customer: string;
  customerId: string | null;
  customerMobile: string | null;
  dueDate: string;
  id: string;
  isLocked: boolean;
  lineItems: LineItemResponse[];
  orderNumber: string;
  orderTotalCents: number;
  payments: PaymentResponse[];
  status: OrderStatus;
  updatedAt: string;
}

export interface OrderListItem extends Omit<OrderResponse, 'lineItems' | 'payments'> {
  paymentCount: number;
}

export interface OrderSummaryResponse {
  overdueOrders: number;
  outstandingCents: number;
  paymentsReceivedCents: number;
  totalOrders: number;
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
