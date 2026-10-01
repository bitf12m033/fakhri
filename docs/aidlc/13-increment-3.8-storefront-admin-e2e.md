# AIDLC — Increment 3.8: Storefront, admin UI and E2E journeys (COMPLETED)

The Next.js app goes from scaffold to product: a mobile-first storefront over the public and customer
APIs, an RBAC admin console over every admin API from 3.2–3.7, a demo seed, and Playwright journeys that
drive both against a live API.

## Delivered

| Item | Location |
|---|---|
| BFF proxy: tokens in httpOnly cookies, CSRF header + origin check, token responses turned into cookies | `apps/web/src/app/bff/[...path]/route.ts` |
| Session refresh in middleware, single-flight per refresh token; `/admin` and `/account` gates | `apps/web/src/middleware.ts`, `src/lib/session/*` |
| Storefront: home, category/brand/search PLPs with facets, PDP, compare, cart, checkout, mock payment return, order tracking, content pages, sign-in (OTP + password), registration, account (profile, orders, addresses, wishlist) | `apps/web/src/app/(shop)/**` |
| Admin console: dashboard, orders (status, shipment, payment correction, invoice, packing list, label), products, categories + attribute bindings, brands, attributes + options, inventory (stock, adjustments, ledger, warehouses), coupons, reviews, content pages + banners, reports + CSV, admin users, audit log, outbox | `apps/web/src/app/admin/**` |
| SEO: canonical URLs, Product + BreadcrumbList JSON-LD, `sitemap.xml`, `robots.txt`, ISR with tag revalidation | `src/app/sitemap.ts`, `robots.ts`, `internal/revalidate/route.ts` |
| Outbox → storefront revalidation, HMAC-signed | `apps/api/src/modules/revalidation` |
| Guest order lookup, checkout quote | `POST /orders/lookup`, `POST /checkout/quote` |
| Demo seed: catalog, stock, coupons, pages, banners, one admin per role | `apps/api/src/scripts/seed.ts` (`npm run seed`) |
| Playwright journeys | `e2e/` (`npm run e2e`) |

## API surface added

| Method | Path | Access | REQ |
|---|---|---|---|
| POST | `/orders/lookup` `{ refNumber, phone }` | public, 10 per 5 min per reference | REQ-16 (guests) |
| POST | `/checkout/quote` `{ deliveryType, province? \| addressId? }` | guest or customer | REQ-20 |

`REVIEW_MODERATED` joins the event taxonomy. It is emitted when a review enters or leaves APPROVED.

## Design decisions

1. **Backend-for-frontend.** The browser never holds a token. `/bff/<path>` forwards to `/api/v1/<path>`
   with the bearer and cart token read from httpOnly, SameSite=Lax cookies. Login, registration, OTP
   verification and password change come back as `{ signedIn: true }` with the pair stored as cookies; the
   guest cart token is stripped from cart responses the same way. Non-GET calls need an `x-fakhri-bff`
   header, which no cross-site form can send, and a matching Origin. This closes 3.4's deferred
   "cookie sessions and CSRF".
2. **Refresh is single-flight.** Refresh tokens are strictly one-use: replaying one revokes the whole
   family (3.4). A page load fires several requests carrying the same refresh cookie, so the middleware
   rotates once per token and shares the result with every request that arrives within 30 s. Verified: four
   parallel requests with an expired access token shared one rotation, and the session survived. The map
   lives in process memory, which matches the single-VM deployment (DEC-09); scaling the storefront out
   needs it in Redis, or sticky sessions.
3. **Public pages never read cookies.** The header's account link and cart badge come from
   `GET /bff/session` after load, so the shell stays cacheable. Product and content pages are ISR (`●` in
   the build output); PLPs are dynamic because of their query strings, but their data fetches are cached
   and tagged.
