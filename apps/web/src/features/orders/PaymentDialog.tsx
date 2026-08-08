import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { CheckCircle2 } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';

import {
  centsToInput,
  formatUsd,
  isIsoDate,
  parseMoneyToCents,
  todayIsoLocal,
  type OrderResponse,
} from '@settleflow/shared';

import { Alert } from '../../components/ui/Alert';
import { Button } from '../../components/ui/Button';
import { DialogClose, DialogContent, DialogRoot } from '../../components/ui/Dialog';
import { Field, FieldDescription, FieldError, FieldLabel } from '../../components/ui/Field';
import { Input } from '../../components/ui/Input';
import { InputGroup, InputGroupAddon, InputGroupInput } from '../../components/ui/InputGroup';
import { Spinner } from '../../components/ui/Spinner';
import { ApiClientError } from '../../lib/api';
import { queryClient } from '../../lib/query';
import { activityKeys } from '../activity/api';
import { orderKeys, ordersApi } from './api';

const paymentFormSchema = z.object({
  amount: z
    .string()
    .trim()
    .min(1, 'Payment amount is required.')
    .refine((value) => {
      try {
        return parseMoneyToCents(value) > 0;
      } catch {
        return false;
      }
    }, 'Enter a valid payment amount.'),
  date: z
    .string()
    .min(1, 'Payment date is required.')
    .refine(isIsoDate, 'Enter a valid payment date.'),
  note: z.string().max(500),
});

type PaymentFormValues = z.infer<typeof paymentFormSchema>;

export function PaymentDialog({
  open,
  order,
  setOpen,
}: {
  open: boolean;
  order: OrderResponse;
  setOpen: (open: boolean) => void;
}) {
  const {
    register,
    handleSubmit,
    setFocus,
    setValue,
    reset,
    formState: { errors },
  } = useForm<PaymentFormValues>({
    resolver: zodResolver(paymentFormSchema),
    defaultValues: { amount: '', date: todayIsoLocal(), note: '' },
  });
  const mutation = useMutation({
    mutationFn: (values: PaymentFormValues) =>
      ordersApi.recordPayment(order.id, {
        amountCents: parseMoneyToCents(values.amount),
        date: values.date,
        note: values.note,
      }),
    onSuccess: async (updated) => {
      queryClient.setQueryData(orderKeys.detail(order.id), updated);
      await queryClient.invalidateQueries({ queryKey: orderKeys.all });
      await queryClient.invalidateQueries({ queryKey: activityKeys.all });
      toast.success(
        updated.status === 'paid' ? 'Payment recorded. Order is fully paid.' : 'Payment recorded.',
      );
      reset({ amount: '', date: todayIsoLocal(), note: '' });
      setOpen(false);
    },
  });
  const serverMessage =
    mutation.error instanceof ApiClientError
      ? mutation.error.message
      : mutation.error
        ? 'Payment could not be recorded.'
        : '';
  const onOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      mutation.reset();
      reset({ amount: '', date: todayIsoLocal(), note: '' });
    }
    setOpen(nextOpen);
  };

  return (
    <DialogRoot open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title="Record payment"
        description={`${order.orderNumber} · ${order.customer}`}
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          setFocus('amount');
        }}
      >
        <form
          className="grid gap-5 p-5 sm:p-6"
          onSubmit={(event) => void handleSubmit((values) => mutation.mutate(values))(event)}
          noValidate
        >
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Outstanding balance
            </p>
            <p
              className={`mt-1.5 text-2xl font-bold tabular-nums ${order.amountDueCents > 0 ? 'text-slate-950' : 'text-emerald-700'}`}
            >
              {formatUsd(order.amountDueCents)}
            </p>
            {order.amountDueCents === 0 ? (
              <p className="mt-2 flex items-center gap-1.5 text-sm font-semibold text-emerald-700">
                <CheckCircle2 className="size-4" aria-hidden="true" /> Fully paid
              </p>
            ) : null}
          </div>

          {serverMessage ? <Alert variant="danger">{serverMessage}</Alert> : null}

          {order.amountDueCents > 0 ? (
            <>
              <Field>
                <FieldLabel htmlFor="payment-amount">Amount</FieldLabel>
                <InputGroup>
                  <InputGroupAddon aria-hidden="true">$</InputGroupAddon>
                  <InputGroupInput
                    id="payment-amount"
                    inputMode="decimal"
                    placeholder="0.00"
                    aria-invalid={Boolean(errors.amount)}
                    aria-describedby={
                      errors.amount ? 'payment-amount-error' : 'payment-amount-help'
                    }
                    {...register('amount')}
                  />
                </InputGroup>
                <FieldError id="payment-amount-error">{errors.amount?.message}</FieldError>
                <FieldDescription id="payment-amount-help">
                  <button
                    type="button"
                    className="font-semibold text-blue-600 hover:underline"
                    onClick={() =>
                      setValue('amount', centsToInput(order.amountDueCents), {
                        shouldValidate: true,
                      })
                    }
                  >
                    Use full balance ({formatUsd(order.amountDueCents)})
                  </button>
                </FieldDescription>
              </Field>
              <Field>
                <FieldLabel htmlFor="payment-date">Payment date</FieldLabel>
                <Input
                  id="payment-date"
                  type="date"
                  aria-invalid={Boolean(errors.date)}
                  aria-describedby={errors.date ? 'payment-date-error' : undefined}
                  {...register('date')}
                />
                <FieldError id="payment-date-error">{errors.date?.message}</FieldError>
              </Field>
              <Field>
                <FieldLabel htmlFor="payment-note">
                  Note <span className="font-normal text-slate-400">(optional)</span>
                </FieldLabel>
                <Input
                  id="payment-note"
                  placeholder="Wire transfer, deposit, reference…"
                  {...register('note')}
                />
              </Field>
              <div className="flex flex-col-reverse gap-2 border-t border-slate-100 pt-4 sm:flex-row sm:justify-end">
                <DialogClose asChild>
                  <Button variant="outline">Cancel</Button>
                </DialogClose>
                <Button type="submit" disabled={mutation.isPending}>
                  {mutation.isPending ? <Spinner label="Recording…" /> : 'Record payment'}
                </Button>
              </div>
            </>
          ) : (
            <div className="flex justify-end">
              <DialogClose asChild>
                <Button>Done</Button>
              </DialogClose>
            </div>
          )}
        </form>
      </DialogContent>
    </DialogRoot>
  );
}
