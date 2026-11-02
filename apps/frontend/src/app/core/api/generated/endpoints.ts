/**
 * Endpoints d'API générés depuis OpenAPI.
 * Régénérer avec : npm run api:generate
 */
export const API_ENDPOINTS = {
  'AuthController_login': {
    path: '/api/v1/auth/login',
    method: 'POST',
    summary: 'Connexion utilisateur avec contrôle de verrouillage (AUT-01, AUT-02, SEC-03)',
  },
  'AuthController_refresh': {
    path: '/api/v1/auth/refresh',
    method: 'POST',
    summary: 'Renouveler le jeton de session court avec un refresh token (AUT-03)',
  },
  'AuthController_getMe': {
    path: '/api/v1/auth/me',
    method: 'GET',
    summary: 'Obtenir le profil complet de l’utilisateur connecté et ses permissions (AUT-03, AUT-05)',
  },
  'AuthController_getAllUsers': {
    path: '/api/v1/auth/users',
    method: 'GET',
    summary: 'Lister tous les utilisateurs de l’officine (AUT-04)',
  },
  'AuthController_createUser': {
    path: '/api/v1/auth/users',
    method: 'POST',
    summary: 'Créer un utilisateur avec rôle prédéfini (AUT-04, AUT-05)',
  },
  'AuthController_getUserById': {
    path: '/api/v1/auth/users/{id}',
    method: 'GET',
    summary: 'Consulter les détails d’un utilisateur (AUT-04)',
  },
  'AuthController_updateUser': {
    path: '/api/v1/auth/users/{id}',
    method: 'PATCH',
    summary: 'Modifier les informations d’un utilisateur (AUT-04)',
  },
  'AuthController_deactivateUser': {
    path: '/api/v1/auth/users/{username}/deactivate',
    method: 'PATCH',
    summary: 'Désactiver un utilisateur sans suppression physique (AUT-04, RG-06)',
  },
  'AuthController_activateUser': {
    path: '/api/v1/auth/users/{username}/activate',
    method: 'PATCH',
    summary: 'Réactiver un utilisateur désactivé (AUT-04)',
  },
  'AuthController_resetPassword': {
    path: '/api/v1/auth/users/{id}/reset-password',
    method: 'PATCH',
    summary: 'Réinitialisation du mot de passe par un administrateur (AUT-06)',
  },
  'AuthController_changePassword': {
    path: '/api/v1/auth/change-password',
    method: 'POST',
    summary: 'Changer son propre mot de passe (Page Profil)',
  },
  'AuthController_changePin': {
    path: '/api/v1/auth/change-pin',
    method: 'POST',
    summary: 'Changer son propre code PIN (Page Profil)',
  },
  'AuthController_getLoginHistory': {
    path: '/api/v1/auth/login-history',
    method: 'GET',
    summary: 'Consulter l’historique des connexions (date, utilisateur, IP, résultat) (AUT-07)',
  },
  'AuthController_verifyPin': {
    path: '/api/v1/auth/verify-pin',
    method: 'POST',
    summary: 'Vérifier un code PIN superviseur pour action sensible et obtenir une autorisation temporaire (AUT-08)',
  },
  'AuditController_getLogs': {
    path: '/api/v1/audit/logs',
    method: 'GET',
    summary: 'Consulter et rechercher dans le journal d’audit inaltérable (AUD-01 à AUD-04)',
  },
  'CatalogController_createCategory': {
    path: '/api/v1/catalog/categories',
    method: 'POST',
    summary: 'Créer une catégorie ou forme galénique (CAT-04)',
  },
  'CatalogController_listCategories': {
    path: '/api/v1/catalog/categories',
    method: 'GET',
    summary: 'Lister les catégories administrables (CAT-04)',
  },
  'CatalogController_createProduct': {
    path: '/api/v1/catalog/products',
    method: 'POST',
    summary: 'Créer une fiche produit complète avec unité de vente (CAT-01, CAT-02, CAT-03)',
  },
  'CatalogController_searchProducts': {
    path: '/api/v1/catalog/products',
    method: 'GET',
    summary: 'Recherche instantanée par nom, DCI ou code-barres (CAT-05)',
  },
  'CatalogController_getProduct': {
    path: '/api/v1/catalog/products/{id}',
    method: 'GET',
    summary: 'Consulter la fiche d’un produit',
  },
  'CatalogController_updatePrice': {
    path: '/api/v1/catalog/products/{id}/price',
    method: 'PATCH',
    summary: 'Modifier le prix avec historique (CAT-06)',
  },
  'CatalogController_getPriceHistory': {
    path: '/api/v1/catalog/products/{id}/price-history',
    method: 'GET',
    summary: 'Historique des modifications de prix (CAT-06)',
  },
  'CatalogController_deactivateProduct': {
    path: '/api/v1/catalog/products/{id}/deactivate',
    method: 'PATCH',
    summary: 'Désactiver un produit sans perdre l’historique (CAT-08, RG-06)',
  },
  'CatalogController_exportCsv': {
    path: '/api/v1/catalog/export-csv',
    method: 'GET',
    summary: 'Exporter le catalogue sous format CSV (CAT-07)',
  },
  'CatalogController_importCsv': {
    path: '/api/v1/catalog/import-csv',
    method: 'POST',
    summary: 'Importer des produits via CSV avec rapport d’erreurs (CAT-07)',
  },
  'StockController_createLot': {
    path: '/api/v1/stock/lots',
    method: 'POST',
    summary: 'Réceptionner un lot avec date de péremption (STK-01, STK-02)',
  },
  'StockController_getStockByProduct': {
    path: '/api/v1/stock/products/{productId}',
    method: 'GET',
    summary: 'Consulter les lots et le stock disponible par produit (STK-07)',
  },
  'StockController_getAlerts': {
    path: '/api/v1/stock/alerts',
    method: 'GET',
    summary: 'Alertes stock bas et péremptions à 30, 60, 90 jours (STK-08, STK-09)',
  },
  'StockController_getCumpValuation': {
    path: '/api/v1/stock/cump-valuation',
    method: 'GET',
    summary: 'Valorisation intégrale du stock au Coût Unitaire Moyen Pondéré (STK-12, RG-14)',
  },
  'StockController_getControlledSubstancesRegister': {
    path: '/api/v1/stock/controlled-substances-register',
    method: 'GET',
    summary: 'Registre officiel des stupéfiants et substances contrôlées (STK-14)',
  },
  'StockController_requestAdjustment': {
    path: '/api/v1/stock/adjustments/request',
    method: 'POST',
    summary: 'Demander un ajustement de stock (Gestionnaire de stock) (STK-05)',
  },
  'StockController_listPendingAdjustments': {
    path: '/api/v1/stock/adjustments/pending',
    method: 'GET',
    summary: 'Lister les ajustements en attente de validation pharmacien (STK-05)',
  },
  'StockController_approveAdjustment': {
    path: '/api/v1/stock/adjustments/{id}/approve',
    method: 'PATCH',
    summary: 'Valider ou rejeter un ajustement (Pharmacien uniquement) (STK-05, RG-11)',
  },
  'StockController_createMovement': {
    path: '/api/v1/stock/movements',
    method: 'POST',
    summary: 'Enregistrer un mouvement de stock avec motif obligatoire (STK-04, RG-11)',
  },
  'StockController_getMovements': {
    path: '/api/v1/stock/movements',
    method: 'GET',
    summary: 'Consulter le journal inaltérable des mouvements de stock (STK-06)',
  },
  'StockController_quarantineLot': {
    path: '/api/v1/stock/lots/{id}/quarantine',
    method: 'POST',
    summary: 'Mettre un lot en quarantaine / blocage sanitaire (STK-10, RG-03)',
  },
  'StockController_createInventory': {
    path: '/api/v1/stock/inventories',
    method: 'POST',
    summary: 'Créer une session d’inventaire physique avec comptage (STK-11)',
  },
  'StockController_validateInventory': {
    path: '/api/v1/stock/inventories/{id}/validate',
    method: 'POST',
    summary: 'Validation officielle de l’inventaire par le Pharmacien (STK-11)',
  },
  'SalesController_createSale': {
    path: '/api/v1/sales',
    method: 'POST',
    summary: 'Enregistrer une vente rapide au comptoir (VTE-01 à VTE-08)',
  },
  'SalesController_listSales': {
    path: '/api/v1/sales',
    method: 'GET',
    summary: 'Historique des ventes de l’officine',
  },
  'SalesController_getSale': {
    path: '/api/v1/sales/{id}',
    method: 'GET',
    summary: 'Consulter le détail d’une facture par ID',
  },
  'SalesController_getDuplicata': {
    path: '/api/v1/sales/invoice/{invoiceNumber}/duplicata',
    method: 'GET',
    summary: 'Réimpression d’une facture marquée DUPLICATA (VTE-16)',
  },
  'SalesController_cancelSale': {
    path: '/api/v1/sales/{id}/cancel',
    method: 'PATCH',
    summary: 'Annuler une vente avec motif et émission d’avoir (VTE-13, RG-04)',
  },
  'SalesController_holdCart': {
    path: '/api/v1/sales/hold-cart',
    method: 'POST',
    summary: 'Mettre en attente un panier (VTE-11)',
  },
  'SalesController_listHeldCarts': {
    path: '/api/v1/sales/held-carts/list',
    method: 'GET',
    summary: 'Lister les paniers en attente de reprise',
  },
  'SalesController_resumeHeldCart': {
    path: '/api/v1/sales/held-carts/{id}/resume',
    method: 'POST',
    summary: 'Reprendre un panier mis en attente',
  },
  'CustomersController_createCustomer': {
    path: '/api/v1/customers',
    method: 'POST',
    summary: 'Créer un client (Particulier / Entreprise / Assurance) (CLI-01)',
  },
  'CustomersController_listCustomers': {
    path: '/api/v1/customers',
    method: 'GET',
    summary: 'Lister les clients enregistrés',
  },
  'CustomersController_getCustomer': {
    path: '/api/v1/customers/{id}',
    method: 'GET',
    summary: 'Consulter la fiche client et solde créance (CLI-01, CLI-03)',
  },
  'CustomersController_getStatement': {
    path: '/api/v1/customers/{id}/statement',
    method: 'GET',
    summary: 'Relevé de compte client, créances et plafond (CLI-03)',
  },
  'CustomersController_settleDebt': {
    path: '/api/v1/customers/{id}/settle-debt',
    method: 'PATCH',
    summary: 'Encaisser un règlement de créance client (CLI-04)',
  },
  'CustomersController_createPrescription': {
    path: '/api/v1/customers/prescriptions',
    method: 'POST',
    summary: 'Enregistrer une ordonnance avec lien signé temporaire (CLI-05, CLI-06)',
  },
  'CustomersController_getCustomerPrescriptions': {
    path: '/api/v1/customers/{id}/prescriptions',
    method: 'GET',
    summary: 'Consulter les ordonnances archivées d’un patient (accès journalisé CLI-06)',
  },
  'SettingsController_getSettings': {
    path: '/api/v1/settings',
    method: 'GET',
    summary: 'Consulter l’ensemble des paramètres de l’officine (PAR-01 à PAR-04)',
  },
  'SettingsController_updatePharmacy': {
    path: '/api/v1/settings/pharmacy',
    method: 'PATCH',
    summary: 'Mettre à jour l’identité et les coordonnées de l’officine (PAR-01)',
  },
  'SettingsController_updateFinancial': {
    path: '/api/v1/settings/financial',
    method: 'PATCH',
    summary: 'Mettre à jour les devises, taxes et plafonds de remises par rôle (PAR-02, PAR-03, PAR-04)',
  },
  'SettingsController_updateAlerts': {
    path: '/api/v1/settings/alerts',
    method: 'PATCH',
    summary: 'Mettre à jour les seuils de péremption et timeout d’inactivité (PAR-04, AUT-03, STK-09)',
  },
  'CashController_openSession': {
    path: '/api/v1/cash/sessions/open',
    method: 'POST',
    summary: 'Ouvrir une session de caisse avec fonds de départ CDF/USD (FIN-01)',
  },
  'CashController_getCurrentSession': {
    path: '/api/v1/cash/sessions/current',
    method: 'GET',
    summary: 'Consulter la session de caisse en cours de l’utilisateur',
  },
  'CashController_closeSession': {
    path: '/api/v1/cash/sessions/{id}/close',
    method: 'PATCH',
    summary: 'Clôturer la caisse avec réconciliation des écarts obligatoirement justifiée (FIN-02, RG-12)',
  },
  'CashController_getActiveRate': {
    path: '/api/v1/cash/exchange-rates/active',
    method: 'GET',
    summary: 'Consulter le taux de change officiel actif (FIN-04, RG-08)',
  },
  'CashController_setExchangeRate': {
    path: '/api/v1/cash/exchange-rates',
    method: 'POST',
    summary: 'Saisir un nouveau taux de change CDF / USD (FIN-04, RG-08)',
  },
  'CashController_getRatesHistory': {
    path: '/api/v1/cash/exchange-rates/history',
    method: 'GET',
    summary: 'Historique des taux de change saisis',
  },
  'CashController_createExpense': {
    path: '/api/v1/cash/expenses',
    method: 'POST',
    summary: 'Enregistrer une dépense avec catégorie (FIN-03)',
  },
  'CashController_listExpenses': {
    path: '/api/v1/cash/expenses',
    method: 'GET',
    summary: 'Lister les dépenses de l’officine',
  },
  'CashController_getAgingBalance': {
    path: '/api/v1/cash/receivables-aging',
    method: 'GET',
    summary: 'Balance âgée des créances clients 0-30, 31-60, >60 jours (FIN-06)',
  },
  'SuppliersController_createSupplier': {
    path: '/api/v1/suppliers',
    method: 'POST',
    summary: 'Créer une fiche fournisseur (ACH-01)',
  },
  'SuppliersController_listSuppliers': {
    path: '/api/v1/suppliers',
    method: 'GET',
    summary: 'Lister les fournisseurs actifs',
  },
  'SuppliersController_getSupplier': {
    path: '/api/v1/suppliers/{id}',
    method: 'GET',
    summary: 'Consulter une fiche fournisseur',
  },
  'SuppliersController_createPurchaseOrder': {
    path: '/api/v1/suppliers/orders',
    method: 'POST',
    summary: 'Créer un bon de commande fournisseur (ACH-02)',
  },
  'SuppliersController_listOrders': {
    path: '/api/v1/suppliers/orders/list',
    method: 'GET',
    summary: 'Lister les bons de commande',
  },
  'SuppliersController_receiveOrder': {
    path: '/api/v1/suppliers/orders/{id}/receive',
    method: 'POST',
    summary: 'Réceptionner une commande fournisseur avec création automatique des lots (ACH-04, STK-01)',
  },
  'SuppliersController_updateStatus': {
    path: '/api/v1/suppliers/orders/{id}/status',
    method: 'PATCH',
    summary: 'Modifier le statut d’un bon de commande',
  },
  'ReportsController_getDashboardMetrics': {
    path: '/api/v1/reports/dashboard',
    method: 'GET',
    summary: 'Indicateurs consolidés du tableau de bord (RPT-01 à RPT-06)',
  },
  'ReportsController_getSalesDetailedReport': {
    path: '/api/v1/reports/sales',
    method: 'GET',
    summary: 'Rapport détaillé des ventes et chiffre d’affaires (RPT-08)',
  },
  'ReportsController_getStockDetailedReport': {
    path: '/api/v1/reports/stock-alerts',
    method: 'GET',
    summary: 'Rapport détaillé des alertes de stock et péremptions (RPT-08)',
  },
  'HealthController_check': {
    path: '/api/v1/health',
    method: 'GET',
    summary: 'Vérification de l\'état de santé du backend API et de la connexion PostgreSQL (OBS-01)',
  },
} as const;
