import { Injectable, Logger } from '@nestjs/common';
import { AuditLogEntry, PaginatedAuditLogs, AuditLogFilters } from '@vhp/shared';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AuditService {
  private readonly logger = new Logger('AuditService');

  constructor(private readonly prisma: PrismaService) {}

  // AUD-01 & AUD-02 : Enregistrement inaltérable d'une action sensible
  async logAction(data: {
    pharmacyId?: string;
    userId?: string;
    userName?: string;
    action: string;
    entityName: string;
    entityId: string;
    oldValues?: Record<string, unknown>;
    newValues?: Record<string, unknown>;
    ipAddress?: string;
  }): Promise<AuditLogEntry> {
    const pharmacyId = data.pharmacyId || '11111111-1111-1111-1111-111111111111';
    const isUuid = data.userId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(data.userId);
    const validUserId = isUuid ? data.userId : null;

    try {
      const record = await this.prisma.audit_logs.create({
        data: {
          pharmacy_id: pharmacyId,
          user_id: validUserId,
          action: data.action,
          entity_name: data.entityName,
          entity_id: data.entityId,
          old_values: (data.oldValues as any) || null,
          new_values: (data.newValues as any) || null,
          ip_address: data.ipAddress || null,
        },
        include: {
          users: true,
        },
      });

      return {
        id: record.id,
        userId: record.user_id || undefined,
        userName: record.users?.full_name || data.userName || 'Utilisateur',
        action: record.action,
        entityName: record.entity_name,
        entityId: record.entity_id,
        oldValues: (record.old_values as Record<string, unknown>) || undefined,
        newValues: (record.new_values as Record<string, unknown>) || undefined,
        ipAddress: record.ip_address || undefined,
        createdAt: record.created_at.toISOString(),
      };
    } catch (err: any) {
      this.logger.error(`Erreur écriture audit log : ${err.message}`);
      // Fallback in-memory pour ne jamais bloquer l'action métier
      return {
        id: `aud-${Date.now()}`,
        userId: data.userId,
        userName: data.userName || 'Système',
        action: data.action,
        entityName: data.entityName,
        entityId: data.entityId,
        oldValues: data.oldValues,
        newValues: data.newValues,
        ipAddress: data.ipAddress,
        createdAt: new Date().toISOString(),
      };
    }
  }

  // AUD-04 : Consultation et recherche paginée du journal
  async getPaginatedLogs(filters?: AuditLogFilters & { pharmacyId?: string }): Promise<PaginatedAuditLogs> {
    try {
      const where: any = {};
      if (filters?.pharmacyId) where.pharmacy_id = filters.pharmacyId;
      const isUuid = filters?.userId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(filters.userId);
      if (isUuid) where.user_id = filters.userId;
      if (filters?.action) where.action = { contains: filters.action, mode: 'insensitive' };
      if (filters?.entityName) where.entity_name = filters.entityName;

      if (filters?.from || filters?.to) {
        where.created_at = {};
        if (filters.from) {
          const fromDate = new Date(filters.from);
          if (!isNaN(fromDate.getTime())) where.created_at.gte = fromDate;
        }
        if (filters.to) {
          const toDate = new Date(filters.to);
          if (!isNaN(toDate.getTime())) {
            // Fin de journée si seule la date est fournie
            if (filters.to.length === 10) toDate.setHours(23, 59, 59, 999);
            where.created_at.lte = toDate;
          }
        }
      }

      const page = Math.max(1, Number(filters?.page) || 1);
      const limit = Math.min(200, Math.max(1, Number(filters?.limit) || 50));
      const skip = (page - 1) * limit;

      const [total, records] = await Promise.all([
        this.prisma.audit_logs.count({ where }),
        this.prisma.audit_logs.findMany({
          where,
          include: { users: true },
          orderBy: { created_at: 'desc' },
          skip,
          take: limit,
        }),
      ]);

      const data: AuditLogEntry[] = records.map((r) => ({
        id: r.id,
        userId: r.user_id || undefined,
        userName: r.users?.full_name || 'Système',
        action: r.action,
        entityName: r.entity_name,
        entityId: r.entity_id,
        oldValues: (r.old_values as Record<string, unknown>) || undefined,
        newValues: (r.new_values as Record<string, unknown>) || undefined,
        ipAddress: r.ip_address || undefined,
        createdAt: r.created_at.toISOString(),
      }));

      return {
        data,
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit) || 1,
      };
    } catch (err: any) {
      this.logger.error(`Erreur lecture audit logs : ${err.message}`);
      return { data: [], total: 0, page: 1, limit: 50, totalPages: 1 };
    }
  }

  // AUD-04 : Rétro-compatibilité pour searchLogs retournant un tableau
  async searchLogs(filters?: AuditLogFilters): Promise<AuditLogEntry[]> {
    const res = await this.getPaginatedLogs({ ...filters, limit: filters?.limit || 100 });
    return res.data;
  }

  // AUD-05 : Export CSV et Excel
  async exportLogsToCsv(filters?: AuditLogFilters & { pharmacyId?: string }): Promise<string> {
    const logs = await this.searchLogs({ ...filters, limit: 1000 });

    const header = ['Horodatage', 'Utilisateur', 'Action', 'Entité', 'ID Entité', 'Valeurs Avant', 'Valeurs Après', 'Adresse IP'];
    const rows = logs.map((log) => [
      `"${log.createdAt}"`,
      `"${(log.userName || 'Système').replace(/"/g, '""')}"`,
      `"${log.action}"`,
      `"${log.entityName}"`,
      `"${log.entityId}"`,
      `"${log.oldValues ? JSON.stringify(log.oldValues).replace(/"/g, '""') : ''}"`,
      `"${log.newValues ? JSON.stringify(log.newValues).replace(/"/g, '""') : ''}"`,
      `"${log.ipAddress || ''}"`,
    ]);

    return [header.join(';'), ...rows.map((r) => r.join(';'))].join('\r\n');
  }
}
