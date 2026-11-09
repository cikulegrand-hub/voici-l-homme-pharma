import {
  Injectable,
  BadRequestException,
  ConflictException,
  NotFoundException,
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common';
import {
  Sale,
  SaleItemAllocation,
  SaleStatus,
  HeldCart,
  OfflineSyncBatchRequest,
  OfflineSyncBatchResult,
  OfflineConflictDetails,
  OfflineConflictItem,
  ResolveConflictDto,
} from '@vhp/shared';
import { CreateSaleRequestDto, CancelSaleDto, HoldCartDto, CreateCancellationRequestDto } from './dto/sales.dto';
import { FefoService, AllocatedLotItem } from '../stock/fefo.service';
import { StockService } from '../stock/stock.service';
import { CatalogService } from '../catalog/catalog.service';
import { CustomersService } from '../customers/customers.service';
import { SettingsService } from '../settings/settings.service';
import { AuditService } from '../audit/audit.service';
import { AuthService } from '../auth/auth.service';
import { PrismaService } from '../prisma/prisma.service';
import { InvoiceNumberService } from './invoice-number.service';
import { ExchangeRateResolver } from '../cash/exchange-rate.resolver';
import * as zlib from 'zlib';

@Injectable()
export class SalesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly fefoService: FefoService,
    private readonly stockService: StockService,
    private readonly catalogService: CatalogService,
    private readonly customersService: CustomersService,
    private readonly settingsService: SettingsService,
    private readonly auditService: AuditService,
    private readonly authService: AuthService,
    private readonly invoiceNumberService: InvoiceNumberService,
    private readonly exchangeRateResolver: ExchangeRateResolver,
  ) {}

  /**
   * VTE-01 à VTE-18 : Enregistrement complet d'une vente au comptoir
   */
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

  async processSale(
    dto: CreateSaleRequestDto,
    userId: string,
    userRole: string,
    pharmacyId: string,
    idempotencyKey: string,
    supervisorPin?: string,
  ): Promise<Sale> {
    // 1. RG-16 : Protection contre le double envoi (Clé d'idempotence)
    if (idempotencyKey) {
      const existingSale = await this.prisma.sales.findFirst({
        where: { pharmacy_id: pharmacyId, idempotency_key: idempotencyKey },
        include: {
          sale_items: {
            include: { product_lots: true },
          },
          customers: true,
        },
      });

      if (existingSale) {
        return this.mapToSale(existingSale);
      }
    }

    if (!dto.items || dto.items.length === 0) {
      throw new BadRequestException('Une vente doit comporter au moins un produit.');
    }
    if (!dto.payments || dto.payments.length === 0) throw new BadRequestException('Au moins un paiement est requis.');
    for (const payment of dto.payments) {
      if (payment.amountPaid < 0) throw new BadRequestException('Le montant d’un paiement ne peut pas être négatif.');
      if (payment.method === 'MOBILE_MONEY' && (!payment.mobileMoneyProvider || !payment.transactionReference?.trim())) {
        throw new BadRequestException('Le mobile money exige un opérateur et une référence de transaction.');
      }
      if (payment.method === 'CARTE_BANCAIRE' && !payment.transactionReference?.trim()) {
        throw new BadRequestException('Le règlement par carte bancaire exige un numéro d’autorisation ou de transaction.');
      }
      if (payment.method === 'VIREMENT' && !payment.transactionReference?.trim()) {
        throw new BadRequestException('Le règlement par virement exige une référence ou numéro de bordereau.');
      }
    }

    // Valider ou obtenir un utilisateur valide dans la base
    const validUserId = await this.resolveValidUserId(userId);

    // 2. Vérification des produits et ordonnances (RG-09)
    const exchangeRate = await this.exchangeRateResolver.getRateAt(pharmacyId);
    const activeExchangeRate = Number(exchangeRate.rate);
    const pricedItems = await this.priceItems(dto, pharmacyId, userRole, supervisorPin);
    dto.items = pricedItems.map(({ product, taxAmountCdf, ...item }) => item) as any;
    for (const item of pricedItems) {
      const product = item.product;
      if (product.requires_prescription && !dto.prescriptionId) {
        throw new BadRequestException(
          `Le médicament « ${product.name} » est soumis à ordonnance obligatoire (RG-09). Veuillez joindre une ordonnance valide.`,
        );
      }
    }

    // RG-09 : Vérification et validation de l'ordonnance si spécifiée
    if (dto.prescriptionId) {
      const prescription = await this.prisma.prescriptions.findFirst({
        where: {
          id: dto.prescriptionId,
          customers: { pharmacy_id: pharmacyId },
        },
        include: { customers: true },
      });
      if (!prescription) {
        throw new BadRequestException('L’ordonnance spécifiée est introuvable ou n’appartient pas à cette officine.');
      }
      if (dto.customerId && prescription.customer_id !== dto.customerId) {
        throw new BadRequestException('Cette ordonnance n’appartient pas au client sélectionné pour cette vente.');
      }
    }

    // 3. Contrôle des remises par rôle (RG-10, VTE-03)
    const roleDiscountCap = this.settingsService.getDiscountCapForRole(userRole);
    let totalDiscountCdf = 0;
    let rawSubtotalCdf = 0;

    for (const item of pricedItems) {
      const lineRawTotal = item.quantity * item.unitPriceCdf;
      rawSubtotalCdf += lineRawTotal;
      const discount = item.discountCdf || 0;
      totalDiscountCdf += discount;

      const lineDiscountPercent = lineRawTotal > 0 ? (discount / lineRawTotal) * 100 : 0;
      if (lineDiscountPercent > roleDiscountCap) {
        if (!supervisorPin) {
          throw new UnauthorizedException(
            `La remise de ${lineDiscountPercent.toFixed(1)}% dépasse le plafond autorisé pour votre rôle (${roleDiscountCap}%). Saisie du code PIN superviseur requise (AUT-08, RG-10).`,
          );
        }
        await this.authService.verifySupervisorPin(supervisorPin);
      }
    }

    const taxAmountCdf = pricedItems.reduce((total, item) => total + item.taxAmountCdf, 0);
    const totalCdf = this.roundForCurrency(rawSubtotalCdf - totalDiscountCdf + taxAmountCdf, dto.currency);
    const totalUsd = Number((totalCdf / activeExchangeRate).toFixed(2));

    // 4. RG-13 & VTE-12 : Contrôle des ventes à crédit & paiements partiels
    const creditPayment = dto.payments.find((p) => p.method === 'CREDIT_CLIENT');
    let creditAmountCdf = 0;
    if (creditPayment) {
      creditAmountCdf =
        creditPayment.currency === 'USD' ? creditPayment.amountPaid * activeExchangeRate : creditPayment.amountPaid;
    }

    // 5. Vérification du règlement des paiements
    const totalPaidInCdf = dto.payments.reduce((sum, p) => {
      const inCdf = p.currency === 'USD' ? p.amountPaid * activeExchangeRate : p.amountPaid;
      return sum + inCdf;
    }, 0);

    const outstandingCdf = Math.max(0, totalCdf - totalPaidInCdf);
    const totalCreditNeededCdf = creditAmountCdf + outstandingCdf;

    if (totalCreditNeededCdf > 0) {
      if (!dto.customerId) {
        throw new BadRequestException('Un client doit être identifié pour effectuer une vente à crédit ou avec un solde restant.');
      }
      try {
        await this.customersService.checkCreditAvailability(dto.customerId, totalCreditNeededCdf, pharmacyId);
      } catch (creditErr: any) {
        if (supervisorPin) {
          await this.authService.verifySupervisorPin(supervisorPin);
          await this.auditService.logAction({
            pharmacyId,
            userId: validUserId,
            userName: 'Superviseur',
            action: 'DEROGATION_PLAFOND_CREDIT',
            entityName: 'CUSTOMER',
            entityId: dto.customerId,
            newValues: {
              totalCreditNeededCdf,
              reason: 'Autorisation superviseur dépassement plafond crédit par code PIN (RG-13)',
            },
          });
        } else {
          throw creditErr;
        }
      }
    }

    const changeCdf = totalPaidInCdf > totalCdf ? totalPaidInCdf - totalCdf : 0;

    // 6. Session de caisse active
    const cashSession = await this.prisma.cash_sessions.findFirst({
      where: { user_id: validUserId, status: 'OUVERTE' },
    });
    if (!cashSession) throw new BadRequestException('Session de caisse fermée. Ouvrez votre caisse avant de valider une vente.');

    // 7. Transaction Prisma atomique : Numérotation séquentielle sans trou + Enregistrement vente + Déstockage FEFO sécurisé + Paiements
    const year = new Date().getFullYear();
    let recordedAllocations: AllocatedLotItem[] = [];

    let createdSale: any;
    try {
      createdSale = await this.prisma.$transaction(async (tx) => {
        // 7.1 Numéro séquentiel atomique sans trou via invoice_sequences
        const { invoiceNumber, sequenceNumber } = await this.invoiceNumberService.getNextInvoiceNumber(
          tx,
          pharmacyId,
          year,
        );

        // 7.2 Création de la vente principale
        const sale = await tx.sales.create({
          data: {
            pharmacy_id: pharmacyId,
            cash_session_id: cashSession.id,
            invoice_number: invoiceNumber,
            sequence_number: sequenceNumber,
            fiscal_year: year,
            customer_id: dto.customerId || undefined,
            user_id: validUserId,
            prescription_id: dto.prescriptionId || undefined,
            currency: dto.currency,
            exchange_rate_applied: activeExchangeRate,
            exchange_rate_id: exchangeRate.id,
            subtotal_cdf: rawSubtotalCdf,
            discount_cdf: totalDiscountCdf,
            tax_amount_cdf: taxAmountCdf,
            total_amount_cdf: totalCdf,
            total_amount_usd: totalUsd,
            idempotency_key: idempotencyKey,
            status: 'VALIDEE',
          },
        });

        // 7.3 Imputation FEFO multi-lots avec verrouillage exclusif (SELECT FOR UPDATE)
        // Décrémente les lots, crée les sale_items et stock_movements
        // Lève InsufficientStockException si stock insuffisant -> ROLLBACK atomique complet
        const deductResult = await this.fefoService.allocateAndDeductStockInTx(tx, {
          saleId: sale.id,
          pharmacyId,
          userId: validUserId,
          invoiceNumber,
          items: pricedItems.map((i) => ({
            productId: i.productId,
            quantityNeeded: i.quantity,
            unitPriceCdf: i.unitPriceCdf,
            discountCdf: i.discountCdf,
            lotId: i.lotId,
          })),
        });

        recordedAllocations = deductResult.allocations;

        // 7.4 Enregistrement des paiements (VTE-05, FIN-05)
        let persistedPayments: any[] = dto.payments.map((p) => ({ ...p }));
        if (outstandingCdf > 0) {
          const existingCredit = persistedPayments.find((p) => p.method === 'CREDIT_CLIENT');
          if (existingCredit) {
            const addedAmount = existingCredit.currency === 'USD' ? outstandingCdf / activeExchangeRate : outstandingCdf;
            existingCredit.amountPaid = Number((existingCredit.amountPaid + addedAmount).toFixed(2));
          } else {
            persistedPayments.push({ method: 'CREDIT_CLIENT', currency: 'CDF', amountPaid: outstandingCdf });
          }
        }
        for (const p of persistedPayments) {
          const amountInCdf = p.currency === 'USD' ? p.amountPaid * activeExchangeRate : p.amountPaid;
          await tx.sale_payments.create({
            data: {
              sale_id: sale.id,
              payment_method: p.method as any,
              currency: p.currency,
              amount_paid: p.amountPaid,
              amount_in_cdf: amountInCdf,
              mobile_money_provider: p.mobileMoneyProvider,
              transaction_reference: p.transactionReference,
              change_given_cdf: changeCdf,
            },
          });
        }

        // 7.5 Mise à jour du compte client en cas de crédit (CLI-03, RG-13)
        if ((creditPayment || outstandingCdf > 0) && dto.customerId) {
          await tx.customers.update({
            where: { id: dto.customerId },
            data: { current_balance_cdf: { increment: creditAmountCdf + outstandingCdf } },
          });
        }

        // 7.6 Mise à jour de la session de caisse
        const cashPaymentsCdf = dto.payments
          .filter((p) => p.method === 'ESPECES')
          .reduce((sum, p) => sum + (p.currency === 'CDF' ? p.amountPaid : 0), 0);
        const cashPaymentsUsd = dto.payments
          .filter((p) => p.method === 'ESPECES')
          .reduce((sum, p) => sum + (p.currency === 'USD' ? p.amountPaid : 0), 0);

        await tx.cash_sessions.update({
          where: { id: cashSession.id },
          data: {
            expected_amount_cdf: { increment: cashPaymentsCdf - changeCdf },
            expected_amount_usd: { increment: cashPaymentsUsd },
          },
        });

        return sale;
      }, { maxWait: 15000, timeout: 30000 });
    } catch (err: any) {
      if (err?.code === 'P2002' && idempotencyKey) {
        const existing = await this.prisma.sales.findFirst({
          where: { pharmacy_id: pharmacyId, idempotency_key: idempotencyKey },
          include: {
            sale_items: { include: { product_lots: true } },
            customers: true,
          },
        });
        if (existing) return this.mapToSale(existing);
      }
      throw err;
    }

    // Journalisation d'audit inaltérable (AUD-01)
    await this.auditService.logAction({
      userId: validUserId,
      userName: 'Caissier',
      action: 'VENTE_VALIDEE',
      entityName: 'SALE',
      entityId: createdSale.id,
      newValues: {
        invoiceNumber: createdSale.invoice_number,
        totalCdf: Number(createdSale.total_amount_cdf),
        totalUsd: Number(createdSale.total_amount_usd),
        itemCount: recordedAllocations.length,
        discountCdf: totalDiscountCdf,
      },
    });

    if (totalDiscountCdf > 0) {
      await this.auditService.logAction({
        userId: validUserId,
        userName: 'Caissier',
        action: 'REMISE_ACCORDEE',
        entityName: 'SALE',
        entityId: createdSale.id,
        oldValues: { rawSubtotalCdf, roleDiscountCapPercent: roleDiscountCap },
        newValues: {
          totalDiscountCdf,
          netTotalCdf: totalCdf,
          discountPercent: rawSubtotalCdf > 0 ? (totalDiscountCdf / rawSubtotalCdf) * 100 : 0,
        },
      });
    }

    let customerName = 'Client comptoir';
    if (dto.customerId) {
      try {
        const c = await this.customersService.getCustomerById(dto.customerId);
        customerName = c.fullName;
      } catch {}
    }

    return {
      id: createdSale.id,
      invoiceNumber: createdSale.invoice_number,
      customerName,
      totalAmountCdf: Number(createdSale.total_amount_cdf),
      totalAmountUsd: Number(createdSale.total_amount_usd),
      appliedExchangeRate: Number(createdSale.exchange_rate_applied),
      currency: createdSale.currency as any,
      status: createdSale.status as SaleStatus,
      createdAt: createdSale.created_at.toISOString(),
      items: recordedAllocations.map((a) => ({
        lotId: a.lotId,
        lotNumber: a.lotNumber,
        expiryDate: a.expiryDate,
        quantity: a.quantity,
        unitPriceCdf: a.unitPriceCdf,
        unitCostCumpCdf: a.unitCostCumpCdf,
        discountCdf: a.discountCdf,
        totalLineCdf: a.totalLineCdf,
      })),
    };
  }

  async getSaleById(id: string, pharmacyId?: string): Promise<Sale> {
    const sale = await this.prisma.sales.findFirst({
      where: { id, ...(pharmacyId ? { pharmacy_id: pharmacyId } : {}) },
      include: {
        sale_items: {
          include: {
            product_lots: true,
            products: true,
          },
        },
        customers: true,
        sale_payments: true,
        users_sales_user_idTousers: true,
      },
    });
    if (!sale) throw new NotFoundException('Facture introuvable.');
    return this.mapToSale(sale);
  }

  private roundForCurrency(value: number, currency: string): number {
    return currency === 'USD' ? Number(value.toFixed(2)) : Math.round(value);
  }

  private async priceItems(dto: CreateSaleRequestDto, pharmacyId: string, userRole: string, supervisorPin?: string) {
    const cap = this.settingsService.getDiscountCapForRole(userRole);
    return Promise.all(dto.items.map(async (item) => {
      const product = await this.prisma.products.findFirst({ where: { id: item.productId, pharmacy_id: pharmacyId, is_active: true } });
      if (!product) throw new NotFoundException(`Produit introuvable : ${item.productId}`);
      const unitPriceCdf = Number(product.selling_price_cdf);
      const discountCdf = Math.max(0, Number(item.discountCdf || 0));
      const raw = item.quantity * unitPriceCdf;
      const percent = raw ? (discountCdf / raw) * 100 : 0;
      if (percent > cap) {
        if (!supervisorPin) throw new UnauthorizedException(`La remise de ${percent.toFixed(1)}% dépasse le plafond autorisé pour votre rôle (${cap}%). Code PIN superviseur requis.`);
        await this.authService.verifySupervisorPin(supervisorPin);
      }
      if (item.lotId) {
        const isAuthorizedRole = ['PHARMACIEN', 'GESTIONNAIRE_STOCK', 'ADMIN'].includes(userRole);
        if (!isAuthorizedRole && !supervisorPin) {
          throw new UnauthorizedException('Le changement manuel de lot est réservé aux profils habilités ou exige un code PIN superviseur.');
        }
        if (!isAuthorizedRole && supervisorPin) {
          await this.authService.verifySupervisorPin(supervisorPin);
        }
      }
      return { ...item, unitPriceCdf, discountCdf, product, taxAmountCdf: (raw - discountCdf) * Number(product.tax_rate || 0) / 100 };
    }));
  }

  async previewSale(dto: CreateSaleRequestDto, pharmacyId: string, userRole: string) {
    const rate = await this.exchangeRateResolver.getRateAt(pharmacyId);
    const items = await this.priceItems(dto, pharmacyId, userRole, dto.supervisorPin);
    const subtotalCdf = items.reduce((sum, i) => sum + i.quantity * i.unitPriceCdf, 0);
    const discountCdf = items.reduce((sum, i) => sum + i.discountCdf, 0);
    const taxCdf = items.reduce((sum, i) => sum + i.taxAmountCdf, 0);
    const totalCdf = this.roundForCurrency(subtotalCdf - discountCdf + taxCdf, dto.currency);
    const paidCdf = (dto.payments || []).reduce((sum, p) => sum + Number(p.amountPaid || 0) * (p.currency === 'USD' ? Number(rate.rate) : 1), 0);

    const previewItems = await Promise.all(
      items.map(async (i) => {
        const availableLots = await this.prisma.product_lots.findMany({
          where: {
            product_id: i.productId,
            expiry_date: { gt: new Date() },
            is_quarantined: false,
            current_quantity: { gt: 0 },
          },
          orderBy: [{ expiry_date: 'asc' }, { created_at: 'asc' }],
        });
        const selectedLot = i.lotId ? availableLots.find((l) => l.id === i.lotId) : availableLots[0];
        const totalStock = availableLots.reduce((sum, l) => sum + Number(l.current_quantity), 0);
        const isNearExpiry = selectedLot?.expiry_date
          ? (new Date(selectedLot.expiry_date).getTime() - Date.now()) < 90 * 86400000
          : false;

        return {
          productId: i.productId,
          productName: i.product.name,
          dci: i.product.dci,
          quantity: i.quantity,
          unitPriceCdf: i.unitPriceCdf,
          discountCdf: i.discountCdf,
          taxAmountCdf: i.taxAmountCdf,
          lineTotalCdf: this.roundForCurrency(i.quantity * i.unitPriceCdf - i.discountCdf + i.taxAmountCdf, dto.currency),
          lotId: selectedLot?.id || null,
          lotNumber: selectedLot?.lot_number || null,
          expiryDate: selectedLot?.expiry_date ? selectedLot.expiry_date.toISOString().split('T')[0] : null,
          availableStock: totalStock,
          isNearExpiry,
          isControlled: Boolean(i.product.is_controlled_substance),
          requiresPrescription: Boolean(i.product.requires_prescription),
          stockWarning: i.quantity > totalStock,
        };
      }),
    );

    return {
      currency: dto.currency,
      exchangeRate: Number(rate.rate),
      subtotalCdf,
      discountCdf,
      taxCdf,
      totalCdf,
      totalUsd: Number((totalCdf / Number(rate.rate)).toFixed(2)),
      paidCdf,
      changeCdf: Math.max(0, paidCdf - totalCdf),
      outstandingCdf: Math.max(0, totalCdf - paidCdf),
      items: previewItems,
    };
  }

  async getSaleByInvoiceNumber(invoiceNumber: string, pharmacyId?: string): Promise<Sale> {
    const sale = await this.prisma.sales.findFirst({
      where: {
        invoice_number: invoiceNumber,
        ...(pharmacyId ? { pharmacy_id: pharmacyId } : {}),
      },
      include: {
        sale_items: {
          include: {
            product_lots: true,
            products: true,
          },
        },
        customers: true,
        sale_payments: true,
        users_sales_user_idTousers: true,
      },
    });
    if (!sale) throw new NotFoundException(`Facture ${invoiceNumber} introuvable.`);
    return this.mapToSale(sale);
  }

  async listSales(
    pharmacyId = '11111111-1111-1111-1111-111111111111',
    filters?: { query?: string; startDate?: string; endDate?: string; status?: string },
  ): Promise<Sale[]> {
    const where: any = { pharmacy_id: pharmacyId };

    // Angular/legacy clients may serialize omitted optional values as the
    // literal string "undefined" (or "null"). Treat those as absent and
    // reject any other unknown enum value as a client error, never a 500.
    const rawStatus = filters?.status?.trim();
    const status = rawStatus && rawStatus !== 'undefined' && rawStatus !== 'null' ? rawStatus : undefined;
    if (status) {
      const validStatuses = ['BROUILLON', 'EN_ATTENTE_PAIEMENT', 'VALIDEE', 'PARTIELLEMENT_PAYEE', 'ANNULEE', 'AVOIR', 'RETOURNEE', 'CONFLIT'];
      if (!validStatuses.includes(status)) {
        throw new BadRequestException(`Statut de vente invalide : ${status}`);
      }
      where.status = status;
    }

    if (filters?.startDate || filters?.endDate) {
      where.created_at = {};
      if (filters.startDate) where.created_at.gte = new Date(filters.startDate);
      if (filters.endDate) {
        const end = new Date(`${filters.endDate}T23:59:59.999`);
        where.created_at.lte = end;
      }
    }

    if (filters?.query?.trim()) {
      const q = filters.query.trim();
      where.OR = [
        { invoice_number: { contains: q, mode: 'insensitive' } },
        { customers: { phone: { contains: q } } },
        { customers: { full_name: { contains: q, mode: 'insensitive' } } },
      ];
    }

    const sales = await this.prisma.sales.findMany({
      where,
      include: {
        sale_items: {
          include: {
            product_lots: true,
            products: true,
          },
        },
        customers: true,
        sale_payments: true,
        users_sales_user_idTousers: true,
      },
      orderBy: { created_at: 'desc' },
      take: 100,
    });

    return sales.map((s) => this.mapToSale(s));
  }

  // VTE-13 & RG-04 : Annulation motivée avec émission d'avoir
  async cancelSale(saleId: string, dto: CancelSaleDto, userId: string, pharmacyId?: string): Promise<Sale> {
    const validUserId = await this.resolveValidUserId(userId);
    const result = await this.prisma.$transaction(async (tx) => {
      const sale = await tx.sales.findUnique({ where: { id: saleId }, include: { sale_items: true, customers: true } });
      if (!sale || (pharmacyId && sale.pharmacy_id !== pharmacyId)) throw new NotFoundException('Facture introuvable.');
      const targetPharmacyId = pharmacyId || sale.pharmacy_id;
      if (sale.status === 'ANNULEE') {
        throw new BadRequestException('Cette facture a déjà été intégralement annulée.');
      }
      // Calculer les quantités déjà retournées par ligne lors d'avoirs précédents
      const existingCreditLines = await tx.credit_note_lines.findMany({
        where: { credit_notes: { sale_id: sale.id } },
      });
      const alreadyReturnedMap = new Map<string, number>();
      for (const cl of existingCreditLines) {
        alreadyReturnedMap.set(cl.sale_item_id, (alreadyReturnedMap.get(cl.sale_item_id) || 0) + cl.quantity);
      }

      const source = new Map(sale.sale_items.map((item) => [item.id, item]));
      const requested = dto.items?.length
        ? dto.items
        : sale.sale_items.map((item) => ({
            saleItemId: item.id,
            quantity: item.quantity - (alreadyReturnedMap.get(item.id) || 0),
            restock: dto.restockItems,
          })).filter((line) => line.quantity > 0);

      if (!requested.length) {
        throw new BadRequestException('Tous les articles de cette facture ont déjà été retournés.');
      }

      let total = 0;
      for (const line of requested) {
        let sourceLine = source.get(line.saleItemId);
        if (!sourceLine) {
          sourceLine = sale.sale_items.find((it) => it.lot_id === line.saleItemId || it.id === line.saleItemId);
          if (sourceLine) {
            line.saleItemId = sourceLine.id;
          }
        }
        if (!sourceLine) throw new BadRequestException(`Ligne de vente ${line.saleItemId} introuvable.`);
        const alreadyReturned = alreadyReturnedMap.get(line.saleItemId) || 0;
        const remainingQuantity = sourceLine.quantity - alreadyReturned;
        if (line.quantity > remainingQuantity) {
          throw new BadRequestException(`Quantité retournée (${line.quantity}) supérieure à la quantité restante vendue (${remainingQuantity}).`);
        }
        total += line.quantity * Number(sourceLine.unit_price_cdf);
      }

      const isNowFullyReturned = sale.sale_items.every((item) => {
        const prev = alreadyReturnedMap.get(item.id) || 0;
        const cur = requested.find((r) => r.saleItemId === item.id)?.quantity || 0;
        return (prev + cur) >= item.quantity;
      });

      const noteNumber = `AVOIR-${new Date().getFullYear()}-${Date.now().toString().slice(-6)}`;
      const note = await tx.credit_notes.create({ data: { pharmacy_id: pharmacyId, sale_id: sale.id, credit_note_number: noteNumber, customer_id: sale.customer_id, total_amount_cdf: total, total_amount_usd: total / Number(sale.exchange_rate_applied), reason: dto.reason, created_by: validUserId } });
      for (const line of requested) {
        const sourceLine = source.get(line.saleItemId)!;
        const restock = line.restock ?? dto.restockItems;
        await tx.credit_note_lines.create({ data: { credit_note_id: note.id, sale_item_id: sourceLine.id, product_id: sourceLine.product_id, lot_id: sourceLine.lot_id, quantity: line.quantity, unit_price_cdf: sourceLine.unit_price_cdf, restocked: restock } });
        if (restock) {
          await tx.product_lots.update({ where: { id: sourceLine.lot_id }, data: { current_quantity: { increment: line.quantity } } });
        }
        await tx.stock_movements.create({ data: { pharmacy_id: pharmacyId, lot_id: sourceLine.lot_id, user_id: validUserId, type: restock ? 'RETOUR_CLIENT' : 'CASSE_PERTE', quantity: line.quantity, direction: restock ? 'IN' : 'OUT', unit_cost_cdf: sourceLine.unit_cost_cump_cdf, reason: `Avoir ${noteNumber} — ${dto.reason}` } });
      }

      // Contre-passation des paiements : limitée strictement à la valeur de cet avoir
      const previousReversals: any[] = await tx.$queryRaw`
        SELECT COALESCE(SUM(amount_cdf), 0) as total_reversed
        FROM sale_payment_reversals
        WHERE sale_id = ${sale.id}::uuid
      `;
      const alreadyReversedCdf = Number(previousReversals[0]?.total_reversed || 0);
      let remainingToReverseCdf = Math.max(0, Math.min(total, Number(sale.total_amount_cdf) - alreadyReversedCdf));
      let cashReversedCdf = 0;
      let creditReversedCdf = 0;

      const payments = await tx.sale_payments.findMany({ where: { sale_id: sale.id }, orderBy: { amount_in_cdf: 'desc' } });
      for (const payment of payments) {
        if (remainingToReverseCdf <= 0) break;
        const payAmount = Number(payment.amount_in_cdf);
        const refundPart = Math.min(payAmount, remainingToReverseCdf);
        await tx.$executeRaw`INSERT INTO sale_payment_reversals (sale_id, payment_id, amount_cdf, payment_method, reason, created_by) VALUES (${sale.id}::uuid, ${payment.id}::uuid, ${refundPart}, ${payment.payment_method}::payment_method, ${dto.reason}, ${validUserId}::uuid)`;
        if (payment.payment_method === 'ESPECES') {
          cashReversedCdf += refundPart;
        } else if (payment.payment_method === 'CREDIT_CLIENT') {
          creditReversedCdf += refundPart;
        }
        remainingToReverseCdf -= refundPart;
      }

      if (cashReversedCdf > 0) {
        const cashSession = await tx.cash_sessions.findFirst({
          where: { user_id: validUserId, status: 'OUVERTE' },
        });
        if (cashSession) {
          await tx.cash_sessions.update({
            where: { id: cashSession.id },
            data: { expected_amount_cdf: { decrement: cashReversedCdf } },
          });
        }
      }

      await tx.sales.update({ where: { id: sale.id }, data: { status: isNowFullyReturned ? 'ANNULEE' : 'AVOIR', cancellation_reason: dto.reason, cancelled_by: validUserId, cancelled_at: new Date() } });
      // Décrémenter le solde client UNIQUEMENT à concurrence de la part de crédit client réellement annulée
      if (sale.customer_id && creditReversedCdf > 0) {
        await tx.customers.update({
          where: { id: sale.customer_id },
          data: { current_balance_cdf: { decrement: creditReversedCdf } },
        });
      }
      return sale;
    }, { maxWait: 15000, timeout: 30000 });
    const updated = await this.prisma.sales.findUniqueOrThrow({ where: { id: result.id }, include: { sale_items: { include: { product_lots: true } }, customers: true } });

    await this.auditService.logAction({
      userId: validUserId,
      userName: 'Pharmacien',
      action: 'VENTE_ANNULEE',
      entityName: 'SALE',
      entityId: result.id,
      oldValues: {
        status: result.status,
        totalAmountCdf: Number(result.total_amount_cdf),
        totalAmountUsd: Number(result.total_amount_usd),
      },
      newValues: {
        status: updated.status,
        invoiceNumber: result.invoice_number,
        reason: dto.reason,
        restocked: dto.restockItems,
      },
    });

    return this.mapToSale(updated);
  }

  async requestCancellation(saleId: string, dto: CreateCancellationRequestDto, userId: string, pharmacyId: string) {
    const sale = await this.prisma.sales.findUnique({ where: { id: saleId, pharmacy_id: pharmacyId } });
    if (!sale) throw new NotFoundException('Facture introuvable.');
    if (sale.status === 'ANNULEE') throw new BadRequestException('Cette facture a déjà été annulée.');

    const validUserId = await this.resolveValidUserId(userId);
    const request = await this.prisma.sale_cancellation_requests.create({
      data: {
        pharmacy_id: pharmacyId,
        sale_id: sale.id,
        requested_by: validUserId,
        reason: dto.reason,
        restock_items: dto.restockItems,
        items: dto.items as any,
      },
    });

    await this.auditService.logAction({
      pharmacyId,
      userId: validUserId,
      userName: 'Caissier',
      action: 'DEMANDE_ANNULATION',
      entityName: 'SALE',
      entityId: sale.id,
      oldValues: { status: sale.status, totalAmountCdf: Number(sale.total_amount_cdf) },
      newValues: { requestId: request.id, reason: dto.reason },
    });

    return this.mapCancellationRequest(request, sale);
  }

  async listCancellationRequests(pharmacyId: string) {
    const requests = await this.prisma.sale_cancellation_requests.findMany({
      where: { pharmacy_id: pharmacyId, status: 'EN_ATTENTE' },
      include: { sales: true },
      orderBy: { created_at: 'desc' },
    });
    return requests.map((request) => this.mapCancellationRequest(request, request.sales));
  }

  async approveCancellationRequest(requestId: string, reviewerId: string, pharmacyId: string): Promise<Sale> {
    const request = await this.prisma.sale_cancellation_requests.findFirst({
      where: { id: requestId, pharmacy_id: pharmacyId, status: 'EN_ATTENTE' },
      include: { sales: true },
    });
    if (!request) throw new NotFoundException('Demande d’annulation introuvable ou déjà traitée.');
    const validReviewerId = await this.resolveValidUserId(reviewerId);
    const sale = await this.cancelSale(request.sale_id, {
      reason: request.reason,
      restockItems: request.restock_items,
      items: (request.items || undefined) as any,
    }, validReviewerId, pharmacyId);
    await this.prisma.sale_cancellation_requests.update({
      where: { id: request.id },
      data: { status: 'APPROUVEE', reviewed_by: validReviewerId, reviewed_at: new Date() },
    });
    return sale;
  }

  async rejectCancellationRequest(requestId: string, reviewerId: string, reason: string, pharmacyId: string) {
    const validReviewerId = await this.resolveValidUserId(reviewerId);
    const request = await this.prisma.sale_cancellation_requests.updateMany({
      where: { id: requestId, pharmacy_id: pharmacyId, status: 'EN_ATTENTE' },
      data: { status: 'REFUSEE', reviewed_by: validReviewerId, reviewed_at: new Date(), review_note: reason },
    });
    if (!request.count) throw new NotFoundException('Demande d’annulation introuvable ou déjà traitée.');
    return { id: requestId, status: 'REFUSEE' };
  }

  private mapCancellationRequest(request: any, sale: any) {
    return {
      id: request.id,
      saleId: request.sale_id,
      invoiceNumber: sale.invoice_number,
      reason: request.reason,
      restockItems: request.restock_items,
      items: request.items || undefined,
      requestedBy: request.requested_by,
      requestedAt: request.created_at.toISOString(),
      status: request.status,
    };
  }

  // VTE-11 : Paniers en attente (Conservation 24h & gestion par vendeur)
  async holdCart(dto: HoldCartDto, pharmacyId: string, userId: string): Promise<HeldCart> {
    const validUserId = await this.resolveValidUserId(userId);
    const rows: any[] = await this.prisma.$queryRaw`
      INSERT INTO held_carts (pharmacy_id, user_id, reference_name, items, customer_id, status, expires_at)
      VALUES (${pharmacyId}::uuid, ${validUserId}::uuid, ${dto.referenceName}, ${JSON.stringify(dto.items)}::jsonb, ${dto.customerId ? dto.customerId : null}::uuid, 'ACTIF', NOW() + INTERVAL '24 hours')
      RETURNING id, reference_name, items, saved_at, expires_at, status
    `;
    return {
      id: rows[0].id,
      pharmacyId,
      userId: validUserId,
      referenceName: rows[0].reference_name,
      items: rows[0].items,
      customerId: dto.customerId,
      savedAt: rows[0].saved_at.toISOString(),
      expiresAt: rows[0].expires_at ? rows[0].expires_at.toISOString() : new Date(Date.now() + 86400000).toISOString(),
      status: rows[0].status || 'ACTIF',
    };
  }

  async listHeldCarts(pharmacyId: string, userId?: string, userRole?: string): Promise<HeldCart[]> {
    // Expirer les paniers de plus de 24h
    await this.prisma.$executeRaw`
      UPDATE held_carts
      SET status = 'EXPIRE'
      WHERE pharmacy_id = ${pharmacyId}::uuid
        AND status = 'ACTIF'
        AND expires_at < NOW()
    `.catch(() => {});

    const rows: any[] = await this.prisma.$queryRaw`
      SELECT h.id, h.reference_name, h.items, h.saved_at, h.expires_at, h.status, h.user_id, h.customer_id,
             u.full_name as user_name, c.full_name as customer_name
      FROM held_carts h
      LEFT JOIN users u ON u.id = h.user_id
      LEFT JOIN customers c ON c.id = h.customer_id
      WHERE h.pharmacy_id = ${pharmacyId}::uuid
        AND h.status = 'ACTIF'
        AND h.resumed_at IS NULL
      ORDER BY h.saved_at DESC
    `;

    return rows.map((row) => ({
      id: row.id,
      pharmacyId,
      userId: row.user_id,
      userName: row.user_name || undefined,
      referenceName: row.reference_name,
      items: row.items,
      customerId: row.customer_id || undefined,
      customerName: row.customer_name || undefined,
      savedAt: row.saved_at.toISOString(),
      expiresAt: row.expires_at ? row.expires_at.toISOString() : '',
      status: row.status as any,
    }));
  }

  async resumeHeldCart(id: string, pharmacyId: string, userId?: string, userRole?: string): Promise<HeldCart> {
    const rows: any[] = await this.prisma.$queryRaw`
      SELECT * FROM held_carts WHERE id = ${id}::uuid AND pharmacy_id = ${pharmacyId}::uuid
    `;
    if (!rows.length) throw new NotFoundException('Panier en attente introuvable.');
    const cart = rows[0];

    if (cart.status !== 'ACTIF' || cart.resumed_at !== null) {
      throw new BadRequestException('Ce panier n’est plus disponible (déjà repris, expiré ou annulé).');
    }
    if (new Date(cart.expires_at).getTime() < Date.now()) {
      await this.prisma.$executeRaw`UPDATE held_carts SET status = 'EXPIRE' WHERE id = ${id}::uuid`;
      throw new BadRequestException('Ce panier a expiré après 24 heures de conservation.');
    }

    if (userId && cart.user_id !== userId && userRole !== 'ADMIN' && userRole !== 'PHARMACIEN') {
      throw new ForbiddenException('Seul le vendeur propriétaire ou un pharmacien peut reprendre ce panier.');
    }

    await this.prisma.$executeRaw`
      UPDATE held_carts SET resumed_at = NOW(), status = 'REPRIS' WHERE id = ${id}::uuid
    `;

    return {
      id: cart.id,
      pharmacyId,
      userId: cart.user_id,
      referenceName: cart.reference_name,
      items: cart.items,
      customerId: cart.customer_id || undefined,
      savedAt: cart.saved_at.toISOString(),
      expiresAt: cart.expires_at.toISOString(),
      resumedAt: new Date().toISOString(),
      status: 'REPRIS',
    };
  }

  // RÉVISION 2.0 : SYNCHRONISATION DES VENTES HORS-LIGNE & GESTION DES CONFLITS
  async syncOfflineSales(
    dto: OfflineSyncBatchRequest,
    currentUserId: string,
    currentUserRole: string,
    pharmacyId: string,
  ): Promise<OfflineSyncBatchResult> {
    const results: OfflineSyncBatchResult['results'] = [];
    let synchronizedCount = 0;
    let conflictCount = 0;
    let rejectedCount = 0;

    const exchangeRateRecord = await this.exchangeRateResolver.getRateAt(pharmacyId);
    const serverRate = Number(exchangeRateRecord.rate);

    for (const offlineSale of dto.sales) {
      const key = offlineSale.idempotencyKey;

      const existing = await this.prisma.sales.findFirst({
        where: { pharmacy_id: pharmacyId, idempotency_key: key },
      });
      if (existing) {
        results.push({
          idempotencyKey: key,
          status: 'SYNCHRONISE',
          invoiceNumber: existing.invoice_number,
          saleId: existing.id,
          appliedExchangeRate: Number(existing.exchange_rate_applied),
        });
        synchronizedCount++;
        continue;
      }

      let hasStockConflict = false;
      const conflictingItems: OfflineConflictItem[] = [];

      for (const item of offlineSale.items) {
        const prod = await this.prisma.products.findUnique({
          where: { id: item.productId },
          include: {
            product_lots: {
              where: {
                current_quantity: { gt: 0 },
                is_quarantined: false,
                expiry_date: { gt: new Date() },
              },
            },
          },
        });

        if (!prod) {
          hasStockConflict = true;
          conflictingItems.push({
            productId: item.productId,
            productName: 'Produit inconnu',
            lotId: item.lotId || '',
            lotNumber: 'N/A',
            requestedQuantity: item.quantity,
            availableStock: 0,
          });
          continue;
        }

        const totalAvailable = prod.product_lots.reduce((acc, l) => acc + l.current_quantity, 0);
        if (totalAvailable < item.quantity) {
          hasStockConflict = true;
          conflictingItems.push({
            productId: prod.id,
            productName: prod.name,
            lotId: item.lotId || '',
            lotNumber: prod.product_lots[0]?.lot_number || 'AUCUN',
            requestedQuantity: item.quantity,
            availableStock: totalAvailable,
          });
        }
      }

      if (hasStockConflict) {
        const conflictDetails: OfflineConflictDetails = {
          conflictingItems,
          offlineExchangeRate: offlineSale.offlineExchangeRate,
          serverExchangeRate: serverRate,
          rateDifferenceCdf: Math.abs(offlineSale.offlineExchangeRate - serverRate),
          detectedAt: new Date().toISOString(),
        };

        const currentFiscalYear = new Date().getFullYear();
        // Attribution d'un numéro de séquence négatif unique pour les conflits afin d'éviter la collision sur (pharmacy_id, fiscal_year, sequence_number)
        const minConflict = await this.prisma.sales.findFirst({
          where: { pharmacy_id: pharmacyId, fiscal_year: currentFiscalYear, sequence_number: { lt: 0 } },
          orderBy: { sequence_number: 'asc' },
          select: { sequence_number: true },
        });
        const conflictSeqNumber = (minConflict?.sequence_number || 0) - 1;

        // Résolution d'une session de caisse existante pour éviter les erreurs de clé étrangère
        let validSessionId = offlineSale.cashSessionId;
        if (validSessionId) {
          const sessionExists = await this.prisma.cash_sessions.findUnique({ where: { id: validSessionId } });
          if (!sessionExists) validSessionId = undefined as any;
        }
        if (!validSessionId) {
          const latestUserSession = await this.prisma.cash_sessions.findFirst({
            where: { pharmacy_id: pharmacyId, user_id: currentUserId },
            orderBy: { opened_at: 'desc' },
          });
          validSessionId = latestUserSession?.id || (await this.prisma.cash_sessions.findFirst({ where: { pharmacy_id: pharmacyId }, orderBy: { opened_at: 'desc' } }))?.id || '11111111-1111-1111-1111-111111111111';
        }

        const conflictSale = await this.prisma.sales.create({
          data: {
            pharmacy_id: pharmacyId,
            cash_session_id: validSessionId,
            invoice_number: `CONFLIT-${key.slice(0, 8).toUpperCase()}`,
            sequence_number: conflictSeqNumber,
            fiscal_year: currentFiscalYear,
            customer_id: offlineSale.customerId || undefined,
            user_id: currentUserId,
            currency: offlineSale.currency,
            exchange_rate_applied: serverRate,
            exchange_rate_id: exchangeRateRecord.id,
            subtotal_cdf: 0,
            discount_cdf: 0,
            tax_amount_cdf: 0,
            total_amount_cdf: offlineSale.amountPaid,
            total_amount_usd: offlineSale.currency === 'USD' ? offlineSale.amountPaid : offlineSale.amountPaid / serverRate,
            idempotency_key: key,
            status: 'CONFLIT',
            is_offline: true,
            sync_status: 'CONFLIT',
            offline_created_at: new Date(offlineSale.offlineCreatedAt),
            offline_exchange_rate: offlineSale.offlineExchangeRate,
            conflict_details: conflictDetails as any,
          },
        });

        await this.auditService.logAction({
          pharmacyId,
          userId: currentUserId,
          userName: 'Synchronisation Offline',
          action: 'CONFLIT_SYNCHRONISATION_STOCK',
          entityName: 'SALE',
          entityId: conflictSale.id,
          newValues: conflictDetails as any,
        });

        await this.prisma.notifications.create({
          data: {
            pharmacy_id: pharmacyId,
            type: 'CONFLIT_STOCK_OFFLINE',
            title: 'Conflit de vente hors-ligne',
            message: `Une vente hors-ligne (${key.slice(0, 8)}) présente un conflit de stock sur ${conflictingItems.map((c) => c.productName).join(', ')}. Arbitrage requis.`,
            severity: 'WARNING',
            target_role: 'PHARMACIEN',
            entity_type: 'SALE',
            entity_id: conflictSale.id,
            dedup_key: `conflict_${conflictSale.id}`,
          },
        }).catch(() => {});

        results.push({
          idempotencyKey: key,
          status: 'CONFLIT',
          saleId: conflictSale.id,
          conflictDetails,
          errorMessage: 'Stock insuffisant sur le serveur. Vente soumise à arbitrage pharmacien.',
        });
        conflictCount++;
        continue;
      }

      try {
        const saleDto: CreateSaleRequestDto = {
          currency: offlineSale.currency,
          customerId: offlineSale.customerId,
          items: offlineSale.items.map((it) => ({
            productId: it.productId,
            quantity: it.quantity,
            discountCdf: it.discountCdf || 0,
            lotId: it.lotId,
          })),
          payments: [
            {
              method: 'ESPECES',
              currency: offlineSale.currency,
              amountPaid: offlineSale.amountPaid,
            },
          ],
        };

        const processed = await this.processSale(
          saleDto,
          offlineSale.userId || currentUserId,
          'CAISSIER',
          pharmacyId,
          key,
        );

        await this.prisma.sales.update({
          where: { id: processed.id },
          data: {
            is_offline: true,
            sync_status: 'SYNCHRONISE',
            offline_created_at: new Date(offlineSale.offlineCreatedAt),
            offline_exchange_rate: offlineSale.offlineExchangeRate,
          },
        });

        if (Math.abs(offlineSale.offlineExchangeRate - serverRate) > 0.01) {
          await this.auditService.logAction({
            pharmacyId,
            userId: currentUserId,
            userName: 'Synchronisation Offline',
            action: 'SYNCHRONISATION_ECART_TAUX',
            entityName: 'SALE',
            entityId: processed.id,
            newValues: {
              offlineExchangeRate: offlineSale.offlineExchangeRate,
              serverExchangeRate: serverRate,
              difference: Math.abs(offlineSale.offlineExchangeRate - serverRate),
            },
          });
        }

        results.push({
          idempotencyKey: key,
          status: 'SYNCHRONISE',
          invoiceNumber: processed.invoiceNumber,
          saleId: processed.id,
          appliedExchangeRate: serverRate,
        });
        synchronizedCount++;
      } catch (err: any) {
        results.push({
          idempotencyKey: key,
          status: 'REJETE',
          errorMessage: err?.message || 'Erreur lors de la validation',
        });
        rejectedCount++;
      }
    }

    return {
      totalSubmitted: dto.sales.length,
      synchronizedCount,
      conflictCount,
      rejectedCount,
      results,
    };
  }

  async listConflicts(pharmacyId: string): Promise<any[]> {
    const conflicts = await this.prisma.sales.findMany({
      where: { pharmacy_id: pharmacyId, status: 'CONFLIT' },
      include: {
        sale_items: { include: { product_lots: true, products: true } },
        customers: true,
        sale_payments: true,
        users_sales_user_idTousers: true,
      },
      orderBy: { created_at: 'desc' },
    });
    return conflicts.map((conflict) => this.mapToSale(conflict));
  }

  async resolveConflict(
    saleId: string,
    dto: ResolveConflictDto,
    pharmacistId: string,
    pharmacyId: string,
  ): Promise<any> {
    const sale = await this.prisma.sales.findUnique({
      where: { id: saleId },
    });
    if (!sale || sale.pharmacy_id !== pharmacyId) {
      throw new NotFoundException('Vente en conflit introuvable.');
    }
    if (sale.status !== 'CONFLIT') {
      throw new BadRequestException('Cette vente n’est pas en état de conflit.');
    }

    const validPharmacistId = await this.resolveValidUserId(pharmacistId);

    if (dto.action === 'VALIDER_PARTIEL' || dto.action === 'REMPLACER_PRODUIT' || dto.action === 'GENERER_AVOIR') {
      throw new BadRequestException('Cette action nécessite un flux de stock et de facturation dédié qui n’est pas disponible pour cette vente en conflit. Choisissez l’annulation ou le maintien en attente.');
    }

    const updated = await this.prisma.sales.update({
      where: { id: saleId },
      data: {
        resolved_by: validPharmacistId,
        resolved_at: new Date(),
        resolution_action: dto.action,
        resolution_notes: dto.reason,
        status: dto.action === 'ANNULER_VENTE' ? 'ANNULEE' : 'CONFLIT',
        sync_status: dto.action === 'ANNULER_VENTE' ? 'SYNCHRONISE' : 'CONFLIT',
      },
    });

    await this.auditService.logAction({
      pharmacyId,
      userId: validPharmacistId,
      userName: 'Pharmacien Responsable',
      action: `RESOLUTION_CONFLIT_${dto.action}`,
      entityName: 'SALE',
      entityId: saleId,
      newValues: {
        action: dto.action,
        reason: dto.reason,
        adjustedItems: dto.adjustedItems,
        resolvedAt: new Date().toISOString(),
      },
    });

    return updated;
  }

  // VTE-16 : Duplicata
  async getDuplicata(invoiceNumber: string, userId?: string, pharmacyId?: string) {
    const sale = await this.getSaleByInvoiceNumber(invoiceNumber, pharmacyId);

    await this.auditService.logAction({
      userId: userId || 'caissier',
      userName: 'Caissier',
      action: 'REIMPRESSION_DUPLICATA',
      entityName: 'SALE',
      entityId: sale.id,
      newValues: { invoiceNumber },
    });

    return {
      ...sale,
      isDuplicata: true,
      watermark: 'DUPLICATA',
      reprintedAt: new Date().toISOString(),
    };
  }

  async renderDocument(invoiceNumber: string, ticket = false, duplicate = false, pharmacyId?: string): Promise<string> {
    const sale = await this.getSaleByInvoiceNumber(invoiceNumber, pharmacyId);
    const identity = this.settingsService.getPharmacyIdentity();
    const printTemplates = this.settingsService.getPrintTemplates();

    const showLogo = ticket
      ? (printTemplates.showLogoOnTicket ?? true) && !!identity.logoUrl
      : (printTemplates.showLogoOnInvoice ?? true) && !!identity.logoUrl;

    if (duplicate) {
      await this.auditService.logAction({
        userId: undefined,
        action: 'REIMPRESSION_DUPLICATA',
        entityName: 'SALE',
        entityId: sale.id,
        newValues: { invoiceNumber, timestamp: new Date().toISOString() },
      });
    }

    // Ventilation fiscale
    let rawSubtotalCdf = 0;
    let totalDiscountCdf = 0;
    let baseTaxableCdf = 0;
    let totalTaxCdf = 0;
    let totalExonereCdf = 0;

    for (const item of sale.items) {
      const lineRaw = item.quantity * item.unitPriceCdf;
      rawSubtotalCdf += lineRaw;
      const discount = item.discountCdf || 0;
      totalDiscountCdf += discount;
      const netLine = lineRaw - discount;
      if (item.taxRate && item.taxRate > 0) {
        baseTaxableCdf += netLine;
        totalTaxCdf += netLine * (item.taxRate / 100);
      } else {
        totalExonereCdf += netLine;
      }
    }

    const itemsRows = sale.items
      .map(
        (item) => `
        <tr>
          <td>
            <strong>${item.productName || 'Article'}</strong>
            <br><small style="color:#666">Lot : ${item.lotNumber} | Pér : ${item.expiryDate || 'N/A'}</small>
          </td>
          <td style="text-align:center">${item.quantity}</td>
          <td style="text-align:right">${item.unitPriceCdf.toLocaleString('fr-CD', { minimumFractionDigits: 2 })}</td>
          <td style="text-align:right">${(item.discountCdf || 0).toLocaleString('fr-CD', { minimumFractionDigits: 2 })}</td>
          <td style="text-align:right; font-weight:bold">${item.totalLineCdf.toLocaleString('fr-CD', { minimumFractionDigits: 2 })}</td>
        </tr>`,
      )
      .join('');

    const paymentsRows = (sale.payments || [])
      .map(
        (p) => `
        <div style="display:flex; justify-content:space-between; font-size:12px; margin-bottom:2px">
          <span>Mode : <strong>${p.method}</strong> ${p.mobileMoneyProvider ? `(${p.mobileMoneyProvider})` : ''} ${p.transactionReference ? `[Réf: ${p.transactionReference}]` : ''}</span>
          <strong>${p.amountPaid.toLocaleString('fr-CD', { minimumFractionDigits: 2 })} ${p.currency}</strong>
        </div>`,
      )
      .join('');

    const duplicateBanner = duplicate
      ? `
      <div class="duplicate-banner">
        *** DUPLICATA OFFICIEL ***<br>
        <span style="font-size:11px; font-weight:normal">Réimpression du ${new Date().toLocaleString('fr-CD')} - Ne donne droit à aucun nouveau déstockage ni remboursement</span>
      </div>`
      : '';

    return `<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <title>${sale.invoiceNumber}</title>
  <style>
    @media print {
      @page { size: ${ticket ? '80mm auto' : 'A4'}; margin: ${ticket ? '3mm' : '10mm'}; }
      body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      font-size: ${ticket ? '11px' : '13px'};
      line-height: 1.35;
      color: #111;
      max-width: ${ticket ? '74mm' : '190mm'};
      margin: auto;
      background: #fff;
    }
    .header-box { text-align: center; border-bottom: 2px dashed #000; padding-bottom: 8px; margin-bottom: 8px; }
    .pharmacy-name { font-size: ${ticket ? '15px' : '18px'}; font-weight: 800; text-transform: uppercase; margin: 0 0 4px; }
    .header-meta { font-size: 10px; color: #333; line-height: 1.3; }
    .duplicate-banner {
      border: 2px solid #b91c1c;
      color: #b91c1c;
      background: #fef2f2;
      padding: 6px;
      text-align: center;
      font-weight: 800;
      font-size: 13px;
      margin: 8px 0;
      border-radius: 4px;
    }
    .sale-info { margin: 8px 0; font-size: 11px; border-bottom: 1px solid #ddd; padding-bottom: 6px; }
    .sale-info-row { display: flex; justify-content: space-between; margin-bottom: 2px; }
    table { width: 100%; border-collapse: collapse; margin: 8px 0; }
    th { border-bottom: 1px solid #000; padding: 4px 2px; font-size: 11px; text-transform: uppercase; }
    td { border-bottom: 1px dotted #ccc; padding: 4px 2px; vertical-align: top; }
    .totals-box { border-top: 1px solid #000; padding-top: 6px; margin-top: 6px; }
    .total-row { display: flex; justify-content: space-between; font-size: 12px; margin-bottom: 3px; }
    .grand-total { font-size: ${ticket ? '14px' : '16px'}; font-weight: 900; border-top: 1px solid #000; padding-top: 4px; margin-top: 4px; }
    .usd-equiv { color: #047857; font-weight: bold; }
    .tax-box { background: #f9fafb; border: 1px solid #e5e7eb; padding: 6px; border-radius: 4px; margin: 8px 0; font-size: 10px; }
    .legal-notice { font-size: 9px; color: #555; text-align: center; margin-top: 12px; border-top: 1px dotted #ccc; padding-top: 6px; }
  </style>
</head>
<body>
  <div class="header-box">
    ${
      showLogo
        ? `<div class="logo-wrapper" style="text-align: center; margin-bottom: 8px;">
      <img src="${identity.logoUrl}" alt="Logo Officine" style="max-height: ${ticket ? '48px' : '75px'}; max-width: ${ticket ? '140px' : '220px'}; object-fit: contain;" />
    </div>`
        : ''
    }
    <div class="pharmacy-name">${identity.name}</div>
    <div class="header-meta">
      ${identity.address}<br>
      Tél : ${identity.phone || '+243 ...'} | Email : ${identity.email || ''}<br>
      RCCM : ${identity.rccm || 'N/A'} | ID.NAT : ${identity.idNat || 'N/A'} | NIF : ${identity.nif || (identity as any).taxNumber || 'N/A'}
    </div>
    ${
      ticket && printTemplates.ticketHeader
        ? `<div class="ticket-header-text" style="font-size: 10px; font-style: italic; margin-top: 5px; text-align: center; border-top: 1px dotted #888; padding-top: 4px;">${printTemplates.ticketHeader.replace(/\n/g, '<br>')}</div>`
        : ''
    }
    ${
      !ticket && printTemplates.invoiceHeader
        ? `<div class="invoice-header-text" style="font-size: 13px; font-weight: 700; margin-top: 6px; text-align: center; border-top: 1px solid #111; padding-top: 4px;">${printTemplates.invoiceHeader.replace(/\n/g, '<br>')}</div>`
        : ''
    }
  </div>

  ${duplicateBanner}

  <div class="sale-info">
    <div class="sale-info-row">
      <span><strong>Facture N° :</strong> ${sale.invoiceNumber}</span>
      <span>${new Date(sale.createdAt).toLocaleString('fr-CD')}</span>
    </div>
    <div class="sale-info-row">
      <span><strong>Client :</strong> ${sale.customerName || 'Client comptoir'}</span>
      <span>${sale.customerPhone ? `Tél: ${sale.customerPhone}` : ''}</span>
    </div>
    <div class="sale-info-row">
      <span><strong>Vendeur :</strong> ${sale.cashierName || 'Vendeur'}</span>
      <span>${sale.isOffline ? '<span style="color:#b45309;font-weight:bold">[Vente hors-ligne synchronisée]</span>' : ''}</span>
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th style="text-align:left">Désignation</th>
        <th style="text-align:center">Qté</th>
        <th style="text-align:right">P.U</th>
        <th style="text-align:right">Rem.</th>
        <th style="text-align:right">Total CDF</th>
      </tr>
    </thead>
    <tbody>
      ${itemsRows}
    </tbody>
  </table>

  <div class="totals-box">
    <div class="total-row">
      <span>Sous-total brut :</span>
      <span>${rawSubtotalCdf.toLocaleString('fr-CD', { minimumFractionDigits: 2 })} CDF</span>
    </div>
    ${
      totalDiscountCdf > 0
        ? `<div class="total-row" style="color:#b91c1c">
      <span>Total remises accordées :</span>
      <span>-${totalDiscountCdf.toLocaleString('fr-CD', { minimumFractionDigits: 2 })} CDF</span>
    </div>`
        : ''
    }
    <div class="total-row grand-total">
      <span>NET À PAYER :</span>
      <span>${sale.totalAmountCdf.toLocaleString('fr-CD', { minimumFractionDigits: 2 })} CDF</span>
    </div>
    <div class="total-row usd-equiv">
      <span>Contre-valeur USD :</span>
      <span>${sale.totalAmountUsd.toLocaleString('fr-CD', { minimumFractionDigits: 2 })} USD</span>
    </div>
    <div style="font-size:10px; color:#666; text-align:right; margin-bottom:6px">
      (Taux appliqué : 1 USD = ${sale.appliedExchangeRate.toLocaleString('fr-CD')} CDF)
    </div>
  </div>

  <!-- Ventilation fiscale officielle RDC -->
  <div class="tax-box">
    <strong>Ventilation Fiscale :</strong><br>
    Base imposable TVA (16%) : ${baseTaxableCdf.toLocaleString('fr-CD', { minimumFractionDigits: 2 })} CDF | TVA collectée : ${totalTaxCdf.toLocaleString('fr-CD', { minimumFractionDigits: 2 })} CDF<br>
    Articles exonérés de TVA : ${totalExonereCdf.toLocaleString('fr-CD', { minimumFractionDigits: 2 })} CDF
  </div>

  <!-- Règlement perçu -->
  ${
    sale.payments && sale.payments.length > 0
      ? `
  <div style="margin: 8px 0; border-top: 1px dotted #ccc; padding-top: 6px;">
    <div style="font-size:11px; font-weight:bold; margin-bottom:4px">Règlements reçus :</div>
    ${paymentsRows}
  </div>`
      : ''
  }

  <div class="legal-notice">
    ${
      ticket && printTemplates.ticketFooter
        ? `<div style="font-weight: 600; margin-bottom: 4px; font-size: 10px;">${printTemplates.ticketFooter}</div>`
        : ''
    }
    ${
      !ticket && printTemplates.invoiceFooter
        ? `<div style="font-weight: 600; margin-bottom: 4px; font-size: 11px;">${printTemplates.invoiceFooter}</div>`
        : ''
    }
    ${identity.invoiceFooter || (identity as any).receiptFooterText || 'Tout médicament vendu ne peut être repris ni échangé sans accord préalable du pharmacien responsable.'}<br>
    ${identity.legalNotice || (identity as any).invoiceLegalNotice || ''}
  </div>
</body>
</html>`;
  }

  private parseImageForPdf(dataUrl?: string): {
    width: number;
    height: number;
    stream: Buffer;
    isJpeg: boolean;
    smask?: Buffer;
  } | null {
    if (!dataUrl || typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image/')) {
      return null;
    }
    const match = dataUrl.match(/^data:image\/([a-zA-Z0-9+.-]+);base64,(.+)$/);
    if (!match) return null;
    const buf = Buffer.from(match[2], 'base64');
    if (buf.length < 8) return null;

    // 1. JPEG
    if (buf[0] === 0xff && buf[1] === 0xd8) {
      let pos = 2;
      while (pos < buf.length - 8) {
        if (buf[pos] !== 0xff) {
          pos++;
          continue;
        }
        const marker = buf[pos + 1];
        if (
          (marker >= 0xc0 && marker <= 0xc3) ||
          (marker >= 0xc5 && marker <= 0xc7) ||
          (marker >= 0xc9 && marker <= 0xcb) ||
          (marker >= 0xcd && marker <= 0xcf)
        ) {
          const height = buf.readUInt16BE(pos + 5);
          const width = buf.readUInt16BE(pos + 7);
          if (width > 0 && height > 0) {
            return { width, height, stream: buf, isJpeg: true };
          }
        }
        const len = buf.readUInt16BE(pos + 2);
        pos += 2 + len;
      }
      return null;
    }

    // 2. PNG
    if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {
      try {
        let pos = 8;
        let width = 0;
        let height = 0;
        let colorType = 0;
        const idats: Buffer[] = [];
        while (pos < buf.length) {
          const len = buf.readUInt32BE(pos);
          const type = buf.slice(pos + 4, pos + 8).toString('ascii');
          if (type === 'IHDR') {
            width = buf.readUInt32BE(pos + 8);
            height = buf.readUInt32BE(pos + 12);
            colorType = buf[pos + 17];
          } else if (type === 'IDAT') {
            idats.push(buf.slice(pos + 8, pos + 8 + len));
          }
          pos += 12 + len;
        }
        if (!width || !height || idats.length === 0) return null;
        const inflated = zlib.inflateSync(Buffer.concat(idats));
        const bpp = colorType === 6 ? 4 : colorType === 2 ? 3 : 0;
        if (!bpp) return null;

        const bytesPerLine = width * bpp;
        const raw = Buffer.alloc(width * height * bpp);
        let srcPos = 0;
        for (let y = 0; y < height; y++) {
          const filter = inflated[srcPos++];
          const lineStart = y * bytesPerLine;
          const prevLineStart = (y - 1) * bytesPerLine;
          for (let x = 0; x < bytesPerLine; x++) {
            const left = x >= bpp ? raw[lineStart + x - bpp] : 0;
            const up = y > 0 ? raw[prevLineStart + x] : 0;
            const upLeft = y > 0 && x >= bpp ? raw[prevLineStart + x - bpp] : 0;
            let val = inflated[srcPos++];
            if (filter === 1) val = (val + left) & 0xff;
            else if (filter === 2) val = (val + up) & 0xff;
            else if (filter === 3) val = (val + Math.floor((left + up) / 2)) & 0xff;
            else if (filter === 4) {
              const p = left + up - upLeft;
              const pa = Math.abs(p - left);
              const pb = Math.abs(p - up);
              const pc = Math.abs(p - upLeft);
              let pr = upLeft;
              if (pa <= pb && pa <= pc) pr = left;
              else if (pb <= pc) pr = up;
              val = (val + pr) & 0xff;
            }
            raw[lineStart + x] = val;
          }
        }

        if (colorType === 6) {
          const rgb = Buffer.alloc(width * height * 3);
          const alpha = Buffer.alloc(width * height);
          for (let i = 0, j = 0; i < width * height; i++) {
            rgb[j++] = raw[i * 4];
            rgb[j++] = raw[i * 4 + 1];
            rgb[j++] = raw[i * 4 + 2];
            alpha[i] = raw[i * 4 + 3];
          }
          return {
            width,
            height,
            stream: zlib.deflateSync(rgb),
            isJpeg: false,
            smask: zlib.deflateSync(alpha),
          };
        }

        return {
          width,
          height,
          stream: zlib.deflateSync(raw),
          isJpeg: false,
        };
      } catch {
        return null;
      }
    }

    return null;
  }

  /** Génère un PDF autonome (sans dépendance native) pour facture/ticket avec support des caractères accentués (WinAnsiEncoding) et logo officiel. */
  async renderPdf(invoiceNumber: string, ticket = false, duplicate = false, pharmacyId?: string): Promise<Buffer> {
    const sale = await this.getSaleByInvoiceNumber(invoiceNumber, pharmacyId);
    const identity = this.settingsService.getPharmacyIdentity();
    const printTemplates = this.settingsService.getPrintTemplates();

    const showLogo = ticket
      ? (printTemplates.showLogoOnTicket ?? true) && !!identity.logoUrl
      : (printTemplates.showLogoOnInvoice ?? true) && !!identity.logoUrl;

    const img = showLogo ? this.parseImageForPdf(identity.logoUrl) : null;

    const sanitizeForWinAnsi = (text: string) => {
      const map: Record<string, string> = {
        'é': '\xE9', 'è': '\xE8', 'ê': '\xEA', 'ë': '\xEB',
        'à': '\xE0', 'â': '\xE2', 'ä': '\xE4',
        'î': '\xEE', 'ï': '\xEF',
        'ô': '\xF4', 'ö': '\xF6',
        'ù': '\xF9', 'û': '\xFB', 'ü': '\xFC',
        'ç': '\xE7',
        'É': '\xC9', 'È': '\xC8', 'Ê': '\xCA', 'Ë': '\xCB',
        'À': '\xC0', 'Â': '\xC2', 'Ä': '\xC4',
        'Î': '\xCE', 'Ï': '\xCF',
        'Ô': '\xD4', 'Ö': '\xD6',
        'Ù': '\xD9', 'Û': '\xDB', 'Ü': '\xDC',
        'Ç': '\xC7',
        '’': '\x27', '‘': '\x27', '“': '\x22', '”': '\x22',
        '«': '\xAB', '»': '\xBB', '–': '-', '—': '-',
        '°': '\xB0',
      };
      let out = '';
      for (const ch of String(text || '')) {
        if (map[ch]) out += map[ch];
        else if (ch.charCodeAt(0) >= 32 && ch.charCodeAt(0) <= 126) out += ch;
        else out += '?';
      }
      return out.replace(/[()\\]/g, '\\$&');
    };

    const lines = [
      sanitizeForWinAnsi(identity.name),
      sanitizeForWinAnsi(identity.address),
      sanitizeForWinAnsi(`RCCM: ${identity.rccm || 'N/A'} | NIF: ${identity.nif || (identity as any).taxNumber || 'N/A'}`),
      ticket && printTemplates.ticketHeader ? sanitizeForWinAnsi(printTemplates.ticketHeader) : '',
      !ticket && printTemplates.invoiceHeader ? sanitizeForWinAnsi(printTemplates.invoiceHeader) : '',
      duplicate ? '*** DUPLICATA OFFICIEL ***' : '',
      `Facture ${sale.invoiceNumber} - ${new Date(sale.createdAt).toLocaleDateString('fr-CD')}`,
      `Client : ${sanitizeForWinAnsi(sale.customerName || 'Client comptoir')}`,
      `Vendeur : ${sanitizeForWinAnsi(sale.cashierName || 'Vendeur')}`,
      '----------------------------------------',
      ...sale.items.map((item) =>
        sanitizeForWinAnsi(
          `${(item.productName || item.lotNumber).slice(0, 22)} x${item.quantity} = ${item.totalLineCdf.toFixed(0)} CDF`,
        ),
      ),
      '----------------------------------------',
      `TOTAL : ${sale.totalAmountCdf.toFixed(2)} CDF`,
      `CONTRE-VALEUR : ${sale.totalAmountUsd.toFixed(2)} USD`,
      `(Taux applique : 1 USD = ${sale.appliedExchangeRate.toFixed(0)} CDF)`,
      ticket && printTemplates.ticketFooter ? sanitizeForWinAnsi(printTemplates.ticketFooter) : '',
      !ticket && printTemplates.invoiceFooter ? sanitizeForWinAnsi(printTemplates.invoiceFooter) : '',
      sanitizeForWinAnsi(identity.invoiceFooter || (identity as any).receiptFooterText || ''),
    ].filter(Boolean);

    const pageWidth = ticket ? 226 : 595;
    let dispW = 0;
    let dispH = 0;
    let imgX = 0;
    let imgY = 0;
    let pageHeight = ticket ? Math.max(300, 90 + lines.length * 16) : 842;

    if (img) {
      if (ticket) {
        dispW = Math.min(100, img.width);
        dispH = dispW / (img.width / img.height);
        if (dispH > 42) {
          dispH = 42;
          dispW = dispH * (img.width / img.height);
        }
        pageHeight += Math.ceil(dispH) + 12;
        imgX = (pageWidth - dispW) / 2;
        imgY = pageHeight - dispH - 16;
      } else {
        dispW = Math.min(140, img.width);
        dispH = dispW / (img.width / img.height);
        if (dispH > 60) {
          dispH = 60;
          dispW = dispH * (img.width / img.height);
        }
        imgX = (pageWidth - dispW) / 2;
        imgY = pageHeight - dispH - 24;
      }
    }

    const textStartY = img ? Math.floor(imgY - 18) : pageHeight - 30;

    const contentCommands: string[] = [];
    if (img) {
      contentCommands.push(
        'q',
        `${dispW.toFixed(2)} 0 0 ${dispH.toFixed(2)} ${imgX.toFixed(2)} ${imgY.toFixed(2)} cm`,
        '/Im1 Do',
        'Q',
      );
    }
    contentCommands.push(
      'BT',
      '/F1 10 Tf',
      `20 ${textStartY} Td`,
      ...lines.map((line, index) => `(${line}) Tj${index < lines.length - 1 ? ' 0 -16 Td' : ''}`),
      'ET',
    );
    const content = contentCommands.join('\n');

    const xobjRes = img ? '/XObject << /Im1 6 0 R >> ' : '';

    const objects = [
      '<< /Type /Catalog /Pages 2 0 R >>',
      '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /Font << /F1 5 0 R >> ${xobjRes}>> /Contents 4 0 R >>`,
      `<< /Length ${Buffer.byteLength(content, 'latin1')} >>\nstream\n${content}\nendstream`,
      '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
    ];

    if (img) {
      const smaskRef = img.smask ? ' /SMask 7 0 R' : '';
      const filter = img.isJpeg ? '/Filter /DCTDecode' : '/Filter /FlateDecode';
      objects.push(
        `<< /Type /XObject /Subtype /Image /Width ${img.width} /Height ${img.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 ${filter}${smaskRef} /Length ${img.stream.length} >>\nstream\n${img.stream.toString('binary')}\nendstream`,
      );
      if (img.smask) {
        objects.push(
          `<< /Type /XObject /Subtype /Image /Width ${img.width} /Height ${img.height} /ColorSpace /DeviceGray /BitsPerComponent 8 /Filter /FlateDecode /Length ${img.smask.length} >>\nstream\n${img.smask.toString('binary')}\nendstream`,
        );
      }
    }

    let pdf = '%PDF-1.4\n';
    const offsets: number[] = [0];
    for (let i = 0; i < objects.length; i++) {
      offsets.push(Buffer.byteLength(pdf, 'latin1'));
      pdf += `${i + 1} 0 obj\n${objects[i]}\nendobj\n`;
    }
    const xref = Buffer.byteLength(pdf, 'latin1');
    pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.slice(1).map((o) => `${String(o).padStart(10, '0')} 00000 n `).join('\n')}\ntrailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
    return Buffer.from(pdf, 'latin1');
  }

  private mapToSale(dbSale: any): Sale {
    return {
      id: dbSale.id,
      invoiceNumber: dbSale.invoice_number,
      customerName: dbSale.customers?.full_name || 'Client comptoir',
      customerPhone: dbSale.customers?.phone || undefined,
      cashierName: dbSale.users_sales_user_idTousers?.full_name || dbSale.users?.full_name || 'Vendeur',
      cashSessionId: dbSale.cash_session_id || undefined,
      subtotalCdf: dbSale.subtotal_cdf ? Number(dbSale.subtotal_cdf) : undefined,
      discountCdf: dbSale.discount_cdf ? Number(dbSale.discount_cdf) : 0,
      taxAmountCdf: dbSale.tax_amount_cdf ? Number(dbSale.tax_amount_cdf) : 0,
      totalAmountCdf: Number(dbSale.total_amount_cdf),
      totalAmountUsd: Number(dbSale.total_amount_usd),
      appliedExchangeRate: Number(dbSale.exchange_rate_applied),
      currency: dbSale.currency,
      status: dbSale.status,
      syncStatus: dbSale.sync_status || undefined,
      isOffline: Boolean(dbSale.is_offline),
      createdAt: dbSale.created_at.toISOString(),
      items: dbSale.sale_items?.map((it: any) => ({
        id: it.id,
        lotId: it.lot_id,
        lotNumber: it.product_lots?.lot_number || '',
        productName: it.products?.name || it.product_lots?.products?.name || 'Article',
        expiryDate: it.product_lots?.expiry_date ? it.product_lots.expiry_date.toISOString().split('T')[0] : '',
        quantity: it.quantity,
        unitPriceCdf: Number(it.unit_price_cdf),
        unitCostCumpCdf: Number(it.unit_cost_cump_cdf),
        discountCdf: Number(it.discount_amount_cdf),
        taxRate: it.tax_rate ? Number(it.tax_rate) : 0,
        totalLineCdf: Number(it.total_line_cdf),
      })) ?? [],
      payments: dbSale.sale_payments?.map((p: any) => ({
        method: p.payment_method,
        amountPaid: Number(p.amount_paid),
        amountCdf: Number(p.amount_in_cdf),
        currency: p.currency,
        mobileMoneyProvider: p.mobile_money_provider || undefined,
        transactionReference: p.transaction_reference || undefined,
      })),
      conflictDetails: dbSale.conflict_details || undefined,
    };
  }
}
