# Comment 6: one booking form, the server decides the fare parts (research)

**Researched:** 2026-09-29
**Worktree:** `/Users/koss/Developer/vamos-wt/fix-26.3-followups` (branch `fix/26.3-account-link`, shipped main af93fc8e plus the account fix)
**Mode:** read-only. No live API was called. Live-data facts the orchestrator has to supply are listed under Open questions.
**Confidence:** HIGH for the code traces (read line by line). MEDIUM for live/dead status (read from middleware and import graph, not from a browser).

## Summary

The server already builds every fare part from pickup and destination alone. `priceQuote` → `buildClassLines` (apps/web/lib/pricing/priceQuote.ts:181-288) always emits, per leg:
1. the distance fare (start + per km × km),
2. the airport fee when the pickup is an airport,
3. at most ONE city-or-canton pair amount,
4. then the ticked extras and the coupon.

The only request field that still names a trip type is `fare_kind`. It is parsed and pinned on the lock, but it changes no amount (lines.ts:524-531, 595-597; priceQuote.ts:213-227). `mode` is still required, but every live caller sends `"one_way"`. `return` only adds a second leg. `hourly` is refused.

The live home booking box (26.3, `app/home/home.dc.html:2096-2134`) already has no tabs and sends no mode. What remains is leftover wording and navigation: `?service=airport|city|hourly` links, the hero kicker, the Services cards, the Stripe product name "Airport transfer", ops pricing copy, and dead mode state inside home.dc.html.

**Verdict for all four cases: form and copy only. No calculation change is needed to meet the owner formula.** Two behaviours differ from the owner's wording, and he should confirm them:
- A flight number on its own also triggers the airport fee (lines.ts:584-586).
- An extra stop drops the pair amount (lines.ts:470, D-17).

## Architectural Responsibility Map

| Capability | Primary tier | Secondary | Rationale |
|---|---|---|---|
| Is the pickup an airport | API (Mapbox retrieve/reverse `isAirport`, pipeline.ts:305-347; zone_type via attachPlaceZones) | Browser (only to show or hide the flight field) | Schema forbids client `is_airport` (schema.ts:53-62) |
| City or canton pair match | API (lines.ts:347-532) | Database (fixed_routes + service_zones tags) | Server-resolved city ids and cantons |
| Fare arithmetic | API (priceQuote.ts, lines.ts, policy.ts) | — | Pure kernel |
| Extras, fixed coupon before VAT, VAT | API (checkout-charge.ts:73-175, payable.ts) | — | Codes only from the browser |
| Trip-type wording | Browser (DC mocks, React shell) | Content strings | Copy only |

## 1. Inventory: trip types still shown as separate choices

"Live" means reachable on vamostaxi.site or /dashboard today. Public DC mocks are served through `apps/web/middleware.ts:30-50` (home, about, terms, cancellation, bookings…). /checkout and /confirmation are React, with the React `SiteShell` header and footer (`app/[locale]/layout.tsx`). The ops console is `app/ops/ops.dc.html`, which includes OpsNewTrip at line 218 and OpsPricing.

### Public site

