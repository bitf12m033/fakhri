# AIDLC — Phase 2c: Module & API Contract + Repo Structure (v0)

Implements DEC-01 (NestJS API + Next.js), DEC-04 (modular monolith + outbox), DEC-09 (docker compose).
Status: **PROPOSAL** — approval required before scaffolding.

## 1. Monorepo layout

```
fakhri/
├─ package.json / npm-workspaces (web, api, packages/*)   # Turborepo optional; start plain workspaces
├─ docker-compose.yml            # dev: postgres, redis, minio, mailhog(dev), api, web (+ optional meilisearch)
├─ .env.example / packages/*/.env.example
├─ .github/workflows/ci.yml → cd.yml → deploy.yml
├─ docs/aidlc/                   # lifecycle artifacts (this series)
│
├─ apps/
│  ├─ api/                       # NestJS modular monolith
│  │  └─ src/
│  │     ├─ main.ts              # bootstrap: helmet, cors, global prefix /api/v1, ValidationPipe, filter, interceptors
│  │     ├─ app.module.ts        # imports FeatureModules + infra modules
│  │     ├─ config/              # ConfigModule + zod-validated env schema
│  │     ├─ common/              # guards, pipes, interceptors, filters, decorators, idempotency, dto base, pagination
│  │     ├─ prisma/  redis/  logger/  health/  outbox/  audit/  notifications/
│  │     └─ modules/
│  │        auth/ customers/ catalog/(categories,brands,attributes,products) inventory/ cart/ checkout/
│  │        orders/ payments/ shipping/ promotions/ reviews/ content/ search/ reporting/
│  └─ web/                       # Next.js App Router
│     ├─ src/
│     │  ├─ app/                 # (storefront) routes: /, /[...]/category, /brand/[slug], /product/[slug], /compare, /search, /wishlist, /cart, /checkout, /account/**, /orders/[ref], /pages/[slug]
│     │  ├─ app/(admin)/admin/   # admin SPA (RBAC) under /admin/**
│     │  ├─ components/ graphql?  → plain API client (fetch + swr/tanstack-query)
│     │  ├─ lib/api-client.ts    # typed client against packages/contracts
│     │  └─ middleware.ts        # admin auth check, locale/geo hints
│     └─ next.config.mjs         # images remotePatterns, ISR revalidate config
│
├─ packages/
│  ├─ prisma/                    # schema.prisma + client + seed + migrations + CHECK-constraint SQL
│  ├─ contracts/                 # shared DTOs/types/zod schemas for API ↔ web; versioned
│  └─ shared/                    # money (decimal.js), paging, slugify, ids, validation helpers
│
├─ e2e/                          # Playwright critical journeys (web ⇄ api live)
│
└─ infra/                        # compose overrides, nginx/caddy for prod VM, deploy scripts, runbooks
```

## 2. NestJS module map (modular monolith — no cross-module imports; events + services only)

| Module | Responsibility | Publishes (outbox) | Consumes |
|---|---|---|---|
| `auth` | Admin JWT + RBAC, refresh rotation, admin login | — | — |
| `customers` | Customer accounts, OTP, addresses, wishlist | PHONE_OTP_SENT | — |
| `catalog` | categories, brands, attributes/options, products/variants/values, images, SEO | PRODUCT_PUBLISHED | — |
| `inventory` | warehouse, InventoryItem, ledger, adjustments, transfers | STOCK_MUTATED | ORDER_RESERVATION_REQUIRED? * |
| `cart` | server cart (token/customer) | — | pricing service (in-process) |
| `checkout` | assemble order, validate coupon, fees, reserve stock, create payment intent | ORDER_CREATED, COUPON_REDEEMED | pricing, cart, inventory, payments, coupons |
| `orders` | state machine, history, refs, COD confirm flow | ORDER_STATUS_CHANGED | — |
| `payments` | Payment ledger, gateway adapter (mock now), callback idempotency, reconciliation | PAYMENT_SUCCEEDED | — |
| `shipping` | Shipment + events, manual tracking, label print | — | — |
| `promotions` | coupons CRUD, validation, usage | — | — |
| `reviews` | review CRUD, moderation, verified badge | — | checkout/orders→DELIVERED |
| `content` | pages, banners | — | — |
| `search` | Postgres tsvector/trgm queries, suggestions, reindex on PRODUCT_PUBLISHED | — | catalog |
| `reporting` | sales/top-products/low-stock/COD reports + CSV | — | read models |
| `notifications` | email/sms adapters (console now) | — | outbox subscriber |

