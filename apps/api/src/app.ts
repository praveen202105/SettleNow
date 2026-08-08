import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import type { IncomingMessage } from 'node:http';
import path from 'node:path';

import compression from 'compression';
import cookieParser from 'cookie-parser';
import express from 'express';
import helmet from 'helmet';
import { stdSerializers } from 'pino';
import { pinoHttp } from 'pino-http';

import { enforceOrigin } from './auth/middleware.js';
import { env } from './config/env.js';
import { errorHandler, notFoundHandler } from './http/errors.js';
import { logger } from './lib/logger.js';
import { createAuthRouter, type AuthRouterOptions } from './routes/auth.js';
import { activityRouter } from './routes/activity.js';
import { exportsRouter } from './routes/exports.js';
import { healthRouter } from './routes/health.js';
import { ordersRouter } from './routes/orders.js';

export function createApp(options: AuthRouterOptions = {}) {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', env.TRUST_PROXY ? 1 : false);

  app.use(
    pinoHttp({
      logger,
      genReqId(request, response) {
        const provided = request.headers['x-request-id'];
        const id = typeof provided === 'string' && provided.length <= 128 ? provided : randomUUID();
        response.setHeader('x-request-id', id);
        return id;
      },
      serializers: {
        req(request: IncomingMessage) {
          const serialized = stdSerializers.req(request);
          if (serialized.url?.startsWith('/api/v1/auth/google/callback')) {
            return { ...serialized, url: '/api/v1/auth/google/callback' };
          }
          return serialized;
        },
      },
    }),
  );
  app.use(
    helmet({
      contentSecurityPolicy:
        env.NODE_ENV === 'production'
          ? {
              directives: {
                defaultSrc: ["'self'"],
                imgSrc: ["'self'", 'data:'],
                scriptSrc: ["'self'"],
                styleSrc: ["'self'", "'unsafe-inline'"],
              },
            }
          : false,
    }),
  );
  app.use(compression());
  app.use(express.json({ limit: '100kb' }));
  app.use(cookieParser());
  app.use(enforceOrigin);

  const api = express.Router();
  api.use('/health', healthRouter);
  api.use('/auth', createAuthRouter(options));
  api.use('/activity', activityRouter);
  api.use('/exports', exportsRouter);
  api.use('/orders', ordersRouter);
  app.use('/api/v1', api);

  if (env.NODE_ENV === 'production') {
    const webDirectory = path.resolve(import.meta.dirname, '../../web/dist');
    const indexFile = path.join(webDirectory, 'index.html');

    if (existsSync(indexFile)) {
      app.use(express.static(webDirectory, { index: false, maxAge: '1y', immutable: true }));
      app.use((request, response, next) => {
        if (request.method === 'GET' && !request.path.startsWith('/api/')) {
          response.sendFile(indexFile);
          return;
        }
        next();
      });
    } else {
      logger.warn({ webDirectory }, 'Web build was not found; API-only mode is active');
    }
  }

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
