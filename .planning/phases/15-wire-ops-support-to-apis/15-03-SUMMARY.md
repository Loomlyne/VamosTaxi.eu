---
phase: 15-wire-ops-support-to-apis
plan: 03
subsystem: ui
tags: [dc, support, save, badge, hydrate]

requires:
  - phase: 15-wire-ops-support-to-apis
    provides: Save PATCH + files JSON
provides:
  - Live overlay Save labels + persistTicket
  - New+Responded badge, focus hydrate, files in bubble
affects: []

tech-stack:
  added: []
  patterns: [dual-DC writer then sync-dc-mock-to-public]

key-files:
  created:
    - apps/web/lib/ops/phase-15-dc.test.ts
  modified:
    - app/ops/OpsSupportTicket.dc.html

key-decisions:
  - "Empty note still Save (phone+ref). noteOff is overlay-closed or sending."
  - "Public copy is gitignored; sync script still ran."

patterns-established:
  - "Save is persistTicket PATCH; no optimistic note bubble."

requirements-completed: [SUP-01, SUP-03, SUP-04, SUP-05]

duration: 15min
completed: 2026-09-18
---

# Phase 15-03: DC Save + badge + files

**#support overlay Save is a live PATCH; badge is New+Responded; focus hydrates; files sit in the bubble.**

## Performance

- **Duration:** 15 min
- **Tasks:** 3
- **Files modified:** 2 tracked (+ generated public copy)

## Accomplishments

- T.saveNote = Save / Speichern / Enregistrer / حفظ.
- persistTicket `{ phone, booking_ref, note }`.
- publishBadge counts new + responded. visibilitychange + focus hydrate. No setInterval.
- Dual-DC sync ran; `apps/web/public/app/` is gitignored.

## Deviations from Plan

Public copy not staged (gitignore). Writer + phase-15-dc.test.ts committed.

## User Setup Required

None.

## Next Phase Readiness

Phase 15 execute 3/3 on `gsd/phase-15-wire-ops-support-to-apis`. UAT/ship not this sitting unless named.

---
*Phase: 15-wire-ops-support-to-apis*
*Completed: 2026-09-18*
