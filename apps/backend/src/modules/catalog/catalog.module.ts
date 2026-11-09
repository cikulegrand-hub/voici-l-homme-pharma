import { Module } from '@nestjs/common';
import { CatalogService } from './catalog.service';
import { CatalogController } from './catalog.controller';
import { AuditModule } from '../audit/audit.module';
import { CashModule } from '../cash/cash.module';

@Module({
  imports: [AuditModule, CashModule],
  controllers: [CatalogController],
  providers: [CatalogService],
  exports: [CatalogService],
})
export class CatalogModule {}
