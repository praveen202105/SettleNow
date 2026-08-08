import { Router } from 'express';

import { activityQuerySchema } from '@settleflow/shared';

import { requireAuth } from '../auth/middleware.js';
import { AppError } from '../http/errors.js';
import { listActivity } from '../services/audit.js';

export const activityRouter = Router();
activityRouter.use(requireAuth);

activityRouter.get('/', async (request, response) => {
  const userId = request.auth?.userId;
  if (!userId) throw new AppError(401, 'AUTH_REQUIRED', 'Sign in to continue.');
  response.json(await listActivity(userId, activityQuerySchema.parse(request.query)));
});
