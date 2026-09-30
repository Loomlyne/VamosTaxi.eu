# P4 Part A (core) — record

Branch `gsd/26.2-p4-extras`, worktree `/Users/koss/Developer/vamos-wt/phase-26.2`.
Scope: A1, A2, A3 and the engine half of A4. No screen change, no migration, no hosted SQL,
no deploy. Paths are relative to the worktree root. `ROUTE` =
`apps/web/app/[locale]/(ops)/api/staff/rate-book/route.ts`.

The only amount used in any new test is the live figure: `child-seat`, `amount_rappen 1000`.
`node scripts/check-no-invented-numbers.mjs` answers `ok`; no allow entry was added.

---

## A1 — one rule for every extra, stored in the right form; the reader reads the old form the same way

Commit: `3928f542`

### What changed

| File | Change |
|---|---|
| `ROUTE` | The extra save writes `predicate = { kind: "manual" }` and `quantity_source = null` for every extra, on insert and on update, bound with the driver's JSON helper (`tx.json(...)`). The two "with rule / without rule" branches are one update and one insert. The code is the slug of the typed name; `normalizeSurchargeCode` is no longer called. The type-to-fixed-code mapping (`meet_greet`, `free_wait`, `extra_wait`) and the `free_wait` minutes write are removed. |
| `apps/web/lib/pricing/types.ts` | `SurchargePredicate` gains `{ kind: "manual" }`; `MANUAL_PREDICATE` is the one definition used by writer and reader. |
| `apps/web/lib/pricing/predicates.ts` | Explicit case `manual`: never applies in the quote, `why: { predicate: "manual" }`, no `unresolved`. |
| `apps/web/lib/pricing/rateBook.ts` | `mapSurcharge`: a rule that arrives as a string becomes `{ kind: "manual" }`. An object is handed on unchanged (`always` stays `always`, `{}` stays `{}`). |
| `apps/web/lib/ops/rappen.ts` (+ test) | `checkoutExtraKindFromRappen` moved here from `surcharge-codes.ts`, with its test. |
| `apps/web/lib/ops/surcharge-codes.ts` (+ test) | Lost `checkoutExtraKindFromRappen` only. The file goes in A3. |

### Verified before deleting (the lead's condition)

| Item | Reachable? | Evidence | Done |
|---|---|---|---|
| Type-to-fixed-code mapping in `parseSurchargeInput` | No | The Pricing page has one save path and it always sends `type: 'checkout_extra'` (`app/ops/OpsPricing.dc.html` `saveSurcharge`; `grep surcharges.(upsert\|update\|add)` finds that one call). A hand-made request with one of the three types was forced to a code with an underscore, which `assertSurchargeInput` refuses (`KEBAB_SLUG`, `apps/web/lib/ops/rate-book.ts`). It could only end in HTTP 400. | Deleted |
| `free_wait` minutes write | No | Guarded by `parsed.code === "free_wait"`; that code is refused one line earlier by the same check. | Deleted |
| `surchargeTypeFromCode` (`ROUTE`, feeds the Type cell of the Pricing table) | **Yes — since hand-over 2** | RESEARCH 5b called it unreachable because the dashboard reader dropped codes with an underscore. Commit `5f7dd5a9` (26.2-bp B4, merged into this branch) lists those rows again. An old book (13, 14) or a draft cloned from one holds `meet_greet`; its Type cell reads the meet-and-greet word today and would read the checkout-extra word after a delete. That is a change on a screen. | **Not deleted. Stopped on this item, see "Stopped on".** |

### Tests

New, failing before the change (run: `cd apps/web && npx vitest run <file>`):

| Test | Failure line before |
|---|---|
| `lib/ops/rate-book-extra-rule.test.ts` › `'Ski' is saved under its own code 'ski' with the manual rule` | `AssertionError: expected 400 to be 200 // Object.is equality` |
| same file › `'Waiting' is saved under its own code 'waiting' with the manual rule` | `AssertionError: expected 400 to be 200 // Object.is equality` |
| same file › `'Night'`, `'Weekend'`, `'Holiday'` (no rule was written) | `AssertionError: expected false to be true // Object.is equality` at `expect(saved.predicateBoundAsJson).toBe(true)` |
| same file › `'Pet'`, `'Extra stop'`, `'Child seat'`, `'Meet and greet'`, `'Airport pickup'` (rule bound as text) | `AssertionError: expected false to be true // Object.is equality` at `expect(saved.predicateBoundAsJson).toBe(true)` |
| same file › `saving an existing extra again rewrites its rule as the manual object` | `AssertionError: expected false to be true // Object.is equality` |
| `lib/pricing/rateBook.test.ts` › `reads a rule stored as a JSON string (the live child-seat row) as the manual rule` | `AssertionError: expected {} to deeply equal { kind: 'manual' }` |
| `lib/pricing/predicates.test.ts` › `manual (chosen by the customer at checkout) never applies in the quote, and says why` | `AssertionError: expected {} to deeply equal { predicate: 'manual' }` |
| `lib/checkout/live-child-seat-rule.test.ts` › `is read as the manual rule: chosen by the customer` | `AssertionError: expected {} to deeply equal { kind: 'manual' }` |

Before: `Tests 11 failed | 1 passed (12)` for the route file; `Tests 3 failed | 37 passed (40)` for the
other three files.

Green before and after, on purpose (they pin what must not change, so they cannot fail first):

| Test | What it pins |
|---|---|
| `lib/checkout/live-child-seat-rule.test.ts` › `is not added by the quote` | The live row, rule as the string `"{\"kind\":\"always\"}"`, through `mapRateBook` and `priceQuote`: no line with code `child-seat`, no surcharge or included line at all. |
| same file › `is a tick box on /checkout at its own amount` | Same row through `loadCheckoutCatalog`: `[["child-seat", 1000]]`. |
| same file › `is charged only when ticked, amount × 1` | `checkoutCharge`: unticked net 0, ticked one surcharge line `child-seat` 1000, net 1000. |
| same file › `contrast: … the object 'always' … is added by the quote and is not a tick box` | Shows the three guards can see the difference: the same row with the object `always` gives a `surcharge` line of 1000 and no tick box. |
| `lib/ops/rate-book-extra-rule.test.ts` › `the rule is stored as a JSON object; the old write stored a JSON string` | Runs the installed driver's jsonb serializer (client built with `fetch_types: false`, `prepare: true`, never connected): the old write gives a JSON string, `tx.json` gives the object. It describes the driver, so it was green before. |
| `lib/pricing/rateBook.test.ts` › `reads the manual rule object as it is`, `leaves a rule stored as an object alone…` | `always` stays `always`; `{}`, `null`, missing stay `{}`. |

