# AIDLC — Phase 0/1: Ideation & Inception Foundation

Project: **Pakistan Electronics & Home Appliances E-Commerce Platform** (working title: *Fakhri*)
Status: **PROPOSAL** — awaiting human approval at Ideation gate
Date: 2026-09-19

Traceability: every requirement (FR/NFR), decision (DEC), risk (RISK), assumption (ASM) and open question (Q)
is identified with a stable code referenced throughout later phases (design, implementation, tests).

---

## 1. Product Vision

A modern e-commerce platform for buying electronics and home appliances in Pakistan — a single online
store backed by physical retail footprint. Customers can discover, compare, and buy products with
accurate specifications, transparent PKR pricing, reliable nationwide shipping, store pickup, and
trustworthy after-sales (warranty, returns, installation). The platform is an original system inspired
by the functional patterns of established Pakistani retailers (Al-Fatah, Japan Electronics, Friends
Home, Lahore Electronics) — *not* a clone of any of them.

The platform is engineered to grow: from catalog browsing to a full commerce system with inventory
across warehouses and stores, payments, marketing, content, analytics, and future integrations
(ERP, payment gateways, couriers, WhatsApp).

## 2. Problem Statement

Price-sensitive customers in Pakistan shopping for high-value electronics need to compare many
models with technically dense, category-specific specifications (capacity, BTU, inverter, No Frost,
energy rating, resolution). Existing retailer sites are often slow, spec-inconsistent, offline-first,
or flat catalogs that make comparison and trustworthy online ordering difficult. Retailers, in turn,
struggle with scattered inventory (warehouses + stores), COD cash handling, manual order processing,
and no reliable way to recommend the right product (e.g., which AC for a given room).

This platform solves both sides: **a trustworthy, filterable, comparable catalog** for customers and
**a unified catalog + inventory + order-processing tool** for the business.

## 3. Target Users

| Persona | Context | Primary needs |
|---|---|---|
| **Individual buyer (PK)** | Home consumer, often mobile-first, 22–50, urban/semi-urban. High-value purchases researched heavily on WhatsApp/physical stores too. | Price, warranty, specs, delivery to district cities, COD, store pickup, installation. |
| **Business/contractor/installer buyer** | Buys multiple units (AC installers, interior designers, offices). | Bulk pricing, faster order, delivery coordination. |
| **Store/support staff (Retailer)** | Counter staff and WhatsApp sales agents at physical branches. | Unified stock view, quick lookup, place COD orders on customer's behalf. |
| **Admin/catalog team** | Merchandising staff. | Bulk catalog import, spec normalization, pricing, banners/deals. |
| **Ops team** | Order fulfillment, warehouses, couriers. | Order queues, packaging, shipping labels, tracking, COD collection reconciliation. |
| **Management** | Owners/heads. | Sales, margin, inventory, payment and COD metrics. |

## 4. Business Goals

| Code | Goal | Success signal |
|---|---|---|
| BG-1 | Sell electronics & home appliances online nationwide with COD + online payments. | Orders + paid GMV growing MoM. |
| BG-2 | Be *the* trustworthy spec reference (accurate, comparable specs). | Compare/finder usage, organic SEO traffic, low spec-related returns. |
| BG-3 | Reduce reliance on manual channels (WhatsApp/phone/frontdesk). | Self-serve order share increasing. |
| BG-4 | Keep inventory accurate across warehouses and stores. | < 2% stock divergence, near-zero oversell. |
| BG-5 | Control COD losses (refusals, fake orders). | COD refusal rate < industrial bench, payment reconciliation time reduced. |
| BG-6 | Enable data-driven merchandising. | Sales/inventory/filter analytics used in buying decisions. |

## 5. Functional Requirements (initial)

Scope flags: **[M]** = MVP, **[F]** = Future, **[M+]** = MVP with only simple version.

