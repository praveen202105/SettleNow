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
});