After: green. `npx vitest run lib/ops/rate-book-extra-rule.test.ts lib/ops/rate-book-live-row-id.test.ts
lib/checkout/live-child-seat-rule.test.ts lib/pricing/rateBook.test.ts lib/pricing/predicates.test.ts
lib/ops/rappen.test.ts lib/ops/surcharge-codes.test.ts` → `Test Files 7 passed (7)`, `Tests 65 passed (65)`.
Neighbours and law tests that read these files as text (`phase-26-3-laws`, `phase-26-4-laws`,
`ops-pricing-264`, `ops-pricing-tabs`, `ops-write-contract`, `ops-dc-finalize`, `rate-book-draft`,
`draft-preview-unpaid`, `mapbox-zone`, `checkout-catalog`, `extras-g6`, `extras-catalog`, all of
`lib/pricing`) → `Test Files 27 passed (27)`, `Tests 381 passed (381)`.

Existing test changed: `lib/ops/rate-book-live-row-id.test.ts` — its database stand-in got a `json`
helper (one line), because the route now binds the rule through `tx.json`. No expectation changed.

The tick-box half of the ten-names table (Night, Weekend, Holiday, Waiting as tick boxes) is A2's
change, so its test is in A2.

---

## A2 — the tick-box list is decided by the row alone

Commit: `0d8d2a19`

### What changed

| File | Change |
|---|---|
| `apps/web/lib/checkout/extras-catalog.ts` | `selectableExtras`: a tick box is a row that is active, kind `amount`, amount a whole number ≥ 1 rappen, rule `manual`, no quantity source. The name test (`isPassengerExtra`), the "already on the quote" test and `row.code === "extra_stop"` are gone from it. First row per code still wins. The legacy string reaches this function as `manual` through `mapSurcharge` (A1); `loadCheckoutCatalog` is its only caller and always maps first. |

### Tests

New, failing before the change:

| Test | Failure line before |
|---|---|
| `lib/checkout/extras-catalog.test.ts` › `a manual row with an amount is a tick box whatever its code` | `AssertionError: expected [ 'ski', 'pet', 'extra-stop', …(4) ] to deeply equal [ 'ski', 'waiting', 'night', …(14) ]` |
| same file › `a row the fare engine handles is not a tick box` | `AssertionError: expected [ 'pet', 'roof-box', 'ski', …(2) ] to deeply equal []` |
| same file › `a row without a readable rule is not a tick box` | `AssertionError: expected [ 'empty-rule', 'null-rule', …(2) ] to deeply equal []` |
| same file › `a manual row with a quantity source is not a tick box` | `AssertionError: expected [ 'child-seat' ] to deeply equal []` |
| `lib/ops/rate-book-extra-rule.test.ts` › `'Waiting' …` (saved through the route, then read as /checkout reads it) | `AssertionError: expected [] to deeply equal [ [ 'waiting', 1000 ] ]` |
| same file › `'Night' …`, `'Weekend' …`, `'Holiday' …` | `AssertionError: expected [] to deeply equal [ [ 'night', 1000 ] ]` (and `weekend`, `holiday`) |

Before: `Tests 8 failed | 26 passed (34)`.

Green before and after, on purpose: `inactive, percent, included, amount 0 and empty amount are not tick
boxes` (amount 0 stays hidden until Part B), `the first row per code wins`, and the three label tests.

After: green. `extras-catalog`, `rate-book-extra-rule`, `live-child-seat-rule`, `checkout-catalog`,
`extras-g6` → `Test Files 5 passed (5)`, `Tests 53 passed (53)`. Neighbours (`new-trip-intent`,
`callback-redirect`, `public-board`, `eligibility`, `phase-26-3-laws`, `phase-26-4-laws`) →
`Test Files 6 passed (6)`, `Tests 92 passed (92)`.

With this commit the ten names of RESEARCH "Answer 4" are complete end to end in one test
(`rate-book-extra-rule.test.ts`, `it.each`): each is saved through the real route under its own code,
gets the manual rule as a JSON object, no quantity source, its names under the same code, no quote
line, and one tick box `[code, 1000]`.

Existing test replaced: `lib/checkout/extras-catalog.test.ts` › `keeps active passenger amount rows
only, by exact code`. It expected `night`, `waiting`, `return_trip` and `extra_stop` to be dropped by
name and rows without a rule to be kept — exactly what the signed plan removes (RESEARCH Answer 6
lists it). Its fixture default rule changed from `null` to `{ kind: "manual" }`.

### What is different for rows that are not on live

| Row | Before | After |
|---|---|---|
| Old-style `child_seat` (rule `quantity`, source `child_seats`; books 13, 14 and any draft cloned from them) | A tick box, by accident | Not a tick box. The quote adds it only when a request sends a count, and no screen does. Saving it once on the Pricing page rewrites it with the manual rule and no quantity source (read from the route code, not run on such a row). |
| A row with the empty rule `{}` | A tick box if its name was allowed | Not a tick box. Such a row cannot be published from the dashboard (Publish gate, unchanged). |

Live book 18 holds neither.

---

## A3 — the name lists, the renaming and the dead name-based helpers are deleted

Commit: `fdd45c6f`

### What changed

