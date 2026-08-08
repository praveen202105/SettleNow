# SettleFlow

SettleFlow is a production-oriented B2B order and settlement tracker. It keeps order totals and payment validation on the server, stores money as integer USD cents, and prevents concurrent payments from exceeding an order's balance.

## Stack and layout

- `apps/web`: React 19, TypeScript, Vite, Tailwind CSS, TanStack Query, React Hook Form, Zod, and an owned shadcn-style component system built on Radix UI.
- `apps/api`: Express 5, Prisma, PostgreSQL, database-backed opaque sessions, Pino, and Zod.
- `packages/shared`: shared schemas, API contracts, money/date helpers, and status calculation.
- `tests/unit`: shared-domain and React component/client unit tests.
- `tests/integration`: API, authentication, database, and concurrency integration tests.
- `tests/e2e`: Playwright release smoke tests.

The API and built frontend run from one production service. PostgreSQL is the only external dependency.

The frontend keeps design tokens and reusable primitives in `apps/web/src/components/ui`. Shared fields, input groups, dialogs, menus, navigation, loading states, and responsive layouts are used across authentication, orders, details, and payments rather than screen-specific controls.

## Local setup

Requirements: Node.js 24 LTS, pnpm 9.12.0, and Docker.

```bash
cp .env.example .env
docker compose up -d postgres
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

Coverage includes money parsing/formatting, date-only handling, status precedence, validation boundaries, authentication/session revocation, ownership isolation, order CRUD, server-side filters and pagination, locked orders, settlement history, error contracts, concurrent-payment protection, shared form accessibility, password interaction, keyboard selects, dialog focus, and responsive browser flows.

## API

All endpoints use `/api/v1` and return `{ "data": ... }` (plus optional `meta`) or `{ "error": { "code", "message", "fieldErrors"? } }`.

- `POST /auth/signup`, `POST /auth/login`, `POST /auth/logout`, `GET /auth/me`
- `GET /orders`, `POST /orders`, `GET/PATCH/DELETE /orders/:id`
- `POST /orders/:id/payments`, `GET /orders/summary`
- `GET /health/live`, `GET /health/ready`

Order dates are ISO `YYYY-MM-DD`; timestamps are UTC. Once an order has a payment, edit and delete return `409 ORDER_LOCKED`. Payment writes lock the owning order row inside a PostgreSQL transaction; an overpayment returns `409 PAYMENT_EXCEEDS_BALANCE` with `maxAllowedCents`.

## Security and operations

- Passwords use Argon2id. Session cookies are HttpOnly, Secure in production, SameSite=Lax, revocable, and backed by SHA-256 token hashes in PostgreSQL.
- Authentication is rate-limited. Helmet, request IDs, origin checks, structured logs, environment validation, centralized errors, readiness checks, and graceful shutdown are enabled.
- Never commit `.env`. Set a precise HTTPS `APP_ORIGIN`, `NODE_ENV=production`, `TRUST_PROXY=true`, and an appropriate `LOG_LEVEL` in production.
- Migrations run before the production server starts. The readiness route checks database connectivity.

## Railway deployment

The repository includes `railway.json` and a Node 24 Dockerfile. A Railway application service needs `DATABASE_URL` from managed PostgreSQL plus:

```text
NODE_ENV=production
APP_ORIGIN=https://<public-domain>
TRUST_PROXY=true
LOG_LEVEL=info
SESSION_COOKIE_NAME=settleflow_session
SESSION_TTL_DAYS=7
AUTH_RATE_LIMIT_MAX=20
```

The start command is `pnpm start:prod`, which applies committed migrations before launching the API. The readiness health check is `/api/v1/health/ready`.
# SettleNow
