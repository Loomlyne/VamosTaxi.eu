# P6 build record — a place and time change on a paid trip is re-priced and works

Branch `gsd/26.2-p6-build`, folder `/Users/koss/Developer/vamos-wt/phase-26.2`, cut from origin/main
`3f0ba6b2`. Plan signed 2026-10-01 (`PLAN.md`), decisions D1–D16
(`.planning/decisions/2026-10-01-p6-paid-trip-edit.md`), design signed (D10, `DESIGN-DRAFT.md`).
P6 extends P1's machine (`.planning/quick/260930-p1-class-change-reprice/`): one price step, one
preview and confirm, one pay link for the difference, one "Refund due", Withdraw change.

Server step 2026-10-01. Nothing pushed, no PR, no deploy, no hosted SQL, no MCP SQL.

## Commits

| # | Commit | What |
|---|---|---|
| 0 | `8a13ef0f` | Record started |
| 1 | `611c24ca` | Database: migration `20261007150000_trip_change_reprice.sql`, pgTAP `trip_change_reprice.test.sql` (107), `database.types.ts` (three new functions) |
| 2 | `5d97be7a` | Trip facts step `trip-change-facts.ts` (+14), change body `parseChangeRequest` / `tripTarget` / P6 refusals (+10), the D14 e-mail `TripChangePayEmail` (+14, compared with the decision file) |
| 3 | `2fd45d1f` | Preview / confirm of a trip change `booking-trip-change.ts` (+24) through P1's routes; P1's price step split into exported pieces (P1 suites unchanged and green); kept driver's e-mail after a paid difference; a superseded waiting Stripe page closed |
| 4 | `ae822d5b` | PATCH: trip fields refused (`use-change`), contact / note / flight through `booking_staff_contact_update`, flight e-mail to the driver (+12) |
| 5 | `42980f0a` | Record |
| 6 | `7ca7756e` | Customer pages: D12 (sentence gone), D13 (account view sends the time change), D15 (refund line), money block `lastChange` (+15) |
| 7 | `3e24b297` | Dashboard Edit: the route's named refusals in the page's own words; the kept-driver note only for places or time (+3) |
| 8 | `c1d36c64` | End to end on a real local database through the Worker client (`trip-change.local.test.ts`), named in the db fence allowlist |
| 9 | `05650317` | Customer time change sends the day picked; an account booking carries its day (+9) |
| 10 | `5cbd9b5f` | Pictures of the customer screens this step changed (48 + 3 sheets) |
| 11 | `59e8ca9f` | A date, time or party change works on a price record P1 cannot price again (+2) |
| 12 | (this commit) | Record and hand-over |

## What was built (brief items 1–9)

