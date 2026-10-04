# Hand-over: Booked column on the dashboard bookings table

Quick 261004-ops-booked-column. Job session, not the controller. Written 2026-10-04 20:25 +0400.

- Branch: `fix/ops-booked-column`, cut from `origin/main` `d92969f5` (main had not moved at 20:20; merged nothing, nothing to merge).
- Code commit: `4961ba9c`. The branch tip is the commit that adds this file on top of it (`git rev-parse origin/fix/ops-booked-column`).
- Decision: `.planning/decisions/2026-10-04-bookings-booked-column.md` (owner, question form, 20:09 +0400).
- Ship order: Worker `vamos` only (the dashboard gateway Worker is untouched). No migration, no live-database write, no new connector or env.

## One thing for the controller to read first: there is no Ref column

The signed order was "Ref, Booked, Pickup, Customer, Route, Vehicle, Driver, Total". The board table has no
Ref column: `ceec3a9e` ("Ref is editor-only") took it out, and the table has been Pickup, Customer, Route,
Vehicle, Driver, Total since. I did not add one (the brief says no other column changes). Booked is therefore
the **first** column, where the reference would be. If the owner meant "put the reference back as well", that
is a separate decision; say so and it is one more column.

## Data path

`bookings.created_at` (existing column, no migration)
-> `loadBookings` SQL in `apps/web/lib/ops/bookings.ts` (one added select line, `b.created_at`)
-> `mapBoardBooking` in `apps/web/lib/ops/bookings-map.ts`: `createdAt`, UTC ISO string, `""` when unknown
-> `GET /api/staff/bookings` (staff only, via `withStaff`; no public answer carries it)
-> `cleanBooking` in `app/vamos-ops-data.js` (one added line, `createdAt: str(b.createdAt)`)
-> `app/ops/OpsBoard.dc.html` column `booked`.

Staff read access: `vamos_staff` is granted the whole `bookings` table (the loop in `20260823000023_rls_staff.sql`),
and the same query already does `order by ... b.created_at desc`, so the column is readable today. The customer
column-grant list (`authenticated`) is not involved. Live grant not re-read (no connector use in this job).

## Column as built

