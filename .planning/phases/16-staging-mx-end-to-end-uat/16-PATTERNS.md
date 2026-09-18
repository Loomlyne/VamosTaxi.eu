# Phase 16: Staging MX + end-to-end UAT - Pattern Map

**Mapped:** 2026-09-18
**Phase directory:** `.planning/phases/16-staging-mx-end-to-end-uat`

Use these analogs. Do not invent a second webhook, a Next `/ops` page, or a new From helper.

## Files to create / modify

| File | Role | Analog | Notes |
|------|------|--------|-------|
| `apps/web/lib/ops/ticket-mail.ts` | Flag flip only | itself | `REPLIES_DOMAIN_VERIFIED` false until 16-03 |
| `apps/web/lib/ops/ticket-mail.test.ts` | unit | itself | Wave 0 `staffSender`; 16-03 true path |
| `apps/web/lib/ops/tickets-write.test.ts` | unit | itself | `STAFF_FROM` becomes plus-address in 16-03 |
| `apps/web/lib/ops/phase-13-must-not.test.ts` | source-read | itself | D-09 false in 16-01; true in 16-03. D-08 contact EMAIL stays |
| `docs/ops/replies-mx.md` | runbook | `docs/ops/waf-vamostaxi-site.md` | Applied records + SES rollback hostname. No secrets |
| `.planning/phases/16-staging-mx-end-to-end-uat/16-UAT.md` | live UAT | 18-UAT style numbered | D-11…D-16 |

## Do not touch

- `app/ops/OpsSupportTicket.dc.html` / `OpsSidebar.dc.html` — chrome frozen (D-17)
- `apps/web/lib/forms/notify.ts` contact EMAIL path — D-02
- `apps/web/app/api/contact/route.ts` — Reply-To plus stays; From stays EMAIL
- `apps/web/app/api/webhooks/resend/route.ts` — reuse (D-07)
- `apps/web/lib/ops/ticket-inbound.ts` — ingest already 14
- `env.production` in wrangler.jsonc
- Apex `@` DNS / zone `vamostaxi.eu`
- Funnel 7–11, `POST /api/quote`, Staff tab

## Code excerpts (analogs)

### From / Reply-To

`staffSender(token)` in `ticket-mail.ts`: if flag, `from: Vamos Taxi <plus>`, `replyTo: plus`; else `CONTACT_FROM` + plus Reply-To. `tickets-write.ts` already calls it.

### Webhook

`POST /api/webhooks/resend` — Svix, `email.received`, GET receiving. Unsigned already `400 invalid`.

### DNS

Cloudflare zone `vamostaxi.site` (NS elias/magdalena). Filter writes to `replies` / `*.replies`. Live SES MX on `replies`: `10 inbound-smtp.ap-northeast-1.amazonaws.com.` Rollback target.

### Overlay observe

Phase 15: files in `[data-msg]`; escaped `body`; Support rail; no poll.

## Data flow

Gmail Reply → Resend MX on `replies.` → existing webhook → existing ingest → existing overlay.

Staff Send after 16-03: plus From → customer Gmail Reply hits same plus (even if client ignores Reply-To).

## Pattern mapping complete

## PATTERN MAPPING COMPLETE
