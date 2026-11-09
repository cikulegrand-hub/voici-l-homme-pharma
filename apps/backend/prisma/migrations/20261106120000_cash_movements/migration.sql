-- FIN-05 : apports et retraits de caisse
CREATE TYPE "cash_movement_type" AS ENUM ('APPORT', 'RETRAIT');

CREATE TABLE "cash_movements" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "pharmacy_id" UUID NOT NULL,
  "cash_session_id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "type" "cash_movement_type" NOT NULL,
  "amount_cdf" DECIMAL(15,2) NOT NULL DEFAULT 0.00,
  "amount_usd" DECIMAL(15,2) NOT NULL DEFAULT 0.00,
  "exchange_rate_id" UUID,
  "exchange_rate_applied" DECIMAL(12,4),
  "reason" VARCHAR(500) NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "cash_movements_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "cash_movements_pharmacy_id_fkey" FOREIGN KEY ("pharmacy_id") REFERENCES "pharmacies"("id") ON DELETE RESTRICT ON UPDATE NO ACTION,
  CONSTRAINT "cash_movements_cash_session_id_fkey" FOREIGN KEY ("cash_session_id") REFERENCES "cash_sessions"("id") ON DELETE RESTRICT ON UPDATE NO ACTION,
  CONSTRAINT "cash_movements_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION,
  CONSTRAINT "cash_movements_exchange_rate_id_fkey" FOREIGN KEY ("exchange_rate_id") REFERENCES "exchange_rates"("id") ON DELETE SET NULL ON UPDATE NO ACTION,
  CONSTRAINT "cash_movements_positive_amounts" CHECK ("amount_cdf" >= 0 AND "amount_usd" >= 0 AND ("amount_cdf" > 0 OR "amount_usd" > 0))
);

CREATE INDEX "cash_movements_pharmacy_id_created_at_idx" ON "cash_movements"("pharmacy_id", "created_at" DESC);
CREATE INDEX "cash_movements_cash_session_id_created_at_idx" ON "cash_movements"("cash_session_id", "created_at" DESC);
