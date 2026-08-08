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
});
