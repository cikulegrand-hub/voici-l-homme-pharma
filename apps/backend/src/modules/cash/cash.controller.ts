import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Patch,
  Query,
  Req,
  UseGuards,
  ParseUUIDPipe,
  UseInterceptors,
  UploadedFile,
  Res,
  NotFoundException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiOperation, ApiResponse, ApiQuery } from '@nestjs/swagger';
import { CashSession, ExchangeRate } from '@vhp/shared';
import { CashService, Expense } from './cash.service';
import {
  OpenCashSessionDto,
  CloseCashSessionDto,
  SetExchangeRateDto,
  CreateExpenseDto,
  ReverseExpenseDto,
  CreateExpenseCategoryDto,
} from './dto/cash.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { RequirePermission } from '../auth/decorators/auth.decorators';
import { ExpenseStorageService } from './expense-storage.service';
import { PrismaService } from '../prisma/prisma.service';

@ApiTags('Caisse & Gestion Financière (FIN)')
@Controller('cash')
@UseGuards(JwtAuthGuard, RolesGuard)
export class CashController {
  constructor(private readonly cashService: CashService, private readonly expenseStorage: ExpenseStorageService, private readonly prisma: PrismaService) {}

  // ---------- SESSIONS DE CAISSE (FIN-01, FIN-02, RG-12) ----------

  @Post('sessions/open')
  @ApiOperation({ summary: 'Ouvrir une session de caisse avec fonds de départ CDF/USD (FIN-01)' })
  @RequirePermission('caisse.ouvrir')
  async openSession(@Body() dto: OpenCashSessionDto, @Req() req: any): Promise<CashSession> {
    return this.cashService.openSession(dto, req.user.id, req.user.pharmacyId);
  }

  @Get('sessions/current')
  @ApiOperation({ summary: 'Consulter la session de caisse en cours de l’utilisateur' })
  @RequirePermission('finances.consulter')
  async getCurrentSession(@Req() req: any): Promise<CashSession | null> {
    return this.cashService.getCurrentSession(req.user.id);
  }

  @Get('sessions/active')
  @RequirePermission('finances.consulter')
  async getActiveSession(@Req() req: any): Promise<CashSession | null> { return this.cashService.getCurrentSession(req.user.id); }

  @Patch('sessions/:id/close')
  @ApiOperation({ summary: 'Clôturer la caisse avec réconciliation des écarts obligatoirement justifiée (FIN-02, RG-12)' })
  @RequirePermission('caisse.cloturer')
async closeSession(@Param('id', ParseUUIDPipe) id: string, @Body() dto: CloseCashSessionDto, @Req() req: any): Promise<CashSession> {
    return this.cashService.closeSession(id, dto, req.user.id);
  }

  // ---------- TAUX DE CHANGE CDF / USD (FIN-04, RG-08) ----------

  @Get('exchange-rates/active')
  @ApiOperation({ summary: 'Consulter le taux de change officiel actif (FIN-04, RG-08)' })
  @ApiQuery({ name: 'at', required: false, description: 'Date ISO pour consulter le taux en vigueur à cet instant' })
  async getActiveRate(@Query('at') at?: string): Promise<ExchangeRate> {
    return this.cashService.getActiveExchangeRate(undefined, at);
  }

  @Post('exchange-rates')
  @RequirePermission('taux.modifier')
  @ApiOperation({ summary: 'Saisir un nouveau taux de change CDF / USD (FIN-04, RG-08)' })
  async setExchangeRate(@Body() dto: SetExchangeRateDto, @Req() req: any): Promise<ExchangeRate> {
    const userId = req.user?.id || 'pharmacien-user-id';
    const pharmacyId = req.user?.pharmacyId || '11111111-1111-1111-1111-111111111111';
    return this.cashService.setExchangeRate(dto, userId, pharmacyId);
  }

  @Get('exchange-rates/history')
  @ApiOperation({ summary: 'Historique des taux de change saisis' })
  async getRatesHistory(): Promise<ExchangeRate[]> {
    return this.cashService.getExchangeRatesHistory();
  }

