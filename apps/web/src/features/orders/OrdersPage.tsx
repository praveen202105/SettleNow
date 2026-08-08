import { useMutation, useQuery } from '@tanstack/react-query';
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Banknote,
  Calendar,
  CircleDollarSign,
  Clock3,
  Edit3,
  Download,
  Eye,
  Lock,
  MoreHorizontal,
  Plus,
  Search,
  ShoppingCart,
  Trash2,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

import {
  formatDate,
  formatUsd,
  type OrderListItem,
  type OrderListQuery,
  type OrderExportInput,
  type OrderSortField,
  type OrderStatus,
  type SortDirection,
} from '@settleflow/shared';

import { StatusBadge } from '../../components/StatusBadge';
import { Alert } from '../../components/ui/Alert';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../../components/ui/DropdownMenu';
import { EmptyState } from '../../components/ui/EmptyState';
import { IconButton } from '../../components/ui/IconButton';
import { InputGroup, InputGroupAddon, InputGroupInput } from '../../components/ui/InputGroup';
import { PageHeader } from '../../components/ui/PageHeader';
import { Pagination } from '../../components/ui/Pagination';
import { Select } from '../../components/ui/Select';
import { Skeleton } from '../../components/ui/Skeleton';
import { ApiClientError } from '../../lib/api';
import { queryClient } from '../../lib/query';
import { useDebouncedValue } from '../../lib/useDebouncedValue';
import { exportKeys, exportsApi } from '../exports/api';
import { orderKeys, ordersApi } from './api';

const statusOptions: Array<{ label: string; value: 'all' | OrderStatus }> = [
  { label: 'All statuses', value: 'all' },
  { label: 'Pending', value: 'pending' },
  { label: 'Partially Paid', value: 'partially_paid' },
  { label: 'Paid', value: 'paid' },
  { label: 'Overdue', value: 'overdue' },
];

