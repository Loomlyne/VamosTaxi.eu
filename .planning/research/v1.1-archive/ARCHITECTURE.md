# Architecture Research

**Domain:** Ops Support inbox — contact-form tickets with Resend outbound replies and inbound webhooks, on the existing single Cloudflare Worker + Supabase/Hyperdrive stack
**Researched:** 2026-09-04
**Confidence:** HIGH on how tickets attach to the existing contact intake, staff gate, DC hash console, and Hyperdrive identity doors. MEDIUM on the exact receiving subdomain label (`replies.vamostaxi.site` is the recommended name, not a frozen DNS record) and on whether a Closed ticket auto-reopens on inbound (recommend yes; owner can freeze no).

v1.0 booking/payments/dispatch architecture is archived at `.planning/research/v1.0-archive/ARCHITECTURE.md`. This file covers **v1.1 Ops Support only**. The quote → pay → board funnel is frozen, not redesigned.

## Standard Architecture

### System Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│  Customer browser (vamostaxi.site)     Staff browser                    │
│  /contact form                         (dashboard.vamostaxi.site)       │
│                                        Ops DC mock · hash nav · #support│
└──────────────┬──────────────────────────────────┬───────────────────────┘
               │ POST /api/contact                │ cookie session
               │ Turnstile                        │ withStaff + asStaff
               ▼                                  ▼
┌─────────────────────────────────────────────────────────────────────────┐
│              ONE Worker `vamos` (same deploy, two hostnames)            │
│  ┌──────────────────┐  ┌─────────────────────┐  ┌────────────────────┐ │
│  │ POST /api/contact │  │ /api/staff/support* │  │ POST /api/webhooks/│ │
│  │ submit_contact_   │  │ list / get / status │  │ resend             │ │
│  │ message + outbox  │  │ / reply  (staff)    │  │ Svix verify,       │ │
│  │ customer ack +    │  │ HYPERDRIVE_NOCACHE  │  │ asSystem, no cookie│ │
│  │ Gmail copy        │  │                     │  │                    │ │
│  └────────┬─────────┘  └──────────┬──────────┘  └─────────┬──────────┘ │
│           │ Resend send            │ Resend send           │ GET body  │
└───────────┼────────────────────────┼───────────────────────┼───────────┘
            ▼                        ▼                       ▼
     contact_submissions      support_messages         Resend Receiving
     + contact_delivery_      (thread)                 MX on replies.
     outbox (intake only)     ticket_status            vamostaxi.site
                              on the submission row    (NOT apex MX)
            │                        │
            └──────── Hyperdrive ────┘
                     publicSql  = cacheable HYPERDRIVE (not this milestone)
                     asAnon     = contact insert RPC
                     asStaff    = ticket list / reply / status
                     asSystem   = outbox claim + inbound append
```

Same Worker, same Supabase project `yaumjzvylngfjhtuffqs`. Public site stays `vamostaxi.site`; ops stays `dashboard.vamostaxi.site`. `public.staff` is one admin. No Staff tab. No new Worker.

### Component Responsibilities

| Component | Responsibility | Typical Implementation |
|-----------|----------------|------------------------|
| `POST /api/contact` | Existing intake. Creates the ticket header as a side-effect of `submit_contact_message`. Sends customer ack + Gmail copy through `contact_delivery_outbox`. | Unchanged route; default `ticket_status = 'new'`. Still `asAnon` RPC + `asSystem` claim/finalize. |
| `contact_submissions` | Ticket **header**. One row per `/contact` submit. Immutable form fields. New status columns. | Extend the table. Do not add a parallel `support_tickets` header. |
| `contact_delivery_outbox` | **Intake mail only** (customer ack + Gmail copy). Not the reply thread. | Leave as-is. Staff replies do not claim this outbox. |
| `support_messages` | The thread. Opening customer message plus staff outbound plus customer inbound. | New table, FK to `contact_submissions`. |
| `support_inbound_events` | Webhook idempotency on Resend `email_id`. | New table, Stripe-events shape, not a reuse of `stripe_events`. |
| `GET/PATCH /api/staff/support` | Staff list, detail, status, reply. | Dual-mounted like `/api/staff/customers`. `withStaff` then `asStaff`. |
| `POST /api/webhooks/resend` | Inbound. Signature, dedupe, fetch body, append message, bump status. | Public hostname. No cookie. `asSystem`. |
| `packages/emails` | Render customer ack, Gmail copy, and the new staff-reply template. Pure functions. | Add `renderSupportReplyEmail`. Do not send from the package. |
| Ops `#support` | Working inbox UI. | New `app/ops/OpsSupport.dc.html`, hash-routed from `ops.dc.html`. |
| Resend Receiving | MX for customer Reply-in-Gmail. | Subdomain `replies.vamostaxi.site`. Apex MX stays Gmail for `info@`. |

