CREATE TABLE IF NOT EXISTS sale_payment_reversals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id uuid NOT NULL REFERENCES sales(id),
  payment_id uuid NOT NULL REFERENCES sale_payments(id),
  amount_cdf numeric(18,2) NOT NULL CHECK (amount_cdf >= 0),
  payment_method payment_method NOT NULL,
  reason text NOT NULL,
  created_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_sale_payment_reversals_sale ON sale_payment_reversals(sale_id);
