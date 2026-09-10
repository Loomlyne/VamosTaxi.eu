---
phase: 12-ticket-schema-support-mock
plan: 02
subsystem: api
tags: [ops, tickets, staff, patch]

requires:
  - phase: 12-01
    provides: five-status CHECK + FORCE RLS on contact_submissions
provides:
  - staffPatchStatus Open from new or closed only
  - PATCH rejects reply / replied / responded
affects: [12-03, 13]

tech-stack:
  added: []
  patterns: [pure staffPatchStatus in tickets-map; vitest never imports asStaff]

key-files:
  created: []
  modified:
    - apps/web/lib/ops/tickets-map.ts
    - apps/web/lib/ops/tickets-map.test.ts
    - apps/web/lib/ops/tickets-write.ts
    - apps/web/app/[locale]/(ops)/api/staff/tickets/[id]/route.ts

key-decisions:
  - "PATCH open only from new (view) or closed (reopen). Not from open/replied/responded."
  - "Any reply key is 400 this slice. Staff reply insert is Phase 13."

patterns-established:
  - "staffPatchStatus is the write allow-list; nextTicketStatus stays the general helper."

requirements-completed: [SUP-02, SUP-01]

duration: 15min
completed: 2026-09-10
---

# Phase 12: Staff GET/PATCH (12-02) Summary

**Staff PATCH is Open / Close / Reopen only. Five statuses in the mapper. No fake reply insert.**

## Performance

- **Duration:** 15 min
- **Started:** 2026-09-10T15:48:00Z
- **Completed:** 2026-09-10T15:51:00Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments

- `TicketStatus` includes `responded`; `staffPatchStatus` / `rejectStaffReply` exported from `tickets-map.ts`
- `patchTicket` uses those guards; drops `support_messages` insert; clears `closed_at` on reopen
- Dual-mount PATCH re-export unchanged

## Task Commits

1. **Task 1 + 2: mapper guards + PATCH writer** - `b539d37` (feat)

**Plan metadata:** this file

## Files Created/Modified

- `apps/web/lib/ops/tickets-map.ts` - five statuses + staffPatchStatus
- `apps/web/lib/ops/tickets-map.test.ts` - D-13 cases
- `apps/web/lib/ops/tickets-write.ts` - Open/Close/Reopen only
- `apps/web/app/[locale]/(ops)/api/staff/tickets/[id]/route.ts` - reply key forwarded so rejectStaffReply fires

## Decisions Made

- Identity `closed→closed` stays ok so Close is idempotent
- `tickets.ts` not edited (GET already lists real rows)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- 12-03 `#support` DC can PATCH `{ status: "open" | "closed" }` only

## Self-Check: PASSED

- STATUSES contains responded
- nextTicketStatus("closed","open") is open; ("closed","replied") is null
- staffPatchStatus replied/responded/open → open is null
- vitest lib/ops/tickets-map.test.ts 6 passed
- tickets-write.ts has no insert into support_messages
- Route still withStaff

---
*Phase: 12-ticket-schema-support-mock*
*Completed: 2026-09-10*
