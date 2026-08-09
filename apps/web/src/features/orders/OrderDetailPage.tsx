import { useMutation, useQuery } from '@tanstack/react-query';
import {
  ChevronLeft,
  CreditCard,
  Edit3,
  FileText,
  Link2,
  Lock,
  ReceiptText,
  Trash2,
  UserRound,
} from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';

import { formatDate, formatInr } from '@settleflow/shared';

import { StatusBadge } from '../../components/StatusBadge';
import { ActivityTimeline } from '../activity/ActivityTimeline';
import { Alert } from '../../components/ui/Alert';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '../../components/ui/Card';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { EmptyState } from '../../components/ui/EmptyState';
import { PageHeader } from '../../components/ui/PageHeader';
import { Skeleton } from '../../components/ui/Skeleton';
import { ApiClientError } from '../../lib/api';
import { queryClient } from '../../lib/query';
import { orderKeys, ordersApi } from './api';
import { PaymentDialog } from './PaymentDialog';
import { OnlinePaymentDialog } from '../payments/OnlinePaymentDialog';
import { PaymentLinkDialog } from '../payments/PaymentLinkDialog';
import { paymentKeys, paymentsApi } from '../payments/api';

export function OrderDetailPage() {
  const { orderId = '' } = useParams();
  const navigate = useNavigate();
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [onlinePaymentOpen, setOnlinePaymentOpen] = useState(false);
  const [paymentLinkOpen, setPaymentLinkOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const order = useQuery({
    queryKey: orderKeys.detail(orderId),
    queryFn: () => ordersApi.detail(orderId),
    enabled: Boolean(orderId),
  });
  const paymentConfig = useQuery({
    queryKey: paymentKeys.config,
    queryFn: paymentsApi.config,
  });
  const remove = useMutation({
    mutationFn: () => ordersApi.delete(orderId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: orderKeys.all });
      toast.success('Order deleted.');
      void navigate('/orders', { replace: true });
    },
    onError: (error) =>
      toast.error(error instanceof ApiClientError ? error.message : 'Delete failed.'),
  });

  if (order.isPending) return <DetailSkeleton />;
  if (order.error || !order.data) {
    const message =
      order.error instanceof ApiClientError ? order.error.message : 'Order could not be loaded.';
    return (
      <Centered>
        <Alert variant="danger">{message}</Alert>
        <Button asChild variant="outline">
          <Link to="/orders">Return to orders</Link>
        </Button>
      </Centered>
    );
  }

  const data = order.data;
  const onlinePaymentsEnabled = paymentConfig.data?.enabled === true;
  const onlinePaymentUnavailableMessage = paymentConfig.isError
    ? 'Online checkout is temporarily unavailable. You can still record an offline payment.'
    : paymentConfig.isPending
      ? 'Checking online payment availability…'
      : 'Razorpay Test Mode setup is pending. You can still record an offline payment.';
  return (
    <div className="min-h-screen">
      <PageHeader
        className="max-w-6xl"
        title={data.orderNumber}
        description={data.customer}
        eyebrow={<StatusBadge status={data.status} />}
        back={
          <Button asChild variant="ghost" size="icon" aria-label="Back to dashboard">
            <Link to="/orders">
              <ChevronLeft aria-hidden="true" />
            </Link>
          </Button>
        }
        actions={
          <>
            {data.isLocked ? (
              <Badge variant="warning">
                <Lock className="size-3.5" aria-hidden="true" /> Locked after payment
              </Badge>
            ) : null}
            {!data.isLocked ? (
              <Button asChild variant="outline">
                <Link to={`/orders/${data.id}/edit`}>
                  <Edit3 aria-hidden="true" /> Edit
                </Link>
              </Button>
            ) : null}
            <Button
              disabled={data.amountDueMinor === 0 || !onlinePaymentsEnabled}
              onClick={() => onlinePaymentsEnabled && setOnlinePaymentOpen(true)}
              title={!onlinePaymentsEnabled ? onlinePaymentUnavailableMessage : undefined}
            >
              <CreditCard aria-hidden="true" /> Collect online
            </Button>
            <Button
              variant="outline"
              disabled={data.amountDueMinor === 0 || !onlinePaymentsEnabled}
              onClick={() => onlinePaymentsEnabled && setPaymentLinkOpen(true)}
              title={!onlinePaymentsEnabled ? onlinePaymentUnavailableMessage : undefined}
            >
              <Link2 aria-hidden="true" /> <span className="hidden sm:inline">Payment link</span>
            </Button>
            <Button
              variant="outline"
              className="text-red-600 hover:bg-red-50"
              disabled={data.isLocked}
              onClick={() => setDeleteOpen(true)}
              title={data.isLocked ? 'Locked after payment' : 'Delete order'}
            >
              <Trash2 aria-hidden="true" /> <span className="hidden sm:inline">Delete</span>
            </Button>
          </>
        }
      />

      <div className="mx-auto grid max-w-6xl gap-5 p-4 sm:p-6 lg:grid-cols-[minmax(0,2fr)_minmax(290px,1fr)]">
        <div className="min-w-0 space-y-5">
          <Card>
            <CardHeader className="border-b border-slate-100">
              <div className="flex items-start gap-3">
                <span className="flex size-10 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
                  <UserRound className="size-5" aria-hidden="true" />
                </span>
                <div>
                  <CardTitle>Order information</CardTitle>
                  <CardDescription>Customer and schedule details.</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="grid gap-5 pt-5 sm:grid-cols-2 lg:grid-cols-4 sm:pt-6">
              <InfoItem label="Customer" value={data.customer} />
              <InfoItem label="Mobile" value={data.customerMobile ?? 'Not available'} mono />
              <InfoItem label="Order number" value={data.orderNumber} mono />
              <InfoItem label="Due date" value={formatDate(data.dueDate)} />
            </CardContent>
          </Card>

          <Card className="overflow-hidden">
            <CardHeader className="border-b border-slate-100">
              <div className="flex items-start gap-3">
                <span className="flex size-10 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
                  <FileText className="size-5" aria-hidden="true" />
                </span>
                <div>
                  <CardTitle>Line items</CardTitle>
                  <CardDescription>
                    {data.lineItems.length} item{data.lineItems.length === 1 ? '' : 's'} in this
                    order.
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <div className="divide-y divide-slate-100 sm:hidden">
              {data.lineItems.map((item) => (
                <article key={item.id} className="space-y-3 p-5">
                  <h3 className="font-semibold text-slate-900">{item.description}</h3>
                  <dl className="grid grid-cols-2 gap-3 text-sm">
                    <InfoItem label="Quantity" value={String(item.quantity)} />
                    <InfoItem
                      label="Unit price"
                      value={formatInr(item.unitPriceMinor)}
                      align="right"
                    />
                    <div className="col-span-2 flex items-center justify-between border-t border-slate-100 pt-3">
                      <dt className="text-xs font-medium text-slate-400">Line total</dt>
                      <dd className="font-semibold text-slate-950 tabular-nums">
                        {formatInr(item.lineTotalMinor)}
                      </dd>
                    </div>
                  </dl>
                </article>
              ))}
            </div>
            <div className="hidden overflow-x-auto sm:block">
              <table className="w-full min-w-[560px] text-sm">
                <thead className="border-b border-slate-200 bg-slate-50/70">
                  <tr>
                    <Th>Description</Th>
                    <Th align="right">Qty</Th>
                    <Th align="right">Unit price</Th>
                    <Th align="right">Total</Th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {data.lineItems.map((item) => (
                    <tr key={item.id}>
                      <Td strong>{item.description}</Td>
                      <Td align="right">{item.quantity}</Td>
                      <Td align="right" mono>
                        {formatInr(item.unitPriceMinor)}
                      </Td>
                      <Td align="right" mono strong>
                        {formatInr(item.lineTotalMinor)}
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          <Card className="overflow-hidden">
            <CardHeader className="flex-row items-start justify-between border-b border-slate-100">
              <div className="flex items-start gap-3">
                <span className="flex size-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
                  <ReceiptText className="size-5" aria-hidden="true" />
                </span>
                <div>
                  <CardTitle>Payment history</CardTitle>
                  <CardDescription>Every payment recorded against this order.</CardDescription>
                </div>
              </div>
              <Badge>
                {data.payments.length} payment{data.payments.length === 1 ? '' : 's'}
              </Badge>
            </CardHeader>
            {data.payments.length === 0 ? (
              <EmptyState
                icon={<ReceiptText aria-hidden="true" />}
                title="No payments yet"
                description="Record the first payment when funds are received."
              />
            ) : (
              <>
                <div className="divide-y divide-slate-100 sm:hidden">
                  {data.payments.map((payment) => (
                    <article
                      key={payment.id}
                      className="flex items-start justify-between gap-4 p-5"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-slate-700">
                          {formatDate(payment.date)}
                        </p>
                        <p className="mt-1 break-words text-sm text-slate-500">
                          {payment.note || 'No note'}
                        </p>
                        <Badge
                          variant={payment.source === 'razorpay' ? 'warning' : 'neutral'}
                          className="mt-2"
                        >
                          {payment.source === 'razorpay' ? 'Razorpay test' : 'Offline'}
                        </Badge>
                      </div>
                      <p className="shrink-0 text-sm font-bold text-emerald-700 tabular-nums">
                        {formatInr(payment.amountMinor)}
                      </p>
                    </article>
                  ))}
                </div>
                <div className="hidden overflow-x-auto sm:block">
                  <table className="w-full min-w-[520px] text-sm">
                    <thead className="border-b border-slate-200 bg-slate-50/70">
                      <tr>
                        <Th>Date</Th>
                        <Th align="right">Amount</Th>
                        <Th>Note</Th>
                        <Th>Source</Th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {data.payments.map((payment) => (
                        <tr key={payment.id}>
                          <Td>{formatDate(payment.date)}</Td>
                          <Td align="right" mono strong className="text-emerald-700">
                            {formatInr(payment.amountMinor)}
                          </Td>
                          <Td>{payment.note || '—'}</Td>
                          <Td>
                            <Badge variant={payment.source === 'razorpay' ? 'warning' : 'neutral'}>
                              {payment.source === 'razorpay' ? 'Razorpay test' : 'Offline'}
                            </Badge>
                          </Td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </Card>

          <ActivityTimeline orderId={data.id} />
        </div>

        <Card className="h-fit lg:sticky lg:top-24" aria-label="Order totals">
          <CardHeader className="border-b border-slate-100">
            <CardTitle>Settlement summary</CardTitle>
            <CardDescription>Live balance for this order.</CardDescription>
          </CardHeader>
          <CardContent className="pt-5 sm:pt-6">
            <dl className="space-y-4">
              <SummaryRow label="Order total" value={formatInr(data.orderTotalMinor)} />
              <SummaryRow label="Amount paid" value={formatInr(data.amountPaidMinor)} success />
              <div className="border-t border-slate-200 pt-4">
                <SummaryRow label="Amount due" value={formatInr(data.amountDueMinor)} emphasized />
              </div>
            </dl>
            {data.amountDueMinor > 0 ? (
              <div className="mt-6 grid gap-2">
                {!onlinePaymentsEnabled ? (
                  <Alert variant="warning" title="Online checkout unavailable" className="mb-1">
                    {onlinePaymentUnavailableMessage}
                  </Alert>
                ) : null}
                <Button
                  className="w-full"
                  disabled={!onlinePaymentsEnabled}
                  onClick={() => onlinePaymentsEnabled && setOnlinePaymentOpen(true)}
                  title={!onlinePaymentsEnabled ? onlinePaymentUnavailableMessage : undefined}
                >
                  <CreditCard aria-hidden="true" /> Collect online
                </Button>
                <Button
                  variant="outline"
                  className="w-full"
                  disabled={!onlinePaymentsEnabled}
                  onClick={() => onlinePaymentsEnabled && setPaymentLinkOpen(true)}
                  title={!onlinePaymentsEnabled ? onlinePaymentUnavailableMessage : undefined}
                >
                  <Link2 aria-hidden="true" /> Create payment link
                </Button>
                <Button variant="ghost" className="w-full" onClick={() => setPaymentOpen(true)}>
                  Record offline payment
                </Button>
              </div>
            ) : (
              <Alert variant="success" className="mt-6">
                This order is fully paid.
              </Alert>
            )}
          </CardContent>
        </Card>
      </div>

      <PaymentDialog open={paymentOpen} setOpen={setPaymentOpen} order={data} />
      {onlinePaymentsEnabled ? (
        <>
          <OnlinePaymentDialog
            open={onlinePaymentOpen}
            setOpen={setOnlinePaymentOpen}
            order={data}
          />
          <PaymentLinkDialog open={paymentLinkOpen} setOpen={setPaymentLinkOpen} order={data} />
        </>
      ) : null}
      <ConfirmDialog
        open={deleteOpen}
        setOpen={setDeleteOpen}
        title="Delete order?"
        description={`Delete ${data.orderNumber} permanently? This action cannot be undone.`}
        confirmLabel={remove.isPending ? 'Deleting…' : 'Delete order'}
        onConfirm={() => remove.mutate()}
      />
    </div>
  );
}

function InfoItem({
  align,
  label,
  mono = false,
  value,
}: {
  align?: 'right';
  label: string;
  mono?: boolean;
  value: string;
}) {
  return (
    <div className={align === 'right' ? 'text-right' : undefined}>
      <dt className="text-xs font-medium text-slate-400">{label}</dt>
      <dd
        className={`mt-1 text-sm font-semibold text-slate-800 ${mono ? 'font-mono' : 'tabular-nums'}`}
      >
        {value}
      </dd>
    </div>
  );
}

function SummaryRow({
  emphasized = false,
  label,
  success = false,
  value,
}: {
  emphasized?: boolean;
  label: string;
  success?: boolean;
  value: string;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <dt
        className={`text-sm ${emphasized ? 'font-semibold text-slate-900' : success ? 'text-emerald-700' : 'text-slate-500'}`}
      >
        {label}
      </dt>
      <dd
        className={`font-bold tabular-nums ${emphasized ? 'text-xl text-slate-950' : success ? 'text-emerald-700' : 'text-slate-800'}`}
      >
        {value}
      </dd>
    </div>
  );
}

function Th({ align, children }: { align?: 'right'; children: ReactNode }) {
  return (
    <th
      scope="col"
      className={`px-5 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500 ${align === 'right' ? 'text-right' : 'text-left'}`}
    >
      {children}
    </th>
  );
}
function Td({
  align,
  children,
  className = '',
  mono = false,
  strong = false,
}: {
  align?: 'right';
  children: ReactNode;
  className?: string;
  mono?: boolean;
  strong?: boolean;
}) {
  return (
    <td
      className={`px-5 py-4 text-slate-600 ${align === 'right' ? 'text-right' : ''} ${mono ? 'tabular-nums' : ''} ${strong ? 'font-semibold text-slate-800' : ''} ${className}`}
    >
      {children}
    </td>
  );
}

function DetailSkeleton() {
  return (
    <div className="mx-auto max-w-6xl space-y-5 p-6">
      <Skeleton className="h-20 w-full" />
      <div className="grid gap-5 lg:grid-cols-[2fr_1fr]">
        <div className="space-y-5">
          <Skeleton className="h-48 w-full" />
          <Skeleton className="h-72 w-full" />
        </div>
        <Skeleton className="h-72 w-full" />
      </div>
    </div>
  );
}
function Centered({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center gap-4 p-6 text-center">
      {children}
    </div>
  );
}
