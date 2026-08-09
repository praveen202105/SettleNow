import { useMutation, useQuery } from '@tanstack/react-query';
import { CreditCard, ShieldCheck } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

import { formatInr, minorToInput, parseMoneyToMinor, type OrderResponse } from '@settleflow/shared';

import { Alert } from '../../components/ui/Alert';
import { Button } from '../../components/ui/Button';
import { DialogClose, DialogContent, DialogRoot } from '../../components/ui/Dialog';
import { Field, FieldDescription, FieldError, FieldLabel } from '../../components/ui/Field';
import { InputGroup, InputGroupAddon, InputGroupInput } from '../../components/ui/InputGroup';
import { Spinner } from '../../components/ui/Spinner';
import { ApiClientError } from '../../lib/api';
import { queryClient } from '../../lib/query';
import { activityKeys } from '../activity/api';
import { orderKeys } from '../orders/api';
import { paymentKeys, paymentsApi } from './api';
import { openRazorpayCheckout } from './razorpay';

export function OnlinePaymentDialog({
  open,
  order,
  setOpen,
}: {
  open: boolean;
  order: OrderResponse;
  setOpen: (open: boolean) => void;
}) {
  const [amount, setAmount] = useState('');
  const [attemptId, setAttemptId] = useState<string>();
  const attempt = useQuery({
    queryKey: paymentKeys.attempt(attemptId ?? ''),
    queryFn: () => paymentsApi.getOwnerAttempt(attemptId ?? ''),
    enabled: Boolean(attemptId),
    refetchInterval: (query) =>
      ['creating', 'pending'].includes(query.state.data?.status ?? '') ? 2_000 : false,
  });
  const refreshOrder = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: orderKeys.all }),
      queryClient.invalidateQueries({ queryKey: activityKeys.all }),
    ]);
  };
  useEffect(() => {
    if (attempt.data?.status === 'captured') {
      void refreshOrder();
      toast.success('Test payment captured and recorded.');
      setOpen(false);
    }
  }, [attempt.data?.status, setOpen]);

  const confirm = useMutation({
    mutationFn: (variables: Parameters<typeof paymentsApi.confirmAttempt>) =>
      paymentsApi.confirmAttempt(...variables),
  });
  const create = useMutation({
    mutationFn: (amountMinor: number) => paymentsApi.createOwnerAttempt(order.id, amountMinor),
    onSuccess: async (created) => {
      setAttemptId(created.id);
      const result = await openRazorpayCheckout(created);
      if (result === 'dismissed') {
        toast.info('Checkout closed. It remains reserved for up to 15 minutes.');
        return;
      }
      if (result === 'failed') {
        toast.error('The test payment failed. You can retry after the attempt is released.');
        return;
      }
      const updated = await confirm.mutateAsync([
        created.id,
        {
          razorpayOrderId: result.razorpay_order_id,
          razorpayPaymentId: result.razorpay_payment_id,
          razorpaySignature: result.razorpay_signature,
        },
      ]);
      queryClient.setQueryData(paymentKeys.attempt(created.id), updated);
      if (updated.status === 'captured') await refreshOrder();
    },
  });
  const cancel = useMutation({
    mutationFn: paymentsApi.cancelAttempt,
    onSuccess: (updated) => {
      queryClient.setQueryData(paymentKeys.attempt(updated.id), updated);
      setAttemptId(undefined);
      toast.success('Online checkout cancelled.');
    },
  });

  let amountMinor: number | undefined;
  let amountError = '';
  try {
    amountMinor = parseMoneyToMinor(amount);
    if (amountMinor < 100) amountError = 'Online payments must be at least ₹1.';
    else if (amountMinor > order.amountDueMinor)
      amountError = 'Amount exceeds the outstanding balance.';
  } catch {
    if (amount) amountError = 'Enter a valid amount.';
  }
  const error = create.error ?? confirm.error;
  const serverMessage =
    error instanceof ApiClientError
      ? error.message
      : error
        ? 'Online checkout could not be completed.'
        : '';
  const active = attempt.data && ['creating', 'pending'].includes(attempt.data.status);
  const attemptMessage =
    attempt.data?.status === 'failed'
      ? 'The test payment failed. No amount was recorded; you can start a new checkout.'
      : attempt.data?.status === 'expired'
        ? 'The checkout expired. You can start a new test checkout.'
        : attempt.data?.status === 'needs_review'
          ? 'This captured test payment needs review and was not added to the balance.'
          : '';

  return (
    <DialogRoot
      open={open}
      onOpenChange={(next) => {
        if (!next && !active) {
          setAmount('');
          setAttemptId(undefined);
        }
        setOpen(next);
      }}
    >
      <DialogContent
        title="Collect online test payment"
        description={`${order.orderNumber} · ${order.customer}`}
      >
        <div className="grid gap-5 p-5 sm:p-6">
          <Alert variant="warning">
            <strong>Test mode:</strong> Razorpay will simulate this payment. No real money moves.
          </Alert>
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Amount due
            </p>
            <p className="mt-1 text-2xl font-bold tabular-nums text-slate-950">
              {formatInr(order.amountDueMinor)}
            </p>
          </div>
          {serverMessage ? <Alert variant="danger">{serverMessage}</Alert> : null}
          {attemptMessage ? <Alert variant="danger">{attemptMessage}</Alert> : null}
          {active ? (
            <div className="space-y-4">
              <Alert>
                A checkout for {formatInr(attempt.data.amountMinor)} is active until{' '}
                {new Date(attempt.data.expiresAt).toLocaleTimeString()}.
              </Alert>
              <Button
                variant="outline"
                onClick={() => cancel.mutate(attempt.data.id)}
                disabled={cancel.isPending}
              >
                {cancel.isPending ? 'Cancelling…' : 'Cancel active checkout'}
              </Button>
            </div>
          ) : (
            <Field>
              <FieldLabel htmlFor="online-payment-amount">Customer payment amount</FieldLabel>
              <InputGroup>
                <InputGroupAddon aria-hidden="true">₹</InputGroupAddon>
                <InputGroupInput
                  id="online-payment-amount"
                  inputMode="decimal"
                  value={amount}
                  onChange={(event) => setAmount(event.target.value)}
                  aria-invalid={Boolean(amountError)}
                  aria-describedby="online-payment-help online-payment-error"
                  placeholder="0.00"
                />
              </InputGroup>
              <FieldError id="online-payment-error">{amountError}</FieldError>
              <FieldDescription id="online-payment-help">
                <button
                  type="button"
                  className="font-semibold text-blue-600 hover:underline"
                  onClick={() => setAmount(minorToInput(order.amountDueMinor))}
                >
                  Use full balance ({formatInr(order.amountDueMinor)})
                </button>
              </FieldDescription>
            </Field>
          )}
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <ShieldCheck className="size-4 text-emerald-600" aria-hidden="true" />
            Payment details are handled securely by Razorpay Checkout.
          </div>
          <div className="flex flex-col-reverse gap-2 border-t border-slate-100 pt-4 sm:flex-row sm:justify-end">
            <DialogClose asChild>
              <Button variant="outline">Close</Button>
            </DialogClose>
            {!active ? (
              <Button
                disabled={
                  !amountMinor || Boolean(amountError) || create.isPending || confirm.isPending
                }
                onClick={() => amountMinor && create.mutate(amountMinor)}
              >
                {create.isPending || confirm.isPending ? (
                  <Spinner label="Opening checkout…" />
                ) : (
                  <>
                    <CreditCard aria-hidden="true" /> Open test checkout
                  </>
                )}
              </Button>
            ) : null}
          </div>
        </div>
      </DialogContent>
    </DialogRoot>
  );
}
