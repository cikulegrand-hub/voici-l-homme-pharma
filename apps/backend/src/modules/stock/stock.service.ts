import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import {
  ProductLot,
  StockMovement,
  MovementType,
  PendingAdjustment,
  StockAlertsSummary,
  CumpValuationSummary,
  ControlledSubstanceRegisterEntry,
  PaginatedResult,
} from '@vhp/shared';
import {
  CreateLotDto,
  DirectReceptionDto,
  CreateMovementDto,
  CreateInventoryDto,
  ValidateInventoryDto,
  RequestAdjustmentDto,
  ApproveAdjustmentDto,
  StockMovementQueryDto,
  RecordInventoryCountDto,
} from './dto/stock.dto';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { CumpService } from './cump.service';
import { AuthService } from '../auth/auth.service';
import { Prisma } from '@prisma/client';
import { ExchangeRateResolver } from '../cash/exchange-rate.resolver';

@Injectable()
export class StockService {
  private readonly logger = new Logger('StockService');

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly cumpService: CumpService,
    private readonly authService: AuthService,
    private readonly exchangeRateResolver: ExchangeRateResolver,
  ) {}

  private async getExpiryThresholds(pharmacyId: string): Promise<{ d1: number; d2: number; d3: number }> {
    const rec = await this.prisma.settings.findUnique({
      where: { pharmacy_id_key: { pharmacy_id: pharmacyId, key: 'alert_thresholds' } },
    });
    const val = (rec?.value as any) || {};
    const days = Array.isArray(val.expiryWarningDays) ? val.expiryWarningDays : [];
    return {
      d1: Number(days[0] ?? val.expiryWarningDaysLevel1) || 30,
      d2: Number(days[1] ?? val.expiryWarningDaysLevel2) || 60,
      d3: Number(days[2] ?? val.expiryWarningDaysLevel3) || 90,
    };
  }

  private daysUntil(expiryDate: Date | string, today = new Date()): number {
    const start = new Date(today);
    start.setHours(0, 0, 0, 0);
    return Math.floor((new Date(expiryDate).getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
  }

  private async buildNearExpiryWarnings(
    lines: { lotNumber: string; expiryDate: string }[],
    pharmacyId: string,
  ): Promise<{ lotNumber: string; expiryDate: string; daysUntilExpiry: number; message: string }[]> {
    const { d1 } = await this.getExpiryThresholds(pharmacyId);
    const warnings: { lotNumber: string; expiryDate: string; daysUntilExpiry: number; message: string }[] = [];
    for (const line of lines) {
      const days = this.daysUntil(line.expiryDate);
      if (days > 0 && days <= d1) {
        warnings.push({
          lotNumber: line.lotNumber,
          expiryDate: line.expiryDate,
          daysUntilExpiry: days,
          message: `Péremption trop proche pour le lot ${line.lotNumber} (${days} j, seuil ${d1} j).`,
        });
      }
    }
    return warnings;
  }

  async persistGeneratedNotifications(
    pharmacyId: string,
    summary: StockAlertsSummary,
  ): Promise<void> {
    const items: { type: string; message: string; createdAt: string }[] = [];
    if (summary.outOfStock.length) {
      items.push({
        type: 'STOCK_RUPTURE',
        message: `${summary.outOfStock.length} produit(s) en rupture de stock.`,
        createdAt: new Date().toISOString(),
      });
    }
    if (summary.lowStock.length) {
      items.push({
        type: 'STOCK_BAS',
        message: `${summary.lowStock.length} produit(s) sous le seuil d’alerte.`,
        createdAt: new Date().toISOString(),
      });
    }
    if (summary.expiringIn30Days.length) {
      items.push({
        type: 'PEREMPTION_30J',
        message: `${summary.expiringIn30Days.length} lot(s) périment dans moins de 30 jours.`,
        createdAt: new Date().toISOString(),
      });
    }
    if (summary.expiringIn60Days.length) {
      items.push({
        type: 'PEREMPTION_60J',
        message: `${summary.expiringIn60Days.length} lots expirant dans moins de 60 jours.`,
        createdAt: new Date().toISOString(),
      });
    }
    if (summary.expiringIn90Days.length) {
      items.push({
        type: 'PEREMPTION_90J',
        message: `${summary.expiringIn90Days.length} lots expirant dans moins de 90 jours.`,
        createdAt: new Date().toISOString(),
      });
    }
    if (!items.length) return;

    const existing = await this.prisma.settings.findUnique({
      where: { pharmacy_id_key: { pharmacy_id: pharmacyId, key: 'stk_generated_notifications' } },
    });
    const previous = Array.isArray(existing?.value) ? (existing!.value as any[]) : [];
    const merged = [...items, ...previous].slice(0, 200);
    await this.prisma.settings.upsert({
      where: { pharmacy_id_key: { pharmacy_id: pharmacyId, key: 'stk_generated_notifications' } },
      update: { value: merged as any, updated_at: new Date() },
      create: { pharmacy_id: pharmacyId, key: 'stk_generated_notifications', value: merged as any },
    });
  }

  private isLargeInventoryVariance(systemQty: number, variance: number): boolean {
    const abs = Math.abs(variance);
    const pctThreshold = Math.max(5, Math.ceil(Math.abs(systemQty) * 0.1));
    return abs >= pctThreshold;
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
    throw new UnauthorizedException('Utilisateur authentifié valide requis pour une opération de stock.');
  }

  // ==========================================
  // STK-01 & STK-02 : GESTION DES LOTS & RÉCEPTIONS DIRECTES
  // ==========================================

  async createLot(dto: CreateLotDto, pharmacyId: string, userId: string): Promise<ProductLot> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const expiry = new Date(dto.expiryDate);
    if (expiry <= today) {
      throw new BadRequestException('Impossible de réceptionner un lot déjà périmé.');
    }

    const validUserId = await this.resolveValidUserId(userId);

    const product = await this.prisma.products.findFirst({
      where: { id: dto.productId, pharmacy_id: pharmacyId },
      select: { id: true },
    });
    if (!product) {
      throw new NotFoundException('Produit introuvable pour cette pharmacie.');
    }

    const existing = await this.prisma.product_lots.findUnique({
      where: {
        product_id_lot_number: {
          product_id: dto.productId,
          lot_number: dto.lotNumber.trim(),
        },
      },
    });

    if (existing) {
      throw new BadRequestException(
        `Le lot ${dto.lotNumber} existe déjà pour ce produit. Utilisez un mouvement d’entrée pour ajouter du stock.`,
      );
    }

    const qty = dto.quantity ?? dto.initialQuantity ?? 0;
    if (qty <= 0) {
      throw new BadRequestException('La quantité entrée doit être supérieure ou égale à 1.');
    }

    return await this.prisma.$transaction(async (tx) => {
      const lot = await tx.product_lots.create({
        data: {
          product_id: dto.productId,
          lot_number: dto.lotNumber.trim(),
          expiry_date: expiry,
          purchase_price_cdf: dto.purchasePriceCdf,
          purchase_price_usd: dto.purchasePriceUsd || 0,
          initial_quantity: qty,
          current_quantity: qty,
          is_quarantined: false,
          storage_location: dto.storageLocation,
        },
        include: { products: true },
      });

      // Mouvement de stock inaltérable (STK-06)
      await tx.stock_movements.create({
        data: {
          pharmacy_id: pharmacyId,
          lot_id: lot.id,
          user_id: validUserId,
          type: 'RECEPTION_FOURNISSEUR',
          quantity: qty,
          direction: 'IN',
          unit_cost_cdf: dto.purchasePriceCdf,
          reason: `Réception lot ${dto.lotNumber} — péremption ${dto.expiryDate}`,
        },
      });

      // Recalcul automatique du CUMP selon RG-14
      await this.cumpService.updateCumpOnReception(tx, dto.productId, qty, dto.purchasePriceCdf);

      return this.mapToProductLot(lot);
      });
  }

  /**
   * Réception directe multi-produits avec clé d'idempotence et recalcul CUMP transactionnel.
   */
  async directReception(
    dto: DirectReceptionDto,
    userId: string,
    pharmacyId: string,
  ): Promise<any> {
    const validUserId = await this.resolveValidUserId(userId);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Contrôle d'idempotence (évite doublons réseau)
    if (dto.idempotencyKey) {
      const existingReceipt = await this.prisma.goods_receipts.findFirst({
        where: {
          pharmacy_id: pharmacyId,
          idempotency_key: dto.idempotencyKey,
        },
        include: {
          goods_receipt_lines: {
            include: { products: true, product_lots: true },
          },
        },
      });
      if (existingReceipt) {
        this.logger.log(`Réception idempotente rejouée : ${dto.idempotencyKey}`);
        return {
          id: existingReceipt.id,
          receiptNumber: existingReceipt.receipt_number,
          idempotent: true,
          idempotentReplay: true,
          linesCount: existingReceipt.goods_receipt_lines.length,
        };
      }
    }

    if (!dto.lines || dto.lines.length === 0) {
      throw new BadRequestException('Au moins une ligne de réception est requise.');
    }

    // Vérifier les dates de péremption
    for (const line of dto.lines) {
      const exp = new Date(line.expiryDate);
      if (exp <= today) {
        throw new BadRequestException(
          `Impossible de réceptionner le lot ${line.lotNumber} : il est déjà périmé.`,
        );
      }
    }

    const receiptNumber = `REC-${Date.now().toString().slice(-6)}`;
    try {
      return await this.prisma.$transaction(async (tx) => {
      const receipt = await tx.goods_receipts.create({
        data: {
          pharmacy_id: pharmacyId,
          receipt_number: receiptNumber,
          received_by: validUserId,
          idempotency_key: dto.idempotencyKey || undefined,
          supplier_invoice_number: dto.supplierInvoiceNumber || undefined,
          notes: dto.notes || 'Réception directe magasin',
        },
      });

      const createdLots: any[] = [];

      for (const line of dto.lines) {
        const product = await tx.products.findFirst({
          where: { id: line.productId, pharmacy_id: pharmacyId },
          select: { id: true },
        });
        if (!product) {
          throw new NotFoundException('Produit introuvable pour cette pharmacie.');
        }

        // Rechercher si le lot existe déjà pour ce produit
        let lot = await tx.product_lots.findUnique({
          where: {
            product_id_lot_number: {
              product_id: line.productId,
              lot_number: line.lotNumber.trim(),
            },
          },
        });

        if (lot) {
          // Lot existant : incrémenter le stock
          lot = await tx.product_lots.update({
            where: { id: lot.id },
            data: {
              current_quantity: { increment: line.quantity },
              purchase_price_cdf: line.purchasePriceCdf,
              purchase_price_usd: line.purchasePriceUsd,
              ...(line.storageLocation ? { storage_location: line.storageLocation } : {}),
            },
          });
        } else {
          // Nouveau lot
          lot = await tx.product_lots.create({
            data: {
              product_id: line.productId,
              lot_number: line.lotNumber.trim(),
              expiry_date: new Date(line.expiryDate),
              purchase_price_cdf: line.purchasePriceCdf,
              purchase_price_usd: line.purchasePriceUsd,
              initial_quantity: line.quantity,
              current_quantity: line.quantity,
              is_quarantined: false,
              storage_location: line.storageLocation,
            },
          });
        }

        // Ligne de réception
        await tx.goods_receipt_lines.create({
          data: {
            receipt_id: receipt.id,
            product_id: line.productId,
            lot_id: lot.id,
            ordered_quantity: line.quantity,
            received_quantity: line.quantity,
            unit_purchase_price_cdf: line.purchasePriceCdf,
            unit_purchase_price_usd: line.purchasePriceUsd,
          },
        });

        // Mouvement de stock IN
        await tx.stock_movements.create({
          data: {
            pharmacy_id: pharmacyId,
            lot_id: lot.id,
            user_id: validUserId,
            type: 'RECEPTION_FOURNISSEUR',
            quantity: line.quantity,
            direction: 'IN',
            unit_cost_cdf: line.purchasePriceCdf,
            reason: `Réception directe ${receiptNumber} (Lot ${line.lotNumber})`,
            reference_id: receipt.id,
          },
        });

        // Mise à jour CUMP selon RG-14
        await this.cumpService.updateCumpOnReception(tx, line.productId, line.quantity, line.purchasePriceCdf);

        createdLots.push(lot);
      }

      await this.auditService.logAction({
        userId: validUserId,
        userName: 'Magasinier',
        action: 'RECEPTION_MARCHANDISE',
        entityName: 'GOODS_RECEIPT',
        entityId: receipt.id,
        newValues: { receiptNumber, linesCount: dto.lines.length },
      });

      const nearExpiryWarnings = await this.buildNearExpiryWarnings(
        dto.lines.map((l) => ({ lotNumber: l.lotNumber, expiryDate: l.expiryDate })),
        pharmacyId,
      );

      return {
        id: receipt.id,
        receiptNumber: receipt.receipt_number,
        linesCount: createdLots.length,
        receivedAt: receipt.received_at,
        nearExpiryWarnings,
      };
      });
    } catch (error) {
      if (dto.idempotencyKey && error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const existingReceipt = await this.prisma.goods_receipts.findFirst({
          where: { pharmacy_id: pharmacyId, idempotency_key: dto.idempotencyKey },
          include: { goods_receipt_lines: true },
        });
        if (existingReceipt) {
          return {
            id: existingReceipt.id,
            receiptNumber: existingReceipt.receipt_number,
            idempotent: true,
            idempotentReplay: true,
            linesCount: existingReceipt.goods_receipt_lines.length,
          };
        }
      }
      throw error;
    }
  }

  async listLots(pharmacyId: string, productId?: string): Promise<ProductLot[]> {
    const lots = await this.prisma.product_lots.findMany({
      where: {
        products: { pharmacy_id: pharmacyId },
        ...(productId ? { product_id: productId } : {}),
      },
      include: { products: true },
      orderBy: [{ expiry_date: 'asc' }, { created_at: 'asc' }],
    });
    return lots.map((l) => this.mapToProductLot(l));
  }

  // ==========================================
  // STK-07 : STOCK PAR PRODUIT & TEMPS RÉEL
  // ==========================================

  async getStockByProduct(productId: string, pharmacyId: string) {
    const product = await this.prisma.products.findUnique({
      where: { id: productId },
    });
    if (!product || product.pharmacy_id !== pharmacyId) {
      throw new NotFoundException('Produit introuvable.');
    }

    const productLots = await this.prisma.product_lots.findMany({
      where: { product_id: productId },
      orderBy: { expiry_date: 'asc' },
    });

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const available = productLots
      .filter((l) => !l.is_quarantined && l.expiry_date > today && l.current_quantity > 0)
      .reduce((sum, l) => sum + l.current_quantity, 0);

    const quarantined = productLots
      .filter((l) => l.is_quarantined)
      .reduce((sum, l) => sum + l.current_quantity, 0);

    const expired = productLots
      .filter((l) => l.expiry_date <= today && l.current_quantity > 0)
      .reduce((sum, l) => sum + l.current_quantity, 0);

    const physical = productLots.reduce((sum, l) => sum + l.current_quantity, 0);

    return {
      productId,
      productName: product.name,
      dci: product.dci,
      storageLocation: product.storage_location,
      totalAvailable: available,
      totalQuarantined: quarantined,
      totalExpired: expired,
      totalStock: physical,
      minAlertThreshold: product.min_alert_threshold,
      cumpCdf: Number(product.cump_cdf),
      sellingPriceCdf: Number(product.selling_price_cdf),
      lots: productLots.map((l) => this.mapToProductLot(l)),
    };
  }

  // ==========================================
  // STK-08 & STK-09 : ALERTES DE STOCK BAS & PÉREMPTIONS (30/60/90 JOURS)
  // ==========================================

  async getAlerts(pharmacyId: string): Promise<StockAlertsSummary> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const { d1, d2, d3 } = await this.getExpiryThresholds(pharmacyId);

    const products = await this.prisma.products.findMany({
      where: { pharmacy_id: pharmacyId, is_active: true },
      include: {
        product_lots: {
          where: { current_quantity: { gt: 0 } },
        },
      },
    });

    const lowStock: any[] = [];
    const outOfStock: any[] = [];
    const expiringIn30Days: ProductLot[] = [];
    const expiringIn60Days: ProductLot[] = [];
    const expiringIn90Days: ProductLot[] = [];
    const expired: ProductLot[] = [];

    for (const prod of products) {
      const activeLots = prod.product_lots.filter((l) => !l.is_quarantined && l.expiry_date > today);
      const totalStock = activeLots.reduce((sum, l) => sum + l.current_quantity, 0);

      const minThreshold = prod.min_alert_threshold || 10;
      const targetThreshold = prod.max_threshold || (minThreshold * 3);
      const reorderQuantity = Math.max(0, targetThreshold - totalStock);

      if (totalStock === 0) {
        outOfStock.push({
          id: prod.id,
          productId: prod.id,
          name: prod.name,
          productName: prod.name,
          dci: prod.dci,
          dosage: prod.dosage,
          currentStock: 0,
          minAlertThreshold: minThreshold,
          securityStock: prod.security_stock ?? undefined,
          reorderQuantity: targetThreshold,
          suggestedOrderQuantity: targetThreshold,
        });
      } else if (totalStock <= minThreshold) {
        lowStock.push({
          id: prod.id,
          productId: prod.id,
          name: prod.name,
          productName: prod.name,
          dci: prod.dci,
          dosage: prod.dosage,
          totalStock,
          currentStock: totalStock,
          minAlertThreshold: minThreshold,
          securityStock: prod.security_stock ?? undefined,
          reorderQuantity,
          suggestedOrderQuantity: reorderQuantity,
        });
      }

      for (const lot of prod.product_lots) {
        const d = this.daysUntil(lot.expiry_date, today);
        const mapped = this.mapToProductLot({ ...lot, products: prod });

        if (d <= 0) {
          expired.push(mapped);
        } else if (d <= d1) {
          expiringIn30Days.push(mapped);
        } else if (d <= d2) {
          expiringIn60Days.push(mapped);
        } else if (d <= d3) {
          expiringIn90Days.push(mapped);
        }
      }
    }

    return {
      lowStock,
      outOfStock,
      expiringIn30Days,
      expiringIn60Days,
      expiringIn90Days,
      expired,
      reorderList: [...outOfStock, ...lowStock],
    } as StockAlertsSummary;
  }

  // ==========================================
  // STK-12 & RG-14 : VALORISATION DU STOCK AU CUMP
  // ==========================================

  async getCumpValuation(pharmacyId: string): Promise<CumpValuationSummary> {
    const products = await this.prisma.products.findMany({
      where: { pharmacy_id: pharmacyId, is_active: true },
      include: {
        product_lots: {
          where: { is_quarantined: false, current_quantity: { gt: 0 } },
        },
      },
    });

    let totalStockUnits = 0;
    let totalValuationCdf = 0;
    let totalLotsCount = 0;

    const items = products.map((prod) => {
      const totalStock = prod.product_lots.reduce((sum, l) => sum + l.current_quantity, 0);
      totalLotsCount += prod.product_lots.length;
      totalStockUnits += totalStock;

      const cumpCdf = Number(prod.cump_cdf) || 0;
      const sellingPriceCdf = Number(prod.selling_price_cdf) || 0;
      const productValuationCdf = totalStock * cumpCdf;
      totalValuationCdf += productValuationCdf;

      const margin = sellingPriceCdf > cumpCdf && cumpCdf > 0 ? ((sellingPriceCdf - cumpCdf) / cumpCdf) * 100 : 0;

      return {
        productId: prod.id,
        productName: prod.name,
        dci: prod.dci,
        totalStock,
        cumpCdf,
        sellingPriceCdf,
        totalValuationCdf: Math.round(productValuationCdf * 100) / 100,
        marginPercent: Math.round(margin * 10) / 10,
      };
    });

    return {
      totalStockUnits,
      totalValuationCdf: Math.round(totalValuationCdf * 100) / 100,
      totalValuationUsd: Math.round((totalValuationCdf / Number((await this.exchangeRateResolver.getRateAt(pharmacyId)).rate)) * 100) / 100,
      productsCount: products.length,
      lotsCount: totalLotsCount,
      products: items.filter((p) => p.totalStock > 0),
    };
  }

  // ==========================================
  // STK-14 : REGISTRE OFFICIEL DES STUPÉFIANTS & SUBSTANCES CONTRÔLÉES
  // ==========================================

  async getControlledSubstancesRegister(pharmacyId: string): Promise<ControlledSubstanceRegisterEntry[]> {
    const movements = await this.prisma.stock_movements.findMany({
      where: {
        pharmacy_id: pharmacyId,
        product_lots: {
          products: { is_controlled_substance: true },
        },
      },
      include: {
        product_lots: {
          include: { products: true },
        },
        users_stock_movements_user_idTousers: { select: { full_name: true, username: true } },
      },
      orderBy: { created_at: 'asc' },
    });

    const register: ControlledSubstanceRegisterEntry[] = [];
    const balances = new Map<string, number>();

    for (const m of movements) {
      const lotId = m.lot_id;
      const prevBalance = balances.get(lotId) || 0;
      const qtyIn = m.direction === 'IN' ? m.quantity : 0;
      const qtyOut = m.direction === 'OUT' ? m.quantity : 0;
      const currentBalance = prevBalance + qtyIn - qtyOut;
      balances.set(lotId, currentBalance);

      register.push({
        id: m.id,
        date: m.created_at.toISOString(),
        productId: m.product_lots.product_id,
        productName: m.product_lots.products.name,
        dosage: m.product_lots.products.dosage ?? undefined,
        lotNumber: m.product_lots.lot_number,
        movementType: m.type as MovementType,
        quantityIn: qtyIn,
        quantityOut: qtyOut,
        balance: currentBalance,
        referenceNumber: m.reason || 'Mouvement réglementaire',
        partyName: m.direction === 'IN' ? 'Fournisseur' : 'Patient ordonnance',
        prescriberName: undefined,
        userName: m.users_stock_movements_user_idTousers?.full_name || 'Pharmacien',
      });
    }

    return register.reverse();
  }

  // ==========================================
  // STK-04 & STK-06 : MOUVEMENTS MANUELS & JOURNAL INALTÉRABLE
  // ==========================================

  async createManualMovement(
    dto: CreateMovementDto,
    userId: string,
    pharmacyId: string,
  ): Promise<StockMovement> {
    const validUserId = await this.resolveValidUserId(userId);

    if (dto.type === 'AJUSTEMENT_POSITIF' || dto.type === 'AJUSTEMENT_NEGATIF') {
      throw new BadRequestException(
        'Les ajustements de stock doivent passer par une demande puis une validation du pharmacien.',
      );
    }

    const result = await this.prisma.$transaction(
      async (tx) => {
        const locked: { id: string; current_quantity: number }[] = await tx.$queryRaw`
          SELECT id, current_quantity FROM product_lots WHERE id = ${dto.lotId}::uuid FOR UPDATE
        `;

        const lot = await tx.product_lots.findUnique({
          where: { id: dto.lotId },
          include: { products: true },
        });

        if (!lot || locked.length === 0) {
          throw new NotFoundException('Lot introuvable.');
        }
        if (lot.products.pharmacy_id !== pharmacyId) {
          throw new NotFoundException('Lot introuvable pour cette pharmacie.');
        }

        const direction: 'IN' | 'OUT' =
          dto.type === 'AJUSTEMENT_POSITIF' || dto.type === 'RETOUR_CLIENT' ? 'IN' : 'OUT';

        if (direction === 'OUT') {
          // Décrément atomique après FOR UPDATE pour interdire tout stock négatif en concurrence (REC-03)
          const updated = await tx.product_lots.updateMany({
            where: {
              id: dto.lotId,
              current_quantity: { gte: dto.quantity },
            },
            data: {
              current_quantity: { decrement: dto.quantity },
            },
          });

          if (updated.count === 0) {
            throw new BadRequestException(
              `Stock insuffisant sur le lot ${lot.lot_number} : ${dto.quantity} demandées, ${lot.current_quantity} disponibles.`,
            );
          }
        } else {
          // Incrément atomique
          await tx.product_lots.update({
            where: { id: dto.lotId },
            data: {
              current_quantity: { increment: dto.quantity },
            },
          });
        }

        // Insertion inaltérable dans stock_movements (STK-06)
        const movement = await tx.stock_movements.create({
          data: {
            pharmacy_id: pharmacyId,
            lot_id: dto.lotId,
            user_id: validUserId,
            type: dto.type as any,
            quantity: dto.quantity,
            direction,
            unit_cost_cdf: lot.purchase_price_cdf,
            reason: dto.reason.trim(),
          },
          include: {
            users_stock_movements_user_idTousers: { select: { full_name: true, username: true } },
          },
        });

        return {
          movement,
          lockedLot: lot,
          direction,
        };
      },
      { timeout: 15000 },
    );

    await this.auditService.logAction({
      userId: validUserId,
      userName: 'Pharmacien',
      action: `MOUVEMENT_STOCK_${dto.type}`,
      entityName: 'STOCK_MOVEMENT',
      entityId: result.movement.id,
      newValues: { lotNumber: result.lockedLot.lot_number, quantity: dto.quantity, direction: result.direction, reason: dto.reason },
    }).catch((e) => this.logger.warn(`Erreur audit log mouvement: ${e.message}`));

    return {
      id: result.movement.id,
      lotId: result.movement.lot_id,
      productName: result.lockedLot.products?.name || 'Produit',
      lotNumber: result.lockedLot.lot_number,
      userId: validUserId,
      userName: result.movement.users_stock_movements_user_idTousers?.full_name || 'Utilisateur',
      type: result.movement.type as any,
      quantity: result.movement.quantity,
      direction: result.movement.direction as any,
      unitCostCdf: Number(result.movement.unit_cost_cdf),
      reason: result.movement.reason || '',
      referenceId: result.movement.reference_id ?? undefined,
      createdAt: result.movement.created_at.toISOString(),
    };
  }

  async getMovements(
    queryDto: StockMovementQueryDto = {},
    pharmacyId: string,
  ): Promise<PaginatedResult<StockMovement>> {
    const page = Math.max(1, Number(queryDto.page) || 1);
    const limit = Math.max(1, Math.min(100, Number(queryDto.limit) || 20));
    const skip = (page - 1) * limit;

    const where: any = {
      pharmacy_id: pharmacyId,
    };

    if (queryDto.lotId) where.lot_id = queryDto.lotId;
    if (queryDto.type) where.type = queryDto.type;
    if (queryDto.userId) where.user_id = queryDto.userId;

    if (queryDto.productId) {
      where.product_lots = { product_id: queryDto.productId };
    }

    if (queryDto.startDate || queryDto.endDate) {
      where.created_at = {};
      if (queryDto.startDate) where.created_at.gte = new Date(queryDto.startDate);
      if (queryDto.endDate) where.created_at.lte = new Date(queryDto.endDate);
    }

    const [total, movements] = await Promise.all([
      this.prisma.stock_movements.count({ where }),
      this.prisma.stock_movements.findMany({
        where,
        include: {
          product_lots: { include: { products: true } },
          users_stock_movements_user_idTousers: { select: { full_name: true, username: true } },
        },
        orderBy: { created_at: 'desc' },
        skip,
        take: limit,
      }),
    ]);

    const data: StockMovement[] = movements.map((m) => ({
      id: m.id,
      lotId: m.lot_id,
      productName: m.product_lots?.products?.name || 'Produit',
      lotNumber: m.product_lots?.lot_number || 'N/A',
      userId: m.user_id,
      userName: m.users_stock_movements_user_idTousers?.full_name || 'Utilisateur',
      type: m.type as MovementType,
      quantity: m.quantity,
      direction: m.direction as 'IN' | 'OUT',
      reason: m.reason,
      createdAt: m.created_at.toISOString(),
      unitCostCdf: Number(m.unit_cost_cdf),
      referenceId: m.reference_id ?? undefined,
    }));

    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit) || 1,
    };
  }

  // ==========================================
  // STK-10 : QUARANTAINE SANITAIRE (RG-03)
  // ==========================================

  async quarantineLot(lotId: string, reason: string, userId: string, pharmacyId: string): Promise<ProductLot> {
    const validUserId = await this.resolveValidUserId(userId);
    const lot = await this.prisma.product_lots.findUnique({
      where: { id: lotId },
      include: { products: true },
    });

    if (!lot) {
      throw new NotFoundException('Lot introuvable.');
    }
    if (lot.products.pharmacy_id !== pharmacyId) {
      throw new NotFoundException('Lot introuvable pour cette pharmacie.');
    }

    const updated = await this.prisma.product_lots.update({
      where: { id: lotId },
      data: {
        is_quarantined: true,
        quarantine_reason: reason.trim(),
        quarantine_updated_at: new Date(),
      },
    });

    await this.auditService.logAction({
      userId: validUserId,
      userName: 'Pharmacien',
      action: 'LOT_MIS_EN_QUARANTAINE',
      entityName: 'PRODUCT_LOT',
      entityId: lotId,
      newValues: { lotNumber: lot.lot_number, isQuarantined: true, reason },
    });

    return this.mapToProductLot(updated);
  }

  async unquarantineLot(lotId: string, reason: string, userId: string, pharmacyId: string): Promise<ProductLot> {
    const validUserId = await this.resolveValidUserId(userId);
    const lot = await this.prisma.product_lots.findUnique({
      where: { id: lotId },
      include: { products: true },
    });

    if (!lot) {
      throw new NotFoundException('Lot introuvable.');
    }
    if (lot.products.pharmacy_id !== pharmacyId) {
      throw new NotFoundException('Lot introuvable pour cette pharmacie.');
    }

    const updated = await this.prisma.product_lots.update({
      where: { id: lotId },
      data: {
        is_quarantined: false,
        quarantine_reason: reason.trim(),
        quarantine_updated_at: new Date(),
      },
    });

    await this.auditService.logAction({
      userId: validUserId,
      userName: 'Pharmacien',
      action: 'LOT_DEBLOQUE_QUARANTAINE',
      entityName: 'PRODUCT_LOT',
      entityId: lotId,
      newValues: { lotNumber: lot.lot_number, isQuarantined: false, reason },
    });

    return this.mapToProductLot(updated);
  }

  // ==========================================
  // STK-05 & RG-11 : WORKFLOW D'AJUSTEMENT PERSISTANT
  // ==========================================



  private mapAdjustment(row: any): PendingAdjustment {
    return {
      id: row.id,
      pharmacyId: row.pharmacy_id,
      lotId: row.lot_id,
      lotNumber: row.product_lots?.lot_number || '',
      productId: row.product_lots?.product_id || '',
      productName: row.product_lots?.products?.name || '',
      systemQuantity: row.system_quantity,
      newQuantity: row.new_quantity,
      variance: row.variance,
      reason: row.reason,
      requestedBy: row.requested_by,
      requestedByName: row.requested_by_user?.full_name || row.requested_by_user?.username,
      requestedAt: row.requested_at.toISOString(),
      status: row.status,
      approvedBy: row.approved_by || undefined,
      approvedByName: row.approved_by_user?.full_name || row.approved_by_user?.username,
      approvedAt: row.approved_at?.toISOString(),
      rejectionReason: row.rejection_reason || undefined,
    };
  }

  async requestAdjustment(
    dto: RequestAdjustmentDto,
    userId: string,
    pharmacyId: string,
  ): Promise<PendingAdjustment> {
    const validUserId = await this.resolveValidUserId(userId);
    const user = await this.prisma.users.findUnique({ where: { id: validUserId } });

    const lot = await this.prisma.product_lots.findUnique({
      where: { id: dto.lotId },
      include: { products: true },
    });

    if (!lot) {
      throw new NotFoundException('Lot introuvable.');
    }
    if (lot.products.pharmacy_id !== pharmacyId) {
      throw new NotFoundException('Lot introuvable pour cette pharmacie.');
    }

    const variance = dto.variance ?? dto.quantityDifference ?? 0;
    if (variance === 0) {
      throw new BadRequestException('L’écart d’ajustement ne peut être égal à zéro.');
    }

    const newQuantity = lot.current_quantity + variance;
    if (newQuantity < 0) {
      throw new BadRequestException(
        `Cet ajustement rendrait le stock négatif (stock actuel : ${lot.current_quantity}).`,
      );
    }

    const row = await this.prisma.stock_adjustments.create({
      data: {
        pharmacy_id: pharmacyId,
        lot_id: lot.id,
        requested_by: validUserId,
        system_quantity: lot.current_quantity,
        new_quantity: newQuantity,
        variance,
        reason: dto.reason.trim(),
      },
      include: {
        product_lots: { include: { products: true } },
        requested_by_user: true,
      },
    });
    const adjustment = this.mapAdjustment(row);
    const id = adjustment.id;

    await this.auditService.logAction({
      userId: validUserId,
      userName: adjustment.requestedByName || 'Gestionnaire de stock',
      action: 'DEMANDE_AJUSTEMENT_STOCK',
      entityName: 'STOCK_ADJUSTMENT',
      entityId: id,
      newValues: { lotNumber: lot.lot_number, variance, reason: dto.reason },
    });

    return adjustment;
  }

  async listPendingAdjustments(pharmacyId: string): Promise<PendingAdjustment[]> {
    const rows = await this.prisma.stock_adjustments.findMany({
      where: { pharmacy_id: pharmacyId, status: 'DEMANDE' },
      include: {
        product_lots: { include: { products: true } },
        requested_by_user: true,
        approved_by_user: true,
      },
      orderBy: { requested_at: 'asc' },
    });
    return rows.map((row) => this.mapAdjustment(row));
  }

  async approveAdjustment(
    id: string,
    dto: ApproveAdjustmentDto,
    pharmacienId: string,
    pharmacyId: string,
  ): Promise<PendingAdjustment> {
    const validPharmacienId = await this.resolveValidUserId(pharmacienId);
    if (dto.pinCode) {
      await this.authService.verifySupervisorPin(dto.pinCode, 'VALIDER_AJUSTEMENT_STOCK');
    }
    const pharmacien = await this.prisma.users.findUnique({ where: { id: validPharmacienId } });

    const storedAdj = await this.prisma.stock_adjustments.findFirst({
      where: { id, pharmacy_id: pharmacyId },
      include: {
        product_lots: { include: { products: true } },
        requested_by_user: true,
        approved_by_user: true,
      },
    });
    const adj = storedAdj ? this.mapAdjustment(storedAdj) : undefined;

    if (!adj) {
      throw new NotFoundException('Demande d’ajustement introuvable.');
    }

    if (adj.status !== 'DEMANDE' && adj.status !== 'EN_ATTENTE') {
      throw new BadRequestException(`Cette demande est déjà traitée (${adj.status.toLowerCase()}).`);
    }

    const isApproved = dto.approved !== undefined ? dto.approved : dto.action === 'APPROVE';

    if (!isApproved) {
      adj.status = 'REJETE' as any;
      adj.approvedBy = validPharmacienId;
      adj.approvedByName = pharmacien?.full_name || 'Pharmacien';
      adj.approvedAt = new Date().toISOString();
      adj.rejectionReason = dto.rejectionReason || 'Rejeté par le pharmacien titulaire';

      await this.prisma.stock_adjustments.update({
        where: { id: storedAdj!.id },
        data: {
          status: 'REJETE',
          approved_by: validPharmacienId,
          approved_at: new Date(),
          rejection_reason: dto.rejectionReason || 'Rejet par le pharmacien titulaire',
        },
      });

      await this.auditService.logAction({
        userId: validPharmacienId,
        userName: adj.approvedByName,
        action: 'AJUSTEMENT_STOCK_REJETE',
        entityName: 'STOCK_ADJUSTMENT',
        entityId: id,
        newValues: { rejectionReason: adj.rejectionReason },
      });

      return adj;
    }

    // Approbation : application en base dans une transaction
    return await this.prisma.$transaction(async (tx) => {
      const lot = await tx.product_lots.findUnique({
        where: { id: adj.lotId },
      });

      if (!lot) {
        throw new NotFoundException('Lot introuvable.');
      }

      const qtyChange = adj.variance;
      const direction: 'IN' | 'OUT' = qtyChange > 0 ? 'IN' : 'OUT';
      const movementType: MovementType = qtyChange > 0 ? 'AJUSTEMENT_POSITIF' : 'AJUSTEMENT_NEGATIF';
      const absQty = Math.abs(qtyChange);

      if (direction === 'OUT' && lot.current_quantity < absQty) {
        throw new BadRequestException(
          `Stock insuffisant lors de la validation : stock actuel ${lot.current_quantity}, déduction demandée ${absQty}.`,
        );
      }

      await tx.product_lots.update({
        where: { id: adj.lotId },
        data: {
          current_quantity:
            direction === 'IN'
              ? { increment: absQty }
              : { decrement: absQty },
        },
      });

      await tx.stock_movements.create({
        data: {
          pharmacy_id: pharmacyId,
          lot_id: adj.lotId,
            user_id: validPharmacienId,
          type: movementType,
          quantity: absQty,
          direction,
          unit_cost_cdf: lot.purchase_price_cdf,
          reason: `Ajustement validé [${id}] : ${adj.reason}`,
          approved_by: validPharmacienId,
        },
      });

      adj.status = 'VALIDE' as any;
      adj.approvedBy = validPharmacienId;
      adj.approvedByName = pharmacien?.full_name || 'Pharmacien';
      adj.approvedAt = new Date().toISOString();

      await tx.stock_adjustments.update({
        where: { id: storedAdj!.id },
        data: {
          status: 'VALIDE',
          approved_by: validPharmacienId,
          approved_at: new Date(),
        },
      });

      await this.auditService.logAction({
        userId: validPharmacienId,
        userName: adj.approvedByName,
        action: 'AJUSTEMENT_STOCK_VALIDE',
        entityName: 'STOCK_ADJUSTMENT',
        entityId: id,
        oldValues: { lotNumber: adj.lotNumber, quantity: lot.current_quantity },
        newValues: { lotNumber: adj.lotNumber, quantity: lot.current_quantity + qtyChange, variance: adj.variance, reason: adj.reason },
      });

      return adj;
    });
  }

  // ==========================================
  // STK-11 : INVENTAIRES PHYSIQUES COMPLETS OU TOURNANTS
  // ==========================================

  async createInventory(
    dto: CreateInventoryDto,
    userId: string,
    pharmacyId: string,
  ): Promise<any> {
    const validUserId = await this.resolveValidUserId(userId);

    const reference = dto.reference?.trim() || `INV-${Date.now().toString().slice(-6)}`;
    const existing = await this.prisma.inventory_counts.findUnique({
      where: {
        pharmacy_id_reference: {
          pharmacy_id: pharmacyId,
          reference,
        },
      },
    });

    if (existing) {
      throw new ConflictException(`Un inventaire avec la référence "${reference}" existe déjà.`);
    }

    const inventoryType = dto.type === 'TOURNANT' ? 'TOURNANT' : 'COMPLET';
    const lines = dto.lines || [];

    return await this.prisma.$transaction(async (tx) => {
      const inv = await tx.inventory_counts.create({
        data: {
          pharmacy_id: pharmacyId,
          reference,
          status: 'EN_COURS',
          inventory_type: inventoryType,
          notes: dto.notes?.trim() || undefined,
          created_by: validUserId,
        },
      });

      let snapshotLots: { id: string; current_quantity: number }[] = [];
      if (lines.length > 0) {
        snapshotLots = [];
      } else if (inventoryType === 'COMPLET') {
        snapshotLots = await tx.product_lots.findMany({
          where: { products: { pharmacy_id: pharmacyId } },
          select: { id: true, current_quantity: true },
        });
      } else if (dto.productIds?.length) {
        snapshotLots = await tx.product_lots.findMany({
          where: { product_id: { in: dto.productIds }, products: { pharmacy_id: pharmacyId } },
          select: { id: true, current_quantity: true },
        });
      }

      for (const line of lines) {
        const lot = await tx.product_lots.findUnique({
          where: { id: line.lotId },
          include: { products: { select: { pharmacy_id: true } } },
        });
        if (!lot || lot.products.pharmacy_id !== pharmacyId) {
          throw new NotFoundException('Lot introuvable pour cette pharmacie.');
        }

        const systemQuantity = lot.current_quantity;
        const variance = line.countedQuantity - systemQuantity;

        await tx.inventory_count_lines.create({
          data: {
            inventory_id: inv.id,
            lot_id: line.lotId,
            system_quantity: systemQuantity,
            counted_quantity: line.countedQuantity,
            variance,
            justification: line.justification?.trim() || undefined,
          },
        });
      }

      for (const lot of snapshotLots) {
        await tx.inventory_count_lines.create({
          data: {
            inventory_id: inv.id,
            lot_id: lot.id,
            system_quantity: lot.current_quantity,
            counted_quantity: lot.current_quantity,
            variance: 0,
          },
        });
      }

      await this.auditService.logAction({
        userId: validUserId,
        userName: 'Magasinier',
        action: 'INVENTAIRE_CREE',
        entityName: 'INVENTORY_COUNT',
        entityId: inv.id,
        newValues: { reference: inv.reference, type: inventoryType, linesCount: lines.length + snapshotLots.length },
      });

      return {
        id: inv.id,
        reference: inv.reference,
        status: inv.status,
        type: inventoryType,
        notes: inv.notes,
        createdAt: inv.created_at.toISOString(),
        createdBy: inv.created_by,
        linesCount: lines.length + snapshotLots.length,
        lines: [],
      };
    });
  }

  async recordInventoryCount(
    inventoryId: string,
    dto: RecordInventoryCountDto,
    pharmacyId: string,
  ): Promise<any> {
    const inv = await this.prisma.inventory_counts.findUnique({ where: { id: inventoryId } });
    if (!inv || inv.pharmacy_id !== pharmacyId) {
      throw new NotFoundException('Inventaire introuvable.');
    }
    if (inv.status !== 'EN_COURS') {
      throw new BadRequestException(`Cet inventaire est déjà ${inv.status.toLowerCase()}.`);
    }

    const lot = await this.prisma.product_lots.findUnique({
      where: { id: dto.lotId },
      include: { products: { select: { pharmacy_id: true } } },
    });
    if (!lot) {
      throw new NotFoundException('Lot introuvable.');
    }
    if (lot.products.pharmacy_id !== pharmacyId) {
      throw new NotFoundException('Lot introuvable pour cette pharmacie.');
    }

    const variance = dto.countedQuantity - lot.current_quantity;
    if (this.isLargeInventoryVariance(lot.current_quantity, variance) && !dto.justification?.trim()) {
      throw new BadRequestException(
        `Écart important sur le lot ${lot.lot_number} (${variance}). Une justification est obligatoire.`,
      );
    }

    const existing = await this.prisma.inventory_count_lines.findFirst({
      where: { inventory_id: inventoryId, lot_id: dto.lotId },
    });

    if (existing) {
      await this.prisma.inventory_count_lines.update({
        where: { id: existing.id },
        data: {
          counted_quantity: dto.countedQuantity,
          variance,
          justification: dto.justification?.trim() || existing.justification,
        },
      });
    } else {
      await this.prisma.inventory_count_lines.create({
        data: {
          inventory_id: inventoryId,
          lot_id: dto.lotId,
          system_quantity: lot.current_quantity,
          counted_quantity: dto.countedQuantity,
          variance,
          justification: dto.justification?.trim() || undefined,
        },
      });
    }

    return this.getInventoryById(inventoryId, pharmacyId);
  }

  async getInventoryById(id: string, pharmacyId: string): Promise<any> {
    const inv = await this.prisma.inventory_counts.findUnique({
      where: { id },
      include: {
        inventory_count_lines: {
          include: {
            product_lots: { include: { products: true } },
          },
        },
        users_inventory_counts_created_byTousers: { select: { full_name: true, username: true } },
        users_inventory_counts_validated_byTousers: { select: { full_name: true, username: true } },
      },
    });

    if (!inv || inv.pharmacy_id !== pharmacyId) {
      throw new NotFoundException('Inventaire introuvable.');
    }

    return {
      id: inv.id,
      pharmacyId: inv.pharmacy_id,
      reference: inv.reference,
      status: inv.status,
      type: (inv as any).inventory_type || 'COMPLET',
      notes: inv.notes,
      createdAt: inv.created_at.toISOString(),
      createdBy: inv.created_by,
      createdByName: inv.users_inventory_counts_created_byTousers?.full_name || 'Utilisateur',
      validatedBy: inv.validated_by,
      validatedByName: inv.users_inventory_counts_validated_byTousers?.full_name,
      validatedAt: inv.validated_at?.toISOString(),
      lines: inv.inventory_count_lines.map((l) => ({
        id: l.id,
        lotId: l.lot_id,
        lotNumber: l.product_lots.lot_number,
        productId: l.product_lots.product_id,
        productName: l.product_lots.products.name,
        systemQuantity: l.system_quantity,
        countedQuantity: l.counted_quantity,
        variance: l.variance,
        justification: l.justification ?? undefined,
      })),
      linesCount: inv.inventory_count_lines.length,
    };
  }

  async listInventories(pharmacyId: string): Promise<any[]> {
    const list = await this.prisma.inventory_counts.findMany({
      where: { pharmacy_id: pharmacyId },
      include: {
        users_inventory_counts_created_byTousers: { select: { full_name: true, username: true } },
        inventory_count_lines: true,
      },
      orderBy: { created_at: 'desc' },
    });

    return list.map((inv) => ({
      id: inv.id,
      reference: inv.reference,
      status: inv.status,
      type: inv.inventory_type || 'COMPLET',
      notes: inv.notes,
      createdAt: inv.created_at.toISOString(),
      createdByName: inv.users_inventory_counts_created_byTousers?.full_name || 'Utilisateur',
      linesCount: inv.inventory_count_lines.length,
      lines: inv.inventory_count_lines.map((l) => ({
        lotId: l.lot_id,
        systemQuantity: l.system_quantity,
        countedQuantity: l.counted_quantity,
        variance: l.variance,
      })),
    }));
  }

  async validateInventory(
    id: string,
    dto: ValidateInventoryDto,
    pharmacienId: string,
    pharmacyId: string,
  ): Promise<any> {
    const validPharmacienId = await this.resolveValidUserId(pharmacienId);
    if (dto.pinCode) {
      await this.authService.verifySupervisorPin(dto.pinCode, 'VALIDER_INVENTAIRE');
    }
    const comment = (dto.validationComment || dto.justification || '').trim();
    const inv = await this.prisma.inventory_counts.findUnique({
      where: { id },
      include: { inventory_count_lines: { include: { product_lots: true } } },
    });

    if (!inv || inv.pharmacy_id !== pharmacyId) {
      throw new NotFoundException('Inventaire introuvable.');
    }

    if (inv.status !== 'EN_COURS') {
      throw new BadRequestException(`Cet inventaire est déjà ${inv.status.toLowerCase()}.`);
    }

    for (const line of inv.inventory_count_lines) {
      if (this.isLargeInventoryVariance(line.system_quantity, line.variance) && !line.justification?.trim()) {
        throw new BadRequestException(
          `Écart important sur un lot (${line.variance}). Une justification est obligatoire avant validation.`,
        );
      }
    }

    return await this.prisma.$transaction(async (tx) => {
      // 1. Marquer l'inventaire comme VALIDE
      await tx.inventory_counts.update({
        where: { id },
        data: {
          status: 'VALIDE',
          validated_by: validPharmacienId,
          validated_at: new Date(),
          notes: `${inv.notes || ''}\n[Validation]: ${comment || 'Comptage validé'}`.trim(),
        },
      });

      // 2. Générer les mouvements d'ajustement pour chaque écart
      for (const line of inv.inventory_count_lines) {
        if (line.variance === 0) continue;

        const lot = line.product_lots;
        const absVariance = Math.abs(line.variance);
        const direction: 'IN' | 'OUT' = line.variance > 0 ? 'IN' : 'OUT';
        const type: MovementType = line.variance > 0 ? 'AJUSTEMENT_POSITIF' : 'AJUSTEMENT_NEGATIF';

        // Mise à jour de la quantité physique du lot
        await tx.product_lots.update({
          where: { id: lot.id },
          data: {
            current_quantity: line.counted_quantity,
          },
        });

        // Enregistrement inaltérable du mouvement
        await tx.stock_movements.create({
          data: {
            pharmacy_id: pharmacyId,
            lot_id: lot.id,
            user_id: validPharmacienId,
            type,
            quantity: absVariance,
            direction,
            unit_cost_cdf: lot.purchase_price_cdf,
            reason: `Régularisation inventaire [${inv.reference}] : ${comment || 'Validation pharmacien'}`,
            approved_by: validPharmacienId,
            reference_id: inv.id,
          },
        });
      }

      await this.auditService.logAction({
        userId: validPharmacienId,
        userName: 'Pharmacien',
        action: 'INVENTAIRE_VALIDE',
        entityName: 'INVENTORY_COUNT',
        entityId: id,
        newValues: { reference: inv.reference, comment },
      });

      return this.getInventoryById(id, pharmacyId);
    });
  }

  async cancelInventory(id: string, pharmacienId: string, pharmacyId: string): Promise<any> {
    const validPharmacienId = await this.resolveValidUserId(pharmacienId);
    const inv = await this.prisma.inventory_counts.findUnique({ where: { id } });

    if (!inv || inv.pharmacy_id !== pharmacyId) {
      throw new NotFoundException('Inventaire introuvable.');
    }

    if (inv.status !== 'EN_COURS') {
      throw new BadRequestException(`Cet inventaire est déjà ${inv.status.toLowerCase()}.`);
    }

    const updated = await this.prisma.inventory_counts.update({
      where: { id },
      data: {
        status: 'ANNULE',
        validated_by: validPharmacienId,
        validated_at: new Date(),
      },
    });

    await this.auditService.logAction({
      userId: validPharmacienId,
      userName: 'Pharmacien',
      action: 'INVENTAIRE_ANNULE',
      entityName: 'INVENTORY_COUNT',
      entityId: id,
      newValues: { reference: inv.reference, status: 'ANNULE' },
    });

    return updated;
  }

  // ==========================================
  // MAPPER INTERNE
  // ==========================================

  private mapToProductLot(lot: any): ProductLot {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return {
      id: lot.id,
      productId: lot.product_id,
      lotNumber: lot.lot_number,
      expiryDate: lot.expiry_date.toISOString().split('T')[0],
      purchasePriceCdf: Number(lot.purchase_price_cdf),
      purchasePriceUsd: Number(lot.purchase_price_usd),
      initialQuantity: lot.initial_quantity,
      currentQuantity: lot.current_quantity,
      isQuarantined: lot.is_quarantined,
      quarantineReason: lot.quarantine_reason ?? undefined,
      isExpired: new Date(lot.expiry_date) <= today,
      productName: lot.products?.name,
      storageLocation: lot.storage_location ?? lot.products?.storage_location ?? undefined,
    };
  }
}
