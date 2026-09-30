# P4 part D — remove the extra stop: record

**Owner's word (2026-09-30):** "there is no extra stop remove anythign related to it" (DECISIONS D4).
**Folder / branch:** `/Users/koss/Developer/vamos-wt/phase-26.2-u13`, `gsd/26.2-p4-d`, cut from
`gsd/26.2-p4-extras` 5f9e3a07 (main + part A). Not pushed, no PR, no deploy, no hosted SQL, no migration.

## Commits

| Commit | Step |
|---|---|
| d7224069 | D1 the fare engine has no stop branch |
| 2a01e044 | D2 no stop in the quote request, and a reprice never re-routes |
| a8020439 | D3 the signed quote lock has no stop; old locks without one still work |
| 9cd02518 | D4 no "at most one stop" cap; the stop setting is no longer read |
| 39d11104 | D5 no stop label in the e-mail package, the dashboard mock or the booking defaults |

## Screens: does any screen send a stop? No

Checked with grep in `app/home`, `app/pages`, `app/*.js`, `apps/web/components`, `apps/web/app`: no code
sends `extra_stops` or `waypoints` to `/api/quote`, `/api/quote/reprice` or `/api/checkout/intent`. The
quote callers (`app/home/home.dc.html`, `app/home/HowItWorks.dc.html`, `components/home/BookingBoard.tsx`,
`app/[locale]/checkout/CheckoutPage.tsx`, `CheckoutForm.tsx`, `app/ops/OpsNewTrip.dc.html`) send no `extras`
object at all; `lib/ops/new-trip-intent.test.ts:90` already pins that for New trip.

One screen HAS a stop field but sends nothing: the old design mock `app/pages/checkout.dc.html:93` (a
"Additional stops" counter 0–3). It is not served (`scripts/sync-dc-mock-to-public.mjs:50-54`, SKIP_PUBLIC)
and it saves to localStorage, then opens `confirmation.dc.html`. Not touched: a screen change is his to sign
(see "Needs his word").

## What was removed (file:line at base 5f9e3a07)

**Fare engine (D1)**
- `apps/web/lib/pricing/lines.ts:144-154` the stop flag on `BuildFareLineArgs` and `journeyHasExtraStops`;
  `:415`, `:423-424` the stop flag and the rule that dropped the city/canton pair when a stop existed;
  `:790-794` the quantity source `extra_stops` in `resolveQuantity`; `:833-836` the skip by source
  `extra_stops` or by the name `extra_stop`; `:15-18`, `:787`, `:819-822` comments.
- `apps/web/lib/pricing/priceQuote.ts:198-200`, `:208`, `:233` the stop count read and its two hand-offs.
- `apps/web/lib/pricing/types.ts:251` `waypoints` on the engine leg (`QuoteLegInput`).
- `apps/web/lib/ops/draft-preview.ts:132` `waypoints: []` on the dashboard preview leg.
- `apps/web/lib/pricing/predicates.ts:28` comment ("extras / stops / bags").
- `apps/web/lib/quote/pipeline.ts:399`, `:446-447` stop lists handed to the engine.

**Request and reprice (D2)**
- `apps/web/lib/quote/schema.ts:115-121` `WaypointSchema`; `:130`, `:132` `extra_stops` / `waypoints` in
  `ExtrasSchema`; `:262-274` the "at most one stop" and "list length equals count" guards.
- `apps/web/lib/checkout/intent-schema.ts:21`, `:23-34` the same two fields in the pay-link body's old
  three-code extras object.
- `apps/web/lib/quote/pipeline.ts:239` `extra_stops` into the engine; `:245-273`
  `extraStopsWaypointMismatch` and `waypointsChanged`; `:665-668` stop places on the Directions leg;
  `:861-867` the pre-parse stop check; `:894-975` the whole re-route branch of a reprice (turnstile and
  Mapbox breaker steps, a new Directions call, **the Mapbox counting call of hand-over 2 at `:941-942`**,
  a new quote id and a new hold); `:982-1003`, `:1008`, `:1010`, `:1016-1017`, `:1023-1034` the re-route
  results and the stop fields in the re-signed lock; `:230-232` a helper left unused.
