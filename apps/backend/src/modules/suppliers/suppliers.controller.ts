import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Patch,
  Query,
  Req,
  Res,
  UseGuards,
  HttpCode,
  HttpStatus,
  UnauthorizedException,
  ParseUUIDPipe,
} from '@nestjs/common';
import { Response } from 'express';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { SuppliersService } from './suppliers.service';
import { Supplier, PurchaseOrder } from '@vhp/shared';
import {
  CreateSupplierDto,
  UpdateSupplierDto,
  CreatePurchaseOrderDto,
  ReceiveOrderDto,
  PurchaseOrderQueryDto,
  UpdatePurchaseOrderStatusDto,
} from './dto/suppliers.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { RequirePermission } from '../auth/decorators/auth.decorators';

@ApiTags('Achats & Fournisseurs (ACH)')
@Controller('suppliers')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class SuppliersController {
  constructor(private readonly suppliersService: SuppliersService) {}

  private getAuthenticatedContext(req: any): { pharmacyId: string; userId: string } {
    const user = req?.user;
    if (!user?.pharmacyId || !user?.id) {
      throw new UnauthorizedException('Utilisateur authentifié requis.');
    }
    return { pharmacyId: user.pharmacyId, userId: user.id };
  }

  // ==========================================
  // ACH-01 : GESTION DES FOURNISSEURS
  // ==========================================

  @Post()
  @RequirePermission('stock.recevoir')
  @ApiOperation({ summary: 'Créer une fiche fournisseur (ACH-01)' })
  @ApiResponse({ status: 201, description: 'Fournisseur créé avec succès' })
  async createSupplier(@Body() dto: CreateSupplierDto, @Req() req: any): Promise<Supplier> {
    const { pharmacyId, userId } = this.getAuthenticatedContext(req);
    return this.suppliersService.createSupplier(dto, pharmacyId, userId);
  }

  @Get()
  @RequirePermission('stock.consulter')
  @ApiOperation({ summary: 'Lister les fournisseurs actifs' })
  async listSuppliers(@Req() req: any): Promise<Supplier[]> {
    const { pharmacyId, userId } = this.getAuthenticatedContext(req);
    return this.suppliersService.listSuppliers(pharmacyId, userId);
  }

  // ==========================================
  // ACH-02 & ACH-04 : BONS DE COMMANDE & PDF
  // ==========================================

  @Post('orders')
  @RequirePermission('stock.recevoir')
  @ApiOperation({ summary: 'Créer un bon de commande fournisseur (ACH-02)' })
  @ApiResponse({ status: 201, description: 'Bon de commande créé' })
  async createPurchaseOrder(
    @Body() dto: CreatePurchaseOrderDto,
    @Req() req: any,
  ): Promise<PurchaseOrder> {
    const { userId, pharmacyId } = this.getAuthenticatedContext(req);
    return this.suppliersService.createPurchaseOrder(dto, userId, pharmacyId);
  }

  @Get('orders')
  @RequirePermission('stock.consulter')
  @ApiOperation({ summary: 'Lister les bons de commande avec filtres et pagination' })
  async listOrders(@Query() query: PurchaseOrderQueryDto, @Req() req: any): Promise<PurchaseOrder[]> {
    const { pharmacyId, userId } = this.getAuthenticatedContext(req);
    return this.suppliersService.listPurchaseOrders(query, pharmacyId, userId);
  }

  @Get('orders/list')
  @RequirePermission('stock.consulter')
  @ApiOperation({ summary: 'Lister les bons de commande (compatibilité)' })
  async listOrdersCompat(@Query() query: PurchaseOrderQueryDto, @Req() req: any): Promise<PurchaseOrder[]> {
    const { pharmacyId, userId } = this.getAuthenticatedContext(req);
    return this.suppliersService.listPurchaseOrders(query, pharmacyId, userId);
  }

  @Get('orders/:id')
  @RequirePermission('stock.consulter')
  @ApiOperation({ summary: 'Consulter le détail d’un bon de commande' })
  async getOrderById(@Param('id', ParseUUIDPipe) id: string, @Req() req: any): Promise<PurchaseOrder> {
    const { pharmacyId, userId } = this.getAuthenticatedContext(req);
    return this.suppliersService.getPurchaseOrderById(id, pharmacyId, userId);
  }

  @Get('orders/:id/pdf')
  @RequirePermission('stock.consulter')
  @ApiOperation({ summary: 'Exporter un bon de commande au format PDF (ACH-02)' })
  async exportOrderPdf(@Param('id', ParseUUIDPipe) id: string, @Res() res: Response, @Req() req: any) {
    const { pharmacyId, userId } = this.getAuthenticatedContext(req);
    const buffer = await this.suppliersService.exportPurchaseOrderPdf(id, pharmacyId, userId);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="bon-de-commande-${id}.pdf"`);
    res.send(buffer);
  }

  @Post('orders/:id/receive')
  @RequirePermission('stock.recevoir')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Réceptionner une commande fournisseur avec création de lots et CUMP (ACH-04, STK-01, RG-14)',
  })
  async receiveOrder(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReceiveOrderDto,
    @Req() req: any,
  ): Promise<any> {
    const { userId, pharmacyId } = this.getAuthenticatedContext(req);
    return this.suppliersService.receiveOrder(id, dto, userId, pharmacyId);
  }

  @Patch('orders/:id/status')
  @RequirePermission('stock.recevoir')
  @ApiOperation({ summary: 'Modifier le statut d’un bon de commande (ACH-02)' })
  async updateStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePurchaseOrderStatusDto,
    @Req() req: any,
  ): Promise<PurchaseOrder> {
    const { pharmacyId, userId } = this.getAuthenticatedContext(req);
    return this.suppliersService.updateOrderStatus(id, dto.status, pharmacyId, userId);
  }

  // Les routes paramétrées doivent rester après toutes les routes statiques `orders...`.
  @Get(':id')
  @RequirePermission('stock.consulter')
  @ApiOperation({ summary: 'Consulter une fiche fournisseur' })
  async getSupplier(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: any,
  ): Promise<Supplier> {
    const { pharmacyId, userId } = this.getAuthenticatedContext(req);
    return this.suppliersService.getSupplierById(id, pharmacyId, userId);
  }

  @Patch(':id')
  @RequirePermission('stock.recevoir')
  @ApiOperation({ summary: 'Modifier une fiche fournisseur (ACH-01)' })
  async updateSupplier(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateSupplierDto,
    @Req() req: any,
  ): Promise<Supplier> {
    const { pharmacyId, userId } = this.getAuthenticatedContext(req);
    return this.suppliersService.updateSupplier(id, dto, pharmacyId, userId);
  }
}
