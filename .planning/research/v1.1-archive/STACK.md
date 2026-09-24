# Stack Research

**Domain:** v1.1 Ops Support — two-way email tickets in Ops (Resend inbound + ticket replies from the existing Cloudflare Worker, Postgres thread storage)
**Researched:** 2026-09-04
**Confidence:** HIGH on Resend send/receive/webhook APIs and MX-conflict rules (official docs, live); HIGH on in-repo versions; MEDIUM on the exact Resend receiving MX hostname (dashboard-generated per domain)

> v1.1 only. Do **not** re-litigate the frozen v1.0 stack. v1.0 research lives in
> `.planning/research/v1.0-archive/` and is not restated here.
>
> **Already in place (leave alone):** Cloudflare Workers + OpenNext (`next@15.5.25`,
> `@opennextjs/cloudflare@1.20.2`, `wrangler@4.124.0`), Worker `vamos`, Supabase Zurich
> `yaumjzvylngfjhtuffqs` behind Hyperdrive, `postgres@3.4.9`, Cloudflare Email Sending
> (`env.EMAIL` / `send_email` binding) for the auth hook and contact-form primary send,
> Resend leftover fallback (`RESEND_API_KEY` already on Worker `vamos`), Resend sending
> domain `vamostaxi.site` already verified, `@vamos/emails` renderers, `contact_submissions`
> + `contact_delivery_outbox`, `standardwebhooks@1.0.0` for the **Supabase** Send Email
> Hook. No Vercel. No driver app. Staging DNS is `vamostaxi.site` only.

## Recommended Stack

### Core Technologies

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| `resend` npm | **6.26.0** (latest; repo is on `6.24.0`) | Send ticket replies; verify inbound webhooks; fetch received bodies; optional Gmail copy-forward | Fetch-based SDK already in `apps/web`. `6.26.0` is current as of 2026-09-04 and exposes `emails.send`, `webhooks.verify`, `emails.receiving.get`, `emails.receiving.forward`. Bump; do not add a second mail SDK. |
| Resend Receiving (custom domain) | Platform; enable on a **new** subdomain `inbound.vamostaxi.site` | MX target for customer Reply-in-Gmail | Official path for “support emails from users.” Any local-part at the receiving domain is accepted, which gives plus-address ticket routing (`support+{ticketId}@inbound.vamostaxi.site`) without IMAP. |
| Resend webhook `email.received` | Platform (Svix-signed) | Push inbound mail into the Worker | Metadata-only POST; body/headers come from a follow-up `emails.receiving.get`. Designed for serverless body-size limits. Same Worker, new App Router route. |
| Postgres (existing Supabase) | Hosted 15.x on `yaumjzvylngfjhtuffqs` | Ticket + thread system of record | Tickets are `contact_submissions` rows plus a message thread. Hyperdrive + `postgres.js` already carries staff/system writes; no new datastore. |
| Cloudflare Worker `vamos` (unchanged host) | existing OpenNext Worker | HTTP inbound webhook + staff reply action | One deploy. New unauthenticated route next to `/api/auth/email-hook` and `/api/contact`. No second Worker. |

### Supporting Libraries

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `zod` | **4.4.3** (already in `apps/web`) | Validate verified webhook payload + staff reply body | After `resend.webhooks.verify` succeeds. Do not trust `event.data` shape by TypeScript alone. |
| `@vamos/emails` | workspace | Render ticket-reply HTML/text in en/de/fr/ar | Same package as contact/auth mail. Add a support-reply renderer; do not add `react-email`. |
| `postgres` (postgres.js) | **3.4.9** (already) | Insert/update tickets and messages through Hyperdrive | Staff reply path (`asStaff` / `vamos_staff`) and webhook path (`asSystem` / `vamos_edge`). Per-request client, same as the rest of the app. |

### Development Tools

| Tool | Purpose | Notes |
|------|---------|-------|
| Resend Dashboard → Domains | Add `inbound.vamostaxi.site`, enable Receiving, copy MX | Staging zone only (`vamostaxi.site`). Confirm receiving record shows “verified” after DNS. |
| Resend Dashboard → Webhooks | Create endpoint, subscribe **only** to `email.received` | Signing secret → `wrangler secret put RESEND_WEBHOOK_SECRET --env staging`. Endpoint URL is the custom domain, e.g. `https://vamostaxi.site/api/webhooks/resend`. |
| Resend Dashboard → Receiving | Manual test send to `support@inbound.vamostaxi.site` | Confirms MX before the Worker is wired. Bodies are stored in Resend even if the webhook is down. |
| `supabase` CLI | Migration for ticket tables + pgTAP | Follow existing `packages/db/supabase/migrations/` numbering and FORCE RLS / `REVOKE EXECUTE FROM PUBLIC` house rules. |
| `wrangler secret put` | `RESEND_WEBHOOK_SECRET` (new). `RESEND_API_KEY` already present | Never put the signing secret in `wrangler.jsonc` `vars`. |