| File | Change |
|---|---|
| `apps/web/lib/ops/surcharge-codes.ts`, `surcharge-codes.test.ts` | Deleted (`SURCHARGE_CODES`, `SurchargeCode`, `PASSENGER_EXTRA_CODES`, `AUTOMATIC_SURCHARGE_CODES`, `normalizeSurchargeCode`, `isAutomaticSurcharge`, `isPassengerExtra`, `extraWriteFields`). `checkoutExtraKindFromRappen` had moved in A1. |
| `apps/web/lib/checkout/extras-catalog.ts` | Deleted: `EXTRA_UI`, `extraUi`, `ExtraUi`, `extraIsOn`, `ExtraToggles`, `lockHasExtra`, `LockExtrasPeek`, `isWaitingPayableCode`, `extraFaresOn`, `isExtraStopCode`, `recapExtraFares`, `recapExtras`, `RecapExtraLine`, `RecapExtraFare`, `extraRappenOutsideLock`, `catalogFromSurcharges`, `pricedOnQuote`, `FREE_WAIT_CODE`, `MEET_GREET_CODE`, `CheckoutExtraJson`, and the import of the deleted file. |
| `apps/web/lib/ops/rate-book.ts` | The re-export of `SURCHARGE_CODES` / `SurchargeCode` is gone (no user). |
| `apps/web/lib/checkout/intent.ts` | The unused import and the unused `extrasCatalog` dependency field are gone. |
| `apps/web/lib/checkout/reprice.ts` | No longer builds `extrasCatalog` (nothing read it). |

Kept, as RESEARCH 5c says: `selectableExtras`, `humaniseCode`, `ExtraLabelsByCode`, `SurchargeLike`,
`SnapshotExtraFare` (imported by `lock-to-rpc.ts`), `PUBLIC_MAX_EXTRA_STOPS`, `capExtraStops`,
`publishedMaxExtraStops` (Part D owns the stop), the quantity machinery, and every old-booking reader
(`LEGACY_EXTRA_NAMES`, `payLinkExtras`, `extrasFromPolicy`, `legacyExtraCodes`, `EXTRA_CODES`,
`receiptPriceSplit`, the `BookingVoucher` label table, the `price.surcharge.<code>` messages). Also left in
place because they are not name-based: `airportPickupFromPlace` and `extraAmountTimesQty` (each used only
by a test today; Part C may want the second).

### Tests

New law test, failing before the change: `lib/checkout/extras-no-name-lists.test.ts`.

| Test | Failure line before |
|---|---|
| `lib/ops/surcharge-codes.ts does not exist` | `AssertionError: expected true to be false // Object.is equality` |
| `no source file imports it or uses one of its helpers` | `AssertionError: expected [ …(3) ] to deeply equal []` |
| `the tick-box module has no name-based helper left` | `AssertionError: expected [ 'EXTRA_UI', 'extraUi', …(15) ] to deeply equal []` |
| `the tick-box module compares no code to a quoted name` | `AssertionError: expected [ 'free_wait', 'meet_greet', …(12) ] to deeply equal []` |
| `no source file reads the dead extras catalog of the checkout re-price` | `AssertionError: expected [ 'lib/checkout/intent.ts', …(1) ] to deeply equal []` |

Before: `Tests 5 failed | 4 passed (9)`. The four that were green before are guards: the route binds the
rule through `tx.json(MANUAL_PREDICATE)` and writes `predicate` and `quantity_source` on both statements
(true since A1); the kept exports and the old-booking readers are still there.

After: green. `npx vitest run lib/checkout` → `Test Files 83 passed (83)`, `Tests 782 passed (782)`.
`rate-book-draft`, `rate-book-live-row-id`, `rate-book-stored-codes`, `rate-book-extra-rule`,
`ops-write-contract` → `Test Files 5 passed (5)`, `Tests 48 passed (48)`.

Existing tests changed or deleted, each because it pinned exactly what the plan removes:

| Test | Change |
|---|---|
| `lib/ops/surcharge-codes.test.ts` › `maps ops aliases onto book codes`, `treats passenger extras as the checkout catalog, not night`, `pairs quantity extras with the quote source` | Deleted with the file. |
| `lib/checkout/extras-catalog.test.ts` › `keeps ops extras and drops night`, `omits a surcharge after it is deleted from the published book`, `omits automatic night/weekend/holiday/waiting chips`, `lists a new published chip (pet, ski, unknown slug) and skips inactive`, `extra_stop is a chip without a fixed rappen × quantity fare`, `lists only selected extras on the recap, using book amounts`, `puts selected extras on the fare with the book amount`, `recap extras follow this booking's toggles, not a leftover lock`, `a code the owner added is on by its extra code list`, `does not invent meet & greet or free wait unless they are on the live book`, `shows amount 0 as included and does not charge it; a price is on the quote once` | Deleted: each tested a deleted helper. The name-free assertions inside them were kept as `an amount times a quantity…` and `reads an airport pickup from the place's zone type`; `public extras route still loads the live book` and `caps extra-stop places at 1 (D-21)` are unchanged. |
| `lib/checkout/reprice.test.ts` › `is ok with pricingLive true when the live rate version is live and public_chf is on` | The expected object lost `extrasCatalog: []`. |
| `lib/checkout/phase-26-3-laws.test.ts` › `no child_seat / oversized_luggage / extra_stop literal in checkout, e-mail or ops code paths` | Tightened: the deleted file left its allow-list and `extras-catalog.ts` is no longer exempt. Still green. |

---

## A4 (engine half) — the fare engine no longer treats rows named "waiting" differently

Commit: `90a109ea`

### What changed

| File | Change |
|---|---|
| `apps/web/lib/pricing/lines.ts` | Deleted `isWaitingSurcharge` and the branch that turned every row coded `waiting`, `waiting_airport` or `waiting_city` into an included line with payable 0. Deleted `includedMinutes` (the lookup of `airport_waiting_minutes` / `city_waiting_minutes` by code). An included line keeps its three fields, empty (`params.minutes: null`, `basis.included_minutes: null`, `basis.source: "settings_versions"`) — exactly what every non-waiting code already emitted, so no existing line changes shape. `settings` stays in the function's argument type, unread, so callers do not change. |

Not touched, as instructed: the dashboard "extra wait" figure (`apps/web/lib/ops/bookings.ts` query by code,
`bookings-map.ts`, `app/ops/OpsDetail.dc.html`). `row.code === "extra_stop"` in `buildExtraLines` is Part D.

### The lead's stop condition: does any amount change for a row that can exist on live?

