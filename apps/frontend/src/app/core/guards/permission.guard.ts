import { inject } from '@angular/core';
import { CanActivateFn, Router, UrlTree } from '@angular/router';
import { PermissionService } from '../permissions/permission.service';

/**
 * Guard fonctionnel : vérifie que l'utilisateur dispose de la permission
 * déclarée dans route.data['permission'].
 *
 * Exemple dans les routes :
 *   {
 *     path: 'stock',
 *     canActivate: [permissionGuard],
 *     data: { permission: 'stock.consulter' },
 *     loadComponent: () => ...
 *   }
 */
export const permissionGuard: CanActivateFn = (route, _state): boolean | UrlTree => {
  const permissionService = inject(PermissionService);
  const router = inject(Router);

  const requiredPermission = route.data?.['permission'] as string | string[] | undefined;

  if (!requiredPermission) {
    return true; // Aucune permission déclarée
  }

  if (permissionService.hasPermission(requiredPermission)) {
    return true;
  }

  // Accès refusé – redirection vers le dashboard
  return router.createUrlTree(['/dashboard']);
};

