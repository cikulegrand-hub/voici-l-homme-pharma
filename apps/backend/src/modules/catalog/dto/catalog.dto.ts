import {
  IsString,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsBoolean,
  IsArray,
  Min,
  IsIn,
} from 'class-validator';
import { Type, Transform } from 'class-transformer';
import { ApiProperty, PartialType } from '@nestjs/swagger';

export class CreateCategoryDto {
  @ApiProperty({ example: 'Antalgiques & Antipyrétiques' })
  @IsString()
  @IsNotEmpty({ message: 'Le nom de la catégorie est obligatoire.' })
  name: string;

  @ApiProperty({ example: 'Médicaments contre la douleur et la fièvre', required: false })
  @IsString()
  @IsOptional()
  description?: string;
}

export class UpdateCategoryDto {
  @ApiProperty({ example: 'Antalgiques & Antipyrétiques', required: false })
  @IsString()
  @IsOptional()
  name?: string;

  @ApiProperty({ example: 'Médicaments contre la douleur et la fièvre', required: false })
  @IsString()
  @IsOptional()
  description?: string;
}

export class CreateGalenicFormDto {
  @ApiProperty({ example: 'Comprimé' })
  @IsString()
  @IsNotEmpty({ message: 'Le nom de la forme galénique est obligatoire.' })
  name: string;

  @ApiProperty({ example: 'Forme solide pour voie orale', required: false })
  @IsString()
  @IsOptional()
  description?: string;
}

export class CreateProductDto {
  @ApiProperty({ example: 'Doliprane 1000 mg' })
  @IsString()
  @IsNotEmpty({ message: 'Le nom commercial est obligatoire (CAT-01).' })
  name: string;

  @ApiProperty({ example: 'Paracétamol' })
  @IsString()
  @IsNotEmpty({ message: 'La DCI est obligatoire (CAT-01).' })
  dci: string;

  @ApiProperty({ example: '1000 mg', required: false })
  @IsString()
  @IsOptional()
  dosage?: string;

  @ApiProperty({ example: 'Comprimé', required: false })
  @IsString()
  @IsOptional()
  galenicForm?: string;

  @ApiProperty({ example: 'Boîte de 16', description: 'Unité de vente (CAT-01)' })
  @IsString()
  @IsNotEmpty({ message: 'L’unité de vente est obligatoire (CAT-01).' })
  sellingUnit: string;

  @ApiProperty({ example: 'Sanofi', required: false })
  @IsString()
  @IsOptional()
  laboratory?: string;

  @ApiProperty({ example: '33333333-3333-3333-3333-333333333331', required: false })
  @IsString()
  @IsOptional()
  categoryId?: string;

  @ApiProperty({ example: 3500.0, description: 'Prix de vente en Franc Congolais (CDF)' })
  @IsNumber()
  @Min(0, { message: 'Le prix de vente CDF ne peut être négatif.' })
  sellingPriceCdf: number;

  @ApiProperty({ example: 1.23, description: 'Prix de vente en Dollar (USD)' })
  @IsNumber()
  @Min(0, { message: 'Le prix de vente USD ne peut être négatif.' })
  sellingPriceUsd: number;

  @ApiProperty({ example: 16.0, description: 'Taux TVA applicable en %', default: 0.0 })
  @IsNumber()
  @IsOptional()
  taxRate?: number;

  @ApiProperty({ example: 15, description: 'Seuil minimal d’alerte de stock (CAT-01)' })
  @IsNumber()
  @Min(0)
  @IsOptional()
  minAlertThreshold?: number;

  @ApiProperty({ example: 200, required: false, description: 'Seuil maximum (CAT-11)' })
  @IsNumber()
  @Min(0)
  @IsOptional()
  maxThreshold?: number;

  @ApiProperty({ example: 30, required: false, description: 'Stock de sécurité (CAT-11)' })
  @IsNumber()
  @Min(0)
  @IsOptional()
  securityStock?: number;

  @ApiProperty({ example: 'Rayon B - Étagère 2', required: false })
  @IsString()
  @IsOptional()
  storageLocation?: string;

  @ApiProperty({ example: false, description: 'Exige une ordonnance médicale (CAT-02, RG-09)' })
  @IsBoolean()
  @IsOptional()
  requiresPrescription?: boolean;

  @ApiProperty({ example: false, description: 'Produit contrôlé / stupéfiant (CAT-02)' })
  @IsBoolean()
  @IsOptional()
  isControlledSubstance?: boolean;

