---
status: built, waiting for the owner's signature on the pictures; nothing pushed, nothing deployed, no hosted SQL, no migration
branch: gsd/26.2-cars-page (cut from origin/main df520d08)
created: 2026-10-01
before: origin/main df520d08 (git archive) · after: this branch
---

# Cars page — record

Owner decision (question form, 2026-10-01): "Yes, its own small job" — a Cars section next to
Chauffeurs to list, add and edit cars (plate, model, class, seats, bags), design first with
pictures for his signature. Rule of the same day: each driver has his own car; a driver's class is
his car's class; Assign refuses a car of another class than the trip.

## What exists already (found first, 2026-10-01)

**API** — `apps/web/app/[locale]/(ops)/api/staff/vehicles/route.ts` (GET list, POST create) and
`…/vehicles/[id]/route.ts` (PATCH, DELETE), dual-mounted under `app/api/staff/vehicles`. All
`withStaff`, all through `asStaff` (`lib/ops/fleet.ts` readers, `lib/ops/fleet-write.ts` writes,
`lib/ops/fleet-http.ts` parse/present). POST/PATCH take `vehicleClassId` (or a D-14 class slug).
PATCH to `workshop` mails the owner the upcoming trips of that car (must-fix "off-road").

**Table `public.vehicles`** (`20260823000005_fleet.sql`, no later change): `id`, `vehicle_class_id`
(FK → vehicle_classes, restrict), `model` (required), `plate` (required, unique), `first_registered`,
`seats` (1–16), `bags` (0–16), `status` (`service` | `idle` | `workshop`), `photo_path` (R2 key,
nullable), `note`, `created_at`, `updated_at`. Staff has CRUD (`20260823000023_rls_staff.sql`);
every write lands in `audit_log` (`20260823000017_audit_log.sql`).

References to a car:
- `chauffeurs.default_vehicle_id` — **on delete set null**: today a delete silently takes the car
  away from its driver.
- `booking_legs.assigned_vehicle_id` — **on delete restrict**: today a delete of a car that ever
  drove a trip fails with 23503, and the route answers `{code:"23503"}`, which the dashboard shows
  as "That linked row is missing." (wrong words).
- `vehicle_seats.vehicle_id` — on delete cascade (the old Morning/Night desk; only the fleet reader
  shows it, nothing else reads it).

**Store** — `app/vamos-ops-data.js` `vehicles: restCollection("vehicles", cleanVehicle)`:
`cleanVehicle` keeps id, klass (D-14 fallback), vehicleClassId, model, plate, year, seats, bags,
status, photo, note — not the Morning/Night seats, so any PATCH through the store would empty
`vehicle_seats` for that car.

**UI** — there is no car screen. `app/ops/OpsFleet.dc.html` is Chauffeurs only
(`isChauffeurs = true`). History: `8de85e1a` (2026-09-25) removed the Vehicles group from the rail
and the vehicle list from OpsFleet; `a1393c93` replaced the chauffeur's Vehicle field (which carried
"Add a vehicle") with a class select. The dash-design job (2026-10-01) brought back a Car select on
the driver form, listing existing cars only.

**Why the owner could not add a car:**
1. No screen lists cars; the rail has no entry.
2. The old nested "Add a vehicle" dialog still sits in OpsFleet but is unreachable: OpsTable shows
   its entry only on a select field with `addLabel`, and the Car field (`defaultVehicleId`) has
   none; `nestedTargetKey:'vehicle'` points at a field that no longer exists.
3. Even reached, that dialog's Class select offers the fixed list `VEHICLE_CLASSES`
   (Economy / Business / Van luxury → D-14 slugs), so a class he named himself could not be picked.
4. A car added through OpsTable's own Add would not be created: OpsTable gives every new row a
   UUID, the store PATCHes any UUID id (except chauffeurs), and PATCH on a missing id answers
   `200 {id}` — "saved", nothing in the table.

