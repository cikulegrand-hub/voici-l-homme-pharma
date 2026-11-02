import { Module } from '@nestjs/common';
import { CashService } from './cash.service';
import { CashController } from './cash.controller';
import { AuditModule } from '../audit/audit.module';
import { RolesGuard } from '../auth/guards/roles.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ExpenseStorageService } from './expense-storage.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [AuditModule, PrismaModule],
  controllers: [CashController],
  providers: [CashService, ExpenseStorageService, RolesGuard, JwtAuthGuard],
  exports: [CashService],
})
export class CashModule {}
