---
phase: 06-ops-reference-data-content-console
plan: 07
subsystem: ops
tags: [customers, bookings, read-only, dc-mock, staff-json]
requires:
  - phase: 06-ops-reference-data-content-console
    provides: "06-02 withStaff/jsonOk dual staff JSON door; 06-03 dashboard host; loadCustomers/loadCustomerHistory asStaff"
provides:
  - "GET /api/staff/customers via loadCustomers (empty [] stays empty)"
  - "GET /api/staff/customers/:id customer + display-only booking history"
  - "Dual re-export app/api/staff/customers GET only"
  - "OpsCustomers.dc.html GET-only — no upsert/remove, no Traveller seed"
affects: [08-ops-bookings, 06-02-staff-json]
tech-stack:
  added: []
  patterns:
    - "Staff customer JSON is GET-only; Phase 8 owns assign/refund/confirm"
    - "DC screens that must not write omit OpsTable onSave/onDelete rather than editing vamos-ops-data.js"
key-files:
  created:
    - apps/web/app/[locale]/(ops)/api/staff/customers/route.ts
    - apps/web/app/[locale]/(ops)/api/staff/customers/[id]/route.ts
    - apps/web/app/api/staff/customers/route.ts
    - apps/web/app/api/staff/customers/[id]/route.ts
    - apps/web/tests/integration/ops-dc-customers.spec.ts
  modified:
    - app/ops/OpsCustomers.dc.html
key-decisions:
  - "D-26: no POST/PATCH/DELETE on customers routes; mock does not call restCollection upsert/remove"
  - "D-35: empty customers render empty — no Traveller N seed"
  - "List JSON includes name/trips aliases so 06-02 cleanCustomer hydrates without editing vamos-ops-data.js"
  - "vamos-ops-data.js customers collection still POSTs on upsert (06-02 owns it); this screen never calls it — a readOnly flag would belong in 06-02"
patterns-established:
  - "Dual re-export (ops) GET + app/api/staff GET for DC <base href>"
  - "History cards mapped in the mock from GET /api/staff/customers/:id bookings[]"
requirements-completed: [OPS-07]
duration: 12min
completed: 2026-09-01
---

# Phase 06 Plan 07: Customers GET-only + OpsCustomers.dc.html

**Staff see customers and booking history read-only from OpsCustomers.dc.html. No booking mutation. Empty list stays empty.**

## Performance

- **Duration:** 12 min
- **Started:** 2026-09-01T16:17:12Z
- **Completed:** 2026-09-01T16:25:00Z
- **Tasks:** 1
- **Files modified:** 6 production + this SUMMARY

## Accomplishments

- `GET /api/staff/customers` uses `withStaff` + `loadCustomers` (`asStaff`). Unauthenticated envelope is JSON 401 `{ ok: false, code: no-session }`. Zero rows → `{ ok: true, data: [] }`.
- `GET /api/staff/customers/:id` returns `{ customer, bookings }` from `loadCustomerHistory`. Missing id → JSON 404. Bookings have no assign/refund/confirm write fields.
- Dual re-export at `app/api/staff/customers` and `[id]` exports GET only.
- `OpsCustomers.dc.html` dropped `onSave`/`onDelete`/`blank`/add labels. List still hydrates via `VamosOps.customers.all()` (GET). Opening a row GETs `/api/staff/customers/:id` for history. No Traveller seed.

## Task Commits

1. **Task 1: Read-only customers JSON and mock** - `65857b3` (feat)

**Plan metadata:** (this commit)

## Files Created/Modified

- `apps/web/app/[locale]/(ops)/api/staff/customers/route.ts` — GET list
- `apps/web/app/[locale]/(ops)/api/staff/customers/[id]/route.ts` — GET one + history
- `apps/web/app/api/staff/customers/route.ts` — dual re-export GET
- `apps/web/app/api/staff/customers/[id]/route.ts` — dual re-export GET
- `app/ops/OpsCustomers.dc.html` — read-only table + history GET
- `apps/web/tests/integration/ops-dc-customers.spec.ts` — 401, empty [], GET-only, DC sync

## Decisions Made

- Mapper `toOpsCustomer` is duplicated in both route files (Next forbids extra exports from `route.ts`). `name`/`trips` aliases match `cleanCustomer` without touching `vamos-ops-data.js`.
- OpsTable has no `readOnly` prop and is not in this plan's `files_modified`. Add/Edit/Delete chrome can still render; save/delete do nothing because callbacks are omitted (D-26).

## Deviations from Plan

### Auto-fixed Issues

None.

### Inherited / environment

**1. Worktree has no node_modules (no pnpm install, no symlink)**
- **Found during:** Task 1 verification
- **Issue:** `tsc --noEmit` and worktree `vitest run` cannot resolve `@types/node` / workspace packages. Playwright main binary would not load the worktree ESM spec (`No tests found` / `import.meta`).
- **Fix:** Did not install. Proved acceptance with a Node file-assertion script (all PASS) plus main `vitest run lib/ops/staff-json.test.ts` (11 passed — JSON 401 envelope).
- **Verification:** see Self-Check
- **Committed in:** n/a (docs only)

**Total deviations:** 0 auto-fixed. Inherited typecheck/vitest red is worktree-deps, not this plan's source.
**Impact on plan:** No scope creep. OPS-07 holds.

## Issues Encountered

Worktree unit/typecheck gates cannot run without `node_modules`. Same as prior Phase 6 executors. File proofs cover the plan's 401 / empty [] / no POST / no Traveller / no upsert criteria.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Phase 8 can add assign/refund/confirm on booking rows; do not add writes to these GET routes.
- 06-02 could mark `customers` restCollection read-only so a future screen cannot POST by calling `upsert` — not done here.

## Self-Check: PASSED

- `[ -f ]` key-files.created: all present
- `git log --oneline --all --grep="06-07"`: `65857b3 feat(06-07): read-only customers JSON and OpsCustomers mock`
- Acceptance: no POST handler; OpsCustomers does not call upsert/remove; GET unauthenticated is JSON 401; no Traveller seed
- Plan verification: GET-only routes; mock cannot write customers; tsc inherited-red (no node_modules)

---
*Phase: 06-ops-reference-data-content-console*
*Completed: 2026-09-01*
