-- Migration Révision 2.0 : Vente, Hors-ligne, Conflits et Gestion des Paniers en attente
-- Date: 2026-11-03

-- 1. Extension des statuts de vente
ALTER TYPE sale_status ADD VALUE IF NOT EXISTS 'BROUILLON';
ALTER TYPE sale_status ADD VALUE IF NOT EXISTS 'EN_ATTENTE_PAIEMENT';
ALTER TYPE sale_status ADD VALUE IF NOT EXISTS 'PARTIELLEMENT_PAYEE';
ALTER TYPE sale_status ADD VALUE IF NOT EXISTS 'RETOURNEE';
ALTER TYPE sale_status ADD VALUE IF NOT EXISTS 'CONFLIT';

-- 2. Champs de suivi hors-ligne, synchronisation et résolution de conflit sur sales
ALTER TABLE sales ADD COLUMN IF NOT EXISTS is_offline BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE sales ADD COLUMN IF NOT EXISTS sync_status VARCHAR(50) DEFAULT 'SYNCHRONISE';
ALTER TABLE sales ADD COLUMN IF NOT EXISTS offline_created_at TIMESTAMPTZ NULL;
ALTER TABLE sales ADD COLUMN IF NOT EXISTS offline_exchange_rate NUMERIC(12, 4) NULL;
ALTER TABLE sales ADD COLUMN IF NOT EXISTS conflict_details JSONB NULL;
ALTER TABLE sales ADD COLUMN IF NOT EXISTS resolved_by UUID REFERENCES users(id) NULL;
ALTER TABLE sales ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ NULL;
ALTER TABLE sales ADD COLUMN IF NOT EXISTS resolution_action VARCHAR(50) NULL;
ALTER TABLE sales ADD COLUMN IF NOT EXISTS resolution_notes TEXT NULL;

CREATE INDEX IF NOT EXISTS idx_sales_sync_status ON sales(pharmacy_id, sync_status);
CREATE INDEX IF NOT EXISTS idx_sales_is_offline ON sales(pharmacy_id, is_offline);

-- 3. Gestion avancée des paniers en attente (held_carts)
CREATE TABLE IF NOT EXISTS held_carts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pharmacy_id UUID NOT NULL REFERENCES pharmacies(id) ON DELETE RESTRICT,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  reference_name VARCHAR(255) NOT NULL,
  items JSONB NOT NULL,
  saved_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resumed_at TIMESTAMPTZ NULL
);

ALTER TABLE held_carts ADD COLUMN IF NOT EXISTS status VARCHAR(50) NOT NULL DEFAULT 'ACTIF';
ALTER TABLE held_carts ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '24 hours');
ALTER TABLE held_carts ADD COLUMN IF NOT EXISTS customer_id UUID REFERENCES customers(id) NULL;

CREATE INDEX IF NOT EXISTS idx_held_carts_status ON held_carts(pharmacy_id, status, saved_at DESC);
CREATE INDEX IF NOT EXISTS idx_held_carts_expires_at ON held_carts(expires_at) WHERE status = 'ACTIF';

