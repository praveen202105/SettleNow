import { useQuery } from '@tanstack/react-query';
import { Activity, CircleCheck, Clock3 } from 'lucide-react';

import type { AuditAction, AuditEventResponse } from '@settleflow/shared';

import { Alert } from '../../components/ui/Alert';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '../../components/ui/Card';
import { Skeleton } from '../../components/ui/Skeleton';
import { activityApi, activityKeys } from './api';

const actionLabels: Record<AuditAction, string> = {
  'auth.login': 'Signed in',
  'auth.logout': 'Signed out',
  'auth.signup': 'Account created',
  'export.completed': 'Export completed',
  'export.downloaded': 'Export downloaded',
  'export.requested': 'Export requested',
  'notification.sent': 'Notification sent',
  'order.created': 'Order created',
  'order.deleted': 'Order deleted',
  'order.updated': 'Order updated',
  'payment.recorded': 'Payment recorded',
};

export function activityLabel(event: AuditEventResponse): string {
  const orderNumber =
    typeof event.metadata.orderNumber === 'string' ? ` · ${event.metadata.orderNumber}` : '';
  return `${actionLabels[event.action]}${orderNumber}`;
}

export function activityTime(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

export function ActivityTimeline({ orderId }: { orderId: string }) {
  const query = { orderId, page: 1, pageSize: 10 } as const;
  const activity = useQuery({
    queryKey: activityKeys.list(query),
    queryFn: () => activityApi.list(query),
  });

  return (
    <Card>
      <CardHeader className="border-b border-slate-100">
        <div className="flex items-start gap-3">
          <span className="flex size-10 items-center justify-center rounded-xl bg-violet-50 text-violet-600">
            <Activity className="size-5" aria-hidden="true" />
          </span>
          <div>
            <CardTitle>Activity</CardTitle>
            <CardDescription>Recent changes recorded for this order.</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-5 sm:pt-6">
        {activity.isPending ? (
          <div className="space-y-4" aria-label="Loading activity">
            {[0, 1, 2].map((item) => (
              <Skeleton key={item} className="h-12 w-full" />
            ))}
          </div>
        ) : activity.error ? (
          <Alert variant="danger">Activity could not be loaded.</Alert>
        ) : activity.data.data.length === 0 ? (
          <p className="text-sm text-slate-500">No activity has been recorded yet.</p>
        ) : (
          <ol className="space-y-4">
            {activity.data.data.map((event) => (
              <li key={event.id} className="flex gap-3">
                <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
                  <CircleCheck className="size-4" aria-hidden="true" />
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-800">{activityLabel(event)}</p>
                  <p className="mt-1 flex items-center gap-1.5 text-xs text-slate-400">
                    <Clock3 className="size-3.5" aria-hidden="true" />{' '}
                    {activityTime(event.createdAt)}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}
