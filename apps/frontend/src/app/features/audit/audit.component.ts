import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { DataTableComponent, DataTableColumn } from '../../shared/components/data-table/data-table.component';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { AuditApiService } from '../../core/api/services/audit-api.service';

@Component({
  selector: 'app-audit',
  standalone: true,
  imports: [CommonModule, FormsModule, MatCardModule, MatButtonModule, DataTableComponent],
  template: `
    <div class="feature-page">
      <header class="page-header">
        <div>
          <h2>Journal d'Audit & Sécurité (AUD-01 à AUD-05)</h2>
          <p class="subtitle">Historique chronologique et immuable de l'ensemble des actions sensibles du système.</p>
        </div>
      </header>

      <mat-card class="content-card">
        <div class="filters">
          <input [(ngModel)]="action" placeholder="Action" (keyup.enter)="load()">
          <input [(ngModel)]="entityName" placeholder="Entité" (keyup.enter)="load()">
          <button mat-stroked-button (click)="load()">Rechercher</button>
          <button mat-stroked-button (click)="exportCsv()">Exporter CSV</button>
        </div>
        <app-data-table
          [columns]="columns"
          [data]="logs"
          emptyTitle="Aucun événement d'audit"
          emptyDescription="Les actions utilisateurs seront consignées ici."
          emptyIcon="history"
        ></app-data-table>
      </mat-card>
    </div>
  `,
  styles: [`
    .feature-page { display: flex; flex-direction: column; gap: 20px; font-family: var(--vhp-font); }
    .page-header h2 { font-size: 20px; font-weight: 700; color: #1e3a2f; }
    .subtitle { color: #5f6368; font-size: 13px; margin-top: 4px; }
    .content-card { padding: 16px; border-radius: 12px; }
  `],
})
export class AuditComponent {
  private readonly api = inject(AuditApiService);
  action = ''; entityName = '';
  columns: DataTableColumn[] = [
    { key: 'createdAt', label: 'Horodatage', type: 'date' },
    { key: 'userName', label: 'Utilisateur' },
    { key: 'action', label: 'Action Réalisée' },
    { key: 'entityName', label: 'Entité' },
    { key: 'ipAddress', label: 'Adresse IP' },
  ];

  logs: any[] = [];

  ngOnInit(): void { this.load(); }
  load(): void {
    this.api.getAuditLogs({ action: this.action || undefined, entityName: this.entityName || undefined, page: 1, limit: 100 })
      .subscribe((result) => this.logs = result?.data ?? result ?? []);
  }
  exportCsv(): void {
    this.api.exportAuditLogs({ action: this.action, entityName: this.entityName }).subscribe((blob) => {
      const url = URL.createObjectURL(blob); const a = document.createElement('a');
      a.href = url; a.download = 'journal-audit.csv'; a.click(); URL.revokeObjectURL(url);
    });
  }
}

