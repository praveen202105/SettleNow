import type {
  PaymentAttemptResponse,
  PaymentConfigResponse,
  PaymentLinkResponse,
  PublicPaymentLinkResponse,
} from '@settleflow/shared';

import { apiRequest } from '../../lib/api';

export const paymentKeys = {
  all: ['payments'] as const,
  attempt: (id: string) => ['payments', 'attempt', id] as const,
  config: ['payments', 'config'] as const,
  link: (orderId: string) => ['payments', 'link', orderId] as const,
  publicLink: (id: string) => ['payments', 'public-link', id] as const,
};

export const paymentsApi = {
  config: () => apiRequest<PaymentConfigResponse>('/payments/config'),
  getLink: (orderId: string) =>
    apiRequest<PaymentLinkResponse | null>(`/orders/${orderId}/payment-link`),
  createLink: (orderId: string) =>
    apiRequest<PaymentLinkResponse>(`/orders/${orderId}/payment-link`, { method: 'POST' }),
  revokeLink: (orderId: string) =>
    apiRequest<PaymentLinkResponse>(`/orders/${orderId}/payment-link`, { method: 'DELETE' }),
  createOwnerAttempt: (orderId: string, amountMinor: number) =>
    apiRequest<PaymentAttemptResponse>(`/orders/${orderId}/payment-attempts`, {
      body: JSON.stringify({ amountMinor }),
      method: 'POST',
    }),
  getOwnerAttempt: (id: string) => apiRequest<PaymentAttemptResponse>(`/payment-attempts/${id}`),
  cancelAttempt: (id: string) =>
    apiRequest<PaymentAttemptResponse>(`/payment-attempts/${id}`, { method: 'DELETE' }),
  exchangeLink: (token: string) =>
    apiRequest<PublicPaymentLinkResponse>('/public/payment-links/session', {
      body: JSON.stringify({ token }),
      method: 'POST',
    }),
  getPublicLink: (id: string) =>
    apiRequest<PublicPaymentLinkResponse>(`/public/payment-links/${id}`),
  createPublicAttempt: (linkId: string, amountMinor: number) =>
    apiRequest<PaymentAttemptResponse>(`/public/payment-links/${linkId}/attempts`, {
      body: JSON.stringify({ amountMinor }),
      method: 'POST',
    }),
  getPublicAttempt: (id: string) =>
    apiRequest<PaymentAttemptResponse>(`/public/payment-attempts/${id}`),
  confirmAttempt: (
    id: string,
    input: { razorpayOrderId: string; razorpayPaymentId: string; razorpaySignature: string },
  ) =>
    apiRequest<PaymentAttemptResponse>(`/payment-attempts/${id}/confirm`, {
      body: JSON.stringify(input),
      method: 'POST',
    }),
};
