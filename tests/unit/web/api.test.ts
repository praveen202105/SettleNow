import { afterEach, describe, expect, it, vi } from 'vitest';

import { ApiClientError, apiRequest, apiRequestWithMeta } from '../../../apps/web/src/lib/api';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('apiRequest', () => {
  it('unwraps data and sends cookie credentials', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ data: { id: 'order-1' } }), {
        headers: { 'content-type': 'application/json' },
        status: 200,
      }),
    );

    await expect(apiRequest<{ id: string }>('/orders/order-1')).resolves.toEqual({ id: 'order-1' });
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/v1/orders/order-1',
      expect.objectContaining({ credentials: 'include' }),
    );
  });

  it('preserves structured API error details', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          error: {
            code: 'PAYMENT_EXCEEDS_BALANCE',
            message: 'Payment exceeds the outstanding balance.',
            maxAllowedMinor: 60_000,
          },
        }),
        { headers: { 'content-type': 'application/json' }, status: 409 },
      ),
    );

    const error = await apiRequest('/orders/order-1/payments').catch((reason: unknown) => reason);
    expect(error).toBeInstanceOf(ApiClientError);
    expect(error).toMatchObject({
      status: 409,
      code: 'PAYMENT_EXCEEDS_BALANCE',
      details: { maxAllowedMinor: 60_000 },
    });
  });
});

describe('apiRequestWithMeta', () => {
  it('keeps pagination metadata', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ data: [], meta: { page: 2, total: 12 } }), { status: 200 }),
    );

    await expect(apiRequestWithMeta('/orders?page=2')).resolves.toEqual({
      data: [],
      meta: { page: 2, total: 12 },
    });
  });
});
