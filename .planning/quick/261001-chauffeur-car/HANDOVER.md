# Chauffeurs by class — hand-over

**To:** control session. **From:** 26.2 audit session, 2026-10-01.
**Folder:** `/Users/koss/Developer/vamos-wt/phase-26.2`, branch `gsd/26.2-chauffeur-car`, origin/main
`083b50ab` merged in (`11cdfcb7`; one conflict, `.planning/decisions/2026-10-01-no-cars-page.md`:
this branch's copy kept, it holds decisions 1–8 verbatim and supersedes main's 1–6 table).
Pushed (branch only). No deploy, no hosted SQL. The final commit is the one that adds this file.
Full record: `RECORD.md` in this folder. Owner decisions: `.planning/decisions/2026-10-01-no-cars-page.md`.

## Signed by the owner (question form on pictures, 2026-10-01)

| # | What | Pictures |
|---|---|---|
| 1 | Chauffeur form as before the dashboard-design ship (Class field) plus one field, **Plate number**, required; two drivers may share a plate. No car anywhere on the dashboard | `screens/chauffeur-class-sheet.png`, `form-edit-after-en-1440.png` |
| 2 | Assign is one row: `Driver [ Choose a chauffeur ▾ ] [ ASSIGN ]`, listing only the drivers of the booking's class as "Name · Plate"; assigned: "Name · Plate" with **Change** and **Unassign** text buttons; the server refuses a driver of another class in plain words | `row-empty-after-en-1440.png`, `row-assigned-after-en-1440.png`, `row-refusal-after-en-390.png`, `row-assigned-after-ar-390.png`, `screens/assign-row-sheet.png` |
| 3 | Each chauffeur's profile: a read-only Bookings history (assigned / taken off), newest first | `history-after-en-1440.png` |
| 4 | Delete a chauffeur: his finished trips keep him; his trips not finished go back to unassigned ("Now unassigned: VT-…"); he leaves the list and Assign | `delete-confirm-after-en-1440.png` |
| 5 | Customer mails ("Plate") and the manage-booking page ("Vehicle") show the chauffeur's plate under the existing labels — no new wording | — |
| 6 | The one unused vehicle row on live: **delete it** (after this ship, by you, see below) | — |

## Migration

`20261007160000_assign_by_class.sql` (number from you): `chauffeurs.plate`, `chauffeurs.deleted_at`,
e-mail unique index skips deleted rows, new `ops_delete_chauffeur` (definer, vamos_system only),
`ops_assign_leg` replaced with the same signature (no vehicle, class must match, capacity from the
class), `reminder_24h_candidates` and `manage_driver_for` give the chauffeur's plate (same columns).
**Safe on real paid bookings:** no booking, leg, payment or price row changes; live chauffeurs start
with an empty plate. **Order at ship:** apply the migration verbatim, read back, then deploy the
Worker. Worker first would break the Chauffeurs page (it reads `plate` and `deleted_at`).

## After the ship (owner decision 6, yours to run)

Delete the one unused `vehicles` row on live: first read that no `booking_legs.assigned_vehicle_id`
and no `chauffeurs.default_vehicle_id` points to it and whether it has a photo in storage; delete
the row (and its photo); read back. Deleted means gone everywhere.

## Checks on merge `11cdfcb7`, run once by the lead

typecheck, lint (0 errors, 6 old warnings), lint:css, i18n:check (2676 keys), check:numbers,
check:db-fences (8/8), check:public-env, check:legal-claims (3/3), db:seed:check, build: pass.
Unit, full: web 3352 + 4 skipped (339 files), emails 151, db 14. From-zero replay of 124 migrations
plus seed and full pgTAP: 91 files, **2146 tests, all pass** (own stack `vamos-taxi-chauffeur`, ports
653xx, stopped with `--no-backup`, nothing left). **On a real Postgres with the Worker client
options:** `assign.local.test.ts` (assign by class, refusals, overlap) and
`chauffeur-delete.local.test.ts` (finished trips keep him, unfinished go back to unassigned) pass.
`db:types:check`: the installed CLI 2.118.0 prints unformatted types; with formatting set aside the
generated types equal the committed `packages/db/database.types.ts` (incl. `plate`, `deleted_at`).

## Not verified

- No live click, no hosted SQL, no Worker build on Cloudflare. Pictures are renders of the real
  dashboard shell with stubbed data.
- No mail sent; the reminder and "driver assigned" mails are proven as text in four languages.
- German, French and Arabic new words read by no native speaker. Playwright not run.

## Merge points with P1 (`gsd/26.2-p1-class-change`)

`app/ops/OpsDetail.dc.html` (this branch: the Assign box only) and `packages/db/database.types.ts`
(both regenerate). Whichever lands second merges main first; main wins unless the owner says
otherwise.

## Owner UAT (dashboard.vamostaxi.site, after the ship)

1. Chauffeurs → pencil on your driver → **Class** Business, **Plate number** ZH 123 456 → **SAVE CHAUFFEUR**. **Expected:** his row shows Business and ZH 123 456. (Your live driver has no plate yet; he shows in Assign only once his class is set.)
2. Chauffeurs → **ADD A CHAUFFEUR** → type a name, leave Plate number empty → **SAVE CHAUFFEUR**. **Expected:** "Needed" under Plate number; nothing saved.
3. Bookings → open a paid Business trip with no driver. **Expected:** one row: Driver, a dropdown "Choose a chauffeur" listing only your Business drivers as "Name · Plate", and **ASSIGN**.
4. Pick your driver → **ASSIGN**. **Expected:** "Driver assigned to VT-…"; the row reads "Name · ZH 123 456" with **Change** and **Unassign**.
5. Chauffeurs → click his name. **Expected:** Class and Plate in his profile; under Bookings the trip from step 4.
6. A test chauffeur you add for this step: assign him a trip, then edit him → **DELETE** → **DELETE**. **Expected:** he is gone from the list, the page shows "Now unassigned: VT-…", and that trip is unassigned on Bookings.

## Left for later (not in this ship)

- Dead car code: the unreachable nested "Add a vehicle" dialog in `app/ops/OpsFleet.dc.html`,
  `/api/staff/vehicles`, the must-fix "off-road" mail kind (can no longer fire), the
  `vehicles` table and `chauffeurs.default_vehicle_id`. A 26.2 clean-up job, on his word.
- Seen, not touched: Arabic phone numbers read reversed in the list; row Edit/Delete buttons 32 px
  (shared OpsTable, under the 44 px rule); list header "Driver" vs copy "Chauffeur".
