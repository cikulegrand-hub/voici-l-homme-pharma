import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { BaseApiClient } from '../generated/base-api-client';
import {
  PharmacyIdentity,
  FinancialRules,
  AlertThresholds,
  PrintTemplates,
  ImportType,
  ImportSimulationResult,
  BackupEntry,
} from '@vhp/shared';

@Injectable({
  providedIn: 'root',
})
export class SettingsApiService {
  private readonly client = inject(BaseApiClient);

  getSettings(): Observable<{
    identity: PharmacyIdentity;
    financial: FinancialRules;
    alerts: AlertThresholds;
    printTemplates: PrintTemplates;
  }> {
    return this.client.get('/settings');
  }

  getIdentity(): Observable<PharmacyIdentity> {
    return this.client.get('/settings/identity');
  }

  updateIdentity(dto: Partial<PharmacyIdentity>): Observable<PharmacyIdentity> {
    return this.client.patch('/settings/identity', dto);
  }

  uploadLogo(logoUrl: string): Observable<{ logoUrl: string }> {
    return this.client.post('/settings/logo', { logoUrl });
  }

  getFinancial(): Observable<FinancialRules> {
    return this.client.get('/settings/financial');
  }

  updateFinancial(dto: Partial<FinancialRules>): Observable<FinancialRules> {
    return this.client.patch('/settings/financial', dto);
  }

  getAlerts(): Observable<AlertThresholds> {
    return this.client.get('/settings/alerts');
  }

  updateAlerts(dto: Partial<AlertThresholds>): Observable<AlertThresholds> {
    return this.client.patch('/settings/alerts', dto);
  }

  getPrintTemplates(): Observable<PrintTemplates> {
    return this.client.get('/settings/print-templates');
  }

  updatePrintTemplates(dto: Partial<PrintTemplates>): Observable<PrintTemplates> {
    return this.client.patch('/settings/print-templates', dto);
  }

  simulateImport(dto: {
    importType: ImportType;
    rows: Record<string, any>[];
  }): Observable<ImportSimulationResult> {
    return this.client.post('/settings/import/simulate', dto);
  }

  executeImport(dto: {
    importType: ImportType;
    rows: Record<string, any>[];
  }): Observable<{ success: boolean; insertedCount: number }> {
    return this.client.post('/settings/import/execute', dto);
  }

  createBackup(dto?: { description?: string }): Observable<{ success: boolean; backup: BackupEntry }> {
    return this.client.post('/settings/backups', dto || {});
  }

  getBackups(): Observable<BackupEntry[]> {
    return this.client.get('/settings/backups');
  }
}