- `apps/web/lib/geo/mapbox.ts:154` `waypoints` on `RouteLegInput`; `:493` stop places in the Directions
  path; `:682-692` snapping of stop places; `:697-706` their comparison.

**Signed lock (D3)**
- `apps/web/lib/quote/lock.ts:104`, `:106` `extra_stops` and `waypoints` in `QuoteLockExtras`; `:93` the
  required stop list on a lock leg becomes a legacy optional `waypoints?: []` (reason below).
- `apps/web/lib/quote/pipeline.ts:793-800` (then `waypoints: []`) and `:808`, `:810` the mint no longer
  writes a stop list on legs or `extra_stops` / `waypoints` in extras.

**The cap and its reads (D4)**
- `apps/web/lib/checkout/extras-catalog.ts:19-28` `PUBLIC_MAX_EXTRA_STOPS`, `capExtraStops`;
  `:40-43` `publishedMaxExtraStops`.
- `apps/web/lib/ops/rate-book.ts:706`, `:713` the fork of a draft no longer reads or copies
  `rate_versions.max_extra_stops` (the column is nullable, no default: a new draft gets null; nothing reads it).

**Labels and defaults (D5)**
- `packages/emails/src/messages/{en,de,fr}.json:48`, `ar.json:54` `extraStop` (no e-mail code read it).
- `app/ops/OpsPricing.dc.html:323`, `:410`, `:499`, `:588` the unused `kindMaxStops` label, four languages.
- `apps/web/lib/checkout/booking-lifecycle.ts:17`, `:24` `stops: 0` in `EXTRAS_OFF` (only its test used it).

## What stayed, and why

| Place | Why it stays |
|---|---|
| `rate_versions.max_extra_stops` column; the `quantity_source` check allowing `extra_stops` (`20260825000001_surcharge_predicate.sql:22-23`); `quote_rate_book()` returning `max_extra_stops` (`20260914190000_quote_rate_book_live_classes.sql:88`); `packages/db/database.types.ts:1790,1806,1822` | Database, no migration in this job. The column is no longer read by any app code. Dropping it is a later migration on his word. |
| `lib/checkout/pay-link.ts:75-94` `LEGACY_EXTRA_NAMES.extra_stop`; `payLinkExtras` stop branch (now typed by a local `LegacyPolicyExtras`); `EXTRA_CODES.extra_stop` | Old bookings' policy objects and lines may name a stop; this prints them on old mails. A new lock can never carry one (D3 refuses it). |
| `lib/checkout/booking-read.ts:240` `legacyExtraCodes`; `lib/checkout/confirmation-receipt.ts:9`; `components/booking/BookingVoucher.tsx:154-157`, `:239-240`; `apps/web/i18n/messages/*.json` `checkout.extraStop` (:531) and `price.surcharge.extra_stop` (:2662) | Old-booking readers and their labels (RESEARCH 5c). They decide nothing for a new booking. |
| Error code `extras_max_stops` (`lib/quote/schema.ts:28`, `errors.ts:88`, `client-contract.ts:144`) and its message `quote.extras.error.max_stops` in four languages | **Stopped here.** It is now the name of the refusal for any body that still names a stop field. Removing the name needs `apps/web/tests/integration/quote-api.spec.ts:210-226` changed (it expects 422 `extras_max_stops` for `extras: { extra_stops: 2 }`), a hands-off file. |
| `lib/quote/lock.ts` `waypoints?: []` on `QuoteLockLeg` and `withoutLegacyStopFields` | Lock compatibility (below). The optional field is also needed because hands-off specs `tests/integration/intent-supersede-db.spec.ts:106`, `checkout-server-db.spec.ts:256`, `extras-charged-recorded-db.spec.ts:256` build lock legs with `waypoints: []` and must still typecheck. |
| Part A tests naming `extra-stop` / `extra_stop` as ordinary owner names (`extras-catalog.test.ts:72,80`) and a row with source `extra_stops` (`:99`) | A name is just a name; old rows can still carry that source value. |
| `phase-26-3-laws.test.ts:196-202`, `phase-26-4-laws.test.ts:204` | They forbid an `extra_stop` literal outside the legacy readers. Still true. |
| `components/home/Services.tsx:83` "multiple stops across the day" | Marketing copy for a service by the hour, not the extra stop. |

