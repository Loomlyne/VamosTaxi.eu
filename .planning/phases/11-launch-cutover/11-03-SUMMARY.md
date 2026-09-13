---
phase: 11-launch-cutover
plan: 03
subsystem: api
tags: [public_chf, pricing_live, preferDraft, quote_rate_book, asQuote]

# Dependency graph
requires:
  - phase: 11-launch-cutover
    provides: Wave 0 public_chf AND derivePricingLive contract tests
  - phase: 11-launch-cutover
    provides: quote_rate_book JSON keys public_chf + vat_rate_bps
provides:
  - loadLaunchFlags asQuote read of public_chf + vat_rate_bps (fail-closed)
  - HTTP pricing_live = derivePricingLive(live row) AND settings.public_chf
  - preferDraft true only on named dashboard Host with PRICING_PREVIEW true
affects: [11-04, 11-06, 11-07, 11-11, 11-12]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - asQuote quote_rate_book JSON for launch flags; never settings_public / lib/db/public.ts
    - dashboardHost closed over in buildQuotePipelineDeps; pipeline.ts does not read PRICING_PREVIEW

key-files:
  created: []
  modified:
    - apps/web/lib/db/quote.ts
    - apps/web/lib/quote/engine.ts
    - apps/web/lib/quote/deps.ts
    - apps/web/app/api/quote/route.ts
    - apps/web/app/api/quote/reprice/route.ts
    - apps/web/lib/quote/engine.test.ts
    - apps/web/lib/pricing/public-chf.test.ts

key-decisions:
  - "Public pricing_live is derivePricingLive && flags.public_chf; id 5 live is not the flip"
  - "Missing RPC/columns/keys fail closed to public_chf false, vat_rate_bps 81"
  - "preferDraft requires named dashboard Host AND PRICING_PREVIEW===true; omitted dashboardHost is false"
  - "respond.ts unchanged; vat_rate_bps not added to QuoteResponseBody"

patterns-established:
  - "Launch flags ride quote_rate_book via loadLaunchFlags; HTTP pricing_live ANDs public_chf in engine.ts"
  - "Draft preview is host-gated in deps/engine, not pipeline.ts"

requirements-completed: [LAUNCH-06]

# Metrics
duration: 9min
completed: 2026-09-13
---

# Phase 11 Plan 03: Public pricing_live AND public_chf Summary

**Public quote JSON `pricing_live` is `derivePricingLive(live row) AND settings.public_chf`; draft preview is dashboard-host-gated so `PRICING_PREVIEW` cannot leak CHF on vamostaxi.site**

## Performance

- **Duration:** 9 min
- **Started:** 2026-09-12T23:36:02Z
- **Completed:** 2026-09-12T23:44:35Z
- **Tasks:** 2
- **Files modified:** 7

## Accomplishments

- `loadLaunchFlags` reads `public_chf` + `vat_rate_bps` from `quote_rate_book` JSON via `asQuote` (HYPERDRIVE_NOCACHE). Missing RPC/columns/keys or thrown SQL → `{ public_chf: false, vat_rate_bps: 81 }`
- Engine HTTP `pricing_live` is `derivePricingLive(book.rate_version) && flags.public_chf`. Live id 5 alone is not the flip
- `preferDraft` is true only when `PRICING_PREVIEW === "true"` AND Host is `dashboard.vamostaxi.site` / `dashboard.localhost` / ops-changes preview. Public host and omitted `dashboardHost` stay false
- `respond.ts` untouched (no pricing_live render branch; no `vat_rate_bps` on `QuoteResponseBody`)

## Task Commits

Each task was committed atomically:

1. **Task 1: GREEN public pricing_live AND public_chf** - `fc00c4a` (feat)
2. **Task 2: Host-gate preferDraft; public always live book** - `a1658e7` (feat)

**Plan metadata:** (this commit)

## Files Created/Modified

