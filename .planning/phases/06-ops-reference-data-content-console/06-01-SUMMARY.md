---
phase: 06-ops-reference-data-content-console
plan: 01
subsystem: ui
tags: [ops, react, next, dashboard, playwright, serveOpsDc]

requires:
  - phase: 05-auth-i18n-legal
    provides: staff JWT vamos_role, asStaff, invite + photo Route Handlers
provides:
  - React ops twin deleted — no page.tsx or layout.tsx under apps/web/app/[locale]/(ops)/ops
  - apps/web/components/ops removed
  - 11 staff actions.ts + invite/photo APIs + lib/ops kept for 06-02+ JSON wrappers
affects: [06-02, 06-03, 06-04, dashboard DC mock wiring]

tech-stack:
  added: []
  patterns:
    - Dashboard host stays DC-only via dashboardHostMiddleware → serveOpsDc
    - Staff writes stay in actions.ts / Route Handlers until later waves wrap JSON

key-files:
  created: []
  modified:
    - apps/web/app/[locale]/(ops)/ops (pages and layout deleted; actions.ts kept)
    - apps/web/components/ops (directory removed)
    - apps/web/tests/integration/ops-*.spec.ts (React-page specs deleted; photo-upload trimmed)

key-decisions:
  - "Did not add a replacement page, redirect page, or Coming soon React surface"
  - "Did not edit middleware.ts — no NextResponse.rewrite onto /[locale]/ops; serveOpsDc stays"
  - "Trimmed OpsPhotoField mount/source proofs from ops-photo-upload.spec.ts instead of deleting the API spec"

patterns-established:
  - "D-36: delete the React twin; DC mock on dashboard.vamostaxi.site is the product UI"
  - "Keep actions.ts + /api/staff/invite + /api/photos/upload + lib/ops for later JSON wrapping"

requirements-completed: [OPS-10]

duration: 7min
completed: 2026-09-01
---

# Phase 06 Plan 01: Delete React ops twin Summary

**Removed every Next ops `page.tsx` and `OpsShell` chrome so `dashboard.vamostaxi.site` stays DC-only via `serveOpsDc`; staff `actions.ts`, invite/photo routes, and `lib/ops` remain.**

## Performance

- **Duration:** 7 min
- **Started:** 2026-09-01T15:50:51Z
- **Completed:** 2026-09-01T15:57:45Z
- **Tasks:** 3
- **Files modified:** 87 (4 insertions, 13602 deletions vs plan base)

## Accomplishments

- Zero `page.tsx` / `layout.tsx` under `apps/web/app/[locale]/(ops)/ops`
- Eleven `actions.ts` files still on disk (vehicles, chauffeurs, content, coupons, pricing, pricing/[versionId], pricing/zones, profile, reviews, settings, staff)
- `apps/web/components/ops` gone; no `@/components/ops` importers under `apps/web`
- React-page Playwright specs deleted; `ops-photo-upload.spec.ts` and `ops-claims-bridge.spec.ts` kept
- `dashboardHostMiddleware` still serves `ops.dc.html` / `ops-login.dc.html`; no `NextResponse.rewrite` in `apps/web/middleware.ts`

## Task Commits

1. **Task 1: Delete Next ops pages and the ops layout** - `23bd6c3a7d68f4cad268bb953471a4ce7e86aa6c` (refactor)
2. **Task 2: Delete React ops components** - `7f6bcbaeb49ff3aad20eff7a351078ee924a146b` (refactor)
3. **Task 3: Drop Playwright specs that drove the React pages** - `00d80dc110817a9cbf7fc7b18b22f2b98cf95d09` (test)

**Plan metadata:** (this commit)

## Files Created/Modified

- Deleted 18 `page.tsx` + `ops/layout.tsx` under `[locale]/(ops)/ops`
- Deleted `apps/web/components/ops/**` (55 files: OpsShell, tables, photo field, auth chrome)
- Deleted 12 Playwright specs that `page.goto` Next `/ops/*` routes
- `apps/web/tests/integration/ops-photo-upload.spec.ts` — dropped OpsPhotoField mount/source tests; kept key/MIME/allow-list assertions

Unchanged (kept):

- `apps/web/app/[locale]/(ops)/ops/**/actions.ts` (11)
- `apps/web/app/[locale]/(ops)/api/staff/invite/route.ts`
- `apps/web/app/[locale]/(ops)/api/photos/upload/route.ts`
- `apps/web/lib/ops/**`
- `apps/web/middleware.ts`

## Decisions Made

- No replacement React page or Coming soon. Empty dirs that only held pages went with the deletes.
- Middleware left untouched: already 308s `/ops` to `/` or `/login` and serves DC HTML.
- Photo-upload spec trimmed rather than deleted, per plan keep-API rule.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Trim OpsPhotoField proofs in kept photo-upload spec**

- **Found during:** Task 3 (Drop Playwright specs)
- **Issue:** `ops-photo-upload.spec.ts` (keep) mounted `apps/web/components/ops/OpsPhotoField.tsx` and `readFileSync` that file after Task 2 deleted it
- **Fix:** Removed the empty-state mount test and source-file assertions; left `assertPhotoUpload` / `buildPhotoKey` / `photoUrl` tests
- **Files modified:** `apps/web/tests/integration/ops-photo-upload.spec.ts`
- **Verification:** file no longer mentions `components/ops`; still exists on disk
- **Committed in:** `00d80dc` (Task 3)

---

**Total deviations:** 1 auto-fixed (1 missing critical)
**Impact on plan:** Required to keep the API spec without a deleted React module. No React rebuild. No scope creep.

## Issues Encountered

- Worktree has no `apps/web/node_modules`. Did not `pnpm install` and did not `ln -s` node_modules.
- `pnpm --filter web exec tsc --noEmit` cannot run in this worktree without those. Ran `/Users/koss/Developer/VamosTaxi.eu/apps/web/node_modules/.bin/tsc --noEmit --pretty false` with cwd = **main** `apps/web`: exit 0. That checkout still has the React pages (separate tree).
- Worktree scan of local/`@/` imports: no missing refs to deleted `ops/page.tsx` or `@/components/ops`.
- `vitest run lib/ops` (main vitest binary, cwd = this worktree `apps/web`): 76 passed, 1 failed — `lib/ops/chauffeurs.test.ts` expects `ops.language.en`, code has `ops.spoken.en`. Inherited; this plan did not touch `lib/ops`. Not fixed.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Ready for 06-02 (JSON `/api/staff` wrappers around existing `asStaff` / actions).
- Dashboard host remains DC-only. Do not React-port. Do not invent CHF or seed vehicles.
- Owner gates: none for this plan.

## Self-Check: PASSED

- find `page.tsx`/`layout.tsx` under ops: 0
- `actions.ts` count: 11
- invite + photos upload routes exist
- `rg "@/components/ops"`: empty
- `NextResponse.rewrite` absent from middleware; `serveOpsDc` present
- listed React-page specs gone; photo-upload + claims-bridge kept
- no tsc errors referencing deleted ops pages (worktree import scan)

---
*Phase: 06-ops-reference-data-content-console*
*Completed: 2026-09-01*