  @ApiProperty({ example: false, description: 'Nécessite la chaîne du froid 2-8°C (CAT-02)' })
  @IsBoolean()
  @IsOptional()
  isColdChain?: boolean;

  @ApiProperty({ example: ['3582910012345'], description: 'Codes-barres associés EAN-13 (CAT-03)' })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  barcodes?: string[];
}

export class UpdateProductDto {
  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  name?: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  dci?: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  dosage?: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  galenicForm?: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  sellingUnit?: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  laboratory?: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  categoryId?: string;

  @ApiProperty({ required: false })
  @IsNumber()
  @Min(0)
  @IsOptional()
  sellingPriceCdf?: number;

  @ApiProperty({ required: false })
  @IsNumber()
  @Min(0)
  @IsOptional()
  sellingPriceUsd?: number;

  @ApiProperty({ required: false })
  @IsNumber()
  @IsOptional()
  taxRate?: number;

  @ApiProperty({ required: false })
  @IsNumber()
  @Min(0)
  @IsOptional()
  minAlertThreshold?: number;

  @ApiProperty({ required: false })
  @IsNumber()
  @Min(0)
  @IsOptional()
  maxThreshold?: number;

  @ApiProperty({ required: false })
  @IsNumber()
  @Min(0)
  @IsOptional()
  securityStock?: number;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  storageLocation?: string;

  @ApiProperty({ required: false })
  @IsBoolean()
  @IsOptional()
  requiresPrescription?: boolean;

  @ApiProperty({ required: false })
  @IsBoolean()
  @IsOptional()
  isControlledSubstance?: boolean;

  @ApiProperty({ required: false })
  @IsBoolean()
  @IsOptional()
  isColdChain?: boolean;

  @ApiProperty({ required: false })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  barcodes?: string[];
}

export class UpdateProductPriceDto {
  @ApiProperty({ example: 4000.0, description: 'Nouveau prix de vente CDF' })
  @IsNumber()
  @Min(0, { message: 'Le prix de vente CDF ne peut être négatif.' })
  newPriceCdf: number;

  @ApiProperty({ example: 1.4, description: 'Nouveau prix de vente USD' })
  @IsNumber()
  @Min(0, { message: 'Le prix de vente USD ne peut être négatif.' })
  newPriceUsd: number;

  @ApiProperty({ example: 'Hausse tarif fournisseur Laborex', description: 'Motif de révision (CAT-06)' })
  @IsString()
  @IsNotEmpty({ message: 'Le motif de révision du prix est obligatoire (CAT-06).' })
  reason: string;
}

export class AddBarcodeDto {
  @ApiProperty({ example: '3582910012345', description: 'Code-barres à associer (CAT-03)' })
  @IsString()
  @IsNotEmpty({ message: 'Le code-barres ne peut être vide.' })
  barcode: string;

  @ApiProperty({ example: false, required: false })
  @IsBoolean()
  @IsOptional()
  isPrimary?: boolean;
}

export class ProductQueryDto {
  @ApiProperty({ required: false, description: 'Recherche textuelle (Nom, DCI, Code-barres)' })
  @IsString()
  @IsOptional()
  q?: string;

  @ApiProperty({ required: false, description: 'Filtre par catégorie' })
  @IsString()
  @IsOptional()
  categoryId?: string;

  @ApiProperty({ required: false, description: 'Filtre ordonnance requise' })
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  requiresPrescription?: boolean;

  @ApiProperty({ required: false, description: 'Filtre produit contrôlé' })
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  isControlled?: boolean;

  @ApiProperty({ required: false, description: 'Filtre chaîne du froid' })
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  isColdChain?: boolean;

  @ApiProperty({ required: false, description: 'Filtre produit actif (défaut true)' })
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  isActive?: boolean;

  @ApiProperty({ required: false, description: 'Numéro de page (défaut 1)', default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  page?: number = 1;

  @ApiProperty({ required: false, description: 'Taille de page (défaut 20)', default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  limit?: number = 20;

  @ApiProperty({ required: false, description: 'Champ de tri', default: 'name' })
  @IsString()
  @IsOptional()
  sortBy?: string = 'name';

  @ApiProperty({ required: false, description: 'Sens du tri (asc ou desc)', default: 'asc' })
  @IsString()
  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortOrder?: 'asc' | 'desc' = 'asc';
}

export class AutocompleteQueryDto {
  @ApiProperty({ example: 'doli', description: 'Terme de recherche instantanée' })
  @IsString()
  @IsNotEmpty({ message: 'Le paramètre de recherche q est requis.' })
  q: string;
}
