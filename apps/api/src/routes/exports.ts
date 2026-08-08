import { Router } from 'express';

import { exportListQuerySchema, orderExportInputSchema } from '@settleflow/shared';

import { requireAuth } from '../auth/middleware.js';
import { AppError } from '../http/errors.js';
import { requestId } from '../http/request.js';
import {
  downloadExport,
  getExport,
  listExports,
  requestOrderExport,
  retryOrderExport,
} from '../services/exports.js';

export const exportsRouter = Router();
exportsRouter.use(requireAuth);

function userId(request: Express.Request): string {
  const id = request.auth?.userId;
  if (!id) throw new AppError(401, 'AUTH_REQUIRED', 'Sign in to continue.');
  return id;
}

exportsRouter.post('/orders', async (request, response) => {
  const job = await requestOrderExport(
    userId(request),
    orderExportInputSchema.parse(request.body),
    requestId(request),
  );
  response.status(202).json({ data: job });
});

exportsRouter.get('/', async (request, response) => {
  response.json(await listExports(userId(request), exportListQuerySchema.parse(request.query)));
});

exportsRouter.get('/:id', async (request, response) => {
  response.json({ data: await getExport(userId(request), request.params.id) });
});

exportsRouter.post('/:id/retry', async (request, response) => {
  response.status(202).json({
    data: await retryOrderExport(userId(request), request.params.id, requestId(request)),
  });
});

exportsRouter.get('/:id/download', async (request, response) => {
  const download = await downloadExport(userId(request), request.params.id, requestId(request));
  response.setHeader('content-disposition', `attachment; filename="${download.fileName}"`);
  response.setHeader('content-type', 'text/csv; charset=utf-8');
  download.stream.pipe(response);
});