| Place | file:line | What the customer sees | Live/dead |
|---|---|---|---|
| Home booking box | app/home/home.dc.html:2096-2134 | 6 fields, no tabs. Flight field only when the pickup is an airport (`pickupAir` 2039). Sends from/fid/to/tid/when/pax/bags/flight to /checkout; no mode | LIVE (already one form) |
| Home legacy mode state | home.dc.html:1129 (`mode:'point'`, `fixedKey`, `fixedRoutes`), 1174-1188, 1193, 1368, 1411, 1419-1420, 1558-1566, 1597, 1791-1797 | Nothing visible. Mode only picks the hero photo (2152-2154, template lines 323-325) and a screen-reader note (`modeNoteFor`) | Dead logic kept alive by the hero slides |
| Home mode strings (4 languages) | home.dc.html:804, 808, 814, 827, 832-833 (en); 863/873/887/892 (de); 922/932/947 (fr); 957/967/982 (ar) | `One way`, `Airport pickup`, `City to city`, `Return`, `By the hour`, `Trip type`, `modeFixed: Pick a published route`, `fixedMiss: …try One way` | Mostly unused; `modeNoteFor` can still announce them |
| Hero kicker via `?service=` | home.dc.html:991-996 (`SVC`, `SVC_KICKER`), 1203-1214, 2185 | Hero eyebrow changes to "Airport transfers · Zurich" / "City to city · Switzerland" / "Chauffeur by the hour" | LIVE |
| Services cards | app/home/Services.dc.html:150-151 (`Airport transfers`, `?service=airport`), 155-156 (`City to city`, `?service=city`), 165-166 (hourly, behind `showChauffeurByHour`, default off) | Two service cards that suggest two booking types | LIVE (hourly card hidden) |
| Header service nav (DC) | app/home/SiteHeader.dc.html:599-600; app/pages/SiteHeader.dc.html:599-600 | "Airport transfers", "City to city" menu links | LIVE |
| Footer service links (DC) | app/home/SiteFooter.dc.html:127-129; app/pages/SiteFooter.dc.html:127-129 (+341 `showHourly`) | "One way", "Airport transfers", "City to city" | LIVE |
| Header/footer (React shell) | apps/web/components/shell/SiteHeader.tsx:327-329; SiteFooter.tsx:48-49, 186, 189 | Same links on /checkout and /confirmation | LIVE |
| HowItWorks destinations | app/home/HowItWorks.dc.html:1505 (`oneWay:'One way'`), 1498 ("One way only."), 1512-1513 ("Book an airport transfer"), 1623-1632 (`?service=one-way`), 1753-1758 (`mode` sent in `vamos:dest-pick`, URL rewritten to `?service=airport` / `one-way`) | Destination chips labelled by trip type | LIVE. The 1498/1512 copy is fine; 1753-1758 still drives the old mode |
| Stripe hosted page product name | apps/web/lib/checkout/intent.ts:528 `productName: "Airport transfer"` | Every card payment, including city rides, says "Airport transfer" on Stripe | LIVE |
| Terms copy | app/pages/terms.dc.html:199 ("…airport pickups and drop-offs, city and long-distance journeys, and chauffeur bookings by the hour") | Legal copy that lists service types | LIVE. Legal copy: owner decides, do not edit on our own |
| Cancellation/terms waiting rule | cancellation.dc.html:270, terms.dc.html:259/291, React terms/page.tsx:184/225, cancellation/page.tsx:289 | "Airport pickups: 60 minutes…" | LIVE. This is a waiting-time policy, not a trip type. Keep it |
| Checkout (React) fare rows | apps/web/lib/checkout/price-rows.ts:52-80; CheckoutForm.tsx:508 | "Airport pickup fee" and "{A} – {B} route" rows appear only when the server added them | LIVE. This is the right pattern. Keep it |
| React home BookingBoard | apps/web/components/home/BookingBoard.tsx:291-293 (`mode:"one_way"`, `kind:"coords"`), 488 (`fixed_route` badge) | — | DEAD. Only tests import it |
| React Services | apps/web/components/home/Services.tsx:19, 31, 61, 79-85 | — | DEAD. Only /dev gallery |
| DC checkout/confirmation mocks | app/pages/checkout.dc.html:147, 181 (`oneWay`/`return_`); confirmation.dc.html:108 | — | DEAD. Not in the middleware map; React owns those routes |
| bookings.dc.html hourly row | app/pages/bookings.dc.html:512-519 | "Chauffeur, N hours from…" only when `r.hours` is set | LIVE, but unreachable with V1 data |

### Ops dashboard

