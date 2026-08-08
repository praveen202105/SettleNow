# SettleFlow

SettleFlow is a production-oriented B2B order and settlement tracker. It keeps order totals and payment validation on the server, stores money as integer USD cents, and prevents concurrent payments from exceeding an order's balance.

Live application: [https://web-api-production-af27.up.railway.app](https://web-api-production-af27.up.railway.app)

## Stack and layout

- `apps/web`: React 19, TypeScript, Vite, Tailwind CSS, TanStack Query, React Hook Form, Zod, and an owned shadcn-style component system built on Radix UI.
- `apps/api`: Express 5, Prisma, PostgreSQL, Redis, BullMQ, Google OpenID Connect, private object storage, Resend, Pino, and Zod. The same build provides independent API and worker entrypoints.
- `packages/shared`: shared schemas, API contracts, money/date helpers, and status calculation.
- `tests/unit`: shared-domain and React component/client unit tests.
- `tests/integration`: API, authentication, database, and concurrency integration tests.
- `tests/e2e`: Playwright release smoke tests.

The API and built frontend run from one public production service behind Railway Edge. Redis-backed sessions make two API replicas stateless; a private worker processes transactional outbox events, exports and email notifications.

```text
Browser → Railway Edge → web-api ×2 → PostgreSQL primary
                              ├──→ Redis sessions/cache/rate limits
                              └──→ transactional outbox → BullMQ → worker
                                                               ├──→ CSV bucket
                                                               └──→ Resend
```

Dashboard reads support an optional `READ_DATABASE_URL`. Without it, the read client safely falls back to the primary database.

The frontend keeps design tokens and reusable primitives in `apps/web/src/components/ui`. Shared fields, input groups, dialogs, menus, navigation, loading states, and responsive layouts are used across authentication, orders, details, and payments rather than screen-specific controls.

## Local setup

Requirements: Node.js 24 LTS, pnpm 9.12.0, and Docker.

```bash
cp .env.example .env
docker compose up -d postgres redis minio
pnpm install --frozen-lockfile
pnpm db:deploy
pnpm db:test:deploy
pnpm dev
```

Open `http://localhost:5173`. API requests are proxied to `http://localhost:3000`.

### Google authentication

Password authentication works without additional configuration. To enable Google locally, create a Google Cloud OAuth 2.0 Web application and register:

```text
http://localhost:5173/api/v1/auth/google/callback
```

Set `GOOGLE_AUTH_ENABLED=true`, `GOOGLE_CLIENT_ID`, and `GOOGLE_CLIENT_SECRET` in `.env`. The backend runs Authorization Code + PKCE and stores single-use state in Redis. Google tokens are validated server-side, never returned to React, and never persisted. New verified Google emails create Google-only users. If a password account already owns the email, sign in with the password first and connect Google from **Security**; accounts are never auto-merged by email.

To load the five assignment examples for local development only:

```bash
pnpm db:seed
```

The seed account is controlled by `SEED_DEMO_EMAIL` and `SEED_DEMO_PASSWORD` in `.env`. Production users always start with an empty account.

## Quality checks

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm test:e2e
```

`pnpm check` runs the full sequence. All specs and test setup live under `tests/`. API and Playwright tests use the `settleflow_test` database, so start PostgreSQL and apply the test migrations first.

Coverage includes money/date behavior, Redis sessions and cache invalidation, authentication, ownership, order CRUD, transactional payment concurrency, audit events, export ownership and CSV formatting, notification idempotency, shared form accessibility and responsive API/worker/browser workflows.

## API

All endpoints use `/api/v1` and return `{ "data": ... }` (plus optional `meta`) or `{ "error": { "code", "message", "fieldErrors"? } }`.

- `GET /auth/config`, `POST /auth/signup`, `POST /auth/login`, `POST /auth/logout`, `GET /auth/me`
- `POST /auth/google/start`, `GET /auth/google/callback`, `DELETE /auth/google/link`
- `GET /orders`, `POST /orders`, `GET/PATCH/DELETE /orders/:id`
- `POST /orders/:id/payments`, `GET /orders/summary`
- `GET /activity`
- `POST /exports/orders`, `GET /exports`, `GET /exports/:id`
- `POST /exports/:id/retry`, `GET /exports/:id/download`
- `GET /health/live`, `GET /health/ready`

Order dates are ISO `YYYY-MM-DD`; timestamps are UTC. Once an order has a payment, edit and delete return `409 ORDER_LOCKED`. Payment writes lock the owning order row inside a PostgreSQL transaction; an overpayment returns `409 PAYMENT_EXCEEDS_BALANCE` with `maxAllowedCents`.

### Status rules and edge cases

Status is derived on the server for every response, using this precedence:

1. `paid` when total payments equal the order total.
2. `overdue` when the due date is before today and the order is not fully paid.
3. `partially_paid` when at least one payment exists but the order is not overdue or fully paid.
4. `pending` when no payment exists and the due date has not passed.

Consequently, a past-due order becomes `paid` after its final payment; `paid` takes precedence over `overdue`. A partially paid order whose due date passes becomes `overdue`. The API rejects payments above the remaining balance, including concurrent attempts. Orders become immutable after their first payment so their settlement history cannot be invalidated by later edits.

## Assumptions and trade-offs

- Version 1 supports USD only. Money is stored and calculated as integer cents; floating-point arithmetic is never used for totals or payment validation.
- Due dates are date-only values and timestamps are UTC. A due date becomes overdue after that calendar date has passed.
- Every order, payment, activity event and export is scoped to its account owner. Development seed data is opt-in; new production users start empty.
- Redis-backed sessions and rate limits keep API replicas stateless, but Redis is therefore required for API readiness. Cache failures fall back to PostgreSQL; session creation does not.
- Dashboard cache entries live for 30 seconds and use versioned invalidation plus a 10-second primary-read window after mutations.
- The production release is single-region. `READ_DATABASE_URL` supports a future read replica, but none is provisioned until dashboard load justifies its operational cost.
- Payments and audit/outbox records are transactionally durable. CSV generation and email notifications are eventually consistent worker jobs with bounded retries.
- Refunds, multiple currencies, customer notifications, email verification and password reset are outside the assignment scope.

## What I would improve before wider production use

- Add a staging environment, automated backup/restore drills and documented PostgreSQL recovery objectives.
- Add password-account email verification, password reset, session/device management and optional multi-factor authentication.
- Add refunds with an explicit ledger model rather than negative payments.
- Add error tracking, queue-depth alerts, service-level objectives and longer-term audit retention controls.
- Add a date-range export filter, since the current CSV export snapshots dashboard search, status and sorting filters.
- Introduce a managed read replica only after production query metrics show a need, and add a WAF if public traffic risk increases.

## Security and operations

- Passwords use Argon2id. Google authentication uses Authorization Code + PKCE, nonce validation, single-use hashed Redis state and explicit account linking. OAuth authorization codes and tokens are excluded from logs and storage.
- Session cookies are HttpOnly, Secure in production, SameSite=Lax and revocable. Redis stores only SHA-256 session-token hashes with TTLs, and sessions rotate after authentication-method changes.
- Authentication rate limits are distributed through Redis. Order lists and summaries use short-lived, user-versioned cache keys with primary read-after-write routing.
- Audit and outbox records commit with domain writes. BullMQ jobs use stable IDs, retries and idempotent notification deliveries.
- Helmet, request IDs, origin checks, structured logs, environment validation, centralized errors, dependency readiness checks and graceful shutdown are enabled.
- Never commit `.env`. Set a precise HTTPS `APP_ORIGIN`, `NODE_ENV=production`, `TRUST_PROXY=true`, and an appropriate `LOG_LEVEL` in production.
- Migrations run once through the API pre-deploy command. API readiness checks PostgreSQL and Redis; worker readiness checks PostgreSQL, Redis and BullMQ.

## Railway deployment

The production Railway project contains `web-api` with two Singapore replicas, `worker` with one Singapore replica, PostgreSQL, Redis and a private export bucket. Important variables include:

```text
DATABASE_URL=${{Postgres.DATABASE_URL}}
REDIS_URL=${{Redis.REDIS_URL}}
NODE_ENV=production
APP_ORIGIN=https://<public-domain>
TRUST_PROXY=true
LOG_LEVEL=info
SESSION_COOKIE_NAME=settleflow_session
SESSION_TTL_DAYS=7
AUTH_RATE_LIMIT_MAX=20
GOOGLE_AUTH_ENABLED=true
GOOGLE_CLIENT_ID=<google-oauth-web-client-id>
GOOGLE_CLIENT_SECRET=<sealed-google-oauth-client-secret>
STORAGE_DRIVER=s3
S3_ENDPOINT_URL=<bucket-endpoint>
S3_REGION=auto
S3_BUCKET_NAME=<bucket-name>
S3_ACCESS_KEY_ID=<sealed-access-key>
S3_SECRET_ACCESS_KEY=<sealed-secret-key>
S3_FORCE_PATH_STYLE=false
EMAIL_ENABLED=false
RESEND_API_KEY=<sealed-secret>
EMAIL_FROM=SettleFlow <verified@example.com>
```

The provider-neutral `S3_*` variables configure Railway's S3-compatible bucket; they do not imply AWS infrastructure. The API uses pre-deploy command `pnpm db:deploy` and start command `pnpm start:prod`. The worker starts with `pnpm start:worker`. Export objects expire after 24 hours and are downloaded only through authenticated, ownership-checked API routes. Set `EMAIL_ENABLED=true` only after configuring a Resend API key and verified `EMAIL_FROM` sender.

For production Google authentication, create the OAuth client under the operational Google Cloud account, use an External consent screen with only `openid`, `email`, and `profile`, and register:

```text
https://web-api-production-af27.up.railway.app/api/v1/auth/google/callback
```

Only `web-api` needs the Google client variables; the private worker keeps Google authentication disabled.

Production URL: [https://web-api-production-af27.up.railway.app](https://web-api-production-af27.up.railway.app)
