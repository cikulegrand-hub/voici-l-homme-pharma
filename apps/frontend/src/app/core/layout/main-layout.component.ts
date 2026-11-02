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
import { NotificationsApiService, NotificationItem } from '../api/services/notifications-api.service';

export interface NavItem {
  icon: string;
  label: string;
  route: string;
  permission?: string;
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

        <mat-nav-list>
          @for (item of filteredNavItems(); track item.route) {
            <a
              mat-list-item
              [routerLink]="item.route"
              routerLinkActive="active-link"
              [routerLinkActiveOptions]="{ exact: item.route === '/dashboard' }"
              (click)="isMobile() ? sidenav.close() : null"
            >
              <mat-icon matListItemIcon>{{ item.icon }}</mat-icon>
              <span matListItemTitle>{{ item.label }}</span>
            </a>
          }
        </mat-nav-list>

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
            [matMenuTriggerFor]="notificationMenu"
            (click)="sidenav.toggle()"
            [matTooltip]="isMobile() ? 'Ouvrir le menu' : 'Réduire le menu'"
          >
            <mat-icon>menu</mat-icon>
          </button>
          <mat-menu #notificationMenu="matMenu">
            <button mat-menu-item (click)="$event.stopPropagation(); markAllNotificationsRead()">Tout marquer comme lu</button>
            <mat-divider></mat-divider>
            @for (notification of notifications(); track notification.id) {
              <button mat-menu-item (click)="$event.stopPropagation(); markNotificationRead(notification)">
                <span [class.notification-read]="notification.isRead">{{ notification.title }}</span>
              </button>
            }
            @if (notifications().length === 0) { <span class="empty-notifications">Aucune alerte</span> }
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
            [matTooltip]="i18n.header.notifications"
            [matBadge]="notificationCount()"
            [matBadgeHidden]="notificationCount() === 0"
            matBadgeColor="warn"
            matBadgeSize="small"
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
      background: #1e3a2f;
      color: #e0e0e0;
      border-right: none;
    }

    .sidebar-header {
      padding: 20px 16px;
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
      font-size: 14px;
      font-weight: 700;
      color: #ffffff;
      line-height: 1.2;
    }

    .logo-subtitle {
      font-size: 11px;
      color: #a0aec0;
      line-height: 1.2;
    }

    .sidebar mat-divider {
      border-color: rgba(255, 255, 255, 0.1);
    }

    .sidebar mat-nav-list {
      padding-top: 8px;
    }

    .sidebar mat-nav-list a {
      color: #c0cec8;
      border-radius: 0 24px 24px 0;
      margin-right: 12px;
    }

    .sidebar mat-nav-list a:hover {
      background: rgba(15, 157, 88, 0.15);
      color: #ffffff;
    }

    .sidebar mat-nav-list a.active-link {
      background: rgba(15, 157, 88, 0.25);
      color: #0f9d58;
      font-weight: 600;
    }

    .sidebar-footer {
      position: absolute;
      bottom: 0;
      left: 0;
      right: 0;
      padding-bottom: 8px;
    }

    .logout-link {
      color: #e57373 !important;
    }

    .topbar {
      position: sticky;
      top: 0;
      z-index: 100;
      background: #ffffff;
      color: #202124;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
      gap: 8px;
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
        width: 240px;
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
  `],
})
export class MainLayoutComponent implements OnInit, OnDestroy {
  readonly authService = inject(AuthService);
  private readonly permissionService = inject(PermissionService);
  private readonly breakpointObserver = inject(BreakpointObserver);
  private readonly cashApi = inject(CashApiService);
  private readonly notificationsApi = inject(NotificationsApiService);

  readonly i18n = I18N_FR;

  readonly currentUser = this.authService.currentUser;
  readonly activeRate = this.authService.activeRate;
  readonly notificationCount = signal(0);
  readonly notifications = signal<NotificationItem[]>([]);
  readonly cashSessionOpen = signal(false);
  private notificationTimer?: ReturnType<typeof setInterval>;

  ngOnInit(): void {
    if (this.authService.isAuthenticated()) {
      this.cashApi.getActiveSession().subscribe({ next: (session) => this.cashSessionOpen.set(!!session), error: () => this.cashSessionOpen.set(false) });
      this.refreshNotifications();
      this.notificationTimer = setInterval(() => this.refreshNotifications(), 45_000);
    }
  }

  private refreshNotifications(): void {
    this.notificationsApi.list().subscribe({ next: (items) => { this.notifications.set(items); this.notificationCount.set(items.filter((n) => !n.isRead).length); }, error: () => this.notificationCount.set(0) });
  }
  markNotificationRead(notification: NotificationItem): void { if (!notification.isRead) this.notificationsApi.markRead(notification.id).subscribe(() => this.refreshNotifications()); }
  markAllNotificationsRead(): void { this.notificationsApi.markAllRead().subscribe(() => this.refreshNotifications()); }
  ngOnDestroy(): void { if (this.notificationTimer) clearInterval(this.notificationTimer); }

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
    { icon: 'dashboard', label: this.i18n.navigation.dashboard, route: '/dashboard' },
    { icon: 'point_of_sale', label: this.i18n.navigation.pos, route: '/pos', permission: 'pos.access' },
    { icon: 'receipt_long', label: 'Ventes & Avoirs', route: '/sales', permission: 'vente.creer' },
    { icon: 'medication', label: this.i18n.navigation.catalog, route: '/catalog', permission: 'catalogue.consulter' },
    { icon: 'inventory_2', label: this.i18n.navigation.stock, route: '/stock', permission: 'stock.consulter' },
    { icon: 'input', label: 'Réceptions', route: '/reception', permission: 'stock.recevoir' },
    { icon: 'groups', label: this.i18n.navigation.customers, route: '/customers', permission: 'clients.consulter' },
    { icon: 'local_shipping', label: this.i18n.navigation.suppliers, route: '/suppliers', permission: 'stock.consulter' },
    { icon: 'account_balance_wallet', label: this.i18n.navigation.cash, route: '/cash', permission: 'finances.consulter' },
    { icon: 'assessment', label: this.i18n.navigation.reports, route: '/reports', permission: 'rapports.consulter' },
    { icon: 'history', label: this.i18n.navigation.audit, route: '/audit', permission: 'audit.consulter' },
    { icon: 'manage_accounts', label: this.i18n.navigation.users, route: '/users', permission: 'admin.utilisateurs' },
    { icon: 'history_toggle_off', label: this.i18n.navigation.loginHistory, route: '/login-history', permission: 'admin.audit' },
    { icon: 'settings', label: this.i18n.navigation.settings, route: '/settings', permission: 'parametres.modifier' },
    { icon: 'currency_exchange', label: 'Taux de Change', route: '/settings/exchange-rates', permission: 'parametres.modifier' },
    { icon: 'upload_file', label: 'Assistant d’Import', route: '/settings/import', permission: 'parametres.modifier' },
    { icon: 'backup', label: 'Sauvegardes', route: '/settings/backups', permission: 'parametres.modifier' },
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