| Place | file:line | What staff see | Live/dead |
|---|---|---|---|
| New trip form | app/ops/OpsNewTrip.dc.html:163-192 | Pickup, drop-off, date, time, pax, bags, class, **Flight (always shown)**, 3 hard-coded extras (child seat, extra stop, oversized luggage). Body sends `mode:'one_way'`, no `fare_kind`. Flight goes into `flight_no` on every trip (177) | LIVE. No trip-type tab. The flight field is not tied to an airport pickup |
| New trip flight → reprice | OpsNewTrip.dc.html:262 (`setFlight: this.setField('flight')`) | Typing a flight after the quote does not re-quote. The fee shows only if the flight was typed before the quote fired | LIVE bug-risk |
| Pricing tabs | app/ops/OpsPricing.dc.html:387-388, 393-395 | Tabs "City to city", "Distance rules" (Start, Per km, "Airport pickup fee (added to start)"), "Surcharges & extras", "Coupons" | LIVE. These are price-book tables, not booking modes. Accurate: the airport fee is a column, and pairs are rows applied automatically |
| Pricing copy contradiction | OpsPricing.dc.html:395 `hintRoutes:'One pair covers both directions'` vs 401 `emptyRoutesBody:'…A to B and B to A are separate rows…'` (the same pair of lines exists in de/fr/ar) | Staff are told two opposite things. The engine matches both directions (lines.ts:367-369, 425-427) | LIVE, misleading |
| Distance-rules legacy "city price" | OpsPricing.dc.html:256-330 (`cityPairMemory`, `cityPairIdForRate`), 395 `cityPrice:'City price and per kilometre'`, 1493, 1523, 1531, 1561 | Not rendered: `distanceFields` 1512-1520 has no cityPrice field. The save still writes `cityPrice` → `distance_rates.city_price_rappen` | Dead UI. The engine ignores `city_price_rappen` (buildCityPriceLine lines.ts:239 is never called) |
| Ops calendar hints | OpsCalendar.dc.html:80, OpsCalendarBoard.dc.html:139 `hFlight:'Only for an airport pickup.'` | Hint text | LIVE, accurate |
| Ops detail line label | OpsDetail.dc.html:542 (+584/655/704) `lineAirportFee` | Line label | LIVE, accurate |
| Ops board/bookings filters | OpsBoard/OpsDash/OpsTable | No trip-type filter found (grep) | n/a |
| Surcharge code `airport_pickup` | apps/web/lib/ops/surcharge-codes.ts:5, 37 (AUTOMATIC) | A surcharges-tab row code that could also charge an airport pickup through a `pickup_zone_type` predicate | See Risk R3 |

### API and schema parameters

| Param | file:line | Effect today |
|---|---|---|
| `mode` (`one_way`/`return`; `one-way` normalised; `hourly` → `mode_not_offered`) | lib/quote/schema.ts:152, 280-301, 334-339; app/api/quote/route.ts:103-104 | Required. Sets the leg count and adds the `return_trip` line (priceQuote.ts:263-272; policy.ts:122-126). All live callers send `one_way` (checkout-quote.ts:106, OpsNewTrip.dc.html:174) |
| `fare_kind` (`one_way`/`airport_pickup`/`city_to_city`, optional) | schema.ts:163-167, 345-350; types.ts:35-46, 284; pipeline.ts:384, 431, 764; lock.ts:131-135, 278-281 | Parsed, defaulted to `one_way`, pinned on the lock. **No amount depends on it**: buildFareLine takes `fareKind` and ignores it (lines.ts:524-531). Airport fee and pair ignore it (priceQuote.ts:213-237). No live client sends it. Reprice refuses it (schema.ts:379) |
| `trip_type`, `service` | none in `/api/quote` or the quote schema (grep) | `service` exists only as the home URL query `?service=` (UI) |
| GET `/api/quote` `fixed_routes` catalogue | app/api/quote/route.ts:55-66 | Returns the published pair list (the old "City to city" dropdown source). Only `classes` is read, by HowItWorks.dc.html:1697-1713. `fixed_routes` has no live reader |

## 2. The four cases traced

