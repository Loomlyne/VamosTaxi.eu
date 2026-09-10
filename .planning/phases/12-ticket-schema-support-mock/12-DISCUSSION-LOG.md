# Phase 12: Ticket schema + #support mock - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-09-10
**Phase:** 12-Ticket schema + #support mock
**Areas discussed:** List chrome, Ticket rows this slice, How status changes, New tickets

---

## List chrome

| Option | Description | Selected |
|--------|-------------|----------|
| Keep 4-column kanban | Already in OpsSupportTicket | ✓ (then expanded to 5 via status area) |
| Single list + overlay | ROADMAP “mock list” | |
| Phone table | Already in DC | ✓ |
| Kanban on phone | Sideways scroll | |
| Overlay on board | Dialog | ✓ |
| Ticket page replace | | |
| Desktop Kanban/Table switch | Default Kanban | ✓ |
| Search works (local filter) | User: “make it work” | ✓ |
| Hide search | SUP-F03 out | |
| Empty = four empty columns | No fake cards | ✓ |
| Card with 3-line preview | Later overridden | |
| Card without preview | Name, email, time, ref/locale | ✓ |
| Sort arrow per column | User freeform | ✓ |
| Sidebar New badge | Count of New | ✓ |

**User's choice:** Keep the existing DC kanban/table/overlay; make search work; no fake cards; later dropped message preview on the card.
**Notes:** Booking_ref/locale on the card when they exist.

---

## Ticket rows this slice

| Option | Description | Selected |
|--------|-------------|----------|
| Real contact_submissions | Empty if none | ✓ |
| Fixture cards | phase-12.md mock | |
| Cold info@ as tickets | User asked; refused as catch-all | |
| Staff GET this slice | DC already calls /api/staff/tickets | ✓ |
| Backfill existing | New + token + first message | ✓ |
| GET fail empty columns | | |
| GET fail error banner | | ✓ |
| Filter one status → table | User freeform + extra phone/status cols | ✓ |
| Refresh on open + after status | | ✓ |
| Who can open | You decide → any staff | ✓ |
| Always escape HTML | | ✓ |

**User's choice:** Real `/contact` rows; two-way Gmail is 13–16; cold info@ out.
**Notes:** User described full two-way mail; scoped to this slice as GET + status only.

---

## How status changes

| Option | Description | Selected |
|--------|-------------|----------|
| Drag + overlay control | | |
| No drag; automatic | User freeform | ✓ |
| Four statuses (SUP-02) | | |
| Five statuses + Responded | Owner amended SUP-02 | ✓ |
| Close button | | ✓ |
| Auto-reopen Closed on customer mail | Reverses closed-stays-closed | ✓ to Responded |
| Manual Reopen | | ✓ |

**User's choice:** Automatic status; fifth column Responded; Close/Reopen buttons; customer reply on Closed → Responded.
**Notes:** Reply→Replied and inbound→Responded wait for later phases; rules locked now.

---

## New tickets

| Option | Description | Selected |
|--------|-------------|----------|
| New until overlay opens → Open | | ✓ |
| PATCH fail still opens overlay | Keep New, error on overlay | ✓ |
| Later statuses unchanged on open | Closed stays Closed | ✓ |
| PATCH Open/Close/Reopen this slice | | ✓ |

**User's choice:** Open-on-view for New only; writes this slice are Open/Close/Reopen.

---

## Claude's Discretion

- Who can open `#support`: any signed-in staff
- Reopen target status: `open`
- Reply composer painted, no send this slice
- Untracked support SQL is a draft to rewrite

## Deferred Ideas

- Two-way Resend + MX (13–16)
- Catch-all info@ tickets
- Attachments, SLA, macros, booking-detail deep-link
