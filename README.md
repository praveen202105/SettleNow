# SettleFlow

SettleFlow is a production-oriented B2B order and settlement workspace. Teams can save customers once, create itemized orders, record partial payments, track overdue balances, export filtered CSV reports and review an immutable activity trail.

Production: [https://settleflow-production-77e1.up.railway.app](https://settleflow-production-77e1.up.railway.app)

## Product capabilities

- Password and Google authentication with revocable server-side sessions.
- User-owned customer directory with required international mobile numbers.
- Searchable customer selection, so repeat orders do not require retyping customer details.
- Itemized USD orders with server-calculated totals and date-only due dates.
- Partial payment history, remaining balances and concurrency-safe overpayment prevention.
- Pending, partially paid, overdue and paid status tracking.
- Filtered dashboards, summary cards, responsive mobile layouts and accessible controls.
- Asynchronous CSV exports stored in private object storage for 24 hours.
- Activity history for authentication, customers, orders, payments, exports and notifications.
- A Gmail SMTP notification pipeline for payment, overdue-order and export-ready events.

## Architecture

The React application and Express API share one public origin. Railway Edge terminates HTTPS and balances requests across two stateless API replicas. PostgreSQL is the source of truth; Redis provides sessions, distributed rate limits, short-lived dashboard caching and BullMQ.

```text
Browser
  │ HTTPS
  ▼
Railway Edge
  │
  ├── settleflow replica 1 ─┐
  └── settleflow replica 2 ─┤
                         ├── PostgreSQL primary
                         │     ├── users / auth identities
                         │     ├── customers / orders / payments
                         │     └── audit / outbox / exports / deliveries
                         ├── Redis
                         │     ├── opaque sessions
                         │     ├── rate limits and cache versions
                         │     └── BullMQ
                         └── transactional outbox
                                   │
                                   ▼
                              private worker
                               ├── CSV → private S3-compatible bucket
                               └── email → Nodemailer → Gmail SMTP
```

Dashboard list and summary reads support an optional `READ_DATABASE_URL`. Without it, the read client safely uses the primary database. Writes, order details and payment validation always use the primary. After a mutation, that user's dashboard reads remain on primary for ten seconds to preserve read-after-write consistency.

### Repository layout

- `apps/web`: React 19, Vite, Tailwind, TanStack Query, React Hook Form and local Radix-based UI components.
- `apps/api`: Express 5, Prisma, PostgreSQL, Redis, BullMQ, Nodemailer, object storage and worker entrypoints.
- `packages/shared`: Zod schemas, API types, cents/date/phone helpers and status rules shared by frontend and backend.
- `tests/unit`: domain, API helper and component tests.
- `tests/integration`: authenticated API, database, ownership and concurrency tests.
- `tests/e2e`: Playwright browser release flows.

## Customer and order data model

Every customer belongs to one SettleFlow user. Mobile numbers are normalized to E.164, such as `+919876543210`, and are unique within that user's directory. Two customers may share a name when their mobile numbers differ. The same mobile may exist under different SettleFlow users without leaking data between accounts.

New orders reference a customer record and copy the customer's current name and mobile into order snapshot fields. Historical order documents therefore remain stable even if customer management is extended later. Orders created before the customer directory migration remain readable with a legacy name and no mobile; no fake mobile data is generated. An unlocked legacy order must select or add a saved customer before it can be updated.

Once the first payment is recorded, an order becomes immutable. Customer selection, due date and line items can no longer be changed or deleted because doing so would invalidate settlement history.

## Money, dates and statuses

- Currency is USD.
- Monetary values are integer cents in the API and `BIGINT` in PostgreSQL.
- Floating-point arithmetic is never used for payment validation or stored totals.
- Due dates use ISO `YYYY-MM-DD`; timestamps are UTC.
- A payment is created inside a PostgreSQL transaction after locking the owning order row.
- Concurrent payments cannot make the paid total exceed the order total.

Status precedence is:

1. `paid` when total payments equal the order total.
2. `overdue` when the due date has passed and a balance remains.
3. `partially_paid` when at least one payment exists and the order is not overdue.
4. `pending` when no payment exists and the due date has not passed.

## Authentication and security

Passwords use Argon2id. Google uses backend Authorization Code flow with PKCE, nonce validation and single-use Redis state. OAuth codes and tokens never enter React storage and are never persisted. A same-email password account is never silently merged: the user must first authenticate with the password and explicitly connect Google under **Security**.

Sessions use opaque random tokens in HttpOnly, Secure production cookies with SameSite=Lax. Redis stores only SHA-256 token hashes with TTLs. Sessions rotate after signup, login and authentication-method changes.

The API also enables Helmet, strict origin checks, distributed authentication rate limits, Zod validation, request IDs, structured Pino logs, centralized errors, user ownership checks, graceful shutdown and dependency readiness endpoints. Passwords, cookies, OAuth values, SMTP credentials and storage credentials must never be logged or committed.

## Async work and email delivery

Order/payment changes and their outbox records commit in the same PostgreSQL transaction. A dispatcher publishes outbox rows to BullMQ with stable job IDs. The worker processes jobs independently from the API replicas and retries transient failures five times with exponential backoff.

Notification deliveries are uniquely keyed per domain event. Nodemailer sends through Gmail SMTP, records the SMTP message ID and uses a deterministic opaque RFC Message-ID for retry deduplication. Notifications go to the SettleFlow account owner, not to the customer mobile number.

Email configuration belongs only to the worker. Setting `EMAIL_ENABLED=false` disables delivery and records new events as skipped. SMTP availability does not make worker readiness fail; a send failure is recorded and retried by BullMQ.

Railway allows outbound SMTP only on Pro plans and above. The current deployment therefore keeps `EMAIL_ENABLED=false` while retaining the Gmail App Password as a sealed worker-only variable. After a Railway Pro upgrade, redeploy the worker before enabling delivery. See [Railway outbound networking](https://docs.railway.com/networking/outbound-networking).

## Local development

Requirements:

- Node.js 24 LTS
- pnpm 9.12.0
- Docker

```bash
cp .env.example .env
docker compose up -d postgres redis minio mailpit
pnpm install --frozen-lockfile
pnpm db:deploy
pnpm db:test:deploy
pnpm dev
```

Open:

- Application: `http://localhost:5173`
- API: `http://localhost:3000/api/v1`
- Worker health: `http://localhost:3001/health/ready`
- Mailpit inbox: `http://localhost:8025`
- MinIO console: `http://localhost:9001`

To test email locally without Gmail, set:

```text
EMAIL_ENABLED=true
EMAIL_FROM=SettleFlow <local@settleflow.test>
SMTP_HOST=127.0.0.1
SMTP_PORT=1025
SMTP_SECURE=false
SMTP_USER=local
SMTP_PASSWORD=local
```

Mailpit accepts the local credentials and captures messages instead of delivering them externally.

### Development seed

```bash
pnpm db:seed
```

The seed creates five customers and assignment orders for `SEED_DEMO_EMAIL`. It is blocked when `NODE_ENV=production`.

### Google OAuth

Password login works without Google configuration. For local Google login, create an OAuth 2.0 Web client and register:

```text
http://localhost:5173/api/v1/auth/google/callback
```

Then set `GOOGLE_AUTH_ENABLED=true`, `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`.

## Environment configuration

Copy `.env.example`; never commit real values.

Core variables:

```text
NODE_ENV=development
DATABASE_URL=postgresql://...
READ_DATABASE_URL=
REDIS_URL=redis://...
APP_ORIGIN=http://localhost:5173
SESSION_COOKIE_NAME=settleflow_session
SESSION_TTL_DAYS=7
AUTH_RATE_LIMIT_MAX=20
CACHE_TTL_SECONDS=30
READ_AFTER_WRITE_SECONDS=10
```

Gmail SMTP variables, used only by the worker in production:

```text
EMAIL_ENABLED=false
EMAIL_FROM=SettleFlow <coderpraveengupta@gmail.com>
SMTP_HOST=smtp.gmail.com
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=coderpraveengupta@gmail.com
SMTP_PASSWORD=<sealed-gmail-app-password>
```

The Gmail account must have two-step verification and an App Password. Do not use the normal account password. If App Passwords are unavailable for the account, email must remain disabled until an approved SMTP authentication method is configured.

Storage uses provider-neutral `S3_*` variables. Railway's bucket is S3-compatible; this does not imply that SettleFlow uses AWS infrastructure.

## Public API

All routes are under `/api/v1`. Success responses use `{ "data": ..., "meta"?: ... }`. Errors use `{ "error": { "code", "message", "fieldErrors"?, "requestId"?, ... } }`.

### Authentication

- `GET /auth/config`
- `POST /auth/signup`
- `POST /auth/login`
- `POST /auth/logout`
- `GET /auth/me`
- `POST /auth/google/start`
- `GET /auth/google/callback`
- `DELETE /auth/google/link`

### Customers

- `GET /customers?search&page&pageSize`
- `POST /customers` with `{ "name": "Acme", "mobile": "+919876543210" }`

`CUSTOMER_MOBILE_IN_USE` includes `existingCustomerId` so the UI can direct the user to the saved record. Customer/order ownership failures return `CUSTOMER_NOT_FOUND` without exposing another user's data.

### Orders and payments

- `GET /orders`
- `POST /orders` with `customerId`, `dueDate` and `lineItems`
- `GET /orders/:id`
- `PATCH /orders/:id`
- `DELETE /orders/:id`
- `POST /orders/:id/payments`
- `GET /orders/summary`

Dashboard search matches order number, customer name and customer mobile. `ORDER_LOCKED` prevents edits/deletes after a payment. `PAYMENT_EXCEEDS_BALANCE` returns `maxAllowedCents`.

### Activity and exports

- `GET /activity`
- `POST /exports/orders`
- `GET /exports`
- `GET /exports/:id`
- `POST /exports/:id/retry`
- `GET /exports/:id/download`

CSV exports snapshot the dashboard filters and include customer name, customer mobile, due date, status, USD totals, payment count and timestamps. Downloads are authenticated and ownership checked.

### Health

- `GET /health/live`
- `GET /health/ready`

API readiness requires PostgreSQL and Redis. Worker readiness requires PostgreSQL, Redis and BullMQ.

## Testing and release checks

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm test:e2e
```

`pnpm check` runs the complete sequence. Tests cover money/date/phone behavior, customer ownership and snapshots, Redis sessions/cache, password and Google authentication, order CRUD, payment locking/concurrency, notification idempotency, CSV exports, accessible customer selection and responsive browser flows.

## Railway production deployment

The production project uses one Singapore region:

- `settleflow`: two replicas serving React and `/api/v1` at the branded Railway origin.
- `worker`: one private replica processing outbox, BullMQ, exports and email.
- PostgreSQL primary, Redis and a private S3-compatible bucket.

The API pre-deploy command is `pnpm db:deploy`, ensuring migrations run once before the two replicas start. The API starts with `pnpm start:prod`; the worker starts with `pnpm start:worker`.

The production Gmail rollout uses this sequence:

1. Deploy code and database migration with `EMAIL_ENABLED=false`.
2. Verify API and worker readiness plus customer create/reuse behavior.
3. Remove obsolete email-provider variables.
4. Add sealed Gmail SMTP variables to the worker only; never add the App Password to source control.
5. On Railway Pro or above, redeploy the worker, enable email and verify an export-ready notification and authenticated download. On lower plans, keep email disabled and use an approved HTTPS email provider instead.

The production Google callback is:

```text
https://settleflow-production-77e1.up.railway.app/api/v1/auth/google/callback
```

## Troubleshooting

- **Customer does not appear:** search by full E.164 mobile and confirm the customer belongs to the signed-in account.
- **Duplicate mobile error:** select the existing customer returned by the directory instead of creating another record.
- **Legacy order cannot be edited:** select or create a saved customer first; locked legacy orders remain historical and cannot be edited.
- **Email skipped:** check `EMAIL_ENABLED`; skipped events are expected while SMTP rollout is disabled.
- **Gmail authentication failed:** confirm two-step verification, use an App Password, and verify `SMTP_USER` matches the Gmail sender.
- **Worker jobs retrying:** inspect worker logs and `notification_deliveries`; SMTP errors are retained without exposing credentials.
- **Stale dashboard after a write:** verify Redis is reachable; mutations increment user cache versions and force primary reads temporarily.
- **OAuth account-link-required:** sign in with the existing password account, then connect the matching Google email under Security.

## Current boundaries

Version 1 supports USD, one mobile per customer record and account-owner email notifications. Customer editing/deletion, customer-facing messaging, refunds, multiple currencies, password reset, MFA, a provisioned read replica, staging and multi-region deployment remain outside this release.
