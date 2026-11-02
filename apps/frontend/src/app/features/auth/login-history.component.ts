import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatTableModule } from '@angular/material/table';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatChipsModule } from '@angular/material/chips';

import { AuthApiService, LoginHistoryItem } from '../../core/api/services/auth-api.service';
import { AlertService } from '../../core/services/alert.service';
import { I18N_FR } from '../../core/i18n/translations.fr';

@Component({
  selector: 'app-login-history',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatCardModule,
    MatTableModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatIconModule,
    MatButtonModule,
    MatProgressSpinnerModule,
    MatChipsModule,
  ],
  template: `
    <div class="history-page">
      <mat-card class="page-header-card">
        <h1 class="page-title">
          <mat-icon class="title-icon">history</mat-icon>
          {{ i18n.loginHistory.title }}
        </h1>
        <p class="page-subtitle">{{ i18n.loginHistory.subtitle }}</p>
      </mat-card>

      <!-- Filtres -->
      <mat-card class="filters-card">
        <div class="filters-row">
          <mat-form-field appearance="outline" class="filter-field search-field">
            <mat-label>{{ i18n.loginHistory.user }}</mat-label>
            <mat-icon matPrefix>search</mat-icon>
            <input matInput [(ngModel)]="userFilter" (input)="applyFilters()" placeholder="Filtrer par utilisateur..." />
          </mat-form-field>

          <mat-form-field appearance="outline" class="filter-field">
            <mat-label>{{ i18n.loginHistory.result }}</mat-label>
            <mat-select [(ngModel)]="resultFilter" (selectionChange)="applyFilters()">
              <mat-option value="">{{ i18n.loginHistory.allResults }}</mat-option>
              <mat-option value="success">{{ i18n.loginHistory.success }}</mat-option>
              <mat-option value="failure">{{ i18n.loginHistory.failure }}</mat-option>
            </mat-select>
          </mat-form-field>

          <button mat-icon-button (click)="loadHistory()" matTooltip="Actualiser">
            <mat-icon>refresh</mat-icon>
          </button>
        </div>
      </mat-card>

      <!-- Tableau -->
      <mat-card class="table-card">
        <div *ngIf="isLoading()" class="loading-center">
          <mat-spinner diameter="40"></mat-spinner>
          <span>{{ i18n.table.loading }}</span>
        </div>

        <div *ngIf="!isLoading() && filteredEntries().length === 0" class="empty-state">
          <mat-icon class="empty-icon">history_toggle_off</mat-icon>
          <p>{{ i18n.table.empty }}</p>
        </div>

        <table mat-table [dataSource]="filteredEntries()" *ngIf="!isLoading() && filteredEntries().length > 0" class="history-table">
          <ng-container matColumnDef="attemptedAt">
            <th mat-header-cell *matHeaderCellDef>{{ i18n.loginHistory.date }}</th>
            <td mat-cell *matCellDef="let entry">{{ formatDate(entry.attemptedAt) }}</td>
          </ng-container>

          <ng-container matColumnDef="username">
            <th mat-header-cell *matHeaderCellDef>{{ i18n.loginHistory.user }}</th>
            <td mat-cell *matCellDef="let entry">
              <span class="username-cell">{{ entry.username }}</span>
            </td>
          </ng-container>

          <ng-container matColumnDef="ipAddress">
            <th mat-header-cell *matHeaderCellDef>{{ i18n.loginHistory.ip }}</th>
            <td mat-cell *matCellDef="let entry">{{ entry.ipAddress }}</td>
          </ng-container>

          <ng-container matColumnDef="userAgent">
            <th mat-header-cell *matHeaderCellDef>{{ i18n.loginHistory.device }}</th>
            <td mat-cell *matCellDef="let entry">
              <span class="device-cell" [title]="entry.userAgent || ''">{{ shortenUserAgent(entry.userAgent) }}</span>
            </td>
          </ng-container>

          <ng-container matColumnDef="result">
            <th mat-header-cell *matHeaderCellDef>{{ i18n.loginHistory.result }}</th>
            <td mat-cell *matCellDef="let entry">
              <span class="result-badge" [class.success]="entry.success" [class.failure]="!entry.success">
                <mat-icon class="result-icon">{{ entry.success ? 'check_circle' : 'cancel' }}</mat-icon>
                {{ entry.success ? i18n.loginHistory.success : i18n.loginHistory.failure }}
              </span>
              <span *ngIf="!entry.success && entry.failureReason" class="failure-reason">
                {{ entry.failureReason }}
              </span>
            </td>
          </ng-container>

          <tr mat-header-row *matHeaderRowDef="displayedColumns"></tr>
          <tr mat-row *matRowDef="let row; columns: displayedColumns;"></tr>
        </table>
      </mat-card>
    </div>
  `,
  styles: [`
    .history-page { padding: 24px; max-width: 1200px; margin: 0 auto; }
    .page-header-card { margin-bottom: 16px; padding: 20px 24px; }
    .page-title { display: flex; align-items: center; gap: 10px; font-size: 22px; font-weight: 700; color: #1e3a2f; margin: 0; }
    .title-icon { color: #0f9d58; }
    .page-subtitle { color: #5f6368; font-size: 13px; margin: 4px 0 0; }
    .filters-card { margin-bottom: 16px; padding: 16px 24px 0; }
    .filters-row { display: flex; gap: 16px; align-items: center; flex-wrap: wrap; }
    .filter-field { flex: 0 0 auto; }
    .search-field { flex: 1 1 250px; min-width: 200px; }
    .table-card { overflow: hidden; }
    .history-table { width: 100%; }
    .username-cell { font-family: monospace; font-weight: 600; color: #1e3a2f; }
    .device-cell { font-size: 12px; color: #5f6368; max-width: 200px; display: inline-block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .result-badge {
      display: inline-flex; align-items: center; gap: 4px;
      font-size: 12px; font-weight: 600; padding: 4px 10px; border-radius: 12px;
    }
    .result-badge.success { background: #e6f4ea; color: #137333; }
    .result-badge.failure { background: #fce8e6; color: #c5221f; }
    .result-icon { font-size: 16px; width: 16px; height: 16px; }
    .failure-reason { display: block; font-size: 11px; color: #9aa0a6; margin-top: 2px; }
    .loading-center { display: flex; flex-direction: column; align-items: center; gap: 12px; padding: 48px; color: #5f6368; }
    .empty-state { display: flex; flex-direction: column; align-items: center; padding: 48px; color: #9aa0a6; }
    .empty-icon { font-size: 48px; width: 48px; height: 48px; margin-bottom: 8px; }
  `],
})
export class LoginHistoryComponent implements OnInit {
  private readonly authApi = inject(AuthApiService);
  private readonly alertService = inject(AlertService);

