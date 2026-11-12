import { Injectable, computed, inject } from '@angular/core';
import { AuthService } from '../auth/auth.service';

@Injectable({
  providedIn: 'root',
})
export class PermissionService {
  private readonly authService = inject(AuthService);

  private readonly permissions = computed(() => this.authService.userPermissions());

  /**
   * Vérifie qu'un utilisateur possède la (ou les) permission(s) requise(s).
   * Le rôle ADMIN (wildcard '*') est toujours autorisé.
   *
   * @param required  Une permission unique ou un tableau de permissions
   * @param requireAll Si true, toutes les permissions doivent être présentes (ET).
   *                   Si false (défaut), au moins une suffit (OU).
   */
  hasPermission(required: string | string[], requireAll = false): boolean {
    const userPerms = this.permissions();
    if (!userPerms || userPerms.length === 0) return false;

    // Wildcard ADMIN
    if (userPerms.includes('*')) return true;

    const requiredArr = Array.isArray(required) ? required : [required];
    if (requiredArr.length === 0) return true;

    if (requireAll) {
      return requiredArr.every((p) => userPerms.includes(p));
    } else {
      return requiredArr.some((p) => userPerms.includes(p));
    }
  }

  peut(required: string | string[], requireAll = false): boolean {
    return this.hasPermission(required, requireAll);
  }

  /**
   * Renvoie la liste brute des permissions de l'utilisateur courant.
   */
  getAllPermissions(): string[] {
    return this.permissions();
  }
}

