import { Module } from '@nestjs/common';
import { StockService } from './stock.service';
import { FefoService } from './fefo.service';
import { CumpService } from './cump.service';
import { StockAlertsSchedulerService } from './stock-alerts-scheduler.service';
import { StockController } from './stock.controller';
import { AuditModule } from '../audit/audit.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuditModule, AuthModule],
  controllers: [StockController],
  providers: [StockService, FefoService, CumpService, StockAlertsSchedulerService],
  exports: [StockService, FefoService, CumpService, StockAlertsSchedulerService],
})
export class StockModule {}
