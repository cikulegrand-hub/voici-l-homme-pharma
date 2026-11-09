CREATE TABLE IF NOT EXISTS sale_cancellation_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pharmacy_id UUID NOT NULL REFERENCES pharmacies(id) ON DELETE CASCADE,
  sale_id UUID NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
  requested_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  reason TEXT NOT NULL,
  restock_items BOOLEAN NOT NULL DEFAULT TRUE,
  items JSONB,
  status VARCHAR(30) NOT NULL DEFAULT 'EN_ATTENTE',
  reviewed_by UUID REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  review_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sale_cancel_requests_pharmacy_status
  ON sale_cancellation_requests (pharmacy_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sale_cancel_requests_sale_status
  ON sale_cancellation_requests (sale_id, status);
