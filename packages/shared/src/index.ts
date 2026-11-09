// ==============================================================================
// PROJET : VOICI L'HOMME PHARMA (VHP-CDC-001)
// MODULE : packages/shared/src/index.ts
// DESCRIPTION : Types, DTOs et contrats partagés entre Backend (NestJS) et Frontend (Angular)
// ==============================================================================

// 1. DEVISES & MONNAIE (CDF / USD - Section 2.3 & RG-08)
export type CurrencyCode = 'CDF' | 'USD';

// 1 bis. RAPPORTS (RPT-01 à RPT-10)
export type ReportKey =
  | 'sales-journal'
  | 'stock-movements'
  | 'valued-inventory'
  | 'expiries'
  | 'receivables'
  | 'expenses'
  | 'seller-performance'
  | 'best-sellers'
  | 'low-rotation'
  | 'stock-entries-exits'
  | 'treasury';

export type ReportPeriod = 'day' | 'week' | 'month' | 'custom';
export type ReportSortDirection = 'asc' | 'desc';

export interface ReportFilters {
  from: string;
  to: string;
  period?: ReportPeriod;
  userId?: string;
  categoryId?: string;
  siteId?: string;
  currency?: CurrencyCode;
  page?: number;
  limit?: number;
  sortBy?: string;
  sortDirection?: ReportSortDirection;
}

export interface ReportLink {
  reportKey: ReportKey;
  params: ReportFilters;
}

export interface ReportMetricValue {
  value: number;
  previousValue: number;
  variationPercent: number | null;
}

export interface DashboardMetric {
  key: string;
  valuesByCurrency: Partial<Record<CurrencyCode, ReportMetricValue>>;
  reportLink: ReportLink;
}

export interface DashboardChartPoint {
  label: string;
  value: number;
  secondaryValue?: number;
}

export interface ReportTotals {
  rowCount: number;
  isEmpty: boolean;
  byCurrency?: Partial<Record<CurrencyCode, Record<string, number>>>;
}

export interface ReportResult<T = unknown> {
  reportKey: ReportKey;
  filters: ReportFilters;
  data: T[];
  totals: ReportTotals;
}

export interface ExchangeRate {
  id: string;
  pharmacyId: string;
  baseCurrency: CurrencyCode;
  targetCurrency: CurrencyCode;
  rate: number;
  effectiveDate: string;
  notes?: string;
  createdByName?: string;
}

// 2. UTILISATEURS & DROITS (AUT-01 à AUT-07)
export type RoleName = 'ADMIN' | 'PHARMACIEN' | 'CAISSIER' | 'STOCK' | 'COMPTABLE';

export interface Permission {
  id: string;
  code: string;
  description: string;
  category: string;
}

export interface UserProfile {
  id: string;
  pharmacyId: string;
  role: RoleName;
  username: string;
  fullName: string;
  email?: string;
  permissions: string[];
  isActive: boolean;
}

export interface AuthSession {
  token: string;
  refreshToken: string;
  user: UserProfile;
  activeRate?: ExchangeRate;
}

// 3. CATALOGUE PRODUITS (CAT-01 à CAT-11)
export interface ProductCategory {
  id: string;
  name: string;
  description?: string;
}

export interface GalenicForm {
  id: string;
  name: string;
  description?: string;
}

export interface ProductBarcode {
  id: string;
  productId: string;
  barcode: string;
  isPrimary: boolean;
  createdAt?: string;
}

export interface Product {
  id: string;
  pharmacyId: string;
  categoryId?: string;
  name: string;
  dci: string;
  dosage?: string;
  galenicForm?: string;
  sellingUnit: string; // Ex: 'Boîte de 16', 'Flacon 125ml' (CAT-01)
  laboratory?: string;
  sellingPriceCdf: number;
  sellingPriceUsd: number;
  taxRate: number;
  minAlertThreshold: number;
  maxThreshold?: number;
  securityStock?: number;
  storageLocation?: string;
  requiresPrescription: boolean;
  isControlledSubstance: boolean;
  isColdChain: boolean;
  barcodes: string[];
  totalStock: number;
  isActive: boolean;
  category?: ProductCategory;
}

