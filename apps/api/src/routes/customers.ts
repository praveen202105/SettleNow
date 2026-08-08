import { Router } from 'express';

import {
  customerInputSchema,
  customerListQuerySchema,
  type ApiSuccess,
  type CustomerResponse,
} from '@settleflow/shared';

import { requireAuth } from '../auth/middleware.js';
import { AppError } from '../http/errors.js';
import { requestId } from '../http/request.js';
import { createCustomer, listCustomers } from '../services/customers.js';

export const customersRouter = Router();
customersRouter.use(requireAuth);

function userId(request: Express.Request): string {
  const id = request.auth?.userId;
  if (!id) throw new AppError(401, 'AUTH_REQUIRED', 'Sign in to continue.');
  return id;
}

customersRouter.get('/', async (request, response) => {
  response.json(await listCustomers(userId(request), customerListQuerySchema.parse(request.query)));
});

customersRouter.post('/', async (request, response) => {
  const input = customerInputSchema.parse(request.body);
  const body: ApiSuccess<CustomerResponse> = {
    data: await createCustomer(userId(request), input, requestId(request)),
  };
  response.status(201).json(body);
});
