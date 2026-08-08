import type {
  OrderInput,
  OrderListItem,
  OrderListQuery,
  OrderResponse,
  OrderSummaryResponse,
  PaginationMeta,
  PaymentInput,
} from '@settleflow/shared';

import { apiRequest, apiRequestWithMeta } from '../../lib/api';

export const orderKeys = {
  all: ['orders'] as const,
  detail: (id: string) => ['orders', 'detail', id] as const,
  list: (query: OrderListQuery) => ['orders', 'list', query] as const,
  summary: ['orders', 'summary'] as const,
};

export const ordersApi = {
  list: (query: OrderListQuery) => {
    const params = new URLSearchParams({
      direction: query.direction,
      page: String(query.page),
      pageSize: String(query.pageSize),
      sort: query.sort,
    });
    if (query.search) params.set('search', query.search);
    if (query.status) params.set('status', query.status);
    return apiRequestWithMeta<OrderListItem[], PaginationMeta>(`/orders?${params.toString()}`);
  },
  summary: () => apiRequest<OrderSummaryResponse>('/orders/summary'),
  detail: (id: string) => apiRequest<OrderResponse>(`/orders/${id}`),
  create: (input: OrderInput) =>
    apiRequest<OrderResponse>('/orders', { method: 'POST', body: JSON.stringify(input) }),
  update: (id: string, input: OrderInput) =>
    apiRequest<OrderResponse>(`/orders/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(input),
    }),
  delete: (id: string) => apiRequest<{ id: string }>(`/orders/${id}`, { method: 'DELETE' }),
  recordPayment: (id: string, input: PaymentInput) =>
    apiRequest<OrderResponse>(`/orders/${id}/payments`, {
      method: 'POST',
      body: JSON.stringify(input),
    }),
};
