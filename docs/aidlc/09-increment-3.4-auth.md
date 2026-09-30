# AIDLC — Increment 3.4: Customers, auth and RBAC (COMPLETED)

Closes every `/admin` route behind authentication and roles, and gives customers accounts,
phone OTP login, an address book and a wishlist.

## Delivered

| Item | Location |
|---|---|
| argon2id password hashing, strength policy, timing-equal verification for unknown accounts | `apps/api/src/modules/auth/password.service.ts` |
| Access JWT (15 min) + opaque rotating refresh token (30 d), stored hashed, family revoked on replay | `apps/api/src/modules/auth/token.service.ts` |
| One gate for authN/authZ with default deny | `apps/api/src/modules/auth/access.guard.ts` |
| Redis fixed-window rate limiting per route (FR-45) | `apps/api/src/modules/auth/rate-limit.guard.ts` |
| Redis failed-attempt counters and temporary lockout | `apps/api/src/modules/auth/lockout.service.ts` |
| Admin login/refresh/logout and admin account CRUD with last-super-admin protection | `apps/api/src/modules/auth` |
| Customer register/login, phone OTP, set/change password, profile, addresses, wishlist | `apps/api/src/modules/customers` |
| Pakistani phone normalization to `+923XXXXXXXXX` | `apps/api/src/modules/customers/phone.ts` |
| Audit rows now record the acting principal, ip and user agent (REQ-34) | `apps/api/src/common/actor-context.ts`, `apps/api/src/audit/audit.service.ts` |
| Migration: refresh tokens belong to an admin XOR a customer (CHECK constraint) | `packages/prisma/prisma/migrations/20260930173802_auth_refresh_subject` |
| First-admin bootstrap CLI | `apps/api/src/scripts/create-admin.ts` (`npm run admin:create -w apps/api`) |
| Unit + e2e tests | `apps/api/test/auth-rules.spec.ts`, `admin-users-rules.spec.ts`, `auth.spec.ts`, `customers.spec.ts` |

## API surface

**Admin** — `Authorization: Bearer <access token>`

| Method | Path | Access | REQ |
|---|---|---|---|
| POST | `/admin/auth/login` | public, 10/min per ip+email | REQ-29 |
| POST | `/admin/auth/refresh` | public, 30/min per ip | REQ-12 |
| POST | `/admin/auth/logout` | any authenticated admin | REQ-12 |
| CRUD | `/admin/users` | SUPER_ADMIN | REQ-29 |
| CRUD | `/admin/categories` `/admin/brands` `/admin/attributes` `/admin/products` `/admin/search/reindex` | CATALOG | REQ-30 |

**Customer**

| Method | Path | Access | REQ |
|---|---|---|---|
| POST | `/auth/customer/register` | public, 20/min per ip | REQ-12 |
| POST | `/auth/customer/login` | public, 10/min per ip+phone | REQ-12 |
| POST | `/auth/customer/otp/request` | public, 5/hour per phone | REQ-13 |
| POST | `/auth/customer/otp/verify` | public, 10/min per phone | REQ-13 |
| POST | `/auth/customer/refresh` `/logout` | public / customer | REQ-12 |
| GET/PATCH | `/customers/me` | customer | REQ-14 |
| POST | `/customers/me/password` | customer, 5/5min | REQ-12 |
| CRUD | `/customers/me/addresses` | customer | REQ-14 |
| GET/POST/DELETE | `/customers/me/wishlist` | customer | REQ-15 |

Envelope and error contract are unchanged. A locked account or a tripped limit is
`RATE_LIMITED` (429) with `details.retryAfterSeconds`.

## Rules enforced

- **Default deny (REQ-29).** A route is reachable only if it declares `@Public`, `@Roles(...)` or
  `@CustomerRoute`. An undeclared route is refused, so a new admin route cannot ship open by accident.
- SUPER_ADMIN satisfies every role check; `@Roles()` with no argument means any authenticated admin.
- Admin requests re-read the account on every call, so deactivation and role changes take effect
  immediately. Customer requests trust the 15-minute access token, which keeps storefront traffic cheap.
- Login answers identically for an unknown email/phone and a wrong password, and still runs a full argon2
  verification against a decoy hash so the two cannot be told apart by timing.
- Five failed attempts lock a subject for 15 minutes (both counts configurable). Success clears the counter.
- Refresh tokens are opaque, stored only as SHA-256, and rotated on every use. Presenting an already-rotated
  token is treated as theft: every token for that subject is revoked.
- Changing a password or deactivating an account revokes that subject's refresh tokens.
- The last active super admin cannot be demoted, deactivated or deleted, and nobody can deactivate or
  delete their own account.
