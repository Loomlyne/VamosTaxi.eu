# Feature Research

**Domain:** Ops Support inbox — two-way email tickets from `/contact` (v1.1 only)
**Researched:** 2026-09-04
**Confidence:** HIGH on Vamos scope (PROJECT.md is authoritative); MEDIUM-HIGH on industry patterns (Help Scout / Zendesk / Front / Missive plus Resend inbound primary docs)

## How this file was built

v1.0 FEATURES.md surveyed the airport-transfer category. This file does **not** repeat that. It answers one question for milestone v1.1 Ops Support:

> How do support inboxes typically work? What is table stakes vs a differentiator vs an anti-feature? How complex is each piece, and what does it depend on in the existing `contact_submissions` surface?

v1.0 research is archived at `.planning/research/v1.0-archive/`. Booking-funnel features stay frozen; they are not in scope here.

## How support inboxes typically work

Small operators start with a shared mailbox (`info@` in Gmail/Outlook). Every inbound mail is a row in one inbox. That is cheap and familiar. It fails when: two people reply to the same thread, nobody owns a message, there is no status, and the only history is Gmail's thread view — which splits the moment someone replies from a different From address.

The industry then splits into two products that look similar from the customer's side (they still get email) and very different from the agent's:

| Model | Unit of work | Typical vendors | Fit for Vamos v1.1 |
|-------|----------------|-----------------|--------------------|
| Shared mailbox | An email | Gmail, Google Groups, Outlook shared mailbox | What exists today: SITE-04 already BCC/copies `info@vamostaxi.site` |
| Ticketing help desk | A numbered ticket with queues, SLAs, tags | Zendesk, Freshdesk | Overbuilt for a solo dispatcher; invites Staff-tab / auto-tag / omnichannel scope |
| Conversational shared inbox | A conversation with status, reply-from-the-thread | Help Scout, Front, Missive | The shape v1.1 actually wants: Ops `#support` is the working inbox; Gmail stays a copy |

A conversation/ticket lifecycle is the same idea everywhere. Zendesk's default statuses are New / Open / Pending / Hold / Solved / Closed. Help Scout uses Active / Pending / Closed. Vamos's four statuses map cleanly:

| Vamos | Industry analogue | Meaning |
|-------|-------------------|---------|
| New | New / Unassigned | Contact form just landed; nobody has opened it |
| Open | Open / Active | Dispatcher is working it |
| Replied | Pending | Dispatcher sent mail; waiting on the customer |
| Closed | Closed / Solved | Done. Further customer mail should reopen or stay closed by explicit policy |

Threading is not a UI nicety — it is the product. Email clients group on RFC 5322 `Message-ID` / `In-Reply-To` / `References`. Help desks add a fallback (plus-address `support+{id}@…` or a token in the subject) because some clients strip headers. Resend inbound is webhook-shaped, not IMAP: MX on the receiving domain, `email.received` webhook, then a follow-up fetch for body. The webhook payload is metadata; the body is a second call. That is the hard path.

The customer never sees a ticket UI. They submitted `/contact` and they Reply in Gmail. Ops is the system of record. Gmail is the carbon copy.

## Existing surface this milestone extends

SITE-04 already ships a one-way pipe. v1.1 turns that pipe into a two-way ticket. Do not rebuild the form.

**`public.contact_submissions`** (migration `20260828000002_contact_forms.sql`):

- Columns: `id`, `idempotency_key` (unique), `name`, `email`, `phone`, `booking_ref`, `message`, `locale` (`en|de|fr|ar`), `handled_at`, `created_at`
- Writes only via `public.submit_contact_message` (SECURITY DEFINER, anon/authenticated execute)
- Staff SELECT via RLS (`contact_submissions_staff_select` / `app.is_staff()`); no public SELECT
- `handled_at` is a binary "someone marked it done" timestamp — not New / Open / Replied / Closed

**`public.contact_delivery_outbox`** (migration `20260902000001_contact_delivery_outbox.sql`):

- One row per submission, two channels: `customer` (ack) and `support` (Gmail copy)
- Claim/lease/finalize so the two Resend sends are durable and idempotent
- Stores only a 12-char provider suffix, not a full `Message-ID`

**Outbound today** (`apps/web/app/api/contact`, `lib/forms/notify.ts`):

