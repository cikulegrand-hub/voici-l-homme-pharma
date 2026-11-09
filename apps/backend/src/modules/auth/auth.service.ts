import {
  Injectable,
  OnModuleInit,
  UnauthorizedException,
  BadRequestException,
  NotFoundException,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as argon2 from 'argon2';
import * as crypto from 'crypto';
import { UserProfile, RoleName, AuthSession } from '@vhp/shared';
import {
  LoginDto,
  CreateUserDto,
  UpdateUserDto,
  ResetPasswordDto,
  ChangeMyPasswordDto,
  ChangeMyPinDto,
} from './dto/auth.dto';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';

export interface PinAuthorizationResponse {
  valid: boolean;
  action: string;
  authorizationToken: string;
  expiresAt: string;
  supervisorName: string;
}

@Injectable()
export class AuthService implements OnModuleInit {
  // Gestion du débit (SEC-03) : compteur de requêtes de connexion par IP (max 10 par minute)
  private ipRateLimits = new Map<string, { count: number; firstAttempt: number }>();
  private readonly jwtSecret: string;
  private readonly jwtExpiresIn: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
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
    this.jwtExpiresIn =
      this.configService.get<string>('JWT_EXPIRES_IN') || '15m';
  }

  async onModuleInit() {
    await this.ensureDefaultAdminUser();
    await this.ensureRolePermissions();
  }

  private async ensureRolePermissions() {
    try {
      const allPermissions = [
        { code: 'pos.access', category: 'VENTES', description: 'Accéder à l’interface Point de Vente / Comptoir' },
        { code: 'vente.creer', category: 'VENTES', description: 'Effectuer une vente au comptoir' },
        { code: 'vente.consulter', category: 'VENTES', description: 'Consulter l’historique des ventes' },
        { code: 'vente.remise', category: 'VENTES', description: 'Appliquer une remise standard' },
        { code: 'vente.remise_plafond', category: 'VENTES', description: 'Appliquer une remise au-delà du plafond' },
        { code: 'vente.annuler', category: 'VENTES', description: 'Annuler une vente et émettre un avoir' },
        { code: 'vente.demande_annulation', category: 'VENTES', description: 'Transmettre une demande d’annulation de vente' },
        { code: 'ordonnance.creer', category: 'ORDONNANCES', description: 'Enregistrer une ordonnance médicale' },
        { code: 'ordonnance.consulter', category: 'ORDONNANCES', description: 'Consulter une ordonnance médicale' },
        { code: 'ordonnance.valider', category: 'ORDONNANCES', description: 'Valider la délivrance d’une ordonnance' },
        { code: 'client.consulter', category: 'CLIENTS', description: 'Consulter les fiches clients et encours de crédit' },
        { code: 'clients.consulter', category: 'CLIENTS', description: 'Consulter la liste complète des clients' },
        { code: 'client.creer', category: 'CLIENTS', description: 'Créer ou modifier une fiche client' },
        { code: 'client.credit', category: 'CLIENTS', description: 'Autoriser un dépassement de plafond de crédit client' },
        { code: 'client.paiement', category: 'CLIENTS', description: 'Enregistrer un règlement de créance client' },
        { code: 'caisse.ouvrir', category: 'FINANCE', description: 'Ouvrir une session de caisse' },
        { code: 'caisse.cloturer', category: 'FINANCE', description: 'Clôturer sa session de caisse avec arrêté d’écart' },
        { code: 'finances.consulter', category: 'FINANCE', description: 'Consulter les mouvements de caisse et dépenses' },
        { code: 'finances.mouvement', category: 'FINANCE', description: 'Enregistrer un apport ou un retrait de caisse' },
        { code: 'rapports.consulter', category: 'RAPPORTS', description: 'Consulter le tableau de bord et les rapports' },
        { code: 'rapports.dashboard', category: 'RAPPORTS', description: 'Consulter le tableau de bord RPT partiel' },
        { code: 'rapports.exporter', category: 'RAPPORTS', description: 'Exporter les rapports en CSV, Excel ou PDF' },
      ];

      for (const p of allPermissions) {
        await this.prisma.permissions.upsert({
          where: { code: p.code },
          create: { code: p.code, category: p.category, description: p.description },
          update: {},
        });
      }

      const cashierRole = await this.prisma.roles.findFirst({ where: { name: 'CAISSIER' } });
      if (cashierRole) {
        const cashierCodes = [
          'pos.access', 'vente.creer', 'vente.consulter', 'vente.remise', 'vente.demande_annulation',
          'ordonnance.creer', 'ordonnance.consulter', 'stock.consulter', 'catalogue.consulter',
          'client.consulter', 'clients.consulter', 'client.creer', 'client.paiement',
          'caisse.ouvrir', 'caisse.cloturer', 'finances.consulter', 'finances.mouvement',
          'rapports.dashboard',
        ];
        const perms = await this.prisma.permissions.findMany({ where: { code: { in: cashierCodes } } });
        for (const p of perms) {
          await this.prisma.role_permissions.upsert({
            where: {
              role_id_permission_id: {
                role_id: cashierRole.id,
                permission_id: p.id,
              },
            },
            create: {
              role_id: cashierRole.id,
              permission_id: p.id,
            },
            update: {},
          });
        }
      }

      const stockRole = await this.prisma.roles.findFirst({ where: { name: { in: ['STOCK', 'GESTIONNAIRE'] } } });
      if (stockRole) {
        const stockCodes = ['rapports.dashboard'];
        const perms = await this.prisma.permissions.findMany({ where: { code: { in: stockCodes } } });
        for (const p of perms) {
          await this.prisma.role_permissions.upsert({
            where: { role_id_permission_id: { role_id: stockRole.id, permission_id: p.id } },
            create: { role_id: stockRole.id, permission_id: p.id },
            update: {},
          });
        }
      }

      const pharmacistRole = await this.prisma.roles.findFirst({ where: { name: 'PHARMACIEN' } });
      if (pharmacistRole) {
        const pharmaCodes = [
          'pos.access', 'vente.creer', 'vente.consulter', 'vente.remise', 'vente.remise_plafond', 'vente.annuler',
          'ordonnance.creer', 'ordonnance.consulter', 'ordonnance.valider',
          'stock.consulter', 'stock.recevoir', 'stock.valider_ajustement', 'stock.inventaire',
          'achats.consulter', 'achats.creer', 'achats.valider',
          'catalogue.consulter', 'catalogue.creer', 'prix.modifier',
          'client.consulter', 'clients.consulter', 'client.creer', 'client.credit', 'client.paiement',
          'caisse.ouvrir', 'caisse.cloturer', 'taux.modifier', 'depense.creer', 'finances.consulter', 'finances.mouvement',
          'rapports.consulter', 'rapports.dashboard', 'rapports.exporter',
        ];
        const perms = await this.prisma.permissions.findMany({ where: { code: { in: pharmaCodes } } });
        for (const p of perms) {
          await this.prisma.role_permissions.upsert({
            where: {
              role_id_permission_id: {
                role_id: pharmacistRole.id,
                permission_id: p.id,
              },
            },
            create: {
              role_id: pharmacistRole.id,
              permission_id: p.id,
            },
            update: {},
          });
        }
      }

      const accountantRole = await this.prisma.roles.findFirst({ where: { name: 'COMPTABLE' } });
      if (accountantRole) {
        const accountantCodes = ['rapports.consulter', 'rapports.dashboard', 'rapports.exporter', 'finances.consulter'];
        const perms = await this.prisma.permissions.findMany({ where: { code: { in: accountantCodes } } });
        for (const p of perms) {
          await this.prisma.role_permissions.upsert({
            where: { role_id_permission_id: { role_id: accountantRole.id, permission_id: p.id } },
            create: { role_id: accountantRole.id, permission_id: p.id },
            update: {},
          });
        }
      }
    } catch {
      // Ignorer si la base n'est pas encore prête
    }
  }

  private async ensureDefaultAdminUser() {
    try {
      const userCount = await this.prisma.users.count();
      if (userCount === 0) {
        console.warn(
          '[SÉCURITÉ] Aucun utilisateur présent. Veuillez exécuter "node scripts/create-admin-account.js" pour initialiser le compte administrateur.',
        );
      }
    } catch {
      // Ignorer si la base n'est pas encore accessible au bootstrap
    }
  }

  /**
   * Contrôle de limitation de débit (SEC-03) : max 30 requêtes par minute par IP
   */
  private checkRateLimit(ip: string): void {
    const now = Date.now();
    const windowMs = 60 * 1000; // 1 minute
    const maxAttempts = 30;

    const entry = this.ipRateLimits.get(ip);
    if (!entry) {
      this.ipRateLimits.set(ip, { count: 1, firstAttempt: now });
      return;
    }

    if (now - entry.firstAttempt > windowMs) {
      this.ipRateLimits.set(ip, { count: 1, firstAttempt: now });
      return;
    }

    if (entry.count >= maxAttempts) {
      throw new HttpException(
        'Trop de tentatives de connexion depuis cette adresse IP. Veuillez patienter une minute avant de réessayer (SEC-03).',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    entry.count += 1;
  }

  /**
   * AUT-01 & AUT-02 : Connexion sécurisée avec verrouillage après 5 échecs consécutifs
   * AUT-07 : Historique des connexions tracé
   */
  async login(dto: LoginDto, ipAddress: string, userAgent?: string): Promise<AuthSession> {
    this.checkRateLimit(ipAddress);

    const usernameKey = dto.username.toLowerCase().trim();
    const user = await this.prisma.users.findUnique({
      where: { username: usernameKey },
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

    if (!user) {
      await this.auditService.logAction({
        action: 'LOGIN_ECHEC',
        entityName: 'USER',
        entityId: 'inconnu',
        newValues: { username: dto.username, reason: 'Identifiant inconnu' },
        ipAddress,
        userAgent,
      });
      throw new UnauthorizedException('Identifiants incorrects.');
    }

    if (!user.is_active) {
      await this.auditService.logAction({
        pharmacyId: user.pharmacy_id,
        userId: user.id,
        userName: user.full_name,
        action: 'LOGIN_ECHEC',
        entityName: 'USER',
        entityId: user.id,
        newValues: { username: dto.username, reason: 'Compte désactivé' },
        ipAddress,
        userAgent,
      });
      throw new UnauthorizedException('Ce compte a été désactivé par l’administration.');
    }

    // Contrôle du verrouillage temporaire (AUT-02)
    if (user.locked_until && user.locked_until > new Date()) {
      const minutesRemaining = Math.ceil((user.locked_until.getTime() - Date.now()) / 60000);
      throw new UnauthorizedException(
        `Compte temporairement verrouillé suite à 5 échecs consécutifs. Réessayez dans ${minutesRemaining} minute(s) (AUT-02).`,
      );
    }

    // Vérification mot de passe avec Argon2id (SEC-02, AUT-01)
    let isPasswordValid = false;
    try {
      if (user.password_hash.startsWith('$argon2')) {
        isPasswordValid = await argon2.verify(user.password_hash, dto.password);
      } else {
        // Fallback transparent si mot de passe en clair à migrer
        isPasswordValid = dto.password === user.password_hash;
        if (isPasswordValid) {
          const newHash = await argon2.hash(dto.password, { type: argon2.argon2id });
          await this.prisma.users.update({
            where: { id: user.id },
            data: { password_hash: newHash },
          });
        }
      }
    } catch {
      isPasswordValid = false;
    }

    if (!isPasswordValid) {
      const newAttempts = user.failed_login_attempts + 1;
      let lockedUntil: Date | null = null;

      if (newAttempts >= 5) {
        lockedUntil = new Date(Date.now() + 15 * 60 * 1000); // 15 min lock
      }

      await this.prisma.users.update({
        where: { id: user.id },
        data: {
          failed_login_attempts: newAttempts,
          locked_until: lockedUntil,
        },
      });


      if (newAttempts >= 5) {
        await this.auditService.logAction({
          pharmacyId: user.pharmacy_id,
          userId: user.id,
          userName: user.full_name,
          action: 'COMPTE_VERROUILLE',
          entityName: 'USER',
          entityId: user.id,
          newValues: { failedAttempts: newAttempts, lockedUntil },
          ipAddress,
          userAgent,
        });
        throw new UnauthorizedException(
          'Compte temporairement verrouillé pour 15 minutes suite à 5 tentatives infructueuses (AUT-02).',
        );
      }

      await this.auditService.logAction({
        pharmacyId: user.pharmacy_id,
        userId: user.id,
        userName: user.full_name,
        action: 'LOGIN_ECHEC',
        entityName: 'USER',
        entityId: user.id,
        oldValues: { failedAttempts: user.failed_login_attempts },
        newValues: { failedAttempts: newAttempts, reason: 'Mot de passe erroné' },
        ipAddress,
        userAgent,
      });

      throw new UnauthorizedException(
        `Mot de passe incorrect. Tentatives restantes avant verrouillage : ${5 - newAttempts}.`,
      );
    }

    // Réinitialisation du compteur d'échecs après succès
    await this.prisma.users.update({
      where: { id: user.id },
      data: {
        failed_login_attempts: 0,
        locked_until: null,
        last_login_at: new Date(),
      },
    });


    // Journalisation de la connexion réussie (AUD-01)
    await this.auditService.logAction({
      pharmacyId: user.pharmacy_id,
      userId: user.id,
      userName: user.full_name,
      action: 'LOGIN_SUCCES',
      entityName: 'USER',
      entityId: user.id,
      ipAddress,
      userAgent,
    });

    // Récupération des permissions du rôle
    const permissions: string[] = user.roles.role_permissions.map((rp) => rp.permissions.code);
    if (user.roles.name === 'ADMIN') {
      permissions.push('*');
    }

    // Récupération du taux de change actif
    const latestRate = await this.prisma.exchange_rates.findFirst({
      where: { pharmacy_id: user.pharmacy_id, base_currency: 'USD', target_currency: 'CDF', effective_date: { lte: new Date() } },
      orderBy: [{ effective_date: 'desc' }, { id: 'desc' }],
    });

    // Génération du token d'accès JWT cryptographique signé (HMAC-SHA256)
    const tokenPayload = {
      sub: user.id,
      username: user.username,
      role: user.roles.name,
      pharmacyId: user.pharmacy_id,
    };

    const token = await this.jwtService.signAsync(tokenPayload, {
      secret: this.jwtSecret,
      expiresIn: this.jwtExpiresIn as any,
    });

    // Génération d'un Refresh Token aléatoire cryptographiquement fort (AUT-03)
    const rawRefreshToken = `vhp_rf_${crypto.randomBytes(32).toString('hex')}`;
    const tokenHash = crypto.createHash('sha256').update(rawRefreshToken).digest('hex');
    const refreshExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 jours

    await this.prisma.refresh_tokens.create({
      data: {
        user_id: user.id,
        token_hash: tokenHash,
        expires_at: refreshExpiresAt,
        is_revoked: false,
      },
    });

    return {
      token,
      refreshToken: rawRefreshToken,
      user: {
        id: user.id,
        pharmacyId: user.pharmacy_id,
        username: user.username,
        fullName: user.full_name,
        role: user.roles.name as RoleName,
        email: user.email ?? undefined,
        permissions,
        isActive: user.is_active,
      },
      activeRate: latestRate
        ? {
            id: latestRate.id,
            pharmacyId: user.pharmacy_id,
            baseCurrency: latestRate.base_currency as any,
            targetCurrency: latestRate.target_currency as any,
            rate: Number(latestRate.rate),
            effectiveDate: latestRate.effective_date.toISOString(),
          }
        : undefined,
    };
  }

  // AUT-03 : Renouvellement de jeton court (Refresh token) avec rotation et contrôle de révocation
  async refreshToken(refreshTokenString: string): Promise<{ token: string; refreshToken: string }> {
    if (!refreshTokenString || typeof refreshTokenString !== 'string') {
      throw new UnauthorizedException('Votre session a expiré. Veuillez vous reconnecter.');
    }

    const tokenHash = crypto.createHash('sha256').update(refreshTokenString).digest('hex');
    const foundToken = await this.prisma.refresh_tokens.findUnique({
      where: { token_hash: tokenHash },
      include: {
        users: {
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
        },
      },
    });

    if (!foundToken || foundToken.is_revoked || foundToken.expires_at < new Date()) {
      throw new UnauthorizedException('Votre session a expiré. Veuillez vous reconnecter.');
    }

    // Révocation de l'ancien jeton de rafraîchissement (Principe de rotation cryptographique)
    await this.prisma.refresh_tokens.update({
      where: { id: foundToken.id },
      data: { is_revoked: true },
    });

    const foundUser: any = foundToken.users;

    if (!foundUser || !foundUser.is_active) {
      throw new UnauthorizedException('Utilisateur inactif ou introuvable.');
    }

    const tokenPayload = {
      sub: foundUser.id,
      username: foundUser.username,
      role: foundUser.roles.name,
      pharmacyId: foundUser.pharmacy_id,
    };

    const newAccessToken = await this.jwtService.signAsync(tokenPayload, {
      secret: this.jwtSecret,
      expiresIn: this.jwtExpiresIn as any,
    });

    const newRefreshToken = `vhp_rf_${crypto.randomBytes(32).toString('hex')}`;
    const newHash = crypto.createHash('sha256').update(newRefreshToken).digest('hex');
    await this.prisma.refresh_tokens.create({
      data: {
        user_id: foundUser.id,
        token_hash: newHash,
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        is_revoked: false,
      },
    });

    return {
      token: newAccessToken,
      refreshToken: newRefreshToken,
    };
  }

  // Endpoint GET /api/v1/auth/me requis par le socle frontend
  async getMe(userId: string): Promise<{ user: UserProfile; activeRate: any }> {
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
      throw new UnauthorizedException('Session utilisateur invalide.');
    }

    const permissions: string[] = user.roles.role_permissions.map((rp) => rp.permissions.code);
    if (user.roles.name === 'ADMIN') {
      permissions.push('*');
    }

    const latestRate = await this.prisma.exchange_rates.findFirst({
      where: { pharmacy_id: user.pharmacy_id, base_currency: 'USD', target_currency: 'CDF', effective_date: { lte: new Date() } },
      orderBy: [{ effective_date: 'desc' }, { id: 'desc' }],
    });

    return {
      user: {
        id: user.id,
        pharmacyId: user.pharmacy_id,
        username: user.username,
        fullName: user.full_name,
        role: user.roles.name as RoleName,
        email: user.email ?? undefined,
        permissions,
        isActive: user.is_active,
      },
      activeRate: latestRate
        ? {
            id: latestRate.id,
            pharmacyId: user.pharmacy_id,
            baseCurrency: latestRate.base_currency as any,
            targetCurrency: latestRate.target_currency as any,
            rate: Number(latestRate.rate),
            effectiveDate: latestRate.effective_date.toISOString(),
          }
        : undefined,
    };
  }

  // Liste de tous les utilisateurs (pour l'administration)
  async getAllUsers(): Promise<UserProfile[]> {
    const users = await this.prisma.users.findMany({
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
      orderBy: { created_at: 'asc' },
    });

    return users.map((u) => {
      const permissions: string[] = u.roles.role_permissions.map((rp) => rp.permissions.code);
      if (u.roles.name === 'ADMIN') {
        permissions.push('*');
      }
      return {
        id: u.id,
        pharmacyId: u.pharmacy_id,
        username: u.username,
        fullName: u.full_name,
        role: u.roles.name as RoleName,
        email: u.email ?? undefined,
        permissions,
        isActive: u.is_active,
      };
    });
  }

  // Détail d'un utilisateur par son ID
  async getUserById(id: string): Promise<UserProfile> {
    const user = await this.prisma.users.findUnique({
      where: { id },
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

    if (!user) {
      throw new NotFoundException(`Utilisateur avec l'identifiant ${id} introuvable.`);
    }

    const permissions: string[] = user.roles.role_permissions.map((rp) => rp.permissions.code);
    if (user.roles.name === 'ADMIN') {
      permissions.push('*');
    }

    return {
      id: user.id,
      pharmacyId: user.pharmacy_id,
      username: user.username,
      fullName: user.full_name,
      role: user.roles.name as RoleName,
      email: user.email ?? undefined,
      permissions,
      isActive: user.is_active,
    };
  }

  // AUT-04 : Création d'un utilisateur avec rôle prédéfini
  async createUser(dto: CreateUserDto, pharmacyId: string, authorId?: string): Promise<UserProfile> {
    const existing = await this.prisma.users.findUnique({
      where: { username: dto.username.toLowerCase().trim() },
    });
    if (existing) {
      throw new BadRequestException('Un utilisateur avec cet identifiant existe déjà.');
    }

    const role = await this.prisma.roles.findFirst({
      where: { name: dto.role },
      include: {
        role_permissions: {
          include: {
            permissions: true,
          },
        },
      },
    });

    if (!role) {
      throw new BadRequestException(`Rôle '${dto.role}' inexistant.`);
    }

    const hashedPassword = await argon2.hash(dto.password, { type: argon2.argon2id });
    const hashedPin = dto.pinCode ? await argon2.hash(dto.pinCode, { type: argon2.argon2id }) : null;

    const created = await this.prisma.users.create({
      data: {
        pharmacy_id: pharmacyId,
        role_id: role.id,
        username: dto.username.toLowerCase().trim(),
        full_name: dto.fullName,
        email: dto.email,
        password_hash: hashedPassword,
        pin_code_hash: hashedPin,
        failed_login_attempts: 0,
        is_active: true,
      },
    });

    await this.auditService.logAction({
      userId: authorId || 'admin-authorizer',
      userName: 'Administrateur',
      action: 'UTILISATEUR_CREE',
      entityName: 'USER',
      entityId: created.id,
      newValues: { username: created.username, role: dto.role, fullName: created.full_name },
    });

    const permissions: string[] = role.role_permissions.map((rp) => rp.permissions.code);
    if (role.name === 'ADMIN') {
      permissions.push('*');
    }

    return {
      id: created.id,
      pharmacyId: created.pharmacy_id,
      username: created.username,
      fullName: created.full_name,
      email: created.email ?? undefined,
      role: dto.role,
      permissions,
      isActive: created.is_active,
    };
  }

  // Modification d'un utilisateur par un admin
  async updateUser(id: string, dto: UpdateUserDto, authorId?: string): Promise<UserProfile> {
    const user = await this.prisma.users.findUnique({ where: { id }, include: { roles: true } });
    if (!user) throw new NotFoundException('Utilisateur introuvable.');

    const oldValues = {
      fullName: user.full_name,
      email: user.email,
      role: user.roles?.name,
      isActive: user.is_active,
    };

    const updateData: any = {};
    if (dto.fullName) updateData.full_name = dto.fullName;
    if (dto.email !== undefined) updateData.email = dto.email;

    if (dto.role) {
      const role = await this.prisma.roles.findFirst({ where: { name: dto.role } });
      if (!role) throw new BadRequestException(`Rôle '${dto.role}' inexistant.`);
      updateData.role_id = role.id;
    }

    if (dto.pinCode) {
      updateData.pin_code_hash = await argon2.hash(dto.pinCode, { type: argon2.argon2id });
    }

    await this.prisma.users.update({
      where: { id },
      data: updateData,
    });

    await this.auditService.logAction({
      userId: authorId || 'admin-authorizer',
      userName: 'Administrateur',
      action: 'UTILISATEUR_MODIFIE',
      entityName: 'USER',
      entityId: id,
      oldValues,
      newValues: updateData,
    });

    return this.getUserById(id);
  }

  // AUT-04 : Désactivation (jamais de suppression)
  async deactivateUser(username: string, authorId?: string): Promise<void> {
    const user = await this.prisma.users.findUnique({
      where: { username: username.toLowerCase().trim() },
      include: { roles: true },
    });
    if (!user) throw new NotFoundException('Utilisateur introuvable.');
    if (user.roles.name === 'ADMIN' && user.username === 'admin') {
      throw new BadRequestException('Impossible de désactiver le compte administrateur racine.');
    }

    await this.prisma.users.update({
      where: { id: user.id },
      data: { is_active: false },
    });

    await this.auditService.logAction({
      userId: authorId || 'admin-authorizer',
      userName: 'Administrateur',
      action: 'UTILISATEUR_DESACTIVE',
      entityName: 'USER',
      entityId: user.id,
      oldValues: { username: user.username, isActive: true },
      newValues: { username: user.username, isActive: false },
    });
  }

  // AUT-04 : Réactivation d'un utilisateur
  async activateUser(username: string, authorId?: string): Promise<void> {
    const user = await this.prisma.users.findUnique({
      where: { username: username.toLowerCase().trim() },
    });
    if (!user) throw new NotFoundException('Utilisateur introuvable.');

    await this.prisma.users.update({
      where: { id: user.id },
      data: {
        is_active: true,
        failed_login_attempts: 0,
        locked_until: null,
      },
    });

    await this.auditService.logAction({
      userId: authorId || 'admin-authorizer',
      userName: 'Administrateur',
      action: 'UTILISATEUR_ACTIVE',
      entityName: 'USER',
      entityId: user.id,
      oldValues: { username: user.username, isActive: false },
      newValues: { username: user.username, isActive: true },
    });
  }

  // AUT-06 : Réinitialisation du mot de passe par un administrateur
  async resetPasswordByAdmin(userId: string, newPassword: string, adminId: string): Promise<void> {
    const targetUser = await this.prisma.users.findUnique({ where: { id: userId } });
    if (!targetUser) throw new NotFoundException('Utilisateur introuvable.');

    const hashedPassword = await argon2.hash(newPassword, { type: argon2.argon2id });

    await this.prisma.users.update({
      where: { id: userId },
      data: {
        password_hash: hashedPassword,
        failed_login_attempts: 0,
        locked_until: null,
      },
    });

    await this.auditService.logAction({
      userId: adminId,
      userName: 'Administrateur',
      action: 'REINITIALISATION_MDP_ADMIN',
      entityName: 'USER',
      entityId: targetUser.id,
      newValues: { resetForUser: targetUser.username },
    });
  }

  // Page Mon Profil : changer son propre mot de passe
  async changeMyPassword(userId: string, dto: ChangeMyPasswordDto): Promise<void> {
    const user = await this.prisma.users.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('Utilisateur introuvable.');

    const isMatch = await argon2.verify(user.password_hash, dto.currentPassword);
    if (!isMatch) {
      throw new BadRequestException('Le mot de passe actuel saisi est incorrect.');
    }

    const newHash = await argon2.hash(dto.newPassword, { type: argon2.argon2id });
    await this.prisma.users.update({
      where: { id: userId },
      data: { password_hash: newHash },
    });

    await this.auditService.logAction({
      userId,
      userName: user.full_name,
      action: 'MODIFICATION_MOT_DE_PASSE_PROFIL',
      entityName: 'USER',
      entityId: userId,
    });
  }

  // Page Mon Profil : changer son code PIN
  async changeMyPin(userId: string, dto: ChangeMyPinDto): Promise<void> {
    const user = await this.prisma.users.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('Utilisateur introuvable.');

    if (user.pin_code_hash && dto.currentPin) {
      let isPinValid = false;
      try {
        if (user.pin_code_hash.startsWith('$argon2')) {
          isPinValid = await argon2.verify(user.pin_code_hash, dto.currentPin);
        } else {
          isPinValid = user.pin_code_hash === dto.currentPin;
        }
      } catch {
        isPinValid = false;
      }
      if (!isPinValid) {
        throw new BadRequestException('Le code PIN actuel saisi est incorrect.');
      }
    }

    const hashedPin = await argon2.hash(dto.newPin, { type: argon2.argon2id });
    await this.prisma.users.update({
      where: { id: userId },
      data: { pin_code_hash: hashedPin },
    });

    await this.auditService.logAction({
      userId,
      userName: user.full_name,
      action: 'MODIFICATION_PIN_PROFIL',
      entityName: 'USER',
      entityId: userId,
    });
  }

  // AUT-08 : Vérification PIN superviseur renvoyant une autorisation à courte durée (5 min)
  async verifySupervisorPin(pin: string, action: string = 'ACTION_SENSIBLE'): Promise<PinAuthorizationResponse> {
    const supervisors = await this.prisma.users.findMany({
      where: {
        is_active: true,
        roles: {
          name: {
            in: ['ADMIN', 'PHARMACIEN'],
          },
        },
      },
    });

    let authorizedSupervisor: any = null;

    for (const supervisor of supervisors) {
      if (!supervisor.pin_code_hash) continue;
      let isValid = false;
      try {
        if (supervisor.pin_code_hash.startsWith('$argon2')) {
          isValid = await argon2.verify(supervisor.pin_code_hash, pin);
        } else {
          isValid = supervisor.pin_code_hash === pin;
          if (isValid) {
            const newHash = await argon2.hash(pin, { type: argon2.argon2id });
            await this.prisma.users.update({
              where: { id: supervisor.id },
              data: { pin_code_hash: newHash },
            });
          }
        }
      } catch {
        isValid = false;
      }
      if (isValid) {
        authorizedSupervisor = supervisor;
        break;
      }
    }

    if (!authorizedSupervisor) {
      await this.auditService.logAction({
        action: 'PIN_SUPERVISEUR_ECHEC',
        entityName: 'SUPERVISION',
        entityId: action,
        newValues: { action, reason: 'Tentative avec code PIN incorrect' },
      });
      throw new UnauthorizedException('Code PIN de supervision incorrect ou non autorisé.');
    }

    // Autorisation de 5 minutes
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();
    const authorizationToken = `pin_auth_${crypto.randomUUID()}_${Date.now()}`;

    await this.auditService.logAction({
      userId: authorizedSupervisor.id,
      userName: authorizedSupervisor.full_name,
      action: 'AUTORISATION_PIN_ACCORDEE',
      entityName: 'SUPERVISION',
      entityId: action,
      newValues: { action, supervisor: authorizedSupervisor.username, expiresAt },
    });

    return {
      valid: true,
      action,
      authorizationToken,
      expiresAt,
      supervisorName: authorizedSupervisor.full_name,
    };
  }

  async logout(userId?: string, userName?: string): Promise<void> {
    if (userId) {
      await this.prisma.refresh_tokens.updateMany({
        where: { user_id: userId, is_revoked: false },
        data: { is_revoked: true },
      }).catch(() => {});

      await this.auditService.logAction({
        userId,
        userName: userName || 'Utilisateur',
        action: 'LOGOUT',
        entityName: 'USER',
        entityId: userId,
      });
    }
  }

}
