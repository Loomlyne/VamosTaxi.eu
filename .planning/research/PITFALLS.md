# Pitfalls Research

**Domain:** v1.1 Ops Support — two-way email tickets on the existing contact form + ops console (Cloudflare Workers / OpenNext, Supabase via Hyperdrive, Resend inbound + outbound, staging DNS `vamostaxi.site` only)
**Researched:** 2026-09-04
**Confidence:** HIGH on DNS/MX, webhook auth, and this repo's send path (Resend receiving docs + `apps/web/lib/forms/notify.ts` + `wrangler.jsonc` `send_email`); MEDIUM on the exact ticket-match key (plus-address vs `In-Reply-To`) until the v1.1 schema lands.

v1.0 booking/Hyperdrive/Stripe pitfalls live in `.planning/research/v1.0-archive/PITFALLS.md`. This file covers **only** adding inbound email tickets to the contact+ops stack that already exists. The booking funnel is frozen. Live `vamostaxi.eu` DNS stays Phase 11.

v1.1 phases are not numbered yet. Prevention phases below are the workstreams the roadmap should create — not v1.0 Phases 4–11.

## Critical Pitfalls

### Pitfall 1: Resend receiving MX on the apex — or on live `vamostaxi.eu` — before Phase 11

**What goes wrong:**
Resend inbound on a custom domain needs an MX record, and **only the lowest-priority MX on that hostname receives mail**. Putting Resend's MX on `vamostaxi.site` (apex) steals or splits mail that today reaches Gmail at `info@vamostaxi.site` (the public support mailbox in `apps/web/lib/contact-channels.ts`). Putting it on `vamostaxi.eu` is live DNS, which `.hermes.md` and `PROJECT.md` forbid until Phase 11. Either cutover silently drops the Gmail copy `PROJECT.md` still requires, or it points production at an unfinished ticket worker.

**Why it happens:**
Resend's domain page offers one MX snippet for the verified sending domain. The sending domain here is already `vamostaxi.site` (SPF/DKIM + Cloudflare `send_email`). The obvious next click is "enable receiving" on that same hostname. Cloudflare Email Routing also locks apex MX. Two systems cannot both be the apex MX.

**How to avoid:**
- Receive on a **subdomain** of staging only, e.g. `inbound.vamostaxi.site` / `tickets.vamostaxi.site`. Leave apex MX for Gmail/`info@` untouched.
- Set `Reply-To` on ticket mail to that receiving address (plus-addressed if used). Do not move `info@` onto Resend MX.
- Forward or BCC a **copy** to `info@vamostaxi.site`. Ops is the working inbox; Gmail is the copy. Do not invert that.
- Never add Resend (or any) MX to `vamostaxi.eu` in v1.1. Phase 11 copies the staging pattern after cutover, it does not invent it on the live zone.

**Warning signs:** Resend dashboard "receiving" toggle on the apex sending domain; a DNS diff that touches `vamostaxi.eu`; Gmail at `info@` goes quiet after an MX change; Cloudflare Email Routing reports conflicting MX.

**Phase to address:** v1.1 Staging MX / UAT (design the hostname in the inbound phase; apply DNS only on `vamostaxi.site`). Re-verify at v1.0 Phase 11 — do not do the live cutover here.

---

### Pitfall 2: Threading on the wrong ID (`Resend email_id` / provider suffix instead of RFC `Message-ID`)

**What goes wrong:**
Gmail/Apple Mail/Outlook thread on RFC `Message-ID` / `In-Reply-To` / `References`, not on Resend's UUID `id`. Today's contact outbox stores `customer_provider_suffix` / `support_provider_suffix` as the **last 12 characters** of whatever `send()` returned (`contact_delivery_outbox`). That is not a `Message-ID`. Cloudflare Email's `messageId` and Resend's send `data.id` are different namespaces. Customer "Reply" in Gmail then lands as a new ticket, or nowhere.

**Why it happens:**
`resend.emails.send()` returns `{ id: "<uuid>" }`. Threading needs `message_id` like `<111-222-333@email.example.com>`, which Resend exposes on **webhooks and GET email**, not reliably on the send response. Contact delivery already "has an id column," so it looks reusable.

