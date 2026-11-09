-- ==============================================================================
-- PROJET : VOICI L'HOMME PHARMA (VHP-CDC-001)
-- FICHIER : database/seeds/01_reference_data.sql
-- DESCRIPTION : Données de référence immuables (Rôles, Plafonds remises, Permissions fines, Matrice CDC)
-- ==============================================================================

-- 1. RÔLES SYSTÈME DU CAHIER DES CHARGES (AUT-05, Section 3)
INSERT INTO roles (id, name, description, max_discount_percent) VALUES
('22222222-2222-2222-2222-222222222221', 'ADMIN', 'Propriétaire / Administrateur système (accès total)', 100.00),
('22222222-2222-2222-2222-222222222222', 'PHARMACIEN', 'Pharmacien responsable (validation ordonnances, ajustements, prix)', 20.00),
('22222222-2222-2222-2222-222222222223', 'CAISSIER', 'Vendeur / Caissier comptoir (ventes, encaissements, consultation)', 5.00),
('22222222-2222-2222-2222-222222222224', 'STOCK', 'Gestionnaire de stock (réceptions, inventaires, réapprovisionnement)', 0.00),
('22222222-2222-2222-2222-222222222225', 'COMPTABLE', 'Comptable / Gestionnaire financier (états financiers, créances, audit)', 0.00)
ON CONFLICT (name) DO UPDATE SET
    description = EXCLUDED.description,
    max_discount_percent = EXCLUDED.max_discount_percent;

-- 2. PERMISSIONS FINES DU CAHIER DES CHARGES (AUT-05 & Section 3)
INSERT INTO permissions (code, category, description) VALUES
-- Ventes
('vente.creer', 'VENTES', 'Effectuer une vente au comptoir'),
('vente.consulter', 'VENTES', 'Consulter l''historique des ventes et factures'),
('vente.remise', 'VENTES', 'Appliquer une remise standard dans la limite autorisée'),
('vente.remise_plafond', 'VENTES', 'Appliquer une remise au-delà du plafond standard (avec code superviseur)'),
('vente.annuler', 'VENTES', 'Annuler une vente et émettre un avoir'),
('vente.demande_annulation', 'VENTES', 'Demander l''annulation motivée d''une vente'),

-- Ordonnances
('ordonnance.creer', 'ORDONNANCES', 'Enregistrer une ordonnance médicale'),
('ordonnance.consulter', 'ORDONNANCES', 'Consulter les ordonnances et pièces jointes'),
('ordonnance.valider', 'ORDONNANCES', 'Valider officiellement une ordonnance (Pharmacien)'),

-- Stock & Inventaires
('stock.consulter', 'STOCK', 'Consulter les niveaux de stock et fiches de lots'),
('stock.recevoir', 'STOCK', 'Réceptionner des commandes fournisseurs et lots'),
('stock.ajuster', 'STOCK', 'Demander un ajustement de stock'),
('stock.valider_ajustement', 'STOCK', 'Valider officiellement un ajustement de stock (Pharmacien)'),
('stock.inventaire', 'STOCK', 'Lancer et saisir les comptages d''un inventaire physique'),
('stock.valider_inventaire', 'STOCK', 'Valider officiellement et clôturer un inventaire physique (Pharmacien)'),

-- Achats & Fournisseurs
('achats.consulter', 'ACHATS', 'Consulter les commandes fournisseurs et réceptions'),
('achats.creer', 'ACHATS', 'Créer un bon de commande fournisseur'),
('achats.valider', 'ACHATS', 'Valider et transmettre un bon de commande fournisseur'),

-- Catalogue & Prix
('catalogue.consulter', 'CATALOGUE', 'Consulter le catalogue des produits et tarifs'),
('catalogue.creer', 'CATALOGUE', 'Créer ou modifier une fiche produit'),
('prix.modifier', 'CATALOGUE', 'Modifier le prix de vente d''un produit (avec historique tracé)'),

-- Clients & Créances
('client.consulter', 'CLIENTS', 'Consulter les fiches clients et encours de crédit'),
('client.creer', 'CLIENTS', 'Créer ou modifier une fiche client'),
('client.credit', 'CLIENTS', 'Autoriser un dépassement de plafond de crédit client'),
('client.paiement', 'CLIENTS', 'Enregistrer un règlement de créance client'),

