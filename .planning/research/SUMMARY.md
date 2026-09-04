# Project Research Summary

**Project:** Vamos Taxi V1 — milestone v1.1 Ops Support
**Domain:** Two-way email tickets in Ops (contact-form origin, Resend inbound, Worker replies)
**Researched:** 2026-09-04
**Confidence:** HIGH on stack, MX, and in-repo integration; decisions below reconcile STACK vs ARCHITECTURE conflicts

> v1.1 only. Frozen v1.0 booking/payments/dispatch research lives in
> `.planning/research/v1.0-archive/` and is not restated here. Do not touch that archive.
> Quote → pay → board (Phases 7–11) stays frozen. Live `vamostaxi.eu` DNS stays Phase 11.

## Executive Summary

v1.1 turns the existing one-way `/contact` pipe (`contact_submissions` + SITE-04 Gmail copy) into a conversational shared inbox inside Ops. The customer never sees a ticket UI: they submitted the form and they hit Reply in Gmail. Ops `#support` is the working inbox; Gmail `info@vamostaxi.site` remains a carbon copy. Industry shape is Help Scout / Front (conversation + status), not Zendesk (queues/SLA/tags) and not a shared mailbox.

**Recommended approach:** extend `contact_submissions` as the ticket header (no parallel `support_tickets` table). Hang `support_messages` + `support_inbound_events` off that row. Receive on subdomain `replies.vamostaxi.site` so apex MX stays Gmail. Staff replies and inbound use Resend; the contact ack may keep Cloudflare `env.EMAIL`. **From and Reply-To on outbound ticket mail must be the receiving address** — `noreply@` From with Reply-To-only is not enough, because some clients reply to From and then Gmail never hits the webhook.

**Key risks:** (1) Resend receiving MX on apex `vamostaxi.site` steals `info@` from Gmail; (2) threading on Resend UUID / 12-char outbox suffix instead of RFC `Message-ID`; (3) matching inbound by spoofable `From:`; (4) copying the Supabase `standardwebhooks` verifier onto Resend's Svix headers; (5) putting `#staff` back in the rail while adding `#support`. Mitigation is the phase order below: schema first, outbound that stores real RFC ids, then inbound, then UI, then staging MX last.

## Reconciled decisions (STACK vs ARCHITECTURE)

These were explicit disagreements across the four research files. Roadmap and plans treat the **Decision** column as binding.

| Conflict | STACK | ARCHITECTURE | Decision | Rationale |
|----------|-------|--------------|----------|-----------|
| Ticket root | New `support_tickets` 1:1 with `contact_submissions` + `support_ticket_messages` | Extend `contact_submissions` + `support_messages` + `support_inbound_events` | **ARCHITECTURE** | v1.1 tickets **are** `/contact` rows. Phone-typed tickets are out, so a parallel header is the same cardinality plus a join. FEATURES: do not invent a second contact store. |
| Receiving host | `inbound.vamostaxi.site` | `replies.vamostaxi.site` | **`replies.vamostaxi.site`** | Name is not frozen DNS yet; pick one. MX stays **off apex** either way so Gmail `info@vamostaxi.site` survives. Never enable receiving on `vamostaxi.site` or live `vamostaxi.eu`. |
| Ticket reply From | `From` + `Reply-To` on the receiving domain | `From: noreply@vamostaxi.site` + `Reply-To` receiving | **STACK / PITFALLS: From and Reply-To are receiving addresses** | Some mobile clients ignore `Reply-To` and reply to `From`. If From is `noreply@` or `info@` (Gmail MX), Reply-in-Gmail never hits Resend. Verify sending (SPF/DKIM) on `replies.` as well as receiving MX. |
| Dual-send (providers) | Ticket replies via Resend; `env.EMAIL` stays for auth + contact | Same split; do not send replies through `EMAIL` or the intake outbox | **Contact ack may stay Cloudflare `EMAIL`. Ticket replies + inbound are Resend only.** | `EMAIL` cannot set `In-Reply-To` / `References` / plus-address Reply-To. Do not silently migrate the contact ack in the same PRs. Do not BCC/dual-send the same MIME through both providers. |
| Plus-address | `support+{ticketId}@inbound…` (row UUID) | `ticket+{reply_token}@replies…` (opaque token, not UUID) | **ARCHITECTURE token** | UUID in the address leaks the primary key. `reply_token` is minted at insert, unique, used only in Reply-To / From plus-address. |
| Gmail copy of **thread** mail | BCC `info@` on staff replies; `receiving.forward` inbound | Intake copy only — do not BCC every staff reply | **Intake copy required (SITE-04). Thread copies via Resend only (BCC outbound, forward inbound).** | PROJECT.md still requires Gmail to get a copy. PITFALLS UAT: a real ticket reply still arrives at `info@`. That copy is Resend BCC/forward — not a second `env.EMAIL` send. Ops remains the working inbox; answering in Gmail splits threads. |
| Opening body | First message is the form body (not an email) on `support_tickets` | Seed `support_messages` `direction=inbound_form`; form column stays source of truth | **ARCHITECTURE** | Thread UI should not special-case the form row. Do not treat the copy as a second SoT. |
| `handled_at` | Ticket `status` is Ops SoT; `handled_at` can stay | Leave the column; do not read it | **Leave `handled_at`; do not overload it.** | A timestamp cannot express New / Open / Replied / Closed. |

