-- ==============================================================================
-- PROJET : VOICI L'HOMME PHARMA (VHP-CDC-001)
-- FICHIER : migrations/004_master_integrity_and_features.sql
-- DESCRIPTION : Migration corrective complète (Sécurité, Intégrité, Tables manquantes)
-- APPLICATION : Soumise à validation explicite avant exécution
-- ==============================================================================

-- ==============================================================================
-- SECTION A : SÉCURITÉ & RESTRICTIONS D'ACCÈS (RLS & REVOKE)
-- ==============================================================================

-- 1. RLS activée sur toutes les tables existantes (idempotent)
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN (SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations')
    LOOP
        EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', r.tablename);
    END LOOP;
END $$;

-- 2. Révocation des privilèges par défaut et existants pour anon et authenticated
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated;
REVOKE ALL ON ALL ROUTINES IN SCHEMA public FROM anon, authenticated;

ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON ROUTINES FROM anon, authenticated;

-- ==============================================================================
-- SECTION B : SUPPRESSION DES ANCIENNES FONCTIONS & SÉQUENCE OBSOLÈTES (SECTION D)
-- ==============================================================================

DROP FUNCTION IF EXISTS deduct_stock_fefo(uuid, uuid, integer, uuid, uuid) CASCADE;
DROP FUNCTION IF EXISTS update_cump_on_reception(uuid, integer, numeric) CASCADE;
DROP FUNCTION IF EXISTS generate_next_invoice_number(uuid) CASCADE;
DROP SEQUENCE IF EXISTS invoice_seq_tracker;

-- ==============================================================================
-- SECTION C : EXTENSION TRIGRAM & NOUVELLES COLONNES SUR TABLES EXISTANTES
-- ==============================================================================

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- CUMP stocké séparément du prix de vente sur les produits
ALTER TABLE products ADD COLUMN IF NOT EXISTS cump_cdf DECIMAL(15,2) NOT NULL DEFAULT 0.00;

-- Plafond de remise par rôle (RG-10)
ALTER TABLE roles ADD COLUMN IF NOT EXISTS max_discount_percent DECIMAL(5,2) NOT NULL DEFAULT 0.00;

-- Initialisation des plafonds de remise selon le CDC
UPDATE roles SET max_discount_percent = 100.00 WHERE name = 'ADMIN';
UPDATE roles SET max_discount_percent = 15.00 WHERE name = 'PHARMACIEN';
UPDATE roles SET max_discount_percent = 5.00 WHERE name = 'CAISSIER';
UPDATE roles SET max_discount_percent = 0.00 WHERE name = 'STOCK';

-- Ajout de pharmacy_id sur product_barcodes pour unicité multi-officine
ALTER TABLE product_barcodes ADD COLUMN IF NOT EXISTS pharmacy_id UUID;

-- Remplissage de pharmacy_id depuis la table products
UPDATE product_barcodes b
SET pharmacy_id = p.pharmacy_id
FROM products p
WHERE b.product_id = p.id AND b.pharmacy_id IS NULL;

-- Contrainte NOT NULL et FK sur product_barcodes.pharmacy_id
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'product_barcodes' AND column_name = 'pharmacy_id' AND is_nullable = 'YES') THEN
        ALTER TABLE product_barcodes ALTER COLUMN pharmacy_id SET NOT NULL;
        ALTER TABLE product_barcodes ADD CONSTRAINT fk_product_barcodes_pharmacy FOREIGN KEY (pharmacy_id) REFERENCES pharmacies(id) ON DELETE CASCADE;
    END IF;
END $$;

-- ==============================================================================
-- SECTION D : NOUVELLES TABLES MÉTIER REQUISES (CDC & ÉTAPE 3.C)
-- ==============================================================================

-- 1. Séquenceur officiel sans trou par officine et par exercice fiscal (RG-05, VTE-10)
CREATE TABLE IF NOT EXISTS invoice_sequences (
    pharmacy_id UUID NOT NULL REFERENCES pharmacies(id) ON DELETE CASCADE,
    fiscal_year INT NOT NULL,
    last_number INT NOT NULL DEFAULT 0,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (pharmacy_id, fiscal_year)
);
ALTER TABLE invoice_sequences ENABLE ROW LEVEL SECURITY;

