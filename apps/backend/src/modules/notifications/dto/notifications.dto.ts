import { IsEnum, IsOptional, IsString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { NotificationType, NotificationSeverity, RoleName } from '@vhp/shared';

export class NotificationQueryDto {
  @ApiPropertyOptional({ description: 'Filtrer uniquement les notifications non lues' })
  @IsOptional()
  unreadOnly?: boolean | string;

  @ApiPropertyOptional({
    description: 'Filtrer par type',
    enum: [
      'STOCK_BAS',
      'STOCK_RUPTURE',
      'PEREMPTION',
      'CREANCE_RETARD',
      'ECART_CAISSE',
      'CONFLIT_STOCK_OFFLINE',
      'COMMANDE_FOURNISSEUR',
      'SYSTEME',
    ],
  })
  @IsOptional()
  @IsString()
  type?: string;

  @ApiPropertyOptional({ description: 'Filtrer par sévérité', enum: ['INFO', 'WARNING', 'DANGER'] })
  @IsOptional()
  @IsString()
  severity?: string;
}

export interface CreateNotificationDto {
  pharmacyId: string;
  type: NotificationType;
  title: string;
  message: string;
  severity: NotificationSeverity;
  targetRole?: RoleName;
  entityType?: 'PRODUCT_LOT' | 'CUSTOMER' | 'CASH_SESSION' | 'SALE' | 'PURCHASE_ORDER' | string;
  entityId?: string;
  metadata?: Record<string, unknown>;
  dedupKey?: string;
}


