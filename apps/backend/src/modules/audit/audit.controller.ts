import { Controller, Get, Query, Res, Req, UseGuards, BadRequestException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { Response } from 'express';
import { AuditService } from './audit.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { RequirePermission } from '../auth/decorators/auth.decorators';
import { AuditQueryDto } from './dto/audit-query.dto';

@ApiTags('Audit & Traçabilité inaltérable (AUD)')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('audit')
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  @Get('logs')
  @RequirePermission('audit.consulter')
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
    @Query() query: AuditQueryDto,
  ) {
    this.validateDateRange(query.from, query.to);
    return this.auditService.getPaginatedLogs({
      pharmacyId: req.user.pharmacyId,
      ...query,
    });
  }

  @Get('export')
  @RequirePermission('audit.consulter')
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
    @Query() query: AuditQueryDto,
  ) {
    this.validateDateRange(query.from, query.to);
    const csvContent = await this.auditService.exportLogsToCsv({
      pharmacyId: req.user.pharmacyId,
      ...query,
    });

    const dateStr = new Date().toISOString().split('T')[0];
    const filename = `journal_audit_${dateStr}.csv`;

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send('\uFEFF' + csvContent); // BOM UTF-8 pour Excel
  }

  private validateDateRange(from?: string, to?: string): void {
    if (from && to && new Date(from).getTime() > new Date(to).getTime()) {
      throw new BadRequestException('La date de début doit être antérieure ou égale à la date de fin.');
    }
  }
}
