import { Controller, Get, Param, Query, Req, Res, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { ReportsService } from './reports.service';
import { ReportFilterDto } from './dto/reports.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { RequirePermission } from '../auth/decorators/auth.decorators';

@ApiTags('Tableau de bord & Rapports (RPT)')
@ApiBearerAuth()
@Controller('reports')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get('dashboard')
  @RequirePermission('rapports.dashboard')
  @ApiOperation({ summary: 'Indicateurs consolidés du tableau de bord RPT-01 à RPT-06' })
  async getDashboardMetrics(@Query() query: ReportFilterDto, @Req() req: any) {
    this.reportsService.assertAccess(req.user.role, 'dashboard');
    const scopedQuery = { ...query };
    // Le Caissier ne voit que son propre chiffre d'affaires et ses propres ventes
    if (req.user.role === 'CAISSIER') {
      scopedQuery.userId = req.user.id;
    }
    return this.reportsService.getDashboardMetrics(scopedQuery, req.user.pharmacyId, req.user.role);
  }

  @Get('sales')
  @RequirePermission('rapports.ventes', 'rapports.consulter')
  @ApiOperation({ summary: 'Rapport détaillé des ventes et chiffre d’affaires RPT-08' })
  async getSalesDetailedReport(@Query() query: ReportFilterDto, @Req() req: any) {
    this.reportsService.assertAccess(req.user.role, 'sales-journal');
    const scopedQuery = { ...query };
    if (req.user.role === 'CAISSIER') {
      scopedQuery.userId = req.user.id;
    }
    return this.reportsService.getSalesDetailedReport(scopedQuery, req.user.pharmacyId);
  }

  @Get('stock-alerts')
  @RequirePermission('rapports.stock', 'rapports.consulter')
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
    const scopedQuery = { ...query };
    if (req.user.role === 'CAISSIER') {
      scopedQuery.userId = req.user.id;
    }
    const exported = await this.reportsService.exportReport(reportKey, scopedQuery, req.user.pharmacyId);
    response.setHeader('Content-Type', exported.contentType);
    response.setHeader('Content-Disposition', `attachment; filename="${reportKey}.${exported.extension}"`);
    return response.send(exported.buffer);
  }

  @Get(':reportKey')
  @RequirePermission('rapports.consulter', 'rapports.dashboard', 'rapports.ventes', 'rapports.stock', 'rapports.financiers')
  @ApiOperation({ summary: 'Rapport RPT-08 paginé avec filtres et totaux serveur' })
  async getDetailedReport(@Param('reportKey') reportKey: string, @Query() query: ReportFilterDto, @Req() req: any) {
    this.reportsService.assertAccess(req.user.role, reportKey);
    const scopedQuery = { ...query };
    if (req.user.role === 'CAISSIER') {
      scopedQuery.userId = req.user.id;
    }
    return this.reportsService.getDetailedReport(reportKey, scopedQuery, req.user.pharmacyId);
  }
}
