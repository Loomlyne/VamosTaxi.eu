---
phase: 18-ops-pricing-source
plan: 03
subsystem: pricing
tags: [D-11, D-12, D-13, D-14, D-15, D-16, D-17, D-19, vitest, integer-kernel]

requires:
  - phase: 18-ops-pricing-source
    provides: Wave 0 D-11 kernel fixtures (start + all-km per-km + per-class bands)
  - phase: 18-ops-pricing-source
    provides: Hosted Zurich per-class bands and D-08 completeness without min_fare
provides:
  - D-11 live distance recipe (start + all-km per-km + class band extras)
  - Per-class From-inclusive / To-exclusive band extras without DISTANCE_FLOOR_KM
  - Forward-only fixed_routes match; extra stops use the distance recipe
affects: [18-04, 18-05, 18-06, 18-07]

tech-stack:
  added: []
  patterns:
    - Distance fare is base_fare_rappen + perKm(all metres) + classBandExtrasRappen
    - Band overlap walks unique km breakpoints and takes max per_km_rappen
    - round.ts remains the only money rounder (half-up rappen, not Swiss 5-rappen)

key-files:
  created: []
  modified:
    - apps/web/lib/pricing/types.ts
    - apps/web/lib/pricing/rateBook.ts
    - apps/web/lib/pricing/bands.ts
    - apps/web/lib/pricing/bands.test.ts
    - apps/web/lib/pricing/lines.ts
    - apps/web/lib/pricing/lines.test.ts
    - apps/web/lib/pricing/eligibility.ts
    - apps/web/lib/pricing/eligibility.test.ts
    - apps/web/lib/pricing/priceQuote.ts

key-decisions:
  - "classBandExtrasRappen replaces blendedFareRappen; DISTANCE_FLOOR_KM is gone from the live path"
  - "Fixed A→B does not match B→A; extra stops (waypoints or extras.extra_stops) skip fixed_routes"
  - "hide_from_public maps to ineligible_reason unavailable so the class stays listed with amount null"
  - "Keep min_fare_rappen on DistanceRateRow for lingering mappers; kernel never uses it as a floor"
  - "round.ts unmodified; no second money formatter"

patterns-established:
  - "D-11 recipe is the only distance fare: start + all metres × per-km + per-class extras"
  - "priceQuote remains the only recipe; extra_stops is a place/qty signal, never a client CHF"

requirements-completed: [D-11, D-12, D-13, D-14, D-15, D-16, D-17, D-19]

duration: 5min
completed: 2026-09-14
---

# Phase 18 Plan 03: D-11 kernel Summary

**Live quote distance fare is start + (all metres × per-km) + per-class band extras; the 20 km / min_fare floor and reverse A←B fixed match are gone. `round.ts` is unchanged.**

## Performance

- **Duration:** 5 min
- **Started:** 2026-09-13T22:12:44Z
- **Completed:** 2026-09-13T22:17:52Z
- **Tasks:** 3 completed
- **Files modified:** 9

## Accomplishments

- Opened `VehicleClassSlug` (D-19) and stamped `vehicle_class_id` on bands with From inclusive / To exclusive (D-14)
- Replaced `DISTANCE_FLOOR_KM` / `blendedFareRappen` with `classBandExtrasRappen` on top of all km
- `buildFareLine` is D-11/D-12/D-13; fixed routes are origin→dest only; extra stops use the distance recipe (D-17)
- Region % still applies to that fare-line amount (D-15); `buildCouponLine` stays coupon-before-VAT (D-16)
- `hide_from_public` lists the class, not selectable, amount null; over max pax still `pax` (D-19)
- Wave 0 lines/bands fixtures from 18-01 are green. `public-chf.test.ts` still ANDs `public_chf`. `formatAmount(null)` remains `CHF 000`

## Task Commits

Each task was committed atomically:

1. **Task 1: Open types and per-class band shape** - `0e9538d` (feat)
2. **Task 2: Rewrite bands.ts — extras on top of all km** - `ff84c75` (feat)
3. **Task 3: Rewrite buildFareLine to D-11 and drop reverse match** - `29b2c3a` (feat)

