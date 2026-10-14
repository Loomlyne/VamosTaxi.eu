# Quick 261013 · Task 2 notes (server + engine)

Commit: `d06e84a1` on `fix/pricing-staff-policies` (parent `216ca39a`). Not pushed. No database stack was started.

## Files changed

Source:
- `apps/web/lib/pricing/bands.ts`: deleted
- `apps/web/lib/pricing/types.ts`: DistanceBandRow, RegionPremiumRow and the `distance_bands` / `region_premiums` fields of RateBook removed
- `apps/web/lib/pricing/rateBook.ts`: mapDistanceBand, mapRegionPremium and the two fields removed
- `apps/web/lib/pricing/lines.ts`: buildRegionPremiumLine, `distanceBands?` arg and both imports removed
- `apps/web/lib/ops/pricing.ts`: CompletenessKind = distance_rate | surcharge | fixed_route | coupon; rules/bands/bandOverlap queries removed
- `apps/web/lib/ops/rate-book.ts`: band/region/rule types, loader queries, RateBook fields, `ruleId` / `rule_id`, clone inserts for the three tables and the `rule_id` subselect, the two quoteBookDocById keys removed. `quote_lock_minutes` still copied by the fork.
- `apps/web/lib/ops/draft-preview.ts`: recap is start, km, extras, vat, total
- `apps/web/app/[locale]/(ops)/api/staff/rate-book/route.ts`: see contract below. DRAFT_KINDS without `band`; rulePayload, cityPairRuleFor, mockBands, mockRegionPremiums, mockRules, quoteLockMinutesFromHours, minutesFromHours, the generic quoteLockHours pre-block, the hidden city_pair write, the band branch, band/rule DELETE and draftRowId kinds removed. New `quoteLockMinutesFromWholeHours` + `parseRuleSetting` (not exported: Next route files allow only route exports).
- `apps/web/app/[locale]/(ops)/api/staff/rate-versions/[id]/publish/route.ts`: `lockMinutes = asNullableInt(row.quote_lock_minutes) ?? QUOTE_LOCK_MINUTES`, used on the live row and in the settings_versions insert
- `apps/web/app/[locale]/(ops)/api/staff/rate-versions/[id]/discard/route.ts`: three statements on the dropped tables removed
- `apps/web/lib/quote/lock.ts`: comments only (QUOTE_LOCK_MINUTES = 1440 is now the default)
- `docs/build/OWNER-ANSWERS.md`: one dated history line under the bands/region table

Tests:
- deleted: `lib/pricing/bands.test.ts`, `lib/ops/rate-book-fork-bands-rules.local.test.ts`
- new: `lib/ops/publish-quote-lock.local.test.ts`
- `lib/ops/rate-book-clone-retired.local.test.ts`: p30_clone_test_all policy hack, band/rule fixtures and assertions removed; now asserts a retired class's distance_rates AND fixed_routes are not copied, the live class's are (adds two synthetic service_zones rows)
- `lib/ops/rate-book-live-row-id.test.ts`: band/rule cases removed; 24 quote_lock route cases added (real route, in-memory DB)
- source-scan absence checks: pricing, publish-public-chf, rate-book-draft, rate-book-clone-retired, rate-book-jsonb-writers, draft-preview-unpaid, draft-preview-lines, ops-pricing-264, d15-recipe (whole lib/pricing), extra-wait-no-offsession (lines.ts)
- fixture cleanup (`distance_bands: []` / `region_premiums: []` / `ruleId` / `rule_id` / `distanceBands`): booking-change, booking-change-price, booking-trip-change, trip-change-retired-class, rate-book-extra-rule, rate-book-stored-codes, eligibility, lines, party-van-luxury-12, one-form-fare-parts, priceQuote, priceQuote.property, public-board, engine, party-intent-van-luxury-12

## Runs (clock from `date`, +04)

| Time | Run | Result | Log |
|---|---|---|---|
| 04:14:34 | `apps/web/node_modules/.bin/tsc --noEmit -p .` (apps/web) | exit 0 | (stdout) |
| 04:14:34 | grep gate (plan Task 2 step 11 pattern, non-test apps/web, excl. public) | no match | (stdout) |
| 04:14:46 | vitest, 31 listed files | 1 failed (my VAT regex in rate-book-draft.test.ts), fixed | logs/task2-vitest-1.log |
| 04:14:58 | vitest, same 31 files | 29 passed, 2 skipped (the two *.local.test.ts, no VAMOS_LOCAL_DB_PORT), 456 tests, exit 0 | logs/task2-vitest-2.log |
| 04:15:14 | vitest, 67 unit files that import or read any changed module | 67 passed, 995 tests, exit 0 | logs/task2-vitest-related.log (list: logs/task2-related-tests.txt) |
| 04:16:03 | eslint on the 38 touched .ts files | exit 0 | logs/task2-eslint.log |
| 04:16:09 | `pnpm --filter @vamos/db run seed:check` | no drift, exit 0 | logs/task2-seed-check.log |
| 04:16:10 | `pnpm i18n:check` | passed, exit 0 | logs/task2-i18n-check.log |
| 04:16:10 | `pnpm check:numbers` | ok, exit 0 | logs/task2-check-numbers.log |