\* Reservation is executed inside the **checkout** transaction directly (via an `InventoryService` exposed by the
inventory module) — no async race on stock; async jobs only for post-commit side effects.

**Cross-cutting infra modules**: `config`, `prisma`, `redis`, `logger` (pino), `audit`, `outbox`, `health`.
**Common**: `AuthGuard` (JWT), `RolesGuard`, `ThrottlerGuard`, global `HttpExceptionFilter` (structured error
contract `{ code, message, details?, traceId }`), `IdempotencyInterceptor` for checkout & payment callbacks,
`PaginationPipe` (cursor/offset), `AuditInterceptor` (writes AuditLog in same tx for admin mutations).

## 3. Event taxonomy (outbox → queues/BullMQ)

| Event | When | Consumers |
|---|---|---|
| `ORDER_CREATED` | order committed + stock reserved | notifications, analytics |
| `ORDER_STATUS_CHANGED` | any status transition | notifications |
| `PAYMENT_SUCCEEDED` | gateway callback verified | analytics; (future) ERP |
| `STOCK_MUTATED` | ledger write (sale/reservation/release) | search availability reindex, analytics |
| `PRODUCT_PUBLISHED` | admin activates product | search reindex → web revalidate |
| `CONTENT_UPDATED` | page/banner publish | web revalidate |

Web revalidation: API calls Next.js `revalidateTag()` over HTTP with a signed internal token.

## 4. REST API contract (v1) — outline

Versioned under `/api/v1`. Response envelope: `{ data }` success, `{ error: { code, message, details, traceId } }`.
All lists paginated. Auth: `Authorization: Bearer <jwt>` for customer/admin; cart uses `X-Cart-Token` cookie.

**Public (no auth)**
| Method | Path | Purpose | REQ |
|---|---|---|---|
| GET | `/categories` + `/categories/:slug/tree` | nav tree | REQ-01 |
| GET | `/brands` `/brands/:slug` | brand pages | REQ-02 |
| GET | `/products` | SEARCH+filter (query: q, category, brand, attrs, price range, sort, page) | REQ-04/09 |
| GET | `/products/suggest?q=` | autocomplete | REQ-09 |
| GET | `/products/:slug` | PDP (active product) | REQ-05 |
| GET | `/compare?ids=…` | side-by-side spec data (max 4) | REQ-08 |
| GET | `/reviews?productId=` | approved reviews + avg | REQ-17 |
| GET | `/pages/:slug` `/banners` | content | REQ-33 |

**Customer (JWT, or guest token for cart)**
| Method | Path | Purpose | REQ |
|---|---|---|---|
| POST | `/auth/customer/login` / `/register` / `/refresh` / `/logout` | accounts | REQ-12 |
| POST | `/auth/customer/otp/request` `/otp/verify` | phone login | REQ-13 |
| GET/POST/PATCH/DELETE | `/customers/me` `/customers/me/addresses` | profile/addresses | REQ-14 |
| GET/POST/DELETE | `/customers/me/wishlist` | wishlist | REQ-15 |
| GET | `/customers/me/orders` `/customers/me/orders/:ref` | history + tracking | REQ-16 |
| GET/POST | `/cart` `/cart/items` `/cart/items/:id` `/cart/coupon` | cart + coupon | REQ-18/22 |
| POST | `/checkout` (idempotency key) | place order | REQ-19/23 |
| POST | `/orders/:ref/cancel` | cancel (pre-confirmed) | REQ-24 |
| POST | `/payments/:paymentId/initiate` `/payments/webhook/:gateway` | online pay (mock) | REQ-21 |
| POST | `/reviews` | review submission | REQ-17 |

