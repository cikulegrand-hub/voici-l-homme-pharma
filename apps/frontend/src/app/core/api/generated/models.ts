/**
 * Ce fichier est généré automatiquement depuis OpenAPI Backend.
 * NE PAS MODIFIER DIRECTEMENT.
 * Régénérer avec : npm run api:generate
 */

export interface LoginDto {
  /** Nom d’utilisateur */
  username: string;
  /** Mot de passe (10 caractères minimum selon AUT-02) */
  password: string;
}

export interface CreateUserDto {
  /** Identifiant unique */
  username: string;
  /** Nom complet de l’utilisateur */
  fullName: string;
  /** Adresse email professionnelle */
  email: string;
  /** Mot de passe conforme à la politique de sécurité */
  password: string;
  role: string;
  /** Code PIN à 4 chiffres pour actions sensibles (AUT-08) */
  pinCode: string;
}

export interface UpdateUserDto {
  fullName?: string;
  email?: string;
  role?: string;
  /** Nouveau code PIN à 4 chiffres */
  pinCode?: string;
}

export interface ResetPasswordDto {
  newPassword: string;
}

export interface ChangeMyPasswordDto {
  currentPassword: string;
  newPassword: string;
}

export interface ChangeMyPinDto {
  /** Code PIN actuel à 4 chiffres */
  currentPin?: string;
  /** Nouveau code PIN à 4 chiffres */
  newPin: string;
}

export interface VerifyPinDto {
  /** Code PIN à 4 chiffres du superviseur */
  pinCode: string;
  /** Action sensible requérant le PIN */
  action: string;
}

export interface CreateCategoryDto {
  name: string;
  description?: string;
}

export interface UpdateCategoryDto {
  name?: string;
  description?: string;
}

export interface CreateGalenicFormDto {
  name: string;
  description?: string;
}

export interface CreateProductDto {
  name: string;
  dci: string;
  dosage?: string;
  galenicForm?: string;
  /** Unité de vente (CAT-01) */
  sellingUnit: string;
  laboratory?: string;
  categoryId?: string;
  /** Prix de vente en Franc Congolais (CDF) */
  sellingPriceCdf: number;
  /** Prix de vente en Dollar (USD) */
  sellingPriceUsd: number;
  /** Taux TVA applicable en % */
  taxRate: number;
  /** Seuil minimal d’alerte de stock (CAT-01) */
  minAlertThreshold: number;
  /** Seuil maximum (CAT-11) */
  maxThreshold?: number;
  /** Stock de sécurité (CAT-11) */
  securityStock?: number;
  storageLocation?: string;
  /** Exige une ordonnance médicale (CAT-02, RG-09) */
  requiresPrescription: boolean;
  /** Produit contrôlé / stupéfiant (CAT-02) */
  isControlledSubstance: boolean;
  /** Nécessite la chaîne du froid 2-8°C (CAT-02) */
  isColdChain: boolean;
  /** Codes-barres associés EAN-13 (CAT-03) */
  barcodes: string[];
}

export interface UpdateProductDto {
  name?: string;
  dci?: string;
  dosage?: string;
  galenicForm?: string;
  sellingUnit?: string;
  laboratory?: string;
  categoryId?: string;
  sellingPriceCdf?: number;
  sellingPriceUsd?: number;
  taxRate?: number;
  minAlertThreshold?: number;
  maxThreshold?: number;
  securityStock?: number;
  storageLocation?: string;
  requiresPrescription?: boolean;
  isControlledSubstance?: boolean;
  isColdChain?: boolean;
  barcodes?: string[];
}

export interface UpdateProductPriceDto {
  /** Nouveau prix de vente CDF */
  newPriceCdf: number;
  /** Nouveau prix de vente USD */
  newPriceUsd: number;
  /** Motif de révision (CAT-06) */
  reason: string;
}

export interface AddBarcodeDto {
  /** Code-barres à associer (CAT-03) */
  barcode: string;
  isPrimary?: boolean;
}

