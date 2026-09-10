---
phase: 08-ops-dispatch-live-board-assignment-account-surfaces
plan: 04
subsystem: api
tags: [ops, assign, gist, booking-events, chauffeur-uuid, security-definer]

requires:
  - phase: 08-03
    provides: Fleet Save round-trip persists chauffeur.default_vehicle_id
provides:
  - Manual chauffeur-uuid assign/unassign via ops_assign_leg / ops_unassign_leg
  - 23P01 overlap mapped to {code:overlap, otherRef, otherLocal}
  - OpsDetail picker + booking_events timeline (no evQuote)
affects: [08-05, 08-09, 08-UAT]

tech-stack:
  added: []
  patterns: [withStaff then asSystem RPC, dual-mount staff routes, GiST EXCLUDE 23P01]

key-files:
  created:
    - packages/db/supabase/migrations/20260910164004_ops_assign_leg.sql
    - packages/db/supabase/tests/ops_assign_leg.test.sql
    - apps/web/lib/ops/assign.ts
    - apps/web/lib/ops/assign-map.ts
    - apps/web/lib/ops/assign.test.ts
    - apps/web/app/[locale]/(ops)/api/staff/bookings/[id]/assign/route.ts
    - apps/web/app/[locale]/(ops)/api/staff/bookings/[id]/unassign/route.ts
    - apps/web/app/api/staff/bookings/[id]/assign/route.ts
    - apps/web/app/api/staff/bookings/[id]/unassign/route.ts
  modified:
    - packages/db/README.md
    - packages/db/database.types.ts
    - apps/web/lib/ops/sqlstate.ts
    - apps/web/lib/ops/staff-json.ts
    - apps/web/lib/ops/bookings.ts
    - app/ops/OpsDetail.dc.html
    - app/vamos-ops-data.js

key-decisions:
  - "Pick chauffeur uuid only; linked vehicle is chauffeurs.default_vehicle_id"
  - "SECURITY DEFINER ops_assign_leg / ops_unassign_leg; GRANT EXECUTE vamos_system only"
  - "Overlap is Postgres GiST 23P01; Worker maps otherRef/otherLocal; no force-assign"
  - "Staff GET returns booking_events; OpsDetail history does not invent evQuote"

patterns-established:
  - "Pattern 1: withStaff on the route, asSystem SELECT of ops_* RPC, never asStaff INSERT into booking_events"
  - "Pattern 2: mutating staff Origin must be dashboard.vamostaxi.site, dashboard.localhost, or ops-changes workers.dev"

requirements-completed: [OPS-03, OPS-02, DATA-08]

duration: 23min
completed: 2026-09-10
---

# Phase 8 Plan 04: Chauffeur-only assign RPC + OpsDetail picker + booking_events timeline Summary

**Dispatchers assign a chauffeur uuid; the RPC sets both FKs under GiST EXCLUDE, writes booking_events, and OpsDetail renders that timeline — unpaid, frozen, no-email, no-vehicle, and overlap all fail closed.**

## Performance

- **Duration:** 23 min
- **Started:** 2026-09-10T16:39:53Z
- **Completed:** 2026-09-10T17:02:39Z
- **Tasks:** 4/4
- **Files modified:** 16

## Accomplishments

- `public.ops_assign_leg` / `public.ops_unassign_leg` SECURITY DEFINER; swap is one UPDATE with GiST deferred; EXECUTE `vamos_system` only
- Staff POST `/api/staff/bookings/:id/assign` `{ chauffeurId }` and `/unassign`; dual-mounted; withStaff then asSystem
- 23P01 → `{ ok:false, code:"overlap", otherRef, otherLocal }`; named refuses `not-paid` / `frozen` / `no-email` / `no-vehicle` / `capacity`
- OpsDetail picker is `{ value: uuid, label: name }` with email + default vehicle + seats/bags; Unassign POSTs; history is `booking.events` only

## Assignment contract

**Chauffeur uuid only.** Vehicle is `chauffeurs.default_vehicle_id`. Unassign nulls both FKs. Paid/confirmed/assigned with `captured_at` only. Frozen: completed/cancelled/refunded/no_show/partials. No auto-dispatch. No driver app.

