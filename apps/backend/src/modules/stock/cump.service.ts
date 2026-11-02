import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

@Injectable()
export class CumpService {
  /**
   * Calcule et met à jour le Coût Unitaire Moyen Pondéré (CUMP) lors d'une réception.
   * 
   * Formule réglementaire CDC :
   * CUMP = (stock_actuel * CUMP_actuel + qte_recue * prix_achat) / (stock_actuel + qte_recue)
   * 
   * RÈGLES STRICTES :
   * - Mise à jour de products.cump_cdf UNIQUEMENT.
   * - Ne modifie JAMAIS products.selling_price_cdf.
   */
  async updateCumpOnReception(
    tx: Prisma.TransactionClient,
    productId: string,
    receivedQty: number,
    purchasePriceCdf: number,
  ): Promise<number> {
    if (receivedQty <= 0) {
      throw new Error('La quantité reçue doit être strictement supérieure à zéro.');
    }

    // 1. Récupérer le produit et son CUMP actuel
    const product = await tx.products.findUnique({
      where: { id: productId },
      select: { id: true, cump_cdf: true, selling_price_cdf: true },
    });

    if (!product) {
      throw new Error(`Produit introuvable : ${productId}`);
    }

    const currentCump = Number(product.cump_cdf) || 0;

    // 2. Calculer le stock actuel total vendable (non périmé, non en quarantaine, qte > 0)
    const aggregateStock = await tx.product_lots.aggregate({
      where: {
        product_id: productId,
        is_quarantined: false,
        current_quantity: { gt: 0 },
      },
      _sum: {
        current_quantity: true,
      },
    });

    // Le stock agrégé inclut déjà le lot nouvellement inséré dans la transaction.
    // Le stock avant cette réception correspond donc à (totalEnBase - receivedQty).
    const totalInDb = aggregateStock._sum.current_quantity || 0;
    const existingStock = Math.max(0, totalInDb - receivedQty);

    // 3. Calcul du nouveau CUMP pondéré selon RG-14 :
    // (stock_existant * CUMP_actuel + qte_recue * prix_achat) / (stock_existant + qte_recue)
    let newCump: number;
    if (existingStock <= 0 || currentCump <= 0) {
      newCump = purchasePriceCdf;
    } else {
      const totalValuation = existingStock * currentCump + receivedQty * purchasePriceCdf;
      const totalQuantity = existingStock + receivedQty;
      newCump = Math.round((totalValuation / totalQuantity) * 100) / 100;
    }

    // 4. Mettre à jour UNIQUEMENT products.cump_cdf (sans toucher à selling_price_cdf)
    await tx.products.update({
      where: { id: productId },
      data: {
        cump_cdf: newCump,
      },
    });

    return newCump;
  }
}

