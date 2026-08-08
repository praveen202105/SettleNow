import { defineConfig } from 'vitest/config';

const databaseUrl =
  process.env.TEST_DATABASE_URL ??
  'postgresql://settleflow:settleflow@localhost:5432/settleflow_test?schema=public';

export default defineConfig({
  test: {
    environment: 'node',
    globals: false,
    include: ['../../tests/integration/api/**/*.test.ts', '../../tests/unit/api/**/*.test.ts'],
    env: {
      APP_ORIGIN: 'http://localhost:5173',
      DATABASE_URL: databaseUrl,
      LOG_LEVEL: 'silent',
      NODE_ENV: 'test',
      REDIS_URL: process.env.TEST_REDIS_URL ?? 'redis://127.0.0.1:6379/15',
      STORAGE_DRIVER: 'local',
      STORAGE_LOCAL_PATH: '../../.local/test-exports',
      EMAIL_ENABLED: 'false',
    },
  },
});
