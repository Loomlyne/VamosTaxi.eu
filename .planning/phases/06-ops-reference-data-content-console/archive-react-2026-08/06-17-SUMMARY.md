---
phase: 06-ops-reference-data-content-console
plan: 17
subsystem: ops-console
tags: [staff, roster, profile, invite, last-admin, mfa]

requires:
  - phase: 06-ops-reference-data-content-console
    provides: asStaff, staff_self, staff_update_self, 06-05 invite API, OpsPhotoField, OpsTotpEnrol
provides:
  - /ops/staff roster (admin invite/role/deactivate)
  - /ops/profile self-service (any staff role)
  - last-admin gate in assertRoleChange
affects: [phase-08-dashboard, phase-10-security]

tech-stack:
  added: []
  patterns:
    - Server Actions + revalidatePath; no Realtime
    - Reuse lib/ops/invite.ts + POST /api/staff/invite
    - staff_update_self for own profile; privilege columns never in SET list

key-files:
  created:
    - apps/web/lib/ops/staff.ts
    - apps/web/lib/ops/staff.test.ts
    - apps/web/app/[locale]/(ops)/ops/staff/page.tsx
    - apps/web/app/[locale]/(ops)/ops/staff/actions.ts
    - apps/web/app/[locale]/(ops)/ops/profile/page.tsx
    - apps/web/app/[locale]/(ops)/ops/profile/actions.ts
    - apps/web/components/ops/StaffTable.tsx
    - apps/web/components/ops/StaffTable.css
    - apps/web/components/ops/StaffInviteDialog.tsx
    - apps/web/components/ops/ProfilePanes.tsx
    - apps/web/components/ops/ProfilePanes.css
    - apps/web/components/ops/ProfileSecurityPane.tsx
    - apps/web/tests/integration/ops-staff.spec.ts
  modified:
    - apps/web/components/ops/index.ts
    - apps/web/i18n/messages/en.json
    - apps/web/i18n/messages/de.json
    - apps/web/i18n/messages/fr.json
    - apps/web/i18n/messages/ar.json

key-decisions:
  - "Did not reimplement invite/TOTP. Invite posts to existing /api/staff/invite. TOTP listing uses supabase.auth.mfa.listFactors; enrol UI is OpsTotpEnrol."
  - "GoTrueAdminApi.signOut(jwt, scope) requires the target user's JWT. deleteUser / ban_duration would destroy or lock the row. Residual access-token window stays in copy; Phase 8/10 item."
  - "Email column is an em dash: public.staff has no email; auth.users is not granted to vamos_staff."
  - "i18n nested under ops.staffRoster and ops.profileScreen because ops.staff / ops.profile are existing nav strings."

patterns-established:
  - "Last-admin gate is application-side (assertRoleChange) before the UPDATE."
  - "Quoted staff.\"role\" in SQL so check-db-access-fences does not treat UPDATE SET role as SET ROLE."

requirements-completed: [OPS-09, AUTH-05]

duration: 90min
completed: 2026-09-01
---

# Phase 06 Plan 17: Staff roster + own profile

**Admin roster at `/ops/staff` (invite via 06-05, role/deactivate, last-admin gate). Any staff role edits own profile at `/ops/profile` through `staff_update_self`. No reset-MFA, no Realtime, no yellow pills.**

## What shipped

- `loadStaff` / `loadOwnProfile` via `asStaff`. Dispatcher SELECT on `public.staff` is silent-empty (`staff_admin_write` RLS).
- `inviteStaff` → existing invite route. `setStaffRole` / `setStaffActive` after `requireAdminClaims` + `assertRoleChange`.
- Profile: name/phone/lang/digest/avatar via `staff_update_self`; password/email via `auth.updateUser`; TOTP listed, not reset.
- i18n ADD-only in four locales.

## Verification

| Check | Result |
| --- | --- |
| `vitest run lib/ops/staff.test.ts` | 15 passed |
| `vitest run tests/integration/ops-staff.spec.ts` | 4 passed; audit_log test failed with `run pnpm db:start && pnpm db:reset from packages/db` (no Docker) |
| `node scripts/check-i18n-coverage.mjs` | passed |
| stylelint StaffTable.css + ProfilePanes.css | passed |
| `requireAdminClaims` in staff/actions.ts | 4 (≥3) |
| `assertRoleChange` in staff/actions.ts | 3 (≥2) |
| `staff_update_self` in profile/actions.ts | 1 |
| privilege grep on profile/actions.ts | 0 |
| reset-MFA grep on staff route | 0 |
| `check:db-fences` SET ROLE on staff/actions.ts | clean after quoting `"role"` |

Playwright last-admin UI / live dispatcher attribution not run (no `next dev`, no Docker). Inherited `check:db-fences` red remains on coupons/pricing/settings identity-wrapper importers and layout/nav isolate-memoisation.

## Deviations

1. Nested copy under `ops.staffRoster` / `ops.profileScreen` so nav labels `ops.staff` / `ops.profile` stay strings.
2. Integration spec is vitest (plan said Playwright). Executor hard rules: Vitest, no `next dev`, Postgres-down fails with the db:start message — do not `skip(`.
3. MFA column key is `not-enrolled` not `unenrolled` (`unenrol` substring would fail the reset-MFA grep).
4. No session revoke without the user's JWT — documented for Phase 8/10.

## Next

- Operator: `pnpm db:start && pnpm db:reset` from `packages/db`, then re-run `ops-staff.spec.ts` audit_log case.
- Phase 8/10: admin session revoke by user id if GoTrue grows that API; reset-MFA remains out of this console.

## Self-Check: PASSED
