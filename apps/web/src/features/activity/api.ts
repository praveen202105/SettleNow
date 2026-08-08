import type { ActivityQuery, AuditEventResponse, PaginationMeta } from '@settleflow/shared';

import { apiRequestWithMeta } from '../../lib/api';

export const activityKeys = {
  all: ['activity'] as const,
  list: (query: ActivityQuery) => ['activity', 'list', query] as const,
};

export const activityApi = {
  list: (query: ActivityQuery) => {
    const params = new URLSearchParams({
      page: String(query.page),
      pageSize: String(query.pageSize),
    });
    if (query.action) params.set('action', query.action);
    if (query.orderId) params.set('orderId', query.orderId);
    return apiRequestWithMeta<AuditEventResponse[], PaginationMeta>(
      `/activity?${params.toString()}`,
    );
  },
};
