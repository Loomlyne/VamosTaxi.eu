---
phase: 06-ops-reference-data-content-console
plan: 02
subsystem: api
tags: [ops, staff-json, vamos-ops, rate-book, dc-mock]

requires:
  - phase: 05-auth-identity
    provides: requireStaffClaims / asStaff / createServerSupabaseClient / app.staff_self()
provides:
  - jsonOk / jsonErr / withStaff / withAdmin envelope for later /api/staff/* routes
  - GET /api/staff/me dual-mounted at (ops) and app/api/staff/me
  - window.VamosOpsApi.request with credentials include and absolute /api/ paths
  - Empty remote VamosOps collections; rate-book client bound to GET/PUT /api/staff/rate-book
affects: [06-04, 06-05, 06-06, 06-07, 06-08, 06-09, 06-10]

tech-stack:
  added: []
  patterns:
    - Staff JSON envelope { ok, data } / { ok: false, code } via withStaff/withAdmin
    - DC mock talks JSON through VamosOpsApi absolute /api/ paths
    - Rate-book collections hydrate GET /api/staff/rate-book?versionId= and upsert PUT { kind }

key-files:
  created:
    - apps/web/lib/ops/staff-json.ts
    - apps/web/lib/ops/staff-json.test.ts
    - apps/web/app/[locale]/(ops)/api/staff/me/route.ts
    - apps/web/app/api/staff/me/route.ts
    - apps/web/tests/integration/ops-staff-me.spec.ts
    - app/vamos-ops-api.js
  modified:
    - app/ops/ops.dc.html
    - app/vamos-ops-data.js

key-decisions:
  - "Rate-book client binds GET/PUT /api/staff/rate-book with kind route|distance|surcharge — no /api/staff/routes|rates|surcharges aliases"
  - "In-scope collections start [] and stay [] on 404/network; bookings never POST"
  - "GET /api/staff/me returns empty fullName when the self row has none — never a fabricated name"

patterns-established:
  - "Pattern: withStaff → asStaff/loadOwnProfile; never postgres or @vamos/db in the JSON door"
  - "Pattern: DC mock fetch is always path.startsWith('/api/') + credentials include"

requirements-completed: [OPS-10]

duration: 9 min
completed: 2026-09-01
---

# Phase 6 Plan 02: Staff JSON door + empty VamosOps Summary

**Staff JSON envelope (`jsonOk`/`withStaff`) plus dual-mounted GET `/api/staff/me`, an absolute `/api/` fetch helper, and a seedless remote VamosOps that hydrates empty and binds rate-book to PUT `/api/staff/rate-book`.**

## Performance

- **Duration:** 9 min
- **Started:** 2026-09-01T15:50:50Z
- **Completed:** 2026-09-01T16:00:17Z
- **Tasks:** 3
- **Files modified:** 8

## Accomplishments

- Shared staff JSON helper maps `no-session` → 401, `not-staff`/`not-admin` → 403; MFA is not redirected (D-37)
- GET `/api/staff/me` lives under `[locale]/(ops)` and is re-exported at `app/api/staff/me` so `<base href="/app/ops/">` cannot steal the path
- `window.VamosOpsApi.request` rejects non-`/api/` paths, sends `credentials: "include"`, and never logs tokens
- VamosOps in-scope collections start empty, skip localStorage, and use the named HTTP map; bookings stay `[]` with no write route (D-35)

## Task Commits

1. **Task 1: Staff JSON helper and GET /api/staff/me** - `981b14d` (feat)
2. **Task 2: VamosOpsApi fetch helper** - `7674e6b` (feat)
3. **Task 3: Empty remote VamosOps — kill the fake seed** - `3dac8bd` (feat)

**Plan metadata:** (this commit)

## Files Created/Modified

- `apps/web/lib/ops/staff-json.ts` - jsonOk / jsonErr / withStaff / withAdmin / staffStatus
- `apps/web/lib/ops/staff-json.test.ts` - status mapping + unauthenticated JSON 401
- `apps/web/app/[locale]/(ops)/api/staff/me/route.ts` - GET self row via loadOwnProfile / asStaff
- `apps/web/app/api/staff/me/route.ts` - re-export GET
- `apps/web/tests/integration/ops-staff-me.spec.ts` - envelope + dual-mount lock
- `app/vamos-ops-api.js` - absolute /api client
- `app/ops/ops.dc.html` - loads vamos-ops-api.js before vamos-ops-data.js
- `app/vamos-ops-data.js` - empty remote store; rate-book GET/PUT

## Decisions Made

- Rate-book collections (`routes` / `rates` / `surcharges`) hydrate `GET /api/staff/rate-book?versionId=` and upsert `PUT /api/staff/rate-book` with `{ kind: "route" | "distance" | "surcharge" }`. 06-05 must not rebind these in `vamos-ops-data.js`.
- REST collections (`vehicles` | `chauffeurs` | `customers` | `coupons`) use GET/POST `/api/staff/<name>` and PATCH/DELETE `/api/staff/<name>/:id`. Write failure keeps the previous list (usually `[]`) and emits — no local fake row as success.
- Bookings: `all()` always `[]`; add/update/remove are no-ops with no POST/PATCH path.
- Settings/profile start as `{}` / empty strings; no GmbH / Bleicherstrasse / `dispatch@vamostaxi.eu` JS fallback (C24).
- `VEHICLE_CLASSES` live constant is Economy / Business / Van only (no First row).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Relative imports in staff-json.ts**
- **Found during:** Task 1 (vitest)
- **Issue:** Vitest in this worktree does not resolve `@/` for value imports
- **Fix:** `staff-json.ts` imports `./session` and `../supabase/server`; the me route still uses `@/`
- **Files modified:** `apps/web/lib/ops/staff-json.ts`
- **Verification:** vitest 11 passed
- **Committed in:** `981b14d`

**2. [Rule 3 - Blocking] GET 401 proven via withStaff, not a live Next process**
- **Found during:** Task 1 (acceptance: unauthenticated GET is JSON 401)
- **Issue:** Executor must not start Next/Supabase/Docker
- **Fix:** Unit-test the same `withStaff` door GET uses; integration spec locks JSON envelope + dual re-export
- **Files modified:** `apps/web/lib/ops/staff-json.test.ts`, `apps/web/tests/integration/ops-staff-me.spec.ts`
- **Verification:** vitest 11 passed; re-export file contains `export { GET }`
- **Committed in:** `981b14d`

---

**Total deviations:** 2 auto-fixed (1 missing critical, 1 blocking)
**Impact on plan:** No scope creep. Envelope and empty store match the plan. Live HTTP against the dashboard host is still a gap (see below).

## Issues Encountered

None that blocked the plan. `apps/web/public/app/` is gitignored; `node scripts/sync-dc-mock-to-public.mjs` ran after Tasks 2 and 3 so the Worker copy on disk matches. Deploy must run that sync.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Ready for 06-03 (dashboard host / login). CRUD JSON for fleet/customers/coupons is 06-04+; rate-book JSON body is 06-05 — the client map is already bound.

Remaining gaps:

- Live `GET /api/staff/me` on the dashboard host (no cookies → JSON 401) was not hit over HTTP in this executor
- 06-04…06-10 routes are absent; empty tables are the correct shipping state
- Bookings stay empty until Phase 8
- MFA/aal2 still paused (D-37)

## Self-Check: PASSED

- Key files exist on disk
- `git log --grep=06-02` has production commits `981b14d`, `7674e6b`, `3dac8bd`
- vitest `lib/ops/staff-json.test.ts`: 11 passed
- `needs-mfa` absent from `staff-json.ts`; no `postgres` / `@vamos/db` in the JSON door or me route
- Placeholder seeds (ZH 000 001, Traveller 1, WELCOME, FR-01, Bleicherstrasse, dispatch@vamostaxi.eu) absent from `app/vamos-ops-data.js`
- `/api/staff/routes`, `/api/staff/rates`, `/api/staff/surcharges` absent from `vamos-ops-data.js`
- `localStorage` absent from `vamos-ops-data.js`

---
*Phase: 06-ops-reference-data-content-console*
*Completed: 2026-09-01*
