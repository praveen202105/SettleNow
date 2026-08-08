import { useQuery } from '@tanstack/react-query';
import { Activity, Clock3 } from 'lucide-react';
import { useState } from 'react';

import { AUDIT_ACTIONS, type AuditAction } from '@settleflow/shared';

import { Alert } from '../../components/ui/Alert';
import { Card } from '../../components/ui/Card';
import { EmptyState } from '../../components/ui/EmptyState';
import { PageHeader } from '../../components/ui/PageHeader';
import { Pagination } from '../../components/ui/Pagination';
import { Select } from '../../components/ui/Select';
import { Skeleton } from '../../components/ui/Skeleton';
import { activityApi, activityKeys } from './api';
import { activityLabel, activityTime } from './ActivityTimeline';

const options = [
  { label: 'All activity', value: 'all' },
  ...AUDIT_ACTIONS.map((action) => ({
    label: action
      .split('.')
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' · '),
    value: action,
  })),
];

export function ActivityPage() {
  const [action, setAction] = useState<'all' | AuditAction>('all');
  const [page, setPage] = useState(1);
  const query = {
    page,
    pageSize: 10,
    ...(action === 'all' ? {} : { action }),
  };
  const activity = useQuery({
    queryKey: activityKeys.list(query),
    queryFn: () => activityApi.list(query),
  });

  return (
    <div className="min-h-screen">
      <PageHeader
        title="Activity"
        description="An append-only record of important workspace events."
      />
      <div className="mx-auto max-w-5xl space-y-5 p-4 sm:p-6">
        <Card className="overflow-hidden">
          <div className="flex flex-col gap-4 border-b border-slate-200 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
            <div>
              <h2 className="font-semibold text-slate-950">Workspace activity</h2>
              <p className="mt-0.5 text-xs text-slate-500">Events cannot be edited or deleted.</p>
            </div>
            <Select
              ariaLabel="Filter activity"
              options={options}
              value={action}
              onValueChange={(value) => {
                setAction(value as 'all' | AuditAction);
                setPage(1);
              }}
            />
          </div>
          {activity.isPending ? (
            <div className="space-y-3 p-5" aria-label="Loading activity">
              {[0, 1, 2, 3, 4].map((item) => (
                <Skeleton className="h-16 w-full" key={item} />
              ))}
            </div>
          ) : activity.error ? (
            <div className="p-5">
              <Alert variant="danger">Activity could not be loaded.</Alert>
            </div>
          ) : activity.data.data.length === 0 ? (
            <EmptyState
              icon={<Activity aria-hidden="true" />}
              title="No activity found"
              description="Events will appear here as you work with orders and exports."
            />
          ) : (
            <>
              <ol className="divide-y divide-slate-100">
                {activity.data.data.map((event) => (
                  <li key={event.id} className="flex items-start gap-4 p-4 sm:p-5">
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-violet-50 text-violet-600">
                      <Activity className="size-[18px]" aria-hidden="true" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-slate-900">{activityLabel(event)}</p>
                      <p className="mt-1 flex items-center gap-1.5 text-xs text-slate-400">
                        <Clock3 className="size-3.5" aria-hidden="true" />{' '}
                        {activityTime(event.createdAt)}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
              <Pagination
                page={activity.data.meta.page}
                pageSize={activity.data.meta.pageSize}
                setPage={setPage}
                total={activity.data.meta.total}
                totalPages={activity.data.meta.totalPages}
              />
            </>
          )}
        </Card>
      </div>
    </div>
  );
}
