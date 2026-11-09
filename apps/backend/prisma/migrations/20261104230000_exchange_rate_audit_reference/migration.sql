ALTER TABLE "sales" ADD COLUMN "exchange_rate_id" UUID;

ALTER TABLE "sales"
  ADD CONSTRAINT "sales_exchange_rate_id_fkey"
  FOREIGN KEY ("exchange_rate_id") REFERENCES "exchange_rates"("id")
  ON DELETE RESTRICT ON UPDATE NO ACTION;

CREATE INDEX "sales_exchange_rate_id_idx" ON "sales"("exchange_rate_id");
