import {
  IsString,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsArray,
  ValidateNested,
  Min,
  IsDateString,
  IsIn,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

export class CreateSupplierDto {
  @ApiProperty({ example: 'Laborex RDC' })
  @IsString()
  @IsNotEmpty({ message: 'Le nom du fournisseur est obligatoire.' })
  name: string;

  @ApiProperty({ example: 'M. K. Kabongo', required: false })
  @IsString()
  @IsOptional()
  contactName?: string;

  @ApiProperty({ example: '+243 81 100 20 30', required: false })
  @IsString()
  @IsOptional()
  phone?: string;

  @ApiProperty({ example: 'commandes@laborex.cd', required: false })
  @IsString()
  @IsOptional()
  email?: string;

  @ApiProperty({ example: 'Av. de l’Échangeur, Limete, Kinshasa', required: false })
  @IsString()
  @IsOptional()
  address?: string;

  @ApiProperty({ example: 'Paiement à 30 jours, remise volume 5%', required: false })
  @IsString()
  @IsOptional()
  paymentTerms?: string;

  @ApiProperty({ example: 2, description: 'Délai moyen de livraison en jours' })
  @IsNumber()
  @Min(0)
  @IsOptional()
  leadTimeDays?: number = 2;
}

export class UpdateSupplierDto {
  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  name?: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  contactName?: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  phone?: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  email?: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  address?: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  paymentTerms?: string;

  @ApiProperty({ required: false })
  @IsNumber()
  @Min(0)
  @IsOptional()
  leadTimeDays?: number;
}

export class OrderItemDto {
  @ApiProperty({ example: '44444444-4444-4444-4444-444444444441' })
  @IsString()
  @IsNotEmpty({ message: 'L’ID du produit est obligatoire.' })
  productId: string;

  @ApiProperty({ example: 100, description: 'Quantité commandée' })
  @IsNumber()
  @Min(1, { message: 'La quantité commandée doit être au moins 1.' })
  orderedQuantity: number;

  @ApiProperty({ example: 1800.0, description: 'Prix d’achat unitaire estimé en CDF' })
  @IsNumber()
  @Min(0)
  unitPriceCdf: number;

  @ApiProperty({ example: 0.63, required: false, description: 'Prix d’achat unitaire estimé en USD' })
  @IsNumber()
  @Min(0)
  @IsOptional()
  unitPriceUsd?: number;
}

export class CreatePurchaseOrderDto {
  @ApiProperty({ example: 'supplier-uuid' })
  @IsString()
  @IsNotEmpty({ message: 'Le fournisseur est obligatoire.' })
  supplierId: string;

  @ApiProperty({ type: [OrderItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OrderItemDto)
  items: OrderItemDto[];

  @ApiProperty({ example: '2026-11-15', required: false })
  @IsDateString()
  @IsOptional()
  expectedDeliveryDate?: string;

  @ApiProperty({ example: 'Commande réapprovisionnement hebdomadaire', required: false })
  @IsString()
  @IsOptional()
  notes?: string;
}

export class UpdatePurchaseOrderStatusDto {
  @ApiProperty({ example: 'ENVOYE', enum: ['BROUILLON', 'ENVOYE', 'ANNULE'] })
  @IsString()
  @IsIn(['BROUILLON', 'ENVOYE', 'ANNULE'])
  status: 'BROUILLON' | 'ENVOYE' | 'ANNULE';
}

export class ReceivedLineDto {
  @ApiProperty({ example: '44444444-4444-4444-4444-444444444441' })
  @IsString()
  @IsNotEmpty()
  productId: string;

  @ApiProperty({ example: 'LOT-LBX-9081' })
  @IsString()
  @IsNotEmpty({ message: 'Le numéro de lot est obligatoire.' })
  lotNumber: string;

  @ApiProperty({ example: '2028-06-30' })
  @IsDateString({}, { message: 'Date de péremption invalide.' })
  expiryDate: string;

  @ApiProperty({ example: 100 })
  @IsNumber()
  @Min(1)
  receivedQuantity: number;

  @ApiProperty({ example: 1800.0 })
  @IsNumber()
  @Min(0)
  actualPurchasePriceCdf: number;

  @ApiProperty({ example: 0.63, required: false })
  @IsNumber()
  @Min(0)
  @IsOptional()
  actualPurchasePriceUsd?: number;

  @ApiProperty({ example: 'Rayon A-03', required: false })
  @IsString()
  @IsOptional()
  storageLocation?: string;

  @ApiProperty({ example: 'purchase-order-item-uuid', required: false })
  @IsString()
  @IsOptional()
  purchaseOrderItemId?: string;
}

export class ReceiveOrderDto {
  @ApiProperty({ example: 'idemp-uuid-1234', required: false, description: 'Clé d’idempotence unique pour éviter les doublons' })
  @IsString()
  @IsOptional()
  idempotencyKey?: string;

  @ApiProperty({ type: [ReceivedLineDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ReceivedLineDto)
  lines: ReceivedLineDto[];

  @ApiProperty({ example: 'FAC-LBX-2026-9018', required: false, description: 'Numéro de facture fournisseur liée' })
  @IsString()
  @IsOptional()
  supplierInvoiceNumber?: string;

  @ApiProperty({ example: 'Réception conforme sans dommage', required: false })
  @IsString()
  @IsOptional()
  notes?: string;
}

export class PurchaseOrderQueryDto {
  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  supplierId?: string;

  @ApiProperty({ required: false, enum: ['BROUILLON', 'ENVOYE', 'PARTIELLEMENT_RECU', 'RECU', 'ANNULE'] })
  @IsString()
  @IsOptional()
  status?: string;

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
