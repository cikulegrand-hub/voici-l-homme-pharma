import { Module } from '@nestjs/common';
import { SuppliersService } from './suppliers.service';
import { SuppliersController } from './suppliers.controller';
import { StockModule } from '../stock/stock.module';
import { AuditModule } from '../audit/audit.module';
import { CashModule } from '../cash/cash.module';
import { SettingsModule } from '../settings/settings.module';

@Module({
  imports: [StockModule, AuditModule, CashModule, SettingsModule],
  controllers: [SuppliersController],
  providers: [SuppliersService],
  exports: [SuppliersService],
})
export class SuppliersModule {}