| # | Item | Where |
|---|---|---|
| 1 | Trip facts step: the pick (suggest → retrieve with the owner's session) through `runQuotePipeline` with staff guards (no Turnstile, no public rate limit, the real daily Mapbox breaker, units counted, no customer minimum advance); the end that stays keeps its saved text and coordinates and takes airport / city / canton from Mapbox (saved place id, else reverse of its coordinates); facts signed as a quote lock (`QUOTE_LOCK_SECRET`); the confirm verifies the lock and checks it belongs to this booking and this change (the end that stays at its saved coordinates and place id, the picked id, the time, the party). Refusals with their field: `place-not-served`, `same-place`, `no-route`; breaker → `temporarily-unavailable` | `apps/web/lib/ops/trip-change-facts.ts` |
| 2 | P1's price step takes the facts: a new route is priced with `priceClasses` on the exact new distance (today's live book, the booking's extras at the amount paid, its coupon, VAT); on the route as booked P1's check of what was charged runs with the trip as booked and the new prices with the trip as edited (a party that changes which classes fit, D4); one price for class + places / party | `booking-trip-change.ts`, `booking-change.ts` (`loadChangeRules`, `savedChargeOf`, `loadChangeBooks`, `priceOnBookedRoute`), `booking-change-price.ts` (`classNets`) |
| 3 | Migration `20261007150000_trip_change_reprice.sql` (below) | `packages/db/supabase/migrations/` |
| 4 | Date or time only / party inside the class: no new price, saved on confirm (a copy of the price record with the new party), `booking.modified`, confirmation again, until the pickup time; works also on a price record P1 cannot read (places / class then answer `trip-data`) | SQL (3), `booking-trip-change.ts` |
| 5 | Dearer: trip unchanged until paid (P1's Stripe page, 24 h), the D14 e-mail word for word (four languages, one sentence per changed field in the approved order); a class change alone stays P1's (its e-mail). Cheaper: written on confirm, Refund due with the full difference (D3), refund by hand; the customer page shows the D15 line until the refund is sent, P1's line for a class-only change | `TripChangePayEmail.tsx`, `vamos-manage-ticket.js`, `manage_money_for.last_change` |
| 6 | PATCH: pickup, dropoff, dateIso, time, pax, bags, klass → `400 use-change`, nothing written. Name, e-mail, phone, note instant + recorded, no e-mail (D6). Flight instant + recorded + the driver's existing flight-number e-mail (D8). The two old holes (emptied pickup saved empty, emptied passengers failed) gone | `bookings-write.ts`, PATCH route |
| 7 | Assigned driver stays (D7); new places → "trip assigned" again, a new time alone → the time-change e-mail (D16); a clash is named in the preview; Take off works; **Keep on a real overlap is refused — stopped, see below** | SQL (1, 3), `booking-change.ts` |
| 8 | D12 sentence gone (box title and button stay) on both views and in the dictionary; D13 account view sends the time change like manage-booking (same route, same states) | `app/pages/*.dc.html`, `app/vamos-i18n-dict.js` |
| 9 | `app/ops/PlaceSearchStates.dc.html` **kept**: `apps/web/lib/ops/place-search-dc.test.ts` reads it and `PlaceSearch.dc.html` names it as its states gallery | — |

## Migration `20261007150000_trip_change_reprice.sql`

| Kind | Objects |
|---|---|
| `create or replace` (same signature, grants, definer, `search_path ''`) | `booking_edit_apply_payload` — from P1's body (20261007140000): a new place written whole (text, Mapbox id, coordinates), the route duration; who leaves the trip decided before the leg moves (class change; owner's take-off `driver = unassign`; a kept driver `driver = keep` who now overlaps → off, reason `overlap`); a payload with no driver choice (a customer's time change) keeps the old rule (23P01 → must-fix). `manage_money_for` — body of 20260930190000 + key `last_change` |
| New public (EXECUTE `vamos_system` only, SECURITY DEFINER, `search_path ''`) | `booking_staff_trip_change`, `booking_change_request_facts`, `booking_staff_contact_update` |
| New helper (no grant) | `app.booking_change_mint_trip_snapshot` |

Top level holds only `create function`, `create or replace function`, `grant`, `revoke`, `comment`
(checked by script): no row inserted, updated or deleted, no column, no constraint, no backfill. It
touches nothing `20261007160000_assign_by_class.sql` (already live) touches, so applying it after
that file on the hosted database gives the same result as the from-zero order.

## Tests written first (failing line before the change)

| Test | Before (RED) | After |
|---|---|---|
| pgTAP `trip_change_reprice.test.sql` | `function public.booking_staff_trip_change(uuid, uuid, text, jsonb, bigint, integer, jsonb, unknown, numeric, integer, jsonb, integer, text) does not exist` (fixture build, line 164) | 107/107 |
| pgTAP mutations | coordinates not written → `not ok 41`; Keep allowed on an overlap → `not ok 75`, `not ok 76`; old class totals kept → `not ok 33` | restored, 107/107 |
| `booking-change-trip-map.test.ts` (10) | `TypeError: parseChangeRequest is not a function` | 10/10 |
| `trip-change-facts.test.ts` (14) | written before the module (not run red separately: the module did not exist) | 14/14 |
| `TripChangePayEmail.test.tsx` (14) | `Cannot find module './TripChangePayEmail'` | 14/14 |
| `booking-trip-change.test.ts` (26) | `Cannot find module '/lib/ops/booking-trip-change'`; old record: `expected { ok: false, code: 'trip-data' } to match object { ok: true, … }` | 26/26 |
| `bookings-patch-p6.test.ts` (12) | `AssertionError: expected 200 to be 400` (a PATCH with a pickup wrote) | 12/12 |
| `bookings-write.test.ts` (P1 pin rewritten) | `expected { ok: true, changed: [], … } to deeply equal { ok: true }` | pass: definer function, no table write, no class |
| `customer-change-p6.test.ts` (24) | `expected '<!DOCTYPE html>…' not to contain 'Keep the booking and the fare where t…'`; `expected 'Your trip now runs in Economy. The di…' to be 'Your trip has changed. The difference…'`; `expected 'confirmModify = () => {…' to match /this\.state\.authVia === 'account'/`; date fix: `expected -1 to be greater than -1` (no helper) | 24/24 |
| `customer-change-time-only.test.ts` (D9 pin widened to both views) | — | pass |
| `ops-p6-server-dc.test.ts` (3) | written after the two-line change (text pins) | 3/3 |
| `booking-change-settle.test.ts` (+1) | text pin of the request id hand-on | 4/4 |
| `trip-change.local.test.ts` (1, real Postgres) | first run: the clash step `expected {…} to match object { ok: true, driverClash: {…} }` — the test seeded times through postgres.js `::timestamp` (see Found 6); seeded as text | pass |

## Real-Postgres proof (isolated stack `vamos-taxi-chauffeur`, ports 653xx, workdir `scratchpad/sb-chauffeur`)

- Symlinks checked (this folder) and `docker ps` before start; another session's stack (`vamos-taxi-e2e2`, 59322) was left alone.
- From-zero replay: 126 migrations, `20261007150000` included (`supabase db reset`).
- Full pgTAP on that replay, login roles passwordless: **93 files, 2334 tests, PASS**.
- Worker-client tests on the same replay (passwords set to the role names, `VAMOS_LOCAL_DB_PORT=65322`, one after the other): `trip-change.local` (dearer place change → paid → new coordinates, id, duration, distance on the price record, driver kept and e-mailed; cheaper → Refund due, no Stripe refund; time only; clash → Keep refused, Take off works; PATCH refusal and contact save), `booking-change.local`, `refund-by-hand.local`, `assign.local`, `chauffeur-delete.local`, `system-reads.local`: 6/6; `packages/db` `class-change-reprice` 3/3.
- Stack stopped with `--no-backup` at the end.

## Pictures (`screens/`, method of the design step: real customer page, offline, answers stubbed, CHF 000)

Only what this step changed on screen, before = origin/main `3f0ba6b2`, after = this branch,
1440 / 1024 / 768 / 390, English and Arabic, 0 px sideways in all 48:
`cancel-move-*` (D12), `refund-line-*` (D15; before shows P1's class line on the same data),
`account-sent-*` (D13: after, the request is sent with the booked day and the new time; before,
nothing was sent and the day fell back to today). Sheets `sheet-13-cancel-move.png`,
`sheet-14-refund-line-trip.png`, `sheet-15-account-change-sent.png`. The dashboard pictures signed
on 2026-10-01 did not change (the two Edit adjustments touch no pictured state).

## Found on the way

1. **D11 (stopped):** the overlap refusal is a table constraint, `booking_legs_chauffeur_no_overlap`
   (`EXCLUDE USING gist (assigned_chauffeur_id with =, scheduled_range with &&) … deferrable
   initially immediate`, `20260823000011_booking_legs.sql:118-122`). It fires at every statement and
   at COMMIT; `ops_assign_leg` only defers it to swap drivers. Keeping one driver on two overlapping
   trips is impossible without changing that constraint, so it was not done. Keep on a real overlap
   answers `driver-overlap` (the dashboard shows its existing "Reassign the chauffeur before this
   change can apply."); Take off works.
2. **Istanbul is bookable by the site's own rule.** The quote's area check passes when both points
   are inside the Europe box (lng −31.5 to 40, lat 27.5 to 72), so Zurich → Istanbul is bookable on
   vamostaxi.site today and the Edit prices it too. The D2 refusal fires for a place outside that
   box (Dubai, New York) or one with no road route.
3. Customer change view (both views): the request sent the new time on the day **as booked** (a new
   day was dropped), and a booking opened through the account had no day, so its request was
   refused. Fixed (the picked day travels; the account list carries `dateIso`).
4. manage-booking chose the account route with `ticket.via`, which a booking never carries: a
   signed-in customer's time change and flight save took the guest route without a token and
   failed. Fixed (`authVia`).
5. Still fake on the account booking view (outside D13, not changed): "Save" of the flight number
   and "Resend email" show success and send nothing.
6. postgres.js serialises a parameter cast to `::timestamp` through `new Date()` in the client's
   time zone. Harmless on Workers (UTC); on this Mac (Asia/Dubai) it shifted local test seeds by
   4 h. Seed times as text.
7. P1 gap closed: a change applied at once while a dearer change still waited left the old Stripe
   page payable; it is now expired (best effort).
8. The stored text of a new place is Mapbox's place name, as for every booking made on the site
   ("Zug station"), not the longer "name, address" the Edit's list shows. The D14 e-mail and the
   driver's e-mail carry the stored text.
9. A change of passengers or bags inside the class sends the driver nothing (no existing driver
   e-mail shows the party).
10. `apps/web/i18n/messages/*.json` (React twin, unused by any component) and `seed.sql` still hold
    the D12 sentence under `account.keep-the-booking-…`; left so the seed does not change.

## Checks (once, final tree, after `node scripts/sync-dc-mock-to-public.mjs`)

| Check | Result |
|---|---|
| `pnpm typecheck` | pass |
| `pnpm lint` | pass — 0 errors, 6 warnings, all in files this job did not touch |
| `pnpm lint:css` | pass |
| `pnpm i18n:check` | pass (2676 keys) |
| `pnpm check:numbers` | pass |
| `pnpm check:db-fences` | pass (8 checks, 1072 files) |
| `pnpm check:public-env` | pass (before and after the build; no `.open-next` bundle to scan) |
| `pnpm check:legal-claims` | pass (3 checks) |
| `pnpm db:seed:check` | no drift |
| `pnpm build` | pass; `…/bookings/[id]/change`, `…/change/preview`, `…/change/withdraw` in both mounts |
| `pnpm test:unit` | web 357 files / 3568 tests pass (6 local-DB files skipped without a port), emails 14 / 179, db 2 / 14 |
| From-zero replay + full pgTAP (`vamos-taxi-chauffeur`) | 126 migrations; 93 files / 2334 tests pass |
| Worker-client local tests (same replay) | 6 web files + `packages/db` `class-change-reprice` 3/3 pass |
| Build output after | `apps/web/.next` removed; no `.next-*`, no `.open-next`; `tsconfig.json` untouched |

## Not verified

- Nothing applied on the hosted database (control session's job: apply verbatim, read back).
- No real Mapbox, Stripe page, refund or Resend mail (fakes).
- The dashboard Edit was not clicked against the running server; the server answers are proven by
  unit tests (fakes) and by the local Worker-client test, the screens by the signed pictures.
- Live bookings not read: how many carry a price record P1 cannot read (date / time / party still
  change; places and class answer `trip-data`).
- The dashboard gateway routes …/change and …/change/preview already (P1); not run on a Worker build.
- D14 / D15 in German, French and Arabic are the owner's approved texts, not read by a native speaker.

## Process note

- One read-only `git stash list` ran by mistake inside a command chain (no stash created, applied
  or dropped).
