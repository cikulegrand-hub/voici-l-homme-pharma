-- ==============================================================================
-- VOICI L'HOMME PHARMA (VHP-CDC-001)
-- FICHIER : migrations/004_corrective_indexes_and_integrity.sql
-- DESCRIPTION : Index de performance critiques & triggers d'intégrité métier
-- ==============================================================================

-- 1. INDEX DE PERFORMANCE CRITIQUES (Recherches & Jointures fréquentes)
CREATE INDEX IF NOT EXISTS idx_products_pharmacy_active ON products(pharmacy_id, is_active);
CREATE INDEX IF NOT EXISTS idx_products_dci ON products(dci);
CREATE INDEX IF NOT EXISTS idx_products_category ON products(category_id);

CREATE INDEX IF NOT EXISTS idx_product_barcodes_barcode ON product_barcodes(barcode);

CREATE INDEX IF NOT EXISTS idx_product_lots_fefo ON product_lots(product_id, expiry_date ASC, current_quantity)
WHERE is_quarantined = FALSE AND current_quantity > 0;

CREATE INDEX IF NOT EXISTS idx_stock_movements_lot ON stock_movements(lot_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_pharmacy_date ON stock_movements(pharmacy_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_sales_pharmacy_seq ON sales(pharmacy_id, fiscal_year, sequence_number);
CREATE INDEX IF NOT EXISTS idx_sales_created_at ON sales(pharmacy_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sale_items_sale ON sale_items(sale_id);
CREATE INDEX IF NOT EXISTS idx_sale_payments_sale ON sale_payments(sale_id);

CREATE INDEX IF NOT EXISTS idx_cash_sessions_user_status ON cash_sessions(user_id, status);

CREATE INDEX IF NOT EXISTS idx_audit_logs_pharmacy_date ON audit_logs(pharmacy_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity ON audit_logs(entity_name, entity_id);

-- 2. TRIGGER D'IMMUTABILITÉ DES VENTES VALIDÉES (RG-04, VTE-13)
CREATE OR REPLACE FUNCTION prevent_validated_sale_modification()
RETURNS TRIGGER AS $$
BEGIN
    IF OLD.status = 'VALIDEE' THEN
        RAISE EXCEPTION 'RG-04 : Une vente validée (%) est strictement inaltérable et ne peut être ni modifiée ni supprimée. Utilisez une facture d''avoir.', OLD.invoice_number;
    END IF;
    RETURN OLD;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_protect_validated_sales ON sales;
CREATE TRIGGER trg_protect_validated_sales
BEFORE UPDATE OR DELETE ON sales
FOR EACH ROW
EXECUTE FUNCTION prevent_validated_sale_modification();

-- 3. TRIGGER AUTOMATIQUE POUR UPDATED_AT
CREATE OR REPLACE FUNCTION trigger_set_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_pharmacies_updated_at ON pharmacies;
CREATE TRIGGER trg_pharmacies_updated_at BEFORE UPDATE ON pharmacies FOR EACH ROW EXECUTE FUNCTION trigger_set_timestamp();

DROP TRIGGER IF EXISTS trg_users_updated_at ON users;
CREATE TRIGGER trg_users_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION trigger_set_timestamp();

DROP TRIGGER IF EXISTS trg_products_updated_at ON products;
CREATE TRIGGER trg_products_updated_at BEFORE UPDATE ON products FOR EACH ROW EXECUTE FUNCTION trigger_set_timestamp();

DROP TRIGGER IF EXISTS trg_product_lots_updated_at ON product_lots;
CREATE TRIGGER trg_product_lots_updated_at BEFORE UPDATE ON product_lots FOR EACH ROW EXECUTE FUNCTION trigger_set_timestamp();

DROP TRIGGER IF EXISTS trg_customers_updated_at ON customers;
CREATE TRIGGER trg_customers_updated_at BEFORE UPDATE ON customers FOR EACH ROW EXECUTE FUNCTION trigger_set_timestamp();

