import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  // Durée de validité d'un jeton d'accès court : 15 minutes (900 000 ms) selon AUT-03
  private readonly TOKEN_LIFETIME_MS = 15 * 60 * 1000;
  private readonly jwtSecret: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {
    const configuredSecret =
      this.configService.get<string>('JWT_SECRET') || process.env.JWT_SECRET;

    if (!configuredSecret && process.env.NODE_ENV === 'production') {
      throw new Error(
        'CRITIQUE SÉCURITÉ : La variable JWT_SECRET est obligatoire en production (VHP-SEC-01).',
      );
    }

    this.jwtSecret =
      configuredSecret || 'vhp_super_secret_jwt_key_kinshasa_2026_officine';
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const authHeader = request.headers['authorization'];

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedException('Votre session est invalide. Veuillez vous reconnecter.');
    }

    const token = authHeader.substring(7).trim();
    if (!token) {
      throw new UnauthorizedException('Votre session est invalide. Veuillez vous reconnecter.');
    }

    let userId: string | null = null;

    // 1. Vérification cryptographique stricte du jeton JWT (HMAC-SHA256)
    try {
      const payload = await this.jwtService.verifyAsync(token, {
        secret: this.jwtSecret,
      });
      userId = payload.sub || payload.id;
    } catch (jwtErr: any) {
      if (jwtErr?.name === 'TokenExpiredError') {
        throw new UnauthorizedException('Votre session a expiré. Veuillez vous reconnecter.');
      }
      throw new UnauthorizedException('Votre session est invalide ou a expiré. Veuillez vous reconnecter.');
    }

    if (!userId) {
      throw new UnauthorizedException('Votre session est invalide. Veuillez vous reconnecter.');
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
      throw new UnauthorizedException('Votre compte est temporairement verrouillé. Veuillez réessayer plus tard.');
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
}


