# HANDOVER — quick 261004 address list: airports first, stations by name

Branch `fix/address-airport-first`, cut from `origin/main` `5e3e2aa2`. Job session: nothing on main, nothing deployed, live database and Mapbox not touched. `origin/main` had not moved at hand-over (`git merge origin/main`: already up to date).

Code commit: `33f3aac1`. The final commit of the branch is the one that adds this file (see the branch tip; its message starts `docs(planning): hand-over`).

Owner decision (2026-10-04 14:38 +04, `.planning/decisions/2026-10-04-address-airport-first.md`): airports at the top when the list has one, Mapbox's order for the rest; Mapbox results named "… Station" / "HB" get the STATION kind with the train.

## What changed, in plain words

1. **Airports first, decided in one place.** `suggest()` in `apps/web/lib/geo/mapbox.ts` now ends with `airportsFirst()`: if any suggestion is kind `airport`, all airports lead (Mapbox order among themselves), then everything else in Mapbox's order. No airport in the list: the list is returned untouched. `/api/geo/suggest` is the only caller of `suggest()`, and no client re-sorts (checked below), so the home mock, ops address fields and the React lists all get the new order from the server.
2. **Station by name.** `suggestionKind()` reads the name in one spot, `genericKind()`: the whole word `Station` (any case) or `HB` (capitals only) gives kind `station`. The name only fills the two generic kinds (`poi`, `place`). Mapbox's own data always wins over the name: airport, hotel (by category or maki), address/street and city/postcode/region keep their kind. So "Zurich Main Station" and "Zürich HB" with no rail category become STATION, "Zurich Airport Station" with an airport category stays AIRPORT, "Station Hotel Zurich" with a hotel category stays HOTEL, "Station Road" (street) stays ADDRESS.
3. **One guard I added, not in the brief.** Checkout's stale-link fallback (`resolveByText` in `apps/web/lib/checkout/checkout-quote.ts`) takes `suggestions[0]` as the place for a typed address. With airports first, a saved address like "Zürich, Switzerland" could silently resolve to Zurich Airport (a different fare). That one call now sends `&order=mapbox`; the route accepts `order=mapbox` (any other value is refused as `untrusted_input`) and skips the airport-first step. Lists customers read never send it.
4. Popular picks (empty field) are untouched. No new visible string: `app/vamos-i18n-dict.js` and the React message files are unchanged (`Station`, `Airport` labels already exist in the home mock).

## Files changed (exact)

- `apps/web/lib/geo/mapbox.ts` (kind by name, `airportsFirst`, `mapboxOrder` input)
- `apps/web/app/api/geo/suggest/route.ts` (`order=mapbox` query value)
- `apps/web/lib/checkout/checkout-quote.ts` (`&order=mapbox` on the fallback lookup)
- `apps/web/lib/geo/mapbox.test.ts`
- `apps/web/lib/geo/suggest-route.test.ts`
- `apps/web/lib/checkout/checkout-quote.test.ts`
- `.planning/quick/261004-address-airport-first/HANDOVER.md` (this file)

## Which wins: a hotel named "… Station"

The **hotel category wins**; it shows HOTEL with the bed. Why: the category is Mapbox's own classification of what the place is; the name is a hint. A "Station Hotel" or "Hotel Zürich HB" is a place you sleep in, and a train icon would send a customer to the wrong kind of place. Same rule for every specific kind (airport, hotel, address, city): a name only fills the generic `poi` / `place` fallback. Pinned in the test "lets Mapbox's own category win over the name".

## Checks (all on commit `33f3aac1`, in this worktree)

| Check | Result |
|---|---|
| `pnpm install --frozen-lockfile` | done, lockfile unchanged |
| `node scripts/sync-dc-mock-to-public.mjs` | synced (20 pages, 19 app entries) |
| `pnpm --filter web exec vitest run lib/geo lib/checkout/checkout-quote.test.ts` | 6 files, 105 tests passed |
| neighbours: `lib/abuse lib/dc-mock-urls.test.ts lib/ops/ops-dc-bp.test.ts lib/checkout lib/auth/callback-redirect.test.ts` | 117 files passed, 3 skipped; 1413 tests passed, 7 skipped |
| `pnpm run typecheck` | pass (db, emails, isolation-probe, web) |
| `pnpm run lint` | 0 errors; 6 warnings, all unused eslint-disable directives in files this job did not touch |
| `pnpm run check:db-fences` | 8 of 8 checks passed |
| `pnpm run i18n:check` | passed (2699 keys, no new key) |

