---
phase: 04-quote-pricing-engine
plan: 09
subsystem: pricing
tags: [quote, rate-book, hyperdrive, asQuote, pricing_live, vitest]

requires:
  - phase: 04-quote-pricing-engine (04-03)
    provides: priceQuote kernel, eligibility, assembleTotals
  - phase: 04-quote-pricing-engine (04-06)
    provides: quote_rate_book / quote_settings_version / quote_lock_deadline / evaluate_coupon RPCs
  - phase: 03-hyperdrive-data-access-wiring
    provides: asQuote on HYPERDRIVE_NOCACHE
provides:
  - Pure mapRateBook / mapSettingsSnapshot / derivePricingLive (numeric stays text, SQL order)
  - Four asQuote-wrapped RPC loaders on the cache-disabled binding
  - loadAndPrice composition: read, map, price, derive pricing_live
affects:
  - 04-10 journey refusals / evaluate_coupon call site
  - 04-11 POST /api/quote route handler
  - 04-13 abuse / checkout gate on pricing_live

tech-stack:
  added: []
  patterns:
    - "Every pricing read goes through asQuote on HYPERDRIVE_NOCACHE (D-34)"
    - "PRICING_PREVIEW === \"true\" once; derivePricingLive ignores the flag (D-33)"
    - "Injected loaders so the composition is unit-tested without Docker"

key-files:
  created:
    - apps/web/lib/pricing/rateBook.ts
    - apps/web/lib/pricing/rateBook.test.ts
    - apps/web/lib/db/quote.ts
    - apps/web/lib/db/quote.test.ts
    - apps/web/lib/quote/engine.ts
    - apps/web/lib/quote/engine.test.ts
  modified: []

key-decisions:
  - "mapRateBook keeps rate_version.status so derivePricingLive can see draft/retired/live; public quote output strips status to { id, slug }"
  - "Loaders are injected on loadAndPrice so unit tests never touch Hyperdrive"
  - "mintLockDeadline / evaluateCoupon are on the deps object but unused by loadAndPrice (04-10 / 04-11)"

patterns-established:
  - "Enumerate-don't-spread mapping from RPC jsonb onto kernel types (D-07)"
  - "RPC name contract test reads 04-06 migration files from disk"
  - "pricing_live is derived once via derivePricingLive, never from the preview flag"

requirements-completed: [QUOTE-03, QUOTE-10]

duration: 10min
completed: 2026-08-28
---

# Phase 4 Plan 09: Rate engine door Summary

**Pure mapper + asQuote RPC door + loadAndPrice connect the kernel to the frozen book on HYPERDRIVE_NOCACHE; launch state is the default, and PRICING_PREVIEW cannot make a draft look live.**

## Performance

- **Duration:** 10 min
- **Started:** 2026-08-28T12:51:02Z
- **Completed:** 2026-08-28T13:01:29Z
- **Tasks:** 3
- **Files modified:** 6 created

## Accomplishments

- `mapRateBook` / `mapSettingsSnapshot` preserve numeric strings and SQL array order; extra keys drop; launch-state null is not an error
- `derivePricingLive` is true only for `status === "live"` — draft, retired, and null are false (QUOTE-10 / D-33)
- Four thin `asQuote` wrappers on the cache-disabled binding, with a migration contract test
- `loadAndPrice` returns a value (never a Response): complete labelled board with null totals when no live version; `no_settings_version` and `partially_priced_class` as 500s

## Task Commits

Each task was committed atomically:

1. **Task 1: Map the RPC document onto the kernel's types** — `7d62038` (test) + `82a3ced` (feat)
2. **Task 2: Four RPC calls, one door, one binding** — `3881cfa` (feat)
3. **Task 3: loadAndPrice — read, map, price, derive** — `894bb91` (feat)

**Plan metadata:** (this commit)

## Files Created/Modified

- `apps/web/lib/pricing/rateBook.ts` — pure mapping; no client, no clock, no arithmetic
- `apps/web/lib/pricing/rateBook.test.ts` — launch state, string percent, order, predicates, derivePricingLive
- `apps/web/lib/db/quote.ts` — loadRateBook / loadSettingsVersion / mintLockDeadline / evaluateCoupon via asQuote
- `apps/web/lib/db/quote.test.ts` — migration name contract + source-shape greps
- `apps/web/lib/quote/engine.ts` — loadAndPrice composition
- `apps/web/lib/quote/engine.test.ts` — stubbed loaders: launch, draft, retired, preview table, 500s

## Decisions Made

- Rate-book mapping keeps `status` internally for QUOTE-10; the quote value's `rate_version` is `{ id, slug }` only
- `loadAndPrice` does not call `evaluateCoupon` or `mintLockDeadline` — those stay on `deps` for 04-10/04-11
- Namespace import of the mapper so `derivePricingLive` appears once in engine.ts (acceptance grep)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Ready for 04-10 (journey refusals / Mapbox metres) and 04-11 (HTTP handler). `loadAndPrice` is shaped to serve both. Live RPC behaviour remains 04-06's pgTAP, not this unit suite.

## Self-Check: PASSED

- Key files exist on disk
- `git log --grep=04-09` has production commits
- `pnpm --filter web exec vitest run lib` — 14 files, 237 tests, 0 skipped
- Greps: no Number/parseFloat/sort in rateBook.ts; no PRICING_PREVIEW in rateBook.ts; no publicSql/HYPERDRIVE\\b/@vamos/db in quote.ts; `PRICING_PREVIEW === "true"` once in engine.ts; `derivePricingLive` once in engine.ts

---
*Phase: 04-quote-pricing-engine*
*Completed: 2026-08-28*
