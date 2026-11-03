import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterModule } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { ReportFilters, ReportKey, ReportResult } from '@vhp/shared';
import { ReportsApiService } from '../../core/api/services/reports-api.service';
import { CurrencyFormatPipe } from '../../shared/pipes/currency-format.pipe';
import { AuthService } from '../../core/auth/auth.service';

interface ReportCard { key: ReportKey; label: string; description: string; }

@Component({
  selector: 'app-reports',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, MatCardModule, MatButtonModule, CurrencyFormatPipe],
  template: `
    <div class="feature-page">
      <header class="page-header">
        <div>
          <h2>Rapports & clôtures comptables</h2>
          <p class="subtitle">Rapports filtrés et présentés selon vos critères.</p>
        </div>
        <a mat-stroked-button routerLink="/reports" *ngIf="reportKey()">Tous les rapports</a>
      </header>

      <ng-container *ngIf="!reportKey(); else reportDetail">
        <div class="report-grid">
          <a class="report-card" *ngFor="let report of visibleReports()" [routerLink]="['/reports', report.key]">
            <strong>{{ report.label }}</strong><span>{{ report.description }}</span>
          </a>
        </div>
      </ng-container>

      <ng-template #reportDetail>
        <mat-card class="content-card">
          <div class="toolbar">
            <label>Période
              <select [ngModel]="period()" (ngModelChange)="changePeriod($event)">
                <option value="day">Aujourd’hui</option><option value="week">Cette semaine</option><option value="month">Ce mois</option>
              </select>
            </label>
            <label>Utilisateur <input [ngModel]="userId()" (ngModelChange)="userId.set($event); reloadFromFilter()" placeholder="Tous les utilisateurs" /></label>
            <label>Catégorie <input [ngModel]="categoryId()" (ngModelChange)="categoryId.set($event); reloadFromFilter()" placeholder="Toutes les catégories" /></label>
            <label>Site <input [ngModel]="siteId()" (ngModelChange)="siteId.set($event); reloadFromFilter()" placeholder="Tous les sites" /></label>
            <label>Tri <select [ngModel]="sortDirection()" (ngModelChange)="sortDirection.set($event); reloadFromFilter()"><option value="desc">Décroissant</option><option value="asc">Croissant</option></select></label>
            <span class="toolbar-status" *ngIf="result()">{{ result()!.totals.rowCount }} ligne(s)</span>
            <span class="exports" *ngIf="reportKey()">
              <button mat-stroked-button (click)="download('csv')">CSV</button>
              <button mat-stroked-button (click)="download('xlsx')">Excel</button>
              <button mat-stroked-button (click)="download('pdf')">PDF</button>
            </span>
          </div>
          <p class="empty-state" *ngIf="!loading() && isReportEmpty()">Aucune donnée ne correspond à cette période.</p>
          <p class="error-state" *ngIf="error()">{{ error() }}</p>
          <div class="loading-state" *ngIf="loading()">Chargement du rapport…</div>
          <div class="table-wrap" *ngIf="!loading() && rows().length">
            <table><thead><tr><th>Élément</th><th>Détail</th><th>Montant</th></tr></thead><tbody>
              <tr *ngFor="let row of rows()">
                <td>{{ cell(row, ['invoiceNumber', 'productName', 'description', 'lotNumber', 'id']) }}</td>
                <td>{{ cell(row, ['createdAt', 'expiryDate', 'type', 'category']) || '—' }}</td>
                <td>{{ amount(row) | currencyFormat:'CDF' }}</td>
              </tr>
            </tbody></table>
          </div>
          <div class="pagination" *ngIf="result() && !isReportEmpty()">
            <button mat-stroked-button (click)="changePage(-1)" [disabled]="page() === 1">Précédent</button>
            <span>Page {{ page() }}</span>
            <button mat-stroked-button (click)="changePage(1)" [disabled]="rows().length < limit">Suivant</button>
          </div>
        </mat-card>
      </ng-template>
    </div>
  `,
  styles: [`
    .feature-page { display:flex; flex-direction:column; gap:20px; font-family:var(--vhp-font); }
    .page-header { display:flex; justify-content:space-between; align-items:center; gap:16px; }
    .page-header h2 { font-size:20px; font-weight:700; color:#1e3a2f; }
    .subtitle { color:#5f6368; font-size:13px; margin-top:4px; }
    .report-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(230px,1fr)); gap:16px; }
    .report-card { display:flex; flex-direction:column; gap:8px; padding:20px; border:1px solid #dbe8e0; border-radius:12px; color:#173d2d; text-decoration:none; background:white; }
    .report-card:hover { border-color:#116149; box-shadow:0 2px 8px rgba(17,97,73,.12); }
    .report-card span { color:#5f6368; font-size:13px; }
    .content-card { padding:20px; border-radius:12px; }
    .toolbar, .pagination { display:flex; align-items:center; justify-content:space-between; gap:12px; margin-bottom:16px; }
    select, input { margin-left:8px; padding:7px; border:1px solid #b8c8bf; border-radius:6px; }
    .toolbar-status, .loading-state, .empty-state { color:#5f6368; }
    .exports { display:flex; gap:8px; }
    .empty-state, .error-state { padding:20px; text-align:center; border-radius:8px; background:#f7faf8; }
    .error-state { color:#9b1c1c; background:#fff3f3; }
    .table-wrap { overflow-x:auto; } table { width:100%; border-collapse:collapse; }
    th, td { text-align:left; padding:12px; border-bottom:1px solid #edf1ee; font-size:13px; } th { color:#5f6368; font-weight:700; }
  `],
})
export class ReportsComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly api = inject(ReportsApiService);
  private readonly auth = inject(AuthService);
  readonly reports: ReportCard[] = [
    { key:'sales-journal', label:'Journal des ventes', description:'Ventes validées, avoirs et montants nets.' },
    { key:'stock-movements', label:'Mouvements de stock', description:'Entrées et sorties en quantités et valeurs.' },
    { key:'valued-inventory', label:'Inventaire valorisé', description:'Lots disponibles × coût moyen du stock.' },
    { key:'expiries', label:'Péremptions', description:'Lots proches de la péremption sous 90 jours.' },
    { key:'expenses', label:'Dépenses', description:'Dépenses par catégorie et devise.' },
    { key:'best-sellers', label:'Meilleures ventes', description:'Produits classés par quantités vendues.' },
    { key:'receivables', label:'Dettes et créances', description:'Créances détaillées et ancienneté.' },
    { key:'treasury', label:'Trésorerie par devise', description:'Encaissements, dépenses et soldes.' },
    { key:'seller-performance', label:'Performance vendeurs', description:'CA et marge par vendeur.' },
    { key:'low-rotation', label:'Faible rotation', description:'Stock dormant et rotation.' },
    { key:'stock-entries-exits', label:'Entrées / sorties', description:'Flux de stock en quantités et valeurs.' },
  ];
  readonly reportKey = signal<ReportKey | null>(null);
  readonly result = signal<ReportResult | null>(null);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly period = signal<'day'|'week'|'month'>('day');
  readonly page = signal(1); readonly limit = 50;
  readonly userId = signal(''); readonly categoryId = signal('');
  readonly siteId = signal('');
  readonly sortDirection = signal<'asc'|'desc'>('desc');

  ngOnInit(): void { this.route.paramMap.subscribe((params) => { this.reportKey.set((params.get('reportKey') as ReportKey | null) ?? null); this.page.set(1); if (this.reportKey()) this.loadReport(); }); }
  changePeriod(period: 'day'|'week'|'month'): void { this.period.set(period); this.page.set(1); this.loadReport(); }
  changePage(delta: number): void { this.page.update((page) => Math.max(1, page + delta)); this.loadReport(); }
  reloadFromFilter(): void { this.page.set(1); this.loadReport(); }
  rows(): Array<Record<string, any>> { return (this.result()?.data as Array<Record<string, any>> | undefined) ?? []; }
  isReportEmpty(): boolean { return this.result()?.totals.isEmpty ?? false; }
  cell(row: Record<string, any>, keys: string[]): string { return String(keys.map((key) => row[key]).find((value) => value !== undefined && value !== null && value !== '') ?? ''); }
  amount(row: Record<string, any>): number { return Number(row['totalAmountCdf'] ?? row['valueCdf'] ?? row['amountCdf'] ?? row['revenueCdf'] ?? 0); }
  download(format: 'csv'|'xlsx'|'pdf'): void {
    const key = this.reportKey(); if (!key) return;
    this.api.downloadExport(key, format, this.filters()).subscribe((blob) => {
      const url = URL.createObjectURL(blob); const anchor = document.createElement('a'); anchor.href = url; anchor.download = `${key}.${format}`; anchor.click(); URL.revokeObjectURL(url);
    });
  }
  private loadReport(): void {
    const key = this.reportKey(); if (!key) return;
    this.loading.set(true); this.error.set(null);
    const filters = this.filters();
    this.api.getReport(key, filters).subscribe({ next:(result) => { this.result.set(result); this.loading.set(false); }, error:() => { this.error.set('Le rapport est momentanément indisponible.'); this.loading.set(false); } });
  }
  private filters(): Partial<ReportFilters> { return { period:this.period(), page:this.page(), limit:this.limit, sortBy:'createdAt', sortDirection:this.sortDirection(), ...(this.userId() ? { userId:this.userId() } : {}), ...(this.categoryId() ? { categoryId:this.categoryId() } : {}), ...(this.siteId() ? { siteId:this.siteId() } : {}) }; }

  visibleReports(): ReportCard[] {
    const role = this.auth.userRole();
    if (role === 'CAISSIER') return this.reports.filter((report) => ['sales-journal', 'best-sellers'].includes(report.key));
    if (role === 'STOCK') return this.reports.filter((report) => ['stock-movements', 'stock-entries-exits', 'valued-inventory', 'expiries', 'low-rotation'].includes(report.key));
    return this.reports;
  }
}
