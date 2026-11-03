import { BadRequestException, Injectable } from '@nestjs/common';
import { DashboardChartPoint, DashboardMetric, ReportFilters, ReportLink, ReportResult, ReportKey } from '@vhp/shared';
import { PrismaService } from '../prisma/prisma.service';
import { CashService } from '../cash/cash.service';
import { ReportFilterDto } from './dto/reports.dto';
import { getReportDefinition } from './reports.registry';
import { calculateGrossMargin, sumNetRevenue } from './reports-calculations';

const DEFAULT_PHARMACY_ID = '11111111-1111-1111-1111-111111111111';

interface MoneyPair {
  cdf: number;
  usd: number;
}

export interface DashboardSnapshot {
  filters: ReportFilters;
  metrics: DashboardMetric[];
  charts: { sales: DashboardChartPoint[]; bestSellers: DashboardChartPoint[] };
  generatedAt: string;
}

@Injectable()
export class ReportsQueryService {
  constructor(private readonly prisma: PrismaService, private readonly cashService: CashService) {}

  normalizeFilters(dto: ReportFilterDto = {}, pharmacyId = DEFAULT_PHARMACY_ID): ReportFilters & { pharmacyId: string } {
    const now = new Date();
    const period = dto.period ?? 'day';
    const to = dto.to ? new Date(dto.to) : now;
    const from = dto.from ? new Date(dto.from) : this.startOfPeriod(to, period);

    if (from > to) {
      throw new Error('La date de début doit être antérieure ou égale à la date de fin.');
    }

    if (dto.siteId && dto.siteId !== pharmacyId) {
      throw new BadRequestException('Le site demandé n’appartient pas à la pharmacie courante.');
    }

    return {
      pharmacyId,
      from: from.toISOString(),
      to: to.toISOString(),
      ...(dto.userId ? { userId: dto.userId } : {}),
      ...(dto.categoryId ? { categoryId: dto.categoryId } : {}),
      ...(dto.siteId ? { siteId: dto.siteId } : {}),
      ...(dto.currency ? { currency: dto.currency } : {}),
      page: dto.page ?? 1,
      limit: dto.limit ?? 50,
      sortBy: dto.sortBy ?? 'createdAt',
      sortDirection: dto.sortDirection ?? 'desc',
    };
  }

