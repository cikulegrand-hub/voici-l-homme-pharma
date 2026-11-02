-- Module 4 ACH+STK : emplacement propre à chaque lot.
ALTER TABLE product_lots
  ADD COLUMN IF NOT EXISTS storage_location VARCHAR(100);