4. **Revalidation by tag.** The API posts `{ tags, issuedAt }` with an HMAC over the exact body. The
   storefront refuses an unsigned body, one more than 5 minutes old, or one whose tags fall outside its
   `catalog`, `product:<slug>`, `content`, `page:<slug>` grammar. `PRODUCT_PUBLISHED`, `REVIEW_MODERATED`
   and `CONTENT_UPDATED` are mapped (`tagsFor`). With both env vars unset (the API tests), the subscriber
   is not registered at all.
5. **Filter state is the API's query syntax.** `?brand=…&attr=slug:a,b&attr=slug:min..max&minPrice=…`
   round-trips unchanged, so a listing URL is shareable and crawlable. Range filters are plain GET forms
   and work without JavaScript. Filtered views are `noindex, follow`, with the canonical on the unfiltered
   page.
6. **The admin console decides visibility, the API decides access.** Section visibility comes from the
   unverified role claim. A role without access sees an explanation, not a 403 page, and every request is
   still authorised by `AccessGuard`.
7. **No UI framework.** One stylesheet of custom properties; React and Next are the only runtime
   dependencies. The one new dev dependency is `@playwright/test`.

## Fixes to earlier increments found while building on them

- **A first-time guest's cart was lost** (3.5). `POST /cart/items` without a token created the cart and
  its token, then read the cart back using the request's empty token, so it answered with an empty cart
  and no token. Every API test supplies its own token, so the path was never exercised. A regression test
  now covers it.
- **The first saved address could end up not being the default** (3.4). An explicit `isDefault: false` on
  the first address broke "exactly one default". It is now always the default.
- **Taking a page down did not revalidate it** (3.7). Unpublishing or deleting a live page, and every
  banner change, now emits `CONTENT_UPDATED`. Before, a pulled page stayed public until the cache expired.
- **Banner image URLs** now follow the catalog's rule: protocol required, TLD optional. Before, they
  rejected `http://localhost` and accepted URLs with no protocol.
- **"Required attributes are missing"** now names the missing attributes in the message, not only in
  `details`.

## Deviations from the design docs

1. **`TRUST_PROXY` is opt-in and off in compose.** Every storefront call reaches the API from the
   storefront's address, so without it all shoppers share one rate-limit bucket. Next.js keeps a
   client-supplied `X-Forwarded-For` as-is, though (`??=` in its server). Trusting the hop is therefore
   only safe behind a reverse proxy that appends the real address, which Caddy and nginx do by default.
   The compose file exposes the storefront directly, so it leaves `TRUST_PROXY` unset. **Set it when
   the production proxy lands (3.9).**
2. **Declined online payments cannot be retried.** A FAILED payment is terminal (3.6), and nothing
   creates a second payment for the order. The order page says the order is on hold. Retry is a
   payments-domain change, recorded for 3.9.
3. **Page bodies render as plain-text paragraphs**, not HTML: the API stores them unsanitised, so
   rendering markup would be stored XSS. Banner links are free text in the API; the storefront only
   renders same-site paths or http(s) URLs.
4. **The sitemap lists content pages by a fixed list** (about, delivery, returns). There is no public
   page index endpoint.
5. **Images are plain `<img>` with explicit dimensions and eager/high priority on the LCP image**, not
   `next/image`. Media is SVG or remote with no optimiser behind it. The Lighthouse budget (REQ-36) is
   measured in 3.9.
6. **The mock gateway's return page posts the signed callback itself**, but only when the storefront has
   `PAYMENT_MOCK_SECRET`. Production must not set it.
7. **No CSP header yet.** The inline JSON-LD and Next's inline bootstrap need a nonce, which belongs with
   3.9's security headers. The other baseline headers are set in `next.config.mjs`.
8. **Admin gaps surfaced by the UI, left as API work:**
   - Coupon and banner edits cannot clear optional fields.
   - Page slugs are immutable.
   - The `maxAvailable` stock filter is applied after paging, so its counts are wrong. The UI says so and
     points at the low-stock report.
   - INVENTORY cannot look up a variant by SKU before it is stocked.
   - Sales reports group by UTC day.
   - There is no admin endpoint for the COD confirm-call flag; confirming the order stands in for it.