### 5.1 Catalog
| ID | Requirement | Flag |
|---|---|---|
| FR-01 | Browse a hierarchical tree of categories and subcategories (e.g., Air Conditioners → Split → Inverter / Non-Inverter). | M |
| FR-02 | Manage brand pages (logo, description, all products). | M |
| FR-03 | Products carry dynamic, category-specific attributes defined by a reusable attribute model (not per-category columns). | M |
| FR-04 | Products may have multiple variants (e.g., color/finish) each with its own SKU, barcode, price, weight, and stock. | M |
| FR-05 | Category listing pages with faceted filtering over brand + category-relevant specs (capacity, inverter, No Frost, BTU, resolution…). | M |
| FR-06 | Product detail page with spec table, gallery images, warranty info, price, and availability. | M |
| FR-07 | Sort listing by relevance, price (asc/desc), newest, popular. | M |
| FR-08 | Compare up to 4 products side-by-side on technically relevant specs. | M |
| FR-09 | Product finder tools (e.g., AC finder by room size, floor, sun exposure, budget, T3, energy) with explainable rule-based recommendations. | F |
| FR-10 | Bulk catalog import/update (CSV/Excel) with validation and error reports. | F |
| FR-11 | Product recommendations (related items, frequently bought together). | F |

### 5.2 Discovery
| ID | Requirement | Flag |
|---|---|---|
| FR-12 | Full-text and partial-match search across title, brand, and specs with typo tolerance. | M |
| FR-13 | Search autocomplete/suggestions. | M+ |
| FR-14 | Deep links / SEO-friendly canonical URLs for products and categories; sitemap + structured data. | M |

### 5.3 Customer & Account
| ID | Requirement | Flag |
|---|---|---|
| FR-15 | Customer registration/login with secure password handling (argon2id). | M |
| FR-16 | Phone-number OTP login (primary market channel). | M+ |
| FR-17 | Saved customer addresses (national address support, flats/office, landmarks). | M |
| FR-18 | Wishlist (add/remove, view). | M |
| FR-19 | Order history and order detail with status timeline. | M |
| FR-20 | Review products (rating + text + optional images), verified-buyer badge. | M+ |

### 5.4 Purchase (Cart → Order)
| ID | Requirement | Flag |
|---|---|---|
| FR-21 | Cart with add/update/remove, price & summary, taxable behaviour per FBR rules. | M |
| FR-22 | Guest checkout allowed (decision Q-06). | M? |
| FR-23 | Delivery options: home delivery nationwide and store pickup. | M |
| FR-24 | Delivery fee calculation (flat / distance / zone / weight, carrier-aware later). | M+ |
| FR-25 | Payment methods: Cash on Delivery, (bank transfer), and at least one online gateway via adapter. | M |
| FR-26 | Coupons: fixed/percent/free-shipping, min-cart, per-customer, validity. | M+ |
| FR-27 | Order placement reserves inventory atomically and prevents oversell. | M |
| FR-28 | Order lifecycle: pending → confirmed → (packed/shipped → delivered) or cancelled; payment lifecycle: unpaid → paid/CODC → refunded. | M |
| FR-29 | Order status updates trigger customer notifications (SMS/Email/WhatsApp later). | M+ |
| FR-30 | Installation/delivery service add-ons (e.g., AC installation) where applicable. | F |
| FR-31 | Returns/refunds (RMA) workflow. | F |

### 5.5 Inventory
| ID | Requirement | Flag |
|---|---|---|
| FR-32 | Multiple warehouses with per-SKU on-hand, reserved, available stock. | M |
| FR-33 | Store-level inventory and stock visibility (for pickup / store fulfillment). | F |
| FR-34 | Stock transfers and adjustments with immutable transaction ledger + audit. | M+ |
| FR-35 | Reorder-point / low-stock alerts. | F |
| FR-36 | "Available on order" (listing an SKU that can be procured, no stock) capability. | M+ |

