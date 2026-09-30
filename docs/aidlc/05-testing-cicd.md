# AIDLC — Phase 2d: Test Strategy, CI/CD, Observability, Runbook (v0)

Status: **PROPOSAL**. Plans below activate in Phase 3/4 increments.

## 1. Testing strategy (pyramid)

| Layer | Tool | Scope | Runs |
|---|---|---|---|
| Unit | Vitest (api), Vitest/RTL (web) | Domain logic: state machines, coupon math, pricing/totals, stock reservation logic, money rounding, pagination, validators | PR |
| Integration | Vitest + testcontainers (Postgres + Redis) | Prisma repos, checkout transaction, outbox dispatch, idempotency, ledger writes, CHECK constraints | PR |
| API | Supertest against booted NestJS app (testcontainers DB/Redis) | All public+admin endpoints: auth/RBAC, catalog CRUD, search, filters | PR |
| E2E | Playwright | Critical journeys against compose stack (seed data): browse→filter→PDP→compare→cart→checkout(COD)→order→admin process→shipped→tracking; coupon; review; wishlist | PR (fast) + nightly (full) |
| Security/static | ESLint+typescript, `npm audit`, Trivy (images), zod/env validation, secret scanning | All PRs |
| Load (perf budget) | k6 (CI, small) + Lighthouse CI | No oversell under concurrent checkout; PLP/PDP LCP budget (REQ-36); API p95 | Nightly |

Coverage gates: domain modules ≥ 80% line (enforced only for modules carrying money/state); other code ≥ 60%.
Every REQ in `02-requirements.md` has acceptance criteria; each maps to ≥1 test named after it (`REQ-23_reservation_oversell`).

## 2. CI/CD pipeline (GitHub Actions, single-VM deploy)

```
ci (push/PR):
  lint → typecheck → unit → integration(containers) → api tests → build images → (PR: e2e subset)
perf/nightly: e2e full + k6 + lighthouse CI → report to PR/issue
cd (main merge):
  build + push images → deploy.yml → SSH to VM → docker compose pull && up -d → health poll → smoke tests
  reservations: migrations run before new api containers (compose `migrate` one-shot service)
rollback: previous image tag re-deploy (compose pins image digests); DB rollback = documented restore procedure
```

Trunk-based, short-lived branches, PR required for main; conventional commits; auto-versioned image tags
(`git sha`). Secrets in repo secrets/envs on VM only.

## 3. Observability

- **Logs**: pino JSON, request-id propagated (X-Request-Id), context: orderId/variantId/userId; log-sampling
  for verbose paths; never log PII (phone/OTP masked), tokens, or gateway secrets.
- **Metrics** (Prometheus, /metrics): http errors/rate, checkout failures by code, order throughput,
  stock-reservation conflicts, queue lag (BullMQ), db pool, redis latency.
- **Traces**: OpenTelemetry (HTTP + Prisma + Redis + BullMQ) → optional collector; trace-id ties to logs.
- **Alerts** (baseline): checkout failure-rate spike, outbox stuck, reservation conflict surge, gateway 5xx, disk/backup.
- **Dashboards**: Grafana panel pack (orders, revenue, COD pipeline, inventory health) — later increment.

## 4. Runbook skeleton (`infra/runbooks/`)

| Incident | Detection | First action | Escalation |
|---|---|---|---|
| Oversell reported/possible | alert `reservation conflict` + e2e stress | freeze checkout (feature flag), inspect ledger, manual reconciliation | on-call |
| Outbox stuck | queue lag alert | redrive job, inspect OutboxEvent.lastError | dev |
| Gateway callback lost | unpaid order + pending payment older than X | idempotent manual capture/void in admin | on-call |
| DB full / slow | disk & p95 alerts | WAL archiving check, pg_repack, autovacuum tuning | on-call |
| VM down | health probe | compose restart, restore from snapshot/pg_basebackup script | on-call |

**Backups (REQ-43)**: nightly `pg_dump -Fc` + continuous WAL (archiving) to object storage; test-restore
runbook executed quarterly; GFG (restore point) documented. Redis is cache/queue only — no critical durability.

## 5. Security baseline (OWASP ASVS L1 mapping)

Head (H) / headers (CSP, HSTS, X-Content-Type-Options, Referrer-Policy), strict CORS allow-list, input
validation on every DTO, Prisma parameterization (no raw string interpolation w/o params), XSS via
sanitized HTML on content pages, CSRF: SameSite=Lax/Strict cookies + signed revalidation token (internal),
rate limits: auth (5/m/IP), OTP (3/15m/phone), checkout (10/15m/IP), generic 100/s; upload: magic-byte check
+ sharp re-encode + 10MB cap + random keys; secrets: env-only, rotation documented; admin session shorter TTL.

## 6. Environments

| Env | Purpose | Data |
|---|---|---|
| dev (local compose) | feature dev, mailhog, MinIO, seed catalog | synthetic |
| test (CI containers) | PR gates | synthetic/minimal |
| staging (VM) | release validation, E2E | anonymized seed |
| prod (VM) | live | real |

Config via `packages/config` env schema (zod): fail-fast on missing/invalid at boot everywhere.

## 7. Approval gate (Phase 2d — design gate)

Approve 2a–2d as the **Design Baseline** to unlock Phase 3 implementation increments:
- 3.0 injectable seed data preserved (sandbox)
- 3.1 scaffold (workspaces, compose, schema+migration v1, health, shared primitives, CI skeleton) — **no business logic**
- 3.2 catalog core (categories/brands/attributes/products + admin CRUD + tests)
- 3.3 search + PLP/PDP read APIs (Postgres FTS/trgm)
- 3.4 customers/auth/RBAC + addresses/wishlist
- 3.5 cart/checkout/orders/inventory reservation (correctness suite)
- 3.6 payments (COD+mock gateway) + shipments + notifications(console)
- 3.7 reviews, coupons, content, reports
- 3.8 storefront routes + admin UI + E2E journeys
- 3.9 hardening, load, docs sync