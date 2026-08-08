import { createReadStream } from 'node:fs';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';

import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';

import { env } from '../config/env.js';

let s3Client: S3Client | undefined;

function client(): S3Client {
  s3Client ??= new S3Client({
    forcePathStyle: env.AWS_FORCE_PATH_STYLE,
    region: env.AWS_DEFAULT_REGION,
    ...(env.AWS_ACCESS_KEY_ID && env.AWS_SECRET_ACCESS_KEY
      ? {
          credentials: {
            accessKeyId: env.AWS_ACCESS_KEY_ID,
            secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
          },
        }
      : {}),
    ...(env.AWS_ENDPOINT_URL ? { endpoint: env.AWS_ENDPOINT_URL } : {}),
  });
  return s3Client;
}

function localPath(key: string): string {
  if (!/^[a-zA-Z0-9/_-]+\.csv$/.test(key) || key.includes('..')) {
    throw new Error('Invalid storage object key.');
  }
  return path.resolve(env.STORAGE_LOCAL_PATH, key);
}

export async function putExportObject(key: string, content: string): Promise<void> {
  if (env.STORAGE_DRIVER === 'local') {
    const target = localPath(key);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, content, 'utf8');
    return;
  }

  await client().send(
    new PutObjectCommand({
      Body: content,
      Bucket: env.AWS_S3_BUCKET_NAME!,
      ContentType: 'text/csv; charset=utf-8',
      Key: key,
    }),
  );
}

export async function getExportObject(key: string): Promise<Readable> {
  if (env.STORAGE_DRIVER === 'local') return createReadStream(localPath(key));
  const result = await client().send(
    new GetObjectCommand({ Bucket: env.AWS_S3_BUCKET_NAME!, Key: key }),
  );
  if (!result.Body) throw new Error('Export object has no body.');
  if (result.Body instanceof Readable) return result.Body;
  return Readable.fromWeb(result.Body.transformToWebStream() as never);
}

export async function deleteExportObject(key: string): Promise<void> {
  if (env.STORAGE_DRIVER === 'local') {
    await rm(localPath(key), { force: true });
    return;
  }
  await client().send(new DeleteObjectCommand({ Bucket: env.AWS_S3_BUCKET_NAME!, Key: key }));
}
