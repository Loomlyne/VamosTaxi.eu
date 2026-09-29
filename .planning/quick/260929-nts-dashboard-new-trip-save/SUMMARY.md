# Quick 260929-nts summary: dashboard New trip Save

Dashboard New trip Save creates the booking again: the form sends the current strict intent body, extras come from the live price book, class options from the quote answer, and a flight typed after the quote re-signs the lock without booking at an unseen total.

## Commits
- 90a12c9c docs: plan
- b79017c2 fix: OpsNewTrip.dc.html, dictionary, new-trip-intent.test.ts, ops-dc-finalize pin
- b8d792d5 test: Playwright spec, dictionary gaps (Drop-off, Time, Locale, Quote were English in de/fr/ar)
- docs commit: SUMMARY, HANDOVER, STATE row

## Root cause
1. Save posted `extras: this.extras()` and no `trip`; the strict schema refused both (invalid_request, "Save failed").
2. `display_currency: window.VamosLocale.cur` was the function itself (dropped by JSON), also refused. Found while fixing.
3. Hard-coded class slugs and `preferred_class: 'saden'`.

## Changes
- Body = customer `buildIntentBody` shape: quote_id, lock, vehicle_class, extra_codes, coupon null, flight_no, contact, trip{from,fid,to,tid,gs,when,pax,bags,flight}, locale, display_currency, idempotency_key.
- Extras: GET /api/checkout/extras, DS Checkbox rows, all unticked, names by staff language then en then humanised code, amounts via fromChf. States: loading, empty, error. No Extra stop.
- Total shown = /api/checkout/price charged_rappen (server), repriced on tick, class change and new quote; "Updating price" while pending.
- Flight: label "Flight number"; required when /api/geo/retrieve says the pickup is an airport ("Enter the flight number"); bad format "Check the flight number"; typing never re-quotes. On Save, if the flight differs from the lock's: /api/quote/reprice (flight-only), re-price; if the total differs from the one shown, Save is refused ("Price changed"), the new total is on screen, the next Save books it.
- Date, time, passengers and bags drop the lock and re-quote after 700 ms (before, a changed date kept a stale lock and would have been refused as price_changed). Passengers clamped 1 to 8 (trip schema max).
- Classes from the quote response (eligible only, name as customers see it, else slug); default first eligible.
- D-08 not touched. The hint under Flight for non-airport pickups is "Optional." only: the reference text "It does not change the price" is not true until D-08 (26.4 plan 01) lands.

## Checks (2026-09-29, worktree fix-26.3-newtrip)
| Check | Result |
|---|---|
| vitest lib/ops (incl. new-trip-intent.test.ts, ops-dc-finalize, phone-booking) | 65 files, 653 pass |
| pnpm test:unit | 2288 pass |
| typecheck, lint, lint:css | exit 0 |
| check:numbers, check:legal-claims, check:public-env, check:db-fences | exit 0 |
| i18n:check | pass, 2588 keys |
| db:seed:check | exit 0 |
| pnpm --filter web build (with lint) | exit 0 |
| Playwright ops-new-trip-260929 + ops-26-3-widths + ops-detail-extras, --workers=1, all four viewport projects | 64 pass |

New spec (6 tests x 4 viewports): extra ticked + flight typed after quote gives a schema-valid body and opens /bookings/VT-26-9001 (typing did not reprice, reprice sent the flight only); Business from the quote is what Save sends; a total-moving reprice refuses Save then books on the second Save; airport pickup without a flight does not post; de and ar: extras and flight visible, ar dir=rtl, no sideways scroll, VamosLocale.coverage empty (language names excluded on purpose).

## Deviations
- [Rule 1] display_currency function bug and stale lock after date/time/pax/bags edits, fixed in the same file.
- [Rule 2] four ops strings untranslated on this page (Drop-off, Time, Locale, Quote) added in de/fr/ar.
- No SQL, no local Supabase stack needed.

## Known stubs
None.
