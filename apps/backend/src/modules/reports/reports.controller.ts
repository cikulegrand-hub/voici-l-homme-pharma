import { Controller, Get, Param, Query, Req, Res, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ReportsService } from './reports.service';
import { ReportFilterDto } from './dto/reports.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { RequirePermission } from '../auth/decorators/auth.decorators';

@ApiTags('Tableau de bord & Rapports (RPT)')
@Controller('reports')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get('dashboard')
  @RequirePermission('rapports.dashboard')
  @ApiOperation({ summary: 'Indicateurs consolidés du tableau de bord RPT-01 à RPT-06' })
  async getDashboardMetrics(@Query() query: ReportFilterDto, @Req() req: any) {
    this.reportsService.assertAccess(req.user.role, 'dashboard');
    return this.reportsService.getDashboardMetrics(query, req.user.pharmacyId, req.user.role);
  }

  @Get('sales')
  @ApiOperation({ summary: 'Rapport détaillé des ventes et chiffre d’affaires RPT-08' })
  async getSalesDetailedReport(@Query() query: ReportFilterDto, @Req() req: any) {
    this.reportsService.assertAccess(req.user.role, 'sales-journal');
    return this.reportsService.getSalesDetailedReport(query, req.user.pharmacyId);
  }

  @Get('stock-alerts')
  @ApiOperation({ summary: 'Rapport détaillé des alertes de stock et péremptions RPT-08' })
  async getStockDetailedReport(@Req() req: any) {
    this.reportsService.assertAccess(req.user.role, 'valued-inventory');
    return this.reportsService.getStockDetailedReport(req.user.pharmacyId);
  }

  @Get(':reportKey/export')
  @RequirePermission('rapports.exporter')
  @ApiOperation({ summary: 'Exporter un rapport RPT-09 en CSV, Excel ou PDF' })
  async exportReport(@Param('reportKey') reportKey: string, @Query() query: ReportFilterDto, @Req() req: any, @Res() response: any) {
    this.reportsService.assertAccess(req.user.role, reportKey, true);
    const exported = await this.reportsService.exportReport(reportKey, query, req.user.pharmacyId);
    response.setHeader('Content-Type', exported.contentType);
    response.setHeader('Content-Disposition', `attachment; filename="${reportKey}.${exported.extension}"`);
    return response.send(exported.buffer);
  }

  @Get(':reportKey')
  @ApiOperation({ summary: 'Rapport RPT-08 paginé avec filtres et totaux serveur' })
  async getDetailedReport(@Param('reportKey') reportKey: string, @Query() query: ReportFilterDto, @Req() req: any) {
    this.reportsService.assertAccess(req.user.role, reportKey);
    return this.reportsService.getDetailedReport(reportKey, query, req.user.pharmacyId);
  }
}
