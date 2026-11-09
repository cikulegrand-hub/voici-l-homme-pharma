import { Module } from '@nestjs/common';
import { CashService } from './cash.service';
import { CashController } from './cash.controller';
import { AuditModule } from '../audit/audit.module';
import { ExpenseStorageService } from './expense-storage.service';
import { PrismaModule } from '../prisma/prisma.module';
import { ExchangeRateResolver } from './exchange-rate.resolver';

@Module({
  imports: [AuditModule, PrismaModule],
  controllers: [CashController],
  providers: [CashService, ExchangeRateResolver, ExpenseStorageService],
  exports: [CashService, ExchangeRateResolver],
})
export class CashModule {}
