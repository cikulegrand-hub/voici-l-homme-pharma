import {
  Injectable,
  OnModuleInit,
  UnauthorizedException,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as argon2 from 'argon2';
import * as crypto from 'crypto';
import {
  UserProfile,
  RoleName,
  AuthSession,
  AllowedModuleInfo,
  UserSpaceResponse,
  UserPersonalAccessItem,
  UpdateUserAccessDto,
  RoleItem,
  CreateRoleDto,
  UpdateRoleDto,
} from '@vhp/shared';
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
import {
  PERMISSIONS_CATALOG,
  ROLE_PERMISSIONS,
  PERMISSION_CATEGORY_LABELS,
} from '../../common/permissions.catalog';

export interface PinAuthorizationResponse {
  valid: boolean;
  action: string;
  authorizationToken: string;
  expiresAt: string;
  supervisorName: string;
}

@Injectable()
export class AuthService implements OnModuleInit {
  // Gestion du débit (SEC-03) : compteur de requêtes de connexion par IP (max 30 par minute)
  private ipRateLimits = new Map<string, { count: number; firstAttempt: number }>();
  // Cache court des permissions effectives par utilisateur (60 secondes, invalidé à toute modification)
  private permissionsCache = new Map<string, { perms: string[]; expiresAt: number }>();

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

  /**
   * Invalidation immédiate du cache de permissions pour forcer le recalcul
   * dès modification de rôle, d'accès personnel ou de statut utilisateur.
   */
  invalidatePermissions(userId?: string): void {
    if (userId) {
      this.permissionsCache.delete(userId);
    } else {
      this.permissionsCache.clear();
    }
  }

  /**
   * Initialisation et synchronisation du catalogue centralisé des permissions en base de données.
   */
  private async ensureRolePermissions() {
    try {
      // 1. Synchronisation de toutes les permissions du catalogue unique
      for (const p of PERMISSIONS_CATALOG) {
        await this.prisma.permissions.upsert({
          where: { code: p.code },
          create: { code: p.code, category: p.category, description: p.label },
          update: { category: p.category, description: p.label },
        });
      }

      // 2. Synchronisation de la matrice par défaut rôle × permissions
      for (const [roleName, codes] of Object.entries(ROLE_PERMISSIONS)) {
        if (roleName === 'ADMIN') continue;
        const role = await this.prisma.roles.findFirst({ where: { name: roleName } });
        if (!role) continue;
        const perms = await this.prisma.permissions.findMany({ where: { code: { in: codes } } });
        for (const p of perms) {
          await this.prisma.role_permissions.upsert({
            where: {
              role_id_permission_id: {
                role_id: role.id,
                permission_id: p.id,
              },
            },
            create: {
              role_id: role.id,
              permission_id: p.id,
            },
            update: {},
          });
        }
      }
    } catch {
      // Ignorer si la base n'est pas encore prête au bootstrap
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
   * Calcul des droits effectifs d'un utilisateur :
   * droits effectifs = droits du rôle, ajustés par les accès personnels attribués à l'utilisateur.
   * Règle de priorité : en cas de conflit, le refus l'emporte toujours (deny > grant).
   */
  async getEffectivePermissions(userId: string): Promise<string[]> {
    const cached = this.permissionsCache.get(userId);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.perms;
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
      return [];
    }

    // Super-Administrateur ou Administrateur : wildcard '*'
    if (user.roles.name === 'SUPER_ADMIN' || user.roles.name === 'ADMIN') {
      const adminPerms = ['*'];
      this.permissionsCache.set(userId, { perms: adminPerms, expiresAt: Date.now() + 60000 });
      return adminPerms;
    }

    // 1. Droits de base conférés par le rôle
    const dbRoleCodes = user.roles.role_permissions.map((rp) => rp.permissions.code);
    const catalogRoleCodes = ROLE_PERMISSIONS[user.roles.name] || [];
    const baseCodes = new Set<string>([...dbRoleCodes, ...catalogRoleCodes]);

    // 2. Accès personnels (overrides)
    let overrides: any[] = [];
    try {
      overrides = await (this.prisma as any).user_permissions.findMany({
        where: { user_id: userId },
        include: { permissions: true },
      });
    } catch {
      // Table pas encore créée (fallback gracieux)
    }

    const effective = new Set<string>(baseCodes);
    for (const ov of overrides) {
      const code = ov.permissions?.code;
      if (!code) continue;

      if (ov.granted === false) {
        // Retrait d'un droit : le refus l'emporte toujours
        effective.delete(code);
      } else if (ov.granted === true) {
        // Ajout exceptionnel d'un droit
        effective.add(code);
      }
    }

    const permsList = Array.from(effective);
    this.permissionsCache.set(userId, { perms: permsList, expiresAt: Date.now() + 60000 });
    return permsList;
  }

  /**
   * Calcule la liste des modules autorisés à partir des permissions effectives.
   * Tout module non autorisé est complètement omis.
   */
  calculateAllowedModules(permissions: string[]): AllowedModuleInfo[] {
    const isSuperAdmin = permissions.includes('*');
    const has = (p: string | string[]) => {
      if (isSuperAdmin) return true;
      const arr = Array.isArray(p) ? p : [p];
      return arr.some((perm) => permissions.includes(perm));
    };

    const modules: { id: string; label: string; route: string; icon: string; perm?: string | string[] }[] = [
      { id: 'dashboard', label: 'Tableau de bord', route: '/dashboard', icon: 'dashboard', perm: 'rapports.dashboard' },
      { id: 'pos', label: 'Point de Vente', route: '/pos', icon: 'point_of_sale', perm: ['pos.access', 'vente.creer'] },
      { id: 'sales', label: 'Ventes & Avoirs', route: '/sales', icon: 'receipt_long', perm: ['vente.consulter', 'vente.creer'] },
      { id: 'catalog', label: 'Catalogue Produits', route: '/catalog', icon: 'medication', perm: 'catalogue.consulter' },
      { id: 'stock', label: 'Gestion des Stocks', route: '/stock', icon: 'inventory_2', perm: 'stock.consulter' },
      { id: 'reception', label: 'Réceptions Fournisseurs', route: '/reception', icon: 'input', perm: 'stock.recevoir' },
      { id: 'customers', label: 'Clients & Conventions', route: '/customers', icon: 'groups', perm: ['client.consulter', 'clients.consulter'] },
      { id: 'suppliers', label: 'Commandes Fournisseurs', route: '/suppliers', icon: 'local_shipping', perm: ['achats.consulter', 'stock.consulter'] },
      { id: 'cash', label: 'Caisse & Mouvements', route: '/cash', icon: 'account_balance_wallet', perm: ['caisse.ouvrir', 'caisse.cloturer', 'caisse.consulter', 'finances.consulter'] },
      { id: 'reports', label: 'Rapports & Statistiques', route: '/reports', icon: 'assessment', perm: ['rapports.dashboard', 'rapports.consulter', 'rapports.financiers'] },
      { id: 'audit', label: 'Journal d\'audit', route: '/audit', icon: 'history', perm: 'audit.consulter' },
      { id: 'users', label: 'Utilisateurs & Droits', route: '/users', icon: 'admin.utilisateurs', perm: 'admin.utilisateurs' },
      { id: 'roles', label: 'Gestion des Rôles', route: '/roles', icon: 'shield', perm: 'admin.roles' },
      { id: 'settings', label: 'Paramètres', route: '/settings', icon: 'settings', perm: 'parametres.modifier' },
    ];

    return modules
      .filter((m) => !m.perm || has(m.perm))
      .map(({ id, label, route, icon }) => ({ id, label, route, icon }));
  }

  /**
   * Consultation complète des accès d'un utilisateur pour l'écran d'administration.
   */
  async getUserPermissionsOverview(userId: string): Promise<{
    user: { id: string; username: string; fullName: string; role: RoleName; isActive: boolean };
    permissions: UserPersonalAccessItem[];
  }> {
    const user = await this.prisma.users.findUnique({
      where: { id: userId },
      include: { roles: true },
    });
    if (!user) throw new NotFoundException('Utilisateur introuvable.');

    const roleName = user.roles.name as RoleName;
    const isSuperAdmin = roleName === 'SUPER_ADMIN' || roleName === 'ADMIN';
    const roleDefaultCodes = new Set<string>(ROLE_PERMISSIONS[roleName] || []);

    let overrides: any[] = [];
    try {
      overrides = await (this.prisma as any).user_permissions.findMany({
        where: { user_id: userId },
        include: { permissions: true },
      });
    } catch {
      // Fallback
    }

    const overrideMap = new Map<string, any>();
    for (const ov of overrides) {
      if (ov.permissions?.code) {
        overrideMap.set(ov.permissions.code, ov);
      }
    }

    const items: UserPersonalAccessItem[] = PERMISSIONS_CATALOG.map((p) => {
      const fromRole = isSuperAdmin || roleDefaultCodes.has(p.code);
      const ov = overrideMap.get(p.code);
      const isOverridden = !!ov;
      let effectiveGranted = fromRole;
      if (isOverridden) {
        effectiveGranted = ov.granted;
      }
      return {
        code: p.code,
        label: p.label,
        category: p.category,
        fromRole,
        isOverridden,
        effectiveGranted,
        reason: ov?.reason ?? undefined,
      };
    });

    return {
      user: {
        id: user.id,
        username: user.username,
        fullName: user.full_name,
        role: roleName,
        isActive: user.is_active,
      },
      permissions: items,
    };
  }

  /**
   * Modification des accès personnels d'un utilisateur par un administrateur.
   * Garde-fous stricts :
   * 1. Impossible pour un administrateur de se retirer ses propres droits d'administration.
   * 2. Il doit toujours rester au moins un administrateur actif.
   * 3. Toute modification est journalisée dans l'audit inaltérable.
   */
  async updateUserPermissions(
    targetUserId: string,
    dto: UpdateUserAccessDto,
    authorId: string,
  ): Promise<any> {
    const targetUser = await this.prisma.users.findUnique({
      where: { id: targetUserId },
      include: { roles: true },
    });
    if (!targetUser) throw new NotFoundException('Utilisateur introuvable.');

    // Garde-fou 0 (hiérarchie SUPER_ADMIN) : seul un SUPER_ADMIN peut modifier les accès d'un autre SUPER_ADMIN
    if (targetUser.roles.name === 'SUPER_ADMIN') {
      const author = await this.prisma.users.findUnique({
        where: { id: authorId },
        include: { roles: true },
      });
      if (!author || author.roles.name !== 'SUPER_ADMIN') {
        throw new ForbiddenException('Seul un Super-Administrateur peut modifier les accès d\'un autre Super-Administrateur.');
      }
    }

    // Garde-fou 1 : un administrateur ne peut pas se retirer ses propres droits d'administration
    if (authorId === targetUserId && (targetUser.roles.name === 'ADMIN' || targetUser.roles.name === 'SUPER_ADMIN')) {
      const selfAdminDenials = dto.overrides.filter(
        (o) => !o.granted && (o.permissionCode === 'admin.utilisateurs' || o.permissionCode === 'parametres.modifier' || o.permissionCode === '*'),
      );
      if (selfAdminDenials.length > 0) {
        throw new BadRequestException('Un administrateur ne peut pas se retirer ses propres droits d’administration.');
      }
    }

    // Garde-fou 2 : il doit toujours rester au moins un administrateur actif avec tous les droits
    if (targetUser.roles.name === 'ADMIN') {
      const activeAdminCount = await this.prisma.users.count({
        where: {
          is_active: true,
          roles: { name: 'ADMIN' },
        },
      });
      const hasDenials = dto.overrides.some((o) => !o.granted);
      if (activeAdminCount <= 1 && hasDenials) {
        throw new BadRequestException('Action impossible : il doit toujours rester au moins un administrateur actif.');
      }
    }

    // Récupération des IDs des permissions en base
    const codes = dto.overrides.map((o) => o.permissionCode);
    const dbPerms = await this.prisma.permissions.findMany({
      where: { code: { in: codes } },
    });
    const permMap = new Map(dbPerms.map((p) => [p.code, p.id]));

    let oldOverrides: any[] = [];
    try {
      oldOverrides = await (this.prisma as any).user_permissions.findMany({
        where: { user_id: targetUserId },
        include: { permissions: true },
      });
    } catch {}

    for (const item of dto.overrides) {
      const permId = permMap.get(item.permissionCode);
      if (!permId) continue;

      try {
        await (this.prisma as any).user_permissions.upsert({
          where: {
            user_id_permission_id: {
              user_id: targetUserId,
              permission_id: permId,
            },
          },
          create: {
            user_id: targetUserId,
            permission_id: permId,
            granted: item.granted,
            reason: item.reason || null,
            changed_by: authorId,
            changed_at: new Date(),
          },
          update: {
            granted: item.granted,
            reason: item.reason || null,
            changed_by: authorId,
            changed_at: new Date(),
          },
        });
      } catch (err: any) {
        console.error('Erreur sauvegarde accès personnel :', err.message);
      }
    }

    // Invalider le cache immédiatement
    this.invalidatePermissions(targetUserId);

    // Journalisation inaltérable
    await this.auditService.logAction({
      userId: authorId,
      action: 'PERMISSIONS_UTILISATEUR_MODIFIEES',
      entityName: 'USER',
      entityId: targetUserId,
      oldValues: {
        overrides: oldOverrides.map((o: any) => ({
          code: o.permissions?.code,
          granted: o.granted,
        })),
      },
      newValues: {
        overrides: dto.overrides,
      },
    });

    return this.getUserPermissionsOverview(targetUserId);
  }

  /**
   * Contrôle de limitation de débit (SEC-03) : max 30 requêtes par minute par IP
   */
  private checkRateLimit(ip: string): void {
    const now = Date.now();
    const windowMs = 60 * 1000;
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
        roles: true,
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
        lockedUntil = new Date(Date.now() + 15 * 60 * 1000);
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

    // Calcul des droits effectifs réels
    const permissions = await this.getEffectivePermissions(user.id);

    // Récupération du taux de change actif
    const latestRate = await this.prisma.exchange_rates.findFirst({
      where: { pharmacy_id: user.pharmacy_id, base_currency: 'USD', target_currency: 'CDF', effective_date: { lte: new Date() } },
      orderBy: [{ effective_date: 'desc' }, { id: 'desc' }],
    });

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

    const rawRefreshToken = `vhp_rf_${crypto.randomBytes(32).toString('hex')}`;
    const tokenHash = crypto.createHash('sha256').update(rawRefreshToken).digest('hex');
    const refreshExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

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
            roles: true,
          },
        },
      },
    });

    if (!foundToken || foundToken.is_revoked || foundToken.expires_at < new Date()) {
      throw new UnauthorizedException('Votre session a expiré. Veuillez vous reconnecter.');
    }

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

  /**
   * Point d'entrée « mon espace » (CDC section 3, point 2) :
   * Renvoie à l'utilisateur connecté UNIQUEMENT ses propres droits effectifs
   * et les modules autorisés avec leurs libellés.
   * Ne renvoie jamais le catalogue complet ni les droits des autres rôles.
   */
  async getMe(userId: string): Promise<UserSpaceResponse> {
    const user = await this.prisma.users.findUnique({
      where: { id: userId },
      include: {
        roles: true,
      },
    });

    if (!user || !user.is_active) {
      throw new UnauthorizedException('Session utilisateur invalide.');
    }

    const effectivePermissions = await this.getEffectivePermissions(user.id);
    const allowedModules = this.calculateAllowedModules(effectivePermissions);

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
        permissions: effectivePermissions,
        isActive: user.is_active,
      },
      permissions: effectivePermissions,
      allowedModules,
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
        roles: true,
      },
      orderBy: { created_at: 'asc' },
    });

    const result: UserProfile[] = [];
    for (const u of users) {
      const permissions = await this.getEffectivePermissions(u.id);
      result.push({
        id: u.id,
        pharmacyId: u.pharmacy_id,
        username: u.username,
        fullName: u.full_name,
        role: u.roles.name as RoleName,
        email: u.email ?? undefined,
        permissions,
        isActive: u.is_active,
      });
    }
    return result;
  }

  // Détail d'un utilisateur par son ID
  async getUserById(id: string): Promise<UserProfile> {
    const user = await this.prisma.users.findUnique({
      where: { id },
      include: {
        roles: true,
      },
    });

    if (!user) {
      throw new NotFoundException(`Utilisateur avec l'identifiant ${id} introuvable.`);
    }

    const permissions = await this.getEffectivePermissions(user.id);

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

    this.invalidatePermissions(created.id);

    await this.auditService.logAction({
      userId: authorId || 'admin-authorizer',
      userName: 'Administrateur',
      action: 'UTILISATEUR_CREE',
      entityName: 'USER',
      entityId: created.id,
      newValues: { username: created.username, role: dto.role, fullName: created.full_name },
    });

    const permissions = await this.getEffectivePermissions(created.id);

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

    // Garde-fou : si changement de rôle d'un admin vers autre chose, vérifier qu'il reste un admin actif
    if (user.roles?.name === 'ADMIN' && dto.role && dto.role !== 'ADMIN') {
      const activeAdminCount = await this.prisma.users.count({
        where: {
          is_active: true,
          roles: { name: 'ADMIN' },
        },
      });
      if (activeAdminCount <= 1) {
        throw new BadRequestException('Action impossible : il doit toujours rester au moins un administrateur actif.');
      }
    }

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

    this.invalidatePermissions(id);

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

  // AUT-04 : Désactivation (jamais de suppression physique)
  async deactivateUser(username: string, authorId?: string): Promise<void> {
    const user = await this.prisma.users.findUnique({
      where: { username: username.toLowerCase().trim() },
      include: { roles: true },
    });
    if (!user) throw new NotFoundException('Utilisateur introuvable.');

    // Garde-fou 1 : impossible de se désactiver soi-même
    if (authorId && user.id === authorId) {
      throw new BadRequestException('Vous ne pouvez pas désactiver votre propre compte.');
    }

    // Garde-fou 2 : il doit toujours rester au moins un administrateur actif
    if (user.roles.name === 'ADMIN') {
      const activeAdminCount = await this.prisma.users.count({
        where: {
          is_active: true,
          roles: { name: 'ADMIN' },
        },
      });
      if (activeAdminCount <= 1) {
        throw new BadRequestException('Action impossible : il doit toujours rester au moins un administrateur actif.');
      }
    }

    await this.prisma.users.update({
      where: { id: user.id },
      data: { is_active: false },
    });

    // Invalidation immédiate du cache de permissions pour couper toute session ouverte
    this.invalidatePermissions(user.id);

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

    this.invalidatePermissions(user.id);

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
      this.invalidatePermissions(userId);

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

  // ══════════════════════════════════════════════════════════════════════════
  // GESTION DYNAMIQUE DES RÔLES (RBAC)
  // ══════════════════════════════════════════════════════════════════════════

  async getAllRoles(): Promise<RoleItem[]> {
    const roles = await this.prisma.roles.findMany({
      include: {
        role_permissions: {
          include: { permissions: true },
        },
        _count: {
          select: { users: true },
        },
      },
      orderBy: { created_at: 'asc' },
    });

    return roles.map((r) => ({
      id: r.id,
      name: r.name,
      description: r.description || undefined,
      maxDiscountPercent: Number(r.max_discount_percent),
      isSystem: r.is_system,
      userCount: r._count?.users || 0,
      permissionCodes: r.name === 'SUPER_ADMIN' || r.name === 'ADMIN'
        ? ['*']
        : r.role_permissions.map((rp) => rp.permissions.code),
      createdAt: r.created_at.toISOString(),
    }));
  }

  async getRoleById(id: string): Promise<RoleItem> {
    const role = await this.prisma.roles.findUnique({
      where: { id },
      include: {
        role_permissions: {
          include: { permissions: true },
        },
        _count: {
          select: { users: true },
        },
      },
    });
    if (!role) throw new NotFoundException('Rôle introuvable.');

    return {
      id: role.id,
      name: role.name,
      description: role.description || undefined,
      maxDiscountPercent: Number(role.max_discount_percent),
      isSystem: role.is_system,
      userCount: role._count?.users || 0,
      permissionCodes: role.name === 'SUPER_ADMIN' || role.name === 'ADMIN'
        ? ['*']
        : role.role_permissions.map((rp) => rp.permissions.code),
      createdAt: role.created_at.toISOString(),
    };
  }

  async createRole(dto: CreateRoleDto, authorId?: string): Promise<RoleItem> {
    const normalizedName = dto.name.trim().toUpperCase().replace(/\s+/g, '_');
    if (!normalizedName) {
      throw new BadRequestException('Le nom du rôle est obligatoire.');
    }

    const existing = await this.prisma.roles.findFirst({
      where: { name: normalizedName },
    });
    if (existing) {
      throw new BadRequestException(`Un rôle portant le nom "${normalizedName}" existe déjà.`);
    }

    const maxDiscount = dto.maxDiscountPercent !== undefined
      ? Math.min(Math.max(0, dto.maxDiscountPercent), 100)
      : 0;

    const newRole = await this.prisma.roles.create({
      data: {
        name: normalizedName,
        description: dto.description || null,
        max_discount_percent: maxDiscount,
        is_system: false,
      },
    });

    if (dto.permissionCodes && dto.permissionCodes.length > 0) {
      const perms = await this.prisma.permissions.findMany({
        where: { code: { in: dto.permissionCodes } },
      });
      for (const p of perms) {
        await this.prisma.role_permissions.create({
          data: {
            role_id: newRole.id,
            permission_id: p.id,
          },
        }).catch(() => {});
      }
    }

    await this.auditService.logAction({
      userId: authorId,
      action: 'ROLE_CREE',
      entityName: 'ROLE',
      entityId: newRole.id,
      newValues: { name: normalizedName, description: dto.description, maxDiscount, permissions: dto.permissionCodes },
    });

    return this.getRoleById(newRole.id);
  }

  async updateRole(id: string, dto: UpdateRoleDto, authorId?: string): Promise<RoleItem> {
    const role = await this.prisma.roles.findUnique({ where: { id } });
    if (!role) throw new NotFoundException('Rôle introuvable.');

    if (role.is_system && (role.name === 'SUPER_ADMIN' || role.name === 'ADMIN')) {
      if (dto.name && dto.name.trim().toUpperCase() !== role.name) {
        throw new BadRequestException(`Impossible de renommer le rôle système ${role.name}.`);
      }
    }

    const dataToUpdate: any = {};
    if (dto.name && !role.is_system) {
      const normalizedName = dto.name.trim().toUpperCase().replace(/\s+/g, '_');
      if (normalizedName !== role.name) {
        const existing = await this.prisma.roles.findFirst({ where: { name: normalizedName } });
        if (existing) throw new BadRequestException(`Un rôle portant le nom "${normalizedName}" existe déjà.`);
        dataToUpdate.name = normalizedName;
      }
    }
    if (dto.description !== undefined) {
      dataToUpdate.description = dto.description;
    }
    if (dto.maxDiscountPercent !== undefined) {
      dataToUpdate.max_discount_percent = Math.min(Math.max(0, dto.maxDiscountPercent), 100);
    }

    if (Object.keys(dataToUpdate).length > 0) {
      await this.prisma.roles.update({
        where: { id },
        data: dataToUpdate,
      });
    }

    if (dto.permissionCodes && role.name !== 'SUPER_ADMIN' && role.name !== 'ADMIN') {
      await this.prisma.role_permissions.deleteMany({
        where: { role_id: id },
      });

      const perms = await this.prisma.permissions.findMany({
        where: { code: { in: dto.permissionCodes } },
      });
      for (const p of perms) {
        await this.prisma.role_permissions.create({
          data: {
            role_id: id,
            permission_id: p.id,
          },
        }).catch(() => {});
      }

      const affectedUsers = await this.prisma.users.findMany({
        where: { role_id: id },
        select: { id: true },
      });
      for (const u of affectedUsers) {
        this.invalidatePermissions(u.id);
      }
    }

    await this.auditService.logAction({
      userId: authorId,
      action: 'ROLE_MODIFIE',
      entityName: 'ROLE',
      entityId: id,
      newValues: { ...dto },
    });

    return this.getRoleById(id);
  }

  async deleteRole(id: string, authorId?: string): Promise<{ success: boolean; message: string }> {
    const role = await this.prisma.roles.findUnique({
      where: { id },
      include: {
        _count: { select: { users: true } },
      },
    });
    if (!role) throw new NotFoundException('Rôle introuvable.');

    if (role.is_system) {
      throw new BadRequestException(`Le rôle système "${role.name}" est protégé et ne peut pas être supprimé.`);
    }

    if (role._count.users > 0) {
      throw new BadRequestException(
        `Impossible de supprimer le rôle "${role.name}" car ${role._count.users} utilisateur(s) lui sont encore affecté(s). Veuillez d'abord réassigner ces utilisateurs.`,
      );
    }

    await this.prisma.role_permissions.deleteMany({
      where: { role_id: id },
    });

    await this.prisma.roles.delete({
      where: { id },
    });

    await this.auditService.logAction({
      userId: authorId,
      action: 'ROLE_SUPPRIME',
      entityName: 'ROLE',
      entityId: id,
      newValues: { name: role.name },
    });

    return { success: true, message: `Rôle "${role.name}" supprimé avec succès.` };
  }

  getPermissionsCatalog(): { categories: { category: string; label: string; permissions: any[] }[] } {
    const byCategory: Record<string, any[]> = {};

    for (const p of PERMISSIONS_CATALOG) {
      if (!byCategory[p.category]) {
        byCategory[p.category] = [];
      }
      byCategory[p.category].push({
        code: p.code,
        label: p.label,
        category: p.category,
        description: p.description,
      });
    }

    const categories = Object.keys(byCategory).map((catKey) => ({
      category: catKey,
      label: PERMISSION_CATEGORY_LABELS[catKey] || catKey,
      permissions: byCategory[catKey],
    }));

    return { categories };
  }
}