Common path: `runQuotePipeline` (pipeline.ts:727) → `defaultResolvePlace` (285-348) fills `isAirport`, `cityId`, `canton` from Mapbox retrieve or reverse → `toQuoteInput` (pipeline.ts:763-810; the lock variant is 371-411) → `priceQuote` (priceQuote.ts:294) → `attachPlaceZones` (lines.ts:198-213) fills missing zone ids by text/IATA → eligibility (eligibility.ts:165) → `buildClassLines` (priceQuote.ts:181-288). Checkout extras, the coupon and VAT come after the lock: `checkoutCharge` (checkout-charge.ts:73-175) → `payableRappen` (payable.ts:65-81).

### a) Plain trip (non-airport pickup, no pair)
- Fare: `buildFareLine` lines.ts:533-575. Amount = `base_fare_rappen + perKm(per_km_rappen, distance_m)` (≈540-545). Code `distance_fare`.
- Airport: `airportFeeTrigger` lines.ts:580-592 returns null → no line (priceQuote.ts:216-222).
- Pair: city (347-398) and canton (403-432) find nothing, and the zone-id fallback (482-498) finds nothing → null (priceQuote.ts:228-237).
- Lines: `[distance_fare]` + `included` waiting lines if configured.
- Mode or tab dependency: none. `fare_kind` is ignored.
- **Verdict: form-only.** Test: lines.test.ts:1276, 1389; priceQuote.test.ts:752.

### b) Airport pickup
- Trigger (lines.ts:580-592), checked in this order:
  1. `flight_no` is not empty → `"flight_no"`.
  2. `origin_is_airport === true` (Mapbox POI category `airport`, mapbox.ts:272-290) → `"airport_place"`.
  3. `origin_zone_id` zone has `zone_type === "airport"` → `"airport_zone"`.
- Line: `buildAirportFeeLine` lines.ts:612-645, code `airport_fee`, amount `distance_rates.airport_start_rappen`. It is added on top; the fare start is unchanged (buildFareLine always uses `base_fare_rappen`, 534-545). If the amount is null the class stays unpriced, never 0 (D-13).
- **Drop-off at an airport:** the code checks only `origin_*`, so a drop-off at an airport adds no fee. **Exception:** a flight number on its own triggers the fee even when the pickup is not an airport:
  - The customer site sends a flight only when it thinks the pickup is an airport (home 2039/2105-2109; TripEditor.tsx:43-52, 102, 180). But the airport check falls back to a name match on the place name (home.dc.html:1441-1447, TripEditor.tsx:25/143). A hand-edited `/checkout?…&flight=` also sends `flight_no` (checkout-quote.ts:109).
  - Ops New trip always shows Flight and sends it on any trip (OpsNewTrip.dc.html:47, 177). A staff member who types the departure flight on a hotel → ZRH trip is charged the airport pickup fee.
- Return legs: leg 2's origin is the outbound drop-off (pipeline.ts:387-388), so a return trip from an airport would get the fee on leg 2. Not reachable in V1: every caller sends one_way.
- Mode dependency: none (priceQuote.ts:213-215 comment; test priceQuote.test.ts:690).
- **Verdict: form-only.** Optional server tightening if the owner wants the rule to be "pickup only": drop the `flight_no` trigger, or require it together with an airport origin (lines.ts:584-586). That is a calculation change and an owner decision (Open question Q1).

### c) City-to-city match
- `buildFixedRouteExtraLine` lines.ts:455-532, called with `publishedPairs: true` (priceQuote.ts:228-237). Order:
  1. City match by Mapbox city id, both directions (lines.ts:359-373). The pair row's zones must carry a `mapbox_place:<id>` tag (333-340). **When both leg city ids are present there is no label fallback**; label matching only runs when an id is missing (375-397).
  2. Canton match, both directions (403-432).
  3. Zone-id fallback (482-498).
  - Same place at both ends → null.