  async getDashboard(dto: ReportFilterDto = {}, pharmacyId = DEFAULT_PHARMACY_ID, role = 'ADMIN'): Promise<DashboardSnapshot> {
    const filters = this.normalizeFilters(dto, pharmacyId);
    const previous = this.previousPeriod(filters);
    const [currentRevenue, previousRevenue, margin, stock, outOfStock, nearExpiry, receivables, previousReceivables, cashVariance, averageBasket, rotation, salesChart, bestSellerReport] = await Promise.all([
      this.aggregateRevenue(filters),
      this.aggregateRevenue(previous),
      this.aggregateMargin(filters),
      this.aggregateStock(filters),
      this.countOutOfStock(filters),
      this.aggregateNearExpiry(filters),
      this.aggregateReceivables(filters),
      this.aggregateReceivables(previous),
      this.aggregateCashVariance(filters),
      this.aggregateAverageBasket(filters, previous),
      this.aggregateRotation(filters, previous),
      this.salesTrend(filters),
      this.bestSellers({ ...filters, page: 1, limit: 5 }),
    ]);

    const salesLink = (reportKey: ReportLink['reportKey']): ReportLink => ({
      reportKey,
      params: {
        from: filters.from,
        to: filters.to,
        ...(filters.userId ? { userId: filters.userId } : {}),
        ...(filters.categoryId ? { categoryId: filters.categoryId } : {}),
        ...(filters.siteId ? { siteId: filters.siteId } : {}),
        ...(filters.currency ? { currency: filters.currency } : {}),
      },
    });

    const moneyMetric = (key: string, values: MoneyPair, previousValues: MoneyPair, reportKey: ReportLink['reportKey']): DashboardMetric => ({
      key,
      valuesByCurrency: {
        CDF: { value: values.cdf, previousValue: previousValues.cdf, variationPercent: this.variation(values.cdf, previousValues.cdf) },
        USD: { value: values.usd, previousValue: previousValues.usd, variationPercent: this.variation(values.usd, previousValues.usd) },
      },
      reportLink: salesLink(reportKey),
    });

    const metrics: DashboardMetric[] = [
      moneyMetric('revenue', currentRevenue, previousRevenue, 'sales-journal'),
      moneyMetric('average-basket', averageBasket.current, averageBasket.previous, 'sales-journal'),
      moneyMetric('gross-margin', margin.current, margin.previous, 'sales-journal'),
      this.percentageMetric('margin-rate', currentRevenue.cdf ? (margin.current.cdf / currentRevenue.cdf) * 100 : 0, previousRevenue.cdf ? (margin.previous.cdf / previousRevenue.cdf) * 100 : 0, 'sales-journal', filters),
      this.percentageMetric('stock-rotation', rotation.current, rotation.previous, 'valued-inventory', filters),
      moneyMetric('stock-value', stock, stock, 'valued-inventory'),
      moneyMetric('near-expiry-value', nearExpiry, nearExpiry, 'expiries'),
      moneyMetric('receivables', receivables, previousReceivables, 'receivables'),
      moneyMetric('cash-variance', cashVariance, cashVariance, 'treasury'),
      { key: 'out-of-stock-rate', valuesByCurrency: { CDF: { value: outOfStock.rate, previousValue: outOfStock.rate, variationPercent: null } }, reportLink: salesLink('valued-inventory') },
    ];
    const allowedMetrics: Record<string, string[]> = { CAISSIER: ['revenue', 'average-basket', 'out-of-stock-rate'], STOCK: ['stock-rotation', 'stock-value', 'near-expiry-value', 'out-of-stock-rate'], GESTIONNAIRE: ['stock-rotation', 'stock-value', 'near-expiry-value', 'out-of-stock-rate'] };
    const visibleMetrics = allowedMetrics[role] ? metrics.filter((metric) => allowedMetrics[role].includes(metric.key)) : metrics;
    return {
      filters: this.stripInternalFilter(filters),
      metrics: visibleMetrics,
      charts: {
        sales: role === 'STOCK' || role === 'GESTIONNAIRE' ? [] : salesChart,
        bestSellers: role === 'STOCK' || role === 'GESTIONNAIRE' ? [] : (bestSellerReport.data as any[]).map((row) => ({ label: row.productName, value: row.quantity })),
      },
      generatedAt: new Date().toISOString(),
    };
  }

  private async aggregateAverageBasket(filters: ReportFilters & { pharmacyId: string }, previous: ReportFilters & { pharmacyId: string }): Promise<{ current: MoneyPair; previous: MoneyPair }> {
    const [currentRevenue, previousRevenue, currentCount, previousCount] = await Promise.all([
      this.aggregateRevenue(filters), this.aggregateRevenue(previous),
      this.prisma.sales.count({ where: this.saleWhere(filters) }), this.prisma.sales.count({ where: this.saleWhere(previous) }),
    ]);
    return {
      current: { cdf: currentCount ? currentRevenue.cdf / currentCount : 0, usd: currentCount ? currentRevenue.usd / currentCount : 0 },
      previous: { cdf: previousCount ? previousRevenue.cdf / previousCount : 0, usd: previousCount ? previousRevenue.usd / previousCount : 0 },
    };
  }

  private async aggregateRotation(filters: ReportFilters & { pharmacyId: string }, previous: ReportFilters & { pharmacyId: string }): Promise<{ current: number; previous: number }> {
    const [currentCost, previousCost, stock] = await Promise.all([this.costOfSales(filters), this.costOfSales(previous), this.aggregateStock(filters)]);
    return { current: stock.cdf > 0 ? Number((currentCost / stock.cdf).toFixed(4)) : 0, previous: stock.cdf > 0 ? Number((previousCost / stock.cdf).toFixed(4)) : 0 };
  }

  private async costOfSales(filters: ReportFilters & { pharmacyId: string }): Promise<number> {
    const rows = await this.prisma.sale_items.findMany({ where: { sales: this.saleWhere(filters) }, select: { quantity: true, unit_cost_cump_cdf: true } });
    return rows.reduce((sum, row) => sum + row.quantity * this.decimal(row.unit_cost_cump_cdf), 0);
  }

  private async salesTrend(filters: ReportFilters & { pharmacyId: string }): Promise<{ label: string; value: number }[]> {
    const rows = await this.prisma.sales.findMany({ where: this.saleWhere(filters), select: { created_at: true, total_amount_cdf: true } });
    const grouped = new Map<string, number>();
    for (const row of rows) {
      const label = row.created_at.toISOString().slice(0, 10);
      grouped.set(label, (grouped.get(label) || 0) + this.decimal(row.total_amount_cdf));
    }
    return [...grouped.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([label, value]) => ({ label, value }));
  }

