CREATE TABLE IF NOT EXISTS held_carts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pharmacy_id UUID NOT NULL REFERENCES pharmacies(id) ON DELETE RESTRICT,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  reference_name VARCHAR(255) NOT NULL,
  items JSONB NOT NULL,
  saved_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resumed_at TIMESTAMPTZ NULL
);
CREATE INDEX IF NOT EXISTS idx_held_carts_active ON held_carts(pharmacy_id, resumed_at, saved_at DESC);