- From is `noreply@vamostaxi.site`
- Support copy goes to `CONTACT_SUPPORT_RECIPIENT` (`info@vamostaxi.site`)
- No `Reply-To`, no `In-Reply-To`, no `References`
- A customer who hits Reply in Gmail on the ack cannot land in Ops — there is nowhere for that mail to go

**Ops UI today** (`app/ops/OpsSidebar.dc.html`):

- Nav is dashboard / bookings / calendar / fleet / customers / coupons / content. No `#support`. No Staff tab.
- PROJECT.md: Staff tab stays gone. `#support` is the new hash.

v1.1 is additive on this surface: a ticket is a `contact_submissions` row plus a thread of messages. It is not a second contact store.

## Feature Landscape

### Table Stakes (Dispatchers Expect These)

Missing these = Ops `#support` feels like a read-only dump of the contact table, which is what `handled_at` already is.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Ticket list in Ops `#support` | A dispatcher will not live in Gmail and in the board. One working inbox. | LOW–MEDIUM | Rows are `contact_submissions`. Staff SELECT already exists. Need a nav hash and a list UI (no mock yet — mock before build, same rule as manual booking). |
| Status New / Open / Replied / Closed | Without status the list is a firehose. This is the whole point of leaving Gmail. | LOW | `handled_at` is too coarse. Needs an explicit status column (or equivalent) on the submission. Filter chips on the list. |
| Open a ticket and see the original form | Name, email, phone, booking ref, locale, message, created_at — that is the first message. | LOW | Already on the row. Do not duplicate into a messages table as a second source of truth for the form body. |
| Reply from the ticket via Resend | "I can see it but I still answer in Gmail" is the failure mode this milestone exists to kill. | MEDIUM | Must send from a receiving address, not `noreply@`. Set `In-Reply-To` / `References` and `Re:` subject so Gmail threads. Persist the outbound body on the ticket. |
| Customer Reply-in-Gmail appends to the same ticket | Table stakes of every help desk. If replies spawn a new ticket, Ops is worse than Gmail. | HIGH | Resend inbound webhook + body fetch + match. Matching is the risk. See Dependencies. |
| Conversation history, newest last | Dispatcher must see what was already said before typing. | MEDIUM | New `ticket_messages` (name TBD) keyed to `contact_submissions.id`. Outbound + inbound. Idempotent on provider message id. |
| Gmail still receives a copy of the original submission | Owner already watches `info@vamostaxi.site`. Removing the copy would be a silent regression of SITE-04. | LOW | Already implemented via `contact_delivery_outbox.support`. Keep it. Ops is the working inbox; Gmail is the copy. |
| Staff-only | Contact PII. Same bar as bookings. | LOW | Existing RLS + `vamos_staff` SELECT. Mutations must be staff-gated the same way. No new public read. |
| Inbound webhook authenticity + idempotency | A forged or replayed `email.received` would append fake customer mail onto a real ticket. | MEDIUM | Verify Resend signature. Dedupe on Resend `email_id` / `message_id`. Same discipline as Stripe webhooks (PAY-05). |
| Closed stays closed until a human reopens — or a documented reopen-on-reply rule | Dispatchers expect Closed to mean "I am done." Surprise reopen is a product decision, not an accident. | LOW | Industry default is reopen-on-customer-reply. Pick one rule and stick to it. Do not invent a fifth status. |

### Differentiators (Competitive Advantage)

Not required to call it an inbox. Valuable here because Vamos is a small Swiss carrier with the booking already in the same app.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Native Ops inbox instead of Zendesk/Help Scout | One login, one design system, PII stays in the same Supabase project, no per-seat help-desk bill | MEDIUM | The whole milestone. Do not "just embed Intercom." |
| `booking_ref` already on the ticket | Transfer support is "where's my driver / can I change pickup," not a generic FAQ. Linking the booking is the useful context Help Scout would need a Shopify-style app for. | LOW | Column exists. v1.1 can show it. Deep-link into Ops booking detail is a cheap enhance; do not block launch on it. |
| Form `locale` on the ticket | Dispatcher answers in the language the customer wrote in. Four-language product; English-only replies would be a regression. | LOW | Column exists. Display it. Do not auto-translate. |
| WhatsApp stays the live human channel; email is the written record | Owner already chose a WhatsApp deep link over a chat widget (PROJECT.md out of scope). Tickets catch the people who will not open WhatsApp. | — | Not a build. Keep SITE-09 phone/WhatsApp. `#support` does not replace them. |
| Gmail copy as a safety net, not the system of record | If Ops is down, the owner still has the original mail. If the owner replies in Gmail, threads split — that is the trade. Document it; do not sync Gmail back. | LOW | Anti-IMAP is the other half of this differentiator. |

