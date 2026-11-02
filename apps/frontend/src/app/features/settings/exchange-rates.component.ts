import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTableModule } from '@angular/material/table';
import { MatChipsModule } from '@angular/material/chips';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';

import { CashApiService } from '../../core/api/services/cash-api.service';
import { AuthService } from '../../core/auth/auth.service';
import { AlertService } from '../../core/services/alert.service';
import { I18N_FR } from '../../core/i18n/translations.fr';
import { ExchangeRate } from '@vhp/shared';

@Component({
  selector: 'app-exchange-rates',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
    MatTableModule,
    MatChipsModule,
    MatProgressSpinnerModule,
    MatTooltipModule,
  ],
  template: `
    <div class="exchange-rates-page">
      <header class="page-header">
        <div>
          <h2>{{ i18n.exchangeRates.title }}</h2>
          <p class="subtitle">{{ i18n.exchangeRates.subtitle }}</p>
        </div>
      </header>

      <!-- Alerte si aucun taux en vigueur (FIN-04 / RG-08) -->
      @if (!activeRate() && !isLoading()) {
        <div class="missing-rate-alert">
          <mat-icon class="alert-icon">error</mat-icon>
          <div class="alert-content">
            <strong>{{ i18n.exchangeRates.missingRateWarning }}</strong>
            <p>Toutes les transactions multi-devises sont suspendues tant qu’un taux officiel n’a pas été enregistré.</p>
          </div>
        </div>
      }

      <div class="content-grid">
        <!-- Formulaire de saisie d'un nouveau taux -->
        <mat-card class="form-card">
          <mat-card-header>
            <mat-icon matCardAvatar color="primary">add_circle</mat-icon>
            <mat-card-title>{{ i18n.exchangeRates.newRateTitle }}</mat-card-title>
          </mat-card-header>

          <mat-card-content>
            <form (ngSubmit)="onSubmit()" #rateForm="ngForm" class="rate-form">
              <div class="form-row">
                <mat-form-field appearance="outline" class="col">
                  <mat-label>{{ i18n.exchangeRates.baseCurrency }}</mat-label>
                  <input matInput [(ngModel)]="baseCurrency" name="baseCurrency" readonly />
                </mat-form-field>

                <mat-form-field appearance="outline" class="col">
                  <mat-label>{{ i18n.exchangeRates.targetCurrency }}</mat-label>
                  <input matInput [(ngModel)]="targetCurrency" name="targetCurrency" readonly />
                </mat-form-field>
              </div>

              <mat-form-field appearance="outline" class="full-width">
                <mat-label>{{ i18n.exchangeRates.rateValue }}</mat-label>
                <input
                  matInput
                  type="number"
                  step="0.01"
                  min="1"
                  [(ngModel)]="rateValue"
                  name="rateValue"
                  required
                  placeholder="Ex : 2850"
                  #rateInput="ngModel"
                />
                <span matSuffix class="suffix-text">CDF</span>
                @if (rateInput.invalid && rateInput.touched) {
                  <mat-error>La valeur du taux doit être supérieure à zéro.</mat-error>
                }
              </mat-form-field>

              <mat-form-field appearance="outline" class="full-width">
                <mat-label>{{ i18n.exchangeRates.effectiveDate }}</mat-label>
                <input
                  matInput
                  type="datetime-local"
                  [(ngModel)]="effectiveDate"
                  name="effectiveDate"
                  required
                />
              </mat-form-field>

              <mat-form-field appearance="outline" class="full-width">
                <mat-label>{{ i18n.exchangeRates.notes }}</mat-label>
                <textarea
                  matInput
                  rows="2"
                  [(ngModel)]="notes"
                  name="notes"
                  placeholder="Ex : Taux officiel BCC communiqué ce matin"
                ></textarea>
              </mat-form-field>

              <div class="form-actions">
                <button
                  mat-flat-button
                  color="primary"
                  type="submit"
                  [disabled]="isSubmitting() || !rateValue || rateValue <= 0"
                  class="submit-button"
                >
                  @if (isSubmitting()) {
                    <mat-spinner diameter="18" class="button-spinner"></mat-spinner>
                  }
                  {{ i18n.exchangeRates.saveRate }}
                </button>
              </div>
            </form>
          </mat-card-content>
        </mat-card>

        <!-- Tableau historique des taux -->
        <mat-card class="table-card">
          <mat-card-header>
            <mat-icon matCardAvatar color="accent">history</mat-icon>
            <mat-card-title>{{ i18n.exchangeRates.historyTitle }}</mat-card-title>
          </mat-card-header>

          <mat-card-content class="table-container">
            @if (isLoading()) {
              <div class="loading-state">
                <mat-spinner diameter="32"></mat-spinner>
                <p>Chargement des taux...</p>
              </div>
            } @else if (rates().length === 0) {
              <div class="empty-state">
                <mat-icon class="empty-icon">trending_flat</mat-icon>
                <p>Aucun taux de change enregistré pour le moment.</p>
              </div>
            } @else {
              <table mat-table [dataSource]="rates()" class="rates-table">
                <!-- Date -->
                <ng-container matColumnDef="date">
                  <th mat-header-cell *matHeaderCellDef>{{ i18n.loginHistory.date }}</th>
                  <td mat-cell *matCellDef="let row">
                    {{ row.effectiveDate | date:'dd/MM/yyyy HH:mm' }}
                  </td>
                </ng-container>

                <!-- Taux -->
                <ng-container matColumnDef="rate">
                  <th mat-header-cell *matHeaderCellDef>{{ i18n.exchangeRates.rate }}</th>
                  <td mat-cell *matCellDef="let row" class="rate-cell">
                    <strong>1 {{ row.baseCurrency }} = {{ row.rate | number:'1.0-2' }} {{ row.targetCurrency }}</strong>
                  </td>
                </ng-container>

                <!-- Saisi par -->
                <ng-container matColumnDef="user">
                  <th mat-header-cell *matHeaderCellDef>{{ i18n.exchangeRates.recordedBy }}</th>
                  <td mat-cell *matCellDef="let row">
                    {{ row.createdByName || 'Administrateur' }}
                  </td>
                </ng-container>

                <!-- Statut -->
                <ng-container matColumnDef="status">
                  <th mat-header-cell *matHeaderCellDef>{{ i18n.users.status }}</th>
                  <td mat-cell *matCellDef="let row; let i = index">
                    @if (i === 0) {
                      <span class="status-badge active">{{ i18n.exchangeRates.statusActive }}</span>
                    } @else {
                      <span class="status-badge archive">{{ i18n.exchangeRates.statusHistorical }}</span>
                    }
                  </td>
                </ng-container>

                <tr mat-header-row *matHeaderRowDef="displayedColumns"></tr>
                <tr mat-row *matRowDef="let row; columns: displayedColumns;"></tr>
              </table>
            }
          </mat-card-content>
        </mat-card>
      </div>
    </div>
  `,
  styles: [`
    .exchange-rates-page {
      display: flex;
      flex-direction: column;
      gap: 20px;
      font-family: var(--vhp-font);
    }
    .page-header h2 {
      font-size: 20px;
      font-weight: 700;
      color: #1e3a2f;
      margin: 0;
    }
    .subtitle {
      color: #5f6368;
      font-size: 13px;
      margin-top: 4px;
    }
    .missing-rate-alert {
      background: #fee2e2;
      border: 1px solid #ef4444;
      border-radius: 8px;
      padding: 16px;
      display: flex;
      gap: 12px;
      color: #991b1b;
      align-items: flex-start;
    }
    .alert-icon {
      color: #dc2626;
      font-size: 28px;
      width: 28px;
      height: 28px;
    }
    .alert-content p {
      margin: 4px 0 0;
      font-size: 13px;
    }
    .content-grid {
      display: grid;
      grid-template-columns: 420px 1fr;
      gap: 20px;
    }
    @media (max-width: 960px) {
      .content-grid {
        grid-template-columns: 1fr;
      }
    }
    .form-card, .table-card {
      border-radius: 12px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.08);
      padding: 8px;
    }
    .rate-form {
      display: flex;
      flex-direction: column;
      gap: 12px;
      margin-top: 16px;
    }
    .form-row {
      display: flex;
      gap: 12px;
    }
    .col {
      flex: 1;
    }
    .full-width {
      width: 100%;
    }
    .suffix-text {
      color: #5f6368;
      font-weight: 600;
      margin-right: 8px;
    }
    .form-actions {
      display: flex;
      justify-content: flex-end;
      margin-top: 8px;
    }
    .submit-button {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .button-spinner {
      margin-right: 6px;
    }
    .table-container {
      margin-top: 16px;
      overflow-x: auto;
    }
    .rates-table {
      width: 100%;
    }
    .rate-cell {
      color: #0f9d58;
    }
    .status-badge {
      display: inline-block;
      padding: 2px 8px;
      border-radius: 12px;
      font-size: 11px;
      font-weight: 600;
    }
    .status-badge.active {
      background: #e6f4ea;
      color: #137333;
    }
    .status-badge.archive {
      background: #f1f3f4;
      color: #5f6368;
    }
    .loading-state, .empty-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 40px;
      color: #5f6368;
      gap: 12px;
    }
    .empty-icon {
      font-size: 40px;
      width: 40px;
      height: 40px;
      color: #9aa0a6;
    }
  `],
})
export class ExchangeRatesComponent implements OnInit {
  private readonly cashApi = inject(CashApiService);
  private readonly authService = inject(AuthService);
  private readonly alert = inject(AlertService);

