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

// 5. POINT DE VENTE & FACTURATION (VTE-01 à VTE-18, RG-04, RG-05)
export type PaymentMethod =
  | 'ESPECES'
  | 'MOBILE_MONEY'
  | 'CARTE_BANCAIRE'
  | 'VIREMENT'
  | 'CREDIT_CLIENT';

export type SaleStatus = 'VALIDEE' | 'ANNULEE' | 'AVOIR';

export interface SaleItemAllocation {
  id?: string;
  lotId: string;
  lotNumber: string;
  expiryDate: string;
  quantity: number;
  unitPriceCdf: number;
  unitCostCumpCdf: number;
  discountCdf: number;
  totalLineCdf: number;
}

export interface SaleItemRequest {
  productId: string;
  quantity: number;
  unitPriceCdf: number;
  discountCdf?: number;
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
}

export interface Sale {
  id: string;
  invoiceNumber: string; // FAC-YYYY-XXXXXX
  customerName?: string;
  totalAmountCdf: number;
  totalAmountUsd: number;
  appliedExchangeRate: number;
  currency: CurrencyCode;
  status: SaleStatus;
  createdAt: string;
  items: SaleItemAllocation[];
}

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
export type NotificationType = 'STOCK_BAS' | 'PEREMPTION' | 'CREANCE_RETARD' | 'ECART_CAISSE';
export type NotificationSeverity = 'INFO' | 'WARNING' | 'DANGER';

export interface NotificationItem {
  id: string;
  pharmacyId: string;
  type: NotificationType;
  title: string;
  message: string;
  severity: NotificationSeverity;
  targetRole?: RoleName;
  entityType?: 'PRODUCT_LOT' | 'CUSTOMER' | 'CASH_SESSION';
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

export interface BackupEntry {
  id: string;
  fileName: string;
  fileSize: number;
  status: 'SUCCES' | 'ECHEC';
  createdAt: string;
  createdByName?: string;
}