  // ---------- DÉPENSES OFFICINE (FIN-03) ----------

  @Post('expenses')
  @ApiOperation({ summary: 'Enregistrer une dépense avec catégorie (FIN-03)' })
  @RequirePermission('depense.creer')
  async createExpense(@Body() dto: CreateExpenseDto, @Req() req: any): Promise<Expense> {
    return this.cashService.createExpense(dto, req.user.id, req.user.pharmacyId);
  }

  @Post('expenses/:id/reverse')
  @RequirePermission('depense.creer')
  async reverseExpense(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ReverseExpenseDto, @Req() req: any): Promise<Expense> {
    return this.cashService.reverseExpense(id, dto, req.user.id, req.user.pharmacyId);
  }

  @Post('expenses/:id/receipt')
  @UseInterceptors(FileInterceptor('file'))
  @RequirePermission('depense.creer')
  async uploadReceipt(@Param('id', ParseUUIDPipe) id: string, @UploadedFile() file: Express.Multer.File, @Req() req: any) {
    const expense = await this.prisma.expenses.findFirst({ where: { id, pharmacy_id: req.user.pharmacyId } });
    if (!expense) throw new NotFoundException('Dépense introuvable.');
    const path = await this.expenseStorage.save(id, file);
    await this.prisma.expenses.update({ where: { id }, data: { receipt_file_path: path } });
    return { expenseId: id, attached: true };
  }

  @Get('expenses/:id/receipt')
  @RequirePermission('finances.consulter')
  async downloadReceipt(@Param('id', ParseUUIDPipe) id: string, @Req() req: any, @Res() res: any) {
    const expense = await this.prisma.expenses.findFirst({ where: { id, pharmacy_id: req.user.pharmacyId } });
    if (!expense?.receipt_file_path) throw new NotFoundException('Pièce jointe introuvable.');
    const file = await this.expenseStorage.read(expense.receipt_file_path); res.type('application/octet-stream').send(file);
  }

  @Get('expenses')
  @ApiOperation({ summary: 'Lister les dépenses de l’officine' })
  @RequirePermission('finances.consulter')
  async listExpenses(@Req() req: any, @Query('from') from?: string, @Query('to') to?: string, @Query('category') category?: string): Promise<Expense[]> {
    return this.cashService.listExpenses(req.user.pharmacyId, from, to, category);
  }

  @Get('expense-categories')
  @RequirePermission('finances.consulter')
  async listExpenseCategories(@Req() req: any) { return this.cashService.listExpenseCategories(req.user.pharmacyId); }

  @Post('expense-categories')
  @RequirePermission('depense.creer')
  async createExpenseCategory(@Body() dto: CreateExpenseCategoryDto, @Req() req: any) { return this.cashService.createExpenseCategory(dto, req.user.pharmacyId); }

  @Get('payment-summary')
  @RequirePermission('finances.consulter')
  async paymentSummary(@Req() req: any, @Query('from') from?: string, @Query('to') to?: string) { return this.cashService.getPaymentSummary(req.user.pharmacyId, from, to); }

  @Get('alerts/variances')
  @RequirePermission('finances.consulter')
  async varianceAlerts(@Req() req: any) { return this.cashService.getVarianceAlerts(req.user.pharmacyId); }

  @Get('profitability')
  @RequirePermission('rapports.consulter')
  async profitability(@Req() req: any, @Query('from') from?: string, @Query('to') to?: string) { return this.cashService.getProfitability(req.user.pharmacyId, from, to); }

  // ---------- BALANCE ÂGÉE DES CRÉANCES (FIN-06) ----------

  @Get('receivables-aging')
  @RequirePermission('finances.consulter')
  @ApiOperation({ summary: 'Balance âgée des créances clients 0-30, 31-60, >60 jours (FIN-06)' })
  async getAgingBalance(@Req() req: any, @Query('asOf') asOf?: string): Promise<any> {
    return this.cashService.getReceivablesAging(req.user.pharmacyId, asOf ? new Date(asOf) : undefined);
  }
}