  readonly i18n = I18N_FR;
  readonly activeRate = this.authService.activeRate;

  baseCurrency = 'USD';
  targetCurrency = 'CDF';
  rateValue: number | null = null;
  effectiveDate = new Date().toISOString().slice(0, 16);
  notes = '';

  rates = signal<ExchangeRate[]>([]);
  isLoading = signal(false);
  isSubmitting = signal(false);

  readonly displayedColumns: string[] = ['date', 'rate', 'user', 'status'];

  ngOnInit(): void {
    this.loadRates();
  }

  loadRates(): void {
    this.isLoading.set(true);
    this.cashApi.getRatesHistory().subscribe({
      next: (list) => {
        this.rates.set(list || []);
        this.isLoading.set(false);
      },
      error: () => {
        this.isLoading.set(false);
      },
    });

    this.cashApi.getActiveRate().subscribe({
      next: (rate) => {
        this.authService.setActiveRate(rate);
      },
      error: () => {
        // 404 si aucun taux
        this.authService.activeRate.set(null);
      },
    });
  }

  onSubmit(): void {
    if (!this.rateValue || this.rateValue <= 0) {
      this.alert.error('La valeur du taux doit être supérieure à zéro.');
      return;
    }

    this.isSubmitting.set(true);
    const dto = {
      baseCurrency: this.baseCurrency as 'USD',
      targetCurrency: this.targetCurrency as 'CDF',
      rate: Number(this.rateValue),
      effectiveDate: new Date(this.effectiveDate).toISOString(),
      notes: this.notes ? this.notes.trim() : undefined,
    };

    this.cashApi.setExchangeRate(dto as any).subscribe({
      next: (newRate) => {
        this.isSubmitting.set(false);
        this.authService.setActiveRate(newRate);
        this.alert.success(`Nouveau taux officiel fixé : 1 USD = ${newRate.rate} CDF`);
        this.rateValue = null;
        this.notes = '';
        this.loadRates();
      },
      error: (err) => {
        this.isSubmitting.set(false);
        this.alert.error(err?.error?.message || 'Erreur lors de la mise à jour du taux.');
      },
    });
  }
}
