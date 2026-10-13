---
phase: 30-vehicle-class-lifecycle
plan: 10
subsystem: landing
tags: [merge-main, full-gates, clean-clone, lab-brief, hand-over]
requires:
  - phase: 30-01..30-09, 30-11
    provides: every Phase 30 change
provides:
  - .planning/phases/30-vehicle-class-lifecycle/30-HANDOVER.md
  - .planning/phases/30-vehicle-class-lifecycle/30-TEST-BRIEF.md
  - .planning/phases/30-vehicle-class-lifecycle/evidence/RESULT.md
  - packages/db/supabase/migrations/20261012220000_edit_request_retired_class.sql (gate fix)
affects: [controller ship]
requirements-completed: [CLS-14]
completed: 2026-10-13
---

# Phase 30 Plan 10: Merge, full gates, lab brief, hand-over Summary

Branch current with `origin/main` (`71e3b326`, merged in `440e05eb`), full gates green once in a clean clone at `d2040ff0`, the lab brief run in four passes with two 30-08 defects found and fixed, and the hand-over written for the controller.

## Commits (30-10 and the fixes it made)

- `ba8cf2a7` dead Phase 30 strings swept; `003bb16b` CLS-01..14 recorded, INT-08 superseded; `7783b51b` no-glow lines in four ops files (Task 1)
- `91c038dc` fences: no module-scope Set in console-paths (30-05), no `sql.unsafe` in the clone test (30-03)
- `3634855f` dynamic icon bindings (Retired chevron, Go live checklist; sun/moon gone)
- `c23c7800` (30-03) Accept's retired-class check through `public.booking_edit_request_class_retired` (third migration `20261012220000`, md5 `e91b66e982c950788c2ad7b57e07a755`, pgTAP `edit_request_retired_class.test.sql`): `asSystem` has no table grants, the old raw read would have failed every paid edit Accept on live with 42501
- `e115ec8e` (30-08) Go live dialog re-reads the class rows when it opens and after Publish
- `774be80a` (30-08) focus returns to the class row after Go live
- `cba508ed`, `1b733640`, `8c600226`, `15fe4bf4`, `0064cfbc`, `63940216` brief and lab setup; `d2040ff0` lab evidence and logs

## Gates

- pgTAP, lab p30: `PASS | pgtap | Files=119, Tests=3561` (16:52, before the third migration); `PASS | pgtap | Files=120, Tests=3574` after `c23c7800` (worker-deep run, with `PASS | dbtests | 76/76, 11/11 + 40/40`).
- Clean clone at `d2040ff0`, `evidence/logs/clean/`: `gate exit=0 2026-10-13 18:30:26 +0400` (apps/web 6162 passed / 53 skipped, packages/db 14, emails 293, dbtests PASS); `vitest-extra exit=0 18:30:28` (20 passed); `opennext exit=0 18:34:18`.
- Earlier red runs and their Phase 30 fixes: `evidence/logs/gate.log`, `logs/clean-run1/`; `logs/clean-run2/` green at `c23c7800`.
- Types: normalised compare only (`evidence/types/normalised-diff.txt`, CLI-version noise); `db:types:check` with the pinned CLI needs Docker, not run.
- The worktree itself cannot run the OpenNext build: its `node_modules` are links into the main checkout and the bundle fails on `sharp`.

## Lab brief

`30-TEST-BRIEF.md`, 18 rows, lab `p30c` from the clean clone (destroyed after). `evidence/RESULT.md`: 16 PASS (S2b and S3 after the two fixes above), S9 and S10 PASS with notes, S16 not verified in the browser (setup trip has no saved price record; pinned by `trip-change-retired-class.test.ts`). The lab helper `dashboardSignIn` predates the email-link login; the brief signs in through `/api/auth`.

## Deviations

- Third migration added (gate finding, money path); the hand-over orders it after the two planned ones.
- Gates and the lab ran from a clean clone instead of the worktree (linked `node_modules`).

## Not verified

Anything on live; the 4242 payment after deploy; `db:types:check`; S16 in a browser; D-30-03-1 live policies; `ops-dc-chauffeurs.spec.ts` (Playwright); the screenshots by eye (Koss's UAT).
