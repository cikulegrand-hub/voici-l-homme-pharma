import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { NotificationsService } from './notifications.service';

@Injectable()
export class NotificationsScheduler {
  constructor(private readonly notifications: NotificationsService) {}

  @Cron(CronExpression.EVERY_4_HOURS)
  async scan(): Promise<void> {
    await this.notifications.syncAlerts();
  }
}
