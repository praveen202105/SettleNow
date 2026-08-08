import type { Request } from 'express';

export function requestId(request: Request): string | undefined {
  return typeof request.id === 'string' ? request.id : undefined;
}
