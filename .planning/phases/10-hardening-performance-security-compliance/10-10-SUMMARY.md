---
phase: 10-hardening-performance-security-compliance
plan: 10
subsystem: docs
tags: [runbook, launch-07, launch-04, supabase-restore]

requires:
  - phase: 10-hardening-performance-security-compliance
    provides: Wave 5 WAF sitting notes (10-09); live Ops refund/resend/assign already shipped
provides:
  - docs/runbook/ English click-paths for Refund, Resend voucher, Assign driver
  - Copy-only restore runbook; live Zurich never the target
  - README link to docs/runbook/
affects: [LAUNCH-04, LAUNCH-07]

tech-stack:
  added: []
  patterns:
    - Customer/ops runbook lives in docs/runbook/ (singular), not docs/runbooks/
    - Restore is copy/new project only; yaumjzvylngfjhtuffqs is source identity never target

key-files:
  created:
    - docs/runbook/refunds.md
    - docs/runbook/resend-email.md
    - docs/runbook/manual-assignment.md
    - docs/runbook/restore-database.md
  modified:
    - README.md

key-decisions:
  - "Task 1–2 only this sitting: runbooks committed; Task 3 still owner (no Supabase restore click)"
  - "Live Ops buttons documented as they are: Refund, Resend voucher, Assign driver / Reassign / Unassign"
  - "Must-nots: no screenshots, no invented CHF, no fake chauffeur names, no sample TRIP/LX1234, no pg_dump, no wipe of Zurich"

patterns-established:
  - "docs/runbook/ is the LAUNCH-07 path; docs/runbooks/ (stripe/quote) is left alone"
  - "LAUNCH-04 is complete only after the owner copy-restore resume (or explicit skip, which is not done)"

requirements-completed: [LAUNCH-04, LAUNCH-07]

duration: 2min
completed: 2026-09-12
---

# Phase 10 Plan 10: Ops runbook + copy restore Summary

**English `docs/runbook/` click-paths for Refund, Resend voucher, Assign driver, and restore onto a copy. Task 3 (practice restore) still owner — LAUNCH-04 restore drill is not live.**

## Performance

- **Duration:** 2 min
- **Started:** 2026-09-12T15:43:21Z
- **Completed:** 2026-09-12T15:45:19Z
- **Tasks:** 2/3 (Task 3 still owner)
- **Files modified:** 5

## Accomplishments

- `docs/runbook/refunds.md` — **Refund** on a cancelled booking at dashboard.vamostaxi.site; expected **Refund due** then **Refund issued**
- `docs/runbook/resend-email.md` — live button **Resend voucher**; expected toast **Voucher re-sent to**
- `docs/runbook/manual-assignment.md` — **Assign driver** / **Reassign** / **Unassign**; vehicle comes with the chauffeur; no invented names
- `docs/runbook/restore-database.md` — title restore onto a copy / new project; abort if target ref is `yaumjzvylngfjhtuffqs`; photos stay on live R2; no PITR unless owner says so; no pg_dump
- README **Ops runbook** section links `docs/runbook/`; support **info@vamostaxi.site** and **+41 79 626 70 82**
- Did not write into `docs/runbooks/`. Did not click restore. Did not wipe Zurich. Did not deploy.

## Task Commits

1. **Task 1: Refund, resend, assign runbooks + README link** - `d106237` (docs)
2. **Task 2: Restore-onto-a-copy runbook** - `3685f9b` (docs)
3. **Task 3: Owner practice restore on a copy** - still owner. Agent did not open Supabase restore. Agent did not pass project ref as a restore target.

**Plan metadata:** (this commit)

## Files Created/Modified

- `docs/runbook/refunds.md` - Refund clicks on live Ops
- `docs/runbook/resend-email.md` - Resend voucher clicks
- `docs/runbook/manual-assignment.md` - Assign driver clicks
- `docs/runbook/restore-database.md` - Copy restore clicks
- `README.md` - link to docs/runbook/

## Decisions Made

- Followed plan as specified for Tasks 1–2. Stopped before Task 3 (blocking human-action).
- `requirements-completed` copies PLAN frontmatter `[LAUNCH-04, LAUNCH-07]`. LAUNCH-07 docs are in tree. LAUNCH-04 is **not** complete until Task 3 resume (`done`). Do not report the drill as done.

## Deviations from Plan

None - plan executed exactly as written for Tasks 1–2. Task 3 left for the owner.

**Total deviations:** 0
**Impact on plan:** None.

## Issues Encountered

None

## User Setup Required

**Task 3 still owner.** Follow `docs/runbook/restore-database.md` yourself:

1. Create/restore into a NEW Supabase project (a copy).
2. If the target ref is yaumjzvylngfjhtuffqs, abort.
3. Do not buy PITR unless you decide to this sitting.
4. Do not pg_dump onto this Mac.
5. Photos stay on live R2 — do not copy/delete R2.
6. One drill is enough (D-41).
7. Tell the agent only: copy project ref (the NEW one) and that live Zurich was untouched.

Type `done` when the copy restore finished, or `skip` to defer the drill (LAUNCH-04 stays incomplete).

## Next Phase Readiness

- LAUNCH-07 docs are in tree. Do not treat LAUNCH-04 as done.
- Agent must not click restore. Live Zurich stays.

## Self-Check: PASSED

- Four files under `docs/runbook/`
- README grep `docs/runbook`
- python restore-database.md asserts (`yaumjzvylngfjhtuffqs`, copy/new project, R2/photos)
- git log contains Task 1 `d106237` and Task 2 `3685f9b`
- Task 3 not executed

---
*Phase: 10-hardening-performance-security-compliance*
*Completed: 2026-09-12 (Tasks 1–2 only; Task 3 still owner)*