  async getDetailedReport(reportKey: string, dto: ReportFilterDto = {}, pharmacyId = DEFAULT_PHARMACY_ID): Promise<ReportResult> {
    const definition = getReportDefinition(reportKey);
    if (!definition) throw new BadRequestException('Le rapport demandé n’est pas disponible.');

    const filters = this.normalizeFilters(dto, pharmacyId);
    switch (reportKey as ReportKey) {
      case 'sales-journal': return this.salesJournal(filters);
      case 'stock-movements': return this.stockMovements(filters);
      case 'stock-entries-exits': {
        const report = await this.stockMovements(filters);
        return { ...report, reportKey: 'stock-entries-exits' };
      }
      case 'valued-inventory': return this.valuedInventory(filters);
      case 'expiries': return this.expiries(filters);
      case 'expenses': return this.expenses(filters);
      case 'best-sellers': return this.bestSellers(filters);
      case 'receivables': return this.receivables(filters);
      case 'treasury': return this.treasury(filters);
      case 'seller-performance': return this.sellerPerformance(filters);
      case 'low-rotation': return this.lowRotation(filters);
      default:
        return {
          reportKey: reportKey as ReportKey,
          filters: this.stripInternalFilter(filters),
          data: [],
          totals: { rowCount: 0, isEmpty: true },
        };
    }
  }

  private async salesJournal(filters: ReportFilters & { pharmacyId: string }): Promise<ReportResult> {
    const where = this.saleWhere(filters);
    const [rows, rowCount, credits, salesTotals] = await Promise.all([
      this.prisma.sales.findMany({
        where,
        orderBy: { created_at: filters.sortDirection === 'asc' ? 'asc' : 'desc' },
        skip: (filters.page! - 1) * filters.limit!,
        take: filters.limit,
        include: {
          users_sales_user_idTousers: { select: { full_name: true, username: true } },
          customers: { select: { full_name: true } },
          sale_items: { select: { product_id: true, quantity: true, total_line_cdf: true, unit_cost_cump_cdf: true, products: { select: { name: true } } } },
        },
      }),
      this.prisma.sales.count({ where }),
      this.prisma.credit_notes.aggregate({
        where: { pharmacy_id: filters.pharmacyId, created_at: { gte: new Date(filters.from), lte: new Date(filters.to) }, sales: this.saleWhere(filters) },
        _sum: { total_amount_cdf: true, total_amount_usd: true },
      }),
      this.prisma.sales.aggregate({ where, _sum: { total_amount_cdf: true, total_amount_usd: true } }),
    ]);

    const creditCdf = this.decimal(credits._sum.total_amount_cdf);
    const creditUsd = this.decimal(credits._sum.total_amount_usd);
    const netRevenue = sumNetRevenue(
      { cdf: this.decimal(salesTotals._sum.total_amount_cdf), usd: this.decimal(salesTotals._sum.total_amount_usd) },
      { cdf: creditCdf, usd: creditUsd },
    );
    return {
      reportKey: 'sales-journal', filters: this.stripInternalFilter(filters),
      data: rows.map((row) => ({
        id: row.id, invoiceNumber: row.invoice_number, status: row.status,
        createdAt: row.created_at.toISOString(), currency: row.currency,
        totalAmountCdf: this.decimal(row.total_amount_cdf), totalAmountUsd: this.decimal(row.total_amount_usd),
        seller: row.users_sales_user_idTousers?.full_name || row.users_sales_user_idTousers?.username,
        customer: row.customers?.full_name,
        items: row.sale_items.map((item) => ({ productId: item.product_id, productName: item.products.name, quantity: item.quantity, totalCdf: this.decimal(item.total_line_cdf), costCdf: item.quantity * this.decimal(item.unit_cost_cump_cdf) })),
      })),
      totals: { rowCount, isEmpty: rowCount === 0, byCurrency: { CDF: { sales: netRevenue.cdf, credits: creditCdf }, USD: { sales: netRevenue.usd, credits: creditUsd } } },
    };
  }

