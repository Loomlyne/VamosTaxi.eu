# Phase 14: Inbound webhook - Pattern Map

**Mapped:** 2026-09-17
**Phase directory:** `.planning/phases/14-inbound-webhook`

Use these analogs. Do not invent a second webhook or a Next `/ops` page.

## Files to create / modify

| File | Role | Analog | Notes |
|------|------|--------|-------|
| `apps/web/lib/ops/ticket-mail.ts` | parse / strip / token / RFC | itself | Add `stripQuotedHistory`, parse headers, `received_for` |
| `apps/web/lib/ops/ticket-mail.test.ts` | unit | itself + `ticket-inbound.test.ts` | Wave 0 first |
| `apps/web/lib/ops/ticket-inbound.ts` | ingest TX | itself | Plus then RFC; event after resolve |
| `apps/web/lib/ops/ticket-inbound.test.ts` | unit | itself | Mock `asSystem` like `tickets-write.test.ts` |
| `apps/web/lib/ops/ticket-inbound-files.ts` | R2 + caps | `PHOTOS` put/get consumers under `lib/ops` if any; else new | Keys `support/{submissionId}/{messageId}/{fileId}` |
| `apps/web/lib/ops/ticket-inbound-files.test.ts` | unit | new | No network |
| `apps/web/app/api/webhooks/resend/route.ts` | public webhook | itself | Keep Svix; always GET receiving |
| `apps/web/app/[locale]/(ops)/api/staff/tickets/[id]/files/[fileId]/route.ts` | staff GET | `apps/web/app/[locale]/(ops)/api/staff/tickets/` | `withStaff`; stream R2 |
| `packages/db/supabase/migrations/*_support_message_files.sql` | schema | `20260904182631_contact_ticket_schema.sql` | RLS force; revoke anon; grant staff SELECT; asSystem writes |
| `apps/web/wrangler.jsonc` | bind R2 | `PHOTOS` / `vamos-photos-staging` | `SUPPORT_FILES` / `vamos-support-staging` on staging, ops-changes, front. **Do not edit `env.production`.** |
| `apps/web/lib/env.d.ts` | types | `PHOTOS: R2Bucket` | Add `SUPPORT_FILES: R2Bucket` |
| `packages/db/database.types.ts` | types | regen after owner-apply | Do not hand-edit if MCP generate is the path |

## Do not touch

- `app/ops/OpsSupportTicket.dc.html` — Phase 15
- `apps/web/lib/ops/tickets-write.ts` send path — Phase 13 other session
- `/api/contact` Reply-To plus-address — D-13 keep
- `env.production` in wrangler.jsonc
- Apex MX / `vamostaxi.eu`
- `PHOTOS` bucket usage

## Code excerpts (analogs)

### Webhook verify + thin event fetch

`apps/web/app/api/webhooks/resend/route.ts`: `request.text()` → `Webhook(secret).verify` → `email.received` only → `readInboundPayload` → `receivedBody` GET → `ingestInboundEmail`.

### Ingest (gaps)

`apps/web/lib/ops/ticket-inbound.ts`: `tokenFromInboundTo` only; `if (!token \|\| !body) return "drop"`; inserts `support_inbound_events` **before** ticket SELECT.

### Status

`inboundTicketStatus` already returns `"responded"`. Keep.

### Schema

`support_messages.body_text` CHECK 1–8000. `rfc_message_id text`. `support_inbound_events.email_id` PK. No file table yet.

### Staff tickets API

Existing staff ticket routes under `apps/web/app/[locale]/(ops)/api/staff/tickets/`. Copy `withStaff` + `staffOriginAllowed` GET pattern. No CSRF needed on GET.

### R2

`CloudflareEnv.PHOTOS: R2Bucket` in `apps/web/lib/env.d.ts`. wrangler.jsonc `r2_buckets` binding `PHOTOS` / `vamos-photos-staging`. New twin: `SUPPORT_FILES` / `vamos-support-staging`.

## Data flow

Resend event → verify → GET receiving → match → strip → R2 → TX Postgres → staff GET reads R2.

## Pattern mapping complete

## PATTERN MAPPING COMPLETE
