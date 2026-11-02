-- ==============================================================================
-- PROJET : VOICI L'HOMME PHARMA (VHP-CDC-001)
-- FICHIER : migrations/001_initial_schema.sql
-- DESCRIPTION : Schéma relationnel complet conforme aux spécifications VHP-CDC-001
-- ==============================================================================

-- 1. EXTENSIONS
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 2. ORGANISATION : OFFICINES (Cloisonnement multi-sites V2 / Mono-site V1)
CREATE TABLE pharmacies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code VARCHAR(50) NOT NULL UNIQUE,
    name VARCHAR(255) NOT NULL,
    address TEXT NOT NULL,
    city VARCHAR(100) DEFAULT 'Kinshasa',
    country VARCHAR(100) DEFAULT 'RDC',
    phone VARCHAR(50),
    email VARCHAR(255),
    tax_number VARCHAR(100), -- NIF / Registre de commerce
    default_currency VARCHAR(3) DEFAULT 'CDF', -- CDF ou USD
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. HABILITATIONS & UTILISATEURS (AUT-01 à AUT-07)
CREATE TABLE roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(50) NOT NULL UNIQUE, -- 'ADMIN', 'PHARMACIEN', 'CAISSIER', 'STOCK', 'COMPTABLE'
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE permissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code VARCHAR(100) NOT NULL UNIQUE, -- ex: 'vente.creer', 'vente.annuler', 'stock.ajuster', 'prix.modifier'
    description TEXT,
    category VARCHAR(50) NOT NULL
);

CREATE TABLE role_permissions (
    role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    permission_id UUID NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
    PRIMARY KEY (role_id, permission_id)
);

CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pharmacy_id UUID NOT NULL REFERENCES pharmacies(id) ON DELETE RESTRICT,
    role_id UUID NOT NULL REFERENCES roles(id) ON DELETE RESTRICT,
    username VARCHAR(100) NOT NULL UNIQUE,
    email VARCHAR(255) UNIQUE,
    password_hash VARCHAR(255) NOT NULL, -- Hachage Argon2id
    full_name VARCHAR(255) NOT NULL,
    pin_code_hash VARCHAR(255), -- Code PIN pour réautorisation rapide
    failed_login_attempts INT NOT NULL DEFAULT 0,
    locked_until TIMESTAMPTZ,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    last_login_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. TAUX DE CHANGE (FIN-04, RG-08)
CREATE TABLE exchange_rates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pharmacy_id UUID NOT NULL REFERENCES pharmacies(id) ON DELETE RESTRICT,
    base_currency VARCHAR(3) NOT NULL DEFAULT 'USD',
    target_currency VARCHAR(3) NOT NULL DEFAULT 'CDF',
    rate DECIMAL(12, 4) NOT NULL, -- Ex: 2850.0000
    created_by UUID NOT NULL REFERENCES users(id),
    effective_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    notes TEXT
);

-- 5. CATALOGUE PRODUITS (CAT-01 à CAT-11)
CREATE TABLE product_categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pharmacy_id UUID NOT NULL REFERENCES pharmacies(id) ON DELETE RESTRICT,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pharmacy_id UUID NOT NULL REFERENCES pharmacies(id) ON DELETE RESTRICT,
    category_id UUID REFERENCES product_categories(id) ON DELETE SET NULL,
    name VARCHAR(255) NOT NULL, -- Nom commercial
    dci VARCHAR(255) NOT NULL, -- Dénomination Commune Internationale
    dosage VARCHAR(100), -- Ex: '1000 mg'
    galenic_form VARCHAR(100), -- 'Comprimé', 'Sirop', 'Gélule'
    laboratory VARCHAR(255), -- Laboratoire fabricant
    selling_price_cdf DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
    selling_price_usd DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
    tax_rate DECIMAL(5, 2) NOT NULL DEFAULT 0.00, -- Ex: 16% TVA
    min_alert_threshold INT NOT NULL DEFAULT 10,
    max_threshold INT,
    security_stock INT,
    storage_location VARCHAR(100), -- Emplacement physique en rayon
    requires_prescription BOOLEAN NOT NULL DEFAULT FALSE, -- RG-09
    is_controlled_substance BOOLEAN NOT NULL DEFAULT FALSE, -- Stupéfiant / psychotrope
    is_cold_chain BOOLEAN NOT NULL DEFAULT FALSE, -- Chaîne du froid
    is_active BOOLEAN NOT NULL DEFAULT TRUE, -- Suppression logique (RG-06)
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE product_barcodes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    barcode VARCHAR(100) NOT NULL UNIQUE, -- EAN-13, DataMatrix
    is_primary BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE price_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    old_price_cdf DECIMAL(15, 2),
    new_price_cdf DECIMAL(15, 2) NOT NULL,
    old_price_usd DECIMAL(15, 2),
    new_price_usd DECIMAL(15, 2) NOT NULL,
    changed_by UUID NOT NULL REFERENCES users(id),
    reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 6. STOCK & MULTI-LOTS (STK-01 à STK-14, RG-01 FEFO, RG-14 CUMP)
