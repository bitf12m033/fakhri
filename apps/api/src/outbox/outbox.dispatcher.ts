import { Injectable, Logger, OnApplicationShutdown, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OutboxStatus, Prisma } from '@fakhri/prisma';
import { AppConfig } from '@fakhri/config';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

export interface OutboxEnvelopeRow {
  id: string;
  type: string;
  aggregateType: string;
  aggregateId: string;
  payload: Prisma.JsonValue;
  attemptCount: number;
}

/** A consumer of committed events. Handlers must tolerate being called twice. */
export interface OutboxHandler {
  readonly name: string;
  handles(type: string): boolean;
  handle(event: OutboxEnvelopeRow): Promise<void>;
}

export interface DrainResult {
  claimed: number;
  published: number;
  failed: number;
}

const LOCK_KEY = 'outbox:dispatch';

/**
 * Outbox dispatcher (DEC-04). Producers since increment 3.2 have been writing
 * events inside their business transactions; this is what finally delivers them.
 *
 * Delivery is at-least-once: a batch is claimed with FOR UPDATE SKIP LOCKED and
 * its attempt counter incremented in a short transaction, then handlers run
 * outside that transaction so slow I/O never holds database locks. A crash
 * mid-handler leaves the event PENDING with the attempt spent, so it is retried
 * until OUTBOX_MAX_ATTEMPTS, after which it is parked as FAILED for an operator.
 *
 * A Redis lock keeps one instance polling at a time. Set OUTBOX_POLL_MS=0 to
 * disable the timer and drain explicitly instead, which is what tests do.
 */
@Injectable()
export class OutboxDispatcher implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger('OutboxDispatcher');
  private readonly handlers: OutboxHandler[] = [];
  private timer?: NodeJS.Timeout;
  private draining = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly config: ConfigService<AppConfig, true>,
  ) {}

  register(handler: OutboxHandler): void {
    this.handlers.push(handler);
    this.logger.log(`registered handler ${handler.name}`);
  }

  onModuleInit(): void {
    const pollMs = this.config.get('OUTBOX_POLL_MS', { infer: true });
    if (pollMs <= 0) {
      this.logger.log('polling disabled (OUTBOX_POLL_MS=0)');
      return;
    }
    this.timer = setInterval(() => void this.tick(pollMs), pollMs);
    // Do not keep the process alive just for the poller.
    this.timer.unref();
  }

  onApplicationShutdown(): void {
    if (this.timer) clearInterval(this.timer);
  }

  private async tick(pollMs: number): Promise<void> {
    if (this.draining) return;
    // One dispatcher at a time across instances; the lock expires on its own.
    if (!(await this.redis.acquireLock(LOCK_KEY, pollMs * 3))) return;
    try {
      this.draining = true;
      await this.drain();
    } catch (error) {
      this.logger.error(`drain failed: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      this.draining = false;
      await this.redis.releaseLock(LOCK_KEY);
    }
  }

  /** Claim and deliver one batch. Returns what happened, for ops and tests. */
  async drain(): Promise<DrainResult> {
    const batchSize = this.config.get('OUTBOX_BATCH_SIZE', { infer: true });
    const maxAttempts = this.config.get('OUTBOX_MAX_ATTEMPTS', { infer: true });
    const claimed = await this.claim(batchSize, maxAttempts);
    let published = 0;
    let failed = 0;

    for (const event of claimed) {
      const handlers = this.handlers.filter((handler) => handler.handles(event.type));
      try {
        for (const handler of handlers) await handler.handle(event);
        // updateMany, not update: the row may have been purged since it was
        // claimed, and that must not abort the rest of the batch.
        await this.prisma.outboxEvent.updateMany({
          where: { id: event.id },
          data: { status: OutboxStatus.PUBLISHED, publishedAt: new Date(), lastError: null },
        });
        published += 1;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const exhausted = event.attemptCount + 1 >= maxAttempts;
        await this.prisma.outboxEvent.updateMany({
          where: { id: event.id },
          data: {
            lastError: message.slice(0, 500),
            status: exhausted ? OutboxStatus.FAILED : OutboxStatus.PENDING,
          },
        });
        failed += 1;
        this.logger.warn(`event ${event.type} (${event.id}) failed: ${message}`);
      }
    }
    return { claimed: claimed.length, published, failed };
  }

  /**
   * Take the oldest pending events, skipping any another dispatcher already
   * holds, and spend one attempt each before handlers run.
   */
  private async claim(batchSize: number, maxAttempts: number): Promise<OutboxEnvelopeRow[]> {
    return this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<OutboxEnvelopeRow[]>(Prisma.sql`
        SELECT "id", "type", "aggregateType", "aggregateId", "payload", "attemptCount"
          FROM "OutboxEvent"
         WHERE "status" = 'PENDING' AND "attemptCount" < ${maxAttempts}
         ORDER BY "createdAt" ASC
         LIMIT ${batchSize}
         FOR UPDATE SKIP LOCKED
      `);
      if (rows.length === 0) return [];
      await tx.outboxEvent.updateMany({
        where: { id: { in: rows.map((row) => row.id) } },
        data: { attemptCount: { increment: 1 } },
      });
      return rows;
    });
  }
}