## Verified
- tsc clean; touched and related unit tests green; eslint clean; seed.sql unchanged; i18n and numbers gates pass.
- Grep gate empty: no non-test apps/web source names distance_bands, region_premiums, rate_version_rules, rule_id, ruleId, regionPremiums, DistanceBandRow, RegionPremiumRow, classBandExtrasRappen, buildRegionPremiumLine, cityPair, band_overlap.
- Route behaviour (unit, real handler, in-memory DB): 48 → 2880 on the draft, answer "48", live untouched; "36" accepted; 0, -1, "", "x", 1.5, "1.5", null, 35791395, true → 400 `invalid`, no fork, nothing changed; 35791394 accepted (max int4 minutes); existing draft written, not re-forked; ruleKind waiting/free_wait/service_area/city_pair/lock/night/"" → 400, no fork; vat still writes; a surcharge PUT carrying quoteLockHours 99 does not touch the minutes; answer has no bands/regionPremiums/rules and shows "24" when the book has no minutes; PUT band, DELETE band, DELETE rule → 400, no fork.
- The currently deployed DC (app/vamos-ops-data.js) reads missing collections as [] (`pickRows`), so the GET without bands/regionPremiums/rules does not break it before Task 3.

## Not verified
- The two *.local.test.ts files were not run (no database stack in this task, by instruction). Publish keeping 2880 / defaulting to 1440 on a real database and the clone test are proved only by source checks until the lab run.
- Behaviour against the Part B schema (tables dropped) on a real database: same lab run.
- Full `test:unit` and `gate:local` not run (by instruction).

## Failed
- None open. One self-inflicted test regex failure at 04:14:46, fixed at 04:14:58.

## Deviation from the plan
- (f) in publish-quote-lock.local.test.ts uses kind `route` (no Mapbox → 400 after the point where the old generic pre-block ran) instead of kind `distance`: a distance PUT needs a full class body and could write a row; the route PUT proves the same thing and writes nothing. The unit test also proves it with a valid surcharge PUT (200).
- Rule kinds are validated before `resolveWritableVersionId`, so a refused value or kind never forks a draft (the plan did not say; it keeps "value unchanged" true with no side effect).

## API contract for Task 3 (the DC's "Price stays valid for" field)

Read (already in the existing GET the DC's loadVat uses):
- `GET /api/staff/rate-book` → `200 { ok: true, data: { …, quoteLockHours: "24" } }`. `quoteLockHours` is a string, never empty: `String((book.quoteLockMinutes ?? 1440) / 60)`. A book that stored non-whole hours before this change (old writer allowed e.g. 90 minutes) would show "1.5"; live today holds 1440 (24).

Write:
- `PUT /api/staff/rate-book` (dashboard host; `app/api/staff/rate-book/route.ts` re-exports the same handler)
- Headers: `content-type: application/json`; same-origin (non-GET needs an allowed Origin, else 403 `csrf`)
- Body: `{ "kind": "rule", "ruleKind": "quote_lock", "quoteLockHours": 48 }`
  - `quoteLockHours`: whole number ≥ 1, as a number (48) or a digit string ("48"); surrounding spaces in a string are trimmed. Also read from `quote_lock_hours` or `payload.hours`, in that order.
  - optional `versionId`: omitted → the existing draft, else the live book is forked into a draft first (same as VAT). The live book is never written.
- 200: `{ ok: true, data: <full book payload> }` with `data.quoteLockHours === "48"` (also versionId, status, slug, label, routes, rates, surcharges, zones, classes, vatRateBps, freeWaitHours). Writes `rate_versions.quote_lock_minutes = hours × 60 where id = <draft> and status = 'draft'`.
- Errors (all `{ ok: false, code }`):
  - 400 `invalid`: hours not a whole number ≥ 1 (0, negative, "", "x", 1.5, "1.5", null, boolean) or hours × 60 > 2147483647 (i.e. hours > 35791394); ruleKind other than `quote_lock` / `vat`; missing ruleKind; body not JSON or not an object. Nothing is written and no draft is forked.
  - 404 `not-found`: no rate version to write, or the book cannot be read back
  - 401/403 from withAdmin: session codes from `staffStatus`, `csrf` (403), `not-staff` (403); 503 `staff-check-failed`
  - 409 `frozen` / `check` / `duplicate`, 403 `forbidden`, 500 `unknown`: database refusals through failWrite (not expected on a draft)
- Kind `rule` with ruleKind `vat` is unchanged (`vat_rate_bps`). No other PUT kind writes `quote_lock_minutes` any more. Kind `band` is 400 on PUT and DELETE; DELETE kind `rule` is 400.
- Publish (`POST /api/staff/rate-versions/:id/publish`) keeps the draft's minutes; nothing for the DC to send.

Expected `vamos-ops-data.js` shape (per plan key_links): `saveDraftQuoteLock(hours)` → `api('PUT', '/api/staff/rate-book', { kind: 'rule', ruleKind: 'quote_lock', quoteLockHours: hours })`; on `ok === true` read `json.data.quoteLockHours`.

## *.local.test.ts for the orchestrator's single lab run

From apps/web, with the lab's port (`VAMOS_LOCAL_DB_PORT=<port from LAB_DB_URL>`), `--no-file-parallelism`:
1. `lib/ops/publish-quote-lock.local.test.ts` (new; publishes two books on the lab, last one holds 1440)
2. `lib/ops/rate-book-clone-retired.local.test.ts` (rewritten; inserts two synthetic service_zones)
3. `lib/ops/publish-label.local.test.ts` (unchanged; regression on the Publish route edit)

Deleted, do not run: `lib/ops/rate-book-fork-bands-rules.local.test.ts`.
