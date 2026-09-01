---
phase: 06-ops-reference-data-content-console
plan: 03
subsystem: auth
tags: [ops, dashboard-host, dc-login, invite, middleware]

requires:
  - phase: 06-01
    provides: React ops twin deleted; dashboardHostMiddleware already serves DC
provides:
  - dashboard.vamostaxi.site logged-out / 308s to /login (DC ops-login)
  - logged-in / is DC ops.dc.html; no /ops in the address bar
  - opsInviteRedirectUrl() pinned to dashboard host /login
affects: [06-04, 06-09]

tech-stack:
  added: []
  patterns:
    - Named dashboard host serves DC via serveOpsDc, never Next rewrite to /[locale]/ops
    - Staff invite redirectTo is compile-time origin + /login, never request input

key-files:
  created:
    - apps/web/tests/integration/ops-dashboard-host.spec.ts
    - apps/web/tests/unit/ops-dashboard-host.test.ts
    - apps/web/lib/ops/invite.test.ts
  modified:
    - app/ops/ops-login.dc.html
    - apps/web/lib/ops/invite.ts

key-decisions:
  - "Invite landing is DC /login (AuthForm password + magic); no React accept-invite page while MFA is paused"
  - "D-08 Custom Access Token Hook enablement on hosted yaumjzvylngfjhtuffqs is an owner gate — function exists, GoTrue toggle not confirmed"
  - "Playwright next-dev is too heavy for this worktree; host proof is source + DC HTML (vitest unit + Playwright file spec)"

patterns-established:
  - "Pattern: opsInviteRedirectUrl() never reads Host/Origin/body.redirectTo"
  - "Pattern: DC password eye is [data-af-eye] overlay on [data-af-pw], not a React Input"

requirements-completed: [OPS-10]

duration: 8 min
completed: 2026-09-01
---

# Phase 6 Plan 03: DC dashboard host /login Summary

**Named host `dashboard.vamostaxi.site` stays DC-only (`/login` = ops-login, `/` = ops.dc.html); staff invite `redirectTo` is pinned to that host’s `/login`.**

## Performance

- **Duration:** 8 min
- **Started:** 2026-09-01T16:02:54Z
- **Completed:** 2026-09-01T16:10:39Z
- **Tasks:** 2/2
- **Files modified:** 6

## Accomplishments

- Confirmed DC login: heading Dispatch sign in, `POST /api/auth`, `[data-af-eye]` overlay, leak script in static head, no `koss@vamostaxi.site`
- Host spec: `/ops` 308, `/sign-in` on the dashboard host 308s to `/login`, `serveOpsDc` only — no Next ops rewrite, no Coming soon / OpsSignInForm
- `opsInviteRedirectUrl()` → `https://dashboard.vamostaxi.site/login` (staging + production) and `http://127.0.0.1:3000/login` (local); invite route still calls the helper

## Task Commits

1. **Task 1: Prove DC login and kill leftover /ops accept-invite** - `e58db10` (feat)
2. **Task 2: Pin invite redirectTo to dashboard /login** - `68a2371` (feat)

**Plan metadata:** (this commit)

## Files Created/Modified

- `app/ops/ops-login.dc.html` - `data-screen-label` is Dispatch sign in (AuthForm already owns the h1)
- `apps/web/tests/integration/ops-dashboard-host.spec.ts` - Playwright file proof (no next spawn)
- `apps/web/tests/unit/ops-dashboard-host.test.ts` - vitest copy of the same host contract
- `apps/web/lib/ops/invite.ts` - path `/login` instead of `/ops/accept-invite`
- `apps/web/lib/ops/invite.test.ts` - staging / production / local; no `/ops` substring
- `apps/web/middleware.ts` - unchanged (already DC-only)

## Verification

1. `vitest run lib/ops/invite.test.ts tests/unit/ops-dashboard-host.test.ts` — 6 passed
2. AuthForm still has `data-af-eye` and `fetch('/api/auth'`
3. middleware still `serveOpsDc`, no `NextResponse.rewrite`
4. no `koss@vamostaxi.site` in `app/ops`

## Decisions Made

- Do not add TOTP enrolment or a React accept-invite screen (D-37)
- Do not churn middleware; dashboardHostMiddleware already matched
- D-08: recorded as owner gate (see Issues) — did not invent enablement

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

**D-08 owner gate (does not block the rest of 06-03):** `public.custom_access_token_hook` exists on hosted `yaumjzvylngfjhtuffqs`. Local `packages/db/supabase/config.toml` has `[auth.hook.custom_access_token] enabled = true`. SQL has no `auth.hooks` table; MCP listed zero Edge Functions. That does **not** prove GoTrue Authentication → Hooks is enabled on the hosted project. Owner must confirm the dashboard toggle before Wave 3 RLS-gated screens. pgTAP is not that proof.

**D-09:** `createSupabaseMiddlewareClient` uses `NextResponse.next({ request })`. `serveOpsDc` still builds an HTML `NextResponse(body)` and copies cookies onto it so `<base href>` / `vamosOpsAuth` can be injected. Not changed.

**Local `/ops` leftover:** `opsStaffGate` on loopback still mentions `/ops/sign-in` and `aal2`. Named host `dashboard.vamostaxi.site` does not use that path.

## User Setup Required

None - no external service configuration required this plan. D-08 hook toggle is an owner gate, not a USER-SETUP file.

## Next Phase Readiness

Ready for 06-04. MFA remains paused. Password eye remains a DC overlay. Wave 3 screens that trust `app_metadata.vamos_role` in a minted JWT wait on the D-08 owner confirm.

## Self-Check: PASSED

---
*Phase: 06-ops-reference-data-content-console*
*Completed: 2026-09-01*
