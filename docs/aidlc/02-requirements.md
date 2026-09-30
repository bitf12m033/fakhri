# AIDLC — Phase 2a: Requirements Specification (v0, MVP)

Satisfies: Ideation FR/NFR sets. Adds: priority, acceptance criteria (AC), and implementation trace.
Status: **PROPOSAL** — awaiting approval. Trace prefix: **REQ-**.

## 1. Requirement list with acceptance criteria (MVP delta)

Scope symbols: [M] core MVP · [M+] minimal/partial MVP · [F] future (out of MVP) — recorded here so traceability
is complete, but only [M]/[M+] are in this design increments below.

### Catalog & Discovery
| ID | Ref (FR) | Requirement | Priority | Acceptance criteria (condensed) |
|---|---|---|---|---|
| REQ-01 | FR-01 | Category tree browse | M | Given categories exist, storefront renders tree/nav and each category page lists only active descendants' products. |
| REQ-02 | FR-02 | Brand pages | M | Brand slug page lists its active products; any product references exactly one brand. |
| REQ-03 | FR-03 | Dynamic attributes | M | Admin can add an attribute + bind to categories; PDP/PLP render/use it without code change; product form only asks bound attributes. |
| REQ-04 | FR-05 | Faceted filtering | M | PLP filter panel includes brand + category-bound filterable attributes (option facets, numeric ranges, booleans); filters compose; URLs reflect state; counts correct. |
| REQ-05 | FR-06 | PDP | M | Spec table from attribute values; gallery; price (and compare-at); warranty; availability (in-stock / available-on-order); add-to-cart. |
| REQ-06 | FR-04 | Variants/SKUs | M | A product may publish 1+ active variants; each has unique SKU, price, weight, stock; cart/PDP select a variant; SKU immutable once used. |
| REQ-07 | FR-07 | Sorting | M | Sort by relevance (default), price asc/desc, newest, most-reviewed. |
| REQ-08 | FR-08 | Compare 2–4 products | M | Select products → side-by-side table shows only shared/comparable attributes; max 4. |
| REQ-09 | FR-12/13 | Search | M | Search matches title/brand/spec tokens with trigram (substring) tolerance; typo-tolerant via FTS; results paginated; suggestions endpoint. |
| REQ-10 | FR-14 | SEO | M | Canonical URLs, sitemap.xml, robots.txt; PDP emits Product + BreadcrumbList JSON-LD; ISR caches public pages; admin publishes trigger revalidation. |
| REQ-11 | FR-10 | Bulk catalog import | F | CSV import with dry-run validation report; no partial commits on error. |

### Customer & Account
| ID | Ref | Requirement | Priority | Acceptance criteria |
|---|---|---|---|---|
| REQ-12 | FR-15 | Registration/login (password) | M | Argon2id hashing; lockout after failed attempts; email unique; password policy min 8 + strength; JWT access (15min) + rotating refresh (30d). |
| REQ-13 | FR-16 | Phone OTP login | M+ | Send OTP to verified phone; 6-digit, 5 min TTL, 5 attempts max, rate-limited; OTP hashed at rest; verified phone required to set "phone login" flag. |
| REQ-14 | FR-17 | Address book | M | CRUD addresses; fields: label, recipient, phone, province, city, area, line, landmark, isDefault. |
| REQ-15 | FR-18 | Wishlist | M | Add/remove/list for logged-in customers; dedupe by variant. |
| REQ-16 | FR-19 | Order history | M | Customer sees own orders with status timeline (OrderStatusHistory). |
| REQ-17 | FR-20 | Reviews | M+ | 1–5 stars + text (optional image) for purchased product; verified badge only for orders ≥ delivered; admin moderation before display. |

### Purchase
| ID | Ref | Requirement | Priority | Acceptance criteria |
|---|---|---|---|---|
| REQ-18 | FR-21 | Cart | M | Server cart persists under guest token or customer; add/update/remove; totals recomputed server-side; price captured from variant at add (revalidated at checkout). |
| REQ-19 | FR-22 | Guest checkout | M | Order placeable without account; phone/address captured; account creation offered post-order. |
| REQ-20 | FR-23/24 | Delivery options + fee | M+ | Home delivery (flat fee / weight band / zone) and store pickup (free) at MVP; fee rule-table driven; applied at checkout. |
| REQ-21 | FR-25 | Payments (COD + mock gateway) | M | COD captured on delivery; online gateway via adapter (mock impl now): create payment session, callback with idempotency, signature verify, mark paid, payment ledger updated. |
| REQ-22 | FR-26 | Coupons | M+ | FIXED/PERCENT/FREE_SHIPPING; min-order; per-customer limit; validity window; single code per order; idempotent redemption; audit trail. |
| REQ-23 | FR-27 | Atomic stock reservation | M | On order placement, reserve stock within a transaction (lock item row, fail if unfulfillable unless available-on-order); idempotent on retry; oversell impossible. |
| REQ-24 | FR-28 | Order + payment lifecycle | M | Status machines (below); every transition validated + recorded in history; cancelled order releases reservation. |
| REQ-25 | FR-29 | Notifications | M+ | Outbox-driven email/SMS templates on status transitions; console adapter in dev; provider adapters later. |

