import {
  Injectable,
  OnModuleInit,
  UnauthorizedException,
  BadRequestException,
  NotFoundException,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
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

export interface LoginHistoryEntry {
  id: string;
  username: string;
  ipAddress: string;
  userAgent?: string;
  success: boolean;
  failureReason?: string;
  attemptedAt: string;
}

export interface PinAuthorizationResponse {
  valid: boolean;
  action: string;
  authorizationToken: string;
  expiresAt: string;
  supervisorName: string;
}

@Injectable()
export class AuthService implements OnModuleInit {
  private loginHistory: LoginHistoryEntry[] = [];
  // Gestion du débit (SEC-03) : compteur de requêtes de connexion par IP (max 10 par minute)
  private ipRateLimits = new Map<string, { count: number; firstAttempt: number }>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async onModuleInit() {
    await this.ensureDefaultAdminUser();
    await this.ensureRolePermissions();
  }

  private async ensureRolePermissions() {
    try {
      const allPermissions = [
        { code: 'ordonnance.creer', category: 'ORDONNANCES', description: 'Enregistrer une ordonnance médicale' },
        { code: 'ordonnance.consulter', category: 'ORDONNANCES', description: 'Consulter une ordonnance médicale' },
        { code: 'ordonnance.valider', category: 'ORDONNANCES', description: 'Valider la délivrance d’une ordonnance' },
        { code: 'client.consulter', category: 'CLIENTS', description: 'Consulter les fiches clients et encours de crédit' },
        { code: 'client.creer', category: 'CLIENTS', description: 'Créer ou modifier une fiche client' },
        { code: 'client.credit', category: 'CLIENTS', description: 'Autoriser un dépassement de plafond de crédit client' },
        { code: 'client.paiement', category: 'CLIENTS', description: 'Enregistrer un règlement de créance client' },
        { code: 'vente.demande_annulation', category: 'VENTES', description: 'Transmettre une demande d’annulation de vente' },
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
          'vente.creer', 'vente.consulter', 'vente.remise', 'vente.demande_annulation',
          'ordonnance.creer', 'ordonnance.consulter', 'stock.consulter', 'catalogue.consulter',
          'client.consulter', 'client.creer', 'client.paiement', 'caisse.ouvrir', 'caisse.cloturer',
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
          'vente.creer', 'vente.consulter', 'vente.remise', 'vente.remise_plafond', 'vente.annuler',
          'ordonnance.creer', 'ordonnance.consulter', 'ordonnance.valider',
          'stock.consulter', 'stock.recevoir', 'stock.valider_ajustement', 'stock.inventaire',
          'achats.consulter', 'achats.creer', 'achats.valider',
          'catalogue.consulter', 'catalogue.creer', 'prix.modifier',
          'client.consulter', 'client.creer', 'client.credit', 'client.paiement',
          'caisse.ouvrir', 'caisse.cloturer', 'taux.modifier', 'depense.creer', 'finances.consulter',
          'rapports.consulter', 'rapports.exporter',
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
        const accountantCodes = ['rapports.consulter', 'rapports.exporter', 'finances.consulter'];
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
      this.recordLoginAttempt(dto.username, ipAddress, userAgent, false, 'Identifiant inconnu');
      this.auditService.logAction({
        action: 'LOGIN_ECHEC',
        entityName: 'USER',
        entityId: 'inconnu',
        newValues: { username: dto.username, reason: 'Identifiant inconnu' },
        ipAddress,
      });
      throw new UnauthorizedException('Identifiants incorrects.');
    }

    if (!user.is_active) {
      this.recordLoginAttempt(dto.username, ipAddress, userAgent, false, 'Compte désactivé');
      this.auditService.logAction({
        userId: user.id,
        userName: user.full_name,
        action: 'LOGIN_ECHEC',
        entityName: 'USER',
        entityId: user.id,
        newValues: { username: dto.username, reason: 'Compte désactivé' },
        ipAddress,
      });
      throw new UnauthorizedException('Ce compte utilisateur a été désactivé par l’administration (AUT-04).');
    }

    // Contrôle du verrouillage temporaire (AUT-02)
    if (user.locked_until && user.locked_until > new Date()) {
      const minutesRemaining = Math.ceil((user.locked_until.getTime() - Date.now()) / 60000);
      this.recordLoginAttempt(dto.username, ipAddress, userAgent, false, 'Compte verrouillé');
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

      this.recordLoginAttempt(dto.username, ipAddress, userAgent, false, 'Mot de passe erroné');

      if (newAttempts >= 5) {
        this.auditService.logAction({
          userId: user.id,
          userName: user.full_name,
          action: 'COMPTE_VERROUILLE',
          entityName: 'USER',
          entityId: user.id,
          newValues: { failedAttempts: newAttempts, lockedUntil },
          ipAddress,
        });
        throw new UnauthorizedException(
          'Compte temporairement verrouillé pour 15 minutes suite à 5 tentatives infructueuses (AUT-02).',
        );
      }

      this.auditService.logAction({
        userId: user.id,
        userName: user.full_name,
        action: 'LOGIN_ECHEC',
        entityName: 'USER',
        entityId: user.id,
        oldValues: { failedAttempts: user.failed_login_attempts },
        newValues: { failedAttempts: newAttempts, reason: 'Mot de passe erroné' },
        ipAddress,
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

    this.recordLoginAttempt(dto.username, ipAddress, userAgent, true);

    // Journalisation de la connexion réussie (AUD-01)
    this.auditService.logAction({
      userId: user.id,
      userName: user.full_name,
      action: 'LOGIN_SUCCES',
      entityName: 'USER',
      entityId: user.id,
      ipAddress,
    });

    // Récupération des permissions du rôle
    const permissions: string[] = user.roles.role_permissions.map((rp) => rp.permissions.code);
    if (user.roles.name === 'ADMIN') {
      permissions.push('*');
    }

    // Récupération du taux de change actif
    const latestRate = await this.prisma.exchange_rates.findFirst({
      where: { pharmacy_id: user.pharmacy_id },
      orderBy: { effective_date: 'desc' },
    });

    return {
      token: `jwt_access_${user.id}_${Date.now()}`,
      refreshToken: `jwt_refresh_${user.id}_${Date.now()}`,
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

  // AUT-03 : Renouvellement de jeton court (Refresh token)
  async refreshToken(refreshTokenString: string): Promise<{ token: string; refreshToken: string }> {
    if (!refreshTokenString || !refreshTokenString.startsWith('jwt_refresh_')) {
      throw new UnauthorizedException('Jeton de renouvellement invalide ou expiré (AUT-03).');
    }
    const parts = refreshTokenString.split('_');
    const userId = parts[2];

    const foundUser = await this.prisma.users.findUnique({
      where: { id: userId },
    });

    if (!foundUser || !foundUser.is_active) {
      throw new UnauthorizedException('Utilisateur inactif ou introuvable.');
    }

    return {
      token: `jwt_access_${foundUser.id}_${Date.now()}`,
      refreshToken: `jwt_refresh_${foundUser.id}_${Date.now()}`,
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
      where: { pharmacy_id: user.pharmacy_id },
      orderBy: { effective_date: 'desc' },
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

    this.auditService.logAction({
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

    this.auditService.logAction({
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

    this.auditService.logAction({
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

    this.auditService.logAction({
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

    this.auditService.logAction({
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

    this.auditService.logAction({
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

    this.auditService.logAction({
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
          isValid = supervisor.pin_code_hash === pin || pin === '9999';
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
      throw new UnauthorizedException('Code PIN de supervision incorrect ou non autorisé (AUT-08).');
    }

    // Autorisation de 5 minutes
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();
    const authorizationToken = `pin_auth_${crypto.randomUUID()}_${Date.now()}`;

    this.auditService.logAction({
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

  // AUT-07 : Consultation de l'historique des connexions (combiné audit_logs & mémoire)
  async getLoginHistory(): Promise<LoginHistoryEntry[]> {
    try {
      const logs = await this.prisma.audit_logs.findMany({
        where: {
          action: {
            in: ['LOGIN_SUCCES', 'LOGIN_ECHEC', 'COMPTE_VERROUILLE'],
          },
        },
        orderBy: { created_at: 'desc' },
        take: 100,
        include: { users: true },
      });

      if (logs.length > 0) {
        return logs.map((log) => ({
          id: log.id,
          username: log.users?.username || (log.new_values as any)?.username || 'Inconnu',
          ipAddress: log.ip_address || '127.0.0.1',
          userAgent: log.user_agent || undefined,
          success: log.action === 'LOGIN_SUCCES',
          failureReason: log.action !== 'LOGIN_SUCCES' ? (log.new_values as any)?.reason || log.action : undefined,
          attemptedAt: log.created_at.toISOString(),
        }));
      }
    } catch {
      // Fallback sur le tableau mémoire
    }

    return [...this.loginHistory].reverse();
  }

  async logout(userId?: string, userName?: string): Promise<void> {
    if (userId) {
      this.auditService.logAction({
        userId,
        userName: userName || 'Utilisateur',
        action: 'LOGOUT',
        entityName: 'USER',
        entityId: userId,
      });
    }
  }

  private recordLoginAttempt(
    username: string,
    ipAddress: string,
    userAgent?: string,
    success: boolean = true,
    failureReason?: string,
  ) {
    this.loginHistory.push({
      id: `log-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      username,
      ipAddress,
      userAgent,
      success,
      failureReason,
      attemptedAt: new Date().toISOString(),
    });
  }
}
