# Phase 14: Inbound webhook - Research

**Researched:** 2026-09-17
**Domain:** Resend `email.received` webhook → ticket match → Postgres thread (+ R2 files)
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

**CRITICAL:** Locked decisions are NON-NEGOTIABLE. CONTEXT D-NN **overrides ROADMAP**.

### Locked Decisions
- **D-01:** Match order: plus-token in `to` / `received_for`, then RFC `In-Reply-To` / `References` against stored ids. **Never** match on `From`. A different From still appends if token or RFC hits.
- **D-02:** Mail that is not a reply to an existing ticket does **not** become a ticket. Drop it. No catch-all.
- **D-03:** Webhook is signed (Svix `svix-*` on the raw body). Unsigned POST is 4xx on deployed staging. Missing `RESEND_WEBHOOK_SECRET` is 503. Non-`email.received` events return 200 and do nothing.
- **D-04:** Customer Reply on **Closed** → auto-reopen to **Responded**, show the mail. `closed_at` cleared. ROADMAP 14 “stay closed” is **dead**; Phase 12 D-13 wins.
- **D-05:** Any matched inbound sets status **Responded**, including from **New** (skip Open). Open / Replied / Responded → Responded.
- **D-06:** Strip Gmail quoted history. Store and show only the new paragraph. Cap still 8000 on the stripped text.
- **D-07:** If the ticket matched and there is no usable text **and** no kept file: append a generic unreadable line (escaped). Do **not** drop a matched ticket. Do not store raw HTML.
- **D-08:** Customer files appear on the **same thread**. Real storage, staff can open them in Ops. Not a fake pill.
- **D-09:** Images preview in the thread. Other types = filename + download. Staff-only. No public hotlink.
- **D-10:** Oversize / unsupported: keep any text (D-06); do **not** keep that file; thread line that the file was not kept.
- **D-11:** Dispatcher **Send** stays text-only. No attach control on the composer (not painted). Outbound attach stays out.
- **D-12:** Idempotent on provider `email_id` (`support_inbound_events`). Retry is not a second row.
- **D-13:** Contact-ack **Reply-To plus-address** (already on `/api/contact`) must stay so the first customer reply works before any staff Send. Do not strip it in 13 leftover plans.
- **D-14:** No MX / no Resend receiving DNS this phase. That is 16. Do not steal apex Gmail MX.
- **D-15:** No `POST /api/quote`, no Staff tab, no live `vamostaxi.eu` DNS, no `env.production`, no push `main`, funnel 7–11 frozen. No IMAP. No invented legal copy.

### Claude's Discretion (locked here for planning)
- Quote-strip: `stripQuotedHistory` on **plain text** after `inboundBody`. Cut at the first of: a line matching `/^On .+ wrote:$/m`, `-----Original Message-----`, a `\n\n>` quoted block after at least one non-quote paragraph. Gmail `-- ` signature cut only **after** the quote cut, never before the new paragraph. Fail toward **too much kept**. Do not parse raw HTML for quotes.
- Object store: **new R2** binding `SUPPORT_FILES` (bucket `vamos-support-staging` on staging / ops-changes / front). **Never** reuse `PHOTOS`. No Supabase Storage. No anonymous URL. Staff GET streams from R2.
- Caps: **5 MiB** per file, **max 3** kept files. MIME allow-list: `image/jpeg`, `image/png`, `image/webp`, `image/gif`, `application/pdf`. Skip `content_disposition=inline` under 20 KiB (signature pixels) as not-kept **without** a thread line. Oversize / bad MIME / extra files past 3: not kept **with** a thread line (D-10).
- Existing `apps/web/app/api/webhooks/resend/route.ts` + `ticket-inbound.ts` is the starting point. Close gaps. Do not invent a second webhook.

### Deferred Ideas (OUT OF SCOPE)
- Staging MX + Reply-in-Gmail UAT — Phase 16
- `#support` list/thread chrome, badge, Save, mailto — Phase 15
- Outbound attachments from dispatcher Send
- Catch-all `info@` tickets
- SUP-F03 assignment / SLA / macros / CSAT
- SUP-F04 deep-link booking ref → ops detail
- Live `vamostaxi.eu` DNS
</user_constraints>

