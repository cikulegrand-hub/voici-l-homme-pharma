import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatDialog } from '@angular/material/dialog';

import { AuthService } from '../../core/auth/auth.service';
import { HasPermissionDirective } from '../../core/permissions/has-permission.directive';
import { I18N_FR } from '../../core/i18n/translations.fr';
import { CurrencyFormatPipe } from '../../shared/pipes/currency-format.pipe';
import { FrDatePipe } from '../../shared/pipes/fr-date.pipe';
import { ConfirmDialogComponent } from '../../shared/components/confirm-dialog/confirm-dialog.component';
import { PinReauthDialogComponent } from '../../shared/components/pin-reauth-dialog/pin-reauth-dialog.component';
import { AlertService } from '../../core/services/alert.service';
import { ReportsApiService } from '../../core/api/services/reports-api.service';
import { DashboardMetric, ReportFilters } from '@vhp/shared';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RouterModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    HasPermissionDirective,
    CurrencyFormatPipe,
    FrDatePipe,
  ],
  template: `
    <div class="dashboard-container">
      <!-- En-tête de bienvenue -->
      <header class="dashboard-header">
        <div>
          <h2>Bonjour, {{ currentUser()?.fullName }}</h2>
          <p class="subtitle">Bienvenue sur le portail de gestion de l’officine Voici l’Homme Pharma.</p>
        </div>
        <div class="today-date">
          <mat-icon>today</mat-icon>
          <span>{{ today | frDate:'datetime' }}</span>
        </div>
      </header>

      <!-- Cartes d'indicateurs clés -->
      <section class="kpi-grid">
        <!-- Taux de change actif -->
        <mat-card class="kpi-card" *ngIf="activeRate() as rate">
          <mat-card-header>
            <mat-icon mat-card-avatar class="kpi-icon rate">currency_exchange</mat-icon>
            <mat-card-title>Taux Officiel du Jour</mat-card-title>
            <mat-card-subtitle>Taux de change du jour</mat-card-subtitle>
          </mat-card-header>
          <mat-card-content>
            <div class="kpi-value font-mono">
              1 {{ rate.baseCurrency }} = {{ rate.rate | currencyFormat:'CDF' }}
            </div>
            <p class="kpi-subtext">Date d'effet : {{ rate.effectiveDate | frDate }}</p>
          </mat-card-content>
        </mat-card>

        <!-- Statut de caisse -->
        <mat-card class="kpi-card">
          <mat-card-header>
            <mat-icon mat-card-avatar class="kpi-icon cash">point_of_sale</mat-icon>
            <mat-card-title>Session de Caisse</mat-card-title>
            <mat-card-subtitle>Suivi de la caisse</mat-card-subtitle>
          </mat-card-header>
          <mat-card-content>
            <div class="kpi-value status-open">
              <span class="status-indicator"></span> Session Active
            </div>
            <p class="kpi-subtext">Caisse principale · Guichet 1</p>
          </mat-card-content>
        </mat-card>

        <!-- Rôle et Niveau d'accès -->
        <mat-card class="kpi-card">
          <mat-card-header>
            <mat-icon mat-card-avatar class="kpi-icon role">verified_user</mat-icon>
            <mat-card-title>Niveau d'Autorisation</mat-card-title>
            <mat-card-subtitle>Gestion des accès</mat-card-subtitle>
          </mat-card-header>
          <mat-card-content>
            <div class="kpi-value role-name">
              {{ getRoleName(currentUser()?.role || '') }}
            </div>
            <p class="kpi-subtext">
              {{ isSuperAdmin() ? 'Accès complet' : currentUser()?.permissions?.length + ' droits accordés' }}
            </p>
          </mat-card-content>
        </mat-card>
      </section>

      <section class="rpt-section">
        <div class="section-heading">
          <div>
            <h3>Indicateurs de l’activité</h3>
            <p class="kpi-subtext">Cliquez sur un indicateur pour voir le détail.</p>
          </div>
          <label class="period-filter">
            Période
            <select [ngModel]="rptPeriod()" (ngModelChange)="changeRptPeriod($event)">
              <option value="day">Aujourd’hui</option>
              <option value="week">Cette semaine</option>
              <option value="month">Ce mois</option>
            </select>
          </label>
          <label class="period-filter">Utilisateur <input [ngModel]="rptUserId()" (ngModelChange)="rptUserId.set($event); loadRptDashboard()" placeholder="Tous les utilisateurs" /></label>
          <label class="period-filter">Catégorie <input [ngModel]="rptCategoryId()" (ngModelChange)="rptCategoryId.set($event); loadRptDashboard()" placeholder="Toutes les catégories" /></label>
          <label class="period-filter">Site <input [ngModel]="rptSiteId()" (ngModelChange)="rptSiteId.set($event); loadRptDashboard()" placeholder="Tous les sites" /></label>
        </div>

        <p class="rpt-error" *ngIf="rptError()">{{ rptError() }}</p>
        <div class="rpt-grid" *ngIf="!rptError()">
          <ng-container *ngIf="!rptLoading(); else rptSkeleton">
            <a class="rpt-card" *ngFor="let metric of rptMetrics()" [routerLink]="['/reports', metric.reportLink.reportKey]" [queryParams]="metric.reportLink.params">
              <span class="rpt-label">{{ metricLabel(metric.key) }}</span>
              <strong>{{ isPercentageMetric(metric.key) ? ((metric.valuesByCurrency.CDF?.value || 0) | number:'1.0-2') + '%' : ((metric.valuesByCurrency.CDF?.value || 0) | currencyFormat:'CDF') }}</strong>
              <span class="rpt-variation" *ngIf="metric.valuesByCurrency.CDF as amount">
                {{ amount.variationPercent === null ? 'Nouveau' : (amount.variationPercent | number:'1.0-2') + '%' }} vs période précédente
              </span>
            </a>
          </ng-container>
          <ng-template #rptSkeleton>
            <div class="rpt-card skeleton" *ngFor="let item of [1,2,3,4,5,6]"><span></span><span></span><span></span></div>
          </ng-template>
        </div>
        <div class="rpt-charts" *ngIf="!rptLoading() && !rptError()">
          <div class="chart-card"><h4>Ventes sur la période</h4><div class="bars"><div class="bar-row" *ngFor="let point of rptSalesChart()"><span>{{ point.label }}</span><i [style.width.%]="barWidth(point.value, rptSalesChart())"></i><b>{{ point.value | currencyFormat:'CDF' }}</b></div></div><p *ngIf="!rptSalesChart().length" class="kpi-subtext">Aucune donnée sur cette période.</p></div>
          <div class="chart-card"><h4>Meilleures ventes</h4><div class="bars"><div class="bar-row" *ngFor="let point of rptBestSellersChart()"><span>{{ point.label }}</span><i [style.width.%]="barWidth(point.value, rptBestSellersChart())"></i><b>{{ point.value | number:'1.0-0' }}</b></div></div><p *ngIf="!rptBestSellersChart().length" class="kpi-subtext">Aucune donnée sur cette période.</p></div>
        </div>
      </section>

      <!-- Raccourcis rapides selon permissions -->
      <section class="shortcuts-section">
        <h3>Accès rapides</h3>
        <div class="shortcuts-grid">
          <a mat-stroked-button class="shortcut-btn" routerLink="/pos" *hasPermission="'pos.access'">
            <mat-icon>point_of_sale</mat-icon>
            <span>Point de Vente (Comptoir)</span>
          </a>

          <a mat-stroked-button class="shortcut-btn" routerLink="/catalog" *hasPermission="'catalogue.consulter'">
            <mat-icon>medication</mat-icon>
            <span>Catalogue Médicaments</span>
          </a>

          <a mat-stroked-button class="shortcut-btn" routerLink="/stock" *hasPermission="'stock.consulter'">
            <mat-icon>inventory_2</mat-icon>
            <span>Gestion des Stocks</span>
          </a>

          <a mat-stroked-button class="shortcut-btn" routerLink="/cash" *hasPermission="'caisse.consulter'">
            <mat-icon>account_balance_wallet</mat-icon>
            <span>Caisse & Clôtures</span>
          </a>

          <a mat-stroked-button class="shortcut-btn" routerLink="/reports" *hasPermission="'rapports.dashboard'">
            <mat-icon>assessment</mat-icon>
            <span>Rapports Financiers</span>
          </a>

          <a mat-stroked-button class="shortcut-btn" routerLink="/settings" *hasPermission="'parametres.modifier'">
            <mat-icon>settings</mat-icon>
            <span>Paramètres de l'Officine</span>
          </a>
        </div>
      </section>

      <!-- Section d'actions sensibles soumises à PIN (Démonstration AUT-08) -->
      <section class="demo-actions-section">
        <h3>Contrôles de sécurité</h3>
        <div class="demo-buttons">
          <button mat-flat-button color="accent" (click)="openPinReauthDemo()">
            <mat-icon>pin</mat-icon>
            Tester la réautorisation par PIN superviseur
          </button>

          <button mat-stroked-button color="warn" (click)="openConfirmDialogDemo()">
            <mat-icon>warning</mat-icon>
            Tester la confirmation sécurisée
          </button>
        </div>
      </section>
    </div>
  `,
  styles: [`
    .dashboard-container {
      display: flex;
      flex-direction: column;
      gap: 24px;
      font-family: var(--vhp-font);
    }

    .dashboard-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding-bottom: 8px;
      border-bottom: 1px solid #e0e0e0;
    }

    .subtitle {
      color: #5f6368;
      font-size: 14px;
      margin-top: 4px;
    }

    .today-date {
      display: flex;
      align-items: center;
      gap: 8px;
      background: #f1f3f4;
      padding: 6px 14px;
      border-radius: 20px;
      font-size: 13px;
      color: #3c4043;
      font-weight: 500;
    }

    .kpi-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
      gap: 20px;
    }

    .kpi-card {
      border-radius: 12px;
      border: 1px solid #e0e0e0;
      box-shadow: 0 1px 3px rgba(0,0,0,0.05);
    }

    .kpi-icon {
      border-radius: 8px;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .kpi-icon.rate {
      background: #e6f4ea;
      color: #137333;
    }

    .kpi-icon.cash {
      background: #e8f0fe;
      color: #1a73e8;
    }

    .kpi-icon.role {
      background: #fef4e8;
      color: #b45309;
    }

    .kpi-value {
      font-size: 24px;
      font-weight: 700;
      color: #202124;
      margin: 12px 0 6px 0;
    }

    .status-open {
      color: #0f9d58;
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .status-indicator {
      width: 10px;
      height: 10px;
      border-radius: 50%;
      background: #0f9d58;
    }

    .kpi-subtext {
      color: #5f6368;
      font-size: 13px;
      margin: 0;
    }

    .shortcuts-section {
      background: #ffffff;
      padding: 20px;
      border-radius: 12px;
      border: 1px solid #e0e0e0;
    }

    .shortcuts-section h3, .demo-actions-section h3 {
      font-size: 16px;
      font-weight: 700;
      margin-bottom: 16px;
    }

    .shortcuts-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
      gap: 16px;
    }

    .shortcut-btn {
      height: 54px;
      display: flex;
      align-items: center;
      justify-content: flex-start;
      gap: 12px;
      padding: 0 16px;
      border-radius: 8px;
      text-transform: none;
      font-weight: 600;
      font-size: 14px;
    }

    .demo-actions-section {
      background: #f8f9fa;
      padding: 20px;
      border-radius: 12px;
      border: 1px dashed #c0c0c0;
    }

    .rpt-section { background: #f8fbf9; padding: 20px; border: 1px solid #dbe8e0; border-radius: 12px; }
    .section-heading { display: flex; justify-content: space-between; gap: 16px; align-items: center; margin-bottom: 16px; }
    .section-heading h3 { margin: 0 0 4px; }
    .period-filter { display: flex; align-items: center; gap: 8px; font-size: 13px; font-weight: 600; }
    .period-filter select { border: 1px solid #b8c8bf; border-radius: 6px; padding: 8px; background: white; }
    .rpt-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); gap: 12px; }
    .rpt-card { display: flex; flex-direction: column; gap: 8px; padding: 16px; min-height: 100px; color: #173d2d; background: white; border: 1px solid #dbe8e0; border-radius: 10px; text-decoration: none; }
    .rpt-card:hover { border-color: #116149; box-shadow: 0 2px 8px rgba(17,97,73,.12); }
    .rpt-label { font-size: 12px; color: #5f6368; }
    .rpt-card strong { font-size: 20px; }
    .rpt-charts { display:grid; grid-template-columns:repeat(auto-fit,minmax(280px,1fr)); gap:12px; margin-top:16px; }
    .chart-card { background:white; border:1px solid #dbe8e0; border-radius:10px; padding:16px; }
    .chart-card h4 { margin:0 0 12px; color:#173d2d; }
    .bars { display:flex; flex-direction:column; gap:8px; }
    .bar-row { display:grid; grid-template-columns:90px 1fr auto; gap:8px; align-items:center; font-size:11px; }
    .bar-row i { display:block; height:10px; min-width:2px; background:#1b8061; border-radius:6px; }
    .bar-row b { font-weight:600; white-space:nowrap; }
    .rpt-variation { font-size: 11px; color: #5f6368; }
    .rpt-error { color: #9b1c1c; background: #fff3f3; padding: 12px; border-radius: 8px; }
    .skeleton { animation: pulse 1.2s ease-in-out infinite; }
    .skeleton span { height: 12px; width: 70%; background: #e7efea; border-radius: 4px; }
    .skeleton span:nth-child(2) { height: 24px; width: 90%; }
    @keyframes pulse { 50% { opacity: .55; } }

    .demo-buttons {
      display: flex;
      gap: 16px;
      flex-wrap: wrap;
    }
  `],
})
export class DashboardComponent {
  private readonly authService = inject(AuthService);
  private readonly dialog = inject(MatDialog);
  private readonly alertService = inject(AlertService);
  private readonly reportsApi = inject(ReportsApiService);

