---
phase: 18-ops-pricing-source
plan: 02
subsystem: database
tags: [supabase, D-08, D-14, D-19, D-20, D-22, D-34, D-40]

requires:
  - phase: 18-ops-pricing-source
    provides: 18-01 Wave 0 D-08 completeness without min_fare
provides:
  - Git migration 20260913180000_ops_pricing_source.sql
  - Hosted yaumjzvylngfjhtuffqs bands-per-class, D-08 trigger, versioned coupons, draft columns
  - pgTAP publish tests without min_fare_rappen
affects: [18-03, 18-04, 18-05, 18-08]

tech-stack:
  added: []
  patterns:
    - Owner "apply" override: supabase db query --linked --project-ref, never db push, never restore
    - MCP/hosted stamp names ≠ git filename

key-files:
  created:
    - packages/db/supabase/migrations/20260913180000_ops_pricing_source.sql
  modified:
    - packages/db/supabase/tests/rate_version_publish.test.sql

key-decisions:
  - "Owner said apply — db query --linked --project-ref yaumjzvylngfjhtuffqs -f that one file"
  - "No restore, no supabase db push, no public_chf flip, no live fare seed"
  - "Hosted already had split MCP stamps ops_pricing_source_bands/cols_rules/fns; this sitting re-applied the git file (idempotent)"

patterns-established:
  - "Hosted proof is SELECT readback, not types:check"

requirements-completed: [D-08, D-14, D-19, D-20, D-22, D-33, D-34]

duration: 20min
completed: 2026-09-14
---

# Phase 18 Plan 02: Git migration + owner apply Summary

**Hosted Zurich has per-class bands and D-08 completeness without min_fare. `public_chf` is still false. Live remains rate_versions id 5.**

## Performance

- **Duration:** 20 min
- **Started:** 2026-09-13T21:55:00Z
- **Completed:** 2026-09-13T22:10:00Z
- **Tasks:** 3
- **Files modified:** 2 in git (SQL + pgTAP). Hosted apply via Management API.

## Accomplishments

- Git file `packages/db/supabase/migrations/20260913180000_ops_pricing_source.sql` (`8002bb4`)
- pgTAP no longer requires `min_fare_rappen` (`815a19a`)
- Owner line “You go ahead and apply it” — `supabase db query --linked --project-ref yaumjzvylngfjhtuffqs -f` that one file. Exit 0.
- Pre-existing hosted stamps: `ops_pricing_source_bands` `20260913212851`, `ops_pricing_source_cols_rules` `20260913212919`, `ops_pricing_source_fns` `20260913213003` (MCP versions ≠ git `20260913180000`)
- Readback: `settings.public_chf=false`, `vat_rate_bps=81`, live id 5 only, 95 classed bands / 0 unclassed, trigger does not mention `min_fare_rappen`, `quote_rate_book(false)->>'public_chf' = false`
- No restore. No `db push`. No Publish. Stripe still test.

## Task Commits

1. **Task 1: Write ops_pricing_source.sql in git** - `8002bb4` (feat)
2. **Task 2: pgTAP publish tests drop min_fare** - `815a19a` (test)
3. **Task 3: Numbered owner apply on Zurich** — this SUMMARY (docs)

**Plan metadata:** pending this commit

## Files Created/Modified

- `packages/db/supabase/migrations/20260913180000_ops_pricing_source.sql` — additive fare-book schema
- `packages/db/supabase/tests/rate_version_publish.test.sql` — D-08 without min_fare

## Decisions Made

- Owner “You go ahead and apply it” is the 18-02 resume. Apply that one file, then SELECT readback.
- Do not invent CHF. Live id 5 is not the flip.

## Deviations from Plan

- PLAN text said agent never `apply_migration` / `db push`. Owner “apply” override: Management API `db query --linked --project-ref` on `yaumjzvylngfjhtuffqs` only, then readback. Same pattern as 11-11.
- Hosted already had the objects from three earlier MCP stamps; re-apply of the git file was idempotent (`IF NOT EXISTS` / `CREATE OR REPLACE`).

## Issues Encountered

None that blocked apply. `quote_lock_minutes` on live id 5 is null — no invented hours.

## User Setup Required

None for 18-02. Public CHF stays `CHF 000` until owner Publish (11-12 / 18-10). Stripe stays test.

## Next Phase Readiness

18-03 can rewrite the kernel to D-11. Schema lockstep is on Zurich. Do not flip `public_chf`.

## Self-Check: PASSED

- Git migration file exists; non-comment SQL has no `public_chf = true`
- Hosted readback: `public_chf=false`, live id 5, bands classed, trigger without min_fare
- No restore / no `db push`
- `git log --grep=18-02` has task commits

---
*Phase: 18-ops-pricing-source*
*Completed: 2026-09-14*
