---
phase: 06-ops-reference-data-content-console
plan: 05
subsystem: api
tags: [ops, staff-json, rate-book, rate-versions, dc-mock, publish]

requires:
  - phase: 06-02
    provides: staff JSON envelope + VamosOps rate-book GET/PUT /api/staff/rate-book kind map
  - phase: 06-03
    provides: dashboard host /login
provides:
  - GET/POST /api/staff/rate-versions dual-mounted
  - GET /api/staff/rate-versions/:id completeness gaps
  - POST /api/staff/rate-versions/:id/publish withAdmin SQLSTATE mapping
  - GET/PUT /api/staff/rate-book wrapping loadRateBook / upserts
  - OpsPricing completeness + Publish chrome en/de/fr/ar
affects: [06-09]

tech-stack:
  added: []
  patterns:
    - Dual-mount locale (ops) handlers + app/api/staff re-export force-dynamic
    - Publish failures branch on SQLSTATE / classifyPricingFailure, never err.message
    - OpsPricing Publish POSTs rate-versions/:id/publish; row saves stay on VamosOps PUT rate-book

key-files:
  created:
    - apps/web/app/[locale]/(ops)/api/staff/rate-versions/route.ts
    - apps/web/app/[locale]/(ops)/api/staff/rate-versions/[id]/route.ts
    - apps/web/app/[locale]/(ops)/api/staff/rate-versions/[id]/publish/route.ts
    - apps/web/app/[locale]/(ops)/api/staff/rate-book/route.ts
    - apps/web/app/api/staff/rate-versions/route.ts
    - apps/web/app/api/staff/rate-versions/[id]/route.ts
    - apps/web/app/api/staff/rate-versions/[id]/publish/route.ts
    - apps/web/app/api/staff/rate-book/route.ts
    - apps/web/tests/integration/ops-dc-pricing.spec.ts
  modified:
    - app/ops/OpsPricing.dc.html

key-decisions:
  - "D-11: Publish is POST /api/staff/rate-versions/:id/publish, not the per-row live toggle"
  - "D-12: Hide Publish unless profile.role === admin; 06-09 still owns nav omit"
  - "D-13: publish maps 23514/P0001 via classifyPricingFailure + loadCompleteness"
  - "D-14/D-35: no invented CHF; NULL display is CHF 000; placeholders 000/00 never written as rappen"
  - "Did not edit app/vamos-ops-data.js; no GET/POST /api/staff/routes|rates|surcharges"

patterns-established:
  - "Pattern: staff JSON dual-mount for rate-versions + rate-book"
  - "Pattern: OpsPricing T ships Publish/completeness/gap-list en/de/fr/ar same pass"

requirements-completed: [OPS-06]

duration: 45min
completed: 2026-09-01
---

# Phase 6 Plan 05: Pricing draft→publish Summary

**Staff JSON for rate-versions and rate-book, plus OpsPricing completeness/Publish chrome that POSTs `/api/staff/rate-versions/:id/publish` while row saves stay on PUT `/api/staff/rate-book`.**

## Performance

- **Duration:** 45 min
- **Started:** 2026-09-01T15:50:00Z
- **Completed:** 2026-09-01T16:34:04Z
- **Tasks:** 2
- **Files modified:** 11

## Accomplishments

- Dual-mounted GET/POST `/api/staff/rate-versions`, GET `:id` completeness, POST `:id/publish` (`withAdmin`, SQLSTATE only)
- GET/PUT `/api/staff/rate-book` hydrates 06-02 collections and upserts `{ kind: route | distance | surcharge }`
- OpsPricing keeps three panes; Publish + gap list charcoal/danger; dispatcher hides Publish; en/de/fr/ar same pass
- NULL money cells render `CHF 000`; placeholder `000`/`00`/`0.00` map to SQL NULL — no invented prices

## Task Commits

1. **Task 1: Rate-version and rate-book JSON** - `76ade99` (feat)
2. **Task 2: OpsPricing draft/publish JS — not a live toggle** - `13ff0d4` (feat)

