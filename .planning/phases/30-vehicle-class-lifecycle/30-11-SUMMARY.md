---
phase: 30-vehicle-class-lifecycle
plan: 11
subsystem: ops-console-client
tags: [rename, OpsChauffeurs, dc-shell, tests]
requires:
  - phase: 30-05
    provides: console served at /chauffeurs
provides:
  - app/ops/OpsChauffeurs.dc.html (renamed with git mv, content unchanged)
  - Shell, API whitelist, sitemap, icon bindings, comments and tests all name OpsChauffeurs
  - ops-dc-chauffeurs.spec.ts expecting { GET, PATCH, POST } for vehicle-classes
affects: [30-07, 30-10]
key-files:
  created: [app/ops/OpsChauffeurs.dc.html (rename), apps/web/tests/integration/ops-dc-chauffeurs.spec.ts (rename)]
  modified: [app/ops/ops.dc.html, app/ops/OpsDash.dc.html, app/pages/sitemap.dc.html, app/vamos-ops-api.js, apps/web/lib/icons/dynamic-icon-bindings.ts, apps/web/lib/ops/*.test.ts, apps/web/lib/ops/must-fix-mail.ts, apps/web/lib/ops/vehicle-seats.ts, apps/web/tests/unit/no-photo-remove-link.test.ts]
requirements-completed: [CLS-11]
completed: 2026-10-13
---

# Phase 30 Plan 11: OpsFleet to OpsChauffeurs rename Summary

The chauffeur screen is now `OpsChauffeurs.dc.html` everywhere: shell import and route flag (`isChauffeurs`, `CHAUFFEURS`), screen whitelist key (`OpsChauffeurs: 1`, one key out, one in), Dash listener (`_offChauffeurs`), sitemap dashboard links (`/chauffeurs`, `/chauffeurs/{id}`), icon bindings, comments and ten unit tests.

## Tasks

| Task | Commit | Notes |
|------|--------|-------|
| 1 atomic rename + references + unit tests | 13dde3e6 | `git mv` so history follows |
| 2 integration spec moved, DELETE expectation dropped | 9067f667 | vehicles and chauffeurs keep `PATCH, DELETE` (2 hits) |

## Verification

- `vitest run` over the 11 listed files (fleet-persist, vehicle-seats, edit-request, ops-session-lost, ops-dc-chauffeur-class, ops-dc-finalize, ops-live-data, ops-dc-u08, ops-chauffeur-desk, no-photo-remove-link, dc-mock-urls): 11 files, 225 tests pass.
- `node scripts/check-i18n-coverage.mjs`: passed (2699 keys). No new visible strings.
- Greps: `git grep OpsFleet` outside .planning/docs/archive returns only the deliberate negative assertion at `ops-chauffeur-desk.test.ts:31`; `fleet/chauffeurs` only in `console-paths.ts`, `ops-console-paths.test.ts` and the `ops.dc.html` old-path parser (3 lines); no `isFleet`, `_offFleet`, `const FLEET` in `app/ops`; `_offChauffeurs` appears 2 times in OpsDash; 0 `OpsFleet` in `vamos-ops-api.js`; the vehicle-classes route exports `{ GET, PATCH, POST }`.
- The integration spec is excluded from vitest and was edited, not run (Playwright test lab only).

## Deviations from Plan

**1. Already done before this plan** - `OpsSidebar.dc.html` (href `/chauffeurs`), `OpsSoon.dc.html` (blurb already says chauffeurs in four languages) and the OpsDash hrefs needed no edit. The `ops.dc.html` path parser already accepted `/chauffeurs`.

**2. `fleet-persist.test.ts`** - the detail-path assertion matched the old-path branch of the parser; it now matches `path.indexOf('/chauffeurs/') === 0`.

**3. Public copy** - `sync-dc-mock-to-public.mjs` does not prune; the gitignored `apps/web/public/app/ops/OpsFleet.dc.html` was deleted by hand. `OpsChauffeurs.dc.html` exists there.

## Out of scope, kept on purpose

Server library names `fleet*.ts`, the error key `fleet-seat-both-taken`, the `/fleet` forward code (30-05), and the internal screen strings `footFleet` / `footVehicles` in OpsChauffeurs (30-07 edits that screen). `archive/**` untouched.

## Known Stubs

None.

## Self-Check: PASSED

Commits 13dde3e6 and 9067f667 exist; OpsChauffeurs.dc.html present, OpsFleet.dc.html absent in repo and public copy.
