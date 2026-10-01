import Link from 'next/link';
import { ProductCard } from '@/components/ProductCard';
import { EmptyState, Notice, Pagination } from '@/components/ui';
import { ApiError } from '@/lib/api/errors';
import { publicApi } from '@/lib/api/server';
import { TAGS } from '@/lib/api/tags';
import type { AttributeFacet, ProductCard as Card, SearchMeta } from '@/lib/api/types';
import { pkr } from '@/lib/format';
import {
  hasFilters,
  hrefFor,
  ListingState,
  selectedRange,
  selectedValues,
  SORTS,
  toggleBrand,
  toggleValue,
  toQuery,
  withoutFilters,
} from '@/lib/listing';
import { SortSelect } from './SortSelect';

const PAGE_SIZE = 24;

/**
 * Product listing with facets, shared by category, brand and search pages
 * (REQ-04/07/09). Facets come from the same response as the products, so the
 * counts always describe the result set on screen.
 */
export async function Listing({
  path,
  state,
  scope,
}: {
  /** Page path the facet links point back to. */
  path: string;
  state: ListingState;
  /** Fixed by the page itself rather than chosen by the shopper. */
  scope: { category?: string; brand?: string };
}) {
  const query = toQuery({ ...state, page: 1 });
  if (scope.category) query.set('category', scope.category);
  if (scope.brand) query.set('brand', scope.brand);
  query.set('page', String(state.page));
  query.set('pageSize', String(PAGE_SIZE));

  let result: { data: Card[]; meta: SearchMeta };
  try {
    result = await publicApi<Card[], SearchMeta>(`/products?${query}`, { tags: [TAGS.catalog] });
  } catch (error) {
    if (error instanceof ApiError && error.status === 400) {
      return (
        <Notice tone="warn">
          Those filters could not be applied: {error.message}. <Link href={path}>Clear filters</Link>
        </Notice>
      );
    }
    throw error;
  }
  const { data: products, meta } = result;
  const facets = meta.facets;

  return (
    <div className="sidebar-layout">
      <aside className="facets" aria-label="Filters">
        <div className="spread">
          <h2 style={{ margin: 0 }}>Filters</h2>
          {hasFilters(state) ? (
            <Link href={hrefFor(path, withoutFilters(state))} className="small">
              Clear all
            </Link>
          ) : null}
        </div>

        {!scope.brand && facets.brands.length > 0 ? (
          <fieldset>
            <legend>Brand</legend>
            <ul className="facet-list">
              {facets.brands.map((brand) => {
                const active = state.brands.includes(brand.value);
                return (
                  <li key={brand.value}>
                    <Link href={hrefFor(path, toggleBrand(state, brand.value))} aria-current={active ? 'true' : undefined} rel="nofollow">
                      <span>{brand.label}</span>
                      <span className="muted small">{brand.count}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </fieldset>
        ) : null}

        <PriceFilter path={path} state={state} range={facets.price} />

        {facets.attributes.map((facet) => (
          <AttributeFilter key={facet.slug} path={path} state={state} facet={facet} />
        ))}
      </aside>

      <section aria-label="Products" className="stack">
        <div className="spread">
          <p className="muted" style={{ margin: 0 }} data-testid="result-count">
            {meta.totalItems} {meta.totalItems === 1 ? 'product' : 'products'}
          </p>
          <SortSelect
            value={meta.sort}
            options={SORTS.filter((sort) => !sort.needsTerm || state.q)}
          />
        </div>
        {products.length === 0 ? (
          <EmptyState title="No products match">
            <p>Try removing a filter or searching for something broader.</p>
          </EmptyState>
        ) : (
          <div className="grid">
            {products.map((product, index) => (
              <ProductCard key={product.id} product={product} priority={index < 4} />
            ))}
          </div>
        )}
        <Pagination
          page={meta.page}
          totalPages={meta.totalPages}
          hrefFor={(page) => hrefFor(path, { ...state, page })}
        />
      </section>
    </div>
  );
}

function AttributeFilter({ path, state, facet }: { path: string; state: ListingState; facet: AttributeFacet }) {
  if (facet.range) {
    const current = selectedRange(state, facet.slug);
    return (
      <fieldset>
        <legend>
          {facet.name}
          {facet.unit ? ` (${facet.unit})` : ''}
        </legend>
        <RangeForm
          path={path}
          state={state}
          keep={(next) => {
            const attrs = { ...next.attrs };
            delete attrs[facet.slug];
            return { ...next, attrs };
          }}
          name={`attr-${facet.slug}`}
          min={current.min}
          max={current.max}
          placeholder={facet.range}
          attrSlug={facet.slug}
        />
      </fieldset>
    );
  }
  if (facet.values.length === 0) return null;
  const selected = selectedValues(state, facet.slug);
  return (
    <fieldset>
      <legend>{facet.name}</legend>
      <ul className="facet-list">
        {facet.values.map((value) => {
          const active = selected.includes(value.value);
          return (
            <li key={value.value}>
              <Link
                href={hrefFor(path, toggleValue(state, facet.slug, value.value))}
                aria-current={active ? 'true' : undefined}
                rel="nofollow"
              >
                <span>
                  {value.label}
                  {facet.unit ? ` ${facet.unit}` : ''}
                </span>
                <span className="muted small">{value.count}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </fieldset>
  );
}

function PriceFilter({
  path,
  state,
  range,
}: {
  path: string;
  state: ListingState;
  range: { min: string; max: string } | null;
}) {
  if (!range && !state.minPrice && !state.maxPrice) return null;
  return (
    <fieldset>
      <legend>Price (Rs)</legend>
      {range ? (
        <p className="small muted" style={{ margin: '0.25rem 0' }}>
          {pkr(range.min)} – {pkr(range.max)}
        </p>
      ) : null}
      <RangeForm
        path={path}
        state={state}
        keep={(next) => ({ ...next, minPrice: undefined, maxPrice: undefined })}
        name="price"
        min={state.minPrice}
        max={state.maxPrice}
        placeholder={range ? { min: range.min.split('.')[0]!, max: range.max.split('.')[0]! } : null}
      />
    </fieldset>
  );
}

/**
 * A plain GET form, so range filters work without JavaScript. Other filters ride
 * along as hidden inputs; this range's own inputs replace any previous value.
 */
function RangeForm({
  path,
  state,
  keep,
  name,
  min,
  max,
  placeholder,
  attrSlug,
}: {
  path: string;
  state: ListingState;
  keep: (state: ListingState) => ListingState;
  name: string;
  min?: string;
  max?: string;
  placeholder: { min: string; max: string } | null;
  attrSlug?: string;
}) {
  const hidden = [...toQuery({ ...keep(state), page: 1 }).entries()];
  return (
    <form method="get" action={path} className="row" style={{ marginTop: '0.4rem' }}>
      {hidden.map(([key, value], index) => (
        <input key={`${key}-${index}`} type="hidden" name={key} value={value} />
      ))}
      {attrSlug ? <input type="hidden" name="attrRange" value={attrSlug} /> : null}
      <label className="visually-hidden" htmlFor={`${name}-min`}>
        Minimum
      </label>
      <input
        id={`${name}-min`}
        name={attrSlug ? 'rangeMin' : 'minPrice'}
        inputMode="decimal"
        defaultValue={min}
        placeholder={placeholder?.min ?? 'Min'}
        style={{ width: '6.5rem' }}
      />
      <label className="visually-hidden" htmlFor={`${name}-max`}>
        Maximum
      </label>
      <input
        id={`${name}-max`}
        name={attrSlug ? 'rangeMax' : 'maxPrice'}
        inputMode="decimal"
        defaultValue={max}
        placeholder={placeholder?.max ?? 'Max'}
        style={{ width: '6.5rem' }}
      />
      <button type="submit" className="secondary small">
        Go
      </button>
    </form>
  );
}
