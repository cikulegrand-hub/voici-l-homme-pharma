import { Injectable, BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ProductLot, SaleItemAllocation } from '@vhp/shared';
import { PrismaService } from '../prisma/prisma.service';

export class InsufficientStockException extends BadRequestException {
  constructor(message: string, public readonly details?: Record<string, any>) {
    super({
      statusCode: 400,
      error: 'STOCK_INSUFFISANT',
      message,
      ...(details ? { details } : {}),
    });
  }
}

export interface DeductStockItemParams {
  productId: string;
  quantityNeeded: number;
  unitPriceCdf: number;
  discountCdf?: number;
  lotId?: string;
}

export interface DeductStockParams {
  saleId: string;
  pharmacyId: string;
  userId: string;
  invoiceNumber: string;
  items: DeductStockItemParams[];
}

export interface AllocatedLotItem {
  lotId: string;
  lotNumber: string;
  expiryDate: string;
  quantity: number;
  allocatedQuantity?: number;
  unitPriceCdf: number;
  unitCostCumpCdf: number;
  discountCdf: number;
  totalLineCdf: number;
  productId: string;
}

export interface DeductStockResult {
  allocations: AllocatedLotItem[];
  totalCdf: number;
  totalDiscountCdf: number;
  rawSubtotalCdf: number;
}

interface RawLockedLot {
  id: string;
  lot_number: string;
  expiry_date: Date;
  current_quantity: number;
  purchase_price_cdf: any;
}