## The signed lock: compatibility proof

How long a lock lives: `exp` comes from Postgres (`quote_lock_minutes`, 1440 minutes = 24 hours at
Publish), and a pay-link hold (`bookings.hold_until`) can make it payable longer (`lib/quote/intent.ts:119-130`).
The old-form acceptance has **no clock of its own**, so it covers any lock that is still otherwise valid,
however long it lives. It runs in `verifyLock`, so every reader gets it: reprice, checkout intent,
`lib/checkout/price-route.ts`, `lib/ops/edit-request.ts`.

What it does (`lib/quote/lock.ts` `withoutLegacyStopFields`, called right after the shape check):
- a leg with `waypoints: []` → accepted, the field dropped; a non-empty list or a non-list → INVALID;
- extras with `extra_stops: 0` and/or `waypoints: []` → accepted, both dropped; any other value → INVALID;
- runs before the expiry check, so an expired lock carrying a stop is INVALID, not "expired";
- runs after the MAC check on the original base64 segment: the secret, the key ids (`v1`, `v0`),
  `mintLock`, `crypto/hmac` and the algorithm are unchanged (`git diff 5f9e3a07 -- apps/web/lib/crypto`
  is empty; `mintLock` body unchanged).

Tests (`apps/web/lib/quote/no-extra-stop.test.ts`, block D3, and `pipeline.test.ts`):
- Two tokens hard-coded in the test, minted by the lock code as it stood before part D (fake test secret
  `test-quote-lock-secret-current-not-real-00`, the one every lock test uses): `OLD_NO_STOP` (leg
  `waypoints: []`, extras `{child_seats:0, extra_stops:0, oversized_luggage:false, waypoints:[]}`) verifies
  and reads back as extras `{child_seats:0, oversized_luggage:false}` with no leg list; `OLD_WITH_STOP`
  is refused `{ok:false, reason:"invalid"}`.
- Five more stop forms refused (count 1, a stop place in extras, a stop place on a leg, a non-list, a
  non-zero count); the usual old shape (extras null, empty leg list) accepted; expired-with-stop → invalid;
  expired-without-stop → expired with the stop fields gone.
- Checkout intent: `OLD_NO_STOP` is not `quote_not_found`; `OLD_WITH_STOP` is `quote_not_found`.
- Reprice of an old-form lock: ok, SAME quote id and hold, no Directions call, re-signed lock has no
  `waypoints` / `extra_stops` (`pipeline.test.ts` "26.2-p4 D: a lock minted before the change …").
- A new quote's lock has no `waypoints` / `extra_stops` (`pipeline.test.ts` "26.2-p4 D: a new quote's lock …").

## Tests

New file `apps/web/lib/quote/no-extra-stop.test.ts` (36 tests) plus new cases in `pipeline.test.ts` and a
rewritten case in `mapbox.test.ts`. Each was run before its code change; the failing line:

