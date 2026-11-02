import { IsEnum, IsOptional, IsString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class NotificationQueryDto {
  @ApiPropertyOptional({ description: 'Filtrer uniquement les notifications non lues' })
  @IsOptional()
  unreadOnly?: boolean | string;

  @ApiPropertyOptional({ description: 'Filtrer par type', enum: ['STOCK_BAS', 'PEREMPTION', 'CREANCE_RETARD', 'ECART_CAISSE'] })
  @IsOptional()
  @IsString()
  type?: string;
}

