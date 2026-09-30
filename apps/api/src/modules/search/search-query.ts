import { invalidInput } from '@fakhri/shared';

/** Bounds on a single public search request (REQ-38: nothing unbounded). */
export const SEARCH_LIMITS = {
  termLength: 80,
  attributeFilters: 12,
  valuesPerFilter: 20,
  brandFilters: 20,
  suggestions: 10,
  facetValues: 50,
  facetCategories: 20,
  compareMin: 2,
  compareMax: 4,
} as const;

export const SORT_KEYS = ['relevance', 'newest', 'price_asc', 'price_desc', 'name_asc'] as const;
export type SortKey = (typeof SORT_KEYS)[number];

export interface Range {
  min?: string;
  max?: string;
}

/** One `attr=<slug>:<spec>` filter. `range` is set for `a..b` specs, `values` otherwise. */
export interface AttributeFilter {
  slug: string;
  values: string[];
  range?: Range;
}

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const PRICE = /^\d+(\.\d{1,2})?$/;
const ATTRIBUTE_NUMBER = /^\d+(\.\d{1,3})?$/;

export function parseTerm(raw: string | undefined): string | undefined {
  const term = raw?.trim();
  if (!term) return undefined;
  if (term.length > SEARCH_LIMITS.termLength) {
    throw invalidInput(`q must be at most ${SEARCH_LIMITS.termLength} characters`);
  }
  return term;
}

/** Relevance only means something with a term; without one the default is newest. */
export function parseSort(raw: string | undefined, hasTerm: boolean): SortKey {
  if (!raw) return hasTerm ? 'relevance' : 'newest';
  if (!(SORT_KEYS as readonly string[]).includes(raw)) {
    throw invalidInput('Unknown sort', { sort: raw, allowed: SORT_KEYS });
  }
  const sort = raw as SortKey;
  if (sort === 'relevance' && !hasTerm) return 'newest';
  return sort;
}

export function parseSlugList(raw: string | string[] | undefined, field: string, limit: number): string[] {
  const parts = (Array.isArray(raw) ? raw : raw === undefined ? [] : [raw])
    .flatMap((value) => value.split(','))
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
  if (parts.length > limit) throw invalidInput(`At most ${limit} ${field} filters are allowed`);
  for (const part of parts) {
    if (!SLUG.test(part)) throw invalidInput(`${field} must be slugs`, { value: part });
  }
  return [...new Set(parts)];
}

export function parsePrice(min: string | undefined, max: string | undefined): Range | undefined {
  if (!min?.trim() && !max?.trim()) return undefined;
  return parseRange(min, max, PRICE, 'price');
}

export function parseAttributeFilters(raw: string | string[] | undefined): AttributeFilter[] {
  const specs = (Array.isArray(raw) ? raw : raw === undefined ? [] : [raw])
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
  if (specs.length > SEARCH_LIMITS.attributeFilters) {
    throw invalidInput(`At most ${SEARCH_LIMITS.attributeFilters} attribute filters are allowed`);
  }

  const filters: AttributeFilter[] = [];
  const seen = new Set<string>();
  for (const spec of specs) {
    const separator = spec.indexOf(':');
    if (separator <= 0 || separator === spec.length - 1) {
      throw invalidInput('Attribute filter must look like attr=<slug>:<value>', { filter: spec });
    }
    const slug = spec.slice(0, separator);
    const body = spec.slice(separator + 1);
    if (!SLUG.test(slug)) throw invalidInput('Attribute filter slug is invalid', { filter: spec });
    if (seen.has(slug)) throw invalidInput('Duplicate attribute filter', { slug });
    seen.add(slug);

    if (body.includes('..')) {
      const [min, max] = body.split('..', 2);
      filters.push({ slug, values: [], range: parseRange(min, max, ATTRIBUTE_NUMBER, slug) });
      continue;
    }

    const values = [...new Set(body.split(',').map((value) => value.trim()).filter((value) => value.length > 0))];
    if (values.length === 0) throw invalidInput('Attribute filter has no value', { slug });
    if (values.length > SEARCH_LIMITS.valuesPerFilter) {
      throw invalidInput(`At most ${SEARCH_LIMITS.valuesPerFilter} values per attribute filter`, { slug });
    }
    filters.push({ slug, values });
  }
  return filters;
}

export function parseCompareIds(raw: string | undefined): string[] {
  const ids = [...new Set((raw ?? '').split(',').map((id) => id.trim()).filter((id) => id.length > 0))];
  if (ids.length < SEARCH_LIMITS.compareMin || ids.length > SEARCH_LIMITS.compareMax) {
    throw invalidInput(
      `Compare needs between ${SEARCH_LIMITS.compareMin} and ${SEARCH_LIMITS.compareMax} products`,
      { count: ids.length },
    );
  }
  return ids;
}

function parseRange(min: string | undefined, max: string | undefined, pattern: RegExp, field: string): Range {
  const range: Range = {};
  const lower = min?.trim();
  const upper = max?.trim();
  if (lower) {
    if (!pattern.test(lower)) throw invalidInput(`${field} minimum must be a non-negative number`, { value: lower });
    range.min = lower;
  }
  if (upper) {
    if (!pattern.test(upper)) throw invalidInput(`${field} maximum must be a non-negative number`, { value: upper });
    range.max = upper;
  }
  if (range.min === undefined && range.max === undefined) {
    throw invalidInput(`${field} range needs a minimum or a maximum`);
  }
  if (range.min !== undefined && range.max !== undefined && Number(range.min) > Number(range.max)) {
    throw invalidInput(`${field} minimum must not exceed the maximum`, { min: range.min, max: range.max });
  }
  return range;
}
