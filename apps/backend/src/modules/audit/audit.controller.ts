import { Controller, Get, Query, Res, Req, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { Response } from 'express';
import { AuditService } from './audit.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/auth.decorators';

@ApiTags('Audit & Traçabilité inaltérable (AUD)')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN', 'PHARMACIEN', 'COMPTABLE')
@Controller('audit')
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  @Get('logs')
  @ApiOperation({ summary: 'Consulter et rechercher dans le journal d’audit inaltérable avec pagination (AUD-01 à AUD-04)' })
  @ApiQuery({ name: 'action', required: false })
  @ApiQuery({ name: 'userId', required: false })
  @ApiQuery({ name: 'entityName', required: false })
  @ApiQuery({ name: 'from', required: false })
  @ApiQuery({ name: 'to', required: false })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiResponse({ status: 200, description: 'Liste paginée des entrées du journal d’audit' })
  @ApiResponse({ status: 403, description: 'Accès interdit aux rôles non autorisés (Caissier, Gestionnaire stock)' })
  async getLogs(
    @Req() req: any,
    @Query('action') action?: string,
    @Query('userId') userId?: string,
    @Query('entityName') entityName?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    const res = await this.auditService.getPaginatedLogs({
      pharmacyId: req.user.pharmacyId,
      action,
      userId,
      entityName,
      from,
      to,
      page: page ? Number(page) : 1,
      limit: limit ? Number(limit) : 50,
    });

    if (page !== undefined || limit !== undefined) {
      return res;
    }

    const legacyArray: any = [...res.data];
    legacyArray.total = res.total;
    legacyArray.page = res.page;
    legacyArray.limit = res.limit;
    legacyArray.totalPages = res.totalPages;
    legacyArray.data = res.data;
    return legacyArray;
  }

  @Get('export')
  @ApiOperation({ summary: 'Exporter le journal d’audit au format CSV/Excel pour inspection (AUD-05)' })
  @ApiQuery({ name: 'action', required: false })
  @ApiQuery({ name: 'userId', required: false })
  @ApiQuery({ name: 'entityName', required: false })
  @ApiQuery({ name: 'from', required: false })
  @ApiQuery({ name: 'to', required: false })
  @ApiResponse({ status: 200, description: 'Fichier CSV téléchargeable' })
  async exportLogs(
    @Res() res: Response,
    @Req() req: any,
    @Query('action') action?: string,
    @Query('userId') userId?: string,
    @Query('entityName') entityName?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const csvContent = await this.auditService.exportLogsToCsv({
      pharmacyId: req.user.pharmacyId,
      action,
      userId,
      entityName,
      from,
      to,
    });

    const dateStr = new Date().toISOString().split('T')[0];
    const filename = `journal_audit_${dateStr}.csv`;

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send('\uFEFF' + csvContent); // BOM UTF-8 pour Excel
  }
}
