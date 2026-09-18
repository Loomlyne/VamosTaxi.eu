# Phase 15: Wire Ops #support to APIs - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-09-17
**Phase:** 15-Wire Ops #support to APIs
**Areas discussed:** Badge, overlay fields, refresh, mailto/Call/WA, Save unify, booking ref strictness

---

## Badge

| Option | Description | Selected |
|--------|-------------|----------|
| New + Responded (waiting on you) | | ✓ |
| Keep New only (Phase 12) | | |
| Any not-Closed ticket | | |

**User's choice:** New + Responded.

---

## Overlay fields

| Option | Description | Selected |
|--------|-------------|----------|
| All three live, as painted | phone, ref, note | ✓ then amended by Save unify |
| Notes only | | |
| Read-only this slice | | |

**User's choice:** Yes — all three live, as painted.

---

## Board freshness

| Option | Description | Selected |
|--------|-------------|----------|
| Enter #support + after Send/Close/Reopen + tab focus | | ✓ |
| Enter + after own writes only (Phase 12) | | |
| Silent poll while #support open | | |

**User's choice:** Enter, after own writes, tab focus. No poll.
**Notes:** Save added to the write set when Save was unified.

---

## mailto / Call / WhatsApp

| Option | Description | Selected |
|--------|-------------|----------|
| Keep Email + Call + WhatsApp as painted | | ✓ |
| Keep Call + WhatsApp; drop Email | | |
| Keep all three; mailto out of band is fine | same as first | |

**User's choice:** Keep Email + Call + WhatsApp as painted.

---

## Persist timing / Save

| Option | Description | Selected |
|--------|-------------|----------|
| On blur | | |
| Debounced while typing | | |
| Same Save note click writes phone + ref | | |
| One Save unifies them all | User Other | ✓ |

**User's choice:** “make one save button unify them all”
**Notes:** Relabel Save. Empty note still saves phone/ref. Invalid booking ref refuses the whole Save.

---

## Booking ref strictness

| Option | Description | Selected |
|--------|-------------|----------|
| Free text like the contact form | | |
| Must match a real VT- booking or refuse | | ✓ |
| Empty allowed; if filled must match | | |

**User's choice:** Must match a real VT- booking or refuse.
**Notes:** Empty still allowed (contact tickets with no ref stay tickets; Phase 12 D-07). Filled must exist.

---

## Claude's Discretion

- PATCH shape, image preview sizing, Reopen → `open`

## Deferred Ideas

- Phase 14 ingest, Phase 16 MX
- SUP-F04 deep-link, SUP-F03 macros, outbound attach
