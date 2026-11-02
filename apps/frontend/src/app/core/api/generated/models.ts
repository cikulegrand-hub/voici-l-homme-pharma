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
  role: 'ADMIN' | 'PHARMACIEN' | 'CAISSIER' | 'STOCK' | 'COMPTABLE';
  /** Code PIN à 4 chiffres pour actions sensibles (AUT-08) */
  pinCode: string;
}

export interface UpdateUserDto {
  fullName?: string;
  email?: string;
  role?: 'ADMIN' | 'PHARMACIEN' | 'CAISSIER' | 'STOCK' | 'COMPTABLE';
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

export interface UpdateProductPriceDto {
  /** Nouveau prix de vente CDF */
  newPriceCdf: number;
  /** Nouveau prix de vente USD */
  newPriceUsd: number;
  /** Motif de révision (CAT-06) */
  reason: string;
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
  /** Prix d’achat unitaire CDF */
  purchasePriceCdf: number;
  /** Prix d’achat unitaire USD */
  purchasePriceUsd: number;
}

export interface RequestAdjustmentDto {
  lotId: string;
  /** Écart constaté (+ ou -) */
  variance: number;
  reason: string;
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
}

export interface InventoryLineDto {
  lotId: string;
  /** Quantité comptée physiquement */
  countedQuantity: number;
}

export interface CreateInventoryDto {
  reference: string;
  lines: InventoryLineDto[];
  notes?: string;
}

export interface ValidateInventoryDto {
  validationComment: string;
}

export interface SaleItemRequestDto {
  /** ID du produit */
  productId: string;
  /** Quantité */
  quantity: number;
  /** Prix unitaire en CDF */
  unitPriceCdf?: number;
  /** Remise en CDF sur la ligne */
  discountCdf?: number;
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
  idempotencyKey?: string;
  /** Code PIN superviseur pour dérogation remise/crédit (AUT-08, RG-10) */
  supervisorPin?: string;
}

export interface CancelSaleDto {
  /** Motif obligatoire d’annulation (VTE-13) */
  reason: string;
  /** Remise en stock des médicaments si non altérés */
  restockItems: boolean;
  items?: Array<{ saleItemId: string; quantity: number; restock?: boolean }>;
}

export interface HoldCartDto {
  referenceName: string;
  items: SaleItemRequestDto[];
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

export interface SettleDebtDto {
  /** Montant du règlement en CDF (CLI-04) */
  amountPaidCdf: number;
  paymentMethod: 'ESPECES' | 'MOBILE_MONEY' | 'VIREMENT';
}

export interface CreatePrescriptionDto {
  customerId: string;
  prescriberName: string;
  healthCenter?: string;
  /** Date de prescription AAAA-MM-JJ */
  prescriptionDate: string;
  /** Chemin privé Supabase Storage (CLI-06) */
  storageFilePath?: string;
  prescriptionText?: string;
}

export interface UpdatePharmacySettingsDto {
  name: string;
  address: string;
  phone: string;
  email?: string;
  taxNumber?: string;
  receiptFooterText: string;
}

export interface UpdateFinancialSettingsDto {
  defaultCurrency: 'CDF' | 'USD';
  /** Taux TVA standard en % */
  standardTaxRate: number;
  /** Plafond de remise max autorisé pour un Caissier (%) */
  cashierDiscountCapPercent: number;
  /** Plafond de remise max pour le Pharmacien (%) */
  pharmacistDiscountCapPercent: number;
}

export interface UpdateAlertSettingsDto {
  /** Premier seuil alerte péremption en jours */
  expiryWarningDaysLevel1: number;
  /** Deuxième seuil alerte péremption en jours */
  expiryWarningDaysLevel2: number;
  /** Troisième seuil alerte péremption en jours */
  expiryWarningDaysLevel3: number;
  /** Délai d’inactivité avant déconnexion automatique en minutes (AUT-03) */
  sessionInactivityTimeoutMinutes: number;
}

export interface OpenCashSessionDto {
  /** Fonds de caisse initial en Franc Congolais (CDF) */
  initialFloatCdf: number;
  /** Fonds de caisse initial en Dollars (USD) */
  initialFloatUsd: number;
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
}

export interface CreatePurchaseOrderDto {
  supplierId: string;
  items: OrderItemDto[];
  notes?: string;
}

export interface ReceivedLineDto {
  productId: string;
  lotNumber: string;
  expiryDate: string;
  receivedQuantity: number;
  actualPurchasePriceCdf: number;
}

export interface ReceiveOrderDto {
  lines: ReceivedLineDto[];
  /** Numéro de facture fournisseur liée */
  supplierInvoiceNumber?: string;
}

