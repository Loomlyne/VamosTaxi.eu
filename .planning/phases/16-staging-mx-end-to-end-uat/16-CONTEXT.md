# Phase 16: Staging MX + end-to-end UAT - Context

**Gathered:** 2026-09-18
**Status:** Ready for planning

<domain>
## Phase Boundary

Staging receiving MX on `replies.vamostaxi.site` only. Staff Send **From** flips to the plus-address after Resend shows that domain verified. Customer Reply-in-Gmail appends to the **same** ticket. Apex `info@` stays Gmail (intake + staff BCC). No live `vamostaxi.eu` DNS. No new Support chrome.

**Also this phase:** live UAT of unsigned webhook 4xx (already true on `vamos`), no-token spoof does not append, `<script>` escaped in `#support`, Closed inbound → Responded, inbound image + PDF on the thread.

**Not this phase:** contact-ack From (stays Cloudflare EMAIL), catch-all `info@` tickets, outbound attach from Send, receiving.forward of inbound to Gmail, Staff tab, funnel 7–11, `env.production`, push `main`, Phase 17 chauffeur desk.

</domain>

<decisions>
## Implementation Decisions

### From vs Reply-To
- **D-01:** Flip staff Send **From** this phase so Reply-in-Gmail works when the client ignores Reply-To. Target: `Vamos Taxi <ticket+{token}@replies.vamostaxi.site>` with the same Reply-To. Amends the *timing* of Phase 13 D-01 (the target was already locked; this phase is the go-live).
- **D-02:** Contact ack **stays** Cloudflare `EMAIL` + Reply-To plus-address. Do not move contact From onto `replies.`. First Reply before any staff Send still depends on Reply-To on mobile.
- **D-03:** Agent applies Resend sending-domain + Cloudflare DNS (DKIM/SPF as the dashboard shows) using existing access. Apex `vamostaxi.site` and `vamostaxi.eu` are untouched. Never guess records.
- **D-04:** `REPLIES_DOMAIN_VERIFIED` stays `false` until Resend shows `replies.vamostaxi.site` **Verified**. Then one commit flips the flag and deploys Worker `vamos`. Do not ship the flag true before that readback.

### MX cutover
- **D-05:** Hard-replace the SES MX on `replies.vamostaxi.site` (`inbound-smtp.ap-northeast-1.amazonaws.com` today) with the Resend **receiving** MX. Copy the hostname from the Resend dashboard — never guess, never dual-MX. **Never** add Resend MX on apex. `dig MX vamostaxi.eu` untouched.
- **D-06:** Same sitting: sending DKIM/SPF records **and** receiving MX together. From flag still waits on D-04.
- **D-07:** Reuse live `https://vamostaxi.site/api/webhooks/resend`. No new webhook URL. Unsigned POST already returns `400 invalid` (secret is bound; missing would be 503).
- **D-08:** If inbound fails after the MX cut: **revert** `replies.` MX to SES, then debug. Do not leave a dead receiving MX up.

### Inbound copy at info@
- **D-09:** Matched customer inbound is **Ops-only**. Do not `receiving.forward` (or otherwise copy) inbound to `info@`.
- **D-10:** UAT copy bar at `info@`: contact **intake** + staff Send **BCC** only. Koss checks `info@` Gmail. Unmatched mail still never becomes a ticket (14 D-02).

### Gmail UAT
- **D-11:** Koss Replies from his **real Gmail**. Numbered type/click UAT. Agent does **not** open Gmail.
- **D-12:** Proof ticket is a **new** `/contact` this sitting → staff Send → Gmail Reply.
- **D-13:** Also live-UAT **Closed → Reply → Responded** (14 D-04) this sitting.
- **D-14:** Live proofs, not fixture-only: (a) a mail with **no** plus-token and **no** RFC match does not append/create; (b) a matched Reply whose body contains `<script>` is escaped in `#support`. ROADMAP “spoofed From does not append” **is** (a) — never match on From. A different From **with** token/RFC still appends (14 D-01).
- **D-15:** After Koss says the Gmail was sent, agent confirms the ticket on `https://dashboard.vamostaxi.site` in the Hermes in-app browser (Support rail, not `#support` typed, not Staff).
- **D-16:** Live Reply includes inbound files: at least one **image** (thread preview) and one **PDF** (filename + download). Staff-only. No public hotlink.

