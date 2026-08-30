---
phase: 04-quote-pricing-engine
plan: 11
subsystem: api
tags: [quote, pipeline, hmac, nextjs, playwright, vitest]

requires:
  - phase: 04-quote-pricing-engine
    provides: "04-09 loadAndPrice + 04-10 geo/service-area + 04-08 schema/errors + 04-07 lock"
provides:
  - "POST /api/quote and POST /api/quote/reprice"
  - "QUOTE_STEPS frozen §2 array and runQuotePipeline / runRepricePipeline"
  - "ENGINE_VERSION build-time pin quote-engine@<sha>"
  - "errorResponse / quoteResponse as the only status-choosing module"
affects: [04-13-abuse, 04-14-ledger, phase-5-widget, phase-7-checkout]

tech-stack:
  added: []
  patterns:
    - "Ordered pipeline steps as frozen data, not handler reading order"
    - "Build-time ENGINE_VERSION via next.config env, read at request time"
    - "Coupon-only reprice keeps quote_id and expires_at; waypoint change remints"

key-files:
  created:
    - apps/web/lib/version.ts
    - apps/web/lib/version.test.ts
    - apps/web/lib/quote/pipeline.ts
    - apps/web/lib/quote/pipeline.test.ts
    - apps/web/lib/quote/respond.ts
    - apps/web/lib/quote/respond.test.ts
    - apps/web/lib/quote/preprocess.ts
    - apps/web/lib/quote/preprocess.test.ts
    - apps/web/lib/quote/deps.ts
    - apps/web/app/api/quote/route.ts
    - apps/web/app/api/quote/reprice/route.ts
    - apps/web/tests/integration/quote-api.spec.ts
  modified:
    - apps/web/next.config.ts
    - apps/web/lib/pricing/rateBook.ts
    - apps/web/lib/quote/engine.test.ts

key-decisions:
  - "QUOTE_STEPS is a frozen twelve-id array matching 04-API-CONTRACT.md §2; a reorder fails the step-order test."
  - "exp comes from injected quoteLockDeadline; Date.now/new Date are grep-forbidden in pipeline.ts."
  - "Coupon-only reprice keeps quote_id and expires_at; waypoint change mints a new lock (D-27)."
  - "next dev has no Hyperdrive binding; QUOTE_TEST_STUB_GEO stubs geo + loaders for the HTTP spec."

patterns-established:
  - "Pipeline steps as named ordered data walked by a runner that short-circuits on first refusal"
  - "Thin force-dynamic handlers: preprocess → pipeline → respond.ts"

requirements-completed: [QUOTE-01, QUOTE-02, QUOTE-03, QUOTE-04, QUOTE-06, QUOTE-07, QUOTE-10, QUOTE-11]

duration: 27min
completed: 2026-08-28
---

# Phase 04 Plan 11: Quote API Summary

**POST /api/quote and /api/quote/reprice with a frozen §2 QUOTE_STEPS pipeline, build-time ENGINE_VERSION, and coupon-only reprice that does not extend the 30-minute lock**

## Performance

- **Duration:** 27 min
- **Started:** 2026-08-28T13:48:38Z
- **Completed:** 2026-08-28T14:16:05Z
- **Tasks:** 3
- **Files modified:** 15

## Accomplishments

- `ENGINE_VERSION` is `quote-engine@<sha>` injected at build time from `next.config.ts` `env` (CF_PAGES_COMMIT_SHA → GITHUB_SHA → git short SHA; `dev-<iso>` fallback is visibly unversioned).
- Twelve §2 refusals are `QUOTE_STEPS`; the runner short-circuits at the first failure; steps 2/3/4 are no-op slots marked `TODO(04-13)`.
- Coupon-only reprice returns the same `quote_id` and `expires_at`; waypoint change remints; `extra_stops` without `waypoints` is 200 (D-18).
- Empty eligible set is HTTP 200 with a labelled board, never 422 (D-02). Launch-state 200 bodies have `pricing_live: false`, `rate_version: null`, every `total_rappen`/`amount_rappen` null (D-46).

## Task Commits

Each task was committed atomically:

1. **Task 1: ENGINE_VERSION and the ordered step list** - `0d3e222` (feat)
2. **Task 2: One place that chooses a status code** - `3029d4e` (feat)
3. **Task 3: The two route handlers, end to end** - `c332683` (feat)

**Plan metadata:** (this commit)

## Files Created/Modified