-- Caisse & Finances
('caisse.ouvrir', 'FINANCE', 'Ouvrir une session de caisse avec fond de roulement'),
('caisse.cloturer', 'FINANCE', 'Clôturer sa session de caisse avec arrêté d''écart'),
('taux.modifier', 'FINANCE', 'Saisir le taux de change quotidien officiel CDF/USD'),
('depense.creer', 'FINANCE', 'Enregistrer une dépense d''exploitation d''officine'),
('finances.consulter', 'FINANCE', 'Consulter la trésorerie et les mouvements de caisse'),
('finances.mouvement', 'FINANCE', 'Enregistrer un apport ou un retrait de caisse'),

-- Rapports & Tableaux de bord
('rapports.consulter', 'RAPPORTS', 'Consulter les rapports d''activité, chiffre d''affaires, marges et tableau de bord'),
('rapports.exporter', 'RAPPORTS', 'Exporter les états comptables et fiscaux'),

-- Journal d'audit & Administration
('audit.consulter', 'AUDIT', 'Consulter le journal d''audit inaltérable'),
('admin.utilisateurs', 'ADMIN', 'Gérer les comptes utilisateurs, rôles et affectations'),
('admin.parametres', 'ADMIN', 'Configurer les paramètres de l''officine')
ON CONFLICT (code) DO UPDATE SET
    category = EXCLUDED.category,
    description = EXCLUDED.description;

-- 3. AFFECTATION DES PERMISSIONS AUX RÔLES SELON LA MATRICE DU CDC (Section 3)

-- 3.1 ADMIN : Toutes les permissions sans exception
INSERT INTO role_permissions (role_id, permission_id)
SELECT '22222222-2222-2222-2222-222222222221', id FROM permissions
ON CONFLICT DO NOTHING;

-- 3.2 PHARMACIEN : Responsable technique et clinique
INSERT INTO role_permissions (role_id, permission_id)
SELECT '22222222-2222-2222-2222-222222222222', id FROM permissions
WHERE code IN (
    'vente.creer', 'vente.consulter', 'vente.remise', 'vente.remise_plafond', 'vente.annuler',
    'ordonnance.creer', 'ordonnance.consulter', 'ordonnance.valider',
    'stock.consulter', 'stock.recevoir', 'stock.valider_ajustement', 'stock.inventaire', 'stock.valider_inventaire',
    'achats.consulter', 'achats.creer', 'achats.valider',
    'catalogue.consulter', 'catalogue.creer', 'prix.modifier',
    'client.consulter', 'client.creer', 'client.credit', 'client.paiement',
    'caisse.ouvrir', 'caisse.cloturer', 'taux.modifier', 'depense.creer', 'finances.consulter', 'finances.mouvement',
    'rapports.consulter', 'rapports.exporter'
) ON CONFLICT DO NOTHING;

-- 3.3 CAISSIER : Vendeur comptoir
INSERT INTO role_permissions (role_id, permission_id)
SELECT '22222222-2222-2222-2222-222222222223', id FROM permissions
WHERE code IN (
    'vente.creer', 'vente.consulter', 'vente.remise', 'vente.demande_annulation',
    'ordonnance.creer', 'ordonnance.consulter',
    'stock.consulter',
    'catalogue.consulter',
    'client.consulter', 'client.creer', 'client.paiement',
    'caisse.ouvrir', 'caisse.cloturer', 'finances.consulter', 'finances.mouvement'
) ON CONFLICT DO NOTHING;

-- 3.4 STOCK : Gestionnaire logistique
INSERT INTO role_permissions (role_id, permission_id)
SELECT '22222222-2222-2222-2222-222222222224', id FROM permissions
WHERE code IN (
    'stock.consulter', 'stock.recevoir', 'stock.ajuster', 'stock.inventaire',
    'achats.consulter', 'achats.creer',
    'catalogue.consulter', 'catalogue.creer'
) ON CONFLICT DO NOTHING;

-- 3.5 COMPTABLE : Gestionnaire financier et conformité
INSERT INTO role_permissions (role_id, permission_id)
SELECT '22222222-2222-2222-2222-222222222225', id FROM permissions
WHERE code IN (
    'vente.consulter',
    'client.consulter', 'client.paiement',
    'caisse.cloturer', 'finances.consulter', 'depense.creer',
    'achats.consulter',
    'rapports.consulter', 'rapports.exporter',
    'audit.consulter'
) ON CONFLICT DO NOTHING;