No. The deleted branch ran only for a row that (1) is coded `waiting`, `waiting_airport` or `waiting_city`
and (2) has a rule that applies in the quote (`always`, a zone rule, a time window). Live book 18 holds one
extra, `child-seat`; its rule reads as `manual` and never applies. The Pricing page can now save the code
`waiting`, but always with the manual rule, so it never reaches that code path either (test below). The
local seed's `waiting_airport` / `waiting_city` rows carry the empty rule `{}` and no amount: no line before,
no line after.

What does change, for a row nobody can make from the dashboard: a hand-written row coded `waiting*` with
the rule `always` and an amount is now charged like any other `always` row. Before, it was shown as
included with nothing to pay.

### Tests

New, failing before the change (`lib/pricing/lines.test.ts`):

| Test | Failure line before |
|---|---|
| `an included row emits kind included and a null amount; no minutes are looked up by its code` | `AssertionError: waiting_airport: expected 7 to be null` |
| `a row coded waiting gives exactly the lines of the same row under any other code` | `AssertionError: waiting {"kind":"included"}: expected [ { seq: 102, leg_seq: 1, …(7) } ] to deeply equal [ { seq: 102, leg_seq: 1, …(7) } ]` |
| `a row coded waiting with an amount and an applying rule is charged like any other row` | `AssertionError: waiting: expected 'included' to be 'surcharge' // Object.is equality` |

Before: `Tests 3 failed | 54 passed (57)`.

Green before and after, on purpose: `an extra the owner names 'Waiting' (manual rule) is never added by the
quote` (codes `waiting`, `waiting_airport`, `waiting_city`, amount 1000, rule manual → no line).

After: green. `npx vitest run lib/pricing lib/quote lib/checkout/live-child-seat-rule.test.ts
lib/ops/rate-book-extra-rule.test.ts lib/ops/draft-preview-unpaid.test.ts` → `Test Files 27 passed (27)`,
`Tests 459 passed (459)`.

Existing tests replaced, each pinned exactly what the plan removes (RESEARCH Answer 6 lists both):
`included surcharge emits kind included, null amount, minutes from settings` and `amount-kind waiting is
included with payable 0 at pay (D-38)`.

---

## Checks run once at the end

| Check | Result |
|---|---|
| `pnpm --filter web exec tsc --noEmit -p .` (once, after the A4 code, before its commit) | exit 0, no output |
| `node scripts/check-no-invented-numbers.mjs` | `check-no-invented-numbers: ok` |

Not run, by instruction: `pnpm test:unit`, `pnpm typecheck`, `pnpm lint`, the integration, visual and
database suites.

---

## Proof that the live row is unchanged

File: `apps/web/lib/checkout/live-child-seat-rule.test.ts`. The row is the live row: code `child-seat`,
`amount_rappen 1000`, and the rule as the string value the database returns, `"{\"kind\":\"always\"}"`
(the test asserts `typeof` is `string`). Class fares are left empty, so no figure is invented.

| Step | Real code that runs | Result |
|---|---|---|
| Reader | `mapRateBook` | rule is `{ kind: "manual" }`, quantity source `null` |
| Quote | `mapRateBook` → `priceQuote` | lines exist for the class; none has code `child-seat`; no `surcharge` or `included` line at all |
| Tick box | `loadCheckoutCatalog` (→ `mapRateBook` → `selectableExtras`) | `[["child-seat", 1000]]` |
| Charge | `checkoutCharge` | unticked: no surcharge line, net 0 · ticked: one line `child-seat` 1000, net 1000 (amount × 1) |
| Contrast | same row, rule as the object `{ kind: "always" }` | one `surcharge` line of 1000 on the quote, no tick box — what "just fix the encoding" would have done to live |

The same four steps are green at every commit of this part (A1, A2, A3, A4).

---

## Stopped on

| # | Item | Why | What is left as it was |
|---|---|---|---|
| S1 | Deleting `surchargeTypeFromCode` (`ROUTE`) | The lead's condition: "if reachable, stop and report". It is reachable since commit `5f7dd5a9` (26.2-bp B4) lists rows whose stored code has an underscore: a row coded `meet_greet` in book 13 or 14, or in a draft cloned from one, gets the Type cell "Meet and greet" from this function. Deleting it changes that cell to "Checkout extra": a change on the Pricing page, which needs his signature (A5). | The function and its call. |
| S2 | Mirroring the type mapping in `app/ops/OpsPricing.dc.html` (`SURCHARGE_TYPES`, `surchargeTypeOf`) and `app/vamos-ops-data.js` (`cleanSurcharge`) | Same reason: it changes the Type cell, and the list names the copy keys `typeMeet`, `typeFreeWait`, `typeExtraWait` that A5 removes in four languages. Not script-only. | Both files untouched. |

**One visible consequence of S1 the owner should know before UAT:** an extra he names exactly "Waiting" is
now saved (code `waiting`), is a tick box at his price, and is never added by the quote — but on the
Pricing table its Type cell reads "Extra wait", because `surchargeTypeFromCode` and the mock still map the
code `waiting` to that type. Every other name reads "Checkout extra". It goes away with A5. Before this
part "Waiting" could not be saved at all.

---

## Not verified

| # | Item | Why it matters |
|---|---|---|
| V1 | The write was not run against a real Postgres (no Docker, no hosted SQL in this task). The proof is the installed driver's own jsonb serializer, with the Worker client's options, run over the parameter the real route hands over. | One check on the local stack closes it: save an extra on the Pricing page, then `select code, jsonb_typeof(predicate), predicate, quantity_source from public.surcharges where rate_version_id = <draft>` must show `object`, `{"kind": "manual"}`, `null`. |
| V2 | The `surcharges_quantity_source_pairing` check and the Publish gate were read (`20260825000001_surcharge_predicate.sql`), not run, against `{"kind":"manual"}` with no quantity source. Read: the pairing check passes (kind is not `quantity`, source is null) and the gate passes (the rule is not `{}`). | "Night / Weekend / Holiday no longer block Publish" rests on this. |
| V3 | Integration, visual and database suites (`apps/web/tests/**`, `packages/db/**`) were not run. By reading: the specs stub `/api/checkout/extras` or use fixtures with the manual rule already. | — |
| V4 | The full unit suite, lint and the repo typecheck script were not run (the lead runs them once). Run here: the touched files, all of `lib/checkout`, `lib/pricing`, `lib/quote`, the rate-book tests, and `tsc --noEmit` once. | — |
| V5 | A draft row saved before this part under the name "Night", "Weekend" or "Holiday" holds the empty rule `{}` and still blocks Publish until it is saved once more or deleted. The lead's data says draft 19 holds only `child-seat`, so none should exist; not read from the database. | Publish of an existing draft. |
| V6 | Nothing was looked at in a browser. No screen was meant to change; the only on-screen effect known is the Type cell for "Waiting" (S1). | — |
| V7 | Hosted books below 13 (RESEARCH N2) were not read. If one holds a hand-written row coded `waiting*` with an applying rule and an amount, and is cloned and published, that row would now be charged (A4). | Only if such a row exists; the seed's rows have the empty rule. |