### Inventory
| ID | Ref | Requirement | Priority | Acceptance criteria |
|---|---|---|---|---|
| REQ-26 | FR-32 | Single warehouse stock | M | Per SKU: onHand/reserved/available; queries reject negative available; reservation decrements available, increments reserved. |
| REQ-27 | FR-34 | Ledger + adjustments | M+ | Every onHand change is an immutable ledger row (type, ref, actor); negative onHand prevented; adjustment requires reason + approver role. |
| REQ-28 | FR-36 | Available on order | M+ | Variant flagged available-on-order sells with zero stock; admin sets flag; no reservation needed. |

### Admin, RBAC, Ops
| ID | Ref | Requirement | Priority | Acceptance criteria |
|---|---|---|---|---|
| REQ-29 | FR-37 | RBAC | M | Roles: SUPER_ADMIN, CATALOG, INVENTORY, ORDERS, MARKETING, SUPPORT; guards on all admin routes; default deny. |
| REQ-30 | FR-38 | Catalog admin UI | M | CRUD categories/brands/attributes/options/products/variants/images/SEO + attribute-category binding; product form driven by attribute template. |
| REQ-31 | FR-39 | Order management | M | List/filter orders; COD confirm-call flag; advance status (confirm→pack→ship→deliver / cancel); print packing list + invoice (FBR fields); manual shipment/tracking entry. |
| REQ-32 | FR-40 | Coupon admin | M+ | CRUD + toggle + usage stats. |
| REQ-33 | FR-41 | Content pages/banners | M+ | Page admin (slug/title/body/SEO); banner CRUD with targeting by position; storefront renders. |
| REQ-34 | FR-42 | Audit log | M | All admin mutations capture actor, action, entity, before/after; immutable, searchable, no PII leakage. |
| REQ-35 | FR-43 | Reports | M+ | Sales by day/status; top products; low stock; COD outstanding list — CSV export. |

### Non-functional (traceable)
| ID | Ref | Acceptance criterion |
|---|---|---|
| REQ-36 | NFR-01/02 | PLP/PDP LCP < 2.5s (3G-mid, Lighthouse); API p95 thresholds in §6 target; measured in CI (budgeted). |
| REQ-37 | NFR-03 | Correctness over availability: no order oversell even under concurrent cart requests (stress test in CI). |
| REQ-38 | NFR-04 | Schema supports 50k SKUs without redesign; pagination on every list; no unbounded queries. |
| REQ-39 | NFR-05 | OWASP ASVS L1: vuln scan in CI (npm audit + Trivy on images); security headers; validation everywhere; secrets via env only. |
| REQ-40 | NFR-06 | All money exact (decimal.js rounding, no float anywhere); invoice fields present for FBR. |
| REQ-41 | NFR-07 | Structured logs with request IDs; health endpoint; core metrics exported; alert on order-pipeline failures. |
| REQ-42 | NFR-08 | unit+integration+API+E2E suites green in CI for critical journeys. |
| REQ-43 | NFR-11 | Nightly pg_dump + WAL; documented restore tested quarterly. |

## 2. State machines (MVP)

### OrderStatus
`PENDING → CONFIRMED → PACKED → SHIPPED → DELIVERED`
with terminal `CANCELLED`. `PENDING→CONFIRMED` may also be `CANCELLED` (COD pre-check fail / customer).
`RETURNED` reserved for future (recorded, not enabled).

Allowed transitions (guard matrix): PENDING→{CONFIRMED, CANCELLED}; CONFIRMED→{PACKED, CANCELLED};
PACKED→{SHIPPED, CANCELLED}; SHIPPED→{DELIVERED, CANCELLED}. Audit-required for all.

Effects: CONFIRMED → (payment: hold/await COD/delivery), CANCELLED → release reservation + void payment attempt; DELIVERED → payment captured (COD).

### PaymentStatus
`PENDING → SUCCEEDED | FAILED`; COD variant: `PENDING_COLLECTION → COLLECTED | FAILED`; refunded later. 
Payment ledger rows immutable; corrections via REFUND/reversal entries.

## 3. Traceability summary (MVP)

Every REQ above maps: REQ → FR/NFR (ideation) → module/service (Phase 3 impl) → test (Phase 4). The matrix
itself lives in `06-traceability.md` at implementation time (generated, kept in sync per increment).

## 4. Out of MVP (explicit, recorded)
Return/refund/installation flows (FR-30,31), finder tools (FR-09), recommendations (FR-11), store
inventory/pickup panel (FR-32/33), WhatsApp API (FR-29 extension), Urdu UI (Q-05), blog/CMS (FR-44),
bulk import (FR-10).

## 5. Approval gate (Phase 2a)
Approve this requirements baseline (or request changes). Actual Prisma schema v0, module/API design and
test/CI plans are produced next (2b–2d) and together form the "Design gate" that must be approved before
any scaffolding/code.