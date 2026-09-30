import { Injectable } from '@nestjs/common';
import { Prisma } from '@fakhri/prisma';
import { PrismaService } from '../prisma/prisma.service';
import { currentActor } from '../common/actor-context';

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
}