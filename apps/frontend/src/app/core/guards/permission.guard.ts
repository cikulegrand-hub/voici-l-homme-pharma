import { inject } from '@angular/core';
import { CanActivateFn, Router, UrlTree } from '@angular/router';
import { PermissionService } from '../permissions/permission.service';
import { AuthService } from '../auth/auth.service';

/**
 * Guard fonctionnel : vérifie que l'utilisateur dispose de la permission
 * déclarée dans route.data['permission'].
 * En cas de révocation par le Super-Admin, l'accès est immédiatement bloqué
 * et l'utilisateur est redirigé vers sa page d'accueil autorisée.
 */
export const permissionGuard: CanActivateFn = (route, _state): boolean | UrlTree => {
  const permissionService = inject(PermissionService);
  const router = inject(Router);
  const authService = inject(AuthService);

  const requiredPermission = route.data?.['permission'] as string | string[] | undefined;

  if (!requiredPermission) {
    return true; // Aucune permission déclarée
  }

  if (permissionService.hasPermission(requiredPermission)) {
    // Synchronisation en arrière-plan pour détecter d'éventuels changements du Super-Admin
    authService.syncPermissions();
    return true;
  }

  // Accès refusé – redirection discrète vers son point d'entrée personnel
  return router.createUrlTree([authService.getUserHomeRoute()]);
};
