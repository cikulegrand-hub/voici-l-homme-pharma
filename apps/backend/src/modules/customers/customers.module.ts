import { Module } from '@nestjs/common';
import { CustomersService } from './customers.service';
import { CustomersController } from './customers.controller';
import { AuditModule } from '../audit/audit.module';
import { PrescriptionStorageService } from './prescription-storage.service';
import { CashModule } from '../cash/cash.module';
import { SettingsModule } from '../settings/settings.module';
import { CustomerPdfService } from './customer-pdf.service';

@Module({
  imports: [AuditModule, CashModule, SettingsModule],
  controllers: [CustomersController],
  providers: [CustomersService, PrescriptionStorageService, CustomerPdfService],
  exports: [CustomersService, CustomerPdfService],
})
export class CustomersModule {}
