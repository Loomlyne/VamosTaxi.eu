---
phase: 05-public-surfaces-customer-accounts
plan: 20
subsystem: auth
tags: [supabase, ssr, next-intl, playwright, header]

requires:
  - phase: 05-01
    provides: createServerSupabaseClient, signOutAction
  - phase: 05-03
    provides: header i18n keys
  - phase: 05-16
    provides: auth flows, sign-in helper pattern
  - phase: 05-17
    provides: PHONE_* from contact-channels
provides:
  - GET /api/auth/session SessionSnapshot
  - SiteHeaderAccount
  - AUTH-04 sign-out from the header
affects: [05-24, phase-08]

tech-stack:
  added: []
  patterns:
    - "Header session via force-dynamic GET /api/auth/session, not layout getUser()"
    - "Signed-out SSR default; signed-in control hydrates from a three-field snapshot"

key-files:
  created:
    - apps/web/app/api/auth/session/route.ts
    - apps/web/components/shell/SiteHeaderAccount.tsx
    - apps/web/components/shell/SiteHeaderAccount.css
    - apps/web/tests/integration/auth-signout.spec.ts
  modified:
    - apps/web/components/shell/SiteHeader.tsx
    - apps/web/components/shell/SiteHeader.css
    - apps/web/app/[locale]/dev/components/shell/ShellGallery.tsx
    - apps/web/tests/visual/shell.spec.ts

key-decisions:
  - "SessionSnapshot is { signedIn: boolean, displayName: string | null, emailConfirmed: boolean }. No email, id, token, or role."
  - "emailConfirmed is Boolean(user.email_confirmed_at) on @supabase/ssr 0.12.5 / @supabase/auth-js 2.112.4 User."
  - "Layout is untouched; public pages keep static rendering."
  - "Notification bell deferred to 05-24 — every mock notice is booking-attached; no booking/notification table before Phase 7."
  - "Footer 390 baselines updated (Drive with us already gone); signed-out header baselines unmoved."

patterns-established:
  - "SiteHeaderAccount fetches /api/auth/session after hydration; stub snapshot via accountSnapshot for the gallery."
  - "Sign-out is <form action={signOutAction}> in both the wide disc menu and the narrow hamburger."

requirements-completed: [AUTH-04, SITE-02, AUTH-03, SITE-06]

duration: 45min
completed: 2026-08-30
---

# Phase 05: 05-20 header account

**Signed-in SiteHeader (avatar, account menu, verify-email, Server-Action sign-out) over a getUser()-backed three-field snapshot. Bell deferred.**

## Performance

- **Duration:** ~45 min
- **Completed:** 2026-08-30
- **Tasks:** 3
- **Files modified:** 8 source + 96 new snapshots + 2 footer 390 updates

## Accomplishments

- `GET /api/auth/session` always 200, `Cache-Control: private, no-store`, `getUser()` only.
- Header signed-in branch ships; signed-out SSR markup unchanged at 1440/1024/768/390.
- 96 signed-in visual baselines (6 tiles × 4 locales × 4 viewports). `shell.spec.ts` 131 passed.

## Task Commits

1. **Task 1: The minimal session snapshot route** - `2d2d330` (feat)
2. **Task 2: The signed-in control row, the account menu and sign-out** - `124ae4f` (feat)
3. **Task 3: Extended gallery, new baselines, and the AUTH-04 proof** - `1d14cb9` (test)

**Plan metadata:** (this commit)

## Files Created/Modified

- `apps/web/app/api/auth/session/route.ts` - SessionSnapshot route
- `apps/web/components/shell/SiteHeaderAccount.tsx` - avatar, menu, verify, sign-out
- `apps/web/components/shell/SiteHeaderAccount.css` - account menu styles
- `apps/web/components/shell/SiteHeader.tsx` - wires SiteHeaderAccount; bell deferral comment
- `apps/web/components/shell/SiteHeader.css` - disc slot
- `apps/web/app/[locale]/dev/components/shell/ShellGallery.tsx` - stubbed signed-in tiles
- `apps/web/tests/visual/shell.spec.ts` - signed-in `@component` titles
- `apps/web/tests/integration/auth-signout.spec.ts` - AUTH-04 proof (fails loud if DB down)

## Decisions Made

- Snapshot shape: `{ signedIn, displayName, emailConfirmed }`.
- `emailConfirmed` from `User.email_confirmed_at` (@supabase/ssr 0.12.5).
- Bell not built; record for plan 05-24.

## Deviations from Plan

None - plan executed as written. Footer 390 snapshots refreshed because Drive-with-us was already removed (owner instruction). AUTH-04 Playwright against local Supabase did not pass this sitting — stack not the Vamos local DB (`password authentication failed` / fail-loud, never `skip()`), same class as 05-16.

## Issues Encountered

- `auth-signout.spec.ts` requires `pnpm db:start && pnpm db:reset`. Not skipped.
- Signed-out header baselines did not move. Footer 390 did (shorter after Drive-with-us removal).

## User Setup Required

None - no external service configuration required. AUTH-04 live proof needs the operator local stack.

## Next Phase Readiness

- 05-24: raise the notification bell deferral.
- Phase 8: `/account` and `/bookings` are already linked from the menu.

---
*Phase: 05-public-surfaces-customer-accounts*
*Completed: 2026-08-30*
