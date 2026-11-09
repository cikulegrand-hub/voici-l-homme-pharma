import { Module } from '@nestjs/common';
import { CustomersService } from './customers.service';
import { CustomersController } from './customers.controller';
import { AuditModule } from '../audit/audit.module';
import { PrescriptionStorageService } from './prescription-storage.service';
import { CashModule } from '../cash/cash.module';

@Module({
  imports: [AuditModule, CashModule],
  controllers: [CustomersController],
  providers: [CustomersService, PrescriptionStorageService],
  exports: [CustomersService],
})
export class CustomersModule {}
