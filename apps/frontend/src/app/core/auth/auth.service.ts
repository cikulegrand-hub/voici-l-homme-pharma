import { Injectable, signal, computed, inject } from '@angular/core';
import { Router } from '@angular/router';
import { Observable, tap, catchError, throwError } from 'rxjs';
import { AuthApiService } from '../api/services/auth-api.service';
import { LoginDto } from '../api/generated/models';
import { UserProfile, ExchangeRate, AuthSession, RoleName } from '@vhp/shared';

const ACCESS_TOKEN_KEY = 'vhp_access_token';
const REFRESH_TOKEN_KEY = 'vhp_refresh_token';
const USER_KEY = 'vhp_user_profile';
const RATE_KEY = 'vhp_active_rate';

@Injectable({
  providedIn: 'root',
})
export class AuthService {
  private readonly authApi = inject(AuthApiService);
  private readonly router = inject(Router);

  readonly currentUser = signal<UserProfile | null>(this.loadStoredUser());
  readonly activeRate = signal<ExchangeRate | null>(this.loadStoredRate());
  readonly token = signal<string | null>(this.loadStoredToken());

  readonly isAuthenticated = computed(() => !!this.token() && !!this.currentUser());
  readonly userRole = computed<RoleName | null>(() => this.currentUser()?.role ?? null);
  readonly userPermissions = computed<string[]>(() => this.currentUser()?.permissions ?? []);

  hasPermission(permission: string): boolean {
    const user = this.currentUser();
    if (!user) return false;
    if (user.role === 'ADMIN' || (user.permissions && user.permissions.includes('*'))) return true;
    return user.permissions?.includes(permission) ?? false;
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
