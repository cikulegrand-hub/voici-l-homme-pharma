// ==============================================================================
// PROJET : VOICI L'HOMME PHARMA (VHP-CDC-001)
// MODULE : Catalogue centralisé des permissions (source unique de vérité)
// DESCRIPTION : Chaque permission est de la forme module.action, avec un libellé
//               métier en français. Ce fichier est la seule référence pour les
//               permissions côté serveur.
// ==============================================================================

export interface PermissionDefinition {
  code: string;
  category: string;
  label: string;           // Libellé métier en français (visible dans l'admin)
  description?: string;    // Description longue optionnelle
}

/**
 * Catalogue exhaustif de toutes les permissions du système.
 * Organisé par module métier, dans l'ordre du cahier des charges.
 */
export const PERMISSIONS_CATALOG: PermissionDefinition[] = [
  // ── VENTES & CAISSE COMPTOIR ──
  { code: 'pos.access',              category: 'VENTES',       label: 'Accéder au Point de Vente' },
  { code: 'vente.creer',             category: 'VENTES',       label: 'Enregistrer une vente au comptoir' },
  { code: 'vente.consulter',         category: 'VENTES',       label: 'Consulter l\'historique des ventes' },
  { code: 'vente.remise',            category: 'VENTES',       label: 'Appliquer une remise standard' },
  { code: 'vente.remise_plafond',    category: 'VENTES',       label: 'Appliquer une remise au-delà du plafond' },
  { code: 'vente.annuler',           category: 'VENTES',       label: 'Annuler une vente et émettre un avoir' },
  { code: 'vente.demande_annulation', category: 'VENTES',      label: 'Transmettre une demande d\'annulation' },

  // ── ORDONNANCES ──
  { code: 'ordonnance.creer',        category: 'ORDONNANCES',  label: 'Enregistrer une ordonnance' },
  { code: 'ordonnance.consulter',    category: 'ORDONNANCES',  label: 'Consulter une ordonnance' },
  { code: 'ordonnance.valider',      category: 'ORDONNANCES',  label: 'Valider la délivrance d\'une ordonnance' },

  // ── CLIENTS ──
  { code: 'client.consulter',        category: 'CLIENTS',      label: 'Consulter les fiches clients' },
  { code: 'clients.consulter',       category: 'CLIENTS',      label: 'Consulter la liste des clients' },
  { code: 'client.creer',            category: 'CLIENTS',      label: 'Créer ou modifier une fiche client' },
  { code: 'client.credit',           category: 'CLIENTS',      label: 'Autoriser un dépassement de crédit' },
  { code: 'client.paiement',         category: 'CLIENTS',      label: 'Enregistrer un règlement de créance' },
  { code: 'client.identite_complete', category: 'CLIENTS',     label: 'Consulter le numéro complet et scan de pièce d\'identité' },
  { code: 'client.notes_medicales',  category: 'CLIENTS',      label: 'Consulter les notes médicales' },

  // ── CATALOGUE PRODUITS ──
  { code: 'catalogue.consulter',     category: 'CATALOGUE',    label: 'Consulter le catalogue des produits' },
  { code: 'catalogue.creer',         category: 'CATALOGUE',    label: 'Créer un produit' },
  { code: 'catalogue.modifier',      category: 'CATALOGUE',    label: 'Modifier un produit' },
  { code: 'prix.modifier',           category: 'CATALOGUE',    label: 'Modifier un prix de vente' },

  // ── STOCK ──
  { code: 'stock.consulter',         category: 'STOCK',        label: 'Consulter les niveaux de stock' },
  { code: 'stock.recevoir',          category: 'STOCK',        label: 'Réceptionner une livraison' },
  { code: 'stock.ajuster',           category: 'STOCK',        label: 'Demander un ajustement de stock' },
  { code: 'stock.valider_ajustement', category: 'STOCK',       label: 'Valider un ajustement de stock' },
  { code: 'stock.inventaire',        category: 'STOCK',        label: 'Gérer et saisir les inventaires' },
  { code: 'stock.inventaire_consulter', category: 'STOCK',     label: 'Consulter les inventaires (lecture seule)' },
  { code: 'stock.valider_inventaire', category: 'STOCK',       label: 'Valider un inventaire physique' },

  // ── ACHATS & FOURNISSEURS ──
  { code: 'achats.consulter',        category: 'ACHATS',       label: 'Consulter les commandes fournisseurs' },
  { code: 'achats.creer',            category: 'ACHATS',       label: 'Créer une commande fournisseur' },
  { code: 'achats.valider',          category: 'ACHATS',       label: 'Valider une commande fournisseur' },

  // ── CAISSE & FINANCES ──
  { code: 'caisse.ouvrir',           category: 'FINANCE',      label: 'Ouvrir une session de caisse' },
  { code: 'caisse.cloturer',         category: 'FINANCE',      label: 'Clôturer sa session de caisse' },
  { code: 'caisse.consulter',        category: 'FINANCE',      label: 'Consulter les clôtures de caisse (lecture seule)' },
  { code: 'finances.consulter',      category: 'FINANCE',      label: 'Consulter les mouvements et dépenses de l\'officine' },
  { code: 'finances.mouvement',      category: 'FINANCE',      label: 'Enregistrer un apport ou retrait de caisse' },
  { code: 'depense.creer',           category: 'FINANCE',      label: 'Enregistrer une dépense' },
  { code: 'taux.modifier',           category: 'FINANCE',      label: 'Saisir le taux de change du jour' },

  // ── RAPPORTS ──
  { code: 'rapports.consulter',      category: 'RAPPORTS',     label: 'Consulter tous les rapports' },
  { code: 'rapports.dashboard',      category: 'RAPPORTS',     label: 'Consulter le tableau de bord' },
  { code: 'rapports.exporter',       category: 'RAPPORTS',     label: 'Exporter les rapports' },
  { code: 'rapports.ventes',         category: 'RAPPORTS',     label: 'Consulter les rapports de ventes' },
  { code: 'rapports.stock',          category: 'RAPPORTS',     label: 'Consulter les rapports de stock' },
  { code: 'rapports.financiers',     category: 'RAPPORTS',     label: 'Consulter les rapports financiers' },

  // ── AUDIT ──
  { code: 'audit.consulter',         category: 'AUDIT',        label: 'Consulter le journal d\'audit' },

  // ── ADMINISTRATION ──
  { code: 'admin.utilisateurs',      category: 'ADMIN',        label: 'Gérer les utilisateurs et les accès personnels' },
  { code: 'admin.roles',             category: 'ADMIN',        label: 'Créer, modifier et gérer les rôles dynamiques' },
  { code: 'parametres.modifier',     category: 'ADMIN',        label: 'Modifier les paramètres de l\'officine' },
  { code: 'parametres.consulter',    category: 'ADMIN',        label: 'Consulter les paramètres' },

  // ── NOTIFICATIONS ──
  { code: 'notifications.consulter', category: 'NOTIFICATIONS', label: 'Consulter les notifications' },
];

