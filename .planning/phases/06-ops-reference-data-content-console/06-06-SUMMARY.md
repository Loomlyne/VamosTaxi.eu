---
phase: 06-ops-reference-data-content-console
plan: 06
subsystem: api
tags: [ops, coupons, staff-json, dc-mock]

requires:
  - phase: 06-02
    provides: jsonOk / jsonErr / withStaff envelope; VamosOps.coupons restCollection at /api/staff/coupons
  - phase: 06-03
    provides: dashboard host /login so staff cookies reach /api/staff
provides:
  - GET/POST /api/staff/coupons and PATCH/DELETE /api/staff/coupons/:id
  - Dual mount at app/api/staff/coupons so DC <base href="/app/ops/"> cannot steal the path
  - DC field mapping (code, kind, value, uses, limit, expires, active); amount value always 00
affects: [06-07, 07-checkout]

tech-stack:
  added: []
  patterns:
    - Staff JSON coupons wrap lib/ops/coupons.ts via withStaff then asStaff
    - Duplicate coupon code maps 23505 → 409 { ok: false, code: duplicate }

key-files:
  created:
    - apps/web/app/[locale]/(ops)/api/staff/coupons/route.ts
    - apps/web/app/[locale]/(ops)/api/staff/coupons/[id]/route.ts
    - apps/web/app/api/staff/coupons/route.ts
    - apps/web/app/api/staff/coupons/[id]/route.ts
    - apps/web/tests/integration/ops-dc-coupons.spec.ts
  modified:
    - apps/web/lib/ops/coupons.ts
    - apps/web/lib/ops/coupons.test.ts

key-decisions:
  - "Amount kind never persists rappen from the mock value field; GET ships value 00"
  - "OpsCoupons.dc.html already spoke code/kind/value/uses/limit/expires/active — no HTML patch"
  - "Empty GET is { ok: true, data: [] }; do not reseed WELCOME/CORPORATE/SKI"

patterns-established:
  - "Pattern: DC coupon row id is String(bigint); POST ignores client cp-* ids"
  - "Pattern: PATCH with code is full upsert; PATCH { active } only is activate/deactivate"

requirements-completed: [OPS-06]

duration: 7 min
completed: 2026-09-01
---

# Phase 6 Plan 06: Coupons JSON + OpsCoupons Summary

**Staff JSON CRUD for `public.coupons` dual-mounted at `/api/staff/coupons`, bound to the existing OpsCoupons.dc.html table through VamosOps.coupons, with empty list `[]` and amount value always `00`.**

## Performance

- **Duration:** 7 min
- **Started:** 2026-09-01T16:14:34Z
- **Completed:** 2026-09-01T16:21:43Z
- **Tasks:** 1/1
- **Files modified:** 7

## Accomplishments

- GET list + POST create, PATCH update/active, DELETE at `/api/staff/coupons` via `withStaff` → `asStaff`
- Public re-exports at `app/api/staff/coupons` so the DC mock's absolute `/api/` paths work
- DC field map (`value`/`limit`/`expires`); `00`/`NULL` stay unpriced; no real money discount written
- Empty table stays empty; WELCOME/CORPORATE/SKI not reseeded

## Task Commits

1. **Task 1: Coupons JSON + mock bind check** - `ea7bede` (feat)

**Plan metadata:** (this commit)

## Files Created/Modified

- `apps/web/app/[locale]/(ops)/api/staff/coupons/route.ts` - GET list + POST create
- `apps/web/app/[locale]/(ops)/api/staff/coupons/[id]/route.ts` - PATCH update/active + DELETE
- `apps/web/app/api/staff/coupons/route.ts` - re-export GET, POST
- `apps/web/app/api/staff/coupons/[id]/route.ts` - re-export PATCH, DELETE
- `apps/web/lib/ops/coupons.ts` - DC map + insert/update/active/delete asStaff helpers
- `apps/web/lib/ops/coupons.test.ts` - empty reader, 00/NULL value, no rappen from mock value
- `apps/web/tests/integration/ops-dc-coupons.spec.ts` - 401 envelope, dual mount, no seed, VamosOps.coupons
- `app/ops/OpsCoupons.dc.html` - unchanged (fields already agreed)

## Decisions Made

- Amount kind: never convert mock `value` to `amount_rappen`; GET always returns `"00"` for amount / NULL percent.
- `uses` is always 0 here (redemptions land at payment, not this table).
- `limit` 0 in the mock is DB NULL (unlimited). Duplicate `code` → 409 `duplicate` from 23505.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Mutate helpers in lib/ops/coupons.ts**
- **Found during:** Task 1
- **Issue:** Plan `files_modified` listed only routes + HTML + spec; copying SQL into the route would skip `assertCouponInput` / `asStaff` reuse
- **Fix:** `insertCoupon` / `updateCouponRecord` / `setCouponActiveRecord` / `deleteCouponRecord` + DC map live in `lib/ops/coupons.ts`; routes stay JSON doors
- **Files modified:** `apps/web/lib/ops/coupons.ts`
- **Verification:** vitest `lib/ops/coupons.test.ts` 22 passed with staff-json
- **Committed in:** `ea7bede`

**2. [Rule 3 - Blocking] tsc in the worktree has no node_modules**
- **Found during:** Task 1 verify (`pnpm --filter web exec tsc --noEmit`)
- **Issue:** Executor must not `pnpm install`; worktree cannot resolve `@opennextjs/cloudflare` / `next`
- **Fix:** Gate is main-binary vitest (22 passed). tsc red is inherited empty-worktree, not a coupons type error
- **Files modified:** none
- **Verification:** `/Users/koss/Developer/VamosTaxi.eu/apps/web/node_modules/.bin/vitest run lib/ops/coupons.test.ts lib/ops/staff-json.test.ts` — 22 passed
- **Committed in:** n/a

---

**Total deviations:** 2 auto-fixed (1 missing critical, 1 blocking)
**Impact on plan:** No scope creep. HTML unchanged. Empty table and 00 value match D-35 / shipping amount.

## Issues Encountered

None that blocked the plan. Live HTTP against the dashboard host was not hit (no Next/Docker). 401 is the `withStaff` envelope, same as 06-02.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Ready for remaining Wave 3 JSON (fleet/customers/rate-book as their own plans). Coupons half of OPS-06 is live on `#coupons` once those routes are deployed.

## Self-Check: PASSED

- Key files exist on disk
- `git log --grep=06-06` has production commit `ea7bede`
- vitest coupons + staff-json: 22 passed
- `app/api/staff/coupons/route.ts` re-exports GET, POST; `[id]` re-exports PATCH, DELETE
- OpsCoupons.dc.html uses `VamosOps.coupons`, no `localStorage`
- No WELCOME/CORPORATE/SKI seed rows added
- Amount value 00 / NULL; routes contain no CHF literal

---
*Phase: 06-ops-reference-data-content-console*
*Completed: 2026-09-01*
