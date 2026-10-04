# Hand-over: sortable headers on the dashboard bookings table

Quick 261004-ops-board-sort. Job session, not the controller. Written 2026-10-04 20:55 +0400.

- Branch: `fix/ops-board-sort`, cut from `origin/main` `c4a35174` (20:38). `origin/main` moved once while I worked
  (`9d19379d`, planning files only: the board note and `.planning/decisions/2026-10-04-bookings-table-sort.md`); merged in
  at `f6d25592` (no conflict, no code). The branch tip is the last commit on the branch
  (`git rev-parse origin/fix/ops-board-sort`).
- Code commit: `ea745189`.
- Decision: `.planning/decisions/2026-10-04-bookings-table-sort.md` (on main, written by the controller).
- Ship order: Worker `vamos` only (dashboard gateway Worker untouched). No migration, no live-database write, no new
  connector, env or dependency, no new icon file (arrow-up and arrow-down were already vendored).

## Read these three first

1. **The line under the page title is done (owner, question form, 2026-10-04; commit after the hand-over).** The
   subtitle (`ordered` in the `T` tables, used by this screen only) is now en "Paid trips", de "Bezahlte Fahrten",
   fr "Courses payées", ar "الرحلات المدفوعة": the old words without the order part. No test pinned the old line; a new
   pin is in `ops-board-sort.test.ts`; `tools/header-coverage.mjs` checks the header in all four languages on the local
   sync (the English subtitle is not in the shared dictionary, so `VamosLocale.coverage` lists it, exactly as it listed the old line).
2. **Where the Vehicle order comes from.** The decision file says "from the class rows". I used the dashboard's own
   ordered class list, `VamosOps.VEHICLE_CLASSES` (Economy, Business, Van luxury; it also feeds the Class filter and the
   editor), matched against the label the column shows (`klass`). I did not use the price book's class sort order
   (`ops.rates` `sortOrder`, the one the owner drags): a booking row carries only the label, the store already shows any
   class outside the three as "Economy", and sorting by the price-book rank could disagree with the word on screen. It
   also avoids a second request on this page. Consequence: dragging classes in the price book does not change this
   sort. If the owner wants that, it is a follow-up (the sort function already takes the class list as an argument).
