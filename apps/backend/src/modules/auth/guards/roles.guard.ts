import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY, PERMISSIONS_KEY } from '../decorators/auth.decorators';
import { RoleName } from '@vhp/shared';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class RolesGuard implements CanActivate {
  private readonly TOKEN_LIFETIME_MS = 15 * 60 * 1000; // 15 min (AUT-03)

  constructor(
    private reflector: Reflector,
    private prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredRoles = this.reflector.getAllAndOverride<RoleName[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    const requiredPermissions = this.reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    // Si aucune restriction de rôle ni de permission, accès autorisé
    if (!requiredRoles && !requiredPermissions) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user) {
      throw new UnauthorizedException('Authentification requise pour cette ressource.');
    }

    // Administrateur racine : plein pouvoir absolu (wildcard)
    if (user.role === 'ADMIN' || (user.permissions && user.permissions.includes('*'))) {
      return true;
    }

    // Vérification du rôle requis
    if (requiredRoles && requiredRoles.length > 0 && !requiredRoles.includes(user.role)) {
      throw new ForbiddenException(
        `Accès refusé : votre rôle (${user.role}) ne dispose pas des droits requis (rôles autorisés: ${requiredRoles.join(', ')}).`,
      );
    }

    // Vérification des permissions fines requises (AUT-05, REC-07)
    if (requiredPermissions && requiredPermissions.length > 0) {
      const userPermissions: string[] = user.permissions || [];
      const hasPermission = requiredPermissions.some(
        (perm) => userPermissions.includes(perm) || userPermissions.includes('*'),
      );
      if (!hasPermission) {
        throw new ForbiddenException(
          `Accès refusé : permission manquante (${requiredPermissions.join(', ')}).`,
        );
      }
    }

    return true;
  }
}
