import { Component, Inject, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatDialogModule, MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { AuthApiService } from '../../../core/api/services/auth-api.service';
import { I18N_FR } from '../../../core/i18n/translations.fr';

export interface PinDialogData {
  action: string;
  actionLabel?: string;
}

export interface PinDialogResult {
  valid: boolean;
  action: string;
  authorizationToken?: string;
  expiresAt?: string;
  supervisorName?: string;
}

@Component({
  selector: 'app-pin-reauth-dialog',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatDialogModule,
    MatButtonModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
    MatProgressSpinnerModule,
  ],
  template: `
    <h2 mat-dialog-title class="pin-title">
      <mat-icon class="pin-icon">security</mat-icon>
      {{ i18n.reauth.title }}
    </h2>

    <mat-dialog-content>
      <p class="pin-subtitle">{{ i18n.reauth.subtitle }}</p>
      <p class="pin-action" *ngIf="data.actionLabel">
        <strong>Action :</strong> {{ data.actionLabel }}
      </p>

      <div class="pin-input-container">
        <mat-form-field appearance="outline" class="pin-field">
          <mat-label>{{ i18n.reauth.pinLabel }}</mat-label>
          <input
            matInput
            type="password"
            maxlength="4"
            pattern="[0-9]*"
            inputmode="numeric"
            [(ngModel)]="pinCode"
            (keydown.enter)="onVerify()"
            [disabled]="isVerifying()"
            autocomplete="off"
            cdkFocusInitial
          >
        </mat-form-field>
      </div>

      <!-- Pavé numérique virtuel pour tablette (ERG-02) -->
      <div class="numpad">
        @for (digit of numpadDigits; track digit) {
          <button
            mat-flat-button
            class="numpad-btn"
            (click)="appendDigit(digit)"
            [disabled]="isVerifying() || pinCode.length >= 4"
          >
            {{ digit }}
          </button>
        }
        <button mat-flat-button class="numpad-btn numpad-clear" (click)="clearPin()">
          <mat-icon>backspace</mat-icon>
        </button>
      </div>

      <p class="pin-error" *ngIf="errorMessage()">
        <mat-icon>error</mat-icon> {{ errorMessage() }}
      </p>
    </mat-dialog-content>

    <mat-dialog-actions align="end">
      <button mat-button (click)="onCancel()" [disabled]="isVerifying()">
        {{ i18n.actions.cancel }}
      </button>
      <button
        mat-flat-button
        color="primary"
        (click)="onVerify()"
        [disabled]="pinCode.length !== 4 || isVerifying()"
      >
        <mat-spinner *ngIf="isVerifying()" diameter="18" class="btn-spinner"></mat-spinner>
        {{ isVerifying() ? i18n.reauth.verifying : i18n.reauth.verify }}
      </button>
    </mat-dialog-actions>
  `,
  styles: [`
    .pin-title {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .pin-icon {
      color: #f2994a;
    }

    .pin-subtitle {
      font-size: 13px;
      color: #5f6368;
      margin-bottom: 8px;
    }

    .pin-action {
      font-size: 13px;
      background: #f8f9fa;
      padding: 8px 12px;
      border-radius: 6px;
      margin-bottom: 16px;
    }

    .pin-input-container {
      display: flex;
      justify-content: center;
      margin-bottom: 16px;
    }

    .pin-field {
      width: 180px;
      text-align: center;
    }

    .pin-field input {
      text-align: center;
      font-size: 24px;
      letter-spacing: 8px;
      font-family: var(--vhp-font-mono, monospace);
    }

    .numpad {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 8px;
      max-width: 240px;
      margin: 0 auto 16px auto;
    }

    .numpad-btn {
      min-height: 48px;
      font-size: 20px;
      font-weight: 600;
    }

    .numpad-clear {
      grid-column: span 2;
    }

    .pin-error {
      display: flex;
      align-items: center;
      gap: 6px;
      color: #c5221f;
      font-size: 13px;
      font-weight: 500;
    }

    .btn-spinner {
      display: inline-block;
      margin-right: 8px;
    }
  `],
})
export class PinReauthDialogComponent {
  private readonly authApi = inject(AuthApiService);
  readonly i18n = I18N_FR;

  pinCode = '';
  readonly isVerifying = signal(false);
  readonly errorMessage = signal<string | null>(null);

  readonly numpadDigits = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'];

  constructor(
    public dialogRef: MatDialogRef<PinReauthDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: PinDialogData,
  ) {}

  appendDigit(digit: string): void {
    if (this.pinCode.length < 4) {
      this.pinCode += digit;
    }
  }

  clearPin(): void {
    this.pinCode = this.pinCode.slice(0, -1);
    this.errorMessage.set(null);
  }

  onCancel(): void {
    this.dialogRef.close({ valid: false, action: this.data.action });
  }

  onVerify(): void {
    if (this.pinCode.length !== 4) return;

    this.isVerifying.set(true);
    this.errorMessage.set(null);

    this.authApi.verifyPin({ pinCode: this.pinCode, action: this.data.action }).subscribe({
      next: (result) => {
        this.isVerifying.set(false);
        if (result.valid) {
          this.dialogRef.close({
            valid: true,
            action: this.data.action,
            authorizationToken: result.authorizationToken,
            expiresAt: result.expiresAt,
            supervisorName: result.supervisorName,
          });
        } else {
          this.errorMessage.set(this.i18n.reauth.invalidPin);
          this.pinCode = '';
        }
      },
      error: () => {
        this.isVerifying.set(false);
        this.errorMessage.set(this.i18n.reauth.invalidPin);
        this.pinCode = '';
      },
    });
  }
}

