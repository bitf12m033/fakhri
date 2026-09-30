import { Injectable } from '@nestjs/common';
import { Prisma } from '@fakhri/prisma';
import { PrismaService } from '../prisma/prisma.service';

export interface AuditEvent {
  actorType: 'ADMIN' | 'CUSTOMER' | 'SYSTEM';
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
 */
@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async log(event: AuditEvent, tx?: Prisma.TransactionClient): Promise<void> {
    const db = tx ?? this.prisma;
    await db.auditLog.create({
      data: {
        actorType: event.actorType,
        actorId: event.actorId,
        action: event.action,
        entityType: event.entityType,
        entityId: event.entityId,
        before: (event.before as Prisma.InputJsonValue) ?? Prisma.JsonNull,
        after: (event.after as Prisma.InputJsonValue) ?? Prisma.JsonNull,
        ip: event.ip,
        userAgent: event.userAgent,
      },
    });
  }
}