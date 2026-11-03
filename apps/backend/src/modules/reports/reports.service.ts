import { ForbiddenException, Injectable } from '@nestjs/common';
import { StockService } from '../stock/stock.service';
import { ReportsQueryService } from './reports-query.service';
import { ReportFilterDto } from './dto/reports.dto';
import { ReportsExportService } from './reports-export.service';

@Injectable()
export class ReportsService {
  constructor(
    private readonly stockService: StockService,
    private readonly reportsQueryService: ReportsQueryService,
    private readonly reportsExportService: ReportsExportService,
  ) {}

  async getDashboardMetrics(dto: ReportFilterDto = {}, pharmacyId?: string, role = 'ADMIN') {
    return this.reportsQueryService.getDashboard(dto, pharmacyId, role);
  }

  assertAccess(role: string, reportKey?: string, exportRequested = false): void {
    const fullRoles = ['ADMIN', 'PHARMACIEN', 'COMPTABLE'];
    if (fullRoles.includes(role)) return;
    if (exportRequested) throw new ForbiddenException('Les exports sont réservés à l’administration, au pharmacien et à la comptabilité.');
    if (!reportKey || reportKey === 'dashboard') return;
    const allowed: Record<string, string[]> = {
      CAISSIER: ['sales-journal', 'best-sellers'],
      STOCK: ['stock-movements', 'stock-entries-exits', 'valued-inventory', 'expiries', 'low-rotation'],
    };
    if (!allowed[role]?.includes(reportKey)) throw new ForbiddenException('Ce rapport n’est pas disponible pour votre rôle.');
  }

  async getDetailedReport(reportKey: string, dto: ReportFilterDto = {}, pharmacyId?: string) {
    return this.reportsQueryService.getDetailedReport(reportKey, dto, pharmacyId);
  }

  async exportReport(reportKey: string, dto: ReportFilterDto = {}, pharmacyId?: string) {
    const result = await this.getDetailedReport(reportKey, { ...dto, page: 1, limit: 500 }, pharmacyId);
    return this.reportsExportService.export(result, dto.format || 'csv');
  }

  /** Compatibility response for existing consumers of /reports/sales. */
  async getSalesDetailedReport(dto: ReportFilterDto = {}, pharmacyId?: string) {
    const report = await this.reportsQueryService.getDetailedReport('sales-journal', dto, pharmacyId);
    return {
      ...report,
      sales: report.data,
      summary: report.totals.byCurrency,
    };
  }

  /** Compatibility response for existing consumers of /reports/stock-alerts. */
  async getStockDetailedReport(pharmacyId?: string) {
    return this.stockService.getAlerts(pharmacyId || '11111111-1111-1111-1111-111111111111');
  }
}
