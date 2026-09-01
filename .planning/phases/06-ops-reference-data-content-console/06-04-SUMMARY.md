---
phase: 06-ops-reference-data-content-console
plan: 04
subsystem: api
tags: [ops, fleet, chauffeurs, r2, photos, dc-mock, staff-json]

requires:
  - phase: 06-02
    provides: withStaff / jsonOk / jsonErr envelope and empty remote VamosOps collections
  - phase: 06-03
    provides: dashboard host /login staff session for credentials include
provides:
  - Dual-mounted JSON door GET/POST/PATCH/DELETE /api/staff/vehicles|chauffeurs
  - GET/PATCH /api/staff/vehicle-classes (capacities only; slug refused)
  - OpsFleet photo field POSTs /api/photos/upload and stores the R2 key
affects: [06-05, 06-08, 06-09]

tech-stack:
  added: []
  patterns:
    - Fleet/chauffeur mutations live in lib/ops write helpers; routes never import postgres
    - DC mock field names (klass, year, photo, name, licence, vehicle) map onto VehicleInput / ChauffeurInput
    - Photo display is /photos/${key} or initials fallback; never a data URI

key-files:
  created:
    - apps/web/app/[locale]/(ops)/api/staff/vehicles/route.ts
    - apps/web/app/[locale]/(ops)/api/staff/vehicles/[id]/route.ts
    - apps/web/app/[locale]/(ops)/api/staff/vehicle-classes/route.ts
    - apps/web/app/[locale]/(ops)/api/staff/chauffeurs/route.ts
    - apps/web/app/[locale]/(ops)/api/staff/chauffeurs/[id]/route.ts
    - apps/web/app/api/staff/vehicles/route.ts
    - apps/web/app/api/staff/vehicles/[id]/route.ts
    - apps/web/app/api/staff/vehicle-classes/route.ts
    - apps/web/app/api/staff/chauffeurs/route.ts
    - apps/web/app/api/staff/chauffeurs/[id]/route.ts
    - apps/web/lib/ops/fleet-write.ts
    - apps/web/lib/ops/chauffeurs-write.ts
    - apps/web/lib/ops/fleet-http.ts
    - apps/web/lib/ops/fleet-http.test.ts
    - apps/web/tests/integration/ops-dc-fleet.spec.ts
  modified:
    - apps/web/lib/ops/chauffeurs.ts
    - app/ops/OpsFleet.dc.html
    - app/ops/OpsTable.dc.html
    - app/vamos-ops-data.js

key-decisions:
  - "D-20: wrangler r2 bucket list on Vamos account e64b47deef83692806ab23279d53633e showed vamos-photos-staging present — did not create a bucket"
  - "JSON list for chauffeurs includes licence_number so OpsFleet can round-trip the mock column; React list projection still omits it"
  - "IMAGES binding already exists in wrangler.jsonc; display still uses a plain img against /photos/[key] (D-21 / D-23)"

patterns-established:
  - "Pattern: extract SQL into lib/ops/*-write.ts; (ops) route + app/api/staff re-export"
  - "Pattern: photo upload returns { key }; owning upsert stores photo_path via asStaff"

requirements-completed: [OPS-06]

duration: 22min
completed: 2026-09-01
---

# Phase 6 Plan 04: Fleet / chauffeurs JSON + R2 photos Summary

**OpsFleet talks to real fleet tables through dual-mounted `/api/staff/vehicles|chauffeurs|vehicle-classes`, and photo fields POST `/api/photos/upload` then store the R2 key — empty fleet and zero photos are the shipping state.**

## Performance

- **Duration:** 22 min
- **Started:** 2026-09-01T16:10:00Z
- **Completed:** 2026-09-01T16:32:38Z
- **Tasks:** 2
- **Files modified:** 19

## Accomplishments

- Staff JSON door for vehicles, chauffeurs, and vehicle-class capacities, re-exported at `app/api/staff/…` so the DC mock's absolute `/api/staff/vehicles` works
- Every read/write goes through `asStaff` (loaders or write helpers); routes do not import postgres
- OpsFleet photo control POSTs `/api/photos/upload` with credentials include, stores the returned key, and falls back to initials when `photo_path` is null (D-19 / D-22)
- Empty `vehicles.all()` still uses the mock empty title/body; no ZH 000 001 seed; no invented CHF

## Task Commits

1. **Task 1: JSON routes wrapping fleet + chauffeur loaders** - `de245e0` (feat)
2. **Task 2: Photo control on OpsFleet + empty-state proof** - `717f099` (feat)

**Plan metadata:** (this commit)

## Files Created/Modified

