import { Component, Inject, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatDialogModule, MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { CatalogApiService } from '../../core/api/services/catalog-api.service';
import { PriceHistoryEntry, Product } from '@vhp/shared';

@Component({
  selector: 'app-price-history-dialog',
  standalone: true,
  imports: [
    CommonModule,
    MatDialogModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
  ],
  template: `
    <div class="dialog-container">
      <div class="dialog-header">
        <div>
          <h2 mat-dialog-title>Historique des révisions tarifaires</h2>
          <p class="subtitle text-muted">
            Produit : <strong>{{ product.name }}</strong> ({{ product.dci }})
          </p>
        </div>
        <button mat-icon-button mat-dialog-close class="close-btn">
          <mat-icon>close</mat-icon>
        </button>
      </div>

      <mat-dialog-content>
        @if (isLoading()) {
          <div class="loading-state">
            <mat-spinner diameter="36"></mat-spinner>
            <span>Chargement de l’historique des prix...</span>
          </div>
        } @else if (history().length === 0) {
          <div class="empty-state">
            <mat-icon class="empty-icon">history_toggle_off</mat-icon>
            <p class="empty-title">Aucune modification de prix enregistrée</p>
            <p class="empty-desc text-muted">
              Le tarif actuel est de {{ product.sellingPriceCdf | number:'1.0-2' }} CDF ({{ product.sellingPriceUsd | number:'1.2-2' }} USD).
            </p>
          </div>
        } @else {
          <div class="table-wrapper">
            <table class="history-table">
              <thead>
                <tr>
                  <th>Date & Heure</th>
                  <th>Modifié par</th>
                  <th class="text-right">Ancien Prix</th>
                  <th class="text-right">Nouveau Prix</th>
                  <th class="text-center">Variation</th>
                  <th>Motif officiel</th>
                </tr>
              </thead>
              <tbody>
                @for (entry of history(); track entry.changedAt) {
                  <tr>
                    <td class="whitespace-nowrap font-medium">
                      {{ entry.changedAt | date:'dd/MM/yyyy HH:mm' }}
                    </td>
                    <td>
                      <span class="user-badge">{{ entry.changedByName || 'Pharmacien' }}</span>
                    </td>
                    <td class="text-right">
                      <div class="font-medium">{{ entry.oldPriceCdf | number:'1.0-2' }} CDF</div>
                      <div class="text-xs text-muted">{{ entry.oldPriceUsd | number:'1.2-2' }} $</div>
                    </td>
                    <td class="text-right">
                      <div class="font-bold text-primary">{{ entry.newPriceCdf | number:'1.0-2' }} CDF</div>
                      <div class="text-xs text-muted">{{ entry.newPriceUsd | number:'1.2-2' }} $</div>
                    </td>
                    <td class="text-center">
                      @if (entry.oldPriceCdf > 0) {
                        @let diff = ((entry.newPriceCdf - entry.oldPriceCdf) / entry.oldPriceCdf) * 100;
                        <span
                          class="variation-badge"
                          [class.positive]="diff > 0"
                          [class.negative]="diff < 0"
                          [class.neutral]="diff === 0"
                        >
                          {{ diff > 0 ? '+' : '' }}{{ diff | number:'1.1-1' }}%
                        </span>
                      } @else {
                        <span class="variation-badge neutral">—</span>
                      }
                    </td>
                    <td class="reason-cell">
                      {{ entry.reason || 'Mise à jour tarifaire' }}
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        }
      </mat-dialog-content>

      <mat-dialog-actions align="end">
        <button mat-button mat-dialog-close>Fermer</button>
      </mat-dialog-actions>
    </div>
  `,
  styles: [
    `
      .dialog-container {
        min-width: 680px;
        max-width: 850px;
        padding: 8px 16px;
      }
      .dialog-header {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
      }
      .dialog-header h2 {
        margin: 0;
        font-size: 1.25rem;
        font-weight: 700;
        color: #0f172a;
      }
      .subtitle {
        margin: 4px 0 0 0;
        font-size: 0.85rem;
      }
      .text-muted {
        color: #64748b;
      }
      .font-medium {
        font-weight: 500;
      }
      .font-bold {
        font-weight: 700;
      }
      .text-primary {
        color: #0369a1;
      }
      .text-right {
        text-align: right;
      }
      .text-center {
        text-align: center;
      }
      .text-xs {
        font-size: 0.75rem;
      }
      .whitespace-nowrap {
        white-space: nowrap;
      }
      .table-wrapper {
        border: 1px solid #e2e8f0;
        border-radius: 8px;
        overflow: hidden;
        margin-top: 12px;
        max-height: 400px;
        overflow-y: auto;
        overflow-x: auto;
        -webkit-overflow-scrolling: touch;
      }
      .history-table {
        width: 100%;
        min-width: 580px;
        border-collapse: collapse;
        font-size: 0.875rem;
      }
      .history-table th {
        background-color: #f8fafc;
        padding: 10px 14px;
        font-weight: 600;
        color: #475569;
        border-bottom: 1px solid #e2e8f0;
      }
      .history-table td {
        padding: 10px 14px;
        border-bottom: 1px solid #f1f5f9;
        vertical-align: middle;
      }
      .user-badge {
        background-color: #f1f5f9;
        color: #334155;
        padding: 2px 8px;
        border-radius: 4px;
        font-size: 0.8rem;
      }
      .variation-badge {
        padding: 2px 6px;
        border-radius: 4px;
        font-size: 0.75rem;
        font-weight: 600;
      }
      .variation-badge.positive {
        background-color: #fef2f2;
        color: #dc2626;
      }
      .variation-badge.negative {
        background-color: #f0fdf4;
        color: #16a34a;
      }
      .variation-badge.neutral {
        background-color: #f1f5f9;
        color: #64748b;
      }
      .reason-cell {
        max-width: 220px;
        font-style: italic;
        color: #334155;
      }
      .loading-state,
      .empty-state {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: 40px 16px;
        gap: 12px;
      }
      .empty-icon {
        font-size: 48px;
        width: 48px;
        height: 48px;
        color: #94a3b8;
      }
      .empty-title {
        font-size: 1rem;
        font-weight: 600;
        color: #334155;
        margin: 0;
      }
      .empty-desc {
        font-size: 0.85rem;
        margin: 0;
      }
    `,
  ],
})
export class PriceHistoryDialogComponent implements OnInit {
  private readonly catalogApi = inject(CatalogApiService);

  product: Product;
  history = signal<PriceHistoryEntry[]>([]);
  isLoading = signal<boolean>(true);

  constructor(
    @Inject(MAT_DIALOG_DATA) data: { product: Product },
    private dialogRef: MatDialogRef<PriceHistoryDialogComponent>,
  ) {
    this.product = data.product;
  }

  ngOnInit() {
    this.catalogApi.getPriceHistory(this.product.id).subscribe({
      next: (entries) => {
        this.history.set(entries);
        this.isLoading.set(false);
      },
      error: () => {
        this.isLoading.set(false);
      },
    });
  }
}