- `apps/web/lib/db/quote.ts` - `loadLaunchFlags` via asQuote `quote_rate_book`; fail-closed defaults
- `apps/web/lib/quote/engine.ts` - AND `public_chf` into HTTP `pricing_live`; host-gated `preferDraft`
- `apps/web/lib/quote/deps.ts` - `isNamedDashboardHost`; `buildQuotePipelineDeps(..., { dashboardHost })` closes over the flag
- `apps/web/app/api/quote/route.ts` - Host header → `dashboardHost`
- `apps/web/app/api/quote/reprice/route.ts` - Host header → `dashboardHost`
- `apps/web/lib/quote/engine.test.ts` - AND cases + preferDraft host-gate
- `apps/web/lib/pricing/public-chf.test.ts` - public host preferDraft source-read

## Decisions Made

- Flags come from the 11-02 `quote_rate_book` JSON keys, not a sibling RPC and not `SELECT public.settings`
- `vat_rate_bps` is returned from `loadLaunchFlags` for 11-07; not copied onto quote HTTP JSON in this plan
- Host matching copies middleware `isNamedDashboardHost` (not `isDashboardHost`, not `DEPLOY_ENV=staging`)
- `pipeline.ts` still does not read `PRICING_PREVIEW`; extras/route.ts still `preferDraft: false`

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Inject loadLaunchFlags on QuoteLoaders**

- **Found during:** Task 1
- **Issue:** Calling `loadLaunchFlags` as a hard import-only side path would still work, but engine tests inject every other loader. Without a stub, a future default-loader test would hit Hyperdrive.
- **Fix:** Added `loadLaunchFlags` to `QuoteLoaders` / `defaultLoaders`; tests stub `{ public_chf: false, vat_rate_bps: 81 }` unless overridden.
- **Files modified:** `apps/web/lib/quote/engine.ts`, `apps/web/lib/quote/engine.test.ts`
- **Verification:** vitest `lib/quote/engine.test.ts` live+false → `pricing_live` false; live+true → true; draft+true → false
- **Committed in:** `fc00c4a` (Task 1)

**2. [Rule 1 - Bug] Extend preferDraft tests for host gate**

- **Found during:** Task 2
- **Issue:** Existing engine test expected `preferDraft` true from `PRICING_PREVIEW==="true"` alone. That would fail after the host gate.
- **Fix:** Cases now require `dashboardHost: true` as well; public/omitted host stays false even when preview is `"true"`. Source-read added in `public-chf.test.ts`.
- **Files modified:** `apps/web/lib/quote/engine.test.ts`, `apps/web/lib/pricing/public-chf.test.ts`
- **Verification:** vitest 17 passed
- **Committed in:** `a1658e7` (Task 2)

---

**Total deviations:** 2 auto-fixed (1 missing critical, 1 test-contract)
**Impact on plan:** Required for Hyperdrive-free unit tests and the D-18 host gate. No respond.ts branch. No SQL apply. No wrangler.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required. Hosted apply of 11-02 SQL remains 11-11.

## Next Phase Readiness

- Ready for 11-04 Publish-as-flip (staff publish sets `public_chf`; this plan only reads)
- 11-06 BookingBoard nulls when `!pricing_live`; 11-07 reads `vat_rate_bps` from `loadLaunchFlags`
- Do not treat id 5 live as the public CHF flip until 11-12 Publish

## Self-Check: PASSED

- FOUND: `apps/web/lib/db/quote.ts` exports `loadLaunchFlags`
- FOUND: `apps/web/lib/quote/engine.ts` `derivePricingLive(...) && flags.public_chf`
- FOUND: `fc00c4a` feat(11-03) AND public_chf
- FOUND: `a1658e7` feat(11-03) host-gate preferDraft
- PASS: vitest `lib/pricing/public-chf.test.ts` `lib/quote/engine.test.ts` — 2 files, 17 tests
- PASS: `respond.ts` still has the no-branch comment; no `if (pricing_live)` render
- PASS: `pipeline.ts` has no `env.PRICING_PREVIEW` / `preferDraft`
- PASS: extras/route.ts still `preferDraft: false`
- PASS: no wrangler.jsonc, no SQL apply, no BookingBoard, no publish routes

---
*Phase: 11-launch-cutover*
*Completed: 2026-09-13*
