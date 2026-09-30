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
