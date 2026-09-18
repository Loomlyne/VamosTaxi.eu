---
phase: 15-wire-ops-support-to-apis
plan: 01
subsystem: api
tags: [staff, tickets, patch, save, booking_ref]

requires:
  - phase: 13-staff-apis-outbound-resend-replies
    provides: patchTicket reply path + PATCH /api/staff/tickets/:id
provides:
  - Overlay Save branch on existing PATCH (phone, booking_ref, optional staff_note)
  - invalid-booking-ref refuses the entire Save
affects: [15-02, 15-03]

tech-stack:
  added: []
  patterns: [Save keys via hasOwnProperty on existing PATCH; resolveStaffBookingId before write]

key-files:
  created: []
  modified:
    - apps/web/lib/ops/tickets-write.ts
    - apps/web/lib/ops/tickets-write.test.ts
    - apps/web/app/[locale]/(ops)/api/staff/tickets/[id]/route.ts

key-decisions:
  - "Save mixed with reply/status is invalid-status before empty-reply."
  - "Store submitted booking_ref string, not the resolved uuid."

patterns-established:
  - "Overlay Save is a third patchTicket branch; Resend path untouched."

requirements-completed: [SUP-04]

duration: 20min
completed: 2026-09-18
---

# Phase 15-01: Save PATCH phone+ref+note

**Existing staff PATCH now persists overlay Save `{ phone, booking_ref, note }` without mixing into Resend reply.**

## Performance

- **Duration:** 20 min
- **Started:** 2026-09-18T03:05:00Z
- **Completed:** 2026-09-18T03:07:19Z
- **Tasks:** 3
- **Files modified:** 3

## Accomplishments

- Save writes phone + booking_ref together; empty note skips `support_messages`.
- Unknown booking_ref → `invalid-booking-ref`; no UPDATE/INSERT; no send.
- Route parses Save keys on the existing PATCH; 400 maps `invalid-booking-ref`.

## Task Commits

1. **Tasks 1–3: Save branch + route parse + vitest** — (this commit)
2. **Plan metadata:** 15-01-SUMMARY.md

## Files Created/Modified

- `apps/web/lib/ops/tickets-write.ts` — Save branch + `resolveStaffBookingId`
- `apps/web/lib/ops/tickets-write.test.ts` — overlay Save cases; reply suite kept
- `apps/web/app/[locale]/(ops)/api/staff/tickets/[id]/route.ts` — parse phone/booking_ref/note

## Decisions Made

- Empty `booking_ref` does not call `resolveStaffBookingId`.
- Mix of Save keys with `reply`/`status` is `invalid-status` even if reply is empty.

## Deviations from Plan

None - plan executed as written. Worktree vitest used main binary + emails mock (no `node_modules` in `.worktrees/phase-15`).

## Issues Encountered

Worktree has no `node_modules`; `@vamos/emails` mocked in the unit file. Vitest 14 passed.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

15-02 GET map optional files. Do not steal STATE.current. Do not park on 14.

---
*Phase: 15-wire-ops-support-to-apis*
*Completed: 2026-09-18*