- `apps/web/lib/version.ts` - ENGINE_VERSION build-time pin
- `apps/web/lib/version.test.ts` - SHA vs `dev-` form proofs
- `apps/web/lib/quote/pipeline.ts` - QUOTE_STEPS, runQuotePipeline, runRepricePipeline
- `apps/web/lib/quote/pipeline.test.ts` - order, short-circuit, D-18, D-27, injected clock
- `apps/web/lib/quote/respond.ts` - errorResponse / quoteResponse, Cache-Control no-store
- `apps/web/lib/quote/respond.test.ts` - 26-code table, no-English scan, launch-state keys
- `apps/web/lib/quote/preprocess.ts` - named D-04 widget-token preprocess
- `apps/web/lib/quote/preprocess.test.ts` - one-way, hourly, hours unknown key
- `apps/web/lib/quote/deps.ts` - handler wiring; QUOTE_TEST_STUB_GEO harness stubs
- `apps/web/app/api/quote/route.ts` - POST /api/quote
- `apps/web/app/api/quote/reprice/route.ts` - POST /api/quote/reprice
- `apps/web/tests/integration/quote-api.spec.ts` - §11 HTTP proofs
- `apps/web/next.config.ts` - `env.QUOTE_ENGINE_VERSION`
- `apps/web/lib/pricing/rateBook.ts` - inherited typecheck: night_window_tz string
- `apps/web/lib/quote/engine.test.ts` - inherited typecheck: DistanceRateRow[] on nullRates

## Decisions Made

- Steps 2/3/4 stay injected no-ops so 04-13 can plug in without reordering.
- `exp` is never authored in `pipeline.ts`; tests freeze the injected deadline while advancing `nowMs`.
- Playwright against `next dev` cannot see Hyperdrive (`HYPERDRIVE_NOCACHE.connectionString` undefined). The spec sets `QUOTE_TEST_STUB_GEO=1` to stub Mapbox, service-area, settings, deadline, and a launch-state unpriced board. Production handlers still call the real loaders.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Inherited typecheck red on base 736ebe2**
- **Found during:** Task 1 (ENGINE_VERSION / pipeline)
- **Issue:** `pnpm typecheck` already failed on `rateBook.ts` night_window_tz `string | null` vs `string`, and `engine.test.ts` literal-null rates vs mixed-null override.
- **Fix:** Map missing tz to `""`; annotate `nullRates(): DistanceRateRow[]`.
- **Files modified:** `apps/web/lib/pricing/rateBook.ts`, `apps/web/lib/quote/engine.test.ts`
- **Verification:** `pnpm typecheck` exits 0
- **Committed in:** `0d3e222` (Task 1)

**2. [Rule 2 - Blocking] next dev has no Hyperdrive binding**
- **Found during:** Task 3 (integration spec)
- **Issue:** `loadSettingsVersion` threw `Cannot read properties of undefined (reading 'connectionString')`; well-formed POST returned 503.
- **Fix:** `QUOTE_TEST_STUB_GEO=1` stubs geo + quote loaders with the launch-state unpriced board. Real path unchanged when the env is unset.
- **Files modified:** `apps/web/lib/quote/deps.ts`
- **Verification:** playwright 12 passed
- **Committed in:** `c332683` (Task 3)

**3. [Rule 3 - Blocking] Playwright workers share `apps/web/.next`**
- **Found during:** Task 3
- **Issue:** Four viewport projects × parallel workers raced `next dev` and timed out beforeAll.
- **Fix:** Spec follows ssr-locale (run under `component-1440`); verification uses `--project=component-1440 --workers=1`.
- **Files modified:** `apps/web/tests/integration/quote-api.spec.ts`
- **Verification:** 12 passed, 0 skipped
- **Committed in:** `c332683` (Task 3)

---

**Total deviations:** 3 auto-fixed (2 missing/blocking typecheck+bindings, 1 harness)
**Impact on plan:** Required for typecheck and the HTTP spec. No CHF invented. No production stub unless `QUOTE_TEST_STUB_GEO=1`.

## Issues Encountered

- `next build` still prints a pre-existing next-intl `ENVIRONMENT_FALLBACK` (timeZone) during static generation; exit code 0 and `/api/quote` + `/api/quote/reprice` are in the route table as `ƒ`.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Ready for 04-13 to replace the no-op guards at the `TODO(04-13)` call sites.
- Ready for 04-14 live-rate proofs once the owner matrix exists.
- Widget can switch on `error` / `i18n_key` / `action` from `respond.ts`.

## Verification

```
pnpm typecheck                                          → 0
pnpm --filter web exec vitest run lib/quote lib/version.test.ts  → 115 passed
pnpm build                                              → 0; route table lists /api/quote and /api/quote/reprice
pnpm --filter web exec playwright test tests/integration/quote-api.spec.ts --project=component-1440 --workers=1  → 12 passed, 0 skipped
```

## Self-Check: PASSED

---
*Phase: 04-quote-pricing-engine*
*Completed: 2026-08-28*