-- 2. Bons de réception physique et lignes de réception (STK-01, ACH-04)
CREATE TABLE IF NOT EXISTS goods_receipts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pharmacy_id UUID NOT NULL REFERENCES pharmacies(id) ON DELETE RESTRICT,
    purchase_order_id UUID REFERENCES purchase_orders(id) ON DELETE SET NULL,
    receipt_number VARCHAR(100) NOT NULL,
    received_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    supplier_invoice_number VARCHAR(100),
    notes TEXT,
    received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uk_goods_receipts_number UNIQUE (pharmacy_id, receipt_number)
);
ALTER TABLE goods_receipts ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS goods_receipt_lines (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    receipt_id UUID NOT NULL REFERENCES goods_receipts(id) ON DELETE CASCADE,
    purchase_order_item_id UUID REFERENCES purchase_order_items(id) ON DELETE SET NULL,
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
    lot_id UUID NOT NULL REFERENCES product_lots(id) ON DELETE RESTRICT,
    ordered_quantity INT NOT NULL DEFAULT 0,
    received_quantity INT NOT NULL CHECK (received_quantity > 0),
    unit_purchase_price_cdf DECIMAL(15,2) NOT NULL DEFAULT 0.00,
    unit_purchase_price_usd DECIMAL(15,2) NOT NULL DEFAULT 0.00
);
ALTER TABLE goods_receipt_lines ENABLE ROW LEVEL SECURITY;

-- 3. Sessions et lignes d'inventaire physique (STK-11)
CREATE TABLE IF NOT EXISTS inventory_counts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pharmacy_id UUID NOT NULL REFERENCES pharmacies(id) ON DELETE RESTRICT,
    reference VARCHAR(100) NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'EN_COURS' CHECK (status IN ('EN_COURS', 'VALIDE', 'ANNULE')),
    notes TEXT,
    created_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    validated_by UUID REFERENCES users(id) ON DELETE RESTRICT,
    validated_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uk_inventory_counts_ref UNIQUE (pharmacy_id, reference)
);
ALTER TABLE inventory_counts ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS inventory_count_lines (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    inventory_id UUID NOT NULL REFERENCES inventory_counts(id) ON DELETE CASCADE,
    lot_id UUID NOT NULL REFERENCES product_lots(id) ON DELETE RESTRICT,
    system_quantity INT NOT NULL,
    counted_quantity INT NOT NULL,
    variance INT NOT NULL GENERATED ALWAYS AS (counted_quantity - system_quantity) STORED
);
ALTER TABLE inventory_count_lines ENABLE ROW LEVEL SECURITY;

-- 4. Avoirs et retours clients (VTE-13, RG-04)
CREATE TABLE IF NOT EXISTS credit_notes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pharmacy_id UUID NOT NULL REFERENCES pharmacies(id) ON DELETE RESTRICT,
    sale_id UUID NOT NULL REFERENCES sales(id) ON DELETE RESTRICT,
    credit_note_number VARCHAR(100) NOT NULL,
    customer_id UUID REFERENCES customers(id) ON DELETE RESTRICT,
    total_amount_cdf DECIMAL(15,2) NOT NULL DEFAULT 0.00,
    total_amount_usd DECIMAL(15,2) NOT NULL DEFAULT 0.00,
    reason TEXT NOT NULL,
    created_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uk_credit_notes_num UNIQUE (pharmacy_id, credit_note_number)
);
ALTER TABLE credit_notes ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS credit_note_lines (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    credit_note_id UUID NOT NULL REFERENCES credit_notes(id) ON DELETE CASCADE,
    sale_item_id UUID NOT NULL REFERENCES sale_items(id) ON DELETE RESTRICT,
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
    lot_id UUID NOT NULL REFERENCES product_lots(id) ON DELETE RESTRICT,
    quantity INT NOT NULL CHECK (quantity > 0),
    unit_price_cdf DECIMAL(15,2) NOT NULL,
    restocked BOOLEAN NOT NULL DEFAULT TRUE
);
ALTER TABLE credit_note_lines ENABLE ROW LEVEL SECURITY;

