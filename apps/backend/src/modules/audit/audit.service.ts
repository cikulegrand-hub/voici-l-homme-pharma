import { BadRequestException, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { AuditLogEntry, AuditLogFilters, PaginatedAuditLogs } from '@vhp/shared';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AuditService {
  private readonly logger = new Logger('AuditService');

  constructor(private readonly prisma: PrismaService) {}

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
    userAgent?: string;
  }): Promise<AuditLogEntry> {
    const validUserId = data.userId && this.isUuid(data.userId) ? data.userId : undefined;
    let pharmacyId = data.pharmacyId;

    if (!pharmacyId && validUserId) {
      const user = await this.prisma.users.findUnique({ where: { id: validUserId }, select: { pharmacy_id: true } });
      pharmacyId = user?.pharmacy_id;
    }
    pharmacyId ||= process.env.AUDIT_DEFAULT_PHARMACY_ID || process.env.DEFAULT_PHARMACY_ID;
    if (!pharmacyId || !this.isUuid(pharmacyId)) {
      const defaultPharmacy = await this.prisma.pharmacies.findFirst({ select: { id: true } });
      pharmacyId = defaultPharmacy?.id;
    }
    if (!pharmacyId || !this.isUuid(pharmacyId)) {
      throw new ServiceUnavailableException('Le contexte pharmacie est obligatoire pour enregistrer un audit.');
    }

    try {
      const record = await this.prisma.audit_logs.create({
        data: {
          pharmacy_id: pharmacyId,
          user_id: validUserId || null,
          action: data.action,
          entity_name: data.entityName,
          entity_id: data.entityId,
          old_values: (this.sanitizeValues(data.oldValues) as any) || null,
          new_values: (this.sanitizeValues(data.newValues) as any) || null,
          ip_address: data.ipAddress || null,
          user_agent: data.userAgent || null,
        },
        include: { users: true },
      });

      return this.mapRecord(record, data.userName);
    } catch (error: any) {
      this.logger.error(`Erreur écriture audit log : ${error?.message || error}`);
      throw new ServiceUnavailableException('Le journal d’audit est indisponible. L’opération n’est pas considérée comme auditée.');
    }
  }

  async getPaginatedLogs(filters?: AuditLogFilters & { pharmacyId?: string }): Promise<PaginatedAuditLogs> {
    const where = this.buildWhere(filters);
    const page = Math.max(1, Number(filters?.page) || 1);
    const limit = Math.min(200, Math.max(1, Number(filters?.limit) || 50));
    const [total, records] = await Promise.all([
      this.prisma.audit_logs.count({ where }),
      this.prisma.audit_logs.findMany({
        where,
        include: { users: true },
        orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    return { data: records.map((record) => this.mapRecord(record)), total, page, limit, totalPages: Math.max(1, Math.ceil(total / limit)) };
  }

  async searchLogs(filters?: AuditLogFilters): Promise<AuditLogEntry[]> {
    const result = await this.getPaginatedLogs({ ...filters, limit: filters?.limit || 100 });
    return result.data;
  }

  async exportLogsToCsv(filters?: AuditLogFilters & { pharmacyId?: string }): Promise<string> {
    const records = await this.prisma.audit_logs.findMany({
      where: this.buildWhere(filters),
      include: { users: true },
      orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
    });
    const logs = records.map((record) => this.mapRecord(record));
    const header = ['Horodatage', 'Utilisateur', 'Action', 'Entité', 'ID Entité', 'Valeurs Avant', 'Valeurs Après', 'Adresse IP', 'User-Agent'];
    const rows = logs.map((log) => [
      this.csvCell(log.createdAt),
      this.csvCell(log.userName || 'Système'),
      this.csvCell(log.action),
      this.csvCell(log.entityName),
      this.csvCell(log.entityId),
      this.csvCell(log.oldValues ? JSON.stringify(log.oldValues) : ''),
      this.csvCell(log.newValues ? JSON.stringify(log.newValues) : ''),
      this.csvCell(log.ipAddress || ''),
      this.csvCell(log.userAgent || ''),
    ]);
    return [header.join(';'), ...rows.map((row) => row.join(';'))].join('\r\n');
  }

  private buildWhere(filters?: AuditLogFilters & { pharmacyId?: string }): any {
    const where: any = {};
    if (filters?.pharmacyId) where.pharmacy_id = filters.pharmacyId;
    if (filters?.userId) {
      if (!this.isUuid(filters.userId)) throw new BadRequestException('userId doit être un UUID valide.');
      where.user_id = filters.userId;
    }
    if (filters?.action) where.action = { contains: filters.action, mode: 'insensitive' };
    if (filters?.entityName) where.entity_name = filters.entityName;
    if (filters?.from || filters?.to) {
      where.created_at = {};
      if (filters.from) {
        const from = new Date(filters.from);
        if (isNaN(from.getTime())) throw new BadRequestException('La date from est invalide.');
        where.created_at.gte = from;
      }
      if (filters.to) {
        const to = new Date(filters.to);
        if (isNaN(to.getTime())) throw new BadRequestException('La date to est invalide.');
        if (filters.to.length === 10) to.setHours(23, 59, 59, 999);
        where.created_at.lte = to;
      }
      if (where.created_at.gte && where.created_at.lte && where.created_at.gte > where.created_at.lte) {
        throw new BadRequestException('La date de début doit être antérieure ou égale à la date de fin.');
      }
    }
    return where;
  }

  private mapRecord(record: any, fallbackUserName?: string): AuditLogEntry {
    return {
      id: record.id,
      userId: record.user_id || undefined,
      userName: record.users?.full_name || fallbackUserName || 'Système',
      action: record.action,
      entityName: record.entity_name,
      entityId: record.entity_id,
      oldValues: (record.old_values as Record<string, unknown>) || undefined,
      newValues: (record.new_values as Record<string, unknown>) || undefined,
      ipAddress: record.ip_address || undefined,
      userAgent: record.user_agent || undefined,
      createdAt: record.created_at.toISOString(),
    };
  }

  private csvCell(value: string): string {
    const safe = /^[=+\-@]/.test(value) ? `'${value}` : value;
    return `"${safe.replace(/"/g, '""')}"`;
  }

  private sanitizeValues(value?: Record<string, unknown>): Record<string, unknown> | undefined {
    if (!value) return undefined;
    const sensitive = /password|passphrase|pin|token|secret|api[_-]?key|authorization|refresh/i;
    const sanitize = (input: unknown, key?: string): unknown => {
      if (key && sensitive.test(key)) return '[REDACTED]';
      if (Array.isArray(input)) return input.map((item) => sanitize(item));
      if (input && typeof input === 'object') {
        return Object.fromEntries(Object.entries(input as Record<string, unknown>).map(([name, item]) => [name, sanitize(item, name)]));
      }
      return input;
    };
    return sanitize(value) as Record<string, unknown>;
  }

  private isUuid(value: string): boolean {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
  }
}
