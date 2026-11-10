import { Component, inject, computed, signal, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { MatSidenavModule } from '@angular/material/sidenav';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatListModule } from '@angular/material/list';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatBadgeModule } from '@angular/material/badge';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatMenuModule } from '@angular/material/menu';
import { MatDividerModule } from '@angular/material/divider';
import { BreakpointObserver, Breakpoints } from '@angular/cdk/layout';
import { map, shareReplay } from 'rxjs/operators';
import { toSignal } from '@angular/core/rxjs-interop';

import { AuthService } from '../auth/auth.service';
import { PermissionService } from '../permissions/permission.service';
import { I18N_FR } from '../i18n/translations.fr';
import { CashApiService } from '../api/services/cash-api.service';
import { NotificationStateService } from '../notifications/notification-state.service';
import { NotificationItem } from '../api/services/notifications-api.service';

export interface NavItem {
  icon: string;
  label: string;
  route: string;
  section: string;
  permission?: string | string[];
}

@Component({
  selector: 'app-main-layout',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    MatSidenavModule,
    MatToolbarModule,
    MatListModule,
    MatIconModule,
    MatButtonModule,
    MatBadgeModule,
    MatTooltipModule,
    MatMenuModule,
    MatDividerModule,
  ],
  template: `
    <mat-sidenav-container class="layout-container">
      <!-- Barre latérale -->
      <mat-sidenav
        #sidenav
        [mode]="isMobile() ? 'over' : 'side'"
        [opened]="!isMobile()"
        class="sidebar"
        role="navigation"
      >
        <div class="sidebar-header">
          <div class="sidebar-logo">
            <mat-icon class="logo-icon">local_pharmacy</mat-icon>
            <div class="logo-text">
              <span class="logo-title">{{ i18n.appName }}</span>
              <span class="logo-subtitle">{{ i18n.appSubtitle }}</span>
            </div>
          </div>
        </div>

        <mat-divider></mat-divider>

        <div class="sidebar-nav">
          <mat-nav-list>
            @for (item of filteredNavItems(); track item.route; let index = $index) {
              @if (index === 0 || item.section !== filteredNavItems()[index - 1].section) {
                <div class="nav-section-title" role="presentation">{{ item.section }}</div>
              }
              <a
                mat-list-item
                [routerLink]="item.route"
                routerLinkActive="active-link"
                [routerLinkActiveOptions]="{ exact: item.route === '/dashboard' || item.route === '/notifications' }"
                (click)="isMobile() ? sidenav.close() : null"
              >
                <mat-icon matListItemIcon>{{ item.icon }}</mat-icon>
                <span matListItemTitle>{{ item.label }}</span>
                @if (item.route === '/notifications' && notifService.unreadCount() > 0) {
                  <span class="sidebar-unread-badge">{{ notifService.unreadCount() }}</span>
                }
              </a>
            }
          </mat-nav-list>
        </div>

        <div class="sidebar-footer">
          <mat-divider></mat-divider>
          <a mat-list-item (click)="onLogout()" class="logout-link">
            <mat-icon matListItemIcon>logout</mat-icon>
            <span matListItemTitle>{{ i18n.navigation.logout }}</span>
          </a>
        </div>
      </mat-sidenav>

      <!-- Contenu principal -->
      <mat-sidenav-content class="main-content">
        <!-- En-tête -->
        <mat-toolbar color="primary" class="topbar">
          <button
            mat-icon-button
            (click)="sidenav.toggle()"
            [matTooltip]="isMobile() ? 'Ouvrir le menu' : 'Réduire le menu'"
          >
            <mat-icon>menu</mat-icon>
          </button>
          <mat-menu #notificationMenu="matMenu" class="vhp-notification-dropdown">
            <div class="notification-menu-header" (click)="$event.stopPropagation()">
              <span class="notification-menu-title">Centre d'Alertes</span>
              <button
                mat-icon-button
                (click)="notifService.syncAlerts()"
                [matTooltip]="'Détecter et actualiser les alertes'"
                [disabled]="notifService.isSyncing()"
                class="sync-btn"
                aria-label="Synchroniser les alertes"
              >
                <mat-icon [class.spin]="notifService.isSyncing()">sync</mat-icon>
              </button>
            </div>
            <div class="notification-menu-subbar" (click)="$event.stopPropagation()">
              @if (notifService.unreadCount() > 0) {
                <span class="notification-menu-count">{{ notifService.unreadCount() }} alerte{{ notifService.unreadCount() > 1 ? 's' : '' }} non lue{{ notifService.unreadCount() > 1 ? 's' : '' }}</span>
              } @else {
                <span class="notification-menu-count">Toutes les alertes sont à jour</span>
              }
              <button
                mat-button
                class="mark-all-btn"
                [disabled]="notifService.unreadCount() === 0"
                (click)="notifService.markAllAsRead()"
              >
                <mat-icon>done_all</mat-icon>
                <span>Tout marquer lu</span>
              </button>
            </div>
            <mat-divider></mat-divider>
            <div class="notification-scroll-container">
              @for (notification of notifService.notifications().slice(0, 8); track notification.id) {
                <button
                  mat-menu-item
                  class="notification-item"
                  [class.notification-unread]="!notification.isRead"
                  (click)="notifService.navigateToTarget(notification)"
                >
                  <mat-icon class="notification-severity" [class]="notificationSeverityClass(notification)">
                    {{ notifService.getIcon(notification) }}
                  </mat-icon>
                  <span class="notification-copy">
                    <span class="notification-title-line">
                      <span class="notification-title">{{ notification.title }}</span>
                      @if (!notification.isRead) {
                        <span class="unread-pill">NOUVEAU</span>
                      }
                    </span>
                    <span class="notification-message">{{ notification.message }}</span>
                    <span class="notification-date">{{ formatNotificationDate(notification.createdAt) }}</span>
                  </span>
                </button>
              }
              @if (notifService.notifications().length === 0) {
                <div class="empty-notifications">
                  <mat-icon>notifications_none</mat-icon>
                  <span>Aucune alerte enregistrée</span>
                </div>
              }
            </div>
            <mat-divider></mat-divider>
            <a mat-menu-item routerLink="/notifications" class="all-notifications-link">
              <mat-icon>open_in_new</mat-icon>
              <span>Centre de notifications complet</span>
            </a>
          </mat-menu>

          <!-- Taux de change du jour -->
          <div class="rate-chip" *ngIf="activeRate() as rate">
            <mat-icon class="rate-icon">currency_exchange</mat-icon>
            <span>1 {{ rate.baseCurrency }} = {{ rate.rate | number:'1.0-0' }} {{ rate.targetCurrency }}</span>
          </div>

          <span class="spacer"></span>

          <!-- Badge de caisse ouverte -->
          <div class="cash-chip" *ngIf="authService.isAuthenticated()">
            <span class="cash-dot" [class.open]="cashSessionOpen()"></span>
            <span class="cash-label">{{ cashSessionOpen() ? i18n.header.cashSessionOpen : 'Caisse fermée' }}</span>
          </div>

          <!-- Notifications -->
          <button
            mat-icon-button
            [matMenuTriggerFor]="notificationMenu"
            [matTooltip]="i18n.header.notifications"
            [matBadge]="notifService.unreadCount()"
            [matBadgeHidden]="notifService.unreadCount() === 0"
            matBadgeColor="warn"
            matBadgeSize="small"
            aria-label="Ouvrir les notifications"
          >
            <mat-icon>notifications_outlined</mat-icon>
          </button>

          <!-- Menu utilisateur -->
          <button
            mat-button
            [matMenuTriggerFor]="userMenu"
            class="user-button"
            *ngIf="currentUser() as user"
          >
            <mat-icon>account_circle</mat-icon>
            <span class="user-name">{{ user.fullName }}</span>
            <span class="role-badge">{{ getRoleName(user.role) }}</span>
          </button>
          <mat-menu #userMenu="matMenu">
            <button mat-menu-item routerLink="/profile">
              <mat-icon>person</mat-icon>
              <span>{{ i18n.header.profile }}</span>
            </button>
            <mat-divider></mat-divider>
            <button mat-menu-item (click)="onLogout()">
              <mat-icon>logout</mat-icon>
              <span>{{ i18n.navigation.logout }}</span>
            </button>
          </mat-menu>
        </mat-toolbar>

        <!-- Bandeau d'avertissement Taux de Change Manquant (FIN-04, RG-08) -->
        @if (!activeRate()) {
          <div class="rate-warning-banner">
            <div class="banner-content">
              <mat-icon class="banner-icon">warning</mat-icon>
              <div class="banner-text">
                <strong>Taux de change non configuré :</strong>
                <span> Aucun taux officiel CDF/USD n'est défini pour la journée. La saisie d'un taux est obligatoire avant toute vente ou mouvement de caisse.</span>
              </div>
            </div>
            <a mat-flat-button color="warn" routerLink="/settings/exchange-rates" class="banner-action-btn">
              Saisir le taux du jour
            </a>
          </div>
        }

        <!-- Contenu routé -->
        <div class="page-content">
          <router-outlet></router-outlet>
        </div>
      </mat-sidenav-content>
    </mat-sidenav-container>
  `,
  styles: [`
    .layout-container {
      height: 100vh;
      width: 100%;
    }

    .sidebar {
      width: 260px;
      background: var(--vhp-primary);
      color: #c0cec8;
      border-right: none;
      display: flex;
      flex-direction: column;
      overflow: hidden;
      --mdc-list-list-item-label-text-color: #dceae4;
      --mdc-list-list-item-leading-icon-color: #9bcdb2;
      --mdc-list-list-item-hover-label-text-color: #ffffff;
      --mdc-list-list-item-hover-leading-icon-color: #ffffff;
    }

    .sidebar-header {
      padding: 22px 18px 18px;
    }

    .sidebar-logo {
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .logo-icon {
      font-size: 32px;
      width: 32px;
      height: 32px;
      color: #0f9d58;
    }

    .logo-text {
      display: flex;
      flex-direction: column;
    }

    .logo-title {
      font-size: 15px;
      font-weight: 700;
      color: #ffffff;
      line-height: 1.2;
    }

    .logo-subtitle {
      font-size: 11px;
      color: #d1ddd7;
      font-size: 12px;
      line-height: 1.2;
    }

    .sidebar mat-divider {
      border-color: rgba(255, 255, 255, 0.1);
    }

    .sidebar-nav {
      flex: 1 1 auto;
      min-height: 0;
      overflow-y: auto;
      padding: 8px 0 12px;
      scrollbar-color: rgba(255, 255, 255, 0.25) transparent;
      scrollbar-width: thin;
    }

    .sidebar mat-nav-list {
      padding-top: 0;
    }

    .nav-section-title {
      color: #b7cec2;
      font-size: 10px;
      font-weight: 700;
      letter-spacing: 0.08em;
      line-height: 1.2;
      padding: 16px 20px 7px;
      text-transform: uppercase;
    }

    .sidebar mat-nav-list a {
      color: #dceae4 !important;
      border-left: 4px solid transparent;
      border-radius: 0 12px 12px 0;
      margin: 2px 12px 2px 0;
      min-height: 46px;
      height: auto;
      padding-bottom: 8px;
      padding-top: 8px;
    }

    .sidebar mat-nav-list a .mdc-list-item__primary-text,
    .sidebar mat-nav-list a [matListItemTitle] {
      color: #dceae4 !important;
      line-height: 1.25;
      overflow: visible;
      text-overflow: clip;
      white-space: normal;
    }

    .sidebar mat-nav-list a mat-icon,
    .sidebar mat-nav-list a .mdc-list-item__start {
      color: #9bcdb2 !important;
    }

    .sidebar mat-nav-list a:hover {
      background: rgba(255, 255, 255, 0.1);
      color: #ffffff !important;
    }

    .sidebar mat-nav-list a.active-link {
      background: #0f9d58;
      border-left-color: #b7f7cf;
      color: #ffffff;
      font-weight: 600;
    }

    .sidebar mat-nav-list a.active-link .mdc-list-item__primary-text,
    .sidebar mat-nav-list a.active-link [matListItemTitle] { color: #ffffff !important; }
    .sidebar mat-nav-list a.active-link mat-icon { color: #ffffff !important; }

    .sidebar-footer {
      flex: 0 0 auto;
      padding: 8px 0;
    }

    .logout-link {
      color: #ffb4ab !important;
    }

    .logout-link mat-icon { color: #ffb4ab !important; }

    .topbar {
      position: sticky;
      top: 0;
      z-index: 100;
      background: #ffffff;
      color: #202124;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
      gap: 8px;
    }

    .sidebar-unread-badge {
      background: #ef4444;
      color: #ffffff;
      font-size: 11px;
      font-weight: 700;
      padding: 1px 7px;
      border-radius: 12px;
      margin-left: auto;
    }

    .notification-menu-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 12px 16px 6px;
      min-width: 320px;
    }

    .notification-menu-title {
      color: var(--vhp-primary);
      font-size: 14px;
      font-weight: 700;
    }

    .notification-menu-subbar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0 16px 8px;
      gap: 12px;
    }

    .notification-menu-count {
      color: var(--vhp-text-secondary);
      font-size: 12px;
    }

    .mark-all-btn {
      font-size: 11px !important;
      height: 28px !important;
      line-height: 28px !important;
      padding: 0 8px !important;
      color: var(--vhp-accent) !important;
    }

    .mark-all-btn mat-icon {
      font-size: 16px !important;
      width: 16px !important;
      height: 16px !important;
      margin-right: 4px !important;
    }

    .notification-scroll-container {
      max-height: 380px;
      max-width: 360px;
      min-width: 320px;
      overflow-y: auto;
    }

    .notification-item {
      align-items: flex-start !important;
      height: auto !important;
      min-height: 60px;
      padding: 10px 16px !important;
      white-space: normal !important;
      border-bottom: 1px solid rgba(0, 0, 0, 0.04);
    }

    .notification-item.notification-unread {
      background: #f0fdf4 !important;
      border-left: 3px solid var(--vhp-accent);
    }

    .notification-severity {
      color: var(--vhp-text-secondary);
      margin-top: 2px;
    }

    .notification-severity.severity-danger,
    .notification-severity.severity-error { color: var(--vhp-warn); }
    .notification-severity.severity-warning { color: var(--vhp-warning); }
    .notification-severity.severity-info { color: #1a73e8; }

    .notification-copy {
      display: flex;
      flex-direction: column;
      min-width: 0;
      line-height: 1.3;
      gap: 2px;
    }

    .notification-title-line {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
    }

    .notification-title {
      color: var(--vhp-text-primary);
      font-weight: 650;
      font-size: 13px;
    }

    .unread-pill {
      background: #ef4444;
      color: #ffffff;
      font-size: 9px;
      font-weight: 700;
      padding: 1px 5px;
      border-radius: 6px;
      letter-spacing: 0.5px;
    }

    .notification-message {
      color: var(--vhp-text-secondary);
      font-size: 12px;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }

    .notification-date {
      color: #94a3b8;
      font-size: 11px;
      margin-top: 2px;
    }

    .empty-notifications {
      padding: 24px 16px;
      text-align: center;
      color: var(--vhp-text-secondary);
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 6px;
      font-size: 13px;
    }

    .all-notifications-link {
      color: var(--vhp-accent) !important;
      font-weight: 600;
      justify-content: center !important;
      text-align: center;
    }

    .sync-btn mat-icon.spin {
      animation: spin 1s linear infinite;
    }

    @keyframes spin {
      100% { transform: rotate(360deg); }
    }

    .rate-chip {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      background: #e6f4ea;
      color: #137333;
      padding: 4px 12px;
      border-radius: 16px;
      font-size: 13px;
      font-weight: 600;
    }

    .rate-icon {
      font-size: 18px;
      width: 18px;
      height: 18px;
    }

    .spacer {
      flex: 1;
    }

    .cash-chip {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      font-size: 12px;
      font-weight: 600;
      color: #5f6368;
    }

    .cash-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: #f2994a;
    }

    .cash-dot.open {
      background: #0f9d58;
    }

    .user-button {
      text-transform: none;
      font-family: var(--vhp-font);
    }

    .user-name {
      font-weight: 600;
      margin-left: 6px;
      margin-right: 6px;
      font-size: 13px;
    }

    .role-badge {
      background: #e8f0fe;
      color: #1a73e8;
      padding: 2px 8px;
      border-radius: 10px;
      font-size: 11px;
      font-weight: 600;
    }

    .rate-warning-banner {
      background: #fef2f2;
      border-bottom: 2px solid #ef4444;
      color: #991b1b;
      padding: 10px 24px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      font-size: 13px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.08);
      z-index: 10;
    }

    .banner-content {
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .banner-icon {
      color: #dc2626;
      font-size: 24px;
      width: 24px;
      height: 24px;
      flex-shrink: 0;
    }

    .banner-action-btn {
      white-space: nowrap;
      font-size: 12px;
      font-weight: 600;
    }

    .page-content {
      padding: 24px;
      min-height: calc(100vh - 64px);
    }

    /* Responsive tablette 10 pouces et mobile (ERG-02) */
    @media (max-width: 1024px) {
      .sidebar {
        width: 280px;
      }

      .user-name {
        display: none;
      }

      .rate-chip span:not(.rate-icon) {
        font-size: 12px;
      }

      .page-content {
        padding: 16px;
      }
    }

    @media (max-width: 768px) {
      .rate-warning-banner {
        flex-direction: column;
        align-items: stretch;
        padding: 12px 14px;
        gap: 10px;
      }

      .banner-action-btn {
        width: 100%;
        text-align: center;
      }

      .topbar {
        padding: 0 8px;
        gap: 4px;
      }
    }

    @media (max-width: 600px) {
      .rate-chip {
        padding: 2px 6px;
        font-size: 11px;
      }

      .cash-chip .cash-label {
        display: none;
      }

      .role-badge {
        display: none;
      }

      .page-content {
        padding: 12px 8px;
      }
    }
  `],
})
export class MainLayoutComponent implements OnInit {
  readonly authService = inject(AuthService);
  private readonly permissionService = inject(PermissionService);
  private readonly breakpointObserver = inject(BreakpointObserver);
  private readonly cashApi = inject(CashApiService);
  readonly notifService = inject(NotificationStateService);

