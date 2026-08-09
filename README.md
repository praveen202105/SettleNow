# SettleFlow

SettleFlow is a production-oriented B2B order and settlement workspace. Teams can save customers once, create itemized orders, record partial payments, track overdue balances, export filtered CSV reports and review an immutable activity trail.

Production: [https://settleflow-production-77e1.up.railway.app](https://settleflow-production-77e1.up.railway.app)

## Product capabilities

- Password and Google authentication with revocable server-side sessions.
- User-owned customer directory with required international mobile numbers.
- Searchable customer selection, so repeat orders do not require retyping customer details.
- Itemized INR orders with server-calculated totals and date-only due dates.
- Separate offline payment recording and Razorpay Standard Checkout in permanent Test Mode.
- Owner-initiated online collection plus revocable customer payment links with selectable partial amounts.
- Partial payment history, remaining balances and concurrency-safe overpayment prevention across API replicas.
- Pending, partially paid, overdue and paid status tracking.
- Filtered dashboards, summary cards, responsive mobile layouts and accessible controls.
- Asynchronous CSV exports stored in private object storage for 24 hours.
- Activity history for authentication, customers, orders, payments, exports and notifications.
- Branded responsive welcome, payment, overdue-order and export-ready emails through Gmail REST API.

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
                         │     ├── payment links / attempts / provider events
                         │     └── audit / outbox / exports / deliveries
                         ├── Redis
                         │     ├── opaque sessions
                         │     ├── rate limits and cache versions
                         │     └── BullMQ
                         └── Razorpay Orders API + signed webhook ingress
                                   │
                                   └── transactional outbox
                                   │
                                   ▼
                              private worker
                               ├── captured/failed payment event finalization
                               ├── CSV → private S3-compatible bucket
                               └── email → Nodemailer MIME → Gmail REST API
```

Dashboard list and summary reads support an optional `READ_DATABASE_URL`. Without it, the read client safely uses the primary database. Writes, order details and payment validation always use the primary. After a mutation, that user's dashboard reads remain on primary for ten seconds to preserve read-after-write consistency.

### Repository layout

- `apps/web`: React 19, Vite, Tailwind, TanStack Query, React Hook Form and local Radix-based UI components.
- `apps/api`: Express 5, Prisma, PostgreSQL, Redis, BullMQ, Nodemailer, object storage and worker entrypoints.
- `packages/shared`: Zod schemas, API types, minor-unit/date/phone helpers and status rules shared by frontend and backend.
- `tests/unit`: domain, API helper and component tests.
- `tests/integration`: authenticated API, database, ownership and concurrency tests.
- `tests/e2e`: Playwright browser release flows.

## Customer and order data model

Every customer belongs to one SettleFlow user. Mobile numbers are normalized to E.164, such as `+919876543210`, and are unique within that user's directory. Two customers may share a name when their mobile numbers differ. The same mobile may exist under different SettleFlow users without leaking data between accounts.

New orders reference a customer record and copy the customer's current name and mobile into order snapshot fields. Historical order documents therefore remain stable even if customer management is extended later. Orders created before the customer directory migration remain readable with a legacy name and no mobile; no fake mobile data is generated. An unlocked legacy order must select or add a saved customer before it can be updated.

Once the first payment is recorded, an order becomes immutable. Customer selection, due date and line items can no longer be changed or deleted because doing so would invalidate settlement history.

## Money, dates and statuses

- Currency is INR. Existing assignment/demo numbers were relabelled without foreign-exchange conversion.
- Monetary values are integer minor units (`100` = ₹1.00) in the API and `BIGINT` in PostgreSQL.
- Floating-point arithmetic is never used for payment validation or stored totals.
- Due dates use ISO `YYYY-MM-DD`; timestamps are UTC.
- A payment is created inside a PostgreSQL transaction after locking the owning order row.
- Concurrent payments cannot make the paid total exceed the order total.

Status precedence is:

1. `paid` when total payments equal the order total.
2. `overdue` when the due date has passed and a balance remains.
3. `partially_paid` when at least one payment exists and the order is not overdue.
4. `pending` when no payment exists and the due date has not passed.

## Razorpay Test Mode collection

Online collection is configuration-gated and can never silently switch to Live Mode. `PAYMENT_MODE` is schema-locked to `test`, `PAYMENT_CURRENCY` to `INR` and the UI permanently says that no real money moves. Offline entries remain available as **Record offline payment** and are stored separately from Razorpay test transactions.

For every checkout SettleFlow creates a fixed-amount Razorpay Order. The amount must be from ₹1 to the current balance. A PostgreSQL partial unique index permits only one `creating` or `pending` attempt per order, while a row lock serializes balance validation. The reservation expires after 15 minutes; the owner can cancel it. Offline recording is blocked while a checkout is active.

Browser success is only a hint. The API verifies Razorpay's HMAC checkout signature, fetches the payment from the provider and then checks captured status, provider order, exact amount and INR currency under an order row lock. Only then are the payment, audit entry and notification outbox event committed together. A mismatch is retained as `needs_review` and does not change the balance.

Razorpay webhooks enter through a raw-body route mounted before JSON and origin middleware. SettleFlow performs timing-safe HMAC verification, persists the minimal validated event and outbox row before acknowledging it, and deduplicates by `x-razorpay-event-id`. BullMQ processing is idempotent by provider payment ID and payment attempt. `payment.captured` is authoritative; out-of-order or duplicate events cannot create duplicate payments.

An owner may generate one active bearer payment link per order. Regeneration revokes the prior token. Only its SHA-256 hash is stored. `/pay/:token` exchanges the token for a short-lived HttpOnly payment-session cookie and immediately replaces the visible URL with `/pay/session/:id`. The public screen exposes only a masked customer label, order number, total, paid and due amounts. It never exposes mobile, notes or line items. One link can collect multiple partial test payments until the order is paid or the link is revoked.

## Authentication and security

Passwords use Argon2id. Google uses backend Authorization Code flow with PKCE, nonce validation and single-use Redis state. OAuth codes and tokens never enter React storage and are never persisted. A same-email password account is never silently merged: the user must first authenticate with the password and explicitly connect Google under **Security**.

Sessions use opaque random tokens in HttpOnly, Secure production cookies with SameSite=Lax. Redis stores only SHA-256 token hashes with TTLs. Sessions rotate after signup, login and authentication-method changes.

The API also enables Helmet, strict origin checks, distributed authentication rate limits, Zod validation, request IDs, structured Pino logs, centralized errors, user ownership checks, graceful shutdown and dependency readiness endpoints. Passwords, cookies, OAuth values, Gmail refresh tokens and storage credentials must never be logged or committed.

## Async work and email delivery

Order/payment changes and their outbox records commit in the same PostgreSQL transaction. A dispatcher publishes outbox rows to BullMQ with stable job IDs. The worker processes jobs independently from the API replicas and retries transient failures five times with exponential backoff.

Notification deliveries are uniquely keyed per domain event. Password signup and first-time Google signup write a welcome-email event in the same transaction that creates the user; returning logins never enqueue another welcome email. Nodemailer builds standards-compliant MIME messages, then the worker refreshes a short-lived Google OAuth access token and sends the encoded message through Gmail's HTTPS `users.messages.send` endpoint. SettleFlow stores Gmail's provider message ID and uses a deterministic opaque RFC Message-ID for retry deduplication. Notifications go to the SettleFlow account owner, not to the customer mobile number.

Email templates are owned locally under `apps/api/src/emails`. They use a shared email-safe SettleFlow layout, responsive mobile rules, inline styling, escaped dynamic values, visible fallback links and plain-text alternatives. Templates do not depend on a third-party editor at runtime; exported HTML from a visual builder such as Beefree can be adapted into the same local template layer when design changes are needed.

Email configuration belongs only to the worker. Setting `EMAIL_ENABLED=false` disables delivery and records new events as skipped. Gmail availability does not make worker readiness fail; token-refresh or send failures are recorded and retried by BullMQ.

The Gmail REST API uses outbound HTTPS, so it works on Railway plans that block SMTP. The long-lived refresh token and OAuth client secret are sealed worker-only variables; access tokens remain in worker memory and are never written to the database or logs.

## Local development

Requirements:

- Node.js 24 LTS
- pnpm 9.12.0
- Docker

```bash
cp .env.example .env
docker compose up -d postgres redis minio
pnpm install --frozen-lockfile
pnpm db:deploy
pnpm db:test:deploy
pnpm dev
```

Open:

- Application: `http://localhost:5173`
- API: `http://localhost:3000/api/v1`
- Worker health: `http://localhost:3001/health/ready`
- MinIO console: `http://localhost:9001`

Email delivery is disabled locally by default. Unit and integration tests inject a fake transport and never contact Google. To exercise real Gmail delivery locally, authorize the dedicated sender as described below and set:

```text
EMAIL_ENABLED=true
EMAIL_FROM=SettleFlow <coderpraveengupta@gmail.com>
GMAIL_API_CLIENT_ID=<oauth-client-id>
GMAIL_API_CLIENT_SECRET=<oauth-client-secret>
GMAIL_API_REFRESH_TOKEN=<offline-refresh-token>
GMAIL_API_SENDER=coderpraveengupta@gmail.com
```

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

Gmail REST API variables, used only by the worker in production:

```text
EMAIL_ENABLED=false
EMAIL_FROM=SettleFlow <coderpraveengupta@gmail.com>
GMAIL_API_CLIENT_ID=<oauth-client-id>
GMAIL_API_CLIENT_SECRET=<sealed-oauth-client-secret>
GMAIL_API_REFRESH_TOKEN=<sealed-offline-refresh-token>
GMAIL_API_SENDER=coderpraveengupta@gmail.com
```

Enable the Gmail API in the Google Cloud project and authorize the dedicated sender with only `https://www.googleapis.com/auth/gmail.send` plus offline access. Use a separate sender authorization grant from SettleFlow user login. Google access and refresh tokens must never enter React state or browser storage.

Storage uses provider-neutral `S3_*` variables. Railway's bucket is S3-compatible; this does not imply that SettleFlow uses AWS infrastructure.

Razorpay Test Mode variables, used by `settleflow` and needed by the worker for webhook jobs:

```text
PAYMENTS_ENABLED=false
PAYMENT_PROVIDER=razorpay
PAYMENT_MODE=test
PAYMENT_CURRENCY=INR
PAYMENT_SESSION_COOKIE_NAME=settleflow_payment
PAYMENT_SESSION_TTL_MINUTES=60
RAZORPAY_KEY_ID=<test-key-id>
RAZORPAY_KEY_SECRET=<sealed-test-key-secret>
RAZORPAY_WEBHOOK_SECRET=<sealed-webhook-secret>
```

Keep `PAYMENTS_ENABLED=false` until the Test Mode key pair and webhook are configured. Never place real credentials in `.env.example`, Git history, logs or browser code. The key ID is intentionally returned to Checkout; the key secret and webhook secret remain server-only.

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
- `GET /orders/:id/payment-link`
- `POST /orders/:id/payment-link`
- `DELETE /orders/:id/payment-link`
- `POST /orders/:id/payment-attempts`
- `GET /orders/summary`

`POST /orders/:id/payments` is the offline-payment endpoint. Dashboard search matches order number, customer name and customer mobile. `ORDER_LOCKED` prevents edits/deletes after a payment. `PAYMENT_EXCEEDS_BALANCE` returns `maxAllowedMinor`; `PAYMENT_ATTEMPT_ACTIVE` includes the active attempt and expiry so the UI can resolve the conflict.

### Online and public payment routes

- `GET /payments/config`
- `GET /payment-attempts/:id`
- `DELETE /payment-attempts/:id`
- `POST /payment-attempts/:id/confirm`
- `POST /public/payment-links/session`
- `GET /public/payment-links/:id`
- `POST /public/payment-links/:id/attempts`
- `GET /public/payment-attempts/:id`
- `POST /webhooks/razorpay`

Authenticated owners may create attempts and manage links. Public routes require the short-lived payment-session cookie after token exchange. The webhook requires a valid raw-body Razorpay signature and event ID; it does not use user cookies.

### Activity and exports

- `GET /activity`
- `POST /exports/orders`
- `GET /exports`
- `GET /exports/:id`
- `POST /exports/:id/retry`
- `GET /exports/:id/download`

CSV exports snapshot the dashboard filters and include customer name, customer mobile, due date, status, INR totals, payment count and timestamps. Downloads are authenticated and ownership checked.

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

`pnpm check` runs the complete sequence. Tests cover INR parsing, token hashing, 15-minute expiry, checkout/webhook signatures, provider-event deduplication, customer ownership and snapshots, Redis sessions/cache, password and Google authentication, order CRUD, offline/online payment locking, concurrent finalization, notification idempotency, CSV exports, accessible customer selection and responsive browser flows. Browser tests use an adapter that is accepted only under `NODE_ENV=test`; production cannot enable it.

## Railway production deployment

The production project uses one Singapore region:

- `settleflow`: two replicas serving React and `/api/v1` at the branded Railway origin.
- `worker`: one private replica processing outbox, BullMQ, exports and email.
- PostgreSQL primary, Redis and a private S3-compatible bucket.

The API pre-deploy command is `pnpm db:deploy`, ensuring migrations run once before the two replicas start. The API starts with `pnpm start:prod`; the worker starts with `pnpm start:worker`.

The Razorpay rollout is deliberately disabled-first:

1. Deploy the migration and code with `PAYMENTS_ENABLED=false`.
2. In Razorpay, switch to **Test Mode** and generate a Test API key pair.
3. Create a strong independent webhook secret and register `https://settleflow-production-77e1.up.railway.app/api/v1/webhooks/razorpay` for `payment.captured` and `payment.failed`.
4. Add the key secret and webhook secret as sealed Railway variables on `settleflow`; add payment-mode variables to both `settleflow` and `worker`.
5. Set `PAYMENTS_ENABLED=true`, deploy, and verify `success@razorpay`, `failure@razorpay`, partial payment, duplicate webhook and owner notification flows.

Live Mode is intentionally out of scope and configuration-blocked. A separate merchant activation, refund/dispute design, compliance and go-live review is required before real-money processing.

The production Gmail rollout uses this sequence:

1. Deploy code and database migration with `EMAIL_ENABLED=false`.
2. Verify API and worker readiness plus customer create/reuse behavior.
3. Remove obsolete email-provider variables.
4. Enable Gmail API and authorize `coderpraveengupta@gmail.com` for the `gmail.send` scope with offline access.
5. Add the OAuth client secret and refresh token as sealed variables on the worker only.
6. Redeploy the worker, enable email and verify an export-ready notification and authenticated download.

The production Google callback is:

```text
https://settleflow-production-77e1.up.railway.app/api/v1/auth/google/callback
```

## Troubleshooting

- **Customer does not appear:** search by full E.164 mobile and confirm the customer belongs to the signed-in account.
- **Duplicate mobile error:** select the existing customer returned by the directory instead of creating another record.
- **Legacy order cannot be edited:** select or create a saved customer first; locked legacy orders remain historical and cannot be edited.
- **Email skipped:** check `EMAIL_ENABLED`; skipped events are expected while Gmail authorization is disabled.
- **Gmail token refresh failed:** confirm the Gmail API is enabled, the refresh token belongs to `GMAIL_API_SENDER`, and the OAuth grant has not been revoked.
- **Gmail API returns 403:** verify the sender grant includes `https://www.googleapis.com/auth/gmail.send` and the API is enabled in the matching Google Cloud project.
- **Worker jobs retrying:** inspect worker logs and `notification_deliveries`; Gmail API errors are retained without exposing OAuth credentials.
- **Stale dashboard after a write:** verify Redis is reachable; mutations increment user cache versions and force primary reads temporarily.
- **OAuth account-link-required:** sign in with the existing password account, then connect the matching Google email under Security.
- **Online actions disabled:** `PAYMENTS_ENABLED` is false or Test Mode credentials have not been staged. This is the expected safe rollout state.
- **Checkout already active:** cancel it as the owner or wait up to 15 minutes. Offline payments are intentionally blocked during the reservation.
- **Checkout succeeded but still pending:** wait for the signed `payment.captured` webhook and inspect worker/outbox logs. Never manually trust browser success.
- **Webhook signature invalid:** confirm the configured secret matches the Razorpay Test Mode webhook and that no proxy transforms the raw request body.
- **Payment needs review:** provider amount, currency, order, captured status or remaining balance did not match. The order balance was not changed.

## Current boundaries

Version 1 supports INR, Razorpay Test Mode, offline payments, one mobile per customer record and account-owner email notifications. Real-money Live Mode, refunds, disputes, subscriptions, automated SMS, customer receipts, customer editing/deletion, multiple currencies, password reset, MFA, a provisioned read replica, staging and multi-region deployment remain outside this release.
