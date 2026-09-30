# Fakhri

Pakistan-focused electronics & home-appliances e-commerce platform (monorepo).

## Workspaces

| Path | Purpose |
|---|---|
| `apps/api` | NestJS modular-monolith REST API (`/api/v1`) |
| `apps/web` | Next.js storefront + admin (scaffold) |
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
npm test                   # unit + integration (api health e2e requires postgres+redis)
npm run dev:api            # http://localhost:3000 (health: /health)
npm run dev:web            # http://localhost:3001
```

## Useful

```sh
npm run typecheck
npm run lint
npm run build
```

## Production (single VM + docker compose)

Images: `apps/api/Dockerfile`, `apps/web/Dockerfile` (monorepo-aware, multi-stage). See
`docs/aidlc/05-testing-cicd.md` §2 for the CI→CD→deploy flow and `infra/` runbooks.