**Plan metadata:** (this commit)

## Files Created/Modified

- `apps/web/app/[locale]/(ops)/api/staff/rate-versions/route.ts` - GET list (staff) + POST createDraft (admin)
- `apps/web/app/[locale]/(ops)/api/staff/rate-versions/[id]/route.ts` - GET version + gaps
- `apps/web/app/[locale]/(ops)/api/staff/rate-versions/[id]/publish/route.ts` - POST publish withAdmin
- `apps/web/app/[locale]/(ops)/api/staff/rate-book/route.ts` - GET hydrate + PUT upsert
- `apps/web/app/api/staff/rate-versions/route.ts` - re-export GET, POST
- `apps/web/app/api/staff/rate-versions/[id]/route.ts` - re-export GET
- `apps/web/app/api/staff/rate-versions/[id]/publish/route.ts` - re-export POST
- `apps/web/app/api/staff/rate-book/route.ts` - re-export GET, PUT
- `app/ops/OpsPricing.dc.html` - completeness + Publish; row saves via VamosOps
- `apps/web/tests/integration/ops-dc-pricing.spec.ts` - 401/403 envelope + dual-mount + T langs

## Decisions Made

- Consume 06-02 map: do not edit `app/vamos-ops-data.js`; do not invent GET/POST `/api/staff/routes`.
- Per-row `fLive` stays a booking-visibility field; publish is the separate control (D-11).
- Hide Publish unless `role === 'admin'` (extra to 06-09 nav hide).
- No zones pane in the mock — skip `/api/staff/service-zones`.
- No full `sync-dc-mock-to-public.mjs` (public/app is gitignored; same note as 06-02).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Worktree tsc without node_modules**
- **Found during:** Task 1/2 (`tsc --noEmit`)
- **Issue:** Worktree has no `apps/web/node_modules`. A local `@types/node` folder shadows package resolution. `pnpm install` and a full `node_modules` symlink are forbidden.
- **Fix:** Did not install. Did not leave a worktree `node_modules`. Proved the JSON door with vitest.
- **Files modified:** none
- **Verification:** main `vitest` `lib/ops/staff-json.test.ts` — 11 passed
- **Committed in:** n/a

**2. [Rule 3 - Blocking] `rg` not on PATH**
- **Found during:** Task 1/2 acceptance
- **Issue:** Plan verify used `rg`; shell exit 127
- **Fix:** Content search for `withAdmin` / `classifyPricingFailure` / publish + rate-book paths
- **Files modified:** none
- **Verification:** publish route uses `withAdmin` + `classifyPricingFailure`; OpsPricing contains `/api/staff/rate-book` and `rate-versions/' + id + '/publish`
- **Committed in:** `76ade99`, `13ff0d4`

---

**Total deviations:** 2 auto-fixed (2 blocking)
**Impact on plan:** No scope creep. APIs and mock match D-11–D-14 / D-30 / D-35.

## Issues Encountered

Worktree `tsc --noEmit` cannot resolve `@types/node` without a local `node_modules` that then hides Next packages. Not treated as a product defect.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Ready for later Wave 3 plans. 06-09 still owns dispatcher nav omit for `#pricing`. Live HTTP publish against the dashboard host was not hit (no Docker / Next / db:start).

Remaining gaps:

- Seed draft stays unpriced; Publish stays inert (D-14)
- 06-09 OpsSidebar hide is not this plan
- Bookings stay empty until Phase 8

## Self-Check: PASSED

- Key files exist on disk
- Production commits `76ade99`, `13ff0d4`
- vitest `lib/ops/staff-json.test.ts`: 11 passed
- POST publish is `withAdmin`; no `err.message` split; no `postgres` import
- `app/vamos-ops-data.js` not modified
- OpsPricing T has `publish` + `completenessTitle` in en/de/fr/ar
- No `--vt-yellow-50`; no invented CHF digits in new JS

---
*Phase: 06-ops-reference-data-content-console*
*Completed: 2026-09-01*
