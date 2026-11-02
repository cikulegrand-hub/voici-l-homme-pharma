import { Module } from '@nestjs/common';
import { SettingsService } from './settings.service';
import { SettingsController } from './settings.controller';
import { AuditModule } from '../audit/audit.module';
import { RolesGuard } from '../auth/guards/roles.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Module({
  imports: [AuditModule],
  controllers: [SettingsController],
  providers: [SettingsService, RolesGuard, JwtAuthGuard],
  exports: [SettingsService],
})
export class SettingsModule {}
