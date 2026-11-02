-- ==============================================================================
-- PROJET : VOICI L'HOMME PHARMA (VHP-CDC-001)
-- MODULE 9 : NOTIFICATIONS ET CONSOLIDATION D'AUDIT (NOT-01, NOT-02, AUD-01..05)
-- ==============================================================================

-- 1. Table notifications (NOT-01, NOT-02)
CREATE TABLE IF NOT EXISTS notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pharmacy_id UUID NOT NULL REFERENCES pharmacies(id) ON DELETE CASCADE,
    type VARCHAR(50) NOT NULL, -- 'STOCK_BAS', 'PEREMPTION', 'CREANCE_RETARD', 'ECART_CAISSE'
    title VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    severity VARCHAR(20) NOT NULL DEFAULT 'INFO', -- 'INFO', 'WARNING', 'DANGER'
    target_role VARCHAR(50), -- NULL pour tous, ou 'PHARMACIEN', 'COMPTABLE', 'ADMIN', 'STOCK', 'CAISSIER'
    entity_type VARCHAR(50), -- 'PRODUCT_LOT', 'CUSTOMER', 'CASH_SESSION'
    entity_id VARCHAR(100),
    metadata JSONB,
    dedup_key VARCHAR(255) NOT NULL,
    created_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_notifications_pharmacy ON notifications(pharmacy_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_target_role ON notifications(target_role);
CREATE INDEX IF NOT EXISTS idx_notifications_dedup_key ON notifications(dedup_key);
CREATE UNIQUE INDEX IF NOT EXISTS uk_notifications_pharmacy_dedup ON notifications(pharmacy_id, dedup_key);

-- 2. Table notification_reads (statut lu/non lu individualisé par utilisateur)
CREATE TABLE IF NOT EXISTS notification_reads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    notification_id UUID NOT NULL REFERENCES notifications(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    read_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uk_notification_user_read UNIQUE (notification_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_notification_reads_user ON notification_reads(user_id, notification_id);

-- 3. Sécurisation immuable de audit_logs (AUD-03, RG-06)
-- S'assure que le trigger d'immutabilité est bien actif sur audit_logs
DROP TRIGGER IF EXISTS trg_audit_logs_immutable ON audit_logs;
CREATE TRIGGER trg_audit_logs_immutable
BEFORE UPDATE OR DELETE ON audit_logs
FOR EACH ROW EXECUTE FUNCTION raise_immutable_entity_exception();

-- Révocation des droits UPDATE / DELETE sur audit_logs pour PUBLIC
REVOKE UPDATE, DELETE ON TABLE audit_logs FROM PUBLIC;

