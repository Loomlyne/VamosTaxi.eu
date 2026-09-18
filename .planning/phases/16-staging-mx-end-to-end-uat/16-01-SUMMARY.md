---
phase: 16-staging-mx-end-to-end-uat
plan: 01
subsystem: testing
tags: [resend, staffSender, vitest]

requires:
  - phase: 13-staff-apis-outbound-resend-replies
    provides: staffSender + REPLIES_DOMAIN_VERIFIED false
provides:
  - Wave 0 staffSender false-path contract
  - source-read of plus From template while const is false
affects: [16-02, 16-03]

tech-stack:
  added: []
  patterns: [source-read must-not greps]

key-files:
  created: []
  modified:
    - apps/web/lib/ops/ticket-mail.test.ts
    - apps/web/lib/ops/phase-13-must-not.test.ts

key-decisions:
  - "Did not flip REPLIES_DOMAIN_VERIFIED. 16-03 owns that after Verified."

patterns-established:
  - "staffSender false path asserted before any DNS or const flip"

requirements-completed: [INB-01, D-01, D-04]

duration: 8min
completed: 2026-09-18
---

# Phase 16: 16-01 Summary

**Wave 0 locks staff Send From `noreply@vamostaxi.site` + Reply-To plus-address while `REPLIES_DOMAIN_VERIFIED` stays false.**

## Performance

- **Duration:** 8 min
- **Started:** 2026-09-18T13:22:00Z
- **Completed:** 2026-09-18T13:24:00Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- `staffSender(TOKEN)` equals From `Vamos Taxi <noreply@vamostaxi.site>` and Reply-To `ticket+{32hex}@replies.vamostaxi.site`
- Source-read proves `REPLIES_DOMAIN_VERIFIED = false` and the true-branch From template `` `Vamos Taxi <${plus}>` ``
- D-09 still expects false; D-08 contact EMAIL unchanged

## Task Commits

1. **Task 1+2: staffSender false path + D-09 comment** - `4fddfb8` (test)

**Plan metadata:** this file

## Files Created/Modified

- `apps/web/lib/ops/ticket-mail.test.ts` — staffSender false path + source-read
- `apps/web/lib/ops/phase-13-must-not.test.ts` — comment that 16-03 owns D-09 invert

## Decisions Made

None — followed plan. Production `ticket-mail.ts` untouched.

## Deviations from Plan

None - plan executed exactly as written

## Issues Encountered

None. Vitest 20 passed (2 files) via main `apps/web` vitest binary with cwd = worktree.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

16-02 may apply Resend + Cloudflare MX on `replies.` only. Flag still false.

---
*Phase: 16-staging-mx-end-to-end-uat*
*Completed: 2026-09-18*
