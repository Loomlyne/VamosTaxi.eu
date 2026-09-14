---
phase: 18-ops-pricing-source
plan: 02
subsystem: pricing-ui
tags: [home, checkout, live-book, quote-schema, rate-book, vitest]
requires:
  - phase: 18-ops-pricing-source
    provides: mapRateBook live-book class filter, quote.classes from eligibility
provides:
  - Home fleetOffer from quote.classes only (no VEHICLE_CLASSES catalog)
  - Checkout cards from live-book offers (no CLASS_SLUGS / CLASS_META ladder)
  - IntentVehicleClass and preferred_class are kebab slugs
  - Unapplied quote_rate_book SQL scoping classes to rated rows
affects: [18-03 draft/Publish UX, 18-06 any-class photos]
tech-stack:
  added: []
  patterns: [public offer list is quote.classes only]
key-files:
  created:
    - packages/db/supabase/migrations/20260914190000_quote_rate_book_live_classes.sql
  modified:
    - app/home/home.dc.html
    - apps/web/public/app/home/home.dc.html
    - apps/web/components/home/BookingBoard.tsx
    - apps/web/app/[locale]/checkout/CheckoutClassCards.tsx
    - apps/web/app/[locale]/checkout/CheckoutClient.tsx
    - apps/web/lib/checkout/vamos-trip.ts
    - apps/web/lib/checkout/intent-schema.ts
    - apps/web/lib/quote/intent.ts
    - apps/web/lib/quote/schema.ts
    - apps/web/app/[locale]/(ops)/api/staff/rate-book/route.ts
    - apps/web/lib/ops/ops-dc-finalize.test.ts
    - apps/web/lib/pricing/public-live-book-board.test.ts
key-decisions:
  - "Checkout intent schema accepts kebab slugs and no longer coerces display names to economy."
  - "SQL is git-only; owner apply remains 18-07."
requirements-completed: [D-27, D-29, D-31, D-32]
duration: 30min
completed: 2026-09-14
---

# Phase 18: OPS Pricing source of truth — 18-02 Summary

**Public home and checkout can no longer invent Economy/Business/First/Van. Cards come from the live quote book; unrated leftovers get no card.**

## Performance

- **Duration:** ~30 min
- **Started:** 2026-09-14T14:42:00Z
- **Completed:** 2026-09-14T14:51:00Z
- **Tasks:** 3/3
- **Files modified:** 16

## Accomplishments

- Home `fleetOffer` is built only from `quote.classes` (`classFromQuote`). `VEHICLE_CLASSES` / `classCatalog` are gone. Dual-DC public copy synced with `<base href="/app/home/">`.
- Checkout cards render offered live-book slugs with name, photo, seats, bags from the payload. Photo may be empty until 18-06 R2. No hardcoded `/assets/photography/class-economy.jpg`.
- `IntentVehicleClass` is `string`. Quote `preferred_class` and checkout intent use the kebab `CLASS_SLUG` regex. Rate-book dropped `KNOWN_CLASS_SLUGS`.
- Git-only migration `20260914190000_quote_rate_book_live_classes.sql` restricts `quote_rate_book` classes to rows with `distance_rates` or `fixed_routes` for the selected version.

## Task Commits

None — production work is uncommitted (standing no-commit-unless-asked). Ask to commit if you want GSD atomic close-out.

1. **Task 1: Git quote_rate_book live-class SQL** — file on disk, unapplied
2. **Task 2: Home DC + BookingBoard** — live-book cards only
3. **Task 3: Checkout + intent + KNOWN_CLASS_SLUGS** — open kebab slugs

## Files Created/Modified

- `packages/db/supabase/migrations/20260914190000_quote_rate_book_live_classes.sql` — unapplied D-29 classes agg
- `app/home/home.dc.html` / public copy — `fleetOffer` from quote.classes
- `apps/web/components/home/BookingBoard.tsx` — no `CLASS_NAMES` four-record
- `apps/web/app/[locale]/checkout/CheckoutClassCards.tsx` — `CheckoutClassOffer[]`
- `apps/web/app/[locale]/checkout/CheckoutClient.tsx` — no `CLASS_SLUGS` coerce
- `apps/web/lib/checkout/vamos-trip.ts` — `classOffers`; `tripVehicle` does not default economy
- `apps/web/lib/checkout/intent-schema.ts` — kebab slug, no display-name coerce
- `apps/web/lib/quote/intent.ts` / `schema.ts` — open slugs
- `apps/web/app/[locale]/(ops)/api/staff/rate-book/route.ts` — no `KNOWN_CLASS_SLUGS`
- `apps/web/lib/ops/ops-dc-finalize.test.ts` — public offer path no longer requires the four-tuple

## Decisions & Deviations

- Followed the plan. Did not rewrite OpsFleet / OpsBoard / `vamos-ops-data.js` four-class fallbacks (18-06).
- Opened checkout `intent-schema.ts` in the same sitting so pay cannot reject a live-book slug such as `suv`.
- Support fingerprint updated from `#support` to `/support` (sidebar already uses `/support`).
- Did not `supabase db push`. Did not Publish. Did not commit.

## Verification

- `pnpm --filter web exec vitest run lib/pricing/public-live-book-board.test.ts lib/ops/ops-dc-finalize.test.ts lib/quote/intent.test.ts lib/quote/schema.test.ts` — 83 passed
- Dual-DC home copy has `<base href="/app/home/">`
- Migration present and unapplied

## Next Phase Readiness

18-03 can ship draft/Publish UX. Public UI will not re-paint deleted classes from a catalog.

## Self-Check: PASSED
