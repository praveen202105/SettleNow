import type { PaymentAttemptResponse } from '@settleflow/shared';

interface RazorpaySuccess {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
}

interface RazorpayInstance {
  on(event: 'payment.failed', handler: () => void): void;
  open(): void;
}

interface RazorpayConstructor {
  new (options: Record<string, unknown>): RazorpayInstance;
}

declare global {
  interface Window {
    Razorpay?: RazorpayConstructor;
  }
}

let loader: Promise<void> | undefined;

function loadCheckout(): Promise<void> {
  if (window.Razorpay) return Promise.resolve();
  if (loader) return loader;
  loader = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Razorpay Checkout could not be loaded.'));
    document.head.append(script);
  });
  return loader;
}

export async function openRazorpayCheckout(
  attempt: PaymentAttemptResponse,
): Promise<RazorpaySuccess | 'dismissed' | 'failed'> {
  if (!attempt.checkout) throw new Error('Checkout details are unavailable.');
  const checkoutDetails = attempt.checkout;
  await loadCheckout();
  const Razorpay = window.Razorpay;
  if (!Razorpay) throw new Error('Razorpay Checkout could not be loaded.');

  return new Promise((resolve) => {
    let settled = false;
    const finish = (value: RazorpaySuccess | 'dismissed' | 'failed') => {
      if (settled) return;
      settled = true;
      resolve(value);
    };
    const checkout = new Razorpay({
      amount: attempt.amountMinor,
      currency: attempt.currency,
      description: checkoutDetails.description,
      handler: (result: RazorpaySuccess) => finish(result),
      hidden: { email: true },
      key: checkoutDetails.keyId,
      modal: {
        confirm_close: true,
        ondismiss: () => finish('dismissed'),
      },
      name: 'SettleFlow',
      order_id: checkoutDetails.orderId,
      prefill: {
        contact: checkoutDetails.contact ?? undefined,
        name: checkoutDetails.customerName,
      },
      readonly: { contact: Boolean(checkoutDetails.contact), name: true },
      retry: { enabled: true },
      theme: { color: '#2563eb' },
      timeout: checkoutDetails.timeoutSeconds,
    });
    checkout.on('payment.failed', () => finish('failed'));
    checkout.open();
  });
}