CREATE TABLE product_lots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
    lot_number VARCHAR(100) NOT NULL,
    expiry_date DATE NOT NULL,
    purchase_price_cdf DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
    purchase_price_usd DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
    initial_quantity INT NOT NULL CHECK (initial_quantity >= 0),
    current_quantity INT NOT NULL CHECK (current_quantity >= 0), -- RG-02 : Jamais négatif
    is_quarantined BOOLEAN NOT NULL DEFAULT FALSE, -- RG-03 : Quarantaine / blocage
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uk_product_lot UNIQUE (product_id, lot_number)
);

CREATE TYPE movement_type AS ENUM (
    'RECEPTION_FOURNISSEUR',
    'SORTIE_VENTE',
    'AJUSTEMENT_POSITIF',
    'AJUSTEMENT_NEGATIF',
    'PEREMPTION',
    'CASSE_PERTE',
    'DON',
    'USAGE_INTERNE',
    'RETOUR_FOURNISSEUR',
    'RETOUR_CLIENT'
);

CREATE TABLE stock_movements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pharmacy_id UUID NOT NULL REFERENCES pharmacies(id) ON DELETE RESTRICT,
    lot_id UUID NOT NULL REFERENCES product_lots(id) ON DELETE RESTRICT,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    reference_id UUID, -- sale_id, purchase_order_id, ou inventory_id
    type movement_type NOT NULL,
    quantity INT NOT NULL, -- Valeur absolue
    direction VARCHAR(4) NOT NULL CHECK (direction IN ('IN', 'OUT')),
    unit_cost_cdf DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
    reason TEXT NOT NULL, -- Obligatoire selon RG-11
    approved_by UUID REFERENCES users(id), -- Pharmacien si ajustement
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW() -- Immuable (RG-06)
);

-- 7. FOURNISSEURS & ACHATS (ACH-01 à ACH-08)
CREATE TABLE suppliers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pharmacy_id UUID NOT NULL REFERENCES pharmacies(id) ON DELETE RESTRICT,
    name VARCHAR(255) NOT NULL,
    contact_name VARCHAR(255),
    phone VARCHAR(50),
    email VARCHAR(255),
    address TEXT,
    payment_terms TEXT,
    lead_time_days INT DEFAULT 2,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TYPE purchase_order_status AS ENUM (
    'BROUILLON',
    'ENVOYE',
    'PARTIELLEMENT_RECU',
    'RECU',
    'ANNULE'
);

CREATE TABLE purchase_orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pharmacy_id UUID NOT NULL REFERENCES pharmacies(id) ON DELETE RESTRICT,
    supplier_id UUID NOT NULL REFERENCES suppliers(id) ON DELETE RESTRICT,
    order_number VARCHAR(100) NOT NULL UNIQUE,
    status purchase_order_status NOT NULL DEFAULT 'BROUILLON',
    total_amount_cdf DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
    total_amount_usd DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
    created_by UUID NOT NULL REFERENCES users(id),
    order_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expected_delivery_date DATE,
    received_date TIMESTAMPTZ,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE purchase_order_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
    ordered_quantity INT NOT NULL CHECK (ordered_quantity > 0),
    received_quantity INT NOT NULL DEFAULT 0 CHECK (received_quantity >= 0),
    unit_price_cdf DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
    unit_price_usd DECIMAL(15, 2) NOT NULL DEFAULT 0.00
);