## Key Findings

### Recommended Stack

Full detail: [STACK.md](./STACK.md). v1.0 stack is frozen (Workers + OpenNext, Worker `vamos`, Supabase `yaumjzvylngfjhtuffqs` via Hyperdrive, `postgres@3.4.9`). v1.1 adds no new vendor, no new Worker, no Queue, no R2, no chat SDK.

Bump `resend` in `apps/web` from `6.24.0` → **`6.26.0`**. Use `emails.send` (replies), `webhooks.verify` (Svix), `emails.receiving.get` (body — webhook is metadata-only), `emails.receiving.forward` (Gmail copy of inbound). Zod already in-repo validates verified payloads. `@vamos/emails` renders the staff-reply template (en/de/fr/ar); do not add `react-email`. New secret: `RESEND_WEBHOOK_SECRET` via `wrangler secret put --env staging`. `RESEND_API_KEY` already on Worker `vamos`.

**Core technologies:**
- `resend@6.26.0` — send ticket replies, verify inbound, fetch bodies, forward Gmail copies — already in the Worker; bump, do not add a second mail SDK
- Resend Receiving on **`replies.vamostaxi.site`** — MX target for Reply-in-Gmail; plus-address routing without IMAP; apex MX stays Gmail
- Resend webhook `email.received` — push inbound into `POST /api/webhooks/resend` on the public hostname; Svix headers, not `standardwebhooks`
- Existing Postgres + Hyperdrive — ticket header on `contact_submissions`; thread + inbound-event tables; `asStaff` / `asSystem` only

### Expected Features

Full detail: [FEATURES.md](./FEATURES.md). Table stakes of a small-operator shared inbox, scoped to `/contact` origin. Not a help desk product.

**Must have (table stakes):**
- Ops `#support` list of `contact_submissions` as tickets — one working inbox; Staff tab stays gone
- Status New / Open / Replied / Closed — `handled_at` is too coarse
- Ticket detail: original form fields + thread (newest last)
- Reply from the ticket via Resend, with RFC threading headers, persisted outbound body + `Message-ID`
- Customer Reply-in-Gmail appends to the **same** ticket (plus-token, then `In-Reply-To` / `References`)
- SITE-04 Gmail copy of the original submission still sends
- Signed, idempotent inbound; unmatched inbound does **not** create a ticket
- Staff-only (existing RLS / `vamos_staff`); no new public read

**Should have (competitive, cheap, do not block launch):**
- Show existing `booking_ref` and form `locale` on the ticket (deep-link to booking is P2)
- Native Ops inbox instead of Zendesk/Help Scout — PII stays in this Supabase project
- WhatsApp remains the live human channel (SITE-09); `#support` does not replace it

**Defer (v1.x / v2+ / never in v1.1):**
- Reopen-on-reply if launch ships Closed-stays-closed (ARCHITECTURE recommends auto-reopen; owner can freeze no — decide in plan)
- Attachments, saved replies, filter/search, assignment, SLA, CSAT, macros, AI tags/replies
- Live chat, Gmail IMAP, phone-typed tickets, catch-all inbound on `info@`, live `vamostaxi.eu` MX
- Vendor help desk

### Architecture Approach

Full detail: [ARCHITECTURE.md](./ARCHITECTURE.md), with From/Reply-To and Gmail-thread-copy overridden by the reconciled table above.

One Worker `vamos`, two hostnames. `POST /api/contact` stays intake (`asAnon` RPC + `asSystem` outbox). Staff APIs dual-mount like customers: `/api/staff/support*` with `withStaff` + `asStaff` on `HYPERDRIVE_NOCACHE`. Inbound is **not** under `/api/staff`: `POST /api/webhooks/resend` on `vamostaxi.site`, Svix, then `asSystem`. Ops stays DC mocks with a new hash — not a Next.js `/ops/support` page.