  readonly i18n = I18N_FR;
  readonly today = new Date();

  readonly currentUser = this.authService.currentUser;
  readonly activeRate = this.authService.activeRate;
  readonly rptPeriod = signal<'day' | 'week' | 'month'>('day');
  readonly rptMetrics = signal<DashboardMetric[]>([]);
  readonly rptLoading = signal(true);
  readonly rptError = signal<string | null>(null);
  readonly rptUserId = signal('');
  readonly rptCategoryId = signal('');
  readonly rptSiteId = signal('');
  readonly rptSalesChart = signal<Array<{ label: string; value: number }>>([]);
  readonly rptBestSellersChart = signal<Array<{ label: string; value: number }>>([]);

  constructor() {
    this.loadRptDashboard();
  }

  loadRptDashboard(): void {
    this.rptLoading.set(true);
    this.rptError.set(null);
    this.reportsApi.getDashboard({ period: this.rptPeriod(), ...(this.rptUserId() ? { userId: this.rptUserId() } : {}), ...(this.rptCategoryId() ? { categoryId: this.rptCategoryId() } : {}), ...(this.rptSiteId() ? { siteId: this.rptSiteId() } : {}) } as Partial<ReportFilters>).subscribe({
      next: (snapshot) => { this.rptMetrics.set(snapshot.metrics); this.rptSalesChart.set(snapshot.charts?.sales || []); this.rptBestSellersChart.set(snapshot.charts?.bestSellers || []); this.rptLoading.set(false); },
      error: () => { this.rptError.set('Les indicateurs sont momentanément indisponibles.'); this.rptLoading.set(false); },
    });
  }

