import { Component, inject, OnInit, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { NotificationStateService } from '../../core/notifications/notification-state.service';
import { NotificationItem } from '../../core/api/services/notifications-api.service';

type FilterCategory = 'ALL' | 'UNREAD' | 'STOCK' | 'FINANCE' | 'CUSTOMER';
type FilterSeverity = 'ALL' | 'DANGER' | 'WARNING' | 'INFO';

@Component({
  selector: 'app-notifications',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RouterModule,
    MatButtonModule,
    MatCardModule,
    MatIconModule,
    MatTooltipModule,
    MatProgressSpinnerModule,
  ],
  template: `
    <div class="notifications-page">
      <!-- En-tête de page -->
      <header class="page-header">
        <div class="header-titles">
          <div class="title-with-badge">
            <h1>Centre de Notifications & Alertes</h1>
            @if (notifService.unreadCount() > 0) {
              <span class="unread-header-badge">{{ notifService.unreadCount() }} non lue{{ notifService.unreadCount() > 1 ? 's' : '' }}</span>
            }
          </div>
          <p class="subtitle">
            Surveillez en temps réel les seuils de sécurité, les risques de rupture, les péremptions et les écarts de caisse.
          </p>
        </div>

        <div class="header-actions">
          <button
            mat-stroked-button
            (click)="notifService.syncAlerts()"
            [disabled]="notifService.isSyncing()"
            class="sync-btn"
          >
            <mat-icon [class.spin]="notifService.isSyncing()">sync</mat-icon>
            {{ notifService.isSyncing() ? 'Détection en cours...' : 'Détecter les alertes' }}
          </button>

          <button
            mat-flat-button
            color="primary"
            (click)="notifService.markAllAsRead()"
            [disabled]="notifService.unreadCount() === 0"
          >
            <mat-icon>done_all</mat-icon>
            Tout marquer comme lu
          </button>
        </div>
      </header>

      <!-- Cartes statistiques KPI -->
      <section class="kpi-grid">
        <div class="kpi-card total" (click)="setCategory('ALL')" [class.active]="selectedCategory() === 'ALL'">
          <div class="kpi-icon"><mat-icon>notifications</mat-icon></div>
          <div class="kpi-data">
            <span class="kpi-val">{{ notifService.notifications().length }}</span>
            <span class="kpi-lbl">Total alertes</span>
          </div>
        </div>

        <div class="kpi-card unread" (click)="setCategory('UNREAD')" [class.active]="selectedCategory() === 'UNREAD'">
          <div class="kpi-icon"><mat-icon>mark_email_unread</mat-icon></div>
          <div class="kpi-data">
            <span class="kpi-val">{{ notifService.unreadCount() }}</span>
            <span class="kpi-lbl">Non lues</span>
          </div>
        </div>

        <div class="kpi-card danger" (click)="setSeverityFilter('DANGER')" [class.active]="selectedSeverity() === 'DANGER'">
          <div class="kpi-icon"><mat-icon>report_problem</mat-icon></div>
          <div class="kpi-data">
            <span class="kpi-val">{{ countBySeverity('DANGER') }}</span>
            <span class="kpi-lbl">Critiques (Ruptures &amp; Écarts)</span>
          </div>
        </div>

        <div class="kpi-card warning" (click)="setSeverityFilter('WARNING')" [class.active]="selectedSeverity() === 'WARNING'">
          <div class="kpi-icon"><mat-icon>warning_amber</mat-icon></div>
          <div class="kpi-data">
            <span class="kpi-val">{{ countBySeverity('WARNING') }}</span>
            <span class="kpi-lbl">Vigilance &amp; Péremptions</span>
          </div>
        </div>
      </section>

      <!-- Barre d'outils, filtres et recherche -->
      <section class="toolbar-section">
        <div class="categories-tabs">
          <button
            type="button"
            class="tab-btn"
            [class.active]="selectedCategory() === 'ALL'"
            (click)="setCategory('ALL')"
          >
            Toutes ({{ notifService.notifications().length }})
          </button>
          <button
            type="button"
            class="tab-btn"
            [class.active]="selectedCategory() === 'UNREAD'"
            (click)="setCategory('UNREAD')"
          >
            Non lues ({{ notifService.unreadCount() }})
          </button>
          <button
            type="button"
            class="tab-btn"
            [class.active]="selectedCategory() === 'STOCK'"
            (click)="setCategory('STOCK')"
          >
            <mat-icon>inventory_2</mat-icon>
            Stock &amp; Péremption
          </button>
          <button
            type="button"
            class="tab-btn"
            [class.active]="selectedCategory() === 'FINANCE'"
            (click)="setCategory('FINANCE')"
          >
            <mat-icon>account_balance_wallet</mat-icon>
            Caisse &amp; Finances
          </button>
          <button
            type="button"
            class="tab-btn"
            [class.active]="selectedCategory() === 'CUSTOMER'"
            (click)="setCategory('CUSTOMER')"
          >
            <mat-icon>groups</mat-icon>
            Créances Clients
          </button>
        </div>

        <div class="filter-search-box">
          <div class="search-input-wrapper">
            <mat-icon class="search-icon">search</mat-icon>
            <input
              type="text"
              placeholder="Rechercher par mot-clé, produit, lot, client..."
              [ngModel]="searchQuery()"
              (ngModelChange)="searchQuery.set($event)"
              class="search-input"
            />
            @if (searchQuery()) {
              <button class="clear-btn" (click)="searchQuery.set('')" title="Effacer la recherche">
                <mat-icon>close</mat-icon>
              </button>
            }
          </div>

          <div class="severity-chips">
            <button
              type="button"
              class="chip-btn"
              [class.active]="selectedSeverity() === 'ALL'"
              (click)="setSeverityFilter('ALL')"
            >
              Tous niveaux
            </button>
            <button
              type="button"
              class="chip-btn danger"
              [class.active]="selectedSeverity() === 'DANGER'"
              (click)="setSeverityFilter('DANGER')"
            >
              <span class="dot"></span> Critiques
            </button>
            <button
              type="button"
              class="chip-btn warning"
              [class.active]="selectedSeverity() === 'WARNING'"
              (click)="setSeverityFilter('WARNING')"
            >
              <span class="dot"></span> Avertissements
            </button>
          </div>
        </div>
      </section>

      <!-- Liste des notifications -->
      <section class="notifications-list-container">
        @if (notifService.isLoading()) {
          <div class="state-container loading">
            <mat-spinner diameter="42"></mat-spinner>
            <p>Chargement des alertes...</p>
          </div>
        } @else if (filteredNotifications().length === 0) {
          <div class="state-container empty">
            <div class="empty-icon-circle">
              <mat-icon>task_alt</mat-icon>
            </div>
            <h3>Aucune alerte pour ce filtre</h3>
            <p>
              @if (searchQuery() || selectedCategory() !== 'ALL' || selectedSeverity() !== 'ALL') {
                Aucune notification ne correspond aux critères de recherche actuels.
              } @else {
                Toutes les alertes sont à jour. L'officine fonctionne normalement.
              }
            </p>
            @if (searchQuery() || selectedCategory() !== 'ALL' || selectedSeverity() !== 'ALL') {
              <button mat-stroked-button (click)="resetFilters()">
                Réinitialiser les filtres
              </button>
            }
          </div>
        } @else {
          <div class="notifications-list">
            @for (notification of filteredNotifications(); track notification.id) {
              <mat-card
                class="notification-card"
                [class.unread]="!notification.isRead"
                [class.severity-danger]="notification.severity === 'DANGER' || notification.type === 'STOCK_RUPTURE'"
                [class.severity-warning]="notification.severity === 'WARNING' && notification.type !== 'STOCK_RUPTURE'"
                [class.severity-info]="notification.severity === 'INFO'"
              >
                <div class="card-left">
                  <div
                    class="notification-icon-wrapper"
                    [class]="'icon-' + notification.severity.toLowerCase()"
                  >
                    <mat-icon>{{ notifService.getIcon(notification) }}</mat-icon>
                  </div>
                </div>

                <div class="card-body">
                  <div class="card-header-line">
                    <div class="badges-row">
                      <span class="type-badge">{{ getReadableType(notification.type) }}</span>
                      <span
                        class="severity-badge"
                        [class]="notifService.getSeverityBadge(notification).class"
                      >
                        {{ notifService.getSeverityBadge(notification).label }}
                      </span>
                      @if (!notification.isRead) {
                        <span class="new-pill">NON LUE</span>
                      }
                    </div>

                    <div class="date-row">
                      <mat-icon class="date-icon">schedule</mat-icon>
                      <time [attr.datetime]="notification.createdAt">
                        {{ formatFullDate(notification.createdAt) }}
                      </time>
                    </div>
                  </div>

                  <h3 class="notification-title">{{ notification.title }}</h3>
                  <p class="notification-desc">{{ notification.message }}</p>

                  <!-- Métadonnées contextuelles additionnelles -->
                  @if (notification.metadata) {
                    <div class="metadata-tags">
                      @if (notification.metadata['currentStock'] !== undefined) {
                        <span class="meta-tag">Stock actuel : <strong>{{ notification.metadata['currentStock'] }}</strong></span>
                      }
                      @if (notification.metadata['minStock'] !== undefined) {
                        <span class="meta-tag">Seuil mini : <strong>{{ notification.metadata['minStock'] }}</strong></span>
                      }
                      @if (notification.metadata['expiryDate']) {
                        <span class="meta-tag">Date limite : <strong>{{ notification.metadata['expiryDate'] }}</strong></span>
                      }
                      @if (notification.metadata['balanceCdf'] !== undefined) {
                        <span class="meta-tag">Solde dû : <strong>{{ asNumber(notification.metadata['balanceCdf']) | number:'1.0-0' }} CDF</strong></span>
                      }
                      @if (notification.metadata['varianceCdf'] || notification.metadata['varianceUsd']) {
                        <span class="meta-tag error">
                          Écart :
                          <strong>
                            {{ notification.metadata['varianceCdf'] ? notification.metadata['varianceCdf'] + ' CDF ' : '' }}
                            {{ notification.metadata['varianceUsd'] ? notification.metadata['varianceUsd'] + ' USD' : '' }}
                          </strong>
                        </span>
                      }
                    </div>
                  }

                  <div class="card-footer-actions">
                    <!-- Action contextuelle vers le module métier -->
                    @if (notifService.resolveTarget(notification); as target) {
                      <button
                        mat-flat-button
                        color="primary"
                        class="action-btn"
                        (click)="notifService.navigateToTarget(notification)"
                      >
                        <mat-icon>arrow_forward</mat-icon>
                        {{ getTargetActionLabel(notification) }}
                      </button>
                    }

                    @if (!notification.isRead) {
                      <button
                        mat-stroked-button
                        class="mark-btn"
                        (click)="notifService.markAsRead(notification.id)"
                        title="Marquer cette alerte comme lue"
                      >
                        <mat-icon>done</mat-icon>
                        Marquer comme lu
                      </button>
                    } @else {
                      <span class="read-status">
                        <mat-icon>done_all</mat-icon>
                        Consultée le {{ formatShortDate(notification.readAt || notification.createdAt) }}
                      </span>
                    }
                  </div>
                </div>
              </mat-card>
            }
          </div>
        }
      </section>
    </div>
  `,
  styles: [`
    .notifications-page {
      display: flex;
      flex-direction: column;
      gap: 24px;
      font-family: var(--vhp-font);
      max-width: 1200px;
      margin: 0 auto;
      padding-bottom: 32px;
    }

    /* En-tête */
    .page-header {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 20px;
      flex-wrap: wrap;
    }

    .title-with-badge {
      display: flex;
      align-items: center;
      gap: 12px;
      flex-wrap: wrap;
    }

    h1 {
      color: var(--vhp-primary);
      font-size: 24px;
      font-weight: 700;
      margin: 0;
    }

    .unread-header-badge {
      background: #ef4444;
      color: #ffffff;
      font-size: 12px;
      font-weight: 700;
      padding: 3px 10px;
      border-radius: 14px;
    }

    .subtitle {
      color: var(--vhp-text-secondary);
      margin: 6px 0 0;
      font-size: 14px;
      max-width: 700px;
    }

    .header-actions {
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .sync-btn mat-icon.spin {
      animation: spin 1s linear infinite;
    }

    @keyframes spin {
      100% { transform: rotate(360deg); }
    }

    /* Cartes KPI */
    .kpi-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 16px;
    }

    .kpi-card {
      background: #ffffff;
      border: 1px solid var(--vhp-border);
      border-radius: 12px;
      padding: 16px 18px;
      display: flex;
      align-items: center;
      gap: 14px;
      cursor: pointer;
      transition: all 0.2s ease-in-out;
      box-shadow: 0 1px 3px rgba(0,0,0,0.04);
    }

    .kpi-card:hover {
      transform: translateY(-2px);
      box-shadow: 0 4px 12px rgba(0,0,0,0.08);
    }

    .kpi-card.active {
      border-color: var(--vhp-accent);
      background: #f0fdf4;
    }

    .kpi-icon {
      width: 44px;
      height: 44px;
      border-radius: 10px;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
    }

    .kpi-card.total .kpi-icon { background: #e0f2fe; color: #0284c7; }
    .kpi-card.unread .kpi-icon { background: #fef3c7; color: #d97706; }
    .kpi-card.danger .kpi-icon { background: #fee2e2; color: #dc2626; }
    .kpi-card.warning .kpi-icon { background: #ffedd5; color: #ea580c; }

    .kpi-data {
      display: flex;
      flex-direction: column;
    }

    .kpi-val {
      font-size: 22px;
      font-weight: 700;
      color: var(--vhp-text-primary);
      line-height: 1.2;
    }

    .kpi-lbl {
      font-size: 12px;
      color: var(--vhp-text-secondary);
      margin-top: 2px;
    }

    /* Barre d'onglets & filtres */
    .toolbar-section {
      display: flex;
      flex-direction: column;
      gap: 14px;
      background: #ffffff;
      padding: 16px 20px;
      border: 1px solid var(--vhp-border);
      border-radius: 12px;
    }

    .categories-tabs {
      display: flex;
      gap: 8px;
      overflow-x: auto;
      padding-bottom: 4px;
      border-bottom: 1px solid #f1f5f9;
    }

    .tab-btn {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 8px 14px;
      background: transparent;
      border: none;
      border-radius: 8px;
      font-size: 13px;
      font-weight: 600;
      color: var(--vhp-text-secondary);
      cursor: pointer;
      white-space: nowrap;
      transition: all 0.15s ease;
    }

    .tab-btn mat-icon {
      font-size: 18px;
      width: 18px;
      height: 18px;
    }

    .tab-btn:hover {
      background: #f8fafc;
      color: var(--vhp-primary);
    }

    .tab-btn.active {
      background: var(--vhp-primary);
      color: #ffffff;
    }

    .filter-search-box {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      flex-wrap: wrap;
    }

    .search-input-wrapper {
      position: relative;
      flex: 1;
      min-width: 260px;
      display: flex;
      align-items: center;
    }

    .search-icon {
      position: absolute;
      left: 12px;
      color: #94a3b8;
      font-size: 20px;
      width: 20px;
      height: 20px;
    }

    .search-input {
      width: 100%;
      height: 40px;
      padding: 0 36px 0 38px;
      border: 1px solid var(--vhp-border);
      border-radius: 8px;
      font-size: 13px;
      outline: none;
      transition: border-color 0.2s ease;
      background: #fafafa;
    }

    .search-input:focus {
      border-color: var(--vhp-accent);
      background: #ffffff;
    }

    .clear-btn {
      position: absolute;
      right: 8px;
      background: none;
      border: none;
      cursor: pointer;
      color: #94a3b8;
      display: flex;
      align-items: center;
    }

    .severity-chips {
      display: flex;
      gap: 8px;
      align-items: center;
    }

    .chip-btn {
      border: 1px solid var(--vhp-border);
      background: #ffffff;
      border-radius: 20px;
      padding: 6px 12px;
      font-size: 12px;
      font-weight: 600;
      color: var(--vhp-text-secondary);
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 6px;
      transition: all 0.15s ease;
    }

    .chip-btn .dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      display: inline-block;
    }

    .chip-btn.danger .dot { background: #ef4444; }
    .chip-btn.warning .dot { background: #f59e0b; }

    .chip-btn.active {
      background: #0f172a;
      color: #ffffff;
      border-color: #0f172a;
    }

    .chip-btn.danger.active {
      background: #dc2626;
      border-color: #dc2626;
    }

    .chip-btn.warning.active {
      background: #d97706;
      border-color: #d97706;
    }

    /* Liste des notifications */
    .notifications-list {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    .notification-card {
      padding: 18px 20px;
      display: flex;
      align-items: flex-start;
      gap: 18px;
      background: #ffffff;
      border-radius: 12px;
      border: 1px solid var(--vhp-border);
      transition: all 0.2s ease;
      box-shadow: 0 1px 3px rgba(0,0,0,0.03);
    }

    .notification-card:hover {
      box-shadow: 0 3px 10px rgba(0,0,0,0.06);
    }

    .notification-card.unread {
      background: #ffffff;
      border-left: 5px solid var(--vhp-accent);
    }

    .notification-card.unread.severity-danger {
      border-left: 5px solid #ef4444;
      background: #fffafa;
    }

    .notification-card.unread.severity-warning {
      border-left: 5px solid #f59e0b;
      background: #fffdfa;
    }

    .card-left {
      flex-shrink: 0;
    }

    .notification-icon-wrapper {
      width: 44px;
      height: 44px;
      border-radius: 10px;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .icon-danger { background: #fee2e2; color: #dc2626; }
    .icon-warning { background: #fef3c7; color: #d97706; }
    .icon-info { background: #e0f2fe; color: #0284c7; }

    .card-body {
      flex: 1;
      display: flex;
      flex-direction: column;
      gap: 6px;
      min-width: 0;
    }

    .card-header-line {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      flex-wrap: wrap;
    }

    .badges-row {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-wrap: wrap;
    }

    .type-badge {
      background: #f1f5f9;
      color: #334155;
      font-size: 11px;
      font-weight: 700;
      padding: 2px 8px;
      border-radius: 6px;
      letter-spacing: 0.3px;
    }

    .severity-badge {
      font-size: 10px;
      font-weight: 800;
      padding: 2px 7px;
      border-radius: 6px;
      letter-spacing: 0.5px;
    }

    .badge-danger { background: #fee2e2; color: #b91c1c; }
    .badge-warning { background: #fef3c7; color: #b45309; }
    .badge-info { background: #e0f2fe; color: #0369a1; }

    .new-pill {
      background: #ef4444;
      color: #ffffff;
      font-size: 10px;
      font-weight: 800;
      padding: 2px 7px;
      border-radius: 6px;
    }

    .date-row {
      display: flex;
      align-items: center;
      gap: 4px;
      color: #94a3b8;
      font-size: 12px;
    }

    .date-icon {
      font-size: 16px;
      width: 16px;
      height: 16px;
    }

    .notification-title {
      font-size: 15px;
      font-weight: 700;
      color: var(--vhp-text-primary);
      margin: 2px 0 0;
    }

    .notification-desc {
      font-size: 13px;
      color: var(--vhp-text-secondary);
      line-height: 1.5;
      margin: 0;
    }

    .metadata-tags {
      display: flex;
      gap: 10px;
      flex-wrap: wrap;
      margin-top: 4px;
    }

    .meta-tag {
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 6px;
      padding: 3px 8px;
      font-size: 11px;
      color: #475569;
    }

    .meta-tag.error {
      background: #fef2f2;
      border-color: #fecaca;
      color: #991b1b;
    }

    .card-footer-actions {
      display: flex;
      align-items: center;
      gap: 12px;
      margin-top: 10px;
      flex-wrap: wrap;
    }

    .action-btn {
      font-size: 12px !important;
      font-weight: 600 !important;
      height: 34px !important;
      line-height: 34px !important;
      border-radius: 6px !important;
    }

    .mark-btn {
      font-size: 12px !important;
      height: 34px !important;
      line-height: 34px !important;
      border-radius: 6px !important;
      color: var(--vhp-text-secondary) !important;
    }

    .read-status {
      display: flex;
      align-items: center;
      gap: 4px;
      font-size: 12px;
      color: #64748b;
    }

    .read-status mat-icon {
      font-size: 16px;
      width: 16px;
      height: 16px;
      color: #10b981;
    }

    /* États vide et chargement */
    .state-container {
      background: #ffffff;
      border: 1px solid var(--vhp-border);
      border-radius: 12px;
      padding: 60px 20px;
      text-align: center;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 12px;
    }

    .empty-icon-circle {
      width: 64px;
      height: 64px;
      border-radius: 50%;
      background: #e6f4ea;
      color: #137333;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .empty-icon-circle mat-icon {
      font-size: 32px;
      width: 32px;
      height: 32px;
    }

    .state-container h3 {
      font-size: 17px;
      font-weight: 700;
      color: var(--vhp-text-primary);
      margin: 0;
    }

    .state-container p {
      color: var(--vhp-text-secondary);
      font-size: 13px;
      margin: 0;
      max-width: 450px;
    }

    /* Responsive */
    @media (max-width: 1024px) {
      .kpi-grid {
        grid-template-columns: repeat(2, 1fr);
      }
    }

    @media (max-width: 680px) {
      .page-header {
        flex-direction: column;
        align-items: stretch;
      }

      .header-actions {
        width: 100%;
        flex-direction: column;
      }

      .header-actions button {
        width: 100%;
      }

      .kpi-grid {
        grid-template-columns: 1fr;
      }

      .filter-search-box {
        flex-direction: column;
        align-items: stretch;
      }

      .severity-chips {
        justify-content: flex-start;
        overflow-x: auto;
      }

      .notification-card {
        padding: 14px;
        gap: 12px;
      }

      .card-left {
        display: none;
      }

      .card-footer-actions {
        flex-direction: column;
        align-items: stretch;
      }

      .card-footer-actions button {
        width: 100%;
      }
    }
  `],
})
export class NotificationsComponent implements OnInit {
  readonly notifService = inject(NotificationStateService);

