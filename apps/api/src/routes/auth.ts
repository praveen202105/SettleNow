import { hash, verify } from '@node-rs/argon2';
import { Prisma } from '@prisma/client';
import { Router, type Request } from 'express';
import { rateLimit } from 'express-rate-limit';
import { RedisStore } from 'rate-limit-redis';

import {
  googleAuthStartSchema,
  loginSchema,
  signupSchema,
  type AuthMethod,
  type UserResponse,
} from '@settleflow/shared';

import {
  consumeGoogleOAuthState,
  createGoogleOAuthState,
  defaultGoogleOidcClient,
  googleCallbackUrl,
  normalizeEmail,
  safeReturnTo,
  type GoogleOAuthState,
  type GoogleOidcClient,
  type GoogleProfile,
} from '../auth/google.js';
import { requireAuth } from '../auth/middleware.js';
import {
  clearSessionCookie,
  deleteSession,
  getSession,
  readSessionToken,
  rotateSession,
  type SessionRecord,
} from '../auth/session.js';
import { env } from '../config/env.js';
import { AppError } from '../http/errors.js';
import { requestId } from '../http/request.js';
import { logger } from '../lib/logger.js';
import { prisma } from '../lib/prisma.js';
import { redis } from '../lib/redis.js';
import { writeAuditEvent } from '../services/audit.js';

const googleIdentitySelection = { provider: true, providerAccountId: true } as const;
const userWithMethods = { authIdentities: { select: googleIdentitySelection } } as const;

type PresentableUser = {
  authIdentities: Array<{ provider: string; providerAccountId: string }>;
  createdAt: Date;
  displayName: string;
  email: string;
  id: string;
  passwordHash: string | null;
};

export interface AuthRouterOptions {
  googleEnabled?: boolean;
  googleOidcClient?: GoogleOidcClient;
}