export interface OpenCashSessionDto {
  /** Fonds de caisse initial en Franc Congolais (CDF) */
  initialFloatCdf: number;
  /** Fonds de caisse initial en Dollars (USD) */
  initialFloatUsd: number;
}

export interface CreateCashMovementDto {
  type: 'APPORT' | 'RETRAIT';
  amountCdf?: number;
  amountUsd?: number;
  reason: string;
}

export interface CloseCashSessionDto {
  /** Montant réel physique compté en caisse (CDF) */
  countedAmountCdf: number;
  /** Montant réel physique compté en caisse (USD) */
  countedAmountUsd: number;
  /** Justification obligatoire si écart (FIN-02, RG-12) */
  varianceReason?: string;
}

export interface SetExchangeRateDto {
  /** Taux officiel du jour : 1 USD = X CDF (FIN-04, RG-08) */
  rate: number;
  /** Date/heure ISO à partir de laquelle le taux devient applicable. */
  effectiveDate: string;
  notes?: string;
}

export interface CreateExpenseDto {
  description: string;
  category: string;
  /** Montant en CDF */
  amountCdf: number;
  /** Montant en USD */
  amountUsd?: number;
  receiptPath?: string;
}

export interface ReverseExpenseDto {
  /** Motif obligatoire de la contre-passation */
  reason: string;
}

export interface CreateExpenseCategoryDto {
  name: string;
}

export interface CreateLotDto {
  /** ID du produit */
  productId: string;
  /** Numéro de lot imprimé sur l’emballage */
  lotNumber: string;
  /** Date de péremption AAAA-MM-JJ */
  expiryDate: string;
  /** Quantité entrée */
  quantity: number;
  initialQuantity?: number;
  /** Prix d’achat unitaire CDF */
  purchasePriceCdf: number;
  /** Prix d’achat unitaire USD */
  purchasePriceUsd?: number;
  storageLocation?: string;
}

export interface DirectReceptionLineDto {
  productId: string;
  lotNumber: string;
  expiryDate: string;
  quantity: number;
  purchasePriceCdf: number;
  purchasePriceUsd?: number;
  storageLocation?: string;
}

export interface DirectReceptionDto {
  /** Clé d’idempotence unique (évite doubles écritures) */
  idempotencyKey?: string;
  supplierId?: string;
  supplierInvoiceNumber?: string;
  notes?: string;
  lines: DirectReceptionLineDto[];
}

export interface RequestAdjustmentDto {
  lotId: string;
  /** Écart constaté (+ ou -) */
  variance?: number;
  /** Différence de quantité */
  quantityDifference?: number;
  /** Motif obligatoire */
  reason: string;
}

export interface ApproveAdjustmentDto {
  /** Valider (true) ou Rejeter (false) */
  approved?: boolean;
  action?: string;
  rejectionReason?: string;
  pharmacistComment?: string;
  /** Code PIN pharmacien si exigé */
  pinCode?: string;
}

export interface CreateMovementDto {
  lotId: string;
  type: 'AJUSTEMENT_POSITIF' | 'AJUSTEMENT_NEGATIF' | 'PEREMPTION' | 'CASSE_PERTE' | 'DON' | 'USAGE_INTERNE' | 'RETOUR_FOURNISSEUR' | 'RETOUR_CLIENT';
  /** Quantité du mouvement */
  quantity: number;
  /** Motif obligatoire (RG-11) */
  reason: string;
}

export interface QuarantineLotDto {
  reason: string;
  /** true = quarantaine, false = déblocage (PATCH) */
  quarantined?: boolean;
}

export interface UnquarantineLotDto {
  reason: string;
}

export interface InventoryLineDto {
  lotId: string;
  /** Quantité comptée physiquement */
  countedQuantity: number;
  justification?: string;
}

export interface CreateInventoryDto {
  reference?: string;
  type?: 'COMPLET' | 'TOURNANT';
  /** IDs produits pour un inventaire tournant */
  productIds?: string[];
  lines?: InventoryLineDto[];
  notes?: string;
}

export interface RecordInventoryCountDto {
  lotId: string;
  countedQuantity: number;
  justification?: string;
}

