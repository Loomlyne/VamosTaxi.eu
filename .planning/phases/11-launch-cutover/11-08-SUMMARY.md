---
phase: 11-launch-cutover
plan: 08
subsystem: checkout
tags: [vat, settings, checkout, D-16, D-22]

requires:
  - phase: 11-launch-cutover
    provides: 11-07 injectable vatOnTopRappen + intent JSON vat_rate_bps
provides:
  - Staff PATCH /api/staff/settings persists vat_rate_bps
  - GET extras JSON vat_rate_bps; CheckoutClient recap uses it
affects: [11-09]

tech-stack:
  added: []
  patterns:
    - VAT bps from loadLaunchFlags / staff settings, never client-trusted quote POST

key-files:
  created: []
  modified:
    - apps/web/lib/ops/settings.ts
    - apps/web/app/[locale]/(ops)/api/staff/settings/route.ts
    - apps/web/app/api/checkout/extras/route.ts
    - apps/web/app/[locale]/checkout/CheckoutClient.tsx

key-decisions:
  - "PATCH missing vat_rate_bps uses current then 81; negative/non-finite 400"
  - "CheckoutClient fallback 81 only when extras/intent omit the field"
  - "OpsSettings.dc.html untouched — OPS Pricing rail is 11-09"
  - "Executor child timed out; orchestrator finished 11-08 inline"

patterns-established:
  - "Same integer field vat_rate_bps on extras GET and intent POST"

requirements-completed: [LAUNCH-06]

duration: 25min
completed: 2026-09-13
---

# Phase 11 Plan 08: Staff VAT PATCH + checkout display Summary

**Staff can persist vat_rate_bps; checkout recap uses extras/intent bps with fallback 81**

## Performance

- **Duration:** 25 min
- **Started:** 2026-09-13T05:00:00Z
- **Completed:** 2026-09-13T05:25:00Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments

- SettingsRow/Input + asStaff SELECT/UPDATE include vat_rate_bps
- PATCH parse integer >= 0; missing → current then 81; negative/non-finite rejected
- GET /api/checkout/extras returns vat_rate_bps via loadLaunchFlags (preferDraft false)
- CheckoutClient payment summary passes vatRateBps into vatOnTopRappen / payableWithVatRappen

## Task Commits

1. **Task 1: SettingsRow + staff PATCH vat_rate_bps** - `d97e74b` (feat)
2. **Task 2: CheckoutClient display uses injected bps** - `cbbd5ea` (feat)

**Plan metadata:** (this commit)

## Files Created/Modified

- `apps/web/lib/ops/settings.ts` - vat_rate_bps on Row/Input/SQL map
- `apps/web/app/[locale]/(ops)/api/staff/settings/route.ts` - parse + UPDATE
- `apps/web/app/api/checkout/extras/route.ts` - JSON vat_rate_bps
- `apps/web/app/[locale]/checkout/CheckoutClient.tsx` - recap + intent state

## Decisions Made

- Child executor failed (broken pipe / idle timeout). Finished inline on the phase worktree.
- Dual-mount re-export unchanged (still GET/PATCH).
- Completeness still VAT-free. No settings_versions write. No respond.ts edit.

## Deviations from Plan

None that change behavior. Orchestrator implemented after failed child.

## Issues Encountered

Executor `deleg_43328ed9` died before first write. Resume was inline, not a second tourist.

## User Setup Required

None. Hosted column apply is 11-11.

## Next Phase Readiness

11-09 can put VAT % on OpsPricing rail and PATCH vat_rate_bps / vatRateBps.
