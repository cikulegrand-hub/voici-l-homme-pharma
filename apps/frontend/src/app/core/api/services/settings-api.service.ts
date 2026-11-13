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

  getDocumentHeader(format: 'a4' | 'ticket' = 'a4'): Observable<{
    identity: PharmacyIdentity;
    printTemplates: PrintTemplates;
    headerHtml: string;
    footerHtml: string;
  }> {
    return this.client.get(`/settings/document-header?format=${format}`);
  }
}
