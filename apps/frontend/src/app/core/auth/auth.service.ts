import { Injectable, signal, computed, inject } from '@angular/core';
import { Router } from '@angular/router';
import { Observable, tap, catchError, throwError } from 'rxjs';
import { AuthApiService } from '../api/services/auth-api.service';
import { LoginDto } from '../api/generated/models';
import { UserProfile, ExchangeRate, AuthSession, RoleName } from '@vhp/shared';
import { AlertService } from '../services/alert.service';

const ACCESS_TOKEN_KEY = 'vhp_access_token';
const REFRESH_TOKEN_KEY = 'vhp_refresh_token';
const USER_KEY = 'vhp_user_profile';
const RATE_KEY = 'vhp_active_rate';
const ACTIVE_PHARMACY_KEY = 'vhp_active_pharmacy_id';

@Injectable({
  providedIn: 'root',
})
export class AuthService {
  private readonly authApi = inject(AuthApiService);
  private readonly router = inject(Router);
  private readonly alertService = inject(AlertService);

  readonly currentUser = signal<UserProfile | null>(this.loadStoredUser());
  readonly activeRate = signal<ExchangeRate | null>(this.loadStoredRate());
  readonly token = signal<string | null>(this.loadStoredToken());
  readonly activePharmacyId = signal<string | null>(localStorage.getItem(ACTIVE_PHARMACY_KEY));

  private syncTimer: any = null;
  private focusListener: (() => void) | null = null;
  private isSyncing = false;

  setActivePharmacy(pharmacyId: string | null): void {
    if (pharmacyId) {
      localStorage.setItem(ACTIVE_PHARMACY_KEY, pharmacyId);
    } else {
      localStorage.removeItem(ACTIVE_PHARMACY_KEY);
    }
    this.activePharmacyId.set(pharmacyId);
  }

  readonly isAuthenticated = computed(() => !!this.token() && !!this.currentUser());
  readonly userRole = computed<RoleName | null>(() => this.currentUser()?.role ?? null);
  readonly userPermissions = computed<string[]>(() => this.currentUser()?.permissions ?? []);

  hasPermission(permission: string | string[]): boolean {
    const user = this.currentUser();
    if (!user) return false;
    if (user.permissions && user.permissions.includes('*')) return true;
    if (Array.isArray(permission)) {
      return permission.some((p) => user.permissions?.includes(p) ?? false);
    }
    return user.permissions?.includes(permission) ?? false;
  }

  peut(permission: string | string[]): boolean {
    return this.hasPermission(permission);
  }

  getUserHomeRoute(): string {
    const user = this.currentUser();
    if (!user) return '/login';
    switch (user.role) {
      case 'CAISSIER':
        return '/pos';
      case 'STOCK':
        return '/stock';
      case 'COMPTABLE':
        return '/reports';
      case 'PHARMACIEN':
      case 'ADMIN':
      default:
        return '/dashboard';
    }
  }

  login(dto: LoginDto): Observable<AuthSession> {
    return this.authApi.login(dto).pipe(
      tap((session) => {
        this.saveSession(session);
      }),
      catchError((err) => {
        return throwError(() => err);
      }),
    );
  }

  loadMe(): Observable<{ user: UserProfile; activeRate: ExchangeRate }> {
    return this.authApi.getMe().pipe(
      tap((res) => {
        this.currentUser.set(res.user);
        this.activeRate.set(res.activeRate);
        localStorage.setItem(USER_KEY, JSON.stringify(res.user));
        localStorage.setItem(RATE_KEY, JSON.stringify(res.activeRate));
      }),
      catchError((err) => {
        return throwError(() => err);
      }),
    );
  }

  /**
   * Démarre la synchronisation temps réel des habilitations :
   * 1. Polling périodique (15 secondes)
   * 2. Synchronisation instantanée au focus de la fenêtre/onglet
   */
  startPermissionSync(): void {
    if (this.syncTimer) return;

    this.syncTimer = setInterval(() => {
      if (this.isAuthenticated()) {
        this.syncPermissions();
      }
    }, 15000);

    if (typeof window !== 'undefined') {
      this.focusListener = () => {
        if (this.isAuthenticated()) {
          this.syncPermissions();
        }
      };
      window.addEventListener('focus', this.focusListener);
    }

    this.syncPermissions();
  }

  stopPermissionSync(): void {
    if (this.syncTimer) {
      clearInterval(this.syncTimer);
      this.syncTimer = null;
    }
    if (typeof window !== 'undefined' && this.focusListener) {
      window.removeEventListener('focus', this.focusListener);
      this.focusListener = null;
    }
  }

