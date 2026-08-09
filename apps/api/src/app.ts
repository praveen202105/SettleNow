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
import { customersRouter } from './routes/customers.js';
import { exportsRouter } from './routes/exports.js';
import { healthRouter } from './routes/health.js';
import { ordersRouter } from './routes/orders.js';
import {
  createOwnerPaymentRouter,
  createPaymentAttemptsRouter,
  createPaymentsRouter,
} from './routes/payments.js';
import { createPublicPaymentsRouter } from './routes/publicPayments.js';
import { razorpayWebhookHandler } from './routes/paymentWebhooks.js';
import type { PaymentProvider } from './services/razorpay.js';

export interface AppOptions extends AuthRouterOptions {
  paymentProvider?: PaymentProvider;
}

export function createApp(options: AppOptions = {}) {
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
          const headers = { ...serialized.headers };
          const referer = headers.referer;
          if (typeof referer === 'string') {
            try {
              const parsed = new URL(referer);
              if (parsed.pathname.startsWith('/pay/')) {
                headers.referer = `${parsed.origin}/pay/[redacted]`;
              }
            } catch {
              if (referer.includes('/pay/')) headers.referer = '[redacted-payment-link]';
            }
          }
          if (serialized.url?.startsWith('/api/v1/auth/google/callback')) {
            return { ...serialized, headers, url: '/api/v1/auth/google/callback' };
          }
          if (serialized.url?.startsWith('/pay/')) {
            return { ...serialized, headers, url: '/pay/[redacted]' };
          }
          return { ...serialized, headers };
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
                connectSrc: ["'self'", 'https://api.razorpay.com', 'https://*.razorpay.com'],
                frameSrc: ["'self'", 'https://api.razorpay.com', 'https://*.razorpay.com'],
                imgSrc: ["'self'", 'data:', 'https://*.razorpay.com'],
                scriptSrc: ["'self'", 'https://checkout.razorpay.com'],
                styleSrc: ["'self'", "'unsafe-inline'"],
              },
            }
          : false,
    }),
  );
  app.use(compression());
  app.post(
    '/api/v1/webhooks/razorpay',
    express.raw({ limit: '256kb', type: 'application/json' }),
    razorpayWebhookHandler,
  );
  app.use(express.json({ limit: '100kb' }));
  app.use(cookieParser());
  app.use(enforceOrigin);

  const api = express.Router();
  api.use('/health', healthRouter);
  api.use('/auth', createAuthRouter(options));
  api.use('/activity', activityRouter);
  api.use('/customers', customersRouter);
  api.use('/exports', exportsRouter);
  api.use('/payments', createPaymentsRouter());
  api.use('/payment-attempts', createPaymentAttemptsRouter(options.paymentProvider));
  api.use('/public', createPublicPaymentsRouter(options.paymentProvider));
  api.use('/orders', ordersRouter);
  api.use('/orders', createOwnerPaymentRouter(options.paymentProvider));
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
