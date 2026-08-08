# SettleFlow

SettleFlow is a production-oriented B2B order and settlement tracker. It keeps order totals and payment validation on the server, stores money as integer USD cents, and prevents concurrent payments from exceeding an order's balance.

## Stack and layout

- `apps/web`: React 19, TypeScript, Vite, Tailwind CSS, TanStack Query, React Hook Form, Zod, and an owned shadcn-style component system built on Radix UI.
- `apps/api`: Express 5, Prisma, PostgreSQL, Redis, BullMQ, private object storage, Resend, Pino, and Zod. The same build provides independent API and worker entrypoints.
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

- `POST /auth/signup`, `POST /auth/login`, `POST /auth/logout`, `GET /auth/me`
- `GET /orders`, `POST /orders`, `GET/PATCH/DELETE /orders/:id`
- `POST /orders/:id/payments`, `GET /orders/summary`
- `GET /activity`
- `POST /exports/orders`, `GET /exports`, `GET /exports/:id`
- `POST /exports/:id/retry`, `GET /exports/:id/download`
- `GET /health/live`, `GET /health/ready`

Order dates are ISO `YYYY-MM-DD`; timestamps are UTC. Once an order has a payment, edit and delete return `409 ORDER_LOCKED`. Payment writes lock the owning order row inside a PostgreSQL transaction; an overpayment returns `409 PAYMENT_EXCEEDS_BALANCE` with `maxAllowedCents`.

## Security and operations

- Passwords use Argon2id. Session cookies are HttpOnly, Secure in production, SameSite=Lax and revocable. Redis stores only SHA-256 token hashes with TTLs.
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
STORAGE_DRIVER=s3
AWS_ENDPOINT_URL=<bucket-endpoint>
AWS_S3_BUCKET_NAME=<bucket-name>
EMAIL_ENABLED=true
RESEND_API_KEY=<sealed-secret>
EMAIL_FROM=SettleFlow <verified@example.com>
```

The API uses pre-deploy command `pnpm db:deploy` and start command `pnpm start:prod`. The worker starts with `pnpm start:worker`. Export objects expire after 24 hours and are downloaded only through authenticated, ownership-checked API routes.