<architectural_responsibility_map>
## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Svix verify + `email.received` | API/Backend (`POST /api/webhooks/resend`) | — | Public Worker route; already exists |
| Fetch receiving body / headers / attachments | API/Backend (Resend Receiving API) | Resend | Webhook payload is metadata-only |
| Plus-token + RFC match | API/Backend (`ticket-mail` / `ticket-inbound`) | Database | Token in Postgres; RFC on `support_messages` |
| Persist inbound row + status | Database (`support_messages`, `contact_submissions`) | — | asSystem DEFINER path |
| Store kept files | CDN/Static (R2 `SUPPORT_FILES`) | Database metadata | Staff-only; no public URL |
| Staff download / image bytes | API/Backend (`GET` staff files) | R2 | Phase 15 paints; 14 must make open work |
| Quote strip / clip 8000 | API/Backend (pure functions) | — | Unit-testable, no DB |
</architectural_responsibility_map>

<research_summary>
## Summary

Phase 14 already has a signed webhook and plus-token ingest. Gaps vs locked CONTEXT:

1. Resend `email.received` **does not include body, headers, or attachment bytes** — only metadata (`email_id`, `to`, `from`, `received_for`, `message_id`, attachment ids). Current `receivedBody` fetch is correct in spirit but does not read `headers` (`in-reply-to` / `references`), `received_for`, or `message_id`, and does not pull attachments.
2. Ingest matches **plus-token only** and **drops when `inboundBody` is empty** — violates D-01 RFC fallback and D-07 unreadable-but-matched.
3. `inboundTicketStatus` already always returns `responded` and ingest already clears `closed_at` — D-04/D-05 are already true in code. ROADMAP criterion 4 (“Closed stays closed”) is **wrong**; do not “fix” it back.
4. No file table, no R2 support bucket, no staff file GET. D-08/D-09/D-10 need a migration (owner-apply) + `SUPPORT_FILES` + metadata rows.
5. Idempotency inserts `support_inbound_events` **before** looking up the ticket. Unmatched mail still consumes the `email_id` (good — no retry storm). Crash between event insert and message insert **loses** the mail. Move: resolve ticket first; then one transaction (event + message + files). Unmatched: insert event only, no message.

**Primary recommendation:** Extend the existing webhook. Always GET `/emails/receiving/:id` after verify. Match plus-token (`to` ∪ `received_for`) then RFC ids. Strip quotes. Store files on a new R2 bucket. Prove with `lib/**/*.test.ts` fixtures — no live MX.

</research_summary>

<standard_stack>
## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `standardwebhooks` | already in `apps/web` | Svix verify on raw body | Already used in `route.ts` |
| Resend Receiving HTTP | `https://api.resend.com/emails/receiving/:id` | Body + headers + `message_id` + `received_for` | Official; webhook is metadata-only |
| Resend attachments list | `GET /emails/receiving/:id/attachments` | `download_url` (signed, short TTL) | Official |
| Cloudflare R2 | existing Workers binding pattern | Staff-only bytes | PHOTOS analog; new bucket |
| Postgres + Hyperdrive `asSystem` | existing | Ticket writes | Same door as current ingest |
| Vitest 4.1.11 | `apps/web` | Unit tests | `lib/**/*.test.ts` only |

### Supporting
| Library | Purpose | When to Use |
|---------|---------|-------------|
| `withStaff` | Staff file GET | Download / preview bytes |
| pgTAP | Schema grants / CHECK | After owner-apply, not in Worker unit tests |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| New R2 `SUPPORT_FILES` | Prefix on `PHOTOS` | Mixes chauffeur photos with PII mail; rejected |
| R2 | Supabase Storage | Extra product; public URL risk; rejected |
| Quote-strip lib | `mailparser` / `planandgo` | New npm without audit; hand-roll small stripper |
| IMAP | Resend receiving | PROJECT forbids IMAP |

**Installation:** none. Do not `pnpm add`. Do not add `mailparser`.
</standard_stack>

<architecture_patterns>
## Architecture Patterns

### System Architecture Diagram

