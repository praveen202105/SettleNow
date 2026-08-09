import { describe, expect, it } from 'vitest';

import { parseEnvironment } from '../../../apps/api/src/config/env.js';

const databaseUrl = 'postgresql://settleflow:settleflow@localhost:5432/settleflow_test';

describe('environment configuration', () => {
  it('parses provider-neutral S3 variables with safe defaults', () => {
    const result = parseEnvironment({
      DATABASE_URL: databaseUrl,
      S3_ACCESS_KEY_ID: 'access-key',
      S3_BUCKET_NAME: 'settleflow-exports',
      S3_ENDPOINT_URL: 'https://storage.example.com',
      S3_SECRET_ACCESS_KEY: 'secret-key',
      STORAGE_DRIVER: 's3',
    });

    expect(result).toMatchObject({
      S3_FORCE_PATH_STYLE: false,
      S3_REGION: 'auto',
      STORAGE_DRIVER: 's3',
    });
  });

  it('requires a bucket and credentials for S3 storage', () => {
    expect(() =>
      parseEnvironment({
        DATABASE_URL: databaseUrl,
        STORAGE_DRIVER: 's3',
      }),
    ).toThrow('S3 bucket and credentials are required when STORAGE_DRIVER=s3.');
  });

  it('does not accept legacy AWS-prefixed variables as S3 configuration', () => {
    expect(() =>
      parseEnvironment({
        AWS_ACCESS_KEY_ID: 'legacy-access-key',
        AWS_S3_BUCKET_NAME: 'legacy-bucket',
        AWS_SECRET_ACCESS_KEY: 'legacy-secret-key',
        DATABASE_URL: databaseUrl,
        STORAGE_DRIVER: 's3',
      }),
    ).toThrow('S3 bucket and credentials are required when STORAGE_DRIVER=s3.');
  });

  it('requires Google credentials when Google authentication is enabled', () => {
    expect(() =>
      parseEnvironment({
        DATABASE_URL: databaseUrl,
        GOOGLE_AUTH_ENABLED: 'true',
      }),
    ).toThrow(
      'GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are required when GOOGLE_AUTH_ENABLED=true.',
    );

    expect(
      parseEnvironment({
        DATABASE_URL: databaseUrl,
        GOOGLE_AUTH_ENABLED: 'true',
        GOOGLE_CLIENT_ID: 'client-id',
        GOOGLE_CLIENT_SECRET: 'client-secret',
      }),
    ).toMatchObject({
      GOOGLE_AUTH_ENABLED: true,
      GOOGLE_OIDC_ISSUER: 'https://accounts.google.com',
    });
  });

  it('requires complete Razorpay Test Mode credentials only when online payments are enabled', () => {
    expect(() =>
      parseEnvironment({
        DATABASE_URL: databaseUrl,
        PAYMENTS_ENABLED: 'true',
      }),
    ).toThrow(
      'RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET and RAZORPAY_WEBHOOK_SECRET are required when PAYMENTS_ENABLED=true.',
    );

    expect(
      parseEnvironment({
        DATABASE_URL: databaseUrl,
        PAYMENTS_ENABLED: 'true',
        RAZORPAY_KEY_ID: 'rzp_test_settleflow',
        RAZORPAY_KEY_SECRET: 'test_checkout_secret',
        RAZORPAY_WEBHOOK_SECRET: 'test_webhook_secret',
      }),
    ).toMatchObject({
      PAYMENT_CURRENCY: 'INR',
      PAYMENT_MODE: 'test',
      PAYMENT_PROVIDER: 'razorpay',
      PAYMENTS_ENABLED: true,
    });
  });

  it('does not allow the fake Razorpay adapter outside isolated tests', () => {
    expect(() =>
      parseEnvironment({
        DATABASE_URL: databaseUrl,
        NODE_ENV: 'production',
        RAZORPAY_FAKE_PROVIDER: 'true',
      }),
    ).toThrow('The fake Razorpay provider is allowed only when NODE_ENV=test.');
  });

  it('allows a non-Google OIDC issuer only for isolated tests', () => {
    expect(() =>
      parseEnvironment({
        DATABASE_URL: databaseUrl,
        GOOGLE_OIDC_ISSUER: 'http://127.0.0.1:4010',
        NODE_ENV: 'production',
      }),
    ).toThrow('A custom Google OIDC issuer is allowed only when NODE_ENV=test.');

    expect(
      parseEnvironment({
        DATABASE_URL: databaseUrl,
        GOOGLE_OIDC_ISSUER: 'http://127.0.0.1:4010',
        NODE_ENV: 'test',
      }).GOOGLE_OIDC_ISSUER,
    ).toBe('http://127.0.0.1:4010');
  });

  it('requires complete Gmail API credentials only when email is enabled', () => {
    expect(() =>
      parseEnvironment({
        DATABASE_URL: databaseUrl,
        EMAIL_ENABLED: 'true',
        EMAIL_FROM: 'SettleFlow <coderpraveengupta@gmail.com>',
      }),
    ).toThrow(
      'GMAIL_API_CLIENT_ID, GMAIL_API_CLIENT_SECRET, GMAIL_API_REFRESH_TOKEN, GMAIL_API_SENDER and EMAIL_FROM are required when EMAIL_ENABLED=true.',
    );

    expect(
      parseEnvironment({
        DATABASE_URL: databaseUrl,
        EMAIL_ENABLED: 'true',
        EMAIL_FROM: 'SettleFlow <coderpraveengupta@gmail.com>',
        GMAIL_API_CLIENT_ID: 'client-id',
        GMAIL_API_CLIENT_SECRET: 'client-secret',
        GMAIL_API_REFRESH_TOKEN: 'refresh-token',
        GMAIL_API_SENDER: 'coderpraveengupta@gmail.com',
      }),
    ).toMatchObject({
      EMAIL_ENABLED: true,
      GMAIL_API_SENDER: 'coderpraveengupta@gmail.com',
    });
  });

  it('requires the configured From address to match the authorized Gmail sender', () => {
    expect(() =>
      parseEnvironment({
        DATABASE_URL: databaseUrl,
        EMAIL_ENABLED: 'true',
        EMAIL_FROM: 'SettleFlow <different@example.com>',
        GMAIL_API_CLIENT_ID: 'client-id',
        GMAIL_API_CLIENT_SECRET: 'client-secret',
        GMAIL_API_REFRESH_TOKEN: 'refresh-token',
        GMAIL_API_SENDER: 'coderpraveengupta@gmail.com',
      }),
    ).toThrow('EMAIL_FROM address must match GMAIL_API_SENDER.');
  });
});