  readonly i18n = I18N_FR;
  readonly isLoading = signal(true);
  readonly allEntries = signal<LoginHistoryItem[]>([]);
  readonly filteredEntries = signal<LoginHistoryItem[]>([]);
  readonly displayedColumns = ['attemptedAt', 'username', 'ipAddress', 'userAgent', 'result'];

  userFilter = '';
  resultFilter = '';

  ngOnInit(): void {
    this.loadHistory();
  }

  loadHistory(): void {
    this.isLoading.set(true);
    this.authApi.getLoginHistory().subscribe({
      next: (entries) => {
        this.allEntries.set(entries);
        this.applyFilters();
        this.isLoading.set(false);
      },
      error: () => {
        this.isLoading.set(false);
        this.alertService.error("Impossible de charger l'historique des connexions.");
      },
    });
  }

  applyFilters(): void {
    let result = this.allEntries();
    const term = this.userFilter.toLowerCase().trim();
    if (term) {
      result = result.filter((e) => e.username.toLowerCase().includes(term));
    }
    if (this.resultFilter === 'success') {
      result = result.filter((e) => e.success);
    } else if (this.resultFilter === 'failure') {
      result = result.filter((e) => !e.success);
    }
    this.filteredEntries.set(result);
  }

  formatDate(iso: string): string {
    try {
      const d = new Date(iso);
      return d.toLocaleDateString('fr-FR', {
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit', second: '2-digit',
      });
    } catch {
      return iso;
    }
  }

  shortenUserAgent(ua?: string): string {
    if (!ua) return '—';
    if (ua.length <= 50) return ua;
    return ua.substring(0, 47) + '...';
  }
}

