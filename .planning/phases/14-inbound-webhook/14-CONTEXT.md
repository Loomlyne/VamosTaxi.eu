# Phase 14: Inbound webhook - Context

**Gathered:** 2026-09-17
**Status:** Planned — signed 2026-09-18. Phase 13 still owns STATE `current`. Do not `state planned-phase` until 13 is done.

<domain>
## Phase Boundary

Signed Resend `email.received` webhook appends a customer Gmail reply to the **existing** ticket. Unmatched mail is not a ticket. Plus-token first, then RFC ids — never `From`. Closed + inbound **auto-reopens to Responded** and the mail (and files) show on the thread.

**Also in this phase (owner folded):** inbound **attachments** land on the same thread so Ops can see them. Staff Send stays text-only.

**Not this phase:** staging MX / Resend receiving DNS (16), `#support` chrome (15), staff outbound (13), catch-all `info@`, outbound attach from the composer, Staff tab, funnel 7–11, `vamostaxi.eu`, `env.production`, push `main`.

</domain>

<decisions>
## Implementation Decisions

### Match and ignore
- **D-01:** Match order: plus-token in `to` / `received_for`, then RFC `In-Reply-To` / `References` against stored ids. **Never** match on `From`. A different From still appends if token or RFC hits.
- **D-02:** Mail that is not a reply to an existing ticket does **not** become a ticket. Drop it. No catch-all.
- **D-03:** Webhook is signed (Svix `svix-*` on the raw body). Unsigned POST is 4xx on deployed staging. Missing `RESEND_WEBHOOK_SECRET` is 503. Non-`email.received` events return 200 and do nothing.

### Closed and status
- **D-04:** Customer Reply on **Closed** → auto-reopen to **Responded**, show the mail. `closed_at` cleared. ROADMAP 14 “stay closed” is **dead**; Phase 12 D-13 wins.
- **D-05:** Any matched inbound sets status **Responded**, including from **New** (skip Open). Open / Replied / Responded → Responded.

### Body
- **D-06:** Strip Gmail quoted history. Store and show only the new paragraph. Cap still 8000 on the stripped text.
- **D-07:** If the ticket matched and there is no usable text **and** no kept file: append a generic unreadable line (escaped). Do **not** drop a matched ticket. Do not store raw HTML.

### Attachments (SUP-F02 inbound folded)
- **D-08:** Customer files appear on the **same thread**. Real storage, staff can open them in Ops. Not a fake pill.
- **D-09:** Images preview in the thread. Other types = filename + download. Staff-only. No public hotlink.
- **D-10:** Oversize / unsupported: keep any text (D-06); do **not** keep that file; thread line that the file was not kept.
- **D-11:** Dispatcher **Send** stays text-only. No attach control on the composer (not painted). Outbound attach stays out.

### Plumbing
- **D-12:** Idempotent on provider `email_id` (`support_inbound_events`). Retry is not a second row.
- **D-13:** Contact-ack **Reply-To plus-address** (already on `/api/contact`) must stay so the first customer reply works before any staff Send. Do not strip it in 13 leftover plans.
- **D-14:** No MX / no Resend receiving DNS this phase. That is 16. Do not steal apex Gmail MX.

### Must-nots
- **D-15:** No `POST /api/quote`, no Staff tab, no live `vamostaxi.eu` DNS, no `env.production`, no push `main`, funnel 7–11 frozen. No IMAP. No invented legal copy.

### Claude's Discretion
- Quote-strip algorithm (plain-text `--` / `>` / Gmail `On … wrote:`). Fail toward “too much kept” over deleting the customer’s new paragraph.
- Object store (R2 vs Supabase Storage): staff-only read, no anonymous URL. Size cap and MIME allow-list — pick something boring and document it in the plan.
- Existing `apps/web/app/api/webhooks/resend/route.ts` + `ticket-inbound.ts` is the starting point. Close gaps (RFC match, quote strip, attachments). Do not invent a second webhook.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Product
- `.planning/ROADMAP.md` — Phase 14 goal, INB-02, match order, must-nots. **Ignore** “Closed stays closed” — overridden by D-04.
- `.planning/REQUIREMENTS.md` — INB-02; SUP-02 customer mail → Responded; SUP-F02 inbound is **in** via D-08 (outbound attach still out).
- `.planning/PROJECT.md` — Gmail is a copy; no IMAP; no live chat; inbound without INB-02 is a catch-all.
- `.planning/phases/12-ticket-schema-support-mock/12-CONTEXT.md` — D-13 inbound → Responded; Closed auto-reopen.
- `.planning/phases/13-staff-apis-outbound-resend-replies/13-CONTEXT.md` — plus-address, RFC ids, fail-closed send. Do not reopen 13 send.
- `.planning/phases/15-wire-ops-support-to-apis/15-CONTEXT.md` — how Ops **shows** inbound + files (plan 14 storage so 15 can render).

### Code
- `apps/web/app/api/webhooks/resend/route.ts` — Svix verify + `email.received`
- `apps/web/lib/ops/ticket-inbound.ts` — ingest; plus-token only today
- `apps/web/lib/ops/ticket-mail.ts` — token parse, `inboundBody`, `inboundTicketStatus` (always `responded`)
- `apps/web/app/api/contact/route.ts` — customer ack Reply-To plus-address + RFC Message-ID
- `packages/db/supabase/migrations/20260904182631_contact_ticket_schema.sql` — `support_inbound_events`, `reply_token`, `support_messages`

### Must-not
- No `sk_live_`, no `vamostaxi.eu`, no `env.production`, no push `main`
- Apex MX stays Gmail for `info@`

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `ingestInboundEmail` + `support_inbound_events` unique `email_id`
- `tokenFromInboundTo` / `parseTicketReplyToken`
- `inboundTicketStatus` already returns `responded` and ingest clears `closed_at` — matches D-04/D-05
- Webhook already fetches receiving body when the event is thin

### Established Patterns
- Worker secrets via `wrangler secret` (`RESEND_WEBHOOK_SECRET` owner-gated)
- Staff APIs under `apps/web/app/[locale]/(ops)/api/staff/` — webhook stays **public** `/api/webhooks/resend`
- New SQL is owner-apply; agent does not `supabase db push`

### Integration Points
- 13 stores RFC ids on outbound + contact ack — 14 matches them
- 15 GET/thread renders `support_messages` + files this phase stores
- 16 points receiving MX at Resend; 14 must work against a signed fixture without live MX

</code_context>

<specifics>
## Specific Ideas

- “include the attachment i wanna be able to see in ops same thread”
- Closed inbound: auto-reopen to Responded (signed this sitting)
- “you decide” on Gmail quotes → strip to the new paragraph (D-06)

</specifics>

<deferred>
## Deferred Ideas

- Staging MX + Reply-in-Gmail UAT — Phase 16
- `#support` list/thread chrome, badge, Save, mailto — Phase 15
- Outbound attachments from dispatcher Send
- Catch-all `info@` tickets
- SUP-F03 assignment / SLA / macros / CSAT
- SUP-F04 deep-link booking ref → ops detail
- Live `vamostaxi.eu` DNS

</deferred>

---

*Phase: 14-Inbound webhook*
*Context gathered: 2026-09-17*