**Major components:**
1. `contact_submissions` (extended) — ticket header: `ticket_status`, `reply_token`, `last_activity_at`, `closed_at`; form fields stay immutable
2. `support_messages` — thread (`inbound_form` / `outbound_staff` / `inbound_email`); RFC `Message-ID` + Resend `email_id`
3. `support_inbound_events` — webhook idempotency on Resend `email_id` (Stripe-events shape, not a reuse of `stripe_events`)
4. `POST /api/staff/support/:id/reply` — insert message first, then `resend.emails.send` with idempotency key = message id; From/Reply-To on `replies.vamostaxi.site`
5. `POST /api/webhooks/resend` — verify → dedupe → `receiving.get` → plus-token match → append → status `open` (recommend reopen if closed)
6. Ops `#support` — `OpsSupport.dc.html` + sidebar item + `ops.dc.html` hash; mock before build

**Status machine:** submit → `new`; staff open/PATCH → `open`; staff reply → `replied`; inbound (not closed) → `open`; staff PATCH → `closed`; inbound on closed → `open` (recommended). Dispatcher can PATCH any of the four. No fifth status. No auto-tags.

**Match order (first hit wins):** (1) plus-token in `to` / `received_for`; (2) `In-Reply-To` / `References` against stored RFC ids; (3) no match → 200 drop, no new ticket. Never match on `From` equality.

### Critical Pitfalls

Full detail: [PITFALLS.md](./PITFALLS.md). Top risks that should shape phase must-nots:

1. **Resend receiving MX on apex or on live `vamostaxi.eu`** — steals Gmail `info@` or is forbidden live DNS. Receive only on `replies.vamostaxi.site`. Phase 11 copies the proven staging pattern; it does not invent MX on the live zone.
2. **Threading on Resend `email_id` / 12-char `provider_suffix`** — Gmail threads on RFC `Message-ID`. Persist RFC ids; set `In-Reply-To` / `References`; retrieve `message_id` after send. Outbound must land before inbound can match.
3. **Matching inbound by `From:`** — spoofed guest mail injects into a real ticket. Require plus-token and/or `In-Reply-To` this system minted. Unmatched = drop.
4. **Wrong webhook verifier / skipped verify / no body fetch** — Resend is Svix (`svix-*`), raw `request.text()`, then `emails.receiving.get`. Do not reuse `standardwebhooks`. Unsigned POST 4xx on **deployed** staging. Persist body from GET, not webhook metadata.
5. **Dual-send and `noreply@` From** — ticket thread mail is Resend only, From/Reply-To on the receiving host. Contact ack may keep `env.EMAIL`. Restoring the Staff tab, inbound XSS (`dangerouslySetInnerHTML`), POST `/api/quote` as support smoke, and pushing `main` are process gates on every phase.

## Implications for Roadmap

v1.1 phases are **new workstreams**, not v1.0 Phases 4–11. Do not number them as a continuation of the booking funnel. Strict spine: schema → outbound (RFC ids) → inbound → UI wire-up → staging MX. Mock `#support` before implementing the DC page (same rule as phone booking). Funnel code (`/api/quote`, checkout, board) is a must-not on every phase.

### Phase 1: Ticket schema + `#support` mock
**Rationale:** Header columns and child tables are the root every API hangs off. A parallel `support_tickets` table is the research conflict we already rejected. DC console has no support mock yet — mock first.
**Delivers:** Migration: `ticket_status`, `reply_token`, `last_activity_at`, `closed_at` on `contact_submissions`; `support_messages`; `support_inbound_events`; FORCE RLS; staff SELECT/status UPDATE; `asSystem` INSERT messages/events; no anon grants; `submit_contact_message` mints token + seeds `inbound_form`. `OpsSupport.dc.html` mock + sidebar `#support` (Staff tab stays omitted) in four languages / four widths.
**Addresses:** Ticket list/status/detail as data shape; Staff tab stays gone; PII grants (Pitfall 4)
**Avoids:** Parallel ticket table; overloading `handled_at`; JSONB thread on the form row; PII copied onto outbox; `#staff` rail item

