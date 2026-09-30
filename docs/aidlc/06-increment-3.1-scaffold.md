# AIDLC — Increment 3.1: Scaffold (COMPLETED ✅)

Implements the approved Design Baseline (2a–2d). No business logic — foundation only.

## Delivered

| Item | Location | Verified |
|---|---|---|
| npm workspaces monorepo (api / web / shared / config / prisma) | root `package.json` | install ✓ |
| Docker compose (postgres 17, redis 7, minio, mailhog, api, web) | `docker-compose.yml` | postgres+redis up ✓ |
| `.nvmrc` (Node 22 LTS), shared tsconfig base, gitignore, env examples | root | — |
| `@fakhri/shared` — exact money (decimal.js), paisa conversion, PKR lakh formatting, paging, slugify, error contract | `packages/shared` | 9 unit tests ✓ |
| `@fakhri/config` — zod env schema, fail-fast boot | `packages/config` | typecheck ✓ |
| `@fakhri/prisma` — full v0 schema (hybrid EAV, inventory, orders, payments, outbox, audit) | `packages/prisma/prisma/schema.prisma` | `prisma validate` ✓ |
| First migration `20260921125031_init` incl. 9 CHECK constraints + `pg_trgm` | `packages/prisma/prisma/migrations` | applied, constraints verified in PG ✓ |
| NestJS API — global prefix `/api/v1`, helmet, CORS, ValidationPipe, structured pino logging + trace ids, global error filter (error contract), Prisma/Redis/Health/Outbox/Audit modules, Redis locks | `apps/api/src` | `GET /health` 200 (db+redis) ✓ |
| Nest DI under vitest via SWC plugin (decorator metadata) | `apps/api/vitest.config.ts` | 2 e2e tests ✓ |
| Next.js web — App Router, layout, home page doing live API health probe + money demo, typed client base | `apps/web` | `next build` ✓, SSR render ✓ |
| CI quality pipeline (lint→typecheck→test→build), nightly, CD skeleton | `.github/workflows/` | — |

## Verified (this session)

- `npm run lint` clean
- `npm run typecheck` clean (shared/config/prisma/api/web)
- `npm test` → 11 tests pass (9 unit shared; 2 api e2e incl. structured-404 contract)
- Migration applied; CHECK constraints present in PostgreSQL
- Booted stack: `GET /health` → `{"status":"ok",db:true,redis:true}`; web homepage renders `API ok` and `Rs 1,23,456.78`
- Structured error contract: `{"error":{"code":"NOT_FOUND",...,"traceId":...}}`

## Notes / decisions taken during implementation

- **Registry workaround**: `registry.npmjs.org` metadata for large packages (`next`) was unusable in this
  environment; deps installed via `--registry=https://registry.npmmirror.com` (public mirror, not persisted).
  Documented so future installs use `npm install --registry=...` if npmjs stalls again.
- Vitest → SWC required for Nest DI metadata (esbuild doesn't emit `design:type`).
- Dropped `VersioningType.URI` in favor of a single `api/v1` global prefix (V1 contract only for now).
- Schema deltas vs. design doc: added back-relations (FKs) on `StockLedger`, `OrderItem` (Restrict) and
  `Warehouse` for referential integrity.

## Environment setup (repeatable)

```sh
nvm use
npm install --registry=https://registry.npmmirror.com   # if npmjs stalls
npm run dev:infra          # postgres + redis + minio + mailhog
cp apps/api/.env.example apps/api/.env
npm run db:generate && npm run migrate:dev
npm test
npm run dev:api            # :3000
npm run dev:web            # :3001
```

## Next increments (from docs/aidlc/05 §7)

3.2 catalog core (categories/brands/attributes/products + admin CRUD) →
3.3 search + read APIs (Postgres FTS/trgm + facets) → 3.4 customers/auth/RBAC → 3.5 cart/checkout/orders/inventory
(reservation correctness suite) → 3.6 payments/shipping/notifications → 3.7 reviews/coupons/content/reports →
3.8 storefront + admin UI + E2E → 3.9 hardening/load/observability.