function createAuthLimiter() {
  return rateLimit({
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
}

function presentUser(user: PresentableUser): UserResponse {
  const authMethods: AuthMethod[] = [];
  if (user.passwordHash) authMethods.push('password');
  if (user.authIdentities.some((identity) => identity.provider === 'google')) {
    authMethods.push('google');
  }

  return {
    authMethods,
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    createdAt: user.createdAt.toISOString(),
  };
}

async function optionalSession(request: Request): Promise<SessionRecord | null> {
  return getSession(readSessionToken(request));
}

function failurePath(request: Request, intent: 'signin' | 'link'): GoogleOAuthState['failurePath'] {
  if (intent === 'link') return '/settings/security';
  const referer = request.get('referer');
  if (!referer) return '/login';

  try {
    const parsed = new URL(referer);
    if (parsed.origin === new URL(env.APP_ORIGIN).origin && parsed.pathname === '/signup') {
      return '/signup';
    }
  } catch {
    // An invalid or external referrer never controls the redirect destination.
  }
  return '/login';
}

function authErrorLocation(path: GoogleOAuthState['failurePath'], code: string): string {
  const location = new URL(path, env.APP_ORIGIN);
  location.searchParams.set('authError', code);
  return `${location.pathname}${location.search}`;
}

async function signInWithGoogle(
  profile: GoogleProfile,
  request: Request,
): Promise<PresentableUser> {
  return prisma.$transaction(async (transaction) => {
    const existingIdentity = await transaction.authIdentity.findUnique({
      where: {
        provider_providerAccountId: {
          provider: 'google',
          providerAccountId: profile.subject,
        },
      },
      include: { user: { include: userWithMethods } },
    });

    if (existingIdentity) {
      await writeAuditEvent(transaction, {
        action: 'auth.login',
        entityId: existingIdentity.userId,
        entityType: 'user',
        metadata: { provider: 'google' },
        requestId: requestId(request),
        userId: existingIdentity.userId,
      });
      return existingIdentity.user;
    }

    const emailOwner = await transaction.user.findUnique({ where: { email: profile.email } });
    if (emailOwner) {
      throw new AppError(
        409,
        'GOOGLE_ACCOUNT_LINK_REQUIRED',
        'Sign in with your password, then connect Google from Security settings.',
      );
    }

    const created = await transaction.user.create({
      data: {
        authIdentities: {
          create: {
            provider: 'google',
            providerAccountId: profile.subject,
            providerEmail: profile.email,
          },
        },
        displayName: profile.displayName,
        email: profile.email,
        passwordHash: null,
      },
      include: userWithMethods,
    });
    await writeAuditEvent(transaction, {
      action: 'auth.signup',
      entityId: created.id,
      entityType: 'user',
      metadata: { provider: 'google' },
      requestId: requestId(request),
      userId: created.id,
    });
    await transaction.outboxEvent.create({
      data: {
        payload: { userId: created.id },
        topic: 'user.welcome',
      },
    });
    return created;
  });
}

async function linkGoogleIdentity(
  profile: GoogleProfile,
  oauthState: GoogleOAuthState,
  session: SessionRecord,
  request: Request,
): Promise<PresentableUser> {
  if (
    !oauthState.userId ||
    !oauthState.sessionId ||
    session.userId !== oauthState.userId ||
    session.id !== oauthState.sessionId
  ) {
    throw new AppError(
      401,
      'GOOGLE_LINK_SESSION_EXPIRED',
      'Your linking session expired. Sign in and try again.',
    );
  }

  return prisma.$transaction(async (transaction) => {
    const user = await transaction.user.findUnique({
      where: { id: session.userId },
      include: userWithMethods,
    });
    if (!user) throw new AppError(401, 'AUTH_REQUIRED', 'Sign in to continue.');
    if (normalizeEmail(user.email) !== profile.email) {
      throw new AppError(
        409,
        'GOOGLE_EMAIL_MISMATCH',
        'Choose the Google account with the same email as your SettleFlow account.',
      );
    }

    const identity = await transaction.authIdentity.findUnique({
      where: {
        provider_providerAccountId: {
          provider: 'google',
          providerAccountId: profile.subject,
        },
      },
    });
    if (identity && identity.userId !== user.id) {
      throw new AppError(
        409,
        'GOOGLE_IDENTITY_IN_USE',
        'This Google account is already connected to another SettleFlow account.',
      );
    }

    const currentGoogleIdentity = user.authIdentities.find((item) => item.provider === 'google');
    if (currentGoogleIdentity && currentGoogleIdentity.providerAccountId !== profile.subject) {
      throw new AppError(
        409,
        'GOOGLE_ALREADY_LINKED',
        'Disconnect the current Google account before connecting a different one.',
      );
    }
    const alreadyLinked = Boolean(currentGoogleIdentity);
    if (!alreadyLinked) {
      await transaction.authIdentity.create({
        data: {
          provider: 'google',
          providerAccountId: profile.subject,
          providerEmail: profile.email,
          userId: user.id,
        },
      });
      await writeAuditEvent(transaction, {
        action: 'auth.google.linked',
        entityId: user.id,
        entityType: 'user',
        metadata: { provider: 'google' },
        requestId: requestId(request),
        userId: user.id,
      });
    }

    return transaction.user.findUniqueOrThrow({
      where: { id: user.id },
      include: userWithMethods,
    });
  });
}

function callbackUrlFromRequest(request: Request): URL {
  const incoming = new URL(request.originalUrl, env.APP_ORIGIN);
  const callback = new URL(googleCallbackUrl());
  callback.search = incoming.search;
  return callback;
}

function callbackErrorCode(error: unknown): string {
  if (error instanceof AppError) return error.code;
  return 'GOOGLE_AUTH_FAILED';
}

export function createAuthRouter(options: AuthRouterOptions = {}) {
  const router = Router();
  const authLimiter = createAuthLimiter();
  const googleEnabled = options.googleEnabled ?? env.GOOGLE_AUTH_ENABLED;
  const googleOidcClient = options.googleOidcClient ?? defaultGoogleOidcClient;

  router.get('/config', (_request, response) => {
    response.json({ data: { providers: { google: googleEnabled, password: true } } });
  });

  router.post('/signup', authLimiter, async (request, response) => {
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
            email: normalizeEmail(input.email),
            passwordHash,
          },
          include: userWithMethods,
        });
        await writeAuditEvent(transaction, {
          action: 'auth.signup',
          entityId: created.id,
          entityType: 'user',
          metadata: { provider: 'password' },
          requestId: requestId(request),
          userId: created.id,
        });
        await transaction.outboxEvent.create({
          data: {
            payload: { userId: created.id },
            topic: 'user.welcome',
          },
        });
        return created;
      });
      await rotateSession(request, response, user.id);
      response.status(201).json({ data: presentUser(user) });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new AppError(409, 'EMAIL_IN_USE', 'An account already exists for this email.');
      }
      throw error;
    }
  });

  router.post('/login', authLimiter, async (request, response) => {
    const input = loginSchema.parse(request.body);
    const user = await prisma.user.findUnique({
      where: { email: normalizeEmail(input.email) },
      include: userWithMethods,
    });

    if (!user?.passwordHash || !(await verify(user.passwordHash, input.password))) {
      throw new AppError(401, 'INVALID_CREDENTIALS', 'Email or password is incorrect.');
    }

    await writeAuditEvent(prisma, {
      action: 'auth.login',
      entityId: user.id,
      entityType: 'user',
      metadata: { provider: 'password' },
      requestId: requestId(request),
      userId: user.id,
    });
    await rotateSession(request, response, user.id);
    response.json({ data: presentUser(user) });
  });

  router.post('/google/start', authLimiter, async (request, response) => {
    if (!googleEnabled) {
      throw new AppError(503, 'GOOGLE_AUTH_UNAVAILABLE', 'Google authentication is unavailable.');
    }

    const input = googleAuthStartSchema.parse(request.body);
    const session = await optionalSession(request);
    if (input.intent === 'link' && session?.authenticatedWith !== 'password') {
      throw new AppError(
        401,
        'GOOGLE_PASSWORD_SESSION_REQUIRED',
        'Sign in with your password before connecting Google.',
      );
    }

    const returnTo = safeReturnTo(
      input.returnTo,
      input.intent === 'link' ? '/settings/security?google=linked' : '/orders',
    );
    const authorization = await createGoogleOAuthState(googleOidcClient, {
      failurePath: failurePath(request, input.intent),
      intent: input.intent,
      returnTo,
      ...(session ? { sessionId: session.id, userId: session.userId } : {}),
    });
    response.json({ data: { authorizationUrl: authorization.authorizationUrl } });
  });

  router.get('/google/callback', async (request, response) => {
    const rawState = request.query.state;
    const oauthState = await consumeGoogleOAuthState(rawState);
    if (!oauthState || typeof rawState !== 'string') {
      response.redirect(302, authErrorLocation('/login', 'GOOGLE_AUTH_EXPIRED'));
      return;
    }

    if (request.query.error) {
      const code =
        request.query.error === 'access_denied' ? 'GOOGLE_ACCESS_DENIED' : 'GOOGLE_AUTH_FAILED';
      response.redirect(302, authErrorLocation(oauthState.failurePath, code));
      return;
    }

    try {
      const profile = await googleOidcClient.exchangeCallback({
        callbackUrl: callbackUrlFromRequest(request),
        codeVerifier: oauthState.codeVerifier,
        nonce: oauthState.nonce,
        state: rawState,
      });
      if (!profile.emailVerified) {
        throw new AppError(
          401,
          'GOOGLE_EMAIL_NOT_VERIFIED',
          'Use a Google account with a verified email address.',
        );
      }

      const currentSession = await optionalSession(request);
      if (oauthState.intent === 'link' && !currentSession) {
        throw new AppError(
          401,
          'GOOGLE_LINK_SESSION_EXPIRED',
          'Your linking session expired. Sign in and try again.',
        );
      }
      const user =
        oauthState.intent === 'link'
          ? await linkGoogleIdentity(profile, oauthState, currentSession!, request)
          : await signInWithGoogle(profile, request);

      await rotateSession(
        request,
        response,
        user.id,
        oauthState.intent === 'link' ? 'password' : 'google',
      );
      response.redirect(302, safeReturnTo(oauthState.returnTo));
    } catch (error) {
      const code = callbackErrorCode(error);
      if (!(error instanceof AppError)) {
        logger.warn({ err: error, requestId: request.id }, 'Google authentication failed');
      }
      response.redirect(302, authErrorLocation(oauthState.failurePath, code));
    }
  });

  router.delete('/google/link', requireAuth, async (request, response) => {
    const userId = request.auth?.userId;
    if (!userId) throw new AppError(401, 'AUTH_REQUIRED', 'Sign in to continue.');

    const user = await prisma.$transaction(async (transaction) => {
      const existing = await transaction.user.findUnique({
        where: { id: userId },
        include: userWithMethods,
      });
      if (!existing) throw new AppError(401, 'AUTH_REQUIRED', 'Sign in to continue.');
      if (!existing.authIdentities.some((identity) => identity.provider === 'google')) {
        throw new AppError(409, 'GOOGLE_NOT_LINKED', 'Google is not connected to this account.');
      }
      if (!existing.passwordHash) {
        throw new AppError(
          409,
          'LAST_AUTH_METHOD',
          'Google cannot be disconnected because it is your only sign-in method.',
        );
      }

      await transaction.authIdentity.delete({
        where: { userId_provider: { provider: 'google', userId } },
      });
      await writeAuditEvent(transaction, {
        action: 'auth.google.unlinked',
        entityId: userId,
        entityType: 'user',
        metadata: { provider: 'google' },
        requestId: requestId(request),
        userId,
      });
      return transaction.user.findUniqueOrThrow({
        where: { id: userId },
        include: userWithMethods,
      });
    });

    await rotateSession(request, response, user.id);
    response.json({ data: presentUser(user) });
  });

  router.post('/logout', async (request, response) => {
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

  router.get('/me', requireAuth, async (request, response) => {
    const userId = request.auth?.userId;
    if (!userId) throw new AppError(401, 'AUTH_REQUIRED', 'Sign in to continue.');
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: userWithMethods,
    });
    if (!user) throw new AppError(401, 'AUTH_REQUIRED', 'Sign in to continue.');
    response.json({ data: presentUser(user) });
  });

  return router;
}