/** Ensemble des codes pour validation rapide */
export const ALL_PERMISSION_CODES = new Set(PERMISSIONS_CATALOG.map((p) => p.code));

/** Index rapide par code */
export const PERMISSION_BY_CODE = new Map(PERMISSIONS_CATALOG.map((p) => [p.code, p]));

/** Index par catégorie */
export function getPermissionsByCategory(): Record<string, PermissionDefinition[]> {
  const grouped: Record<string, PermissionDefinition[]> = {};
  for (const p of PERMISSIONS_CATALOG) {
    if (!grouped[p.category]) grouped[p.category] = [];
    grouped[p.category].push(p);
  }
  return grouped;
}

// ==============================================================================
// MATRICE RÔLE → PERMISSIONS PAR DÉFAUT (cahier des charges section 3)
// Seul le SUPER_ADMIN a le wildcard '*' absolu et inaltérable.
// L'ADMIN possède par défaut toutes les permissions métier, modulables par le Super-Admin.
// ==============================================================================

export const ROLE_PERMISSIONS: Record<string, string[]> = {
  SUPER_ADMIN: ['*'],
  ADMIN: PERMISSIONS_CATALOG.map((p) => p.code),

  PHARMACIEN: [
    // Ventes / Caisse (complet)
    'pos.access', 'vente.creer', 'vente.consulter', 'vente.remise', 'vente.remise_plafond', 'vente.annuler',
    // Ordonnances et notes médicales (complet)
    'ordonnance.creer', 'ordonnance.consulter', 'ordonnance.valider',
    // Clients & Identité
    'client.consulter', 'clients.consulter', 'client.creer', 'client.credit', 'client.paiement',
    'client.identite_complete', 'client.notes_medicales',
    // Catalogue (modifier) & prix
    'catalogue.consulter', 'catalogue.creer', 'catalogue.modifier', 'prix.modifier',
    // Stock (réceptions, validation ajustements, validation inventaires)
    'stock.consulter', 'stock.recevoir', 'stock.valider_ajustement', 'stock.inventaire', 'stock.valider_inventaire',
    // Achats
    'achats.consulter', 'achats.creer', 'achats.valider',
    // Caisse & Finances
    'caisse.ouvrir', 'caisse.cloturer', 'caisse.consulter', 'finances.consulter', 'finances.mouvement', 'depense.creer', 'taux.modifier',
    // Rapports (selon droits -> complet pharmacie)
    'rapports.consulter', 'rapports.dashboard', 'rapports.exporter',
    'rapports.ventes', 'rapports.stock', 'rapports.financiers',
    // Journal d'audit (consulter)
    'audit.consulter',
    // Notifications
    'notifications.consulter',
  ],

  CAISSIER: [
    // Ventes / Caisse (sa session uniquement)
    'pos.access', 'vente.creer', 'vente.consulter', 'vente.remise', 'vente.demande_annulation',
    // Ordonnances (saisie)
    'ordonnance.creer',
    // Clients (saisie fiche de base, encaissement crédit)
    'client.consulter', 'clients.consulter', 'client.creer', 'client.paiement',
    // Catalogue (consulter uniquement, pas de modification de prix)
    'catalogue.consulter',
    // Stock (consulter pour affichage disponibilté comptoir)
    'stock.consulter',
    // Caisse (ouvrir et clôturer sa session de caisse uniquement)
    'caisse.ouvrir', 'caisse.cloturer',
    // Rapports (tableau de bord partiel + ventes propres)
    'rapports.dashboard', 'rapports.ventes',
    // Notifications
    'notifications.consulter',
  ],

  STOCK: [
    // Catalogue (modifier les fiches produits, mais pas les prix)
    'catalogue.consulter', 'catalogue.creer', 'catalogue.modifier',
    // Stock (réceptions, commandes, demande d'ajustement, inventaires)
    'stock.consulter', 'stock.recevoir', 'stock.ajuster', 'stock.inventaire',
    // Achats et fournisseurs
    'achats.consulter', 'achats.creer',
    // Rapports (ceux du stock)
    'rapports.dashboard', 'rapports.stock',
    // Notifications
    'notifications.consulter',
  ],

  COMPTABLE: [
    // Catalogue (consulter)
    'catalogue.consulter',
    // Stock (consulter)
    'stock.consulter',
    // Inventaire (consulter / lecture seule)
    'stock.inventaire_consulter',
    // Clients (consulter les créances/relevés, SANS ordonnances, SANS notes médicales, SANS pièce d'identité complète)
    'client.consulter', 'clients.consulter',
    // Clôture de caisse (lecture seule)
    'caisse.consulter',
    // Finances et dépenses (complet)
    'finances.consulter', 'finances.mouvement', 'depense.creer', 'taux.modifier',
    // Rapports (financiers + tableau de bord complet)
    'rapports.consulter', 'rapports.dashboard', 'rapports.exporter', 'rapports.financiers',
    // Journal d'audit (consulter)
    'audit.consulter',
    // Notifications
    'notifications.consulter',
  ],
};

/**
 * Catégories de permissions avec leur libellé métier pour l'écran d'admin.
 */
export const PERMISSION_CATEGORY_LABELS: Record<string, string> = {
  VENTES: 'Ventes et Caisse',
  ORDONNANCES: 'Ordonnances et Notes Médicales',
  CLIENTS: 'Clients et Créances',
  CATALOGUE: 'Catalogue Produits',
  STOCK: 'Stock et Inventaires',
  ACHATS: 'Achats et Fournisseurs',
  FINANCE: 'Caisse et Finances',
  RAPPORTS: 'Tableau de bord et Rapports',
  AUDIT: 'Journal d\'audit',
  ADMIN: 'Administration et Paramètres',
  NOTIFICATIONS: 'Notifications et Alertes',
};