```
Customer Gmail Reply
        │
        ▼
Resend receiving (MX is Phase 16 — this phase uses signed fixtures)
        │
        ▼
POST /api/webhooks/resend  ── Svix verify raw body
        │
        ├─ no secret → 503
        ├─ bad sig → 400
        ├─ not email.received → 200 no-op
        ▼
GET /emails/receiving/:email_id  (text, html, headers, message_id, received_for)
GET /emails/receiving/:email_id/attachments  (then download_url)
        │
        ▼
Match: plus-token(to ∪ received_for) → else RFC(In-Reply-To ∪ References)
        │
        ├─ no ticket → insert support_inbound_events only → 200 drop
        ├─ replay email_id → 200 ok (no second message)
        ▼
stripQuotedHistory → clip 8000
keep files (MIME/size/count) → R2 SUPPORT_FILES
        │
        ▼
TX: inbound_events + support_messages + support_message_files
    contact_submissions.status = responded, closed_at = null
        │
        ▼
Phase 15 GET thread paints rows + files
Phase 14 GET /api/staff/tickets/:id/files/:fileId streams R2
```

### Recommended Project Structure
```
apps/web/lib/ops/ticket-mail.ts          # parse, strip, token, RFC helpers
apps/web/lib/ops/ticket-inbound.ts       # ingest TX
apps/web/lib/ops/ticket-inbound-files.ts # R2 put + caps (new)
apps/web/app/api/webhooks/resend/route.ts
apps/web/app/[locale]/(ops)/api/staff/tickets/[id]/files/[fileId]/route.ts
packages/db/supabase/migrations/YYYYMMDDHHMMSS_support_message_files.sql
apps/web/wrangler.jsonc                  # SUPPORT_FILES binding (not env.production)
apps/web/lib/env.d.ts                    # SUPPORT_FILES: R2Bucket
```

### Pattern 1: Signed webhook, raw body
**What:** `request.text()` then `Webhook(secret).verify` with `svix-id` / `svix-timestamp` / `svix-signature`.
**When to use:** This route only.
**Do not:** `request.json()` first (breaks the signature).

### Pattern 2: asSystem ingest
**What:** Current `ingestInboundEmail` uses `asSystem`. Keep it. Staff RLS is for overlay writes, not the public webhook.

### Pattern 3: PHOTOS analog, different bucket
**What:** `env.PHOTOS.put(key, bytes)` exists for chauffeur photos. Copy the put/get shape onto `SUPPORT_FILES` with keys `support/{submissionId}/{messageId}/{fileId}`.

### Anti-Patterns to Avoid
- **Second webhook path** — extend `route.ts`
- **Match on From** — D-01
- **Store raw HTML in `body_html` for inbound** — D-07; `body_text` only
- **Public R2 / presigned customer URL** — D-09
- **`supabase db push`** — owner MCP apply
- **`env.production` wrangler edits / deploy** — D-15
- **`vitest run tests/integration/*.spec.ts`** — always green; use `lib/**/*.test.ts`
- **Drop matched mail because body empty** — D-07
- **Insert inbound event before ticket lookup in a way that loses matched mail on crash** — resolve then TX
</architecture_patterns>

<dont_hand_roll>
## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Webhook signatures | Custom HMAC | `standardwebhooks` already on the route | Svix timestamp + id |
| MIME parsing of .eml | `mailparser` | Resend receiving JSON + attachments API | Webhook has no raw .eml in the POST |
| Public file CDN | Custom token URLs | Staff GET + `withStaff` | D-09 |
| IMAP poll | Inbox daemon | Resend `email.received` | PROJECT: no IMAP |
</dont_hand_roll>

<common_pitfalls>
## Common Pitfalls

### Pitfall 1: Webhook has no body
**What goes wrong:** `inboundBody` is empty; ingest returns `drop` even with a valid plus-token.
**Why:** Resend documents `email.received` as metadata-only.
**How to avoid:** Always GET receiving after verify. Treat missing `RESEND_API_KEY` as 503 for `email.received` (cannot fetch).
**Warning signs:** Unit tests that only pass a fat webhook JSON.

### Pitfall 2: `received_for` vs `to`
**What goes wrong:** Plus-address is in `received_for` (forward-for) not `to`.
**How to avoid:** `tokenFromInboundTo(to)` **and** `received_for` (D-01).

### Pitfall 3: ROADMAP “Closed stays closed”
**What goes wrong:** Executor “fixes” ingest to skip Closed.
**How to avoid:** CONTEXT D-04 wins. `inboundTicketStatus` stays `responded`; keep `closed_at = null`.

