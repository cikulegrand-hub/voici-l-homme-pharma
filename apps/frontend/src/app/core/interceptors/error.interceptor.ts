import { inject } from '@angular/core';
import { HttpInterceptorFn, HttpErrorResponse } from '@angular/common/http';
import { throwError } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { AlertService } from '../services/alert.service';
import { AuthService } from '../auth/auth.service';
import { I18N_FR } from '../i18n/translations.fr';

export interface BackendErrorPayload {
  code?: string;
  statusCode?: number;
  message?: string | string[];
  error?: string;
  details?: Record<string, any> | string[];
}

function toUserMessage(message: string): string {
  const cleaned = message.replace(/\s*\((?:[A-Z]{2,5}-\d+(?:,\s*)?)+\)/g, '').trim();
  if (/\b(?:API|RPT|CSV|JSON|UUID|ISO|FEFO|CUMP|idempot(?:ence|ency)|token|jeton|JWT|endpoint|backend|frontend|HTTP|path|storage)\b/i.test(cleaned)) {
    return I18N_FR.errors.generic;
  }
  return cleaned;
}

export const errorInterceptor: HttpInterceptorFn = (req, next) => {
  const alertService = inject(AlertService);
  const authService = inject(AuthService);

  return next(req).pipe(
    catchError((error: unknown) => {
      if (error instanceof HttpErrorResponse) {
        // Ignorer les 401 si un refresh est tenté de manière transparente,
        // sauf si la requête est la tentative de login ou de refresh elle-même
        const isAuthRequest = req.url.includes('/auth/login') || req.url.includes('/auth/refresh');

        const payload: BackendErrorPayload | null =
          typeof error.error === 'object' && error.error !== null ? error.error : null;

        let displayMessage = '';

        // Extraction message backend
        if (payload?.message) {
          if (Array.isArray(payload.message)) {
            displayMessage = toUserMessage(payload.message.join(' · '));
          } else {
            displayMessage = toUserMessage(payload.message);
          }
        }

        switch (error.status) {
          case 0:
            alertService.error(I18N_FR.errors.network);
            break;

          case 401:
            if (isAuthRequest) {
              alertService.error(displayMessage || I18N_FR.auth.loginFailed);
            }
            break;

          case 403:
            alertService.error('Action non disponible');
            authService.loadMe().subscribe({ error: () => {} });
            break;

          case 404:
            alertService.warning(displayMessage || I18N_FR.errors.notFound);
            break;

          case 409:
            alertService.error(`Conflit : ${displayMessage || I18N_FR.errors.conflict}`);
            break;

          case 422:
          case 400:
            alertService.warning(
              payload?.details && typeof payload.details === 'object'
                ? I18N_FR.errors.validation
                : (displayMessage || I18N_FR.errors.validation),
            );
            break;

          case 500:
          case 502:
          case 503:
          case 504:
            alertService.error(I18N_FR.errors.server);
            break;

          default:
            alertService.error(displayMessage || I18N_FR.errors.generic);
            break;
        }
      }

      return throwError(() => error);
    }),
  );
};

