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

duration: 12min
completed: 2026-09-10
---

# Phase 12 Plan 02: Staff GET/PATCH Summary

**Staff PATCH is Open / Close / Reopen only. Five statuses in the mapper. No fake reply insert.**

## Performance

- **Duration:** 12 min
- **Started:** 2026-09-10T17:20:00Z
- **Completed:** 2026-09-10T17:32:45Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments

- `TicketStatus` includes `responded`; `staffPatchStatus` / `rejectStaffReply` stay in `tickets-map.ts`
- `patchTicket` uses those guards; drops `support_messages` insert; clears `closed_at` on reopen
- Route forwards a `reply` key so `rejectStaffReply` fires as 400
- Re-execute restored the writer after mail land had mixed Phase 13 into PATCH

## Task Commits

1. **Task 1: mapper guards** - `b539d37` (feat, already on origin/main)
2. **Task 2: PATCH writer** - `ee12a3d` (feat)

**Plan metadata:** this file

## Files Created/Modified

- `apps/web/lib/ops/tickets-map.ts` - five statuses + staffPatchStatus (unchanged this pass)
- `apps/web/lib/ops/tickets-map.test.ts` - D-13 cases (unchanged this pass)
- `apps/web/lib/ops/tickets-write.ts` - Open/Close/Reopen only
- `apps/web/app/[locale]/(ops)/api/staff/tickets/[id]/route.ts` - reply key forwarded so rejectStaffReply fires

## Decisions Made

- Identity `closed→closed` stays ok so Close is idempotent
- `tickets.ts` not edited (GET already lists real rows)
- Hosted 12-01 already applied (`20260910152917`); not re-applied

## Deviations from Plan

None — plan executed as written. Mail send stays Phase 13.

## Issues Encountered

None.

## User Setup Required

None.

## Next Phase Readiness

Ready for 12-03.

## Self-Check: PASSED

- `tickets-write.ts` has no `insert into public.support_messages`
- `tickets-write.ts` calls `staffPatchStatus`
- requested `replied` / `responded` / `reply` key not ok
- requested `open` from open/replied/responded not ok
- route still uses `withStaff`
- `pnpm exec vitest run lib/ops/tickets-map.test.ts` exit 0

---
*Phase: 12-ticket-schema-support-mock*
*Completed: 2026-09-10*