-- 5. Règlements de créances clients (CLI-04)
CREATE TABLE IF NOT EXISTS customer_payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pharmacy_id UUID NOT NULL REFERENCES pharmacies(id) ON DELETE RESTRICT,
    customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
    cash_session_id UUID REFERENCES cash_sessions(id) ON DELETE RESTRICT,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    amount_paid_cdf DECIMAL(15,2) NOT NULL CHECK (amount_paid_cdf > 0),
    payment_method VARCHAR(50) NOT NULL DEFAULT 'ESPECES',
    receipt_reference VARCHAR(100),
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE customer_payments ENABLE ROW LEVEL SECURITY;

-- 6. Jetons de rafraîchissement révocables (AUT-03)
CREATE TABLE IF NOT EXISTS refresh_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash VARCHAR(255) NOT NULL UNIQUE,
    expires_at TIMESTAMPTZ NOT NULL,
    is_revoked BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE refresh_tokens ENABLE ROW LEVEL SECURITY;

-- 7. Paramètres d'officine clé-valeur (SET-01)
CREATE TABLE IF NOT EXISTS settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pharmacy_id UUID NOT NULL REFERENCES pharmacies(id) ON DELETE CASCADE,
    key VARCHAR(100) NOT NULL,
    value JSONB NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uk_settings_key UNIQUE (pharmacy_id, key)
);
ALTER TABLE settings ENABLE ROW LEVEL SECURITY;

-- ==============================================================================
-- SECTION E : CONTRAINTES D'UNICITÉ PAR OFFICINE & NETTOYAGE DES ANCIENNES
-- ==============================================================================

-- Drop des unicités globales pour basculer en unicités composées par officine
ALTER TABLE customers DROP CONSTRAINT IF EXISTS customers_code_key;
ALTER TABLE customers ADD CONSTRAINT uk_customers_pharmacy_code UNIQUE (pharmacy_id, code);

ALTER TABLE purchase_orders DROP CONSTRAINT IF EXISTS purchase_orders_order_number_key;
ALTER TABLE purchase_orders ADD CONSTRAINT uk_purchase_orders_pharmacy_num UNIQUE (pharmacy_id, order_number);

ALTER TABLE sales DROP CONSTRAINT IF EXISTS sales_invoice_number_key;
ALTER TABLE sales ADD CONSTRAINT uk_sales_pharmacy_invoice UNIQUE (pharmacy_id, invoice_number);

ALTER TABLE sales DROP CONSTRAINT IF EXISTS uk_sales_seq_fiscal;
ALTER TABLE sales ADD CONSTRAINT uk_sales_pharmacy_seq_fiscal UNIQUE (pharmacy_id, fiscal_year, sequence_number);

-- Idempotency key scopée par officine
ALTER TABLE sales DROP CONSTRAINT IF EXISTS sales_idempotency_key_key;
CREATE UNIQUE INDEX IF NOT EXISTS uk_sales_pharmacy_idempotency ON sales (pharmacy_id, idempotency_key) WHERE idempotency_key IS NOT NULL;

-- Unicités des catégories et fournisseurs
ALTER TABLE product_categories ADD CONSTRAINT uk_product_categories_pharmacy_name UNIQUE (pharmacy_id, name);
ALTER TABLE suppliers ADD CONSTRAINT uk_suppliers_pharmacy_name UNIQUE (pharmacy_id, name);
ALTER TABLE expense_categories ADD CONSTRAINT uk_expense_categories_pharmacy_name UNIQUE (pharmacy_id, name);

-- Taux de change : un seul taux par devise et date effective
ALTER TABLE exchange_rates ADD CONSTRAINT uk_exchange_rates_pharmacy_date UNIQUE (pharmacy_id, base_currency, target_currency, effective_date);

-- Codes-barres scopés par officine
ALTER TABLE product_barcodes DROP CONSTRAINT IF EXISTS product_barcodes_barcode_key;
ALTER TABLE product_barcodes ADD CONSTRAINT uk_product_barcodes_pharmacy_barcode UNIQUE (pharmacy_id, barcode);

-- ==============================================================================
-- SECTION F : CONTRAINTES CHECK & INTÉGRITÉ MÉTIER
-- ==============================================================================

-- 1. stock_movements
ALTER TABLE stock_movements ADD CONSTRAINT chk_stock_movements_qty CHECK (quantity > 0);
ALTER TABLE stock_movements ADD CONSTRAINT chk_stock_movements_direction CHECK (direction IN ('IN', 'OUT'));