### 5.6 Admin & Operations
| ID | Requirement | Flag |
|---|---|---|
| FR-37 | RBAC admin: super-admin, catalog, inventory, orders, marketing, support roles. | M |
| FR-38 | Catalog management UI: categories, brands, products, variants, attributes, images, SEO. | M |
| FR-39 | Order management: view/process/pack/ship/cancel, update payment status, print packing list & invoice. | M |
| FR-40 | Coupon/promotion management. | M+ |
| FR-41 | Simple content pages + banner management. | M+ |
| FR-42 | Audit log for all important admin actions. | M |
| FR-43 | Reports: sales, top products, inventory, low stock, COD ledger. | M+ |
| FR-44 | Blog, FAQs, rich CMS, landing pages. | F |

### 5.7 Cross-cutting
| ID | Requirement | Flag |
|---|---|---|
| FR-45 | Rate limiting on auth, checkout, and public mutation endpoints. | M |
| FR-46 | Input validation everywhere; OWASP guidance applied. | M |
| FR-47 | Secure image upload (magic-byte/content validation, size/dimension limits). | M |
| FR-48 | Structured logging, request IDs, health endpoints, basic metrics. | M |
| FR-49 | Transactional integrity for orders ⇄ payments ⇄ inventory (outbox pattern). | M |

## 6. Non-Functional Requirements

| ID | Requirement | Target |
|---|---|---|
| NFR-01 | **Performance** (web) | LCP < 2.5 s on 3G-mid for PLP/PDP; TTFB < 500 ms for SSR pages (cached). |
| NFR-02 | **Performance** (API) | p95 checkout/order APIs < 500 ms; search p95 < 200 ms at MVP scale. |
| NFR-03 | **Availability** | 99.5% target; graceful degradation; no oversell ever (correctness > availability). |
| NFR-04 | **Scale** | Catalog of 1k–10k SKUs at launch; designed to reach ~50k without redesign. |
| NFR-05 | **Security** | OWASP ASVS L1 target; secrets never in code/logs; MFA-ready for admin. |
| NFR-06 | **Compliance** | PKR accounting math exact (never float); FBR invoice requirements; data stored with backups. |
| NFR-07 | **Observability** | Structured logs + traces + metrics; 24/7 alerting on order/inventory failures. |
| NFR-08 | **Testability** | Unit + integration + API + E2E for critical journeys in CI. |
| NFR-09 | **Accessibility/UX** | Mobile-first; WCAG AA-ish for storefront. |
| NFR-10 | **SEO** | SSR/ISR for public pages; exact-duplicate canonical; JSON-LD structured data. |
| NFR-11 | **Backup/Recovery** | Point-in-time recovery for Postgres; tested restore runbook. |
| NFR-12 | **Localization** | PKR formatting, Urdu-safe text handling (see Q-05 languages). |

## 7. Scope Boundaries

**In scope (MVP)** — storefront + API + admin for: catalog/browse/filter/compare/search, customer
accounts (password login minimum), wishlist, cart, guest-checkout (if approved), COD + one online
gateway via adapter, order placement with atomic stock reservation, order management, nationwide
delivery + store pickup (pickup from warehouse/stores at MVP), coupons (basic), basic content pages
+ banners, basic reports, RBAC admin, health/monitoring, audit log, full automated test suite for
critical journeys.

**Explicitly out of MVP** — returns/refunds RMA flows (tracking only), product finder tools,
recommendation engine, ERP/WMS integration, WhatsApp Commerce API, multi-language UI, blog/CMS-rich
editing, store-level inventory panel, loyalty, marketplace/full multi-vendor, installation
scheduling automation, mobile app.

**Out of scope (this product)** — B2B procurement portal, POS at physical counters (data may flow in later).

## 8. Assumptions

