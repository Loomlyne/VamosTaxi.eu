# Phase 14: Inbound webhook - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-09-17
**Phase:** 14-Inbound webhook
**Areas discussed:** Closed inbound, Gmail quotes, attachments, match/ignore (locked from ROADMAP + prior phases)

---

## Closed inbound

| Option | Description | Selected |
|--------|-------------|----------|
| Auto-reopen to Responded and show the mail | Phase 12 D-13, current ingest | ✓ |
| Stay Closed, still store the mail, human Reopen | ROADMAP 14 SC | |
| Stay Closed and drop the mail | | |

**User's choice:** Auto-reopen to Responded and show the mail.
**Notes:** Joint 13–15 discuss. ROADMAP “Closed stays closed” overridden.

---

## Gmail quotes

| Option | Description | Selected |
|--------|-------------|----------|
| Strip quotes — only the new paragraph | | ✓ (Claude after “you decide”) |
| Store full text; UI collapses quotes | | |
| Store and show the full dump | | |

**User's choice:** “you decide” (after an earlier freeform “show the error”).
**Notes:** Locked strip. Matched ticket with no text and no file → generic unreadable line, not a drop.

---

## Attachments

| Option | Description | Selected |
|--------|-------------|----------|
| Thread line: attachment not kept, plus text | Recommended | |
| Silent drop | | |
| Refuse whole mail if attachment | | |
| Include attachment, see in Ops same thread | User Other | ✓ |

**User's choice:** “include the attachment i wanna be able to see in ops same thread”
**Notes:** SUP-F02 inbound folded into Phase 14. Outbound attach from Send still out.

---

## Claude's Discretion

- Quote-strip algorithm, object store, size cap
- RFC match after plus-token (already ROADMAP SC — not re-asked)
- Inbound from New → Responded (not re-asked; matches existing `inboundTicketStatus`)

## Deferred Ideas

- Staging MX / UAT — Phase 16
- `#support` chrome — Phase 15
- Outbound attachments, catch-all `info@`, SUP-F03/F04