## Installation

```bash
# Only package change for v1.1 — bump, do not add a mail vendor
npm install resend@6.26.0 --workspace=apps/web

# No new packages. Do not add svix, postal-mime, mailparser, react-email,
# googleapis, imapflow, or a chat SDK.
```

```ts
// Ticket reply (staff action on the Worker) — Resend, not env.EMAIL
const { data, error } = await resend.emails.send(
  {
    from: "Vamos Taxi <support@inbound.vamostaxi.site>",
    to: customerEmail,
    bcc: ["info@vamostaxi.site"], // Gmail copy of the dispatcher reply
    replyTo: `support+${ticketId}@inbound.vamostaxi.site`,
    subject: subject.startsWith("Re:") ? subject : `Re: ${subject}`,
    html,
    text,
    headers: {
      "In-Reply-To": previousSmtpMessageId,
      References: [...previousIds, previousSmtpMessageId].join(" "),
    },
  },
  { idempotencyKey: `ticket-reply:${ticketId}:${messageId}` },
);

// Inbound webhook — raw body, then verify, then fetch content
const payload = await request.text();
const event = resend.webhooks.verify({
  payload,
  headers: {
    id: request.headers.get("svix-id") ?? "",
    timestamp: request.headers.get("svix-timestamp") ?? "",
    signature: request.headers.get("svix-signature") ?? "",
  },
  webhookSecret: env.RESEND_WEBHOOK_SECRET,
});
if (event.type === "email.received") {
  const { data: email } = await resend.emails.receiving.get(event.data.email_id);
  // persist thread row keyed on email.id (Resend receiving id) — unique
  await resend.emails.receiving.forward({
    emailId: event.data.email_id,
    from: "Vamos Taxi <support@inbound.vamostaxi.site>",
    to: "info@vamostaxi.site", // Gmail copy of the customer reply
  });
}
```

## What v1.1 actually adds

### 1. Resend Receiving DNS (staging `vamostaxi.site` only)

- Add Resend domain **`inbound.vamostaxi.site`**. Enable Receiving. Add the MX Resend shows (typical shape `inbound-smtp.<region>.amazonaws.com`; use the dashboard value, do not guess).
- Verify sending on that subdomain too (SPF/DKIM/CNAME as Resend lists) so `From: support@inbound.vamostaxi.site` is legal. Replies must originate on the **receiving** domain; if `From` is `info@vamostaxi.site` (Gmail MX), customer Reply goes to Gmail and never hits the webhook.
- **Do not** put Resend receiving MX on apex `vamostaxi.site`. Apex MX stays Gmail so `info@vamostaxi.site` keeps working. Same-priority MX does not dual-deliver; lowest-priority Resend MX on apex would steal the mailbox.
- Prod `vamostaxi.eu` DNS stays Phase 11. No live MX there.

### 2. Send ticket replies from the Worker via Resend

- Staff reply action on the existing OpenNext Worker calls `resend.emails.send`. Keep `env.EMAIL` for auth + contact-form confirmation; it has no `In-Reply-To` / `References` / plus-address `replyTo` contract we need for threading.
- `RESEND_API_KEY` is already on Worker `vamos`. Reuse it.
- Persist the Resend send `id` and the SMTP `Message-ID` (GET email / webhook now expose it) on the outbound message row so the next reply can set `In-Reply-To` + `References`.
- Idempotency key per outbound message so a dispatcher double-submit cannot send twice (Resend keys expire after 24 h; our DB unique on message id is the durable guard).

### 3. Inbound customer replies via webhook

- New route, e.g. `POST /api/webhooks/resend`, `dynamic = "force-dynamic"`. Unauthenticated until `webhooks.verify` succeeds — same posture as `/api/auth/email-hook`.
- Resend signs with **Svix** headers (`svix-id`, `svix-timestamp`, `svix-signature`). That is **not** the Standard Webhooks set (`webhook-id`, …) used by the Supabase auth hook. Do not reuse `standardwebhooks` here; use `resend.webhooks.verify`.
- Webhook body is metadata only (`email_id`, `from`, `to`, `subject`, `message_id`, attachment list). Always `emails.receiving.get(email_id)` for `html` / `text` / `headers`.
- Match ticket: plus-address local-part first (`support+{uuid}@…`); else `In-Reply-To` / `References` against stored SMTP ids; else drop (do not auto-open a new ticket from a random inbound — v1.1 tickets come from `contact_submissions` only).
- Dedupe on `email_id` unique. Return 200 on duplicate so Resend stops retrying. Return 5xx only when persist/fetch failed and a retry is useful. Return 401 on bad signature.
- Ignore mail from our own sending addresses to avoid bounce/forward loops.

