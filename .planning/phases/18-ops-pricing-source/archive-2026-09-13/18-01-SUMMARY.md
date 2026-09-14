---
phase: 18-ops-pricing-source
plan: 01
subsystem: testing
tags: [vitest, D-08, D-11, D-12, D-13, D-14, D-27, D-28, D-31, nyquist]

requires:
  - phase: 18-ops-pricing-source
    provides: 18-VALIDATION.md Wave 0 sample table
provides:
  - Wave 0 D-11 kernel fixtures (start + all-km per-km + per-class bands)
  - Wave 0 D-08 completeness without min_fare_rappen
  - Wave 0 DC source-read five tabs / Publish fare book / no /coupons
affects: [18-02, 18-03, 18-04, 18-06]

tech-stack:
  added: []
  patterns:
    - Wave 0 tests name the live recipe before kernel/schema/DC rebuild
    - Dual-copy readFileSync of app/ops and apps/web/public/app/ops

key-files:
  created:
    - apps/web/lib/ops/ops-pricing-source.test.ts
  modified:
    - apps/web/lib/pricing/lines.test.ts
    - apps/web/lib/pricing/bands.test.ts
    - apps/web/lib/ops/pricing.test.ts

key-decisions:
  - "Wave 0 stays red until 18-03 / 18-02 / 18-06 turn assertions green"
  - "No production source, no migration apply, no 04.3-01-PLAN.md"

patterns-established:
  - "Nyquist: fixtures refuse DISTANCE_FLOOR_KM and min_fare as the live recipe"
  - "DC source-read uses the ops-pricing-vat-field dual-copy join(repoRoot) pattern"

requirements-completed: [D-08, D-11, D-12, D-13, D-14, D-27, D-28, D-31]

duration: 12min
completed: 2026-09-14
---

# Phase 18 Plan 01: Wave 0 kernel / completeness / DC source-read Summary

**Wave 0 Vitest fixtures name D-11 start + all-km per-km + per-class bands, D-08 completeness without min_fare, and five-tab Publish fare book DC source-read — production code unchanged.**

## Performance

- **Duration:** 12 min
- **Started:** 2026-09-13T21:50:00Z
- **Completed:** 2026-09-13T21:54:30Z
- **Tasks:** 3 completed
- **Files modified:** 4

## Accomplishments
- Rewrote live-recipe fixtures so D-11/D-12/D-13/D-14 are named before the kernel changes
- Completeness contract drops `min_fare_rappen is null`; required fields are name, start, per-km, max pax
- New dual-copy DC source-read locks five tabs, header verbs, no charcoal placeholder, no sidebar `/coupons`

## Task Commits

Each task was committed atomically:

1. **Task 1: Wave 0 kernel fixtures for D-11 recipe** - `1afa11a` (test)
2. **Task 2: Wave 0 completeness without min_fare** - `3cd6bbf` (test)
3. **Task 3: Wave 0 DC source-read five tabs and no /coupons** - `b3aabd4` (test)

**Plan metadata:** pending this commit (docs: complete plan)

## Files Created/Modified
- `apps/web/lib/pricing/lines.test.ts` - D-11 live recipe cases; numbers only
- `apps/web/lib/pricing/bands.test.ts` - per-class `vehicle_class_id` extras, no 20 km floor
- `apps/web/lib/ops/pricing.test.ts` - D-08 completeness without min_fare
- `apps/web/lib/ops/ops-pricing-source.test.ts` - dual OpsPricing + OpsSidebar source-read

## Decisions Made
None - followed plan as specified. Interrupted executor after tasks 1–2; task 3 and close-out finished on resume.

## Deviations from Plan
None - plan executed exactly as written

## Issues Encountered
Executor interrupt after task 2 (no SUMMARY). Resume completed task 3 and close-out without re-running tasks 1–2.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
18-02 can write the git migration. Kernel (18-03) and DC rebuild (18-06) turn these red assertions green. public-chf.test.ts and vat.test.ts stay green (20/20).

## Self-Check: PASSED
- key-files.created exist on disk
- `git log --grep=18-01` returns 3 task commits
- Task 1–3 acceptance_criteria all PASS
- Plan verification: `pnpm --filter web exec vitest run lib/pricing/public-chf.test.ts lib/checkout/vat.test.ts` → 20 passed
- No production source edited; no migration applied

---
*Phase: 18-ops-pricing-source*
*Completed: 2026-09-14*
