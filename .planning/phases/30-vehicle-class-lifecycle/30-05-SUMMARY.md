---
phase: 30-vehicle-class-lifecycle
plan: 05
subsystem: ops-console-routing
tags: [middleware, dashboard, chauffeurs, redirect]
requires:
  - phase: 30-01
    provides: signed decision 7, 7b (no "fleet" in the dashboard address)
provides:
  - Console served at /chauffeurs and /chauffeurs/<id>
  - /fleet, /fleet/chauffeurs, /fleet/chauffeurs/<id> forward 307 private no-store for signed-in staff
  - Console path rules in one unit-tested module
affects: [30-07, 30-11]
key-files:
  created: [apps/web/lib/ops/console-paths.ts, apps/web/lib/ops/ops-console-paths.test.ts]
  modified: [apps/web/middleware.ts, apps/web/lib/dc-mock-urls.ts, apps/web/lib/dc-mock-urls.test.ts, apps/web/tests/unit/ops-dashboard-host.test.ts]
requirements-completed: [CLS-11]
duration: 10min
completed: 2026-10-12
---

# Phase 30 Plan 05: Chauffeurs console path Summary

The dashboard console now answers at `/chauffeurs` (and `/chauffeurs/<id>`); the old `/fleet` addresses forward there with a 307 and `Cache-Control: private, no-store`, only for signed-in staff. The path rules moved out of `middleware.ts` into `apps/web/lib/ops/console-paths.ts` (`isOpsConsolePath`, `normalizeDashboardPath`, `legacyChauffeursPath`, `OPS_CONSOLE_EXACT`).

## Task

| Task | Commit | Notes |
|------|--------|-------|
| 1 console paths module, middleware, API redirect | 9896e32d | forward added in the ops-changes branch and the signed-in branch; signed-out requests (including `/fleet` paths) already fall to `/login`, so nothing was added there and the route is not confirmed to strangers |

## Verification

`vitest run lib/ops/ops-console-paths.test.ts lib/dc-mock-urls.test.ts tests/unit/ops-dashboard-host.test.ts`: 3 files, 35 tests, all pass. Grep gates: no `isOpsConsolePath` function in middleware, no `"/fleet` string in middleware, `legacyChauffeursPath` used 3 times in middleware, `"/chauffeurs"` once in dc-mock-urls.ts.

## Deviations from Plan

**1. [Rule 3 - Blocking] Pin test count** - `tests/unit/ops-dashboard-host.test.ts` pinned exactly 4 `dashboardRedirect(` calls in the dashboard middleware body; the two new forwards make it 6. Updated the count with a comment. File was not in the plan's list.

**2. Import style** - middleware.ts uses relative imports throughout (no `@/` alias), so it imports `./lib/ops/console-paths`, not `@/lib/ops/console-paths` as the key_links pattern says. Behaviour identical.

**3. Signed-out rule** - the plan asked to extend the signed-out check with `legacyChauffeursPath`; the existing code has no per-path signed-out check (every non-console visitor goes to `/login`), so no extension was needed.

## Not verified

Not run on a built Worker; middleware branches are covered by the source pin test and the module unit test only. `ops-dc-chauffeur-class.test.ts` and `fleet-persist.test.ts` still mention `/fleet/chauffeurs` (DC rename, plan 30-11). The chauffeur API redirect stays 308 as before (`redirectTo` helper), only the target changed.

## Known Stubs

None.

## Self-Check: PASSED

Files created exist; commit 9896e32d exists on branch phase-30-vehicle-class-lifecycle.