  barWidth(value: number, points: Array<{ value: number }>): number { const max = Math.max(...points.map((point) => point.value), 1); return Math.max(2, (value / max) * 100); }

  changeRptPeriod(period: 'day' | 'week' | 'month'): void {
    this.rptPeriod.set(period);
    this.loadRptDashboard();
  }

  metricLabel(key: string): string {
    return ({
      revenue: 'Chiffre d’affaires',
      'average-basket': 'Panier moyen',
      'gross-margin': 'Marge brute',
      'margin-rate': 'Taux de marge',
      'stock-rotation': 'Rotation du stock',
      'stock-value': 'Valeur du stock',
      'near-expiry-value': 'Proche péremption',
      receivables: 'Créances',
      'cash-variance': 'Écart de caisse',
      'out-of-stock-rate': 'Taux de rupture',
    } as Record<string, string>)[key] ?? key;
  }

  isPercentageMetric(key: string): boolean { return ['margin-rate', 'stock-rotation', 'out-of-stock-rate'].includes(key); }

  getRoleName(role: string): string {
    return (this.i18n.roles as Record<string, string>)[role] ?? role;
  }

  isSuperAdmin(): boolean {
    return this.authService.userPermissions().includes('*');
  }

  openPinReauthDemo(): void {
    const dialogRef = this.dialog.open(PinReauthDialogComponent, {
      width: '420px',
      data: {
        action: 'VENTE_REMISE_EXCEPTIONNELLE',
        actionLabel: 'Validation de remise exceptionnelle (15%)',
      },
    });

    dialogRef.afterClosed().subscribe((res) => {
      if (res?.valid) {
        this.alertService.success('Code PIN superviseur validé avec succès !');
      }
    });
  }

  openConfirmDialogDemo(): void {
    const dialogRef = this.dialog.open(ConfirmDialogComponent, {
      width: '400px',
      data: {
        title: 'Annulation de transaction',
        message: 'Êtes-vous certain de vouloir annuler ce ticket de vente ? Cette action sera tracée au journal d’audit.',
        confirmLabel: 'Annuler la vente',
        cancelLabel: 'Retour',
        confirmColor: 'warn',
        icon: 'warning',
      },
    });

    dialogRef.afterClosed().subscribe((confirmed) => {
      if (confirmed) {
        this.alertService.info('Action confirmée et tracée.');
      }
    });
  }
}