### Pitfall 4: body_text CHECK 1–8000
**What goes wrong:** Empty stripped body fails INSERT.
**How to avoid:** D-07 generic line (English ops: `Message could not be read.`) when no text and no kept file. If kept files exist and text is empty, body_text = `Attachment received.` so CHECK passes.

### Pitfall 5: Attachment download_url expires
**What goes wrong:** Store the Resend URL in Postgres; Phase 15 403s later.
**How to avoid:** Download during ingest; put bytes on R2; store `r2_key`.

### Pitfall 6: Idempotency vs lost mail
**What goes wrong:** Event row inserted, then crash before message.
**How to avoid:** Lookup ticket first. One TX for event+message+files. Unmatched: event-only TX.

### Pitfall 7: From spoof
**What goes wrong:** Attacker sets From to a known customer.
**How to avoid:** Never SELECT by `contact_submissions.email`. Tests must include spoofed From + unknown token + unknown RFC → drop.

### Pitfall 8: HTML stored
**What goes wrong:** `<script>` in `body_text` or `body_html`.
**How to avoid:** Strip tags via existing `htmlToText`; never persist `body_html` for `inbound_email`. Phase 15 escapes on paint. Unit: fixture contains `<script>` and stored text does not include the tag.
</common_pitfalls>

<code_examples>
## Code Examples

### Receiving GET (already started)
Current `receivedBody` hits `https://api.resend.com/emails/receiving/${payload.emailId}`. Extend the JSON type to `headers`, `message_id`, `received_for`, `text`, `html`.

### Attachments list
`GET https://api.resend.com/emails/receiving/{email_id}/attachments` → `{ data: [{ id, filename, size, content_type, content_disposition, download_url }] }`. Fetch `download_url` with no Resend auth (signed). Cap bytes while reading.

### Svix (keep)
`new Webhook(secret).verify(body, { "webhook-id", "webhook-timestamp", "webhook-signature" })`.
</code_examples>

<sota_updates>
## State of the Art (2025-2026)

| Old Approach | Current Approach | Impact |
|--------------|------------------|--------|
| Fat webhook with text/html | Metadata webhook + Receiving API | Must fetch; serverless body limits |
| Match on From | Plus-address + RFC | D-01 |
| IMAP | Resend receiving | Out of V1 |

**Deprecated:** treating `event.data.text` as reliable. **Do not** skip the GET when text is missing.
</sota_updates>

<open_questions>
## Open Questions

None for the planner. Discretion is locked in this file. MX is Phase 16. Overlay chrome is Phase 15.

Owner-gated (not questions):
- MCP `apply_migration` for `support_message_files` — agent commits SQL, stops, waits for **apply**
- `wrangler r2 bucket create vamos-support-staging` + bind `SUPPORT_FILES` — numbered owner/agent after whoami `koussayzayeni@gmail.com`
- `RESEND_WEBHOOK_SECRET` already documented as optional until this phase; missing → 503 (already)
</open_questions>

<sources>
## Sources

### Primary (HIGH confidence)
- `apps/web/app/api/webhooks/resend/route.ts` — Svix + receiving GET
- `apps/web/lib/ops/ticket-inbound.ts` — plus-token ingest, event-first insert
- `apps/web/lib/ops/ticket-mail.ts` — token, `inboundBody`, `inboundTicketStatus` → `responded`
- `packages/db/supabase/migrations/20260904182631_contact_ticket_schema.sql` — `support_messages`, `support_inbound_events`, `rfc_message_id`, body 1–8000
- https://resend.com/docs/webhooks/emails/received — metadata-only webhook
- https://resend.com/docs/api-reference/emails/retrieve-received-email — `headers`, `received_for`, `message_id`, `raw`
- https://resend.com/docs/api-reference/emails/list-received-email-attachments — `download_url`

### Secondary
- Phase 12 CONTEXT D-13 Closed → Responded
- Phase 13 CONTEXT plus-address Reply-To + RFC ids on outbound
</sources>

<metadata>
## Metadata

**Research scope:** live webhook, ingest, schema, Resend receiving, R2 analog
**Confidence:** HIGH on code + Resend docs; MEDIUM on exact Resend header key spelling (`in-reply-to` vs `In-Reply-To`) — read both case-insensitively
**Research date:** 2026-09-17
**Valid until:** 2026-10-17
</metadata>

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.11 (`apps/web`); pgTAP only after owner-apply (not Worker unit) |
| Config file | `apps/web/vitest.config.ts` (`lib/**/*.test.ts`) |
| Quick run command | `pnpm --filter web exec vitest run lib/ops/ticket-mail.test.ts lib/ops/ticket-inbound.test.ts` |
| Full suite command | `pnpm test:unit` |

