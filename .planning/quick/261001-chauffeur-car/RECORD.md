---
status: signed by the owner 2026-10-01 (decision 8); handed over to the control session (HANDOVER.md); no deploy, no hosted SQL
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
- His answers in the question form, same day (decision 7): one-row Assign
  ("Driver [ Choose a chauffeur ▾ ] [ ASSIGN ]", Change / Unassign); plate required, may repeat;
  delete keeps his finished trips and takes him off the ones not finished.
- Written down in `.planning/decisions/2026-10-01-no-cars-page.md` (decisions 1–7).

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
5. Delete a chauffeur (decision 7): his row stays for his finished trips; his trips not finished go
   back to unassigned; he leaves the Chauffeurs list and Assign.
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
  Two chauffeurs **may** carry the same plate (decision 7: no unique index). Live rows start null;
  the form requires it.
- `chauffeurs.deleted_at` (decision 7); the e-mail unique index `chauffeurs_email_lower_uidx` is
  rebuilt to skip deleted rows, so a deleted driver's e-mail can be used again.
- `ops_delete_chauffeur(chauffeur, actor)` (definer, `search_path ''`, vamos_system only): one
  transaction — his trips **not finished** (leg and booking not cancelled / completed / no_show /
  refunded; **a trip whose pickup has passed but nobody closed counts as not finished**) go back
  to unassigned exactly as `ops_unassign_leg` does (both FKs null, assigned → confirmed, one
  `assignment.cleared` event each); his finished trips keep him (name and details); the row stays
  with `deleted_at = now()`, `active = false`. Answers the references taken off him.
- `ops_assign_leg` (`create or replace`, same signature/return/definer/`search_path ''`/grants):
  `no-vehicle` gone; refuses `no-class` and `class-mismatch`; capacity from
  `vehicle_classes.passenger_capacity/luggage_capacity`; `assigned_vehicle_id = null`; only
  `assignment.chauffeur_set` (no `vehicle_set`); a deleted chauffeur is `not-found`.
  `ops_unassign_leg` unchanged.
- `reminder_24h_candidates` and `manage_driver_for`: the chauffeur's plate; car model always null;
  same columns / four keys, same grants.
- `packages/db/database.types.ts` regenerated from the local stack (`plate`, `deleted_at`,
  `ops_delete_chauffeur`).

**Server** (`apps/web`)
- `lib/ops/assign.ts`, `assign-map.ts`, assign route: the class rule reads the DRIVER's class
  (`chauffeurs.vehicle_class_id`), answers `no-class {driverName, tripClass}` and
  `class-mismatch {driverName, driverClass, tripClass}` before the RPC; no vehicle id anywhere;
  the customer's assignment mail reads `c.plate`; the overlap read looks at the chauffeur only.
- Chauffeur write/read (`chauffeurs*.ts`, `fleet-http.ts`): `plate` carried and **required** — an
  empty plate is refused ("Plate number is required."), a new chauffeur without one is refused
  before any write; absent on an update = keep. Every dashboard read skips deleted chauffeurs; a
  deleted one cannot be edited. The form sends no car, so a save clears an old
  `default_vehicle_id` link (no vehicle row touched).
- Delete (`deleteChauffeurRow`, DELETE route, `chauffeurDeleteJson`): runs `ops_delete_chauffeur`
  asSystem after withStaff (not-found mapped AROUND the wrapper → 404); answers
  `200 {id, unassigned: [references]}`. **No mail is sent**: the "trip taken off" driver mail is
  not needed since he is gone, and an unassign mails no customer.
- `lib/ops/chauffeur-history.ts` + `GET /api/staff/chauffeurs/:id/bookings` (both mounts):
  read-only, bookings from his legs ∪ `assignment.chauffeur_set` events naming him, erased left
  out, newest first, `takenOff` when he is not the leg's driver any more.
- Board read (`bookings.ts`, `bookings-map.ts`): `vehicleClassId`, `className`, `chauffeurPlate`.

**Dashboard** (`app/`)
- `app/vamos-ops-data.js`: first store kept (double load); `VamosOps.liveClasses()` (live version →
  its available classes, names from vehicle-classes); `cleanChauffeur.plate`;
  `cleanBooking.vehicleClassId/className/chauffeurPlate`.