**Routes** — `apps/web/middleware.ts` (hands-off) serves the console for a fixed list:
`/fleet` and `/fleet/chauffeurs` (+ `/fleet/chauffeurs/<id>`), no `/fleet/cars`. `/fleet` today is
only an alias of Chauffeurs in `ops.dc.html`, and nothing links to it. So Cars can live at
`/fleet` **without a middleware change**; `/fleet/cars` would need one (not done — would stop and
report).

## What was built

**Dashboard** (`app/`)
- `app/ops/OpsCars.dc.html` (new) — the Cars page at `/fleet` on the shared `OpsTable`: Add a car,
  Edit car (signed footer: Delete at the start, Cancel and Save at the end), Delete with the
  confirm box. List: Car (model, plate under it), Class, Seats, Bags, Driver (who has this car on
  Chauffeurs, else "No driver"), Status (In service / Free / In the workshop). Edit box: Photo,
  Plate, Model, Class, Seats (1–16), Bags (0–16), Status, each with a short hint. Class offers the
  classes of the **live** fare book (GET rate-versions → the live id → GET rate-book?versionId=),
  never the draft's and never a fixed list; a car whose class left the live book keeps it in the
  list (named from GET vehicle-classes). No live book → the page says so. Four languages in its
  own copy table; helmet carries the two law lines; logical properties only; no CHF.
- `app/ops/ops.dc.html` — `/fleet` is Cars (was an unlinked alias of Chauffeurs);
  `/fleet/chauffeurs` unchanged; old `#vehicles` hash goes to `/fleet`; store cache key bumped.
- `app/ops/OpsSidebar.dc.html` — rail entry Cars / Autos / Voitures / السيارات, car icon, right
  after Chauffeurs (also in the phone and tablet menu).
- `app/vamos-ops-data.js` — keeps the Morning/Night seat ids on a car (an edit no longer empties
  `vehicle_seats`); keeps the first store when the file runs twice (see deviation 1).
- `app/ops/OpsTable.dc.html` — one CSS line: table headers `text-align:start` (deviation 2).
- `app/vamos-i18n-dict.js` — appended: the Cars strings and three refusal patterns, de/fr/ar.

**Server** (`apps/web/`)
- `lib/ops/fleet-write.ts` — `deleteVehicleRow` follows the owner's rule: locks the car row; a
  driver with this car (`chauffeurs.default_vehicle_id`) or a trip that is not finished assigned to
  it → `in-use` with driver names and references, nothing written; otherwise the finished legs drop
  the car (`assigned_vehicle_id = null`, the driver stays), the car row is deleted (seat rows by
  cascade). `updateVehicleRow` answers `found:false` for a missing car and hands back a replaced
  photo key.
- `lib/ops/fleet-http.ts` — `vehicleDeleteJson`: 409 `fleet-car-in-use` {drivers, references,
  message}, 404 `fleet-car-gone`, 200 {id}.
- `lib/ops/vehicle-photo.ts` (new) — deletes a car photo and its two small copies from storage
  (only keys under `vehicles/`, never throws).
- `app/[locale]/(ops)/api/staff/vehicles/[id]/route.ts` — PATCH: 404 for a missing car (was 200
  "saved"), old photo removed after a replace; DELETE: the rule above, photo removed after a delete.

No migration, no settings, no middleware change, no hosted SQL.

## Tests (first, red before)

