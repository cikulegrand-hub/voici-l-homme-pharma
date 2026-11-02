import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  // Durée de validité d'un jeton d'accès court : 15 minutes (900 000 ms) selon AUT-03
  private readonly TOKEN_LIFETIME_MS = 15 * 60 * 1000;

  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const authHeader = request.headers['authorization'];

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedException('Jeton d’authentification manquant ou invalide.');
    }

    const token = authHeader.substring(7).trim();
    if (!token) {
      throw new UnauthorizedException('Jeton d’authentification vide.');
    }

    // Support des jetons au format VHP : jwt_access_{userId}_{timestamp}
    if (token.startsWith('jwt_access_')) {
      const parts = token.split('_');
      if (parts.length < 4) {
        throw new UnauthorizedException('Format de jeton invalide.');
      }

      const userId = parts[2];
      const timestamp = parseInt(parts[3], 10);

      if (isNaN(timestamp)) {
        throw new UnauthorizedException('Horodatage du jeton corrompu.');
      }

      // Contrôle d'expiration du jeton court (AUT-03)
      if (Date.now() - timestamp > this.TOKEN_LIFETIME_MS) {
        throw new UnauthorizedException('Jeton d’accès court expiré. Veuillez le renouveler (AUT-03).');
      }

      const user = await this.prisma.users.findUnique({
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

      if (!user || !user.is_active) {
        throw new UnauthorizedException('Utilisateur inactif ou introuvable.');
      }

      // Verrouillage de sécurité actif
      if (user.locked_until && user.locked_until > new Date()) {
        throw new UnauthorizedException('Compte utilisateur temporairement verrouillé (AUT-02).');
      }

      const permissions: string[] = user.roles.role_permissions.map((rp) => rp.permissions.code);
      if (user.roles.name === 'ADMIN') {
        permissions.push('*');
      }

      request.user = {
        id: user.id,
        pharmacyId: user.pharmacy_id,
        username: user.username,
        fullName: user.full_name,
        role: user.roles.name,
        email: user.email,
        permissions,
        isActive: user.is_active,
      };

      return true;
    }

    throw new UnauthorizedException('Type de jeton non pris en charge.');
  }
}