## Recommended Project Structure

```
apps/web/
├── app/api/contact/route.ts              # existing intake — do not grow into a thread API
├── app/api/webhooks/resend/route.ts      # NEW inbound (public host, Svix)
├── app/[locale]/(ops)/api/staff/support/
│   ├── route.ts                          # GET list
│   └── [id]/
│       ├── route.ts                      # GET detail · PATCH status
│       └── reply/route.ts                # POST staff reply
├── app/api/staff/support/                # dual-mount re-export (DC <base href="/app/ops/">)
├── lib/ops/support.ts                    # asStaff loaders + reply writer
├── lib/support/inbound.ts                # asSystem: verify → retrieve → append
└── wrangler.jsonc                        # unchanged Worker name `vamos`; no new queue required

packages/db/supabase/migrations/
└── YYYYMMDD_ops_support_tickets.sql      # status columns + messages + inbound_events + RLS

packages/emails/src/
├── contact.ts                            # existing intake templates — keep
└── support-reply.ts                      # NEW staff reply render

app/ops/
├── ops.dc.html                           # ROUTES + sc-if for #support
├── OpsSidebar.dc.html                    # NAV_TOP item; Staff tab stays omitted
└── OpsSupport.dc.html                    # NEW list + thread + reply + status
```

### Structure Rationale

- **`/api/contact` stays intake.** Growing it into reply/status mixes an anonymous Turnstile POST with a staff session. The existing outbox is a two-channel claim for the first two emails, not a mailbox.
- **`/api/staff/support*` follows the ops house pattern.** Dual-mount under `app/api/staff/…` and `app/[locale]/(ops)/api/staff/…`, `withStaff` envelope, data through `asStaff` on `HYPERDRIVE_NOCACHE`. DC client is `VamosOpsApi.request` with absolute `/api/…` paths.
- **Inbound is not under `/api/staff`.** Resend has no staff cookie. It belongs next to `/api/auth/email-hook`: unauthenticated until signature verification succeeds, then `asSystem`.
- **`packages/emails` stays pure.** Render in, HTML/text out. The Worker sends. Same rule as v1.0 Anti-Pattern 4.
- **Ops stays DC mocks.** v1.1 does not port the console to RSC. Add a hash route, not a Next.js `/ops/support` page.

## How tickets integrate

**Decision: extend `contact_submissions` as the ticket header; add `support_messages` + `support_inbound_events`. Do not create `support_tickets`.**

v1.1 tickets **are** `/contact` rows. Phone-typed tickets and auto-tags are out of scope, so a 1:1 header table would be ceremony. The form row already has the customer identity (`name`, `email`, `phone`, `booking_ref`, `locale`) and the opening body (`message`). What it cannot hold is a thread, a webhook idempotency key, or a Reply-To correlation token.

| Option | Verdict |
|--------|---------|
| New `support_tickets` 1:1 with `contact_submissions` | Reject for v1.1. Extra join, same cardinality, phone tickets explicitly out. |
| Only extend `contact_submissions` (no messages table) | Reject. JSONB thread on the form row cannot uniquely key Resend `email_id`, cannot audit direction, and fights webhook retries. |
| Extend header + `support_messages` + inbound-events | **Take.** Header status lives on the row the dispatcher already conceptually owns. Thread is a child. |
| Reuse `handled_at` as the status machine | Reject. Unused by the app today; boolean-ish timestamp cannot express New / Open / Replied / Closed. Leave the column; do not read it. |
| Reuse `contact_delivery_outbox` for replies | Reject. 1:1 two-channel claim (`customer`/`support`) for the first send. A reply is an Nth message with its own Resend id. |

