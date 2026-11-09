import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { StockService } from './stock.service';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class StockAlertsSchedulerService {
  private readonly logger = new Logger('StockAlertsScheduler');

  constructor(
    private readonly stockService: StockService,
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_6AM)
  async dailyAlertScan() {
    await this.checkStockAndExpiryAlerts();
  }

  @Cron(CronExpression.EVERY_4_HOURS)
  async periodicAlertScan() {
    await this.checkStockAndExpiryAlerts();
  }

  /** Génère les notifications de stock pour chaque pharmacie active. */
  async checkStockAndExpiryAlerts(): Promise<{
    lowStockCount: number;
    outOfStockCount: number;
    expiringIn30DaysCount: number;
    expiredCount: number;
  }> {
    const pharmacies = await this.prisma.pharmacies.findMany({ select: { id: true } });
    const totals = { lowStockCount: 0, outOfStockCount: 0, expiringIn30DaysCount: 0, expiredCount: 0 };

    for (const pharmacy of pharmacies) {
      try {
        const summary = await this.stockService.getAlerts(pharmacy.id);
        await this.stockService.persistGeneratedNotifications(pharmacy.id, summary);
        await this.notificationsService.syncAlerts(pharmacy.id);
        totals.lowStockCount += summary.lowStock.length;
        totals.outOfStockCount += summary.outOfStock.length;
        totals.expiringIn30DaysCount += summary.expiringIn30Days.length;
        totals.expiredCount += summary.expired.length;
      } catch (err: any) {
        this.logger.error(`Erreur lors du contrôle des alertes pour ${pharmacy.id} : ${err.message}`);
      }
    }

    if (totals.lowStockCount > 0 || totals.outOfStockCount > 0) {
      this.logger.warn(
        `[ALERTE STOCK] ${totals.outOfStockCount} produit(s) en RUPTURE et ${totals.lowStockCount} produit(s) sous le seuil d’alerte minimal.`,
      );
    }
    if (totals.expiringIn30DaysCount > 0 || totals.expiredCount > 0) {
      this.logger.warn(
        `[ALERTE PÉREMPTION] ${totals.expiringIn30DaysCount} lot(s) périment dans moins de 30 jours, ${totals.expiredCount} lot(s) sont déjà périmés.`,
      );
    }

    return totals;
  }
}