  private async stockMovements(filters: ReportFilters & { pharmacyId: string }): Promise<ReportResult> {
    const where: any = {
      pharmacy_id: filters.pharmacyId,
      created_at: { gte: new Date(filters.from), lte: new Date(filters.to) },
      ...(filters.userId ? { user_id: filters.userId } : {}),
      ...(filters.categoryId ? { product_lots: { products: { category_id: filters.categoryId } } } : {}),
    };
    const [rows, rowCount] = await Promise.all([
      this.prisma.stock_movements.findMany({
        where, orderBy: { created_at: filters.sortDirection === 'asc' ? 'asc' : 'desc' },
        skip: (filters.page! - 1) * filters.limit!, take: filters.limit,
        include: { product_lots: { include: { products: { select: { name: true, category_id: true } } } }, users_stock_movements_user_idTousers: { select: { full_name: true, username: true } } },
      }),
      this.prisma.stock_movements.count({ where }),
    ]);
    const allRows = await this.prisma.stock_movements.findMany({ where, select: { quantity: true, unit_cost_cdf: true } });
    const valueCdf = allRows.reduce((sum, row) => sum + row.quantity * this.decimal(row.unit_cost_cdf), 0);
    return { reportKey: 'stock-movements', filters: this.stripInternalFilter(filters), data: rows.map((row) => ({ id: row.id, createdAt: row.created_at.toISOString(), type: row.type, direction: row.direction, quantity: row.quantity, unitCostCdf: this.decimal(row.unit_cost_cdf), valueCdf: row.quantity * this.decimal(row.unit_cost_cdf), lotNumber: row.product_lots.lot_number, productName: row.product_lots.products.name, user: row.users_stock_movements_user_idTousers.full_name || row.users_stock_movements_user_idTousers.username, reason: row.reason })), totals: { rowCount, isEmpty: rowCount === 0, byCurrency: { CDF: { movementValue: valueCdf } } } };
  }

  private async valuedInventory(filters: ReportFilters & { pharmacyId: string }): Promise<ReportResult> {
    const where: any = { pharmacy_id: filters.pharmacyId, is_active: true, ...(filters.categoryId ? { category_id: filters.categoryId } : {}) };
    const [rows, rowCount] = await Promise.all([
      this.prisma.products.findMany({ where, orderBy: { name: 'asc' }, skip: (filters.page! - 1) * filters.limit!, take: filters.limit, select: { id: true, name: true, dci: true, cump_cdf: true, product_lots: { where: { is_quarantined: false, current_quantity: { gt: 0 } }, select: { id: true, lot_number: true, current_quantity: true, expiry_date: true } } } }),
      this.prisma.products.count({ where }),
    ]);
    const data = rows.map((row) => { const quantity = row.product_lots.reduce((sum, lot) => sum + lot.current_quantity, 0); const valueCdf = quantity * this.decimal(row.cump_cdf); return { productId: row.id, productName: row.name, dci: row.dci, quantity, cumpCdf: this.decimal(row.cump_cdf), valueCdf, lots: row.product_lots.map((lot) => ({ lotId: lot.id, lotNumber: lot.lot_number, quantity: lot.current_quantity, expiryDate: lot.expiry_date.toISOString().slice(0, 10) })) }; });
    const allProducts = await this.prisma.products.findMany({ where, select: { cump_cdf: true, product_lots: { where: { is_quarantined: false, current_quantity: { gt: 0 } }, select: { current_quantity: true } } } });
    const valueCdf = allProducts.reduce((sum, row) => sum + row.product_lots.reduce((lotSum, lot) => lotSum + lot.current_quantity, 0) * this.decimal(row.cump_cdf), 0);
    return { reportKey: 'valued-inventory', filters: this.stripInternalFilter(filters), data, totals: { rowCount, isEmpty: rowCount === 0, byCurrency: { CDF: { stockValue: valueCdf } } } };
  }