-- 8. CLIENTS & ORDONNANCES (CLI-01 à CLI-10)
CREATE TYPE customer_type AS ENUM ('PARTICULIER', 'ENTREPRISE', 'ASSURANCE');

CREATE TABLE customers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pharmacy_id UUID NOT NULL REFERENCES pharmacies(id) ON DELETE RESTRICT,
    code VARCHAR(50) NOT NULL UNIQUE,
    full_name VARCHAR(255) NOT NULL,
    phone VARCHAR(50),
    email VARCHAR(255),
    company_name VARCHAR(255),
    address TEXT,
    customer_type customer_type NOT NULL DEFAULT 'PARTICULIER',
    credit_limit_cdf DECIMAL(15, 2) NOT NULL DEFAULT 0.00, -- Plafond crédit (RG-13)
    current_balance_cdf DECIMAL(15, 2) NOT NULL DEFAULT 0.00, -- Solde créance en cours
    medical_notes TEXT, -- Allergies et contre-indications protégées (CLI-07)
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE prescriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
    prescriber_name VARCHAR(255) NOT NULL,
    health_center VARCHAR(255),
    prescription_date DATE NOT NULL,
    storage_file_path TEXT NOT NULL, -- Chemin privé Supabase Storage (CLI-06)
    prescription_text TEXT,
    verified_by UUID REFERENCES users(id),
    verified_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 9. SESSIONS DE CAISSE (FIN-01, FIN-02, RG-12)
CREATE TYPE cash_session_status AS ENUM ('OUVERTE', 'CLOTUREE');

CREATE TABLE cash_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pharmacy_id UUID NOT NULL REFERENCES pharmacies(id) ON DELETE RESTRICT,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    opened_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    closed_at TIMESTAMPTZ,
    initial_float_cdf DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
    initial_float_usd DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
    expected_amount_cdf DECIMAL(15, 2) DEFAULT 0.00,
    expected_amount_usd DECIMAL(15, 2) DEFAULT 0.00,
    counted_amount_cdf DECIMAL(15, 2),
    counted_amount_usd DECIMAL(15, 2),
    variance_cdf DECIMAL(15, 2), -- Écart compté vs théorique
    variance_usd DECIMAL(15, 2),
    variance_reason TEXT, -- Obligatoire si écart (FIN-02)
    status cash_session_status NOT NULL DEFAULT 'OUVERTE'
);

-- 10. VENTES & FACTURATION (VTE-01 à VTE-18, RG-04, RG-05, RG-08)
CREATE TYPE payment_method AS ENUM (
    'ESPECES',
    'MOBILE_MONEY',
    'CARTE_BANCAIRE',
    'VIREMENT',
    'CREDIT_CLIENT'
);

CREATE TYPE sale_status AS ENUM ('VALIDEE', 'ANNULEE', 'AVOIR');

CREATE TABLE sales (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pharmacy_id UUID NOT NULL REFERENCES pharmacies(id) ON DELETE RESTRICT,
    cash_session_id UUID NOT NULL REFERENCES cash_sessions(id) ON DELETE RESTRICT,
    invoice_number VARCHAR(100) NOT NULL UNIQUE, -- Numérotation séquentielle sans trou (RG-05)
    sequence_number INT NOT NULL,
    fiscal_year INT NOT NULL,
    customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    prescription_id UUID REFERENCES prescriptions(id) ON DELETE RESTRICT,
    currency VARCHAR(3) NOT NULL DEFAULT 'CDF', -- Devise de paiement choisie
    exchange_rate_applied DECIMAL(12, 4) NOT NULL, -- Taux figé à la vente (RG-08)
    subtotal_cdf DECIMAL(15, 2) NOT NULL,
    discount_cdf DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
    tax_amount_cdf DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
    total_amount_cdf DECIMAL(15, 2) NOT NULL,
    total_amount_usd DECIMAL(15, 2) NOT NULL,
    idempotency_key VARCHAR(100) UNIQUE, -- Clé d'idempotence anti double envoi (VTE-18, RG-16)
    status sale_status NOT NULL DEFAULT 'VALIDEE',
    cancellation_reason TEXT,
    cancelled_by UUID REFERENCES users(id),
    cancelled_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW() -- Immuable (RG-04)
);