| ID | Assumption |
|---|---|
| ASM-01 | COD will be the majority payment method for high-value appliances; cash/courier reconciliation matters. |
| ASM-02 | Initial catalog 1k–10k SKUs; ~50k SKUs is the 3–5 year horizon — too small to justify distributed search infra initially. |
| ASM-03 | Phone number is a primary identity/contact channel in the Pakistani market; WhatsApp is a leading sales channel. |
| ASM-04 | Prices / exchange rates fluctuate; sale prices (compare-at/strike-through display) are a core merchandising need. |
| ASM-05 | Spec data will arrive imperfectly from suppliers; attribute governance and admin validation are required. |
| ASM-06 | Business operates from one main warehouse hub at MVP (+ later regional hubs), plus existing physical stores. |
| ASM-07 | English storefront at MVP; Urdu support is a roadmap item pending Q-05. |
| ASM-08 | Team will operate a single modular monolith first; no microservices before scale/pressure demands. |
| ASM-09 | Online gateway onboarding in PKR is business-side (merchant accounts/licenses); API contract will be adapted. |
| ASM-10 | Courier partners expose APIs (or at least printable labels + manual tracking) — adapter pattern isolates uncertainty. |

## 9. Risks

| ID | Risk | Impact | Mitigation |
|---|---|---|---|
| RISK-01 | **COD refusals/fake orders** hit margins and cash flow. | High | Order scoring/allow-list, confirmation-call workflow flag, deposit for high-value ACs, COD limits. |
| RISK-02 | **Spec/price data inconsistency** damages trust (wrong BTU, old price). | High | Attribute normalization (options tables), price compare-at validation, source-of-truth admin flows, PDP timestamped "last updated". |
| RISK-03 | **Oversell / stock drift** across warehouses & COD pipeline. | High | Atomic reservation + ledger; stock true-up job; reserve on order placement for all methods. |
| RISK-04 | **Gateway/courier/ERP integration friction** in PK market. | Med | Adapter interfaces; graceful fallback (manual COD & manual tracking entry). |
| RISK-05 | **PKR price volatility** (dollar-linked) causes stale pricing. | Med | Compare-at/price rules, quick admin bulk price updates, optional auto-sync later. |
| RISK-06 | **High cart abandonment** on mobile / slow pages. | Med | Mobile-first, ISR-cached PLP/PDP, minimal checkout steps. |
| RISK-07 | **EAV/attribute model over-flexibility** leads to slow queries or messy data. | Med | Hybrid model (typed columns + options normalization + controlled JSONB), indexes on filter paths. |
| RISK-08 | **Fraud/coupon abuse / account abuse.** | Med | Rate limiting, coupon limits, idempotency, audit, CAPTCHA on high-risk events. |
| RISK-09 | **Payment reconciliation burden** for COD vs gateway vs bank transfers. | Med | Single payment ledger with statuses + daily reconciliation report. |
| RISK-10 | **Single-person bus factor** on ops flows. | Low | Automation, runbooks, observability. |

## 10. Major Domain Areas

1. **Catalog** — categories, brands, attributes, attribute options, products, variants, SKUs, images, SEO.
2. **Pricing & Promotions** — list/sale price, coupons, (later) bundled/process deals.
3. **Inventory** — warehouses, stores, stock ledger, transfers, adjustments, availability.
4. **Customers & Identity** — registration, authN/authZ, addresses, wishlist, reviews.
5. **Cart & Checkout** — cart, delivery selection, fees, coupon application, order assembly.
6. **Orders & Fulfillment** — order lifecycle state machine, packing, shipping label, tracking, COD.
7. **Payments** — payment ledger, COD capture, gateway adapter, refunds (later).
8. **Search & Discovery** — query API, facets, autocomplete, SEO rendering, (later) finder tools.
9. **Content & Marketing** — pages, banners, (later) blog/FAQ.
10. **Admin & Reporting** — RBAC, audit, sales/inventory reports.
11. **Notifications** — email/SMS order status; (later) WhatsApp.
12. **Integrations** — gateway/courier/ERP/WhatsApp adapters.

