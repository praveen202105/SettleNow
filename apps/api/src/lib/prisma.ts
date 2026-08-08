import { PrismaClient } from '@prisma/client';

import { env } from '../config/env.js';

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };
const globalForReadPrisma = globalThis as unknown as { readPrisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });

if (env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

export const readPrisma =
  !env.READ_DATABASE_URL || env.READ_DATABASE_URL === env.DATABASE_URL
    ? prisma
    : (globalForReadPrisma.readPrisma ??
      new PrismaClient({
        datasourceUrl: env.READ_DATABASE_URL,
        log: env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
      }));

if (env.NODE_ENV !== 'production' && readPrisma !== prisma) {
  globalForReadPrisma.readPrisma = readPrisma;
}

export async function disconnectPrisma(): Promise<void> {
  await Promise.all([
    prisma.$disconnect(),
    ...(readPrisma === prisma ? [] : [readPrisma.$disconnect()]),
  ]);
}
