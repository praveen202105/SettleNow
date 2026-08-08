import { defineConfig, devices } from '@playwright/test';

const databaseUrl =
  process.env.TEST_DATABASE_URL ??
  'postgresql://settleflow:settleflow@127.0.0.1:5432/settleflow_test?schema=public';
const apiPort = Number(process.env.TEST_API_PORT ?? 3000);
const workerPort = Number(process.env.TEST_WORKER_PORT ?? 3001);
const webPort = Number(process.env.TEST_WEB_PORT ?? 5173);
const webOrigin = `http://127.0.0.1:${webPort}`;

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['html', { open: 'never' }], ['github']] : 'list',
  use: {
    baseURL: webOrigin,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  webServer: [
    {
      command: 'pnpm --filter @settleflow/api dev',
      env: {
        APP_ORIGIN: webOrigin,
        DATABASE_URL: databaseUrl,
        LOG_LEVEL: 'warn',
        NODE_ENV: 'test',
        PORT: String(apiPort),
        REDIS_URL: process.env.TEST_REDIS_URL ?? 'redis://127.0.0.1:6379/14',
        STORAGE_DRIVER: 'local',
        STORAGE_LOCAL_PATH: '.local/e2e-exports',
        EMAIL_ENABLED: 'false',
      },
      port: apiPort,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
    {
      command: 'pnpm --filter @settleflow/api dev:worker',
      env: {
        APP_ORIGIN: webOrigin,
        DATABASE_URL: databaseUrl,
        LOG_LEVEL: 'warn',
        NODE_ENV: 'test',
        REDIS_URL: process.env.TEST_REDIS_URL ?? 'redis://127.0.0.1:6379/14',
        STORAGE_DRIVER: 'local',
        STORAGE_LOCAL_PATH: '.local/e2e-exports',
        EMAIL_ENABLED: 'false',
        WORKER_PORT: String(workerPort),
      },
      port: workerPort,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
    {
      command: `pnpm --filter @settleflow/web dev --host 127.0.0.1 --port ${webPort}`,
      env: {
        API_PROXY_TARGET: `http://127.0.0.1:${apiPort}`,
        WEB_PORT: String(webPort),
      },
      port: webPort,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
  ],
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