### Phase 2: Staff APIs + outbound Resend replies
**Rationale:** Inbound matching needs RFC `Message-ID`s this system issued. Do not build the webhook before send persists those ids. Provider split is this phase — do not “clean up” contact ack.
**Delivers:** `GET/PATCH /api/staff/support`, `POST …/reply`; `resend@6.26.0`; `renderSupportReplyEmail` in `packages/emails`; send **after** the message row exists; idempotency key = message id; From + Reply-To on `replies.vamostaxi.site`; `In-Reply-To` / `References` / `Re:` subject; persist RFC `Message-ID` via GET-after-send (not `data.id`, not 12-char suffix); BCC `info@` via Resend (not `env.EMAIL`); status → `replied`.
**Uses:** Resend send API, existing `RESEND_API_KEY`, `@vamos/emails`, `asStaff` on `HYPERDRIVE_NOCACHE`
**Implements:** Reply API component; dual-send split (contact ack stays `EMAIL`)
**Avoids:** Pitfalls 2, 6, 8 (quoted HTML still `escapeHtml`); sending through `contact_delivery_outbox` or `env.EMAIL`

### Phase 3: Inbound webhook
**Rationale:** Reply-in-Gmail is the milestone. Auth is the first task in this phase, before any append logic. Volume does not justify a Queue.
**Delivers:** `POST /api/webhooks/resend` on public host; `RESEND_WEBHOOK_SECRET`; `resend.webhooks.verify` on raw body; `email.received` only; dedupe `email_id`; GET body; match plus-token then RFC ids; append `inbound_email`; status → `open` (reopen-if-closed — confirm with owner in plan); `receiving.forward` to `info@`; 200 on duplicate/unmatched; 401 bad sig; 5xx only when retry helps; drop own sending addresses / auto-replies; no attachments to R2.
**Uses:** Resend receiving + Svix verify + `asSystem`
**Implements:** Inbound webhook component
**Avoids:** Pitfalls 3, 7, 11, 12; creating tickets from unmatched mail; dashboard-host 401s; `From:` matching

### Phase 4: Wire Ops `#support` to APIs
**Rationale:** UI needs list/detail/reply from Phase 2. Does not need live MX. Keep DC hash console — no RSC ops page.
**Delivers:** `ops.dc.html` route + `OpsSidebar` item + `OpsSupport.dc.html` talking to `VamosOpsApi` (`/api/staff/support…`). Status filters, thread pane, reply box. Render stored **text** (escaped), never raw inbound HTML. EN/DE/FR/AR, 1440 and 390, dispatcher and admin. No Realtime (poll on focus).
**Addresses:** `#support` list/detail/reply UX
**Avoids:** Pitfalls 5, 8; Next.js `/ops/support` page; Staff tab; English-only label

### Phase 5: Staging MX + end-to-end UAT
**Rationale:** DNS last, after the webhook URL exists. Staging `vamostaxi.site` only.
**Delivers:** Resend domain `replies.vamostaxi.site` with receiving MX (dashboard value, do not guess) + sending SPF/DKIM so From on that host is legal. Webhook URL `https://vamostaxi.site/api/webhooks/resend`. UAT: form → `#support` → reply → Gmail threads → Reply-in-Gmail → same ticket; intake + reply copies at `info@`; apex `dig MX vamostaxi.site` unchanged except the subdomain; `dig MX vamostaxi.eu` untouched; unsigned webhook 4xx on **deployed** staging; spoofed From does not append; `<script>` fixture escaped.
**Avoids:** Pitfall 1; live zone edits; `env.production`; push `main`

### Phase Ordering Rationale

- Schema before APIs — every writer needs `reply_token` and message columns; rejecting `support_tickets` here prevents a migration fork.
- Outbound before inbound — matching requires minted RFC ids; FEATURES dependency graph is explicit.
- Webhook on the public host, not dashboard — Resend has no staff cookie.
- UI after APIs, mock before UI implementation — DC house rule; ARCHITECTURE forbids UI-before-list-API.
- MX last — a receiving domain with no handler just retries; a wrong apex MX loses `info@` immediately.
- This order avoids dual-send cleanup, Staff-tab regressions, and quote-funnel contamination (Pitfalls 6, 5, 9, 10 as every-phase must-nots).

### Research Flags

Phases likely needing deeper research during planning:
- **Phase 2 (outbound):** confirm Resend GET-after-send actually returns RFC `message_id` on this account/plan (STACK: exposed on GET/webhook; send response is UUID). Confirm sending-domain verify on the **subdomain** (SPF/DKIM list from dashboard).
- **Phase 3 (inbound):** exact receiving MX hostname is dashboard-generated (`inbound-smtp.<region>.amazonaws.com` is typical — do not guess). Reopen-on-closed-inbound is a product call (ARCHITECTURE recommends yes).
- **Phase 5 (MX):** live DNS cutover is **not** this milestone; only flag the staging records to copy at Phase 11.