| file | before | after |
|---|---|---|
| `apps/web/lib/ops/vehicle-delete.test.ts` (new) | 13 failed: `expected undefined to deeply equal { kind: 'in-use', … }`; `…to match /select[\s\S]*from public\.vehicles[\s…/` (no lock); `TypeError: vehicleDeleteJson is not a function`; `expected [] to deeply equal { found: false }`; `Error: not built` (photo delete) | 13 passed |
| `apps/web/lib/ops/ops-dc-cars.test.ts` (new) | 21 failed, 1 passed (the middleware guard): `ENOENT … app/ops/OpsCars.dc.html`; `expected 'chauffeurs' to be 'cars'`; `expected -1 to be 4` (rail); `…to match object { morning: 'c1', night: 'c2' }`; `Cars: expected undefined to be defined` (dictionary). Added later, each red first: store loads once (`expected Object{…} to be Object{…}`), plate/model full width (`…to not have property "half"`), Arabic headers (`…to match /\[data-vt-table-scroll\] \.vt-table th\{text-align:start\}/`) | 24 passed |

## Deviations (found while building)

1. [Rule 1] **The console store loaded twice and a list could stay empty.** The shell's helmet runs
   `vamos-ops-data.js` twice (parser, then the dc-runtime); the second run replaced
   `window.VamosOps` while screens listened to the first. Real shell, offline, 12 loads each: Cars
   empty 4 times; **main's Chauffeurs empty 6 times** (pre-existing on live). The file now keeps
   the first store, as `vamos-ops-bar.js` already did; after: 0 of 12. Affects every dashboard
   screen (for the better). Commit `de646b7a`.
2. [Rule 1] **Arabic table headers sat at the far side of their column** on every dashboard list
   (the kit's `.vt-table th{text-align:left}`; OpsTable only overrode it for a table that fills
   its box). One line in OpsTable; English unchanged. Commit `074f9ca6`.
3. [Rule 1] PATCH of a car that is not in the table answered 200 "saved" and wrote nothing; now 404.
4. [Rule 2] A car edit through the store would have emptied `vehicle_seats` (the store dropped the
   Morning/Night ids); they ride along now.
