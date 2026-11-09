ALTER TABLE "customer_payments"
  ADD COLUMN "exchange_rate_id" UUID,
  ADD COLUMN "exchange_rate_applied" DECIMAL(12,4);

ALTER TABLE "purchase_orders"
  ADD COLUMN "exchange_rate_id" UUID,
  ADD COLUMN "exchange_rate_applied" DECIMAL(12,4);

ALTER TABLE "goods_receipts"
  ADD COLUMN "exchange_rate_id" UUID,
  ADD COLUMN "exchange_rate_applied" DECIMAL(12,4);

CREATE INDEX "customer_payments_exchange_rate_id_idx" ON "customer_payments"("exchange_rate_id");
CREATE INDEX "purchase_orders_exchange_rate_id_idx" ON "purchase_orders"("exchange_rate_id");
CREATE INDEX "goods_receipts_exchange_rate_id_idx" ON "goods_receipts"("exchange_rate_id");

ALTER TABLE "customer_payments" ADD CONSTRAINT "customer_payments_exchange_rate_id_fkey"
  FOREIGN KEY ("exchange_rate_id") REFERENCES "exchange_rates"("id") ON DELETE SET NULL ON UPDATE NO ACTION;
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_exchange_rate_id_fkey"
  FOREIGN KEY ("exchange_rate_id") REFERENCES "exchange_rates"("id") ON DELETE SET NULL ON UPDATE NO ACTION;
ALTER TABLE "goods_receipts" ADD CONSTRAINT "goods_receipts_exchange_rate_id_fkey"
  FOREIGN KEY ("exchange_rate_id") REFERENCES "exchange_rates"("id") ON DELETE SET NULL ON UPDATE NO ACTION;
