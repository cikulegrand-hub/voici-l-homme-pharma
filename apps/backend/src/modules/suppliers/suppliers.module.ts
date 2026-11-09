import { Module } from '@nestjs/common';
import { SuppliersService } from './suppliers.service';
import { SuppliersController } from './suppliers.controller';
import { StockModule } from '../stock/stock.module';
import { AuditModule } from '../audit/audit.module';
import { CashModule } from '../cash/cash.module';

@Module({
  imports: [StockModule, AuditModule, CashModule],
  controllers: [SuppliersController],
  providers: [SuppliersService],
  exports: [SuppliersService],
})
export class SuppliersModule {}
