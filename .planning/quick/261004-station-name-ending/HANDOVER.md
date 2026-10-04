# HANDOVER — quick 261004 STATION only when the name ends with Station / HB

Branch `fix/station-name-ending`, cut from `origin/main` `0c7adc39`. Job session: nothing on main, nothing deployed, live database and Mapbox not touched. `origin/main` had not moved at hand-over (`git merge origin/main`: already up to date, so the touched tests ran on the merged tree).

Code commit: `2ef45307`. The final commit of the branch is the one that adds this file (message starts `docs(planning): hand-over`).

Owner decision (question form, 2026-10-04 14:54 +04, `.planning/decisions/2026-10-04-address-airport-first.md`, "Follow-up"): "Only names ending". STATION only when the name ends with "Station" or "HB". The rental "The cozy house – 15 min to Zurich main station" goes back to a pin. Airport and the other specific kinds still win.

## What changed

`apps/web/lib/geo/mapbox.ts`, the two name rules used by `genericKind()` (only for the generic kinds poi and place; airport, hotel, address and city from Mapbox's own data still win):

- Before: `/\bstation\b/i` and `/\bHB\b/` anywhere in the name.
- Now: `STATION_WORD = /\b(?:Station|STATION)[\s\p{P}]*$/u` and `HB_WORD = /\bHB[\s\p{P}]*$/u`. The word must be the last word; trailing whitespace and punctuation (for example `Zürich HB)` or `Zurich Main Station.`) are allowed, nothing else after it. Whole word still required ("Substation", "Stationsstrasse", "SHB", "HBF" do not match).

Airports-first order (`airportsFirst`), `order=mapbox`, the checkout fallback and every client are untouched.

## One decision for the controller: capital S, not "any case"

The brief said "Station (whole word, any case)" and also that the cozy house must go back to a pin. Both cannot hold: "The cozy house - 15 min to Zurich main station" ends with the word `station` in lower case, so an any-case end match makes it a station again. I kept the explicit outcome (cozy house is a pin) and matched `Station` capitalised or `STATION` all capitals, like `HB` (capitals only). This is also the owner's own spelling ("Station", "HB"; "Zurich Main Station"). Cost: a real station whose Mapbox name ends in a lower-case "station" and has no rail category stays PLACE/pin. One-line change if the owner wants any case with another way to exclude the cozy house (the regex is `STATION_WORD` in `mapbox.ts`).

## Files changed (exact)

- `apps/web/lib/geo/mapbox.ts`
- `apps/web/lib/geo/mapbox.test.ts`
- `.planning/quick/261004-station-name-ending/HANDOVER.md` (this file)

## Tests (all in `apps/web/lib/geo/mapbox.test.ts`)

Every existing case still passes except one input I had to change: the old case `"station zurich"` (poi) expected `station`; under "only names ending" it is `poi` now. It moved into the new "ENDS with" test. Nothing else was edited.

Added:
- "The cozy house - 15 min to Zurich main station" (hyphen) and the same with an en dash: `poi`, not station.
- "Station Hotel Zurich" (generic poi, no hotel category): `poi`.
- "Zurich Main Station", "Zürich HB", "Bern HB", "Basel Station" (neighborhood): `station` (existing case kept).
- "Zürich HB Sihlquai", "Zurich Main Station Taxi Rank", "station zurich": `poi`; "Station Road Garage" (neighborhood): `place`.
- Trailing whitespace and punctuation: "Zurich Main Station ", "Zurich Main Station.", "Zürich HB)", "Zürich HB ", "ZURICH MAIN STATION": `station`.
- Unchanged and still green: airport named "… Station" stays airport, hotel named "Station …" / "Hotel … HB" stays hotel, street/address/city never station, airports-first tests.

## Checks (on commit `2ef45307`, in this worktree)

| Check | Result |
|---|---|
| `pnpm install --frozen-lockfile` | done |
| `node scripts/sync-dc-mock-to-public.mjs` | synced (20 pages, 19 app entries) |
| `pnpm --filter web exec vitest run lib/geo lib/checkout/checkout-quote.test.ts` | 6 files, 107 tests passed |
| `pnpm run typecheck` | pass (db, emails, isolation-probe, web) |
| `pnpm run lint` | 0 errors; 6 warnings, all unused eslint-disable directives in files this job did not touch |
| `pnpm run check:db-fences` | 8 of 8 checks passed |
| `pnpm run i18n:check` | passed (2699 keys, no new key) |
| `git merge origin/main` | already up to date (`0c7adc39`) |

## NOT verified

- No browser run, no live Mapbox: only unit tests with injected shapes. Whether the real Mapbox name for the main station ends in a capital "Station" (live showed "Zurich Main Station") and for Zürich HB in "HB" is taken from the owner's live observation and UAT 1 below.
- Full unit set, build, Playwright and visual suites were not run (touched-tests job).
- Stations with a lower-case ending ("... station") and no rail category (see decision above).

## Owner UAT (after the controller ships)

1. On vamostaxi.site home, click From and type `zurich main station`. Expected: Zurich Main Station shows a train and the word STATION. Any row like "The cozy house - 15 min to Zurich main station" shows a pin and PLACE, not STATION.
2. Type `zürich hb`. Expected: a row named "Zürich HB" shows a train and STATION; a row such as "Zürich HB Sihlquai" (if listed) shows a pin.
3. Type `zur`. Expected: Zurich Airport is still the first row with a plane and AIRPORT; the rest keep Mapbox's order.
4. Type `bern`. Expected: "Bern HB" (or the Bern main station row) shows a train and STATION; a hotel with "Station" in its name shows the bed (HOTEL).
5. Clear From. Expected: Popular picks unchanged (Zurich Airport, Geneva Airport, Basel Airport, Zurich HB with the train).

No checkout, money or database code changed: the 4242 test payment is not required.