| Step | Test | Failing line before |
|---|---|---|
| D1 | a leg that still carries a stop list keeps its city/canton pair extra | `expected undefined to be 'canton'` |
| D1 | a stop flag sent to the pair builder changes nothing | `expected undefined to be 9000` |
| D1 | a row coded extra_stop is an ordinary row … never the name | `expected [] to deeply equal [ 1, 2 ]` |
| D1 | no stop word is left in the engine code | `lib/pricing/lines.ts: expected … not to match /extra_stops?\b|hasExtraStops|…/` |
| D2 | quote refuses `{"extra_stops":0}`, `{"extra_stops":1}`, `{"waypoints":[]}`, `{"extra_stops":1,"waypoints":[…]}` | `expected { ok: true, …(1) } to deeply equal { ok: false, …(2) }` |
| D2 | quote refuses `{"waypoints":[stop]}` | `expected { ok: false, …(2) } to deeply equal { ok: false, …(2) }` (was untrusted_input) |
| D2 | reprice refuses `{"extra_stops":0}` / `{"waypoints":[stop]}` | same two lines as above |
| D2 | the pay-link body's three-code extras object has no stop | `expected true to be false` |
| D2 | the request code has no stop fields and the reprice spends no Directions call | `expected 'import { z } from "zod"…' not to match /WaypointSchema|…/` |
| D2 | pipeline: a reprice body that carries a stop list is refused before any Directions call or Mapbox unit | `expected { ok: true, …(13) } to deeply equal { ok: false, code: 'extras_max_stops' }` |
| D2 | pipeline: a reprice body with extra_stops: 0 is refused too | same |
| D2 | mapbox: builds the coordinate path from origin and destination only | `expected '/directions/v5/mapbox/driving/8.54,47…' to contain '8.54,47.37;8.57,47.4'` |
| D3 | old lock with stop fields but no stop verifies without them | `expected { child_seats: +0, …(3) } to deeply equal { child_seats: +0, …(1) }` |
| D3 | old lock that carries a stop is refused (golden token and five forms) | `expected { ok: true, …(1) } to deeply equal { ok: false, reason: 'invalid' }` |
| D3 | usual old shape verifies without the leg list | `expected { dest_zone_id: null, …(10) } to not have property "waypoints"` |
| D3 | expired old lock with a stop is invalid | `expected { ok: false, reason: 'expired', …(1) } to deeply equal { ok: false, reason: 'invalid' }` |
| D3 | expired old lock without a stop has no stop fields | `expected { extra_stops: +0, waypoints: [] } to deeply equal {}` |
| D3 | checkout intent refuses the old lock with a stop | `expected { ok: false, code: 'pricing_not_live' } to deeply equal { ok: false, code: 'quote_not_found' }` |
| D3 | lock type and writers name no stop | `expected 'export interface QuoteLockExtras {…' not to match /extra_stops|waypoints/` |
| D3 | pipeline: a new quote's lock carries no stop fields; old-form reprice re-signed without them | `expected '{"bags":1,"class_totals":…' not to match /waypoints|extra_stops/` |
| D4 | the checkout extras module has no stop cap | `PUBLIC_MAX_EXTRA_STOPS: expected [ 'airportPickupFromPlace', …(6) ] to not include 'PUBLIC_MAX_EXTRA_STOPS'` |
| D4 | a forked draft no longer copies max_extra_stops | `expected 'import type postgres …' not to match /max_extra_stops/` |
| D5 | e-mail messages en/de/fr/ar have no extraStop | `expected [ 'subject', 'preheader', …(118) ] to not include 'extraStop'` |
| D5 | dashboard Pricing mock has no max-stops label | `expected '<!DOCTYPE html>…' not to match /kindMaxStops/` |
| D5 | extras-off defaults have no stop count | `expected { childSeat: false, …(3) } to not have property "stops"` |

Existing tests that pinned the stop feature, gone with their code:
- `lib/pricing/lines.test.ts:340` "D-17: extra stops drop the fixed route and use the distance recipe";
  `:1111` "extra_stops do not emit a fixed rappen × quantity fare (D-37)" (the same guarantee is now D1's
  "the quantity source extra_stops counts nothing").
- `lib/quote/schema.test.ts:189-230` five stop cases, replaced by one "any stop field is extras_max_stops".
- `lib/quote/pipeline.test.ts:718` "with changed waypoints returns a DIFFERENT quote_id …" and `:761`
  "with changed waypoints counts the extra Directions call in the daily Mapbox breaker"; `:696` renamed
  (no "unchanged waypoints"). `:796`, `:811` (extras_max_stops) kept unchanged, still true.
- `lib/geo/mapbox.test.ts:623` "origin-waypoints-destination order", rewritten to origin and destination only.
- `lib/checkout/extras-catalog.test.ts:39` "caps extra-stop places at 1 (D-21)".
- `lib/checkout/extras-no-name-lists.test.ts:123-125` the three cap names removed from the "what stays" list.
- `lib/ops/publish-public-chf.test.ts:117` now expects the fork without `max_extra_stops`.
- `lib/checkout/booking-lifecycle.test.ts:31` `stops: 0`.
- Fixtures: `waypoints: []` removed from engine legs (`live-child-seat-rule.test.ts:102`,
  `rate-book-extra-rule.test.ts:261`, `d15-recipe.test.ts:51`, `eligibility.test.ts:138,291,300`,
  `lines.test.ts:62`, `one-form-fare-parts.test.ts:158`, `priceQuote.test.ts:287,489,498,551,560,670`,
  `engine.test.ts:162`) and from the two round-trip lock fixtures in `lock.test.ts:49,195`. Other lock
  fixtures that still carry `waypoints: []` were left as they are: they keep proving the old form works.

## Checks (run once, at the end, on 39d11104)

| Check | Result |
|---|---|
| pnpm typecheck | pass |
| pnpm lint | pass, 0 errors, 5 warnings (all in files this job did not touch) |
| pnpm lint:css | pass |
| pnpm i18n:check | pass (2665 keys) |
| pnpm check:numbers | pass |
| pnpm check:db-fences | pass |
| pnpm check:public-env | pass |
| pnpm check:legal-claims | pass |
| pnpm test:unit | pass: web 2920 + 1 skipped (296 files), emails 151, db 13 |
| pnpm build | pass |

## Needs his word (not done)

1. **The error name `extras_max_stops`** and its four-language message "Check the number of stops" stay as
   the refusal of a body that still names a stop field. To remove them, the control session changes
   `apps/web/tests/integration/quote-api.spec.ts:210-226` (hands-off) to expect the plain 400
   `untrusted_input`, then the code and the four messages go.
2. **Terms page, live on vamostaxi.site/terms:** `app/pages/terms.dc.html:233` "Additional stops: shown on
   your quote per stop." under "Charged separately, only if you ask for it" (strings in
   `app/vamos-i18n-dict.js:1559-1560`). It describes a service that does not exist. Draft for his approval:
   delete that line in all four languages. The Next copy `apps/web/app/[locale]/terms/page.tsx:146`
   (a `data-tok` "Extra stop fee"; reaches no customer) and `apps/web/i18n/messages/*.json`
   `legal.additional-stops` / `legal.per-stop` would go with it. Legal copy: not changed without him.
