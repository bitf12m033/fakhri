# AIDLC — Increment 3.3: Search + public read APIs (COMPLETED)

Storefront reads over the 3.2 catalog: nav, brand pages, PLP search with facets, PDP and compare.
No authentication and no UI yet.

## Delivered

| Item | Location |
|---|---|
| Migration: `searchDocument` + `searchVector` on `Product`, GIN indexes (tsvector, trigram on document and name), boolean/price facet indexes, one-time backfill | `packages/prisma/prisma/migrations/20260930170506_search_support` |
| Search document maintenance — set-based recompute per product, brand or category, run inside the mutating transaction | `apps/api/src/modules/catalog/search-document.service.ts` |
| Storefront projections — nav tree, brand pages, PLP cards, PDP, compare, availability | `apps/api/src/modules/catalog/public` |
| Product search — filters, sorts, facets, suggestions | `apps/api/src/modules/search` |
| Query parsing and request bounds as pure functions | `apps/api/src/modules/search/search-query.ts` |
| Admin full reindex | `POST /api/v1/admin/search/reindex` |
| Parser tests + storefront/search API tests | `apps/api/test/search-query.spec.ts`, `apps/api/test/storefront.spec.ts` |

## API surface (public, no auth)

| Method | Path | Purpose | REQ |
|---|---|---|---|
| GET | `/categories` | active nav tree, product counts rolled up into ancestors | REQ-01 |
| GET | `/categories/:slug/tree` | one category, its breadcrumb and its subtree | REQ-01 |
| GET | `/brands` | active brands that have visible products, paginated | REQ-02 |
| GET | `/brands/:slug` | brand page | REQ-02 |
| GET | `/products` | search + facet filtering, paginated | REQ-04/09 |
| GET | `/products/suggest?q=` | products, brands and categories for autocomplete | REQ-09 |
| GET | `/products/:slug` | PDP: spec table, gallery, prices, availability | REQ-05 |
| GET | `/compare?ids=` | 2–4 products on shared comparable attributes | REQ-08 |

Success stays `{ data }` / `{ data, meta }`; failures stay `{ error: { code, message, details, traceId } }`.
Facets ride in `meta.facets` so the envelope is unchanged.

### `GET /products` query

- `q` — free text, ≤80 chars.
- `category=<slug>` — the category **and its descendants**.
- `brand=<slug>` — repeatable or comma-separated, multi-select.
- `attr=<attributeSlug>:<spec>` — repeatable. `a,b` selects option/text values, `true`/`false` a boolean,
  `min..max` / `min..` / `..max` a numeric range.
- `minPrice` / `maxPrice` — matched against active variant prices.
- `sort` — `relevance` (default with `q`), `newest` (default without), `price_asc`, `price_desc`, `name_asc`.
- `page` / `pageSize` — clamped by `@fakhri/shared` (REQ-38).

Bounds: 12 attribute filters, 20 values each, 20 brands, 50 facet values, 20 facet categories.
Anything malformed is `INVALID_INPUT`; an unknown category slug is `NOT_FOUND`.

## Rules enforced

- Visible means `status = ACTIVE`, an active brand, an active category, and at least one active variant.
  DRAFT and ARCHIVED products are absent from every public route, including `/products/:slug` (404).
- `costPrice` is never serialized on a public route. The storefront projections are a separate module
  from the admin serializers, and the PDP and compare tests assert the field and its value are absent.
- Availability per variant is `IN_STOCK` when `sum(onHand - reserved) > 0` across active warehouses,
  else `AVAILABLE_ON_ORDER` when the variant allows it, else `OUT_OF_STOCK`. A product shows the best
  availability among its variants.
- Matching is threefold and recall-oriented: `plainto_tsquery` over the tsvector, `ILIKE` over the
  trigram index for substrings, and `word_similarity` for typos. Precision comes from ordering —
  `ts_rank`, then word similarity, then featured, then recency.
- Facet counts: brand, price and attribute facets drop their own filter, so multi-select stays additive
  (selecting one brand still shows what the other brands would add). The category facet keeps the
  current selection, because it refines navigation instead of widening it.
- The filter panel is the filterable part of the category attribute template, inherited bindings included.
  Without a category selection it is the union of the templates of the categories the result set spans.
- Compare takes 2–4 ids and keeps a row only when the attribute is comparable for every product in the
  set and at least one of them has a value.
- The search document covers name, brand, category, tags, SKUs and the labels/values/units of
  `isSearchable` attributes, at both product and variant scope.

## Deviations from the design docs

1. **`search_document` is a plain column, not a generated one.** `docs/aidlc/03-schema-design.md` §8 calls for
   a generated column over "title + brand name + attribute labels/values", which Postgres cannot express:
   a generated column may only read its own row. The catalog module recomputes the document (and its
   tsvector) with one set-based statement inside the transaction that changed the data, so the index is
   never stale and needs no queue.
2. **No async reindex on `PRODUCT_PUBLISHED` yet.** The module map has the search module consuming that
   event, but there is no outbox dispatcher until workers land. 3.2 still writes the event; the refresh can
   move behind it later without touching the query side. A stale or missing document degrades gracefully —
   search still matches `Product.name` through its own trigram index — and `POST /admin/search/reindex`
   rebuilds everything.
3. **Public product routes live in the search module**, which depends on the catalog module (the direction
   the module map gives: search consumes catalog). `/products`, `/products/suggest` and `/products/:slug`
   share one controller so the literal `suggest` route is declared before `:slug`.
4. **`GET /categories` is not paginated.** The nav tree is bounded by the category tree itself (depth is
   capped at 32) and a nested list is what the storefront needs. Every other list endpoint is paginated.
5. **Filtering is allowed on any typed attribute**, while only filterable bindings appear as facets.
   `JSON` attributes cannot be filtered.
6. **eslint now ignores `next-env.d.ts`.** The file is regenerated by `next build` and was failing
   repo-wide lint before this increment.

## Not in this increment

- Authentication and RBAC (3.4). `/admin/search/reindex` is open like the rest of `/admin`.
- Reviews and ratings on the PDP (3.7), cart/checkout links from the PDP (3.5).
- Storefront and admin UI (3.8).
- Response caching, rate limiting and load tuning (3.9). A search request currently issues roughly a
  dozen queries; the facet queries are the obvious thing to consolidate when that is measured.

## Verified

- `npm run lint` clean, `npm run typecheck` clean, `npm run build` clean
- `npm test` with Node 22 → 42 tests: shared 9, API 33 (17 query-parser, 8 storefront/search e2e,
  4 catalog rules, 2 catalog API, 2 health)
- Migration applied to the dev database; all five new indexes present in PostgreSQL
- e2e covers: nav tree roll-up, brand pages, drafts invisible, brand-token and substring matching,
  subtree listing, facet counts that compose with drop-self semantics, price/brand/attribute filters,
  all five sorts, pagination meta, the three availability states, a PDP with no `costPrice`, compare
  rows, suggestions, malformed-query rejection, and document freshness after a product update and a
  full reindex

## Next

3.4 customers/auth/RBAC + addresses/wishlist → 3.5 cart/checkout/orders/inventory reservation.
