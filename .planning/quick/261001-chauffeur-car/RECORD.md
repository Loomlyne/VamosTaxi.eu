---
status: in progress — design draft for the owner's signature; nothing pushed, nothing deployed, no hosted SQL
branch: gsd/26.2-chauffeur-car (cut from origin/main f3543451)
created: 2026-10-01
before: origin/main f3543451 (git archive) · after: this branch
---

# Chauffeur by class — record

## Owner's words (2026-10-01)

- "No cars tab. No fleet. Only chauffeurs, and their data needs to be there, that's it."
- Change of direction, same day: "No each chauffeur will be chosen by a class thats it without
  anything extra So i cab assign him easilly on bookings"
- Refined, same day: "Keep the form of the chauffeur as it was before. The car form inside
  chauffeur remove it. I only can choose a class and a plate number (that what will differentiate
  drivers and keep track on them). When I assign a driver the driver that appear must match the
  request of the class. And keep a history on each chauffeur of his bookings logs."
- Written down in `.planning/decisions/2026-10-01-no-cars-page.md` (decisions 1–6).

The first brief of this job (a Car section on the chauffeur form) was withdrawn twice before any
code was written. Nothing car-related was built on this branch.

## Scope (lead's brief, three messages, 2026-10-01)

1. Chauffeur form = origin/main before the dashboard-design ship (`316606ee`, Class field) + Plate
   number. No Car select. List: name, class, plate; search finds the plate.
2. `chauffeurs.plate` + assign by class in ONE migration `20261007160000_assign_by_class.sql`
   (number confirmed by the control session): `ops_assign_leg` without a vehicle, capacity from the
   class, driver class = trip class; `reminder_24h_candidates` and `manage_driver_for` show the
   chauffeur's plate, no car model. pgTAP for each.
3. Assign on booking detail: only drivers of the booking's class (name + plate); server refuses
   another class, four languages.
4. Chauffeur profile: read-only bookings history (assigned, taken off), newest first.
5. Delete a chauffeur: refused while an unfinished trip has him; otherwise deleted completely.
6. Console store double-load fix with its test.
7. Every surface that showed the car: what it showed, what it shows now.

## What exists on origin/main f3543451 (found first)

- **Chauffeur form** (`app/ops/OpsFleet.dc.html` on the shared `app/ops/OpsTable.dc.html`): a
  **Car** select (`defaultVehicleId`, writes `chauffeurs.default_vehicle_id`), no Class field. The
  list's Class column is the class of the driver's car, "No car yet" without one.
  The column `chauffeurs.vehicle_class_id` (FK → vehicle_classes, on delete set null) is kept but
  nothing reads or writes it since 4dc72078.
