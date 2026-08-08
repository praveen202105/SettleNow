import type {
  CustomerInput,
  CustomerListQuery,
  CustomerResponse,
  PaginationMeta,
} from '@settleflow/shared';

import { apiRequest, apiRequestWithMeta } from '../../lib/api';

export const customerKeys = {
  all: ['customers'] as const,
  list: (query: CustomerListQuery) => ['customers', 'list', query] as const,
};

export const customersApi = {
  list: (query: CustomerListQuery) => {
    const params = new URLSearchParams({
      page: String(query.page),
      pageSize: String(query.pageSize),
    });
    if (query.search) params.set('search', query.search);
    return apiRequestWithMeta<CustomerResponse[], PaginationMeta>(
      `/customers?${params.toString()}`,
    );
  },
  create: (input: CustomerInput) =>
    apiRequest<CustomerResponse>('/customers', {
      body: JSON.stringify(input),
      method: 'POST',
    }),
};
