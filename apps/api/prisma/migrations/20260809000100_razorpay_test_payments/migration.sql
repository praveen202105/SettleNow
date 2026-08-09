ALTER TABLE "order_items" RENAME COLUMN "unit_price_cents" TO "unit_price_minor";
ALTER TABLE "payments" RENAME COLUMN "amount_cents" TO "amount_minor";

ALTER TABLE "payments"
  ADD COLUMN "currency" TEXT NOT NULL DEFAULT 'INR',
  ADD COLUMN "source" TEXT NOT NULL DEFAULT 'offline',
  ADD COLUMN "mode" TEXT NOT NULL DEFAULT 'manual',
  ADD COLUMN "provider_payment_id" TEXT,
  ADD COLUMN "method" TEXT,
  ADD COLUMN "payment_attempt_id" TEXT;

ALTER TABLE "payments"
  ADD CONSTRAINT "payments_currency_check" CHECK ("currency" = 'INR'),
  ADD CONSTRAINT "payments_source_check" CHECK ("source" IN ('offline', 'razorpay')),
  ADD CONSTRAINT "payments_mode_check" CHECK ("mode" IN ('manual', 'test')),
  ADD CONSTRAINT "payments_source_metadata_check" CHECK (
    ("source" = 'offline' AND "mode" = 'manual') OR
    ("source" = 'razorpay' AND "mode" = 'test' AND "provider_payment_id" IS NOT NULL AND "payment_attempt_id" IS NOT NULL)
  );

CREATE TABLE "payment_collection_links" (
  "id" TEXT NOT NULL,
  "token_hash" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "revoked_at" TIMESTAMP(3),
  "order_id" TEXT NOT NULL,
  CONSTRAINT "payment_collection_links_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "payment_attempts" (
  "id" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'creating',
  "amount_minor" BIGINT NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'INR',
  "provider_order_id" TEXT,
  "provider_payment_id" TEXT,
  "provider_method" TEXT,
  "failure_code" TEXT,
  "failure_message" TEXT,
  "expires_at" TIMESTAMP(3) NOT NULL,
  "completed_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  "order_id" TEXT NOT NULL,
  "payment_link_id" TEXT,
  CONSTRAINT "payment_attempts_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "payment_attempts_status_check" CHECK (
    "status" IN ('creating', 'pending', 'captured', 'failed', 'expired', 'cancelled', 'needs_review')
  ),
  CONSTRAINT "payment_attempts_amount_check" CHECK ("amount_minor" > 0),
  CONSTRAINT "payment_attempts_currency_check" CHECK ("currency" = 'INR')
);

CREATE TABLE "payment_provider_events" (
  "id" TEXT NOT NULL,
  "provider_event_id" TEXT NOT NULL,
  "event_type" TEXT NOT NULL,
  "provider_payment_id" TEXT,
  "provider_order_id" TEXT,
  "amount_minor" BIGINT,
  "currency" TEXT,
  "payment_status" TEXT,
  "method" TEXT,
  "payload" JSONB NOT NULL DEFAULT '{}',
  "status" TEXT NOT NULL DEFAULT 'pending',
  "processed_at" TIMESTAMP(3),
  "error_message" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "payment_provider_events_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "payment_provider_events_status_check" CHECK ("status" IN ('pending', 'processed', 'failed'))
);

CREATE UNIQUE INDEX "payments_provider_payment_id_key" ON "payments"("provider_payment_id");
CREATE UNIQUE INDEX "payments_payment_attempt_id_key" ON "payments"("payment_attempt_id");
CREATE UNIQUE INDEX "payment_collection_links_token_hash_key" ON "payment_collection_links"("token_hash");
CREATE INDEX "payment_collection_links_order_id_created_at_idx" ON "payment_collection_links"("order_id", "created_at");
CREATE UNIQUE INDEX "payment_collection_links_one_active_per_order" ON "payment_collection_links"("order_id") WHERE "revoked_at" IS NULL;
CREATE UNIQUE INDEX "payment_attempts_provider_order_id_key" ON "payment_attempts"("provider_order_id");
CREATE UNIQUE INDEX "payment_attempts_provider_payment_id_key" ON "payment_attempts"("provider_payment_id");
CREATE INDEX "payment_attempts_order_id_status_expires_at_idx" ON "payment_attempts"("order_id", "status", "expires_at");
CREATE INDEX "payment_attempts_payment_link_id_created_at_idx" ON "payment_attempts"("payment_link_id", "created_at");
CREATE UNIQUE INDEX "payment_attempts_one_active_per_order" ON "payment_attempts"("order_id") WHERE "status" IN ('creating', 'pending');
CREATE UNIQUE INDEX "payment_provider_events_provider_event_id_key" ON "payment_provider_events"("provider_event_id");
CREATE INDEX "payment_provider_events_status_created_at_idx" ON "payment_provider_events"("status", "created_at");
CREATE INDEX "payment_provider_events_provider_order_id_idx" ON "payment_provider_events"("provider_order_id");

ALTER TABLE "payment_collection_links"
  ADD CONSTRAINT "payment_collection_links_order_id_fkey"
  FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "payment_attempts"
  ADD CONSTRAINT "payment_attempts_order_id_fkey"
  FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "payment_attempts_payment_link_id_fkey"
  FOREIGN KEY ("payment_link_id") REFERENCES "payment_collection_links"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "payments"
  ADD CONSTRAINT "payments_payment_attempt_id_fkey"
  FOREIGN KEY ("payment_attempt_id") REFERENCES "payment_attempts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
