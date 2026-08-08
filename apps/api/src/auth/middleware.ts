import type { RequestHandler } from 'express';

import { env } from '../config/env.js';
import { AppError } from '../http/errors.js';
import { getSession, readSessionToken } from './session.js';

export const requireAuth: RequestHandler = async (request, _response, next) => {
  const token = readSessionToken(request);

  if (!token) {
    throw new AppError(401, 'AUTH_REQUIRED', 'Sign in to continue.');
  }

  const session = await getSession(token);

  if (!session) {
    throw new AppError(401, 'SESSION_EXPIRED', 'Your session has expired. Sign in again.');
  }

  request.auth = { sessionId: session.id, userId: session.userId };
  next();
};

export const enforceOrigin: RequestHandler = (request, _response, next) => {
  if (['GET', 'HEAD', 'OPTIONS'].includes(request.method)) {
    next();
    return;
  }

  const origin = request.get('origin');
  if (origin && origin !== env.APP_ORIGIN) {
    throw new AppError(403, 'ORIGIN_NOT_ALLOWED', 'This request origin is not allowed.');
  }

  next();
};