  readonly i18n = I18N_FR;

  readonly currentUser = this.authService.currentUser;
  readonly activeRate = this.authService.activeRate;
  readonly cashSessionOpen = signal(false);

  ngOnInit(): void {
    if (this.authService.isAuthenticated()) {
      this.cashApi.getActiveSession().subscribe({
        next: (session) => this.cashSessionOpen.set(!!session),
        error: () => this.cashSessionOpen.set(false),
      });
    }
  }

  notificationSeverityClass(notification: NotificationItem): string {
    return `severity-${notification.severity.toLowerCase()}`;
  }

  formatNotificationDate(value: string): string {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? '' : new Intl.DateTimeFormat('fr-FR', { dateStyle: 'short', timeStyle: 'short' }).format(date);
  }

  readonly isMobile = toSignal(
    this.breakpointObserver
      .observe([Breakpoints.Handset, Breakpoints.TabletPortrait])
      .pipe(
        map((result) => result.matches),
        shareReplay(),
      ),
    { initialValue: false },
  );

  private readonly allNavItems: NavItem[] = [
    { section: 'Accueil', icon: 'dashboard', label: this.i18n.navigation.dashboard, route: '/dashboard' },
    { section: 'Accueil', icon: 'notifications', label: 'Notifications & Alertes', route: '/notifications' },
    { section: 'Ventes', icon: 'point_of_sale', label: this.i18n.navigation.pos, route: '/pos', permission: ['pos.access', 'vente.creer'] },
    { section: 'Ventes', icon: 'receipt_long', label: 'Ventes & Avoirs', route: '/sales', permission: ['vente.consulter', 'vente.creer'] },
    { section: 'Catalogue & Stock', icon: 'medication', label: this.i18n.navigation.catalog, route: '/catalog', permission: 'catalogue.consulter' },
    { section: 'Catalogue & Stock', icon: 'inventory_2', label: this.i18n.navigation.stock, route: '/stock', permission: 'stock.consulter' },
    { section: 'Catalogue & Stock', icon: 'input', label: 'Réceptions', route: '/reception', permission: 'stock.recevoir' },
    { section: 'Clients & Fournisseurs', icon: 'groups', label: this.i18n.navigation.customers, route: '/customers', permission: ['client.consulter', 'clients.consulter'] },
    { section: 'Clients & Fournisseurs', icon: 'local_shipping', label: this.i18n.navigation.suppliers, route: '/suppliers', permission: 'stock.consulter' },
    { section: 'Finance', icon: 'account_balance_wallet', label: this.i18n.navigation.cash, route: '/cash', permission: ['caisse.ouvrir', 'caisse.cloturer', 'finances.consulter'] },
    { section: 'Finance', icon: 'assessment', label: this.i18n.navigation.reports, route: '/reports', permission: ['rapports.dashboard', 'rapports.consulter'] },
    { section: 'Administration', icon: 'history', label: this.i18n.navigation.audit, route: '/audit', permission: 'audit.consulter' },
    { section: 'Administration', icon: 'manage_accounts', label: this.i18n.navigation.users, route: '/users', permission: 'admin.utilisateurs' },
    { section: 'Administration', icon: 'settings', label: this.i18n.navigation.settings, route: '/settings', permission: 'parametres.modifier' },
    { section: 'Administration', icon: 'currency_exchange', label: 'Taux de Change', route: '/settings/exchange-rates', permission: 'taux.modifier' },
    { section: 'Administration', icon: 'upload_file', label: 'Assistant d’Import', route: '/settings/import', permission: 'parametres.modifier' },
  ];

  readonly filteredNavItems = computed(() => {
    // Re-lit les permissions pour enregistrer la dépendance
    this.authService.userPermissions();
    return this.allNavItems.filter(
      (item) => !item.permission || this.permissionService.hasPermission(item.permission),
    );
  });

  getRoleName(role: string): string {
    return (this.i18n.roles as Record<string, string>)[role] ?? role;
  }

  onLogout(): void {
    this.authService.logout();
  }
}
