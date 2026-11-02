import {
  Controller,
  Get,
  Patch,
  Post,
  Body,
  Req,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { SettingsService } from './settings.service';
import {
  UpdatePharmacyIdentityDto,
  UpdateFinancialRulesDto,
  UpdateAlertThresholdsDto,
  UpdatePrintTemplatesDto,
  SimulateImportDto,
  ExecuteImportDto,
} from './dto/settings.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { RequirePermission } from '../auth/decorators/auth.decorators';

@ApiTags('Paramétrage & Administration (PAR)')
@Controller('settings')
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  @Get()
  @ApiOperation({ summary: 'Consulter l’ensemble des paramètres de l’officine' })
  getAllSettings() {
    return {
      pharmacy: this.settingsService.getPharmacyIdentity(),
      financial: this.settingsService.getFinancialRules(),
      alerts: this.settingsService.getAlertThresholds(),
      printTemplates: this.settingsService.getPrintTemplates(),
    };
  }

  // ---------- 1. IDENTITÉ DE L'OFFICINE (PAR-01) ----------

  @Get('identity')
  @ApiOperation({ summary: 'Consulter l’identité et les coordonnées de l’officine (PAR-01)' })
  getPharmacyIdentity() {
    return this.settingsService.getPharmacyIdentity();
  }

  @Patch(['identity', 'pharmacy'])
  @UseGuards(JwtAuthGuard, RolesGuard)
  @RequirePermission('parametres.modifier')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Mettre à jour l’identité officielle de l’officine (PAR-01)' })
  updatePharmacyIdentity(@Body() dto: UpdatePharmacyIdentityDto, @Req() req: any) {
    const authorId = req.user?.id || 'admin-user-id';
    return this.settingsService.updatePharmacyIdentity(dto, authorId);
  }

  @Post('logo')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @RequirePermission('parametres.modifier')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Téléverser le logo de l’officine (PAR-01)' })
  uploadLogo(@Body('logoUrl') logoUrl: string, @Req() req: any) {
    const authorId = req.user?.id || 'admin-user-id';
    return this.settingsService.updateLogo(logoUrl, authorId);
  }

  // ---------- 2. RÈGLES FINANCIÈRES & TAXES (PAR-02, PAR-03, RG-07, RG-08) ----------

  @Get('financial')
  @ApiOperation({ summary: 'Consulter les devises, règles d’arrondi, taxes et plafonds de remise (PAR-02, PAR-03)' })
  getFinancialRules() {
    return this.settingsService.getFinancialRules();
  }

  @Patch('financial')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @RequirePermission('parametres.modifier')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Mettre à jour les règles financières et taxes (PAR-02, PAR-03)' })
  updateFinancialRules(@Body() dto: UpdateFinancialRulesDto, @Req() req: any) {
    const authorId = req.user?.id || 'admin-user-id';
    return this.settingsService.updateFinancialRules(dto, authorId);
  }

  // ---------- 3. SEUILS D'ALERTE & SÉCURITÉ (PAR-04, AUT-03, STK-09) ----------

  @Get('alerts')
  @ApiOperation({ summary: 'Consulter les seuils d’alerte de péremption et timeout session (PAR-04, AUT-03)' })
  getAlertThresholds() {
    return this.settingsService.getAlertThresholds();
  }

  @Patch('alerts')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @RequirePermission('parametres.modifier')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Mettre à jour les seuils d’alerte et timeout de session (PAR-04, AUT-03)' })
  updateAlertThresholds(@Body() dto: UpdateAlertThresholdsDto, @Req() req: any) {
    const authorId = req.user?.id || 'admin-user-id';
    return this.settingsService.updateAlertThresholds(dto, authorId);
  }

  // ---------- 4. MODÈLES D'IMPRESSION (PAR-05, PAR-06) ----------

  @Get('print-templates')
  @ApiOperation({ summary: 'Consulter les modèles de ticket de caisse et de facture (PAR-05, PAR-06)' })
  getPrintTemplates() {
    return this.settingsService.getPrintTemplates();
  }

  @Patch('print-templates')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @RequirePermission('parametres.modifier')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Mettre à jour les modèles de ticket et facture (PAR-05, PAR-06)' })
  updatePrintTemplates(@Body() dto: UpdatePrintTemplatesDto, @Req() req: any) {
    const authorId = req.user?.id || 'admin-user-id';
    return this.settingsService.updatePrintTemplates(dto, authorId);
  }

  // ---------- 5. ASSISTANT D'IMPORT INITIAL (PAR-07) ----------

  @Post('import/simulate')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @RequirePermission('parametres.modifier')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Simuler l’importation de données sans aucune écriture en base (PAR-07)' })
  simulateImport(@Body() dto: SimulateImportDto) {
    return this.settingsService.simulateImport(dto);
  }

  @Post('import/execute')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @RequirePermission('parametres.modifier')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Valider définitivement et exécuter l’importation transactionnelle (PAR-07)' })
  executeImport(@Body() dto: ExecuteImportDto, @Req() req: any) {
    const authorId = req.user?.id || 'admin-user-id';
    return this.settingsService.executeImport(dto, authorId);
  }

  // ---------- 6. SAUVEGARDES & RESTAURATION (PAR-08) ----------

  @Post('backups')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @RequirePermission('parametres.modifier')
  @HttpCode(HttpStatus.CREATED)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Déclencher une sauvegarde manuelle des données de l’officine (PAR-08)' })
  createBackup(@Req() req: any) {
    const authorId = req.user?.id || 'admin-user-id';
    const authorName = req.user?.fullName || 'Administrateur';
    return this.settingsService.createBackup(authorId, authorName);
  }

  @Get('backups')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @RequirePermission('parametres.modifier')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Consulter l’historique des sauvegardes avec statut (PAR-08)' })
  getBackupHistory() {
    return this.settingsService.getBackupHistory();
  }
}
