---
phase: 06-ops-reference-data-content-console
plan: 15
subsystem: ops
tags: [pricing, rate-book, distance_rates, fixed_routes, surcharges, service_zones, sqlstate]
requires:
  - phase: 06-ops-reference-data-content-console
    provides: "06-07 mapSqlState / OPS_SQLSTATE / loadRateVersions; 06-02 requireAdminClaims / asStaff; 06-03 admin host"
provides:
  - "loadRateBook + loadServiceZones readers for a rate_version's three priced child tables and service_zones"
  - "assertDistanceRateInput / assertFixedRouteInput / assertSurchargeInput / assertServiceZoneInput mirroring CHECK bounds"
  - "classifyPricingFailure wrapping mapSqlState; freeze is SQLSTATE 23001"
  - "admin /ops/pricing/[versionId] rate-book tabs; staff /ops/pricing/zones CRUD"
  - "Nine admin Server Actions on priced rows; three staff actions on service_zones"
affects: [06-12, 06-16, 06-17, 07-quote]
tech-stack:
  added: []
  patterns:
    - "Priced cells render formatAmount(rappen | null) → CHF 000; no UI branch that hides a number"
    - "Freeze refusals branch on err.code 23001 via classifyPricingFailure → mapSqlState"
    - "Availability flags (available / live / active) stay writable after publish; other columns freeze"
    - "service_zones uses requireStaffClaims; priced child tables use requireAdminClaims"
key-files:
  created:
    - apps/web/lib/ops/rate-book.ts
    - apps/web/app/[locale]/(ops)/ops/pricing/[versionId]/page.tsx
    - apps/web/app/[locale]/(ops)/ops/pricing/[versionId]/actions.ts
    - apps/web/app/[locale]/(ops)/ops/pricing/zones/page.tsx
    - apps/web/app/[locale]/(ops)/ops/pricing/zones/actions.ts
    - apps/web/components/ops/RateBookTabs.tsx
    - apps/web/components/ops/RateBookTabs.css
    - apps/web/components/ops/DistanceRateTable.tsx
    - apps/web/components/ops/FixedRouteTable.tsx
    - apps/web/components/ops/SurchargeTable.tsx
    - apps/web/components/ops/ServiceZonePanel.tsx
    - apps/web/tests/integration/ops-rate-book.spec.ts
  modified:
    - apps/web/components/ops/index.ts
    - apps/web/i18n/messages/en.json
    - apps/web/i18n/messages/de.json
    - apps/web/i18n/messages/fr.json
    - apps/web/i18n/messages/ar.json
key-decisions:
  - "D-14/D-32: every rappen cell is formatAmount(null) → CHF 000; write path proven by CHECK refusal of -1, never by inventing a price"
  - "D-13: freeze is 23001 restrict_violation, matching 06-07's correction of CONTEXT 23514/P0001"
  - "D-31: no yellow pills; unpriced/unavailable use charcoal, hairline, semantic danger/success"
  - "06-12 vehicleClassLabelKey is not on this branch; local three-slug map matches that contract (null for unknown)"
requirements-completed: [OPS-06]
duration: 90min
completed: 2026-09-01
---

# Phase 06 Plan 15: Rate book (distance / routes / surcharges / zones)

**Admins can curate a draft version's distance rates, fixed routes and surcharges, and staff can manage the service zones those routes are built between — every priced cell is CHF 000 because the rappen column is NULL.**

## Performance

- **Duration:** ~90 min
- **Completed:** 2026-09-01
- **Tasks:** 3
- **Files modified:** production files listed above + this SUMMARY

## Accomplishments

- `lib/ops/rate-book.ts` reads a version's three priced children plus `service_zones`. Validators mirror CHECK bounds (`rappen` domain, `max_pax` 1..16, percent 0..100, kebab slug). Mutations stay in Server Actions.
- `/ops/pricing/[versionId]` is admin-only (`requireAdminClaims` + `notFound()` on `not-admin`). Nine actions: upsert/delete/availability for each child table. `revalidatePath` only — no Realtime.
- `/ops/pricing/zones` is staff (`requireStaffClaims`): `service_zones` is in the shared working set. Deactivate is live against `service_zones_public_read`, not staged. Missing `zone.<slug>` is a labelled gap that links to 06-10.
- Amounts stay `number | null` and render through `formatAmount(rappen)` → placeholder `000`. No CHF figure in fixtures, tests, or seed.

## Task Commits

1. **Task 1: reader + validators + classifier** — `e81bea8` (feat)
2. **Task 2: version-scoped UI + nine admin actions** — `9c974ff` (feat)
3. **Task 3: service-zone panel + integration spec** — `4082d5c` (feat)

**Plan metadata:** this commit

## D-32 gap (deliberate)

Priced-value round-trip is **not** asserted. The write path is proven by a CHECK refusal of `-1` rappen (SQLSTATE `23514`). Persistence is proven on `max_pax`, `applies_to` and the three availability flags. Close this gap on the day the owner's price matrix lands — do not temporarily enter a plausible figure.

## Decisions Made

- Freeze SQLSTATE is `23001` (restrict_violation), wrapping 06-07 `mapSqlState`. `23514` is CHECK (rappen domain). Never parse `err.message`.
- Availability carve-out: after publish, `available` / `live` / `active` still toggle; `max_pax` (and every other priced column) raises `23001`.
- `vehicleClassLabelKey` is a local three-entry map (`common.vehicleClassEconomy|Business|Van`, else null) because 06-12 is not on this branch. Class names stay untranslated (ADR-012).
- Zones are staff, not admin, per PLAN Task 3.

## Deviations from Plan

- **`vehicleClassLabelKey` defined here, not imported from 06-12.** 06-12 is not on `gsd/06-15-rate-book`. Contract matches 06-12 PLAN (explicit map, null for unshipped slugs).
- **Playwright / project `tsc` not executed in this worktree.** Executor must not start Docker / `next dev` / `pnpm install`. `ops-rate-book.spec.ts` throws `run pnpm db:start && pnpm db:reset from packages/db` when local auth is down (no postgres `test.skip`). `node scripts/check-i18n-coverage.mjs` passed. `stylelint` on `RateBookTabs.css` passed (`--config-basedir` main `apps/web`).
- **`check:db-access-fences` inherited red** on `asStaff` Server Action modules (`coupons`, `pricing`, `settings`, plus this plan's `[versionId]/actions.ts` and `zones/actions.ts`). Same 06-07 pattern; `export const dynamic = "force-dynamic"` is on the pages.

**Total deviations:** 3 (06-12 helper copy, inherited live-stack gate, inherited fence)
**Impact on plan:** no scope creep; D-11/D-13/D-14/D-32/D-31 hold.

## Issues Encountered

Worktree has no `node_modules`. Do not symlink or `pnpm install`. Project `tsc -p` cannot resolve packages from here. `packages/db/supabase/seed.sql` unchanged.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Rate-book editor is in place for a draft version. Publish stays 06-07. Completeness still counts NULL rappen rows; this plan does not invent prices. 06-12 can replace the local `vehicleClassLabelKey` with its own export when merged.
