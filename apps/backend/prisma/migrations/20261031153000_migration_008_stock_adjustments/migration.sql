-- Module 4 ACH+STK : demandes d'ajustement dédiées (STK-05).
CREATE TABLE IF NOT EXISTS stock_adjustments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pharmacy_id UUID NOT NULL REFERENCES pharmacies(id) ON DELETE RESTRICT,
  lot_id UUID NOT NULL REFERENCES product_lots(id) ON DELETE RESTRICT,
  requested_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  approved_by UUID REFERENCES users(id) ON DELETE RESTRICT,
  system_quantity INT NOT NULL,
  new_quantity INT NOT NULL CHECK (new_quantity >= 0),
  variance INT NOT NULL CHECK (variance <> 0),
  reason TEXT NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'DEMANDE' CHECK (status IN ('DEMANDE', 'VALIDE', 'REJETE')),
  rejection_reason TEXT,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  approved_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_stock_adjustments_pharmacy_status
  ON stock_adjustments (pharmacy_id, status);