---

## Needs a change in files I may not edit

None found for this part. `apps/web/tests/**` was searched for everything removed or changed
(`rateBook.error-surcharge-code`, `ski_rack`, `waiting_city`, `waiting_airport`, `extrasCatalog`,
`included_minutes`, `payable_rappen`, the deleted helper names, rules compared to `always`): the only hit is
`tests/integration/extras-charged-recorded-db.spec.ts:131`, whose fixture already uses
`{ kind: "manual" }` and should stay green. Not run (V3).

For the parts that are not mine:

| Where | What |
|---|---|
| A4 dashboard half (needs his signature) | `apps/web/lib/ops/bookings.ts` still reads a live row coded `waiting_airport` / `waiting` / `waiting_city` for the "extra wait" figure. After A1 the code `waiting` can exist as his own extra. If he names an extra exactly "Waiting" and publishes it, the booking detail's "extra wait" figure takes that extra's price whenever a driver's arrival is later than the pickup time plus the free wait (`extraWaitFromArrival`, `bookings-map.ts`). Display only, staff only, never charged — but a wrong figure. Before this part it was always empty because no such row could be saved. It goes with the signed A4 picture; until then this is the second visible consequence of the name "Waiting" (the first is S1). |
| A5 (needs his signature) | `surchargeTypeFromCode` in `ROUTE`, `SURCHARGE_TYPES` / `surchargeTypeOf` in `app/ops/OpsPricing.dc.html`, the type derivation in `app/vamos-ops-data.js` (S1, S2). |
| Part D | `row.code === "extra_stop"` in `apps/web/lib/pricing/lines.ts`, `PUBLIC_MAX_EXTRA_STOPS`, `capExtraStops`, `publishedMaxExtraStops`. |
| Nobody yet | `upsertSurcharge` in `apps/web/app/[locale]/(ops)/ops/pricing/[versionId]/actions.ts` is a second extra writer with no caller. It writes no rule; a row saved through it would be no tick box and would block Publish. Dead today. |

## Database, in words (no migration in this part)

Nothing is needed for this part to work: the column takes the new rule as it is, and live price book row 18
is not touched. Two optional things for a later migration number: the comment on `surcharges.predicate`
names five rule kinds and `manual` is a sixth; and the draft book's `child-seat` row could have its string
rule rewritten to the object (`where jsonb_typeof(predicate) = 'string'`), although the reader covers it
without that.

## Lead review (2026-09-30)

### Run against Postgres

Isolated local stack `vamos-taxi-262` (ports 6232x, from-zero replay of 116 migrations plus seed,
stopped afterwards), with the Worker client options (`max 1`, `fetch_types false`, `prepare true`),
inside one transaction that was rolled back:

| Write | `jsonb_typeof(predicate)` | Stored text |
|---|---|---|
| `${tx.json({ kind: "manual" })}` (the new write) | `object` | `{"kind": "manual"}` |
| `${JSON.stringify({ kind: "always" })}::jsonb` (the old write) | `string` | `"{\"kind\":\"always\"}"` — the same form the live child-seat row has |
| update of that old row with `predicate = ${tx.json(...)}`, `quantity_source = null` | `object` | `{"kind": "manual"}` |

The insert with the manual rule and no quantity source passed every check constraint of
`public.surcharges`.

### Changed by the lead

`apps/web/lib/ops/rate-book-extra-rule.test.ts` imported the `postgres` driver to reuse its jsonb
serializer. That import is fenced (D-10): lint, `check:db-fences` and the build failed. The test now
carries a small stand-in for the driver's JSON helper and cites the run above; no fence was
loosened, no allow-list entry added.

### Checks on the branch after that change

typecheck, lint (5 old warnings), lint:css, i18n:check, check:numbers, check:db-fences,
check:public-env, check:legal-claims, seed:check, build: pass. Unit set before the test change:
web 2816 + 1 skipped, emails 151, db 13 (the changed file re-run alone: green).
pgTAP on the isolated stack: 83 files, 1899 tests, **1 fails, on main too**:
`seed_idempotent.test.sql` test 33 wants 2696 content strings, the seed has 2698. This branch
changes neither the seed nor the message files.

### Found on the way: the same double encoding elsewhere (not changed here)

Every `${JSON.stringify(x)}::jsonb` bound by the Worker's driver stores a JSON string, not an object.

| Where | Column | Live today (read-only) | Effect |
|---|---|---|---|
| `apps/web/app/api/stripe/webhook/route.ts:38`, `apps/web/lib/checkout/return-settle.ts:101` | `stripe_events.payload` | all 68 rows are JSON strings | Stored for the record only, as far as read; any SQL that reads a field of it gets nothing. |
| `apps/web/lib/ops/edit-request.ts:189`, `:498` | `booking_edit_requests.payload` | no rows yet | The apply function reads `p_payload ->> 'scheduled_local'` and the other fields (migration 20260910175309:107-140). On a string they are all empty, so an accepted change would apply nothing. **Blocks P1**, which uses this machine; fixed there, reader and writer together. |
| `rate-book/route.ts:912, 918, 1093, 1099` | `rate_version_rules.payload` | no rows | A saved rule would be unreadable. |
| `rate-versions/[id]/publish/route.ts:141` | service area | not written in practice (live values are objects or empty) | none seen |

