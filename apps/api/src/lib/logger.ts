import pino from 'pino';

import { env } from '../config/env.js';

export const logger = pino({
  base: {
    service: process.env.RAILWAY_SERVICE_NAME ?? 'settleflow',
    replicaId: env.RAILWAY_REPLICA_ID,
    replicaRegion: env.RAILWAY_REPLICA_REGION,
  },
  level: env.LOG_LEVEL,
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'res.headers.set-cookie',
      '*.password',
      '*.token',
    ],
    censor: '[Redacted]',
  },
});
