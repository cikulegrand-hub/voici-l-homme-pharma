import { inject, Injectable } from '@angular/core';
import {
  HttpRequest,
  HttpHandlerFn,
  HttpEvent,
  HttpErrorResponse,
  HttpInterceptorFn,
} from '@angular/common/http';
import { Observable, BehaviorSubject, throwError } from 'rxjs';
import { catchError, filter, switchMap, take } from 'rxjs/operators';
import { AuthService } from '../auth/auth.service';

@Injectable({
  providedIn: 'root',
})
export class AuthTokenRefreshQueue {
  private isRefreshing = false;
  private readonly refreshTokenSubject = new BehaviorSubject<string | null>(null);

  handle401(
    req: HttpRequest<unknown>,
    next: HttpHandlerFn,
    authService: AuthService,
  ): Observable<HttpEvent<unknown>> {
    if (!this.isRefreshing) {
      this.isRefreshing = true;
      this.refreshTokenSubject.next(null);

      return authService.refreshToken().pipe(
        switchMap((tokens) => {
          this.isRefreshing = false;
          this.refreshTokenSubject.next(tokens.token);
          return next(this.addTokenHeader(req, tokens.token));
        }),
        catchError((refreshErr) => {
          this.isRefreshing = false;
          authService.logout('session_expired');
          return throwError(() => refreshErr);
        }),
      );
    } else {
      // Requête mise en file d'attente pendant que le refresh se termine
      return this.refreshTokenSubject.pipe(
        filter((token): token is string => token !== null),
        take(1),
        switchMap((token) => next(this.addTokenHeader(req, token))),
      );
    }
  }

  addTokenHeader(req: HttpRequest<unknown>, token: string): HttpRequest<unknown> {
    return req.clone({
      setHeaders: {
        Authorization: `Bearer ${token}`,
      },
    });
  }

  isRefreshingInProgress(): boolean {
    return this.isRefreshing;
  }
}

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const authService = inject(AuthService);
  const queue = inject(AuthTokenRefreshQueue);

  // Ne pas ajouter de token pour les endpoints publics d'authentification
  const isAuthEndpoint = req.url.includes('/auth/login') || req.url.includes('/auth/refresh');
  const token = authService.getAccessToken();

  let authReq = req;
  if (token && !isAuthEndpoint) {
    authReq = queue.addTokenHeader(req, token);
  }

  return next(authReq).pipe(
    catchError((error: unknown) => {
      if (error instanceof HttpErrorResponse && error.status === 401 && !isAuthEndpoint) {
        return queue.handle401(authReq, next, authService);
      }
      return throwError(() => error);
    }),
  );
};

