import { Component, Input, forwardRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, NG_VALUE_ACCESSOR, ControlValueAccessor } from '@angular/forms';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatNativeDateModule } from '@angular/material/core';

@Component({
  selector: 'app-date-picker',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatDatepickerModule,
    MatFormFieldModule,
    MatInputModule,
    MatNativeDateModule,
  ],
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => DatePickerComponent),
      multi: true,
    },
  ],
  template: `
    <mat-form-field appearance="outline" class="date-field">
      <mat-label>{{ label }}</mat-label>
      <input
        matInput
        [matDatepicker]="picker"
        [(ngModel)]="dateValue"
        (dateChange)="onDateChange($event)"
        [placeholder]="placeholder"
        [min]="minDate"
        [max]="maxDate"
      >
      <mat-datepicker-toggle matSuffix [for]="picker"></mat-datepicker-toggle>
      <mat-datepicker #picker></mat-datepicker>
    </mat-form-field>
  `,
  styles: [`
    .date-field {
      width: 100%;
    }
  `],
})
export class DatePickerComponent implements ControlValueAccessor {
  @Input() label = 'Date';
  @Input() placeholder = 'JJ/MM/AAAA';
  @Input() minDate?: Date;
  @Input() maxDate?: Date;

  dateValue: Date | null = null;

  private onChange: (value: Date | null) => void = () => {};
  private onTouched: () => void = () => {};

  writeValue(value: Date | string | null): void {
    if (typeof value === 'string' && value) {
      this.dateValue = new Date(value);
    } else {
      this.dateValue = value as Date | null;
    }
  }

  registerOnChange(fn: (value: Date | null) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  onDateChange(event: any): void {
    this.dateValue = event.value;
    this.onChange(event.value);
    this.onTouched();
  }
}

