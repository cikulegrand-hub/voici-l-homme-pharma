import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export type SupportedCurrency = 'USD' | 'CDF';

/** Single source of truth for selecting an exchange rate at a point in time. */
@Injectable()
export class ExchangeRateResolver {
  constructor(private readonly prisma: PrismaService) {}

  async getRateAt(pharmacyId: string, instant: Date = new Date(), baseCurrency: SupportedCurrency = 'USD', targetCurrency: SupportedCurrency = 'CDF', db: any = this.prisma) {
    if (!pharmacyId) throw new BadRequestException('L’officine est obligatoire pour résoudre un taux de change.');
    if (Number.isNaN(instant.getTime())) throw new BadRequestException('La date de référence du taux est invalide.');
    if (baseCurrency === targetCurrency) throw new BadRequestException('Les devises du taux doivent être différentes.');
    const rate = await db.exchange_rates.findFirst({
      where: { pharmacy_id: pharmacyId, base_currency: baseCurrency, target_currency: targetCurrency, effective_date: { lte: instant } },
      orderBy: [{ effective_date: 'desc' }, { id: 'desc' }],
    });
    if (!rate || Number(rate.rate) <= 0) throw new NotFoundException({ code: 'EXCHANGE_RATE_MISSING', message: `Aucun taux ${baseCurrency}/${targetCurrency} en vigueur pour cette officine à la date demandée.` });
    return rate;
  }
}
