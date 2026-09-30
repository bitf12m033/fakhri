import { Injectable } from '@nestjs/common';
import { Prisma } from '@fakhri/prisma';
import { buildMeta, normalizePagination } from '@fakhri/shared';
import { PrismaService } from '../prisma/prisma.service';
import { currentActor } from '../common/actor-context';
import { AuditLogQueryDto } from './audit.dto';

export interface AuditEvent {
  /** Defaults to the authenticated principal, or SYSTEM outside a request. */
  actorType?: 'ADMIN' | 'CUSTOMER' | 'SYSTEM';
  actorId?: string;
  action: string;
  entityType: string;
  entityId: string;
  before?: unknown;
  after?: unknown;
  ip?: string;
  userAgent?: string;
}

/**
 * Append-only audit logging for important admin actions (REQ-34 / security baseline).
 * Call inside the mutating transaction to stay consistent with the change.
 *
 * Actor, ip and user agent come from the request context unless the caller passes
 * them, so every audited mutation records who performed it (increment 3.4).
 */
@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async log(event: AuditEvent, tx?: Prisma.TransactionClient): Promise<void> {
    const db = tx ?? this.prisma;
    const actor = currentActor();
    await db.auditLog.create({
      data: {
        actorType: event.actorType ?? actor?.principal?.type ?? 'SYSTEM',
        actorId: event.actorId ?? actor?.principal?.id,
        action: event.action,
        entityType: event.entityType,
        entityId: event.entityId,
        before: (event.before as Prisma.InputJsonValue) ?? Prisma.JsonNull,
        after: (event.after as Prisma.InputJsonValue) ?? Prisma.JsonNull,
        ip: event.ip ?? actor?.ip,
        userAgent: event.userAgent ?? actor?.userAgent,
      },
    });
  }

  /**
   * Search the log (REQ-34). `before` and `after` are returned as they were
   * written, so producers are the ones responsible for keeping PII out of them.
   */
  async search(query: AuditLogQueryDto) {
    const { skip, take } = normalizePagination(query);
    const where: Prisma.AuditLogWhereInput = {};
    if (query.actorType) where.actorType = query.actorType;
    if (query.actorId) where.actorId = query.actorId;
    if (query.action) where.action = { startsWith: query.action };
    if (query.entityType) where.entityType = query.entityType;
    if (query.entityId) where.entityId = query.entityId;
    if (query.from || query.to) {
      where.createdAt = {
        ...(query.from ? { gte: new Date(query.from) } : {}),
        ...(query.to ? { lte: new Date(query.to) } : {}),
      };
    }

    const [total, rows] = await Promise.all([
      this.prisma.auditLog.count({ where }),
      this.prisma.auditLog.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take }),
    ]);
    return {
      items: rows.map((row) => ({
        id: row.id,
        actorType: row.actorType,
        actorId: row.actorId,
        action: row.action,
        entityType: row.entityType,
        entityId: row.entityId,
        before: row.before,
        after: row.after,
        ip: row.ip,
        at: row.createdAt.toISOString(),
      })),
      meta: buildMeta(total, skip, take),
    };
  }
}