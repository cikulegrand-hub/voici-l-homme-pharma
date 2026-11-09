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
  UnauthorizedException,
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
  UploadLogoDto,
} from './dto/settings.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { RequirePermission } from '../auth/decorators/auth.decorators';

@ApiTags('Paramétrage & Administration (PAR)')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('settings')
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  private getAuthorId(req: any): string {
    const authorId = req?.user?.id;
    if (!authorId) {
      throw new UnauthorizedException('Utilisateur authentifié requis.');
    }
    return authorId;
  }

  @Get()
  @ApiOperation({ summary: 'Consulter l’ensemble des paramètres de l’officine' })
  getAllSettings() {
    return {
      identity: this.settingsService.getPharmacyIdentity(),
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
  @RequirePermission('parametres.modifier')
  @ApiOperation({ summary: 'Mettre à jour l’identité officielle de l’officine (PAR-01)' })
  updatePharmacyIdentity(@Body() dto: UpdatePharmacyIdentityDto, @Req() req: any) {
    return this.settingsService.updatePharmacyIdentity(dto, this.getAuthorId(req));
  }

  @Post('logo')
  @RequirePermission('parametres.modifier')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Téléverser le logo de l’officine (PAR-01)' })
  uploadLogo(@Body() dto: UploadLogoDto, @Req() req: any) {
    return this.settingsService.updateLogo(dto.logoUrl, this.getAuthorId(req));
  }

  // ---------- 2. RÈGLES FINANCIÈRES & TAXES (PAR-02, PAR-03, RG-07, RG-08) ----------

  @Get('financial')
  @ApiOperation({ summary: 'Consulter les devises, règles d’arrondi, taxes et plafonds de remise (PAR-02, PAR-03)' })
  getFinancialRules() {
    return this.settingsService.getFinancialRules();
  }

  @Patch('financial')
  @RequirePermission('parametres.modifier')
  @ApiOperation({ summary: 'Mettre à jour les règles financières et taxes (PAR-02, PAR-03)' })
  updateFinancialRules(@Body() dto: UpdateFinancialRulesDto, @Req() req: any) {
    return this.settingsService.updateFinancialRules(dto, this.getAuthorId(req));
  }

  // ---------- 3. SEUILS D'ALERTE & SÉCURITÉ (PAR-04, AUT-03, STK-09) ----------

  @Get('alerts')
  @ApiOperation({ summary: 'Consulter les seuils d’alerte de péremption et timeout session (PAR-04, AUT-03)' })
  getAlertThresholds() {
    return this.settingsService.getAlertThresholds();
  }

  @Patch('alerts')
  @RequirePermission('parametres.modifier')
  @ApiOperation({ summary: 'Mettre à jour les seuils d’alerte et timeout de session (PAR-04, AUT-03)' })
  updateAlertThresholds(@Body() dto: UpdateAlertThresholdsDto, @Req() req: any) {
    return this.settingsService.updateAlertThresholds(dto, this.getAuthorId(req));
  }

  // ---------- 4. MODÈLES D'IMPRESSION (PAR-05, PAR-06) ----------

  @Get('print-templates')
  @ApiOperation({ summary: 'Consulter les modèles de ticket de caisse et de facture (PAR-05, PAR-06)' })
  getPrintTemplates() {
    return this.settingsService.getPrintTemplates();
  }

  @Patch('print-templates')
  @RequirePermission('parametres.modifier')
  @ApiOperation({ summary: 'Mettre à jour les modèles de ticket et facture (PAR-05, PAR-06)' })
  updatePrintTemplates(@Body() dto: UpdatePrintTemplatesDto, @Req() req: any) {
    return this.settingsService.updatePrintTemplates(dto, this.getAuthorId(req));
  }

  // ---------- 5. ASSISTANT D'IMPORT INITIAL (PAR-07) ----------

  @Post('import/simulate')
  @RequirePermission('parametres.modifier')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Simuler l’importation de données sans aucune écriture en base (PAR-07)' })
  simulateImport(@Body() dto: SimulateImportDto) {
    return this.settingsService.simulateImport(dto);
  }

  @Post('import/execute')
  @RequirePermission('parametres.modifier')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Valider définitivement et exécuter l’importation transactionnelle (PAR-07)' })
  executeImport(@Body() dto: ExecuteImportDto, @Req() req: any) {
    return this.settingsService.executeImport(dto, this.getAuthorId(req));
  }
}