## 11. Initial Architectural Considerations

- **Modular monolith.** One deployable API (NestJS) with strict module boundaries + in-process events;
  split later only if real pressure demands it (avoid premature microservices).
- **Clear layers** inside each module: domain logic ⇄ application services ⇄ controllers ⇄ persistence
  (Prisma) ⇄ infrastructure (Redis, object storage, gateways). Prisma is kept inside the persistence
  layer, not leaking into domain code.
- **API-first** with versioned REST; storefront consumes the same API the admin and future
  mobile/integration clients use.
- **Transactional integrity** → Transactional **outbox** for events (order placed → reserve/consume
  stock → decrement → notify), with idempotency keys for payment callbacks and coupon/magic ops.
- **Redis** roles: queues (BullMQ for async jobs), cache (hot PLP/PDP, session-ish state), rate-limit
  counters, distributed locks for stock operations across instances.
- **SEO strategy**: Next.js SSR/ISR for public pages (RSC + ISR 60/300 s), sitemap + JSON-LD; admin
  updates trigger cache invalidation via API (tag/revalidate).
- **Security posture**: OWASP ASVS L1: helmet/CSP, validation (class-validator DTOs), parameterized
  queries (Prisma), argon2id, rate limiting, Secure+HttpOnly+SameSite cookies, CSRF tokens where
  cookies are used, strict CORS, audit logging, drawn file upload validation.
- **Money**: integer PKR minor units (paisa) everywhere; DECIMAL in DB; no floats.
- **Config**: env-driven via ConfigModule; secrets via env/secret manager (never in repo).
- **Testing pyramid**: unit (domain/services) → integration (Prisma + testcontainers/Redis) → API
  (supertest) → E2E (Playwright) for ~6 critical journeys; CI gate runs lint+typecheck+tests.

## 12. Technology Evaluation

### Confirmed / recommended (with rationale)

