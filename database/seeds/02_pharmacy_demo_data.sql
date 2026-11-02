-- ==============================================================================
-- PROJET : VOICI L'HOMME PHARMA (VHP-CDC-001)
-- FICHIER : database/seeds/02_pharmacy_demo_data.sql
-- DESCRIPTION : Données initiales d'officine pilote pour environnement de test / démo
--
-- AVERTISSEMENT STRICT :
-- L'adresse ('Av. de l''Église, Q. Résidentiel, Commune de Limete') et le téléphone
-- ('+243 81 234 56 78') ci-dessous sont des coordonnées purement fictives pour les tests.
-- ELLES NE DOIVENT EN AUCUN CAS ÊTRE UTILISÉES EN PRODUCTION RÉELLE.
-- ==============================================================================

-- 1. OFFICINE PILOTE DE TEST (Kinshasa)
INSERT INTO pharmacies (id, code, name, address, city, country, phone, default_currency)
VALUES (
    '11111111-1111-1111-1111-111111111111',
    'OFF-KIN-001',
    'Voici l''Homme Pharma',
    'Av. de l''Église, Q. Résidentiel, Commune de Limete (FICTIF - NE PAS UTILISER EN PROD)',
    'Kinshasa',
    'RDC',
    '+243 81 234 56 78',
    'CDF'
) ON CONFLICT (code) DO NOTHING;

-- 2. CATÉGORIES INITIALES (CAT-04)
INSERT INTO product_categories (id, pharmacy_id, name, description) VALUES
('33333333-3333-3333-3333-333333333331', '11111111-1111-1111-1111-111111111111', 'Antalgiques & Antipyrétiques', 'Douleurs et fièvres'),
('33333333-3333-3333-3333-333333333332', '11111111-1111-1111-1111-111111111111', 'Antibiotiques', 'Anti-infectieux bactériens (soumis à ordonnance)'),
('33333333-3333-3333-3333-333333333333', '11111111-1111-1111-1111-111111111111', 'Gastro-entérologie', 'Troubles digestifs et antispasmodiques'),
('33333333-3333-3333-3333-333333333334', '11111111-1111-1111-1111-111111111111', 'Parapharmacie & Soins', 'Matériel de pansement et hygiène')
ON CONFLICT (pharmacy_id, name) DO NOTHING;

-- 3. TAUX DE CHANGE INITIAL DE DÉMONSTRATION (FIN-01)
INSERT INTO exchange_rates (pharmacy_id, base_currency, target_currency, rate, effective_date)
VALUES (
    '11111111-1111-1111-1111-111111111111',
    'USD',
    'CDF',
    2850.00,
    CURRENT_DATE
) ON CONFLICT (pharmacy_id, base_currency, target_currency, effective_date) DO NOTHING;

