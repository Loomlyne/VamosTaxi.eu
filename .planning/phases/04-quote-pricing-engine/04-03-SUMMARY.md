---
phase: 04-quote-pricing-engine
plan: 03
subsystem: pricing
tags: [quote, pipeline, lines, policy, determinism, vitest, fast-check]

requires:
  - phase: 04-quote-pricing-engine (04-01/04-02)
    provides: round kernel, types, eligibility, predicates
provides:
  - Per-leg fare/surcharge/extra line builders (lines.ts)
  - PolicySnapshot + return-trip/coupon booking-level lines (policy.ts)
  - priceQuote orchestrator + assembleTotals identity (priceQuote.ts)
  - Determinism + shuffle-invariance property tests
affects:
  - 04-08 quote schema / zod boundary
  - 04-09 rate-book loader
  - 04-10 journey refusals / evaluate_coupon
  - 04-11 route handler + engine_version injection
  - 04-05 snapshot CHECK extensions

tech-stack:
  added: []
  patterns:
    - "D-06 ordered pipeline: fare → surcharge(of fare) → extras → return(of Σ fare) → coupon(of pre-coupon total)"
    - "seq pure of (leg_seq, kind rank, code); numberLines remaps of_line_seq"
    - "assembleTotals derives totals; all-or-nothing + partially_priced flag"
    - "No Date/env/I/O in kernel; computed_at injected"

key-files:
  created:
    - apps/web/lib/pricing/lines.ts
    - apps/web/lib/pricing/lines.test.ts
    - apps/web/lib/pricing/policy.ts
    - apps/web/lib/pricing/policy.test.ts
    - apps/web/lib/pricing/priceQuote.ts
    - apps/web/lib/pricing/priceQuote.test.ts
  modified:
    - apps/web/lib/pricing/eligibility.ts
    - apps/web/lib/pricing/eligibility.test.ts

key-decisions:
  - "Percent surcharges pin of_line_seq to the leg fare line (D-06 commutativity)"
  - "Class board order is sort_order then slug so shuffle of classes is byte-identical (T5)"
  - "Included lines excluded from all-or-nothing null count (waiting is free, not unpriced)"
  - "ENGINE_VERSION_PLACEHOLDER = quote-engine@dev until 04-11 injects git-sha"

patterns-established:
  - "numberLines after each assembly stage so of_line_seq survives renumbering"
  - "Booking-level leg_seq:null lines always carry allocation:pro_rata"
  - "sumPreCouponTotal = signed sum (discounts already present subtract)"

requirements-completed: [QUOTE-03, QUOTE-05, QUOTE-11]

duration: ~25min
completed: 2026-08-28
---

# Phase 4 Plan 03: Quote pricing pipeline Summary

**Pure pipeline turns a frozen rate book + pinned journey into §13-shaped `lines[]` and derives all-or-nothing totals — byte-identical across `computed_at` decades and rate-book row shuffle; every amount still null in launch state.**

## Performance

- **Duration:** ~25 min
- **Started:** 2026-08-28T12:15:00Z
- **Completed:** 2026-08-28T12:30:00Z
- **Tasks:** 3
- **Files modified:** 8 (6 created, 2 modified)

## Accomplishments

- `buildFareLine` / `buildLegSurchargeLines` / `buildExtraLines` with D-08 bidirectional fixed route, D-06 percent-of-fare, D-45 both-legs extras
- Eight-key `PolicySnapshot`, return-trip + coupon lines with `allocation: "pro_rata"`
- `priceQuote` composes ELIGIBLE→FARE→SURCHARGE→EXTRAS→RETURN→COUPON→ASSEMBLE; `assembleTotals` asserts signed-sum identity and `partially_priced`
- 119 vitest tests green across `lib/pricing` (0 skipped); typecheck green; no CHF / Date / parseFloat / runtime imports in kernel

## Task Commits

1. **Task 1: Per-leg lines** — `68a7f3a` (feat)
2. **Task 2: Policy + booking-level discounts** — `367492e` (feat)
3. **Task 3: priceQuote orchestrator** — `a534029` (feat)

**Plan metadata:** (this commit)

## Files Created/Modified

- `apps/web/lib/pricing/lines.ts` — fare, leg surcharges, extras; `seqFor` / `numberLines`
- `apps/web/lib/pricing/lines.test.ts` — 18 tests incl. shuffle property
- `apps/web/lib/pricing/policy.ts` — `currentSettingsVersion`, `buildPolicySnapshot`, return/coupon lines
- `apps/web/lib/pricing/policy.test.ts` — 16 tests incl. non-negative coupon remainder property
- `apps/web/lib/pricing/priceQuote.ts` — orchestrator + `assembleTotals` + `ENGINE_VERSION_PLACEHOLDER`
- `apps/web/lib/pricing/priceQuote.test.ts` — determinism + shuffle JSON.stringify proofs
- `apps/web/lib/pricing/eligibility.ts` — board order by `sort_order` then slug (T5)
- `apps/web/lib/pricing/eligibility.test.ts` — D-46 display_currency fixture cleanup

## Decisions Made

- Sort class board by `sort_order`/`slug` inside `evaluateEligibility` so rate-book class shuffle cannot change board order (required for whole-document JSON identity).
- `pricing_live = rateBook.rate_version !== null` (loader only supplies a version when live; null → false).
- Coupon facts passed as optional `PriceQuoteOptions.coupon` (evaluate_coupon remains 04-10).

## Deviations from Plan

**1. [Rule 1 - Bug] Class board order depended on input array order**
- **Found during:** Task 3 shuffle property
- **Issue:** Shuffling `classes[]` reordered the board and broke whole-document `JSON.stringify` equality
- **Fix:** Sort by `sort_order` then `slug` in `evaluateEligibility`
- **Files modified:** `eligibility.ts`
- **Verification:** shuffle property passes 20 runs
- **Committed in:** `a534029`

**Total deviations:** 1 auto-fixed (determinism). **Impact:** none on money; strengthens T5.

## Verification

```
pnpm typecheck                                          # exit 0
pnpm --filter web exec vitest run lib/pricing           # 119 passed, 0 skipped
grep -rE 'new Date|Date\.now|Math\.round|parseFloat|process\.env' apps/web/lib/pricing/  # empty
grep -rci 'CHF' apps/web/lib/pricing/                   # 0 every file
```

## Self-Check: PASSED

- key-files.created exist on disk
- `git log --grep=04-03` returns task commits
- All task acceptance_criteria re-run green
- Plan-level verification commands green

## Next

Ready for downstream 04-08 / 04-09 / 04-10 consumers of `priceQuote`. Orchestrator owns STATE/ROADMAP merge.
