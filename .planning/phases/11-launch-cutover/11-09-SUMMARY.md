---
phase: 11-launch-cutover
plan: 09
subsystem: ui
tags: [ops, pricing, vat, dc, D-16, D-22]

requires:
  - phase: 11-launch-cutover
    provides: 11-08 staff PATCH vat_rate_bps
provides:
  - VAT % Input on OpsPricing sticky rail
  - Four-language vatLabel / vatSuffix / vatError
  - PATCH { vat_rate_bps } only (8.1 → 81)
affects: [11-11, 11-12]

tech-stack:
  added: []
  patterns:
    - Dual DC: edit app/ops canonical; public/app is gitignored generated

key-files:
  created: []
  modified:
    - app/ops/OpsPricing.dc.html

key-decisions:
  - "Field on sticky rail, not a fourth pane, not completeness"
  - "Default display 8.1 from 81 bps; no 7.7"
  - "PATCH body is only vat_rate_bps so company/email are not blanked"
  - "apps/web/public/app is gitignored — copy on disk for Wave 0 test; not committed"

patterns-established:
  - "percent × 10 → vat_rate_bps integer"

requirements-completed: [LAUNCH-06]

duration: 20min
completed: 2026-09-13
---

# Phase 11 Plan 09: VAT % on OpsPricing rail Summary

**OPS Pricing sticky rail has a VAT percent Input (default 8.1), four languages, PATCH vat_rate_bps only**

## Performance

- **Duration:** 20 min
- **Started:** 2026-09-13T06:00:00Z
- **Completed:** 2026-09-13T06:20:00Z
- **Tasks:** 2
- **Files modified:** 1 committed (canonical DC); public copy generated/ignored

## Accomplishments

- Input on `data-price-rail` with `--vt-*` only; PANES still routes/distance/surcharges
- T.en/de/fr/ar vatLabel, vatSuffix, vatError
- GET settings hydrates vatRateBps; PATCH `{ vat_rate_bps }` after percent × 10
- `ops-pricing-vat-field.test.ts` 3/3 green

## Task Commits

1. **Task 1+2: VAT field + four-language PATCH** - `8fbde57` (feat)

**Plan metadata:** (this commit)

## Files Created/Modified

- `app/ops/OpsPricing.dc.html` - VAT field, T dict, loadVat/patchVat

## Decisions Made

- Public copy is gitignored (`apps/web/public/app/`). Test copy exists on disk in the worktree. Do not `git add -f`.

## Deviations from Plan

- One commit for both tasks (same two HTML files).
- Orchestrator implemented after 11-08 child timeout.

## Issues Encountered

None.

## User Setup Required

Hosted `vat_rate_bps` column is 11-11.

## Next Phase Readiness

11-11 owner apply of `20260913000001_launch_public_chf_vat.sql`. Then wait. Do not Publish in the same sitting.
