import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { OUTBOX_EVENTS } from '../src/outbox/event-types';
import { signRevalidation, tagsFor } from '../src/modules/revalidation/revalidation.subscriber';

/** Which storefront cache tags each event drops (increment 3.8). Keep in step with apps/web lib/api/tags.ts. */
describe('storefront revalidation rules', () => {
  it('maps catalog, review and content events to the tags the storefront fetches with', () => {
    expect(tagsFor({ type: OUTBOX_EVENTS.PRODUCT_PUBLISHED, payload: { slug: 'haier-ac' } })).toEqual([
      'catalog',
      'product:haier-ac',
    ]);
    expect(tagsFor({ type: OUTBOX_EVENTS.REVIEW_MODERATED, payload: { slug: 'haier-ac' } })).toEqual([
      'product:haier-ac',
    ]);
    expect(tagsFor({ type: OUTBOX_EVENTS.CONTENT_UPDATED, payload: { slug: 'returns' } })).toEqual([
      'content',
      'page:returns',
    ]);
  });

  it('ignores events the storefront does not cache, and payloads without a slug', () => {
    expect(tagsFor({ type: OUTBOX_EVENTS.ORDER_CREATED, payload: { slug: 'x' } })).toEqual([]);
    expect(tagsFor({ type: OUTBOX_EVENTS.PRODUCT_PUBLISHED, payload: {} })).toEqual(['catalog']);
    expect(tagsFor({ type: OUTBOX_EVENTS.REVIEW_MODERATED, payload: null })).toEqual([]);
  });

  it('signs the exact body with HMAC-SHA256, as the storefront verifies it', () => {
    const body = JSON.stringify({ tags: ['catalog'], issuedAt: '2026-10-01T00:00:00.000Z' });
    const secret = 'a'.repeat(32);
    expect(signRevalidation(body, secret)).toBe(createHmac('sha256', secret).update(body).digest('hex'));
    expect(signRevalidation(`${body} `, secret)).not.toBe(signRevalidation(body, secret));
  });
});
