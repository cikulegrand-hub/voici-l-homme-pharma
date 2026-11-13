import { Module } from '@nestjs/common';
import { ReportsService } from './reports.service';
import { ReportsController } from './reports.controller';
import { SalesModule } from '../sales/sales.module';
import { StockModule } from '../stock/stock.module';
import { CashModule } from '../cash/cash.module';
import { CatalogModule } from '../catalog/catalog.module';
import { SettingsModule } from '../settings/settings.module';
import { ReportsQueryService } from './reports-query.service';
import { ReportsExportService } from './reports-export.service';

@Module({
  imports: [SalesModule, StockModule, CashModule, CatalogModule, SettingsModule],
  controllers: [ReportsController],
  providers: [ReportsService, ReportsQueryService, ReportsExportService],
  exports: [ReportsService],
})
export class ReportsModule {}
