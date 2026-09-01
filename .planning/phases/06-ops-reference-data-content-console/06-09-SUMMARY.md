---
phase: 06-ops-reference-data-content-console
plan: 09
subsystem: api
tags: [ops, settings, roster, profile, dispatcher-nav, dc-mock]

requires:
  - phase: 06-ops-reference-data-content-console
    provides: jsonOk / jsonErr / withStaff / withAdmin + GET /api/staff/me + VamosOpsApi
  - phase: 05-auth-identity
    provides: asStaff / staff_update_self / staff_admin_write
provides:
  - GET/PATCH /api/staff/settings dual-mounted; PATCH never writes settings_versions (D-27)
  - GET/PATCH /api/staff/roster; PATCH withAdmin (D-07); dispatcher GET { access: denied, rows: [] }
  - PATCH /api/staff/profile wrapping updateOwnProfile / staff_update_self
  - OpsSidebar D-12: omit #pricing and staff-roster from DOM unless GET /api/staff/me role=admin
  - OpsSettings/OpsProfile wired to absolute /api/staff/*; sign out → /login
affects: [06-10, 06-11]

tech-stack:
  added: []
  patterns:
    - Dual-mount: locale (ops) handler + app/api/staff/* re-export with force-dynamic
    - Settings_versions is trigger-owned; GET displays current row; PATCH updates public.settings only
    - D-12 admin nav is omitted, never aria-disabled

key-files:
  created:
    - apps/web/app/[locale]/(ops)/api/staff/settings/route.ts
    - apps/web/app/[locale]/(ops)/api/staff/roster/route.ts
    - apps/web/app/[locale]/(ops)/api/staff/profile/route.ts
    - apps/web/app/api/staff/settings/route.ts
    - apps/web/app/api/staff/roster/route.ts
    - apps/web/app/api/staff/profile/route.ts
    - apps/web/lib/ops/ops-dc-settings.test.ts
    - apps/web/tests/integration/ops-dc-settings.spec.ts
  modified:
    - app/ops/OpsSettings.dc.html
    - app/ops/OpsProfile.dc.html
    - app/ops/OpsSidebar.dc.html

key-decisions:
  - "GET /api/staff/settings returns DC camelCase fields plus read-only policy numbers; no GmbH/Bleicherstrasse fallbacks"
  - "PATCH settings merges omitted fields with the current singleton so chauffeur_turnaround is not wiped"
  - "Invite stays POST /api/staff/invite; Resend SMTP is named copy, not a mailer"

patterns-established:
  - "Pattern: settings PATCH SQL updates public.settings only; versioning is the DB trigger"
  - "Pattern: dispatcher nav hide = omit from painted arrays, never a disabled item"

requirements-completed: [OPS-09, OPS-10]

duration: 40min
completed: 2026-09-01
---

# Phase 6 Plan 09: Settings / roster / profile JSON + D-12 Summary

**Staff JSON for settings (singleton PATCH, versions read-only), admin-only roster/invite, self profile PATCH, and OpsSidebar that omits #pricing and staff-roster for dispatchers.**

## Performance

- **Duration:** 40 min
- **Started:** 2026-09-01T16:00:00Z
- **Completed:** 2026-09-01T16:36:19Z
- **Tasks:** 2
- **Files modified:** 11

## Accomplishments

- GET/PATCH `/api/staff/settings` — singleton + current `settings_versions` display; PATCH `UPDATE public.settings` only (D-27)
- GET/PATCH `/api/staff/roster` — dispatcher GET `{ access: "denied", rows: [] }`; PATCH `withAdmin` for role/active (D-07)
- PATCH `/api/staff/profile` wraps `updateOwnProfile` / `staff_update_self`; dispatcher edits self only
- Dual-mount re-exports at `app/api/staff/{settings,roster,profile}`
- OpsSettings/OpsProfile/OpsSidebar talk absolute `/api/staff/*`; sign out clears `vamosOpsAuth` and lands `/login`
- D-12: `#pricing` and `staff-roster` live in `NAV_ADMIN` and are omitted from the painted nav unless `GET /api/staff/me` says `role=admin`
- D-24 invite copy names Resend SMTP; no mailer invented. D-28/D-37: no TOTP/QR/reset-MFA. D-35: no GmbH/Bleicherstrasse JS fallbacks

## Task Commits

1. **Task 1: Settings, roster, profile JSON APIs** - `d4ec0ad` (feat)
2. **Task 2: Wire OpsSettings, OpsProfile, OpsSidebar + D-12** - `e02f91f` (feat)

**Plan metadata:** (this commit)

## Files Created/Modified

- `apps/web/app/[locale]/(ops)/api/staff/settings/route.ts` — GET flattened DC fields + policy display; PATCH merge + `public.settings`
- `apps/web/app/[locale]/(ops)/api/staff/roster/route.ts` — GET `loadStaff`; PATCH `withAdmin`
- `apps/web/app/[locale]/(ops)/api/staff/profile/route.ts` — PATCH `updateOwnProfile`
- `apps/web/app/api/staff/settings/route.ts` — re-export GET, PATCH
- `apps/web/app/api/staff/roster/route.ts` — re-export GET, PATCH
- `apps/web/app/api/staff/profile/route.ts` — re-export PATCH
- `app/ops/OpsSettings.dc.html` — settings PATCH, admin invite/roster, `data-af-eye` passwords
- `app/ops/OpsProfile.dc.html` — self PATCH from `/api/staff/me`; no TOTP enrol
- `app/ops/OpsSidebar.dc.html` — D-12 omit + sign out `/login`
- `apps/web/lib/ops/ops-dc-settings.test.ts` — Vitest file proofs
- `apps/web/tests/integration/ops-dc-settings.spec.ts` — 401 / dispatcher 403 / dual-mount / D-12

## Decisions Made

- Flatten GET settings to DC camelCase so `VamosOps.settings.get()` hydrates without GmbH seed fallbacks
- Merge PATCH body onto the current singleton (omitted `chauffeur_turnaround_minutes` keeps the stored value)
- Admin invite UI lives on OpsSettings (sidebar `staff-roster` already hashes `#settings`); dispatcher never sees the pane

## Deviations from Plan

### Auto-fixed Issues

**1. [Vitest] File proofs live under `lib/ops/*.test.ts`**
- **Found during:** Task 2 verification
- **Issue:** Plan listed `ops-dc-settings.spec.ts` (Playwright, excluded from Vitest). User required Vitest main binary.
- **Fix:** Added `apps/web/lib/ops/ops-dc-settings.test.ts` (filesystem-only; does not import `staff-json` because the worktree has no `node_modules`)
- **Files modified:** `apps/web/lib/ops/ops-dc-settings.test.ts`
- **Verification:** vitest 2 files / 19 tests passed
- **Committed in:** `e02f91f`

---

**Total deviations:** 1 auto-fixed (verification path)
**Impact on plan:** No scope creep. Dual-mount + D-12 still match the plan.

## Issues Encountered

- Worktree has no `node_modules`; `tsc --noEmit` is inherited red. Vitest ran from the main `apps/web` binary and passed 19 tests.
- Importing `staff-json` from the new Vitest file failed (`@supabase/ssr` missing in the worktree). Proofs are filesystem-only; 401/403 envelope remains covered by `staff-json.test.ts` + the Playwright spec.

## User Setup Required

**First real (non-@example) invite needs Resend as Supabase Auth custom SMTP (D-24).** Mechanism posts to `/api/staff/invite` either way; no mailer was added.

## Next Phase Readiness

- Settings/roster/profile JSON doors exist for 06-10+
- Dispatcher nav hide is mock-side (OpsSidebar); production `lib/ops/nav.ts` was out of this plan's `files_modified`
- Do not push; orchestrator merges the worktree

---
*Phase: 06-ops-reference-data-content-console*
*Completed: 2026-09-01*