## Verified

- `npm run lint`, `npm run typecheck`, `npm run build` clean.
- The web production build succeeds with the API unreachable, as in an image build: prerendered routes
  fall back to empty data and heal on revalidation.
- `prisma migrate diff`: no difference.
- `npm test`: 153 tests (shared 9, API 144). New tests cover:
  - Revalidation tag mapping and signing.
  - A first-time guest receiving a cart token.
  - The checkout quote agreeing with the placed order and reserving nothing.
  - Guest lookup, with a wrong phone and an unknown reference indistinguishable, and account orders
    unreachable.
  - The first address being the default whatever the request says.
- `npm run e2e`: **10 journeys on a mobile viewport (Pixel 7)** against the API and a production build of
  the storefront on their own ports:
  1. Category nav, composable facets with URL state, a no-JS range filter, sorting, and a PDP with specs
     and JSON-LD.
  2. Search suggestions, and compare with clear.
  3. Brand page, variant selection, and a content page.
  4. **Guest checkout with WELCOME10 and COD.** Zone/weight fee and total, then the operator confirms,
     packs, creates the shipment, marks it in transit and delivered, cash is collected and the invoice
     printed. A guest on another device tracks it to delivery; a wrong phone learns nothing.
  5. **Declined online payment** (JazzCash): the order is put on hold and says so.
  6. **Successful online payment** (Easypaisa): the order is confirmed and paid.
  7. **Customer:**
     - registers;
     - first address becomes the default;
     - wishlist;
     - checks out against the saved address with a three-band weight fee;
     - order history;
     - review moderated in the console, then shown on the cached PDP through `REVIEW_MODERATED`
       revalidation;
     - sign-out ends the session.
  8. OTP sign-in.
  9. Admin RBAC: anonymous redirect, a role's menu, a typed URL refused, sign-out.
  10. **An edit to a live, cached content page reaching the storefront through revalidation.**
- The last five suite runs were consecutive and green. One earlier run failed the revalidation journey
  while a second API (the dev server) was polling the same database. That API had revalidation
  disabled and can claim the event first, marking it published without telling the storefront. All five
  green runs came after it was stopped. **Do not run `npm run e2e` while another API instance uses
  the same database**; testcontainers (3.9) removes the shared state for good.

## Operational notes

- **Seed:** `npm run seed` builds the API and runs `dist/scripts/seed.js`. It creates the demo catalog
  and one admin per role (`super@`, `catalog@`, `inventory@`, `orders@`, `marketing@`,
  `support@fakhri.test`), all with `SEED_ADMIN_PASSWORD` (default `Fakhri-dev-passw0rd`). It refuses to
  run with `NODE_ENV=production` and is safe to re-run. It runs from compiled output because the API's
  dependency injection needs decorator metadata, which `tsx` does not emit.
- **E2E:** `npm run e2e`. One-time setup: `npx playwright install chromium`. It needs Postgres and Redis
  up and `apps/api/.env`. It starts its own API on :3100 and builds the storefront into `.next-e2e`,
  serving it on :3101, so the dev servers' `.next` is untouched. Global setup clears rate-limit buckets
  and tops up the stock the journeys buy.
- **Revalidation:** set `WEB_REVALIDATE_URL` and `WEB_REVALIDATE_SECRET` on the API and the same secret as
  `REVALIDATE_SECRET` on the storefront.

## Not in this increment

- Payment retry after a decline; a public content-page index; media upload; CSP with nonces.
- Testcontainers, Lighthouse/k6 budgets, `npm audit`/Trivy gates, the production reverse proxy and its
  `TRUST_PROXY` setting, a Redis-backed refresh single-flight if the storefront scales out (3.9).

## Next

3.9 hardening: isolated test databases, load and Lighthouse budgets, the reverse proxy and security
headers, observability, docs sync.
