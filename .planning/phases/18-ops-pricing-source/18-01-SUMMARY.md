---
phase: 18-ops-pricing-source
plan: 01
subsystem: pricing-kernel
tags: [eligibility, rate-book, quote-engine, vitest, live-book]
requires:
  - phase: 11-launch-cutover
    provides: quote_rate_book RPC, public_chf, asQuote nocache
provides:
  - Wave 0 source-read tests for four-class catalogs, four tabs, D-15 27520/12300
  - mapRateBook drops unrated vehicle_classes leftovers
  - evaluateEligibility omits deleted, lists hide-from-public, refuses pax-over-max
  - loadAndPrice quote.classes cannot invent an unrated leftover slug
affects: [18-02 public UI catalogs, 18-04 D-15 money, 18-03 tabs]
tech-stack:
  added: []
  patterns: [Worker-side live-book class filter until owner SQL apply]
key-files:
  created:
    - apps/web/lib/pricing/public-live-book-board.test.ts
    - apps/web/lib/pricing/d15-recipe.test.ts
    - apps/web/lib/ops/ops-pricing-tabs.test.ts
  modified:
    - apps/web/lib/pricing/rateBook.ts
    - apps/web/lib/pricing/rateBook.test.ts
    - apps/web/lib/pricing/eligibility.ts
    - apps/web/lib/pricing/eligibility.test.ts
    - apps/web/lib/quote/engine.ts
    - apps/web/lib/quote/engine.test.ts
key-decisions:
  - "Filter unrated classes in mapRateBook (Worker) so quote_rate_book jsonb_agg leftovers never reach the board before 18-02 SQL."
  - "Wave 0 public-live-book-board and ops-pricing-tabs stay red until 18-02 / 18-03 as the plan allows. d15-recipe 27520/12300 is already green."
requirements-completed: [D-29, D-31, D-32, D-33]
duration: 25min
completed: 2026-09-14
---

# Phase 18: OPS Pricing source of truth — 18-01 Summary

**Kernel quote.classes is the live book: unrated leftovers are dropped, hide-from-public stays listed, pax-over-max is not offered.**

## Performance

- **Duration:** ~25 min
- **Started:** 2026-09-14T14:36:00Z
- **Completed:** 2026-09-14T14:42:00Z
- **Tasks:** 3/3
- **Files modified:** 9

## Accomplishments

- Wave 0 files exist: catalog source-read (red until 18-02), OpsPricing four-tab source-read (red until 18-03), D-15 27520/12300 (green).
- `mapRateBook` keeps only classes referenced by `distance_rates` or `fixed_routes`. No economy/business/first/van fallback.
- `evaluateEligibility` cases use a non-ladder `suv` slug; leftover `economy` with no rate is absent; hide listed/unavailable; pax 9 vs max 4 → `pax`.
- Public `preferDraft` stays `dashboardHost && env.PRICING_PREVIEW === "true"`. Unrated leftover slug is absent from `quote.classes`.

## Task Commits

None — production work is uncommitted (standing no-commit-unless-asked). Ask to commit if you want GSD atomic close-out.

1. **Task 1: Wave 0 source-read and D-15 fixture files** — files on disk
2. **Task 2: Live-book eligibility** — `mapRateBook` filter + eligibility tests
3. **Task 3: Public engine never preferDraft; quote.classes from eligibility** — engine test + comment

## Files Created/Modified

- `apps/web/lib/pricing/public-live-book-board.test.ts` — forbids four-tuple catalogs (red until 18-02)
- `apps/web/lib/pricing/d15-recipe.test.ts` — 27520 and 12300 rappen
- `apps/web/lib/ops/ops-pricing-tabs.test.ts` — four tabs, no History/Preview/region (red until 18-03)
- `apps/web/lib/pricing/rateBook.ts` — drop unrated classes
- `apps/web/lib/pricing/eligibility.ts` / `.test.ts` — D-29…D-33 live-book board
- `apps/web/lib/quote/engine.ts` / `.test.ts` — leftover slug omitted; preferDraft source-read kept

## Decisions & Deviations

- Followed the plan. Worker filter ships now; SQL restriction is 18-02 git-only.
- Did not edit DC product files. Did not `supabase db push`. Did not Publish.
- Did not commit (user git rule). GSD execute-plan normally commits per task.

## Verification

- `pnpm --filter web exec vitest run lib/pricing/eligibility.test.ts lib/quote/engine.test.ts lib/pricing/rateBook.test.ts lib/pricing/d15-recipe.test.ts` — 50 passed
- Wave 0 catalog/tab tests fail as planned until 18-02 / 18-03

## Next Phase Readiness

18-02 can kill `VEHICLE_CLASSES` / `CLASS_SLUGS` / `KNOWN_CLASS_SLUGS` / `IntentVehicleClass` and git `quote_rate_book` SQL. Kernel will not re-invent omitted classes.

## Self-Check: PASSED