- Amount: `fixed_routes.price_rappen`, code `fixed_route`, kind `extra`. It is added; the distance fare stays (the D-09 test at priceQuote.test.ts:711-730 asserts `1_000 + 2_000 + 500 + 700`).
- **More than one pair?** No. `fixed = city ?? canton` (lines.ts:480): one line per leg. The city pair wins over the canton pair (D-09a; test lines.test.ts:1824).
- **Does "fixed route" replace distance pricing?** No. `place`-kind rows never replace the fare (lines.test.ts:177, 378, 571), and buildFareLine never swaps amounts (524-531).
- **Deviation from the owner formula:** an extra stop removes the pair (`journeyHasExtraStops` lines.ts:156-162, 470; D-17, test lines.test.ts:340). Ops New trip's "Extra stop" toggle sends `extra_stops:1` (OpsNewTrip.dc.html:159), so that trip loses its pair amount (Q2).
- Mode dependency: none (the old `fare_kind === city_to_city` filter is gone; `buildCityPriceLine` 239-270 is exported but uncalled, pinned by lines.test.ts:1399).
- **Verdict: form-only**, with one condition: whether a match actually happens depends on the price-book data (zone tags). See R4.

### d) Airport pickup + pair + ticked extra (+ coupon + VAT)
- priceQuote.ts:197-257 runs airport (216-222), pair (228-237) and quantity extras (251-257) independently in the same pass → lines `[distance_fare, airport_fee, fixed_route, <quantity extras>]`.
- The customer's ticked extras are not in the quote. They come from the live catalog at pay time: `checkoutCharge` sums the picked codes (checkout-charge.ts:78-89). A fixed coupon comes off `fare + extras` before VAT, floored at 0 (107-115). A percent coupon uses `payableRappen` (payable.ts:65-81). VAT is added last. This matches the owner-confirmed order.
- Ops New trip extras go through the quote as quantity surcharges instead (OpsNewTrip.dc.html:156-162 → buildExtraLines lines.ts:920-975).
- A test covers pair + extra + coupon (lines.test.ts:1485), and a separate test covers airport + coupon (the worked example lines.test.ts:1423-1466). **No test combines airport + pair + extra in one board.**
- Data caveat [ASSUMED]: Mapbox may resolve the city of a ZRH airport POI as Kloten, not Zurich. If so, a "Zurich ↔ Bern" city pair would not match from the airport. A ZH ↔ BE canton pair would, because canton is the fallback.
- **Verdict: form-only.** The server already combines all parts automatically from the two places.

### Does any mode change the formula?
- `mode: "return"`: adds leg 2 (a second fare, airport fee and pair evaluated on the reversed leg) and one `return_trip` line (policy.ts:122-170). V1 is one-way and no live caller sends it.
- `fare_kind`: no effect on amounts.
- `hourly`: refused.
- So: no mode swaps distance pricing for a fixed price.

## 3. Tests

**Existing coverage** (vitest; `pnpm --filter web test` runs `sync-dc-mock-to-public` then `vitest run`):

| Case | Files and tests |
|---|---|
| a | lib/pricing/lines.test.ts:1276, 1389; lib/pricing/priceQuote.test.ts:752 |
| b | lines.test.ts:1324, 1347 (flight_no alone), 1363 (origin_is_airport), 1378 (null → unpriced), 1423 (worked example); priceQuote.test.ts:690, 700, 759, 772; lib/quote/pipeline.test.ts:367, 415, 850 (reprice flight) |
| c | lines.test.ts:1485, 1566, 1603, 1629, 1655, 1698, 1725, 1781, 1824 (D-09a), 340 (extra stops drop the pair); priceQuote.test.ts:711, 732 |
| d | none as one board. Partial: lines.test.ts:1485 (pair + extra + coupon), 1423 (airport + coupon); checkout-charge / payable tests for VAT order |
| Display | lib/checkout/price-rows.test.ts; pipeline.test.ts:607 (lock pins airport and pair display rows) |

