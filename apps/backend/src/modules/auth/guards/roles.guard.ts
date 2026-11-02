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
    let user = request.user;

    // Si l'utilisateur n'est pas encore attaché, extraire depuis le Bearer token
    if (!user) {
      const authHeader = request.headers['authorization'];
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        throw new UnauthorizedException('Authentification requise pour cette ressource.');
      }

      const token = authHeader.substring(7).trim();
      if (!token) {
        throw new UnauthorizedException('Jeton d’authentification vide.');
      }

      if (token.startsWith('jwt_access_')) {
        const parts = token.split('_');
        if (parts.length < 4) {
          throw new UnauthorizedException('Format de jeton invalide.');
        }

        const userId = parts[2];
        const timestamp = parseInt(parts[3], 10);

        if (isNaN(timestamp) || Date.now() - timestamp > this.TOKEN_LIFETIME_MS) {
          throw new UnauthorizedException('Jeton de session court expiré (AUT-03).');
        }

        const dbUser = await this.prisma.users.findUnique({
          where: { id: userId },
          include: {
            roles: {
              include: {
                role_permissions: {
                  include: {
                    permissions: true,
                  },
                },
              },
            },
          },
        });

        if (!dbUser || !dbUser.is_active) {
          throw new UnauthorizedException('Utilisateur inactif ou introuvable.');
        }

        const permissions: string[] = dbUser.roles.role_permissions.map((rp) => rp.permissions.code);
        if (dbUser.roles.name === 'ADMIN') {
          permissions.push('*');
        }

        user = {
          id: dbUser.id,
          pharmacyId: dbUser.pharmacy_id,
          username: dbUser.username,
          fullName: dbUser.full_name,
          role: dbUser.roles.name as RoleName,
          email: dbUser.email,
          permissions,
          isActive: dbUser.is_active,
        };

        request.user = user;
      } else {
        throw new UnauthorizedException('Jeton d’authentification non reconnu.');
      }
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
