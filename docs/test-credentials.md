# Test credentials (local and staging only)

These are the accounts created by the demo seed. They are well known, so they must never exist in
production. The seed refuses to run when `NODE_ENV=production`.

## Create them

```sh
npm run seed
```

The seed is safe to re-run. It skips any account that already exists, so a password changed through the
UI stays changed.

## Admin console

Open **http://localhost:3001/admin** (`/admin/login`).

Every admin account uses the same password: **`Fakhri-dev-passw0rd`**. Set `SEED_ADMIN_PASSWORD` before
seeding to use a different one.

| Email | Role | What it can open |
|---|---|---|
| `super@fakhri.test` | SUPER_ADMIN | Everything, including admin users, audit log and outbox |
| `catalog@fakhri.test` | CATALOG | Products, categories, brands, attributes |
| `inventory@fakhri.test` | INVENTORY | Stock, adjustments, ledger, warehouses |
| `orders@fakhri.test` | ORDERS | Orders (status, shipments, invoices), reports |
| `marketing@fakhri.test` | MARKETING | Coupons, reviews, content pages and banners |
| `support@fakhri.test` | SUPPORT | Reviews |

A role that opens a section it cannot use sees an explanation instead of the screen. The API refuses the
request either way.

## Customers

The seed creates no customer accounts. To get one:

- **Register** at `/register` with any Pakistani mobile number (e.g. `03001234567`) and a password of 8+
  characters that mixes letters and numbers.
- **One-time code** at `/login` with any number. When the API runs with `NODE_ENV=development` or `test`,
  the 6-digit code is shown on screen, because no SMS is sent. A new number creates the account.

Guests can check out without an account and track the order at `/track` with the order reference plus
the phone number used.

## Demo data worth knowing

| Item | Value |
|---|---|
| Coupons | `WELCOME10`: 10% off, capped at Rs 5,000, minimum order Rs 20,000, once per customer. `FREESHIP`: free delivery |
| Test payments | Pick JazzCash, Easypaisa or card at checkout, then **Pay now** or **Decline** on the test payment page. This needs `PAYMENT_MOCK_SECRET` set for the storefront (see `apps/web/.env.example`) |
| Store pickup | Free; home delivery is charged by province and weight |
| Available-on-order item | Orient Ultron 2 Ton Inverter AC: sells with no stock |
| Out-of-stock item | Dawlance 9193 LF Avante Refrigerator |
