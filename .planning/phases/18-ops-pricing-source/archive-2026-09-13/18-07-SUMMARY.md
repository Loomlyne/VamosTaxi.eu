---
phase: 18-ops-pricing-source
plan: 07
subsystem: pricing
tags: [D-16, D-35, D-36, D-37, D-39, extras-catalog, extra-stop, service-area]

requires:
  - phase: 18-ops-pricing-source
    provides: D-11 live distance recipe (start + all-km per-km + class band extras)
  - phase: 18-ops-pricing-source
    provides: Overlay Save writes draft kinds; preview/test unpaid/discard/clone staff APIs
  - phase: 18-ops-pricing-source
    provides: Five-tab OpsPricing fare book (Fixed routes · Distance rules · Surcharges & extras · Coupons · History)
provides:
  - Checkout extras catalog from published extra-chip surcharge rows (preferDraft false)
  - Extra stop is Mapbox places capped at published max_extra_stops; fare is D-11 not amount × qty
  - Service area both-pins-inside on the published polygon; coupon-before-VAT floor at 0
affects: [18-08, 18-09, 18-10]

tech-stack:
  added: []
  patterns:
    - Extra-chip membership is live surcharge rows, not a closed PASSENGER_EXTRA_CODES union
    - Automatic night/weekend/holiday/waiting codes never become checkout chips
    - extra_stop contributes waypoints + hasExtraStops; buildExtraLines skips amount × stops

key-files:
  created: []
  modified:
    - apps/web/lib/checkout/extras-catalog.ts
    - apps/web/lib/checkout/extras-catalog.test.ts
    - apps/web/lib/ops/surcharge-codes.ts
    - apps/web/lib/ops/surcharge-codes.test.ts
    - apps/web/app/api/checkout/extras/route.ts
    - apps/web/lib/pricing/lines.ts
    - apps/web/lib/pricing/lines.test.ts
    - apps/web/lib/geo/serviceArea.ts
    - apps/web/lib/geo/serviceArea.test.ts
    - apps/web/lib/pricing/policy.ts
    - apps/web/lib/pricing/policy.test.ts

key-decisions:
  - "Public GET /api/checkout/extras stays preferDraft false; vat_rate_bps from launch flags"
  - "isPassengerExtra is a deny-list of automatic codes so a new published chip appears"
  - "extra_stop amount is omitted from the catalog and extra lines; max_extra_stops comes from the live rate_version field"
  - "Coupon math unchanged: of=pre_coupon_total, clamped so payable never goes negative"

patterns-established:
  - "Deleted published extra disappears from catalogFromSurcharges, not as a CHF 0 chip"
  - "Unknown extra-chip slugs reuse ExtraUi/Icon names (default user); no invented Lucide SVG"

requirements-completed: [D-16, D-35, D-36, D-37, D-39]

duration: 10min
completed: 2026-09-14
---

# Phase 18 Plan 07: Checkout extras from published book Summary

**Checkout extras chips come from the published surcharge book (automatic night/weekend/holiday/waiting stay off); extra stop reprices via the D-11 distance recipe capped at published `max_extra_stops`; both pins must sit inside the published service-area polygon and coupon still floors payable at 0 before VAT.**

## Performance

- **Duration:** 10 min
- **Started:** 2026-09-13T23:31:47Z
- **Completed:** 2026-09-13T23:42:14Z
- **Tasks:** 3 completed
- **Files modified:** 11

## Accomplishments

- `catalogFromSurcharges` follows live extra-chip rows. Inactive and automatic codes are omitted. Delete+Publish means the code is gone, not amount 0. Pet, ski, and unknown published slugs appear; unknown chips reuse the existing Icon set (`user`).
- GET `/api/checkout/extras` still loads `preferDraft: false` and `vat_rate_bps` from flags, and now returns `max_extra_stops` from the published `rate_version` field.
- Extra stop is not amount × quantity. Catalog amount is null; `buildExtraLines` skips `extra_stops`. Places cap via `publishedMaxExtraStops` / `capExtraStops`. Child seat / oversized still multiply amount × qty; ski/pet stay paid extra chips.
- Service area still fails closed on a null polygon and refuses `out_of_service_area` when either pin is outside. `buildCouponLine` still coupons the pre-VAT total and floors payable at 0. Checkout layout was not redesigned.

## Task Commits

Each task was committed atomically:

1. **Task 1: Extras catalog = published surcharge chips** - `f669e2b` (feat)
2. **Task 2: Extra stop re-runs D-11 distance recipe** - `7e79561` (feat)
3. **Task 3: Service area both pins; coupon before VAT floor** - `e17e670` (feat)

**Follow-up:** `ccf703e` (fix) — recap lock add skips extra_stop if a book amount leaked.

**Plan metadata:** pending this commit (docs: complete plan)

## Files Created/Modified

