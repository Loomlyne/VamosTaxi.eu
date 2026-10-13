---
phase: 30-vehicle-class-lifecycle
plan: 04
subsystem: ops-server-contract
tags: [vehicle-classes, route, status-rpc, draft-birth, empty-seats]
requires:
  - phase: 30-01
    provides: ops_vehicle_class_set_status, ops_vehicle_class_missing, ops_vehicle_class_unassigned_paid_trips, nullable seats/bags/max_pax
provides:
  - "GET /api/staff/vehicle-classes rows carry status, retiredReason, inLiveBook, missing (comma string), unassignedPaidTrips; empty seats/bags are null"
  - "PATCH /api/staff/vehicle-classes {id,status,reason?} through the RPC: 200 row / 409 incomplete {missing} / 409 bad-transition / 404 not-found / 403 not-admin / 400 invalid, invalid-reason"
  - "no DELETE export, no hard-delete helper, no call to ops_vehicle_class_delete_or_hide in Worker code; photo sweep is publish-only"
  - "both ADD CLASS paths create a Draft (active false) with a parked (available false) draft price row"
  - "rate-book distance save: Draft class row counts only with start fare, per-km, seats and bags (draftRowAvailable); Live keeps parsed.available; retired class answers 409 class-retired"
  - "empty seats/bags stored as null on both ADD CLASS paths; emptied only while Draft (400 otherwise, 23514 second wall)"
affects: [30-06, 30-07, 30-08, 30-09, 30-10, 30-11]
key-files:
  created:
    - apps/web/lib/ops/vehicle-class-status-http.test.ts
    - apps/web/lib/ops/vehicle-class-draft-birth.test.ts
    - apps/web/lib/ops/vehicle-class-empty-seats.test.ts
  modified:
    - apps/web/lib/ops/fleet.ts
    - apps/web/lib/ops/fleet-http.ts
    - apps/web/lib/ops/fleet-http.test.ts
    - apps/web/lib/ops/fleet-write.ts
    - apps/web/lib/ops/rate-book.ts
    - apps/web/lib/ops/vehicle-class-write.ts
    - apps/web/lib/ops/vehicle-class-write.test.ts
    - apps/web/lib/ops/class-photo-sweep.ts
    - apps/web/lib/ops/draft-vat-coupons.test.ts
    - apps/web/app/[locale]/(ops)/api/staff/vehicle-classes/route.ts
    - apps/web/app/api/staff/vehicle-classes/route.ts
    - apps/web/app/[locale]/(ops)/api/staff/rate-book/route.ts
key-decisions:
  - "The fleet* library file and function names stay (library names, not dashboard wording)"
  - "In the capacity PATCH an absent count is left as it is (not nulled); only a named null/blank empties it"
requirements-completed: [CLS-01, CLS-02, CLS-03, CLS-04, CLS-05]
duration: about 55 min
completed: 2026-10-13
---

# Phase 30 Plan 04: Class state on the server Summary

The class list now carries the server-computed state, Go-live checklist and Assign-accurate unassigned-trip count, a PATCH moves a class only through the 30-01 RPC, DELETE is gone, and every new class is a Draft with empty seats and bags and a parked price row that starts counting once he saves a price.

## Commits

- 0c4fbf6b feat(30-04): class list carries state, retired reason, live-book flag, missing list and unassigned trip count (Task 1)
- 8a724854 feat(30-04): PATCH status moves a class through the RPC; DELETE and hard-delete helpers removed (Task 2)
- 7948a82e feat(30-04): new classes are born Draft with a parked price row; saving a price makes it count (Task 3)
- ddfa2fa2 feat(30-04): seats and bags start empty on both ADD CLASS paths; emptied only while Draft (Task 4)

## Verified