- `app/ops/OpsFleet.dc.html`: form = 316606ee + Plate number (fields: photo · name|phone ·
  email|licence · **class|plate** · languages · note). Plate is **required** (decision 7): an
  empty one shows the shared "Needed" (de Erforderlich, fr Requis, ar مطلوب) like Name. List:
  Chauffeur, Class, Plate, Licence; search adds plate and class. Third count "With a class".
  Car/vehicle copy rewritten (subtitle, note, empty). Delete confirm text says what happens; after
  a delete the page names the trips now unassigned (four languages). Profile: Class + Plate facts, one read-only
  **Bookings** history (status, Taken off badge, row opens the booking) replacing Live trips and
  Past bookings. One pre-existing `ß` fixed ("Ausser Dienst").
- `app/ops/OpsDetail.dc.html` (also touched by P1 — merge point): Assign is **one row**
  (decision 7) on the label grid — `Driver [ Choose a chauffeur ▾ ] [ ASSIGN ]`, the design-system
  Select listing only the trip's class as "Name · Plate"; assigned: "Name · Plate" with the text
  buttons Change (back to the dropdown) and Unassign (44 px, no border, no fill); phone: dropdown
  and ASSIGN full width; refusals under the row. The vehicles store is no longer read. New words
  in four languages: Choose a chauffeur, Assign, Change (Unassign reused).
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
| Dashboard booking detail | Assign box: car under each name; "Car" row under the driver | dropdown "Name · Plate"; assigned row "Name · Plate" (name alone without a plate); the legacy "Vehicle" tag shows only for an old row that still has a car |

No new customer-facing sentence was needed: every line is an existing label with a value or is
left out.

## Tests (first, red before)

