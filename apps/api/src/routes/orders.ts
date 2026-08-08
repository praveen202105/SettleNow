import { Router } from 'express';

import {
  orderInputSchema,
  orderListQuerySchema,
  paymentInputSchema,
  type ApiSuccess,
  type OrderListItem,
  type OrderResponse,
  type PaginationMeta,
} from '@settleflow/shared';

import { requireAuth } from '../auth/middleware.js';
import { AppError } from '../http/errors.js';
import { requestId } from '../http/request.js';
import {
  createOrder,
  deleteOrder,
  getOrder,
  getOrderSummary,
  listOrders,
  recordPayment,
  updateOrder,
} from '../services/orders.js';

export const ordersRouter = Router();

ordersRouter.use(requireAuth);

function userId(request: Express.Request): string {
  const id = request.auth?.userId;
  if (!id) throw new AppError(401, 'AUTH_REQUIRED', 'Sign in to continue.');
  return id;
}

ordersRouter.get('/', async (request, response) => {
  const query = orderListQuerySchema.parse(request.query);
  const result = await listOrders(userId(request), query);
  const body: ApiSuccess<OrderListItem[], PaginationMeta> = result;
  response.json(body);
});

ordersRouter.get('/summary', async (request, response) => {
  response.json({ data: await getOrderSummary(userId(request)) });
});

ordersRouter.post('/', async (request, response) => {
  const input = orderInputSchema.parse(request.body);
  const body: ApiSuccess<OrderResponse> = {
    data: await createOrder(userId(request), input, requestId(request)),
  };
  response.status(201).json(body);
});

ordersRouter.get('/:id', async (request, response) => {
  response.json({ data: await getOrder(userId(request), request.params.id) });
});

ordersRouter.patch('/:id', async (request, response) => {
  const input = orderInputSchema.parse(request.body);
  response.json({
    data: await updateOrder(userId(request), request.params.id, input, requestId(request)),
  });
});

ordersRouter.delete('/:id', async (request, response) => {
  response.json({
    data: await deleteOrder(userId(request), request.params.id, requestId(request)),
  });
});

ordersRouter.post('/:id/payments', async (request, response) => {
  const input = paymentInputSchema.parse(request.body);
  response.status(201).json({
    data: await recordPayment(userId(request), request.params.id, input, requestId(request)),
  });
});