export function OrdersPage() {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search.trim(), 250);
  const [status, setStatus] = useState<'' | OrderStatus>('');
  const [sort, setSort] = useState<OrderSortField>('orderNumber');
  const [direction, setDirection] = useState<SortDirection>('desc');
  const [page, setPage] = useState(1);
  const [deleteOrder, setDeleteOrder] = useState<OrderListItem | null>(null);

  const query = useMemo<OrderListQuery>(
    () => ({
      direction,
      page,
      pageSize: 10,
      sort,
      ...(debouncedSearch ? { search: debouncedSearch } : {}),
      ...(status ? { status } : {}),
    }),
    [debouncedSearch, direction, page, sort, status],
  );
  const orders = useQuery({
    queryKey: orderKeys.list(query),
    queryFn: () => ordersApi.list(query),
  });
  const summary = useQuery({ queryKey: orderKeys.summary, queryFn: ordersApi.summary });
  const remove = useMutation({
    mutationFn: ordersApi.delete,
    onSuccess: async () => {
      setDeleteOrder(null);
      toast.success('Order deleted.');
      await queryClient.invalidateQueries({ queryKey: orderKeys.all });
    },
    onError: (error) =>
      toast.error(error instanceof ApiClientError ? error.message : 'Delete failed.'),
  });
  const exportOrders = useMutation({
    mutationFn: () => {
      const exportQuery: OrderExportInput = {
        direction,
        sort,
        ...(debouncedSearch ? { search: debouncedSearch } : {}),
        ...(status ? { status } : {}),
      };
      return exportsApi.create(exportQuery);
    },
    onSuccess: async () => {
      toast.success('Order export queued.');
      await queryClient.invalidateQueries({ queryKey: exportKeys.all });
      void navigate('/exports');
    },
    onError: (error) =>
      toast.error(error instanceof ApiClientError ? error.message : 'Export could not be queued.'),
  });

  const changeSort = (field: OrderSortField) => {
    if (sort === field) setDirection((current) => (current === 'asc' ? 'desc' : 'asc'));
    else {
      setSort(field);
      setDirection('asc');
    }
    setPage(1);
  };

  return (
    <div className="min-h-screen">
      <PageHeader
        title="Orders"
        description="Track customer orders, balances and settlement progress."
        actions={
          <>
            <Button
              variant="outline"
              disabled={exportOrders.isPending}
              onClick={() => exportOrders.mutate()}
            >
              <Download aria-hidden="true" />
              {exportOrders.isPending ? 'Queueing…' : 'Export CSV'}
            </Button>
            <Button asChild>
              <Link to="/orders/new">
                <Plus aria-hidden="true" /> New order
              </Link>
            </Button>
          </>
        }
      />
      <div className="mx-auto max-w-[1440px] space-y-5 p-4 sm:p-6">
        <Kpis summary={summary.data} loading={summary.isPending} />

        <Card className="overflow-hidden" aria-labelledby="orders-heading">
          <div className="flex flex-col gap-4 border-b border-slate-200 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
            <div>
              <h2 id="orders-heading" className="font-semibold text-slate-950">
                All orders
              </h2>
              <p className="mt-0.5 text-xs text-slate-500">
                Search, filter and manage order records.
              </p>
            </div>
            <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
              <div className="min-w-0 flex-1 sm:w-72">
                <InputGroup>
                  <InputGroupAddon aria-hidden="true">
                    <Search />
                  </InputGroupAddon>
                  <InputGroupInput
                    aria-label="Search orders"
                    value={search}
                    onChange={(event) => {
                      setSearch(event.target.value);
                      setPage(1);
                    }}
                    placeholder="Order # or customer…"
                    type="search"
                  />
                </InputGroup>
              </div>
              <Select
                ariaLabel="Filter by status"
                value={status || 'all'}
                options={statusOptions}
                onValueChange={(value) => {
                  setStatus(value === 'all' ? '' : (value as OrderStatus));
                  setPage(1);
                }}
              />
            </div>
          </div>

          {orders.isPending ? (
            <TableSkeleton />
          ) : orders.error ? (
            <ErrorState error={orders.error} retry={() => void orders.refetch()} />
          ) : orders.data.data.length === 0 ? (
            <EmptyOrders filtered={Boolean(debouncedSearch || status)} />
          ) : (
            <>
              <DesktopTable
                direction={direction}
                orders={orders.data.data}
                setDeleteOrder={setDeleteOrder}
                sort={sort}
                changeSort={changeSort}
              />
              <MobileCards orders={orders.data.data} setDeleteOrder={setDeleteOrder} />
              <Pagination
                page={orders.data.meta.page}
                total={orders.data.meta.total}
                totalPages={orders.data.meta.totalPages}
                pageSize={orders.data.meta.pageSize}
                setPage={setPage}
              />
            </>
          )}
        </Card>
      </div>

      <ConfirmDialog
        open={Boolean(deleteOrder)}
        setOpen={(open) => !open && setDeleteOrder(null)}
        title="Delete order?"
        description={`Delete ${deleteOrder?.orderNumber ?? 'this order'} permanently? This action cannot be undone.`}
        confirmLabel={remove.isPending ? 'Deleting…' : 'Delete order'}
        onConfirm={() => deleteOrder && remove.mutate(deleteOrder.id)}
      />
    </div>
  );
}

function Kpis({
  loading,
  summary,
}: {
  loading: boolean;
  summary: Awaited<ReturnType<typeof ordersApi.summary>> | undefined;
}) {
  const cards = [
    {
      label: 'Total orders',
      value: summary ? String(summary.totalOrders) : '—',
      sub: 'All customer orders',
      icon: ShoppingCart,
      tone: 'bg-blue-50 text-blue-600',
    },
    {
      label: 'Outstanding',
      value: summary ? formatUsd(summary.outstandingCents) : '—',
      sub: 'Awaiting settlement',
      icon: Clock3,
      tone: 'bg-amber-50 text-amber-600',
    },
    {
      label: 'Overdue',
      value: summary ? String(summary.overdueOrders) : '—',
      sub: 'Past their due date',
      icon: CircleDollarSign,
      tone: 'bg-red-50 text-red-600',
    },
    {
      label: 'Payments received',
      value: summary ? formatUsd(summary.paymentsReceivedCents) : '—',
      sub: 'Total amount collected',
      icon: Banknote,
      tone: 'bg-emerald-50 text-emerald-600',
    },
  ];
  return (
    <section
      className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4"
      aria-label="Order summary"
    >
      {cards.map(({ icon: Icon, ...card }) => (
        <Card className="p-5" key={card.label} aria-busy={loading}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-slate-500">{card.label}</p>
              {loading ? (
                <Skeleton className="mt-3 h-8 w-28" />
              ) : (
                <p className="mt-2 text-2xl font-bold tracking-tight text-slate-950 tabular-nums">
                  {card.value}
                </p>
              )}
            </div>
            <span className={`flex size-10 items-center justify-center rounded-xl ${card.tone}`}>
              <Icon className="size-5" aria-hidden="true" />
            </span>
          </div>
          <p className="mt-3 text-xs text-slate-400">{card.sub}</p>
        </Card>
      ))}
    </section>
  );
}

