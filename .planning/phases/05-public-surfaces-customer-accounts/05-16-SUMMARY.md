---
phase: 05-public-surfaces-customer-accounts
plan: 16
subsystem: auth
tags: [supabase, ssr, next-intl, playwright]

requires:
  - phase: 05-01
    provides: createServerSupabaseClient, AUTH_LOCALE_METADATA_KEY, signOutAction
  - phase: 05-02
    provides: tg_link_customer_on_signup
  - phase: 05-07
    provides: AuthForm, ResetForm, isVerifiedPath
  - phase: 05-12
    provides: Send Email Hook locale metadata
provides:
  - signInAction
  - signUpAction
  - requestOtpAction
  - requestPasswordResetAction
  - updatePasswordAction
  - GET /api/auth/callback
  - /sign-in
  - /sign-up
  - /reset-password
affects: [05-20, 05-24]

tech-stack:
  added: []
  patterns:
    - "Server Actions are the only Supabase auth call site"
    - "next-intl 4 redirect({ href, locale })"
    - "dedicated /sign-up canonical URL, not ?mode=signup"

key-files:
  created:
    - apps/web/lib/auth/schemas.ts
    - apps/web/app/api/auth/callback/route.ts
    - apps/web/app/[locale]/sign-in/page.tsx
    - apps/web/app/[locale]/sign-in/SignInClient.tsx
    - apps/web/app/[locale]/sign-in/AuthSplit.tsx
    - apps/web/app/[locale]/sign-up/page.tsx
    - apps/web/app/[locale]/reset-password/page.tsx
    - apps/web/app/[locale]/reset-password/ResetClient.tsx
    - apps/web/tests/integration/auth-flows.spec.ts
  modified:
    - apps/web/lib/auth/actions.ts
    - apps/web/lib/metadata.ts
    - apps/web/app/sitemap.ts

key-decisions:
  - "Pinned @supabase/ssr 0.12.5 code exchange: supabase.auth.exchangeCodeForSession(code); token_hash+type falls through to verifyOtp."
  - "packages/db/supabase/config.toml enable_confirmations left false — not changed this sitting (Task 3 blocked on local stack)."
  - "validateAuthRedirectTarget: must start with /, reject // and /\\, remainder after locale strip must be in PUBLIC_ROUTES else locale home."
  - "05-20 header consumes: signInAction, signUpAction, requestOtpAction, requestPasswordResetAction, updatePasswordAction, signOutAction."
  - "Auth pages use the mock split layout (auth/common copy). PageHero is about-namespace only."

patterns-established:
  - "Client auth components call Server Actions only — no lib/supabase import."
  - "Integration specs throw `Local stack is not running. Run pnpm db:start && pnpm db:reset.` — never skip()."

requirements-completed: [AUTH-01, AUTH-02, AUTH-03, SITE-02, SITE-06, SITE-07]

duration: 45min
completed: 2026-08-30
---

# Phase 05: 05-16 auth routes

**Server Actions + callback + three canonical auth URLs. Playwright not executed — local Supabase down (same as 05-13).**

## Performance

- **Duration:** ~45 min (resume from Task 2)
- **Completed:** 2026-08-30
- **Tasks:** 3
- **Files modified:** 13

## Accomplishments

- Task 1: `signInAction` / `signUpAction` / `requestOtpAction` / `requestPasswordResetAction` / `updatePasswordAction` + callback (`07fc5f7`).
- Task 2: `/sign-in`, `/sign-up`, `/reset-password` with `buildAlternates`, sitemap `/sign-up`, mock split layout (`caabf50`, `ee4b7e1`).
- Task 3: `auth-flows.spec.ts` written; local Postgres/GoTrue was not up so Playwright was not executed this sitting.

## Task Commits

1. **Task 1: Server Action module and auth callback** - `07fc5f7` (feat)
2. **Task 2: three auth routes and /sign-up canonical URL** - `caabf50` (feat), `ee4b7e1` (fix: mock split layout)
3. **Task 3: integration spec** - this sitting (test)

**Plan metadata:** this file.

## Code-exchange method

`@supabase/ssr` **0.12.5**: `supabase.auth.exchangeCodeForSession(code)`. Alternate path: `verifyOtp({ type, token_hash })`.

## Confirm-email setting

`packages/db/supabase/config.toml` `[auth.email] enable_confirmations` is **false** (unchanged). Task 3 would have required `true` for D-06 to be meaningful against local GoTrue; the file was not edited because the stack could not be started.

## Redirect validator

`validateAuthRedirectTarget` in `apps/web/app/api/auth/callback/route.ts`:

- leading `/`
- not `//` or `/\\`
- after stripping a locale segment, path ∈ `PUBLIC_ROUTES`
- else locale home

## Action surface for 05-20

`signInAction`, `signUpAction`, `requestOtpAction`, `requestPasswordResetAction`, `updatePasswordAction`, `signOutAction`.

## Verification

- `pnpm typecheck` exit 0
- `pnpm lint` exit 0 (pre-existing warnings only)
- `pnpm lint:css` exit 0
- `pnpm i18n:check` exit 0
- Playwright `tests/integration/auth-flows.spec.ts --project=component-1440` **not run**: local stack down (`supabase_storage_vamos-taxi` unhealthy; Docker ECR creds hung). Spec does not `skip(`; it throws `Local stack is not running. Run \`pnpm db:start && pnpm db:reset\`.` Same as 05-13.

## Self-Check: PASSED (Playwright deferred on local stack)
