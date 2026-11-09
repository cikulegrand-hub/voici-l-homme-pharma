import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { BaseApiClient } from '../generated/base-api-client';
import { AuditLogFilters, PaginatedAuditLogs } from '@vhp/shared';

@Injectable({
  providedIn: 'root',
})
export class AuditApiService {
  private readonly client = inject(BaseApiClient);

  getAuditLogs(params?: AuditLogFilters): Observable<PaginatedAuditLogs> {
    return this.client.get<PaginatedAuditLogs>('/audit/logs', { params: this.cleanParams(params) });
  }

  exportAuditLogs(params?: AuditLogFilters): Observable<Blob> {
    const queryParams = Object.entries(this.cleanParams(params));
    const query = queryParams.length ? '?' + new URLSearchParams(Object.fromEntries(queryParams) as Record<string, string>).toString() : '';
    return this.client.getBlob(`/audit/export${query}`);
  }

  private cleanParams(params?: AuditLogFilters): AuditLogFilters {
    return Object.fromEntries(
      Object.entries(params || {}).filter(([, value]) => value !== undefined && value !== null && value !== '' && value !== 'undefined'),
    ) as AuditLogFilters;
  }
}

