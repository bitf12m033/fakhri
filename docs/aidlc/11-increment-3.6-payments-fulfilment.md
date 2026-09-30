# AIDLC — Increment 3.6: Payments, shipments and notifications (COMPLETED)

Online payment through a gateway adapter, shipment tracking, printed documents, and the outbox
dispatcher that finally delivers the events increments 3.2–3.5 have been writing.

## Delivered

| Item | Location |
|---|---|
| Gateway adapter boundary + HMAC-signed mock provider | `apps/api/src/modules/payments/gateway.ts` |
| Payment state machine (online and COD paths) | `apps/api/src/modules/payments/payment-state.ts` |
| Session creation, signature-verified callbacks, manual operator settlement | `apps/api/src/modules/payments/payments.service.ts` |
| Shipment state machine, manual tracking events, label data | `apps/api/src/modules/shipping` |
| FBR-field invoice and packing list | `apps/api/src/modules/orders/documents.service.ts` |
| Outbox dispatcher: claim, deliver, retry, park | `apps/api/src/outbox/outbox.dispatcher.ts` |
| Event taxonomy in one place | `apps/api/src/outbox/event-types.ts` |
| Notification templates + console adapter + outbox subscriber | `apps/api/src/modules/notifications` |
| Unit and e2e tests | `apps/api/test/fulfilment-rules.spec.ts`, `payments.spec.ts`, `fulfilment.spec.ts` |

## API surface

| Method | Path | Access | REQ |
|---|---|---|---|
| POST | `/payments/:paymentId/initiate` | order owner (customer token, or guest ref + phone) | REQ-21 |
| POST | `/payments/webhook/:gateway` | public, signature-authenticated | REQ-21 |
| PATCH | `/admin/orders/:id/payment-status` | ORDERS | REQ-31 |
| GET/PUT | `/admin/orders/:id/shipment` | ORDERS | REQ-31 |
| POST | `/admin/orders/:id/shipment/events` | ORDERS | REQ-31 |
| GET | `/admin/orders/:id/shipment/label` | ORDERS | REQ-31 |
| GET | `/admin/orders/:id/invoice` `/packing-list` | ORDERS | REQ-31/40 |
| GET/POST | `/admin/outbox` `/admin/outbox/dispatch` | SUPER_ADMIN | DEC-04 |

Checkout now accepts `CARD`, `JAZZCASH` and `EASYPAISA` alongside `COD`, and the order response carries
`payment.id` so the storefront can start a session.

## Rules enforced

- Callbacks are authenticated by HMAC over the **raw request body**, verified in constant time. A
  re-serialized body would not reproduce a real provider's signature, so the app is created with
  `rawBody: true`.
- A callback must match the ledger amount, and the payment status transition must be legal. A replay of an
  already-applied callback answers 200 and changes nothing, because providers retry.
- A settled payment advances its order to CONFIRMED **inside the same transaction** as the payment write,
  so a paid order can never be left sitting in PENDING.
- Online and COD settlement paths never cross: a COD payment cannot go SUCCEEDED, an online one cannot go
  COLLECTED. Terminal statuses are terminal, so a failed payment cannot later be marked paid.
- Starting a payment requires owning the order: a customer token that matches, or — for a guest, who has no
  credential — the order reference *and* the phone number the order was placed with.
- Shipments exist only for home delivery, only once the order is packed, and never for a cancelled order.
- Shipment and order status stay in step: a parcel can only go in transit from a PACKED order (which ships
  it and consumes the reservation) and can only be delivered from a SHIPPED one (which collects COD).
- Delivery is at-least-once. A batch is claimed with `FOR UPDATE SKIP LOCKED` and its attempt counter spent
  in a short transaction, then handlers run outside it, so slow I/O never holds database locks. After
  `OUTBOX_MAX_ATTEMPTS` an event is parked as FAILED with its last error for an operator.
- Notification handlers tolerate being called twice and tolerate a missing aggregate.
- Phone numbers and emails are masked in notification logs.

## Deviations from the design docs

1. **Refunds are not implemented.** The `Refund` model exists and `REFUNDED` is reachable in the state
   machine, but return/refund flows are explicitly out of MVP (`02-requirements.md` §4).