`apps/web/lib/checkout/create-booking.ts:59-63` already avoids it (hex-encoded text decoded in SQL).

### Still to do in Part A

| Item | Why it waits |
|---|---|
| A4 dashboard half: the "Extra wait" tag on booking detail (`app/ops/OpsDetail.dc.html:928-930`, `lib/ops/bookings.ts` query by code) | Screen change: picture and the owner's signature first. |
| A5: the Type column and the leftover words on Pricing > Extras (`OpsPricing.dc.html:240-251, 339-350, 1503-1515`), `surchargeTypeFromCode` in the route, the mirror in `app/vamos-ops-data.js` | Screen change: picture and signature first. |
| A6: deleting an extra deletes its four-language names | Migration `20261007110000` (number from the control session). |
| Until A4 and A5 land, an extra named exactly "Waiting" would show the Type "Extra wait" and feed the "Extra wait" tag. Part A is handed over only as a whole. | |

---

## A4 and A5 draft (2026-09-30)

Branch `gsd/26.2-p4-a45-draft`, cut from `gsd/26.2-p4-extras` at `ff09120c`. Owner decisions, question form,
2026-09-30: A4 "Remove the tag", A5 "Remove column and old words". **Draft for his picture signature: not
merged, not pushed, not deployed.**

| Commit | What |
|---|---|
| `28491388` | A4: the "Extra wait" tag and its data source go |
| `dc371bd0` | A5: the Type column, the type list and the old words go |
| `5ccfdea7` | A5 test: expected amount read from its fixture (check-no-invented-numbers flagged a CHF literal) |
| this commit | pictures and this section |

### A4 — what changed

| File | Change |
|---|---|
| `app/ops/OpsDetail.dc.html` | The tag `extraWait` ("Extra wait: N min · CHF …") is deleted, and its copy key in en/de/fr/ar (`Extra wait`, `Extra-Wartezeit`, `Attente extra`, `انتظار إضافي`). `extraWaitMinutes` / `extraWaitRappen` leave `EMPTY_BOOKING`. The "Arrived HH:MM" tag is unchanged. |
| `apps/web/lib/ops/bookings.ts` | The board query's `live` lateral join is deleted: it read the live book's `free_wait_minutes` and a surcharge row by code (`waiting_airport`, `waiting`, `waiting_city`). `l.arrived_at` stays. |
| `apps/web/lib/ops/bookings-map.ts` | `extraWaitFromArrival`, the fields `extraWaitMinutes` / `extraWaitRappen` and the row fields `free_wait_minutes` / `waiting_amount_rappen` are deleted. `arrivedAt` stays. |

Everything else the board and the detail use is unchanged. `rate_versions.free_wait_minutes` is still read by
`lib/ops/rate-book.ts` for the Pricing page (not part of A4).

### A5 — what changed

| File | Change |
|---|---|
| `app/ops/OpsPricing.dc.html` | Deleted: `SURCHARGE_TYPES`, `surchargeTypeOf`, the Type column (`surchargeColumns` key `type`), every branch on `meet_greet` / `free_wait` / `extra_wait` (a `meet_greet` row was forced to 0, a `free_wait` row showed hours instead of its amount), the free-wait `hours` field in the row mapping and in the blank row, `'type'` in the search keys. Every row now shows its own name and amount. |
| same file, copy table en/de/fr/ar | Deleted keys: `surchargeType` (the column header), `typeCheckoutExtra`, `typeMeet`, `typeFreeWait`, `typeExtraWait`, `notDeletableMeet`. Changed: `hintSurcharges`, `emptySurchargesBody` (table below). |
| `apps/web/app/[locale]/(ops)/api/staff/rate-book/route.ts` | `surchargeTypeFromCode` deleted; the GET payload's surcharge rows lose `type` and `hours` (`hours` was `type === "free_wait" ? "" : ""`, always empty). Grep: nothing else reads either from the payload. **Kept:** the save path's `recBody.type === "checkout_extra"` (lines 934, 983): it gates the amount check and the saving of the four-language names, and the Pricing page still sends `type: 'checkout_extra'` on save. |
| `app/vamos-ops-data.js` | `cleanSurcharge` no longer derives a type from the code (the mirror at old lines 822-829) and drops the `hours` field; `type` is passed through as sent, for the save path above. |
| `app/vamos-i18n-dict.js` | Append only. The old words stay where they are: `'Checkout extra'`, `'Meet and greet'`, `'Free airport wait'`, `'Extra wait'` (lines 959-962) and the old empty-list body (line 966). Two entries appended after line 966: the new empty-list body and `'Checkout extras'`, each with de/fr/ar as below, so `VamosLocale.coverage()` resolves the new text. |

### The four-language texts

| Key | Language | Before (`ff09120c`) | After |
|---|---|---|---|
| `emptySurchargesBody` | en | Add a checkout extra, extra-wait rate, or edit meet and greet and free wait. Meet and greet and free wait stay on for the customer. | Add an extra. Customers choose it at checkout. |
| | de | Checkout-Extra, Extra-Wartepreis oder Meet and greet und Freiwarten bearbeiten. Meet and greet und Freiwarten bleiben für den Kunden an. | Fügen Sie ein Extra hinzu. Kundinnen und Kunden wählen es beim Checkout. |
| | fr | Ajoutez un extra de paiement, un tarif d’attente extra, ou modifiez l’accueil et l’attente libre. L’accueil et l’attente libre restent activés pour le client. | Ajoutez un extra. Les clients le choisissent au paiement. |
| | ar | أضف إضافة دفع أو سعر انتظار إضافي أو عدّل الاستقبال والانتظار المجاني. يبقى الاستقبال والانتظار المجاني مفعّلين للعميل. | أضف إضافة. يختارها العملاء عند الدفع. |
| `hintSurcharges` (the line under "Surcharges & extras" in the tab list) | en | Checkout extras, wait, meet and greet | Checkout extras |
| | de | Checkout-Extras, Warten, Meet and greet | Checkout-Extras |
| | fr | Extras de paiement, attente, accueil | Extras de paiement |
| | ar | إضافات الدفع والانتظار والاستقبال | إضافات الدفع |