CREATE TABLE sale_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sale_id UUID NOT NULL REFERENCES sales(id) ON DELETE RESTRICT,
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
    lot_id UUID NOT NULL REFERENCES product_lots(id) ON DELETE RESTRICT, -- Lot FEFO imputé
    quantity INT NOT NULL CHECK (quantity > 0),
    unit_price_cdf DECIMAL(15, 2) NOT NULL,
    unit_cost_cump_cdf DECIMAL(15, 2) NOT NULL, -- Coût CUMP au moment de la vente (RG-15)
    discount_amount_cdf DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
    tax_rate DECIMAL(5, 2) NOT NULL DEFAULT 0.00,
    total_line_cdf DECIMAL(15, 2) NOT NULL
);

CREATE TABLE sale_payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sale_id UUID NOT NULL REFERENCES sales(id) ON DELETE RESTRICT,
    payment_method payment_method NOT NULL,
    currency VARCHAR(3) NOT NULL DEFAULT 'CDF',
    amount_paid DECIMAL(15, 2) NOT NULL,
    amount_in_cdf DECIMAL(15, 2) NOT NULL,
    mobile_money_provider VARCHAR(50), -- 'M-PESA', 'ORANGE_MONEY', 'AIRTEL_MONEY'
    transaction_reference VARCHAR(100), -- Référence opérateur
    change_given_cdf DECIMAL(15, 2) DEFAULT 0.00,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 11. DÉPENSES D'OFFICINE (FIN-03)
CREATE TABLE expense_categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pharmacy_id UUID NOT NULL REFERENCES pharmacies(id) ON DELETE RESTRICT,
    name VARCHAR(100) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE expenses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pharmacy_id UUID NOT NULL REFERENCES pharmacies(id) ON DELETE RESTRICT,
    category_id UUID NOT NULL REFERENCES expense_categories(id) ON DELETE RESTRICT,
    cash_session_id UUID REFERENCES cash_sessions(id) ON DELETE SET NULL,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    description TEXT NOT NULL,
    amount_cdf DECIMAL(15, 2) NOT NULL,
    amount_usd DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
    receipt_file_path TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 12. JOURNAL D'AUDIT INALTÉRABLE (AUD-01 à AUD-05)
CREATE TABLE audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pharmacy_id UUID NOT NULL REFERENCES pharmacies(id) ON DELETE RESTRICT,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    action VARCHAR(100) NOT NULL, -- 'LOGIN', 'VENTE_CREEE', 'VENTE_ANNULEE', 'AJUSTEMENT_STOCK', 'PRIX_MODIFIE'
    entity_name VARCHAR(100) NOT NULL,
    entity_id VARCHAR(100) NOT NULL,
    old_values JSONB,
    new_values JSONB,
    ip_address VARCHAR(50),
    user_agent TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Interdiction stricte de suppression ou modification sur audit_logs (RG-06, AUD-03)
CREATE RULE prevent_audit_delete AS ON DELETE TO audit_logs DO INSTEAD NOTHING;
CREATE RULE prevent_audit_update AS ON UPDATE TO audit_logs DO INSTEAD NOTHING;

-- Interdiction stricte de suppression ou mise à jour directe d'une vente validée (RG-04)
CREATE RULE prevent_sale_delete AS ON DELETE TO sales DO INSTEAD NOTHING;

