---
phase: 30-vehicle-class-lifecycle
plan: 03
subsystem: ops-server-guards
tags: [rate-book, assign, chauffeurs, class-lifecycle, retired-class]
requires:
  - phase: 30-01
    provides: hidden_at as Retired, class-retired in ops_assign_leg, nullable seats/bags/max_pax
provides:
  - "cloneRateVersionFrom skips retired classes (distance_rates, fixed_routes, distance_bands, city_pair rules); class-less bands kept"
  - "assign pre-check and route answer 409 class-retired; the RPC's own class-retired maps to the same code"
  - "insertChauffeur / updateChauffeurRow refuse a newly chosen retired class (ChauffeurInputError key class-retired)"
  - "ChangeContext.legClassRetired; date/time/party change on a retired-class trip refused with class-not-sold (preview and confirm)"
  - "Accept on a request for a retired-class trip refused with unknown-class"
  - "public rate-book mapper drops classes with empty seats/bags and rows with empty max_pax"
affects: [30-04, 30-07, 30-09, 30-10]
key-files:
  created:
    - apps/web/lib/ops/rate-book-clone-retired.test.ts
    - apps/web/lib/ops/rate-book-clone-retired.local.test.ts
    - apps/web/lib/ops/trip-change-retired-class.test.ts
    - apps/web/lib/ops/edit-accept-retired-class.test.ts
    - packages/db/supabase/tests/retired_class_in_flight.test.sql
    - .planning/phases/30-vehicle-class-lifecycle/deferred-items.md
  modified:
    - apps/web/lib/ops/rate-book.ts
    - apps/web/lib/ops/assign-map.ts
    - apps/web/lib/ops/assign.ts
    - apps/web/app/[locale]/(ops)/api/staff/bookings/[id]/assign/route.ts
    - apps/web/lib/ops/chauffeurs-write.ts
    - apps/web/lib/ops/booking-change.ts
    - apps/web/lib/ops/booking-trip-change.ts
    - apps/web/lib/ops/edit-request.ts
    - apps/web/lib/pricing/rateBook.ts
    - apps/web/lib/ops/assign-class-check.test.ts
    - apps/web/lib/ops/chauffeur-class-keep.test.ts
    - apps/web/lib/ops/booking-change-price.test.ts
    - apps/web/lib/pricing/public-board.test.ts
    - apps/web/lib/pricing/eligibility.test.ts
    - apps/web/lib/pricing/rateBook.test.ts
key-decisions:
  - "A retired class has one code per door: class-retired for Assign and chauffeur write, class-not-sold for moving a retired-class trip, unknown-class for Accept; no new copy"
requirements-completed: [CLS-06, CLS-07, CLS-08, CLS-09]
duration: about 1 h 20 min
completed: 2026-10-13
---

# Phase 30 Plan 03: Server guards for retired classes Summary

A new price book never brings a retired class back, Assign and the chauffeur write refuse one, a trip in one cannot be moved or accepted into a change, and Draft or Retired classes (and classes with empty seats or bags) are proven never to reach the public board or a quote.

## Commits

| Task | Commit | What |
|------|--------|------|
| 1 | 31d84d1e | Clone skips retired classes; public mapper drops empty seats/bags/max_pax; tests for clone, board, eligibility, mapper |
| 2 | ed430dcb | Assign: `class-retired` in NAMED and `assignClassRefusal` (after mismatch), facts read `hidden_at`, route 409 |
| 3 | 912e614a | Chauffeur write: retired class can be kept, never newly chosen |
| 4 | 01c21623 | `legClassRetired` refusal in preview/confirm, Accept pre-check, pgTAP in-flight pins, price-step pins |

## Verified

- Task 1 vitest (clone recorder, rate-book-draft, public-board, eligibility, rateBook, all of `lib/pricing`): 19 files, 292 tests pass.
- Real-database clone test `rate-book-clone-retired.local.test.ts` against lab p30: 1 passed, 0 skipped (the Live class's rate and band, the class-less band and the Live city_pair rule are copied; the retired class has no rate, band or rule).
- Task 2: assign-class-check, assign, assign-rpc-errors: 3 files, 41 tests pass.
- Task 3: chauffeur tests (6 files): 60 pass, 1 skipped (a local DB test), four new cases included.
- Task 4 vitest set (booking-change-price, trip-change-retired-class, edit-accept-retired-class, booking-trip-change, booking-change, edit-request, payment-changed, staff-hosted-pay): 8 files, 159 tests pass. Whole `lib/ops` (run once before Task 4 tests were added): 139 files pass, 13 skipped, 1672 tests.
- `lab.sh pgtap p30` after the pgTAP file: PASS, Files=119, Tests=3561; `retired_class_in_flight.test.sql` ok (5 tests), `class_change_reprice.test.sql` ok.
- `tsc --noEmit -p apps/web`: no error outside the pre-existing `TS7006` / `TS2307 (postgres)` noise of this worktree's partial node_modules.
- Acceptance greps of Tasks 1-4 pass; no migration, no copy and no `lib/pricing/types.ts` change.

## Not verified

- Nothing was run against a live database or a Worker build; no browser run. The dashboard lines for these refusals ("Retired class: pick a new one" from 30-04, the existing class-not-sold and "Could not apply edit" lines) were not exercised here.
- `lib/ops/rate-book.ts` `maxPax: number | null` flows into the dashboard store; the dashboard showing an empty count as a dash is 30-08's job.

## Deviations from Plan

**1. [Rule 1 - Bug, found not fixed] Staff reads and copies no rows of distance_bands and rate_version_rules.** On a database built from the migration files these two tables carry only RESTRICTIVE policies for `vamos_staff` (distance_rates has the permissive `_staff_all` pair; they do not), so a staff session sees none of their rows and `forkLiveRateVersion` copied zero bands and zero rules in the lab. Whether live has the same policies was not checked (live is off limits). Logged in `deferred-items.md` (D-30-03-1) for the controller; no migration written (out of this plan's files). To prove the clone SQL itself, `rate-book-clone-retired.local.test.ts` adds a permissive policy on those two tables for the length of the test and drops it afterwards (lab only, marker-role guarded).

**2. [Rule 3 - Blocking] Local DB test source book is a draft.** The plan's "live book" fixture cannot be inserted live (trigger: a rate_version is created draft and published by UPDATE) and the lab already has one live book. The test creates its own draft source book (random tag) and clones from it; the lab's live book is untouched.

**3. Test expectation updated.** `assign-class-check.test.ts` "maps the row" case now expects the new `driverClassRetired: false` field on `AssignClassFacts`.

**4. Price-step pin (b).** The booked class out of today's book returns `class-not-sold` (not `trip-data`); pinned as such. `booking-change-price.ts` unchanged.

Otherwise the plan was executed as written.

## Auth gates

None.

## Known Stubs

None.

## Threat Flags

None beyond the plan's register (T-30-11, 12, 13, 14, 14b, 14d, 42 mitigated; T-30-14c accepted and pinned by pgTAP).

## Self-Check: PASSED

Files and commits 31d84d1e, ed430dcb, 912e614a, 01c21623 exist.