  private async expiries(filters: ReportFilters & { pharmacyId: string }): Promise<ReportResult> {
    const until = new Date(filters.to); until.setDate(until.getDate() + 90);
    const where: any = { products: { pharmacy_id: filters.pharmacyId, is_active: true, ...(filters.categoryId ? { category_id: filters.categoryId } : {}) }, is_quarantined: false, current_quantity: { gt: 0 }, expiry_date: { gt: new Date(filters.to), lte: until } };
    const [rows, rowCount] = await Promise.all([
      this.prisma.product_lots.findMany({ where, orderBy: { expiry_date: 'asc' }, skip: (filters.page! - 1) * filters.limit!, take: filters.limit, select: { id: true, lot_number: true, expiry_date: true, current_quantity: true, products: { select: { id: true, name: true, cump_cdf: true } } } }),
      this.prisma.product_lots.count({ where }),
    ]);
    const data = rows.map((row) => ({ lotId: row.id, lotNumber: row.lot_number, productId: row.products.id, productName: row.products.name, expiryDate: row.expiry_date.toISOString().slice(0, 10), quantity: row.current_quantity, valueCdf: row.current_quantity * this.decimal(row.products.cump_cdf) }));
    const allRows = await this.prisma.product_lots.findMany({ where, select: { current_quantity: true, products: { select: { cump_cdf: true } } } });
    const totalValue = allRows.reduce((sum, row) => sum + row.current_quantity * this.decimal(row.products.cump_cdf), 0);
    return { reportKey: 'expiries', filters: this.stripInternalFilter(filters), data, totals: { rowCount, isEmpty: rowCount === 0, byCurrency: { CDF: { nearExpiryValue: totalValue } } } };
  }

  private async expenses(filters: ReportFilters & { pharmacyId: string }): Promise<ReportResult> {
    const where: any = { pharmacy_id: filters.pharmacyId, created_at: { gte: new Date(filters.from), lte: new Date(filters.to) }, ...(filters.userId ? { user_id: filters.userId } : {}), ...(filters.categoryId ? { category_id: filters.categoryId } : {}) };
    const [rows, rowCount] = await Promise.all([
      this.prisma.expenses.findMany({ where, orderBy: { created_at: filters.sortDirection === 'asc' ? 'asc' : 'desc' }, skip: (filters.page! - 1) * filters.limit!, take: filters.limit, include: { expense_categories: { select: { name: true } } } }),
      this.prisma.expenses.count({ where }),
    ]);
    const data = rows.map((row) => ({ id: row.id, createdAt: row.created_at.toISOString(), description: row.description, category: row.expense_categories.name, amountCdf: this.decimal(row.amount_cdf), amountUsd: this.decimal(row.amount_usd), reversedAt: row.reversed_at?.toISOString() }));
    const allExpenses = await this.prisma.expenses.aggregate({ where, _sum: { amount_cdf: true, amount_usd: true } });
    return { reportKey: 'expenses', filters: this.stripInternalFilter(filters), data, totals: { rowCount, isEmpty: rowCount === 0, byCurrency: { CDF: { totalExpenses: this.decimal(allExpenses._sum.amount_cdf) }, USD: { totalExpenses: this.decimal(allExpenses._sum.amount_usd) } } } };
  }

  private async bestSellers(filters: ReportFilters & { pharmacyId: string }): Promise<ReportResult> {
    const rows = await this.prisma.sale_items.findMany({ where: { sales: this.saleWhere(filters) }, select: { product_id: true, quantity: true, total_line_cdf: true, products: { select: { name: true } } } });
    const grouped = new Map<string, { productId: string; productName: string; quantity: number; revenueCdf: number }>();
    for (const row of rows) { const current = grouped.get(row.product_id) || { productId: row.product_id, productName: row.products.name, quantity: 0, revenueCdf: 0 }; current.quantity += row.quantity; current.revenueCdf += this.decimal(row.total_line_cdf); grouped.set(row.product_id, current); }
    const data = [...grouped.values()].sort((a, b) => b.quantity - a.quantity).slice((filters.page! - 1) * filters.limit!, filters.page! * filters.limit!);
    return { reportKey: 'best-sellers', filters: this.stripInternalFilter(filters), data, totals: { rowCount: grouped.size, isEmpty: grouped.size === 0, byCurrency: { CDF: { revenue: [...grouped.values()].reduce((sum, row) => sum + row.revenueCdf, 0) } } } };
  }

