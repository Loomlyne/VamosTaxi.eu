---
phase: 32-auto-translate
plan: 03
subsystem: dashboard-content-removal
tags: [ops, dashboard, removal, content-strings]
requires: [32-01]
provides:
  - Dashboard Content group with Reviews only (44 px child row)
  - content-removed.test.ts guard
affects: [32-04]
key-files:
  deleted:
    - app/ops/OpsContent.dc.html
    - apps/web/app/[locale]/(ops)/api/staff/content/** (3 routes)
    - apps/web/app/api/staff/content/** (3 re-exports)
    - apps/web/app/[locale]/(ops)/ops/content/actions.ts
    - apps/web/lib/ops/content.ts
    - apps/web/tests/integration/ops-dc-content.spec.ts
    - apps/web/tests/integration/content-string-edit.spec.ts
  modified:
    - app/ops/OpsSidebar.dc.html
    - app/ops/ops.dc.html
    - app/vamos-ops-api.js
    - apps/web/lib/ops/console-paths.ts
    - apps/web/lib/ops/ops-console-paths.test.ts
    - apps/web/lib/icons/dynamic-icon-bindings.ts
    - apps/web/tests/integration/ops-dc-content-loader.spec.ts
    - docs/build/CONTENT-STRINGS-RUNBOOK.md
    - docs/build/MISSING-FEATURES.md
  created:
    - apps/web/lib/ops/content-removed.test.ts
decisions:
  - "Dictionary rows 'Pages' and 'Legal' left for plan 32-04 (owns vamos-i18n-dict.js)"
  - "Runbook release-order rule kept, reworded to rows edited outside the repository"
metrics:
  tasks: 2
  completed: 2026-10-14
---

# Phase 32 Plan 03: Remove dashboard Content Pages and Legal Summary

Content > Pages and Legal are gone from the dashboard UI, shell wiring, console paths, staff API routes, editor library, tests and runbook. Reviews stays. No table or column dropped; `lib/db/content.ts` and `lib/content/messages.ts` untouched.

## Commits
- 739d55d8: sidebar, shell, SHELL_SCREENS, console paths, icon binding, OpsContent screen deleted; sidebar Arabic site label now `موقع Vamos Taxi`
- 3b83dba5: six staff content routes, actions.ts, lib/ops/content.ts, two retired specs deleted; loader spec and runbook rewritten; guard test added

## Verification
- vitest: ops-console-paths (new /pages, /legal false, /reviews true), icon-files-exist: 16 passed
- vitest: content-removed.test.ts: 4 passed
- `pnpm --filter web typecheck`: clean; `pnpm lint`: 0 errors (6 pre-existing warnings, unrelated)
- No migration file changed by this plan
- Not run: Playwright integration specs (ops-dc-content-loader edited, needs the component-1440 project)

## Deviations from Plan
None. ops.dc.html `start` data-props options already lacked pages/legal (Phase 30), so nothing to change there.

## Known Stubs
None.

## Self-Check: PASSED