Phases with standard patterns (skip research-phase):
- **Phase 1 schema:** existing contact RLS / `vamos_staff` / `vamos_edge` / FORCE RLS / pgTAP house rules.
- **Phase 4 DC wire-up:** same pattern as `OpsCustomers` / `OpsBoard` + `VamosOpsApi`.
- **Staff APIs:** dual-mount + `withStaff` + `asStaff` already proven on customers/fleet.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Official Resend receiving/send/webhook docs + in-repo versions (`resend@6.24.0` → 6.26.0, Worker `vamos`, EMAIL binding). MEDIUM only on the exact MX hostname. |
| Features | HIGH | PROJECT.md is authoritative for Vamos scope. Industry mapping (Help Scout / Zendesk statuses) is MEDIUM-HIGH and only used for vocabulary. |
| Architecture | HIGH | In-repo contact/outbox/ops/identity patterns verified. From/Reply-To conflict resolved in this summary (receiving address). Subdomain label picked (`replies.`). |
| Pitfalls | HIGH | MX, Svix vs Standard Webhooks, RFC vs UUID, and `env.EMAIL` split are documented from official sources + this repo. Match-key shape follows the token decision above. |

**Overall confidence:** HIGH — enough to roadmap. Remaining gaps are dashboard values and one product call (reopen-on-reply), not stack choice.

### Gaps to Address

- **Exact Resend receiving MX hostname:** copy from the Resend dashboard when adding `replies.vamostaxi.site`; do not hard-code AWS regional MX in a plan.
- **Closed + inbound:** ARCHITECTURE recommends auto-reopen to `open`; FEATURES says pick one rule and stick to it. Confirm in Phase 3 plan, do not invent a fifth status.
- **Contact ack Reply-To:** leaving ack on `noreply@` / `EMAIL` means a customer who replies to the **ack** (before any dispatcher reply) will not land in the ticket. Accept for v1.1 (inbound requires outbound first). Do not migrate ack in the ticket PRs.
- **No `#support` mock today:** Phase 1 includes the DC mock; do not implement the page without it.
- **Gmail-as-copy vs Gmail-as-inbox:** document for the owner that answering in Gmail splits threads. Ops is canonical.

## Sources

### Primary (HIGH confidence)

- [Resend receiving introduction](https://resend.com/docs/dashboard/receiving/introduction) — support-email use case
- [Resend custom-domain receiving](https://resend.com/docs/dashboard/receiving/custom-domains) — MX on verified domain
- [Resend MX conflict / Gmail coexistence](https://resend.com/docs/knowledge-base/how-do-i-avoid-conflicting-with-my-mx-records) — subdomain vs apex; same-priority does not dual-deliver
- [Resend `email.received` webhook](https://resend.com/docs/dashboard/receiving/create-receiving-webhook) — metadata-only; must GET content
- [Resend get email content](https://resend.com/docs/dashboard/receiving/get-email-content) — `emails.receiving.get`
- [Resend threaded replies](https://resend.com/docs/dashboard/receiving/reply-to-emails) — `In-Reply-To` / `References` / `Re:`
- [Resend forward](https://resend.com/docs/dashboard/receiving/forward-emails) — Gmail copy of inbound
- [Resend verify webhooks](https://resend.com/docs/webhooks/verify-webhooks-requests) — raw body, Svix headers, `webhooks.verify`
- [Resend send email](https://resend.com/docs/api-reference/emails/send-email) — `replyTo`, `bcc`, `headers`, idempotency key
- In-repo: `apps/web/package.json`, `app/api/contact`, `lib/forms/notify.ts`, `app/api/auth/email-hook`, `wrangler.jsonc`, `packages/db/supabase/migrations/20260828000002_contact_forms.sql` + `20260902000001_contact_delivery_outbox.sql`, `app/ops/ops.dc.html` + `OpsSidebar.dc.html`
- `.planning/PROJECT.md` — v1.1 goal, out of scope, Gmail copy, Staff tab gone, staging DNS only

### Secondary (MEDIUM confidence)

- Help Scout / Front / Missive shared-inbox model vs Zendesk ticket queues — status vocabulary mapped onto New / Open / Replied / Closed
- npm `resend@6.26.0` (2026-09-03) vs repo `6.24.0`

### Tertiary (LOW confidence)

- Exact Resend receiving MX hostname — dashboard-generated; validate at Phase 5
- Whether every customer client honours `Reply-To` — assumed **no**; that is why From is on the receiving domain

---
*Research completed: 2026-09-04*
*Ready for roadmap: yes*
