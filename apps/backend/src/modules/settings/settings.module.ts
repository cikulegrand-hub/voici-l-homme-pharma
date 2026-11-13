import { Module } from '@nestjs/common';
import { SettingsService } from './settings.service';
import { DocumentHeaderService } from './document-header.service';
import { SettingsController } from './settings.controller';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [AuditModule],
  controllers: [SettingsController],
  providers: [SettingsService, DocumentHeaderService],
  exports: [SettingsService, DocumentHeaderService],
})
export class SettingsModule {}
