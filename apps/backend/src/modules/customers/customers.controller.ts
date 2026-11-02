import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query, Req, Res, UnauthorizedException, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { Response } from 'express';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { RequirePermission } from '../auth/decorators/auth.decorators';
import { CustomersService } from './customers.service';
import { CreateCustomerDto, CreatePrescriptionDto, CustomerQueryDto, SettleDebtDto } from './dto/customers.dto';

@ApiTags('Fichier Clients & Ordonnances (CLI)')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('customers')
export class CustomersController {
  constructor(private readonly customersService: CustomersService) {}

  private actor(req: any) {
    const user = req?.user;
    if (!user?.id || !user?.pharmacyId || !user?.role) throw new UnauthorizedException('Utilisateur authentifié requis.');
    return { id: user.id, pharmacyId: user.pharmacyId, role: user.role, fullName: user.fullName };
  }

  @Post()
  @RequirePermission('client.creer', 'clients.creer', 'client.consulter', 'clients.consulter')
  @ApiOperation({ summary: 'Créer un client (CLI-01)' })
  createCustomer(@Body() dto: CreateCustomerDto, @Req() req: any) {
    return this.customersService.createCustomer(dto, this.actor(req));
  }

  @Get()
  @RequirePermission('client.consulter', 'clients.consulter')
  @ApiOperation({ summary: 'Lister/rechercher les clients avec solde calculé (CLI-01)' })
  listCustomers(@Query() query: CustomerQueryDto, @Req() req: any) {
    return this.customersService.listCustomers(this.actor(req), query);
  }

  @Get('privacy-notice')
  @RequirePermission('client.consulter', 'clients.consulter')
  @ApiOperation({ summary: 'Lire la mention de confidentialité (CLI-10)' })
  privacyNotice(@Req() req: any) {
    return this.customersService.getPrivacyNotice(this.actor(req));
  }

  @Post('prescriptions')
  @RequirePermission('ordonnance.creer', 'ordonnances.creer', 'client.consulter', 'clients.consulter')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 8 * 1024 * 1024, files: 1 } }))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Téléverser une ordonnance dans le stockage privé (CLI-05, CLI-06)' })
  createPrescription(@Body() dto: CreatePrescriptionDto, @UploadedFile() file: Express.Multer.File, @Req() req: any) {
    return this.customersService.createPrescription(dto, file, this.actor(req));
  }

  @Get('prescriptions/:prescriptionId/signed-url')
  @RequirePermission('ordonnance.consulter', 'ordonnances.consulter', 'client.consulter', 'clients.consulter')
  @ApiOperation({ summary: 'Obtenir à la demande un lien signé temporaire, journalisé (CLI-06, RG-17)' })
  signedUrl(@Param('prescriptionId', ParseUUIDPipe) prescriptionId: string, @Req() req: any) {
    return this.customersService.getPrescriptionSignedUrl(prescriptionId, this.actor(req));
  }

  @Get('prescriptions/:prescriptionId/file')
  @RequirePermission('ordonnance.consulter', 'ordonnances.consulter', 'client.consulter', 'clients.consulter')
  @ApiOperation({ summary: 'Lire une image d’ordonnance locale via une requête authentifiée' })
  async file(@Param('prescriptionId', ParseUUIDPipe) prescriptionId: string, @Req() req: any, @Res() response: Response) {
    const result = await this.customersService.getPrescriptionFile(prescriptionId, this.actor(req));
    const extension = result.storageFilePath.split('.').pop()?.toLowerCase();
    response.type(extension === 'png' ? 'image/png' : extension === 'webp' ? 'image/webp' : 'image/jpeg').send(result.file);
  }

  @Get(':id/prescriptions')
  @RequirePermission('ordonnance.consulter', 'ordonnances.consulter', 'client.consulter', 'clients.consulter')
  @ApiOperation({ summary: 'Lister les métadonnées des ordonnances, sans URL (CLI-06)' })
  getCustomerPrescriptions(@Param('id', ParseUUIDPipe) id: string, @Req() req: any) {
    return this.customersService.getPrescriptionsByCustomer(id, this.actor(req));
  }

  @Get(':id/history')
  @RequirePermission('client.consulter', 'clients.consulter')
  @ApiOperation({ summary: 'Historique des achats et règlements client' })
  history(@Param('id', ParseUUIDPipe) id: string, @Req() req: any) {
    return this.customersService.getCustomerHistory(id, this.actor(req));
  }

  @Get(':id/statement')
  @RequirePermission('client.consulter', 'clients.consulter')
  @ApiOperation({ summary: 'Relevé de compte client' })
  getStatement(@Param('id', ParseUUIDPipe) id: string, @Req() req: any) {
    return this.customersService.getAccountStatement(id, this.actor(req));
  }

  @Patch(':id/settle-debt')
  @RequirePermission('client.paiement', 'clients.paiement', 'client.consulter', 'clients.consulter')
  @ApiOperation({ summary: 'Encaisser un règlement FIFO idempotent lié à la caisse (CLI-04)' })
  settleDebt(@Param('id', ParseUUIDPipe) id: string, @Body() dto: SettleDebtDto, @Req() req: any) {
    return this.customersService.settleDebt(id, dto, this.actor(req));
  }

  @Get(':id')
  @RequirePermission('client.consulter', 'clients.consulter')
  @ApiOperation({ summary: 'Consulter une fiche client' })
  getCustomer(@Param('id', ParseUUIDPipe) id: string, @Req() req: any) {
    return this.customersService.getCustomerById(id, this.actor(req));
  }
}