### 4. Gmail `info@vamostaxi.site` stays a copy

- New contact rows already fan out a support copy via `env.EMAIL` to `CONTACT_SUPPORT_RECIPIENT` (keep).
- Dispatcher replies: `bcc: info@vamostaxi.site`.
- Customer inbound: `emails.receiving.forward({ to: "info@vamostaxi.site", … })` after the row is stored. Ops is the working inbox; Gmail is not polled.

### 5. Postgres ticket thread storage

Do **not** overload `contact_submissions` with a JSON thread. Add two tables in `public`, RLS on, writes only via staff/system roles (same pattern as `contact_delivery_outbox`).

```sql
-- sketch, not a migration
create type public.support_ticket_status as enum ('new', 'open', 'replied', 'closed');

create table public.support_tickets (
  id                     uuid primary key default extensions.gen_random_uuid(),
  contact_submission_id  uuid not null unique
                         references public.contact_submissions(id),
  status                 public.support_ticket_status not null default 'new',
  customer_email         extensions.citext not null,
  subject                text not null,
  inbound_local_part     text not null unique, -- plus-address token
  last_message_at        timestamptz not null default now(),
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

create table public.support_ticket_messages (
  id                 uuid primary key default extensions.gen_random_uuid(),
  ticket_id          uuid not null references public.support_tickets(id),
  direction          text not null check (direction in ('inbound', 'outbound')),
  body_text          text not null,
  body_html          text,
  from_address       extensions.citext not null,
  to_address         extensions.citext not null,
  smtp_message_id    text,          -- RFC Message-ID; used for In-Reply-To
  resend_email_id    uuid unique,   -- send id or receiving id; webhook idempotency
  in_reply_to        text,
  created_at         timestamptz not null default now()
);
```

- Insert a `support_tickets` row (status `new`) when a `contact_submissions` row is created; first message is the form body (not an email).
- Staff: `SELECT`/`UPDATE` tickets (status only — no auto-tags in v1.1), `SELECT` messages, `INSERT` outbound messages.
- Webhook: `asSystem` `INSERT` inbound messages. No `anon` grants.
- `handled_at` on `contact_submissions` can stay; ticket `status` is the Ops source of truth.
- Attachments: store metadata only if it falls out of the webhook payload. Do not download files to R2 in v1.1 (not in scope).

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| Receiving subdomain `inbound.vamostaxi.site` | Enable receiving MX on apex `vamostaxi.site` | Never while Gmail `info@` must keep working. Apex MX cannot dual-deliver. |
| `From` + `Reply-To` on `inbound.vamostaxi.site` | `From: info@vamostaxi.site` + `Reply-To` inbound | Only if every customer client honours `Reply-To`. Gmail usually does; some mobile clients reply to `From`. Too risky for “Reply-in-Gmail lands in the ticket.” |
| `resend.webhooks.verify` | `svix` npm or `standardwebhooks` | `svix` is a duplicate of what the Resend SDK already wraps. `standardwebhooks` is already used for **Supabase** (different header names) — keep it there, do not stretch it to Resend. |
| `emails.receiving.get` for body | Download raw MIME + `mailparser` / `postal-mime` | Only if v1.1 needed faithful attachment/inline-image passthrough. It does not. Node `mailparser` is a poor Workers fit. |
| Inline webhook work (verify → get → insert → forward → 200) | New Cloudflare Queue | Queue if fetch+forward regularly exceeds Worker CPU/time and Resend retries become noisy. v1.1 volume (contact form, one operator) does not justify a new queue. |
| Ticket tables in Postgres | Store threads in Resend / Gmail labels | Resend is not the system of record (Free retention is short). Gmail is a copy. Ops reads Hyperdrive. |

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| Gmail IMAP / Gmail API / Pub/Sub / App passwords | Product out of scope. Polling a mailbox is slow, credential-fragile, and misses the contact-form origin. | Contact-form rows + Resend `email.received`. |
| Live chat (Intercom, Crisp, Tidio, in-house websocket) | Product out of scope. WhatsApp is already a deep link, not a ticket inbox. | Email tickets in Ops `#support`. |
| New mail vendors (Postmark, Mailgun, SendGrid, Amazon SES direct, AgentMail) | `vamostaxi.site` is already verified on Resend; `RESEND_API_KEY` is already on the Worker. A second vendor is a second webhook, DNS, and failure mode. | Resend 6.26.0. |
| Cloudflare Email Routing `email()` handler / `postal-mime` | `env.EMAIL` is **sending** (auth + contact). Routing inbound would fight Gmail MX the same way apex Resend MX would. | Resend Receiving on `inbound.`. |
| `env.EMAIL.send` for ticket replies | Binding cannot set `In-Reply-To` / `References` / plus-address `replyTo` the way Resend `emails.send({ headers })` can. | `resend.emails.send`. |
| Putting Resend receiving MX on `vamostaxi.site` | Steals or randomly splits `info@` from Gmail. | MX only on `inbound.vamostaxi.site`. |
| `svix`, `mailparser`, `react-email` | Extra deps. SDK verify + Receiving API + `@vamos/emails` cover v1.1. | Existing packages + `resend@6.26.0`. |
| New Worker / KV / R2 / Queue / Vercel | Hosting and data path are frozen. | Route + tables on the current Worker and Postgres. |
| Driver app, live GPS, phone-typed tickets, auto-tags | Frozen / out of v1.1. | Statuses New / Open / Replied / Closed only. |

