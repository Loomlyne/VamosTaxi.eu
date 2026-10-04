# 261004 ops-dash-numbers: hand-over

Owner, 2026-10-04 (verbatim): "now i want to fix the dashboard because it not reading or calculating anything"

Branch `fix/ops-dash-numbers`, cut from `origin/main` `71d0da5a` (origin/main had moved from `d40ad326` by the time
the branch was cut). Nothing deployed, no live writes. Live reads were read-only SELECTs (MCP), including the
dashboard SQL run as `vamos_staff` inside `begin read only … rollback`.

## What "nothing" was

The money API works on live: `pg_stat_statements` shows 8 calls of the income query and no Postgres errors in the
last 24 h, and the lab answers `200 {ok:true,data:{…}}` for every period. The stores fill on `/dashboard` itself
(lab: 0 rows at first paint, 25 bookings and 1 chauffeur about a second later, no board visit needed). On the
default period (Today) the screen shows mostly zeros because of what three tiles count (questions Q1–Q3 below,
not built) plus the faults fixed here.

## Root causes, fixed

1. **Day boundary 4 h late** — `apps/web/lib/ops/bookings.ts` (was line 302, 310, 323):
   `${fromYmd}::date at time zone 'Europe/Zurich'` turns the date into a Zurich wall clock and Postgres reads it back
   in the session zone (UTC on live, checked: `TimeZone = UTC`). Today began at 02:00 UTC = 04:00 Zurich in summer
   (03:00 in winter). A fare captured between midnight and 04:00 left Today, 7 days and 30 days; refunds the same.
   Lab proof (`tools/day-boundary-proof.sql`, rolled back): a capture at 00:30 Zurich, old filter 1 row / CHF 100.39,
   new filter 2 rows / CHF 150.39. Fix: `zurichMidnightUtc()` / `periodStartUtc()` bind the Zurich-midnight instant
   (`2026-10-03T22:00:00.000Z` for 4 Oct) as `timestamptz`.
2. **Average fare used two different sets of rows** — `app/ops/OpsDash.dc.html` (was lines 282-284): server income
   (every captured payment) divided by a count of the board's rows (no erased bookings, class-change difference
   folded in). Live 30 days / all time read **CHF 93.38**; true is **CHF 87.15** (CHF 1,307.32 / 15 fares).
   Fix: the API returns `fareCount` (captured payments that are not a class-change difference).
3. **Money in by class did not add up to Income** — OpsDash (was lines 319-322) summed `totalRappen` (the latest
   price snapshot) of the board's rows. Live 30 days: Business **CHF 636.04**, lines total CHF 1,207.32 of CHF 1,307.32
   (the erased VT-26-0716 fare was missing). Fix: the API returns `byClass` from the same payments as Income
   (class = first leg, D-14 names; anything else reads Economy as on the board). Business now CHF 736.04.
4. **Expenses foot said "None recorded" next to CHF 35.56** — OpsDash line 59 was static. Now "Refunds and fees"
   when there is any (de/fr/ar added).
5. **Period race** — OpsDash `loadMoney` (was 237-246): whichever answer landed last won, so a quick
   30 days → Today switch could leave 30-day money under Today. Answers for a period no longer on screen are dropped.
6. **Date line in English in every language** — OpsDash `zurichParts()` used `en-GB` ("Sunday 4 October" in Arabic).
   Now Intl in the reader's language, line marked `data-vt-no-i18n`; period subtitles through `VamosLocale.t`.
   Arabic period pills used ٣٠/٧ while the dictionary uses Latin digits; aligned so `coverage()` is clean.
   Refund lines (a name and a reference) are data: `data-vt-no-i18n`.
7. **Pickups counted unpaid checkouts** (own commit `cb9db290`, drop it if the owner reads Pickups differently):
   an unpaid pending booking with a pickup in the period counted as "Scheduled to run". Live 7 days 8 → 7
   (the extra one is an unpaid checkout with pickup 2 Oct). The board's own "Pickups today" counts paid only.

Commits: `61f6b718` (server), `a59499d2` (screen), `cb9db290` (Pickups), plus this planning commit.

## Tests (fail before, pass after)

- `apps/web/lib/ops/dashboard-money.test.ts` (new, 10): Zurich midnight summer/winter/both clock-change days;
  period starts; 00:30 Zurich is inside Today; the bound value is the instant and no `::date at time zone`;
  live all-time rows → income 130732, fareCount 15, class lines 33660/73604/23468 add to income; class names.
- `apps/web/lib/ops/ops-dash-numbers.test.ts` (new, 7): average CHF 87.15 (was CHF 93.38); class lines add to
  Income; money tiles do not wait on the board rows; Expenses foot; Pickups paid only; late answer dropped;
  date line in the reader's language.
- Run against `origin/main`'s `bookings.ts` + `OpsDash.dc.html`: all 17 failed (Pickups: 3 instead of 2;
  average: CHF 93.38 instead of CHF 87.15).
- `ops-live-data.test.ts`: one assertion moved from "screen filters by capturedAt" to "server filters by captured_at;
  screen reads fareCount/byClass".

## Each tile, live numbers (lab with live-shaped rows: same 16 captures, times, classes, 1 refund, erased booking)

Today = Sun 4 Oct, Zurich. "Before → After"; unchanged where one value.