**Admin (JWT + RolesGuard)**
| Method | Path | Roles | Purpose | REQ |
|---|---|---|---|---|
| POST | `/admin/auth/login` `/refresh` | — | admin auth | REQ-29 |
| CRUD | `/admin/categories` `/admin/brands` `/admin/attributes` `/admin/attributes/:id/options` `/admin/categories/:id/attributes` | CATALOG, SUPER_ADMIN | catalog mgmt + binding | REQ-30 |
| CRUD | `/admin/products` `/admin/products/:id/variants` `/admin/products/:id/images` | CATALOG | products; form template from category attributes | REQ-30 |
| CRUD | `/admin/inventory/items` `/admin/inventory/adjustments` `/admin/inventory/transfers` | INVENTORY | stock ops | REQ-26/27/28 |
| GET/PATCH | `/admin/orders` `/admin/orders/:id/status` `/admin/orders/:id/payment-status` `/admin/orders/:id/shipment` `/admin/orders/:id/invoice` | ORDERS | process/ship/track; print invoice (FBR) | REQ-31 |
| CRUD | `/admin/coupons` | MARKETING | coupon mgmt | REQ-32 |
| CRUD | `/admin/content/pages` `/admin/content/banners` | MARKETING | content | REQ-33 |
| GET | `/admin/reports/sales` `/top-products` `/low-stock` `/cod-outstanding` | ORDERS/SUPER_ADMIN | CSV export | REQ-35 |
| GET | `/admin/audit-logs` | SUPER_ADMIN | audit search | REQ-34 |
| GET | `/admin/users` CRUD | SUPER_ADMIN | RBAC | REQ-29 |

System: `GET /health` (liveness+readiness+db/redis), `GET /metrics` (prom).

OpenAPI: NestJS `@nestjs/swagger` generates spec; `packages/contracts` holds zod/class-validator shared
schemas so web + api validate identically.

## 5. Checkout sequence (correctness-critical)

`POST /checkout` (idempotency key) →
1. Load cart (FOR UPDATE), lock pricing snapshot (revalidate unit prices from variants).
2. Validate coupon (active, window, min-order, per-customer, not used on this cart) → compute discount.
3. Compute delivery fee by rule table (zone/weight/flat) + tax.
4. Compute totals (decimal.js), assert sums, assert >= 0.
5. Open transaction: create Order + OrderItems + history(PENDING); reserve stock per line
   (`UPDATE inventory_item SET reserved = reserved + :q WHERE variantId=:v AND onHand - reserved >= :q`);
   create Payment row (COD or PENDING gateway); write AuditLog; write OutboxEvent(ORDER_CREATED). Commit.
6. On any failure local or DB: rollback; no side effects; respond 409 with typed error.
7. After commit: enqueue notifications; (if online pay) return initiate URL.

Idempotency: key → stored result row (idempotency table in Prisma) so retries return the same order ref.

## 6. Key invariants & error codes (draft set)

`INVALID_INPUT`, `UNAUTHENTICATED`, `FORBIDDEN`, `NOT_FOUND`, `CONFLICT`, `OUT_OF_STOCK`, `PRICE_CHANGED`,
`COUPON_INVALID`, `COUPON_LIMIT`, `STOCK_RESERVATION_FAILED`, `PAYMENT_PENDING`, `CART_EMPTY`,
`ORDER_STATUS_INVALID`, `RATE_LIMITED`, `INTERNAL`.

## 7. Approval gate (Phase 2c)
Approve repo layout, module map, API surface (or annotate). On approval, Phase 3 increment-0 scaffolds
the workspaces (no business logic yet): docker-compose, config, prisma schema+first migration, health,
CI skeleton, and `packages/shared` money/paging primitives with unit tests.