  private async receivables(filters: ReportFilters & { pharmacyId: string }): Promise<ReportResult> {
    const aging = await this.cashService.getReceivablesAging(filters.pharmacyId, new Date(filters.to));
    const all = aging.details
      .sort((a: any, b: any) => b.currentBalanceCdf - a.currentBalanceCdf)
      .map((row: any) => ({ customerId: row.id, customerName: row.name, invoiceNumber: row.invoiceNumber, balanceCdf: Number(row.currentBalanceCdf.toFixed(2)), daysOverdue: row.daysOverdue }));
    const data = all.slice((filters.page! - 1) * filters.limit!, filters.page! * filters.limit!);
    return {
      reportKey: 'receivables', filters: this.stripInternalFilter(filters), data,
      totals: {
        rowCount: all.length, isEmpty: all.length === 0,
        byCurrency: { CDF: { totalReceivables: Number(aging.totalReceivablesCdf.toFixed(2)), aging0To30: Number(aging.bracket0To30Cdf.toFixed(2)), aging31To60: Number(aging.bracket31To60Cdf.toFixed(2)), agingOver60: Number(aging.bracketOver60Cdf.toFixed(2)) } },
      },
    };
  }

  private async treasury(filters: ReportFilters & { pharmacyId: string }): Promise<ReportResult> {
    const dateWhere = { gte: new Date(filters.from), lte: new Date(filters.to) };
    const [payments, receivablePayments, expenses] = await Promise.all([
      this.prisma.sale_payments.findMany({ where: { sales: this.saleWhere(filters) }, select: { currency: true, amount_paid: true, payment_method: true } }),
      this.prisma.customer_payments.findMany({ where: { pharmacy_id: filters.pharmacyId, created_at: dateWhere }, select: { currency: true, amount_paid: true, amount_paid_cdf: true, payment_method: true } }),
      this.prisma.expenses.findMany({ where: { pharmacy_id: filters.pharmacyId, created_at: dateWhere }, select: { amount_cdf: true, amount_usd: true } }),
    ]);
    const byCurrency: Record<string, { receipts: number; expenses: number; balance: number }> = { CDF: { receipts: 0, expenses: 0, balance: 0 }, USD: { receipts: 0, expenses: 0, balance: 0 } };
    for (const payment of payments) byCurrency[payment.currency] ??= { receipts: 0, expenses: 0, balance: 0 }, byCurrency[payment.currency].receipts += this.decimal(payment.amount_paid);
    for (const payment of receivablePayments) { const currency = payment.currency || 'CDF'; byCurrency[currency] ??= { receipts: 0, expenses: 0, balance: 0 }; byCurrency[currency].receipts += this.decimal(payment.amount_paid ?? payment.amount_paid_cdf); }
    byCurrency.CDF.expenses = expenses.reduce((sum, row) => sum + this.decimal(row.amount_cdf), 0);
    byCurrency.USD.expenses = expenses.reduce((sum, row) => sum + this.decimal(row.amount_usd), 0);
    for (const currency of Object.keys(byCurrency)) byCurrency[currency].balance = byCurrency[currency].receipts - byCurrency[currency].expenses;
    const data = Object.entries(byCurrency).map(([currency, values]) => ({ currency, ...values }));
    return { reportKey: 'treasury', filters: this.stripInternalFilter(filters), data, totals: { rowCount: data.length, isEmpty: data.length === 0, byCurrency: { CDF: byCurrency.CDF, USD: byCurrency.USD } } };
  }

  private async sellerPerformance(filters: ReportFilters & { pharmacyId: string }): Promise<ReportResult> {
    const rows = await this.prisma.sales.findMany({ where: this.saleWhere(filters), select: { user_id: true, total_amount_cdf: true, users_sales_user_idTousers: { select: { full_name: true, username: true } } } });
    const grouped = new Map<string, { userId: string; seller: string; salesCount: number; revenueCdf: number }>();
    for (const row of rows) { const current = grouped.get(row.user_id) || { userId: row.user_id, seller: row.users_sales_user_idTousers.full_name || row.users_sales_user_idTousers.username, salesCount: 0, revenueCdf: 0 }; current.salesCount++; current.revenueCdf += this.decimal(row.total_amount_cdf); grouped.set(row.user_id, current); }
    const all = [...grouped.values()].sort((a, b) => b.revenueCdf - a.revenueCdf); const data = all.slice((filters.page! - 1) * filters.limit!, filters.page! * filters.limit!);
    return { reportKey: 'seller-performance', filters: this.stripInternalFilter(filters), data, totals: { rowCount: all.length, isEmpty: all.length === 0, byCurrency: { CDF: { revenue: all.reduce((sum, row) => sum + row.revenueCdf, 0) } } } };
  }