**How to avoid:**
- Persist, per ticket message: RFC `Message-ID`, `In-Reply-To`, `References`, Resend `email_id` (dedupe), and the ticket id.
- On dispatcher send: set `headers['In-Reply-To']` and `headers['References']` from the stored RFC ids. Prefix subject `Re:` only when continuing a thread.
- After send, retrieve `message_id` (GET email or `email.sent` webhook) and store it. Do not treat `data.id` or a 12-char suffix as threadable.
- Match inbound first by `In-Reply-To` / `References` against ids **this system issued**, then by plus-address token. Never by subject line or `From` alone.

**Warning signs:** Ops shows two tickets for one Gmail thread; dispatcher reply arrives as a new conversation in the customer's inbox; code writes `provider_suffix` or `result.data.id` into an `in_reply_to` column.

**Phase to address:** v1.1 Outbound reply (schema columns + send headers). Inbound webhook only works if outbound stored the real `Message-ID`.

---

### Pitfall 3: Trusting inbound `From:` (spoofed mail becomes a ticket reply)

**What goes wrong:**
Anyone can send a message whose `From` is the customer's address. If the webhook appends to a ticket because `from === contact_submissions.email`, an attacker injects into that thread, can phish the dispatcher (looks like the guest), and can social-engineer a booking change. SPF/DKIM on the outer envelope do not prove the display From.

**Why it happens:**
Support tools default to "match the customer email." Contact rows already key on `email`. Spoofing is free; Resend will happily POST `email.received` for any mail that hit the receiving MX.

**How to avoid:**
- **Do not** attach inbound mail to a ticket by `From` equality.
- Require a secret the attacker does not have: plus-address / reply-to token (`support+{ticket_public_id}@inbound.vamostaxi.site`) **and/or** `In-Reply-To` matching a `Message-ID` we minted.
- Unmatched inbound: new unlinked ticket or quarantine — never append to the "best guess" contact row.
- Do not auto-change status to Open/Replied on unmatched mail.
- v1.1 is email tickets, not a mailbox scrape (`PROJECT.md` out of scope: Gmail IMAP ingest). Ignore mail that did not hit the receiving address.

**Warning signs:** Handler greps `contact_submissions.email` from `event.data.from`; no test that a spoofed From with a real customer address is rejected; webhook accepts any `to` on the domain.

**Phase to address:** v1.1 Inbound webhook (match rules + tests). Token/plus-address shape is decided with the ticket schema so Reply-To can be set on first send.

---

### Pitfall 4: PII sprawl — logs, raw HTML, attachments, duplicated columns

