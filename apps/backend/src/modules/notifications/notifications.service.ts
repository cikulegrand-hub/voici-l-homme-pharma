import { Injectable, Logger } from '@nestjs/common';
import { NotificationItem, NotificationType, NotificationSeverity, RoleName } from '@vhp/shared';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationQueryDto } from './dto/notifications.dto';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger('NotificationsService');

  constructor(private readonly prisma: PrismaService) {}

  // NOT-01 & NOT-02 : Génération d'alertes avec déduplication quotidienne
  async syncAlerts(pharmacyId = '11111111-1111-1111-1111-111111111111'): Promise<number> {
    const today = new Date().toISOString().split('T')[0];
    let createdCount = 0;

    try {
      // 1. Alertes Stock Bas (STK-06, NOT-01)
      const products = await this.prisma.products.findMany({
        where: { pharmacy_id: pharmacyId, is_active: true },
        include: { product_lots: true },
      });

      for (const product of products) {
        const totalStock = product.product_lots.reduce((sum, lot) => sum + lot.current_quantity, 0);
        const minStock = product.min_alert_threshold ?? 10;

        if (totalStock <= minStock) {
          const dedupKey = `STOCK_BAS:${product.id}:${today}`;
          const created = await this.createIfNotExists({
            pharmacyId,
            type: 'STOCK_BAS',
            title: `Stock bas : ${product.name}`,
            message: `Le stock total disponible (${totalStock}) est inférieur ou égal au seuil de réapprovisionnement (${minStock}).`,
            severity: totalStock === 0 ? 'DANGER' : 'WARNING',
            targetRole: 'PHARMACIEN',
            entityType: 'PRODUCT_LOT',
            entityId: product.id,
            metadata: { currentStock: totalStock, minStock },
            dedupKey,
          });
          if (created) createdCount++;
        }
      }

      // 2. Alertes Péremption (STK-07, NOT-01)
      const in90Days = new Date();
      in90Days.setDate(in90Days.getDate() + 90);

      const expLots = await this.prisma.product_lots.findMany({
        where: {
          current_quantity: { gt: 0 },
          expiry_date: { lte: in90Days },
          products: { pharmacy_id: pharmacyId },
        },
        include: { products: true },
      });

      const now = new Date();
      for (const lot of expLots) {
        const isExpired = lot.expiry_date <= now;
        const dedupKey = `PEREMPTION:${lot.id}:${today}`;
        const expiryFormatted = lot.expiry_date.toISOString().split('T')[0];

        const created = await this.createIfNotExists({
          pharmacyId,
          type: 'PEREMPTION',
          title: isExpired ? `Lot périmé : ${lot.lot_number}` : `Alerte péremption : ${lot.lot_number}`,
          message: isExpired
            ? `Le lot ${lot.lot_number} de ${lot.products.name} est périmé depuis le ${expiryFormatted} (${lot.current_quantity} unités restantes en rayon).`
            : `Le lot ${lot.lot_number} de ${lot.products.name} arrive à expiration le ${expiryFormatted} (${lot.current_quantity} unités).`,
          severity: isExpired ? 'DANGER' : 'WARNING',
          targetRole: 'PHARMACIEN',
          entityType: 'PRODUCT_LOT',
          entityId: lot.id,
          metadata: { lotNumber: lot.lot_number, expiryDate: expiryFormatted, quantity: lot.current_quantity },
          dedupKey,
        });
        if (created) createdCount++;
      }

      // 3. Alertes Créances Clients en Retard (CLI-03, NOT-01)
      const overdueCustomers = await this.prisma.customers.findMany({
        where: {
          pharmacy_id: pharmacyId,
          is_active: true,
          current_balance_cdf: { gt: 0 },
        },
      });

      for (const customer of overdueCustomers) {
        const balance = Number(customer.current_balance_cdf);
        const limit = Number(customer.credit_limit_cdf);

        if (balance > limit && limit > 0) {
          const dedupKey = `CREANCE_RETARD:${customer.id}:${today}`;
          const created = await this.createIfNotExists({
            pharmacyId,
            type: 'CREANCE_RETARD',
            title: `Plafond dépassé : ${customer.full_name}`,
            message: `Le solde client actuel (${balance.toLocaleString('fr-FR')} CDF) dépasse le plafond autorisé de ${limit.toLocaleString('fr-FR')} CDF.`,
            severity: 'WARNING',
            targetRole: 'COMPTABLE',
            entityType: 'CUSTOMER',
            entityId: customer.id,
            metadata: { balanceCdf: balance, creditLimitCdf: limit },
            dedupKey,
          });
          if (created) createdCount++;
        }
      }

      // 4. Alertes Écarts de Caisse (CAI-06, NOT-01)
      const sessionsWithVariance = await this.prisma.cash_sessions.findMany({
        where: {
          pharmacy_id: pharmacyId,
          status: 'CLOTUREE',
          OR: [
            { variance_cdf: { not: 0 } },
            { variance_usd: { not: 0 } },
          ],
        },
        orderBy: { closed_at: 'desc' },
        take: 10,
      });

      for (const session of sessionsWithVariance) {
        const varCdf = Number(session.variance_cdf || 0);
        const varUsd = Number(session.variance_usd || 0);
        if (varCdf !== 0 || varUsd !== 0) {
          const dedupKey = `ECART_CAISSE:${session.id}`;
          const created = await this.createIfNotExists({
            pharmacyId,
            type: 'ECART_CAISSE',
            title: `Écart de caisse : Session #${session.id.substring(0, 8)}`,
            message: `Un écart a été constaté à la clôture : ${varCdf !== 0 ? varCdf + ' CDF ' : ''}${varUsd !== 0 ? varUsd + ' USD' : ''}. Motif : ${session.variance_reason || 'Non renseigné'}.`,
            severity: 'DANGER',
            targetRole: 'COMPTABLE',
            entityType: 'CASH_SESSION',
            entityId: session.id,
            metadata: { varianceCdf: varCdf, varianceUsd: varUsd, reason: session.variance_reason },
            dedupKey,
          });
          if (created) createdCount++;
        }
      }
    } catch (err: any) {
      this.logger.error(`Erreur génération alertes automatiques : ${err.message}`);
    }

    return createdCount;
  }

  async createNotification(data: {
    pharmacyId: string;
    type: NotificationType;
    title: string;
    message: string;
    severity: NotificationSeverity;
    targetRole?: RoleName;
    entityType?: 'PRODUCT_LOT' | 'CUSTOMER' | 'CASH_SESSION' | 'SALE' | 'PURCHASE_ORDER' | string;
    entityId?: string;
    metadata?: Record<string, unknown>;
    dedupKey?: string;
  }): Promise<boolean> {
    const dedupKey = data.dedupKey || `${data.type}:${data.entityId || 'general'}:${new Date().toISOString().split('T')[0]}`;
    return this.createIfNotExists({
      ...data,
      dedupKey,
    });
  }

  private async createIfNotExists(data: {
    pharmacyId: string;
    type: NotificationType;
    title: string;
    message: string;
    severity: NotificationSeverity;
    targetRole?: RoleName;
    entityType?: 'PRODUCT_LOT' | 'CUSTOMER' | 'CASH_SESSION' | 'SALE' | 'PURCHASE_ORDER' | string;
    entityId?: string;
    metadata?: Record<string, unknown>;
    dedupKey: string;
  }): Promise<boolean> {
    const existing = await this.prisma.notifications.findFirst({
      where: {
        pharmacy_id: data.pharmacyId,
        dedup_key: data.dedupKey,
      },
    });

    if (existing) {
      return false; // Dédupliqué !
    }

    try {
      await this.prisma.notifications.create({
        data: {
        pharmacy_id: data.pharmacyId,
        type: data.type,
        title: data.title,
        message: data.message,
        severity: data.severity,
        target_role: data.targetRole || null,
        entity_type: data.entityType || null,
        entity_id: data.entityId || null,
        metadata: data.metadata as any || null,
        dedup_key: data.dedupKey,
        },
      });
    } catch (err: any) {
      // The unique index makes concurrent scans safe; a duplicate is not an error.
      if (err?.code === 'P2002') return false;
      throw err;
    }

    return true;
  }


  /**
   * Construit la clause WHERE de filtrage strict selon le rôle métier de l'utilisateur (VHP-AUT, NOT-01).
   * - ADMIN : accès absolu à 100% des notifications de l'officine.
   * - Autres rôles : cloisonnement strict par périmètre de responsabilité.
   */
  private getRoleNotificationWhere(actor: { role: string; pharmacyId: string }): any {
    if (actor.role === 'ADMIN') {
      return { pharmacy_id: actor.pharmacyId };
    }

    let allowedTypes: string[] = [];

    switch (actor.role) {
      case 'PHARMACIEN':
        // Validation clinique, ruptures, péremptions, ordonnances, litiges caisse
        allowedTypes = [
          'STOCK_BAS',
          'PEREMPTION',
          'STOCK_RUPTURE',
          'ORDONNANCE',
          'ANNULATION_VENTE',
          'ECART_CAISSE',
          'CREANCE_RETARD',
        ];
        break;

      case 'COMPTABLE':
        // Finances pures, écarts aux clôtures, règlements & retards créances
        allowedTypes = [
          'ECART_CAISSE',
          'CREANCE_RETARD',
          'DEPENSE',
          'AVOIR',
        ];
        break;

      case 'STOCK':
        // Gestion logistique, réceptions, seuils de réapprovisionnement, péremptions
        allowedTypes = [
          'STOCK_BAS',
          'PEREMPTION',
          'STOCK_RUPTURE',
          'COMMANDE_FOURNISSEUR',
        ];
        break;

      case 'CAISSIER':
        // Alertes directement liées aux sessions de caisse ou ventes comptoir
        allowedTypes = [
          'SESSION_CAISSE',
          'VENTE_ALERTE',
        ];
        break;

      default:
        allowedTypes = [];
    }

    return {
      pharmacy_id: actor.pharmacyId,
      OR: [
        { target_role: actor.role },
        { type: { in: allowedTypes } },
      ],
    };
  }

  // NOT-01 : Consultation des notifications avec statut lu/non-lu par utilisateur
  async getNotifications(
    actor: { id: string; role: string; pharmacyId: string },
    query?: NotificationQueryDto,
  ): Promise<NotificationItem[]> {
    const where: any = {
      pharmacy_id: actor.pharmacyId,
    };

    // Filtrage par rôle cible (Admin voit tout, les autres voient leur rôle ou null)
    if (actor.role !== 'ADMIN') {
      where.OR = [
        { target_role: actor.role },
        { target_role: null },
      ];
    }

    if (query?.type) {
      where.type = query.type;
    }

    if (query?.severity) {
      where.severity = query.severity;
    }

    const records = await this.prisma.notifications.findMany({
      where,
      include: {
        notification_reads: {
          where: { user_id: actor.id },
        },
      },
      orderBy: { created_at: 'desc' },
      take: 100,
    });

    const isUnreadFilter = query?.unreadOnly === true || query?.unreadOnly === 'true';

    const items: NotificationItem[] = records
      .map((r) => {
        const readRecord = r.notification_reads?.[0];
        const isRead = !!readRecord;
        return {
          id: r.id,
          pharmacyId: r.pharmacy_id,
          type: r.type as NotificationType,
          title: r.title,
          message: r.message,
          severity: r.severity as NotificationSeverity,
          targetRole: (r.target_role as RoleName) || undefined,
          entityType: (r.entity_type as any) || undefined,
          entityId: r.entity_id || undefined,
          metadata: (r.metadata as Record<string, unknown>) || undefined,
          isRead,
          readAt: readRecord?.read_at?.toISOString() || undefined,
          createdAt: r.created_at.toISOString(),
        };
      })
      .filter((item) => (!isUnreadFilter ? true : !item.isRead));

    return items;
  }

  // NOT-02 : Compteur de non lues pour badge d'en-tête (optimisé)
  async getUnreadCount(actor: { id: string; role: string; pharmacyId: string }): Promise<number> {
    const where: any = {
      pharmacy_id: actor.pharmacyId,
      notification_reads: {
        none: {
          user_id: actor.id,
        },
      },
    };

    if (actor.role !== 'ADMIN') {
      where.OR = [
        { target_role: actor.role },
        { target_role: null },
      ];
    }

    return this.prisma.notifications.count({ where });
  }

  // NOT-01 : Marquer une notification comme lue pour cet utilisateur
  async markAsRead(notificationId: string, userId: string): Promise<boolean> {
    try {
      const notification = await this.prisma.notifications.findFirst({
        where: { id: notificationId },
        select: { id: true },
      });
      if (!notification) return false;
      await this.prisma.notification_reads.upsert({
        where: {
          notification_id_user_id: {
            notification_id: notificationId,
            user_id: userId,
          },
        },
        create: {
          notification_id: notificationId,
          user_id: userId,
        },
        update: {
          read_at: new Date(),
        },
      });
      return true;
    } catch (err: any) {
      this.logger.error(`Erreur marquage notification lue : ${err.message}`);
      return false;
    }
  }

  // NOT-01 : Tout marquer comme lu pour cet utilisateur (traitement par lot efficace)
  async markAllAsRead(actor: { id: string; role: string; pharmacyId: string }): Promise<number> {
    const where: any = {
      pharmacy_id: actor.pharmacyId,
      notification_reads: {
        none: {
          user_id: actor.id,
        },
      },
    };

    if (actor.role !== 'ADMIN') {
      where.OR = [
        { target_role: actor.role },
        { target_role: null },
      ];
    }

    const unreadNotifications = await this.prisma.notifications.findMany({
      where,
      select: { id: true },
    });

    if (unreadNotifications.length === 0) return 0;

    const reads = unreadNotifications.map((n) => ({
      notification_id: n.id,
      user_id: actor.id,
      read_at: new Date(),
    }));

    await this.prisma.notification_reads.createMany({
      data: reads,
      skipDuplicates: true,
    });

    return unreadNotifications.length;
  }
}