- `apps/web/app/[locale]/(ops)/api/staff/vehicles/route.ts` - GET list + POST create
- `apps/web/app/[locale]/(ops)/api/staff/vehicles/[id]/route.ts` - PATCH + DELETE
- `apps/web/app/[locale]/(ops)/api/staff/vehicle-classes/route.ts` - GET list + PATCH capacities (slug refused)
- `apps/web/app/[locale]/(ops)/api/staff/chauffeurs/route.ts` - GET list + POST create
- `apps/web/app/[locale]/(ops)/api/staff/chauffeurs/[id]/route.ts` - PATCH + DELETE
- `apps/web/app/api/staff/{vehicles,vehicles/[id],vehicle-classes,chauffeurs,chauffeurs/[id]}/route.ts` - dual re-exports
- `apps/web/lib/ops/fleet-write.ts` / `chauffeurs-write.ts` - asStaff mutations
- `apps/web/lib/ops/fleet-http.ts` - parse/present DC aliases + SQLSTATE JSON mapping
- `apps/web/lib/ops/fleet-http.test.ts` - 401, empty `[]`, data-URI reject, 23505/23503
- `apps/web/lib/ops/chauffeurs.ts` - `loadChauffeurDetailsList` for JSON licence round-trip
- `app/ops/OpsFleet.dc.html` - photo fields, four-language labels, `/api/photos/upload`
- `app/ops/OpsTable.dc.html` - `editor:'photo'` (no FileReader.readAsDataURL)
- `app/vamos-ops-data.js` - keep `photo` key, drop data URIs
- `apps/web/tests/integration/ops-dc-fleet.spec.ts` - 401, empty JSON list, non-staff 403, re-export + OpsFleet proofs

## Verification

1. Vitest `lib/ops/fleet-http.test.ts` + `staff-json.test.ts`: 24 passed (main `apps/web/node_modules/.bin/vitest`, cwd worktree `apps/web`)
2. Unauthenticated GET envelope is JSON 401 `{ ok: false, code: no-session }` (unit + spec)
3. Authenticated empty list is JSON `[]`
4. `rg` / file check: OpsFleet contains `/api/photos/upload`, does not contain `readAsDataURL`
5. No `CHF` in new staff route files; no `ZH 000 001` in this plan's store
6. D-20: `vamos-photos-staging` listed on Vamos account — no create
7. `tsc --noEmit` in the worktree failed with `TS2688` missing `@types/node` (no worktree `node_modules`; `pnpm install` forbidden) — inherited, not a product type error

## Decisions Made

- Extract mutate SQL from actions.ts into `fleet-write.ts` / `chauffeurs-write.ts` so JSON routes stay D-08-clean while 06-01 actions keep compiling
- Accept DC mock names (`klass`, `year`, `photo`, `name`, `licence`, `vehicle`) at the HTTP boundary
- Chauffeur JSON GET uses `loadChauffeurDetailsList` so the licence column round-trips; React `loadChauffeurs` still omits it
- Photo editor lives in OpsTable; OpsFleet sets `upload:'/api/photos/upload'` so the plan's rg check hits OpsFleet.dc.html
- `cleanVehicle` / `cleanChauffeur` persist `photo` so upsert does not strip the R2 key

## Deviations from Plan

### Extra files (needed for D-08 / D-19)

**1. Write helpers + HTTP parse not listed in files_modified**
- **Found during:** Task 1
- **Issue:** Copying SQL into route files would import postgres (D-08). DC field names are not VehicleInput.
- **Fix:** `fleet-write.ts`, `chauffeurs-write.ts`, `fleet-http.ts` (+ unit test)
- **Files modified:** `apps/web/lib/ops/fleet-write.ts`, `chauffeurs-write.ts`, `fleet-http.ts`, `fleet-http.test.ts`
- **Verification:** routes import helpers; vitest 24 passed
- **Committed in:** `de245e0`

**2. OpsTable + vamos-ops-data not listed in files_modified**
- **Found during:** Task 2
- **Issue:** OpsFleet forms render through OpsTable; `cleanVehicle` dropped `photo`, so the R2 key would never upsert.
- **Fix:** `editor:'photo'` in OpsTable; persist `photo` in cleaners
- **Files modified:** `app/ops/OpsTable.dc.html`, `app/vamos-ops-data.js`
- **Verification:** OpsFleet contains `/api/photos/upload`; sync-dc-mock ran
- **Committed in:** `717f099`

**Total deviations:** 2 (supporting files)
**Impact on plan:** Required for D-08 / D-19. No scope creep onto React VehicleTable or invented CHF.

## Issues Encountered

- First `wrangler r2 bucket list` after unsetting `CLOUDFLARE_ACCOUNT_ID` hit the wrong Cloudflare account. Retry with Vamos account id `e64b47deef83692806ab23279d53633e` (tokens still unset) listed `vamos-photos-staging`. Did not create a bucket.

## User Setup Required

None - no external service configuration required. Staging R2 bucket already exists.

## Next Phase Readiness

- Fleet JSON door is callable from the DC mock. Reviews can import the PHOTOS binding; do not recreate `vamos-photos-staging`.
- Live board / assign / refund stay Phase 8. No seed data was added.

## Self-Check: PASSED

- [x] `apps/web/app/api/staff/{vehicles,vehicles/[id],vehicle-classes,chauffeurs,chauffeurs/[id]}/route.ts` re-export (ops) handlers
- [x] writes go through asStaff (write helpers / loaders)
- [x] unauthenticated GET vehicles is JSON 401
- [x] no CHF in new route files
- [x] OpsFleet.dc.html contains `/api/photos/upload` and not `readAsDataURL`
- [x] empty vehicles title/body still present
- [x] ops-dc-fleet.spec.ts covers 401 and empty JSON list
- [x] `node scripts/sync-dc-mock-to-public.mjs` after HTML change
- [x] production commits `de245e0`, `717f099` exist (`git log --grep=06-04`)

---
*Phase: 06-ops-reference-data-content-console*
*Completed: 2026-09-01*