| Tile | Today | 7 days | 30 days | All time |
|---|---|---|---|---|
| Income | CHF 100.39 | CHF 859.22 | CHF 1307.32 | CHF 1307.32 |
| Expenses | CHF 000 | CHF 35.56 | CHF 35.56 | CHF 35.56 |
| Expenses foot | None recorded | None recorded → Refunds and fees | same | same |
| Net | CHF 100.39 | CHF 823.66 | CHF 1271.76 | CHF 1271.76 |
| Average fare | CHF 100.39 | CHF 78.11 | CHF 93.38 → **CHF 87.15** | CHF 93.38 → **CHF 87.15** |
| Money in Economy | CHF 000 | CHF 336.60 | CHF 336.60 | CHF 336.60 |
| Money in Business | CHF 100.39 | CHF 287.94 | CHF 636.04 → **CHF 736.04** | CHF 636.04 → **CHF 736.04** |
| Money in Van luxury | CHF 000 | CHF 234.68 | CHF 234.68 | CHF 234.68 |
| Money out | none | VT-26-0746 refund CHF 35.56 | same | same |
| Bookings (by pickup date) | 0 | 9 | 19 | 25 |
| Pickups | 0 | 8 → 7 | 9 → 8 | 14 → 11 |
| Chauffeurs on shift | 0 / 1 | 0 / 1 | 0 / 1 | 0 / 1 |
| Unassigned (pickup in period) | 0 | 7 | 7 | 10 |
| Awaiting payment (pay link sent) | 0 | 0 | 0 | 0 |
| Pending edits | 0 | 0 | 0 | 0 |

The boundary fault (1) changes nothing on today's live rows (no capture between 00:00 and 04:00 Zurich in any window
start day); it shows on the first such capture. Network: `/api/staff/dashboard?period=…` 200 for all four,
`/api/staff/bookings` and `/api/staff/chauffeurs` 200 on `/dashboard` directly. No page errors.

Four languages: `VamosLocale.coverage(main)` empty in en, de, fr and ar at 1440 and 390 (Today and 7 days);
no sideways scroll at 390; Arabic `dir=rtl`, date "الأحد، 4 أكتوبر".

Pictures (`screens/`, bare crops): `before-en-1440-today.png`, `before-en-1440-all.png`, `before-ar-390-today.png`,
and the same three `after-*`. Reads per period: `evidence/before-read.json`, `evidence/after-read.json`.
Tools: `tools/live-shaped-fixture.sql` (lab rows), `tools/dash-proof.mjs`, `tools/dash-langs.mjs`,
`tools/day-boundary-proof.sql`.

## Questions for the owner (not built)

Q1. **Bookings "Taken in this period" counts by pickup date.** Recommended: count by when the booking was made.
Example: Today reads 0 although VT-26-0753 was booked today at 18:34; 7 days would read 15 instead of 9.

Q2. **"Needs attention" only counts trips whose pickup falls in the chosen period, and the periods only look back.**
Recommended: count every open item, whatever the period, exactly what the linked board filter opens.
Example: Today shows "Unassigned 0" while VT-26-0750 runs tomorrow at 04:10 with no chauffeur; the board's
Unassigned filter lists 10.

Q3. **"Awaiting payment" means "pay link sent, not paid" on the dashboard but "not paid yet" on the board it opens.**
Recommended: the number counts what the link opens (the board's Awaiting payment), note "Not paid yet".
Example: the dashboard shows 0, the board shows 3 (unpaid checkouts from 1 and 2 Oct).

Q4. **The Stripe fee is never recorded** (`stripe_fee_rappen` is empty on all 16 payments), so Expenses and Net leave
it out. Recommended: record each payment's Stripe fee when the payment settles and show it as the existing
"Stripe fee" line. Example: Net for 4 Oct reads CHF 100.39, the full VT-26-0753 fare, before what Stripe kept.

Q5. **"Chauffeurs on shift" counts chauffeurs whose weekly shift (days and hours) covers this minute.** Recommended:
keep that meaning and set the shift on the chauffeur's page. Example: it reads 0 / 1 because the one chauffeur has
no shift days or hours set.

Q6. **Loading and failure look like zero.** For about a second after opening, and for good if
`/api/staff/dashboard` fails (session expired, 500), every money tile reads CHF 000, the same as a real zero.
Showing "Loading" or "Could not load, try again" needs a picture to sign. Recommended: a short muted line under the
Money heading, drawn first. Example: in the lab the first paint read Income CHF 000 before CHF 100.39.

## Checks run (this worktree)

- `pnpm --filter web exec vitest run` on dashboard-money, ops-dash-numbers, ops-live-data, ops-dc-u08,
  edit-request, ops-dc-finalize, tests/unit/locale-pattern-switch: 7 files, 121 tests pass.
- `pnpm typecheck` pass. `pnpm lint` 0 errors (6 warnings, none in changed files). `pnpm i18n:check` pass.
  `pnpm check:db-fences` 8/8 pass.
- Not run: full `test:unit`, pgTAP, visual specs (controller's gates).

## Not verified

- Live after the change (nothing deployed). The SQL itself was run on live as `vamos_staff` read-only and returned
  the expected class split (Business 44810 + 28794, Economy 33660, Van luxury 23468, 15 fares).
- A real capture between 00:00 and 04:00 Zurich through the Worker (shown on the lab database with SQL only).
- Tablet widths 1024/768 (checked 1440 and 390 only; layout untouched).
