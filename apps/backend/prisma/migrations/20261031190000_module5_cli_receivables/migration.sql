-- Module CLI : règlements idempotents et imputation FIFO des créances.
ALTER TABLE "customer_payments"
  ADD COLUMN IF NOT EXISTS "currency" VARCHAR(3) NOT NULL DEFAULT 'CDF',
  ADD COLUMN IF NOT EXISTS "idempotency_key" VARCHAR(100);

CREATE UNIQUE INDEX IF NOT EXISTS "uk_customer_payments_idempotency"
  ON "customer_payments" ("pharmacy_id", "idempotency_key")
  WHERE "idempotency_key" IS NOT NULL;

CREATE INDEX IF NOT EXISTS "idx_customer_payments_customer_date"
  ON "customer_payments" ("customer_id", "created_at" DESC);

CREATE TABLE IF NOT EXISTS "customer_payment_allocations" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "customer_payment_id" UUID NOT NULL,
  "sale_id" UUID NOT NULL,
  "amount_cdf" DECIMAL(15,2) NOT NULL CHECK ("amount_cdf" > 0),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "customer_payment_allocations_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "uk_customer_payment_allocation" UNIQUE ("customer_payment_id", "sale_id"),
  CONSTRAINT "customer_payment_allocations_customer_payment_id_fkey"
    FOREIGN KEY ("customer_payment_id") REFERENCES "customer_payments"("id") ON DELETE CASCADE,
  CONSTRAINT "customer_payment_allocations_sale_id_fkey"
    FOREIGN KEY ("sale_id") REFERENCES "sales"("id") ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS "idx_customer_payment_allocations_sale"
  ON "customer_payment_allocations" ("sale_id");
