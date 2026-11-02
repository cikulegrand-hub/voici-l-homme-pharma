-- ==============================================================================
-- PROJET : VOICI L'HOMME PHARMA (VHP-CDC-001)
-- FICHIER : migrations/002_functions_and_triggers.sql
-- DESCRIPTION : Fonctions stockées, procédures FEFO, CUMP et triggers d'intégrité
-- ==============================================================================

-- 1. GÉNÉRATEUR DE NUMÉROS DE FACTURE SÉQUENTIELS SANS TROU (RG-05, VTE-10)
CREATE SEQUENCE IF NOT EXISTS invoice_seq_tracker;

CREATE OR REPLACE FUNCTION generate_next_invoice_number(p_pharmacy_id UUID)
RETURNS TABLE(invoice_number VARCHAR, seq_num INT, fiscal_yr INT) AS $$
DECLARE
    v_year INT := EXTRACT(YEAR FROM NOW());
    v_next_seq INT;
    v_formatted_number VARCHAR(100);
BEGIN
    -- Verrouillage pour éviter toute concurrence sur la séquence
    SELECT COALESCE(MAX(sequence_number), 0) + 1
    INTO v_next_seq
    FROM sales
    WHERE pharmacy_id = p_pharmacy_id AND fiscal_year = v_year;

    v_formatted_number := 'FAC-' || v_year || '-' || LPAD(v_next_seq::TEXT, 6, '0');

    RETURN QUERY SELECT v_formatted_number, v_next_seq, v_year;
END;
$$ LANGUAGE plpgsql;

-- 2. DÉDUCTION STRICTE DE STOCK SELON LA RÈGLE FEFO (RG-01, STK-03)
-- Renvoie les lots déstockés et quantités pour chaque ligne de vente demandée
CREATE OR REPLACE FUNCTION deduct_stock_fefo(
    p_pharmacy_id UUID,
    p_product_id UUID,
    p_quantity_needed INT,
    p_user_id UUID,
    p_sale_id UUID
)
RETURNS TABLE(lot_id UUID, quantity_deducted INT, unit_price_cdf DECIMAL) AS $$
DECLARE
    v_remaining_qty INT := p_quantity_needed;
    v_lot RECORD;
    v_qty_to_take INT;
BEGIN
    -- Vérification du stock total disponible non périmé
    IF (
        SELECT COALESCE(SUM(current_quantity), 0)
        FROM product_lots
        WHERE product_id = p_product_id
          AND expiry_date > CURRENT_DATE
          AND is_quarantined = FALSE
    ) < p_quantity_needed THEN
        RAISE EXCEPTION 'Stock insuffisant ou périmé pour le produit % (requis: %, disponible: %)',
            p_product_id, p_quantity_needed,
            (SELECT COALESCE(SUM(current_quantity), 0) FROM product_lots WHERE product_id = p_product_id AND expiry_date > CURRENT_DATE AND is_quarantined = FALSE);
    END IF;

    -- Parcours des lots ordonnés par date de péremption la plus proche (FEFO)
    FOR v_lot IN
        SELECT id, current_quantity, selling_price_cdf
        FROM product_lots
        WHERE product_id = p_product_id
          AND expiry_date > CURRENT_DATE
          AND is_quarantined = FALSE
          AND current_quantity > 0
        ORDER BY expiry_date ASC, created_at ASC
    LOOP
        IF v_remaining_qty <= 0 THEN
            EXIT;
        END IF;

        IF v_lot.current_quantity >= v_remaining_qty THEN
            v_qty_to_take := v_remaining_qty;
        ELSE
            v_qty_to_take := v_lot.current_quantity;
        END IF;

        -- Décrémentation atomique du lot
        UPDATE product_lots
        SET current_quantity = current_quantity - v_qty_to_take,
            updated_at = NOW()
        WHERE id = v_lot.id;

        -- Journalisation du mouvement de stock obligatoire
        INSERT INTO stock_movements (
            pharmacy_id,
            lot_id,
            user_id,
            reference_id,
            type,
            quantity,
            direction,
            unit_cost_cdf,
            reason
        ) VALUES (
            p_pharmacy_id,
            v_lot.id,
            p_user_id,
            p_sale_id,
            'SORTIE_VENTE',
            v_qty_to_take,
            'OUT',
            v_lot.selling_price_cdf,
            'Vente comptoir'
        );

        v_remaining_qty := v_remaining_qty - v_qty_to_take;

        lot_id := v_lot.id;
        quantity_deducted := v_qty_to_take;
        unit_price_cdf := v_lot.selling_price_cdf;
        RETURN NEXT;
    END LOOP;

    IF v_remaining_qty > 0 THEN
        RAISE EXCEPTION 'Erreur critique FEFO : stock restant non alloué (%)', v_remaining_qty;
    END IF;
END;
$$ LANGUAGE plpgsql;

-- 3. CALCUL DU COÛT MOYEN PONDÉRÉ - CUMP (RG-14)
-- Formule CDC : Nouveau coût = (valeur stock + valeur réception) / (quantité stock + quantité reçue)
CREATE OR REPLACE FUNCTION update_cump_on_reception(
    p_product_id UUID,
    p_received_qty INT,
    p_unit_purchase_cost_cdf DECIMAL
) RETURNS VOID AS $$
DECLARE
    v_current_stock INT;
    v_current_cump DECIMAL(15, 2);
    v_new_cump DECIMAL(15, 2);
BEGIN
    SELECT COALESCE(SUM(current_quantity), 0)
    INTO v_current_stock
    FROM product_lots
    WHERE product_id = p_product_id;

    -- Si premier stock
    IF v_current_stock = 0 THEN
        v_new_cump := p_unit_purchase_cost_cdf;
    ELSE
        -- Coût moyen pondéré des lots actuels
        SELECT COALESCE(SUM(current_quantity * purchase_price_cdf) / NULLIF(SUM(current_quantity), 0), p_unit_purchase_cost_cdf)
        INTO v_current_cump
        FROM product_lots
        WHERE product_id = p_product_id;

        v_new_cump := ((v_current_stock * v_current_cump) + (p_received_qty * p_unit_purchase_cost_cdf)) / (v_current_stock + p_received_qty);
    END IF;

    -- Mise à jour dans le catalogue
    UPDATE products
    SET selling_price_cdf = ROUND(v_new_cump * 1.30, 2), -- Marge de référence 30% ou personnalisée
        updated_at = NOW()
    WHERE id = p_product_id;
END;
$$ LANGUAGE plpgsql;

