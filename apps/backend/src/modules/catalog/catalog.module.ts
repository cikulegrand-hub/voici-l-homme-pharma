import { Module } from '@nestjs/common';
import { CatalogService } from './catalog.service';
import { CatalogController } from './catalog.controller';
import { AuditModule } from '../audit/audit.module';
import { RolesGuard } from '../auth/guards/roles.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Module({
  imports: [AuditModule],
  controllers: [CatalogController],
  providers: [CatalogService, RolesGuard, JwtAuthGuard],
  exports: [CatalogService],
})
export class CatalogModule {}
