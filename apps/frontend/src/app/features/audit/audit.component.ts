import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { PageEvent } from '@angular/material/paginator';
import { AuditLogEntry } from '@vhp/shared';
import { DataTableColumn, DataTableComponent } from '../../shared/components/data-table/data-table.component';
import { AlertService } from '../../core/services/alert.service';
import { AuditApiService } from '../../core/api/services/audit-api.service';

@Component({
  selector: 'app-audit',
  standalone: true,
  imports: [CommonModule, FormsModule, MatButtonModule, MatCardModule, MatFormFieldModule, MatInputModule, MatProgressSpinnerModule, DataTableComponent],
  template: `
    <div class="feature-page">
      <header class="page-header">
        <div>
          <h2>Journal d'audit et de sécurité</h2>
          <p class="subtitle">Historique chronologique et immuable des actions sensibles du système.</p>
        </div>
      </header>

      <mat-card class="content-card">
        <form class="filters" (ngSubmit)="load(0)" aria-label="Filtres du journal d'audit">
          <mat-form-field appearance="outline">
            <mat-label>Action</mat-label>
            <input matInput name="action" [(ngModel)]="action" autocomplete="off">
          </mat-form-field>
          <mat-form-field appearance="outline">
            <mat-label>Entité</mat-label>
            <input matInput name="entityName" [(ngModel)]="entityName" autocomplete="off">
          </mat-form-field>
          <mat-form-field appearance="outline">
            <mat-label>Utilisateur (UUID)</mat-label>
            <input matInput name="userId" [(ngModel)]="userId" autocomplete="off">
          </mat-form-field>
          <mat-form-field appearance="outline">
            <mat-label>Du</mat-label>
            <input matInput type="date" name="from" [(ngModel)]="from">
          </mat-form-field>
          <mat-form-field appearance="outline">
            <mat-label>Au</mat-label>
            <input matInput type="date" name="to" [(ngModel)]="to">
          </mat-form-field>
          <div class="filter-actions">
            <button mat-flat-button color="primary" type="submit" [disabled]="loading">Rechercher</button>
            <button mat-stroked-button type="button" (click)="reset()" [disabled]="loading">Réinitialiser</button>
            <button mat-stroked-button type="button" (click)="exportCsv()" [disabled]="loading || exporting">
              {{ exporting ? 'Export en cours...' : 'Exporter CSV' }}
            </button>
          </div>
        </form>

        <div class="error-state" *ngIf="errorMessage" role="alert">
          <p>{{ errorMessage }}</p>
          <button mat-stroked-button type="button" (click)="load(page - 1)">Réessayer</button>
        </div>

        <app-data-table
          [columns]="columns"
          [data]="logs"
          [loading]="loading"
          [serverPagination]="true"
          [totalItems]="total"
          [pageIndex]="page - 1"
          [pageSize]="limit"
          [pageSizeOptions]="[25, 50, 100, 200]"
          [rowClickable]="true"
          (rowClick)="selectLog($event)"
          (pageChange)="changePage($event)"
          emptyTitle="Aucun événement d'audit"
          emptyDescription="Les actions utilisateurs correspondant aux filtres apparaîtront ici."
          emptyIcon="history"
        ></app-data-table>

        <section class="detail-card" *ngIf="selectedLog" aria-label="Détail de l'événement sélectionné">
          <div class="detail-header">
            <h3>Détail de l'événement</h3>
            <button mat-button type="button" (click)="selectedLog = null">Fermer</button>
          </div>
          <div class="detail-grid">
            <span><strong>ID :</strong> {{ selectedLog.id }}</span>
            <span><strong>Objet :</strong> {{ selectedLog.entityName }} / {{ selectedLog.entityId }}</span>
            <span><strong>IP :</strong> {{ selectedLog.ipAddress || 'Non renseignée' }}</span>
            <span><strong>User-Agent :</strong> {{ selectedLog.userAgent || 'Non renseigné' }}</span>
          </div>
          <div class="values-grid">
            <div><h4>Avant</h4><pre>{{ selectedLog.oldValues | json }}</pre></div>
            <div><h4>Après</h4><pre>{{ selectedLog.newValues | json }}</pre></div>
          </div>
        </section>
      </mat-card>
    </div>
  `,
  styles: [`
    .feature-page { display: flex; flex-direction: column; gap: 20px; font-family: var(--vhp-font); }
    .page-header h2 { font-size: 20px; font-weight: 700; color: #1e3a2f; }
    .subtitle { color: #5f6368; font-size: 13px; margin-top: 4px; }
    .content-card { padding: 16px; border-radius: 12px; }
    .filters { display: flex; flex-wrap: wrap; gap: 12px; align-items: center; margin-bottom: 16px; }
    .filters mat-form-field { min-width: 150px; flex: 1 1 150px; }
    .filter-actions { display: flex; flex-wrap: wrap; gap: 8px; }
    .error-state { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 12px 16px; color: #8b1e1e; background: #fff1f1; border-radius: 8px; margin-bottom: 16px; }
    .detail-card { margin-top: 20px; padding: 16px; border: 1px solid #dfe5e1; border-radius: 10px; background: #fbfdfb; }
    .detail-header { display: flex; align-items: center; justify-content: space-between; }
    .detail-grid, .values-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 12px; margin-top: 12px; }
    pre { max-height: 260px; overflow: auto; padding: 12px; background: #f1f4f2; border-radius: 6px; white-space: pre-wrap; word-break: break-word; }
    @media (max-width: 600px) {
      .filters { flex-direction: column; align-items: stretch; }
      .filters mat-form-field { width: 100%; min-width: 0; }
      .filter-actions { flex-direction: column; width: 100%; }
      .filter-actions button { width: 100%; }
      .detail-grid, .values-grid { grid-template-columns: 1fr; }
    }
  `],
})
export class AuditComponent implements OnInit {
  private readonly api = inject(AuditApiService);
  private readonly alerts = inject(AlertService);

