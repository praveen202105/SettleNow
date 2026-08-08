import { useMutation, useQuery } from '@tanstack/react-query';
import { Download, FileSpreadsheet, RefreshCw } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

import type { ExportResponse } from '@settleflow/shared';

import { Alert } from '../../components/ui/Alert';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { EmptyState } from '../../components/ui/EmptyState';
import { PageHeader } from '../../components/ui/PageHeader';
import { Pagination } from '../../components/ui/Pagination';
import { Skeleton } from '../../components/ui/Skeleton';
import { queryClient } from '../../lib/query';
import { exportKeys, exportsApi } from './api';

function statusBadge(status: ExportResponse['status']) {
  const styles = {
    completed: { label: 'Ready', variant: 'success' as const },
    expired: { label: 'Expired', variant: 'neutral' as const },
    failed: { label: 'Failed', variant: 'danger' as const },
    processing: { label: 'Processing', variant: 'info' as const },
    queued: { label: 'Queued', variant: 'warning' as const },
  };
  const item = styles[status];
  return <Badge variant={item.variant}>{item.label}</Badge>;
}

function dateTime(value: string): string {
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(
    new Date(value),
  );
}

export function ExportsPage() {
  const [page, setPage] = useState(1);
  const query = { page, pageSize: 10 };
  const exports = useQuery({
    queryKey: exportKeys.list(query),
    queryFn: () => exportsApi.list(query),
    refetchInterval: (result) =>
      result.state.data?.data.some((item) => ['queued', 'processing'].includes(item.status))
        ? 2_000
        : false,
  });
  const retry = useMutation({
    mutationFn: exportsApi.retry,
    onSuccess: async () => {
      toast.success('Export queued again.');
      await queryClient.invalidateQueries({ queryKey: exportKeys.all });
    },
    onError: () => toast.error('The export could not be retried.'),
  });

  return (
    <div className="min-h-screen">
      <PageHeader title="Exports" description="Download generated order reports for 24 hours." />
      <div className="mx-auto max-w-5xl p-4 sm:p-6">
        <Card className="overflow-hidden">
          <div className="border-b border-slate-200 p-4 sm:p-5">
            <h2 className="font-semibold text-slate-950">Order exports</h2>
            <p className="mt-0.5 text-xs text-slate-500">
              New exports can be requested from the Orders dashboard.
            </p>
          </div>
          {exports.isPending ? (
            <div className="space-y-3 p-5" aria-label="Loading exports">
              {[0, 1, 2].map((item) => (
                <Skeleton key={item} className="h-20 w-full" />
              ))}
            </div>
          ) : exports.error ? (
            <div className="p-5">
              <Alert variant="danger">Exports could not be loaded.</Alert>
            </div>
          ) : exports.data.data.length === 0 ? (
            <EmptyState
              icon={<FileSpreadsheet aria-hidden="true" />}
              title="No exports yet"
              description="Export the current dashboard results when you need a CSV report."
            />
          ) : (
            <>
              <div className="divide-y divide-slate-100">
                {exports.data.data.map((item) => (
                  <article
                    key={item.id}
                    className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5"
                  >
                    <div className="flex min-w-0 items-start gap-3">
                      <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
                        <FileSpreadsheet className="size-5" aria-hidden="true" />
                      </span>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="truncate text-sm font-semibold text-slate-900">
                            {item.fileName ?? 'Order summary CSV'}
                          </h3>
                          {statusBadge(item.status)}
                        </div>
                        <p className="mt-1 text-xs text-slate-400">
                          Requested {dateTime(item.requestedAt)}
                        </p>
                        {item.errorMessage ? (
                          <p className="mt-1 text-xs text-red-600">{item.errorMessage}</p>
                        ) : null}
                      </div>
                    </div>
                    <div className="flex shrink-0 gap-2">
                      {item.status === 'completed' ? (
                        <Button asChild size="sm">
                          <a href={`/api/v1/exports/${item.id}/download`}>
                            <Download aria-hidden="true" /> Download
                          </a>
                        </Button>
                      ) : null}
                      {item.status === 'failed' || item.status === 'expired' ? (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={retry.isPending}
                          onClick={() => retry.mutate(item.id)}
                        >
                          <RefreshCw aria-hidden="true" /> Retry
                        </Button>
                      ) : null}
                    </div>
                  </article>
                ))}
              </div>
              <Pagination
                page={exports.data.meta.page}
                pageSize={exports.data.meta.pageSize}
                setPage={setPage}
                total={exports.data.meta.total}
                totalPages={exports.data.meta.totalPages}
              />
            </>
          )}
        </Card>
      </div>
    </div>
  );
}
