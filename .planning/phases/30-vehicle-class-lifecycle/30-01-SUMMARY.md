---
phase: 30-vehicle-class-lifecycle
plan: 01
subsystem: database
tags: [postgres, pgtap, rls, vehicle-classes, lifecycle]
requires: []
provides:
  - "public.ops_vehicle_class_missing(uuid): comma list photo,seats,bags,price"
  - "public.ops_vehicle_class_set_status(uuid,text,text): draft|live|retired moves, admin only"
  - "public.ops_vehicle_class_unassigned_paid_trips(uuid): Retire dialog count"
  - "app.booking_assign_refusal(uuid): the one paid/frozen rule shared by Assign and the count"
  - "ops_assign_leg raises class-retired"
  - "app.p30_assert_test_classes_gone(): decision 1 guard"
affects: [30-03, 30-04, 30-06, 30-07, 30-08, 30-09, 30-10]
tech-stack:
  added: []
  patterns: ["derived state (no column)", "audit_log id ordering for price-after-bring-back"]
key-files:
  created:
    - packages/db/supabase/migrations/20261012200000_class_lifecycle.sql
    - packages/db/supabase/migrations/20261012210000_assign_refuses_retired_class.sql
    - packages/db/supabase/tests/vehicle_class_lifecycle.test.sql
    - packages/db/supabase/tests/assign_retired_class.test.sql
  modified:
    - packages/db/database.types.ts
key-decisions:
  - "Decisions 1-6 and 9 built as signed 2026-10-12; no vehicle_classes row is written by any migration"
  - "database.types.ts merged by hand (see Not verified)"
requirements-completed: [CLS-02, CLS-04, CLS-05, CLS-06, CLS-09, CLS-14]
duration: about 2 h
completed: 2026-10-12
---

# Phase 30 Plan 01: Class lifecycle database Summary

State RPC with a shared Go-live "missing" function, Retire/Bring back with draft price-book strip and parked rows, an Assign guard for retired classes, and one paid/frozen rule shared by Assign and the Retire count, all proven in the native lab p30.

## Commits

- 8e17e476 feat(30-01): class lifecycle migration (Task 2)
- 0cfee7da feat(30-01): Assign refuses retired-class chauffeurs; shared paid/frozen rule; types (Task 3)

## Task 1 (controller checkpoint)

Satisfied by the orchestrator instruction: the controller confirmed the numbers in CLAUDE.local.md ("Phase 30 takes `20261012200000` onward"). `git ls-tree origin/main` on 2026-10-12 shows the newest main migration is `20261012190000`; nothing at or above `20261012200000`. No migration was written before this check.

## Migration files (md5)

- `20261012200000_class_lifecycle.sql` 553eb1fc1f53253512b885a30beb9ef5
- `20261012210000_assign_refuses_retired_class.sql` ecde234c29fbaa30f646ba204121a489

## Verified

- `lab.sh pgtap p30` (native stack, no Docker): PASS, Files=118, Tests=3556. `vehicle_class_lifecycle.test.sql` 84 tests ok, `assign_retired_class.test.sql` 36 tests ok; `assign_by_class`, `ops_assign_leg`, `vehicle_class_delete_hide` still ok.
- All acceptance greps of Tasks 2 and 3 pass (counts read after the final edits).
- Cases proven: Go live refused with DETAIL list (photo,seats,bags,price order), hidden-from-public price does not count (R8), old live price does not count after Bring back and a newer publish does (R3, by audit_log ids), parked draft row does not block Publish while an available unpriced one throws restrict_violation (R6), Retire with a surcharge on the city_pair rule succeeds and detaches it, frozen books untouched, audit rows per transition, dispatcher 42501, anon/authenticated no EXECUTE, empty seats/bags refused on a Live class (23514), test-classes guard raises and passes.

## Not verified

- `pnpm db:types:check` was not run. The pinned CLI 2.115.0 needs Docker for `gen types` (not used for Vamos) and failed; CLI 2.119.0 (native) generates unformatted output. `database.types.ts` was edited by hand (three new Functions entries, seats/bags/max_pax nullable in Row/Insert/Update) and checked by normalising whitespace and comparing against the 2.119 output of the lab database: the only remaining differences are version formatting noise (`NonNullable<Json>`, `'Enums'`, `never` vs `unknown`). The controller should run `db:types:check` on a default stack before ship.
- Nothing applied to any live database (files only).

## Deviations from Plan

**1. [Rule 3 - Blocking] Stack-only lab start.** `lab.sh up p30` would build and start the Workers (needs pnpm, which aborts in this worktree). A scratch copy of `lab.sh` outside the repo (`~/.vamos-scratch/p30tool/lab-stackonly.sh`) added one command that only starts the stack and seeds it; the real `lab.sh pgtap p30` then ran unchanged. No repo file changed. Lab p30 is left running for later plans.

**2. [Rule 1 - Bug] Test fixtures.** Surcharges in published books need a non-empty predicate (guard U38); fixtures use `{"lc": true}`. Plan counts set to what ran (84 and 36).

Otherwise the plan was executed as written. The `ops_assign_leg` body was lifted by script from `20261007160000_assign_by_class.sql` with the two planned changes (shared helper, `class-retired`). `app.booking_assign_refusal` returns `not-paid` for a booking with no row (cannot occur from Assign, which reads the booking first).

## Known Stubs

None.

## Threat Flags

None beyond the plan's register (T-30-01, 02, 04, 05, 05b, 07, 07b, 07c mitigated in files and pgTAP).

## Self-Check: PASSED

Files and commits 8e17e476, 0cfee7da exist.