### Anti-Features (Commonly Requested, Often Problematic)

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Live chat / Intercom / in-house widget | "Every site has a bubble" | Already rejected: fights the design system and cookie banner; no mock; 3–5 days. v1.1 is email tickets. | WhatsApp deep link (SITE-09) |
| Gmail IMAP / Gmail API scrape | "Just read `info@` so we don't miss mail people send directly" | Auth (OAuth refresh, Google Workspace), polling vs push, duplicate detection against the form copy we already send, HTML vs MIME, and a second source of tickets that never went through Turnstile. PROJECT.md: out. | Resend inbound webhook on the receiving domain. Direct-to-Gmail mail stays in Gmail. |
| Phone-typed tickets | Dispatcher takes a call, wants a ticket | A second create path (ops form, validation, no Turnstile, no `submit_contact_message` idempotency). No mock. Statuses-only milestone. | Take the call; if it needs a written trail, the customer uses `/contact`, or the dispatcher uses the existing phone-booking path for actual bookings. |
| Auto-tags / AI classify | "Billing vs delay vs complaint" | Tags become a taxonomy project. Wrong tags are worse than none. Solo dispatcher can read the message. | Statuses only. |
| Staff tab | "That's where tickets / users live in other consoles" | Staff management is invite/role/MFA (MISSING-FEATURES, OpsSettings). Mixing it with customer mail recreates a help-desk admin. PROJECT.md: stays gone. | `#support` hash on the existing rail. |
| Catch-all inbound (any mail to `info@` becomes a ticket) | Feels like "we won't miss anything" | Unauthenticated mail: spam, bounces, vendor newsletters, the SITE-04 copy bouncing back in. Turns `#support` into Gmail. | Tickets originate from `contact_submissions`. Inbound is replies to those tickets only. Unmatched inbound is logged and dropped (Gmail still has it). |
| Answering in Gmail *and* Ops | Owner habit | Two From addresses, split threads, double replies. The copy is read-only. | Ops is the working inbox. Gmail is the archive. |
| Assignment, collision detection, SLA, CSAT, macros, saved replies, knowledge base | Help Scout/Zendesk table stakes for a team | Vamos is a solo/small dispatcher. Each of these is a product. Collision detection needs presence. SLA needs clocks and policy. Macros need a content UI. | One person, four statuses, type the reply. |
| AI auto-reply | Speed | Wrong answer on a paid airport transfer (pickup time, refund tier) is worse than slow. Legal/pricing copy is owner-owned. | Human reply. |
| Attachments as a launch requirement | Travellers forward boarding passes | Resend inbound supports them (metadata + download URL, 30-day store). Extra storage, virus, and PII surface. Not needed to prove two-way mail. | Defer. Body text is enough for v1.1. |
| Vendor help desk (Zendesk/Help Scout/Front) | Fastest way to "have support" | Second login, second design, EU data story, per-seat cost, and `booking_ref` becomes a sidecar. Conflicts with "PII in this Supabase project" and the bound design system. | Native `#support`. |

## Feature Dependencies

```
SITE-04 /contact form
    └──writes──> contact_submissions
                    └──triggers──> contact_delivery_outbox
                                      ├──customer ack (Resend)
                                      └──Gmail copy to info@ (Resend)  ──keep──> v1.1

Ops #support list
    └──requires──> contact_submissions staff SELECT (exists)
    └──requires──> status New/Open/Replied/Closed (does not exist; handled_at is not this)
    └──requires──> #support nav hash (does not exist; Staff tab must stay absent)

Reply from ticket
    └──requires──> receiving From / Reply-To (not noreply@)
    └──requires──> Resend send + persisted outbound message
    └──requires──> RFC 5322 In-Reply-To / References (+ Re: subject)
    └──requires──> stored Message-ID per message (outbox suffix is not enough)
    └──enhances──> status → Replied

Inbound customer reply
    └──requires──> Reply from ticket (otherwise there is nothing to reply to)
    └──requires──> MX for staging receiving domain (vamostaxi.site only; live eu DNS is Phase 11)
    └──requires──> Resend inbound webhook, signature verify, body fetch
    └──requires──> match to contact_submissions (Message-ID / plus-address / subject token)
    └──conflicts with──> IMAP scrape of info@
    └──conflicts with──> catch-all "any mail is a ticket"

Gmail copy of original
    └──already exists──> contact_delivery_outbox.support
    └──must not become──> a second write path into the ticket thread
```