export interface ProductAutocompleteItem {
  id: string;
  name: string;
  dci: string;
  dosage?: string;
  galenicForm?: string;
  sellingUnit: string;
  sellingPriceCdf: number;
  sellingPriceUsd: number;
  totalStock: number;
  requiresPrescription: boolean;
  isControlledSubstance: boolean;
  isColdChain: boolean;
  barcodes: string[];
}

export interface PriceHistoryEntry {
  id?: string;
  productId: string;
  oldPriceCdf: number;
  newPriceCdf: number;
  oldPriceUsd: number;
  newPriceUsd: number;
  changedBy: string;
  changedByName?: string;
  reason: string;
  changedAt: string;
}

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface ProductQueryFilters {
  q?: string;
  categoryId?: string;
  requiresPrescription?: boolean;
  isControlledSubstance?: boolean;
  isColdChain?: boolean;
  isActive?: boolean;
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

// 4. STOCK & MULTI-LOTS (STK-01 à STK-14, RG-01 FEFO)
export interface ProductLot {
  id: string;
  productId: string;
  lotNumber: string;
  expiryDate: string; // ISO Date YYYY-MM-DD
  purchasePriceCdf: number;
  purchasePriceUsd: number;
  initialQuantity: number;
  currentQuantity: number;
  isQuarantined: boolean;
  quarantineReason?: string;
  isExpired: boolean;
  productName?: string;
  storageLocation?: string;
}

export type MovementType =
  | 'RECEPTION_FOURNISSEUR'
  | 'SORTIE_VENTE'
  | 'AJUSTEMENT_POSITIF'
  | 'AJUSTEMENT_NEGATIF'
  | 'PEREMPTION'
  | 'CASSE_PERTE'
  | 'DON'
  | 'USAGE_INTERNE'
  | 'RETOUR_FOURNISSEUR'
  | 'RETOUR_CLIENT';

export interface StockMovement {
  id: string;
  lotId: string;
  productName: string;
  lotNumber: string;
  userId: string;
  userName: string;
  type: MovementType;
  quantity: number;
  direction: 'IN' | 'OUT';
  reason: string;
  createdAt: string;
  unitCostCdf?: number;
  referenceId?: string;
}

// 4.1 FOURNISSEURS & BONS DE COMMANDE (ACH-01 à ACH-09)
export interface Supplier {
  id: string;
  pharmacyId: string;
  name: string;
  contactName?: string;
  phone?: string;
  email?: string;
  address?: string;
  paymentTerms?: string;
  leadTimeDays: number;
  isActive: boolean;
  createdAt?: string;
}

export type PurchaseOrderStatus =
  | 'BROUILLON'
  | 'ENVOYE'
  | 'PARTIELLEMENT_RECU'
  | 'RECU'
  | 'ANNULE';

export interface PurchaseOrderItem {
  id?: string;
  productId: string;
  productName?: string;
  dci?: string;
  dosage?: string;
  orderedQuantity: number;
  receivedQuantity: number;
  unitPriceCdf: number;
  unitPriceUsd: number;
  totalAmountCdf?: number;
}

export interface PurchaseOrder {
  id: string;
  pharmacyId: string;
  supplierId: string;
  supplierName?: string;
  orderNumber: string;
  status: PurchaseOrderStatus;
  totalAmountCdf: number;
  totalAmountUsd: number;
  createdBy: string;
  createdByName?: string;
  orderDate: string;
  expectedDeliveryDate?: string;
  receivedDate?: string;
  notes?: string;
  items: PurchaseOrderItem[];
  createdAt?: string;
}

// 4.2 RÉCEPTION DE MARCHANDISES (ACH-04, STK-01, RG-14)
export interface GoodsReceiptItem {
  productId: string;
  productName?: string;
  lotNumber: string;
  expiryDate: string;
  quantity: number;
  purchasePriceCdf: number;
  purchasePriceUsd: number;
  purchaseOrderItemId?: string;
}

export interface GoodsReceipt {
  id: string;
  pharmacyId: string;
  receiptNumber: string;
  purchaseOrderId?: string;
  purchaseOrderNumber?: string;
  supplierInvoiceNumber?: string;
  receivedBy: string;
  receivedByName?: string;
  notes?: string;
  receivedAt: string;
  items: GoodsReceiptItem[];
}

// 4.3 AJUSTEMENTS & QUARANTAINE (STK-05, STK-10, RG-03, RG-11)
export interface PendingAdjustment {
  id: string;
  pharmacyId: string;
  lotId: string;
  lotNumber: string;
  productId: string;
  productName: string;
  systemQuantity: number;
  newQuantity: number;
  variance: number;
  reason: string;
  requestedBy: string;
  requestedByName?: string;
  requestedAt: string;
  status: 'DEMANDE' | 'EN_ATTENTE' | 'VALIDE' | 'APPROUVE' | 'REJETE';
  approvedBy?: string;
  approvedByName?: string;
  approvedAt?: string;
  rejectionReason?: string;
}

// 4.4 INVENTAIRES PHYSIQUES (STK-11)
export interface InventoryLine {
  id?: string;
  lotId: string;
  lotNumber?: string;
  productId?: string;
  productName?: string;
  systemQuantity: number;
  countedQuantity: number;
  variance: number;
  justification?: string;
}

export interface InventorySession {
  id: string;
  pharmacyId: string;
  reference: string;
  status: 'EN_COURS' | 'VALIDE' | 'ANNULE';
  type?: 'COMPLET' | 'TOURNANT';
  notes?: string;
  createdBy: string;
  createdByName?: string;
  validatedBy?: string;
  validatedByName?: string;
  validatedAt?: string;
  createdAt: string;
  linesCount?: number;
  lines: InventoryLine[];
}

// 4.5 REGISTRE STUPÉFIANTS & VALORISATION (STK-12, STK-14)
export interface ControlledSubstanceRegisterEntry {
  id: string;
  date: string;
  productId: string;
  productName: string;
  dosage?: string;
  lotNumber: string;
  movementType: MovementType;
  quantityIn: number;
  quantityOut: number;
  balance: number;
  referenceNumber: string;
  partyName: string;
  prescriberName?: string;
  userName: string;
}

export interface StockAlertsSummary {
  lowStock: {
    productId: string;
    productName: string;
    dci: string;
    totalStock: number;
    minAlertThreshold: number;
    securityStock?: number;
    reorderQuantity: number;
    supplierName?: string;
  }[];
  outOfStock: {
    productId: string;
    productName: string;
    dci: string;
    minAlertThreshold: number;
    reorderQuantity: number;
  }[];
  expiringIn30Days: ProductLot[];
  expiringIn60Days: ProductLot[];
  expiringIn90Days: ProductLot[];
  expired: ProductLot[];
}

export interface CumpValuationSummary {
  totalStockUnits: number;
  totalValuationCdf: number;
  totalValuationUsd: number;
  productsCount: number;
  lotsCount: number;
  products: {
    productId: string;
    productName: string;
    dci: string;
    totalStock: number;
    cumpCdf: number;
    sellingPriceCdf: number;
    totalValuationCdf: number;
    marginPercent: number;
  }[];
}

// 5. POINT DE VENTE & FACTURATION (VTE-01 à VTE-18, RG-04, RG-05, RÉVISION 2.0)
export type PaymentMethod =
  | 'ESPECES'
  | 'MOBILE_MONEY'
  | 'CARTE_BANCAIRE'
  | 'VIREMENT'
  | 'CREDIT_CLIENT';

export type SaleStatus =
  | 'BROUILLON'
  | 'EN_ATTENTE_PAIEMENT'
  | 'VALIDEE'
  | 'PARTIELLEMENT_PAYEE'
  | 'ANNULEE'
  | 'AVOIR'
  | 'RETOURNEE'
  | 'CONFLIT';

export type SyncStatus =
  | 'LOCAL'
  | 'EN_ATTENTE'
  | 'SYNCHRONISATION'
  | 'SYNCHRONISE'
  | 'CONFLIT'
  | 'REJETE';

export type HeldCartStatus =
  | 'ACTIF'
  | 'REPRIS'
  | 'EXPIRE'
  | 'ANNULE';

export interface HeldCartItem {
  productId: string;
  productName: string;
  quantity: number;
  unitPriceCdf: number;
  discountCdf?: number;
  lotId?: string;
  lotNumber?: string;
  expiryDate?: string;
  requiresPrescription?: boolean;
}

export interface HeldCart {
  id: string;
  pharmacyId: string;
  userId: string;
  userName?: string;
  referenceName: string;
  items: HeldCartItem[];
  customerId?: string;
  customerName?: string;
  savedAt: string;
  expiresAt: string;
  resumedAt?: string;
  status: HeldCartStatus;
}

export interface SaleItemAllocation {
  id?: string;
  lotId: string;
  lotNumber: string;
  productName?: string;
  expiryDate: string;
  quantity: number;
  unitPriceCdf: number;
  unitCostCumpCdf: number;
  discountCdf: number;
  taxRate?: number;
  totalLineCdf: number;
}

export interface SaleItemRequest {
  productId: string;
  quantity: number;
  unitPriceCdf: number;
  discountCdf?: number;
  lotId?: string;
}

export interface CreateSaleDto {
  customerId?: string;
  prescriptionId?: string;
  currency: CurrencyCode;
  items: SaleItemRequest[];
  payments: {
    method: PaymentMethod;
    amountPaid: number;
    currency: CurrencyCode;
    mobileMoneyProvider?: 'M-PESA' | 'ORANGE_MONEY' | 'AIRTEL_MONEY';
    transactionReference?: string;
  }[];
  idempotencyKey: string;
  supervisorPin?: string;
  isOffline?: boolean;
  offlineCreatedAt?: string;
  offlineExchangeRate?: number;
}

export interface SalePaymentInfo {
  method: PaymentMethod;
  amountPaid: number;
  amountCdf: number;
  currency: CurrencyCode;
  mobileMoneyProvider?: string;
  transactionReference?: string;
}

export interface Sale {
  id: string;
  invoiceNumber: string; // FAC-YYYY-XXXXXX
  customerName?: string;
  customerPhone?: string;
  cashierName?: string;
  cashSessionId?: string;
  subtotalCdf?: number;
  discountCdf?: number;
  taxAmountCdf?: number;
  totalAmountCdf: number;
  totalAmountUsd: number;
  appliedExchangeRate: number;
  currency: CurrencyCode;
  status: SaleStatus;
  syncStatus?: SyncStatus;
  isOffline?: boolean;
  createdAt: string;
  items: SaleItemAllocation[];
  payments?: SalePaymentInfo[];
  conflictDetails?: OfflineConflictDetails;
}

// CONFLITS & SYNCHRONISATION HORS-LIGNE (RÉVISION 2.0)
export interface OfflineConflictItem {
  productId: string;
  productName: string;
  lotId: string;
  lotNumber: string;
  requestedQuantity: number;
  availableStock: number;
}

export interface OfflineConflictDetails {
  conflictingItems: OfflineConflictItem[];
  offlineExchangeRate: number;
  serverExchangeRate: number;
  rateDifferenceCdf: number;
  detectedAt: string;
}

export type ConflictResolutionAction =
  | 'VALIDER_PARTIEL'
  | 'ANNULER_VENTE'
  | 'REMPLACER_PRODUIT'
  | 'GENERER_AVOIR'
  | 'MAINTENIR_EN_ATTENTE';

export interface ResolveConflictDto {
  action: ConflictResolutionAction;
  reason: string;
  adjustedItems?: { productId: string; lotId: string; quantity: number }[];
}

export interface OfflineSaleItem {
  productId: string;
  productName: string;
  lotId?: string;
  lotNumber?: string;
  expiryDate?: string;
  quantity: number;
  unitPriceCdf: number;
  discountCdf?: number;
}

export interface OfflineSalePayload {
  idempotencyKey: string;
  localCreatedAt: string;
  userId: string;
  pharmacyId: string;
  cashSessionId: string;
  customerId?: string;
  currency: CurrencyCode;
  exchangeRateIndicative: number;
  items: OfflineSaleItem[];
  paymentMethod: PaymentMethod;
  amountPaid: number;
  changeGivenCdf: number;
  syncStatus: SyncStatus;
}

export interface OfflineSyncBatchRequest {
  sales: {
    idempotencyKey: string;
    userId: string;
    pharmacyId: string;
    cashSessionId: string;
    customerId?: string;
    currency: CurrencyCode;
    offlineExchangeRate: number;
    offlineCreatedAt: string;
    items: SaleItemRequest[];
    amountPaid: number;
    changeGivenCdf: number;
  }[];
}

export interface OfflineSyncBatchResult {
  totalSubmitted: number;
  synchronizedCount: number;
  conflictCount: number;
  rejectedCount: number;
  results: {
    idempotencyKey: string;
    status: SyncStatus;
    invoiceNumber?: string;
    saleId?: string;
    appliedExchangeRate?: number;
    conflictDetails?: OfflineConflictDetails;
    errorMessage?: string;
  }[];
}

// RACCOURCIS CLAVIER POS OBLIGATOIRES (RÉVISION 2.0)
export const POS_SHORTCUTS = {
  F1: { key: 'F1', code: 'F1', action: 'RECHERCHE_SCAN', label: 'Recherche / Scan produit' },
  F2: { key: 'F2', code: 'F2', action: 'NOUVELLE_VENTE', label: 'Nouvelle vente / Vider panier' },
  F3: { key: 'F3', code: 'F3', action: 'REMISE', label: 'Appliquer une remise' },
  F4: { key: 'F4', code: 'F4', action: 'CLIENT', label: 'Sélectionner un client' },
  F5: { key: 'F5', code: 'F5', action: 'ORDONNANCE', label: 'Ajouter une ordonnance' },
  F6: { key: 'F6', code: 'F6', action: 'DEVISE', label: 'Changer la devise (CDF/USD)' },
  F7: { key: 'F7', code: 'F7', action: 'STOCK_LOTS', label: 'Consulter stock et lots' },
  F8: { key: 'F8', code: 'F8', action: 'ATTENTE', label: 'Mettre panier en attente' },
  F9: { key: 'F9', code: 'F9', action: 'ENCAISSER', label: 'Encaisser la vente' },
  F10: { key: 'F10', code: 'F10', action: 'TICKET', label: 'Imprimer dernier ticket' },
  ESCAPE: { key: 'Escape', code: 'Escape', action: 'FERMER_ANNULER', label: 'Fermer / Annuler' },
} as const;

// CATALOGUE DES MESSAGES D'ERREUR MÉTIER GUIDÉS EN FRANÇAIS (RÉVISION 2.0)
export const POS_ERROR_MESSAGES = {
  STOCK_INSUFFICIENT: (productName: string, available: number) => ({
    title: 'Stock insuffisant',
    message: `Il reste seulement ${available} unité(s) pour "${productName}".`,
    action: 'Ajustez la quantité ou proposez un équivalent disponible.',
  }),
  LOT_EXPIRED: (lotNumber: string) => ({
    title: 'Lot périmé',
    message: `Le lot ${lotNumber} est périmé et ne peut pas être vendu.`,
    action: 'Le système propose automatiquement le lot disponible non périmé le plus proche de la péremption.',
  }),
  PRESCRIPTION_REQUIRED: (productName: string) => ({
    title: 'Ordonnance obligatoire',
    message: `Le médicament "${productName}" nécessite obligatoirement une ordonnance.`,
    action: 'Ajoutez ou scannez l’ordonnance du client (touche F5) avant de valider la vente.',
  }),
  DISCOUNT_EXCEEDED: (userMax: number, requested: number) => ({
    title: 'Plafond de remise dépassé',
    message: `Votre remise demandée (${requested}%) dépasse votre autorisation (${userMax}%).`,
    action: 'Demandez l’autorisation d’un superviseur ou pharmacien (saisie du code PIN).',
  }),
  CREDIT_LIMIT_EXCEEDED: (customerName: string, availableCredit: number) => ({
    title: 'Plafond de crédit atteint',
    message: `Le plafond de crédit du client "${customerName}" est atteint. Crédit disponible : ${availableCredit} CDF.`,
    action: 'Enregistrez un paiement partiel ou demandez un règlement préalable de la créance.',
  }),
  OFFLINE_MODE_ACTIVE: () => ({
    title: 'Mode hors-ligne actif',
    message: 'Connexion réseau coupée. Seuls les paiements en espèces (CDF et USD) sont autorisés.',
    action: 'Vente enregistrée localement. Elle sera synchronisée automatiquement dès le retour du réseau.',
  }),
  OFFLINE_FORBIDDEN_OPERATION: (operation: string) => ({
    title: 'Opération interdite hors-ligne',
    message: `L'opération "${operation}" nécessite impérativement une validation serveur en ligne.`,
    action: 'Cette opération est bloquée en mode hors-ligne. Attendez le rétablissement de la connexion.',
  }),
  DUPLICATE_SUBMISSION: () => ({
    title: 'Vente déjà enregistrée',
    message: 'Cette vente a déjà été traitée par le système.',
    action: 'Aucun doublon n’a été créé. Vous pouvez réimprimer le ticket ou commencer une nouvelle vente.',
  }),
  CONFLICT_DETECTED: (productName: string) => ({
    title: 'Conflit de synchronisation détecté',
    message: `Le stock du produit "${productName}" a changé sur le serveur pendant la coupure réseau.`,
    action: 'La vente a été marquée "CONFLIT" et transmise au Pharmacien Responsable pour arbitrage.',
  }),
} as const;

// 6. CLIENTS & ORDONNANCES (CLI-01 à CLI-10)
export type CustomerType = 'PARTICULIER' | 'ENTREPRISE' | 'ASSURANCE';

export interface Customer {
  id: string;
  code: string;
  fullName: string;
  phone?: string;
  email?: string;
  companyName?: string;
  customerType: CustomerType;
  creditLimitCdf: number;
  currentBalanceCdf: number;
  medicalNotes?: string;
  nom?: string;
  postnom?: string;
  prenom?: string;
  sexe?: 'M' | 'F';
  dateNaissance?: string;
  nationalite?: string;
  address?: { province?: string; ville?: string; commune?: string; quartier?: string; avenue_rue?: string; numero_parcelle?: string; point_de_repere?: string };
  contacts?: Array<{ id?: string; name: string; relationship?: string; phone: string; address?: string }>;
  identityDocuments?: Array<{ id: string; type: string; number?: string; fullNumber?: string; issueDate?: string; expirationDate?: string; hasScan: boolean; isPrimary: boolean }>;
  insurance?: { insurerName?: string; insuredCardNumber?: string; status?: 'VALID' | 'EXPIRED' | 'INCOMPLETE'; endDate?: string };
  insuranceStatus?: 'VALID' | 'EXPIRED' | 'INCOMPLETE';
  enterprise?: {
    legalName: string;
    rccm?: string;
    nationalId?: string;
    taxId?: string;
    representativeName: string;
    representativeFunction?: string;
    representativePhone: string;
    representativeDocumentNumber?: string;
  };
  hasProfilePhoto?: boolean;
  createdAt?: string;
}

export interface Prescription {
  id: string;
  customerId: string;
  prescriberName: string;
  healthCenter?: string;
  prescriptionDate: string;
  storageFilePath?: string;
  signedUrl?: string;
  verifiedBy?: string;
}

// 7. SESSIONS DE CAISSE (FIN-01, FIN-02, RG-12)
export interface CashSession {
  id: string;
  userId: string;
  openedAt: string;
  closedAt?: string;
  initialFloatCdf: number;
  initialFloatUsd: number;
  expectedAmountCdf: number;
  expectedAmountUsd: number;
  countedAmountCdf?: number;
  countedAmountUsd?: number;
  varianceCdf?: number;
  varianceUsd?: number;
  varianceReason?: string;
  status: 'OUVERTE' | 'CLOTUREE';
}

export type CashMovementType = 'APPORT' | 'RETRAIT';

export interface CashMovement {
  id: string;
  sessionId: string;
  type: CashMovementType;
  amountCdf: number;
  amountUsd: number;
  reason: string;
  createdAt: string;
}

// 8. AUDIT (AUD-01 à AUD-05)
export interface AuditLogEntry {
  id: string;
  userId?: string;
  userName?: string;
  action: string;
  entityName: string;
  entityId: string;
  oldValues?: Record<string, unknown>;
  newValues?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
  createdAt: string;
}

export interface AuditLogFilters {
  from?: string;
  to?: string;
  userId?: string;
  action?: string;
  entityName?: string;
  page?: number;
  limit?: number;
}

export interface PaginatedAuditLogs {
  data: AuditLogEntry[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

// 8 bis. NOTIFICATIONS (NOT-01, NOT-02)
export type NotificationType =
  | 'STOCK_BAS'
  | 'STOCK_RUPTURE'
  | 'PEREMPTION'
  | 'CREANCE_RETARD'
  | 'ECART_CAISSE'
  | 'CONFLIT_STOCK_OFFLINE'
  | 'COMMANDE_FOURNISSEUR'
  | 'SYSTEME';
export type NotificationSeverity = 'INFO' | 'WARNING' | 'DANGER';

export interface NotificationItem {
  id: string;
  pharmacyId: string;
  type: NotificationType;
  title: string;
  message: string;
  severity: NotificationSeverity;
  targetRole?: RoleName;
  entityType?: 'PRODUCT_LOT' | 'CUSTOMER' | 'CASH_SESSION' | 'SALE' | 'PURCHASE_ORDER' | string;
  entityId?: string;
  metadata?: Record<string, unknown>;
  isRead: boolean;
  readAt?: string;
  createdAt: string;
}

export interface UnreadNotificationCount {
  count: number;
}

// 9. PARAMÉTRAGE & ADMINISTRATION (PAR-01 à PAR-08)
export interface PharmacyIdentity {
  name: string;
  address?: string;
  phone?: string;
  email?: string;
  logoUrl?: string;
  rccm?: string;
  idNat?: string;
  nif?: string;
  legalNotice?: string;
  invoiceFooter?: string;
}

export type RoundingRule = 'ENTIER' | 'CINQUANTE' | 'CENT' | 'DECIMAL_2';

export interface TaxItem {
  code: string;
  label: string;
  rate: number;
  isDefault: boolean;
}

export interface FinancialRules {
  defaultCurrency: CurrencyCode;
  activeCurrencies: CurrencyCode[];
  cdfDecimals: number;
  usdDecimals: number;
  cdfRoundingRule: RoundingRule;
  usdRoundingRule: RoundingRule;
  taxes: TaxItem[];
  activePaymentMethods: string[];
  discountCapsByRole: Record<string, number>;
}

export interface AlertThresholds {
  expiryWarningDays: number[];
  inactivityTimeoutMinutes: number;
  lowStockDefaultThreshold: number;
}

export interface PrintTemplates {
  ticketHeader?: string;
  ticketFooter?: string;
  invoiceHeader?: string;
  invoiceFooter?: string;
  showLogoOnTicket: boolean;
  showLogoOnInvoice: boolean;
}

export type ImportType = 'PRODUITS' | 'STOCK' | 'FOURNISSEURS' | 'CLIENTS';

export interface ImportRejectedRow {
  row: number;
  data: Record<string, any>;
  reason: string;
}

export interface ImportSimulationResult {
  importType: ImportType;
  totalRows: number;
  validCount: number;
  rejectedCount: number;
  rejectedRows: ImportRejectedRow[];
  sampleValid?: Record<string, any>[];
}