Tests added or rewritten: the "zur" list (airport to the top, five others keep their order, station by name last), no-airport list untouched, two airports keep their relative order, `mapboxOrder` keeps Mapbox's order, `airportsFirst` stable and empty-safe; "Zurich Main Station", "Zürich HB", "Bern HB", "Basel Station" to station; whole-word and capitals-only cases ("Stationsstrasse", "Substation", "Hb", "hb", "HBF", "SHB" stay `poi`); airport named "… Station" stays airport; hotel named "… Station" stays hotel; street/address/city never become station; the route answers airport first and refuses `order=price`; the checkout fallback sends `order=mapbox`. The old test "derives kind … never the name" was rewritten to compare name to kind instead of list position, because the airport now moves.

## No client undoes the order (read, not run)

- `app/home/home.dc.html` (`geoSearch`, `paintSug`): maps the list in the order received, `slice(0, 10)`, no sort.
- `app/ops/PlaceSearch.dc.html`, `OpsNewTrip.dc.html`, `OpsTable.dc.html`: map in order, no sort. Ops side effect: `PlaceSearch` preselects the first hit, so Enter in an ops address field now takes the airport when the list has one.
- `apps/web/components/forms/PlaceCombo.tsx` (React, used on `/checkout` trip editor and the home card twin): renders in order, no sort.

## NOT verified

- No browser run, no live Mapbox. Everything is unit tests with injected Mapbox shapes. Whether Mapbox sends "Zurich Main Station" as `poi` or `neighborhood`/`district` with no rail category is inferred from the owner's live observation (PLACE with a pin). If it came as `place`/`locality` (CITY label) the name rule would not touch it; the live check in UAT 1 settles this.
- The Mapbox category strings are not recorded anywhere in the repo (fixtures are hand-written); a station that has a category the existing rail list does not know and a name without Station/HB stays PLACE.
- **The React list (`PlaceCombo`) does not read `kind` at all.** The brief says the twins show icon plus label by kind; they do not. On the `/checkout` trip editor the new order applies (it comes from the server), but the icons there are still plane (name regex) or pin, with no STATION label and no train. Adding kind icons there is UI work for the customer's `/checkout` page, so I left it. Say if you want it as the next job.
- Full Playwright and visual suites were not run (not in scope).

## Suggestions only (not built)

- Extra station words the owner did not name: Bahnhof, Hauptbahnhof, Bahnhof/Gare/Stazione in de/fr/it results, SBB, "Railway". Not added.
- The word `Station` also matches "Gas Station", "Police Station", "Fire Station" and French "Station de ski" when Mapbox gives them no hotel/airport kind. They would get a train. Easy to narrow (skip when the category names fuel, police, fire) if live shows it; I did not guess Mapbox's category strings.

## Owner UAT (after the controller ships)

1. On vamostaxi.site home, click From, type `zur`. Expected: Zurich Airport is the first row, with a plane and the word AIRPORT. Zürich, Zurich, Bad Zurzach and the other rows follow in the order they had before. Zurich Main Station shows a train and the word STATION (not PLACE with a pin).
2. In From type `zürich hb`. Expected: any row named "… HB" shows the train and STATION. If Mapbox names it "Hauptbahnhof" instead, it shows PLACE; that name is not in your rule (see suggestions).
3. In From type `basel`. Expected: Basel Airport (EuroAirport), if Mapbox returns it, is the first row with a plane; the rest keep Mapbox's order.
4. In To type a street, `bahnhofstrasse zürich`. Expected: no airport in the list, so the order is exactly what it was; the streets show ADDRESS with a pin, none shows STATION.
5. Clear From. Expected: Popular picks are unchanged: Zurich Airport, Geneva Airport, Basel Airport (planes) and Zurich HB (train, STATION).
6. Pick Zurich Airport in From and Zurich Main Station in To, continue to `/checkout`. Expected: prices show as before. On the trip editor, type `zur` in From: the airport is first (it will show a plane or pin, no STATION label there; see NOT verified).
7. Dashboard, New trip, From, type `zur`. Expected: airport first.

After a deploy that touches `/api/geo/suggest`, the 4242 test payment from the standing rule is not required: no checkout, money or database code changed. The one checkout-side change is the lookup URL of the stale-link fallback.
