---
phase: 08-ops-dispatch-live-board-assignment-account-surfaces
plan: 01
subsystem: ui
tags: [ops, middleware, hash-routing, pushState, dc]

requires:
  - phase: 06-ops-console
    provides: DC ops console + serveOpsDc on dashboard host
provides:
  - D-10 path URLs on dashboard.vamostaxi.site
  - serveOpsDc allowlist instead of 307-everything-to-/
  - readPath + history.pushState + popstate in ops.dc.html
  - Root-absolute sidebar and in-console hrefs
affects: [08-02, 08-06, 08-UAT]

tech-stack:
  added: []
  patterns: [path-based DC console, one-shot hash migrate]

key-files:
  created: []
  modified:
    - apps/web/middleware.ts
    - app/ops/ops.dc.html
    - app/ops/OpsSidebar.dc.html
    - app/ops/OpsDash.dc.html
    - app/ops/OpsBoard.dc.html
    - app/ops/OpsCalendarBoard.dc.html
    - app/ops/OpsDetail.dc.html
    - app/ops/OpsCustomers.dc.html
    - app/ops/OpsFleet.dc.html
    - apps/web/lib/ops/ops-live-data.test.ts

key-decisions:
  - "Staff / 308s to /dashboard on named dashboard host and ops-changes"
  - "Unknown in-console paths 404; do not 307 to /"
  - "/pages and /legal are on the allowlist because CONTENT nav already exists"

patterns-established:
  - "Pattern 1: same ops.dc.html document; pushState + popstate; hrefs root-absolute; injected base href=/app/ops/ kept"

requirements-completed: [OPS-01]

duration: 7min
completed: 2026-09-10
---

# Phase 8 Plan 01: Kill hash routing Summary

**Dashboard host serves one ops.dc.html on real paths (`/dashboard`, `/bookings`, `/bookings/{ref}`, …) with pushState — hashes are not product URLs**

## Performance

- **Duration:** 7 min
- **Started:** 2026-09-10T15:55:16Z
- **Completed:** 2026-09-10T16:02:57Z
- **Tasks:** 4/4
- **Files modified:** 10 (OpsCalendarBoard already had zero hashes; no edit)

## Accomplishments

- `serveOpsDc` on the D-10 allowlist; staff `/` and ops-changes `/` **308 to `/dashboard`**; `/login` still `ops-login.dc.html`
- `readPath(location.pathname)` + `history.pushState` + `popstate`; one-shot hash migrate then clear
- Sidebar, dash tiles, board, detail, customers, fleet: path hrefs / pushState; Support is `/support`
- File proofs in `ops-live-data.test.ts`; `emptyBookings` still absent; vitest 9/9

## Allowlist

Exact + single-segment:

`/dashboard`, `/bookings`, `/bookings/new`, `/bookings/*` (reference), `/calendar`, `/customers`, `/customers/*`, `/fleet`, `/fleet/chauffeurs`, `/fleet/chauffeurs/*`, `/support`, `/pricing`, `/profile`, `/settings`, `/coupons`, `/reviews`, `/pages`, `/legal`

`/` **308s to `/dashboard`** (inConsole and ops-changes). `/ops` and `/ops/*` still 308 to `/` or `/login`. Matcher still excludes `api`. Unknown in-console: **404**.

## Hash-href grep counts

Listed Task 3 DC files (`OpsSidebar`, `OpsDash`, `OpsBoard`, `OpsCalendarBoard`, `OpsDetail`, `OpsCustomers`, `OpsFleet`):

| pattern | count |
|---------|-------|
| `href="#` | 0 |
| `href:'#` | 0 |
| `location.hash` | 0 |

`ops.dc.html`: `href="#` 0, `href:'#` 0, `location.hash` **1** (one-shot `migrateHashOnce` read, then `replaceState` clears it). `middleware.ts`: 0 hash Location targets.

## Task Commits

1. **Task 1: serveOpsDc on D-10 paths; stop 307-to-/** - `85c4746` (feat)
2. **Task 2: readPath + pushState in ops.dc.html** - `b228e3e` (feat)
3. **Task 3: Sidebar and in-console hrefs become paths** - `482072b` (feat)
4. **Task 4: File proofs — no hashes, no emptyBookings regression** - `3d65dcf` (test)

**Plan metadata:** (this commit)

## Files Created/Modified

- `apps/web/middleware.ts` - D-10 allowlist; 308 `/` → `/dashboard`; stop 307-everything-to-/
- `app/ops/ops.dc.html` - `readPath` + pushState + popstate; hash migrate
- `app/ops/OpsSidebar.dc.html` - root-absolute hrefs; `goPath`
- `app/ops/OpsDash.dc.html` - tile/button hrefs are paths
- `app/ops/OpsBoard.dc.html` - open row at `/bookings/{ref}`
- `app/ops/OpsDetail.dc.html` - back to `/bookings`
- `app/ops/OpsCustomers.dc.html` - trip open at `/bookings/{ref}`
- `app/ops/OpsFleet.dc.html` - tabs `/fleet` and `/fleet/chauffeurs`
- `apps/web/lib/ops/ops-live-data.test.ts` - path-routing file proofs; `emptyBookings` kept

## Decisions Made

- `/` 308s to `/dashboard` rather than serving the console at `/`
- Unknown console paths 404 (not 307 to `/`)
- `/pages` and `/legal` added to the allowlist so existing Content nav survives refresh

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] CONTENT paths on the allowlist**
- **Found during:** Task 1 / Task 3
- **Issue:** Plan D-10 table omits `/pages` and `/legal`; sidebar CONTENT still navigates there
- **Fix:** Include `/pages` and `/legal` in `OPS_CONSOLE_EXACT` and `readPath`
- **Files modified:** `apps/web/middleware.ts`, `app/ops/ops.dc.html`, `app/ops/OpsSidebar.dc.html`
- **Verification:** allowlist contains both; sidebar `href:'/pages'` and `href:'/legal'`
- **Committed in:** `85c4746` / `b228e3e` / `482072b`

---

**Total deviations:** 1 auto-fixed (missing critical)
**Impact on plan:** Needed so Content refresh is not a 404. No React `/ops`, no restyle, no npm install.

## Issues Encountered

None

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Ready for 08-02. Deploy is not this plan. Owner pixel pass is 08-UAT.

## Self-Check: PASSED

- Vitest `lib/ops/ops-live-data.test.ts`: 9 passed (9)
- Grep listed DC files: zero hash hrefs / `location.hash`
- `middleware.ts` serves allowlisted paths; `/` 308s to `/dashboard`
- `--vt-shadow-accent:none` kept; `emptyBookings` assertion still present

---
*Phase: 08-ops-dispatch-live-board-assignment-account-surfaces*
*Completed: 2026-09-10*
