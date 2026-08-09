import { useMutation, useQuery } from '@tanstack/react-query';
import { CheckCircle2, CreditCard, ShieldCheck } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import {
  formatInr,
  minorToInput,
  parseMoneyToMinor,
  type PaymentAttemptResponse,
} from '@settleflow/shared';

import { BrandMark } from '../../components/brand/BrandMark';
import { Alert } from '../../components/ui/Alert';
import { Button } from '../../components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/Card';
import { Field, FieldDescription, FieldError, FieldLabel } from '../../components/ui/Field';
import { InputGroup, InputGroupAddon, InputGroupInput } from '../../components/ui/InputGroup';
import { Skeleton } from '../../components/ui/Skeleton';
import { Spinner } from '../../components/ui/Spinner';
import { ApiClientError } from '../../lib/api';
import { queryClient } from '../../lib/query';
import { paymentKeys, paymentsApi } from './api';
import { openRazorpayCheckout } from './razorpay';

export function PublicPaymentPage() {
  const { linkId, token } = useParams();
  const navigate = useNavigate();
  const [amount, setAmount] = useState('');
  const [activeAttempt, setActiveAttempt] = useState<PaymentAttemptResponse>();
  const [lastPaymentMinor, setLastPaymentMinor] = useState<number>();
  const exchange = useMutation({
    mutationFn: paymentsApi.exchangeLink,
    onSuccess: (summary) => {
      queryClient.setQueryData(paymentKeys.publicLink(summary.id), summary);
      void navigate(`/pay/session/${summary.id}`, { replace: true });
    },
  });
  const { mutate: exchangeToken } = exchange;
  useEffect(() => {
    if (token && !exchange.isPending && !exchange.isSuccess) exchangeToken(token);
  }, [token, exchangeToken, exchange.isPending, exchange.isSuccess]);

  const summary = useQuery({
    queryKey: paymentKeys.publicLink(linkId ?? ''),
    queryFn: () => paymentsApi.getPublicLink(linkId ?? ''),
    enabled: Boolean(linkId),
  });
  const attempt = useQuery({
    queryKey: paymentKeys.attempt(activeAttempt?.id ?? ''),
    queryFn: () => paymentsApi.getPublicAttempt(activeAttempt?.id ?? ''),
    enabled: Boolean(activeAttempt),
    refetchInterval: (query) =>
      ['creating', 'pending'].includes(query.state.data?.status ?? '') ? 2_000 : false,
  });
  useEffect(() => {
    if (attempt.data) setActiveAttempt(attempt.data);
    if (attempt.data?.status === 'captured' && linkId) {
      const capturedAmountMinor = attempt.data.amountMinor;
      void (async () => {
        await queryClient.invalidateQueries({ queryKey: paymentKeys.publicLink(linkId) });
        setLastPaymentMinor(capturedAmountMinor);
        setActiveAttempt(undefined);
        setAmount('');
      })();
    }
  }, [attempt.data, linkId]);

  const confirm = useMutation({
    mutationFn: (variables: Parameters<typeof paymentsApi.confirmAttempt>) =>
      paymentsApi.confirmAttempt(...variables),
  });
  const create = useMutation({
    mutationFn: (amountMinor: number) => paymentsApi.createPublicAttempt(linkId ?? '', amountMinor),
    onSuccess: async (created) => {
      setActiveAttempt(created);
      await runCheckout(created);
    },
  });

  const runCheckout = async (created: PaymentAttemptResponse) => {
    const result = await openRazorpayCheckout(created);
    if (result === 'dismissed' || result === 'failed') return;
    const updated = await confirm.mutateAsync([
      created.id,
      {
        razorpayOrderId: result.razorpay_order_id,
        razorpayPaymentId: result.razorpay_payment_id,
        razorpaySignature: result.razorpay_signature,
      },
    ]);
    setActiveAttempt(updated);
    queryClient.setQueryData(paymentKeys.attempt(updated.id), updated);
    if (updated.status === 'captured' && linkId) {
      await queryClient.invalidateQueries({ queryKey: paymentKeys.publicLink(linkId) });
    }
  };

  if (token && (exchange.isIdle || exchange.isPending)) return <PublicLoading />;
  const error = exchange.error ?? summary.error ?? create.error ?? confirm.error;
  if (error && !summary.data) {
    const message =
      error instanceof ApiClientError ? error.message : 'This payment link is unavailable.';
    return <PublicError message={message} />;
  }
  if (!summary.data) return <PublicLoading />;

  const data = summary.data;
  if (data.status === 'paid') {
    return (
      <PublicLayout>
        <Card className="w-full max-w-lg text-center">
          <CardContent className="p-8 sm:p-10">
            <span className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600">
              <CheckCircle2 className="size-7" aria-hidden="true" />
            </span>
            <h1 className="mt-5 text-2xl font-bold text-slate-950">Payment complete</h1>
            <p className="mt-2 text-sm text-slate-500">
              {data.orderNumber} has no outstanding balance.
            </p>
            <Alert variant="warning" className="mt-6 text-left">
              This was a Razorpay Test Mode transaction. No real money moved.
            </Alert>
          </CardContent>
        </Card>
      </PublicLayout>
    );
  }

  let amountMinor: number | undefined;
  let amountError = '';
  try {
    amountMinor = parseMoneyToMinor(amount);
    if (amountMinor < 100) amountError = 'Enter at least ₹1.';
    else if (amountMinor > data.amountDueMinor)
      amountError = 'Amount exceeds the outstanding balance.';
  } catch {
    if (amount) amountError = 'Enter a valid amount.';
  }
  const active = activeAttempt && ['creating', 'pending'].includes(activeAttempt.status);
  const actionError =
    error instanceof ApiClientError
      ? error.message
      : error
        ? 'The test checkout could not be completed.'
        : '';
  const attemptMessage =
    activeAttempt?.status === 'failed'
      ? 'The test payment failed. No amount was recorded; you can try again now.'
      : activeAttempt?.status === 'expired'
        ? 'The checkout expired. Start a new test payment to continue.'
        : activeAttempt?.status === 'needs_review'
          ? 'This test payment needs review. Please contact the order owner before retrying.'
          : activeAttempt?.status === 'cancelled'
            ? 'The checkout was cancelled. You can start a new test payment.'
            : '';

  return (
    <PublicLayout>
      <Card className="w-full max-w-xl overflow-hidden">
        <CardHeader className="border-b border-slate-200 bg-slate-50/70 p-5 sm:p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-blue-600">
                Payment request
              </p>
              <CardTitle className="mt-1">{data.orderNumber}</CardTitle>
              <p className="mt-1 text-sm text-slate-500">For {data.customerLabel}</p>
            </div>
            <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-800">
              TEST
            </span>
          </div>
        </CardHeader>
        <CardContent className="space-y-5 p-5 sm:p-6">
          <Alert variant="warning">Demo checkout only — no real money will be charged.</Alert>
          {lastPaymentMinor ? (
            <Alert variant="success">
              {formatInr(lastPaymentMinor)} test payment was recorded. You can make another partial
              payment toward the remaining balance.
            </Alert>
          ) : null}
          {actionError ? <Alert variant="danger">{actionError}</Alert> : null}
          {attemptMessage ? <Alert variant="danger">{attemptMessage}</Alert> : null}
          <dl className="grid grid-cols-3 gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 text-center">
            <Amount label="Order total" value={formatInr(data.orderTotalMinor)} />
            <Amount label="Paid" value={formatInr(data.amountPaidMinor)} />
            <Amount label="Due" value={formatInr(data.amountDueMinor)} strong />
          </dl>
          {active ? (
            <div className="space-y-3">
              <Alert>
                A {formatInr(activeAttempt.amountMinor)} checkout is reserved until{' '}
                {new Date(activeAttempt.expiresAt).toLocaleTimeString()}.
              </Alert>
              <Button className="w-full" onClick={() => void runCheckout(activeAttempt)}>
                <CreditCard aria-hidden="true" /> Resume test checkout
              </Button>
            </div>
          ) : (
            <Field>
              <FieldLabel htmlFor="public-payment-amount">Amount to pay</FieldLabel>
              <InputGroup>
                <InputGroupAddon aria-hidden="true">₹</InputGroupAddon>
                <InputGroupInput
                  id="public-payment-amount"
                  value={amount}
                  onChange={(event) => setAmount(event.target.value)}
                  inputMode="decimal"
                  placeholder="0.00"
                  aria-invalid={Boolean(amountError)}
                  aria-describedby="public-payment-error public-payment-help"
                />
              </InputGroup>
              <FieldError id="public-payment-error">{amountError}</FieldError>
              <FieldDescription id="public-payment-help">
                <button
                  type="button"
                  className="font-semibold text-blue-600 hover:underline"
                  onClick={() => setAmount(minorToInput(data.amountDueMinor))}
                >
                  Pay full balance
                </button>
              </FieldDescription>
            </Field>
          )}
          {!active ? (
            <Button
              className="w-full"
              disabled={
                !amountMinor || Boolean(amountError) || create.isPending || confirm.isPending
              }
              onClick={() => amountMinor && create.mutate(amountMinor)}
            >
              {create.isPending || confirm.isPending ? (
                <Spinner label="Opening test checkout…" />
              ) : (
                <>
                  <CreditCard aria-hidden="true" /> Pay securely in test mode
                </>
              )}
            </Button>
          ) : null}
          <p className="flex items-center justify-center gap-2 text-xs text-slate-500">
            <ShieldCheck className="size-4 text-emerald-600" aria-hidden="true" />
            Checkout is securely handled by Razorpay.
          </p>
        </CardContent>
      </Card>
    </PublicLayout>
  );
}

