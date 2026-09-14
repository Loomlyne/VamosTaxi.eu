---
phase: 18-ops-pricing-source
plan: 05
subsystem: pricing-kernel
tags: [fixed-routes, canton, extra-stop, mapbox, vitest]
requires:
  - phase: 18-ops-pricing-source
    provides: D-15 distance recipe, no region %, overlap 409 (18-04)
provides:
  - Place→place then canton→canton fixed match; no reverse A←B
  - Extra stop max 1; extra stop skips fixed and re-runs distance recipe
  - Public Mapbox unfenced (no country box refuse; no CH-only suggest)
  - Checkout extra stop is one Mapbox place then re-quote
affects: [18-06 any class + surcharges list, 18-07 owner UAT]
tech-stack:
  added: []
  patterns: [canton from Mapbox region_code; airport IATA identity]
key-files:
  created: []
  modified:
    - apps/web/lib/pricing/lines.ts
    - apps/web/lib/pricing/lines.test.ts
    - apps/web/lib/pricing/types.ts
    - apps/web/lib/pricing/rateBook.ts
    - apps/web/lib/pricing/priceQuote.ts
    - apps/web/lib/quote/schema.ts
    - apps/web/lib/quote/schema.test.ts
    - apps/web/lib/quote/pipeline.ts
    - apps/web/lib/quote/lock.ts
    - apps/web/lib/geo/mapbox.ts
    - apps/web/lib/checkout/extras-catalog.ts
    - apps/web/lib/checkout/intent-schema.ts
    - apps/web/app/[locale]/checkout/CheckoutClient.tsx
    - app/ops/OpsPricing.dc.html
    - apps/web/public/app/ops/OpsPricing.dc.html
key-decisions:
  - "Canton match uses Mapbox region_code (ZH) persisted on the pin; zone tags canton:ZH on staff rows."
  - "country_box step stays in QUOTE_STEPS order but always passes (D-26). Service-area polygon still gates."
  - "Public extra-stop cap is hardcoded 1; live-book max_extra_stops is ignored."
requirements-completed: [D-19, D-20, D-21, D-26]
duration: 45min
completed: 2026-09-14
---

# Phase 18: OPS Pricing source of truth — 18-05 Summary

**A matching place row wins over canton. Extra stop is one Mapbox place and switches to the distance recipe. Public Mapbox is not fenced to Switzerland.**

## Performance

- **Duration:** ~45 min
- **Started:** 2026-09-14T15:12:00Z
- **Completed:** 2026-09-14T15:25:00Z
- **Tasks:** 2/2
- **Files modified:** 15

## Accomplishments

- `buildFareLine` match order: live place→place (airport terminal ≡ pin via IATA) then canton→canton. A→B does not price B→A. Extra stops skip the fixed table.
- Quote `extra_stops` only 0 or 1; 2 is `extras_max_stops`. Waypoints max 1.
- Checkout extra stop opens one PlaceCombo; retrieve pins lng/lat and re-quotes.
- OpsPricing empty/hint copy names place to place and canton to canton. Dual-DC synced.
- Suggest stays worldwide (`country=` still off). Quote `country_box` no longer 422s London coords.

## Task Commits

None — production work is uncommitted (standing no-commit-unless-asked).

1. **Task 1: Place then canton + extra stop max 1** — kernel, schema, extras-catalog
2. **Task 2: Fixed routes copy + checkout Mapbox stop + unfenced Mapbox** — OpsPricing / CheckoutClient / pipeline

## Files Created/Modified

- `lines.ts` — place then canton; `cantonOfZone`
- `schema.ts` / `intent-schema.ts` / `lock.ts` — extra_stops 0|1
- `extras-catalog.ts` — `PUBLIC_MAX_EXTRA_STOPS = 1`
- `CheckoutClient.tsx` — extra-stop PlaceCombo
- `mapbox.ts` — retrieve `canton` from region_code
- `pipeline.ts` — canton on the pin; country_box always ok
- Dual-DC OpsPricing copy

## Decisions & Deviations

- Staff PUT still stores origin/dest zone ids. Canton rows match when those zones carry `canton:ZH` tags (or slug `canton-zh`) or `kind: "canton"` on the mapped row. No new SQL this plan.
- `place_out_of_box` remains in the error catalog; schema/pipeline no longer emit it for pickup/dropoff.
- Did not click Publish. Did not `db push`. Did not commit.

## Verification

```
pnpm --filter web exec vitest run \
  lib/pricing/lines.test.ts \
  lib/quote/schema.test.ts \
  lib/checkout/extras-catalog.test.ts \
  lib/ops/ops-pricing-tabs.test.ts \
  lib/ops/ops-pricing-vat-field.test.ts \
  lib/quote/pipeline.test.ts \
  lib/geo/mapbox.test.ts \
  lib/pricing/d15-recipe.test.ts
```

140 passed.
