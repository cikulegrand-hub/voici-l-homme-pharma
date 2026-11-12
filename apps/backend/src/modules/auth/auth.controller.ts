import {
  Controller,
  Post,
  Get,
  Patch,
  Put,
  Delete,
  Body,
  Req,
  HttpCode,
  HttpStatus,
  Param,
  UseGuards,
  ParseUUIDPipe,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import {
  LoginDto,
  CreateUserDto,
  UpdateUserDto,
  VerifyPinDto,
  ResetPasswordDto,
  ChangeMyPasswordDto,
  ChangeMyPinDto,
} from './dto/auth.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RolesGuard } from './guards/roles.guard';
import { RequirePermission, Public } from './decorators/auth.decorators';
import { UpdateUserAccessDto, CreateRoleDto, UpdateRoleDto } from '@vhp/shared';

@ApiTags('Authentification & Utilisateurs (AUT)')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Connexion utilisateur avec contrôle de verrouillage (AUT-01, AUT-02, SEC-03)' })
  @ApiResponse({ status: 200, description: 'Connexion réussie avec token JWT et taux actif CDF/USD' })
  @ApiResponse({ status: 401, description: 'Identifiants incorrects ou compte verrouillé' })
  @ApiResponse({ status: 429, description: 'Trop de tentatives (limitation de débit)' })
  async login(@Body() dto: LoginDto, @Req() req: any) {
    const ip = req.ip || req.connection?.remoteAddress || '127.0.0.1';
    const userAgent = req.headers?.['user-agent'] || 'Unknown';
    return this.authService.login(dto, ip, userAgent);
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Renouveler le jeton de session court avec un refresh token (AUT-03)' })
  @ApiResponse({ status: 200, description: 'Nouveaux jetons d’accès et de rafraîchissement' })
  @ApiResponse({ status: 401, description: 'Refresh token invalide ou expiré' })
  async refresh(@Body('refreshToken') refreshToken: string) {
    return this.authService.refreshToken(refreshToken);
  }

  @Post('logout')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Déconnexion utilisateur et traçabilité d’audit (AUD-01)' })
  @ApiResponse({ status: 200, description: 'Déconnexion enregistrée' })
  async logout(@Req() req: any) {
    await this.authService.logout(req.user?.id, req.user?.fullName);
    return { success: true };
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Point d\'entrée mon espace : droits effectifs et modules autorisés uniquement' })
  @ApiResponse({ status: 200, description: 'Utilisateur, permissions effectives et modules autorisés' })
  @ApiResponse({ status: 401, description: 'Non authentifié ou jeton expiré' })
  async getMe(@Req() req: any) {
    return this.authService.getMe(req.user.id);
  }

  @Get('users')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @RequirePermission('admin.utilisateurs')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Lister tous les utilisateurs de l’officine (AUT-04)' })
  @ApiResponse({ status: 200, description: 'Liste des utilisateurs avec rôle et statut' })
  async getAllUsers() {
    return this.authService.getAllUsers();
  }

  @Get('users/:id/permissions')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @RequirePermission('admin.utilisateurs')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Consulter la liste complète des accès et personnalisations d’un utilisateur' })
  async getUserPermissions(@Param('id', ParseUUIDPipe) id: string) {
    return this.authService.getUserPermissionsOverview(id);
  }

  @Put('users/:id/permissions')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @RequirePermission('admin.utilisateurs')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Définir des accès personnels (retrait ou ajout) avec garde-fous stricts' })
  async updateUserPermissions(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateUserAccessDto,
    @Req() req: any,
  ) {
    return this.authService.updateUserPermissions(id, dto, req.user?.id);
  }

  @Get('users/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @RequirePermission('admin.utilisateurs')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Consulter les détails d’un utilisateur (AUT-04)' })
  async getUserById(@Param('id', ParseUUIDPipe) id: string) {
    return this.authService.getUserById(id);
  }

  @Post('users')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @RequirePermission('admin.utilisateurs')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Créer un utilisateur avec rôle prédéfini (AUT-04, AUT-05)' })
  @ApiResponse({ status: 201, description: 'Utilisateur créé avec succès' })
  async createUser(@Body() dto: CreateUserDto, @Req() req: any) {
    const pharmacyId = req.user?.pharmacyId;
    if (!pharmacyId) throw new UnauthorizedException('Contexte pharmacie requis.');
    const authorId = req.user?.id;
    return this.authService.createUser(dto, pharmacyId, authorId);
  }

  @Patch('users/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @RequirePermission('admin.utilisateurs')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Modifier les informations d’un utilisateur (AUT-04)' })
  async updateUser(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateUserDto, @Req() req: any) {
    return this.authService.updateUser(id, dto, req.user?.id);
  }

  @Patch('users/:username/deactivate')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @RequirePermission('admin.utilisateurs')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Désactiver un utilisateur sans suppression physique (AUT-04, RG-06)' })
  async deactivateUser(@Param('username') username: string, @Req() req: any) {
    await this.authService.deactivateUser(username, req.user?.id);
    return { success: true, message: `Utilisateur ${username} désactivé avec succès.` };
  }

  @Patch('users/:username/activate')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @RequirePermission('admin.utilisateurs')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Réactiver un utilisateur désactivé (AUT-04)' })
  async activateUser(@Param('username') username: string, @Req() req: any) {
    await this.authService.activateUser(username, req.user?.id);
    return { success: true, message: `Utilisateur ${username} réactivé avec succès.` };
  }

  @Patch('users/:id/reset-password')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @RequirePermission('admin.utilisateurs')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Réinitialisation du mot de passe par un administrateur (AUT-06)' })
  async resetPassword(@Param('id', ParseUUIDPipe) userId: string, @Body() dto: ResetPasswordDto, @Req() req: any) {
    const adminId = req.user?.id;
    if (!adminId) throw new UnauthorizedException('Administrateur authentifié requis.');
    await this.authService.resetPasswordByAdmin(userId, dto.newPassword, adminId);
    return { success: true, message: 'Mot de passe réinitialisé avec succès.' };
  }

  @Post('change-password')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Changer son propre mot de passe (Page Profil)' })
  async changePassword(@Body() dto: ChangeMyPasswordDto, @Req() req: any) {
    await this.authService.changeMyPassword(req.user.id, dto);
    return { success: true, message: 'Mot de passe modifié avec succès.' };
  }

  @Post('change-pin')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Changer son propre code PIN (Page Profil)' })
  async changePin(@Body() dto: ChangeMyPinDto, @Req() req: any) {
    await this.authService.changeMyPin(req.user.id, dto);
    return { success: true, message: 'Code PIN modifié avec succès.' };
  }

  @Post('verify-pin')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Vérifier un code PIN superviseur pour action sensible et obtenir une autorisation temporaire (AUT-08)' })
  @ApiResponse({ status: 200, description: 'Autorisation accordée pour 5 minutes avec token éphémère' })
  async verifyPin(@Body() dto: VerifyPinDto) {
    return this.authService.verifySupervisorPin(dto.pinCode, dto.action);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // GESTION DYNAMIQUE DES RÔLES (RBAC)
  // ══════════════════════════════════════════════════════════════════════════

  @Get('roles')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @RequirePermission('admin.roles', 'admin.utilisateurs')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Lister tous les rôles (système + personnalisés) avec nombre d\'utilisateurs et permissions' })
  async getAllRoles() {
    return this.authService.getAllRoles();
  }

  @Get('roles/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @RequirePermission('admin.roles', 'admin.utilisateurs')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Consulter le détail d\'un rôle et ses permissions associées' })
  async getRoleById(@Param('id', ParseUUIDPipe) id: string) {
    return this.authService.getRoleById(id);
  }

  @Post('roles')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @RequirePermission('admin.roles')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Créer un nouveau rôle personnalisé avec permissions' })
  @ApiResponse({ status: 201, description: 'Rôle créé avec succès' })
  async createRole(@Body() dto: CreateRoleDto, @Req() req: any) {
    return this.authService.createRole(dto, req.user?.id);
  }

  @Put('roles/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @RequirePermission('admin.roles')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Modifier un rôle personnalisé (nom, description, plafond de remise, permissions)' })
  async updateRole(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateRoleDto, @Req() req: any) {
    return this.authService.updateRole(id, dto, req.user?.id);
  }

  @Delete('roles/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @RequirePermission('admin.roles')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Supprimer un rôle personnalisé (interdit si des utilisateurs y sont rattachés)' })
  async deleteRole(@Param('id', ParseUUIDPipe) id: string, @Req() req: any) {
    return this.authService.deleteRole(id, req.user?.id);
  }

  @Get('permissions/catalog')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @RequirePermission('admin.roles', 'admin.utilisateurs')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Catalogue complet des permissions disponibles, groupées par catégorie' })
  async getPermissionsCatalog() {
    return this.authService.getPermissionsCatalog();
  }
}
