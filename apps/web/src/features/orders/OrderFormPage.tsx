import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Building2, ChevronLeft, FileText, Plus, Trash2 } from 'lucide-react';
import { useFieldArray, useForm } from 'react-hook-form';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { z } from 'zod';

import {
  minorToInput,
  formatInr,
  isIsoDate,
  orderInputSchema,
  parseMoneyToMinor,
  type CustomerResponse,
  type OrderInput,
  type OrderResponse,
} from '@settleflow/shared';

import { Alert } from '../../components/ui/Alert';
import { Button } from '../../components/ui/Button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '../../components/ui/Card';
import { Field, FieldError, FieldLabel } from '../../components/ui/Field';
import { IconButton } from '../../components/ui/IconButton';
import { Input } from '../../components/ui/Input';
import { InputGroup, InputGroupAddon, InputGroupInput } from '../../components/ui/InputGroup';
import { PageHeader } from '../../components/ui/PageHeader';
import { Spinner } from '../../components/ui/Spinner';
import { ApiClientError } from '../../lib/api';
import { queryClient } from '../../lib/query';
import { CustomerCombobox } from '../customers/CustomerCombobox';
import { orderKeys, ordersApi } from './api';

const moneyInputSchema = z
  .string()
  .trim()
  .min(1, 'Unit price is required.')
  .refine((value) => {
    try {
      parseMoneyToMinor(value);
      return true;
    } catch {
      return false;
    }
  }, 'Enter a valid amount with up to two decimals.');

const orderFormSchema = z.object({
  customerId: z.string().uuid('Select a customer.'),
  dueDate: z.string().min(1, 'Due date is required.').refine(isIsoDate, 'Enter a valid due date.'),
  lineItems: z
    .array(
      z.object({
        description: z.string().trim().min(1, 'Description is required.').max(200),
        quantity: z.number().int().min(1, 'Quantity must be at least 1.').max(100_000),
        unitPrice: moneyInputSchema,
      }),
    )
    .min(1),
});

type OrderFormValues = z.infer<typeof orderFormSchema>;

function defaults(order?: OrderResponse): OrderFormValues {
  if (!order) {
    return {
      customerId: '',
      dueDate: '',
      lineItems: [{ description: '', quantity: 1, unitPrice: '0.00' }],
    };
  }
  return {
    customerId: order.customerId ?? '',
    dueDate: order.dueDate,
    lineItems: order.lineItems.map((item) => ({
      description: item.description,
      quantity: item.quantity,
      unitPrice: minorToInput(item.unitPriceMinor),
    })),
  };
}

export function OrderFormPage({ mode }: { mode: 'create' | 'edit' }) {
  const { orderId } = useParams();
  const order = useQuery({
    queryKey: orderKeys.detail(orderId ?? ''),
    queryFn: () => ordersApi.detail(orderId ?? ''),
    enabled: mode === 'edit' && Boolean(orderId),
  });

  if (mode === 'edit' && order.isPending)
    return (
      <CenteredState>
        <Spinner label="Loading order…" />
      </CenteredState>
    );
  if (mode === 'edit' && order.error) {
    const message =
      order.error instanceof ApiClientError ? order.error.message : 'Order could not be loaded.';
    return (
      <CenteredState>
        <Alert variant="danger">{message}</Alert>
      </CenteredState>
    );
  }
  if (mode === 'edit' && order.data?.isLocked) {
    return (
      <CenteredState>
        <Alert variant="warning" title="Order locked">
          This order has a payment and can no longer be edited.
        </Alert>
        <Button asChild variant="outline">
          <Link to={`/orders/${order.data.id}`}>Return to order</Link>
        </Button>
      </CenteredState>
    );
  }
  return <OrderForm mode={mode} order={order.data} />;
}