- First column, header `Booked` / `Gebucht` / `Réservé` / `تاريخ الحجز` (T tables of the file; Swiss German has no ß here).
- Width 140px (Pickup stays 100px; the text "4 Oct · 14:32" is longer than "08:15 / Fri 9"). Table `min-width` 940 -> 956px, the sum of the seven widths. Every other column and width is unchanged (a test pins them).
- Text: Zurich time, "4 Oct · 14:32"; the year ("4 Oct 2025 · 14:32") only when the booking's Zurich year is not the current Zurich year.
- Month: the English token in its own text node, so the shared dictionary turns it into the entries it already has (`Okt`, `oct`, `أكتوبر` ...; all twelve exist in `vamos-i18n-dict.js`). September is `Sep` on purpose (en-GB's "Sept" would miss the dictionary key).
- Day, year and time: inside `vt-dir-keep` plus `data-vt-no-i18n` (left to right in Arabic). A tooltip (`title`): the full Zurich date and time, `2026-10-04 14:32`, wrapped in a left-to-right isolate.
- No creation time: an em dash in the muted colour (`data-vt-quiet`).
- Layout: the date part and the time part are two non-wrapping pieces with one breakable space between them, so a long line (year row, long Arabic month) wraps to a second line instead of clipping. At 390 the table keeps its own horizontal scroll (940 > 324 px); the page does not scroll sideways.
- Sorting, filters, paging: untouched. Rows still come in the server's order (pickup time, newest first).

## Files

- `app/ops/OpsBoard.dc.html`: formatter `bookedParts` + `isolate`, the column, `colBooked` in four languages, two CSS lines, table min-width.
- `app/vamos-ops-data.js`: `createdAt`.
- `apps/web/lib/ops/bookings.ts`, `apps/web/lib/ops/bookings-map.ts`: select + `createdAt` (type `OpsBookingRow`, `SqlBoardRow.created_at`).
- `apps/web/lib/ops/ops-board-booked.test.ts`: new, 18 tests.
- `.planning/quick/261004-ops-booked-column/`: this file, `screens/`, `tools/` (`shoot.mjs`, `rows.mjs`, `serve.mjs`, `mutate.mjs`).

## Pictures (bare crops of the table, real dashboard shell, `/api/*` stubbed)

In `screens/`: `bookings-booked-en-1440.png`, `bookings-booked-en-390.png`, `bookings-booked-ar-1440.png`, `bookings-booked-ar-390.png`.
Five rows through the real `mapBoardBooking`: booked 4 Oct 14:32, 4 Oct 00:30 (22:30 UTC on the 3rd), 29 Sep, 16 Jan (23:30 UTC on the 15th, winter), and 18 Dec 2025 (shows the year). German and French were checked as text at 1440, no picture. The grey line round each crop is the board's own border, not added by the sheet. The Pickup column's small day line ("Fri 9") stays English in every language: that is how the board already was, not part of this job.
Amounts are the round fixtures CHF 1 / 2 / 3; names are made up.

Run again: `node scripts/sync-dc-mock-to-public.mjs`, then `node .planning/quick/261004-ops-booked-column/tools/shoot.mjs <out dir>` (the fixtures are dated 2026; it refuses to run in another year).
Result of the last run: header order in the page's own words, 5 expected cell texts and 5 titles per language (en, de, fr, ar), left-to-right isolates with the translator skipping them, reading order inside each cell (day, month, time; reversed in Arabic), nothing clipped, no sideways page scroll at 390, the table's own scroll at 390 and none at 1440, `VamosLocale.coverage` (de, fr, ar) lists nothing from the new column, 0 console errors, 0 page errors, 0 failed requests; control run: a row without a creation time shows a muted dash. All checks passed.

## Checks on the final code (tip `4961ba9c` plus this file)

- install `pnpm install --frozen-lockfile`: ok (13.6 s)
- sync `scripts/sync-dc-mock-to-public.mjs`: ok (20 pages, comments stripped from 115 files)
- typecheck (all four workspaces): pass
- lint: 0 errors, 6 warnings (unused eslint-disable directives in files this job did not touch); eslint on the touched files and `tools/`: clean
- lint:css: pass
- i18n:check: passed, 2709 keys
- check:numbers: ok
- check:public-env: pass (the built-bundle scan was skipped: no build output)
- check:db-fences: 8 of 8 passed, 1199 files
- db:seed:check: no drift
- vitest `lib/ops` + `lib/checkout/phase-26-3-laws` + `lib/security/ops-assets-gateway` + `lib/icons`: 126 files passed, 11 skipped; 1404 tests passed, 17 skipped (includes the board-paid, ops-live-data, customers-board twin check, ops-dc-* tests)
- `node --test scripts/strip-public-comments.test.mjs`: 10 of 10
- new test file alone: 18 of 18
- mutation check (`tools/mutate.mjs`): 14 deliberate breaks, 14 caught (SQL drops the column, mapper drops it, store drops it, formatter in UTC, year always / never shown, "this year" judged in UTC, column moved, left-to-right isolates removed, dash removed, title removed, German header equals English, month inside the skip marker, Pickup width changed).

## NOT verified

- Not run against the live database or the live Worker: the real `created_at` of a live row, and the live dashboard host (`/app/ops/*` needs a staff session there). After deploy: open Bookings, compare one row's Booked cell with its row in Supabase (read-only).
- The `vamos_staff` SELECT on `bookings.created_at` is read from the migrations and from the existing `order by`, not from the live ACL.
- Not run: the full `test:unit`, the Playwright suites (`ops-26-3-widths.spec.ts` shares the file), the local-database tests (`*.local.test.ts`), the test lab.
- Browser check was Chromium only, on the local sync, not Safari.
- German and French have no pictures (text checked only).
- A year row (for example "18 Dec 2025 · 10:20") wraps onto two lines at 140px in every language; it never clips, but it is taller than a normal row. From 2027 on, most rows will be year rows.

## Other places that list bookings (not changed)

- Customer screen, booking history of one customer (`OpsCustomers.dc.html` `historyRows`: ref, route, pickup, class, status).
- Calendar board and calendar (`OpsCalendarBoard.dc.html`, `OpsCalendar.dc.html`): cards by pickup day.
- Dashboard home (`OpsDash.dc.html`): counters and money lists; no bookings table there.
- Customer account and bookings pages on the public site (`app/pages/bookings.dc.html`): customer-facing, not staff.

## Ship notes

Merge, install from the lockfile, run the gates in a clean clone, deploy Worker `vamos` with `--env staging` as usual,
then check the dashboard Bookings page (first column "Booked") on https://dashboard.vamostaxi.site in English and Arabic.
The branch is local and pushed; delete the worktree and branch after the ship.