  action = '';
  entityName = '';
  userId = '';
  from = '';
  to = '';
  page = 1;
  limit = 50;
  total = 0;
  loading = false;
  exporting = false;
  errorMessage = '';
  logs: AuditLogEntry[] = [];
  selectedLog: AuditLogEntry | null = null;

  columns: DataTableColumn[] = [
    { key: 'createdAt', label: 'Horodatage', type: 'date' },
    { key: 'userName', label: 'Utilisateur' },
    { key: 'action', label: 'Action', sortable: false },
    { key: 'entityName', label: 'Entité' },
    { key: 'entityId', label: 'ID objet' },
    { key: 'ipAddress', label: 'Adresse IP' },
  ];

  ngOnInit(): void { this.load(0); }

  load(pageIndex = this.page - 1): void {
    this.page = Math.max(1, pageIndex + 1);
    this.loading = true;
    this.errorMessage = '';
    this.selectedLog = null;
    this.api.getAuditLogs({
      action: this.action || undefined,
      entityName: this.entityName || undefined,
      userId: this.userId || undefined,
      from: this.from || undefined,
      to: this.to || undefined,
      page: this.page,
      limit: this.limit,
    }).subscribe({
      next: (result) => {
        this.logs = result?.data ?? [];
        this.total = result?.total ?? 0;
        this.limit = result?.limit ?? this.limit;
        this.loading = false;
      },
      error: (error) => {
        this.loading = false;
        this.logs = [];
        this.total = 0;
        this.errorMessage = error?.error?.message || 'Impossible de charger le journal d’audit.';
      },
    });
  }

  changePage(event: PageEvent): void {
    this.limit = event.pageSize;
    this.load(event.pageIndex);
  }

  reset(): void {
    this.action = ''; this.entityName = ''; this.userId = ''; this.from = ''; this.to = '';
    this.load(0);
  }

  selectLog(log: AuditLogEntry): void { this.selectedLog = log; }

  exportCsv(): void {
    this.exporting = true;
    this.api.exportAuditLogs({ action: this.action, entityName: this.entityName, userId: this.userId, from: this.from, to: this.to }).subscribe({
      next: (blob) => {
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = `journal-audit-${new Date().toISOString().slice(0, 10)}.csv`;
        anchor.click();
        URL.revokeObjectURL(url);
        this.exporting = false;
        this.alerts.success('Export CSV téléchargé.');
      },
      error: () => {
        this.exporting = false;
        this.alerts.error('L’export du journal a échoué.');
      },
    });
  }
}