## Stack Patterns by Variant

**If the customer hits Reply in Gmail after a dispatcher message:**
- Mail is addressed to `support+{ticketId}@inbound.vamostaxi.site` (Reply-To / From on the receiving domain).
- Resend fires `email.received` → Worker verifies → `receiving.get` → append inbound row → status `open` → forward copy to `info@`.

**If the dispatcher sends a second reply in the same ticket:**
- Set `In-Reply-To` to the latest SMTP id and `References` to the space-joined history. Subject stays `Re: …`. BCC Gmail again.

**If an inbound message cannot be matched to a ticket:**
- ACK 200, do not create a ticket (v1.1 origin is `contact_submissions` only). Still optional-forward to Gmail so nothing is silently dropped from the copy inbox.

**If `env.EMAIL` is missing in a given Worker env:**
- Contact/auth keep the existing Resend leftover fallback. Ticket replies still use Resend directly (required, not leftover).

## Version Compatibility

| Package A | Compatible With | Notes |
|-----------|-----------------|-------|
| `resend@6.26.0` | OpenNext Worker (`nodejs_compat`, `compatibility_date` 2026-08-20) | Fetch SDK; `webhooks.verify` + `emails.receiving.*` run in the Node compat runtime. No SubtleCrypto special-case (unlike Stripe’s sync HMAC). |
| `resend@6.26.0` | `RESEND_API_KEY` already on Worker `vamos` | Same key sends replies and fetches received content. Webhook **signing** secret is a different value (`RESEND_WEBHOOK_SECRET`). |
| `resend.webhooks.verify` | Headers `svix-id` / `svix-timestamp` / `svix-signature` | Do not pass Supabase `webhook-*` headers. Keep `standardwebhooks@1.0.0` for `/api/auth/email-hook` only. |
| `emails.receiving.get` | Webhook `data.email_id` | Body is not in the webhook. Must GET. |
| `postgres@3.4.9` + Hyperdrive | New ticket tables | Same per-request client, `SET LOCAL` RLS, no supabase-js for row queries. |
| `zod@4.4.3` | Verified Resend JSON | Fine; no upgrade needed. |
| Cloudflare Email Sending `env.EMAIL` | Auth hook + contact outbox | Unchanged. Not on the ticket reply path. |

## Sources

- `https://resend.com/docs/dashboard/receiving/introduction` — receiving overview, support-email use case. HIGH.
- `https://resend.com/docs/dashboard/receiving/custom-domains` — enable receiving on a verified domain; MX required. HIGH.
- `https://resend.com/docs/knowledge-base/how-do-i-avoid-conflicting-with-my-mx-records` — subdomain vs apex MX; same-priority does not dual-deliver; Gmail coexistence. HIGH.
- `https://resend.com/docs/dashboard/receiving/create-receiving-webhook` — `email.received` metadata-only; must GET content. HIGH.
- `https://resend.com/docs/dashboard/receiving/get-email-content` — `resend.emails.receiving.get`. HIGH.
- `https://resend.com/docs/dashboard/receiving/reply-to-emails` — `In-Reply-To` / `References` / `Re:` subject. HIGH.
- `https://resend.com/docs/dashboard/receiving/forward-emails` — `emails.receiving.forward` for the Gmail copy. HIGH.
- `https://resend.com/docs/webhooks/verify-webhooks-requests` — raw body, Svix headers, `resend.webhooks.verify`. HIGH.
- `https://resend.com/docs/api-reference/emails/send-email` — `replyTo`, `bcc`, `headers`, `Idempotency-Key` (24 h). HIGH.
- npm `resend@6.26.0` (2026-09-03) vs repo `6.24.0`. HIGH.
- In-repo: `apps/web/package.json`, `apps/web/app/api/contact/route.ts`, `apps/web/lib/forms/notify.ts`, `apps/web/app/api/auth/email-hook/route.ts`, `apps/web/wrangler.jsonc` (`send_email` / Worker `vamos`), `packages/db/supabase/migrations/20260828000002_contact_forms.sql`. HIGH.

---
*Stack research for: v1.1 Ops Support (Resend inbound + Worker ticket replies + Postgres threads)*
*Researched: 2026-09-04*
