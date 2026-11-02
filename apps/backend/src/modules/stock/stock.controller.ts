import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  Query,
  Req,
  UseGuards,
  HttpCode,
  HttpStatus,
  ParseUUIDPipe,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { StockService } from './stock.service';
import { FefoService } from './fefo.service';
import {
  CreateLotDto,
  DirectReceptionDto,
  CreateMovementDto,
  CreateInventoryDto,
  ValidateInventoryDto,
  QuarantineLotDto,
  UnquarantineLotDto,
  RequestAdjustmentDto,
  ApproveAdjustmentDto,
  StockMovementQueryDto,
  RecordInventoryCountDto,
} from './dto/stock.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { RequirePermission } from '../auth/decorators/auth.decorators';

@ApiTags('Gestion du stock & Traçabilité (STK)')
@Controller('stock')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class StockController {
  constructor(
    private readonly stockService: StockService,
    private readonly fefoService: FefoService,
  ) {}

  private getAuthenticatedContext(req: any): { pharmacyId: string; userId: string } {
    const user = req?.user;
    if (!user?.pharmacyId || !user?.id) {
      throw new UnauthorizedException('Utilisateur authentifié requis.');
    }
    return { pharmacyId: user.pharmacyId, userId: user.id };
  }

  // ==========================================
  // STK-01 & STK-02 : RÉCEPTIONS & LOTS
  // ==========================================

  @Post('lots')
  @RequirePermission('stock.recevoir')
  @ApiOperation({ summary: 'Réceptionner un lot avec date de péremption (STK-01, STK-02)' })
  createLot(@Body() dto: CreateLotDto, @Req() req: any) {
    const { pharmacyId, userId } = this.getAuthenticatedContext(req);
    return this.stockService.createLot(dto, pharmacyId, userId);
  }

  @Get('lots')
  @RequirePermission('stock.consulter')
  @ApiOperation({ summary: 'Lister les lots (STK-07)' })
  @ApiQuery({ name: 'productId', required: false })
  listLots(@Query('productId') productId: string | undefined, @Req() req: any) {
    const { pharmacyId } = this.getAuthenticatedContext(req);
    return this.stockService.listLots(pharmacyId, productId);
  }

  @Post('reception/direct')
  @RequirePermission('stock.recevoir')
  @ApiOperation({ summary: 'Réception directe multi-produits avec clé d’idempotence et CUMP (STK-01, RG-14)' })
  directReception(@Body() dto: DirectReceptionDto, @Req() req: any) {
    const { pharmacyId, userId } = this.getAuthenticatedContext(req);
    return this.stockService.directReception(dto, userId, pharmacyId);
  }

  @Get('products/:productId')
  @RequirePermission('stock.consulter')
  @ApiOperation({ summary: 'Consulter les lots et le stock disponible par produit (STK-07)' })
getStockByProduct(@Param('productId', ParseUUIDPipe) productId: string, @Req() req: any) {
    const { pharmacyId } = this.getAuthenticatedContext(req);
    return this.stockService.getStockByProduct(productId, pharmacyId);
  }

  // ==========================================
  // FEFO SIMULATION (STK-02, RG-01)
  // ==========================================

  @Post('fefo/simulate')
  @RequirePermission('stock.consulter')
  @ApiOperation({ summary: 'Simuler l’allocation FEFO pour consultation ou délivrance (RG-01)' })
  simulateFefoAllocation(
    @Body()
    body:
      | { items?: { productId: string; quantityNeeded?: number; quantity?: number }[]; productId?: string; quantity?: number; quantityNeeded?: number }
      | { productId: string; quantityNeeded?: number; quantity?: number }[],
    @Req() req: any,
  ) {
    const { pharmacyId } = this.getAuthenticatedContext(req);
    const rawItems = Array.isArray(body)
      ? body
      : Array.isArray(body.items)
        ? body.items
        : body.productId
          ? [{ productId: body.productId, quantity: body.quantity, quantityNeeded: body.quantityNeeded }]
          : [];
    const normalized = rawItems.map((it) => ({
      productId: it.productId,
      quantityNeeded: it.quantityNeeded ?? it.quantity ?? 1,
    }));
    return this.fefoService.simulateFefoAllocation(normalized, pharmacyId);
  }

  // ==========================================
  // STK-08 & STK-09 : ALERTES & RÉAPPROVISIONNEMENT
  // ==========================================

  @Get('alerts')
  @RequirePermission('stock.consulter')
  @ApiOperation({ summary: 'Alertes stock bas, ruptures et péremptions à 30, 60, 90 jours (STK-08, STK-09)' })
  getAlerts(@Req() req: any) {
    const { pharmacyId } = this.getAuthenticatedContext(req);
    return this.stockService.getAlerts(pharmacyId);
  }

  // ==========================================
  // STK-12 & RG-14 : VALORISATION AU CUMP
  // ==========================================

  @Get('cump-valuation')
  @RequirePermission('stock.consulter')
  @ApiOperation({ summary: 'Valorisation intégrale du stock au CUMP (STK-12, RG-14)' })
  getCumpValuation(@Req() req: any) {
    const { pharmacyId } = this.getAuthenticatedContext(req);
    return this.stockService.getCumpValuation(pharmacyId);
  }

  @Get('valuation/cump')
  @RequirePermission('stock.consulter')
  @ApiOperation({ summary: 'Valorisation au CUMP (alias frontend)' })
  getCumpValuationAlias(@Req() req: any) {
    const { pharmacyId } = this.getAuthenticatedContext(req);
    return this.stockService.getCumpValuation(pharmacyId);
  }

  // ==========================================
  // STK-14 : REGISTRE DES STUPÉFIANTS
  // ==========================================

  @Get('controlled-substances-register')
  @RequirePermission('stock.consulter')
  @ApiOperation({ summary: 'Registre officiel des stupéfiants et substances contrôlées (STK-14)' })
  getControlledSubstancesRegister(@Req() req: any) {
    const { pharmacyId } = this.getAuthenticatedContext(req);
    return this.stockService.getControlledSubstancesRegister(pharmacyId);
  }

  @Get('controlled-register')
  @RequirePermission('stock.consulter')
  @ApiOperation({ summary: 'Registre officiel des stupéfiants et substances contrôlées (compatibilité)' })
  getControlledRegisterCompat(@Req() req: any) {
    const { pharmacyId } = this.getAuthenticatedContext(req);
    return this.stockService.getControlledSubstancesRegister(pharmacyId);
  }

  // ==========================================
  // STK-05 & RG-11 : WORKFLOW D'AJUSTEMENT
  // ==========================================

  @Post('adjustments/request')
  @RequirePermission('stock.ajuster')
  @ApiOperation({ summary: 'Demander un ajustement de stock (Gestionnaire) (STK-05)' })
  async requestAdjustment(@Body() dto: RequestAdjustmentDto, @Req() req: any) {
    const { pharmacyId, userId } = this.getAuthenticatedContext(req);
    const adj = await this.stockService.requestAdjustment(dto, userId, pharmacyId);
    return { adjustment: adj, ...adj };
  }

  @Get('adjustments/pending')
  @RequirePermission('stock.consulter', 'stock.valider_ajustement')
  @ApiOperation({ summary: 'Lister les ajustements en attente de validation pharmacien (STK-05)' })
  listPendingAdjustments(@Req() req: any) {
    const { pharmacyId } = this.getAuthenticatedContext(req);
    return this.stockService.listPendingAdjustments(pharmacyId);
  }

  @Post('adjustments/:id/approve')
  @RequirePermission('stock.valider_ajustement')
  @ApiOperation({ summary: 'Valider ou rejeter un ajustement (Pharmacien uniquement) (STK-05, RG-11)' })
  async approveAdjustmentPost(
@Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ApproveAdjustmentDto,
    @Req() req: any,
  ) {
    const { pharmacyId, userId: pharmacienId } = this.getAuthenticatedContext(req);
    const adj = await this.stockService.approveAdjustment(id, dto, pharmacienId, pharmacyId);
    return { adjustment: adj, ...adj };
  }

  @Patch('adjustments/:id/approve')
  @RequirePermission('stock.valider_ajustement')
  @ApiOperation({ summary: 'Valider ou rejeter un ajustement (Pharmacien uniquement) (STK-05, RG-11)' })
  async approveAdjustment(
@Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ApproveAdjustmentDto,
    @Req() req: any,
  ) {
    const { pharmacyId, userId: pharmacienId } = this.getAuthenticatedContext(req);
    const adj = await this.stockService.approveAdjustment(id, dto, pharmacienId, pharmacyId);
    return { adjustment: adj, ...adj };
  }

  // ==========================================
  // STK-04 & STK-06 : MOUVEMENTS MANUELS & JOURNAL
  // ==========================================

  @Post('movements')
  @RequirePermission('stock.ajuster', 'stock.recevoir')
  @ApiOperation({ summary: 'Enregistrer un mouvement de stock avec motif obligatoire (STK-04, RG-11)' })
  createMovement(@Body() dto: CreateMovementDto, @Req() req: any) {
    const { pharmacyId, userId } = this.getAuthenticatedContext(req);
    return this.stockService.createManualMovement(dto, userId, pharmacyId);
  }

  @Get('movements')
  @RequirePermission('stock.consulter')
  @ApiOperation({ summary: 'Consulter le journal inaltérable des mouvements de stock (STK-06)' })
  getMovements(@Query() queryDto: StockMovementQueryDto, @Req() req: any) {
    const { pharmacyId } = this.getAuthenticatedContext(req);
    return this.stockService.getMovements(queryDto, pharmacyId);
  }

  // ==========================================
  // STK-10 : QUARANTAINE SANITAIRE & DÉBLOCAGE
  // ==========================================

  @Post('lots/:id/quarantine')
  @RequirePermission('stock.valider_ajustement')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Mettre un lot en quarantaine sanitaire (STK-10, RG-03)' })
async quarantineLot(@Param('id', ParseUUIDPipe) lotId: string, @Body() dto: QuarantineLotDto, @Req() req: any) {
    const { pharmacyId, userId } = this.getAuthenticatedContext(req);
    if (dto.quarantined === false) {
      return this.stockService.unquarantineLot(lotId, dto.reason, userId, pharmacyId);
    }
    return this.stockService.quarantineLot(lotId, dto.reason, userId, pharmacyId);
  }

  @Patch('lots/:id/quarantine')
  @RequirePermission('stock.valider_ajustement')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Bloquer ou débloquer un lot (compatibilité Angular)' })
async patchQuarantineLot(@Param('id', ParseUUIDPipe) lotId: string, @Body() dto: QuarantineLotDto, @Req() req: any) {
    const { pharmacyId, userId } = this.getAuthenticatedContext(req);
    if (dto.quarantined === false) {
      return this.stockService.unquarantineLot(lotId, dto.reason, userId, pharmacyId);
    }
    return this.stockService.quarantineLot(lotId, dto.reason, userId, pharmacyId);
  }

  @Post('lots/:id/unquarantine')
  @RequirePermission('stock.valider_ajustement')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Débloquer un lot de quarantaine sanitaire (STK-10, RG-03)' })
async unquarantineLot(@Param('id', ParseUUIDPipe) lotId: string, @Body() dto: UnquarantineLotDto, @Req() req: any) {
    const { pharmacyId, userId } = this.getAuthenticatedContext(req);
    return this.stockService.unquarantineLot(lotId, dto.reason, userId, pharmacyId);
  }

  // ==========================================
  // STK-11 : INVENTAIRES PHYSIQUES
  // ==========================================

  @Post('inventories')
  @RequirePermission('stock.inventaire')
  @ApiOperation({ summary: 'Créer une session d’inventaire physique avec comptage (STK-11)' })
  createInventory(@Body() dto: CreateInventoryDto, @Req() req: any) {
    const { pharmacyId, userId } = this.getAuthenticatedContext(req);
    return this.stockService.createInventory(dto, userId, pharmacyId);
  }

  @Get('inventories')
  @RequirePermission('stock.inventaire', 'stock.consulter')
  @ApiOperation({ summary: 'Lister les sessions d’inventaire (STK-11)' })
  listInventories(@Req() req: any) {
    const { pharmacyId } = this.getAuthenticatedContext(req);
    return this.stockService.listInventories(pharmacyId);
  }

  @Get('inventories/:id')
  @RequirePermission('stock.inventaire', 'stock.consulter')
  @ApiOperation({ summary: 'Détails d’un inventaire avec écarts de comptage (STK-11)' })
getInventoryById(@Param('id', ParseUUIDPipe) id: string, @Req() req: any) {
    const { pharmacyId } = this.getAuthenticatedContext(req);
    return this.stockService.getInventoryById(id, pharmacyId);
  }

  @Post('inventories/:id/counts')
  @RequirePermission('stock.inventaire')
  @ApiOperation({ summary: 'Saisir un comptage d’inventaire (STK-11)' })
  recordInventoryCount(
@Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RecordInventoryCountDto,
    @Req() req: any,
  ) {
    const { pharmacyId } = this.getAuthenticatedContext(req);
    return this.stockService.recordInventoryCount(id, dto, pharmacyId);
  }

  @Post('inventories/:id/validate')
  @RequirePermission('stock.valider_inventaire')
  @ApiOperation({ summary: 'Validation officielle de l’inventaire par le Pharmacien (STK-11)' })
validateInventory(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ValidateInventoryDto, @Req() req: any) {
    const { pharmacyId, userId: pharmacienId } = this.getAuthenticatedContext(req);
    return this.stockService.validateInventory(id, dto, pharmacienId, pharmacyId);
  }

  @Post('inventories/:id/cancel')
  @RequirePermission('stock.valider_inventaire')
  @ApiOperation({ summary: 'Annuler un inventaire sans générer de mouvements (STK-11)' })
cancelInventory(@Param('id', ParseUUIDPipe) id: string, @Req() req: any) {
    const { pharmacyId, userId: pharmacienId } = this.getAuthenticatedContext(req);
    return this.stockService.cancelInventory(id, pharmacienId, pharmacyId);
  }
}