### Dependency Notes

- **`#support` requires `contact_submissions`, not a new ticket table as the root.** The form row is the ticket. A messages table hangs off `id`. Inventing a parallel `tickets` root duplicates name/email/booking_ref and splits SITE-04 from Ops.
- **`handled_at` is not a status.** It cannot represent New vs Open vs Replied. Keep or retire it explicitly; do not overload it.
- **Reply requires a receiving address.** Today's `noreply@vamostaxi.site` From makes "customer Reply-in-Gmail" impossible. From and/or Reply-To must be an address Resend inbound accepts on `vamostaxi.site`.
- **Inbound requires outbound first.** Matching needs a `Message-ID` we minted. Do not build the webhook before the send path stores that id.
- **Matching should not rely on Gmail.** Industry fallbacks: plus-address (`support+{id}@…`), opaque subject token, then `In-Reply-To`. Pick in architecture research; FEATURES only records that a fallback is table stakes because clients strip headers.
- **Unmatched inbound must not create tickets.** That is how catch-all and IMAP scrape sneak in.
- **Gmail copy must not round-trip.** The SITE-04 support mail to `info@` is outbound from us. If inbound MX also receives `info@`, that copy can bounce back as a fake customer message. Receiving address and Gmail recipient must not be the same mailbox.
- **Inbound MX is staging-only.** PROJECT.md: live `vamostaxi.eu` DNS stays Phase 11.
- **Staff tab conflicts with `#support`.** Tickets are not staff admin. Do not revive a Staff hash to park them.
- **No mock for `#support` yet.** OpsSidebar has no support item; OpsSoon has no support section. Same rule as phone booking: mock first, then implement.

## MVP Definition

### Launch With (v1.1)

Minimum that makes Ops the working inbox.

- [ ] Ops `#support` lists `contact_submissions` as tickets — otherwise dispatchers stay in Gmail
- [ ] Status New / Open / Replied / Closed, set by the dispatcher — otherwise the list cannot be worked
- [ ] Ticket detail shows the original form fields and the message thread
- [ ] Dispatcher replies from the ticket; Resend delivers; Gmail threads; ticket stores the outbound body and `Message-ID`
- [ ] Customer Reply-in-Gmail hits Resend inbound and appends to the same ticket
- [ ] Original SITE-04 Gmail copy still sends; Staff tab stays gone
- [ ] Unmatched inbound does not create a ticket; webhook is signed and idempotent

### Add After Validation (v1.x)

Once two-way mail is boring.

- [ ] Reopen-on-reply (if launch ships Closed-stays-closed) — trigger: first closed ticket that the customer continues
- [ ] Deep-link `booking_ref` → Ops booking detail — trigger: dispatchers searching bookings by hand
- [ ] Inbound attachments (boarding pass / screenshot) — trigger: real tickets arriving with images that matter
- [ ] Saved replies for the three repeated answers (change of time, cancellation pointer, "driver details are in the SMS") — trigger: volume, not aesthetics
- [ ] Filter/search by email / booking_ref — trigger: more than a screenful of open tickets

### Future Consideration (v2+)

