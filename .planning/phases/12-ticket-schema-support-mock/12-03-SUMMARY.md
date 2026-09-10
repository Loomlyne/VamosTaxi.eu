---
phase: 12-ticket-schema-support-mock
plan: 03
subsystem: ui
tags: [ops, support, dc, kanban]

requires:
  - phase: 12-01
    provides: five-status schema
  - phase: 12-02
    provides: GET/PATCH Open Close Reopen
provides:
  - five-column OpsSupportTicket board
  - sidebar New badge default 0
affects: [13, 14]

tech-stack:
  added: []
  patterns: [DC hydrate GET then PATCH; no drag; no fixtures]

key-files:
  created: []
  modified:
    - app/ops/OpsSupportTicket.dc.html
    - app/ops/OpsSidebar.dc.html

key-decisions:
  - "Open PATCH only when current.status === 'new'. Overlay on other statuses does not PATCH."
  - "Send does not PATCH. Staff reply is Phase 13."
  - "GET fail is an error banner. Zero tickets still shows five empty columns."

patterns-established:
  - "After successful Open/Close/Reopen PATCH, hydrate GET again. No poll."

requirements-completed: [SUP-02, SUP-01, SUP-04, SUP-05]

duration: 10min
completed: 2026-09-10
---

# Phase 12 Plan 03: #support DC Summary

**Five-column Support board on `#support`. Real GET rows. Open / Close / Reopen only. No drag, no fixtures.**

## Performance

- **Duration:** 10 min
- **Started:** 2026-09-10T17:32:00Z
- **Completed:** 2026-09-10T17:33:30Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- STATUSES include responded; five kanban columns; phone stays table
- Cards: name, email, when, ref/locale chips; no quote preview, no grip
- Search + one-status table with phone + status label
- Close/Reopen hydrate; Open-on-new fail keeps overlay and reverts to New
- T.en/de/fr/ar: Responded, Reopen, GET error; Closed copy no longer says inbound never reopens
- Sidebar `supportNew` default 0 (already on origin)
- Re-execute restored the DC after mail land had put drag/preview/4 columns back on origin/main

## Task Commits

1. **Task 1: Five-column board** - `02b4682` (feat)
2. **Task 2: Sidebar New badge default 0** - `2823e74` (feat, already on origin/main)

**Plan metadata:** this file

## Files Created/Modified

- `app/ops/OpsSupportTicket.dc.html` - five-column real-data board
- `app/ops/OpsSidebar.dc.html` - badge default 0 (unchanged this pass)

## Decisions Made

- Overlay status is a chip, not a five-way setter
- Public `apps/web/public` copies not patched
- STATE current phase unchanged (Phase 12 is parallel)

## Deviations from Plan

None — plan executed as written. Send stays a no-op until Phase 13.

## Issues Encountered

None.

## User Setup Required

None. Deploy `#support` only if owner says **deploy**.

## Next Phase Readiness

Phase 12 plans 01–03 complete on `gsd/phase-12-ticket-schema-support-mock`. Ready for UAT, not ship.

## Self-Check: PASSED

- responded in STATUSES; no draggable; no data-quote
- persistTicket payloads are status open or closed only
- openTicket PATCHes only when new
- Reopen only from closed
- hydrate() after successful PATCH
- T.en/de/fr/ar define responded and reopen
- showKanban when tickets.length === 0 and !loadError
- supportNew initial 0; key support; no key staff

---
*Phase: 12-ticket-schema-support-mock*
*Completed: 2026-09-10*
