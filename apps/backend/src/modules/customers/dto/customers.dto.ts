import {
  IsString,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsEnum,
  IsDateString,
  Min,
  IsIn,
  IsUUID,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { CustomerType } from '@vhp/shared';

export class CreateCustomerDto {
  @ApiProperty({ example: 'Jean Mukendi' })
  @IsString()
  @IsNotEmpty()
  fullName: string;

  @ApiProperty({ example: '+243 81 234 56 78', required: false })
  @IsString()
  @IsOptional()
  phone?: string;

  @ApiProperty({ example: 'j.mukendi@email.cd', required: false })
  @IsString()
  @IsOptional()
  email?: string;

  @ApiProperty({ example: 'Société Commerciale de Kinshasa', required: false })
  @IsString()
  @IsOptional()
  companyName?: string;

  @ApiProperty({ example: 'Av. du 30 Juin, Gombe', required: false })
  @IsString()
  @IsOptional()
  address?: string;

  @ApiProperty({ example: 'PARTICULIER', enum: ['PARTICULIER', 'ENTREPRISE', 'ASSURANCE'] })
  @IsEnum(['PARTICULIER', 'ENTREPRISE', 'ASSURANCE'])
  customerType: CustomerType;

  @ApiProperty({ example: 500000.0, description: 'Plafond de crédit autorisé en CDF (RG-13)' })
  @IsNumber()
  @Min(0)
  creditLimitCdf: number;

  @ApiProperty({ example: 'Allergie sévère à la pénicilline (CLI-07)', required: false })
  @IsString()
  @IsOptional()
  medicalNotes?: string;
}

export class CreatePrescriptionDto {
  @ApiProperty({ example: 'cli-001' })
  @IsString()
  @IsNotEmpty()
  customerId: string;

  @ApiProperty({ example: 'Dr. Ilunga' })
  @IsString()
  @IsNotEmpty()
  prescriberName: string;

  @ApiProperty({ example: 'Clinique Ngaliema', required: false })
  @IsString()
  @IsOptional()
  healthCenter?: string;

  @ApiProperty({ example: '2026-10-28', description: 'Date de prescription AAAA-MM-JJ' })
  @IsDateString()
  prescriptionDate: string;

  @ApiProperty({ required: false, description: 'Private path already created by a storage integration' })
  @IsString()
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' && value.trim() ? value.trim() : undefined))
  storageFilePath?: string;

  @ApiProperty({ example: 'Amoxicilline 500 mg 1 gélule 3x/jour pendant 7 jours', required: false })
  @IsString()
  @IsOptional()
  prescriptionText?: string;
}

export class SettleDebtDto {
  @ApiProperty({ example: 50000.0, description: 'Montant du règlement en CDF (CLI-04)' })
  @IsNumber()
  @Min(1)
  amountPaidCdf: number;

  @ApiProperty({ enum: ['ESPECES', 'MOBILE_MONEY', 'CARTE_BANCAIRE', 'VIREMENT'] })
  @IsIn(['ESPECES', 'MOBILE_MONEY', 'CARTE_BANCAIRE', 'VIREMENT'])
  paymentMethod: 'ESPECES' | 'MOBILE_MONEY' | 'CARTE_BANCAIRE' | 'VIREMENT';

  @ApiProperty({ example: 'CDF', enum: ['CDF', 'USD'] })
  @IsIn(['CDF', 'USD'])
  currency: 'CDF' | 'USD';

  @ApiProperty({ example: 'b1d177a6-5c8a-4b6e-8f2b-b329e9d2c6b8' })
  @IsUUID()
  idempotencyKey: string;

  @ApiProperty({ required: false })
  @IsUUID()
  @IsOptional()
  cashSessionId?: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  notes?: string;
}

export class CustomerQueryDto {
  @IsString()
  @IsOptional()
  @Transform(({ value }) => (!value || value === 'undefined' || value === 'null' ? undefined : String(value).trim()))
  search?: string;

  @IsEnum(['PARTICULIER', 'ENTREPRISE', 'ASSURANCE'])
  @IsOptional()
  @Transform(({ value }) => (!value || value === 'undefined' || value === 'null' || value === '' ? undefined : value))
  customerType?: CustomerType;
}

