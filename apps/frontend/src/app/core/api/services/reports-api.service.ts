import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { DashboardChartPoint, DashboardMetric, ReportFilters, ReportResult, ReportKey } from '@vhp/shared';
import { BaseApiClient } from '../generated/base-api-client';

export interface DashboardSnapshot {
  filters: ReportFilters;
  metrics: DashboardMetric[];
  charts: { sales: DashboardChartPoint[]; bestSellers: DashboardChartPoint[] };
  generatedAt: string;
}

@Injectable({ providedIn: 'root' })
export class ReportsApiService {
  private readonly client = inject(BaseApiClient);

  getDashboard(filters: Partial<ReportFilters> = {}): Observable<DashboardSnapshot> {
    return this.client.get<DashboardSnapshot>('/reports/dashboard', { params: filters });
  }

  getReport<T = unknown>(reportKey: ReportKey, filters: Partial<ReportFilters> = {}): Observable<ReportResult<T>> {
    return this.client.get<ReportResult<T>>(`/reports/${reportKey}`, { params: filters });
  }

  getExportUrl(reportKey: ReportKey, format: 'pdf' | 'xlsx' | 'csv', filters: Partial<ReportFilters> = {}): string {
    const query = new URLSearchParams({ format, ...this.stringParams(filters) }).toString();
    return `/api/v1/reports/${reportKey}/export?${query}`;
  }

  downloadExport(reportKey: ReportKey, format: 'pdf' | 'xlsx' | 'csv', filters: Partial<ReportFilters> = {}): Observable<Blob> {
    const query = new URLSearchParams({ format, ...this.stringParams(filters) }).toString();
    return this.client.getBlob(`/reports/${reportKey}/export?${query}`);
  }

  private stringParams(filters: Partial<ReportFilters>): Record<string, string> {
    return Object.entries(filters).reduce<Record<string, string>>((params, [key, value]) => {
      if (value !== undefined && value !== null) params[key] = String(value);
      return params;
    }, {});
  }
}
