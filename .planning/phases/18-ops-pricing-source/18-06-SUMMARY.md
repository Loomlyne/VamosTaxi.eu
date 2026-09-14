---
phase: 18-ops-pricing-source
plan: 06
subsystem: ops-pricing
tags: [class-photo, r2, surcharges, extras-catalog, vitest]
requires:
  - phase: 18-ops-pricing-source
    provides: place then canton; extra stop max 1 (18-05)
provides:
  - Any kebab class; R2 classes/ photo prefix; Publish completeness wants photo, name, start, per-km, pax, bags
  - One Surcharges & extras list; checkout extra / meet / free wait / extra wait types
  - Meet & greet always on CHF 0; free wait always on at airport; extras omitted after delete+Publish
affects: [18-07 owner SQL apply + UAT]
tech-stack:
  added: []
  patterns: [class photo via /api/photos/upload kind class; surcharge type dialog via OpsTable showWhen]
key-files:
  created:
    - packages/db/supabase/migrations/20260914191000_vehicle_class_any_photo.sql
  modified:
    - apps/web/lib/ops/photos.ts
    - apps/web/lib/ops/pricing.ts
    - apps/web/lib/ops/fleet-write.ts
    - apps/web/lib/checkout/extras-catalog.ts
    - apps/web/lib/ops/surcharge-codes.ts
    - app/ops/OpsPricing.dc.html
    - app/ops/OpsTable.dc.html
    - apps/web/public/app/ops/OpsPricing.dc.html
key-decisions:
  - "SQL 20260914191000 is git-only; owner apply remains 18-07. Completeness and class GET/PATCH select name/photo_path so they 500 until that apply."
  - "Meet & greet and free wait are not customer toggles. Recap still lists them when extraIsOn is true."
  - "Night/weekend/holiday types are gone from OpsPricing. Leftover automatic codes stay off checkout chips."
requirements-completed: [D-10, D-22, D-25, D-29, D-30, D-31, D-32, D-34, D-35]
duration: 50min
completed: 2026-09-14
---

# Phase 18: OPS Pricing source of truth — 18-06 Summary

**Classes can be any name with a required R2 photo. Surcharges & extras is one typed list. Checkout extras (including ski) come from that list after Publish.**

## Performance

- **Duration:** ~50 min
- **Started:** 2026-09-14T19:53:00Z
- **Completed:** 2026-09-14T20:12:00Z
- **Tasks:** 3/3
- **Files modified:** 20+

## Accomplishments

- Git SQL drops the four-slug CHECK, adds `vehicle_classes.name` and `photo_path`. Unapplied.
- `PHOTO_PREFIXES` includes `classes/`. Upload kind `class` writes R2 only; Save stores `photo_path` on the class.
- Distance overlay: photo chooser, typed name, start, per-km, max passengers, max bags, hide-from-public.
- Completeness 409s empty photo/name/start/per-km/max pax/max bags.
- Surcharges pane is one `OpsTable`. Types: checkout extra, meet and greet, free airport wait, extra wait. No night/weekend/holiday. No rules table.
- `catalogFromSurcharges` omits a deleted extra (not CHF 0). Meet & greet toggle off (always on). Free wait toggle off, still airport-only.

## Task Commits

None — production work is uncommitted (standing no-commit-unless-asked).

1. **Task 1: any-class + photo_path SQL** — already git-only from this session start
2. **Task 2: R2 class photos + completeness** — photos.ts, fleet-write, pricing.ts, Distance overlay
3. **Task 3: One surcharges list + extras catalog** — OpsPricing, extras-catalog, surcharge-codes

## Files Created/Modified

- `20260914191000_vehicle_class_any_photo.sql` — kebab slug CHECK, name, photo_path
- `photos.ts` — `classes/` prefix, PhotoKind `class`
- `pricing.ts` — completeness photo/name/bags
- `OpsPricing.dc.html` — class photo + one surcharge list (dual-DC)
- `OpsTable.dc.html` — `showWhen`, `photoRecordKey`, `canDelete`
- `extras-catalog.ts` — meet/free wait not customer toggles

## Decisions & Deviations

- Staff GET/PATCH/completeness select `name` and `photo_path`. Until 18-07 apply those queries 500 on hosted. Same gate as 18-02 `quote_rate_book` SQL.
- Surcharge PUT no longer 400s when `ruleId` is missing. Extra wait is an automatic code (not a checkout chip). Free-wait hours write `rate_versions.free_wait_minutes`.
- OpsTable `showWhen` hides type-specific fields instead of a custom dialog.
- Did not click Publish. Did not `db push`. Did not commit.

## Verification

```
pnpm --filter web exec vitest run \
  lib/ops/photos.test.ts \
  lib/ops/pricing.test.ts \
  lib/checkout/extras-catalog.test.ts \
  lib/ops/ops-pricing-tabs.test.ts \
  lib/ops/ops-dc-finalize.test.ts \
  lib/ops/ops-pricing-vat-field.test.ts \
  lib/ops/rate-book-draft.test.ts \
  lib/ops/surcharge-codes.test.ts
```

59 passed. Dual-DC OpsPricing byte-equal. `ops.dc.html` still has `<base href="/app/ops/">`.