5. [Rule 2] Deleted / replaced car photos leave storage (owner rule 2026-09-30, "deleted means
   gone"); before, nothing removed a car photo.
6. Pictures at 390: half-width Plate and Model cut "ZH 000 000" and the model name (en and ar) →
   full width; the Class hint shortened (three lines at 390).

## Pictures — `screens/` (40 PNG + `cars-sheet.png`), real dashboard shell, offline

Shell served as `serveOpsDc` does (`<base href="/app/ops/">` + signed-in flag) at `/fleet`;
before = `git archive df520d08`, after = this branch. API answers made by the branch's real
presenters (`presentVehicle`, `presentChauffeur`, `presentVehicleClass`, `vehicleDeleteJson`):
Mercedes V-Class ZH 000 000 (Business, 6/6, In service, Marco drives it), Toyota Corolla
ZH 123 456 (Economy, 3/3, Free, no driver); live fare book 18 with Economy / Business / Van luxury;
the delete answer is the route's own 409 for Marco + open trip VT-26-0042. No amounts.

- `cars-{list|add|edit|refusal}-after-{en|ar}-{1440|1024|768|390}.png` (32)
- `fleet-{before|after}-{en|ar}-1440.png` — the rail (before: `/fleet` showed Chauffeurs, no Cars)
- `drawer-{before|after}-{en|ar}-390.png` — the phone menu
- `cars-sheet.png` — all of the above on one sheet

Every picture opened and looked at. Measured in the page: **0 px sideways at every width**;
`dir=rtl` in Arabic; the refusal text in the confirm box in both languages. German and French
measured (not pictured) at 1440 / 768 / 390: 0 px sideways, footer on one row down to 768 and
stacked at 390 ("Löschen / Abbrechen / Auto speichern", "Supprimer / Annuler / Enregistrer la
voiture"), no value cut in the edit box. On a phone the list scrolls inside its own box (the
shared table, as on every dashboard list); the page does not.

## Gates (once, at the end)

`node scripts/sync-dc-mock-to-public.mjs` ok; `pnpm typecheck` 0 (one test typing fixed,
`73065319`); `pnpm lint` 0 errors (6 warnings, none in touched files); `pnpm lint:css` 0;
`pnpm i18n:check` pass; `pnpm check:numbers` ok; `pnpm check:db-fences` pass;
`pnpm check:public-env` pass; `pnpm check:legal-claims` pass. Touched and related tests
(43 files: the two new ones, fleet-http, fleet-persist, photos, assign*, chauffeur-class-keep, every
`ops-dc-*`, the files that read the dictionary, the shell, the rail, the store or OpsTable):
**544 passed**.

## Not verified

- The delete SQL ran on no database (recorded statements only; no local stack, no hosted SQL).
  On live, a car with finished trips will make those trips show no car on their booking page;
  only the audit log keeps the deleted car row.
- No R2: the photo delete is proven against a stand-in bucket.
- Nothing deployed, nothing pushed, no Worker build, no live click.
- German, French and Arabic words read by no native speaker.

## Pre-existing, seen, not touched

- Shared table controls under 44 px on every dashboard list: row Edit/Delete 32 px, Status filter
  18 px, dialog Close 32 px, Seats/Bags steppers 36 px (OpsTable / kit).
- A select field shows no required star (Class), text fields do (Plate, Model).
- A long error in the confirm box sits in a pill and turns oval on three lines.
- OpsFleet still carries the unreachable nested "Add a vehicle" dialog (tests pin it); the Cars
  page replaces its purpose.

## Questions for the owner (signature)

1. **Address**: Cars lives at dashboard.vamostaxi.site/fleet (an address the dashboard already
   serves). `/fleet/cars` would need a change to the hands-off middleware. Keep `/fleet`?
2. **Delete and past trips**: a car that only drove finished trips is deleted for good; those
   trips keep their driver but no longer name the car (example: a completed VT-26-00xx would show
   no car on its booking page). Keep, or refuse a delete while any trip ever used the car?
3. **"Not finished"**: a trip whose pickup time has passed but that is not closed (not Complete,
   No-show or Cancelled) also blocks the delete — not only future trips. Right?
4. **Status words**: In service / Free / In the workshop (the database's service / idle /
   workshop). "In the workshop" mails the support inbox the car's assigned trips. Keep "Free"?
5. **Photo**: the car photo is kept for the car only; nothing else shows it (the site shows class
   photos). Keep the field, or drop it?
6. **Phone list**: on a phone the list shows Car and part of Class; Seats, Bags, Driver and Status
   are a sideways swipe inside the list (as on Chauffeurs). Keep, or put class and driver under the
   car name on a phone?

## Owner UAT (after the ship, dashboard.vamostaxi.site)

1. Menu: click **Cars** (under Chauffeurs). **Expected:** the Cars page lists your car(s) with
   class, seats, bags, driver and status.
2. Click **ADD A CAR**, type a plate and a model, pick a class, press **SAVE CAR**. **Expected:**
   the car is in the list; on Chauffeurs › a driver › Car it can be picked.
3. Click the pencil on that car, change Seats, **SAVE CAR**. **Expected:** the list shows the new
   number.
4. Open the car your driver has, press **DELETE**, then **DELETE**. **Expected:** "Driven by …
   Change the car on Chauffeurs first." and the car stays.
5. Open the car you just added (no driver, no trip), **DELETE**, **DELETE**. **Expected:** it is
   gone from the list and from the Chauffeurs Car list.

## Commits

| commit | what |
|---|---|
| `97dadb70` | feat(dash): car delete follows the owner's rule; missing car on save is gone; car photo leaves storage |
| `2e2e6a8f` | feat(dash): Cars page — list, add, edit and delete cars at /fleet, next to Chauffeurs |
| `de646b7a` | fix(dash): keep the first console store — a list could stay empty after the second load |
| `074f9ca6` | fix(dash): Cars picture follow-ups — plate and model full width, shorter class hint, table headers in Arabic |
| `73065319` | test(dash): Cars test reads the first column safely (typecheck) |
| (this one) | docs(dash): Cars page record and signing pictures |