Do **not** point `<automated>` at `tests/integration/**` or `*.spec.ts`.

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|--------------|
| INB-02 / D-02 | Unknown token + unknown RFC → no `support_messages` insert | unit | `vitest run lib/ops/ticket-inbound.test.ts` | ❌ extend |
| INB-02 / D-01 | Plus-token in `received_for` matches; From ignored | unit | same | ❌ |
| INB-02 / D-01 | RFC In-Reply-To matches stored `rfc_message_id` when token missing | unit | same | ❌ |
| INB-02 / D-01 | Spoofed From of a real ticket + no token + no RFC → drop | unit | same | ❌ |
| D-03 | Unsigned / missing secret / non-received | unit (pure verify + source-read route) | `ticket-inbound.test.ts` + readFileSync route | ⚠️ route not imported (db-fences / alias) |
| D-04 / D-05 | Closed + matched inbound → `responded`, `closed_at` null | unit | ingest mock sql | ❌ |
| D-06 | Gmail `On … wrote:` dumped thread → only new paragraph stored | unit | `ticket-mail.test.ts` | ❌ |
| D-07 | Matched + empty body + no file → generic line, not drop | unit | inbound test | ❌ |
| D-08/D-09/D-10 | Keep jpeg ≤5MiB; reject zip; extra file not kept with line | unit | files helper test | ❌ |
| D-12 | Same `email_id` twice → one message | unit | inbound test | ❌ |
| D-13 | `/api/contact` still sets Reply-To plus-address | source-read | existing contact tests / grep | ✅ do not regress |
| — | No Staff tab, no `/api/quote` in this diff | grep | existing | ✅ |
| INB-02 | Live Reply-in-Gmail | **manual Phase 16** | MX | n/a this phase |

### Sampling Rate

- **Per task commit:** targeted `vitest run lib/ops/ticket-mail.test.ts lib/ops/ticket-inbound.test.ts`
- **Per wave:** `pnpm --filter web test` (unit config)
- **Phase gate:** `pnpm test:unit` before verify-work. Live MX is Phase 16.

### Wave 0 Gaps

- [ ] Expand `apps/web/lib/ops/ticket-inbound.test.ts` — ingest mock: match order, drop, idempotency, closed→responded, empty body
- [ ] Expand `apps/web/lib/ops/ticket-mail.test.ts` — `stripQuotedHistory`, `received_for` token, RFC header parse, `<script>` htmlToText
- [ ] New `apps/web/lib/ops/ticket-inbound-files.test.ts` — MIME/size/count
- [ ] Source-read `apps/web/app/api/webhooks/resend/route.ts` for Svix + `email.received` (do **not** import the route in vitest)

## Security Domain

ASVS L1. Public webhook + PII mail + files.

| ASVS | Applies | Control |
|------|---------|---------|
| V4 Access Control | yes | Never match From. Staff file GET `withStaff`. R2 private |
| V5 Input Validation | yes | Strip HTML; clip 8000; MIME/size allow-list |
| V13 API | yes | Svix on raw body; 400/503 as D-03 |
| V14 Config | yes | `RESEND_WEBHOOK_SECRET` wrangler secret, not `vars` |

### Threats (PLAN.md `<threat_model>`)

| ID | Threat | Severity | Mitigation |
|----|--------|----------|------------|
| T-14-01 | Unsigned webhook forges inbound | high | Svix; 400 |
| T-14-02 | From spoof appends to a ticket | high | D-01 never From |
| T-14-03 | Catch-all creates tickets | high | D-02 drop unmatched |
| T-14-04 | Public file URL | high | Staff GET only; no R2 public |
| T-14-05 | Stored XSS | medium | No `body_html`; htmlToText; 15 escapes |
| T-14-06 | Zip/oversize | medium | D-10 caps |
| T-14-07 | Missing secret | medium | 503 |

Block on high. Do not ship From-match or public R2.

---

*Phase: 14-inbound-webhook*
*Research completed: 2026-09-17*
*Ready for planning: yes*
