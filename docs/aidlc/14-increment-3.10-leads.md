# AIDLC — Increment 3.10: Leads and WhatsApp campaigns (COMPLETED)

Marketing uploads a contact or case export, reviews it, and later messages the
people who have agreed to WhatsApp. A lead is not a store account.

## Delivered

| Item | Location |
|---|---|
| `Lead`, `LeadCase`, `LeadImport` | `packages/prisma/prisma/schema.prisma` |
| CSV reader and import plan (no database) | `apps/api/src/modules/leads/csv.ts`, `lead-import.ts` |
| Preview, commit, list, detail, consent, STOP | `apps/api/src/modules/leads` |
| Campaign templates and sends | `apps/api/src/modules/campaigns` |
| Marketing screens: import, consent, templates, campaigns | `apps/web/src/app/admin/(console)/leads`, `campaigns`, `campaign-templates` |
| Unit and e2e tests | `apps/api/test/lead-import.spec.ts`, `leads.spec.ts`, `campaign-template.spec.ts`, `campaigns.spec.ts`, `whatsapp.spec.ts`, `whatsapp-webhook.spec.ts` |
| WhatsApp Cloud API client | `apps/api/src/modules/notifications/whatsapp.ts` |
| Inbound STOP webhook | `GET` and `POST` `/webhooks/whatsapp` |

## API surface

| Method | Path | Access |
|---|---|---|
| POST | `/admin/leads/imports/preview` | MARKETING |
| POST | `/admin/leads/imports` | MARKETING |
| POST | `/admin/leads/opt-out` | MARKETING |
| PATCH | `/admin/leads/:id/consent` | MARKETING |
| GET | `/admin/leads` | MARKETING |
| GET | `/admin/leads/:id` | MARKETING |
| POST | `/admin/campaign-templates` | MARKETING |
| GET | `/admin/campaign-templates` | MARKETING |
| POST | `/admin/campaign-templates/:id/approve` | MARKETING |
| POST | `/admin/campaigns/preview` | MARKETING |
| POST | `/admin/campaigns` | MARKETING |
| GET | `/admin/campaigns` | MARKETING |
| GET | `/admin/campaigns/:id` | MARKETING |
| GET | `/webhooks/whatsapp` | Public, verify token |
| POST | `/webhooks/whatsapp` | Public, app-secret signature |

`SUPER_ADMIN` passes every role check. The body is JSON: `{ "csv", "fileName?", "columns?" }`.
`columns` maps a header to a lead field and, when present, replaces the built-in aliases.

## Rules enforced

- Preview writes nothing. Commit saves every row with a Pakistani mobile number and leaves the others out. A file with no such number is rejected.
- Rows that share a phone become one lead. The first non-empty name, city and product win; a later empty cell does not clear them.
- A case number is stored once. Importing the same file again does not duplicate that case.
- A phone that already belongs to a customer is linked. The customer record itself is not changed, and no login is created.
- Consent stays `UNKNOWN`. The export has no opt-in column, so a commit cannot make a number eligible for a marketing send.
- The audit row records counts and the file name. It does not record phone numbers.
- Files are capped at 2 MB and 5,000 data rows. Excel workbooks are not accepted; export CSV.
- Consent is set with `PATCH /admin/leads/:id/consent` to `OPTED_IN` or `OPTED_OUT`. A later import leaves that choice in place.
- `POST /admin/leads/opt-out` records a STOP reply for a number that is already a lead. Inbound WhatsApp replies wait for the provider webhook.
- A template starts as `DRAFT`. The body must mention STOP and may only use `{{firstName}}`, `{{productInterest}}`, and `{{city}}`. Approving it is what makes a send possible.
- Preview counts the audience and writes nothing. A send includes leads whose consent is `OPTED_IN` and whose city and product interest match. `UNKNOWN` and `OPTED_OUT` stay out, and the request cannot override that.
- One send is capped at 200 recipients. Each recipient is stored as `SENT` or `FAILED`. The message channel is `WHATSAPP`.
- `NOTIFICATIONS_CHANNEL` defaults to `console`. That adapter logs the rendered body and does not call Meta. `none` refuses the send. `whatsapp` posts an approved template to the Cloud API and refuses to boot without `WHATSAPP_ACCESS_TOKEN` and `WHATSAPP_PHONE_NUMBER_ID`.
- A Cloud API send needs `providerTemplateName` on the template. Blank placeholder values are sent as `-`. A rejected call marks that recipient `FAILED` and leaves recipients already sent as `SENT`.
- `GET /webhooks/whatsapp` answers Meta's challenge when `WHATSAPP_VERIFY_TOKEN` matches. `POST` checks `X-Hub-Signature-256` with `WHATSAPP_APP_SECRET`. A text or button that contains STOP opts that lead out. An unknown number is ignored, and the phone is not written to the audit log.
- The campaign audit row stores the template, the filters, and the counts.

Recognized headers include Phone, Caller Phone, Caller Phone Number, First Name, Last Name, Contact, Account Name, City, Locality, Locality/District, ZipCode, Country, Product, Product Group, Case Number, Case Status, Case Comment, Priority and Owner. Phone values may use local, `92`, `0092`, or `Phone:0092` forms.

The marketing console is under Leads and Campaigns. Import previews a CSV before saving. A lead page records opt-in and opt-out, and the list records a STOP reply by phone. Templates are drafted and approved there. A new campaign previews the opted-in audience and then sends.

## Not in this increment

- Two-way chat, media upload, and matching a product-interest string to a catalog product.

## Next

Increment 3.9 remains the reserved hardening pass (isolated test databases, Lighthouse and k6, reverse proxy, CSP, observability, and docs sync). It has not been started.
