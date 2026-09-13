---
phase: 11-launch-cutover
plan: 07
subsystem: payments
tags: [VAT, vat_rate_bps, CH_VAT_RATE_BPS, D-22, checkout-intent, fail-closed-81]

# Dependency graph
requires:
  - phase: 11-launch-cutover
    provides: loadLaunchFlags().vat_rate_bps via asQuote quote_rate_book (11-03)
provides:
  - vatOnTopRappen / payableWithVatRappen optional bps with fallback 81
  - okIntentResponse JSON field vat_rate_bps next to amount_rappen
  - confirmation receipt VAT line accepts the same bps
affects: [11-08, 11-09]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Optional VAT bps on helpers; omitted/null/non-finite/negative → CH_VAT_RATE_BPS 81; 0 is a real no-VAT rate
    - Route handlers load asQuote flags and inject into checkout lib; lib does not import Hyperdrive quote.ts

key-files:
  created: []
  modified:
    - apps/web/lib/checkout/vat.ts
    - apps/web/lib/checkout/vat.test.ts
    - apps/web/lib/checkout/intent.ts
    - apps/web/lib/checkout/confirmation-receipt.ts
    - apps/web/app/api/checkout/intent/route.ts
    - apps/web/app/api/checkout/pay-link/route.ts

key-decisions:
  - "CH_VAT_RATE_BPS stays 81; do not invent 7.7"
  - "0 bps is a real rate (no VAT); null/omitted/NaN/negative fail-closed to 81"
  - "vat_rate_bps lives on intent JSON only, not QuoteResponseBody / respond.ts"
  - "loadLaunchFlags stays in route handlers (asQuote); checkout lib takes an optional loader dep"

patterns-established:
  - "Owner VAT bps from loadLaunchFlags; code default 81; charge remains CHF"

requirements-completed: [LAUNCH-06]

# Metrics
duration: 10min
completed: 2026-09-13
---

# Phase 11 Plan 07: Injected VAT bps with fallback 81 Summary

**Checkout VAT math takes optional settings `vat_rate_bps` (default `CH_VAT_RATE_BPS` 81); intent JSON exposes that integer next to `amount_rappen` so 11-08 can paint owner % without changing the 8.1% default**

## Performance

- **Duration:** 10 min
- **Started:** 2026-09-13T00:03:00Z
- **Completed:** 2026-09-13T00:13:08Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments

- `vatOnTopRappen` / `payableWithVatRappen` take optional `bps`; omitted/null/NaN/negative → 81; `vatOnTopRappen(10000, 0) → 0`
- Intent payable uses `loadLaunchFlags().vat_rate_bps` (fail-closed 81) and `okIntentResponse` JSON includes integer `vat_rate_bps` next to `amount_rappen`
- Receipt `vatOnTopRappen(fare+extras, args.vatRateBps)` uses the same fallback; charge currency remains CHF
- Existing 8.1% on-top identities stay green; `vatIncludedRappen` unchanged; no `vat_rappen` on snapshots

## Task Commits

Each task was committed atomically:

1. **Task 1: GREEN injected bps on vat.ts** - `b0f9695` (test) then `9129e91` (feat)
2. **Task 2: Checkout intent and receipt use settings bps** - `6168517` (feat)

**Plan metadata:** (this commit)

## Files Created/Modified

- `apps/web/lib/checkout/vat.ts` - optional bps via `vatBps()`; `CH_VAT_RATE_BPS` stays 81
- `apps/web/lib/checkout/vat.test.ts` - injected-bps cases + source-read of intent/receipt wiring
- `apps/web/lib/checkout/intent.ts` - `loadLaunchFlags` dep, payable + JSON `vat_rate_bps`
- `apps/web/lib/checkout/confirmation-receipt.ts` - optional `vatRateBps` into `vatOnTopRappen`
- `apps/web/app/api/checkout/intent/route.ts` - inject `() => loadLaunchFlags(env)`
- `apps/web/app/api/checkout/pay-link/route.ts` - same injection

Unchanged: `respond.ts`, `QuoteResponseBody`, `CheckoutClient`, completeness gaps, snapshot columns.

## Decisions Made

- Keep `CH_VAT_RATE_BPS = 81`; do not invent 7.7
- `0` is a valid rate (no VAT); only omitted/null/non-finite/negative fall back to 81
- Do not import `lib/db/quote.ts` into checkout lib (Hyperdrive + db-fences). Routes call `asQuote` `loadLaunchFlags` and pass a thunk
- Intent JSON field only; 11-08 reads it. Charge stays CHF (D-20)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Route injection for asQuote flags**
- **Found during:** Task 2 (Checkout intent and receipt use settings bps)
- **Issue:** Plan `files_modified` omitted the intent/pay-link routes, but `loadLaunchFlags` is `asQuote` and cannot live in `lib/checkout` (db-fences + Hyperdrive in unit graph)
- **Fix:** Routes pass `loadLaunchFlags: () => loadLaunchFlags(env)`; lib fail-closes to 81 if the thunk is omitted or throws
- **Files modified:** `apps/web/app/api/checkout/intent/route.ts`, `apps/web/app/api/checkout/pay-link/route.ts`, `apps/web/lib/checkout/intent.ts`
- **Verification:** source-read in `vat.test.ts`; `lib/checkout/intent.test.ts` still does not import quote.ts
- **Committed in:** `6168517` (Task 2)

---

**Total deviations:** 1 auto-fixed (missing critical)
**Impact on plan:** Necessary so owner bps actually reach payable/JSON. No scope creep. No CheckoutClient, no respond.ts, no SQL.

## Issues Encountered

- Plan verify path `lib/quote/intent.test.ts` exists and is the `pricing_not_live` suite (17/17). `lib/checkout/intent.test.ts` still cannot load under worktree vitest (`Cannot find package '@/lib/ops/surcharge-codes'` via extras-catalog alias) — inherited, not patched.
- Task 2 source-read tests landed in the same feat commit as the wiring (not a separate RED commit).

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- 11-08 can read intent JSON `vat_rate_bps` next to `amount_rappen`. Default path remains 8.1% on top.
- Do not apply SQL. Do not deploy. Do not wrangler. Stripe stays test.

## Self-Check: PASSED

- FOUND: `apps/web/lib/checkout/vat.ts` `CH_VAT_RATE_BPS = 81`
- FOUND: `okIntentResponse` JSON `amount_rappen` then `vat_rate_bps`
- FOUND: `b0f9695` test, `9129e91` feat Task 1, `6168517` feat Task 2
- UNCHANGED: `respond.ts`, `CheckoutClient`
- GREEN: `lib/checkout/vat.test.ts` 13/13; `lib/quote/intent.test.ts` 17/17; with `confirmation-receipt.test.ts` 41/41 across 3 files

---
*Phase: 11-launch-cutover*
*Completed: 2026-09-13*
