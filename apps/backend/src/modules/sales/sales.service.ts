import {
  Injectable,
  BadRequestException,
  ConflictException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { Sale, SaleItemAllocation, SaleStatus } from '@vhp/shared';
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

export interface HeldCart {
  id: string;
  referenceName: string;
  items: any[];
  savedAt: string;
}

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
    const admin = await this.prisma.users.findFirst({ where: { username: 'admin' } });
    return admin?.id || '22222222-2222-2222-2222-222222222221';
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
    }

    // Valider ou obtenir un utilisateur valide dans la base
    const validUserId = await this.resolveValidUserId(userId);

    // 2. Vérification des produits et ordonnances (RG-09)
    const exchangeRate = await this.prisma.exchange_rates.findFirst({ where: { pharmacy_id: pharmacyId }, orderBy: { effective_date: 'desc' } });
    if (!exchangeRate) throw new BadRequestException('Aucun taux de change actif n’est défini pour cette officine.');
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
          this.auditService.logAction({
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
        const persistedPayments: any[] = outstandingCdf > 0 && !creditPayment ? [...dto.payments, { method: 'CREDIT_CLIENT', currency: 'CDF', amountPaid: outstandingCdf }] : dto.payments;
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
    this.auditService.logAction({
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
      this.auditService.logAction({
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

  async getSaleById(id: string): Promise<Sale> {
    const sale = await this.prisma.sales.findUnique({
      where: { id },
      include: {
        sale_items: {
          include: { product_lots: true },
        },
        customers: true,
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
    const rate = await this.prisma.exchange_rates.findFirst({ where: { pharmacy_id: pharmacyId }, orderBy: { effective_date: 'desc' } });
    if (!rate) throw new BadRequestException('Aucun taux de change actif n’est défini pour cette officine.');
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
          include: { product_lots: true },
        },
        customers: true,
      },
    });
    if (!sale) throw new NotFoundException(`Facture ${invoiceNumber} introuvable.`);
    return this.mapToSale(sale);
  }

  async listSales(pharmacyId = '11111111-1111-1111-1111-111111111111'): Promise<Sale[]> {
    const sales = await this.prisma.sales.findMany({
      where: { pharmacy_id: pharmacyId },
      include: {
        sale_items: {
          include: { product_lots: true },
        },
        customers: true,
      },
      orderBy: { created_at: 'desc' },
    });

    return sales.map((s) => this.mapToSale(s));
  }

  // VTE-13 & RG-04 : Annulation motivée avec émission d'avoir
  async cancelSale(saleId: string, dto: CancelSaleDto, userId: string, pharmacyId = '11111111-1111-1111-1111-111111111111'): Promise<Sale> {
    const validUserId = await this.resolveValidUserId(userId);
    const result = await this.prisma.$transaction(async (tx) => {
      const sale = await tx.sales.findUnique({ where: { id: saleId, pharmacy_id: pharmacyId }, include: { sale_items: true, customers: true } });
      if (!sale) throw new NotFoundException('Facture introuvable.');
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

      const payments = await tx.sale_payments.findMany({ where: { sale_id: sale.id }, orderBy: { amount_in_cdf: 'desc' } });
      for (const payment of payments) {
        if (remainingToReverseCdf <= 0) break;
        const payAmount = Number(payment.amount_in_cdf);
        const refundPart = Math.min(payAmount, remainingToReverseCdf);
        await tx.$executeRaw`INSERT INTO sale_payment_reversals (sale_id, payment_id, amount_cdf, payment_method, reason, created_by) VALUES (${sale.id}::uuid, ${payment.id}::uuid, ${refundPart}, ${payment.payment_method}::payment_method, ${dto.reason}, ${validUserId}::uuid)`;
        if (payment.payment_method === 'ESPECES') {
          cashReversedCdf += refundPart;
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
      if (sale.customer_id) await tx.customers.update({ where: { id: sale.customer_id }, data: { current_balance_cdf: { decrement: Math.min(Number(sale.total_amount_cdf), total) } } });
      return sale;
    }, { maxWait: 15000, timeout: 30000 });
    const updated = await this.prisma.sales.findUniqueOrThrow({ where: { id: result.id }, include: { sale_items: { include: { product_lots: true } }, customers: true } });

    this.auditService.logAction({
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

  // VTE-13 : Demandes d'annulation transmises par le caissier au pharmacien
  private cancellationRequests = new Map<string, any>();

  async requestCancellation(saleId: string, dto: CreateCancellationRequestDto, userId: string, pharmacyId: string) {
    const sale = await this.prisma.sales.findUnique({ where: { id: saleId, pharmacy_id: pharmacyId } });
    if (!sale) throw new NotFoundException('Facture introuvable.');
    if (sale.status === 'ANNULEE') throw new BadRequestException('Cette facture a déjà été annulée.');

    const requestId = `req-${Date.now()}`;
    const requestData = {
      id: requestId,
      saleId: sale.id,
      invoiceNumber: sale.invoice_number,
      reason: dto.reason,
      restockItems: dto.restockItems,
      items: dto.items,
      requestedBy: userId,
      requestedAt: new Date().toISOString(),
      status: 'EN_ATTENTE',
    };
    this.cancellationRequests.set(requestId, requestData);

    this.auditService.logAction({
      pharmacyId,
      userId,
      userName: 'Caissier',
      action: 'DEMANDE_ANNULATION',
      entityName: 'SALE',
      entityId: sale.id,
      oldValues: { status: sale.status, totalAmountCdf: Number(sale.total_amount_cdf) },
      newValues: { requestId, reason: dto.reason },
    });

    return requestData;
  }

  async listCancellationRequests(pharmacyId: string) {
    return Array.from(this.cancellationRequests.values()).sort((a, b) => b.requestedAt.localeCompare(a.requestedAt));
  }

  // VTE-11 : Paniers en attente
  async holdCart(dto: HoldCartDto, pharmacyId: string, userId: string): Promise<HeldCart> {
    const validUserId = await this.resolveValidUserId(userId);
    const rows: any[] = await this.prisma.$queryRaw`INSERT INTO held_carts (pharmacy_id, user_id, reference_name, items) VALUES (${pharmacyId}::uuid, ${validUserId}::uuid, ${dto.referenceName}, ${JSON.stringify(dto.items)}::jsonb) RETURNING id, reference_name, items, saved_at`;
    return { id: rows[0].id, referenceName: rows[0].reference_name, items: rows[0].items, savedAt: rows[0].saved_at.toISOString() };
  }

  async listHeldCarts(pharmacyId: string): Promise<HeldCart[]> {
    const rows: any[] = await this.prisma.$queryRaw`SELECT id, reference_name, items, saved_at FROM held_carts WHERE pharmacy_id = ${pharmacyId}::uuid AND resumed_at IS NULL ORDER BY saved_at DESC`;
    return rows.map((row) => ({ id: row.id, referenceName: row.reference_name, items: row.items, savedAt: row.saved_at.toISOString() }));
  }

  async resumeHeldCart(id: string, pharmacyId: string): Promise<HeldCart> {
    const rows: any[] = await this.prisma.$queryRaw`UPDATE held_carts SET resumed_at = NOW() WHERE id = ${id}::uuid AND pharmacy_id = ${pharmacyId}::uuid AND resumed_at IS NULL RETURNING id, reference_name, items, saved_at`;
    if (!rows.length) throw new NotFoundException('Panier en attente introuvable.');
    return { id: rows[0].id, referenceName: rows[0].reference_name, items: rows[0].items, savedAt: rows[0].saved_at.toISOString() };
  }

  // VTE-16 : Duplicata
  async getDuplicata(invoiceNumber: string, userId?: string, pharmacyId?: string) {
    const sale = await this.getSaleByInvoiceNumber(invoiceNumber, pharmacyId);

    this.auditService.logAction({
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

  async renderDocument(invoiceNumber: string, ticket = false, duplicate = false): Promise<string> {
    const sale = await this.getSaleByInvoiceNumber(invoiceNumber);
    const identity = this.settingsService.getPharmacyIdentity();
    const lines = sale.items.map((item) => `<tr><td>${item.lotNumber}</td><td>${item.quantity}</td><td>${item.unitPriceCdf.toFixed(2)}</td><td>${item.totalLineCdf.toFixed(2)}</td></tr>`).join('');
    if (duplicate) await this.auditService.logAction({ userId: undefined, action: 'REIMPRESSION_DUPLICATA', entityName: 'SALE', entityId: sale.id, newValues: { invoiceNumber } });
    return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>${sale.invoiceNumber}</title><style>@media print{ @page{size:${ticket ? '80mm auto' : 'A4'};margin:4mm} }body{font-family:Arial,sans-serif;font-size:${ticket ? '11px' : '13px'};max-width:${ticket ? '72mm' : '190mm'};margin:auto}.duplicate{font-size:22px;color:#b00;font-weight:bold;text-align:center;border:2px solid #b00;padding:4px}table{width:100%;border-collapse:collapse}td,th{border-bottom:1px solid #ddd;padding:3px;text-align:right}td:first-child,th:first-child{text-align:left}</style></head><body><h2>${identity.name}</h2><p>${identity.address}<br>${identity.phone || ''}</p>${duplicate ? '<div class="duplicate">DUPLICATA</div>' : ''}<h3>Facture ${sale.invoiceNumber}</h3><table><thead><tr><th>Lot</th><th>Qté</th><th>PU</th><th>Total</th></tr></thead><tbody>${lines}</tbody></table><p><strong>Total : ${sale.totalAmountCdf.toFixed(2)} CDF</strong><br>${sale.totalAmountUsd.toFixed(2)} USD</p><p>${identity.invoiceLegalNotice || ''}</p></body></html>`;
  }

  /** Génère un PDF autonome (sans dépendance native) pour facture/ticket avec support des caractères accentués (WinAnsiEncoding). */
  async renderPdf(invoiceNumber: string, ticket = false, duplicate = false): Promise<Buffer> {
    const sale = await this.getSaleByInvoiceNumber(invoiceNumber);
    const identity = this.settingsService.getPharmacyIdentity();
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
      sanitizeForWinAnsi(identity.phone || ''),
      duplicate ? 'DUPLICATA' : '',
      `Facture ${sale.invoiceNumber}`,
      ...sale.items.map((item) => `${sanitizeForWinAnsi(item.lotNumber)}  x${item.quantity}  ${item.totalLineCdf.toFixed(2)} CDF`),
      `TOTAL ${sale.totalAmountCdf.toFixed(2)} CDF`,
      `${sale.totalAmountUsd.toFixed(2)} USD`,
      sanitizeForWinAnsi(identity.invoiceLegalNotice || ''),
    ].filter(Boolean);

    const pageWidth = ticket ? 226 : 595;
    const pageHeight = ticket ? Math.max(300, 90 + lines.length * 16) : 842;
    const content = [
      'BT',
      '/F1 10 Tf',
      `20 ${pageHeight - 30} Td`,
      ...lines.map((line, index) => `(${line}) Tj${index < lines.length - 1 ? ' 0 -16 Td' : ''}`),
      'ET',
    ].join('\n');

    const objects = [
      '<< /Type /Catalog /Pages 2 0 R >>',
      '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>`,
      `<< /Length ${Buffer.byteLength(content, 'latin1')} >>\nstream\n${content}\nendstream`,
      '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
    ];

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
      totalAmountCdf: Number(dbSale.total_amount_cdf),
      totalAmountUsd: Number(dbSale.total_amount_usd),
      appliedExchangeRate: Number(dbSale.exchange_rate_applied),
      currency: dbSale.currency,
      status: dbSale.status,
      createdAt: dbSale.created_at.toISOString(),
      items: dbSale.sale_items?.map((it: any) => ({
        id: it.id,
        lotId: it.lot_id,
        lotNumber: it.product_lots?.lot_number || '',
        expiryDate: it.product_lots?.expiry_date ? it.product_lots.expiry_date.toISOString().split('T')[0] : '',
        quantity: it.quantity,
        unitPriceCdf: Number(it.unit_price_cdf),
        unitCostCumpCdf: Number(it.unit_cost_cump_cdf),
        discountCdf: Number(it.discount_amount_cdf),
        totalLineCdf: Number(it.total_line_cdf),
      })) ?? [],
    };
  }
}
