# AIDLC — Increment 3.5: Cart, checkout, orders and inventory (COMPLETED)

The purchase path end to end: a server cart, an atomic checkout, the order lifecycle, and the
stock reservation that makes overselling impossible.

## Delivered

| Item | Location |
|---|---|
| Server cart with price snapshots, guest token, merge-on-sign-in | `apps/api/src/modules/cart` |
| Stock reservation, release, consumption and the append-only ledger | `apps/api/src/modules/inventory/inventory.service.ts` |
| Stock ops for the INVENTORY role: warehouses, items, signed adjustments, ledger reads | `apps/api/src/modules/inventory` |
| Checkout: one transaction for order, items, reservation, payment, audit and outbox | `apps/api/src/modules/checkout/checkout.service.ts` |
| Idempotency store so a retried checkout returns the first order | `apps/api/src/modules/checkout/idempotency.service.ts` |
| Delivery fee rule table (zone by province, then weight bands) | `apps/api/src/modules/checkout/delivery-fee.ts` |
| Order totals with exact decimals and asserted invariants | `apps/api/src/modules/checkout/pricing.ts` |
| Order state machine and lifecycle effects | `apps/api/src/modules/orders` |
| Customer order history and cancellation (REQ-16, deferred from 3.4) | `apps/api/src/modules/orders/orders.controller.ts` |
| Migration: cart price snapshot (backfilled) + idempotency table | `packages/prisma/prisma/migrations/20260930180926_cart_snapshot_and_idempotency` |
| Domain unit tests, cart/checkout e2e, lifecycle e2e, oversell correctness suite | `apps/api/test/purchase-rules.spec.ts`, `purchase.spec.ts`, `orders.spec.ts`, `oversell.spec.ts` |

## API surface

| Method | Path | Access | REQ |
|---|---|---|---|
| GET/POST/PATCH/DELETE | `/cart` `/cart/items` `/cart/items/:itemId` | guest or customer | REQ-18 |
| POST | `/checkout` (requires `Idempotency-Key`) | guest or customer | REQ-19/20/23 |
| GET | `/customers/me/orders` `/customers/me/orders/:ref` | customer | REQ-16 |
| POST | `/customers/me/orders/:ref/cancel` | customer | REQ-24 |
| GET/PATCH | `/admin/orders` `/admin/orders/:id` `/admin/orders/:id/status` | ORDERS | REQ-31 |
| GET/POST | `/admin/inventory/warehouses` `/admin/inventory/items` | INVENTORY | REQ-26 |
| POST | `/admin/inventory/adjustments` | INVENTORY | REQ-27 |
| GET | `/admin/inventory/ledger?variantId=` | INVENTORY | REQ-27 |

A guest keeps the `token` from the cart response and sends it back as `X-Cart-Token`. Signing in with
that header merges the guest cart into the customer's.

## How overselling is prevented (REQ-23/37)

The reservation is a single conditional statement, and the availability test lives in its own `WHERE`:

```sql
UPDATE "InventoryItem" SET "reserved" = "reserved" + :q
 WHERE "variantId" = :v AND "warehouseId" = :w AND "onHand" - "reserved" >= :q
```

Two concurrent checkouts both see stock, both try to update, and Postgres serialises them on the row
lock. The loser re-evaluates the predicate *after* acquiring the lock, finds it false, and updates zero
rows — which the service turns into `OUT_OF_STOCK`. There is no read-then-write window to lose.
`Inventory_available_not_negative` in the first migration is the backstop underneath.

Everything else rides in the same transaction: order rows, reservation, payment record, audit row and the
`ORDER_CREATED` outbox event. An out-of-stock line rolls the whole order back, so an order can never
exist without its reservation.

The ledger is also the memory of *where* stock is held: releasing or shipping derives what an order still
holds from its `RESERVATION` / `RESERVATION_RELEASE` / `SALE` rows, so doing either twice moves nothing.

## Rules enforced

- Cart prices are snapshotted on add and re-read at checkout. A changed price is `PRICE_CHANGED`, never a
  silent re-price; the cart view flags it in advance via `priceChanged`.
- A cart is private to its token or its customer, holds at most 50 lines and 50 of any one item, and is
  locked `FOR UPDATE` during checkout so two concurrent checkouts cannot both convert it.
- `Idempotency-Key` is required on checkout. The same key with the same body replays the first order
  (`replayed: true`); the same key with a different body is `CONFLICT`; a failed attempt releases the key.
- Home delivery needs an address, store pickup does not and is free. The address is snapshotted onto the
  order, so editing the address book never rewrites where a past order went.
- An unknown province is rejected rather than priced into the nearest zone.
- Order transitions follow the matrix in `02-requirements.md` §2 exactly. Customers may cancel only while
  PENDING; admins may cancel up to SHIPPED. Terminal states are terminal, and `RETURNED` is unreachable.
