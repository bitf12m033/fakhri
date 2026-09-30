import { createHash } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { Prisma } from '@fakhri/prisma';
import { conflict } from '@fakhri/shared';
import { PrismaService } from '../../prisma/prisma.service';

const COMPLETED = 'COMPLETED';
const IN_PROGRESS = 'IN_PROGRESS';

export interface IdempotentResult<T> {
  result: T;
  replayed: boolean;
}

/**
 * Replay protection for unsafe operations (docs/aidlc/04-architecture-api.md §5).
 * The first caller claims the key, runs the work and stores the response; a retry
 * with the same key and the same body gets that response back instead of a second
 * order. A failed attempt releases the key so the client can genuinely retry.
 */
@Injectable()
export class IdempotencyService {
  constructor(private readonly prisma: PrismaService) {}

  async run<T>(
    scope: string,
    key: string,
    request: unknown,
    work: () => Promise<{ result: T; entityId?: string }>,
  ): Promise<IdempotentResult<T>> {
    const requestHash = hashRequest(request);

    try {
      await this.prisma.idempotencyKey.create({ data: { scope, key, requestHash } });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        return { result: await this.replay<T>(scope, key, requestHash), replayed: true };
      }
      throw error;
    }

    try {
      const { result, entityId } = await work();
      await this.prisma.idempotencyKey.update({
        where: { scope_key: { scope, key } },
        data: { status: COMPLETED, response: result as Prisma.InputJsonValue, entityId },
      });
      return { result, replayed: false };
    } catch (error) {
      // The work did not happen, so the key must not stay claimed.
      await this.prisma.idempotencyKey.deleteMany({ where: { scope, key, status: IN_PROGRESS } });
      throw error;
    }
  }

  private async replay<T>(scope: string, key: string, requestHash: string): Promise<T> {
    const existing = await this.prisma.idempotencyKey.findUnique({ where: { scope_key: { scope, key } } });
    if (!existing) throw conflict('Please retry with a new Idempotency-Key');
    if (existing.requestHash !== requestHash) {
      throw conflict('This Idempotency-Key was already used for a different request');
    }
    if (existing.status !== COMPLETED || existing.response === null) {
      throw conflict('An identical request is still being processed');
    }
    return existing.response as T;
  }
}

/** Stable hash of the request body, so a replay can be told from a key collision. */
export function hashRequest(request: unknown): string {
  return createHash('sha256').update(stableStringify(request)).digest('hex');
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, item]) => item !== undefined)
    .sort(([left], [right]) => left.localeCompare(right));
  return `{${entries.map(([name, item]) => `${JSON.stringify(name)}:${stableStringify(item)}`).join(',')}}`;
}