  readonly selectedCategory = signal<FilterCategory>('ALL');
  readonly selectedSeverity = signal<FilterSeverity>('ALL');
  readonly searchQuery = signal<string>('');

  ngOnInit(): void {
    this.notifService.refreshAll();
  }

  setCategory(category: FilterCategory): void {
    this.selectedCategory.set(category);
  }

  setSeverityFilter(severity: FilterSeverity): void {
    this.selectedSeverity.set(severity);
  }

  resetFilters(): void {
    this.selectedCategory.set('ALL');
    this.selectedSeverity.set('ALL');
    this.searchQuery.set('');
  }

  countBySeverity(sev: 'DANGER' | 'WARNING' | 'INFO'): number {
    return this.notifService.notifications().filter(
      (n) => n.severity === sev || (sev === 'DANGER' && n.type === 'STOCK_RUPTURE'),
    ).length;
  }

  readonly filteredNotifications = computed(() => {
    let items = this.notifService.notifications();
    const cat = this.selectedCategory();
    const sev = this.selectedSeverity();
    const query = this.searchQuery().trim().toLowerCase();

    // Filtre par catégorie
    if (cat === 'UNREAD') {
      items = items.filter((n) => !n.isRead);
    } else if (cat === 'STOCK') {
      items = items.filter(
        (n) => n.type === 'STOCK_BAS' || n.type === 'STOCK_RUPTURE' || n.type === 'PEREMPTION' || n.entityType === 'PRODUCT_LOT',
      );
    } else if (cat === 'FINANCE') {
      items = items.filter(
        (n) => n.type === 'ECART_CAISSE' || n.entityType === 'CASH_SESSION',
      );
    } else if (cat === 'CUSTOMER') {
      items = items.filter(
        (n) => n.type === 'CREANCE_RETARD' || n.entityType === 'CUSTOMER',
      );
    }

    // Filtre par sévérité
    if (sev !== 'ALL') {
      items = items.filter((n) => n.severity === sev || (sev === 'DANGER' && n.type === 'STOCK_RUPTURE'));
    }

    // Filtre par recherche textuelle
    if (query) {
      items = items.filter(
        (n) =>
          n.title.toLowerCase().includes(query) ||
          n.message.toLowerCase().includes(query) ||
          (n.entityId && n.entityId.toLowerCase().includes(query)),
      );
    }

    return items;
  });

