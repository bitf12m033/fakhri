import { describe, expect, it } from 'vitest';
import { buildMeta, normalizePageSize, normalizePagination, paginate, slugify } from '../src/index';

describe('paging (REQ-38)', () => {
  it('clamps page size and page', () => {
    expect(normalizePageSize(undefined)).toBe(20);
    expect(normalizePageSize(0)).toBe(20);
    expect(normalizePageSize(1000)).toBe(100);
    const p = normalizePagination({ page: 2, pageSize: 10 });
    expect(p).toEqual({ page: 2, pageSize: 10, skip: 10, take: 10 });
  });

  it('builds correct meta and slices', () => {
    const items = Array.from({ length: 25 }, (_, i) => i);
    const res = paginate(items, { page: 2, pageSize: 10 });
    expect(res.items).toHaveLength(10);
    expect(res.meta).toMatchObject({ page: 2, pageSize: 10, totalItems: 25, totalPages: 3 });
    expect(buildMeta(0, 0, 10).totalPages).toBe(1);
  });
});

describe('slugify', () => {
  it('produces clean slugs', () => {
    expect(slugify('Haier 1.5 Ton Inverter AC (T3) — 2026')).toBe('haier-15-ton-inverter-ac-t3-2026');
    expect(slugify('  Double   Door Refrigerator  ')).toBe('double-door-refrigerator');
    expect(slugify('').length).toBe(0);
  });
});