### Header columns to add on `contact_submissions`

- `ticket_status text not null default 'new'` check in `('new','open','replied','closed')`
- `reply_token text not null unique` — opaque, generated at insert, used in Reply-To plus-address. Not the row UUID.
- `last_activity_at timestamptz not null default now()`
- `closed_at timestamptz`

Form fields stay immutable (trigger or column grants). Staff may UPDATE only status / activity / closed_at. `submit_contact_message` keeps writing the intake columns and now also mints `reply_token` and seeds the opening `support_messages` row (`direction = 'inbound_form'`).

### `support_messages`

One row per visible item in the thread:

- `id`, `submission_id` FK, `direction` (`inbound_form` \| `outbound_staff` \| `inbound_email`)
- `body_text` (required), `body_html` nullable
- `actor_user_id` nullable (staff outbound only, `public.staff.user_id`)
- `resend_email_id` nullable (outbound provider id **or** inbound `email_id`)
- `rfc_message_id` nullable (for `In-Reply-To` / `References`)
- `from_address` citext nullable (inbound)
- `created_at`

Opening form body is copied into the first message so the thread is complete without a special-case read of `contact_submissions.message` in the UI. The form column remains the source of truth for the original wording.

### Status machine

```
submit_contact_message  →  new
staff opens / PATCH     →  open          (dispatcher may also set this by hand)
staff POST reply        →  replied
inbound email (not closed) → open
staff PATCH closed      →  closed
inbound on closed       →  open          (recommend auto-reopen; do not silently drop)
```

Dispatcher can PATCH any of the four statuses. Automatic transitions must not fight a manual Closed except for the reopen-on-inbound rule.

## Inbound webhook route

**Yes. New unauthenticated route on the public hostname.**

| | |
|-|-|
| Path | `POST /api/webhooks/resend` |
| Host | `vamostaxi.site` (Worker `vamos`). Not `dashboard.vamostaxi.site` — dashboard middleware is the staff console. |
| Auth | Resend/Svix signing secret (`svix-id` / `svix-timestamp` / `svix-signature`). Raw body. Same class of door as `/api/auth/email-hook`. |
| DB | `asSystem` on `HYPERDRIVE_NOCACHE`. Never `asStaff`, never `publicSql`. |
| Event | `email.received` only. Other Resend types 200-no-op. |

**Payload has no body.** Resend's `email.received` webhook carries metadata (`email_id`, `from`, `to`, `received_for`, `message_id`, `subject`, attachment list). The Worker must `GET` the [Received emails API](https://resend.com/docs/api-reference/emails/retrieve-received-email) before inserting `body_text`. Attachments: store metadata only in v1.1; do not persist files to R2.

**ACK policy.** Volume is a handful of mails, not Stripe. Inline retrieve + insert is acceptable. Return 5xx if retrieve or insert fails so Resend retries. After a successful insert, return 200 even on a later retry (dedupe).

**Dedupe.** `INSERT support_inbound_events (email_id) … ON CONFLICT DO NOTHING`. If zero rows, skip append, still 200.

**Match order (first hit wins):**

1. Plus-token in `to` or `received_for`: `ticket+{reply_token}@replies.vamostaxi.site`
2. `In-Reply-To` / `References` against stored `rfc_message_id`
3. No match → 200 drop. Do **not** open a new ticket. Random inbound is not a contact form. Gmail IMAP ingest is out of scope.

Do not require `from` to equal `contact_submissions.email` as a hard gate (assistants, plus-aliases). Log a mismatch flag on the message if it differs.

### MX must not steal Gmail

