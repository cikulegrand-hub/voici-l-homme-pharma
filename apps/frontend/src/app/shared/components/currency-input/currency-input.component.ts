import { Component, Input, Output, EventEmitter, forwardRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, NG_VALUE_ACCESSOR, ControlValueAccessor } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { CurrencyCode } from '@vhp/shared';

@Component({
  selector: 'app-currency-input',
  standalone: true,
  imports: [CommonModule, FormsModule, MatFormFieldModule, MatInputModule, MatSelectModule],
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => CurrencyInputComponent),
      multi: true,
    },
  ],
  template: `
    <mat-form-field appearance="outline" class="currency-field">
      <mat-label>{{ label }}</mat-label>
      <input
        matInput
        type="text"
        inputmode="decimal"
        [value]="formattedValue"
        (input)="onInput($event)"
        (blur)="onBlur()"
        [placeholder]="placeholder"
        [readonly]="readonly"
      >
      <span matSuffix class="currency-suffix">{{ currency }}</span>
    </mat-form-field>
  `,
  styles: [`
    .currency-field {
      width: 100%;
    }

    .currency-suffix {
      font-weight: 600;
      color: var(--vhp-text-secondary, #5f6368);
      font-size: 13px;
      padding-right: 8px;
    }
  `],
})
export class CurrencyInputComponent implements ControlValueAccessor {
  @Input() label = 'Montant';
  @Input() currency: CurrencyCode = 'CDF';
  @Input() placeholder = '0';
  @Input() readonly = false;

  formattedValue = '';
  private rawValue: number | null = null;

  private onChange: (value: number | null) => void = () => {};
  private onTouched: () => void = () => {};

  writeValue(value: number | null): void {
    this.rawValue = value;
    this.formattedValue = this.formatNumber(value);
  }

  registerOnChange(fn: (value: number | null) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  onInput(event: Event): void {
    const inputEl = event.target as HTMLInputElement;
    // Garder uniquement chiffres, virgule et point
    const cleaned = inputEl.value.replace(/[^\d.,]/g, '');
    // Convertir virgule en point pour le parsing
    const normalized = cleaned.replace(',', '.');
    const parsed = parseFloat(normalized);

    if (!isNaN(parsed)) {
      this.rawValue = parsed;
      this.onChange(parsed);
    } else if (cleaned === '') {
      this.rawValue = null;
      this.onChange(null);
    }

    // Formater l'affichage avec séparateurs de milliers
    this.formattedValue = cleaned;
  }

  onBlur(): void {
    this.onTouched();
    this.formattedValue = this.formatNumber(this.rawValue);
  }

  private formatNumber(value: number | null): string {
    if (value === null || value === undefined) return '';

    const decimals = this.currency === 'USD' ? 2 : 0;
    return new Intl.NumberFormat('fr-FR', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    }).format(value);
  }
}