- `vitest run lib/ops app` (touched areas plus the rest of ops/app): 149 files passed, 13 skipped, 1756 tests passed, 20 skipped. Includes the new `vehicle-class-status-http` (10), `vehicle-class-draft-birth` (7), `vehicle-class-empty-seats` (16) and extended `fleet-http` (30), `vehicle-class-write`, `class-photo-sweep`, `draft-vat-coupons`. `fleet-persist.test.ts` was swept in by that run and passed; 30-11 still owns it.
- `tsc --noEmit -p apps/web`: no error in any touched file. The 13 remaining lines are the pre-existing `TS7006` / `Cannot find module 'postgres'` noise (identical before the first edit).
- Grep gates: no `deleteVehicleClassIfUnreferenced`, `classDeleteReply`, `parseClassDeleteReason`, `class-deleted` or `ops_vehicle_class_delete_or_hide` in `apps/web` source; no `DELETE` in the alias route; `ops_vehicle_class_set_status(` once in fleet-write; `draftRowAvailable(` twice in the rate-book route; no `?? 0` / `?? incoming.maxPax` / `?? 3` on seats or bags.

## Not verified

- No run against a real database: the new SQL (`ops_vehicle_class_missing`, `..._unassigned_paid_trips` in the list select; `syncDraftRowToClass`; the `case when ...::boolean` capacity update) is proven by recorder tests and by 30-01 pgTAP of the functions, not by executing these statements on lab p30. 30-10's gate and the lab run should exercise them.
- Nothing deployed, nothing applied to any live database.

## Deviations from Plan

**1. [Rule 2 - Critical] Capacity PATCH leaves an unnamed count alone.** The plan says an absent count parses to null. For the dashboard's partial PATCH that would blank the other count (and used to overwrite it with 0). `parseClassCount` still returns null for absent/blank (so POST and `parseVehicleClassPatch` behave as planned), but `parseVehicleClassPatch` also returns `present`, and `updateVehicleClassCapacities` only writes (and only runs the Draft-only check on) counts the body named. Files: fleet-http.ts, fleet-write.ts, vehicle-classes/route.ts. Commit ddfa2fa2.

**2. [Rule 2 - Critical] Draft row availability follows a seat/bag change.** Plan step 3 keeps `max_pax` in step; a row left `available` with `max_pax` emptied would trip the publish guard, and a priced Draft row would stay parked after seats were set through the PATCH. `syncDraftRowToClass` sets `max_pax` from the class and `available` = start fare, per-km, seats and bags all set (the same rule as `draftRowAvailable`), for a Draft class's open draft row only. Commit ddfa2fa2.

**3. `hidden_at` already in the catalog.** `loadRateBook` already exposed `hiddenReason` (null unless retired), so the retired check uses that; the catalog query gained `active` (added to `VehicleClassRef`, optional) for the Live test. Commit 7948a82e.

**4. Types.** `DistanceRateInput.maxPax` is `number | null` and `parseDistanceInput` no longer defaults seats to 1 (decision 6). `assertDistanceRateInput` accepts null. The Pricing server action in `ops/pricing/[versionId]/actions.ts` compiles unchanged.

Otherwise the plan was executed as written. No existing `fleet-http.test.ts` case expected the old `?? 0` behaviour.

## Notes for later plans

- The dashboard (30-06/08) must send `maxPax` and `maxBags` on every Pricing save of a Live class: a blank now answers 400 `invalid` (before, seats silently became 1 and bags copied seats). Its row edit at OpsPricing.dc.html:1659-1660 still falls back to 3.
- Deferred-items D-30-03-1 (staff sessions see no rows in distance_bands / rate_version_rules on a migration-built DB) was not touched; none of the tests here depend on a staff read of those tables.

## Known Stubs

None.

## Threat Flags

None beyond the plan's register (T-30-15..20c mitigated in code and tests; T-30-18 by grep gate).

## Self-Check: PASSED

Files and commits 0c4fbf6b, 8a724854, 7948a82e, ddfa2fa2 exist.
