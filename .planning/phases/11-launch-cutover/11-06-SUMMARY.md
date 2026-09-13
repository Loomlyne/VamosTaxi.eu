---
phase: 11-launch-cutover
plan: 06
subsystem: ui
tags: [pricing_live, BookingBoard, CHF-000, D-19, formatChfRappen]

# Dependency graph
requires:
  - phase: 11-launch-cutover
    provides: HTTP pricing_live = derivePricingLive AND settings.public_chf
provides:
  - BookingBoard nulls class-card and PriceSummary rappen when !quote.pricing_live
  - booking-board-null.test.ts source-read of BookingBoard.tsx
affects: [11-07, 11-11, 11-12]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - publicRappen(pricing_live, rappen) feeds formatChfRappen / chfRappenToDisplay; no second money formatter

key-files:
  created:
    - apps/web/lib/pricing/booking-board-null.test.ts
  modified:
    - apps/web/components/home/BookingBoard.tsx

key-decisions:
  - "When !quote.pricing_live, pass null into formatChfRappen and chfRappenToDisplay (class cards and PriceSummary, including lines)"
  - "WhyVamos decorative CHF 000 left untouched"
  - "respond.ts unchanged; charge stays CHF; header FX display-only"

patterns-established:
  - "Board display belt nulls rappen on !pricing_live; engine flag is not enough without the widget"

requirements-completed: [LAUNCH-06]

# Metrics
duration: 4min
completed: 2026-09-13
---

# Phase 11 Plan 06: BookingBoard nulls amounts when !pricing_live Summary

**Home class cards and sticky PriceSummary pass null rappen into `formatChfRappen` / `chfRappenToDisplay` when `!quote.pricing_live`, so public amounts read CHF 000 until Publish-as-flip**

## Performance

- **Duration:** 4 min
- **Started:** 2026-09-12T23:54:12Z
- **Completed:** 2026-09-12T23:57:54Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- `publicRappen(quote.pricing_live, rappen)` gates class-card `formatChfRappen` and PriceSummary `chfRappenToDisplay` (total + line amounts)
- `ineligiblePrice` unchanged; no coming-soon UI; no second formatter; no hardcoded 80/100/130/150
- Source-read `booking-board-null.test.ts` fails if those formatters still take `entry.total_rappen` / `selectedEntry.total_rappen` as first arg
- WhyVamos still decorative `CHF 000` with `data-i18n-skip` (file not edited)

## Task Commits

Each task was committed atomically:

1. **Task 1: Null public board amounts when !pricing_live** - `84d44ba` (feat)
2. **Task 2: Grep no invented public floors; leave WhyVamos** - no commit (WhyVamos already correct; no files changed)

**Plan metadata:** (this commit)

## Files Created/Modified

- `apps/web/components/home/BookingBoard.tsx` - null rappen into formatters when `!pricing_live`
- `apps/web/lib/pricing/booking-board-null.test.ts` - readFileSync of BookingBoard.tsx

Unchanged: `apps/web/components/home/WhyVamos.tsx` (decorative CHF 000). `respond.ts` not edited.

## Decisions Made

- Null display rappen on the widget; do not branch inside `respond.ts`
- Also null PriceSummary line amounts (T-11-01) so line cells cannot leak CHF before Publish
- Charge remains CHF; header FX remains display-only (D-20)
- Do not invent extras (D-21)

## Deviations from Plan

None - plan executed exactly as written.

**Total deviations:** 0 auto-fixed
**Impact on plan:** None

## Issues Encountered

None. `lib/currency*.test.ts` does not exist; Task 2 ran `extract-no-invent.test.ts` plus plan-level `public-chf.test.ts`.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Public home amounts are CHF 000 until D-18 Publish. D-19 D-20 D-21.
- Ready for remaining Phase 11 plans. Do not apply SQL. Do not deploy. Do not wrangler. Stripe stays test.

## Self-Check: PASSED

- FOUND: `apps/web/components/home/BookingBoard.tsx`
- FOUND: `apps/web/lib/pricing/booking-board-null.test.ts`
- FOUND: `84d44ba` feat(11-06)
- FOUND: WhyVamos still `CHF 000` / `data-i18n-skip`
- GREEN: `booking-board-null.test.ts` 4/4; `extract-no-invent.test.ts` + `public-chf.test.ts` included in 16/16

---
*Phase: 11-launch-cutover*
*Completed: 2026-09-13*
