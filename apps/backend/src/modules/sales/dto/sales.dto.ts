import {
  IsString,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsEnum,
  IsArray,
  IsBoolean,
  ValidateNested,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { CurrencyCode, PaymentMethod } from '@vhp/shared';

export class SaleItemRequestDto {
  @ApiProperty({ example: 'prd-xxx', description: 'ID du produit' })
  @IsString()
  @IsNotEmpty()
  productId: string;

  @ApiProperty({ example: 2, description: 'Quantité' })
  @IsNumber()
  @Min(1)
  quantity: number;

  @ApiProperty({ example: 3500.0, description: 'Prix unitaire en CDF' })
  @IsNumber()
  @IsOptional()
  @Min(0)
  unitPriceCdf?: number;

  @ApiProperty({ example: 0, required: false, description: 'Remise en CDF sur la ligne' })
  @IsNumber()
  @IsOptional()
  discountCdf?: number;

  @ApiProperty({ example: 'lot-uuid-12345', required: false, description: 'ID du lot sélectionné manuellement (profil habilité ou PIN superviseur VTE-04)' })
  @IsString()
  @IsOptional()
  lotId?: string;
}

export class PaymentItemDto {
  @ApiProperty({
    example: 'ESPECES',
    enum: ['ESPECES', 'MOBILE_MONEY', 'CARTE_BANCAIRE', 'VIREMENT', 'CREDIT_CLIENT'],
  })
  @IsEnum(['ESPECES', 'MOBILE_MONEY', 'CARTE_BANCAIRE', 'VIREMENT', 'CREDIT_CLIENT'])
  method: PaymentMethod;

  @ApiProperty({ example: 7000.0, description: 'Montant versé' })
  @IsNumber()
  @Min(0)
  amountPaid: number;

  @ApiProperty({ example: 'CDF', enum: ['CDF', 'USD'] })
  @IsEnum(['CDF', 'USD'])
  currency: CurrencyCode;

  @ApiProperty({
    example: 'M-PESA',
    required: false,
    enum: ['M-PESA', 'ORANGE_MONEY', 'AIRTEL_MONEY'],
  })
  @IsOptional()
  mobileMoneyProvider?: 'M-PESA' | 'ORANGE_MONEY' | 'AIRTEL_MONEY';

  @ApiProperty({ example: 'MP261028-987654', required: false, description: 'Référence de transaction' })
  @IsString()
  @IsOptional()
  transactionReference?: string;
}

export class CreateSaleRequestDto {
  @ApiProperty({ example: 'cli-001', required: false, description: 'ID du client si identifié' })
  @IsString()
  @IsOptional()
  customerId?: string;

  @ApiProperty({ example: 'ord-001', required: false, description: 'ID de l’ordonnance liée (RG-09)' })
  @IsString()
  @IsOptional()
  prescriptionId?: string;

  @ApiProperty({ example: 'CDF', enum: ['CDF', 'USD'], description: 'Devise principale de facturation' })
  @IsEnum(['CDF', 'USD'])
  currency: CurrencyCode;

  @ApiProperty({ type: [SaleItemRequestDto], description: 'Articles commandés' })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SaleItemRequestDto)
  items: SaleItemRequestDto[];

  @ApiProperty({ type: [PaymentItemDto], description: 'Paiements effectués' })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PaymentItemDto)
  payments: PaymentItemDto[];

  @ApiProperty({ example: 'idemp-uuid-12345', description: 'Clé d’idempotence anti-double clic (RG-16)' })
  @IsString()
  @IsOptional()
  idempotencyKey?: string;

  @ApiProperty({ example: '1234', required: false, description: 'Code PIN superviseur pour dérogation remise/crédit (AUT-08, RG-10)' })
  @IsString()
  @IsOptional()
  supervisorPin?: string;
}

export class CancelSaleDto {
  @ApiProperty({ example: 'Erreur de saisie caissier', description: 'Motif obligatoire d’annulation (VTE-13)' })
  @IsString()
  @IsNotEmpty()
  reason: string;

  @ApiProperty({ example: true, description: 'Remise en stock des médicaments si non altérés' })
  @IsBoolean()
  restockItems: boolean;

  @ApiProperty({ required: false, description: 'Lignes et quantités retournées pour un avoir partiel.' })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreditNoteLineDto)
  @IsOptional()
  items?: CreditNoteLineDto[];

  @ApiProperty({ example: '1234', required: false, description: 'Code PIN superviseur pour dérogation d’annulation par caissier' })
  @IsString()
  @IsOptional()
  supervisorPin?: string;
}

export class CreateCancellationRequestDto {
  @ApiProperty({ example: 'Erreur de saisie caissier', description: 'Motif de la demande d’annulation transmise au pharmacien' })
  @IsString()
  @IsNotEmpty()
  reason: string;

  @ApiProperty({ example: true, description: 'Demande de réintégration en stock' })
  @IsBoolean()
  restockItems: boolean;

  @ApiProperty({ required: false, description: 'Lignes et quantités concernées pour un avoir partiel' })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreditNoteLineDto)
  @IsOptional()
  items?: CreditNoteLineDto[];
}

export class CreditNoteLineDto {
  @IsString()
  @IsNotEmpty()
  saleItemId: string;

  @IsNumber()
  @Min(1)
  quantity: number;

  @IsBoolean()
  @IsOptional()
  restock?: boolean;
}

export class HoldCartDto {
  @ApiProperty({ example: 'Client parti chercher son portefeuille' })
  @IsString()
  @IsNotEmpty()
  referenceName: string;

  @ApiProperty({ type: [SaleItemRequestDto] })
  @IsArray()
  items: SaleItemRequestDto[];
}

