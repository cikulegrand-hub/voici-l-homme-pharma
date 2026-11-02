import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTableModule } from '@angular/material/table';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';

import { SettingsApiService } from '../../core/api/services/settings-api.service';
import { AlertService } from '../../core/services/alert.service';
import { I18N_FR } from '../../core/i18n/translations.fr';
import { BackupEntry } from '@vhp/shared';

@Component({
  selector: 'app-backups',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatTableModule,
    MatFormFieldModule,
    MatInputModule,
    MatProgressSpinnerModule,
    MatTooltipModule,
  ],
  template: `
    <div class="backups-page">
      <header class="page-header">
        <div>
          <h2>{{ i18n.backups.title }}</h2>
          <p class="subtitle">{{ i18n.backups.subtitle }}</p>
        </div>
      </header>

      <div class="content-grid">
        <!-- Déclenchement manuel de sauvegarde -->
        <mat-card class="trigger-card">
          <mat-card-header>
            <mat-icon matCardAvatar color="primary">backup</mat-icon>
            <mat-card-title>{{ i18n.backups.triggerBackup }}</mat-card-title>
          </mat-card-header>

          <mat-card-content class="trigger-content">
            <p class="desc">
              Créez un instantané complet de la base de données de l’officine (tables, catalogues, stocks, transactions de vente et journaux d'audit).
            </p>

            <mat-form-field appearance="outline" class="full-width">
              <mat-label>{{ i18n.backups.descriptionLabel }}</mat-label>
              <input
                matInput
                [(ngModel)]="backupDescription"
                placeholder="Ex : Sauvegarde avant inventaire trimestriel"
              />
            </mat-form-field>

            <div class="action-row">
              <button
                mat-flat-button
                color="primary"
                [disabled]="isTriggering()"
                (click)="onTriggerBackup()"
                class="trigger-btn"
              >
                @if (isTriggering()) {
                  <mat-spinner diameter="18" class="btn-spinner"></mat-spinner>
                  <span>{{ i18n.backups.triggering }}</span>
                } @else {
                  <ng-container>
                    <mat-icon>cloud_upload</mat-icon>
                    <span>Lancer la sauvegarde maintenant</span>
                  </ng-container>
                }
              </button>
            </div>
          </mat-card-content>
        </mat-card>

        <!-- Tableau historique des sauvegardes -->
        <mat-card class="history-card">
          <mat-card-header>
            <mat-icon matCardAvatar color="accent">restore</mat-icon>
            <mat-card-title>{{ i18n.backups.historyTitle }}</mat-card-title>
            <span class="spacer"></span>
            <button mat-icon-button (click)="loadBackups()" matTooltip="Actualiser">
              <mat-icon>refresh</mat-icon>
            </button>
          </mat-card-header>

          <mat-card-content class="table-container">
            @if (isLoading()) {
              <div class="loading-state">
                <mat-spinner diameter="32"></mat-spinner>
                <p>Chargement des sauvegardes...</p>
              </div>
            } @else if (backups().length === 0) {
              <div class="empty-state">
                <mat-icon class="empty-icon">inventory_2</mat-icon>
                <p>Aucune sauvegarde enregistrée pour l'instant.</p>
              </div>
            } @else {
              <table mat-table [dataSource]="backups()" class="backups-table">
                <!-- Nom fichier -->
                <ng-container matColumnDef="fileName">
                  <th mat-header-cell *matHeaderCellDef>{{ i18n.backups.fileName }}</th>
                  <td mat-cell *matCellDef="let row" class="file-cell">
                    <mat-icon class="file-icon">description</mat-icon>
                    <span>{{ row.fileName }}</span>
                  </td>
                </ng-container>

                <!-- Taille -->
                <ng-container matColumnDef="fileSize">
                  <th mat-header-cell *matHeaderCellDef>{{ i18n.backups.fileSize }}</th>
                  <td mat-cell *matCellDef="let row">
                    {{ formatFileSize(row.fileSize) }}
                  </td>
                </ng-container>

                <!-- Date -->
                <ng-container matColumnDef="createdAt">
                  <th mat-header-cell *matHeaderCellDef>{{ i18n.backups.createdAt }}</th>
                  <td mat-cell *matCellDef="let row">
                    {{ row.createdAt | date:'dd/MM/yyyy HH:mm' }}
                  </td>
                </ng-container>

                <!-- Statut -->
                <ng-container matColumnDef="status">
                  <th mat-header-cell *matHeaderCellDef>{{ i18n.backups.status }}</th>
                  <td mat-cell *matCellDef="let row">
                    @if (row.status === 'SUCCES') {
                      <span class="status-badge success">{{ i18n.backups.statusSuccess }}</span>
                    } @else {
                      <span class="status-badge danger">{{ i18n.backups.statusFailure }}</span>
                    }
                  </td>
                </ng-container>

                <!-- Par -->
                <ng-container matColumnDef="user">
                  <th mat-header-cell *matHeaderCellDef>{{ i18n.backups.triggeredBy }}</th>
                  <td mat-cell *matCellDef="let row">
                    {{ row.createdByName || 'Administrateur' }}
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
    .backups-page {
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
    .content-grid {
      display: grid;
      grid-template-columns: 380px 1fr;
      gap: 20px;
    }
    @media (max-width: 960px) {
      .content-grid {
        grid-template-columns: 1fr;
      }
    }
    .trigger-card, .history-card {
      border-radius: 12px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.08);
      padding: 8px;
    }
    .trigger-content {
      display: flex;
      flex-direction: column;
      gap: 16px;
      margin-top: 12px;
    }
    .desc {
      font-size: 13px;
      color: #5f6368;
      line-height: 1.5;
      margin: 0;
    }
    .full-width {
      width: 100%;
    }
    .action-row {
      display: flex;
      justify-content: flex-end;
    }
    .trigger-btn {
      display: flex;
      align-items: center;
      gap: 8px;
      width: 100%;
      justify-content: center;
      padding: 8px 16px;
    }
    .btn-spinner {
      margin-right: 6px;
    }
    .spacer {
      flex: 1;
    }
    .table-container {
      margin-top: 16px;
      overflow-x: auto;
    }
    .backups-table {
      width: 100%;
    }
    .file-cell {
      display: flex;
      align-items: center;
      gap: 8px;
      font-family: monospace;
      font-size: 12px;
    }
    .file-icon {
      color: #1a73e8;
      font-size: 18px;
      width: 18px;
      height: 18px;
    }
    .status-badge {
      display: inline-block;
      padding: 2px 8px;
      border-radius: 12px;
      font-size: 11px;
      font-weight: 600;
    }
    .status-badge.success {
      background: #e6f4ea;
      color: #137333;
    }
    .status-badge.danger {
      background: #fce8e6;
      color: #c5221f;
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
export class BackupsComponent implements OnInit {
  private readonly settingsApi = inject(SettingsApiService);
  private readonly alert = inject(AlertService);

  readonly i18n = I18N_FR;

  backupDescription = '';
  backups = signal<BackupEntry[]>([]);
  isLoading = signal<boolean>(false);
  isTriggering = signal<boolean>(false);

  readonly displayedColumns: string[] = ['fileName', 'fileSize', 'createdAt', 'status', 'user'];

  ngOnInit(): void {
    this.loadBackups();
  }

  loadBackups(): void {
    this.isLoading.set(true);
    this.settingsApi.getBackups().subscribe({
      next: (list) => {
        this.backups.set(list || []);
        this.isLoading.set(false);
      },
      error: () => {
        this.isLoading.set(false);
      },
    });
  }

  onTriggerBackup(): void {
    this.isTriggering.set(true);
    this.settingsApi
      .createBackup({ description: this.backupDescription.trim() || undefined })
      .subscribe({
        next: (res) => {
          this.isTriggering.set(false);
          this.backupDescription = '';
          this.alert.success(`Sauvegarde réussie : ${res.backup.fileName}`);
          this.loadBackups();
        },
        error: (err) => {
          this.isTriggering.set(false);
          this.alert.error(err?.error?.message || 'Erreur lors de la sauvegarde.');
        },
      });
  }

  formatFileSize(bytes: number): string {
    if (!bytes || bytes === 0) return '0 Ko';
    const kb = bytes / 1024;
    if (kb < 1024) return `${kb.toFixed(1)} Ko`;
    const mb = kb / 1024;
    return `${mb.toFixed(2)} Mo`;
  }
}
