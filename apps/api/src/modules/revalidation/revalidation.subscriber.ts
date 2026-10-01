import { createHmac } from 'node:crypto';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppConfig } from '@fakhri/config';
import { OUTBOX_EVENTS } from '../../outbox/event-types';
import { OutboxDispatcher, OutboxEnvelopeRow, OutboxHandler } from '../../outbox/outbox.dispatcher';

const REQUEST_TIMEOUT_MS = 5000;

const HANDLED: readonly string[] = [
  OUTBOX_EVENTS.PRODUCT_PUBLISHED,
  OUTBOX_EVENTS.REVIEW_MODERATED,
  OUTBOX_EVENTS.CONTENT_UPDATED,
];

/**
 * Cache tags the storefront attaches to its fetches. Keep in step with
 * `apps/web/src/lib/api/tags.ts`: a tag nobody fetches with revalidates nothing.
 */
export function tagsFor(event: Pick<OutboxEnvelopeRow, 'type' | 'payload'>): string[] {
  const payload = (event.payload ?? {}) as Record<string, unknown>;
  const slug = typeof payload.slug === 'string' ? payload.slug : undefined;
  if (event.type === OUTBOX_EVENTS.PRODUCT_PUBLISHED) {
    return ['catalog', ...(slug ? [`product:${slug}`] : [])];
  }
  if (event.type === OUTBOX_EVENTS.REVIEW_MODERATED) {
    return slug ? [`product:${slug}`] : [];
  }
  if (event.type === OUTBOX_EVENTS.CONTENT_UPDATED) {
    return ['content', ...(slug ? [`page:${slug}`] : [])];
  }
  return [];
}

/** HMAC over the exact body sent, so the storefront can verify before revalidating. */
export function signRevalidation(body: string, secret: string): string {
  return createHmac('sha256', secret).update(body).digest('hex');
}

/**
 * Tells the storefront to drop cached pages when the catalog or content changes
 * (REQ-10, `04-architecture-api.md` §3). A failed call throws, so the outbox
 * retries it; a storefront that is down catches up through time-based revalidation.
 */
@Injectable()
export class RevalidationSubscriber implements OutboxHandler, OnModuleInit {
  readonly name = 'revalidation';
  private readonly logger = new Logger('RevalidationSubscriber');

  constructor(
    private readonly config: ConfigService<AppConfig, true>,
    private readonly dispatcher: OutboxDispatcher,
  ) {}

  onModuleInit(): void {
    if (!this.target()) {
      this.logger.log('disabled (WEB_REVALIDATE_URL or WEB_REVALIDATE_SECRET unset)');
      return;
    }
    this.dispatcher.register(this);
  }

  handles(type: string): boolean {
    return HANDLED.includes(type);
  }

  async handle(event: OutboxEnvelopeRow): Promise<void> {
    const target = this.target();
    const tags = tagsFor(event);
    if (!target || tags.length === 0) return;

    const body = JSON.stringify({ tags, issuedAt: new Date().toISOString() });
    const response = await fetch(target.url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-signature': signRevalidation(body, target.secret) },
      body,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!response.ok) {
      throw new Error(`storefront revalidation answered ${response.status} for ${tags.join(',')}`);
    }
  }

  private target(): { url: string; secret: string } | undefined {
    const url = this.config.get('WEB_REVALIDATE_URL', { infer: true });
    const secret = this.config.get('WEB_REVALIDATE_SECRET', { infer: true });
    return url && secret ? { url, secret } : undefined;
  }
}
