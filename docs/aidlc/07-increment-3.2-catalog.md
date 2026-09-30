# AIDLC — Increment 3.2: Catalog core (COMPLETED)

Admin CRUD for the hybrid catalog. No storefront and no public search yet.

## Delivered

| Item | Location |
|---|---|
| Categories: tree, cycle guard, CRUD, direct bindings, inherited attribute template | `apps/api/src/modules/catalog/categories` |
| Brands CRUD | `apps/api/src/modules/catalog/brands` |
| Attributes, typed validation rules, options | `apps/api/src/modules/catalog/attributes` |
| Products, variants, images, product- and variant-scoped attribute values | `apps/api/src/modules/catalog/products` |
| Publish gate, `PRODUCT_PUBLISHED` outbox event, audit log on every mutation | product update/create |
| Rule tests + API tests | `apps/api/test/catalog-rules.spec.ts`, `apps/api/test/catalog.spec.ts` |

Admin routes live under `/api/v1/admin`. Success responses are `{ data }` or `{ data, meta }` for paginated lists. Failures use the existing `{ error: { code, message, details, traceId } }` contract.

## Rules enforced

- Category parent cannot create a cycle. A category with children or products cannot be deleted.
- Child category bindings override the same attribute inherited from an ancestor. The product form template is `GET /admin/categories/:id/attribute-template`.
- Attribute type cannot change after options or values exist. Options exist only on `OPTION` attributes.
- A product attribute value sets exactly one typed column, matching the attribute type, including numeric min/max/step and text pattern. Variant values stay on the variant (`productId` null) and do not satisfy product-level required specs.
- `ACTIVE` requires an active brand, an active category, at least one active variant, and every required binding (including inherited). The first transition to `ACTIVE` sets `publishedAt` and writes `PRODUCT_PUBLISHED`.
- `compareAtPrice` must be greater than or equal to `price`. `costPrice` is stored and returned on the admin API only; the public read API in 3.3 must omit it.

## Not in this increment

- Authentication and RBAC (3.4). These admin routes are open, and audit rows use actor type `ADMIN` with no actor id.
- Public category, brand, search, and PDP reads (3.3).
- Storefront and admin UI (3.8).

## Verified

- `npm run typecheck` clean
- ESLint clean on the catalog module and new tests
- `npm test` with Node 22: shared 9, API 8 (4 rule tests, 2 catalog API tests, 2 health tests)

## Next

3.3 search and public read APIs (Postgres FTS/trgm + facets) → 3.4 customers/auth/RBAC.
