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
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

export class UpdatePharmacyIdentityDto {
  @ApiProperty({ example: 'Voici l’Homme Pharma' })
  @IsString()
  @IsNotEmpty({ message: 'Le nom de l’officine est obligatoire.' })
  name: string;

  @ApiProperty({ example: 'Av. de l’Église, Q. Résidentiel, Commune de Limete, Kinshasa, RDC' })
  @IsString()
  @IsNotEmpty({ message: 'L’adresse de l’officine est obligatoire.' })
  address: string;

  @ApiProperty({ example: '+243 81 234 56 78' })
  @IsString()
  @IsNotEmpty({ message: 'Le numéro de téléphone est obligatoire.' })
  phone: string;

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
  taxNumber?: string;

  @ApiProperty({ example: 'https://storage.supabase.co/vhp/logo.png', required: false })
  @IsString()
  @IsOptional()
  logoUrl?: string;

  @ApiProperty({
    example: 'Tout médicament vendu ne peut être repris ni échangé sans accord préalable du pharmacien.',
  })
  @IsString()
  @IsOptional()
  receiptFooterText?: string;

  @ApiProperty({
    example: 'Facture conforme aux dispositions de la DGI / RDC. Exonération sous réserve d’homologation.',
    required: false,
  })
  @IsString()
  @IsOptional()
  invoiceLegalNotice?: string;
}

export class TaxItemDto {
  @ApiProperty({ example: 'TVA_16' })
  @IsString()
  @IsNotEmpty()
  code: string;

  @ApiProperty({ example: 'TVA Standard 16%' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ example: 16.0 })
  @IsNumber()
  @Min(0)
  @Max(100)
  rate: number;

  @ApiProperty({ example: true })
  @IsBoolean()
  isActive: boolean;
}

export type RoundingRule = 'ENTIER' | 'CINQUANTE' | 'CENT' | 'DECIMAL_2';

export class UpdateFinancialRulesDto {
  @ApiProperty({ example: 'CDF', enum: ['CDF', 'USD'] })
  @IsEnum(['CDF', 'USD'])
  defaultCurrency: 'CDF' | 'USD';

  @ApiProperty({ example: ['CDF', 'USD'] })
  @IsArray()
  activeCurrencies: ('CDF' | 'USD')[];

  @ApiProperty({ example: 0, description: 'Décimales pour le Franc Congolais (toujours 0 par défaut)' })
  @IsNumber()
  @Min(0)
  @Max(2)
  cdfDecimals: number;

  @ApiProperty({ example: 2, description: 'Décimales pour le Dollar USD' })
  @IsNumber()
  @Min(0)
  @Max(2)
  usdDecimals: number;

  @ApiProperty({ example: 'ENTIER', enum: ['ENTIER', 'CINQUANTE', 'CENT'] })
  @IsString()
  cdfRoundingRule: RoundingRule;

  @ApiProperty({ example: 'DECIMAL_2', enum: ['DECIMAL_2'] })
  @IsString()
  usdRoundingRule: RoundingRule;

  @ApiProperty({ example: ['ESPECES', 'MOBILE_MONEY', 'CARTE_BANCAIRE', 'VIREMENT', 'CREDIT_CLIENT'] })
  @IsArray()
  activePaymentMethods: string[];

  @ApiProperty({ type: [TaxItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TaxItemDto)
  taxes: TaxItemDto[];

  @ApiProperty({ example: 5.0, description: 'Plafond remise caissier en %' })
  @IsNumber()
  @Min(0)
  @Max(100)
  cashierDiscountCapPercent: number;

  @ApiProperty({ example: 15.0, description: 'Plafond remise pharmacien en %' })
  @IsNumber()
  @Min(0)
  @Max(100)
  pharmacistDiscountCapPercent: number;
}

export class UpdateAlertThresholdsDto {
  @ApiProperty({ example: 30, description: 'Seuil alerte péremption niveau 1 (jours)' })
  @IsNumber()
  @Min(1)
  expiryWarningDaysLevel1: number;

  @ApiProperty({ example: 60, description: 'Seuil alerte péremption niveau 2 (jours)' })
  @IsNumber()
  @Min(1)
  expiryWarningDaysLevel2: number;

  @ApiProperty({ example: 90, description: 'Seuil alerte péremption niveau 3 (jours)' })
  @IsNumber()
  @Min(1)
  expiryWarningDaysLevel3: number;

  @ApiProperty({ example: 15, description: 'Délai d’inactivité de session en minutes (AUT-03)' })
  @IsNumber()
  @Min(1)
  @Max(120)
  sessionInactivityTimeoutMinutes: number;
}

export class UpdatePrintTemplatesDto {
  @ApiProperty({ example: 'PHARMACIE VOICI L’HOMME\nKinshasa - Limete' })
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

  @ApiProperty({ example: 'Facture soumise à la TVA selon ordonnance fiscale en vigueur en RDC.' })
  @IsString()
  @IsOptional()
  invoiceLegalNotice?: string;
}

export class ImportSimulationRowDto {
  @ApiProperty({ example: 1 })
  rowNumber: number;

  @ApiProperty()
  data: any;

  @ApiProperty({ example: 'Le prix de vente CDF doit être supérieur à 0' })
  reason?: string;
}

export class SimulateImportDto {
  @ApiProperty({ example: 'products', enum: ['products', 'stock', 'suppliers', 'customers'] })
  @IsEnum(['products', 'stock', 'suppliers', 'customers'])
  type: 'products' | 'stock' | 'suppliers' | 'customers';

  @ApiProperty({ description: 'Lignes extraites du fichier Excel/CSV' })
  @IsArray()
  rows: any[];
}

export class ExecuteImportDto {
  @ApiProperty({ example: 'products', enum: ['products', 'stock', 'suppliers', 'customers'] })
  @IsEnum(['products', 'stock', 'suppliers', 'customers'])
  type: 'products' | 'stock' | 'suppliers' | 'customers';

  @ApiProperty({ description: 'Lignes validées à insérer définitivement' })
  @IsArray()
  rows: any[];
}

export class BackupDto {
  id: string;
  filename: string;
  sizeBytes: number;
  sizeFormatted: string;
  createdAt: string;
  createdBy: string;
  status: 'SUCCES' | 'EN_COURS' | 'ECHEC';
  tableCounts?: Record<string, number>;
}
