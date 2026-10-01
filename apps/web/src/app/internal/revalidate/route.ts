import { createHmac, timingSafeEqual } from 'node:crypto';
import { revalidateTag } from 'next/cache';
import { NextRequest, NextResponse } from 'next/server';

/**
 * On-demand revalidation (REQ-10). The API's RevalidationSubscriber posts
 * `{ tags, issuedAt }` signed with the shared REVALIDATE_SECRET when the catalog
 * or content changes. Anything unsigned, stale or malformed is refused.
 */
export const dynamic = 'force-dynamic';

const MAX_AGE_MS = 5 * 60 * 1000;
const TAG = /^[a-z]+(?::[a-z0-9-]+)?$/;

export async function POST(request: NextRequest): Promise<NextResponse> {
  const secret = process.env.REVALIDATE_SECRET;
  if (!secret || secret.length < 32) return NextResponse.json({ error: 'disabled' }, { status: 404 });

  const raw = await request.text();
  const given = Buffer.from(request.headers.get('x-signature') ?? '', 'utf8');
  const want = Buffer.from(createHmac('sha256', secret).update(raw).digest('hex'), 'utf8');
  if (given.length !== want.length || !timingSafeEqual(given, want)) {
    return NextResponse.json({ error: 'bad signature' }, { status: 401 });
  }

  let body: { tags?: unknown; issuedAt?: unknown };
  try {
    body = JSON.parse(raw) as typeof body;
  } catch {
    return NextResponse.json({ error: 'bad body' }, { status: 400 });
  }
  const issuedAt = typeof body.issuedAt === 'string' ? Date.parse(body.issuedAt) : NaN;
  // A captured request cannot be replayed forever.
  if (!Number.isFinite(issuedAt) || Math.abs(Date.now() - issuedAt) > MAX_AGE_MS) {
    return NextResponse.json({ error: 'stale' }, { status: 400 });
  }
  const tags = Array.isArray(body.tags) ? body.tags.filter((tag): tag is string => typeof tag === 'string') : [];
  if (tags.length === 0 || tags.length > 20 || !tags.every((tag) => TAG.test(tag))) {
    return NextResponse.json({ error: 'bad tags' }, { status: 400 });
  }

  for (const tag of tags) revalidateTag(tag);
  return NextResponse.json({ revalidated: tags });
}
