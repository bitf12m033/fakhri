import type { SortKey } from './api/types';

/**
 * PLP state lives in the URL (REQ-04: "URLs reflect state"), in the same syntax
 * the API accepts, so a listing URL can be shared, bookmarked and crawled:
 *
 *   ?q=inverter&brand=haier&brand=gree&attr=energy-type:inverter&attr=cooling-btu:12000..18000
 *   &minPrice=100000&maxPrice=200000&sort=price_asc&page=2
 */
export interface ListingState {
  q?: string;
  brands: string[];
  /** slug → spec, e.g. `inverter,fixed` or `12000..18000`. */
  attrs: Record<string, string>;
  minPrice?: string;
  maxPrice?: string;
  sort?: SortKey;
  page: number;
}

export type RawSearch = Record<string, string | string[] | undefined>;

export const SORTS: { value: SortKey; label: string; needsTerm?: boolean }[] = [
  { value: 'relevance', label: 'Best match', needsTerm: true },
  { value: 'newest', label: 'Newest' },
  { value: 'price_asc', label: 'Price: low to high' },
  { value: 'price_desc', label: 'Price: high to low' },
  { value: 'name_asc', label: 'Name: A to Z' },
];

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const PRICE = /^\d+(\.\d{1,2})?$/;
const ATTRIBUTE_NUMBER = /^\d+(\.\d{1,3})?$/;

function list(value: string | string[] | undefined): string[] {
  return (Array.isArray(value) ? value : value === undefined ? [] : [value])
    .flatMap((entry) => entry.split(','))
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function one(value: string | string[] | undefined): string | undefined {
  const first = Array.isArray(value) ? value[0] : value;
  return first?.trim() || undefined;
}

/** Tolerant parse: junk in a shared URL is dropped rather than turned into an API 400. */
export function parseListing(search: RawSearch): ListingState {
  const attrs: Record<string, string> = {};
  for (const spec of Array.isArray(search.attr) ? search.attr : search.attr ? [search.attr] : []) {
    const separator = spec.indexOf(':');
    const slug = spec.slice(0, separator);
    const body = spec.slice(separator + 1).trim();
    if (separator > 0 && SLUG.test(slug) && body && !(slug in attrs)) attrs[slug] = body;
  }
  // A numeric range filter's no-JS form posts these three instead of `attr`.
  const rangeSlug = one(search.attrRange);
  if (rangeSlug && SLUG.test(rangeSlug)) {
    const min = one(search.rangeMin);
    const max = one(search.rangeMax);
    const valid = (value: string | undefined) => value === undefined || ATTRIBUTE_NUMBER.test(value);
    if ((min || max) && valid(min) && valid(max)) attrs[rangeSlug] = `${min ?? ''}..${max ?? ''}`;
    else delete attrs[rangeSlug];
  }
  const sort = one(search.sort);
  const minPrice = one(search.minPrice);
  const maxPrice = one(search.maxPrice);
  const page = Number(one(search.page) ?? '1');
  return {
    q: one(search.q)?.slice(0, 80),
    brands: [...new Set(list(search.brand).filter((slug) => SLUG.test(slug)))].slice(0, 20),
    attrs: Object.fromEntries(Object.entries(attrs).slice(0, 12)),
    minPrice: minPrice && PRICE.test(minPrice) ? minPrice : undefined,
    maxPrice: maxPrice && PRICE.test(maxPrice) ? maxPrice : undefined,
    sort: SORTS.some((entry) => entry.value === sort) ? (sort as SortKey) : undefined,
    page: Number.isInteger(page) && page >= 1 && page <= 500 ? page : 1,
  };
}

export function toQuery(state: ListingState): URLSearchParams {
  const query = new URLSearchParams();
  if (state.q) query.set('q', state.q);
  for (const brand of state.brands) query.append('brand', brand);
  for (const [slug, spec] of Object.entries(state.attrs)) query.append('attr', `${slug}:${spec}`);
  if (state.minPrice) query.set('minPrice', state.minPrice);
  if (state.maxPrice) query.set('maxPrice', state.maxPrice);
  if (state.sort) query.set('sort', state.sort);
  if (state.page > 1) query.set('page', String(state.page));
  return query;
}

export function hrefFor(path: string, state: ListingState): string {
  const query = toQuery(state).toString();
  return query ? `${path}?${query}` : path;
}

/** Any filter change sends the shopper back to page 1. */
export function toggleBrand(state: ListingState, slug: string): ListingState {
  const brands = state.brands.includes(slug) ? state.brands.filter((b) => b !== slug) : [...state.brands, slug];
  return { ...state, brands, page: 1 };
}

export function toggleValue(state: ListingState, slug: string, value: string): ListingState {
  const current = state.attrs[slug]?.includes('..') ? [] : (state.attrs[slug]?.split(',') ?? []);
  const next = current.includes(value) ? current.filter((v) => v !== value) : [...current, value];
  const attrs = { ...state.attrs };
  if (next.length > 0) attrs[slug] = next.join(',');
  else delete attrs[slug];
  return { ...state, attrs, page: 1 };
}

export function selectedValues(state: ListingState, slug: string): string[] {
  const spec = state.attrs[slug];
  return !spec || spec.includes('..') ? [] : spec.split(',');
}

export function selectedRange(state: ListingState, slug: string): { min?: string; max?: string } {
  const spec = state.attrs[slug];
  if (!spec?.includes('..')) return {};
  const [min, max] = spec.split('..', 2);
  return { min: min || undefined, max: max || undefined };
}

export function withoutFilters(state: ListingState): ListingState {
  return { q: state.q, sort: state.sort, brands: [], attrs: {}, page: 1 };
}

export function hasFilters(state: ListingState): boolean {
  return state.brands.length > 0 || Object.keys(state.attrs).length > 0 || Boolean(state.minPrice || state.maxPrice);
}
