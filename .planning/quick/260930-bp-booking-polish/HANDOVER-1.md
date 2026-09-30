# Booking polish, hand-over 1: the trip distance (build)

Branch `fix/booking-polish`, folder `/Users/koss/Developer/vamos-wt/booking-polish`. Origin/main merged at `ed431d2b`. Nothing pushed or deployed.
Final code commit: `67c8d348` (this file is committed after it).

## What changed against the signed design

- `/checkout` strip and order summary show the server's quote distance ("148.2 km", one decimal, Qurova, `.vt-dir-keep` on the digits only). Built as in the prototype; look unchanged, so the prototype pictures stay as the final renders.
- NEW, decision 4: a trip where any leg has no road line (`road: false`, straight-line fare) writes the words instead of a figure, in the strip and in the summary: en "No road route", de "Keine Strassenroute", fr "Pas d'itinéraire routier", ar "لا يوجد طريق بري". Never a partial sum. Message key `checkout.noRoadRoute`, inserted right after `checkout.distanceKm` in the four message files (no line moved).
- CHANGED by the owner at 23:28: the home "Choose your class" section is being removed in another branch, so item 2 (home km line) is dropped. `app/home/home.dc.html` and `app/vamos-i18n-dict.js` are back to origin/main (commit `d08ab9a8`); the home capture spec is deleted. No-road words apply to `/checkout` only. The `home-*` pictures in `screens/` show a design that is no longer built; they are kept as a record only.

## Commits (after the merge)

| Commit | What |
|---|---|
| `853536bc` | no-road words: `noRoad` flag in quote parsing, `TripDistance`, strip, summary, messages, unit tests (this commit also touched home; reverted next) |
| `d08ab9a8` | home back to origin/main, home helper test and home capture spec removed |
| `c1ffb4e6` | `seed.sql` regenerated (`content_strings` 2672 to 2673) |
| `1aded4a0` | `seed_idempotent.test.sql` re-pinned to 2673 + 26 |
| `67c8d348` | gate specs in `checkout-page.spec.ts`, no-road pictures, capture spec extended |

## Checks, on `67c8d348`

| Check | Result |
|---|---|
| `tsc --noEmit` (apps/web) | clean, no output |
| `pnpm lint` | 0 errors, 5 warnings (unused eslint-disable directives in files I did not touch) |
| `pnpm lint:css` | 1 error in `apps/web/public/assets/lenis.css`: an untracked, gitignored file left behind by an older `sync-dc-mock-to-public` (Lenis was removed on main). Not in git, not mine. `stylelint "app/**/*.css"` (the checkout css) is clean. |
| `pnpm i18n:check` | passed, 2665 keys |
| `pnpm db:seed:check` | no drift (after `pnpm db:seed:gen`) |
| `pnpm check:numbers` | ok |
| vitest `lib/checkout` + `components/checkout` | 84 files, 823 tests pass (includes the new quote-parsing and `TripDistance` tests) |
| `checkout-sections.spec.ts` (component-1440) | 24 passed |
| `checkout-page.spec.ts` (component-1440) | 19 passed, 2 red, see below |

Red in `checkout-page.spec.ts`, neither touched by this job:
1. "Edit trip: fields in home order": expects from, flight, to; the code gives flight, from, to (the booking field order decided 2026-09-30). Main's spec still has the same expectation (`VamosTaxi.eu/apps/web/tests/visual/checkout-page.spec.ts:316`), so it is red on main too. I did not fix it.
2. "trip strip and three class cards at 1440, 1024, 768 and 390": the cards are not in one row at a width of 768 or more. The fixture has no route, so none of my code renders there. I did not run it in the main folder (that would write build folders there); the spec file is identical on main. Treat as stale until the control session runs it on main.

New gate tests in `checkout-page.spec.ts`: km leads the strip and opens the summary at 1440/1024/768/390; a mixed-leg answer writes the words in both places and no "km"; an answer without a route shows neither.

## Not verified

- pgTAP (cannot run it here). Re-pin numbers: wanted 2673 + 26 (seed header now 2673); main's pin is 2670 + 26 while main's own seed header already reads 2672, so the pin may already be 2 off on main; branch seed header 2673. If pgTAP shows a different total, the pin is the thing to fix.
- Full test set, build, twin tests, `check:legal-claims`, `check:public-env`, `check:db-fences`, `types:check`: not run (lead runs the full gates).
- Against the real server and a real Mapbox route: the km and the `road:false` answer are fixtures in the specs. A real no-road trip (car-free town) was not tried.
- French: strings exist in the messages, no French picture.
- Phone and tablet widths 1024 and 768 of the no-road state: only 390 and 1440 were rendered (en, de, ar), as asked.

## Files

`apps/web/lib/checkout/checkout-quote.ts`, `checkout-quote.test.ts`; `apps/web/app/[locale]/checkout/CheckoutPage.tsx`, `sections/TripDistance.tsx`, `sections/TripStrip.tsx`, `sections/SummaryRail.tsx`, `checkout.css` (prototype); `apps/web/components/checkout/trip-distance.test.tsx`; `apps/web/i18n/messages/{en,de,fr,ar}.json`; `packages/db/supabase/seed.sql`, `packages/db/supabase/tests/seed_idempotent.test.sql`; `apps/web/tests/visual/checkout-page.spec.ts`, `bp-distance-capture.spec.ts`; pictures `screens/checkout-{390,1440}-{en,de,ar}-noroad-{top,summary}.png`.

`bp-distance-capture.spec.ts` stays: it only runs with `BP_CAPTURE=1` and regenerates the pictures; it is not a gate. No other "proto" leftovers.

## Owner UAT

Needs the merged build running (preview or staging from this branch). Do step 1 first, checkout is touched.

1. Open the booking page, fill Zurich Airport to Davos Platz, pick a date, 2 passengers, 3 bags, go to checkout, pick a class, fill your details, pay with card 4242 4242 4242 4242, any future date, any CVC. Expected: payment succeeds, the confirmation page opens, and the booking shows paid in the dashboard.
2. Phone (or a 390 px window), open `/checkout` for Zurich Airport to Davos Platz. Expected: under the route line the facts start with the distance, for example "148.2 km · Tue 15 Dec, 08:15 · 2 passengers · 3 bags". The number is the route length, not a price.
3. Switch the language to German on the phone checkout. Expected: the facts line wraps to three lines, distance first ("148.2 km ..."), nothing scrolls sideways.
4. Scroll to the order summary (inside "Payment" on the phone, the right-hand card on a laptop). Expected: under the two stops, the first fact is the km with the arrow icon, then date, passengers, class.
5. Switch to Arabic. Expected: "148.2 كم", the digits read left to right.
6. A trip with no road (a car-free town, if you have one to hand). Expected: the words "No road route" (German "Keine Strassenroute", Arabic "لا يوجد طريق بري") in the strip and in the summary, no km figure anywhere. If you have no such trip, skip; the pictures `checkout-*-noroad-*.png` show it.
7. Laptop home page: no km line is built any more (the class section is leaving). Expected: nothing new under "Choose your class".