export interface ValidateInventoryDto {
  validationComment?: string;
  justification?: string;
  pinCode?: string;
}

export interface SaleItemRequestDto {
  /** ID du produit */
  productId: string;
  /** Quantité */
  quantity: number;
  /** Prix unitaire en CDF */
  unitPriceCdf: number;
  /** Remise en CDF sur la ligne */
  discountCdf?: number;
  /** ID du lot sélectionné manuellement (profil habilité ou PIN superviseur VTE-04) */
  lotId?: string;
}

export interface PaymentItemDto {
  method: 'ESPECES' | 'MOBILE_MONEY' | 'CARTE_BANCAIRE' | 'VIREMENT' | 'CREDIT_CLIENT';
  /** Montant versé */
  amountPaid: number;
  currency: 'CDF' | 'USD';
  mobileMoneyProvider?: 'M-PESA' | 'ORANGE_MONEY' | 'AIRTEL_MONEY';
  /** Référence de transaction */
  transactionReference?: string;
}

export interface CreateSaleRequestDto {
  /** ID du client si identifié */
  customerId?: string;
  /** ID de l’ordonnance liée (RG-09) */
  prescriptionId?: string;
  /** Devise principale de facturation */
  currency: 'CDF' | 'USD';
  /** Articles commandés */
  items: SaleItemRequestDto[];
  /** Paiements effectués */
  payments: PaymentItemDto[];
  /** Clé d’idempotence anti-double clic (RG-16) */
  idempotencyKey: string;
  /** Code PIN superviseur pour dérogation remise/crédit (AUT-08, RG-10) */
  supervisorPin?: string;
}

export interface OfflineSyncBatchDto {
}

export interface ResolveConflictRequestDto {
}

export interface HoldCartDto {
  referenceName: string;
  items: SaleItemRequestDto[];
  customerId?: string;
}

export interface CreateCancellationRequestDto {
  /** Motif de la demande d’annulation transmise au pharmacien */
  reason: string;
  /** Demande de réintégration en stock */
  restockItems: boolean;
  /** Lignes et quantités concernées pour un avoir partiel */
  items?: string[];
}

export interface CancelSaleDto {
  /** Motif obligatoire d’annulation (VTE-13) */
  reason: string;
  /** Remise en stock des médicaments si non altérés */
  restockItems: boolean;
  /** Lignes et quantités retournées pour un avoir partiel. */
  items?: string[];
  /** Code PIN superviseur pour dérogation d’annulation par caissier */
  supervisorPin?: string;
}

export interface CreateCustomerDto {
  fullName: string;
  phone?: string;
  email?: string;
  companyName?: string;
  address?: string;
  customerType: 'PARTICULIER' | 'ENTREPRISE' | 'ASSURANCE';
  /** Plafond de crédit autorisé en CDF (RG-13) */
  creditLimitCdf: number;
  medicalNotes?: string;
}

export interface CreateQuickCustomerDto {
  fullName: string;
  phone?: string;
  /** Consentement recueilli au comptoir */
  consentementDonnees: boolean;
}

export interface CreatePrescriptionDto {
  customerId: string;
  prescriberName: string;
  healthCenter?: string;
  /** Date de prescription AAAA-MM-JJ */
  prescriptionDate: string;
  /** Private path already created by a storage integration */
  storageFilePath?: string;
  prescriptionText?: string;
}

export interface UpdateCustomerDto {
  fullName: string;
  phone?: string;
  email?: string;
  companyName?: string;
  address?: string;
  customerType: 'PARTICULIER' | 'ENTREPRISE' | 'ASSURANCE';
  /** Plafond de crédit autorisé en CDF (RG-13) */
  creditLimitCdf: number;
  medicalNotes?: string;
}

export interface SettleDebtDto {
  /** Montant du règlement en CDF (CLI-04) */
  amountPaidCdf: number;
  paymentMethod: 'ESPECES' | 'MOBILE_MONEY' | 'CARTE_BANCAIRE' | 'VIREMENT';
  currency: 'CDF' | 'USD';
  idempotencyKey: string;
  cashSessionId?: string;
  notes?: string;
}