function OrderForm({ mode, order }: { mode: 'create' | 'edit'; order: OrderResponse | undefined }) {
  const navigate = useNavigate();
  const {
    control,
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<OrderFormValues>({
    resolver: zodResolver(orderFormSchema),
    defaultValues: defaults(order),
  });
  const lines = useFieldArray({ control, name: 'lineItems' });
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerResponse | null>(() =>
    order?.customerId && order.customerMobile
      ? {
          createdAt: order.createdAt,
          id: order.customerId,
          mobile: order.customerMobile,
          name: order.customer,
          updatedAt: order.updatedAt,
        }
      : null,
  );
  const watchedLines = watch('lineItems');
  const cancelHref = order ? `/orders/${order.id}` : '/orders';

  const mutation = useMutation({
    mutationFn: (input: OrderInput) =>
      mode === 'edit' && order ? ordersApi.update(order.id, input) : ordersApi.create(input),
    onSuccess: async (saved) => {
      queryClient.setQueryData(orderKeys.detail(saved.id), saved);
      await queryClient.invalidateQueries({ queryKey: orderKeys.all });
      toast.success(mode === 'edit' ? 'Order updated.' : 'Order created.');
      void navigate(`/orders/${saved.id}`, { replace: true });
    },
    onError: (error) => {
      if (error instanceof ApiClientError && error.code === 'ORDER_LOCKED' && order) {
        toast.error(error.message);
        void navigate(`/orders/${order.id}`, { replace: true });
        return;
      }
      toast.error(error instanceof ApiClientError ? error.message : 'Order could not be saved.');
    },
  });

  const submit = (values: OrderFormValues) => {
    mutation.mutate(
      orderInputSchema.parse({
        customerId: values.customerId,
        dueDate: values.dueDate,
        lineItems: values.lineItems.map((item) => ({
          description: item.description,
          quantity: item.quantity,
          unitPriceMinor: parseMoneyToMinor(item.unitPrice),
        })),
      }),
    );
  };
  const subtotal = watchedLines.reduce((sum, item) => {
    try {
      return (
        sum +
        (Number.isFinite(item.quantity) ? item.quantity : 0) *
          parseMoneyToMinor(item.unitPrice || '0')
      );
    } catch {
      return sum;
    }
  }, 0);

  return (
    <div className="min-h-screen pb-24 sm:pb-0">
      <PageHeader
        className="max-w-5xl"
        title={mode === 'edit' ? 'Edit order' : 'New order'}
        description={
          mode === 'edit'
            ? 'Update customer and line-item details.'
            : 'Create an order and start tracking its settlement.'
        }
        back={
          <Button asChild variant="ghost" size="icon" aria-label="Go back">
            <Link to={cancelHref}>
              <ChevronLeft aria-hidden="true" />
            </Link>
          </Button>
        }
      />
      <form
        className="mx-auto max-w-5xl space-y-5 p-4 sm:p-6"
        onSubmit={(event) => void handleSubmit(submit)(event)}
        noValidate
      >
        <Card>
          <CardHeader className="border-b border-slate-100">
            <div className="flex items-start gap-3">
              <span className="flex size-10 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
                <Building2 className="size-5" aria-hidden="true" />
              </span>
              <div>
                <CardTitle>Customer details</CardTitle>
                <CardDescription>
                  Select a saved customer and choose when payment is due.
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="grid gap-5 pt-5 sm:grid-cols-2 sm:pt-6">
            <Field>
              <FieldLabel>Customer</FieldLabel>
              <input type="hidden" {...register('customerId')} />
              <CustomerCombobox
                value={selectedCustomer}
                invalid={Boolean(errors.customerId)}
                onValueChange={(customer) => {
                  setSelectedCustomer(customer);
                  setValue('customerId', customer.id, {
                    shouldDirty: true,
                    shouldValidate: true,
                  });
                }}
              />
              {order && !order.customerId ? (
                <p className="text-xs leading-5 text-amber-700">
                  Legacy customer: {order.customer}. Select or add a saved customer before updating.
                </p>
              ) : null}
              <FieldError id="customer-error">{errors.customerId?.message}</FieldError>
            </Field>
            <Field>
              <FieldLabel htmlFor="dueDate">Due date</FieldLabel>
              <Input
                id="dueDate"
                type="date"
                aria-invalid={Boolean(errors.dueDate)}
                aria-describedby={errors.dueDate ? 'dueDate-error' : undefined}
                {...register('dueDate')}
              />
              <FieldError id="dueDate-error">{errors.dueDate?.message}</FieldError>
            </Field>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-start justify-between border-b border-slate-100">
            <div className="flex items-start gap-3">
              <span className="flex size-10 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
                <FileText className="size-5" aria-hidden="true" />
              </span>
              <div>
                <CardTitle>Line items</CardTitle>
                <CardDescription>Add products or services included in this order.</CardDescription>
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => lines.append({ description: '', quantity: 1, unitPrice: '0.00' })}
            >
              <Plus aria-hidden="true" /> Add item
            </Button>
          </CardHeader>
          <CardContent className="pt-5 sm:pt-6">
            <div className="hidden grid-cols-[minmax(220px,1fr)_90px_150px_120px_44px] gap-3 px-1 pb-2 text-xs font-semibold uppercase tracking-wide text-slate-400 lg:grid">
              <span>Description</span>
              <span>Qty</span>
              <span>Unit price</span>
              <span className="text-right">Total</span>
              <span />
            </div>
            <div className="space-y-3">
              {lines.fields.map((field, index) => {
                const line = watchedLines[index];
                let lineTotal = 0;
                try {
                  lineTotal = (line?.quantity ?? 0) * parseMoneyToMinor(line?.unitPrice || '0');
                } catch {
                  /* validation explains invalid input */
                }
                return (
                  <div
                    key={field.id}
                    className="grid gap-4 rounded-xl border border-slate-200 bg-slate-50/60 p-4 lg:grid-cols-[minmax(220px,1fr)_90px_150px_120px_44px] lg:items-start lg:border-0 lg:bg-transparent lg:p-0"
                  >
                    <Field>
                      <FieldLabel className="lg:sr-only" htmlFor={`line-${index}-description`}>
                        Description
                      </FieldLabel>
                      <Input
                        id={`line-${index}-description`}
                        placeholder="Service or product"
                        aria-invalid={Boolean(errors.lineItems?.[index]?.description)}
                        aria-describedby={
                          errors.lineItems?.[index]?.description
                            ? `line-${index}-description-error`
                            : undefined
                        }
                        {...register(`lineItems.${index}.description`)}
                      />
                      <FieldError id={`line-${index}-description-error`}>
                        {errors.lineItems?.[index]?.description?.message}
                      </FieldError>
                    </Field>
                    <Field>
                      <FieldLabel className="lg:sr-only" htmlFor={`line-${index}-quantity`}>
                        Quantity
                      </FieldLabel>
                      <Input
                        id={`line-${index}-quantity`}
                        type="number"
                        min="1"
                        step="1"
                        className="text-center"
                        aria-invalid={Boolean(errors.lineItems?.[index]?.quantity)}
                        aria-describedby={
                          errors.lineItems?.[index]?.quantity
                            ? `line-${index}-quantity-error`
                            : undefined
                        }
                        {...register(`lineItems.${index}.quantity`, { valueAsNumber: true })}
                      />
                      <FieldError id={`line-${index}-quantity-error`}>
                        {errors.lineItems?.[index]?.quantity?.message}
                      </FieldError>
                    </Field>
                    <Field>
                      <FieldLabel className="lg:sr-only" htmlFor={`line-${index}-price`}>
                        Unit price
                      </FieldLabel>
                      <InputGroup>
                        <InputGroupAddon aria-hidden="true">₹</InputGroupAddon>
                        <InputGroupInput
                          id={`line-${index}-price`}
                          inputMode="decimal"
                          aria-invalid={Boolean(errors.lineItems?.[index]?.unitPrice)}
                          aria-describedby={
                            errors.lineItems?.[index]?.unitPrice
                              ? `line-${index}-price-error`
                              : undefined
                          }
                          {...register(`lineItems.${index}.unitPrice`)}
                        />
                      </InputGroup>
                      <FieldError id={`line-${index}-price-error`}>
                        {errors.lineItems?.[index]?.unitPrice?.message}
                      </FieldError>
                    </Field>
                    <div className="flex min-h-11 items-center justify-between lg:justify-end">
                      <span className="text-xs font-medium text-slate-400 lg:hidden">
                        Line total
                      </span>
                      <span className="text-sm font-semibold text-slate-900 tabular-nums">
                        {formatSafe(lineTotal)}
                      </span>
                    </div>
                    <IconButton
                      variant="ghost"
                      className="h-11 w-11 text-slate-400 hover:bg-red-50 hover:text-red-600"
                      disabled={lines.fields.length === 1}
                      onClick={() => lines.remove(index)}
                      aria-label={`Remove line item ${index + 1}`}
                    >
                      <Trash2 aria-hidden="true" />
                    </IconButton>
                  </div>
                );
              })}
            </div>
            <div className="mt-6 flex justify-end border-t border-slate-200 pt-5">
              <div className="text-right">
                <p className="text-sm font-medium text-slate-500">Order subtotal</p>
                <p className="mt-1 text-3xl font-bold tracking-tight text-slate-950 tabular-nums">
                  {formatSafe(subtotal)}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="fixed inset-x-0 bottom-0 z-20 flex flex-col-reverse gap-2 border-t border-slate-200 bg-white/95 p-3 backdrop-blur sm:static sm:flex-row sm:justify-end sm:border-0 sm:bg-transparent sm:p-0">
          <Button variant="outline" onClick={() => void navigate(cancelHref)}>
            Cancel
          </Button>
          <Button type="submit" disabled={mutation.isPending}>
            {mutation.isPending ? (
              <Spinner label="Saving…" />
            ) : mode === 'edit' ? (
              'Save changes'
            ) : (
              'Create order'
            )}
          </Button>
        </div>
      </form>
    </div>
  );
}

function formatSafe(minor: number): string {
  return Number.isSafeInteger(minor) ? formatInr(minor) : '₹0.00';
}

function CenteredState({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center gap-4 p-6 text-center">
      {children}
    </div>
  );
}