- [ ] Assignment / collision detection — defer until there is more than one person in `#support`
- [ ] SLA clocks, CSAT, macros, knowledge base — defer; that is a help desk product
- [ ] Phone-typed tickets — defer; no mock, second write path
- [ ] IMAP / Gmail ingest of direct-to-`info@` mail — defer; stays out of scope
- [ ] Live chat — defer; stays WhatsApp
- [ ] Auto-tags / AI replies — defer
- [ ] Catch-all inbound on `info@` — defer; Gmail remains the bucket for non-ticket mail
- [ ] Live `vamostaxi.eu` MX — Phase 11, not this milestone

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| `#support` list of contact tickets | HIGH | LOW–MEDIUM | P1 |
| Status New / Open / Replied / Closed | HIGH | LOW | P1 |
| Ticket detail (form + thread) | HIGH | MEDIUM | P1 |
| Reply from ticket (Resend + headers + store) | HIGH | MEDIUM | P1 |
| Receiving From/Reply-To (leave `noreply@`) | HIGH | LOW (config) + MEDIUM (MX) | P1 |
| Inbound webhook append-to-same-ticket | HIGH | HIGH | P1 |
| Keep SITE-04 Gmail copy | HIGH | LOW (exists) | P1 |
| Signed, idempotent inbound; unmatched dropped | HIGH | MEDIUM | P1 |
| Staff tab remains absent | HIGH (scope control) | LOW | P1 |
| Booking-ref deep-link | MEDIUM | LOW | P2 |
| Reopen-on-reply rule | MEDIUM | LOW | P2 |
| Attachments | MEDIUM | MEDIUM | P2 |
| Saved replies | LOW–MEDIUM | LOW | P2 |
| Assignment / SLA / CSAT / macros | LOW (wrong team size) | HIGH | P3 — do not build |
| Live chat | LOW (rejected) | HIGH | P3 — do not build |
| IMAP scrape | LOW (rejected) | HIGH | P3 — do not build |
| Phone-typed tickets | LOW (rejected for v1.1) | MEDIUM | P3 — do not build |
| Auto-tags | LOW (rejected) | MEDIUM | P3 — do not build |

**Priority key:**
- P1: Must have for v1.1 — without it Ops is not the working inbox
- P2: Should have once P1 is proven on staging
- P3: Nice to have or explicitly out of v1.1

## Competitor Feature Analysis

| Feature | Gmail shared `info@` (today) | Help Scout / Front | Zendesk / Freshdesk | Vamos v1.1 |
|---------|------------------------------|--------------------|---------------------|------------|
| Working surface | Mailbox | Conversation inbox | Ticket queue | Ops `#support` |
| Origin | Anyone who emails `info@` | Email, chat, form | Email, chat, phone, social, form | `/contact` rows only |
| Status | Read/unread, archive | Active / Pending / Closed | New / Open / Pending / Hold / Solved / Closed | New / Open / Replied / Closed |
| Reply | In Gmail | In the conversation | In the ticket | In the ticket, via Resend |
| Inbound threading | Gmail's own | Vendor | Vendor | Resend webhook → same `contact_submissions.id` |
| Carbon copy | It *is* the inbox | Optional forward | Optional | Keep SITE-04 copy to `info@`; Ops is canonical |
| Booking context | None | Integration | Integration | `booking_ref` already on the row |
| Tags / SLA / assign | No | Yes | Yes | No |
| Live chat | No | Optional | Optional | No — WhatsApp deep link |
| IMAP of the mailbox | Native | Optional connect | Optional connect | No |

## Sources

- `.planning/PROJECT.md` — v1.1 goal, frozen funnel, out-of-scope (live chat, IMAP, phone-typed tickets, auto-tags, Staff tab, live eu DNS)
- `packages/db/supabase/migrations/20260828000002_contact_forms.sql` — `contact_submissions` shape, RLS, `submit_contact_message`
- `packages/db/supabase/migrations/20260902000001_contact_delivery_outbox.sql` — dual-channel outbox (customer ack + Gmail copy)
- `apps/web/lib/forms/notify.ts` / `apps/web/app/api/contact` — current From `noreply@vamostaxi.site`, Resend send
- `apps/web/lib/contact-channels.ts` — public mailbox `info@vamostaxi.site`
- `app/ops/OpsSidebar.dc.html` — no `#support`, no Staff tab
- `.planning/REQUIREMENTS.md` SITE-04 / SITE-09 — form reaches inbox + database; phone/WhatsApp/contact remain customer channels
- [Resend inbound](https://resend.com/docs/dashboard/receiving/introduction) — webhook, body fetch, attachments
- [Resend threaded replies](https://resend.com/docs/dashboard/receiving/reply-to-emails) — `In-Reply-To` / `References`
- [Ticketing vs shared inbox (Missive)](https://missiveapp.com/blog/ticketing-system-vs-shared-inbox) — why a mailbox stops working
- [Help Scout shared inbox](https://www.helpscout.com/help-desk-software/) — conversation statuses, collision, saved replies (team-scale extras)
- Zendesk default statuses New / Open / Pending / Hold / Solved / Closed — industry vocabulary mapped onto Vamos's four

---
*Feature research for: v1.1 Ops Support (two-way tickets from contact_submissions)*
*Researched: 2026-09-04*