  private async lowRotation(filters: ReportFilters & { pharmacyId: string }): Promise<ReportResult> {
    const products = await this.prisma.products.findMany({ where: { pharmacy_id: filters.pharmacyId, is_active: true, ...(filters.categoryId ? { category_id: filters.categoryId } : {}) }, select: { id: true, name: true, cump_cdf: true, product_lots: { where: { is_quarantined: false, current_quantity: { gt: 0 } }, select: { current_quantity: true } } } });
    const sales = await this.prisma.sale_items.findMany({ where: { sales: this.saleWhere(filters) }, select: { product_id: true, quantity: true } });
    const sold = new Map<string, number>(); for (const row of sales) sold.set(row.product_id, (sold.get(row.product_id) || 0) + row.quantity);
    const all = products.map((product) => ({ productId: product.id, productName: product.name, stockQuantity: product.product_lots.reduce((sum, lot) => sum + lot.current_quantity, 0), soldQuantity: sold.get(product.id) || 0, stockValueCdf: product.product_lots.reduce((sum, lot) => sum + lot.current_quantity, 0) * this.decimal(product.cump_cdf) })).sort((a, b) => a.soldQuantity - b.soldQuantity);
    const data = all.slice((filters.page! - 1) * filters.limit!, filters.page! * filters.limit!);
    return { reportKey: 'low-rotation', filters: this.stripInternalFilter(filters), data, totals: { rowCount: all.length, isEmpty: all.length === 0, byCurrency: { CDF: { stockValue: all.reduce((sum, row) => sum + row.stockValueCdf, 0) } } } };
  }

  private async aggregateRevenue(filters: ReportFilters & { pharmacyId: string }): Promise<MoneyPair> {
    const sales = await this.prisma.sales.aggregate({
      where: this.saleWhere(filters),
      _sum: { total_amount_cdf: true, total_amount_usd: true },
    });
    const credits = await this.prisma.credit_notes.aggregate({
      where: { pharmacy_id: filters.pharmacyId, created_at: { gte: new Date(filters.from), lte: new Date(filters.to) } },
      _sum: { total_amount_cdf: true, total_amount_usd: true },
    });
    return sumNetRevenue(
      { cdf: this.decimal(sales._sum.total_amount_cdf), usd: this.decimal(sales._sum.total_amount_usd) },
      { cdf: this.decimal(credits._sum.total_amount_cdf), usd: this.decimal(credits._sum.total_amount_usd) },
    );
  }

  private percentageMetric(key: string, value: number, previousValue: number, reportKey: ReportLink['reportKey'], filters: ReportFilters & { pharmacyId: string }): DashboardMetric {
    return {
      key,
      valuesByCurrency: { CDF: { value, previousValue, variationPercent: this.variation(value, previousValue) } },
      reportLink: { reportKey, params: this.stripInternalFilter(filters) },
    };
  }

  private async aggregateMargin(filters: ReportFilters & { pharmacyId: string }): Promise<{ current: MoneyPair; previous: MoneyPair }> {
    const current = await this.marginFor(filters);
    const previous = await this.marginFor(this.previousPeriod(filters));
    return { current, previous };
  }

  private async marginFor(filters: ReportFilters & { pharmacyId: string }): Promise<MoneyPair> {
    const rows = await this.prisma.sale_items.findMany({
      where: { sales: this.saleWhere(filters) },
      select: { total_line_cdf: true, quantity: true, unit_cost_cump_cdf: true },
    });
    const cdf = calculateGrossMargin(rows.map((row) => ({ revenueCdf: this.decimal(row.total_line_cdf), quantity: row.quantity, unitCostCdf: this.decimal(row.unit_cost_cump_cdf) })));
    return { cdf, usd: cdf / await this.currentRate(filters) };
  }

  private async aggregateStock(filters: ReportFilters & { pharmacyId: string }): Promise<MoneyPair> {
    const rows = await this.prisma.products.findMany({
      where: { pharmacy_id: filters.pharmacyId, is_active: true },
      select: { cump_cdf: true, product_lots: { where: { is_quarantined: false, current_quantity: { gt: 0 } }, select: { current_quantity: true } } },
    });
    const cdf = rows.reduce((sum, p) => sum + Number(p.cump_cdf) * p.product_lots.reduce((s, lot) => s + lot.current_quantity, 0), 0);
    const rate = await this.currentRate(filters);
    return { cdf: Math.round(cdf * 100) / 100, usd: Math.round((cdf / rate) * 100) / 100 };
  }