3. **Old checkout mock** `app/pages/checkout.dc.html:93` (stop counter), `:173`, `:184`, `:196`, `:207`,
   `:218`, `:242`, `:258`, `:278-280`: not served and sends nothing, but a screen. Removing the counter (or
   the whole superseded mock) is his call. Its strings would go with it: `app/vamos-i18n-dict.js:41-42`,
   `:615`, `:671`; `apps/web/i18n/key-map.json:111`, `:863`; messages `checkout.additional-stops` and
   `checkout.additionalStopCount` (`:393-394`, four languages).
4. **Dead strings** used by no page: `app/vamos-i18n-dict.js:982-983` ("Additional stop", "Per stop, inside
   route corridor") and `common.per-stop-inside-route-corridor` (`en.json:907`, `key-map.json:909`). Safe to
   delete with item 3.
5. **Hands-off CSS** `apps/web/app/[locale]/checkout/checkout.css:381` `.vt-checkout__stops` is used by no
   component. Left (hands-off file).
6. **The column** `rate_versions.max_extra_stops`: a drop migration, number from the control session, on his word.

## Not verified

- Nothing was run against a database, a Worker build, Mapbox or Stripe. Playwright suites
  (`tests/integration`, `tests/e2e-worker`) were not run; `quote-api.spec.ts:210` should still pass
  (the name is kept) and `:173` should still pass (a reprice keeps its quote id).
- Rolling the Worker back after the ship was reasoned, not tested: the old code reads a new-form lock
  (no `waypoints` on legs, no stop in extras) as "no stop" (`Array.isArray(undefined)` is false; an
  undefined field is omitted by `canonicalJson` when it re-signs).
- No screen changed, so no pictures were made. The four e-mail message files lost a key no template used;
  the e-mail snapshots are unchanged (151 pass).

## Process note

Once during D2 (checking a test against the old pipeline), `git stash list` was run by mistake inside a longer command (read-only; it lists, it does
not push, pop or apply, and its output was discarded). Nothing in `refs/stash` or the working tree changed.
No other forbidden command was run: no branch switch, reset, push, PR, deploy, wrangler, hosted SQL or Docker.
