import { Pipe, PipeTransform } from '@angular/core';
import { CurrencyCode } from '@vhp/shared';

/**
 * Pipe de formatage de montant en devise (CDF ou USD).
 * CDF : séparateur de milliers (espace), pas de décimales
 * USD : séparateur de milliers (espace), 2 décimales
 *
 * Usage : {{ 250000 | currencyFormat:'CDF' }}  → "250 000 CDF"
 *         {{ 87.5 | currencyFormat:'USD' }}     → "87,50 USD"
 */
@Pipe({
  name: 'currencyFormat',
  standalone: true,
})
export class CurrencyFormatPipe implements PipeTransform {
  transform(value: number | null | undefined, currency: CurrencyCode = 'CDF', showSymbol = true): string {
    if (value === null || value === undefined) return '';

    const decimals = currency === 'USD' ? 2 : 0;
    const formatted = new Intl.NumberFormat('fr-FR', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    }).format(value);

    return showSymbol ? `${formatted} ${currency}` : formatted;
  }
}