export interface UpdatePharmacyIdentityDto {
  name: string;
  address: string;
  phone: string;
  email?: string;
  /** Numéro RCCM (RDC) */
  rccm: string;
  /** Identification Nationale (RDC) */
  idNat: string;
  /** Numéro Impôt / NIF */
  taxNumber: string;
  logoUrl?: string;
  receiptFooterText: string;
  invoiceLegalNotice?: string;
}

export interface TaxItemDto {
  code: string;
  name: string;
  rate: number;
  isActive: boolean;
}

export interface UpdateFinancialRulesDto {
  defaultCurrency: 'CDF' | 'USD';
  activeCurrencies: string[];
  /** Décimales pour le Franc Congolais (toujours 0 par défaut) */
  cdfDecimals: number;
  /** Décimales pour le Dollar USD */
  usdDecimals: number;
  cdfRoundingRule: 'ENTIER' | 'CINQUANTE' | 'CENT';
  usdRoundingRule: 'DECIMAL_2';
  activePaymentMethods: string[];
  taxes: TaxItemDto[];
  /** Plafond remise caissier en % */
  cashierDiscountCapPercent: number;
  /** Plafond remise pharmacien en % */
  pharmacistDiscountCapPercent: number;
}

export interface UpdateAlertThresholdsDto {
  /** Seuil alerte péremption niveau 1 (jours) */
  expiryWarningDaysLevel1: number;
  /** Seuil alerte péremption niveau 2 (jours) */
  expiryWarningDaysLevel2: number;
  /** Seuil alerte péremption niveau 3 (jours) */
  expiryWarningDaysLevel3: number;
  /** Délai d’inactivité de session en minutes (AUT-03) */
  sessionInactivityTimeoutMinutes: number;
}

export interface UpdatePrintTemplatesDto {
  ticketHeader: string;
  ticketFooter: string;
  showLogoOnTicket: boolean;
  invoiceLegalNotice: string;
}

export interface SimulateImportDto {
  type: 'products' | 'stock' | 'suppliers' | 'customers';
  /** Lignes extraites du fichier Excel/CSV */
  rows: string[];
}

export interface ExecuteImportDto {
  type: 'products' | 'stock' | 'suppliers' | 'customers';
  /** Lignes validées à insérer définitivement */
  rows: string[];
}

export interface CreateSupplierDto {
  name: string;
  contactName?: string;
  phone?: string;
  email?: string;
  address?: string;
  paymentTerms?: string;
  /** Délai moyen de livraison en jours */
  leadTimeDays: number;
}

export interface OrderItemDto {
  productId: string;
  /** Quantité commandée */
  orderedQuantity: number;
  /** Prix d’achat unitaire estimé en CDF */
  unitPriceCdf: number;
  /** Prix d’achat unitaire estimé en USD */
  unitPriceUsd?: number;
}

export interface CreatePurchaseOrderDto {
  supplierId: string;
  items: OrderItemDto[];
  expectedDeliveryDate?: string;
  notes?: string;
}

export interface ReceivedLineDto {
  productId: string;
  lotNumber: string;
  expiryDate: string;
  receivedQuantity: number;
  actualPurchasePriceCdf: number;
  actualPurchasePriceUsd?: number;
  storageLocation?: string;
  purchaseOrderItemId?: string;
}

export interface ReceiveOrderDto {
  /** Clé d’idempotence unique pour éviter les doublons */
  idempotencyKey?: string;
  lines: ReceivedLineDto[];
  /** Numéro de facture fournisseur liée */
  supplierInvoiceNumber?: string;
  notes?: string;
}

export interface UpdatePurchaseOrderStatusDto {
  status: 'BROUILLON' | 'ENVOYE' | 'ANNULE';
}

export interface UpdateSupplierDto {
  name?: string;
  contactName?: string;
  phone?: string;
  email?: string;
  address?: string;
  paymentTerms?: string;
  leadTimeDays?: number;
}

