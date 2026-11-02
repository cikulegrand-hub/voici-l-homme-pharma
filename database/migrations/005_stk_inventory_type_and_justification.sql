-- Module 4 ACH+STK : type d'inventaire, justification d'écart, restriction SQL du journal

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