## Overlap

Postgres GiST EXCLUDE stays. Worker maps `OPS_SQLSTATE.exclusion` (`23P01`) and looks up the other trip's reference + `scheduled_local`. No force-assign.

## Task Commits

1. **Task 1: RPC SQL + README D-21** - `1a0ac0a` (feat; also sqlstate 23P01 + staff Origin CSRF)
2. **Task 2: staff assign/unassign routes** - `520365d` (feat)
3. **Task 3: OpsDetail picker + booking_events GET/timeline** - `9adb3e5` (feat)
4. **Task 4: mapper/file proofs + pgTAP file + types** - `4a2b225` (test)

**Plan metadata:** (this commit)

## Files Created/Modified

- `packages/db/supabase/migrations/20260910164004_ops_assign_leg.sql`
- `packages/db/supabase/tests/ops_assign_leg.test.sql`
- `packages/db/README.md`
- `packages/db/database.types.ts`
- `apps/web/lib/ops/sqlstate.ts`
- `apps/web/lib/ops/staff-json.ts`
- `apps/web/lib/ops/assign.ts`
- `apps/web/lib/ops/assign-map.ts`
- `apps/web/lib/ops/assign.test.ts`
- `apps/web/lib/ops/bookings.ts`
- `apps/web/app/[locale]/(ops)/api/staff/bookings/[id]/assign/route.ts`
- `apps/web/app/[locale]/(ops)/api/staff/bookings/[id]/unassign/route.ts`
- `apps/web/app/api/staff/bookings/[id]/assign/route.ts`
- `apps/web/app/api/staff/bookings/[id]/unassign/route.ts`
- `app/ops/OpsDetail.dc.html`
- `app/vamos-ops-data.js`

## Verification

- **Unit:** `/Users/koss/Developer/VamosTaxi.eu/apps/web/node_modules/.bin/vitest run lib/ops/assign.test.ts` cwd worktree `apps/web` — **9 passed**. No Hyperdrive. No `app/api/**/route.ts` import.
- **File proofs:** SECURITY DEFINER, no GRANT to anon/authenticated, dual-mount POST, list route has no POST, OpsDetail `chauffeurId` + `/unassign`, no `evQuote`, no `location.hash`, no `assigned:{}`, assign.ts uses asSystem, no `:6543`.
- **pgTAP:** `packages/db/supabase/tests/ops_assign_leg.test.sql` written (unpaid / no-email / no-vehicle / 23P01 / unassign FKs / events / frozen). **Not executed** — Docker empty; plan forbids `pnpm db:start` / Docker / hosted apply.
- **Hosted SQL:** not applied (08-09 owner gate).

## Decisions Made

- Mapper lives in `assign-map.ts` so vitest does not load Hyperdrive identity (`@vamos/db/identity`).
- `cleanBooking` keeps `events` so staff GET timeline survives the ops store.

## Deviations from Plan

- Extra files vs `files_modified`: `assign-map.ts` (unit-test isolation) and `app/vamos-ops-data.js` (events would otherwise be stripped).
- Park commit `1a0ac0a` also touched `.planning/ROADMAP.md` before this executor's production commits. Later commits did not stage ROADMAP.

**Total deviations:** 2 extra files + 1 prior ROADMAP touch
**Impact on plan:** Required for unit tests and timeline; no scope creep.

## Issues Encountered

- Worktree has no local `vitest`/`supabase` binaries — used main-tree `apps/web/node_modules/.bin/vitest` and earlier main-tree `supabase migration new`.
- pgTAP cannot run without starting Docker; documented, file not skipped.

## User Setup Required

None - no external service configuration required. Hosted apply is 08-09.

## Next Phase Readiness

Assign RPC + OpsDetail picker/timeline are on the branch. 08-05 can consume assignment FKs. Do not apply hosted SQL until 08-09. Do not deploy.

---
*Phase: 08-ops-dispatch-live-board-assignment-account-surfaces*
*Completed: 2026-09-10*
