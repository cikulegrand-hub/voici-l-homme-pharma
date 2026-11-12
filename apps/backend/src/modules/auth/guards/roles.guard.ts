import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector, ModuleRef } from '@nestjs/core';
import { ROLES_KEY, PERMISSIONS_KEY, IS_PUBLIC_KEY } from '../decorators/auth.decorators';
import { RoleName } from '@vhp/shared';
import { AuditService } from '../../audit/audit.service';
import { NotificationsService } from '../../notifications/notifications.service';

@Injectable()
export class RolesGuard implements CanActivate {
  // Suivi en mémoire des échecs d'accès répétés par utilisateur (fenêtre de 10 minutes)
  private static failedAttempts = new Map<string, { count: number; firstAttempt: number }>();

  constructor(
    private readonly reflector: Reflector,
    private readonly moduleRef: ModuleRef,
  ) {}

  private getAuditService(): AuditService | null {
    try {
      return this.moduleRef.get(AuditService, { strict: false });
    } catch {
      return null;
    }
  }

  private getNotificationsService(): NotificationsService | null {
    try {
      return this.moduleRef.get(NotificationsService, { strict: false });
    } catch {
      return null;
    }
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // 1. Route publique : accès direct sans restriction
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user;

    // Utilisateur non authentifié
    if (!user) {
      throw new UnauthorizedException('Session utilisateur invalide.');
    }

    // Utilisateur inactif : rejet immédiat
    if (user.isActive === false) {
      throw new UnauthorizedException('Session utilisateur invalide.');
    }

    // SUPER_ADMIN : accès racine absolu et inconditionnel à toutes les routes
    if (user.role === 'SUPER_ADMIN') {
      return true;
    }

    // Récupération des métadonnées déclarées
    const requiredRoles = this.reflector.getAllAndOverride<RoleName[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    const requiredPermissions = this.reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    // Règle stricte (liste blanche) : Si une route n'a aucune permission déclarée et n'est pas publique,
    // elle est REFUSÉE par défaut pour garantir l'étanchéité absolue du système.
    if ((!requiredRoles || requiredRoles.length === 0) && (!requiredPermissions || requiredPermissions.length === 0)) {
      await this.handleAccessDenial(request, user, 'Route sans permission déclarée (liste blanche stricte)');
      throw new ForbiddenException('Action non disponible');
    }

    // 2. Vérification des rôles (si spécifiés)
    if (requiredRoles && requiredRoles.length > 0) {
      const hasRole = requiredRoles.includes(user.role);
      if (!hasRole && user.role !== 'ADMIN' && user.role !== 'SUPER_ADMIN') {
        await this.handleAccessDenial(request, user, `Rôle requis : ${requiredRoles.join(', ')}`);
        throw new ForbiddenException('Action non disponible');
      }
    }

    // 3. Vérification des permissions fines (droits effectifs calculés)
    if (requiredPermissions && requiredPermissions.length > 0) {
      const userPerms: string[] = user.permissions || [];

      // Wildcard administrateur ou super-administrateur
      if (userPerms.includes('*') || user.role === 'ADMIN' || user.role === 'SUPER_ADMIN') {
        return true;
      }

      // Au moins une permission requise doit être présente dans les droits effectifs
      const hasAny = requiredPermissions.some((perm) => userPerms.includes(perm));
      if (!hasAny) {
        await this.handleAccessDenial(request, user, `Permission requise : ${requiredPermissions.join(', ')}`);
        throw new ForbiddenException('Action non disponible');
      }
    }

    return true;
  }

  /**
   * Traitement discret des refus : journalisation silencieuse et alerte administrateur si répétitions.
   * Aucun détail technique ni nom de permission ne fuite vers l'utilisateur.
   */
  private async handleAccessDenial(request: any, user: any, reason: string): Promise<void> {
    const userId = user.id || 'anonyme';
    const now = Date.now();
    const windowMs = 10 * 60 * 1000; // 10 minutes

    // Mise à jour du compteur de tentatives refusées
    let entry = RolesGuard.failedAttempts.get(userId);
    if (!entry || now - entry.firstAttempt > windowMs) {
      entry = { count: 1, firstAttempt: now };
    } else {
      entry.count += 1;
    }
    RolesGuard.failedAttempts.set(userId, entry);

    // Journalisation inaltérable silencieuse
    const auditService = this.getAuditService();
    if (auditService) {
      try {
        await auditService.logAction({
          pharmacyId: user.pharmacyId,
          userId: user.id,
          userName: user.fullName || user.username,
          action: 'ACCES_INTERDIT_SILENCIEUX',
          entityName: 'ROUTE',
          entityId: request.originalUrl || request.url,
          newValues: {
            method: request.method,
            path: request.originalUrl || request.url,
            reason,
            attemptCount: entry.count,
          },
          ipAddress: request.ip || request.connection?.remoteAddress,
          userAgent: request.headers?.['user-agent'],
        });
      } catch {
        // Éviter de bloquer si l'audit est inaccessible
      }
    }

    // Alerte réservée à l'administrateur en cas de refus répétés (>= 3 tentatives en 10 minutes)
    if (entry.count >= 3) {
      const notifService = this.getNotificationsService();
      if (notifService) {
        try {
          await notifService.createNotification({
            pharmacyId: user.pharmacyId || '11111111-1111-1111-1111-111111111111',
            type: 'SYSTEME',
            title: 'Tentatives d\'accès non autorisées répétées',
            message: `Le compte ${user.fullName || user.username} (${user.role}) a effectué ${entry.count} tentatives d'accès à des fonctions non autorisées.`,
            severity: 'WARNING',
            targetRole: 'ADMIN',
            entityType: 'USER',
            entityId: user.id,
            metadata: {
              userId: user.id,
              username: user.username,
              attemptCount: entry.count,
              lastPath: request.originalUrl || request.url,
            },
          });
        } catch {
          // Ne pas bloquer la réponse
        }
      }
    }
  }
}
