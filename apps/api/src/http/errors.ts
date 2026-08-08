import type { ErrorRequestHandler, RequestHandler } from 'express';
import { Prisma } from '@prisma/client';
import { ZodError } from 'zod';

import type { ApiErrorBody } from '@settleflow/shared';

import { logger } from '../lib/logger.js';

export class AppError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export const notFoundHandler: RequestHandler = (request, _response, next) => {
  next(
    new AppError(404, 'ROUTE_NOT_FOUND', `No route exists for ${request.method} ${request.path}.`),
  );
};

export const errorHandler: ErrorRequestHandler = (error, request, response, _next) => {
  let appError: AppError;

  if (error instanceof AppError) {
    appError = error;
  } else if (error instanceof ZodError) {
    const fieldErrors = error.flatten().fieldErrors;
    appError = new AppError(422, 'VALIDATION_ERROR', 'The request contains invalid values.', {
      fieldErrors,
    });
  } else if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
    appError = new AppError(409, 'CONFLICT', 'A record with this value already exists.');
  } else if (error instanceof SyntaxError && 'body' in error) {
    appError = new AppError(400, 'INVALID_JSON', 'The request body is not valid JSON.');
  } else {
    logger.error({ err: error, requestId: request.id }, 'Unhandled request error');
    appError = new AppError(500, 'INTERNAL_ERROR', 'An unexpected error occurred.');
  }

  const body: ApiErrorBody = {
    error: {
      code: appError.code,
      message: appError.message,
      ...(typeof request.id === 'string' ? { requestId: request.id } : {}),
      ...appError.details,
    },
  };

  response.status(appError.status).json(body);
};
