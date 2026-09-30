import { Injectable, Logger } from '@nestjs/common';
import { OutboxStatus, Prisma } from '@fakhri/prisma';
import { PrismaService } from '../prisma/prisma.service';

export interface OutboxEnvelope {
  type: string;
  aggregateType: string;
  aggregateId: string;
  payload: Record<string, unknown>;
}

/**
 * Transactional outbox producer (DEC-04). Writers call enqueue() INSIDE the same
 * DB transaction that performs the business mutation, then commit.
 */
@Injectable()
export class OutboxService {
  private readonly logger = new Logger('Outbox');

  constructor(private readonly prisma: PrismaService) {}

  /** Resolve a transaction-scoped client from the outer PrismaService or an explicit tx. */
  async enqueue(
    envelope: OutboxEnvelope,
    tx?: Prisma.TransactionClient,
  ): Promise<void> {
    const db = tx ?? this.prisma;
    await db.outboxEvent.create({
      data: { ...envelope, payload: envelope.payload as Prisma.InputJsonValue },
    });
  }

  /** Mark an event delivered (consumed by dispatchers/workers in later increments). */
  async markPublished(id: string): Promise<void> {
    await this.prisma.outboxEvent.update({
      where: { id },
      data: { status: OutboxStatus.PUBLISHED, publishedAt: new Date(), attemptCount: { increment: 1 } },
    });
  }

  /** Baseline diagnostics: pending event count. */
  async pendingCount(): Promise<number> {
    return this.prisma.outboxEvent.count({ where: { status: OutboxStatus.PENDING } });
  }

  /** What is waiting, delivered and stuck, for the admin view (increment 3.6). */
  async summary(): Promise<{ pending: number; published: number; failed: number; oldestPendingAt: string | null }> {
    const [pending, published, failed, oldest] = await Promise.all([
      this.prisma.outboxEvent.count({ where: { status: OutboxStatus.PENDING } }),
      this.prisma.outboxEvent.count({ where: { status: OutboxStatus.PUBLISHED } }),
      this.prisma.outboxEvent.count({ where: { status: OutboxStatus.FAILED } }),
      this.prisma.outboxEvent.findFirst({
        where: { status: OutboxStatus.PENDING },
        orderBy: { createdAt: 'asc' },
        select: { createdAt: true },
      }),
    ]);
    return { pending, published, failed, oldestPendingAt: oldest?.createdAt.toISOString() ?? null };
  }
}