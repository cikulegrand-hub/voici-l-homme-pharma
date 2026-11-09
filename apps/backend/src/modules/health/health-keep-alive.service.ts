import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';

@Injectable()
export class HealthKeepAliveService {
  private readonly logger = new Logger('KeepAliveWorker');

  // Exécution toutes les 10 minutes pour éviter la mise en veille sur Render Free Tier (15 min)
  @Cron('*/10 * * * *')
  async handleKeepAlive() {
    const keepAliveUrl = process.env.KEEP_ALIVE_URL;
    if (!keepAliveUrl || !keepAliveUrl.startsWith('http')) {
      return;
    }

    try {
      const response = await fetch(keepAliveUrl, {
        method: 'GET',
        headers: { 'User-Agent': 'VHP-KeepAlive-Worker/1.0' },
      });
      if (response.ok) {
        this.logger.log(`[KeepAlive] Ping réussi vers ${keepAliveUrl} (${response.status})`);
      } else {
        this.logger.warn(`[KeepAlive] Ping retourné HTTP ${response.status}`);
      }
    } catch (err: any) {
      this.logger.warn(`[KeepAlive] Échec ping vers ${keepAliveUrl} : ${err?.message}`);
    }
  }
}