**What goes wrong:**
Tickets are `contact_submissions` plus a thread: name, email, phone, booking ref, message, later inbound bodies. That is nFADP/GDPR personal data. Failure modes: `console.log` of the webhook payload (Resend's `email.received` includes from/to/subject); storing inbound HTML forever; saving attachments (passports, tickets, photos) with no retention; copying PII onto `contact_delivery_outbox` (the existing outbox comment already forbids this); stuffing customer text into `audit_log` without redaction (F-10 / Phase 10 still owns erasure).

**Why it happens:**
Webhook debugging wants the payload. Inbound HTML looks like the "real" email. Attachments feel like table-stakes. `asSystem` writes skip RLS so it is easy to over-persist.

**How to avoid:**
- Staff `SELECT` only, same as `contact_submissions`. Webhook writes via `asSystem` / service role, never a new anon grant.
- Store text (and maybe a sanitised subset). Treat inbound HTML as untrusted. No attachment blobs in v1.1 unless explicitly scoped later.
- Log `email_id`, ticket id, correlation id — never from/to/subject/body. Same rule as `/api/auth/email-hook` ("Never return or log token… or recipient address").
- Do not duplicate contact PII onto outbox/ticket-header tables; join the submission row.
- Erasure remains Phase 10; do not invent a parallel delete path, but do not make Phase 10 impossible (no PII in R2/KV/logs that the DB erase cannot see).

**Warning signs:** `log("info", …, event.data)`; a tickets table that re-copies `email`/`name`/`phone`; an attachments bucket; webhook 500s that dump the body into Logpush.

**Phase to address:** v1.1 Ticket schema (grants, columns, log contract). Re-check at inbound webhook. Do not wait for v1.0 Phase 10.

---

### Pitfall 5: Restoring the Staff tab while adding `#support`

**What goes wrong:**
`PROJECT.md`: Ops `#support` tab; **Staff tab stays gone**. The DC console is hash-routed (`app/ops/ops.dc.html`). `#staff` still exists as a route key but is folded into Settings (`isSettings: r === 'settings' || r === 'staff'`). `OpsSidebar.dc.html` does **not** paint a Staff item — invites live under Settings. A "support inbox" PR that copies an old nav mock, or re-enables `#staff` because `ROUTES` still lists it, puts a Staff tab back in the rail. Dispatchers see roster/invite next to tickets. Admins lose the "staff is settings" decision.

**Why it happens:**
`apps/web/lib/ops/nav.ts` still has `{ key: "staff", href: "/ops/staff" }`. `ops.dc.html` `ROUTES` still includes `'staff'`. Adding a hash is a one-line copy of an existing item. "Staff" and "Support" sit next to each other in English.

**How to avoid:**
- Add `#support` only: sidebar item + `readHash()` allow-list + a support view. Do not add `#staff` to `NAV_TOP` / `NAV_BOTTOM` / `NAV_ADMIN`.
- Keep `#staff` aliased to Settings if it must remain for old links; do not resurrect a rail entry.
- Do not "fix" `nav.ts` by making Staff visible as part of the support work.
- Four languages, same pass, on the new label — but the **word** is Support, not Staff.

**Warning signs:** Sidebar screenshot shows Staff; `OpsSidebar` `NAV_*` gains `{ key:'staff' }`; a plan that says "restore the Staff tab as Support."

**Phase to address:** v1.1 Ops `#support` shell (the first UI plan). Verify with a sidebar screenshot at 1440 and 390, dispatcher **and** admin.

---

### Pitfall 6: Dual-send — Cloudflare `send_email` and Resend on the same ticket

**What goes wrong:**
`sendContactMessage` **prefers** `env.EMAIL.send` (Cloudflare Workers Email Sending) and only falls back to Resend. Staging `wrangler.jsonc` **has** `"send_email": [{ "name": "EMAIL" }]`. Auth hooks and contact acks already take that path. If ticket replies go through Resend (required for inbound `message_id`) but the first customer ack went through Cloudflare Email, thread ids live in two providers and inbound cannot match. If a helper "helpfully" sends via both, the customer gets two copies. If replies go through `env.EMAIL`, Resend never sees the outbound id and `email.received` has nothing to hang on.

**Why it happens:**
One `send()` helper already exists. The EMAIL binding is "the production sender" for `noreply@vamostaxi.site`. Resend looks optional. Dual-send feels like reliability.

**How to avoid:**
- **Ticket thread mail (dispatcher reply + the customer-facing message that must be replyable) goes through Resend only.** Do not pass `env.EMAIL` into that send.
- Do not BCC/dual-send the same MIME via Cloudflare Email and Resend.
- Gmail copy is a recipient (BCC/`info@`) or Resend forward — not a second provider send of the same payload.
- Leave contact auto-ack on its current path unless a dedicated plan migrates it; do not silently switch it as a side effect of tickets.
- From remains a verified `vamostaxi.site` address; Reply-To is the receiving subdomain.

**Warning signs:** Ticket send calls `sendContactMessage(..., env.EMAIL)`; logs show a CF `messageId` and a Resend `id` for one reply; customers report duplicate "we received your message" mails after the support ship.

**Phase to address:** v1.1 Outbound reply. Call out the split in the plan so contact-ack is not "cleaned up" in the same PR.

---

### Pitfall 7: Webhook auth copied from the wrong verifier (or skipped)

**What goes wrong:**
Resend signs with **Svix** headers: `svix-id`, `svix-timestamp`, `svix-signature`. This repo's only webhook today is `/api/auth/email-hook`, which uses `standardwebhooks` and `webhook-id` / `webhook-timestamp` / `webhook-signature`. Copy-paste that verifier onto `/api/resend/...` and every real Resend POST 401s — or worse, a "temporary" unauthenticated route ships because staging tests used curl. Unauthenticated inbound is spoof pitfall 3 with no MX required: anyone POSTs a fake `email.received`. Replay: a captured signed body is resent (Svix timestamps exist to stop this). OpenNext/Workers: JSON-parse-then-stringify breaks the signature; the body can be read once.

**Why it happens:**
Both look like "verify the webhook." Resend's own Next.js inbound sample in the docs **parses JSON and does not verify**. Stripe in v1.0 archive already taught `constructEventAsync` + raw body; that lesson does not automatically transfer.

**How to avoid:**
- Verify with Resend SDK `resend.webhooks.verify({ payload, headers: { id, timestamp, signature }, webhookSecret })` or `svix.Webhook`, using **`await request.text()` first**.
- Map `svix-*` headers, not `webhook-*`. Secret from `wrangler secret`, never the repo.
- Reject missing/invalid signatures with 4xx. Do not process then verify.
- Idempotency on `svix-id` / `data.email_id` (`ON CONFLICT DO NOTHING`) before insert. Resend retries.
- Fail closed if `RESEND_WEBHOOK_SECRET` is unset (same pattern as `SEND_EMAIL_HOOK_SECRET`).
- Exercise against a **deployed staging Worker**, not only `next dev`. Signature verification is a classic local-vs-deployed miss (v1.0 Pitfall 12 analogue).

**Warning signs:** Route has no `svix-signature` read; tests POST unsigned JSON and expect 200; handler calls `request.json()` before verify; logs print the webhook secret on 401.

**Phase to address:** v1.1 Inbound webhook. First task in that phase, before any ticket append logic.

---

### Pitfall 8: Re-introducing XSS in quoted inbound / ticket HTML (contact mail is already escaped)

**What goes wrong:**
`packages/emails/src/contact.ts` already runs customer text through `escapeHtml` before interpolation (`quotedMessageHtml`). A ticket UI or reply template that renders inbound `html` with `dangerouslySetInnerHTML`, DC `innerHTML`, or unescaped template literals turns a contact message or a Gmail reply into XSS against the dispatcher (session, MFA'd). Email HTML is a hostile document: `<img>`, scripts in SVG, `javascript:` links.

**Why it happens:**
Inbound "is already HTML." Escaping "breaks formatting." Someone "fixes" `escapeHtml` because a test wanted a bold quote. Ops is a trusted screen, so it feels internal.

**How to avoid:**
- Keep `escapeHtml` on every untrusted string in **new** reply templates. Do not bypass it for inbound.
- Ticket timeline: render stored **text** (or sanitised text with newlines → `<br/>` after escape), never raw inbound HTML.
- Do not mark this as a new email-package refactor. Contact quoting is done; the pitfall is the **new** surfaces.
- Four locales: Arabic RTL must not switch to `innerHTML` to "make bidirectional quotes work."

**Warning signs:** `dangerouslySetInnerHTML` on ticket body; a plan to "render the original email HTML so it looks like Gmail"; tests that assert unescaped `<script>` survives.

**Phase to address:** v1.1 Ops `#support` UI (dispatcher view) and v1.1 Outbound reply (quoted previous message in the MIME). Add a fixture with `<script>` / `<img onerror>` in both.

---

### Pitfall 9: POSTing `/api/quote` during support work

**What goes wrong:**
v1.1 freezes quote → pay → booking. `POST /api/quote` writes quote rows, talks Mapbox, burns Hyperdrive and the staging `MAPBOX_DAILY_UNIT_SENTINEL`. Using it as a "is staging alive?" probe, wiring a ticket to "also send a quote," or running Phase 4 fixtures from a support branch contaminates quote data and can trip the Mapbox breaker. Support tickets are `contact_submissions` + thread — they are not a quote.

**Why it happens:**
`/api/quote` is the best-known Worker POST. Staging smoke scripts already hit it. Agents treat "exercise the API" as generic.

**How to avoid:**
- v1.1 plans do not touch `apps/web/app/api/quote/**`, pricing, or checkout.
- Smoke/UAT for support: `POST /api/contact` (existing Turnstile path) and the new webhook/reply routes only.
- Do not add a "create ticket from quote" shortcut in v1.1.
- If a health check is needed, use a non-mutating route, not quote.

**Warning signs:** Support PR diff includes `lib/quote`; UAT notes "got a CHF 000 quote"; Mapbox sentinel trips during a tickets sitting.

**Phase to address:** Every v1.1 phase (process gate). Call it out in plan must-nots.

---

### Pitfall 10: Pushing `main` (or deploying production) to "finish" tickets

**What goes wrong:**
`.hermes.md` ship path: branch, PR, OpenCode/ChatGPT review + security, CI green, Koss says merge, delete the branch. **Never push `main` directly.** `wrangler.jsonc` says do not deploy `env.production`. A "quick MX fix" or webhook secret on main skips review and can publish inbound to the wrong zone.

**Why it happens:**
DNS and webhook secrets feel like console work, not a PR. Yolo mode + "just this one record."

**How to avoid:**
- All ticket code on a branch; merge only after the ship gates.
- Staging Worker + `vamostaxi.site` DNS from the staging env. No `env.production`.
- Secrets via `wrangler secret` on the staging Worker, documented in the PR, not pasted into `main`.

**Warning signs:** `git push origin main`; `wrangler deploy --env production`; DNS UI changes on the `vamostaxi.eu` zone.

**Phase to address:** Every v1.1 phase + ship. Non-negotiable.

---

### Pitfall 11: Treating `email.received` as the full message (empty tickets, missing headers)

**What goes wrong:**
Resend's receiving webhook is **metadata only**: `email_id`, from, to, subject, `message_id`, attachment list. **No body, no headers, no attachment bytes.** Persisting `event.data` as the ticket reply stores an empty body. Serverless body-size is why they designed it this way.

**Why it happens:**
Stripe webhooks carry the useful payload. Resend's Next.js sample `return NextResponse.json(event)` looks complete. The retrieve call is an extra round trip.

**How to avoid:**
- After verify + dedupe: `GET` received email (and attachments API only if v1.1 later allows files — default: ignore attachments).
- Store text extracted from that GET. Keep `message_id` from the webhook **and** the GET.
- Time-box: fetch inside the request or enqueue on the existing Worker `queue` export; do not block the dispatcher UI on Resend.

**Warning signs:** Ticket replies with subject and no body; no call to retrieve-received-email in the handler; attachment IDs stored as if they were content.

**Phase to address:** v1.1 Inbound webhook (immediately after auth).

---

### Pitfall 12: Auto-ack / Reply-To loops

**What goes wrong:**
Contact already sends a customer ack. If inbound auto-sends "we got your reply" from the receiving address, and that address is also a recipient (CC Gmail, mailing list, dispatcher mailbox), Resend receives its own mail, opens the ticket, sends another ack. Status flip-flops Open ↔ Replied.

**Why it happens:**
SITE-04 already has a customer ack. Copying it onto inbound feels polite. `noreply@` vs receiving subdomain confusion.

**How to avoid:**
- Inbound does **not** send mail except the dispatcher's explicit reply.
- Drop messages `from` your own sending/receiving hosts; drop `Auto-Submitted` / `X-Auto-Reply`.
- Gmail copy is BCC or Resend forward to `info@`, not a recipient that replies.

**Warning signs:** Ticket message count climbs with no dispatcher action; identical acks in Gmail.

**Phase to address:** v1.1 Inbound webhook + outbound reply (shared "never mail except dispatcher send" rule).

---

## Technical Debt Patterns

Shortcuts that seem reasonable but create long-term problems.

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Apex MX for Resend receiving | One domain, docs screenshot matches | Steals Gmail/`info@`; Phase 11 then has no clean pattern | Never on `vamostaxi.site` or `vamostaxi.eu` |
| Match inbound by customer `From` | One SQL join | Spoofed threads, phishing the dispatcher | Never |
| Store Resend send `id` as `Message-ID` | No extra GET | Gmail threading never works | Never — retrieve RFC id |
| Send ticket replies through `env.EMAIL` | Reuse contact helper | Ids not in Resend; inbound cannot attach | Never for thread mail |
| Dual-send CF Email + Resend | "Redundancy" | Duplicate customer mail; split ids | Never |
| Skip Svix verify "until staging works" | Faster first webhook | Anyone can append tickets | Never |
| Render inbound HTML in ops | Looks like Gmail | XSS on a staff session | Never |
| POST `/api/quote` as support smoke | Known 200/400 | Quote rows, Mapbox budget, funnel unfrozen | Never in v1.1 |
| Push `main` / deploy production | Skips PR wait | Unreviewed inbound + DNS | Never |
| Attachments in v1.1 | Feels complete | Malware + extra PII store | Out of scope unless a later milestone says so |
| New anon GRANT on ticket tables | Webhook "just works" | Public read/write of support PII | Never — `asSystem` only |

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| Resend receiving MX | Enable receiving on the apex sending domain | Subdomain MX on `*.vamostaxi.site` only; apex stays Gmail/`info@` |
| Resend sending vs receiving | Assume send domain automatically receives | Sending = SPF/DKIM; receiving = extra MX. Different records |
| Cloudflare Email Routing / Gmail | Replace apex MX so Resend "owns mail" | Keep apex; copy via BCC or Resend forward |
| Cloudflare `send_email` (`env.EMAIL`) | Reuse for dispatcher replies | Contact/auth may keep EMAIL; **ticket threads use Resend** |
| Resend webhook | Copy `/api/auth/email-hook` (`standardwebhooks` + `webhook-*`) | Svix `svix-*` + raw body + `RESEND_WEBHOOK_SECRET` |
| Resend `email.received` | Persist the POST JSON as the message | Verify, dedupe, **GET received email** for body |
| Threading | `In-Reply-To: result.data.id` | RFC `Message-ID` from GET/webhook; plus-address as backup |
| OpenNext Workers | `request.json()` then verify | `request.text()` once, verify, then `JSON.parse` |
| Gmail Reply | From `noreply@` with no Reply-To | Reply-To = receiving address (tokenised) |
| `contact_delivery_outbox` | Reuse `provider_suffix` for threading | New ticket-message columns for full RFC ids |

## Performance Traps

v1.1 volume is a small operator's contact mail, not 10k browsers. Still:

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Fetching Resend body synchronously with no timeout | Dispatcher reply UI hangs; Worker hits CPU/wall time | GET with timeout; optionally queue; webhook ACK after persist of `email_id` | First large HTML mail |
| Loading whole inbound HTML into ops list | Support tab jank; XSS surface | List: subject + snippet from text; body on detail only | Tens of tickets is enough if HTML is huge |
| Re-rendering the DC dashboard on every inbound | Hash route flicker, extra `/api/staff/*` | Poll or light refresh of the ticket thread, not full `ops.dc.html` remount | Noticeable on first real Gmail thread |
| Hitting `/api/quote` from a support test harness | Mapbox sentinel / Hyperdrive noise | Don't | Staging budget, not user scale |

## Security Mistakes

Domain-specific — beyond generic OWASP.

| Mistake | Risk | Prevention |
|---------|------|------------|
| Unverified Resend webhook | Attacker appends tickets, impersonates guests | Svix verify + fail closed (Pitfall 7) |
| Match on `From` | Spoofed guest instructions to dispatch | Token + `In-Reply-To` we issued (Pitfall 3) |
| Webhook/anon GRANT on ticket tables | Public PII read/write | `asSystem` write, `vamos_staff` SELECT (Pitfall 4) |
| Log webhook payload | PII in Logpush | ids only (Pitfall 4) |
| Inbound HTML in ops DOM | XSS on MFA staff session | Escape / text-only (Pitfall 8) |
| Replay of a signed webhook | Duplicate or re-open tickets | `email_id` unique + Svix timestamp |
| Receiving MX on live zone | Production mail to unfinished app | Staging subdomain only (Pitfall 1) |
| Dual provider send | Customer confusion; auth bypass via the weaker path | Resend-only for threads (Pitfall 6) |

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Staff tab returns in the rail | Dispatchers land on invites, not tickets; contradicts Settings-owned roster | `#support` only; `#staff` stays folded into Settings (Pitfall 5) |
| Dispatcher reply starts a new Gmail conversation | Customer loses context, files a second contact form | RFC threading + stable subject `Re:` (Pitfall 2) |
| Gmail `info@` goes silent after MX change | Owner thinks contact is down; dual-ops in the wrong inbox | Apex untouched; Gmail is a copy (Pitfall 1) |
| Ticket shows blank body | Dispatcher answers from subject line only | Fetch received content (Pitfall 11) |
| Status not moving New → Open → Replied | Board looks idle while mail is flying | Explicit transitions: inbound customer → Open; dispatcher send → Replied; Closed is manual |
| English-only Support label | Breaks four-language same-pass | EN/DE/FR/AR on the new tab, 390px, RTL |
| Auto-ack on every inbound | Customer mailbox floods | No mail except explicit dispatcher send (Pitfall 12) |

## "Looks Done But Isn't" Checklist

- [ ] **Staging MX:** Receiving MX is on a **subdomain of `vamostaxi.site`**, not apex, not `vamostaxi.eu`. `dig MX vamostaxi.eu` unchanged.
- [ ] **Gmail copy:** A real contact + a real ticket reply both still arrive at `info@vamostaxi.site`. Ops is where the dispatcher works.
- [ ] **Threading:** Customer Reply-in-Gmail stays in one thread **and** appends the same ticket. Stored value is RFC `Message-ID`, not Resend UUID / 12-char suffix.
- [ ] **Spoof:** Mail with a stolen customer `From` and no valid token/`In-Reply-To` does **not** append.
- [ ] **Webhook auth:** Unsigned POST 4xx on **deployed staging**. Signed replay does not duplicate rows.
- [ ] **Body fetch:** Ticket detail shows the received text, not just webhook metadata.
- [ ] **XSS:** Fixture `<script>alert(1)</script>` in contact message and inbound reply is escaped in ops **and** in the next outbound quote. Existing `escapeHtml` not removed.
- [ ] **Staff tab:** Sidebar has Support, not Staff. `#staff` does not gain a rail item. Dispatcher and admin both checked.
- [ ] **Sender split:** Ticket replies do not call `env.EMAIL`. One MIME, one provider (Resend).
- [ ] **Funnel freeze:** Diff has no `/api/quote` calls, no quote schema edits, no `main` push, no `env.production`.
- [ ] **PII:** Webhook logs have no from/to/body. No new anon table grants. No attachment store.
- [ ] **Statuses:** New / Open / Replied / Closed only — no auto-tags, no phone-typed tickets (`PROJECT.md` out of scope).

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Apex MX pointed at Resend (Pitfall 1) | HIGH (mail loss while wrong) | Restore previous MX immediately; keep receiving on a subdomain; treat lost hours of `info@` as unrecoverable unless the other side still has copies |
| Live `vamostaxi.eu` MX/DNS touched | HIGH | Revert zone; stop; Phase 11 only. Do not "finish" the change |
| Thread ids stored as UUID/suffix (Pitfall 2) | MEDIUM | Stop matching on them; backfill RFC ids from Resend GET where `email_id` exists; old threads may not regroup in Gmail — tell dispatchers |
| Spoofed replies already appended (Pitfall 3) | HIGH | Treat as security: freeze matching, audit threads, notify if dispatcher acted on injected text |
| PII in logs/HTML store (Pitfall 4) | MEDIUM–HIGH | Rotate log sinks if needed; delete raw HTML/attachments; counsel for nFADP if it left the DB |
| Staff tab shipped (Pitfall 5) | LOW | Remove rail item; keep Settings as the staff UI; no data migration |
| Dual-send duplicates (Pitfall 6) | LOW | Disable CF Email on ticket path; customers may have one duplicate — no DB repair |
| Unverified webhook exploited (Pitfall 7) | HIGH | Disable route, rotate secret, audit ticket_messages, re-enable with verify |
| XSS in ops (Pitfall 8) | HIGH | Take dashboard offline if needed, escape, session-revoke staff if HTML ran |
| Quote POSTs from support tests (Pitfall 9) | LOW | Stop the harness; leave quote rows; do not "clean" pricing tables from a support branch |
| `main` / production deploy (Pitfall 10) | HIGH | Revert commit/deploy; do not forward-fix on `main` |

## Pitfall-to-Phase Mapping

How v1.1 roadmap phases should prevent these. Names are workstreams for the planner to number.

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| MX on apex or live DNS (1) | v1.1 Staging MX / UAT; **not** v1.0 Phase 11 | `dig MX` on `vamostaxi.site` apex unchanged except the inbound **subdomain**; `vamostaxi.eu` untouched; Gmail copy received |
| Wrong thread id (2) | v1.1 Outbound reply | Gmail shows one thread; DB has RFC `Message-ID`; inbound appends that ticket |
| Spoofed From (3) | v1.1 Inbound webhook (+ token in schema) | Fixture spoof does not append; plus-address / In-Reply-To does |
| PII sprawl (4) | v1.1 Ticket schema | Grants/pgTAP; log fixture has no email/body; outbox still has no extra PII columns |
| Staff tab restored (5) | v1.1 Ops `#support` shell | Sidebar screenshot: Support present, Staff absent, `#staff` still Settings |
| Dual-send CF vs Resend (6) | v1.1 Outbound reply | Ticket send path never receives `env.EMAIL`; one provider id per reply |
| Webhook auth (7) | v1.1 Inbound webhook (first task) | Unsigned 4xx on deployed staging; signed happy path; replay idempotent |
| Quote XSS (8) | v1.1 `#support` UI + outbound reply | Escape fixtures in UI and MIME; `escapeHtml` still used in contact templates |
| POST `/api/quote` (9) | Every v1.1 phase (must-not) | Plan file grep; PR diff excludes quote |
| Push `main` (10) | Every v1.1 phase + ship | Branch/PR; no `env.production` |
| Webhook has no body (11) | v1.1 Inbound webhook | Ticket detail shows fetched text |
| Auto-ack loop (12) | v1.1 Inbound + outbound | Inbound does not send; loop fixture dropped |

v1.0 Phase 11 is **only** where live DNS may gain the same subdomain-MX pattern, after this milestone has proven it on `vamostaxi.site`.

## Sources

- [Resend — Receiving emails](https://resend.com/docs/dashboard/receiving/introduction)
- [Resend — Custom receiving domains / MX](https://resend.com/docs/dashboard/receiving/custom-domains) — lowest-priority MX wins; use a subdomain if apex already receives mail
- [Resend — Received email webhook](https://resend.com/docs/dashboard/receiving/create-receiving-webhook) — metadata only; GET body separately
- [Resend — Verify webhook requests (Svix)](https://resend.com/docs/webhooks/verify-webhooks-requests) — raw body; `svix-id` / `svix-timestamp` / `svix-signature`
- [Resend — Reply in the same thread](https://resend.com/docs/dashboard/receiving/reply-to-emails) — `In-Reply-To` + `References` using RFC `message_id`
- [Resend changelog — `message_id` on webhooks and GET](https://resend.com/changelog/message-id-for-sent-emails)
- [Cloudflare community — Resend vs Email Routing MX](https://community.cloudflare.com/t/resend-com-with-cloudflare-email-routing/902167)
- This repo: `apps/web/lib/forms/notify.ts` (EMAIL binding preferred over Resend), `apps/web/wrangler.jsonc` (`send_email`, staging hostnames, no production deploy), `packages/emails/src/contact.ts` (`escapeHtml` quoting), `packages/db/supabase/migrations/20260828000002_contact_forms.sql` + `20260902000001_contact_delivery_outbox.sql`, `app/ops/ops.dc.html` + `OpsSidebar.dc.html` (`#staff` folded into Settings), `apps/web/app/api/auth/email-hook/route.ts` (different webhook scheme), `.hermes.md` / `PROJECT.md` (no live DNS until Phase 11; Staff tab stays gone; Gmail copy; funnel frozen; never push `main`)

---
*Pitfalls research for: v1.1 Ops Support (two-way Resend email tickets on existing contact + ops)*
*Researched: 2026-09-04*
