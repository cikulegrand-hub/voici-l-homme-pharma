import {
  Injectable,
  BadRequestException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { CashSession, ExchangeRate } from '@vhp/shared';
import {
  OpenCashSessionDto,
  CloseCashSessionDto,
  SetExchangeRateDto,
  CreateExpenseDto,
  ReverseExpenseDto,
  CreateExpenseCategoryDto,
  CreateCashMovementDto,
} from './dto/cash.dto';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { ExchangeRateResolver } from './exchange-rate.resolver';

export interface Expense {
  id: string;
  pharmacyId: string;
  description: string;
  category: string;
  amountCdf: number;
  amountUsd: number;
  receiptPath?: string;
  userId: string;
  createdAt: string;
  reversedAt?: string;
  reversalOfId?: string;
}

@Injectable()
export class CashService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly exchangeRateResolver: ExchangeRateResolver,
  ) {}

  /* Legacy initializer removed: rates must be created explicitly. */
  /*
              notes: 'Taux initial de référence (FIN-04)',
            },
          });
        }
      }
    } catch {
      // Ignorer si la base est occupée
    }
  }

  */
  // ---------- FIN-04 & RG-08 : Taux de change CDF / USD ----------

  async getActiveExchangeRate(pharmacyId: string, at?: string): Promise<ExchangeRate> {
    const selected = await this.exchangeRateResolver.getRateAt(pharmacyId, at ? new Date(at) : new Date());
    const rate = await this.prisma.exchange_rates.findUnique({
      where: { id: selected.id },
      include: {
        users: {
          select: { full_name: true, username: true },
        },
      },
    });

    if (!rate) {
      throw new NotFoundException({
        code: 'EXCHANGE_RATE_MISSING',
        message:
          'Aucun taux de change actif défini. La saisie du taux officiel du jour CDF/USD est obligatoire avant toute opération (FIN-04, RG-08).',
      });
    }

    return {
      id: rate.id,
      pharmacyId: rate.pharmacy_id,
      baseCurrency: rate.base_currency as any,
      targetCurrency: rate.target_currency as any,
      rate: Number(rate.rate),
      effectiveDate: rate.effective_date.toISOString(),
      notes: rate.notes ?? undefined,
      createdByName: rate.users ? rate.users.full_name || rate.users.username : undefined,
    };
  }

  private async resolveValidUserId(userId?: string): Promise<string> {
    const isUuid = userId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId);
    if (isUuid) {
      const user = await this.prisma.users.findUnique({ where: { id: userId } });
      if (user) return user.id;
    }
    if (userId) {
      const userByName = await this.prisma.users.findFirst({ where: { username: userId } });
      if (userByName) return userByName.id;
    }
    throw new UnauthorizedException('Utilisateur non authentifié ou session invalide.');
  }

  async setExchangeRate(dto: SetExchangeRateDto, userId: string, pharmacyId: string): Promise<ExchangeRate> {
    const validUserId = await this.resolveValidUserId(userId);

    const previousRate = await this.prisma.exchange_rates.findFirst({
      where: { pharmacy_id: pharmacyId },
      orderBy: { effective_date: 'desc' },
    });

    const created = await this.prisma.exchange_rates.create({
      data: {
        pharmacy_id: pharmacyId,
        created_by: validUserId,
        base_currency: 'USD',
        target_currency: 'CDF',
        rate: dto.rate,
        effective_date: new Date(dto.effectiveDate),
        notes: dto.notes,
      },
    });

    await this.auditService.logAction({
      userId: validUserId,
      userName: 'Pharmacien',
      action: 'TAUX_DE_CHANGE_MODIFIE',
      entityName: 'EXCHANGE_RATE',
      entityId: created.id,
      oldValues: previousRate ? { rate: Number(previousRate.rate), notes: previousRate.notes } : undefined,
      newValues: { rate: dto.rate, notes: dto.notes },
    });

    return {
      id: created.id,
      pharmacyId: created.pharmacy_id,
      baseCurrency: created.base_currency as any,
      targetCurrency: created.target_currency as any,
      rate: Number(created.rate),
      effectiveDate: created.effective_date.toISOString(),
      notes: created.notes ?? undefined,
    };
  }

  async getExchangeRatesHistory(pharmacyId: string): Promise<ExchangeRate[]> {
    const rates = await this.prisma.exchange_rates.findMany({
      where: { pharmacy_id: pharmacyId },
      orderBy: { effective_date: 'desc' },
      include: {
        users: {
          select: { full_name: true, username: true },
        },
      },
    });

    return rates.map((r) => ({
      id: r.id,
      pharmacyId: r.pharmacy_id,
      baseCurrency: r.base_currency as any,
      targetCurrency: r.target_currency as any,
      rate: Number(r.rate),
      effectiveDate: r.effective_date.toISOString(),
      notes: r.notes ?? undefined,
      createdByName: r.users ? r.users.full_name || r.users.username : undefined,
    }));
  }

  // ---------- FIN-01 : Ouverture session de caisse ----------

  async openSession(dto: OpenCashSessionDto, userId: string, pharmacyId: string): Promise<CashSession> {
    const validUserId = await this.resolveValidUserId(userId);

    const activeSession = await this.prisma.cash_sessions.findFirst({
      where: {
        user_id: validUserId,
        status: 'OUVERTE',
      },
    });

    if (activeSession) {
      throw new BadRequestException(
        'Vous avez déjà une session de caisse ouverte. Vous devez la clôturer avant d’en ouvrir une nouvelle (RG-12).',
      );
    }

    const session = await this.prisma.cash_sessions.create({
      data: {
        pharmacy_id: pharmacyId,
        user_id: validUserId,
        initial_float_cdf: dto.initialFloatCdf,
        initial_float_usd: dto.initialFloatUsd,
        expected_amount_cdf: dto.initialFloatCdf,
        expected_amount_usd: dto.initialFloatUsd,
        status: 'OUVERTE',
      },
    });

    await this.auditService.logAction({
      userId: validUserId,
      userName: 'Caissier',
      action: 'OUVERTURE_SESSION_CAISSE',
      entityName: 'CASH_SESSION',
      entityId: session.id,
      newValues: { initialFloatCdf: dto.initialFloatCdf, initialFloatUsd: dto.initialFloatUsd },
    });

    return this.mapToCashSession(session);
  }

  async getCurrentSession(userId: string): Promise<CashSession | null> {
    const validUserId = await this.resolveValidUserId(userId);

    const session = await this.prisma.cash_sessions.findFirst({
      where: {
        user_id: validUserId,
        status: 'OUVERTE',
      },
    });

    return session ? this.mapToCashSession(session) : null;
  }

  async createMovement(sessionId: string, dto: CreateCashMovementDto, userId: string, pharmacyId: string) {
    const validUserId = await this.resolveValidUserId(userId);
    const amountCdf = Number(dto.amountCdf || 0);
    const amountUsd = Number(dto.amountUsd || 0);
    if (amountCdf <= 0 && amountUsd <= 0) throw new BadRequestException('Un montant CDF ou USD strictement positif est requis.');
    const session = await this.prisma.cash_sessions.findFirst({ where: { id: sessionId, pharmacy_id: pharmacyId, user_id: validUserId, status: 'OUVERTE' } });
    if (!session) throw new NotFoundException('Session de caisse ouverte introuvable.');
    const rate = await this.exchangeRateResolver.getRateAt(pharmacyId, new Date());
    const sign = dto.type === 'APPORT' ? 1 : -1;
    const movement = await this.prisma.$transaction(async (tx) => {
      const created = await tx.cash_movements.create({ data: {
        pharmacy_id: pharmacyId, cash_session_id: sessionId, user_id: validUserId,
        type: dto.type, amount_cdf: amountCdf, amount_usd: amountUsd,
        exchange_rate_id: rate.id, exchange_rate_applied: rate.rate, reason: dto.reason.trim(),
      }});
      await tx.cash_sessions.update({ where: { id: sessionId }, data: {
        expected_amount_cdf: { increment: sign * amountCdf }, expected_amount_usd: { increment: sign * amountUsd },
      }});
      return created;
    });
    await this.auditService.logAction({ userId: validUserId, userName: 'Caissier', action: `MOUVEMENT_CAISSE_${dto.type}`, entityName: 'CASH_MOVEMENT', entityId: movement.id, newValues: { type: dto.type, amountCdf, amountUsd, reason: dto.reason } });
    return { id: movement.id, sessionId, type: movement.type, amountCdf, amountUsd, reason: movement.reason, createdAt: movement.created_at.toISOString() };
  }

  async listMovements(sessionId: string, pharmacyId: string) {
    const rows = await this.prisma.cash_movements.findMany({ where: { cash_session_id: sessionId, pharmacy_id: pharmacyId }, orderBy: { created_at: 'desc' } });
    return rows.map((row) => ({ id: row.id, sessionId: row.cash_session_id, type: row.type, amountCdf: Number(row.amount_cdf), amountUsd: Number(row.amount_usd), reason: row.reason, createdAt: row.created_at.toISOString() }));
  }

  // Ajout d'encaissement à la session en cours
  async recordSaleIncomeToActiveSession(userId: string, amountCdf: number, amountUsd: number) {
    const current = await this.getCurrentSession(userId);
    if (current) {
      await this.prisma.cash_sessions.update({
        where: { id: current.id },
        data: {
          expected_amount_cdf: { increment: amountCdf },
          expected_amount_usd: { increment: amountUsd },
        },
      });
    }
  }

  // ---------- FIN-02 & RG-12 : Clôture de caisse avec arrêté d'écart ----------

  async closeSession(sessionId: string, dto: CloseCashSessionDto, userId?: string): Promise<CashSession> {
    const session = await this.prisma.cash_sessions.findUnique({
      where: { id: sessionId },
      include: { sales: { where: { status: { in: ['VALIDEE', 'PARTIELLEMENT_PAYEE', 'AVOIR', 'RETOURNEE'] } }, include: { sale_payments: true, credit_notes: true } }, customer_payments: true, expenses: true, cash_movements: true },
    });

    if (!session) throw new NotFoundException('Session de caisse introuvable.');
    if (userId && session.user_id !== userId) {
      throw new BadRequestException('Seul le caissier propriétaire peut clôturer sa session.');
    }
    if (session.status !== 'OUVERTE') {
      throw new BadRequestException('Cette session de caisse est déjà clôturée.');
    }

    let totalCashReceivedCdf = 0;
    let totalCashReceivedUsd = 0;
    let totalChangeGivenCdf = 0;

    for (const sale of session.sales) {
      const cashPayments = sale.sale_payments.filter((p: any) => p.payment_method === 'ESPECES');
      if (cashPayments.length > 0) {
        for (const p of cashPayments) {
          if (p.currency === 'CDF') {
            totalCashReceivedCdf += Number(p.amount_paid);
          } else if (p.currency === 'USD') {
            totalCashReceivedUsd += Number(p.amount_paid);
          }
        }
        // Déduction exacte du rendu de monnaie en CDF issu du tiroir-caisse
        totalChangeGivenCdf += cashPayments.reduce((sum: number, p: any) => sum + Number(p.change_given_cdf || 0), 0);
      }
    }

    const salesCdf = totalCashReceivedCdf - totalChangeGivenCdf;
    const salesUsd = totalCashReceivedUsd;
    const receivablesCdf = session.customer_payments.filter((p: any) => p.payment_method === 'ESPECES' && p.currency === 'CDF').reduce((s: number, p: any) => s + Number(p.amount_paid_cdf), 0);
    const receivablesUsd = session.customer_payments.filter((p: any) => p.payment_method === 'ESPECES' && p.currency === 'USD').reduce((s: number, p: any) => s + Number(p.amount_paid ?? 0), 0);
    const expensesCdf = session.expenses.reduce((s: number, e: any) => s + Number(e.amount_cdf), 0);
    const expensesUsd = session.expenses.reduce((s: number, e: any) => s + Number(e.amount_usd), 0);
    const creditNotes = session.sales.flatMap((sale: any) => sale.credit_notes || []);
    const creditNotesCdf = creditNotes.reduce((s: number, n: any) => s + Number(n.total_amount_cdf), 0);
    const creditNotesUsd = creditNotes.reduce((s: number, n: any) => s + Number(n.total_amount_usd), 0);
    const movementCdf = session.cash_movements.reduce((s: number, m: any) => s + (m.type === 'APPORT' ? 1 : -1) * Number(m.amount_cdf), 0);
    const movementUsd = session.cash_movements.reduce((s: number, m: any) => s + (m.type === 'APPORT' ? 1 : -1) * Number(m.amount_usd), 0);
    const expectedCdf = Number(session.initial_float_cdf) + salesCdf + receivablesCdf - expensesCdf - creditNotesCdf + movementCdf;
    const expectedUsd = Number(session.initial_float_usd) + salesUsd + receivablesUsd - expensesUsd - creditNotesUsd + movementUsd;

    const varianceCdf = dto.countedAmountCdf - expectedCdf;
    const varianceUsd = dto.countedAmountUsd - expectedUsd;

    if ((varianceCdf !== 0 || varianceUsd !== 0) && (!dto.varianceReason || dto.varianceReason.trim() === '')) {
      throw new BadRequestException(
        `Écart de caisse détecté (${varianceCdf} CDF / ${varianceUsd} USD). Une justification obligatoire doit être fournie pour clôturer (FIN-02, RG-12).`,
      );
    }

    const closed = await this.prisma.cash_sessions.update({
      where: { id: sessionId },
      data: {
        closed_at: new Date(),
        counted_amount_cdf: dto.countedAmountCdf,
        counted_amount_usd: dto.countedAmountUsd,
        variance_cdf: varianceCdf,
        variance_usd: varianceUsd,
        variance_reason: dto.varianceReason,
        status: 'CLOTUREE',
      },
    });

    // Libération et annulation automatique des paniers en attente du vendeur (Règle V2 arbitrage)
    await this.prisma.$executeRaw`
      UPDATE held_carts 
      SET status = 'ANNULE' 
      WHERE pharmacy_id = ${session.pharmacy_id}::uuid 
        AND user_id = ${session.user_id}::uuid 
        AND status = 'ACTIF'
    `.catch(() => {});

    await this.auditService.logAction({
      userId: userId || session.user_id,
      userName: 'Caissier',
      action: 'CLOTURE_SESSION_CAISSE',
      entityName: 'CASH_SESSION',
      entityId: session.id,
      newValues: {
        expectedCdf,
        countedCdf: dto.countedAmountCdf,
        varianceCdf,
        varianceReason: dto.varianceReason,
      },
    });

    if (varianceCdf !== 0 || varianceUsd !== 0) {
      await this.auditService.logAction({
        userId: userId || session.user_id, userName: 'Caissier', action: 'ALERTE_ECART_CAISSE',
        entityName: 'CASH_SESSION', entityId: session.id,
        newValues: { varianceCdf, varianceUsd, reason: dto.varianceReason },
      });
    }

    return this.mapToCashSession(closed);
  }

  // ---------- FIN-03 : Dépenses de l'officine ----------

  async createExpense(dto: CreateExpenseDto, userId: string, pharmacyId: string): Promise<Expense> {
    const validUserId = await this.resolveValidUserId(userId);

    // Trouver ou créer la catégorie de dépense
    let cat = await this.prisma.expense_categories.findFirst({
      where: { pharmacy_id: pharmacyId, name: dto.category },
    });
    if (!cat) {
      cat = await this.prisma.expense_categories.create({
        data: {
          pharmacy_id: pharmacyId,
          name: dto.category,
        },
      });
    }

    const activeSession = await this.prisma.cash_sessions.findFirst({ where: { user_id: validUserId, pharmacy_id: pharmacyId, status: 'OUVERTE' } });
    if (!activeSession) throw new BadRequestException('Ouvrez une session de caisse avant d’enregistrer une dépense.');
    const created = await this.prisma.$transaction(async (tx) => {
      const expense = await tx.expenses.create({
      data: {
        pharmacy_id: pharmacyId,
        user_id: validUserId,
        category_id: cat.id,
        amount_cdf: dto.amountCdf,
        amount_usd: dto.amountUsd ?? 0,
        description: dto.description,
        receipt_file_path: dto.receiptPath,
        cash_session_id: activeSession.id,
      },
      });
      await tx.cash_sessions.update({ where: { id: activeSession.id }, data: {
        expected_amount_cdf: { decrement: dto.amountCdf }, expected_amount_usd: { decrement: dto.amountUsd ?? 0 },
      }});
      return expense;
    });

    await this.auditService.logAction({
      userId: validUserId,
      userName: 'Utilisateur',
      action: 'DEPENSE_CREEE',
      entityName: 'EXPENSE',
      entityId: created.id,
      newValues: { description: created.description, amountCdf: Number(created.amount_cdf), category: dto.category },
    });

    return {
      id: created.id,
      pharmacyId: created.pharmacy_id,
      description: created.description,
      category: dto.category,
      amountCdf: Number(created.amount_cdf),
      amountUsd: Number(created.amount_usd),
      receiptPath: created.receipt_file_path ?? undefined,
      userId: created.user_id,
      createdAt: created.created_at.toISOString(),
    };
  }

  async listExpenses(pharmacyId = '11111111-1111-1111-1111-111111111111', from?: string, to?: string, category?: string): Promise<Expense[]> {
    const where: any = { pharmacy_id: pharmacyId };
    if (from || to) where.created_at = { ...(from ? { gte: new Date(from) } : {}), ...(to ? { lte: new Date(to) } : {}) };
    if (category) where.expense_categories = { name: category };
    const list = await this.prisma.expenses.findMany({
      where,
      include: { expense_categories: true },
      orderBy: { created_at: 'desc' },
    });

    return list.map((e) => ({
      id: e.id,
      pharmacyId: e.pharmacy_id,
      description: e.description,
      category: e.expense_categories.name,
      amountCdf: Number(e.amount_cdf),
      amountUsd: Number(e.amount_usd),
      receiptPath: e.receipt_file_path ?? undefined,
      userId: e.user_id,
      createdAt: e.created_at.toISOString(),
      reversedAt: e.reversed_at ? e.reversed_at.toISOString() : undefined,
      reversalOfId: e.reversal_of_id ?? undefined,
    }));
  }

  async listExpenseCategories(pharmacyId: string) {
    return this.prisma.expense_categories.findMany({ where: { pharmacy_id: pharmacyId }, orderBy: { name: 'asc' } });
  }

  async createExpenseCategory(dto: CreateExpenseCategoryDto, pharmacyId: string) {
    return this.prisma.expense_categories.upsert({ where: { pharmacy_id_name: { pharmacy_id: pharmacyId, name: dto.name.trim() } }, update: {}, create: { pharmacy_id: pharmacyId, name: dto.name.trim() } });
  }

  async reverseExpense(expenseId: string, dto: ReverseExpenseDto, userId: string, pharmacyId: string): Promise<Expense> {
    const validUserId = await this.resolveValidUserId(userId);
    const original = await this.prisma.expenses.findFirst({ where: { id: expenseId, pharmacy_id: pharmacyId, reversed_at: null }, include: { expense_categories: true } });
    if (!original) throw new NotFoundException('Dépense introuvable ou déjà contre-passée.');
    const session = await this.prisma.cash_sessions.findFirst({ where: { user_id: validUserId, pharmacy_id: pharmacyId, status: 'OUVERTE' } });
    if (!session) throw new BadRequestException('Une session de caisse ouverte est requise pour contre-passer une dépense.');
    const reversal = await this.prisma.$transaction(async (tx) => {
      const row = await tx.expenses.create({ data: { pharmacy_id: pharmacyId, category_id: original.category_id, cash_session_id: session.id, user_id: validUserId, description: `Contre-passation: ${original.description}`, amount_cdf: -Number(original.amount_cdf), amount_usd: -Number(original.amount_usd), receipt_file_path: original.receipt_file_path, reversal_of_id: original.id, reversal_reason: dto.reason } });
      await tx.expenses.update({ where: { id: original.id }, data: { reversed_at: new Date(), reversal_reason: dto.reason } });
      await tx.cash_sessions.update({ where: { id: session.id }, data: { expected_amount_cdf: { increment: Number(original.amount_cdf) }, expected_amount_usd: { increment: Number(original.amount_usd) } } });
      return row;
    });
    return { id: reversal.id, pharmacyId, description: reversal.description, category: original.expense_categories.name, amountCdf: Number(reversal.amount_cdf), amountUsd: Number(reversal.amount_usd), receiptPath: reversal.receipt_file_path ?? undefined, userId: reversal.user_id, createdAt: reversal.created_at.toISOString(), reversalOfId: reversal.reversal_of_id ?? undefined };
  }

  async getPaymentSummary(pharmacyId: string, from?: string, to?: string) {
    const created_at = (from || to) ? { ...(from ? { gte: new Date(from) } : {}), ...(to ? { lte: new Date(to) } : {}) } : undefined;
    const payments = await this.prisma.sale_payments.findMany({ where: { sales: { pharmacy_id: pharmacyId, status: 'VALIDEE', ...(created_at ? { created_at } : {}) } } });
    const receivablePayments = await this.prisma.customer_payments.findMany({ where: { pharmacy_id: pharmacyId, ...(created_at ? { created_at } : {}) } });
    const groups = new Map<string, { paymentMethod: string; currency: string; amount: number; count: number }>();
    for (const p of payments) {
      if (p.payment_method === 'CREDIT_CLIENT') continue;
      const key = `${p.payment_method}:${p.currency}`;
      const row = groups.get(key) || { paymentMethod: p.payment_method, currency: p.currency, amount: 0, count: 0 };
      row.amount += Number(p.amount_paid); row.count++; groups.set(key, row);
    }
    for (const p of receivablePayments) {
      const key = `${p.payment_method}:${p.currency}`;
      const row = groups.get(key) || { paymentMethod: p.payment_method, currency: p.currency, amount: 0, count: 0 };
      row.amount += Number(p.amount_paid ?? p.amount_paid_cdf); row.count++; groups.set(key, row);
    }
    return Array.from(groups.values());
  }

  async getVarianceAlerts(pharmacyId: string) {
    const logs = await this.prisma.audit_logs.findMany({ where: { pharmacy_id: pharmacyId, action: 'ALERTE_ECART_CAISSE' }, orderBy: { created_at: 'desc' }, take: 50 });
    return logs.map((log: any) => ({ id: log.id, sessionId: log.entity_id, createdAt: log.created_at.toISOString(), ...(log.new_values as object || {}) }));
  }

  // ---------- FIN-06 : Échéancier et balance âgée des créances (0-30, 31-60, >60j) ----------

  getAgingBalance(customersWithDebts: { id: string; name: string; currentBalanceCdf: number; daysOverdue: number }[]) {
    let bracket0To30 = 0;
    let bracket31To60 = 0;
    let bracketOver60 = 0;

    for (const c of customersWithDebts) {
      if (c.daysOverdue <= 30) {
        bracket0To30 += c.currentBalanceCdf;
      } else if (c.daysOverdue <= 60) {
        bracket31To60 += c.currentBalanceCdf;
      } else {
        bracketOver60 += c.currentBalanceCdf;
      }
    }

    return {
      bracket0To30Cdf: bracket0To30,
      bracket31To60Cdf: bracket31To60,
      bracketOver60Cdf: bracketOver60,
      totalReceivablesCdf: bracket0To30 + bracket31To60 + bracketOver60,
      details: customersWithDebts,
    };
  }

  async getReceivablesAging(pharmacyId: string, asOf = new Date()) {
    const invoices = await this.prisma.sales.findMany({ where: { pharmacy_id: pharmacyId, status: 'VALIDEE', customer_id: { not: null }, sale_payments: { some: { payment_method: 'CREDIT_CLIENT' } } }, include: { customers: true, sale_payments: true, customer_payment_allocations: true }, orderBy: { created_at: 'asc' } });
    const details = invoices.map((sale) => {
      const debt = sale.sale_payments.filter((p) => p.payment_method === 'CREDIT_CLIENT').reduce((s, p) => s + Number(p.amount_in_cdf), 0) - sale.customer_payment_allocations.reduce((s, a) => s + Number(a.amount_cdf), 0);
      const daysOverdue = Math.max(0, Math.floor((asOf.getTime() - sale.created_at.getTime()) / 86400000));
      return debt > 0 ? { id: sale.customer_id!, name: sale.customers?.full_name || 'Client', invoiceNumber: sale.invoice_number, currentBalanceCdf: debt, daysOverdue } : null;
    }).filter(Boolean) as any[];
    return this.getAgingBalance(details);
  }

  // ---------- FIN-07 & FIN-08 : Marge brute et Résultat estimé ----------

  async getFinancialSummary(salesRevenueCdf: number, costOfGoodsCdf: number, pharmacyId = '11111111-1111-1111-1111-111111111111') {
    const expenses = await this.prisma.expenses.findMany({
      where: { pharmacy_id: pharmacyId },
    });
    const totalExpensesCdf = expenses.reduce((sum, e) => sum + Number(e.amount_cdf), 0);
    const grossMarginCdf = salesRevenueCdf - costOfGoodsCdf;
    const marginRate = salesRevenueCdf > 0 ? (grossMarginCdf / salesRevenueCdf) * 100 : 0;
    const netEstimatedResultCdf = grossMarginCdf - totalExpensesCdf;

    return {
      salesRevenueCdf,
      costOfGoodsCdf,
      grossMarginCdf,
      marginRate: Number(marginRate.toFixed(2)),
      totalExpensesCdf,
      netEstimatedResultCdf,
    };
  }

  async getProfitability(pharmacyId: string, from?: string, to?: string) {
    const created_at = (from || to) ? { ...(from ? { gte: new Date(from) } : {}), ...(to ? { lte: new Date(to) } : {}) } : undefined;
    const lines = await this.prisma.sale_items.findMany({ where: { sales: { pharmacy_id: pharmacyId, status: 'VALIDEE', ...(created_at ? { created_at } : {}) } }, include: { products: { include: { product_categories: true } } } });
    const rows = new Map<string, any>();
    for (const line of lines) {
      const revenue = Number(line.total_line_cdf); const cost = line.quantity * Number(line.unit_cost_cump_cdf);
      const key = line.product_id; const item = rows.get(key) || { productId: key, product: line.products.name, category: line.products.product_categories?.name || 'Sans catégorie', revenueCdf: 0, costCdf: 0, grossMarginCdf: 0 };
      item.revenueCdf += revenue; item.costCdf += cost; item.grossMarginCdf += revenue - cost; rows.set(key, item);
    }
    const products = Array.from(rows.values());
    const totals = products.reduce((a, p) => ({ revenueCdf: a.revenueCdf + p.revenueCdf, costCdf: a.costCdf + p.costCdf, grossMarginCdf: a.grossMarginCdf + p.grossMarginCdf }), { revenueCdf: 0, costCdf: 0, grossMarginCdf: 0 });
    const expenses = await this.listExpenses(pharmacyId, from, to); const totalExpensesCdf = expenses.reduce((s, e) => s + e.amountCdf, 0);
    return { products, ...totals, totalExpensesCdf, estimatedResultCdf: totals.grossMarginCdf - totalExpensesCdf };
  }

  private mapToCashSession(dbSession: any): CashSession {
    return {
      id: dbSession.id,
      userId: dbSession.user_id,
      openedAt: dbSession.opened_at.toISOString(),
      closedAt: dbSession.closed_at ? dbSession.closed_at.toISOString() : undefined,
      initialFloatCdf: Number(dbSession.initial_float_cdf),
      initialFloatUsd: Number(dbSession.initial_float_usd),
      expectedAmountCdf: Number(dbSession.expected_amount_cdf ?? 0),
      expectedAmountUsd: Number(dbSession.expected_amount_usd ?? 0),
      countedAmountCdf: dbSession.counted_amount_cdf != null ? Number(dbSession.counted_amount_cdf) : undefined,
      countedAmountUsd: dbSession.counted_amount_usd != null ? Number(dbSession.counted_amount_usd) : undefined,
      varianceCdf: dbSession.variance_cdf != null ? Number(dbSession.variance_cdf) : undefined,
      varianceUsd: dbSession.variance_usd != null ? Number(dbSession.variance_usd) : undefined,
      varianceReason: dbSession.variance_reason ?? undefined,
      status: dbSession.status,
    };
  }
}
