---
phase: 06-ops-reference-data-content-console
plan: 12
subsystem: ops
tags: [vehicles, vehicle-classes, OpsPhotoField, asStaff, next-intl, 23503]

requires:
  - phase: 06-03
    provides: ops shell, host gate, staff session
  - phase: 06-04
    provides: staff sign-in / MFA, ops fixtures, asStaff
  - phase: 06-06
    provides: OpsPhotoField, photoUrl, R2 photo prefixes
provides:
  - Write-free fleet reader (vehicles + vehicle_classes) via asStaff NOCACHE
  - /ops/vehicles fleet + classes console with Server Actions
  - Zero-photo fallback (D-22); 23503 class-has-vehicles mapping
affects: [06-13 drivers, public quote class clamp]

tech-stack:
  added: []
  patterns: [write-free lib/ops reader, mutations in route actions.ts, ADR-012 explicit class label map]

key-files:
  created:
    - apps/web/lib/ops/fleet.ts
    - apps/web/app/[locale]/(ops)/ops/vehicles/page.tsx
    - apps/web/app/[locale]/(ops)/ops/vehicles/actions.ts
    - apps/web/components/ops/VehicleTable.tsx
    - apps/web/components/ops/VehicleTable.css
    - apps/web/components/ops/VehicleForm.tsx
    - apps/web/components/ops/VehicleClassPanel.tsx
    - apps/web/tests/integration/ops-vehicles.spec.ts
  modified:
    - apps/web/components/ops/index.ts
    - apps/web/i18n/messages/en.json
    - apps/web/i18n/messages/de.json
    - apps/web/i18n/messages/fr.json
    - apps/web/i18n/messages/ar.json

key-decisions:
  - "Mutations stay in vehicles/actions.ts so 06-13 can import readers without mutation coupling"
  - "vehicleClassLabelKey is an explicit three-entry map — a template would emit a missing First key"
  - "Zero-photo = icon/initials fallback (D-22); never a broken image; never a data URI in photo_path"

patterns-established:
  - "Ops fleet read via asStaff(HYPERDRIVE_NOCACHE); no driver import, no DML in fleet.ts"
  - "Class panel has no create/delete; 23503 is mapped for ON DELETE RESTRICT"

requirements-completed: [OPS-06]

duration: 27min
completed: 2026-08-31
---

# Phase 06: Vehicles + vehicle classes console

**Staff can CRUD the fleet and edit seeded class capacities at /ops/vehicles; zero-photo rows fall back to an icon, never a broken image.**

## Performance

- **Duration:** 27 min
- **Started:** 2026-08-31T21:30:55Z
- **Completed:** 2026-08-31T21:57:50Z
- **Tasks:** 3
- **Files modified:** 13

## Accomplishments

- Write-free `fleet.ts` loads vehicles + classes through `asStaff` (NOCACHE); `vehicleClassLabelKey` is an explicit Economy/Business/Van map (ADR-012)
- `/ops/vehicles` fleet tab + classes tab; Server Actions stamp `updated_at`, `revalidatePath`, no Realtime, no `audit_log` INSERT (trigger owns it)
- `OpsPhotoField` kind=vehicle; empty `photo_path` renders `data-vehicle-photo=empty` fallback; plates stay LTR via `.vt-dir-keep`

## Task Commits

1. **Task 1: write-free fleet reader** - `8fb33f3` (feat)
2. **Task 2: vehicles console with OpsPhotoField** - `2f767e2` (feat)
3. **Task 3: ops-vehicles integration proofs** - `0e50f30` (test)

**Plan metadata:** (this commit)

## Files Created/Modified

- `apps/web/lib/ops/fleet.ts` — loaders, validators, 23503 map; no DML
- `apps/web/app/[locale]/(ops)/ops/vehicles/page.tsx` — force-dynamic, requireStaffClaims
- `apps/web/app/[locale]/(ops)/ops/vehicles/actions.ts` — create/update/delete vehicle, set status, update class
- `apps/web/components/ops/VehicleTable.tsx` / `.css` — table + cards, workshop, delete dialog
- `apps/web/components/ops/VehicleForm.tsx` — create/edit + OpsPhotoField
- `apps/web/components/ops/VehicleClassPanel.tsx` — capacity + active; no class create/delete
- `apps/web/components/ops/index.ts` — export VehicleTable, VehicleForm, VehicleClassPanel
- `apps/web/i18n/messages/{en,de,fr,ar}.json` — ADD `fleet-*` keys under `ops`
- `apps/web/tests/integration/ops-vehicles.spec.ts` — @ops-fleet, skips without local next/db

## Decisions Made

- Flat `fleet-*` keys: nested `ops.fleet` would collide with existing `\"fleet\": \"Fleet\"` nav string (same pattern as 06-11 `settings-*`)
- `deleteVehicleClass` is not written; spec proves 23503 via SQL DELETE against a class that still has a vehicle
- I18N-06: seats/bags/year/passengers/luggage copy uses ICU `{min}`/`{max}` instead of bare digits
- D-06 fence: comment `dynamic = "force-dynamic"` in the `"use server"` module (a real export is illegal there)

## Deviations from Plan

- No `fleet.test.ts` (not in files_modified)
- Playwright skipped in this worktree (no `apps/web/node_modules/.bin/next`); does not start Docker

## Issues Encountered

- Worktree has no `node_modules`. `tsc --noEmit` is inherited-red (TS2307 on next/react everywhere). Did not `pnpm install` / symlink.
- `pnpm check:db-fences` inherited-red on coupons/pricing/settings/staff-ops/customers/session/layout/nav. `vehicles/actions.ts` is not in that list.
- First Playwright run used main-tree `next` against the worktree and 404'd for 90s; spec now skips when worktree next is missing (coupons pattern).

## Test Results

- Task 1 greps: postgres/@vamos/db 0, vehicleClassFirst 0, 23503 4, `?? 0`/`?? ""` 0, DML 0
- Task 2 greps: yellow 0, warning/accent 0, OpsPhotoField ≥1, FileReader 0, deleteVehicleClass 0, updated_at 3, audit_log write 0, Realtime/localStorage 0
- Task 3 greps: afterEach 1, audit_log 2, 23503 2
- `pnpm i18n:check`: pass
- `lint:css` VehicleTable.css: pass
- Playwright `ops-vehicles.spec.ts --project=component-1440`: **10 skipped** (no worktree next binary). Skip reason: `run pnpm db:start && pnpm db:reset from packages/db`

## Next Phase Readiness

- 06-13 can import `loadVehicleOptions` / `loadVehicles` without pulling mutations
- Public quote still clamps to class `passenger_capacity` / `luggage_capacity` (ADR-014 §6)
