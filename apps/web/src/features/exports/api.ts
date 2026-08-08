import type {
  ExportListQuery,
  ExportResponse,
  OrderExportInput,
  PaginationMeta,
} from '@settleflow/shared';

import { apiRequest, apiRequestWithMeta } from '../../lib/api';

export const exportKeys = {
  all: ['exports'] as const,
  list: (query: ExportListQuery) => ['exports', 'list', query] as const,
};

export const exportsApi = {
  create: (query: OrderExportInput) =>
    apiRequest<ExportResponse>('/exports/orders', {
      body: JSON.stringify(query),
      method: 'POST',
    }),
  list: (query: ExportListQuery) => {
    const params = new URLSearchParams({
      page: String(query.page),
      pageSize: String(query.pageSize),
    });
    return apiRequestWithMeta<ExportResponse[], PaginationMeta>(`/exports?${params.toString()}`);
  },
  retry: (id: string) => apiRequest<ExportResponse>(`/exports/${id}/retry`, { method: 'POST' }),
};
