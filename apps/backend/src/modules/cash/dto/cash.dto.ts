import {
  IsString,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsDateString,
  Min,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class OpenCashSessionDto {
  @ApiProperty({ example: 50000.0, description: 'Fonds de caisse initial en Franc Congolais (CDF)' })
  @IsNumber()
  @Min(0)
  initialFloatCdf: number;

  @ApiProperty({ example: 20.0, description: 'Fonds de caisse initial en Dollars (USD)' })
  @IsNumber()
  @Min(0)
  initialFloatUsd: number;
}

export class CloseCashSessionDto {
  @ApiProperty({ example: 245000.0, description: 'Montant réel physique compté en caisse (CDF)' })
  @IsNumber()
  @Min(0)
  countedAmountCdf: number;

  @ApiProperty({ example: 95.0, description: 'Montant réel physique compté en caisse (USD)' })
  @IsNumber()
  @Min(0)
  countedAmountUsd: number;

  @ApiProperty({ example: 'Rendu monnaie de 500 CDF manquant', required: false, description: 'Justification obligatoire si écart (FIN-02, RG-12)' })
  @IsString()
  @IsOptional()
  varianceReason?: string;
}

export class SetExchangeRateDto {
  @ApiProperty({ example: 2850.0, description: 'Taux officiel du jour : 1 USD = X CDF (FIN-04, RG-08)' })
  @IsNumber()
  @Min(1)
  rate: number;

  @ApiProperty({ example: '2026-11-04T08:00:00.000Z', description: 'Date/heure ISO à partir de laquelle le taux devient applicable.' })
  @IsDateString()
  effectiveDate: string;

  @ApiProperty({ example: 'Ajustement cours officiel Banque Centrale / Marché Limete', required: false })
  @IsString()
  @IsOptional()
  notes?: string;
}

export class CreateExpenseDto {
  @ApiProperty({ example: 'Facture SNEL électricité officine' })
  @IsString()
  @IsNotEmpty()
  description: string;

  @ApiProperty({ example: 'Électricité / Énergie' })
  @IsString()
  @IsNotEmpty()
  category: string;

  @ApiProperty({ example: 75000.0, description: 'Montant en CDF' })
  @IsNumber()
  @Min(0)
  amountCdf: number;

  @ApiProperty({ example: 0.0, required: false, description: 'Montant en USD' })
  @IsNumber()
  @IsOptional()
  amountUsd?: number;

  @ApiProperty({ example: 'recus/snel-octobre-2026.pdf', required: false })
  @IsString()
  @IsOptional()
  receiptPath?: string;
}

export class ReverseExpenseDto {
  @ApiProperty({ example: 'Correction de saisie', description: 'Motif obligatoire de la contre-passation' })
  @IsString()
  @IsNotEmpty()
  reason: string;
}

export class CreateExpenseCategoryDto {
  @ApiProperty({ example: 'Transport' })
  @IsString()
  @IsNotEmpty()
  name: string;
}

export class CreateCashMovementDto {
  @ApiProperty({ enum: ['APPORT', 'RETRAIT'] })
  @IsString()
  @IsNotEmpty()
  type: 'APPORT' | 'RETRAIT';

  @ApiProperty({ example: 50000, required: false })
  @IsNumber()
  @Min(0)
  @IsOptional()
  amountCdf?: number;

  @ApiProperty({ example: 20, required: false })
  @IsNumber()
  @Min(0)
  @IsOptional()
  amountUsd?: number;

  @ApiProperty({ example: 'Réassort du tiroir principal' })
  @IsString()
  @IsNotEmpty()
  reason: string;
}