| Concern | Choice | Why / trade-off |
|---|---|---|
| Storefront | **Next.js (App Router) + React + TypeScript** | Best-in-class SSR/ISR (NFR-10 SEO), RSC for fast PLP/PDP, wide ecosystem. Trade-off: needs the API split (DEC-01). |
| Backend | **NestJS + TypeScript** | Strong modularity/testability (matches modular-monolith), idiomatic DI, guards/pipes for auth/RBAC/validation, first-class BullMQ/Redis, OpenAPI. Trade-off: more ceremony than Express; inherited from requirements — validated, keep. |
| Monorepo | **npm workspaces / Turborepo** (web, api, packages/*) | Shared types/prisma client/contracts; single-command dev; no toolchain lock-in needed (Turborepo optional at start). |
| DB | **PostgreSQL 16/17** | Relational integrity for orders/inventory/money; JSONB+tsvector when needed. |
| ORM | **Prisma** | Type-safe, migrations, strong DX. Trade-off: raw SQL escapes for complex reporting; acceptable. *Alternative evaluated: Drizzle (SQL-first) — keep as documented candidate if reporting queries become painful.* |
| Attribute/catalog model | **Hybrid relational + typed EAV** (see §13) | Correctness + queryability + flexibility; avoids both "hundreds of columns" and a messy pure-JSONB catalog. |
| Money | BigInt/int64 paisa + DECIMAL in DB | Exact PKR math (NFR-06). |
| Cache/queues | **Redis + BullMQ** | Standard, robust in PK infra. |
| Search | **Postgres `tsvector` + `pg_trgm` (MVP) → Meilisearch (post-MVP)** | At 1–50k SKUs Postgres FTS/trigram is fast, no extra infra, transactionally consistent with catalog writes. Meilisearch when we need instant typo-tolerant faceted search or heavier load. Opensearch/Elasticsearch rejected at this scale (ops cost). |
| File images | **S3-compatible object storage** (MinIO in dev; decide provider later) + Sharp processing | Cheap, CDN-ready. |
| Auth | Custom (argon2id + JWT access/refresh w/ rotation) + RBAC guards | No OAuth provider assumption for PK market; OTP adapter for phone login. |
| Container/dev | **docker compose** (web, api, postgres, redis, minio, optional meilisearch) | Reproducible dev & CI. Prod = deployment decision (DEC-09/Q-09). |
| Observability | pino logs + OpenTelemetry traces + Prometheus metrics (+ optional Sentry) | NFR-07. |
| Testing | Vitest (unit) + Supertest (API) + Playwright (E2E) + testcontainers | Matches pyramid in §11. |
| CI | GitHub Actions: lint → typecheck → unit → integration(e2e w/ services) → build | Gate on PRs. |

### Products we intentionally do NOT adopt for MVP
- **Elasticsearch/OpenSearch** — ops-heavy; overkill for ≤50k SKUs; re-evaluate if catalog explodes.
- **Commerce frameworks** (Shopify/Medusa/Spree) — original catalog model + PK-specific workflows justify bespoke backend; Medusa evaluated as bootstrap, rejected because the dynamic-attribute + store/warehouse + COD/PK needs are deep customizations that would fight the framework.
- **External** headless CMS (Contentful etc.) — simple pages suffice for MVP; rich CMS is future.

## 13. Catalog & Attribute Model Recommendation (core decision)

Evaluate three options:

1. **Pure relational per-category columns** — hundreds of near-empty columns; rejected (explicit requirement).
2. **Pure JSONB attributes** — flexible but: no referential integrity for option values → facet counts dirty; weak typed filtering; poor reporting. Use only where controlled.
3. **HYBRID (recommended)** ✓

Logical model:

```
categories (tree) ──< category_attributes >── attributes
brands
products ──‐ product_variant ──< product_attribute_values >  (typed columns)
          └ belongs to category, brand
product_variant_attribute_values  (for variant-shaping specs e.g. color)
attribute_options  (normalized option values for OPTION-type attributes → facets)
```

**Attributes**: a single reusable definition table. Each attribute has a **type domain**:
`TEXT | NUMBER (unit, step, range) | BOOLEAN | OPTION (options table) | JSON (complex/edge specs)`.

**product_attribute_values** stores each value in the correct typed column, with a CHECK constraint
ensuring only the matching column is populated:

| column | used for | enforces |
|---|---|---|
| `value_option_id` | OPTION specs (e.g., IDU capacity, Inverter = Yes/No, Energy rating) | FK → attribute_options (dirty data control) |
| `value_number` | numeric specs (BTU, tons, wattage, liters, screen size inches) | numeric range filter/sort |
| `value_boolean` | Yes/No flags shown as specs (T3, No Frost, WiFi, Heat & Cool) | consistent facets |
| `value_text` | free text specs (refrigerant "R-410A", panel type) | display/search |
| `value_json` | genuinely complex specs (e.g., connectivity port list) — used sparingly | controlled escape hatch |

**Category binding**: `category_attributes(categoryId, attributeId, {required, filterable, comparable, position, groupName})`
→ drives listing filters, compare table columns, the product-form spec template per category, and admin
validation per category. Parent categories inherit bindings (overridable).

**Pricing** lives on the variant (price + compareAt for strike-through), stored in paisa.

**Facets/search**: option facets (FK joins), numeric ranges (btree + range index on value_number),
free text (tsvector/trgm on product title + brand + normalized attribute labels). This is the 
foundation for the AC finder later (**FR-09**).

Decision to approve: **DEC-02** (hybrid) vs alternatives in §17.

## 14. Proposed MVP Scope (traceable to FR/REQs)

Storefront (Next.js) — browse/filter/compare/search (FR-01,03,05,06,07,08,12,14); PDP (FR-06);
wishlist (FR-18); cart+checkout (FR-21,23,24,25-CO,26-basic,27,22-if-approved); accounts/password
(FR-15,17,19); reviews (FR-20 basic; ship if time allows); order tracking page (FR-28 statuses),
COD-first payments + one online gateway adapter mockable (FR-25).

API (NestJS) — full module set: catalog, inventory (ledger, reservation, transfers/adjustments
baseline), orders state machine, payments ledger, coupons, customers/auth/RBAC, audit, notifications
(HTTP/console adapter), search (Postgres), content (pages/banners), reporting (basic).

Admin (within a secured area) — catalog CRUD (incl. attribute/category binding UI), inventory ops,
order queue with COD confirm + packing/shipping + invoice print, coupon admin, simple reports.

Tests — critical journey E2E: search→filter→PDP→cart→checkout(COD)→order; admin order process →
shipped; stock reservation collision test.

## 15. Future Scope (post-MVP, traceable)

Product finder tools & explainable recommendations (FR-09,11) · store-level inventory & pickup
(FR-32/33) · returns/refunds/installation (FR-30,31) · Meilisearch rump-up · WhatsApp Commerce +
SMS (FR-29) · bulk import (FR-10) · blog/CMS (FR-44) · price auto-sync, ERP/WMS integration ·
multi-language Urdu (Q-05) · loyalty; deploy-scale (K8s/managed).

## 16. Key Architectural Decisions — APPROVED 2026-09-19

| ID | Decision | Recommendation | Status |
|---|---|---|---|
| DEC-01 | Frontend/backend boundary | **Separate Next.js storefront + NestJS API** (API-first) | ✅ approved |
| DEC-02 | Catalog attribute model | **Hybrid typed EAV** (§13) | ✅ approved |
| DEC-03 | Search | **Postgres FTS+trigram for MVP**; Meilisearch read-model later | ✅ approved |
| DEC-04 | Modular monolith vs services | **Modular monolith (NestJS), outbox + queues** | ✅ approved |
| DEC-05 | Money | Integer paisa + DECIMAL in DB; no floats | ✅ approved |
| DEC-06 | Payment architecture | Adapter pattern w/ ledger + reconciliation; COD first; online gateway **mock adapter** until merchant access secured | ✅ approved |
| DEC-07 | Shipping architecture | Adapter for courier APIs; **manual label/tracking fallback first** | ✅ approved |
| DEC-08 | Auth | Phone OTP + optional password (argon2id, JWT access + refresh rotation); RBAC admin | ✅ approved |
| DEC-09 | Prod deployment | **Single VM + Docker compose**; managed Postgres/Redis optional; revisit on scale | ✅ approved |
| DEC-10 | Image/caching | S3-compatible object storage + Sharp; CDN-ready; ISR with tag-based invalidation | ✅ approved |

## 17. Open Questions — RESOLVED 2026-09-19

Q-01 Separate NestJS API ✓ · Q-02 Hybrid EAV ✓ · Q-03 Postgres FTS first ✓ · Q-04 Phone OTP + optional password ✓
· Q-05 English only at MVP ✓ · Q-06 Guest checkout allowed ✓ · Q-07 No gateway merchant access yet → adapter + mock ✓
· Q-08 No courier APIs yet → manual labels/tracking ✓ · Q-09 Single VM + Docker compose ✓ · Q-10 Single main warehouse ✓

---

## Review gate

Before moving to **Phase 2 (Requirements Specification → design), the following must be approved**:

1. Product vision & scope (§1–§4, §7, §14).
2. Decisions DEC-01 → DEC-09 (mark ✅/⏳ in §16) and answers to Q-01 → Q-10 (§17).
3. Functional/non-functional requirement baseline (§5–§6) to carry into the traceability matrix.

> Next gate artifacts (after approval): formal requirements spec w/ acceptance criteria, ERD/schema
> design v0, module/directory structure, API contract outline (OpenAPI), test strategy, CI/CD plan,
> runbook skeleton.