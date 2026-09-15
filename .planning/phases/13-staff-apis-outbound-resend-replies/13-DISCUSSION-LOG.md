# Phase 13: Staff APIs + outbound Resend replies - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-09-15
**Phase:** 13-Staff APIs + outbound Resend replies
**Areas discussed:** Gmail From/subject/brand, all-mail scope, Resend failure, send rules, overlay wiring

---

## What Gmail shows

| Option | Description | Selected |
|--------|-------------|----------|
| Plus-address From on replies.vamostaxi.site | `Vamos Taxi <ticket+token@…>` | ✓ (gated on Resend domain verify) |
| noreply From + Reply-To plus-address | Cleaner From | Interim until verify |
| Looks like info@ From | Would steal Gmail identity | |
| Always Re: contact-ack subject | | ✓ |
| Staff types subject | Splits thread | |
| Keep voucher chrome | | ✓ then expanded to full brand + all templates |
| Staff text only | | |

**User's choice:** Plus-address From (1); Re: ack subject (1); branded like dashboard, all fields per mail type; BCC info@ (1).
**Notes:** Brand pass expanded to every `packages/emails` template **inside Phase 13**. Funnel *logic* stays frozen.

---

## All emails in 13

| Option | Description | Selected |
|--------|-------------|----------|
| After Support (after 16) | | |
| Insert 13.1 / 18.1 | | |
| Inside Phase 13 | | ✓ |

**User's choice:** All sends now in 13, not Support-only.

---

## Resend failure

| Option | Description | Selected |
|--------|-------------|----------|
| Fail closed, no EMAIL | | ✓ (you decide) |
| Fall through to EMAIL | | |
| Generic overlay error | | ✓ |
| Overlay + staff-only detail | | |

**User's choice:** You decide best (fail closed) + generic overlay (1). Asked why it fails: swallowed Resend errors + EMAIL fallback; `replies.` not verified in Resend; MX on replies is AWS SES.
**Notes:** Code: staff `allowEmailFallback: false`; BCC; Reply-To plus-address. Contact ack still EMAIL.

---

## Send rules + overlay

| Option | Description | Selected |
|--------|-------------|----------|
| Empty/Closed refuse; ticket locale; BCC | | ✓ |
| Allow send on Closed | | |
| Wire DC Send this phase | Already PATCH `{ reply }` | ✓ |
| API only until 15 | | |

**User's choice:** 1.1 send rules, 2.1 wire overlay now.

---

## the agent's Discretion

- Fail closed as the send policy
- Interim From `noreply@` until owner verifies `replies.` in Resend
- Layout token sharing across email components

## Deferred Ideas

- Phase 14 inbound, Phase 16 receiving MX
- Attachments / macros
- Apex MX must never become Resend
