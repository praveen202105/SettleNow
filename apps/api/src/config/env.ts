import 'dotenv/config';

import { z } from 'zod';

const booleanFromString = z.preprocess((value) => {
  if (typeof value === 'boolean') return value;
  if (typeof value !== 'string') return value;
  return value.toLowerCase() === 'true';
}, z.boolean());

const optionalString = z.preprocess(
  (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
  z.string().min(1).optional(),
);

const optionalUrl = z.preprocess(
  (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
  z.string().url().optional(),
);

const envSchema = z
  .object({
    APP_ORIGIN: z.string().url().default('http://localhost:5173'),
    AUTH_RATE_LIMIT_MAX: z.coerce.number().int().min(1).default(20),
    CACHE_TTL_SECONDS: z.coerce.number().int().min(1).max(3600).default(30),
    DATABASE_URL: z.string().min(1),
    EMAIL_ENABLED: booleanFromString.default(false),
    EMAIL_FROM: optionalString,
    LOG_LEVEL: z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
      .default('info'),
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    OUTBOX_POLL_INTERVAL_MS: z.coerce.number().int().min(100).max(60_000).default(1_000),
    PORT: z.coerce.number().int().min(1).max(65_535).default(3000),
    READ_AFTER_WRITE_SECONDS: z.coerce.number().int().min(1).max(300).default(10),
    READ_DATABASE_URL: optionalString,
    REDIS_URL: z.string().min(1).default('redis://127.0.0.1:6379'),
    RESEND_API_KEY: optionalString,
    SESSION_COOKIE_NAME: z.string().min(1).max(64).default('settleflow_session'),
    SESSION_TTL_DAYS: z.coerce.number().int().min(1).max(90).default(7),
    S3_ACCESS_KEY_ID: optionalString,
    S3_BUCKET_NAME: optionalString,
    S3_ENDPOINT_URL: optionalUrl,
    S3_FORCE_PATH_STYLE: booleanFromString.default(false),
    S3_REGION: z.string().min(1).default('auto'),
    S3_SECRET_ACCESS_KEY: optionalString,
    STORAGE_DRIVER: z.enum(['local', 's3']).default('local'),
    STORAGE_LOCAL_PATH: z.string().min(1).default('.local/exports'),
    TRUST_PROXY: booleanFromString.default(false),
    WORKER_PORT: z.coerce.number().int().min(1).max(65_535).default(3001),
    RAILWAY_REPLICA_ID: optionalString,
    RAILWAY_REPLICA_REGION: optionalString,
  })
  .superRefine((value, context) => {
    if (value.EMAIL_ENABLED && (!value.RESEND_API_KEY || !value.EMAIL_FROM)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'RESEND_API_KEY and EMAIL_FROM are required when EMAIL_ENABLED=true.',
        path: ['EMAIL_ENABLED'],
      });
    }

    if (
      value.STORAGE_DRIVER === 's3' &&
      (!value.S3_BUCKET_NAME || !value.S3_ACCESS_KEY_ID || !value.S3_SECRET_ACCESS_KEY)
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'S3 bucket and credentials are required when STORAGE_DRIVER=s3.',
        path: ['STORAGE_DRIVER'],
      });
    }
  });

export function parseEnvironment(environment: NodeJS.ProcessEnv) {
  const result = envSchema.safeParse(environment);

  if (!result.success) {
    const details = result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`);
    throw new Error(`Invalid environment configuration:\n${details.join('\n')}`);
  }

  return result.data;
}

export const env = parseEnvironment(process.env);