- CANCELLED releases the reservation and voids the pending payment attempt. SHIPPED and DELIVERED consume
  it. DELIVERED collects a COD payment and sets `codConfirmation`.
- Adjustments need a reason and can never leave less stock than is already reserved.
- Totals are exact decimals: every line subtotal, and `items - discount + delivery + tax`, are asserted
  before the order is written.

## Deviations from the design docs

1. **`CartItem` gained `unitPrice`.** Schema design §4 calls for a price snapshot at add time, but the v0
   model had no column for it. The migration backfills existing rows from the current variant price, so it
   applies to an environment that already has carts.
2. **`IdempotencyKey` is a new table**, as `04-architecture-api.md` §5 assumes ("idempotency table in
   Prisma") without the v0 schema defining one.
3. **Coupons are not wired into checkout.** `discountTotal` is computed and asserted but always zero:
   coupon CRUD and validation are increment 3.7, and half a coupon implementation would be worse than none.
   `/cart/coupon` is therefore absent too.
4. **COD only.** The gateway adapter is 3.6, so any other `paymentMethod` is rejected up front rather than
   accepted into a state nothing can settle.
5. **Tax defaults to zero.** No requirement fixes a rate and catalog prices in this market are quoted
   tax-inclusive, so `TAX_RATE_PERCENT` exists and defaults to 0 rather than guessing 17%.
6. **The delivery fee table lives in code**, not a database table. The rows are few and change with courier
   negotiations rather than per tenant; move it when ops need to edit it without a deploy.
7. **A line is never split across warehouses.** ASM-06 has one hub at MVP; the reservation walks candidate
   warehouses and takes the first that can satisfy the whole line.
8. **Stock is consumed at SHIPPED**, not at PACKED or DELIVERED, because that is when it physically leaves.
   DELIVERED consumes too, for the case where an order reaches it without a separate ship step.
9. **Stock transfers are deferred.** `04-architecture-api.md` lists `/admin/inventory/transfers`, but with a
   single warehouse there is nothing to transfer between; the models exist for when there is.
10. **Guests cannot cancel their own order.** There is no credential to authenticate a guest, so those
    cancellations go through an admin. The storefront can offer account creation post-order (REQ-19).
11. **Refresh rate limits are now bucketed by the presented token**, not by IP alone. Carrier NAT puts many
    customers behind one address, and the token is the thing worth throttling. Bucket discriminators are
    hashed, so emails, phone numbers and tokens no longer appear in Redis keys.

## Test-harness fixes made here

Adding four more spec files exposed three ways the suite was not isolated. All three were real defects in
the tests, and all three are fixed:

- **Connection exhaustion.** Each spec file boots its own app and Prisma pool (`cpus*2+1` = 21 here), which
  across parallel files exceeded Postgres's `max_connections` and surfaced as unrelated 5-second timeouts.
  `test/setup.ts` now caps the pool at 5 and `vitest.config.ts` caps at 4 concurrent files.
- **Shared rate-limit state.** A wildcard `rl:*` reset cleared buckets that other parallel files were
  asserting on. Resets are now explicitly scoped per route.
- **Identities that outlive a run.** The lockout test used a constant unknown email, whose Redis failure
  counter lives 15 minutes, so repeated runs locked it; test phone numbers were derived from the clock and
  could collide across files, letting one file's cleanup delete another's customer. Both are now random.

The oversell suite was also checked by mutation: removing the availability predicate from the reservation
`UPDATE` makes two of its tests fail, so the suite genuinely detects the regression it exists to catch.

## Not in this increment

- Payments beyond COD, gateway callbacks and refunds (3.6); shipments, labels and tracking (3.6);
  notifications on transitions (3.6).
- Coupons (3.7), invoices and reports (3.7), reviews (3.7).
- Outbox dispatcher: `ORDER_CREATED` and `ORDER_STATUS_CHANGED` are written but nothing consumes them yet.
- Cart expiry sweeping: `expiresAt` is maintained, but no job prunes stale carts (3.9).

## Verified

- `npm run lint`, `npm run typecheck`, `npm run build` clean; `prisma migrate diff` empty both ways
- `npm test` with Node 22 → 98 tests: shared 9, API 89. Six consecutive full runs with no flakes
- Correctness suite: ten simultaneous buyers for one unit yield exactly one order; twelve buyers for five
  units yield exactly five; a cart converts once under a race; the same `Idempotency-Key` sent twice at
  once places one order; no inventory row ever holds a negative or over-reserved value
- Lifecycle e2e: the full PENDING→DELIVERED walk with stock moving only at SHIPPED and COD collected at
  DELIVERED, skipped and reversed transitions refused, cancellation releasing stock exactly once

## Next

3.6 payments (COD + mock gateway), shipments and notifications → 3.7 reviews, coupons, content, reports.