### Must-nots
- **D-17:** No new Support chrome. No interval poll (15 D-02). No Staff tab. No `POST /api/quote`. No `vamostaxi.eu` DNS. No `env.production`. No push `main`. Funnel 7–11 frozen. No IMAP. No invented legal/CHF. Printed Worker name stays `vamos`.

### Claude's Discretion
- Exact Resend receiving MX hostname and DKIM/SPF values — copy from the dashboard at apply time.
- How Resend UI splits “sending domain” vs “enable receiving” on the same `replies.` host.
- Cloudflare record types/names exactly as Resend displays.
- `16-UAT.md` numbered script order inside D-11…D-16.
- SQL readback (`support_messages`, `support_inbound_events`) after the live Reply.
- Whether unsigned 4xx needs a re-curl in UAT (already `400 invalid` on staging) — still list it as a check.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Product
- `.planning/ROADMAP.md` — Phase 16 goal, INB-01, success criteria 1–5, must-nots
- `.planning/REQUIREMENTS.md` — INB-01; INB-02 already complete; “spoofed From” = no token/RFC
- `.planning/PROJECT.md` — Gmail is a copy; Ops is the working inbox; no IMAP; no live `.eu`
- `.planning/research/PITFALLS.md` — apex receiving MX steals `info@`; match never on From
- `.planning/research/SUMMARY.md` — mobile clients ignore Reply-To; receiving MX hostname is dashboard-generated
- `.planning/phases/13-staff-apis-outbound-resend-replies/13-CONTEXT.md` — D-01 From target, D-09 DKIM gate, contact ack EMAIL
- `.planning/phases/14-inbound-webhook/14-CONTEXT.md` — match order, unsigned 4xx, Closed → Responded, no MX in 14
- `.planning/phases/15-wire-ops-support-to-apis/15-CONTEXT.md` — no poll, files on thread, `#support` chrome frozen

### Code
- `apps/web/lib/ops/ticket-mail.ts` — `REPLY_MAILBOX_HOST`, `REPLIES_DOMAIN_VERIFIED`, `staffSender`
- `apps/web/app/api/webhooks/resend/route.ts` — Svix + `email.received`
- `apps/web/lib/ops/ticket-inbound.ts` — ingest, plus-token then RFC
- `app/ops/OpsSupportTicket.dc.html` — overlay; do not restyle

### Must-not
- No `sk_live_`, no `vamostaxi.eu`, no `env.production`, no push `main`
- Apex MX must not become Resend

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `staffSender()` already branches on `REPLIES_DOMAIN_VERIFIED`
- `POST /api/webhooks/resend` live on `vamostaxi.site` (unsigned → 400)
- `ingestInboundEmail` + `support_inbound_events` unique `email_id`
- Phase 15 overlay already renders inbound files (image preview / other download)

### Established Patterns
- Worker secrets via `wrangler secret` (webhook secret already bound)
- Ops is DC hash console on `dashboard.vamostaxi.site`
- New SQL is owner-apply; this phase should not need schema if 14/15 landed
- Gated DNS: agent applies `replies.` only (D-03); never apex / `.eu`

### Integration Points
- 13 stores RFC ids + plus Reply-To — 16 needs From flip after verify
- 14 ingest is already the webhook — 16 points MX at it
- 15 GET/thread is how UAT is seen — no chrome change

</code_context>

<specifics>
## Specific Ideas

- “apply them directly into resend and cloudflare you have access”
- Live Reply includes image attachments **or PDFs for anything**
- After “sent”, agent checks the dashboard in the Hermes in-app browser
- Koss checks `info@` Gmail himself

</specifics>

<deferred>
## Deferred Ideas

- Contact-ack From onto `replies.` (first Reply before staff Send on mobile)
- `receiving.forward` of inbound to `info@`
- Catch-all `info@` tickets
- Outbound attachments from dispatcher Send
- SUP-F03 assignment / SLA / macros / CSAT
- SUP-F04 deep-link booking ref → ops detail
- Live `vamostaxi.eu` DNS
- Phase 17 chauffeur profile / shifts

</deferred>

---

*Phase: 16-Staging MX + end-to-end UAT*
*Context gathered: 2026-09-18*