function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen bg-slate-100 px-4 py-8 sm:py-12">
      <div className="mx-auto mb-6 flex max-w-xl items-center justify-center gap-3">
        <BrandMark className="size-10" />
        <div>
          <p className="font-bold text-slate-950">SettleFlow</p>
          <p className="text-xs text-slate-500">Secure payment request</p>
        </div>
      </div>
      <div className="mx-auto flex max-w-xl justify-center">{children}</div>
    </main>
  );
}

function Amount({ label, strong, value }: { label: string; strong?: boolean; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] font-medium text-slate-500">{label}</dt>
      <dd
        className={`mt-1 truncate text-sm tabular-nums ${strong ? 'font-bold text-slate-950' : 'font-semibold text-slate-700'}`}
      >
        {value}
      </dd>
    </div>
  );
}

function PublicLoading() {
  return (
    <PublicLayout>
      <Card className="w-full max-w-xl p-6">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="mt-6 h-24 w-full" />
        <Skeleton className="mt-5 h-11 w-full" />
      </Card>
    </PublicLayout>
  );
}

function PublicError({ message }: { message: string }) {
  return (
    <PublicLayout>
      <Card className="w-full max-w-lg p-6 text-center">
        <h1 className="text-xl font-bold text-slate-950">Payment link unavailable</h1>
        <Alert variant="danger" className="mt-4 text-left">
          {message}
        </Alert>
      </Card>
    </PublicLayout>
  );
}