`info@vamostaxi.site` still receives the Gmail copy via the existing outbox `support` channel (`CONTACT_SUPPORT_RECIPIENT`). Apex MX therefore stays with Gmail. Resend receiving on the apex would either miss mail or break that inbox ([Resend custom-domain receiving](https://resend.com/docs/dashboard/receiving/custom-domains)).

**Receiving host:** `replies.vamostaxi.site` (MX → Resend). Staging DNS only. Not `vamostaxi.eu`.

Cloudflare `send_email` (`EMAIL` binding, `noreply@vamostaxi.site`) is send-only and is not the inbound path. Do not add an Email Worker consumer for v1.1.

## Reply API — staff-gated

**Yes. Every read and write of tickets is `withStaff` + `asStaff`.** Dispatcher and the one admin both pass `app.is_staff()`. Do not use `withAdmin` — support is dispatch work. Do not grant `vamos_public` / anon anything on the new tables.

| Method | Path | Effect |
|--------|------|--------|
| GET | `/api/staff/support` | List headers: status, email, preview, `last_activity_at` |
| GET | `/api/staff/support/:id` | Header + messages ordered by `created_at` |
| PATCH | `/api/staff/support/:id` | `{ status }` only |
| POST | `/api/staff/support/:id/reply` | Insert outbound message, send Resend, set `replied` |

Send happens **after** the message row exists, with Resend idempotency key = `support_messages.id`. On send failure the row stays with a failed marker; the UI can retry the same id. Do not insert-on-send-success only — that loses the dispatcher's text on a 503.

Outbound mail:

- `from`: existing `CONTACT_EMAIL_FROM` / `noreply@vamostaxi.site`
- `to`: `contact_submissions.email`
- `reply_to`: `ticket+{reply_token}@replies.vamostaxi.site`
- `headers.In-Reply-To` / `References`: prior `rfc_message_id`s so Gmail threads
- body: `packages/emails` staff-reply template, locale of the submission

Gmail still gets the **intake** copy only. Do not BCC `info@` on every staff reply (that would fork the working inbox back into Gmail). The milestone line “Gmail `info@` still gets a copy” is the existing contact outbox, not a second copy of the thread.

## DC `#support` page

Ops is still one DC console at one URL. `ops.dc.html` hash-routes `#dashboard`, `#bookings`, … There is **no Staff tab in the sidebar** (`NAV_ADMIN` is pricing only; `#staff` is aliased to settings and is not painted). v1.1 does not add Staff.

Add `#support`:

1. `OpsSupport.dc.html` — list (status filters New / Open / Replied / Closed), thread pane, reply box, status control. Compose from the design system like `OpsCustomers` / `OpsBoard`. Four languages, four widths, same pass.
2. `ops.dc.html` — `ROUTES` includes `'support'`; `sc-if` mounts `OpsSupport`; `isSupport` next to `isCustomers`.
3. `OpsSidebar.dc.html` — `NAV_TOP` entry `{ key:'support', href:'#support', icon:'mail' }` (or equivalent existing icon). Visible to dispatcher and admin. Not under Content. Not behind `isAdmin`.

Data: `VamosOpsApi.request('GET'|'POST'|'PATCH', '/api/staff/support…')`. Absolute `/api/` paths because `serveOpsDc` injects `<base href="/app/ops/">`.

Do not invent a Next.js App Router ops page for this milestone.

## Architectural Patterns

### Pattern 1: Intake row is the ticket header

**What:** The anonymous `submit_contact_message` RPC remains the only public write door. The row it inserts **is** the ticket. Thread and inbound events hang off it.
**When to use:** Always in v1.1. Revisit a separate tickets table only if phone-typed tickets come back into scope.
**Trade-offs:** Couples support to the contact form (accepted). Avoids a 1:1 table that would need backfill and two staff list queries.

**Example:**

```sql
-- submit_contact_message (sketch): existing insert, plus
insert into public.support_messages (submission_id, direction, body_text)
values (v_id, 'inbound_form', p_message);
-- ticket_status defaults to 'new'; reply_token default unique
```

### Pattern 2: Correlation by opaque plus-address, not UUID

**What:** `Reply-To: ticket+{reply_token}@replies.vamostaxi.site`. Inbound parser reads the plus-token. UUID is never in the address.
**When to use:** Every staff outbound. Also set `In-Reply-To` so Gmail threads; plus-token is the fallback when the customer hits Reply-All / new compose.
**Trade-offs:** Needs a dedicated receiving subdomain. Safer than putting `contact_submissions.id` in the clear and independent of Gmail's threading quirks.

### Pattern 3: Webhook verifies, then fetches, then writes — staff never in that path

**What:** Inbound is a public POST. Cookie/JWT must not be involved. After Svix verify, `asSystem` inserts. Staff UI only reads via `asStaff`.
**When to use:** All Resend inbound. Same split as Stripe webhook vs ops board, at much smaller volume (no Queue required).
**Trade-offs:** Worker must call Resend Received-emails API (extra hop). Necessary because the webhook omits the body. A Queue would be overkill at this volume.

## Data Flow

### Request Flow — contact form → ticket → Resend send → inbound webhook → thread

```
Customer /contact
    │  POST /api/contact  (Turnstile, idempotency_key)
    ▼
submit_contact_message          contact_submissions
    │  INSERT header              ticket_status = new
    │  INSERT opening message     support_messages inbound_form
    │  TRIGGER outbox             contact_delivery_outbox
    ▼
asSystem claim + send
    ├─ customer ack  → Resend / EMAIL binding → customer inbox
    └─ Gmail copy    → CONTACT_SUPPORT_RECIPIENT (info@) — copy, not the inbox

Dispatcher dashboard.vamostaxi.site #support
    │  GET /api/staff/support          withStaff + asStaff
    │  GET /api/staff/support/:id      thread
    │  POST /api/staff/support/:id/reply
    ▼
support_messages outbound_staff
    │  Resend send
    │    Reply-To: ticket+{token}@replies.vamostaxi.site
    │    In-Reply-To / References
    │  ticket_status = replied

Customer hits Reply in Gmail
    │  MX replies.vamostaxi.site → Resend Receiving
    ▼
Resend POST /api/webhooks/resend     (vamostaxi.site)
    │  Svix verify (raw body)
    │  INSERT support_inbound_events ON CONFLICT DO NOTHING
    │  GET received email body
    │  match plus-token (else In-Reply-To)
    │  INSERT support_messages inbound_email
    │  ticket_status = open (reopen if closed)
    ▼
Same #support thread. Dispatcher replies again or PATCH closed.
```

### State Management

```
Postgres (contact_submissions.ticket_status + support_messages)
    ↑ asStaff / asSystem only
Ops DC client
    ← VamosOpsApi fetch on hashchange / after reply
    no Realtime for v1.1 (one admin, poll on focus is enough)
```

Do not subscribe Supabase Realtime to support tables in this milestone. The live board already owns that budget; a support inbox for one admin does not need it.

### Key Data Flows

1. **Intake → ticket:** `POST /api/contact` is the only creator. Success of the two outbox emails is independent of the ticket existing — a failed Gmail copy must not roll back the submission (today's outbox already isolates that). Ticket list shows the row even if mail failed.
2. **Staff reply → customer Gmail:** Worker send, not Cloudflare `EMAIL` binding, so `Reply-To` / `In-Reply-To` headers are under our control. Keep `EMAIL` for auth mail.
3. **Customer reply → same ticket:** Resend inbound webhook → plus-token match → append. Apex Gmail is a silent copy of the **form**, not a second thread.
4. **Status:** written by staff PATCH and by the two automatic writers (reply → `replied`, inbound → `open`). List endpoint orders by `last_activity_at` desc.

## Scaling Considerations

| Scale | Architecture Adjustments |
|-------|--------------------------|
| v1.1 staging, one admin, contact-form volume | This design. Inline webhook retrieve. No Queue. No Realtime. DC poll. |
| A few staff, tens of tickets/day | Still fine. Add Realtime on `support_messages` only if the list goes stale during a shift. |
| Phone tickets / shared inbox / attachments as first-class | New header table, assignment, R2. Explicitly out. Do not pretender-build it. |

### Scaling Priorities

1. **First bottleneck: MX / Gmail collision** — not throughput. Wrong apex MX loses `info@`. Fix by subdomain, not by pooling.
2. **Second bottleneck: webhook body fetch on Workers** — Resend omitted the body on purpose (serverless payload limits). Keep retrieve in the same request; if it ever times out, then enqueue. Do not start with a Queue.

## Anti-Patterns

### Anti-Pattern 1: Turning `contact_submissions` into a mailbox JSON document

**What people do:** Append replies into a `thread jsonb` column, or overload `message` / `handled_at`.
**Why it's wrong:** Cannot uniquely dedupe `email_id`, cannot RLS-grant “staff update status but not the original body”, cannot show a stable thread under retry.
**Do this instead:** Immutable intake columns + `support_messages` rows.

### Anti-Pattern 2: Staff-gating the inbound webhook, or putting it on the dashboard host

**What people do:** `/api/staff/webhooks/resend` behind `withStaff`, or a route that only exists on `dashboard.vamostaxi.site`.
**Why it's wrong:** Resend cannot present a staff cookie. Dashboard middleware will 401/redirect the webhook. Mail silently never lands.
**Do this instead:** Public `POST /api/webhooks/resend` on `vamostaxi.site`, Svix, `asSystem`.

### Anti-Pattern 3: Apex MX to Resend

**What people do:** Enable receiving on `vamostaxi.site` because that is the verified sending domain.
**Why it's wrong:** Gmail `info@` stops being a real inbox, contradicting “Gmail still gets a copy.” Resend docs say do not share MX with an existing mailbox.
**Do this instead:** `replies.vamostaxi.site` MX → Resend. Apex unchanged.

### Anti-Pattern 4: Sending staff replies through `contact_delivery_outbox`

**What people do:** Add a third channel, or reuse `support_state`, so “all mail goes through the outbox.”
**Why it's wrong:** Outbox is 1:1 with a submission and two named channels with leases. A conversation is N sends. Lease/claim semantics do not map.
**Do this instead:** New message row + Resend idempotency key = message id.

### Anti-Pattern 5: Building `#support` as a Next.js RSC page

**What people do:** `app/[locale]/(ops)/ops/support/page.tsx` because “that's how apps/web works.”
**Why it's wrong:** The console is DC mocks with hash nav. A one-off RSC island breaks the shell, i18n dict, and `VamosOpsApi` contract.
**Do this instead:** `OpsSupport.dc.html` + hash + sidebar item, same as customers/coupons.

### Anti-Pattern 6: Creating tickets from unmatched inbound

**What people do:** “If plus-token fails, open a ticket from the From: address so we never lose mail.”
**Why it's wrong:** Turns the receiving domain into an open mailbox (spam). Phone-typed / unmatched mail is out of v1.1. Gmail remains the human overflow.
**Do this instead:** 200-drop unmatched inbound. Gmail copy of the form is the safety net for intake; unmatched replies stay in the customer's Sent until they use the form again.

## Integration Points

### External Services

| Service | Integration Pattern | Notes |
|---------|---------------------|-------|
| Resend Send | `resend.emails.send` from contact outbox and from staff reply | Idempotency key = outbox correlation / message id. Do not use Cloudflare `EMAIL` for replies (headers). |
| Resend Receiving | MX on `replies.vamostaxi.site`; webhook `email.received` | Body via Received emails API. Svix secret in Worker env. Staging only. |
| Gmail `info@vamostaxi.site` | Existing outbox `support` recipient | Copy of the form. Not IMAP. Not the working inbox. |
| Cloudflare `EMAIL` binding | Auth mail only (`noreply@vamostaxi.site`) | Already onboarded. Not inbound. |
| Turnstile | Existing on `POST /api/contact` | Unchanged. Inbound webhook is not a form; no Turnstile. |
| Hyperdrive | `asAnon` / `asStaff` / `asSystem` on `HYPERDRIVE_NOCACHE` | Support is identity-scoped. Never `publicSql` (cacheable `HYPERDRIVE`). |
| Supabase Auth | Staff cookie, `requireStaffClaims` | One admin row in `public.staff`. aal2 as already enforced in SQL. |

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| Contact form ↔ ticket header | Same INSERT | No extra hop. Status defaults to `new`. |
| Ticket header ↔ thread | FK `support_messages.submission_id` | UI always loads messages by header id. |
| Staff UI ↔ DB | `/api/staff/support*` → `withStaff` → `asStaff` | Same door as customers/fleet. |
| Resend inbound ↔ DB | `/api/webhooks/resend` → Svix → `asSystem` | No staff identity. |
| Intake outbox ↔ reply send | None | Different tables, different senders. |
| Public host ↔ dashboard host | Shared Worker, disjoint middleware | Webhook on public; UI APIs on dashboard (dual-mount still works locally). |

## Build Order

Strict spine — do not parallelize across these arrows:

```
1. Schema + RLS + pgTAP
     (ticket_status, reply_token, support_messages, support_inbound_events,
      grants: staff SELECT/UPDATE status; system INSERT messages/events;
      form columns still immutable; opening message seeded from submit_contact_message)
        │
        ├──────────────────────────────┐
        ▼                              ▼
2a. Staff APIs                    2b. Inbound webhook
    /api/staff/support*               /api/webhooks/resend
    withStaff + asStaff               Svix + asSystem + retrieve
    (list/detail/status/reply)        (can stub retrieve in tests)
        │                              │
        └──────────────┬───────────────┘
                       ▼
3. packages/emails staff-reply template (pure; can start in parallel with 2)
                       ▼
4. DC #support (OpsSupport.dc.html, hash, sidebar)
   needs 2a. Does not need live MX.
                       ▼
5. Staging DNS: MX replies.vamostaxi.site → Resend
   Webhook URL https://vamostaxi.site/api/webhooks/resend
   End-to-end: form → #support → reply → Gmail Reply → same thread
```

**Can overlap after schema:** 2a, 2b, and 3. **Cannot:** UI before list/detail APIs; MX before webhook route exists (Resend will retry a missing URL, but there is nothing to verify). **Do not touch** Phases 7–11 booking code.

**Leave frozen:** `contact_delivery_outbox` lease logic, Turnstile on contact, host split, `publicSql` vs `asStaff`, Staff tab omission, one-admin `public.staff`.

## Sources

- `.planning/PROJECT.md` — v1.1 goal, target features, out of scope (IMAP, phone tickets, live `vamostaxi.eu`)
- `packages/db/supabase/migrations/20260828000002_contact_forms.sql` — `contact_submissions` + `submit_contact_message`
- `packages/db/supabase/migrations/20260902000001_contact_delivery_outbox.sql` + `20260902000002_contact_delivery_authorization.sql` — intake outbox, `vamos_system` only
- `apps/web/app/api/contact/route.ts` — Turnstile, `asAnon` submit, `asSystem` claim/finalize, Gmail copy
- `apps/web/lib/db/identity.ts` — `asAnon` / `asStaff` / `asSystem`; cache-disabled binding
- `apps/web/lib/ops/staff-json.ts` — `withStaff` / `withAdmin`
- `apps/web/wrangler.jsonc` — Worker `vamos`, hosts `vamostaxi.site` + `dashboard.vamostaxi.site`, `send_email` EMAIL binding
- `app/ops/ops.dc.html`, `OpsSidebar.dc.html` — hash nav, no Staff tab
- `app/vamos-ops-api.js` — absolute `/api/…` client
- [Resend Receiving](https://resend.com/docs/dashboard/receiving/introduction) — HIGH
- [email.received payload (no body)](https://resend.com/docs/webhooks/emails/received) — HIGH
- [Custom receiving domains / MX collision](https://resend.com/docs/dashboard/receiving/custom-domains) — HIGH
- [Verify webhooks (Svix)](https://resend.com/docs/webhooks/verify-webhooks-requests) — HIGH
- [Reply threading (`In-Reply-To`)](https://resend.com/docs/dashboard/receiving/reply-to-emails) — HIGH

---
*Architecture research for: v1.1 Ops Support (contact tickets + Resend inbound)*
*Researched: 2026-09-04*
*Archived: 2026-09-22 when v1.2 Payment research replaced `.planning/research/ARCHITECTURE.md`*
