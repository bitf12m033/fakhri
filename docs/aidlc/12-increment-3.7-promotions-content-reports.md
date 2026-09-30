# AIDLC — Increment 3.7: Coupons, reviews, content and reports (COMPLETED)

Coupons applied end to end (closing the zero-discount gap left by 3.5), moderated product reviews,
content pages and banners, admin reports with CSV export, and audit-log search.

## Delivered

| Item | Location |
|---|---|
| Coupon evaluation rules (types, window, minimum, targeting, caps) | `apps/api/src/modules/promotions/coupon-rules.ts` |
| Coupon admin CRUD with usage stats, plus atomic redemption | `apps/api/src/modules/promotions/coupons.service.ts` |
| `POST/DELETE /cart/coupon` with a live discount preview | `apps/api/src/modules/cart` |
| Checkout discount + free shipping + redemption in the order transaction | `apps/api/src/modules/checkout/checkout.service.ts` |
| Reviews: purchase requirement, verified badge, moderation, public summary | `apps/api/src/modules/reviews` |
| Content pages and banners with scheduling and targeting | `apps/api/src/modules/content` |
| Sales, top-product, low-stock and COD reports with CSV export | `apps/api/src/modules/reporting` |
| Audit-log search | `apps/api/src/audit/audit-logs.controller.ts` |
| PDP rating summary | `apps/api/src/modules/catalog/public/storefront.service.ts` |
| Unit and e2e tests | `promotions-rules.spec.ts`, `promotions.spec.ts`, `reviews-content.spec.ts`, `reports.spec.ts` |

## API surface

| Method | Path | Access | REQ |
|---|---|---|---|
| POST/DELETE | `/cart/coupon` | guest or customer | REQ-22 |
| CRUD | `/admin/coupons` | MARKETING | REQ-32 |
| GET | `/reviews?productId=` | public | REQ-17 |
| POST | `/reviews` | customer, 10/hour per account | REQ-17 |
| GET/PATCH | `/admin/reviews` `/admin/reviews/:id` | MARKETING, SUPPORT | REQ-17 |
| GET | `/pages/:slug` `/banners?position=` | public | REQ-33 |
| CRUD | `/admin/content/pages` `/admin/content/banners` | MARKETING | REQ-33 |
| GET | `/admin/reports/sales` `/top-products` `/low-stock` `/cod-outstanding` (`?format=csv`) | ORDERS | REQ-35 |
| GET | `/admin/audit-logs` | SUPER_ADMIN | REQ-34 |

## Rules enforced

- **Coupons.** One code per cart. The code is validated before it is stored, so an invalid one never
  sticks. FIXED never exceeds the eligible subtotal, PERCENT respects `maxDiscount`, and FREE_SHIPPING
  zeroes the delivery fee instead of discounting items — so no total can go negative.
- Targeting by product, brand or category, where a category coupon covers that category's **whole
  subtree**: a coupon on "Appliances" reaches the air conditioners beneath it.
- The cart re-evaluates its stored code on every read. A code that stopped qualifying is reported as
  `couponIssue` rather than throwing, so the cart still loads and the storefront can explain itself.
- Checkout re-evaluates rather than trusting the cart: prices, stock and eligibility all move. A code that
  no longer qualifies fails the checkout, because the customer was shown a total and deserves to be told.
- Redemption happens inside the order transaction under the coupon's row lock, and `CouponUsage.orderId`
  is unique — so the usage caps hold under concurrency and a replayed checkout cannot double-count.
- A redeemed coupon cannot be deleted, only deactivated: its usage rows are part of the order record.
- **Reviews.** Only a customer who ordered the product may review it, once. The verified badge needs an
  order that reached DELIVERED, not merely one that was placed. Nothing is public before an admin approves
  it, and public reviews carry a first name only.
- **Content.** A draft page is not readable by guessing its slug. Publishing (and editing a live page)
  emits `CONTENT_UPDATED`, which is what will drive storefront revalidation in 3.8. Banners show only when
  active and inside their schedule window.
- **Reports.** Money is summed in SQL and cast to text, so a total never passes through a float on its way
  to a spreadsheet. Cancelled orders are excluded from revenue unless asked for by status. Windows default
  to 30 days and are capped at 400. CSV escapes quotes, commas and newlines, and prefixes a leading
  `=`, `+`, `-` or `@` so a phone number is not evaluated as a formula.
