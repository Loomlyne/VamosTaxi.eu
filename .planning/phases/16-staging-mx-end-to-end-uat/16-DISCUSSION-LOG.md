# Phase 16: Staging MX + end-to-end UAT - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-09-18
**Phase:** 16-Staging MX + end-to-end UAT
**Areas discussed:** From vs Reply-To, MX cutover, inbound copy at info@, Gmail UAT mailbox

---

## From vs Reply-To

| Option | Description | Selected |
|--------|-------------|----------|
| Flip From this phase | Verify `replies.` as sending domain; From = plus-address | ✓ |
| MX-only | Keep From `noreply@`; UAT on desktop Gmail; mobile hole stays | |

**User's choice:** Flip From this phase.
**Notes:** Staff Send only. Contact ack stays EMAIL + Reply-To plus. Agent applies Resend + Cloudflare (existing access). Flag flips after Resend shows Verified, then one commit + deploy `vamos`.

---

## MX cutover

| Option | Description | Selected |
|--------|-------------|----------|
| Hard replace SES MX | Resend receiving MX on `replies.` only | ✓ |
| Dual MX | Keep SES and add Resend | |

| Option | Description | Selected |
|--------|-------------|----------|
| Same sitting DKIM + MX | From flag still waits for Verified | ✓ |
| MX only after Verified | | |

| Option | Description | Selected |
|--------|-------------|----------|
| Reuse `/api/webhooks/resend` | Already 400 unsigned on staging | ✓ |
| New webhook URL | | |

| Option | Description | Selected |
|--------|-------------|----------|
| Revert replies. MX to SES if inbound fails | Then debug | ✓ |
| Leave Resend MX up | | |

**User's choice:** Hard replace; same sitting DNS; reuse webhook; revert on failure.
**Notes:** Hostname copied from Resend dashboard. Apex and `.eu` untouched.

---

## Inbound copy at info@

| Option | Description | Selected |
|--------|-------------|----------|
| Ops-only for inbound | `info@` already has intake + staff BCC | ✓ |
| Forward matched inbound to info@ | | |

**User's choice:** Ops-only. UAT copy bar = intake + staff BCC at `info@`.
**Notes:** No `receiving.forward`. Koss checks `info@` Gmail.

---

## Gmail UAT mailbox

| Option | Description | Selected |
|--------|-------------|----------|
| Koss Replies from real Gmail | Numbered UAT; agent does not open Gmail | ✓ |
| Agent drives Gmail in-app with vault | | |

| Option | Description | Selected |
|--------|-------------|----------|
| New `/contact` this sitting then staff Send then Reply | | ✓ |
| Reuse existing ticket | | |

| Option | Description | Selected |
|--------|-------------|----------|
| Live Closed → Responded | | ✓ |
| Fixture-only for Closed | | |

| Option | Description | Selected |
|--------|-------------|----------|
| Live no-token mail + Reply with `<script>` | | ✓ |
| Spoof + XSS stay unit/fixture | | |

| Option | Description | Selected |
|--------|-------------|----------|
| Agent checks dashboard in-app after “sent” | | ✓ |
| Koss opens `#support` himself | | |

| Option | Description | Selected |
|--------|-------------|----------|
| Include image + PDF inbound files | Freeform: “image attachments or PDFs for anything” | ✓ |
| Text-only | | |

**User's choice:** Real Gmail, new contact, live Closed, live spoof/XSS, agent confirms dashboard, inbound image + PDF.
**Notes:** Spoof = no token/RFC (14 D-01 still appends a different From when token hits).

---

## Claude's Discretion

- Exact Resend MX / DKIM / SPF values at apply time
- Resend sending vs receiving UI steps
- `16-UAT.md` script order
- SQL readback after inbound

## Deferred Ideas

- Contact-ack From onto `replies.`
- Inbound forward to `info@`
- Catch-all `info@` tickets
- Outbound attach, SUP-F03/F04, `.eu`, Phase 17
