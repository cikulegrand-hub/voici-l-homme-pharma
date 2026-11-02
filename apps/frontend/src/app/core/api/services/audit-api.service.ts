import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { BaseApiClient } from '../generated/base-api-client';
import { AuditLogEntry } from '@vhp/shared';

@Injectable({
  providedIn: 'root',
})
export class AuditApiService {
  private readonly client = inject(BaseApiClient);

  getAuditLogs(params?: { entityName?: string; action?: string; userId?: string; from?: string; to?: string; page?: number; limit?: number }): Observable<any> {
    return this.client.get<any>('/audit/logs', { params });
  }

  exportAuditLogs(params?: Record<string, string>): Observable<Blob> {
    const query = params ? '?' + new URLSearchParams(params).toString() : '';
    return this.client.getBlob(`/audit/export${query}`);
  }
}

