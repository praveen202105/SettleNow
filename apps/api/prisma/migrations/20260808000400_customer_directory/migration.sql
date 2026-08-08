CREATE TABLE "customers" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "mobile" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "user_id" TEXT NOT NULL,

    CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "orders"
ADD COLUMN "customer_id" TEXT,
ADD COLUMN "customer_mobile" TEXT;

CREATE UNIQUE INDEX "customers_user_id_mobile_key" ON "customers"("user_id", "mobile");
CREATE INDEX "customers_user_id_name_idx" ON "customers"("user_id", "name");
CREATE INDEX "orders_customer_id_idx" ON "orders"("customer_id");

ALTER TABLE "customers"
ADD CONSTRAINT "customers_user_id_fkey"
FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "orders"
ADD CONSTRAINT "orders_customer_id_fkey"
FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