- `apps/web/lib/checkout/extras-catalog.ts` — published-chip catalog; extra_stop amount null; max_extra_stops helpers
- `apps/web/lib/checkout/extras-catalog.test.ts` — delete/omit/automatic/pet-ski/unknown/preferDraft/max_extra_stops
- `apps/web/lib/ops/surcharge-codes.ts` — open extra-chip membership; automatic deny-list
- `apps/web/lib/ops/surcharge-codes.test.ts` — waiting_airport/holiday out; unknown chip in
- `apps/web/app/api/checkout/extras/route.ts` — preferDraft false kept; `max_extra_stops` from live book
- `apps/web/lib/pricing/lines.ts` — skip extra_stop amount × qty; D-11 extra-stop path unchanged
- `apps/web/lib/pricing/lines.test.ts` — extra_stop emits no quantity fare; child/oversized still × qty
- `apps/web/lib/geo/serviceArea.ts` — polygon is the published snapshot; both pins inside
- `apps/web/lib/geo/serviceArea.test.ts` — one-in/one-out and both-out still `out_of_service_area`
- `apps/web/lib/pricing/policy.ts` — D-16 comment only; coupon math unchanged
- `apps/web/lib/pricing/policy.test.ts` — named coupon-before-VAT non-negative payable test

## Decisions Made

- Extra-chip codes are data from the book. `isPassengerExtra` denies automatic night/weekend/holiday/waiting/airport_pickup, and is not a closed union that drops unknown slugs.
- Extra stop money is the D-11 fare on the new path (18-03 already skips fixed when extra stops exist). Cap is `rate_versions.max_extra_stops` on the live book; missing/invalid → 0.
- Did not redesign `/checkout/details` layout. Did not set `preferDraft` true. Did not invent CHF.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Vitest cannot resolve `@/` in extras-catalog**
- **Found during:** Task 1 (extras catalog)
- **Issue:** `catalogFromSurcharges` imported `@/lib/ops/surcharge-codes`; node vitest failed to resolve the alias
- **Fix:** Relative import `../ops/surcharge-codes`
- **Files modified:** `apps/web/lib/checkout/extras-catalog.ts`
- **Verification:** extras-catalog + surcharge-codes tests green
- **Committed in:** `f669e2b` (Task 1)

**2. [Rule 2 - Missing Critical] extra_stop quantity fare lives in lines.ts**
- **Found during:** Task 2 (D-37)
- **Issue:** Plan files listed extras-catalog + lines.test.ts; `buildExtraLines` still emitted amount × extra_stops
- **Fix:** Skip `quantity_source === "extra_stops"` in `buildExtraLines`; extras route returns published `max_extra_stops`
- **Files modified:** `apps/web/lib/pricing/lines.ts`, `apps/web/app/api/checkout/extras/route.ts`
- **Verification:** lines.test.ts + extras-catalog.test.ts green
- **Committed in:** `7e79561` (Task 2)

**3. [Rule 2 - Missing Critical] Recap lock add could still sum extra_stop**
- **Found during:** after Task 3 commit (unstaged leftover)
- **Issue:** `extraRappenOutsideLock` would add extra_stop if a book amount leaked
- **Fix:** Skip extra_stop in the lock add; header comment on lines.ts
- **Files modified:** `apps/web/lib/checkout/extras-catalog.ts`, `apps/web/lib/pricing/lines.ts`
- **Verification:** catalog extra_stop amount is null; skip is belt-and-suspenders
- **Committed in:** `ccf703e` (fix)

---

**Total deviations:** 3 auto-fixed (1 blocking, 2 missing critical)
**Impact on plan:** Required for D-35 tests to run under vitest and for D-37 to actually stop amount × quantity. No checkout layout redesign. No scope creep into Publish/CHF.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Ready for 18-08 (lock hours, expire unpaid, skip-send mails). Public extras stay on the live book. `public_chf` still false. Stripe still test. Do not invent CHF. Do not apply migrations / `db push` / restore / set `public_chf` / deploy / click Publish.

## Self-Check: PASSED

- key-files.modified exist on disk
- `git log --grep=18-07` returns 4 commits (`f669e2b`, `7e79561`, `e17e670`, `ccf703e`)
- Task 1–3 acceptance_criteria all PASS
- Plan verification: `pnpm --filter web exec vitest run lib/checkout/extras-catalog.test.ts lib/pricing/lines.test.ts lib/geo/serviceArea.test.ts lib/pricing/policy.test.ts` → 4 files, 72 passed
- extras/route.ts still contains `preferDraft: false`
- catalog omits automatic night/weekend/holiday/waiting; omits a code when the row is absent
- extra_stop is not a fixed rappen × quantity fare; child_seat / oversized / pet still × quantity; max_extra_stops from published book field
- one pin inside / one outside still `out_of_service_area`; policy.test.ts asserts coupon before VAT and non-negative payable
- No checkout/details layout redesign; no `preferDraft: true`; no migration apply / db push / restore / `public_chf` / invent CHF / deploy / Publish click

---
*Phase: 18-ops-pricing-source*
*Completed: 2026-09-14*