**Plan metadata:** pending this commit (docs: complete plan)

## Files Created/Modified

- `apps/web/lib/pricing/types.ts` — open slug; band `vehicle_class_id`; `hide_from_public?` on rates
- `apps/web/lib/pricing/rateBook.ts` — maps `vehicle_class_id` and `hide_from_public`
- `apps/web/lib/pricing/bands.ts` — `classBandExtrasRappen`; no floor identifiers
- `apps/web/lib/pricing/bands.test.ts` — calls the new export; per-class filter is in the kernel
- `apps/web/lib/pricing/lines.ts` — D-11 distance recipe; forward-only fixed; extra-stop skip
- `apps/web/lib/pricing/lines.test.ts` — D-17 reverse/extra-stop cases; D-11 fixtures green
- `apps/web/lib/pricing/eligibility.ts` — `hide_from_public` → not selectable, still listed
- `apps/web/lib/pricing/eligibility.test.ts` — D-19 hide case
- `apps/web/lib/pricing/priceQuote.ts` — passes `hasExtraStops` from `extras.extra_stops`
- `apps/web/lib/pricing/round.ts` — **unmodified**

## Decisions Made

- Export name is `classBandExtrasRappen` (band extras only). Fare line adds start + `perKm` + that extra.
- Covered metres are `[0, distanceM)` against bands `[from_m, to_m)` so exactly-at-From is zero extra metres.
- `hide_from_public` reuses `unavailable` rather than a sixth `ineligible_reason` (public board still five reasons; CHF 000 path unchanged).
- Did not execute `04.3-01-PLAN.md`. Did not apply migrations, `db push`, restore, or set `public_chf`. Did not invent CHF.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Mapper must emit required `vehicle_class_id`**
- **Found during:** Task 1 (Open types and per-class band shape)
- **Issue:** Making `DistanceBandRow.vehicle_class_id` required would fail `mapDistanceBand` compile
- **Fix:** Map `vehicle_class_id` and optional `hide_from_public` in `rateBook.ts`
- **Files modified:** `apps/web/lib/pricing/rateBook.ts`
- **Verification:** `pnpm --filter web exec vitest run lib/pricing/rateBook.test.ts lib/pricing/public-chf.test.ts` → 18 passed
- **Committed in:** `0e9538d` (Task 1)

**2. [Rule 2 - Missing Critical] Extra-stop skip must reach `priceQuote`**
- **Found during:** Task 3 (D-11 fare line)
- **Issue:** Plan files listed `lines.ts` only; `extras.extra_stops` lives on quote input, not the leg
- **Fix:** `priceQuote` passes `hasExtraStops` when `extras.extra_stops > 0`; waypoints on the leg also skip fixed
- **Files modified:** `apps/web/lib/pricing/priceQuote.ts`
- **Verification:** `pnpm --filter web exec vitest run lib/pricing` → 155 passed
- **Committed in:** `29b2c3a` (Task 3)

---

**Total deviations:** 2 auto-fixed (1 blocking, 1 missing critical)
**Impact on plan:** Both required for D-14 mapping and D-17 extra-stop skip. No scope creep.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Ready for 18-04 (Publish-only flip / completeness / clone draft). Kernel is D-11. `public_chf` still false. Stripe still test. Do not invent CHF. 18-07 extra-stop Mapbox places will reuse the skip-fixed path already in `buildFareLine`.

## Self-Check: PASSED

- key-files.modified exist on disk
- `git log --grep=18-03` returns 3 task commits (`0e9538d`, `ff84c75`, `29b2c3a`)
- Task 1–3 acceptance_criteria all PASS
- Plan verification: `pnpm --filter web exec vitest run lib/pricing` → 10 files, 155 passed
- `public-chf.test.ts` still ANDs `public_chf`; `formatAmount(null) === "CHF 000"`
- `round.ts` unmodified vs `a177a19`
- No 20 km floor identifier in `bands.ts` / `lines.ts`
- `04.3-01-PLAN.md` not executed; no migration apply / db push / restore / `public_chf` flip

---
*Phase: 18-ops-pricing-source*
*Completed: 2026-09-14*
