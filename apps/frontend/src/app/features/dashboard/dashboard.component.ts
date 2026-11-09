import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';

import { AuthService } from '../../core/auth/auth.service';
import { HasPermissionDirective } from '../../core/permissions/has-permission.directive';
import { I18N_FR } from '../../core/i18n/translations.fr';
import { CurrencyFormatPipe } from '../../shared/pipes/currency-format.pipe';
import { FrDatePipe } from '../../shared/pipes/fr-date.pipe';
import { ReportsApiService } from '../../core/api/services/reports-api.service';
import { SalesApiService } from '../../core/api/services/sales-api.service';
import { CashApiService } from '../../core/api/services/cash-api.service';
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

      <!-- 1. TABLEAU DE BORD VENDEUR & COMPTOIR (CDC V2) -->
      <section class="vendor-desk-card" *hasPermission="['pos.access', 'vente.creer']">
        <div class="vendor-desk-header">
          <h3>
            <mat-icon>point_of_sale</mat-icon>
            Espace Vendeur & Comptoir
          </h3>
          <a mat-flat-button class="btn-new-sale-desk" routerLink="/pos">
            <mat-icon>add_shopping_cart</mat-icon>
            Nouvelle Vente (F2)
          </a>
        </div>

        <div class="vendor-desk-grid">
          <!-- Ventes réalisées aujourd'hui -->
          <div class="desk-stat-box">
            <mat-icon>receipt</mat-icon>
            <div class="desk-stat-info">
              <span class="stat-label">Ventes du jour</span>
              <span class="stat-value">{{ todaySalesCount() }}</span>
              <span class="stat-sub">{{ todaySalesTotal() | currencyFormat:'CDF' }}</span>
            </div>
          </div>

          <!-- Session de Caisse -->
          <div class="desk-stat-box" [class.warning]="!activeCashSession()">
            <mat-icon>{{ activeCashSession() ? 'lock_open' : 'lock' }}</mat-icon>
            <div class="desk-stat-info">
              <span class="stat-label">Session de Caisse</span>
              <span class="stat-value" [style.color]="activeCashSession() ? '#15803d' : '#b45309'">
                {{ activeCashSession() ? 'Active' : 'Fermée' }}
              </span>
              <a [routerLink]="['/cash']" class="stat-sub">
                {{ activeCashSession() ? 'Consulter le tiroir' : 'Ouvrir la caisse' }}
              </a>
            </div>
          </div>

          <!-- Paniers en attente -->
          <div class="desk-stat-box" [class.warning]="heldCartsCount() > 0">
            <mat-icon>pause_circle</mat-icon>
            <div class="desk-stat-info">
              <span class="stat-label">Paniers en attente</span>
              <span class="stat-value">{{ heldCartsCount() }}</span>
              <a [routerLink]="['/pos']" class="stat-sub">
                {{ heldCartsCount() > 0 ? 'Reprendre un panier (F10)' : 'Aucun panier bloqué' }}
              </a>
            </div>
          </div>
        </div>
      </section>

      <!-- Cartes d'indicateurs clés généraux -->
      <section class="kpi-grid">
        <!-- Taux de change actif -->
        <mat-card class="kpi-card" *ngIf="activeRate() as rate">
          <mat-card-header>
            <mat-icon mat-card-avatar class="kpi-icon rate">currency_exchange</mat-icon>
            <mat-card-title>Taux Officiel du Jour</mat-card-title>
            <mat-card-subtitle>Devise de référence</mat-card-subtitle>
          </mat-card-header>
          <mat-card-content>
            <div class="kpi-value font-mono">
              1 {{ rate.baseCurrency }} = {{ rate.rate | currencyFormat:'CDF' }}
            </div>
            <p class="kpi-subtext">Date d'effet : {{ rate.effectiveDate | frDate }}</p>
          </mat-card-content>
        </mat-card>

        <!-- Rôle et Niveau d'accès -->
        <mat-card class="kpi-card">
          <mat-card-header>
            <mat-icon mat-card-avatar class="kpi-icon role">verified_user</mat-icon>
            <mat-card-title>Niveau d'Autorisation</mat-card-title>
            <mat-card-subtitle>Profil connecté</mat-card-subtitle>
          </mat-card-header>
          <mat-card-content>
            <div class="kpi-value role-name">
              {{ getRoleName(currentUser()?.role || '') }}
            </div>
            <p class="kpi-subtext">
              {{ isSuperAdmin() ? 'Accès complet pharmacien' : (currentUser()?.permissions?.length || 0) + ' droits accordés' }}
            </p>
          </mat-card-content>
        </mat-card>
      </section>

      <!-- Section des rapports et indicateurs d'activité -->
      <section class="rpt-section" *hasPermission="'rapports.dashboard'">
        <div class="section-heading">
          <div>
            <h3>Indicateurs de l’activité</h3>
            <p class="kpi-subtext">Statistiques financières et rotation des stocks.</p>
          </div>
          <label class="period-filter">
            Période
            <select [ngModel]="rptPeriod()" (ngModelChange)="changeRptPeriod($event)">
              <option value="day">Aujourd’hui</option>
              <option value="week">Cette semaine</option>
              <option value="month">Ce mois</option>
            </select>
          </label>
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
          <div class="chart-card">
            <h4>Ventes sur la période</h4>
            <div class="bars">
              <div class="bar-row" *ngFor="let point of rptSalesChart()">
                <span>{{ point.label }}</span>
                <i [style.width.%]="barWidth(point.value, rptSalesChart())"></i>
                <b>{{ point.value | currencyFormat:'CDF' }}</b>
              </div>
            </div>
            <p *ngIf="!rptSalesChart().length" class="kpi-subtext">Aucune donnée sur cette période.</p>
          </div>
          <div class="chart-card">
            <h4>Meilleures ventes</h4>
            <div class="bars">
              <div class="bar-row" *ngFor="let point of rptBestSellersChart()">
                <span>{{ point.label }}</span>
                <i [style.width.%]="barWidth(point.value, rptBestSellersChart())"></i>
                <b>{{ point.value | number:'1.0-0' }}</b>
              </div>
            </div>
            <p *ngIf="!rptBestSellersChart().length" class="kpi-subtext">Aucune donnée sur cette période.</p>
          </div>
        </div>
      </section>

      <!-- Raccourcis rapides selon permissions réelles -->
      <section class="shortcuts-section">
        <h3>Accès rapides</h3>
        <div class="shortcuts-grid">
          <a mat-stroked-button class="shortcut-btn" routerLink="/pos" *hasPermission="['pos.access', 'vente.creer']">
            <mat-icon>point_of_sale</mat-icon>
            <span>Point de Vente (Comptoir)</span>
          </a>

          <a mat-stroked-button class="shortcut-btn" routerLink="/sales" *hasPermission="'vente.creer'">
            <mat-icon>receipt_long</mat-icon>
            <span>Historique & Avoirs</span>
          </a>

          <a mat-stroked-button class="shortcut-btn" routerLink="/customers" *hasPermission="['clients.consulter', 'client.consulter']">
            <mat-icon>people</mat-icon>
            <span>Clients & Conventions</span>
          </a>

          <a mat-stroked-button class="shortcut-btn" routerLink="/catalog" *hasPermission="'catalogue.consulter'">
            <mat-icon>medication</mat-icon>
            <span>Catalogue Médicaments</span>
          </a>

          <a mat-stroked-button class="shortcut-btn" routerLink="/stock" *hasPermission="'stock.consulter'">
            <mat-icon>inventory_2</mat-icon>
            <span>Gestion des Stocks</span>
          </a>

          <a mat-stroked-button class="shortcut-btn" routerLink="/cash" *hasPermission="['caisse.ouvrir', 'caisse.cloturer', 'finances.consulter']">
            <mat-icon>account_balance_wallet</mat-icon>
            <span>Caisse & Clôtures</span>
          </a>

          <a mat-stroked-button class="shortcut-btn" routerLink="/reports" *hasPermission="['rapports.dashboard', 'rapports.consulter']">
            <mat-icon>assessment</mat-icon>
            <span>Rapports Financiers</span>
          </a>
        </div>
      </section>
    </div>
  `,
  styleUrl: './dashboard.component.scss',
})
export class DashboardComponent implements OnInit {
  private readonly authService = inject(AuthService);
  private readonly reportsApi = inject(ReportsApiService);
  private readonly salesApi = inject(SalesApiService);
  private readonly cashApi = inject(CashApiService);

  readonly i18n = I18N_FR;
  readonly today = new Date();

  readonly currentUser = this.authService.currentUser;
  readonly activeRate = this.authService.activeRate;

  // Données opérationnelles réelles du comptoir
  activeCashSession = signal<any>(null);
  todaySalesCount = signal<number>(0);
  todaySalesTotal = signal<number>(0);
  heldCartsCount = signal<number>(0);

  readonly rptPeriod = signal<'day' | 'week' | 'month'>('day');
  readonly rptMetrics = signal<DashboardMetric[]>([]);
  readonly rptLoading = signal(true);
  readonly rptError = signal<string | null>(null);
  readonly rptSalesChart = signal<Array<{ label: string; value: number }>>([]);
  readonly rptBestSellersChart = signal<Array<{ label: string; value: number }>>([]);

  ngOnInit(): void {
    this.loadVendorDeskData();
    this.loadRptDashboard();
  }

  loadVendorDeskData(): void {
    // 1. Session de caisse active
    this.cashApi.getActiveSession().subscribe({
      next: (session: any) => this.activeCashSession.set(session),
      error: () => this.activeCashSession.set(null),
    });

    // 2. Ventes du jour
    const todayStr = new Date().toISOString().split('T')[0];
    this.salesApi.getSales({ startDate: todayStr }).subscribe({
      next: (sales) => {
        this.todaySalesCount.set(sales.length);
        const total = sales.reduce((sum, s) => sum + (s.totalAmountCdf || 0), 0);
        this.todaySalesTotal.set(total);
      },
      error: () => {},
    });

    // 3. Paniers en attente
    this.salesApi.listHeldCarts().subscribe({
      next: (carts) => this.heldCartsCount.set(carts.length),
      error: () => {},
    });
  }

  loadRptDashboard(): void {
    this.rptLoading.set(true);
    this.rptError.set(null);
    this.reportsApi
      .getDashboard({ period: this.rptPeriod() } as Partial<ReportFilters>)
      .subscribe({
        next: (snapshot) => {
          this.rptMetrics.set(snapshot.metrics);
          this.rptSalesChart.set(snapshot.charts?.sales || []);
          this.rptBestSellersChart.set(snapshot.charts?.bestSellers || []);
          this.rptLoading.set(false);
        },
        error: () => {
          this.rptError.set('Les indicateurs sont momentanément indisponibles.');
          this.rptLoading.set(false);
        },
      });
  }

  barWidth(value: number, points: Array<{ value: number }>): number {
    const max = Math.max(...points.map((point) => point.value), 1);
    return Math.max(2, (value / max) * 100);
  }

  changeRptPeriod(period: 'day' | 'week' | 'month'): void {
    this.rptPeriod.set(period);
    this.loadRptDashboard();
  }

  metricLabel(key: string): string {
    return (
      ({
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
      } as Record<string, string>)[key] ?? key
    );
  }

  isPercentageMetric(key: string): boolean {
    return ['margin-rate', 'stock-rotation', 'out-of-stock-rate'].includes(key);
  }

  getRoleName(role: string): string {
    return (this.i18n.roles as Record<string, string>)[role] ?? role;
  }

  isSuperAdmin(): boolean {
    return this.authService.userPermissions().includes('*');
  }
}
