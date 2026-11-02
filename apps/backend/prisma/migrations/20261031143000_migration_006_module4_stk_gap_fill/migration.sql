-- Module 4 ACH+STK : compléments idempotents pour les bases existantes.

ALTER TABLE product_lots
  ADD COLUMN IF NOT EXISTS quarantine_reason TEXT,
  ADD COLUMN IF NOT EXISTS quarantine_updated_at TIMESTAMPTZ(6),
  ADD COLUMN IF NOT EXISTS storage_location VARCHAR(100);

ALTER TABLE goods_receipts
  ADD COLUMN IF NOT EXISTS idempotency_key VARCHAR(100);

CREATE UNIQUE INDEX IF NOT EXISTS uk_goods_receipts_pharmacy_idempotency
  ON goods_receipts (pharmacy_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_product_lots_initial_quantity_non_negative'
  ) THEN
    ALTER TABLE product_lots
      ADD CONSTRAINT chk_product_lots_initial_quantity_non_negative
      CHECK (initial_quantity >= 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_product_lots_current_quantity_non_negative'
  ) THEN
    ALTER TABLE product_lots
      ADD CONSTRAINT chk_product_lots_current_quantity_non_negative
      CHECK (current_quantity >= 0);
  END IF;
END $$;

ALTER TABLE inventory_counts
  ADD COLUMN IF NOT EXISTS inventory_type VARCHAR(20) NOT NULL DEFAULT 'COMPLET';

ALTER TABLE inventory_count_lines
  ADD COLUMN IF NOT EXISTS justification TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_inventory_counts_type'
  ) THEN
    ALTER TABLE inventory_counts
      ADD CONSTRAINT chk_inventory_counts_type
      CHECK (inventory_type IN ('COMPLET', 'TOURNANT'));
  END IF;
END $$;

REVOKE UPDATE, DELETE ON TABLE stock_movements FROM PUBLIC;