2. **`BANK_TRANSFER` is still refused at checkout.** Nothing reconciles it automatically, so accepting it
   would create orders only a manual process could settle. An operator can still record one after the fact
   via `PATCH /admin/orders/:id/payment-status`.
3. **Labels, invoices and packing lists are returned as structured JSON, not rendered PDFs.** The numbers
   and fields live here; layout and printing belong to the admin UI in 3.8, and courier label formats
   differ per carrier.
4. **Guest payment authorization uses the order reference plus the phone number.** The API contract puts
   `/payments/:id/initiate` under customer routes, but most buyers in this market are guests, and leaving
   them unable to pay online would be a significant functional gap. Reference plus phone is what a guest
   actually holds; the storefront keeps both in its session.
5. **The mock gateway's signing secret has a development default.** It is a stand-in, not a credential; a
   real adapter's secret will be required with no default, like `JWT_ACCESS_SECRET`.
6. **`STOCK_MUTATED` and `CONTENT_UPDATED` are named in the taxonomy but not yet produced.** Inventory
   writes its own ledger, and content arrives in 3.7.
7. **Web revalidation is not wired.** `04-architecture-api.md` §3 has the API calling Next's
   `revalidateTag()` on publish; there is no storefront to revalidate until 3.8.
8. **Rate limits gained param-based bucketing.** `/payments/:id/initiate` is throttled per payment rather
   than per IP, for the same carrier-NAT reason refresh was changed in 3.5.

## Operational notes

- `OUTBOX_POLL_MS=0` disables the background poller; tests use that and drain explicitly through
  `OutboxDispatcher.drain()`. A Redis lock keeps one instance polling when several are running.
- `GET /admin/outbox` reports pending, published, failed and the oldest pending timestamp — the signal that
  delivery has stalled.
- **The outbox table has no retention policy.** It grows forever, and delivery is oldest-first, so a large
  backlog delays new events. A purge job belongs in 3.9; the test suite had accumulated 573 pending events
  before this increment, which is what surfaced the issue.

## Test-suite work in this increment

- The dispatcher used `update()` to record a batch result, which throws if the row vanished since it was
  claimed and aborted the rest of the batch. It now uses `updateMany()`, so a purge mid-batch is survivable —
  a production robustness fix, found by a test whose cleanup deleted events concurrently.
- Spec files now run **one process at a time** (`pool: 'forks'`, `fileParallelism: false`). Sharing a worker
  thread let one file's teardown settle while the next ran, which produced impossible results such as a 404
  from a route that exists.
- A 3.5 assertion that online payment methods were refused at checkout is now an assertion that
  `BANK_TRANSFER` is refused — the behaviour changed deliberately in this increment.

**Known flakiness, honestly stated.** Each spec file passes reliably on its own (12/12 for the catalog
spec), and the full suite is green run after run at ~15s. When the host is saturated, however, whole runs
slow to 75–105s and e2e specs exceed their 30s timeouts; the failures move around and are not reproducible
in isolation. The real fix is the one `05-testing-cicd.md` already specifies and we deviated from —
testcontainers with a database per run instead of the shared dev database — and it belongs in 3.9 alongside
the outbox retention job.

## Not in this increment

- Refunds and returns (out of MVP); real SMS/email/WhatsApp providers; PDF rendering.
- Coupons, reviews, content and reports (3.7); storefront and admin UI (3.8).
- Testcontainers, outbox retention, load and soak testing (3.9).

## Verified

- `npm run lint`, `npm run typecheck`, `npm run build` clean; `prisma migrate diff` empty both ways
- `npm test` with Node 22 → 119 tests: shared 9, API 110
- Payments e2e: session creation and reuse, signed callback confirming the order, replay answered without a
  second transition, unsigned/tampered/unknown/mismatched callbacks refused, failed payment leaving the
  order open, guest and customer authorization, COD refused online, operator settlement
- Fulfilment e2e: shipment refused before packing and for store pickup, tracking events moving the order and
  consuming stock, COD collected on delivery, label/invoice/packing-list contents, and outbox delivery
  producing SMS and email once per event with tracking details included

## Next

3.7 reviews, coupons, content and reports → 3.8 storefront and admin UI + E2E journeys.