**Smallest new server test set.** Put these in one new file, `apps/web/lib/pricing/one-form-fare-parts.test.ts`. Reuse the fixture helpers from priceQuote.test.ts (`rateRow`, `surcharge`, `settingsRows`, `input`) and the same fixture magnitudes those tests already use. Test-only rows, never live price-book numbers.
1. **a** Non-airport pickup, no pair → exactly `["distance_fare"]` contributing; total = base + perKm.
2. **b** `origin_is_airport: true`, no pair → `["distance_fare","airport_fee"]`; the fare line's `base_fare_rappen` is unchanged.
3. **b-negative (drop-off)** `dest_zone_id` = airport zone, pickup neutral, no flight → no `airport_fee`.
4. **c** Leg `origin_city_id`/`dest_city_id` match a `kind:"city"` row whose zones carry `mapbox_place:` tags → exactly one `fixed_route`; distance fare still present.
5. **c-single** City and canton rows both match → exactly one `fixed_route` (the city amount).
6. **d** Airport pickup + canton pair + `child_seats:1` quantity extra → codes `distance_fare, airport_fee, fixed_route, child_seat`, total = sum. Then feed that total to `checkoutCharge` with one catalog extra and an amount coupon → net = total + extra − coupon (floor 0), VAT on top, lines sum = charged.
7. **Mode-independence** Run case 6 with `fare_kind` ∈ {undefined, "one_way", "airport_pickup", "city_to_city"} → JSON-identical `classes`.
8. (Only if the owner answers Q1 "pickup only") `flight_no` with a non-airport origin → no `airport_fee`. This would replace lines.test.ts:1347 and priceQuote wording.

Also add one DC-mock source test if the form work removes the `?service=` paths: grep-pin that no `service=city|airport|hourly` href remains in the header, footer and Services mocks.

## 4. Risks

- **R1 Legacy quote locks.** Locks may carry `fare_kind` (lock.ts:131-135, 278-281) and are verified on reprice (pipeline.ts:431). If the field is removed from the schema, the lock verifier must keep accepting it or old locks turn `invalid`. Locks expire quickly (`defaultQuoteLockDeadline`, pipeline.ts:1050), and the amounts never depended on it. Recommendation: keep accepting it on verify, stop reading it. Keep the schema `fare_kind` optional; removing it makes old clients get `untrusted_input` (the schema is `.strict()`).
- **R2 Pay links.** These read the booking's saved snapshot lines (pay-link-lines.ts header comment: "never today's price book"). A form or copy change cannot change a pay link amount. Separately, the saved charge lines fold the airport fee and pair into one "Transfer" `distance_fare` line (checkout-charge.ts:118-125, fareRappen = lock class net). The parts exist only as display rows on the lock (`price_rows`, lock.ts:143-156, "never read by intent, pay-link or the booking RPC"). Confirmation, pay link and ops detail therefore cannot show the parts separately after payment. This is a known limit, not part of this comment.
- **R3 Double airport charge through a surcharge row.** `airport_pickup` is an automatic surcharge code (surcharge-codes.ts:5, 37). A leg surcharge with predicate `pickup_zone_type: airport` and amount > 0 would add a second airport amount through `buildLegSurchargeLines` (lines.ts:741+; priceQuote.ts:239-247), on top of `airport_fee`. The seed leaves predicates `{}` (generate-seed.mjs:420-422). Live row 18 is unknown → Q3.
- **R4 Pair match depends on data.** City pairs match only when the row's zones have `mapbox_place:` tags, given that live retrieve returns city ids (lines.ts:359-373). A published "City to city" row without tags silently never applies, unless canton or zone-id matching catches it. → Q4.
- **R5 Ops New trip.**
  - The flight field is always visible and adds the airport fee on any trip where a flight is typed before the quote fires (drop-off flights included).
  - A flight typed after the quote does not re-quote (262).
  - The "Extra stop" toggle drops the pair (D-17) and uses `extra_stops` without waypoints.
  - Extras are 3 hard-coded codes, not the live catalog the customer sees ("Same public fare as the site" at 233 is then not exactly true for extras).
  - Fallback class slug `'saden'` (175, 188, 209) is the old Economy slug.