  private async countOutOfStock(filters: ReportFilters & { pharmacyId: string }): Promise<{ rate: number }> {
    const [active, out] = await Promise.all([
      this.prisma.products.count({ where: { pharmacy_id: filters.pharmacyId, is_active: true } }),
      this.prisma.products.count({ where: { pharmacy_id: filters.pharmacyId, is_active: true, product_lots: { none: { is_quarantined: false, current_quantity: { gt: 0 } } } } }),
    ]);
    return { rate: active ? Number(((out / active) * 100).toFixed(2)) : 0 };
  }

  private async aggregateNearExpiry(filters: ReportFilters & { pharmacyId: string }): Promise<MoneyPair> {
    const until = new Date(filters.to);
    until.setDate(until.getDate() + 90);
    const rows = await this.prisma.product_lots.findMany({
      where: { products: { pharmacy_id: filters.pharmacyId, is_active: true }, is_quarantined: false, current_quantity: { gt: 0 }, expiry_date: { gt: new Date(filters.to), lte: until } },
      select: { current_quantity: true, products: { select: { cump_cdf: true } } },
    });
    const cdf = rows.reduce((sum, lot) => sum + lot.current_quantity * Number(lot.products.cump_cdf), 0);
    return { cdf, usd: cdf / await this.currentRate(filters) };
  }

  private async aggregateReceivables(filters: ReportFilters & { pharmacyId: string }): Promise<MoneyPair> {
    const aging = await this.cashService.getReceivablesAging(filters.pharmacyId, new Date(filters.to));
    const cdf = Number(aging.totalReceivablesCdf.toFixed(2));
    const rate = await this.currentRate(filters);
    return { cdf, usd: rate ? Number((cdf / rate).toFixed(2)) : 0 };
  }

  private async aggregateCashVariance(filters: ReportFilters & { pharmacyId: string }): Promise<MoneyPair> {
    const rows = await this.prisma.cash_sessions.aggregate({ where: { pharmacy_id: filters.pharmacyId, closed_at: { gte: new Date(filters.from), lte: new Date(filters.to) } }, _sum: { variance_cdf: true, variance_usd: true } });
    return { cdf: this.decimal(rows._sum.variance_cdf), usd: this.decimal(rows._sum.variance_usd) };
  }

  private saleWhere(filters: ReportFilters & { pharmacyId: string }): any {
    return {
      pharmacy_id: filters.pharmacyId,
      status: 'VALIDEE',
      created_at: { gte: new Date(filters.from), lte: new Date(filters.to) },
      ...(filters.userId ? { user_id: filters.userId } : {}),
      ...(filters.categoryId ? { sale_items: { some: { products: { category_id: filters.categoryId } } } } : {}),
    };
  }

  private previousPeriod(filters: ReportFilters & { pharmacyId: string }): ReportFilters & { pharmacyId: string } {
    const from = new Date(filters.from).getTime();
    const to = new Date(filters.to).getTime();
    const duration = to - from;
    return { ...filters, from: new Date(from - duration).toISOString(), to: new Date(from - 1).toISOString() };
  }

  private startOfPeriod(to: Date, period: string): Date {
    const start = new Date(to);
    if (period === 'week') start.setDate(start.getDate() - 6);
    else if (period === 'month') start.setDate(start.getDate() - 29);
    else if (period === 'custom') start.setHours(0, 0, 0, 0);
    else start.setHours(0, 0, 0, 0);
    return start;
  }

  private stripInternalFilter(filters: ReportFilters & { pharmacyId: string }): ReportFilters {
    const { pharmacyId: _pharmacyId, ...publicFilters } = filters;
    return publicFilters;
  }

  private decimal(value: unknown): number {
    return value == null ? 0 : Number(value);
  }

  private async currentRate(filters: ReportFilters & { pharmacyId: string }): Promise<number> {
    const rate = await this.prisma.exchange_rates.findFirst({
      where: { pharmacy_id: filters.pharmacyId, effective_date: { lte: new Date(filters.to) } },
      orderBy: { effective_date: 'desc' },
      select: { rate: true },
    });
    return rate && Number(rate.rate) > 0 ? Number(rate.rate) : 1;
  }

  private variation(value: number, previous: number): number | null {
    if (previous === 0) return value === 0 ? 0 : null;
    return Number((((value - previous) / Math.abs(previous)) * 100).toFixed(2));
  }
}