-- 2. Devises valides
ALTER TABLE sales ADD CONSTRAINT chk_sales_currency CHECK (currency IN ('CDF', 'USD'));
ALTER TABLE exchange_rates ADD CONSTRAINT chk_exchange_rates_base CHECK (base_currency IN ('CDF', 'USD'));
ALTER TABLE exchange_rates ADD CONSTRAINT chk_exchange_rates_target CHECK (target_currency IN ('CDF', 'USD'));
ALTER TABLE exchange_rates ADD CONSTRAINT chk_exchange_rates_diff CHECK (base_currency <> target_currency);
ALTER TABLE exchange_rates ADD CONSTRAINT chk_exchange_rates_positive CHECK (rate > 0);

-- 3. Une seule session de caisse OUVERTE par utilisateur (RG-12)
CREATE UNIQUE INDEX IF NOT EXISTS uk_single_open_cash_session_per_user ON cash_sessions (user_id) WHERE (status = 'OUVERTE');

-- ==============================================================================
-- SECTION G : CORRECTION DES RÈGLES ON DELETE (RESTRICT AU LIEU DE SET NULL/CASCADE)
-- ==============================================================================

-- 1. sales.customer_id : RESTRICT
ALTER TABLE sales DROP CONSTRAINT IF EXISTS sales_customer_id_fkey;
ALTER TABLE sales ADD CONSTRAINT sales_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE RESTRICT;

-- 2. audit_logs.user_id : RESTRICT
ALTER TABLE audit_logs DROP CONSTRAINT IF EXISTS audit_logs_user_id_fkey;
ALTER TABLE audit_logs ADD CONSTRAINT audit_logs_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT;

-- 3. expenses.cash_session_id : RESTRICT
ALTER TABLE expenses DROP CONSTRAINT IF EXISTS expenses_cash_session_id_fkey;
ALTER TABLE expenses ADD CONSTRAINT expenses_cash_session_id_fkey FOREIGN KEY (cash_session_id) REFERENCES cash_sessions(id) ON DELETE RESTRICT;

-- 4. price_history.product_id : RESTRICT
ALTER TABLE price_history DROP CONSTRAINT IF EXISTS price_history_product_id_fkey;
ALTER TABLE price_history ADD CONSTRAINT price_history_product_id_fkey FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE RESTRICT;

-- ==============================================================================
-- SECTION H : TRIGGERS D'INALTEABILITÉ (REMPLACEMENT DES RULES)
-- ==============================================================================

-- Suppression des anciennes RULES PostgreSQL
DROP RULE IF EXISTS prevent_sale_delete ON sales;
DROP RULE IF EXISTS prevent_audit_delete ON audit_logs;
DROP RULE IF EXISTS prevent_audit_update ON audit_logs;

-- Fonction générique d'interdiction stricte de modification / suppression
CREATE OR REPLACE FUNCTION raise_immutable_entity_exception()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'Opération interdite (%) : cet enregistrement est inaltérable pour des raisons d''intégrité et d''audit réglementaire (AUD-01, RG-04).', TG_OP;
END;
$$ LANGUAGE plpgsql;

-- 1. audit_logs : strictement inaltérable
DROP TRIGGER IF EXISTS trg_audit_logs_immutable ON audit_logs;
CREATE TRIGGER trg_audit_logs_immutable
BEFORE UPDATE OR DELETE ON audit_logs
FOR EACH ROW EXECUTE FUNCTION raise_immutable_entity_exception();

-- 2. stock_movements : strictement inaltérable
DROP TRIGGER IF EXISTS trg_stock_movements_immutable ON stock_movements;
CREATE TRIGGER trg_stock_movements_immutable
BEFORE UPDATE OR DELETE ON stock_movements
FOR EACH ROW EXECUTE FUNCTION raise_immutable_entity_exception();

-- 3. sale_items : strictement inaltérable
DROP TRIGGER IF EXISTS trg_sale_items_immutable ON sale_items;
CREATE TRIGGER trg_sale_items_immutable
BEFORE UPDATE OR DELETE ON sale_items
FOR EACH ROW EXECUTE FUNCTION raise_immutable_entity_exception();

-- 4. sale_payments : strictement inaltérable
DROP TRIGGER IF EXISTS trg_sale_payments_immutable ON sale_payments;
CREATE TRIGGER trg_sale_payments_immutable
BEFORE UPDATE OR DELETE ON sale_payments
FOR EACH ROW EXECUTE FUNCTION raise_immutable_entity_exception();

