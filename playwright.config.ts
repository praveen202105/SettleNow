import { defineConfig, devices } from '@playwright/test';

const databaseUrl =
  process.env.TEST_DATABASE_URL ??
  'postgresql://settleflow:settleflow@127.0.0.1:5432/settleflow_test?schema=public';
const apiPort = Number(process.env.TEST_API_PORT ?? 3000);
const workerPort = Number(process.env.TEST_WORKER_PORT ?? 3001);
const webPort = Number(process.env.TEST_WEB_PORT ?? 5173);
const googlePort = Number(process.env.TEST_GOOGLE_PORT ?? 4010);
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
      command: 'pnpm --filter @settleflow/api exec tsx ../../tests/fixtures/google-oidc-server.ts',
      env: { TEST_GOOGLE_PORT: String(googlePort) },
      port: googlePort,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
    {
      command: 'pnpm --filter @settleflow/api exec tsx src/server.ts',
      env: {
        APP_ORIGIN: webOrigin,
        DATABASE_URL: databaseUrl,
        LOG_LEVEL: 'warn',
        NODE_ENV: 'test',
        PAYMENTS_ENABLED: 'true',
        PAYMENT_CURRENCY: 'INR',
        PAYMENT_MODE: 'test',
        PAYMENT_PROVIDER: 'razorpay',
        RAZORPAY_FAKE_PROVIDER: 'true',
        RAZORPAY_KEY_ID: 'rzp_test_settleflow',
        RAZORPAY_KEY_SECRET: 'test_checkout_secret',
        RAZORPAY_WEBHOOK_SECRET: 'test_webhook_secret',
        PORT: String(apiPort),
        REDIS_URL: process.env.TEST_REDIS_URL ?? 'redis://127.0.0.1:6379/14',
        STORAGE_DRIVER: 'local',
        STORAGE_LOCAL_PATH: '.local/e2e-exports',
        EMAIL_ENABLED: 'false',
        GOOGLE_AUTH_ENABLED: 'true',
        GOOGLE_CLIENT_ID: 'settleflow-e2e-client',
        GOOGLE_CLIENT_SECRET: 'settleflow-e2e-secret',
        GOOGLE_OIDC_ISSUER: `http://127.0.0.1:${googlePort}`,
      },
      port: apiPort,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
    {
      command: 'pnpm --filter @settleflow/api exec tsx src/worker.ts',
      env: {
        APP_ORIGIN: webOrigin,
        DATABASE_URL: databaseUrl,
        LOG_LEVEL: 'warn',
        NODE_ENV: 'test',
        PAYMENTS_ENABLED: 'true',
        PAYMENT_CURRENCY: 'INR',
        PAYMENT_MODE: 'test',
        PAYMENT_PROVIDER: 'razorpay',
        RAZORPAY_KEY_ID: 'rzp_test_settleflow',
        RAZORPAY_KEY_SECRET: 'test_checkout_secret',
        RAZORPAY_WEBHOOK_SECRET: 'test_webhook_secret',
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