- OTP codes are 6 digits, live 5 minutes, allow 5 attempts, and are hashed at rest with the password
  settings. Requesting a new code invalidates the previous one; a consumed code cannot be replayed.
- Phone numbers are normalized before storage and lookup, so `03001234567` and `+92 300 123 4567` are one
  account.
- Exactly one address is the default: the first is promoted automatically, a new default unsets the old one,
  and deleting the default promotes the next oldest. Addresses and wishlists are scoped to the owner —
  another customer's id returns `NOT_FOUND`, never someone else's data.
- Audit rows for admin mutations now carry `actorId`, ip and user agent, resolved from the request context.

## Deviations from the design docs

1. **`RefreshToken` gained a customer subject.** The v0 schema related it to `AdminUser` only, but REQ-12
   gives customers rotating refresh too. `userId` is now nullable, `customerId` was added, and a CHECK
   constraint keeps it exactly one of the two — the same pattern the catalog uses for attribute values.
2. **Lockout state lives in Redis, not Postgres.** The schema has no attempt counters, and this is
   rate-limit state with a natural TTL rather than durable business data. It is lost on a Redis flush,
   which fails open; that is the right direction for a lockout.
3. **Tokens are returned in the response body**, per the Bearer contract in `04-architecture-api.md` §4.
   The `Secure`/`HttpOnly` cookie and CSRF handling mentioned in `01-ideation-foundation.md` belongs with
   the storefront in 3.8, which is where the browser session actually lives.
4. **A verified OTP for an unknown number creates the account.** DEC-08 makes phone OTP the primary channel
   for this market; requiring a prior registration would put a password in front of the primary path.
   The phone is verified by definition at that point.
5. **The OTP response includes `devCode` when `NODE_ENV` is `development` or `test`.** There is no SMS
   adapter until 3.6, and the code is also written to the log. Remove this when notifications land.
6. **Registration's rate limit is deliberately loose** (20/min per ip). Carrier NAT puts many legitimate
   Pakistani customers behind one address; per-phone abuse is caught by the OTP limit instead.
7. **`POST /customers/me/password` is not in the API contract outline.** Without it, a customer who sets a
   password can never change it, and an OTP-only customer can never gain one. An account with no password
   may set one without proving a previous password, which doubles as the forgotten-password path.
8. **New dependencies:** `argon2` (REQ-12 names argon2id) and `@nestjs/jwt`. `npm audit` reports 10
   pre-existing advisories from `multer`, the vite/vitest chain and `postcss`; none come from these two.

## Operational notes

- **First admin.** Every `/admin` route needs an admin, so a fresh deployment runs once:
  `ADMIN_PASSWORD=… npm run admin:create -w apps/api -- --email you@example.com --name "You" --role SUPER_ADMIN`
  (in an image: `node dist/scripts/create-admin.js …`). The password is read from `ADMIN_PASSWORD` so it
  stays out of the process list. Re-running rotates the password and revokes that admin's sessions.
- **`JWT_ACCESS_SECRET` has no default**: a deployment without it fails to boot rather than signing with a
  known key. Generate with `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"`.
  Rotating it invalidates every access token immediately; refresh tokens survive, so clients recover on refresh.
- Admin self-service password change is not exposed; SUPER_ADMIN resets it via `PATCH /admin/users/:id`.

## Not in this increment

- Order history (`/customers/me/orders`, REQ-16) — needs orders, 3.5.
- Audit log search (`GET /admin/audit-logs`, REQ-34 read side) and the remaining admin surfaces
  (inventory, orders, coupons, content, reports) — their increments add routes with their own roles.
- Cookie sessions and CSRF for the storefront (3.8); CAPTCHA on high-risk events (RISK-08, 3.9).
- SMS/email delivery of OTP (3.6).

## Verified

- `npm run lint` clean, `npm run typecheck` clean, `npm run build` clean, `prisma migrate diff` empty both ways
- `npm test` with Node 22 → 65 tests: shared 9, API 56 (8 auth e2e, 7 customer e2e, 8 storefront/search e2e,
  17 search-query, 4 auth rules, 4 admin-user guardrails, 4 catalog rules, 2 catalog API, 2 health)
- e2e covers: anonymous/malformed/customer callers refused on admin routes, role boundaries, admins refused
  on customer routes, identical answers for unknown email and wrong password, lockout, refresh rotation and
  replay revocation, logout, admin CRUD with live role change and session drop on deactivation, audit actor
  recorded, register/login validation, OTP issue-verify-replay-reissue, OTP request cap, profile update with
  duplicate-email conflict, default-address invariants and cross-customer isolation, wishlist dedupe, and
  password set/change
- `npm run admin:create` exercised against the dev database

## Next

3.5 cart/checkout/orders/inventory reservation (correctness suite) → 3.6 payments, shipments, notifications.