- **R6 Pricing dashboard copy.**
  - Row-direction contradiction (OpsPricing 395 vs 401, 4 languages).
  - The subtitle "City to city, distance rules…" and the tab "City to city" also hold canton pairs.
  - "Airport pickup fee (added to start)" is correct.
  - Dead `cityPrice` save logic still writes `distance_rates.city_price_rappen`, which no engine path reads. Harmless but confusing in data.
- **R7 Marketing.**
  - The `?service=` links and Services cards promise distinct products. Removing them changes navigation targets in the header, footer (DC and React) and HowItWorks. Four languages and the i18n dict (`city-to-city`, `airport-transfers` keys) need updating in the same pass.
  - Terms copy (terms.dc.html:199) mentions hourly. Legal copy is the owner's call.
- **R8 Stripe product name** "Airport transfer" (intent.ts:528) is shown for every ride.
- **R9 Zone text matching.** `zoneIdMatchingPlace` (lines.ts:179-196) uses a substring IATA match with no word boundary (`hay.includes("zrh")`). A place text that happens to contain an airport's IATA letters would get an airport zone and trigger `airport_zone`. Low probability. Not new.

## Project Constraints (from CLAUDE.md / CLAUDE.local.md)
- Never invent or change a price: amounts come from the dashboard price book only. Tests use fixture rows.
- Four languages in the same pass for any copy change (home, Services, header, footer, HowItWorks, OpsPricing). Swiss German "ss". Arabic RTL.
- Desktop → tablet → mobile. Phone and tablet keep the desktop field order (the 4-step bar decided for comments 4/5).
- No glow, no tinted yellow. Shared SiteHeader/SiteFooter.
- Supabase `yaumjzvylngfjhtuffqs` has real bookings. Never wipe. Worker deploy waits for an explicit Ship.
- GSD gates: the owner signs plan, UAT and ship.

## Validation Architecture
- Framework: vitest (apps/web). Quick: `pnpm --filter web exec vitest run lib/pricing lib/quote lib/checkout/checkout-charge`. Full: `pnpm --filter web test`.
- Wave 0: create `apps/web/lib/pricing/one-form-fare-parts.test.ts` (cases 1-7).

## Security Domain
- V5 input validation: keep `origin_is_airport`/`is_airport`/city/canton on the forbidden client list (schema.ts:53-62). The form must never send an airport flag or a trip type that prices.
- Tampering: the server decides the fare parts. A client `fare_kind` stays non-authoritative. A crafted `flight=` URL can only raise the customer's own price.

## Assumptions Log
| # | Claim | Risk if wrong |
|---|---|---|
| A1 | Mapbox resolves the ZRH airport POI's city as Kloten, not Zurich | City pairs from the airport may or may not match; canton covers it |
| A2 | OpsNewTrip is reachable at /dashboard/bookings/new for staff | Only the ops risks change |
| A3 | Live price book 18 has no active `airport_pickup` leg surcharge with an amount | If wrong, airport pickups are charged twice today |

## Open Questions (for the owner or orchestrator; live data)
- **Q1** Airport fee on "flight number only". Should it stay (today) or become pickup-at-airport only? A drop-off with a departure flight typed in ops New trip is charged the fee today.
- **Q2** Should an extra stop drop the city/canton amount (today, D-17), or keep it (the owner's one-line formula)?
- **Q3** Live price book 18: are any `surcharges` rows active with code `airport_pickup` or predicate `pickup_zone_type` and amount > 0?
- **Q4** Live price book 18: do every live `fixed_routes` row's zones carry `mapbox_place:` tags (city rows) or `canton:` tags (canton rows)? Is `airport_start_rappen` non-null for every public class?
- **Q5** Keep "City to city" / "Airport transfers" as marketing pages that deep-link into the one form, or remove the `?service=` variants entirely?

## Sources
- Code read in this worktree, file:line as cited. No web sources needed; no packages involved.