| file | red before (first failing line) | after |
|---|---|---|
| `apps/web/lib/ops/ops-dc-chauffeur-class.test.ts` (new) | store: `expected { … } to be { … }` (second store); DC: 21 failed, e.g. `expected [ 'photo', 'name', …, 'defaultVehicleId', … ] to deeply equal [ …, 'vehicleClassId', 'plate', … ]`; decision 7: 13 failed (dropdown, words, row, plate required, delete text) | 28 passed |
| `packages/db/supabase/tests/assign_by_class.test.sql` (new, 33 → 51) | `ERROR: column "plate" of relation "chauffeurs" does not exist`; decision 7: `not ok 4 - two active chauffeurs may carry the same plate`, `not ok 34 - chauffeurs.deleted_at exists`, `not ok 36 - ops_delete_chauffeur …` | 51 ok |
| `apps/web/lib/ops/assign-class-check.test.ts` (rewritten for the driver's class) + `assign-rpc-errors`, `assign.test` | 15 failed, e.g. `expected { ok: false, code: 'unknown' } to deeply equal { ok: false, code: 'no-class' }` | 35 passed |
| `apps/web/lib/ops/chauffeur-plate-delete.test.ts` (new) | `Cannot find module …/chauffeur-history`; decision 7: 8 failed, e.g. `expected [Function] to throw an error` (empty plate) | 18 passed |
| `apps/web/lib/ops/no-car-surfaces.test.ts` (new) | 4 failed: `expected undefined to be 'e0000000-…b501'` (board class id), manage row not hidden, store fields | 13 passed (the 8 mail cases passed from the start: the templates already omit empty lines) |
| `apps/web/lib/ops/assign.local.test.ts` (rewritten) + `chauffeur-delete.local.test.ts` (new, rewritten for decision 7), real database (own stack `sb-chauffeur`, `VAMOS_LOCAL_DB_PORT=64322`) | delete fixture first hit `booking_legs_assignable` (fixture fixed) | both pass |
| pgTAP `ops_assign_leg`, `manage_booking_money_driver` (moved to the new rule) | 6 + 2 failed against the new migration | pass |
| Tests that pinned the withdrawn Car field / car refusals / radio cards, changed: `ops-dc-dash-design` §3 (now the dropdown), `ops-chauffeur-desk` (fields), `ops-dc-u08` (onDelete now a promise of the answer), `fleet-http.test` (fixture `plate: null`), `chauffeur-class-keep` (a new driver needs a plate) | — | pass |

## Commits

| commit | what |
|---|---|
| `ad3f4ff0` | docs: owner decision file (decisions 1–6) and this record |
| `82c80a4a` | fix: keep the first console store (double load) + vm test |
| `edde5890` | feat: migration 20261007160000 + pgTAP |
| `023e179e` | feat: server — assign by driver class, plate, delete rule, history read, board fields |
| `039326fc` | feat: dashboard — form, list, profile history, Assign by class |
| `bcd0c29d` | docs: record |
| `5ac43850` | fix: the edit box shows the languages he speaks (deviation 1) |
| `c78512bb` | fix: chauffeur box on a phone, each field full width (deviation 2) |
| `0d105031` | docs: first picture set |
| `b64d92fa` | feat: migration — plates may repeat, `deleted_at`, `ops_delete_chauffeur` (decision 7) |
| `d448723a` | docs: decision 7 in the decisions file |
| `346e76e2` | feat: server — plate required, delete keeps the row and unassigns what is not finished |
| `73539084` | feat: one-row Assign, plate required on the form, delete text and notice |
| `d81cd208` | test: u08 onDelete reads the new notice helper |
| `d03f869b` | fix: Change / Unassign as text buttons; Driver label level with the row (picture check) |
| (this one) | docs: decision-7 pictures, `assign-row-sheet.png`, refreshed sheet, record |

## Deviations (found while building)

1. [Rule 1] **Languages read "—" in the edit box** (also on origin/main): the server sends names,
   the select holds codes. The list rows now hand the select the codes. `5ac43850`.
2. [Rule 1] **Values cut on a phone** (Class read "…iness"): OpsTable gets an opt-in `phoneFull`
   flag, used by the chauffeur box only. `c78512bb`.
3. [Rule 1] One `ß` in OpsFleet German ("Außer Dienst" → "Ausser Dienst").
4. [Rule 1] The console store double load (main's Chauffeurs empty on some loads). `82c80a4a`.
5. [Rule 1] Picture check: the kit's ghost buttons drew outlined pills for Change / Unassign; now
   plain underlined text buttons, 44 px, grey hover, no glow. `d03f869b`.
6. OpsDetail no longer reads the vehicles store (it only fed the car line).

## Pictures — `screens/`, real dashboard shell, offline

Shell served as `serveOpsDc` does (`<base href="/app/ops/">` + signed-in flag); before =
`git archive f3543451`, after = this branch; API answers made by each version's REAL presenters.
Fixtures: Marco Rossi (Business, ZH 123 456), Sara Meier (Business, ZH 222 333), Luca Bianchi
(Economy, ZH 654 321), Nina Keller (no class, no plate); live book 18 with Economy / Business /
Van luxury; one unused vehicle row. No amounts.

- **`assign-row-sheet.png`** (decision 7): `row-{empty|assigned}-{before|after}-{en|ar}-{1440|390}`,
  `row-refusal-after-{en|ar}-{1440|390}`, `required-plate-after-en-1440`,
  `delete-confirm-after-en-1440`.
- **`chauffeur-class-sheet.png`** (refreshed after decision 7): `list-…`, `form-…` (Plate number *),
  `history-…`, `menu-…`.
- Removed as superseded: the radio-card Assign pictures (`assign-*`, `assign-refusal-*`) and the
  old delete refusal (`delete-refusal-*`) — the owner's answers replaced both designs.

Every picture opened and looked at. Measured in the page: **0 px sideways at every width**;
`dir=rtl` in Arabic. Refusal words read back from the page: "Marco Rossi drives Economy; the trip
is Business." / "يقود Marco Rossi فئة Economy، والرحلة من فئة Business.".

## Gates (once, at the end)

`node scripts/sync-dc-mock-to-public.mjs` ok; `pnpm typecheck` 0; `pnpm lint` 0 errors (6
warnings, none in touched files); `pnpm lint:css` 0; `pnpm i18n:check` pass; `pnpm check:numbers`
ok; `pnpm check:db-fences` pass; `pnpm check:public-env` pass; `pnpm check:legal-claims` pass.
Touched and related unit tests (`lib/ops`, `lib/checkout`, `lib/lifecycle`, `lib/account`):
**189 files, 1837 passed, 3 skipped**. Own isolated stack `sb-chauffeur` (project
`vamos-taxi-chauffeur`, ports 6432x; migrations from scratch incl. 20261007160000): full pgTAP
**2146 tests pass** (run before the local passwords were set); after the last change
`assign_by_class` 51/51 and `ops_assign_leg`, `manage_booking_money_driver`, `reminder_24h_*`
clean; `assign.local` + `chauffeur-delete.local` pass on the real database. Stack stopped with
`--no-backup`. (The Mac restarted once during the work: the scratchpad was wiped and Docker had
to be started again; the pictures were already in `screens/`.)

## Not verified

- No hosted SQL, no Worker build, no deploy, no live click. The migration ran on local stacks only.
  Hosted: apply `20261007160000` verbatim, then read back.
- No mail was sent; the reminder and "driver assigned" mails are proven as text in four languages.
- German, French and Arabic words read by no native speaker.

## Merge points

- `app/ops/OpsDetail.dc.html` is also changed by P1: this branch touches the Assign box only
  (markup, CSS block `[data-ops-assign-*]`, copy keys `noClass` / `classMismatch` / `plate` /
  `chooseChauffeur` / `assignBtn` / `change` / `noDriversClass` / `capacity`, the assign helpers
  and `confirmAssign` refusal words, the bind()).
- `packages/db/database.types.ts`: regenerated here; P1 may regenerate too.
- origin/main moved (26.0 landed, 6ec73c52); not merged here — the lead merges at hand-over.
- Not touched: `packages/emails`, `lib/ops/edit-request*.ts`, `apps/web/tests/**`, middleware,
  worker, checkout, seed.sql, any applied migration.

## Pre-existing, seen, not touched

- Arabic: phone numbers read reversed in the list and the edit box ("01 00 000 79 41+").
- Row Edit/Delete buttons 32 px, under the 44 px rule (shared OpsTable, every dashboard list).
- The list header reads "Driver" (runtime dictionary), the copy table says "Chauffeur".
- On a phone the list scrolls inside its own box; Class/Plate are a sideways swipe there.
- OpsFleet still carries the unreachable nested "Add a vehicle" dialog; `/api/staff/vehicles`
  still exists (no screen reaches it); the must-fix "off-road" mail can no longer fire.

## Owner answers (decision 7) and what is still open

Answered: plate required; plates may repeat; delete keeps finished trips and unassigns the rest;
a passed pickup that is not closed counts as not finished; one-row Assign.

Still open (signature):
1. **What the customer sees**: the mails say "Plate: ZH 123 456" and the manage-booking page shows
   the plate under "Vehicle" (no car model). Keep these existing labels?
2. **The unused vehicle row on live** stays (no screen shows it). Delete it later (one SQL line,
   your go), or leave it?

## Owner UAT (after the ship, dashboard.vamostaxi.site)

1. Chauffeurs → pencil on your driver → **Class** Business, **Plate number** ZH 123 456 →
   **SAVE CHAUFFEUR**. **Expected:** his row shows Business and ZH 123 456.
2. Chauffeurs → **ADD A CHAUFFEUR** → type a name, leave Plate number empty → **SAVE CHAUFFEUR**.
   **Expected:** "Needed" under Plate number; nothing saved.
3. Bookings → open a paid Business trip with no driver. **Expected:** one row: Driver, a dropdown
   "Choose a chauffeur" listing only your Business drivers as "Name · Plate", and **ASSIGN**.
4. Pick your driver → **ASSIGN**. **Expected:** "Driver assigned to VT-…"; the row reads
   "Name · ZH 123 456" with **Change** and **Unassign**.
5. Chauffeurs → click his name. **Expected:** Class and Plate in his profile; under Bookings the
   trip from step 4.
6. Edit him → **DELETE**. **Expected:** the box says he leaves the list and Assign, finished trips
   keep his name, trips not finished go back to unassigned. **DELETE** again → he is gone from the
   list, the page shows "Now unassigned: VT-…", and that trip is unassigned on Bookings.