The hint kept its first part word for word; only the words about waiting and meet and greet were dropped. The
empty-list body is the owner's text verbatim (Swiss German, no "ß").

Deleted, all four languages: `surchargeType` (Type / Typ / Type / النوع), `typeCheckoutExtra` (Checkout extra /
Checkout-Extra / Extra de paiement / إضافة الدفع), `typeMeet` (Meet and greet / Meet and greet / Accueil /
الاستقبال), `typeFreeWait` (Free airport wait / Freiwarten am Flughafen / Attente libre à l’aéroport / انتظار مجاني
في المطار), `typeExtraWait` (Extra wait / Extra-Warten / Attente extra / انتظار إضافي), `notDeletableMeet`
("Meet and greet stays on. …" and its three translations; it was already unused).

### Tests

New file `apps/web/lib/ops/ops-dc-p4.test.ts` (technique of `ops-dc-u08` / `ops-dc-bp`: the DC script block runs
against a stub `DCLogic`, the real `renderVals` and the real copy table are asserted). Before the change:
`Tests 20 failed (20)`, every one on an assertion:

| Test | Failure line before |
|---|---|
| A4: a trip that arrived after pickup shows Arrived and no Extra wait (en, de, fr, ar — four tests) | `expected [ 'Driver', 'When', …(9) ] to not include 'Extra wait'` · de `… to not include 'Extra-Wartezeit'` · fr `… 'Attente extra'` · ar `… 'انتظار إضافي'` |
| A4: the copy table has no extraWait key in any language | `en: expected { …(154) } to not have property "extraWait"` |
| A4: the board mapper sends no extra-wait figure, and still sends the arrival time | `expected { id: 'VT-26-4821', …(50) } to not have property "extraWaitMinutes"` |
| A4: the board query reads no surcharge row by its code and no free-wait setting | `expected '// apps/web/lib/ops/bookings.ts …' not to match /waiting_airport\|waiting_city\|'waiting'/` |
| A5: the Extras table has two columns: name and amount | `expected [ 'type', 'label', 'value' ] to deeply equal [ 'label', 'value' ]` |
| A5: an extra stored under the code meet_greet / free_wait / extra_wait / waiting / waiting_city / waiting_airport shows its own name and price, like any other extra (six tests) | meet_greet: `expected [ Array(3) ] to deeply equal [ Array(3) ]` · free_wait: `expected [ 'Free airport wait', …(2) ] to deeply equal [ Array(3) ]` · the four waiting codes: `expected [ 'Extra wait', 'Child seat', …(1) ] to deeply equal [ Array(3) ]` |
| A5: search does not index a type | `expected [ 'label', 'type', 'name' ] to not include 'type'` |
| A5: the copy table holds none of the type words or the meet-and-greet line, in four languages | `en.surchargeType: expected { title: 'Pricing & routes', …(202) } to not have property "surchargeType"` |
| A5: the Extras hint no longer talks about waiting or meet and greet; the rest stays | `en: expected 'Checkout extras, wait, meet and greet' not to match /wait\|meet and greet/i` |
| A5: the empty list says: add an extra, customers choose it at checkout — in four languages | `en: expected 'Add a checkout extra, extra-wait rate…' not to match /wait\|meet and greet/i` |
| A5: the rate-book payload carries no type derived from the code and no free-wait hours | `expected '// apps/web/app/[locale]/(ops)/api/st…' not to match /surchargeTypeFromCode/` |
| A5: the dashboard data layer derives no type from the code | `expected '\n    s = s \|\| {};\n    var type = st…' not to match /meet_greet\|free_wait\|extra_wait\|waiti…/` |

After: `Tests 20 passed (20)`.

Existing tests changed, each only where it pinned exactly what the owner removed:

| File | Was | Now |
|---|---|---|
| `lib/ops/bookings-write.test.ts` | `computes extra wait from published free_wait_minutes, not 60` (called `extraWaitFromArrival`) | deleted with its import; the arrival-clock test beside it is unchanged |
| `lib/checkout/extra-wait-no-offsession.test.ts` | `ops extra wait is display-only …` pinned the doc comment `Display only — never a Stripe amount` of `extraWaitFromArrival` | `ops board mapper never opens a PaymentIntent`: the mapper holds no `extraWait`; the four no-PaymentIntent checks are unchanged |
| `lib/ops/ops-dc-finalize.test.ts:81` | `toMatch(/typeCheckoutExtra/)` | `not.toMatch` |
| `lib/ops/ops-pricing-tabs.test.ts:58` | `toContain("SURCHARGE_TYPES")` | `not.toContain` |

Nothing under `apps/web/tests/**` names any removed piece (searched: the four old type words, `surchargeType`,
`Type or name`, `Extra-Wartezeit`, `extraWait`); nothing there was edited.

### Checks run once at the end

| Check | Result |
|---|---|
| `pnpm typecheck` | exit 0 (db, emails, isolation-probe, web) |
| `pnpm lint` | exit 0, 5 warnings, all in files this branch does not touch (the 5 old ones) |
| `pnpm i18n:check` | passed — 2664 keys, 1036 literal call sites, 2664 messages |
| `node scripts/sync-dc-mock-to-public.mjs`, then `lib/ops/ops-dc-*.test.ts` (bp, finalize, p4, settings, u08) plus bookings-write, ops-pricing-tabs, extra-wait-no-offsession, customers-board | `Test Files 9 passed (9)`, `Tests 135 passed (135)` |
| During work, three runs over every test file that imports or reads a touched file (A4: 20 files, 220 tests; A5: 22 files, 226 tests; dictionary readers: 13 files, 180 tests) | green, except the one `origin/main` test below |
| `node scripts/check-no-invented-numbers.mjs` | ok (after `5ccfdea7`) |

One red test that is **not** from this branch: `lib/legal/privacy-account-paragraph.test.ts` > "manage-booking
mock is untouched relative to origin/main" diffs `app/pages/manage-booking.dc.html` against `origin/main`, which
has moved since `ff09120c` (native scrolling, `561d1647`, removes three Lenis lines there). This branch does not
touch that file (`git diff ff09120c -- app/pages/manage-booking.dc.html` is empty). Bringing main into the branch
before hand-over clears it.