function SortButton({
  active,
  direction,
  label,
  onClick,
}: {
  active: boolean;
  direction: SortDirection;
  label: string;
  onClick: () => void;
}) {
  const Icon = active ? (direction === 'asc' ? ArrowUp : ArrowDown) : ArrowUpDown;
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1.5 hover:text-slate-900"
    >
      {label}
      <Icon
        className={active ? 'size-3.5 text-blue-600' : 'size-3.5 text-slate-300'}
        aria-hidden="true"
      />
    </button>
  );
}

function DesktopTable({
  changeSort,
  direction,
  orders,
  setDeleteOrder,
  sort,
}: {
  changeSort: (field: OrderSortField) => void;
  direction: SortDirection;
  orders: OrderListItem[];
  setDeleteOrder: (order: OrderListItem) => void;
  sort: OrderSortField;
}) {
  const headers: Array<{ field?: OrderSortField; label: string; align?: 'right' }> = [
    { field: 'orderNumber', label: 'Order' },
    { field: 'customer', label: 'Customer' },
    { field: 'dueDate', label: 'Due date' },
    { field: 'total', label: 'Total', align: 'right' },
    { label: 'Paid', align: 'right' },
    { label: 'Due', align: 'right' },
    { field: 'status', label: 'Status' },
    { label: '', align: 'right' },
  ];
  return (
    <div className="hidden overflow-x-auto md:block">
      <table className="w-full min-w-[900px] text-sm">
        <thead className="border-b border-slate-200 bg-slate-50/70">
          <tr>
            {headers.map((header, index) => (
              <th
                key={`${header.label}-${index}`}
                scope="col"
                aria-sort={
                  header.field && sort === header.field
                    ? direction === 'asc'
                      ? 'ascending'
                      : 'descending'
                    : undefined
                }
                className={`whitespace-nowrap px-5 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500 ${header.align === 'right' ? 'text-right' : 'text-left'}`}
              >
                {header.field ? (
                  <SortButton
                    label={header.label}
                    active={sort === header.field}
                    direction={direction}
                    onClick={() => changeSort(header.field!)}
                  />
                ) : (
                  header.label
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {orders.map((order) => (
            <tr className="transition-colors hover:bg-blue-50/35" key={order.id}>
              <td className="px-5 py-4">
                <Link
                  className="font-mono text-xs font-semibold text-blue-600 hover:underline"
                  to={`/orders/${order.id}`}
                >
                  {order.orderNumber}
                </Link>
              </td>
              <td className="px-5 py-4">
                <span className="block font-semibold text-slate-800">{order.customer}</span>
                {order.customerMobile ? (
                  <span className="mt-0.5 block text-xs text-slate-500">
                    {order.customerMobile}
                  </span>
                ) : null}
              </td>
              <td className="whitespace-nowrap px-5 py-4 text-slate-500">
                {formatDate(order.dueDate)}
              </td>
              <td className="whitespace-nowrap px-5 py-4 text-right font-semibold text-slate-800 tabular-nums">
                {formatUsd(order.orderTotalCents)}
              </td>
              <td className="whitespace-nowrap px-5 py-4 text-right text-emerald-700 tabular-nums">
                {formatUsd(order.amountPaidCents)}
              </td>
              <td className="whitespace-nowrap px-5 py-4 text-right text-slate-600 tabular-nums">
                {formatUsd(order.amountDueCents)}
              </td>
              <td className="px-5 py-4">
                <StatusBadge status={order.status} />
              </td>
              <td className="px-5 py-4 text-right">
                <OrderActions order={order} setDeleteOrder={setDeleteOrder} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function OrderActions({
  order,
  setDeleteOrder,
}: {
  order: OrderListItem;
  setDeleteOrder: (order: OrderListItem) => void;
}) {
  const navigate = useNavigate();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <IconButton
          variant="ghost"
          className="h-9 min-h-9 w-9"
          aria-label={`Actions for ${order.orderNumber}`}
        >
          <MoreHorizontal aria-hidden="true" />
        </IconButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuItem onSelect={() => void navigate(`/orders/${order.id}`)}>
          <Eye className="size-4" aria-hidden="true" /> View order
        </DropdownMenuItem>
        <DropdownMenuItem
          disabled={order.isLocked}
          onSelect={() => void navigate(`/orders/${order.id}/edit`)}
        >
          {order.isLocked ? (
            <Lock className="size-4" aria-hidden="true" />
          ) : (
            <Edit3 className="size-4" aria-hidden="true" />
          )}
          {order.isLocked ? 'Locked after payment' : 'Edit order'}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          destructive
          disabled={order.isLocked}
          onSelect={() => setDeleteOrder(order)}
        >
          <Trash2 className="size-4" aria-hidden="true" /> Delete order
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function MobileCards({
  orders,
  setDeleteOrder,
}: {
  orders: OrderListItem[];
  setDeleteOrder: (order: OrderListItem) => void;
}) {
  return (
    <div className="divide-y divide-slate-100 md:hidden">
      {orders.map((order) => (
        <article className="space-y-4 p-4" key={order.id}>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <Link
                className="font-mono text-xs font-semibold text-blue-600"
                to={`/orders/${order.id}`}
              >
                {order.orderNumber}
              </Link>
              <h3 className="mt-1 truncate font-semibold text-slate-900">{order.customer}</h3>
              {order.customerMobile ? (
                <p className="mt-0.5 truncate text-xs text-slate-500">{order.customerMobile}</p>
              ) : null}
            </div>
            <StatusBadge status={order.status} />
          </div>
          <dl className="grid grid-cols-3 gap-2 rounded-xl bg-slate-50 p-3 text-xs">
            <div>
              <dt className="text-slate-400">Total</dt>
              <dd className="mt-1 font-semibold text-slate-800 tabular-nums">
                {formatUsd(order.orderTotalCents)}
              </dd>
            </div>
            <div>
              <dt className="text-slate-400">Paid</dt>
              <dd className="mt-1 font-semibold text-emerald-700 tabular-nums">
                {formatUsd(order.amountPaidCents)}
              </dd>
            </div>
            <div>
              <dt className="text-slate-400">Due</dt>
              <dd className="mt-1 font-semibold text-slate-700 tabular-nums">
                {formatUsd(order.amountDueCents)}
              </dd>
            </div>
          </dl>
          <div className="flex items-center justify-between gap-3">
            <span className="flex items-center gap-1.5 text-xs text-slate-400">
              <Calendar className="size-3.5" aria-hidden="true" /> Due {formatDate(order.dueDate)}
            </span>
            <OrderActions order={order} setDeleteOrder={setDeleteOrder} />
          </div>
        </article>
      ))}
    </div>
  );
}

function TableSkeleton() {
  return (
    <div className="space-y-3 p-5" aria-label="Loading orders">
      {Array.from({ length: 5 }, (_, index) => (
        <Skeleton className="h-12 w-full" key={index} />
      ))}
    </div>
  );
}

function EmptyOrders({ filtered }: { filtered: boolean }) {
  return (
    <EmptyState
      icon={<ShoppingCart aria-hidden="true" />}
      title="No orders found"
      description={
        filtered
          ? 'Try adjusting your search or status filter.'
          : 'Create your first customer order to start tracking settlements.'
      }
      action={
        !filtered ? (
          <Button asChild>
            <Link to="/orders/new">Create order</Link>
          </Button>
        ) : undefined
      }
    />
  );
}

function ErrorState({ error, retry }: { error: unknown; retry: () => void }) {
  const message = error instanceof ApiClientError ? error.message : 'Orders could not be loaded.';
  return (
    <div className="flex min-h-72 flex-col items-center justify-center gap-4 p-6">
      <Alert variant="danger" className="max-w-md">
        {message}
      </Alert>
      <Button variant="outline" onClick={retry}>
        Try again
      </Button>
    </div>
  );
}
