import { hash, verify } from '@node-rs/argon2';
import { Prisma } from '@prisma/client';
import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { RedisStore } from 'rate-limit-redis';

import { loginSchema, signupSchema, type UserResponse } from '@settleflow/shared';

import { requireAuth } from '../auth/middleware.js';
import {
  clearSessionCookie,
  createSession,
  deleteSession,
  getSession,
  readSessionToken,
} from '../auth/session.js';
import { env } from '../config/env.js';
import { AppError } from '../http/errors.js';
import { requestId } from '../http/request.js';
import { prisma } from '../lib/prisma.js';
import { redis } from '../lib/redis.js';
import { writeAuditEvent } from '../services/audit.js';

export const authRouter = Router();

const authLimiter = rateLimit({
  legacyHeaders: false,
  limit: env.AUTH_RATE_LIMIT_MAX,
  standardHeaders: 'draft-8',
  windowMs: 15 * 60 * 1_000,
  store: new RedisStore({
    prefix: 'settleflow:rate-limit:auth:',
    sendCommand: (...args: string[]) =>
      redis.call(args[0]!, ...args.slice(1)) as unknown as Promise<
        number | string | Array<number | string>
      >,
  }),
  handler: (_request, response) => {
    response.status(429).json({
      error: {
        code: 'AUTH_RATE_LIMITED',
        message: 'Too many authentication attempts. Try again later.',
      },
    });
  },
});

function presentUser(user: {
  id: string;
  email: string;
  displayName: string;
  createdAt: Date;
}): UserResponse {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    createdAt: user.createdAt.toISOString(),
  };
}

authRouter.post('/signup', authLimiter, async (request, response) => {
  const input = signupSchema.parse(request.body);
  const passwordHash = await hash(input.password, {
    algorithm: 2,
    memoryCost: 19_456,
    parallelism: 1,
    timeCost: 2,
  });

  try {
    const user = await prisma.$transaction(async (transaction) => {
      const created = await transaction.user.create({
        data: {
          displayName: input.displayName,
          email: input.email,
          passwordHash,
        },
      });
      await writeAuditEvent(transaction, {
        action: 'auth.signup',
        entityId: created.id,
        entityType: 'user',
        requestId: requestId(request),
        userId: created.id,
      });
      return created;
    });
    await createSession(user.id, response);
    response.status(201).json({ data: presentUser(user) });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new AppError(409, 'EMAIL_IN_USE', 'An account already exists for this email.');
    }
    throw error;
  }
});

authRouter.post('/login', authLimiter, async (request, response) => {
  const input = loginSchema.parse(request.body);
  const user = await prisma.user.findUnique({ where: { email: input.email } });

  if (!user || !(await verify(user.passwordHash, input.password))) {
    throw new AppError(401, 'INVALID_CREDENTIALS', 'Email or password is incorrect.');
  }

  await writeAuditEvent(prisma, {
    action: 'auth.login',
    entityId: user.id,
    entityType: 'user',
    requestId: requestId(request),
    userId: user.id,
  });
  await createSession(user.id, response);
  response.json({ data: presentUser(user) });
});

authRouter.post('/logout', async (request, response) => {
  const token = readSessionToken(request);
  const session = await getSession(token);
  await deleteSession(token);
  if (session) {
    await writeAuditEvent(prisma, {
      action: 'auth.logout',
      entityId: session.id,
      entityType: 'session',
      requestId: requestId(request),
      userId: session.userId,
    });
  }
  clearSessionCookie(response);
  response.json({ data: { success: true } });
});

authRouter.get('/me', requireAuth, async (request, response) => {
  const userId = request.auth?.userId;
  if (!userId) throw new AppError(401, 'AUTH_REQUIRED', 'Sign in to continue.');
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new AppError(401, 'AUTH_REQUIRED', 'Sign in to continue.');
  response.json({ data: presentUser(user) });
});
