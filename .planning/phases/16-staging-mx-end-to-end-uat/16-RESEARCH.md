# Phase 16: Staging MX + end-to-end UAT - Research

**Researched:** 2026-09-18
**Domain:** Resend receiving MX on a staging subdomain + staff Send From cutover + live Gmail UAT
**Confidence:** HIGH on live DNS, `staffSender`, webhook, and Resend domain API; MEDIUM on the exact Resend MX hostname / DKIM names until dashboard/API readback at apply time (D-03: never guess)

<user_constraints>
## User Constraints (from CONTEXT.md)

**CRITICAL:** Locked. Planner must honor these.

### Locked Decisions
- **D-01:** Flip staff Send **From** this phase to `Vamos Taxi <ticket+{token}@replies.vamostaxi.site>` with the same Reply-To.
- **D-02:** Contact ack **stays** Cloudflare `EMAIL` + Reply-To plus-address.
- **D-03:** Agent applies Resend sending-domain + Cloudflare DNS from the dashboard/API. Apex `vamostaxi.site` and `vamostaxi.eu` untouched. Never guess records.
- **D-04:** `REPLIES_DOMAIN_VERIFIED` stays `false` until Resend shows `replies.vamostaxi.site` **Verified**. Then one commit flips the flag and deploys Worker `vamos`.
- **D-05:** Hard-replace the SES MX on `replies.vamostaxi.site` with the Resend **receiving** MX. Copy hostname from Resend. Never dual-MX. Never apex.
- **D-06:** Same sitting: sending DKIM/SPF **and** receiving MX. From flag still waits on D-04.
- **D-07:** Reuse `https://vamostaxi.site/api/webhooks/resend`. No new webhook URL.
- **D-08:** If inbound fails after MX cut: revert `replies.` MX to SES, then debug.
- **D-09:** Matched customer inbound is **Ops-only**. No `receiving.forward` to `info@`.
- **D-10:** UAT copy bar at `info@`: contact intake + staff Send BCC only.
- **D-11:** Koss Replies from real Gmail. Agent does not open Gmail.
- **D-12:** Proof ticket = new `/contact` this sitting → staff Send → Gmail Reply.
- **D-13:** Live Closed → Reply → Responded.
- **D-14:** Live no-token/RFC mail does not append; matched Reply with `<script>` is escaped in `#support`.
- **D-15:** After Koss says sent, agent confirms on `https://dashboard.vamostaxi.site` (Support rail).
- **D-16:** Live Reply includes inbound image (preview) and PDF (filename + download).
- **D-17:** No new Support chrome. No poll. No Staff tab. No `POST /api/quote`. No `.eu` DNS. No `env.production`. No push `main`.

### Claude's Discretion
- Exact Resend receiving MX hostname and DKIM/SPF values — copy at apply time.
- How Resend splits sending vs receiving on the same `replies.` host.
- Cloudflare record types/names exactly as Resend displays.
- `16-UAT.md` numbered order inside D-11…D-16.
- SQL readback after the live Reply.
- Re-curl unsigned 4xx in UAT (already `400 invalid`).

### Deferred Ideas (OUT OF SCOPE)
- Contact-ack From onto `replies.`
- `receiving.forward` of inbound to `info@`
- Catch-all `info@` tickets
- Outbound attachments from Send
- SUP-F03 / SUP-F04
- Live `vamostaxi.eu` DNS
- Phase 17 chauffeur desk
</user_constraints>

<architectural_responsibility_map>
## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Receiving MX on `replies.` | CDN/DNS (Cloudflare zone `vamostaxi.site`) | Resend receiving | Mail routing is DNS, not the Worker |
| Sending DKIM/SPF for `replies.` | CDN/DNS | Resend domains API | From plus-address needs a verified sending domain |
| Staff Send From flip | API/Backend (`ticket-mail.ts` const) | Worker `vamos` deploy | Flag already branched; go-live is one const + deploy |
| Ingest / match / files | API/Backend (already Phase 14) | Database + R2 | Do not rewrite ingest |
| Overlay thread / files | Browser (existing DC) | Staff GET | No new chrome (D-17) |
| Gmail Reply proof | Human mailbox | Dashboard UAT | D-11 / D-15 |
</architectural_responsibility_map>

<research_summary>
## Summary

Phase 16 is **DNS + one const + live UAT**. Ingest, webhook, overlay, and `staffSender()` already exist. Live probe 2026-09-18:

- `dig MX replies.vamostaxi.site` → `10 inbound-smtp.ap-northeast-1.amazonaws.com.` (SES). Hard-replace this record only.
- `dig MX vamostaxi.site` → **empty**. Do **not** add Resend (or any) MX on apex to “fix” Gmail. ROADMAP “apex still delivers info@” means **do not change apex**. Copy bar is outbound intake + staff BCC (D-10), not apex inbound MX.
- `dig MX vamostaxi.eu` → `10 mail.vamostaxi.eu.` Untouched.
- Unsigned `POST https://vamostaxi.site/api/webhooks/resend` → `400 invalid` (D-07 already true).

