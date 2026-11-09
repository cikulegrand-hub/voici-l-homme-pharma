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
  'AuthController_logout': {
    path: '/api/v1/auth/logout',
    method: 'POST',
    summary: 'Déconnexion utilisateur et traçabilité d’audit (AUD-01)',
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
  'AuthController_verifyPin': {
    path: '/api/v1/auth/verify-pin',
    method: 'POST',
    summary: 'Vérifier un code PIN superviseur pour action sensible et obtenir une autorisation temporaire (AUT-08)',
  },
  'AuditController_getLogs': {
    path: '/api/v1/audit/logs',
    method: 'GET',
    summary: 'Consulter et rechercher dans le journal d’audit inaltérable avec pagination (AUD-01 à AUD-04)',
  },
  'AuditController_exportLogs': {
    path: '/api/v1/audit/export',
    method: 'GET',
    summary: 'Exporter le journal d’audit au format CSV/Excel pour inspection (AUD-05)',
  },
  'CatalogController_listCategories': {
    path: '/api/v1/catalog/categories',
    method: 'GET',
    summary: 'Lister les catégories de produits (CAT-04)',
  },
  'CatalogController_createCategory': {
    path: '/api/v1/catalog/categories',
    method: 'POST',
    summary: 'Créer une nouvelle catégorie (CAT-04)',
  },
  'CatalogController_updateCategory': {
    path: '/api/v1/catalog/categories/{id}',
    method: 'PATCH',
    summary: 'Modifier une catégorie existante (CAT-04)',
  },
  'CatalogController_deleteCategory': {
    path: '/api/v1/catalog/categories/{id}',
    method: 'DELETE',
    summary: 'Supprimer une catégorie sans produits associés (CAT-04)',
  },
  'CatalogController_listGalenicForms': {
    path: '/api/v1/catalog/galenic-forms',
    method: 'GET',
    summary: 'Lister les formes galéniques administrables (CAT-04)',
  },
  'CatalogController_createGalenicForm': {
    path: '/api/v1/catalog/galenic-forms',
    method: 'POST',
    summary: 'Ajouter une nouvelle forme galénique (CAT-04)',
  },
  'CatalogController_autocomplete': {
    path: '/api/v1/catalog/autocomplete',
    method: 'GET',
    summary: 'Autocomplétion ultra-légère pour la caisse (CAT-05, PERF-01)',
  },
  'CatalogController_searchProducts': {
    path: '/api/v1/catalog/products',
    method: 'GET',
    summary: 'Recherche instantanée avec tolérance aux fautes et pagination (CAT-05, PERF-01)',
  },
  'CatalogController_createProduct': {
    path: '/api/v1/catalog/products',
    method: 'POST',
    summary: 'Créer une fiche produit complète (CAT-01, CAT-02, CAT-03)',
  },
  'CatalogController_getProduct': {
    path: '/api/v1/catalog/products/{id}',
    method: 'GET',
    summary: 'Consulter la fiche détaillée d’un produit (CAT-01)',
  },
  'CatalogController_updateProduct': {
    path: '/api/v1/catalog/products/{id}',
    method: 'PATCH',
    summary: 'Mettre à jour une fiche produit (CAT-01, CAT-02)',
  },
  'CatalogController_updatePrice': {
    path: '/api/v1/catalog/products/{id}/price',
    method: 'PATCH',
    summary: 'Modifier le prix avec motif et historique obligatoire (CAT-06)',
  },
  'CatalogController_getPriceHistory': {
    path: '/api/v1/catalog/products/{id}/price-history',
    method: 'GET',
    summary: 'Historique audité des modifications de prix (CAT-06)',
  },
  'CatalogController_addBarcode': {
    path: '/api/v1/catalog/products/{id}/barcodes',
    method: 'POST',
    summary: 'Associer un code-barres supplémentaire (CAT-03)',
  },
  'CatalogController_removeBarcode': {
    path: '/api/v1/catalog/products/{id}/barcodes/{barcodeId}',
    method: 'DELETE',
    summary: 'Supprimer un code-barres d’un produit (CAT-03)',
  },
  'CatalogController_deactivateProduct': {
    path: '/api/v1/catalog/products/{id}/deactivate',
    method: 'PATCH',
    summary: 'Désactiver un produit sans perte d’historique (CAT-08, RG-06)',
  },
  'CatalogController_activateProduct': {
    path: '/api/v1/catalog/products/{id}/activate',
    method: 'PATCH',
    summary: 'Réactiver un produit désactivé (CAT-08)',
  },
  'CatalogController_exportCsv': {
    path: '/api/v1/catalog/export-csv',
    method: 'GET',
    summary: 'Exporter le catalogue sous format CSV (CAT-07)',
  },
  'CatalogController_simulateImport': {
    path: '/api/v1/catalog/import/simulate',
    method: 'POST',
    summary: 'Simuler l’importation d’un catalogue avec rapport d’erreurs (CAT-07)',
  },
  'CatalogController_executeImport': {
    path: '/api/v1/catalog/import/execute',
    method: 'POST',
    summary: 'Exécuter l’importation définitive du catalogue (CAT-07)',
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
  'CashController_getActiveSession': {
    path: '/api/v1/cash/sessions/active',
    method: 'GET',
    summary: '',
  },
  'CashController_createMovement': {
    path: '/api/v1/cash/sessions/{id}/movements',
    method: 'POST',
    summary: 'Enregistrer un apport ou un retrait physique de caisse (FIN-05)',
  },
  'CashController_listMovements': {
    path: '/api/v1/cash/sessions/{id}/movements',
    method: 'GET',
    summary: '',
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
  'CashController_reverseExpense': {
    path: '/api/v1/cash/expenses/{id}/reverse',
    method: 'POST',
    summary: '',
  },
  'CashController_uploadReceipt': {
    path: '/api/v1/cash/expenses/{id}/receipt',
    method: 'POST',
    summary: '',
  },
  'CashController_downloadReceipt': {
    path: '/api/v1/cash/expenses/{id}/receipt',
    method: 'GET',
    summary: '',
  },
  'CashController_listExpenseCategories': {
    path: '/api/v1/cash/expense-categories',
    method: 'GET',
    summary: '',
  },
  'CashController_createExpenseCategory': {
    path: '/api/v1/cash/expense-categories',
    method: 'POST',
    summary: '',
  },
  'CashController_paymentSummary': {
    path: '/api/v1/cash/payment-summary',
    method: 'GET',
    summary: '',
  },
  'CashController_varianceAlerts': {
    path: '/api/v1/cash/alerts/variances',
    method: 'GET',
    summary: '',
  },
  'CashController_profitability': {
    path: '/api/v1/cash/profitability',
    method: 'GET',
    summary: '',
  },
  'CashController_getAgingBalance': {
    path: '/api/v1/cash/receivables-aging',
    method: 'GET',
    summary: 'Balance âgée des créances clients 0-30, 31-60, >60 jours (FIN-06)',
  },
  'StockController_createLot': {
    path: '/api/v1/stock/lots',
    method: 'POST',
    summary: 'Réceptionner un lot avec date de péremption (STK-01, STK-02)',
  },
  'StockController_listLots': {
    path: '/api/v1/stock/lots',
    method: 'GET',
    summary: 'Lister les lots (STK-07)',
  },
  'StockController_directReception': {
    path: '/api/v1/stock/reception/direct',
    method: 'POST',
    summary: 'Réception directe multi-produits avec clé d’idempotence et CUMP (STK-01, RG-14)',
  },
  'StockController_getStockByProduct': {
    path: '/api/v1/stock/products/{productId}',
    method: 'GET',
    summary: 'Consulter les lots et le stock disponible par produit (STK-07)',
  },
  'StockController_simulateFefoAllocation': {
    path: '/api/v1/stock/fefo/simulate',
    method: 'POST',
    summary: 'Simuler l’allocation FEFO pour consultation ou délivrance (RG-01)',
  },
  'StockController_getAlerts': {
    path: '/api/v1/stock/alerts',
    method: 'GET',
    summary: 'Alertes stock bas, ruptures et péremptions à 30, 60, 90 jours (STK-08, STK-09)',
  },
  'StockController_getCumpValuation': {
    path: '/api/v1/stock/cump-valuation',
    method: 'GET',
    summary: 'Valorisation intégrale du stock au CUMP (STK-12, RG-14)',
  },
  'StockController_getCumpValuationAlias': {
    path: '/api/v1/stock/valuation/cump',
    method: 'GET',
    summary: 'Valorisation au CUMP (alias frontend)',
  },
  'StockController_getControlledSubstancesRegister': {
    path: '/api/v1/stock/controlled-substances-register',
    method: 'GET',
    summary: 'Registre officiel des stupéfiants et substances contrôlées (STK-14)',
  },
  'StockController_getControlledRegisterCompat': {
    path: '/api/v1/stock/controlled-register',
    method: 'GET',
    summary: 'Registre officiel des stupéfiants et substances contrôlées (compatibilité)',
  },
  'StockController_requestAdjustment': {
    path: '/api/v1/stock/adjustments/request',
    method: 'POST',
    summary: 'Demander un ajustement de stock (Gestionnaire) (STK-05)',
  },
  'StockController_listPendingAdjustments': {
    path: '/api/v1/stock/adjustments/pending',
    method: 'GET',
    summary: 'Lister les ajustements en attente de validation pharmacien (STK-05)',
  },
  'StockController_approveAdjustmentPost': {
    path: '/api/v1/stock/adjustments/{id}/approve',
    method: 'POST',
    summary: 'Valider ou rejeter un ajustement (Pharmacien uniquement) (STK-05, RG-11)',
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
    summary: 'Mettre un lot en quarantaine sanitaire (STK-10, RG-03)',
  },
  'StockController_patchQuarantineLot': {
    path: '/api/v1/stock/lots/{id}/quarantine',
    method: 'PATCH',
    summary: 'Bloquer ou débloquer un lot (compatibilité Angular)',
  },
  'StockController_unquarantineLot': {
    path: '/api/v1/stock/lots/{id}/unquarantine',
    method: 'POST',
    summary: 'Débloquer un lot de quarantaine sanitaire (STK-10, RG-03)',
  },
  'StockController_createInventory': {
    path: '/api/v1/stock/inventories',
    method: 'POST',
    summary: 'Créer une session d’inventaire physique avec comptage (STK-11)',
  },
  'StockController_listInventories': {
    path: '/api/v1/stock/inventories',
    method: 'GET',
    summary: 'Lister les sessions d’inventaire (STK-11)',
  },
  'StockController_getInventoryById': {
    path: '/api/v1/stock/inventories/{id}',
    method: 'GET',
    summary: 'Détails d’un inventaire avec écarts de comptage (STK-11)',
  },
  'StockController_recordInventoryCount': {
    path: '/api/v1/stock/inventories/{id}/counts',
    method: 'POST',
    summary: 'Saisir un comptage d’inventaire (STK-11)',
  },
  'StockController_validateInventory': {
    path: '/api/v1/stock/inventories/{id}/validate',
    method: 'POST',
    summary: 'Validation officielle de l’inventaire par le Pharmacien (STK-11)',
  },
  'StockController_cancelInventory': {
    path: '/api/v1/stock/inventories/{id}/cancel',
    method: 'POST',
    summary: 'Annuler un inventaire sans générer de mouvements (STK-11)',
  },
  'SalesController_createSale': {
    path: '/api/v1/sales',
    method: 'POST',
    summary: 'Enregistrer une vente rapide au comptoir',
  },
  'SalesController_listSales': {
    path: '/api/v1/sales',
    method: 'GET',
    summary: 'Historique et recherche multi-critères des ventes',
  },
  'SalesController_previewSale': {
    path: '/api/v1/sales/preview',
    method: 'POST',
    summary: 'Prévisualiser les montants d’une vente sans écriture',
  },
  'SalesController_syncOfflineSales': {
    path: '/api/v1/sales/sync',
    method: 'POST',
    summary: 'Synchroniser un lot de ventes réalisées hors-ligne (V2 Hors-ligne)',
  },
  'SalesController_listConflicts': {
    path: '/api/v1/sales/conflicts',
    method: 'GET',
    summary: 'Lister les ventes en conflit de stock lors de la synchronisation hors-ligne',
  },
  'SalesController_resolveConflict': {
    path: '/api/v1/sales/{id}/resolve-conflict',
    method: 'POST',
    summary: 'Arbitrer et résoudre un conflit de vente hors-ligne (Pharmacien Responsable)',
  },
  'SalesController_getDuplicata': {
    path: '/api/v1/sales/invoice/{invoiceNumber}/duplicata',
    method: 'GET',
    summary: 'Réimpression d’une facture marquée DUPLICATA',
  },
  'SalesController_getInvoiceHtml': {
    path: '/api/v1/sales/invoice/{invoiceNumber}/html',
    method: 'GET',
    summary: 'Obtenir la facture en HTML prête à imprimer',
  },
  'SalesController_getTicketHtml': {
    path: '/api/v1/sales/invoice/{invoiceNumber}/ticket-html',
    method: 'GET',
    summary: 'Obtenir le ticket de caisse en HTML prêt à imprimer',
  },
  'SalesController_getDuplicataHtml': {
    path: '/api/v1/sales/invoice/{invoiceNumber}/duplicata/html',
    method: 'GET',
    summary: 'Obtenir le duplicata en HTML prêt à imprimer',
  },
  'SalesController_document': {
    path: '/api/v1/sales/invoice/{invoiceNumber}/document',
    method: 'GET',
    summary: '',
  },
  'SalesController_ticket': {
    path: '/api/v1/sales/invoice/{invoiceNumber}/ticket',
    method: 'GET',
    summary: '',
  },
  'SalesController_duplicateDocument': {
    path: '/api/v1/sales/invoice/{invoiceNumber}/duplicata/document',
    method: 'GET',
    summary: '',
  },
  'SalesController_holdCart': {
    path: '/api/v1/sales/hold-cart',
    method: 'POST',
    summary: 'Mettre en attente un panier',
  },
  'SalesController_listHeldCarts': {
    path: '/api/v1/sales/held-carts/list',
    method: 'GET',
    summary: 'Lister les paniers en attente',
  },
  'SalesController_resumeHeldCart': {
    path: '/api/v1/sales/held-carts/{id}/resume',
    method: 'POST',
    summary: 'Reprendre un panier mis en attente',
  },
  'SalesController_requestCancellation': {
    path: '/api/v1/sales/{id}/request-cancellation',
    method: 'POST',
    summary: 'Transmettre une demande d’annulation de vente au pharmacien (VTE-13, UC-05)',
  },
  'SalesController_listCancellationRequests': {
    path: '/api/v1/sales/cancellation-requests',
    method: 'GET',
    summary: 'Lister les demandes d’annulation en attente de validation pharmacien',
  },
  'SalesController_cancelSale': {
    path: '/api/v1/sales/{id}/cancel',
    method: 'PATCH',
    summary: 'Annuler une vente avec motif',
  },
  'SalesController_getSale': {
    path: '/api/v1/sales/{id}',
    method: 'GET',
    summary: 'Consulter le détail d’une facture par ID',
  },
  'CustomersController_createCustomer': {
    path: '/api/v1/customers',
    method: 'POST',
    summary: 'Créer un client (CLI-01)',
  },
  'CustomersController_listCustomers': {
    path: '/api/v1/customers',
    method: 'GET',
    summary: 'Lister/rechercher les clients avec solde calculé (CLI-01)',
  },
  'CustomersController_createQuickCustomer': {
    path: '/api/v1/customers/quick',
    method: 'POST',
    summary: 'Créer un particulier au comptoir avec une fiche minimale',
  },
  'CustomersController_listInsurers': {
    path: '/api/v1/customers/insurers',
    method: 'GET',
    summary: '',
  },
  'CustomersController_revealIdentityNumber': {
    path: '/api/v1/customers/identity-documents/{documentId}/number',
    method: 'GET',
    summary: '',
  },
  'CustomersController_identityScanSignedUrl': {
    path: '/api/v1/customers/identity-documents/{documentId}/signed-url',
    method: 'GET',
    summary: '',
  },
  'CustomersController_uploadProfilePhoto': {
    path: '/api/v1/customers/{id}/photo',
    method: 'POST',
    summary: '',
  },
  'CustomersController_removeProfilePhoto': {
    path: '/api/v1/customers/{id}/photo',
    method: 'DELETE',
    summary: '',
  },
  'CustomersController_profilePhotoSignedUrl': {
    path: '/api/v1/customers/{id}/photo/signed-url',
    method: 'GET',
    summary: '',
  },
  'CustomersController_profilePhotoFile': {
    path: '/api/v1/customers/{id}/photo/file',
    method: 'GET',
    summary: '',
  },
  'CustomersController_privacyNotice': {
    path: '/api/v1/customers/privacy-notice',
    method: 'GET',
    summary: 'Lire la mention de confidentialité (CLI-10)',
  },
  'CustomersController_createPrescription': {
    path: '/api/v1/customers/prescriptions',
    method: 'POST',
    summary: 'Téléverser une ordonnance dans le stockage privé (CLI-05, CLI-06)',
  },
  'CustomersController_signedUrl': {
    path: '/api/v1/customers/prescriptions/{prescriptionId}/signed-url',
    method: 'GET',
    summary: 'Obtenir à la demande un lien signé temporaire, journalisé (CLI-06, RG-17)',
  },
  'CustomersController_file': {
    path: '/api/v1/customers/prescriptions/{prescriptionId}/file',
    method: 'GET',
    summary: 'Lire une image d’ordonnance locale via une requête authentifiée',
  },
  'CustomersController_getCustomerPrescriptions': {
    path: '/api/v1/customers/{id}/prescriptions',
    method: 'GET',
    summary: 'Lister les métadonnées des ordonnances, sans URL (CLI-06)',
  },
  'CustomersController_history': {
    path: '/api/v1/customers/{id}/history',
    method: 'GET',
    summary: 'Historique des achats et règlements client',
  },
  'CustomersController_updateCustomer': {
    path: '/api/v1/customers/{id}',
    method: 'PATCH',
    summary: '',
  },
  'CustomersController_getCustomer': {
    path: '/api/v1/customers/{id}',
    method: 'GET',
    summary: 'Consulter une fiche client',
  },
  'CustomersController_deactivateCustomer': {
    path: '/api/v1/customers/{id}/deactivate',
    method: 'PATCH',
    summary: '',
  },
  'CustomersController_getStatement': {
    path: '/api/v1/customers/{id}/statement',
    method: 'GET',
    summary: 'Relevé de compte client',
  },
  'CustomersController_settleDebt': {
    path: '/api/v1/customers/{id}/settle-debt',
    method: 'PATCH',
    summary: 'Encaisser un règlement FIFO idempotent lié à la caisse (CLI-04)',
  },
  'SettingsController_getAllSettings': {
    path: '/api/v1/settings',
    method: 'GET',
    summary: 'Consulter l’ensemble des paramètres de l’officine',
  },
  'SettingsController_getPharmacyIdentity': {
    path: '/api/v1/settings/identity',
    method: 'GET',
    summary: 'Consulter l’identité et les coordonnées de l’officine (PAR-01)',
  },
  'SettingsController_updatePharmacyIdentityLegacy': {
    path: '/api/v1/settings/identity',
    method: 'PATCH',
    summary: 'Mettre à jour l’identité officielle de l’officine (PAR-01)',
  },
  'SettingsController_updatePharmacyIdentity': {
    path: '/api/v1/settings/pharmacy',
    method: 'PATCH',
    summary: 'Mettre à jour l’identité officielle de l’officine (PAR-01)',
  },
  'SettingsController_uploadLogo': {
    path: '/api/v1/settings/logo',
    method: 'POST',
    summary: 'Téléverser le logo de l’officine (PAR-01)',
  },
  'SettingsController_getFinancialRules': {
    path: '/api/v1/settings/financial',
    method: 'GET',
    summary: 'Consulter les devises, règles d’arrondi, taxes et plafonds de remise (PAR-02, PAR-03)',
  },
  'SettingsController_updateFinancialRules': {
    path: '/api/v1/settings/financial',
    method: 'PATCH',
    summary: 'Mettre à jour les règles financières et taxes (PAR-02, PAR-03)',
  },
  'SettingsController_getAlertThresholds': {
    path: '/api/v1/settings/alerts',
    method: 'GET',
    summary: 'Consulter les seuils d’alerte de péremption et timeout session (PAR-04, AUT-03)',
  },
  'SettingsController_updateAlertThresholds': {
    path: '/api/v1/settings/alerts',
    method: 'PATCH',
    summary: 'Mettre à jour les seuils d’alerte et timeout de session (PAR-04, AUT-03)',
  },
  'SettingsController_getPrintTemplates': {
    path: '/api/v1/settings/print-templates',
    method: 'GET',
    summary: 'Consulter les modèles de ticket de caisse et de facture (PAR-05, PAR-06)',
  },
  'SettingsController_updatePrintTemplates': {
    path: '/api/v1/settings/print-templates',
    method: 'PATCH',
    summary: 'Mettre à jour les modèles de ticket et facture (PAR-05, PAR-06)',
  },
  'SettingsController_simulateImport': {
    path: '/api/v1/settings/import/simulate',
    method: 'POST',
    summary: 'Simuler l’importation de données sans aucune écriture en base (PAR-07)',
  },
  'SettingsController_executeImport': {
    path: '/api/v1/settings/import/execute',
    method: 'POST',
    summary: 'Valider définitivement et exécuter l’importation transactionnelle (PAR-07)',
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
  'SuppliersController_createPurchaseOrder': {
    path: '/api/v1/suppliers/orders',
    method: 'POST',
    summary: 'Créer un bon de commande fournisseur (ACH-02)',
  },
  'SuppliersController_listOrders': {
    path: '/api/v1/suppliers/orders',
    method: 'GET',
    summary: 'Lister les bons de commande avec filtres et pagination',
  },
  'SuppliersController_listOrdersCompat': {
    path: '/api/v1/suppliers/orders/list',
    method: 'GET',
    summary: 'Lister les bons de commande (compatibilité)',
  },
  'SuppliersController_getOrderById': {
    path: '/api/v1/suppliers/orders/{id}',
    method: 'GET',
    summary: 'Consulter le détail d’un bon de commande',
  },
  'SuppliersController_exportOrderPdf': {
    path: '/api/v1/suppliers/orders/{id}/pdf',
    method: 'GET',
    summary: 'Exporter un bon de commande au format PDF (ACH-02)',
  },
  'SuppliersController_receiveOrder': {
    path: '/api/v1/suppliers/orders/{id}/receive',
    method: 'POST',
    summary: 'Réceptionner une commande fournisseur avec création de lots et CUMP (ACH-04, STK-01, RG-14)',
  },
  'SuppliersController_updateStatus': {
    path: '/api/v1/suppliers/orders/{id}/status',
    method: 'PATCH',
    summary: 'Modifier le statut d’un bon de commande (ACH-02)',
  },
  'SuppliersController_getSupplier': {
    path: '/api/v1/suppliers/{id}',
    method: 'GET',
    summary: 'Consulter une fiche fournisseur',
  },
  'SuppliersController_updateSupplier': {
    path: '/api/v1/suppliers/{id}',
    method: 'PATCH',
    summary: 'Modifier une fiche fournisseur (ACH-01)',
  },
  'ReportsController_getDashboardMetrics': {
    path: '/api/v1/reports/dashboard',
    method: 'GET',
    summary: 'Indicateurs consolidés du tableau de bord RPT-01 à RPT-06',
  },
  'ReportsController_getSalesDetailedReport': {
    path: '/api/v1/reports/sales',
    method: 'GET',
    summary: 'Rapport détaillé des ventes et chiffre d’affaires RPT-08',
  },
  'ReportsController_getStockDetailedReport': {
    path: '/api/v1/reports/stock-alerts',
    method: 'GET',
    summary: 'Rapport détaillé des alertes de stock et péremptions RPT-08',
  },
  'ReportsController_exportReport': {
    path: '/api/v1/reports/{reportKey}/export',
    method: 'GET',
    summary: 'Exporter un rapport RPT-09 en CSV, Excel ou PDF',
  },
  'ReportsController_getDetailedReport': {
    path: '/api/v1/reports/{reportKey}',
    method: 'GET',
    summary: 'Rapport RPT-08 paginé avec filtres et totaux serveur',
  },
  'NotificationsController_getNotifications': {
    path: '/api/v1/notifications',
    method: 'GET',
    summary: 'Lister les notifications avec statut lu/non-lu pour l’utilisateur (NOT-01)',
  },
  'NotificationsController_getUnreadCount': {
    path: '/api/v1/notifications/unread-count',
    method: 'GET',
    summary: 'Compteur de notifications non lues pour badge d’en-tête (NOT-02)',
  },
  'NotificationsController_markAsRead': {
    path: '/api/v1/notifications/{id}/read',
    method: 'PATCH',
    summary: 'Marquer une alerte comme lue par l’utilisateur connecté (NOT-01)',
  },
  'NotificationsController_markAllAsRead': {
    path: '/api/v1/notifications/mark-all-read',
    method: 'PATCH',
    summary: 'Marquer toutes les alertes comme lues (NOT-01)',
  },
  'NotificationsController_syncAlerts': {
    path: '/api/v1/notifications/sync',
    method: 'POST',
    summary: 'Déclencher la détection et génération des alertes (stock bas, péremptions, créances, écarts)',
  },
  'HealthController_check': {
    path: '/api/v1/health',
    method: 'GET',
    summary: 'Vérification de l\'état de santé du backend API et de la connexion PostgreSQL (OBS-01)',
  },
} as const;
