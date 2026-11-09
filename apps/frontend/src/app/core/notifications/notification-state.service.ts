import { Injectable, inject, signal, computed, effect, untracked } from '@angular/core';
import { Router } from '@angular/router';
import { MatSnackBar } from '@angular/material/snack-bar';
import { NotificationsApiService, NotificationItem, NotificationQueryParams } from '../api/services/notifications-api.service';
import { AuthService } from '../auth/auth.service';

@Injectable({ providedIn: 'root' })
export class NotificationStateService {
  private readonly api = inject(NotificationsApiService);
  private readonly router = inject(Router);
  private readonly snackBar = inject(MatSnackBar);
  private readonly auth = inject(AuthService);

  // État réactif
  readonly notifications = signal<NotificationItem[]>([]);
  readonly unreadCount = signal<number>(0);
  readonly isLoading = signal<boolean>(false);
  readonly isSyncing = signal<boolean>(false);

  // Compteur calculé dérivé de la liste si présent, ou du compteur direct
  readonly unreadNotifications = computed(() => this.notifications().filter((n) => !n.isRead));
  readonly criticalCount = computed(() =>
    this.notifications().filter((n) => !n.isRead && (n.severity === 'DANGER' || n.type === 'STOCK_RUPTURE')).length,
  );

  private pollIntervalId?: ReturnType<typeof setInterval>;

  constructor() {
    // Si l'utilisateur est authentifié, on démarre le polling et on charge les données
    effect(
      () => {
        const user = this.auth.currentUser();
        untracked(() => {
          if (user) {
            this.startAutoPolling();
          } else {
            this.stopAutoPolling();
            this.notifications.set([]);
            this.unreadCount.set(0);
          }
        });
      },
      { allowSignalWrites: true },
    );
  }

  startAutoPolling(intervalMs = 45_000): void {
    this.stopAutoPolling();
    this.refreshAll();
    this.pollIntervalId = setInterval(() => {
      this.refreshAll(false);
    }, intervalMs);
  }

  stopAutoPolling(): void {
    if (this.pollIntervalId) {
      clearInterval(this.pollIntervalId);
      this.pollIntervalId = undefined;
    }
  }

  refreshAll(showLoading = true): void {
    if (showLoading) this.isLoading.set(true);

    this.api.list().subscribe({
      next: (items) => {
        this.notifications.set(items);
        this.unreadCount.set(items.filter((i) => !i.isRead).length);
        if (showLoading) this.isLoading.set(false);
      },
      error: () => {
        if (showLoading) this.isLoading.set(false);
      },
    });
  }

  syncAlerts(): void {
    this.isSyncing.set(true);
    this.api.sync().subscribe({
      next: (res) => {
        this.isSyncing.set(false);
        this.refreshAll(true);
        const count = res.createdAlertsCount || 0;
        if (count > 0) {
          this.snackBar.open(`${count} nouvelle(s) alerte(s) détectée(s) et générée(s).`, 'Fermer', {
            duration: 4000,
            panelClass: ['vhp-snackbar-info'],
          });
        } else {
          this.snackBar.open('Scan terminé : aucune nouvelle alerte détectée. Tout est à jour.', 'Fermer', {
            duration: 3000,
          });
        }
      },
      error: (err) => {
        this.isSyncing.set(false);
        this.snackBar.open(`Erreur lors de la détection des alertes : ${err?.message || 'Inconnue'}`, 'Fermer', {
          duration: 4000,
          panelClass: ['vhp-snackbar-error'],
        });
      },
    });
  }

  markAsRead(id: string): void {
    // Mise à jour optimiste instantanée
    this.notifications.update((list) =>
      list.map((n) => (n.id === id ? { ...n, isRead: true, readAt: new Date().toISOString() } : n)),
    );
    this.unreadCount.update((cnt) => Math.max(0, cnt - 1));

    this.api.markRead(id).subscribe({
      error: () => {
        // En cas d'erreur réseau, resynchronisation
        this.refreshAll(false);
      },
    });
  }

  markAllAsRead(): void {
    const prevCount = this.unreadCount();
    if (prevCount === 0) return;

    // Mise à jour optimiste instantanée
    this.notifications.update((list) =>
      list.map((n) => ({ ...n, isRead: true, readAt: new Date().toISOString() })),
    );
    this.unreadCount.set(0);

    this.api.markAllRead().subscribe({
      next: (res) => {
        const updated = res.updatedCount ?? prevCount;
        this.snackBar.open(`${updated} notification(s) marquée(s) comme lue(s).`, 'Fermer', {
          duration: 3000,
        });
      },
      error: () => {
        this.refreshAll(false);
      },
    });
  }

  /**
   * Résout la route de redirection contextuelle vers le module métier concerné
   */
  resolveTarget(notification: NotificationItem): { path: string[]; queryParams?: Record<string, any> } | null {
    if (notification.type === 'STOCK_BAS' || notification.type === 'STOCK_RUPTURE' || notification.type === 'PEREMPTION' || notification.entityType === 'PRODUCT_LOT') {
      return { path: ['/stock'] };
    }
    if (notification.type === 'CREANCE_RETARD' || notification.entityType === 'CUSTOMER') {
      return { path: ['/customers'] };
    }
    if (notification.type === 'ECART_CAISSE' || notification.entityType === 'CASH_SESSION') {
      return { path: ['/cash'] };
    }
    if (notification.type === 'CONFLIT_STOCK_OFFLINE' || notification.entityType === 'SALE') {
      return { path: ['/sales'] };
    }
    return null;
  }

  /**
   * Marque la notification comme lue et navigue vers le module concerné
   */
  navigateToTarget(notification: NotificationItem): void {
    if (!notification.isRead) {
      this.markAsRead(notification.id);
    }
    const target = this.resolveTarget(notification);
    if (target) {
      this.router.navigate(target.path, { queryParams: target.queryParams });
    }
  }

  getIcon(notification: NotificationItem): string {
    if (notification.type === 'STOCK_RUPTURE' || notification.severity === 'DANGER') return 'error';
    if (notification.type === 'STOCK_BAS') return 'inventory_2';
    if (notification.type === 'PEREMPTION') return 'event_busy';
    if (notification.type === 'CREANCE_RETARD') return 'money_off';
    if (notification.type === 'ECART_CAISSE') return 'account_balance_wallet';
    if (notification.type === 'CONFLIT_STOCK_OFFLINE') return 'sync_problem';
    if (notification.severity === 'WARNING') return 'warning';
    return 'notifications';
  }

  getSeverityBadge(notification: NotificationItem): { label: string; class: string } {
    if (notification.severity === 'DANGER' || notification.type === 'STOCK_RUPTURE') {
      return { label: 'CRITIQUE', class: 'badge-danger' };
    }
    if (notification.severity === 'WARNING') {
      return { label: 'ATTENTION', class: 'badge-warning' };
    }
    return { label: 'INFO', class: 'badge-info' };
  }
}

