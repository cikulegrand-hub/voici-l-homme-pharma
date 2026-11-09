import {
  IsString,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsArray,
  Min,
  Max,
  IsBoolean,
  IsEnum,
  ValidateNested,
  IsObject,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

export class UpdatePharmacyIdentityDto {
  @ApiProperty({ example: "Voici l'Homme Pharma" })
  @IsString()
  @IsNotEmpty({ message: "Le nom de l'officine est obligatoire." })
  name: string;

  @ApiProperty({ example: "Av. de l'Église, Q. Résidentiel, Commune de Limete, Kinshasa, RDC" })
  @IsString()
  @IsOptional()
  address?: string;

  @ApiProperty({ example: '+243 81 234 56 78' })
  @IsString()
  @IsOptional()
  phone?: string;

  @ApiProperty({ example: 'contact@voicilhommepharma.cd', required: false })
  @IsString()
  @IsOptional()
  email?: string;

  @ApiProperty({ example: 'CD/KIN/RCCM/14-B-2345', description: 'Numéro RCCM (RDC)' })
  @IsString()
  @IsOptional()
  rccm?: string;

  @ApiProperty({ example: '01-83-N12345P', description: 'Identification Nationale (RDC)' })
  @IsString()
  @IsOptional()
  idNat?: string;

  @ApiProperty({ example: 'A0912345B', description: 'Numéro Impôt / NIF' })
  @IsString()
  @IsOptional()
  nif?: string;

  @ApiProperty({ required: false, description: 'Alias rétrocompatible pour nif' })
  @IsString()
  @IsOptional()
  taxNumber?: string;

  @ApiProperty({ example: 'https://storage.supabase.co/vhp/logo.png', required: false })
  @IsString()
  @IsOptional()
  logoUrl?: string;

  @ApiProperty({
    example: 'Facture conforme aux dispositions de la DGI / RDC.',
    required: false,
  })
  @IsString()
  @IsOptional()
  legalNotice?: string;

  @ApiProperty({ required: false, description: 'Alias rétrocompatible pour legalNotice' })
  @IsString()
  @IsOptional()
  invoiceLegalNotice?: string;

  @ApiProperty({
    example: 'Marchandises vendues ne sont ni reprises ni échangées.',
    required: false,
  })
  @IsString()
  @IsOptional()
  invoiceFooter?: string;

  @ApiProperty({ required: false, description: 'Alias rétrocompatible pour invoiceFooter' })
  @IsString()
  @IsOptional()
  receiptFooterText?: string;
}

export class TaxItemDto {
  @ApiProperty({ example: 'TVA_16' })
  @IsString()
  @IsNotEmpty()
  code: string;

  @ApiProperty({ example: 'TVA Standard 16%', required: false })
  @IsString()
  @IsOptional()
  label?: string;

  @ApiProperty({ example: 'TVA Standard 16%', required: false })
  @IsString()
  @IsOptional()
  name?: string;

  @ApiProperty({ example: 16.0 })
  @IsNumber()
  @Min(0)
  @Max(100)
  rate: number;

  @ApiProperty({ example: true, required: false })
  @IsBoolean()
  @IsOptional()
  isDefault?: boolean;

  @ApiProperty({ example: true, required: false })
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}

export type RoundingRule = 'ENTIER' | 'CINQUANTE' | 'CENT' | 'DECIMAL_2';

export class UpdateFinancialRulesDto {
  @ApiProperty({ example: 'CDF', enum: ['CDF', 'USD'] })
  @IsEnum(['CDF', 'USD'])
  defaultCurrency: 'CDF' | 'USD';

  @ApiProperty({ example: ['CDF', 'USD'] })
  @IsArray()
  @IsOptional()
  activeCurrencies?: ('CDF' | 'USD')[];

  @ApiProperty({ example: 0, description: 'Décimales pour le Franc Congolais (toujours 0 par défaut)' })
  @IsNumber()
  @Min(0)
  @Max(2)
  @IsOptional()
  cdfDecimals?: number;

  @ApiProperty({ example: 2, description: 'Décimales pour le Dollar USD' })
  @IsNumber()
  @Min(0)
  @Max(2)
  @IsOptional()
  usdDecimals?: number;

  @ApiProperty({ example: 'ENTIER', enum: ['ENTIER', 'CINQUANTE', 'CENT'] })
  @IsString()
  cdfRoundingRule: RoundingRule;

  @ApiProperty({ example: 'DECIMAL_2', enum: ['DECIMAL_2'] })
  @IsString()
  usdRoundingRule: RoundingRule;

  @ApiProperty({ example: ['ESPECES', 'MOBILE_MONEY', 'CARTE_BANCAIRE', 'VIREMENT', 'CREDIT_CLIENT'] })
  @IsArray()
  @IsOptional()
  activePaymentMethods?: string[];

  @ApiProperty({ type: [TaxItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TaxItemDto)
  taxes: TaxItemDto[];

  @ApiProperty({
    example: { ADMIN: 100, PHARMACIEN: 10, CAISSIER: 5, STOCK: 0, COMPTABLE: 0 },
    description: 'Plafonds de remise par rôle en pourcentage',
  })
  @IsObject()
  @IsOptional()
  discountCapsByRole?: Record<string, number>;

  @ApiProperty({ example: 5, required: false, description: 'Alias rétrocompatible' })
  @IsNumber()
  @IsOptional()
  cashierDiscountCapPercent?: number;

  @ApiProperty({ example: 10, required: false, description: 'Alias rétrocompatible' })
  @IsNumber()
  @IsOptional()
  pharmacistDiscountCapPercent?: number;
}

export class UpdateAlertThresholdsDto {
  @ApiProperty({ example: [30, 60, 90], description: "Seuils d'alerte de péremption en jours" })
  @IsArray()
  expiryWarningDays: number[];

  @ApiProperty({ example: 15, description: "Délai d'inactivité de session en minutes (AUT-03)" })
  @IsNumber()
  @Min(1)
  @Max(120)
  inactivityTimeoutMinutes: number;

  @ApiProperty({ example: 10, description: 'Seuil par défaut du stock faible en unités' })
  @IsNumber()
  @Min(1)
  @IsOptional()
  lowStockDefaultThreshold?: number;
}

export class UpdatePrintTemplatesDto {
  @ApiProperty({ example: "PHARMACIE VOICI L'HOMME\nKinshasa - Limete" })
  @IsString()
  @IsOptional()
  ticketHeader?: string;

  @ApiProperty({ example: 'Merci pour votre confiance. Bon rétablissement !' })
  @IsString()
  @IsOptional()
  ticketFooter?: string;

  @ApiProperty({ example: true })
  @IsBoolean()
  @IsOptional()
  showLogoOnTicket?: boolean;

  @ApiProperty({ example: "Facture d'achat - Client Officine" })
  @IsString()
  @IsOptional()
  invoiceHeader?: string;

  @ApiProperty({ example: 'Merci pour votre confiance.' })
  @IsString()
  @IsOptional()
  invoiceFooter?: string;

  @ApiProperty({ example: true })
  @IsBoolean()
  @IsOptional()
  showLogoOnInvoice?: boolean;
}

export class SimulateImportDto {
  @ApiProperty({
    example: 'PRODUITS',
    required: false,
    description: 'Type de données à importer (PRODUITS, STOCK, FOURNISSEURS, CLIENTS)',
  })
  @IsOptional()
  importType?: string;

  @ApiProperty({
    example: 'products',
    required: false,
    description: 'Type hérité (products, stock, suppliers, customers)',
  })
  @IsOptional()
  type?: string;

  @ApiProperty({ description: 'Lignes extraites du fichier Excel/CSV' })
  @IsArray()
  rows: any[];
}

export class ExecuteImportDto {
  @ApiProperty({
    example: 'PRODUITS',
    required: false,
    description: 'Type de données à importer (PRODUITS, STOCK, FOURNISSEURS, CLIENTS)',
  })
  @IsOptional()
  importType?: string;

  @ApiProperty({
    example: 'products',
    required: false,
    description: 'Type hérité (products, stock, suppliers, customers)',
  })
  @IsOptional()
  type?: string;

  @ApiProperty({ description: 'Lignes validées à insérer définitivement' })
  @IsArray()
  rows: any[];
}

export class UploadLogoDto {
  @ApiProperty({ description: "URL ou chaîne base64 data:image/... du logo de l'officine" })
  @IsString()
  @IsNotEmpty({ message: 'Le logo est obligatoire.' })
  logoUrl: string;
}
