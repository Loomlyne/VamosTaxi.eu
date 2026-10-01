# P6 build record — a place and time change on a paid trip is re-priced and works

Branch `gsd/26.2-p6-build`, folder `/Users/koss/Developer/vamos-wt/phase-26.2`, cut from origin/main
`3f0ba6b2`. Plan signed 2026-10-01 (`PLAN.md`), decisions D1–D16
(`.planning/decisions/2026-10-01-p6-paid-trip-edit.md`), design signed (D10, `DESIGN-DRAFT.md`).
P6 extends P1's machine (`.planning/quick/260930-p1-class-change-reprice/`): one price step, one
preview and confirm, one pay link for the difference, one "Refund due", Withdraw change.

Started 2026-10-01 (server step). Nothing pushed, no PR, no deploy, no hosted SQL.

## Commits

| # | Commit | What |
|---|---|---|
| 0 | `8a13ef0f` | Record started |
| 1 | `611c24ca` | Database: migration `20261007150000_trip_change_reprice.sql`, pgTAP `trip_change_reprice.test.sql` (107), `database.types.ts` (three new functions) |
| 2 | `5d97be7a` | Trip facts step `trip-change-facts.ts` (+14), change body `parseChangeRequest` / `tripTarget` / P6 refusals (+10), the D14 e-mail `TripChangePayEmail` (+14, compared with the decision file) |
| 3 | `2fd45d1f` | Preview / confirm of a trip change `booking-trip-change.ts` (+24) through P1's routes; P1's price step split into exported pieces (P1 suites unchanged and green); kept driver's e-mail after a paid difference; a superseded waiting Stripe page closed |
| 4 | `ae822d5b` | PATCH: trip fields refused (`use-change`), contact / note / flight through `booking_staff_contact_update`, flight e-mail to the driver (+12) |

## Tests written first (failing line before the change)

| Test | Before (RED) | After |
|---|---|---|
| pgTAP `trip_change_reprice.test.sql` | `function public.booking_staff_trip_change(uuid, uuid, text, jsonb, bigint, integer, jsonb, unknown, numeric, integer, jsonb, integer, text) does not exist` (line 164, fixture build) | 107/107; neighbours `class_change_reprice` 81, `booking_edit_requests` 27, `refunds_by_hand` 102, `ops_assign_leg` 24, `settle_revive` 85, `manage_booking_money_driver` 32 pass |
| pgTAP mutation check | apply without the coordinates write → `not ok 41 - paid: the new place, its id, coordinates and the new duration are written`; Keep allowed on an overlap → `not ok 75`, `not ok 76`; old class totals kept → `not ok 33` | restored, 107/107 |
| `booking-change-trip-map.test.ts` (10) | `TypeError: parseChangeRequest is not a function` | 10/10 |
| `trip-change-facts.test.ts` (14) | written with the module (module did not exist) | 14/14 |
| `TripChangePayEmail.test.tsx` (14) | `Cannot find module './TripChangePayEmail'` | 14/14 |
| `booking-trip-change.test.ts` (24) | `Cannot find module '/lib/ops/booking-trip-change'` | 24/24 |
| `bookings-patch-p6.test.ts` (12) | `AssertionError: expected 200 to be 400` (PATCH with a pickup wrote) | 12/12 |
| `bookings-write.test.ts` (P1 pin rewritten) | `expected { ok: true, changed: [], … } to deeply equal { ok: true }` | pass: the write is the definer function, no table write, no class |

## Found on the way

## Stopped on

## Not verified
