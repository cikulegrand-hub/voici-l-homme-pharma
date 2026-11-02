import {
  IsString,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsDateString,
  IsEnum,
  Min,
  IsArray,
  ValidateNested,
  IsBoolean,
} from 'class-validator';
import { Type, Transform } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

export class CreateLotDto {
  @ApiProperty({ example: '44444444-4444-4444-4444-444444444441', description: 'ID du produit' })
  @IsString()
  @IsNotEmpty({ message: 'L’ID du produit est obligatoire.' })
  productId: string;

  @ApiProperty({ example: 'DLP-2418', description: 'Numéro de lot imprimé sur l’emballage' })
  @IsString()
  @IsNotEmpty({ message: 'Le numéro de lot est obligatoire.' })
  lotNumber: string;

  @ApiProperty({ example: '2027-12-31', description: 'Date de péremption AAAA-MM-JJ' })
  @IsDateString({}, { message: 'Date de péremption invalide (format AAAA-MM-JJ attendu).' })
  expiryDate: string;

  @ApiProperty({ example: 240, description: 'Quantité entrée' })
  @IsNumber()
  @Min(1, { message: 'La quantité doit être supérieure ou égale à 1.' })
  @IsOptional()
  quantity?: number;

  @ApiProperty({ example: 240, required: false })
  @IsNumber()
  @Min(1)
  @IsOptional()
  initialQuantity?: number;

  @ApiProperty({ example: 1800.0, description: 'Prix d’achat unitaire CDF' })
  @IsNumber()
  @Min(0, { message: 'Le prix d’achat unitaire CDF ne peut être négatif.' })
  purchasePriceCdf: number;

  @ApiProperty({ example: 0.63, required: false, description: 'Prix d’achat unitaire USD' })
  @IsNumber()
  @Min(0, { message: 'Le prix d’achat unitaire USD ne peut être négatif.' })
  @IsOptional()
  purchasePriceUsd?: number;

  @ApiProperty({ example: 'Rayon A-03', required: false })
  @IsString()
  @IsOptional()
  storageLocation?: string;
}

export class DirectReceptionLineDto {
  @ApiProperty({ example: '44444444-4444-4444-4444-444444444441' })
  @IsString()
  @IsNotEmpty()
  productId: string;

  @ApiProperty({ example: 'LOT-2026-X1' })
  @IsString()
  @IsNotEmpty()
  lotNumber: string;

  @ApiProperty({ example: '2028-06-30' })
  @IsDateString()
  expiryDate: string;

  @ApiProperty({ example: 50 })
  @IsNumber()
  @Min(1)
  quantity: number;

  @ApiProperty({ example: 2500 })
  @IsNumber()
  @Min(0)
  purchasePriceCdf: number;

  @ApiProperty({ example: 0.88, required: false })
  @IsNumber()
  @Min(0)
  @IsOptional()
  purchasePriceUsd?: number;

  @ApiProperty({ example: 'Rayon A-03', required: false })
  @IsString()
  @IsOptional()
  storageLocation?: string;
}

export class DirectReceptionDto {
  @ApiProperty({ example: 'idemp-uuid-1234', required: false, description: 'Clé d’idempotence unique (évite doubles écritures)' })
  @IsString()
  @IsOptional()
  idempotencyKey?: string;

  @ApiProperty({ example: 'supplier-uuid', required: false })
  @IsString()
  @IsOptional()
  supplierId?: string;

  @ApiProperty({ example: 'FACT-LABOREX-9821', required: false })
  @IsString()
  @IsOptional()
  supplierInvoiceNumber?: string;

  @ApiProperty({ example: 'Livraison express commande urgente', required: false })
  @IsString()
  @IsOptional()
  notes?: string;

