---
phase: 08-ops-dispatch-live-board-assignment-account-surfaces
plan: 03
subsystem: ui
tags: [ops, fleet, chauffeurs, default-vehicle-id, persist]

requires:
  - phase: 08-01
    provides: D-10 path URLs including /fleet, /fleet/chauffeurs, /fleet/chauffeurs/{id}
provides:
  - Fleet Save round-trip persists chauffeur.default_vehicle_id
  - restCollection pickRows/save consume object json.data and wait for HTTP ok
  - Chauffeur detail /fleet/chauffeurs/{id} = profile + read-only live trips
affects: [08-04, 08-09, 08-UAT]

tech-stack:
  added: []
  patterns: [object json.data is one row, fail closed on non-uuid fleet ids]

key-files:
  created:
    - apps/web/lib/ops/fleet-persist.test.ts
  modified:
    - app/vamos-ops-data.js
    - app/ops/OpsFleet.dc.html
    - app/ops/ops.dc.html

key-decisions:
  - "save()/upsert()/update() return the PATCH/POST promise and replace the row from object json.data"
  - "Missing or non-uuid chauffeur/vehicle ids fail closed — never mint c-/v- for PATCH"
  - "readPath key for chauffeur detail is route chauffeurs + detailId (not a new route name)"
  - "Vehicle workshop (off-road) does not auto-cancel or null assignments; must-fix email is 08-09"

patterns-established:
  - "Pattern 1: pickRows — if json.data is a non-array object, treat as one row"
  - "Pattern 2: Fleet onSave sends vehicle uuid as vehicle and defaultVehicleId, then waits for ok"

requirements-completed: [OPS-03]

duration: 10min
completed: 2026-09-10
---

# Phase 8 Plan 03: Fleet Save persist + chauffeur detail Summary

**Fleet Save is a round-trip: `default_vehicle_id` survives reload; `/fleet/chauffeurs/{id}` is profile plus read-only trips — assign stays on trip detail**

## Performance

- **Duration:** 10 min
- **Started:** 2026-09-10T16:22:17Z
- **Completed:** 2026-09-10T16:32:35Z
- **Tasks:** 4/4
- **Files modified:** 4 (fleet-http.ts and chauffeurs-write.ts already mapped vehicle → defaultVehicleId; no rewrite)

## Accomplishments

- `save()` waits for HTTP ok (no longer emit-only `return list.slice()`). `pickRows` treats object `json.data` as one row and `afterWrite` replaces by id
- `cleanChauffeur` / `cleanVehicle` no longer mint `id("c")` / `id("v")`; non-uuid ids fail closed before PATCH
- OpsFleet `onSave` upserts `vehicle` + `defaultVehicleId` uuids and waits; workshop off-road does not cancel trips
- `readPath('/fleet/chauffeurs/{id}')` → `{ route: 'chauffeurs', detailId }`; page is profile + read-only live trips; empty email shows cannot-assign copy (D-52)

## HTTP wait

**`save()` waited on HTTP.** `restCollection.save(rec)` calls `upsert` → `update`/`add`, which `return api(...).then(...)`. OpsFleet `onSave` returns that promise and only treats success when `json.ok === true`.

## Chauffeur detail route key

`readPath` key used: **`route: 'chauffeurs'`** with **`detailId`** from the single path segment after `/fleet/chauffeurs/`. Ops shell passes `chauffeur-id="{{ chauffeurId }}"` into `OpsFleetBoard`. Not a separate `route: 'chauffeur-detail'`.

## Task Commits

1. **Task 1: restCollection save/pickRows consume object json.data** - `a8117a3` (feat)
2. **Task 2+3: OpsFleet onSave + chauffeur detail /fleet/chauffeurs/{id}** - `3d6b6ed` (feat)
3. **Task 4: fleet persist file proofs** - `5c617c1` (test)

**Plan metadata:** (this commit)

## Files Created/Modified

- `app/vamos-ops-data.js` - object `pickRows`; save/upsert wait; no c-/v- mint; `defaultVehicleId` on chauffeur; booking assigned ids pass-through
- `app/ops/OpsFleet.dc.html` - onSave waits; vehicle uuid persist; chauffeur name links; detail profile + live trips; off-road notice
- `app/ops/ops.dc.html` - `chauffeur-id` prop from `readPath` detailId
- `apps/web/lib/ops/fleet-persist.test.ts` - file proofs (4)

## Decisions Made

- HTTP door already maps `vehicle` → `defaultVehicleId` — do not rewrite SQL write or add a second fleet API
- New strings stay in OpsFleet `T` (EN/DE/FR/AR), same as existing fleet copy — not `vamos-i18n-dict.js`
- Off-road = vehicle `workshop`; bookings untouched (08-09 email)

## Deviations from Plan

None. `fleet-http.ts` and `chauffeurs-write.ts` listed in `files_modified` were already correct; left unchanged.

## Issues Encountered

None

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Ready for 08-04 (assign). Do not deploy. Must-fix off-road email is 08-09. Owner pixel pass is 08-UAT.

## Self-Check: PASSED

- Vitest `lib/ops/fleet-persist.test.ts`: 4 passed (4); `ops-live-data.test.ts` still 14 passed
- `save:` is not emit-only; `pickRows` accepts object `json.data`; no `id("c")`/`id("v")` mint
- No `function emptyBookings`; no `location.hash` in OpsFleet; no Assign on chauffeur detail
- `parseChauffeurBody` still maps `vehicle` → `defaultVehicleId`
- No Hyperdrive, no deploy, no npm install

---
*Phase: 08-ops-dispatch-live-board-assignment-account-surfaces*
*Completed: 2026-09-10*