-- 5. sales : DELETE strictement interdit, UPDATE limité à l'annulation / avoir
CREATE OR REPLACE FUNCTION check_sales_immutability()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'Suppression interdite : une vente enregistrée ne peut jamais être effacée physiquement (RG-04). Utilisez une annulation motivée avec avoir.';
    END IF;

    IF TG_OP = 'UPDATE' THEN
        -- Si la vente est déjà validée, seuls le statut d'annulation et ses métadonnées peuvent être modifiés
        IF OLD.status = 'VALIDEE' THEN
            IF NEW.id <> OLD.id OR
               NEW.pharmacy_id <> OLD.pharmacy_id OR
               NEW.invoice_number <> OLD.invoice_number OR
               NEW.sequence_number <> OLD.sequence_number OR
               NEW.fiscal_year <> OLD.fiscal_year OR
               NEW.customer_id IS DISTINCT FROM OLD.customer_id OR
               NEW.user_id <> OLD.user_id OR
               NEW.subtotal_cdf <> OLD.subtotal_cdf OR
               NEW.discount_cdf <> OLD.discount_cdf OR
               NEW.total_amount_cdf <> OLD.total_amount_cdf OR
               NEW.total_amount_usd <> OLD.total_amount_usd OR
               NEW.exchange_rate_applied <> OLD.exchange_rate_applied OR
               NEW.created_at <> OLD.created_at THEN
                RAISE EXCEPTION 'Modification interdite : les montants, lignes, clients et numérotations d''une vente validée sont inaltérables (RG-04).';
            END IF;

            IF NEW.status NOT IN ('ANNULEE', 'AVOIR') AND OLD.status = 'VALIDEE' THEN
                RAISE EXCEPTION 'Transition de statut invalide pour une vente validée (seules les transitions vers ANNULEE ou AVOIR sont permises).';
            END IF;
        ELSIF OLD.status IN ('ANNULEE', 'AVOIR') THEN
            RAISE EXCEPTION 'Une vente déjà annulée ou passée en avoir ne peut plus être modifiée (RG-04).';
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sales_immutability ON sales;
DROP TRIGGER IF EXISTS trg_protect_validated_sales ON sales;
CREATE TRIGGER trg_sales_immutability
BEFORE UPDATE OR DELETE ON sales
FOR EACH ROW EXECUTE FUNCTION check_sales_immutability();

-- ==============================================================================
-- SECTION I : INDEX DE PERFORMANCE COMPLÉMENTAIRES
-- ==============================================================================

-- Index GIN trigramme pour recherche instantanée floue (CAT-05)
CREATE INDEX IF NOT EXISTS idx_products_name_trgm ON products USING gin (name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_products_dci_trgm ON products USING gin (dci gin_trgm_ops);

-- Index partiel sur lots vendables (RG-01, RG-03)
CREATE INDEX IF NOT EXISTS idx_product_lots_vendables ON product_lots (product_id, expiry_date)
WHERE (is_quarantined = FALSE AND current_quantity > 0);

-- Index sur clés étrangères et dates de requêtes fréquentes
CREATE INDEX IF NOT EXISTS idx_sales_pharmacy_created ON sales (pharmacy_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_stock_movements_lot_created ON stock_movements (lot_id, created_at DESC);

-- ACH/STK increment 1 : idempotence des réceptions, traçabilité quarantaine
ALTER TABLE product_lots
  ADD COLUMN IF NOT EXISTS quarantine_reason TEXT,
  ADD COLUMN IF NOT EXISTS quarantine_updated_at TIMESTAMPTZ(6);

ALTER TABLE goods_receipts
  ADD COLUMN IF NOT EXISTS idempotency_key VARCHAR(100);

CREATE UNIQUE INDEX IF NOT EXISTS uk_goods_receipts_pharmacy_idempotency
  ON goods_receipts (pharmacy_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

ALTER TABLE product_lots
  ADD CONSTRAINT chk_product_lots_initial_quantity_non_negative
  CHECK (initial_quantity >= 0);

ALTER TABLE product_lots
  ADD CONSTRAINT chk_product_lots_current_quantity_non_negative
  CHECK (current_quantity >= 0);
