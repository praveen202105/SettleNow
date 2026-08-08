import type { ApiErrorBody, ApiSuccess } from '@settleflow/shared';

export class ApiClientError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details: ApiErrorBody['error'],
  ) {
    super(message);
    this.name = 'ApiClientError';
  }
}

export async function apiRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers);
  if (options.body && !headers.has('content-type')) headers.set('content-type', 'application/json');

  const response = await fetch(`/api/v1${path}`, {
    ...options,
    credentials: 'include',
    headers,
  });

  if (!response.ok) {
    let body: ApiErrorBody | undefined;
    try {
      body = (await response.json()) as ApiErrorBody;
    } catch {
      // A proxy or network layer can return a non-JSON error page.
    }

    const error = body?.error;
    throw new ApiClientError(
      response.status,
      error?.code ?? 'REQUEST_FAILED',
      error?.message ?? 'The request could not be completed.',
      error ?? { code: 'REQUEST_FAILED', message: 'The request could not be completed.' },
    );
  }

  if (response.status === 204) return undefined as T;
  const body = (await response.json()) as ApiSuccess<T>;
  return body.data;
}

export async function apiRequestWithMeta<T, M>(
  path: string,
  options: RequestInit = {},
): Promise<{ data: T; meta: M }> {
  const response = await fetch(`/api/v1${path}`, {
    ...options,
    credentials: 'include',
    headers: { 'content-type': 'application/json', ...options.headers },
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => undefined)) as ApiErrorBody | undefined;
    const error = body?.error;
    throw new ApiClientError(
      response.status,
      error?.code ?? 'REQUEST_FAILED',
      error?.message ?? 'The request could not be completed.',
      error ?? { code: 'REQUEST_FAILED', message: 'The request could not be completed.' },
    );
  }

  return (await response.json()) as { data: T; meta: M };
}
