import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Patch,
  ParseUUIDPipe,
  Headers,
  Req,
  BadRequestException,
  UseGuards,
  Res,
} from '@nestjs/common';
import { Response } from 'express';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { Sale } from '@vhp/shared';
import { SalesService, HeldCart } from './sales.service';
import { CreateSaleRequestDto, CancelSaleDto, HoldCartDto, CreateCancellationRequestDto } from './dto/sales.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { RequirePermission } from '../auth/decorators/auth.decorators';
import { ApiBearerAuth } from '@nestjs/swagger';

@ApiTags('Ventes, Facturation & Caisse Comptoir (VTE)')
@Controller('sales')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class SalesController {
  constructor(private readonly salesService: SalesService) {}

  @Post()
  @RequirePermission('vente.creer')
  @ApiOperation({ summary: 'Enregistrer une vente rapide au comptoir' })
  @ApiResponse({ status: 201, description: 'Vente validée et déstockage FEFO effectué' })
  async createSale(@Body() dto: CreateSaleRequestDto, @Headers('idempotency-key') key: string | undefined, @Req() req: any): Promise<Sale> {
    if (!key?.trim()) throw new BadRequestException('L’en-tête Idempotency-Key est obligatoire (VTE-18, RG-16).');
    const user = req?.user;
    return this.salesService.processSale(dto, user?.id || 'caissier-current-user', user?.role || 'CAISSIER', user?.pharmacyId || '11111111-1111-1111-1111-111111111111', key.trim(), dto.supervisorPin);
  }

  @Post('preview')
  @RequirePermission('vente.creer')
  @ApiOperation({ summary: 'Prévisualiser les montants d’une vente sans écriture' })
  async previewSale(@Body() dto: CreateSaleRequestDto, @Req() req: any): Promise<any> {
    const user = req?.user;
    return this.salesService.previewSale(dto, user?.pharmacyId || '11111111-1111-1111-1111-111111111111', user?.role || 'CAISSIER');
  }

  @Get()
  @RequirePermission('vente.creer')
  @ApiOperation({ summary: 'Historique des ventes de l’officine' })
  async listSales(@Req() req: any): Promise<Sale[]> {
    return this.salesService.listSales(req?.user?.pharmacyId);
  }

  // Routes statiques avant les routes paramétrées.
  @Get('invoice/:invoiceNumber/duplicata')
  @RequirePermission('vente.creer')
  @ApiOperation({ summary: 'Réimpression d’une facture marquée DUPLICATA' })
  async getDuplicata(@Param('invoiceNumber') invoiceNumber: string, @Req() req: any): Promise<any> {
    return this.salesService.getDuplicata(invoiceNumber, req?.user?.id, req?.user?.pharmacyId);
  }

  @Get('invoice/:invoiceNumber/document')
  @RequirePermission('vente.creer')
  async document(@Param('invoiceNumber') invoiceNumber: string, @Res() response: Response, @Req() req: any) {
    const pdf = await this.salesService.renderPdf(invoiceNumber, false, false);
    response.type('application/pdf').setHeader('Content-Disposition', `inline; filename="${invoiceNumber}.pdf"`).send(pdf);
  }

  @Get('invoice/:invoiceNumber/ticket')
  @RequirePermission('vente.creer')
  async ticket(@Param('invoiceNumber') invoiceNumber: string, @Res() response: Response, @Req() req: any) {
    const pdf = await this.salesService.renderPdf(invoiceNumber, true, false);
    response.type('application/pdf').setHeader('Content-Disposition', `inline; filename="${invoiceNumber}-ticket.pdf"`).send(pdf);
  }

  @Get('invoice/:invoiceNumber/duplicata/document')
  @RequirePermission('vente.creer')
  async duplicateDocument(@Param('invoiceNumber') invoiceNumber: string, @Res() response: Response) {
    const pdf = await this.salesService.renderPdf(invoiceNumber, false, true);
    response.type('application/pdf').setHeader('Content-Disposition', `inline; filename="${invoiceNumber}-duplicata.pdf"`).send(pdf);
  }

  @Post('hold-cart')
  @RequirePermission('vente.creer')
  @ApiOperation({ summary: 'Mettre en attente un panier' })
  async holdCart(@Body() dto: HoldCartDto, @Req() req: any): Promise<HeldCart> {
    return this.salesService.holdCart(dto, req?.user?.pharmacyId || '11111111-1111-1111-1111-111111111111', req?.user?.id || 'caissier-current-user');
  }

  @Get('held-carts/list')
  @RequirePermission('vente.creer')
  @ApiOperation({ summary: 'Lister les paniers en attente' })
  listHeldCarts(@Req() req: any): Promise<HeldCart[]> {
    return this.salesService.listHeldCarts(req?.user?.pharmacyId || '11111111-1111-1111-1111-111111111111');
  }

  @Post('held-carts/:id/resume')
  @RequirePermission('vente.creer')
  @ApiOperation({ summary: 'Reprendre un panier mis en attente' })
  resumeHeldCart(@Param('id', ParseUUIDPipe) id: string, @Req() req: any): Promise<HeldCart> {
    return this.salesService.resumeHeldCart(id, req?.user?.pharmacyId || '11111111-1111-1111-1111-111111111111');
  }

  @Post(':id/request-cancellation')
  @RequirePermission('vente.creer')
  @ApiOperation({ summary: 'Transmettre une demande d’annulation de vente au pharmacien (VTE-13, UC-05)' })
  async requestCancellation(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateCancellationRequestDto,
    @Req() req: any,
  ): Promise<any> {
    return this.salesService.requestCancellation(id, dto, req?.user?.id || 'caissier-user', req?.user?.pharmacyId || '11111111-1111-1111-1111-111111111111');
  }

  @Get('cancellation-requests')
  @RequirePermission('vente.annuler')
  @ApiOperation({ summary: 'Lister les demandes d’annulation en attente de validation pharmacien' })
  async listCancellationRequests(@Req() req: any): Promise<any[]> {
    return this.salesService.listCancellationRequests(req?.user?.pharmacyId || '11111111-1111-1111-1111-111111111111');
  }

  @Patch(':id/cancel')
  @RequirePermission('vente.annuler')
  @ApiOperation({ summary: 'Annuler une vente avec motif' })
  async cancelSale(@Param('id', ParseUUIDPipe) id: string, @Body() dto: CancelSaleDto, @Req() req: any): Promise<Sale> {
    return this.salesService.cancelSale(id, dto, req?.user?.id || 'pharmacien-authorizer', req?.user?.pharmacyId || '11111111-1111-1111-1111-111111111111');
  }

  @Get(':id')
  @RequirePermission('vente.creer')
  @ApiOperation({ summary: 'Consulter le détail d’une facture par ID' })
  async getSale(@Param('id', ParseUUIDPipe) id: string): Promise<Sale> {
    return this.salesService.getSaleById(id);
  }
}