@Injectable()
export class FefoService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Méthode transactionnelle FEFO avec verrouillage de ligne exclusif (SELECT ... FOR UPDATE).
   * 
   * RÈGLES CDC & RG-01 / RG-02 / RG-03 :
   * 1. Verrouille les lots éligibles en base via FOR UPDATE pour éliminer toute race condition.
   * 2. Exclut les lots périmés (expiry_date <= CURRENT_DATE) et les lots en quarantaine.
   * 3. Trie strictement selon FEFO : expiry_date ASC, puis created_at ASC.
   * 4. Si la quantité cumulée des lots disponibles est inférieure à la demande :
   *    lève une InsufficientStockException (code STOCK_INSUFFISANT) qui provoque le ROLLBACK complet.
   * 5. Décrémente chaque lot, insère le stock_movements (SORTIE_VENTE, direction OUT) et le sale_items.
   */
  async allocateAndDeductStockInTx(
    tx: Prisma.TransactionClient,
    params: DeductStockParams,
  ): Promise<DeductStockResult> {
    const allocations: AllocatedLotItem[] = [];
    let grandTotalCdf = 0;
    let grandDiscountCdf = 0;
    let grandRawSubtotalCdf = 0;

    for (const item of params.items) {
      if (item.quantityNeeded <= 0) {
        throw new BadRequestException('La quantité demandée pour un produit doit être supérieure à 0.');
      }

      // 1. Récupérer le produit et son CUMP actuel
      const product = await tx.products.findUnique({
        where: { id: item.productId },
        select: { id: true, name: true, cump_cdf: true, selling_price_cdf: true, pharmacy_id: true },
      });

      if (!product) {
        throw new BadRequestException(`Produit introuvable : ${item.productId}`);
      }
      if (product.pharmacy_id !== params.pharmacyId) {
        throw new BadRequestException(`Produit introuvable pour cette pharmacie : ${item.productId}`);
      }

      const cumpCdf = Number(product.cump_cdf) || 0;

      // 2. Verrouillage exclusif (FOR UPDATE) des lots vendables ordonnés selon FEFO (ou lot spécifique si habilité)
      const lockedLots: RawLockedLot[] = item.lotId
        ? await tx.$queryRaw`
            SELECT id, lot_number, expiry_date, current_quantity, purchase_price_cdf
            FROM product_lots
            WHERE id = ${item.lotId}::uuid
              AND product_id = ${item.productId}::uuid
              AND expiry_date > CURRENT_DATE
              AND is_quarantined = FALSE
              AND current_quantity > 0
            FOR UPDATE;
          `
        : await tx.$queryRaw`
            SELECT id, lot_number, expiry_date, current_quantity, purchase_price_cdf
            FROM product_lots
            WHERE product_id = ${item.productId}::uuid
              AND expiry_date > CURRENT_DATE
              AND is_quarantined = FALSE
              AND current_quantity > 0
            ORDER BY expiry_date ASC, created_at ASC
            FOR UPDATE;
          `;

      // 3. Calcul du stock total disponible verrouillé
      const totalAvailable = lockedLots.reduce((sum, l) => sum + Number(l.current_quantity), 0);

      if (totalAvailable < item.quantityNeeded) {
        throw new InsufficientStockException(
          `Stock insuffisant pour le produit « ${product.name} » : ${item.quantityNeeded} unités demandées, mais seulement ${totalAvailable} disponibles en rayon non périmé.`,
          {
            productId: item.productId,
            productName: product.name,
            requested: item.quantityNeeded,
            available: totalAvailable,
          },
        );
      }

      // 4. Imputation FEFO séquentielle sur les lots verrouillés
      let remainingToDeduct = item.quantityNeeded;
      const itemRawTotal = item.quantityNeeded * item.unitPriceCdf;
      const totalItemDiscount = item.discountCdf || 0;
      grandRawSubtotalCdf += itemRawTotal;
      grandDiscountCdf += totalItemDiscount;

      for (const lot of lockedLots) {
        if (remainingToDeduct <= 0) break;

        const lotQty = Number(lot.current_quantity);
        const takeQty = Math.min(lotQty, remainingToDeduct);

        // Prorata de la remise sur ce lot
        const share = takeQty / item.quantityNeeded;
        const lotDiscount = Math.round(totalItemDiscount * share * 100) / 100;
        const totalLineCdf = takeQty * item.unitPriceCdf - lotDiscount;
        grandTotalCdf += totalLineCdf;

        const lotCost = cumpCdf > 0 ? cumpCdf : Number(lot.purchase_price_cdf) || 0;

        // Décrémentation du stock du lot
        await tx.product_lots.update({
          where: { id: lot.id },
          data: { current_quantity: { decrement: takeQty } },
        });

        // Enregistrement de la ligne de vente (sale_items) si applicable
        if (params.saleId) {
          await tx.sale_items.create({
            data: {
              sale_id: params.saleId,
              product_id: item.productId,
              lot_id: lot.id,
              quantity: takeQty,
              unit_price_cdf: item.unitPriceCdf,
              unit_cost_cump_cdf: lotCost,
              discount_amount_cdf: lotDiscount,
              tax_rate: 0.0,
              total_line_cdf: totalLineCdf,
            },
          });
        }

        // Enregistrement du mouvement de stock obligatoire (audit & traçabilité)
        await tx.stock_movements.create({
          data: {
            pharmacy_id: params.pharmacyId,
            lot_id: lot.id,
            user_id: params.userId,
            type: 'SORTIE_VENTE',
            quantity: takeQty,
            direction: 'OUT',
            unit_cost_cdf: lotCost,
            reason: `Vente ${params.invoiceNumber}`,
          },
        });

        allocations.push({
          lotId: lot.id,
          lotNumber: lot.lot_number,
          expiryDate: lot.expiry_date.toISOString().split('T')[0],
          quantity: takeQty,
          unitPriceCdf: item.unitPriceCdf,
          unitCostCumpCdf: lotCost,
          discountCdf: lotDiscount,
          totalLineCdf,
          productId: item.productId,
        });

        remainingToDeduct -= takeQty;
      }
    }

    return {
      allocations,
      totalCdf: grandTotalCdf,
      totalDiscountCdf: grandDiscountCdf,
      rawSubtotalCdf: grandRawSubtotalCdf,
    };
  }

  /**
   * Allocation FEFO réutilisable (Ventes / simulation) : lots à consommer, sans écriture.
   */
  async allocateLots(
    items: { productId: string; quantityNeeded?: number; quantity?: number }[],
    pharmacyId: string,
  ) {
    const normalized = items.map((it) => ({
      productId: it.productId,
      quantityNeeded: it.quantityNeeded ?? it.quantity ?? 1,
    }));
    return this.simulateFefoAllocation(normalized, pharmacyId);
  }

  /**
   * Simulation d'allocation FEFO sans écriture en base (consultation par la caisse).
   */
  async simulateFefoAllocation(
    items: { productId: string; quantityNeeded: number }[],
    pharmacyId: string,
  ): Promise<{
    allocations: AllocatedLotItem[];
    canFulfillAll: boolean;
  }> {
    const allocations: AllocatedLotItem[] = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    for (const item of items) {
      const product = await this.prisma.products.findUnique({
        where: { id: item.productId },
        select: { id: true, name: true, cump_cdf: true, selling_price_cdf: true, pharmacy_id: true },
      });

      if (!product) {
        throw new BadRequestException(`Produit introuvable : ${item.productId}`);
      }
      if (product.pharmacy_id !== pharmacyId) {
        throw new BadRequestException(`Produit introuvable pour cette pharmacie : ${item.productId}`);
      }

      const lots = await this.prisma.product_lots.findMany({
        where: {
          product_id: item.productId,
          expiry_date: { gt: today },
          is_quarantined: false,
          current_quantity: { gt: 0 },
        },
        orderBy: [{ expiry_date: 'asc' }, { created_at: 'asc' }],
      });

      const totalAvail = lots.reduce((sum, l) => sum + l.current_quantity, 0);
      if (totalAvail < item.quantityNeeded) {
        throw new InsufficientStockException(
          `Stock insuffisant pour « ${product.name} » : ${item.quantityNeeded} demandées, ${totalAvail} disponibles.`,
          { productId: item.productId, available: totalAvail, requested: item.quantityNeeded },
        );
      }

      let remaining = item.quantityNeeded;
      const unitPriceCdf = Number(product.selling_price_cdf) || 0;
      const cumpCdf = Number(product.cump_cdf) || 0;

      for (const lot of lots) {
        if (remaining <= 0) break;
        const takeQty = Math.min(lot.current_quantity, remaining);
        allocations.push({
          lotId: lot.id,
          lotNumber: lot.lot_number,
          expiryDate: lot.expiry_date.toISOString().split('T')[0],
          quantity: takeQty,
          allocatedQuantity: takeQty,
          unitPriceCdf,
          unitCostCumpCdf: cumpCdf,
          discountCdf: 0,
          totalLineCdf: takeQty * unitPriceCdf,
          productId: item.productId,
        });
        remaining -= takeQty;
      }
    }

    return { allocations, canFulfillAll: true };
  }

  /**
   * Version en mémoire pour aperçu / calculs préliminaires hors transaction.
   */
  allocateLotsForSale(
    availableLots: ProductLot[],
    quantityNeeded: number,
    sellingPriceCdf: number,
    cumpCdf: number,
  ): SaleItemAllocation[] {
    const today = new Date().toISOString().split('T')[0];

    const validLots = availableLots
      .filter((lot) => !lot.isQuarantined && lot.expiryDate > today && lot.currentQuantity > 0)
      .sort((a, b) => new Date(a.expiryDate).getTime() - new Date(b.expiryDate).getTime());

    const totalAvailable = validLots.reduce((sum, lot) => sum + lot.currentQuantity, 0);
    if (totalAvailable < quantityNeeded) {
      throw new InsufficientStockException(
        `Stock insuffisant : ${quantityNeeded} unités demandées, mais seulement ${totalAvailable} disponibles en rayon non périmé.`,
        { requested: quantityNeeded, available: totalAvailable },
      );
    }

    const allocations: SaleItemAllocation[] = [];
    let remaining = quantityNeeded;

    for (const lot of validLots) {
      if (remaining <= 0) break;

      const takeQty = Math.min(lot.currentQuantity, remaining);
      allocations.push({
        lotId: lot.id,
        lotNumber: lot.lotNumber,
        expiryDate: lot.expiryDate,
        quantity: takeQty,
        unitPriceCdf: sellingPriceCdf,
        unitCostCumpCdf: cumpCdf,
        discountCdf: 0,
        totalLineCdf: takeQty * sellingPriceCdf,
      });

      remaining -= takeQty;
    }

    return allocations;
  }
}