  getReadableType(type: string): string {
    switch (type) {
      case 'STOCK_RUPTURE': return 'RUPTURE DE STOCK';
      case 'STOCK_BAS': return 'STOCK SOUS LE SEUIL';
      case 'PEREMPTION': return 'PÉREMPTION PRODUIT';
      case 'CREANCE_RETARD': return 'PLAFOND CRÉANCE';
      case 'ECART_CAISSE': return 'ÉCART DE CAISSE';
      case 'CONFLIT_STOCK_OFFLINE': return 'CONFLIT SYNCHRO';
      case 'COMMANDE_FOURNISSEUR': return 'COMMANDE FOURNISSEUR';
      default: return type.replace(/_/g, ' ');
    }
  }

  getTargetActionLabel(notification: NotificationItem): string {
    if (notification.type === 'STOCK_BAS' || notification.type === 'STOCK_RUPTURE' || notification.type === 'PEREMPTION' || notification.entityType === 'PRODUCT_LOT') {
      return 'Gérer dans le Stock';
    }
    if (notification.type === 'CREANCE_RETARD' || notification.entityType === 'CUSTOMER') {
      return 'Voir la Fiche Client';
    }
    if (notification.type === 'ECART_CAISSE' || notification.entityType === 'CASH_SESSION') {
      return 'Consulter la Session de Caisse';
    }
    if (notification.type === 'CONFLIT_STOCK_OFFLINE' || notification.entityType === 'SALE') {
      return 'Arbitrer la Vente';
    }
    return 'Consulter la ressource';
  }

  formatFullDate(value: string): string {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return new Intl.DateTimeFormat('fr-FR', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(date);
  }

  asNumber(val: unknown): number {
    return Number(val) || 0;
  }

  formatShortDate(value: string): string {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return new Intl.DateTimeFormat('fr-FR', {
      dateStyle: 'short',
      timeStyle: 'short',
    }).format(date);
  }
}
