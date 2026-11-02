-- ==============================================================================
-- PROJET : VOICI L'HOMME PHARMA (VHP-CDC-001)
-- FICHIER : migrations/003_seed_data.sql
-- DESCRIPTION : Données initiales de démarrage (Rôles, Permissions, Officine)
-- ==============================================================================

-- 1. OFFICINE PILOTE (Kinshasa, Limete)
INSERT INTO pharmacies (id, code, name, address, city, country, phone, default_currency)
VALUES (
    '11111111-1111-1111-1111-111111111111',
    'OFF-KIN-001',
    'Voici l''Homme Pharma',
    'Av. de l''Église, Q. Résidentiel, Commune de Limete',
    'Kinshasa',
    'RDC',
    '+243 81 234 56 78',
    'CDF'
) ON CONFLICT (code) DO NOTHING;

-- 2. RÔLES PRÉDÉFINIS DU CAHIER DES CHARGES (AUT-05, Section 3)
INSERT INTO roles (id, name, description) VALUES
('22222222-2222-2222-2222-222222222221', 'ADMIN', 'Propriétaire / Administrateur système (accès total)'),
('22222222-2222-2222-2222-222222222222', 'PHARMACIEN', 'Pharmacien responsable (validation ordonnances, ajustements, prix)'),
('22222222-2222-2222-2222-222222222223', 'CAISSIER', 'Vendeur / Caissier comptoir (ventes, encaissements, consultation)'),
('22222222-2222-2222-2222-222222222224', 'STOCK', 'Gestionnaire de stock (réceptions, inventaires, réapprovisionnement)')
ON CONFLICT (name) DO NOTHING;

-- 3. PERMISSIONS FINES DU CAHIER DES CHARGES (AUT-05)
INSERT INTO permissions (code, category, description) VALUES
-- Ventes
('vente.creer', 'VENTES', 'Effectuer une vente au comptoir'),
('vente.remise', 'VENTES', 'Appliquer une remise standard'),
('vente.remise_plafond', 'VENTES', 'Appliquer une remise au-delà du plafond standard'),
('vente.annuler', 'VENTES', 'Annuler une vente et émettre un avoir'),
-- Stock
('stock.consulter', 'STOCK', 'Consulter les niveaux de stock et lots'),
('stock.recevoir', 'STOCK', 'Réceptionner des commandes fournisseurs'),
('stock.ajuster', 'STOCK', 'Demander ou effectuer un ajustement de stock'),
('stock.valider_ajustement', 'STOCK', 'Valider officiellement un ajustement de stock (Pharmacien)'),
('stock.inventaire', 'STOCK', 'Lancer et saisir un inventaire physique'),
-- Catalogue & Prix
('catalogue.creer', 'CATALOGUE', 'Créer ou modifier une fiche produit'),
('prix.modifier', 'CATALOGUE', 'Modifier le prix de vente d''un produit'),
-- Caisse & Finance
('caisse.ouvrir', 'FINANCE', 'Ouvrir une session de caisse'),
('caisse.cloturer', 'FINANCE', 'Clôturer sa session de caisse avec arrêté d''écart'),
('taux.modifier', 'FINANCE', 'Saisir le taux de change quotidien CDF/USD'),
('depense.creer', 'FINANCE', 'Enregistrer une dépense d''officine'),
-- Administration
('admin.utilisateurs', 'ADMIN', 'Gérer les comptes utilisateurs et permissions'),
('admin.audit', 'ADMIN', 'Consulter le journal d''audit inaltérable')
ON CONFLICT (code) DO NOTHING;

-- 4. AFFECTATION DES PERMISSIONS AUX RÔLES SELON LA MATRICE DU CDC (Section 3)
-- ADMIN : Toutes les permissions
INSERT INTO role_permissions (role_id, permission_id)
SELECT '22222222-2222-2222-2222-222222222221', id FROM permissions
ON CONFLICT DO NOTHING;

-- PHARMACIEN
INSERT INTO role_permissions (role_id, permission_id)
SELECT '22222222-2222-2222-2222-222222222222', id FROM permissions
WHERE code IN (
    'vente.creer', 'vente.remise', 'vente.remise_plafond', 'vente.annuler',
    'stock.consulter', 'stock.recevoir', 'stock.valider_ajustement', 'stock.inventaire',
    'catalogue.creer', 'prix.modifier',
    'caisse.ouvrir', 'caisse.cloturer', 'taux.modifier', 'depense.creer'
) ON CONFLICT DO NOTHING;

-- CAISSIER
INSERT INTO role_permissions (role_id, permission_id)
SELECT '22222222-2222-2222-2222-222222222223', id FROM permissions
WHERE code IN (
    'vente.creer', 'vente.remise', 'stock.consulter',
    'caisse.ouvrir', 'caisse.cloturer'
) ON CONFLICT DO NOTHING;

-- GESTIONNAIRE STOCK
INSERT INTO role_permissions (role_id, permission_id)
SELECT '22222222-2222-2222-2222-222222222224', id FROM permissions
WHERE code IN (
    'stock.consulter', 'stock.recevoir', 'stock.ajuster', 'stock.inventaire',
    'catalogue.creer'
) ON CONFLICT DO NOTHING;

-- 5. CATÉGORIES INITIALES (CAT-04)
INSERT INTO product_categories (id, pharmacy_id, name, description) VALUES
('33333333-3333-3333-3333-333333333331', '11111111-1111-1111-1111-111111111111', 'Antalgiques & Antipyrétiques', 'Douleurs et fièvres'),
('33333333-3333-3333-3333-333333333332', '11111111-1111-1111-1111-111111111111', 'Antibiotiques', 'Anti-infectieux bactériens (soumis à ordonnance)'),
('33333333-3333-3333-3333-333333333333', '11111111-1111-1111-1111-111111111111', 'Gastro-entérologie', 'Troubles digestifs et antispasmodiques'),
('33333333-3333-3333-3333-333333333334', '11111111-1111-1111-1111-111111111111', 'Parapharmacie & Soins', 'Matériel de pansement et hygiène')
ON CONFLICT DO NOTHING;

