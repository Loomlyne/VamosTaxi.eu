---
phase: 04-quote-pricing-engine
plan: 02
subsystem: pricing-kernel
tags: [eligibility, predicates, types, quote-board, surcharge-rules]

requires:
  - phase: 04-quote-pricing-engine
    plan: 01
    provides: round.ts integer kernel + vitest/fast-check in apps/web
provides:
  - Frozen kernel types (RateBook, QuoteInput, ClassBoardEntry, SurchargePredicate, …)
  - Class eligibility board (effectiveMaxPax, evaluateEligibility)
  - Pure surcharge predicate evaluation (evaluatePredicate, isWithinLocalWindow)
affects:
  - 04-03 line construction / priceQuote
  - 04-07 / 04-09 / 04-12 consumers of ClassBoardEntry + Line shapes
  - 04-04 seed/predicate consistency gates

tech-stack:
  added: []
  patterns:
    - labelled no_eligible_class board never raises on capacity
    - surcharge rules are data (predicate jsonb), not TypeScript constants
    - wall-clock HH:MM string compare — no Date/Intl in lib/pricing decision modules

key-files:
  created:
    - apps/web/lib/pricing/types.ts
    - apps/web/lib/pricing/eligibility.ts
    - apps/web/lib/pricing/eligibility.test.ts
    - apps/web/lib/pricing/predicates.ts
    - apps/web/lib/pricing/predicates.test.ts
  modified: []

key-decisions:
  - "D-38 Van 8/8 via LEAST on seeded data — no hardcoded capacity literals in eligibility.ts"
  - "Reason precedence unavailable → no_rate → route_off → pax → bags (ordered chain in code)"
  - "QuoteInput.pax/bags are booking-level max (loader collapses max-over-legs); kernel reads top-level only"
  - "Engine night window reads surcharges.predicate; settings_versions.night_window_* is owner-authoring source (04-04 seed) — migration 008 comment superseded for the engine (D-09/D-39)"
  - "Zone lookups via caller-built Map; missing id → unresolved, never iata inference (D-10)"

patterns-established:
  - "Pattern: decision modules return labelled results + why/unresolved; never throw for capacity or predicate miss"
  - "Pattern: fixtures keep every fare field null (D-46); physical caps only"
  - "Pattern: fast-check properties on board labelling and 1440-minute window partition"

requirements-completed: [QUOTE-02, QUOTE-03]

duration: ~25min
completed: 2026-08-28
---

# Phase 04 Plan 02: Eligibility + surcharge predicates Summary

**Frozen kernel types; class board with LEAST pax / luggage bags / ordered ineligible reasons; five-discriminator pure predicates with midnight-wrap windows — 75 lib/pricing tests green**

## Performance

- **Duration:** ~25 min (resume from partial: types already committed)
- **Completed:** 2026-08-28T12:13:13Z
- **Tasks:** 3
- **Files created:** 5

## Accomplishments

- `types.ts` freezes VehicleClassSlug (no `first`), QuoteMode (no `hourly`), RateBook, QuoteInput, Line, ClassBoardEntry, SurchargePredicate, PolicySnapshot
- `evaluateEligibility` returns a full labelled board with `no_eligible_class` — never raises (D-02); caps from fields only (D-01/D-38)
- `evaluatePredicate` / `isWithinLocalWindow` answer surcharge applicability from versioned jsonb + wall-clock text only (D-09/D-10/D-39)

## Task Commits

Each task was committed atomically:

1. **Task 1: Freeze the kernel types** - `d8a7b37` (feat)
2. **Task 2: Class eligibility and the labelled board** - `bf4490c` (feat; tests+impl; RED tests were untracked pre-resume)
3. **Task 3: Surcharge predicates** - `a19e738` (feat; RED test file then GREEN impl in one commit after verified RED)

**Plan metadata:** (this commit)

## Files Created/Modified

- `apps/web/lib/pricing/types.ts` — frozen I/O contract; no imports; no `first`/`hourly`; `max_bags` only on ClassBoardEntry
- `apps/web/lib/pricing/eligibility.ts` — `effectiveMaxPax`, `evaluateEligibility`
- `apps/web/lib/pricing/eligibility.test.ts` — 17 tests incl. fast-check labelling property
- `apps/web/lib/pricing/predicates.ts` — `evaluatePredicate`, `isWithinLocalWindow`
- `apps/web/lib/pricing/predicates.test.ts` — 18 tests incl. 1440-minute wrap partition property

## Decisions Made

- Booking-level pax/bags already max-over-legs at the loader; kernel does not invent per-leg pax fields on QuoteLegInput
- Fixed-route-only + `live: false` → `route_off`; no rate and no fixed match → `no_rate`
- Unknown/empty predicate and unresolved zone ids → `applies: false` + `unresolved` string (T-04-03)
- `tz` is evidence in `why` only — never used to convert clocks

## Deviations from Plan

### Auto-fixed Issues

**1. Incomplete max-over-legs test stub in partial eligibility.test.ts**

- **Found during:** Task 2 GREEN
- **Issue:** Resume left a test body with no assertions plus a duplicate clamp test
- **Fix:** Merged into one return-mode fixture with `pax: 5` (loader-collapsed max) and real expects
- **Files modified:** `eligibility.test.ts`
- **Committed in:** `bf4490c`

### None otherwise

Plan tasks matched; no scope expansion. `iata` remains on `ZoneRow` / fixture builders as the display-only column (types + tests); decision modules never read it.

## Verification

```
pnpm typecheck                                          # exit 0
pnpm --filter web exec vitest run lib/pricing           # 3 files, 75 tests passed
```

Acceptance greps (Task 2/3): no Date/Intl in eligibility/predicates; no throw; no fare-column tokens in eligibility; no hardcoded `20:00`/`06:00` in predicates expressions; `unresolved` present; round.test.ts still green.

## Self-Check: PASSED

- [x] types.ts / eligibility.ts / predicates.ts exist with required exports
- [x] `first` and `hourly` absent from types.ts
- [x] no_eligible_class board for 9-pax vs Van 8/8
- [x] lib/pricing vitest exit 0
- [x] SUMMARY committed on `gsd/04-02-eligibility`

## Known Stubs / Follow-ups

- Line construction and totals: plan 04-03
- Predicate publish gate + zone_type/tags migration: plan 04-04
- HTTP 422 mode_not_offered for hourly: plan 04-08