  /**
   * Synchronise les droits effectifs de l'utilisateur avec la base de données.
   * Si le Super-Admin a retiré des droits ou modifié le rôle :
   * - Les signaux réactifs Angular se mettent à jour instantanément (menus masqués immédiatement)
   * - Une alerte discrète est notifiée
   * - Si l'employé est sur un écran auquel il n'a plus droit, il est immédiatement redirigé.
   */
  syncPermissions(): void {
    if (!this.isAuthenticated() || this.isSyncing) return;
    this.isSyncing = true;

    this.authApi.getMe().subscribe({
      next: (res) => {
        this.isSyncing = false;
        const oldUser = this.currentUser();
        const oldPerms = (oldUser?.permissions || []).slice().sort().join(',');
        const newPerms = (res.user?.permissions || []).slice().sort().join(',');
        const roleChanged = oldUser?.role !== res.user?.role;
        const permissionsChanged = oldPerms !== newPerms;

        this.currentUser.set(res.user);
        this.activeRate.set(res.activeRate);
        localStorage.setItem(USER_KEY, JSON.stringify(res.user));
        localStorage.setItem(RATE_KEY, JSON.stringify(res.activeRate));

        if ((permissionsChanged || roleChanged) && oldUser) {
          this.alertService.info("Vos habilitations d'accès ont été actualisées en temps réel.");
          this.checkCurrentRouteAccess();
        }
      },
      error: (err) => {
        this.isSyncing = false;
        if (err?.status === 401 || err?.status === 403) {
          this.logout('session_expired');
        }
      },
    });
  }

  checkCurrentRouteAccess(): void {
    try {
      let route = this.router.routerState.snapshot.root;
      while (route.firstChild) {
        route = route.firstChild;
      }
      const requiredPermission = route.data?.['permission'] as string | string[] | undefined;
      if (requiredPermission && !this.hasPermission(requiredPermission)) {
        this.alertService.warning("Accès révoqué : vous n'avez plus accès à cette section.");
        this.router.navigate([this.getUserHomeRoute()]);
      }
    } catch {
      // Ignorer si router non encore prêt
    }
  }

  refreshToken(): Observable<{ token: string; refreshToken: string }> {
    const currentRefreshToken = this.getRefreshToken();
    if (!currentRefreshToken) {
      this.logout('missing_refresh_token');
      return throwError(() => new Error('Refresh token manquant.'));
    }

    return this.authApi.refreshToken(currentRefreshToken).pipe(
      tap((tokens) => {
        this.updateTokens(tokens.token, tokens.refreshToken);
      }),
      catchError((err) => {
        this.logout('refresh_failed');
        return throwError(() => err);
      }),
    );
  }

  logout(reason?: string): void {
    this.stopPermissionSync();

    sessionStorage.removeItem(ACCESS_TOKEN_KEY);
    localStorage.removeItem(REFRESH_TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    localStorage.removeItem(RATE_KEY);

    this.token.set(null);
    this.currentUser.set(null);
    this.activeRate.set(null);

    const queryParams = reason ? { reason } : undefined;
    this.router.navigate(['/login'], { queryParams });
  }

  getAccessToken(): string | null {
    return this.token() || sessionStorage.getItem(ACCESS_TOKEN_KEY);
  }

  getRefreshToken(): string | null {
    return localStorage.getItem(REFRESH_TOKEN_KEY);
  }

  setActiveRate(rate: ExchangeRate): void {
    this.activeRate.set(rate);
    localStorage.setItem(RATE_KEY, JSON.stringify(rate));
  }

  private saveSession(session: AuthSession): void {
    this.updateTokens(session.token, session.refreshToken);

    sessionStorage.setItem(ACCESS_TOKEN_KEY, session.token);
    localStorage.setItem(USER_KEY, JSON.stringify(session.user));
    localStorage.setItem(RATE_KEY, JSON.stringify(session.activeRate));

    this.currentUser.set(session.user);
    this.activeRate.set(session.activeRate || null);

    this.startPermissionSync();
  }

  private updateTokens(accessToken: string, refreshToken: string): void {
    sessionStorage.setItem(ACCESS_TOKEN_KEY, accessToken);
    localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
    this.token.set(accessToken);
  }

  private loadStoredToken(): string | null {
    return sessionStorage.getItem(ACCESS_TOKEN_KEY);
  }

  private loadStoredUser(): UserProfile | null {
    const raw = localStorage.getItem(USER_KEY);
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  private loadStoredRate(): ExchangeRate | null {
    const raw = localStorage.getItem(RATE_KEY);
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }
}