  @ApiProperty({ type: [DirectReceptionLineDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DirectReceptionLineDto)
  lines: DirectReceptionLineDto[];
}

export class CreateMovementDto {
  @ApiProperty({ example: 'lot-xxx' })
  @IsString()
  @IsNotEmpty()
  lotId: string;

  @ApiProperty({
    example: 'CASSE_PERTE',
    enum: [
      'AJUSTEMENT_POSITIF',
      'AJUSTEMENT_NEGATIF',
      'PEREMPTION',
      'CASSE_PERTE',
      'DON',
      'USAGE_INTERNE',
      'RETOUR_FOURNISSEUR',
      'RETOUR_CLIENT',
    ],
  })
  @IsEnum([
    'AJUSTEMENT_POSITIF',
    'AJUSTEMENT_NEGATIF',
    'PEREMPTION',
    'CASSE_PERTE',
    'DON',
    'USAGE_INTERNE',
    'RETOUR_FOURNISSEUR',
    'RETOUR_CLIENT',
  ])
  type: string;

  @ApiProperty({ example: 4, description: 'Quantité du mouvement' })
  @IsNumber()
  @Min(1, { message: 'La quantité doit être au moins 1.' })
  quantity: number;

  @ApiProperty({ example: 'Boîte tombée et écrasée', description: 'Motif obligatoire (RG-11)' })
  @IsString()
  @IsNotEmpty({ message: 'Le motif du mouvement est obligatoire (RG-11).' })
  reason: string;
}

export class RequestAdjustmentDto {
  @ApiProperty({ example: 'lot-xxx' })
  @IsString()
  @IsNotEmpty()
  lotId: string;

  @ApiProperty({ example: -2, description: 'Écart constaté (+ ou -)', required: false })
  @IsNumber()
  @IsOptional()
  variance?: number;

  @ApiProperty({ example: 5, description: 'Différence de quantité', required: false })
  @IsNumber()
  @IsOptional()
  quantityDifference?: number;

  @ApiProperty({ example: 'Écart constaté lors du rangement rayon', description: 'Motif obligatoire' })
  @IsString()
  @IsNotEmpty({ message: 'Le motif de la demande d’ajustement est obligatoire.' })
  reason: string;
}

export class ApproveAdjustmentDto {
  @ApiProperty({ example: true, description: 'Valider (true) ou Rejeter (false)', required: false })
  @IsBoolean()
  @IsOptional()
  approved?: boolean;

  @ApiProperty({ example: 'APPROVE', required: false })
  @IsString()
  @IsOptional()
  action?: 'APPROVE' | 'REJECT';

  @ApiProperty({ example: 'Écart non justifié après recomptage', required: false })
  @IsString()
  @IsOptional()
  rejectionReason?: string;

  @ApiProperty({ example: 'Vérifié en rayon par le titulaire', required: false })
  @IsString()
  @IsOptional()
  pharmacistComment?: string;

  @ApiProperty({ example: '1234', required: false, description: 'Code PIN pharmacien si exigé' })
  @IsString()
  @IsOptional()
  pinCode?: string;
}

export class InventoryLineDto {
  @ApiProperty({ example: 'lot-xxx' })
  @IsString()
  @IsNotEmpty()
  lotId: string;

  @ApiProperty({ example: 238, description: 'Quantité comptée physiquement' })
  @IsNumber()
  @Min(0)
  countedQuantity: number;

  @ApiProperty({ example: 'Casse non déclarée', required: false })
  @IsString()
  @IsOptional()
  justification?: string;
}

export class CreateInventoryDto {
  @ApiProperty({ example: 'INV-2026-10', required: false })
  @IsString()
  @IsOptional()
  reference?: string;

  @ApiProperty({ example: 'TOURNANT', enum: ['COMPLET', 'TOURNANT'], required: false })
  @IsString()
  @IsOptional()
  type?: 'COMPLET' | 'TOURNANT';

  @ApiProperty({ required: false, description: 'IDs produits pour un inventaire tournant' })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  productIds?: string[];

  @ApiProperty({ type: [InventoryLineDto], required: false })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => InventoryLineDto)
  @IsOptional()
  lines?: InventoryLineDto[];

  @ApiProperty({ example: 'Inventaire tournant rayon B', required: false })
  @IsString()
  @IsOptional()
  notes?: string;
}

export class ValidateInventoryDto {
  @ApiProperty({ example: 'Écarts vérifiés et conformes au comptage physique', required: false })
  @IsString()
  @IsOptional()
  validationComment?: string;

  @ApiProperty({ example: 'Comptage validé par le pharmacien', required: false })
  @IsString()
  @IsOptional()
  justification?: string;

  @ApiProperty({ example: '1234', required: false })
  @IsString()
  @IsOptional()
  pinCode?: string;
}

export class RecordInventoryCountDto {
  @ApiProperty({ example: 'lot-xxx' })
  @IsString()
  @IsNotEmpty()
  lotId: string;

  @ApiProperty({ example: 238 })
  @IsNumber()
  @Min(0)
  countedQuantity: number;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  justification?: string;
}

export class QuarantineLotDto {
  @ApiProperty({ example: 'Rappel sanitaire officiel du fabricant (RG-03)' })
  @IsString()
  @IsNotEmpty({ message: 'Le motif de mise en quarantaine est obligatoire.' })
  reason: string;

  @ApiProperty({ required: false, description: 'true = quarantaine, false = déblocage (PATCH)' })
  @IsBoolean()
  @IsOptional()
  quarantined?: boolean;
}

export class UnquarantineLotDto {
  @ApiProperty({ example: 'Levée d’alerte qualité confirmée par le laboratoire' })
  @IsString()
  @IsNotEmpty({ message: 'Le motif de déblocage est obligatoire.' })
  reason: string;
}

export class StockMovementQueryDto {
  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  productId?: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  lotId?: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  type?: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  userId?: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  startDate?: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  endDate?: string;

  @ApiProperty({ required: false, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  page?: number = 1;

  @ApiProperty({ required: false, default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  limit?: number = 20;
}