- **Assign** (`app/ops/OpsDetail.dc.html`): lists every driver with his car under the name; the
  server (`apps/web/lib/ops/assign.ts`) refuses a car of another class ("This driver's car is
  {car}; the trip is {trip}."), and the database function `public.ops_assign_leg`
  (`20260910164004`) refuses `no-vehicle` without a default car, checks capacity against the car's
  seats/bags and writes `assigned_vehicle_id` + an `assignment.vehicle_set` event.
- **Delete a chauffeur** (`deleteChauffeurRow`): a bare `delete`; `booking_legs.assigned_chauffeur_id`
  is `on delete restrict`, so any driver who ever had a trip fails with 23503 ("That vehicle is
  missing." — wrong words). Desk tables (shifts, leave) cascade.
- **Console store** (`app/vamos-ops-data.js`): runs twice in the shell (parser, then dc-runtime);
  the second run replaces `window.VamosOps` while screens listen to the first, so a list can stay
  empty (found on the Cars branch, commit de646b7a there).
- **Classes**: `vehicle_classes.passenger_capacity` / `luggage_capacity` exist (1–16 / 0–16).

## What changed

**Database** — `packages/db/supabase/migrations/20261007160000_assign_by_class.sql` (number
confirmed by the control session; applied on the isolated local stack only, never hosted):
- `chauffeurs.plate` text, trimmed (check `chauffeurs_plate_shape`, 1–32 chars), case as typed.
  **Unique** case-insensitive among active chauffeurs (`chauffeurs_plate_active_key`), because the
  owner said the plate is "what will differentiate drivers". Live rows start null (no conflict).
- `ops_assign_leg` (`create or replace`, same signature/return/definer/`search_path ''`/grants):
  `no-vehicle` gone; refuses `no-class` and `class-mismatch`; capacity from
  `vehicle_classes.passenger_capacity/luggage_capacity`; `assigned_vehicle_id = null`; only
  `assignment.chauffeur_set` (no `vehicle_set`). `ops_unassign_leg` unchanged.
- `reminder_24h_candidates` and `manage_driver_for`: the chauffeur's plate; car model always null;
  same columns / four keys, same grants.
- `packages/db/database.types.ts` regenerated from the local stack (only `plate` added).

**Server** (`apps/web`)
- `lib/ops/assign.ts`, `assign-map.ts`, assign route: the class rule reads the DRIVER's class
  (`chauffeurs.vehicle_class_id`), answers `no-class {driverName, tripClass}` and
  `class-mismatch {driverName, driverClass, tripClass}` before the RPC; no vehicle id anywhere;
  the customer's assignment mail reads `c.plate`; the overlap read looks at the chauffeur only.
- Chauffeur write/read (`chauffeurs*.ts`, `fleet-http.ts`): `plate` carried (absent = keep); a
  taken plate is `409 chauffeurs-plate-taken`. The form now sends no car, so a save clears an old
  `default_vehicle_id` link (no vehicle row touched).
- Delete (`deleteChauffeurRow`, DELETE route, `chauffeurDeleteJson`): one staff transaction — lock
  his row; a leg of his that is not closed (leg and booking not cancelled/completed/no_show/refunded,
  so a past pickup that is not closed also blocks) → `409 chauffeur-in-use {name, references}`,
  nothing written; else his legs let go of him (`assigned_chauffeur_id = null`), the row is
  deleted (shift/leave rows cascade).
- `lib/ops/chauffeur-history.ts` + `GET /api/staff/chauffeurs/:id/bookings` (both mounts):
  read-only, bookings from his legs ∪ `assignment.chauffeur_set` events naming him, erased left
  out, newest first, `takenOff` when he is not the leg's driver any more.
- Board read (`bookings.ts`, `bookings-map.ts`): `vehicleClassId`, `className`, `chauffeurPlate`.

**Dashboard** (`app/`)
- `app/vamos-ops-data.js`: first store kept (double load); `VamosOps.liveClasses()` (live version →
  its available classes, names from vehicle-classes); `cleanChauffeur.plate`;
  `cleanBooking.vehicleClassId/className/chauffeurPlate`.
- `app/ops/OpsFleet.dc.html`: form = 316606ee + Plate number (fields: photo · name|phone ·
  email|licence · **class|plate** · languages · note). Plate is **optional** (the form marks only
  Name as required; Licence is not). List: Chauffeur, Class, Plate, Licence; search adds plate and
  class. Third count "With a class". Car/vehicle copy rewritten (subtitle, note, empty, delete box).
  Delete refusal and taken plate in four languages. Profile: Class + Plate facts, one read-only
  **Bookings** history (status, Taken off badge, row opens the booking) replacing Live trips and
  Past bookings. One pre-existing `ß` fixed ("Ausser Dienst").
- `app/ops/OpsDetail.dc.html` (also touched by P1 — merge point): Assign lists only the drivers of
  the trip's class, plate under the name, Plate row under the assigned driver (no car line); the
  vehicles store is no longer read; no-class / class-mismatch / no driver of this class / class
  capacity in four languages.
- `app/pages/manage-booking.dc.html`: the "Vehicle" row shows the plate alone and is left out when
  there is none (was an empty row).

## Surfaces that showed the car (lead's item 3)

| surface | with a car (before) | now (no car) |
|---|---|---|
| 24 h reminder mail (`reminder_24h_candidates` → `Reminder24hEmail`) | Vehicle: car model; Plate: car plate | Plate: the chauffeur's plate; no Vehicle line (template omits empty); no plate → no Plate line |
| Customer "driver assigned" mail (`assign.ts loadCustomerAssignment`) | Vehicle: model; Plate: car plate (only when a car was on the leg) | Plate: the chauffeur's plate; no Vehicle line |
| Chauffeur assign / unassign mails | no car line | unchanged |
| Ops must-fix mail (`must_fix_trip_read`) | no car line (the "off-road" kind only fired from a car's workshop status) | unchanged; "off-road" can no longer fire (no car screen) |
| Manage-booking "your driver" (`manage_driver_for`) | Vehicle: "Model · Plate" (fell back to the driver's default car) | Vehicle: the chauffeur's plate alone; row hidden when he has none |
| Account booking pages (`/api/account/bookings`, `booking-detail.dc.html`) | no car (the list SQL reads no vehicle; the detail never fills it) | unchanged |
| Dashboard booking detail | Assign box: car under each name; "Car" row under the driver | plate under each name; "Plate" row under the driver (hidden without one); the legacy "Vehicle" tag shows only for an old row that still has a car |

No new customer-facing sentence was needed: every line is an existing label with a value or is
left out.

## Tests (first, red before)

| file | red before (first failing line) | after |
|---|---|---|
| `apps/web/lib/ops/ops-dc-chauffeur-class.test.ts` (new) | store: `expected { … } to be { … }` (second store); DC: 21 failed, e.g. `expected [ 'photo', 'name', …, 'defaultVehicleId', … ] to deeply equal [ …, 'vehicleClassId', 'plate', … ]` | 23 passed |
| `packages/db/supabase/tests/assign_by_class.test.sql` (new, 33) | `ERROR: column "plate" of relation "chauffeurs" does not exist` | 33 ok |
| `apps/web/lib/ops/assign-class-check.test.ts` (rewritten for the driver's class) + `assign-rpc-errors`, `assign.test` | 15 failed, e.g. `expected { ok: false, code: 'unknown' } to deeply equal { ok: false, code: 'no-class' }` | 35 passed |
| `apps/web/lib/ops/chauffeur-plate-delete.test.ts` (new) | `Cannot find module …/chauffeur-history` | 14 passed |
| `apps/web/lib/ops/no-car-surfaces.test.ts` (new) | 4 failed: `expected undefined to be 'e0000000-…b501'` (board class id), manage row not hidden, store fields | 13 passed (the 8 mail cases passed from the start: the templates already omit empty lines) |
| `apps/web/lib/ops/assign.local.test.ts` (rewritten) + `chauffeur-delete.local.test.ts` (new), real database `VAMOS_LOCAL_DB_PORT=62322` | delete fixture first hit `booking_legs_assignable` (fixture fixed) | both pass |
| pgTAP `ops_assign_leg`, `manage_booking_money_driver` (moved to the new rule) | 6 + 2 failed against the new migration | pass |
| Tests that pinned the withdrawn Car field / car refusals, changed: `ops-dc-dash-design` §3, `ops-chauffeur-desk` (fields), `ops-dc-u08` (onDelete now a promise of the answer), `fleet-http.test` (fixture `plate: null`) | — | pass |

## Commits

| commit | what |
|---|---|
| `ad3f4ff0` | docs(dash): owner decision file (decisions 1–6) and this record |
| `82c80a4a` | fix(dash): keep the first console store (double load) + vm test |
| `edde5890` | feat(dash): migration 20261007160000 + pgTAP |
| `023e179e` | feat(dash): server — assign by driver class, plate, delete rule, history read, board fields |
| `039326fc` | feat(dash): dashboard — form, list, profile history, Assign by class |

## Not verified

(at the end)

## Questions for the owner

(at the end)
