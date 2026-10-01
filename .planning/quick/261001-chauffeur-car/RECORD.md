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

(filled in per commit below)

## Tests (first, red before)

(filled in per commit below)

## Commits

| commit | what |
|---|---|

## Not verified

(at the end)

## Questions for the owner

(at the end)