`staffSender()` already returns plus-address From when `REPLIES_DOMAIN_VERIFIED` is true. Tests still lock `false` (`phase-13-must-not.test.ts` D-09, `tickets-write.test.ts` `STAFF_FROM` noreply). Flip the const only after Resend readback says Verified, then retarget those tests in the same commit.

Resend: create/update domain `replies.vamostaxi.site` with **sending and receiving enabled**, copy records from the API/dashboard, enable receiving, wait until sending status is verified, then flip the flag. Webhook URL stays the existing `email.received` endpoint.

**Primary recommendation:** One DNS sitting on `replies.*` only (DKIM/SPF + receiving MX). Flag+deploy is a second commit after Verified. UAT is live Gmail, not fixtures.
</research_summary>

<standard_stack>
## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Cloudflare DNS (zone `vamostaxi.site`) | live | MX / CNAME / TXT for `replies.` | Existing NS `elias`/`magdalena` |
| Resend Domains API | `https://api.resend.com/domains` | Create/list/get domain; records; capabilities sending+receiving | Official; hostname is generated |
| Resend Receiving | MX on custom domain | Inbound to webhook | Docs: lowest-priority MX wins; subdomain is the recommended split |
| Worker `vamos` | OpenNext staging | Hosts `/api/webhooks/resend` | Printed name stays `vamos` |
| `staffSender` | `apps/web/lib/ops/ticket-mail.ts` | From / Reply-To | Already branched on the flag |
| Vitest | `apps/web` `lib/**/*.test.ts` | Unit + source-read | Do not use `tests/integration/**` |

### Supporting
| Tool | Purpose | When to Use |
|------|---------|-------------|
| `dig MX/TXT/CNAME` | Public readback | After every DNS write; before claiming Verified |
| Cloudflare MCP `get_zones_dns_records` | List/filter `replies` records | Apply sitting; never list-then-edit apex `@` |
| In-app browser `dashboard.vamostaxi.site` | UAT confirm | After Koss says sent (D-15) |
| Bitwarden vault | Resend/Cloudflare login if API key missing | Fill only; never type secrets in chat |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Hard-replace SES MX | Dual MX SES+Resend | Unpredictable delivery; **rejected D-05** |
| Receiving on apex | Forward Gmail → Resend | Steals or splits `info@`; apex MX empty today; **rejected** |
| Guess `inbound.resend.com` | Copy dashboard MX | Hostname is account-generated; **rejected D-03** |
| Flip flag before Verified | Ship true in the DNS PR | From plus-address would bounce; **rejected D-04** |
| New webhook URL | Reuse existing | Secret already bound; **rejected D-07** |

**Installation:** none. Do not `pnpm add`.
</standard_stack>

<architecture_patterns>
## Architecture Patterns

### System Architecture Diagram

```
Koss Gmail Reply  ──►  MX replies.vamostaxi.site  (Resend receiving; was SES)
                              │
                              ▼
                    Resend email.received
                              │
                              ▼
              POST /api/webhooks/resend   (existing, Svix)
                              │
                              ▼
              ingest (plus-token then RFC, never From)     ← already 14
                              │
                              ▼
              #support overlay files + escaped text        ← already 15

Staff Send (after flag true):
  From = Vamos Taxi <ticket+{token}@replies.vamostaxi.site>
  Reply-To = same plus-address
  BCC info@ via Resend
Contact ack: Cloudflare EMAIL + Reply-To plus (unchanged)
```

### Recommended project structure (this phase)

```
apps/web/lib/ops/ticket-mail.ts              # flip REPLIES_DOMAIN_VERIFIED only after Verified
apps/web/lib/ops/ticket-mail.test.ts         # staffSender false then true
apps/web/lib/ops/tickets-write.test.ts       # STAFF_FROM becomes plus-address with the flag
apps/web/lib/ops/phase-13-must-not.test.ts   # D-09 false → true in the flag commit
docs/ops/replies-mx.md                       # optional: applied records + SES rollback hostname
.planning/phases/16-.../16-UAT.md            # numbered live UAT
```

No new routes. No wrangler `env.production`. No schema.

### Pattern 1: Copy records, never invent
Resend `POST /domains` / `GET /domains/:id` returns `records[]` with `record` / `name` / `type` / `ttl` / `status`. Cloudflare writes must match those values. Receiving MX is a **separate** enable-receiving step; copy that MX the same sitting (D-06).

### Pattern 2: Same-region as existing sending domain
List Resend domains first. Create `replies.vamostaxi.site` in the **same region** as the existing `vamostaxi.site` sending domain. Do not copy SES `ap-northeast-1` just because inbound-smtp is Tokyo.

### Pattern 3: Flag is the From go-live
Do not add a second From helper. `staffSender` already implements D-01. Contact `notify.ts` / `env.EMAIL` stay on the ack path (D-02).

### Anti-patterns
- Apex MX “so info@ works”
- Dual MX on `replies.`
- Guessing `mx.resend.com` / `inbound.resend.com`
- Flipping the flag in the DNS commit
- `receiving.forward` to Gmail
- New Support chrome / poll / Staff tab
- `vitest run tests/integration/*.spec.ts`
- `env.production` / push `main` / `.eu` zone
</architecture_patterns>

