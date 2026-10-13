---
phase: 30-vehicle-class-lifecycle
plan: 07
subsystem: ops-console-client
tags: [OpsChauffeurs, OpsDetail, assign, retired-class, i18n]
requires:
  - phase: 30-03
    provides: class-retired refusals on chauffeur write and assign
  - phase: 30-04
    provides: VamosOps.classes() with the server status field
  - phase: 30-11
    provides: OpsChauffeurs.dc.html (renamed from OpsFleet)
provides:
  - Chauffeurs screen with retired-class flag, Live-only Class select, Live-only WITH A CLASS count
  - Assign block that leaves out retired-class chauffeurs and says so in four languages
affects: [30-08, 30-10]
key-files:
  modified: [app/ops/OpsChauffeurs.dc.html, app/ops/OpsDetail.dc.html, apps/web/lib/ops/ops-dc-chauffeur-class.test.ts, apps/web/lib/ops/ops-chauffeur-desk.test.ts, apps/web/lib/ops/ops-dc-finalize.test.ts]
  created: [apps/web/lib/ops/ops-dc-assign-retired.test.ts]
requirements-completed: [CLS-08, CLS-09, CLS-10, CLS-11, CLS-14]
completed: 2026-10-13
---

# Phase 30 Plan 07: Chauffeur side of the class lifecycle Summary

The Chauffeurs screen and the Assign block now show the signed lifecycle consequences from the server field `status` only (never `active`): a chauffeur on a retired class carries the red "Retired class: pick a new one" flag, the Class select offers Live classes only, WITH A CLASS counts Live-class chauffeurs, and Assign leaves out retired-class chauffeurs with the signed count line.

## Tasks

| Task | Commit | Notes |
|------|--------|-------|
| 1 Chauffeurs screen | 6f68f127 | flag, Live-only select and count, no vehicle wording, helmet laws |
| 2 Assign block | 239bf068 | retiredIds from status only, new vm test |

## What changed

- `app/ops/OpsChauffeurs.dc.html` (the plan names OpsFleet.dc.html; 30-11 renamed it):
  - `retiredIds` and `liveIds` come from `classRows[].status`; no `active` fallback; before the rows load nothing is flagged or counted.
  - Flag: `Icon circle-alert` 14 + 13px `--vt-danger` text (`[data-class-retired]` helmet rule), class name stays in `vt-dir-keep` + `data-vt-no-i18n`; chauffeur link weight 500 changed to 600.
  - Class select: Live classes only; `retiredTag` removed in four languages. Save omits `vehicleClassId` when it equals the stored class (T-30-28), so a chauffeur on a retired class keeps it; a changed class is sent.
  - Dead vehicle form removed: `vehicleFields`, nested add props on the OpsTable import, `VSTATUS`, and all vehicle strings (the ten named keys plus colVehicle, colCapacity, colBase, unassigned, noVehicle, footVehicles... fChauffeurs, hClass, hPlate, hVehicle, hChauffeurs, vNote, offRoadStay, morning, night, none, fModel/fPlate/fSeats/fBags/fYear/fStatus/fVehicle, seats, footSeats, footPaired) in en, de, fr, ar. A grep for fleet/vehicle/flotte/Fahrzeug/véhicule over the file returns only identifiers (`vehicleClassId`, `defaultVehicleId`, `vehicle: null`).
  - New helmet carries `--vt-shadow-accent:none` and `.vt-input--focus{box-shadow:none}` (the screen had none; the shell set them).
- `app/ops/OpsDetail.dc.html`: only `retiredIds` changed (prototype fallback on `active === false || hiddenAt` removed). The left-out line, `assignableChauffeurs(tripClassId, retiredIds)`, Arabic forms, and `showNoDrivers` (hidden when the line shows) were already in the file from the prototype and are now pinned by tests. The `class-retired` assign answer falls through to the existing `assignFailed` text (no new copy).

## Verification

- `ops-dc-chauffeur-class` + `ops-chauffeur-desk`: 48 tests pass. `ops-dc-assign-retired`: 12 pass. `ops-dc-arabic-count-lines -t "Assign"`: 1 pass (4 skipped, belong to 30-08/30-10). `ops-dc-p4`: pass (52 with chauffeur-class). `fleet-persist, vehicle-seats, edit-request, ops-session-lost, ops-dc-finalize, ops-live-data, ops-dc-u08, no-photo-remove-link`: 158 pass after the finalize fix below.
- `node scripts/check-i18n-coverage.mjs`: passed (2699 keys, no dictionary edit).
- Acceptance greps on OpsChauffeurs: retiredTag 0, weight 500 0, ten keys 0, flotte 0, `status === 'retired'` 1, `active === false` 0, shadow-accent 1. OpsDetail: prototype fallback 0, `status === 'retired'` present; `git diff origin/main` hunks all sit in the Assign block, its CSS, its T keys and the class-rows load.

## Deviations from Plan

**1. [Rule 3 - Blocking] Stale pins in two other tests.** `ops-chauffeur-desk.test.ts` pinned `Morning`/`Night`/`fVehicle` in the screen and `ops-dc-finalize.test.ts` pinned `fChauffeurs` and the nested vehicle add. Both described the vehicle form removed here; updated to assert the new state. Commit 6f68f127.

**2. Class column width.** The plan said `[data-*]` layout rules; the OpsTable column only passes an inline `width`, so the helmet uses `td:has([data-ch-classcell])` (272px at >=1024, min-width 200px at 681-1023). Phone (<=680) stacks the class under the name as before. Not checked in a browser; the 30-10 lab brief covers 1440/1024/768/390.

**3. Test fixture.** WITH A CLASS 2 / 3 uses the same chauffeur names as sheet 10 (Marc Keller, Samir Haddad, Luca Meier) as new fixture rows; the older 1 / 3 test stays.

## Known Stubs

None.

## Threat Flags

None. T-30-27 (server refusal mirrored by the UI list), T-30-28 (untouched class not sent, tested) and T-30-29 (React text nodes, names in `data-vt-no-i18n`) are covered.

## Not verified

No browser layout check at 1440/1024/768/390 or Arabic RTL (30-10 lab). No live data touched.

## Self-Check: PASSED

Commits 6f68f127 and 239bf068 exist; `ops-dc-assign-retired.test.ts` present.