- **Audit.** Search is read-only and SUPER_ADMIN only; there is no route that edits or deletes a row.

## Deviations from the design docs

1. **`BANK_TRANSFER` remains unavailable at checkout** (unchanged from 3.6): nothing reconciles it.
2. **Review images are stored as URLs only.** There is no upload endpoint; MinIO is in the compose file but
   media upload is not part of any increment's scope yet.
3. **Banner positions are free-form slugs**, not an enum. The set belongs to whatever the storefront
   renders, and 3.8 is what will define it.
4. **The rating summary on the PDP is computed in the catalog module**, not through `ReviewsService`, to
   keep the storefront projection a single set of queries and avoid a module cycle.
5. **Audit search returns `before`/`after` as stored.** REQ-34 asks for no PII leakage; that is enforced by
   producers keeping PII out of audit payloads, not by filtering on read. Current producers log slugs,
   statuses, totals and ids — no addresses or contact details.
6. **Rate limits gained per-account bucketing.** The review limit is per customer, read from the bearer
   token's `sub` claim *without verifying the signature*. That is safe because it is only a bucket label —
   the access guard verifies the token immediately afterwards, so a forged subject buys nothing but its own
   bucket on a request that is about to be rejected. Verifying in the limiter would mean doing the crypto
   before the limiter, which is what the limiter exists to prevent.

## Verified

- `npm run lint`, `npm run typecheck`, `npm run build` clean; `prisma migrate diff` empty both ways
- 149 tests: shared 9, API 140. Each spec file passes reliably on its own, and full-suite runs are green
  more often than not (six consecutive green runs were observed after the isolation work below)
- Coupon e2e covers: admin CRUD and term validation, cart preview and rejection reasons, a stale code
  reported rather than thrown, order discount and recorded redemption, free shipping waiving the fee,
  brand/product/category-subtree targeting, per-customer and global caps, and **two simultaneous checkouts
  racing for the last redemption, where exactly one succeeds**
- Reviews e2e covers: non-buyer refused, one review per product, moderation before display, verified badge
  only after delivery, public summary and PDP rating, and role boundaries
- Content e2e covers: draft invisible, publish emitting `CONTENT_UPDATED`, banner window and position
  filtering; reports e2e covers each report, CSV headers and formula escaping, window validation, and
  audit search with its role boundary

## Test-suite isolation work

Three more shared-state defects were found and fixed:

- **Limiter state leaked between spec files.** Several limits were bucketed per IP, and every spec calls
  from loopback, so one file's traffic could exhaust a bucket another file asserted on. Two changes:
  limits that protect an account are now bucketed per account (production-correct — carrier NAT means many
  real customers share an address), and every e2e file clears `rl:*` and `auth:*` once at start-up, which
  is safe now that files run sequentially.
- `registerCustomer` clears the registration bucket it depends on, so a spec never fails because of how
  many customers other specs happened to create.
- `cleanupPurchase` now unparents categories before deleting them, since `Category.parent` is
  `ON DELETE RESTRICT` and a spec began building a parent/child pair.

**Remaining flakiness, stated plainly.** After all of the above, full-suite runs still fail roughly one run
in three on this machine, and the failures are *blocks of consecutive tests inside a single file* — a
different file each time, never reproducible when that file runs alone. The stack is always supertest's
client timing out, with no Postgres lock waits and Redis idle at sub-millisecond latency; failing runs are
also 3–10× slower end to end, which points at host contention rather than application logic. Two
hypotheses were tested and **disproved by measurement** rather than assumed: argon2 starving libuv's
threadpool (a DNS lookup behind 24 concurrent hashes took 0.6 ms) and ephemeral-port exhaustion (one
TIME_WAIT socket). The structural fix is the one `05-testing-cicd.md` already specifies and this project
deviated from — **testcontainers with a database per run** instead of a shared dev database — and it is
scheduled for 3.9 rather than papered over with longer timeouts.

## Not in this increment

- Media upload for review and banner images; WhatsApp notifications; returns and refunds (out of MVP).
- Storefront and admin UI, and the `revalidateTag` call that `CONTENT_UPDATED` will trigger (3.8).
- Testcontainers, outbox retention, load and soak testing, `npm audit` gate (3.9).

## Next

3.8 storefront routes + admin UI + Playwright journeys → 3.9 hardening, load, observability, docs sync.