<dont_hand_roll>
## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Receiving hostname | Guess MX | Resend domain records | Generated |
| From addressing | New mailer | `staffSender()` | Already branched |
| Ingest | New webhook | Existing route | D-07 |
| Overlay files | New DC | Phase 15 bubbles | D-17 |
| Gmail drive | Agent opens Gmail | Numbered UAT, Koss Replies | D-11 |
</dont_hand_roll>

<common_pitfalls>
## Common Pitfalls

### Pitfall 1: Apex MX
**What:** Putting Resend MX on `vamostaxi.site` steals `info@` (PITFALLS.md). Live apex MX is empty — adding anything is a change.
**Avoid:** Filter Cloudflare writes to names `replies` / `*.replies` only. Abort if a draft record name is `@` or `vamostaxi.eu`.

### Pitfall 2: Dual / leftover SES MX
**What:** Lowest-priority MX wins. Leaving SES at 10 next to Resend at 10 splits mail.
**Avoid:** Delete/overwrite the SES MX on `replies` in the same sitting. Rollback = put `inbound-smtp.ap-northeast-1.amazonaws.com` priority 10 back.

### Pitfall 3: Flag before Verified
**What:** From plus-address fails SPF/DKIM; Gmail junks staff Send.
**Avoid:** D-04 readback. DNS commit keeps `REPLIES_DOMAIN_VERIFIED = false`.

### Pitfall 4: Tests still lock false after flip
**What:** `phase-13-must-not` and `tickets-write` `STAFF_FROM` go red or, worse, get skipped.
**Avoid:** Same commit as the const flip updates those assertions. `notify.test.ts` copies `options.from` — keep that as a transport test; do not force contact ack onto plus-address.

### Pitfall 5: Matching on From during UAT “spoof”
**What:** ROADMAP “spoofed From” ≠ different From with a valid plus-token (14 D-01 still appends).
**Avoid:** D-14 live proof is **no token and no RFC**. Tokened mail from another From must still append.

### Pitfall 6: Agent opens Gmail
**What:** Violates D-11.
**Avoid:** Numbered steps for Koss. Agent uses dashboard after “sent”.
</common_pitfalls>

## Validation Architecture

| Property | Value |
|----------|-------|
| **Framework** | Vitest (`apps/web`, `lib/**/*.test.ts`) |
| **Quick run** | `pnpm --filter web exec vitest run lib/ops/ticket-mail.test.ts lib/ops/tickets-write.test.ts lib/ops/phase-13-must-not.test.ts` |
| **Full suite** | `pnpm test:unit` |
| **DNS readback** | `dig MX replies.vamostaxi.site` / `dig MX vamostaxi.site` / `dig MX vamostaxi.eu` |
| **Live UAT** | `16-UAT.md` — not unit |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|--------------|
| D-01 / INB-01 | `staffSender` true → From plus-address | unit | `ticket-mail.test.ts` | extend at flag flip |
| D-02 | Contact ack still `env.EMAIL` | source-read | `phase-13-must-not` D-08 | ✅ keep |
| D-04 | Flag false until Verified commit | source-read | `phase-13-must-not` D-09 then invert | ✅ then edit |
| D-05 | No apex Resend MX | dig + MCP list | execute | live |
| INB-01 | Gmail Reply appends same ticket | manual | 16-UAT | n/a |
| D-07 | Unsigned webhook 4xx | curl | already `400 invalid` | live |
| D-14 | No-token drop; `<script>` escaped | live + existing unit | inbound + overlay | unit ✅; live UAT |
| D-16 | Image + PDF on thread | live | 16-UAT | n/a |
| D-17 | No new chrome | source-read DC | grep Staff / quote | ✅ |

### Sampling Rate
- Per task commit: quick vitest above (skip on DNS-only tasks; run `dig` instead)
- Per wave: `pnpm --filter web test` when JS changed
- Phase gate: `pnpm test:unit` + 16-UAT

### Wave 0 Gaps
- [ ] `ticket-mail.test.ts` — `staffSender` false path (noreply + plus Reply-To) and source-read of the true branch string
- DNS/UAT have no unit doubles — do not fake MX in vitest

## Security Domain

ASVS L1. Mail From cutover + public MX.

| ID | Threat | Severity | Mitigation |
|----|--------|----------|------------|
| T-16-01 | Apex MX steal of `info@` | high | D-05 never apex; abort on `@` |
| T-16-02 | Guessed MX / wrong host | high | Copy records; dig readback |
| T-16-03 | From plus-address before verify (spoofable/bounce) | high | D-04 |
| T-16-04 | Unsigned webhook forge | high | Already Svix 400 |
| T-16-05 | From-match spoof | high | 14 D-01; live D-14 |
| T-16-06 | Stored XSS from Reply | medium | 15 escape; live `<script>` |
| T-16-07 | Secrets in repo / chat | high | wrangler secret; vault fill |

Block on high.

---

*Phase: 16-staging-mx-end-to-end-uat*
*Research completed: 2026-09-18*
*Ready for planning: yes*
