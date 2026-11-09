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
  Query,
  BadRequestException,
  UnauthorizedException,
  UseGuards,
  Res,
} from '@nestjs/common';
import { Response } from 'express';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { Sale, OfflineSyncBatchResult, HeldCart } from '@vhp/shared';
import { SalesService } from './sales.service';
import {
  CreateSaleRequestDto,
  CancelSaleDto,
  HoldCartDto,
  CreateCancellationRequestDto,
  OfflineSyncBatchDto,
  ResolveConflictRequestDto,
} from './dto/sales.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { RequirePermission } from '../auth/decorators/auth.decorators';

@ApiTags('Ventes, Facturation & Caisse Comptoir (VTE)')
@Controller('sales')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class SalesController {
  constructor(private readonly salesService: SalesService) {}

  private getAuthenticatedUser(req: any) {
    const user = req?.user;
    if (!user?.id || !user?.pharmacyId || !user?.role) {
      throw new UnauthorizedException('Utilisateur authentifié requis.');
    }
    return user;
  }

  @Post()
  @RequirePermission('vente.creer')
  @ApiOperation({ summary: 'Enregistrer une vente rapide au comptoir' })
  @ApiResponse({ status: 201, description: 'Vente validée et déstockage FEFO effectué' })
  async createSale(@Body() dto: CreateSaleRequestDto, @Headers('idempotency-key') key: string | undefined, @Req() req: any): Promise<Sale> {
    if (!key?.trim()) throw new BadRequestException('Impossible de traiter cette demande. Veuillez réessayer.');
    const user = this.getAuthenticatedUser(req);
    return this.salesService.processSale(dto, user.id, user.role, user.pharmacyId, key.trim(), dto.supervisorPin);
  }

  @Post('preview')
  @RequirePermission('vente.creer')
  @ApiOperation({ summary: 'Prévisualiser les montants d’une vente sans écriture' })
  async previewSale(@Body() dto: CreateSaleRequestDto, @Req() req: any): Promise<any> {
    const user = this.getAuthenticatedUser(req);
    return this.salesService.previewSale(dto, user.pharmacyId, user.role);
  }

  @Get()
  @RequirePermission('vente.creer')
  @ApiOperation({ summary: 'Historique et recherche multi-critères des ventes' })
  async listSales(
    @Query('query') query?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('status') status?: string,
    @Req() req?: any,
  ): Promise<Sale[]> {
    const user = this.getAuthenticatedUser(req);
    return this.salesService.listSales(user.pharmacyId, { query, startDate, endDate, status });
  }

  @Post('sync')
  @RequirePermission('vente.creer')
  @ApiOperation({ summary: 'Synchroniser un lot de ventes réalisées hors-ligne (V2 Hors-ligne)' })
  async syncOfflineSales(@Body() dto: OfflineSyncBatchDto, @Req() req: any): Promise<OfflineSyncBatchResult> {
    const user = this.getAuthenticatedUser(req);
    return this.salesService.syncOfflineSales(
      dto as any,
      user.id,
      user.role,
      user.pharmacyId,
    );
  }

  @Get('conflicts')
  @RequirePermission('vente.creer')
  @ApiOperation({ summary: 'Lister les ventes en conflit de stock lors de la synchronisation hors-ligne' })
  async listConflicts(@Req() req: any): Promise<any[]> {
    const user = this.getAuthenticatedUser(req);
    return this.salesService.listConflicts(user.pharmacyId);
  }

  @Post(':id/resolve-conflict')
  @RequirePermission('vente.annuler')
  @ApiOperation({ summary: 'Arbitrer et résoudre un conflit de vente hors-ligne (Pharmacien Responsable)' })
  async resolveConflict(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ResolveConflictRequestDto,
    @Req() req: any,
  ): Promise<any> {
    const user = this.getAuthenticatedUser(req);
    return this.salesService.resolveConflict(
      id,
      dto,
      user.id,
      user.pharmacyId,
    );
  }

  // Routes statiques avant les routes paramétrées.
  @Get('invoice/:invoiceNumber/duplicata')
  @RequirePermission('vente.creer')
  @ApiOperation({ summary: 'Réimpression d’une facture marquée DUPLICATA' })
  async getDuplicata(@Param('invoiceNumber') invoiceNumber: string, @Req() req: any): Promise<any> {
    const user = this.getAuthenticatedUser(req);
    return this.salesService.getDuplicata(invoiceNumber, user.id, user.pharmacyId);
  }

  @Get('invoice/:invoiceNumber/receipt/html')
  @RequirePermission('vente.creer')
  async renderReceiptHtml(@Param('invoiceNumber') invoiceNumber: string, @Res() response: Response, @Req() req: any) {
    const user = this.getAuthenticatedUser(req);
    const html = await this.salesService.renderDocument(invoiceNumber, true, false, user.pharmacyId);
    response.type('text/html').send(html);
  }

  @Get('invoice/:invoiceNumber/receipt/pdf')
  @RequirePermission('vente.creer')
  async renderReceiptPdf(@Param('invoiceNumber') invoiceNumber: string, @Res() response: Response, @Req() req: any) {
    const user = this.getAuthenticatedUser(req);
    const pdf = await this.salesService.renderPdf(invoiceNumber, true, false, user.pharmacyId);
    response.type('application/pdf').setHeader('Content-Disposition', `inline; filename="${invoiceNumber}-ticket.pdf"`).send(pdf);
  }

  @Get('invoice/:invoiceNumber/html')
  @RequirePermission('vente.creer')
  async renderInvoiceHtml(@Param('invoiceNumber') invoiceNumber: string, @Res() response: Response, @Req() req: any) {
    const user = this.getAuthenticatedUser(req);
    const html = await this.salesService.renderDocument(invoiceNumber, false, false, user.pharmacyId);
    response.type('text/html').send(html);
  }

  @Get('invoice/:invoiceNumber/pdf')
  @RequirePermission('vente.creer')
  async renderInvoicePdf(@Param('invoiceNumber') invoiceNumber: string, @Res() response: Response, @Req() req: any) {
    const user = this.getAuthenticatedUser(req);
    const pdf = await this.salesService.renderPdf(invoiceNumber, false, false, user.pharmacyId);
    response.type('application/pdf').setHeader('Content-Disposition', `inline; filename="${invoiceNumber}.pdf"`).send(pdf);
  }

  @Get('invoice/:invoiceNumber/duplicata/html')
  @RequirePermission('vente.creer')
  async duplicateDocumentHtml(@Param('invoiceNumber') invoiceNumber: string, @Res() response: Response, @Req() req: any) {
    const user = this.getAuthenticatedUser(req);
    const html = await this.salesService.renderDocument(invoiceNumber, false, true, user.pharmacyId);
    response.type('text/html').send(html);
  }

  @Get('invoice/:invoiceNumber/duplicata/pdf')
  @RequirePermission('vente.creer')
  async duplicateDocument(@Param('invoiceNumber') invoiceNumber: string, @Res() response: Response, @Req() req: any) {
    const user = this.getAuthenticatedUser(req);
    const pdf = await this.salesService.renderPdf(invoiceNumber, false, true, user.pharmacyId);
    response.type('application/pdf').setHeader('Content-Disposition', `inline; filename="${invoiceNumber}-duplicata.pdf"`).send(pdf);
  }

  @Post('hold-cart')
  @RequirePermission('vente.creer')
  @ApiOperation({ summary: 'Mettre en attente un panier' })
  async holdCart(@Body() dto: HoldCartDto, @Req() req: any): Promise<HeldCart> {
    const user = this.getAuthenticatedUser(req);
    return this.salesService.holdCart(dto, user.pharmacyId, user.id);
  }

  @Get('held-carts/list')
  @RequirePermission('vente.creer')
  @ApiOperation({ summary: 'Lister les paniers en attente' })
  listHeldCarts(@Req() req: any): Promise<HeldCart[]> {
    const user = this.getAuthenticatedUser(req);
    return this.salesService.listHeldCarts(user.pharmacyId);
  }

  @Post('held-carts/:id/resume')
  @RequirePermission('vente.creer')
  @ApiOperation({ summary: 'Reprendre un panier mis en attente' })
  resumeHeldCart(@Param('id', ParseUUIDPipe) id: string, @Req() req: any): Promise<HeldCart> {
    const user = this.getAuthenticatedUser(req);
    return this.salesService.resumeHeldCart(id, user.pharmacyId);
  }

  @Post(':id/request-cancellation')
  @RequirePermission('vente.creer')
  @ApiOperation({ summary: 'Transmettre une demande d’annulation de vente au pharmacien (VTE-13, UC-05)' })
  async requestCancellation(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateCancellationRequestDto,
    @Req() req: any,
  ): Promise<any> {
    const user = this.getAuthenticatedUser(req);
    return this.salesService.requestCancellation(id, dto, user.id, user.pharmacyId);
  }

  @Get('cancellation-requests')
  @RequirePermission('vente.annuler')
  @ApiOperation({ summary: 'Lister les demandes d’annulation en attente de validation pharmacien' })
  async listCancellationRequests(@Req() req: any): Promise<any[]> {
    const user = this.getAuthenticatedUser(req);
    return this.salesService.listCancellationRequests(user.pharmacyId);
  }

  @Post('cancellation-requests/:requestId/approve')
  @RequirePermission('vente.annuler')
  async approveCancellationRequest(@Param('requestId', ParseUUIDPipe) requestId: string, @Req() req: any): Promise<Sale> {
    const user = this.getAuthenticatedUser(req);
    return this.salesService.approveCancellationRequest(
      requestId,
      user.id,
      user.pharmacyId,
    );
  }

  @Post('cancellation-requests/:requestId/reject')
  @RequirePermission('vente.annuler')
  async rejectCancellationRequest(@Param('requestId', ParseUUIDPipe) requestId: string, @Body() body: { reason: string }, @Req() req: any): Promise<any> {
    const user = this.getAuthenticatedUser(req);
    return this.salesService.rejectCancellationRequest(
      requestId,
      user.id,
      body?.reason?.trim() || 'Demande refusée par le pharmacien.',
      user.pharmacyId,
    );
  }

  @Patch(':id/cancel')
  @RequirePermission('vente.annuler')
  @ApiOperation({ summary: 'Annuler une vente avec motif' })
  async cancelSale(@Param('id', ParseUUIDPipe) id: string, @Body() dto: CancelSaleDto, @Req() req: any): Promise<Sale> {
    const user = this.getAuthenticatedUser(req);
    return this.salesService.cancelSale(id, dto, user.id, user.pharmacyId);
  }

  @Get(':id')
  @RequirePermission('vente.creer')
  @ApiOperation({ summary: 'Consulter le détail d’une facture par ID' })
  async getSale(@Param('id', ParseUUIDPipe) id: string, @Req() req: any): Promise<Sale> {
    const user = this.getAuthenticatedUser(req);
    return this.salesService.getSaleById(id, user.pharmacyId);
  }
}
