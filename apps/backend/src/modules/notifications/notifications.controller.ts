import { Controller, Get, Patch, Post, Param, Query, Req, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { NotificationsService } from './notifications.service';
import { NotificationQueryDto } from './dto/notifications.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { RequirePermission } from '../auth/decorators/auth.decorators';

@ApiTags('Centre de Notifications internes (NOT)')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  @RequirePermission('notifications.consulter')
  @ApiOperation({ summary: 'Lister les notifications avec statut lu/non-lu pour l’utilisateur (NOT-01)' })
  @ApiResponse({ status: 200, description: 'Liste des notifications' })
  async getNotifications(@Req() req: any, @Query() query: NotificationQueryDto) {
    const actor = {
      id: req.user.id,
      role: req.user.role,
      pharmacyId: req.user.pharmacyId || '11111111-1111-1111-1111-111111111111',
    };
    return this.notificationsService.getNotifications(actor, query);
  }

  @Get('unread-count')
  @RequirePermission('notifications.consulter')
  @ApiOperation({ summary: 'Compteur de notifications non lues pour badge d’en-tête (NOT-02)' })
  @ApiResponse({ status: 200, description: 'Compteur d’alertes non lues' })
  async getUnreadCount(@Req() req: any) {
    const actor = {
      id: req.user.id,
      role: req.user.role,
      pharmacyId: req.user.pharmacyId || '11111111-1111-1111-1111-111111111111',
    };
    const count = await this.notificationsService.getUnreadCount(actor);
    return { count };
  }

  @Patch(':id/read')
  @RequirePermission('notifications.consulter')
  @ApiOperation({ summary: 'Marquer une alerte comme lue par l’utilisateur connecté (NOT-01)' })
  @ApiResponse({ status: 200, description: 'Statut mis à jour' })
  async markAsRead(@Param('id') id: string, @Req() req: any) {
    const success = await this.notificationsService.markAsRead(id, req.user.id);
    return { success };
  }

  @Patch('mark-all-read')
  @RequirePermission('notifications.consulter')
  @ApiOperation({ summary: 'Marquer toutes les alertes comme lues (NOT-01)' })
  @ApiResponse({ status: 200, description: 'Nombre d’alertes marquées lues' })
  async markAllAsRead(@Req() req: any) {
    const actor = {
      id: req.user.id,
      role: req.user.role,
      pharmacyId: req.user.pharmacyId || '11111111-1111-1111-1111-111111111111',
    };
    const updatedCount = await this.notificationsService.markAllAsRead(actor);
    return { updatedCount };
  }

  @Post('sync')
  @RequirePermission('notifications.consulter')
  @ApiOperation({ summary: 'Déclencher la détection et génération des alertes (stock bas, péremptions, créances, écarts)' })
  @ApiResponse({ status: 200, description: 'Nombre d’alertes créées' })
  async syncAlerts(@Req() req: any) {
    const pharmacyId = req.user.pharmacyId || '11111111-1111-1111-1111-111111111111';
    const count = await this.notificationsService.syncAlerts(pharmacyId);
    return { createdAlertsCount: count };
  }
}
