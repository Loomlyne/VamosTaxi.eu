# Phase 13: Staff APIs + outbound Resend replies - Context

**Gathered:** 2026-09-15
**Status:** Ready for planning

<domain>
## Phase Boundary

Dispatcher Send on `#support` delivers a real Resend mail. The customer gets it on the **same Gmail thread**. `info@vamostaxi.site` gets a **BCC**. RFC `Message-ID` is stored (not Resend UUID as the thread id). Contact-form **ack stays Cloudflare `EMAIL`**. Ticket replies are **Resend only** — no EMAIL fallback.

**Also in this phase (owner expanded):** branded pass over **every** outbound template in `packages/emails` (confirmation, reminder, cancel, assign, pay-link, refund, review, auth, ops-must-fix, contact family, staff reply). Same dashboard family (charcoal, `#FDC20B` accent, wordmark, EN/DE/FR/AR). Each mail carries the fields that mail needs. Skip-send if copy is missing. This is **templates + send plumbing**, not a reopen of quote/checkout/Stripe/`/pricing`.

**Not this phase:** inbound webhook (14), staging MX / Resend receiving (16), catch-all `info@` tickets, attachments, saved replies, Staff tab, funnel **logic**, `vamostaxi.eu`, `env.production`, push `main`.

</domain>

<decisions>
## Implementation Decisions

### What Gmail shows
- **D-01:** Target From is `Vamos Taxi <ticket+{token}@replies.vamostaxi.site>` with the same Reply-To. **Until the owner verifies `replies.vamostaxi.site` in Resend**, send From stays `Vamos Taxi <noreply@vamostaxi.site>` (apex DKIM already exists) and **Reply-To is the plus-address**. Flip From to plus-address only after that verify. Do not steal apex MX.
- **D-02:** Subject is always `Re:` the contact-ack subject. No subject field in the overlay.
- **D-03:** Staff reply (and all `packages/emails` templates this phase) use Vamos brand chrome — charcoal, full-strength yellow as a small accent, wordmark — same family as the dashboard. Gmail will not load Qurova; tokens and layout carry the brand.
- **D-04:** Each template includes only the fields that mail needs. Staff reply: typed body, customer name, `booking_ref` when present, enough thread context to stand alone. No invented legal copy.
- **D-05:** BCC `info@vamostaxi.site` on every staff reply via Resend `bcc`, not a second `EMAIL` send. Customer `To` is only the customer.

### Resend failure
- **D-06:** Fail closed on staff replies (and other Resend-backed sends in this phase). No Cloudflare `EMAIL` fallback. No `support_messages` row, no status **Replied**, until Resend accepts with an id.
- **D-07:** Dispatcher overlay shows a **generic** error (“Couldn’t send. Try again.” / existing `overlayError`). No Resend JSON, no API keys.
- **D-08:** First-place bug was swallowed Resend `error` + EMAIL fallback in `sendContactMessage`. Staff path now `allowEmailFallback: false`. Contact ack may still use EMAIL.
- **D-09:** Owner must add/verify `replies.vamostaxi.site` in Resend (DKIM) before D-01 From flip. Live MX on `replies.` is currently **AWS SES ap-northeast-1** — receiving MX is Phase 16; do not point apex MX at Resend.

### Send rules
- **D-10:** Empty body → error, no send. Closed ticket → no send (composer already no-ops). Body language = **ticket locale**. BCC per D-05.
- **D-11:** Staff send → status **Replied** (Phase 12 D-13). Do not implement inbound → Responded here.

### Overlay this phase
- **D-12:** Wire DC Send now. `OpsSupportTicket.dc.html` already `PATCH /api/staff/tickets/:id` with `{ reply }`. Keep that contract. Dual-DC public copy. Generic `overlayError` on failure (D-07).