### Pictures (for the owner's signature)

Folder `.planning/quick/260930-p4-extras-no-hardcoded-names/screens/`, 68 PNGs.

How they were made: the real dashboard shell `app/ops/ops.dc.html`, served the way the Worker serves it
(`<base href="/app/ops/">` and the signed-in flag, as `apps/web/middleware.ts` `serveOpsDc` does), with the real
`vamos-ops-api.js` / `vamos-ops-data.js` and the real screens. "Before" is served from `git archive ff09120c`,
"after" from this branch. Every `/api/*` call is answered inside the script; nothing left the Mac. Headless
Chromium from the Playwright cache, 1× scale, reduced motion. The one-off scripts lived in the session scratchpad
and are not committed; nothing under `apps/web/tests` or `apps/web/playwright.config.ts` was edited.

- Pricing: the rate-book answer carries one row shaped like the live child-seat row (code `child-seat`, 1000
  rappen through the route's own `moneyFromRappen`, English name as `labelEn`); the "before" row also carries
  `type` and `hours`, as `ff09120c`'s route sent them.
- Booking detail: the bookings answer is the output of each version's own `mapBoardBooking` (run from the file at
  `ff09120c` and on the branch) over the same row: paid, confirmed, Economy, pickup 08:00 Zurich, the driver marked
  arrival at 08:25. No amounts (the total reads CHF 000). The live free-wait setting was not read, so the fixture
  leaves it empty; the "before" mapper therefore gives `extraWaitMinutes: 25`.

| Set | Files | What it shows |
|---|---|---|
| A5, one extra | `a5-{before,after}-{en,ar}-{1440,1024,768,390}.png`, `a5-sheet.png` | Before: a TYPE column reading "Checkout extra" / "إضافة الدفع"; the tab hint reads "Checkout extras, wait, meet and greet". After: NAME and AMOUNT only; hint "Checkout extras" / "إضافات الدفع". At 390 px "before" the amount is pushed out of the visible table; "after" name and amount both fit. |
| A5, empty list | `a5-empty-{before,after}-{en,ar}-{…}.png`, `a5-empty-sheet.png` | Added because the empty-list body is the owner's new text: before the old body about extra-wait rates and meet and greet, after "Add an extra. Customers choose it at checkout." / "أضف إضافة. يختارها العملاء عند الدفع." |
| A4, real shell | `a4-{before,after}-{en,ar}-{…}.png`, `a4-sheet.png` | **Before and after are byte-identical at every width in both languages** (md5 compared). See F1: on the live dashboard neither "Extra wait" nor "Arrived" ever reached this screen. |
| A4, data layer bypassed | `a4-direct-{before,after}-{en,ar}-{…}.png`, `a4-direct-sheet.png` | Same shell, but the three fields the data layer drops (`arrivedAt`, `extraWaitMinutes`, `extraWaitRappen`) are handed from the API row to the screen, so the removed tag can be seen at all. Before: "ARRIVED 08:25" and "EXTRA WAIT 25 min". After: "ARRIVED 08:25" only. |

All 64 page renders: `dir="rtl"` in Arabic, no sideways scroll (`scrollWidth − clientWidth = 0`) at 1440, 1024,
768 and 390.

### Found on the way (not changed)

| # | What | Where | Effect |
|---|---|---|---|
| F1 | The dashboard data layer drops `arrivedAt`, `extraWaitMinutes` and `extraWaitRappen`: `cleanBooking` copies a fixed list of fields and these three are not in it (since `e55a6243`, 2026-09-14). The detail screen reads its booking only from that store. | `app/vamos-ops-data.js` `cleanBooking` | On live the "Extra wait" tag never showed, so A4 changes nothing a user sees (pictures prove it). It also means **"Arrived HH:MM" never shows on live either**, although Mark arrival saves the time. Passing `arrivedAt` through is one line, but it is a screen change: his word first. |
| F2 | The Pricing Name cell shows the stored code "child-seat", not "Child seat". The route sends the English name as `labelEn`; the table reads `name`, then `label`. | route `withExtraLabels`, `cleanSurcharge`, `OpsPricing` | Same before and after; not part of A5. |
| F3 | The search field on Pricing > Extras still says "Type or name" (and its three translations) although the Type column is gone. Not in the owner's list, left as it was. | `OpsPricing` `searchSurcharges` | Question for him: should it read "Name"? |
| F4 | Unused copy keys on the same subject stay in the Pricing copy table in four languages: `whatThisDoes`, `doesMeet`, `doesFreeWait`, `doesExtraWait`, `extraHours`, `extraWaitRate`, `meetAmount`, `meetAmountHint`, `notDeletableWait`. Not read by any code, never on screen. The Rules pane keys `kindWaiting`, `kindFreeWait`, `emptyRulesBody`, `hRulePayload` are also unread here. | `OpsPricing` copy table | None on screen. Left because they were not in the list; one line each to remove on his word. |
| F5 | Every booking-detail render logs `TypeError: Cannot read properties of undefined (reading 'dialogOpen')`: `componentDidUpdate` reads `prevState.dialogOpen` when the runtime passes no `prevState`. | `OpsDetail.dc.html:725-727` | Before and after alike; the page still renders. |
| F6 | Arabic booking detail: "Paid by card" is not translated, and the mobile number reads reversed ("00 00 000 79 41+", no `vt-dir-keep`). | `OpsDetail` | Before and after alike. |
| F7 | In these renders the amount cell reads "CHF 10": the route's `moneyFromRappen(1000)` sends "10". | route, `VamosLocale.money` | Same before and after; not compared with the live page. |

### Not verified

| # | Item |
|---|---|
| N1 | Nothing was looked at on the live site or in the Hermes browser; the pictures are local renders with answered API calls. |
| N2 | The live book's `free_wait_minutes` was not read (no hosted SQL). Only the "data layer bypassed" before-pictures depend on it. |
| N3 | German and French were not photographed (the job asked for English and Arabic); their strings are pinned by the tests. |
| N4 | The full unit suite, the integration, visual and database suites were not run (the lead runs them once). |
| N5 | No database change and no migration in A4/A5; the hosted database was not touched. |