3. **The design-system `Table` has no sort support** (no `sortable`, `onSort`, `sortKey` or `aria-sort`; it draws
   whatever a column's `header` holds). So I built the header button and passed it as `header`. The design-system bundle
   is not touched. `aria-sort` has no prop on the Table's `<th>`, so each header button sets it on its own cell through
   its `ref` (`markSort`), and clears it when another column becomes the sorted one.

## Behaviour as built

Default on every load: newest booked first (`createdAt` descending). Nothing is remembered across reloads (state only,
no storage). One sort at a time. Booked, Vehicle, Driver and Total are header buttons; Pickup, Customer and Route are
plain words as before.

| Header | First click | Click again | Arrow shown (first / flip) | `aria-sort` (first / flip) |
|---|---|---|---|---|
| Booked | newest → oldest (also the default) | oldest → newest | down / up | descending / ascending |
| Vehicle | class order Economy → Business → Van luxury | reverse | up / down | ascending / descending |
| Driver | not assigned first, then assigned | assigned first, then not assigned | up / down | ascending / descending |
| Total | biggest → smallest | smallest → biggest | down / up | descending / ascending |

- Clicking another header makes it the active one in its own first direction (Booked after a flip starts newest first again).
- Ties in every sort: newest booked first (then the order the rows came in).
- Missing value goes last in both directions: no readable booking time (also a time with no zone), no total (a total of
  0 is shown as "CHF 000"), a class that is not in the dashboard's list or no class. "Not assigned" for Driver means the
  row has no driver name; inside "assigned" the order is newest booked first, not by name (not asked).
- Sort applies to the rows the current filter lets through (stat cards, Filter menu, Class, Status, search) and stays when
  the filter changes or is cleared. Any sort click returns to page 1. Paging, filters, other columns, the API order and
  every other screen are as they were.
- Header look: the arrow is `Icon` `arrow-up` / `arrow-down`, the same pair and the same meaning as the Support board
  (down = newest first). The active header shows its arrow in the primary text colour. An inactive header shows nothing
  until hover or keyboard focus, then the muted arrow of the way a click would sort. Where there is no hover at all
  (`@media (hover:none)`, phones) every sortable header shows its muted arrow, otherwise nothing would tell a finger
  that a header sorts. Reserved width, so nothing jumps.
- Real `<button type="button">`, whole header cell is the target: 44 px high (the header row is 44 px, it was about 40);
  focus ring is the design-system `--vt-ring` drawn inset so the table's own scroll box cannot clip it; hover is a
  colour change only. No glow, no tint, logical properties only (`inline-size`, `min-block-size`, `padding-inline`,
  `justify-content:flex-start`), so in Arabic the label starts on the right and the arrow sits after it.
- Accessible name per language, built from the page's own word: en "Sort by Booked", de "Nach Gebucht sortieren",
  fr "Trier par Réservé", ar "الترتيب حسب تاريخ الحجز" (key `sortBy` in the four `T` tables; the name contains the
  visible word). The buttons carry `data-vt-no-i18n` because their words already come from those tables.

## Files

- `app/ops/OpsBoard.dc.html`: `bookedMs` (the booking-time reader `bookedParts` already used, now shared), `SORT_FIRST`,
  `nextSort`, `sortBoardRows` (pure: rows, key, direction, class list → new array), `markSort`, state `sortKey` /
  `sortDir`, `setSort`, `sortHead`, four column headers, `sortBy` in en / de / fr / ar, the CSS block for `[data-vt-sort]`.
- `apps/web/lib/ops/ops-board-sort.test.ts`: new, 48 tests (vm, no DOM).
- `apps/web/lib/ops/ops-board-booked.test.ts`: one assertion changed (the Booked header is now a button, so the test
  reads its text instead of comparing the column's `header` to a string).
- `.planning/quick/261004-ops-board-sort/`: this file, `screens/`, `tools/` (`shoot.mjs`, `rows.mjs`, `serve.mjs`, `mutate.mjs`).

## Pictures (bare crops of the table, real dashboard shell, `/api/*` stubbed)

`screens/sort-<state>-<lang>-<width>.png`, state = `booked` (the default) | `total` | `driver` | `vehicle`, lang = `en` |
`ar`, width = `1440` | `390`: 16 files. Plus `sort-hover-en-1440.png` (mouse over the inactive Vehicle header) and
`sort-focus-en-1440.png` (keyboard focus on Booked).
Seven bookings through the real `mapBoardBooking`, booked across 2025 and 2026, all three classes, two unassigned, totals
CHF 1 to 6 with two equal pairs (to show the tie rule), sent in pickup order, not booked order. Amounts are round
fixtures, names are made up. At 390 the table keeps its own horizontal scroll, so each crop is scrolled to put the sorted
column in view (Booked at the start of the row; Vehicle, Driver and Total further along); the crops show the cell
the sort acts on, not the Booked column. A thin grey line round a crop is the board's own border.
Run again: `node scripts/sync-dc-mock-to-public.mjs`, then `node .planning/quick/261004-ops-board-sort/tools/shoot.mjs <out dir>`.
Result at the final tip: 289 checks passed, 0 failed (list below). German and French: same order and name checks at
1440, no picture.

What the run checks: customer order after every click (first and flip, all four headers, en and ar at 1440 and 390,
de and fr at 1440); `aria-sort` on the active `<th>` only, cleared on the old one; the arrow file of every state; each
header a real button of at least 44 px with the right name; label and arrow inside the header cell; arrow on the
reading-direction end (right to left in Arabic); hidden arrow on an inactive header, shown on hover; Tab reaches
the first header, Enter flips it and focus stays, Tab then Space sorts the next one; `dir` right to left in Arabic;
no sideways page scroll at 390 (table scroll 956 > 324 px); 0 page errors, 0 console errors, 0 failed requests;
(English 1440) the sort survives Unassigned card, flip inside it, Filter menu Clear; `VamosLocale.coverage` (de, fr, ar)
lists nothing from the table header; (English 1440, a control row with no booking time and no total) it is last in
Booked newest/oldest and Total biggest/smallest.

## Checks on the final tip (`f6d25592` plus this file)

- install `pnpm install --frozen-lockfile`: ok (first run offline from the store, 10.9 s; re-run "already up to date")
- sync `scripts/sync-dc-mock-to-public.mjs`: ok (20 pages, comments stripped from 115 files)
- typecheck (4 workspaces): pass
- lint: 0 errors, 6 warnings (unused eslint-disable directives in files this job did not touch)
- lint:css: pass (exit 0)
- i18n:check: passed, 2709 keys
- check:numbers: ok
- check:public-env: pass (the built-bundle scan was skipped: no build output)
- check:db-fences: 8 of 8 passed, 1200 files
- db:seed:check: no drift
- vitest `lib/ops` + `lib/checkout/phase-26-3-laws` + `lib/security/ops-assets-gateway` + `lib/icons`: 127 files passed,
  11 skipped; 1452 tests passed, 17 skipped (includes board-paid, ops-live-data, customers-board twin check, all ops-dc-*
  tests and the icon guard `icon-files-exist.test.ts`; no new icon binding: the arrow names are plain script literals, both
  files exist in `assets/icons`, and `dynamic-icon-bindings.ts` needed no change)
- the two board test files plus the icon guard alone: 3 files, 75 of 75
- `node --test scripts/strip-public-comments.test.mjs`: 10 of 10
- mutation check (`tools/mutate.mjs`): 34 deliberate breaks, 34 caught (default direction, each header's first direction,
  no flip, tie rule, missing-last, direction ignored, class names written into the sort, unknown class first, zero total
  counted, Booked sorting by pickup, Driver by name, unsorted rows paged, page kept, `aria-sort` never cleared / words
  swapped, arrows swapped, name without the word, German phrase equals English, Pickup made sortable, 44 px, focus
  ring, cell padding, filter menu / stat card / Clear resetting the sort, sort remembered in storage, zone-less time read,
  arrow hidden when active, no cue without hover, translator reading the buttons). One survived the first run (the
  active arrow hidden through a grouped CSS rule); the CSS pin was tightened and it is caught now.

## NOT verified

- Not run against the live database or the live Worker: real `created_at` values, the real class list on live rows, and
  the live dashboard host (`/app/ops/*` needs a staff session there). After deploy, open Bookings on
  https://dashboard.vamostaxi.site: newest booked first on load; click Booked, Vehicle, Driver, Total and click each again.
- Chromium only (headless, desktop). Not Safari or Firefox (`:has()` on the header cell, `box-shadow: inset var(--vt-ring)`),
  not a real touch device (the `hover:none` cue is a CSS rule, never seen on a phone), not a screen reader: `aria-sort` and
  the names are read from the DOM, nobody listened to them.
- The pictures at 390 are a desktop browser at phone width, so the inactive-arrow cue there is hover-only, as at 1440.
- German and French have no pictures (order, names and header text checked at 1440).
- Not run: the full `test:unit`, the Playwright suites (`ops-26-3-widths.spec.ts` shares the file; its filter and
  empty-state clicks go through stat-card and Filter buttons, which this job did not touch), the local-database tests
  (`*.local.test.ts`), the test lab, print preview.
- Not tried with more than 20 rows on a real screen (paging was tested in the unit test: a sort click returns to page 1,
  the first page then holds the 20 biggest).

## Ship notes

Merge, install from the lockfile, run the gates in a clean clone, deploy Worker `vamos` with `--env staging` as usual,
then the Bookings page on the dashboard host in English and Arabic as above. The branch is pushed; delete the worktree
and branch after the ship.
