import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthService } from '../auth.service';
import { IS_PUBLIC_KEY } from '../decorators/auth.decorators';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  private readonly jwtSecret: string;

  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    @Inject(forwardRef(() => AuthService))
    private readonly authService: AuthService,
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
    // 1. Si la route est marquée @Public(), pas besoin de JWT
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const authHeader = request.headers['authorization'];

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedException('Session utilisateur invalide.');
    }

    const token = authHeader.substring(7).trim();
    if (!token) {
      throw new UnauthorizedException('Session utilisateur invalide.');
    }

    let userId: string | null = null;

    // 2. Vérification cryptographique stricte du jeton JWT
    try {
      const payload = await this.jwtService.verifyAsync(token, {
        secret: this.jwtSecret,
      });
      userId = payload.sub || payload.id;
    } catch {
      throw new UnauthorizedException('Session utilisateur invalide.');
    }

    if (!userId) {
      throw new UnauthorizedException('Session utilisateur invalide.');
    }

    // 3. Rechargement de l'utilisateur en base de données pour vérifier l'état actif en temps réel
    const user = await this.prisma.users.findUnique({
      where: { id: userId },
      include: {
        roles: true,
      },
    });

    if (!user || !user.is_active) {
      throw new UnauthorizedException('Session utilisateur invalide.');
    }

    // Verrouillage de sécurité actif
    if (user.locked_until && user.locked_until > new Date()) {
      throw new UnauthorizedException('Compte temporairement verrouillé.');
    }

    // 4. Calcul des droits effectifs en temps réel (Rôle + Accès personnels)
    const effectivePermissions = await this.authService.getEffectivePermissions(user.id);

    request.user = {
      id: user.id,
      pharmacyId: user.pharmacy_id,
      username: user.username,
      fullName: user.full_name,
      role: user.roles.name,
      email: user.email,
      permissions: effectivePermissions,
      isActive: user.is_active,
    };

    return true;
  }
}
