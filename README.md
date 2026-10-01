# Fakhri

Pakistan-focused electronics & home-appliances e-commerce platform (monorepo).

## Workspaces

| Path | Purpose |
|---|---|
| `apps/api` | NestJS modular-monolith REST API (`/api/v1`) |
| `apps/web` | Next.js storefront + admin console (BFF over the API) |
| `e2e` | Playwright journeys against a live API + storefront build |
| `packages/shared` | money (decimal), paging, slugify, error contract |
| `packages/config` | zod-validated env schema |
| `packages/prisma` | single source of truth for the data model + migrations |

Lifecycle artifacts: `docs/aidlc/*` (traceability, design, test/CI plans).

## Requirements

- Node >= 20 (use `.nvmrc`, e.g. `nvm use`)
- Docker (postgres/redis/minio/mailhog for dev)

## Quick start

```sh
nvm use
npm install
npm run dev:infra          # docker compose up -d postgres redis minio mailhog
cp apps/api/.env.example apps/api/.env
npm run db:generate        # prisma client
npm run migrate:dev        # apply migrations (creates DB schema + CHECK constraints)
npm test                   # unit + integration (api e2e requires postgres+redis)

# every /admin route needs an admin account (increment 3.4)
ADMIN_PASSWORD='choose-a-strong-one' npm run admin:create -w apps/api -- \
  --email you@example.com --name "You" --role SUPER_ADMIN

npm run seed               # demo catalog + one admin per role (password Fakhri-dev-passw0rd)
cp apps/web/.env.example apps/web/.env.local

npm run dev:api            # http://localhost:3000 (health: /health)
npm run dev:web            # http://localhost:3001  (admin: /admin)
```

## End-to-end journeys

```sh
npx playwright install chromium   # once
npm run e2e                       # own API on :3100, storefront build on :3101
```

Stop any other API using the same database first: its outbox dispatcher can take the events the
revalidation journeys wait for. See `docs/aidlc/13-increment-3.8-storefront-admin-e2e.md`.

`apps/api/.env` needs `JWT_ACCESS_SECRET` (32+ chars, no default). See `apps/api/.env.example`.

## Useful

```sh
npm run typecheck
npm run lint
npm run build
```

## Production (single VM + docker compose)

Images: `apps/api/Dockerfile`, `apps/web/Dockerfile` (monorepo-aware, multi-stage). See
`docs/aidlc/05-testing-cicd.md` §2 for the CI→CD→deploy flow and `infra/` runbooks.