### Claude's Discretion
- How to share voucher layout tokens across React email components vs contact.ts HTML strings — planner/researcher.
- Persist both `rfc_message_id` (thread) and `resend_email_id` (provider) — GET-after-send identity is RFC.
- Dual-DC sync for OpsSupportTicket after any composer copy change.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Product
- `.planning/ROADMAP.md` — Phase 13 success criteria (RPLY-01, RPLY-02); Phase 14 inbound; Phase 16 MX; must-nots
- `.planning/REQUIREMENTS.md` — RPLY-01, RPLY-02; SUP-02 staff reply → Replied; SUP-F02 attachments out
- `.planning/PROJECT.md` — Ops is working inbox; Gmail is a copy; no IMAP
- `.planning/phases/12-ticket-schema-support-mock/12-CONTEXT.md` — D-13 send → Replied; composer painted, send is this phase
- `.planning/phases/11-launch-cutover/11-CONTEXT.md` — From/Reply-To stay `*@vamostaxi.site`; support `info@vamostaxi.site`

### Send / templates
- `apps/web/lib/forms/notify.ts` — Resend vs EMAIL; `allowEmailFallback`
- `apps/web/lib/ops/tickets-write.ts` — PATCH reply path
- `apps/web/lib/ops/ticket-mail.ts` — plus-address, RFC ids
- `apps/web/app/[locale]/(ops)/api/staff/tickets/[id]/route.ts` — PATCH
- `packages/emails/src/lib/send.ts` — confirmation/lifecycle From `noreply@vamostaxi.site`
- `packages/emails/src/contact.ts` — `renderStaffReplyEmail`
- `packages/emails/src/*.tsx` — Confirmation, Reminder24h, Cancellation, assign, PayLink, refund, review, OpsMustFix, auth
- `app/ops/OpsSupportTicket.dc.html` — `sendReply` already PATCHes `{ reply }`
- `apps/web/lib/contact-channels.ts` — `SUPPORT_EMAIL`, `BOOKINGS_OPS_EMAIL`

### Must-not
- No `sk_live_`, no `vamostaxi.eu`, no `env.production`, no push `main`
- Lifecycle ops copies stay `bookings@`, never `info@` (except staff-reply BCC)
- Apex MX must not become Resend (steals Gmail `info@`)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `patchTicket` + staff PATCH already send-then-insert; needs From/BCC/fail-closed (partially applied 2026-09-15)
- `threadHeaders` / `ticketReplyAddress` / `contactMessageId`
- `@vamos/emails` React templates + `send.ts` already fail-closed on missing `RESEND_API_KEY`
- DC overlay `overlayError` + `sending` flags

### Established Patterns
- Staff APIs under `apps/web/app/[locale]/(ops)/api/staff/`
- Ops is DC hash console, not Next `/ops/support`
- Dual DC: `app/ops/` then public copy
- Worker secret `RESEND_API_KEY` is bound on staging `vamos`

### Integration Points
- Contact ack: `app/api/contact/route.ts` + `sendContactMessage` + `EMAIL` (keep)
- Staff reply: PATCH `{ reply }` only
- Lifecycle sends: `notify-lifecycle.ts`, `voucher.ts`, `assign.ts` — brand pass in this phase, not new events

</code_context>

<specifics>
## Specific Ideas

- “I want the email to be branded same as the dashboard with brand system and have all information needed for each specific email.”
- “Get all emails and sends no need for it be specific for supports only and get this now inside 13.”
- Investigate Resend now: key is bound; apex DKIM exists; `replies.` is not a Resend sending domain yet; `replies.` MX is AWS SES.

</specifics>

<deferred>
## Deferred Ideas

- Resend **receiving** MX on `replies.vamostaxi.site` (replace AWS SES) — Phase 16
- Inbound webhook matching — Phase 14
- Remaining SUP-03 thread polish if any — Phase 15
- Inbound attachments in the Ops thread — Phase 14 (owner folded SUP-F02 inbound on 2026-09-17). Outbound attach from Send still out.
- Macros/SLA (SUP-F03)
- Live `vamostaxi.eu` DNS
- From plus-address **go-live** until owner verifies `replies.vamostaxi.site` in Resend (D-01 gate)

</deferred>

---

*Phase: 13-Staff APIs + outbound Resend replies*
*Context gathered: 2026-09-15*
