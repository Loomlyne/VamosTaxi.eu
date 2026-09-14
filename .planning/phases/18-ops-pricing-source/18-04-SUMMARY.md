---
phase: 18-ops-pricing-source
plan: 04
subsystem: pricing-kernel
tags: [d15, bands, region, completeness, vitest]
requires:
  - phase: 18-ops-pricing-source
    provides: four-tab OpsPricing, no post-Publish fork (18-03)
provides:
  - Distance fare is start + perKm(all metres) + class bands; fixtures 27520 and 12300
  - Public quote path emits no region_premium line
  - Band overlap is a Publish completeness gap; open last band without overlap is not
  - Staff PUT kind region is invalid; Distance tab has no region % copy
affects: [18-05 fixed routes, 18-07 owner Publish UAT]
tech-stack:
  added: []
  patterns: [overlap is a Publish 409, not a kernel higher-wins product rule]
key-files:
  created: []
  modified:
    - apps/web/lib/pricing/priceQuote.ts
    - apps/web/lib/pricing/d15-recipe.test.ts
    - apps/web/lib/pricing/bands.ts
    - apps/web/lib/pricing/bands.test.ts
    - apps/web/lib/pricing/lines.test.ts
    - apps/web/lib/ops/pricing.ts
    - apps/web/lib/ops/pricing.test.ts
    - apps/web/app/[locale]/(ops)/api/staff/rate-book/route.ts
    - app/ops/OpsPricing.dc.html
    - apps/web/public/app/ops/OpsPricing.dc.html
    - apps/web/lib/ops/ops-pricing-tabs.test.ts
    - apps/web/lib/ops/rate-book-draft.test.ts
key-decisions:
  - "buildRegionPremiumLine stays in lines.ts unused; public priceQuote never calls it (D-17)."
  - "Corrupt overlapping bands still pick the higher per-km in the kernel so a quote can form; Publish 409s band_overlap (D-18)."
requirements-completed: [D-15, D-16, D-17, D-18]
duration: 20min
completed: 2026-09-14
---

# Phase 18: OPS Pricing source of truth — 18-04 Summary

**Distance money is start + all km × per-km + bands. Region % is gone from the public stack and the Distance tab. Overlapping bands cannot Publish.**

## Performance

- **Duration:** ~20 min
- **Started:** 2026-09-14T15:05:00Z
- **Completed:** 2026-09-14T15:12:00Z
- **Tasks:** 3/3
- **Files modified:** 12

## Accomplishments

- `d15-recipe.test.ts` green: 10000 + perKm(1200, 14600) = 27520; 12.3 km × 10 CHF = 12300; 1 km uses the same recipe (no min_fare floor).
- `priceQuote.ts` no longer emits `region_premium`. Staff `DRAFT_KINDS` dropped `region`; PUT/DELETE kind region is `invalid`.
- `loadCompleteness` adds `band_overlap` when two `[from, to)` bands on the same class overlap (`to_km` null = +inf). Open last without overlap is not a gap. Publish already 409s any completeness gap.
- OpsPricing Distance tab: region T strings removed; **Fix this** for overlap jumps to Distance.

## Task Commits

None — production work is uncommitted (standing no-commit-unless-asked). Ask to commit if you want GSD atomic close-out.

1. **Task 1: D-15 fixtures + drop region on public path** — priceQuote / d15-recipe
2. **Task 2: Band overlap blocks Publish** — loadCompleteness + tests
3. **Task 3: Distance tab + reject kind region + dual-DC** — OpsPricing / rate-book

## Files Created/Modified

- `priceQuote.ts` — no `buildRegionPremiumLine`
- `pricing.ts` — `band_overlap` completeness query (`overlap_left` / `overlap_right`)
- `rate-book/route.ts` — kinds without region
- `OpsPricing.dc.html` — no `saveRegion` / region copy; `gapBandOverlap`
- Dual-DC public copy synced

## Decisions & Deviations

- `buildRegionPremiumLine` remains exported from `lines.ts` for leftover tests/helpers; public orchestration does not call it.
- GET rate-book still hydrates `regionPremiums` from leftover DB rows; staff cannot write them.
- Full-package `tsc --noEmit` still reports pre-existing settle/settings/seo errors plus `PayLinkVehicle` (four-class union vs live-book slug from 18-02). 18-04 vitest suites are green. PayLink widening is 18-06.
- Did not click Publish. Did not `db push`. Did not commit.

## Verification

```
pnpm --filter web exec vitest run \
  lib/pricing/d15-recipe.test.ts \
  lib/pricing/lines.test.ts \
  lib/pricing/bands.test.ts \
  lib/ops/pricing.test.ts \
  lib/ops/ops-pricing-tabs.test.ts \
  lib/ops/rate-book-draft.test.ts
```

58 passed.
