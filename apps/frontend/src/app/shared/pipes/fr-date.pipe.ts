import { Pipe, PipeTransform } from '@angular/core';

/**
 * Pipe de formatage de dates au format français.
 *
 * Usage : {{ '2026-10-29T18:00:00Z' | frDate }}             → "29/10/2026"
 *         {{ '2026-10-29T18:00:00Z' | frDate:'datetime' }}  → "29/10/2026 18:00"
 *         {{ '2026-10-29T18:00:00Z' | frDate:'time' }}      → "18:00"
 */
@Pipe({
  name: 'frDate',
  standalone: true,
})
export class FrDatePipe implements PipeTransform {
  transform(value: string | Date | null | undefined, format: 'date' | 'datetime' | 'time' = 'date'): string {
    if (!value) return '';

    const date = typeof value === 'string' ? new Date(value) : value;

    if (isNaN(date.getTime())) return '';

    switch (format) {
      case 'datetime':
        return new Intl.DateTimeFormat('fr-FR', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        }).format(date);

      case 'time':
        return new Intl.DateTimeFormat('fr-FR', {
          hour: '2-digit',
          minute: '2-digit',
        }).format(date);

      case 'date':
      default:
        return new Intl.DateTimeFormat('fr-FR', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
        }).format(date);
    }
  }
}

