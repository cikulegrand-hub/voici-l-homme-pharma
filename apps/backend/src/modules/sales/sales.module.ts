import { Module } from '@nestjs/common';
import { SalesService } from './sales.service';
import { InvoiceNumberService } from './invoice-number.service';
import { SalesController } from './sales.controller';
import { StockModule } from '../stock/stock.module';
import { CatalogModule } from '../catalog/catalog.module';
import { CustomersModule } from '../customers/customers.module';
import { SettingsModule } from '../settings/settings.module';
import { AuditModule } from '../audit/audit.module';
import { AuthModule } from '../auth/auth.module';
import { CashModule } from '../cash/cash.module';

@Module({
  imports: [
    StockModule,
    CatalogModule,
    CustomersModule,
    SettingsModule,
    AuditModule,
    AuthModule,
    CashModule,
  ],
  controllers: [SalesController],
  providers: [SalesService, InvoiceNumberService],
  exports: [SalesService, InvoiceNumberService],
})
export class SalesModule {}
