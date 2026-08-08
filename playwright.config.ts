import { defineConfig, devices } from '@playwright/test';

const databaseUrl =
  process.env.TEST_DATABASE_URL ??
  'postgresql://settleflow:settleflow@127.0.0.1:5432/settleflow_test?schema=public';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['html', { open: 'never' }], ['github']] : 'list',
  use: {
    baseURL: 'http://127.0.0.1:5173',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  webServer: [
    {
      command: 'pnpm --filter @settleflow/api dev',
      env: {
        APP_ORIGIN: 'http://127.0.0.1:5173',
        DATABASE_URL: databaseUrl,
        LOG_LEVEL: 'warn',
        NODE_ENV: 'test',
        PORT: '3000',
        REDIS_URL: process.env.TEST_REDIS_URL ?? 'redis://127.0.0.1:6379/14',
        STORAGE_DRIVER: 'local',
        STORAGE_LOCAL_PATH: '.local/e2e-exports',
        EMAIL_ENABLED: 'false',
      },
      port: 3000,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
    {
      command: 'pnpm --filter @settleflow/api dev:worker',
      env: {
        APP_ORIGIN: 'http://127.0.0.1:5173',
        DATABASE_URL: databaseUrl,
        LOG_LEVEL: 'warn',
        NODE_ENV: 'test',
        REDIS_URL: process.env.TEST_REDIS_URL ?? 'redis://127.0.0.1:6379/14',
        STORAGE_DRIVER: 'local',
        STORAGE_LOCAL_PATH: '.local/e2e-exports',
        EMAIL_ENABLED: 'false',
        WORKER_PORT: '3001',
      },
      port: 3001,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
    {
      command: 'pnpm --filter @settleflow/web dev --host 127.0.0.1',
      port: 5173,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
  ],
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
