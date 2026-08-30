---
phase: 05-public-surfaces-customer-accounts
plan: 01
subsystem: auth
tags: [supabase-ssr, middleware, next-intl, wrangler-images]

requires:
  - phase: 01
    provides: next-intl middleware, 308 /en canonicalisation, staging noindex
  - phase: 03
    provides: CloudflareEnv, wrangler named envs, OpenNext
provides:
  - createServerSupabaseClient
  - updateSession composed onto handleI18nRouting
  - AUTH_LOCALE_METADATA_KEY
  - signOutAction
  - IMAGES binding both envs
affects: [05-07, 05-12, 05-16, 05-20]

tech-stack:
  added: ["@supabase/ssr@0.12.5", "@supabase/supabase-js@2.112.4", "resend@6.24.0", "standardwebhooks@1.0.0"]
  patterns: ["server-only supabase client", "mutate next-intl NextResponse for cookies"]

key-files:
  created:
    - apps/web/lib/supabase/server.ts
    - apps/web/lib/supabase/middleware.ts
    - apps/web/lib/supabase/constants.ts
    - apps/web/lib/auth/actions.ts
    - apps/web/.dev.vars.example
    - apps/web/tests/integration/auth-session.spec.ts
  modified:
    - apps/web/package.json
    - pnpm-lock.yaml
    - apps/web/lib/env.d.ts
    - apps/web/wrangler.jsonc
    - apps/web/middleware.ts

key-decisions:
  - "Pin observed registry versions (ssr 0.12.5, supabase-js 2.112.4, resend 6.24.0); not research table 0.12.4 / 2.112.3 / 6.22.0"
  - "Keep Phase 4 TURNSTILE_SECRET; add TURNSTILE_SITE_KEY / TURNSTILE_SECRET_KEY for Phase 5 forms"
  - "signOut redirect uses createNavigation({ href, locale }) — next-intl 4 does not accept a bare path"

patterns-established:
  - "updateSession never constructs NextResponse; skips 3xx"
  - "No browser supabase client; no NEXT_PUBLIC_SUPABASE identifiers"

requirements-completed: [AUTH-03, AUTH-04]

duration: 45min
completed: 2026-08-28
---

# Phase 05: 05-01 Auth session Summary

**Server-only Supabase session refresh on next-intl's existing response, IMAGES bound, sign-out Server Action landed.**

## Performance

- **Duration:** ~45 min
- **Started:** 2026-08-28T15:27:00Z
- **Completed:** 2026-08-28T15:36:28Z
- **Tasks:** 3
- **Files modified:** 11

## Accomplishments

- Five packages exact-pinned; IMAGES on both wrangler envs (D-13)
- `getUser()` only; no `getSession()` / `createBrowserClient`
- Playwright 4/4 on `auth-session.spec.ts` (component-1440)

## Task Commits

1. **Task 1: Pin packages, secrets, IMAGES** - `4b0f84c` (feat)
2. **Task 2: Server client, middleware refresh, signOut** - `88c7fa1` (feat)
3. **Task 3: Session/routing spec** - `76136e6` (test) + `7570351` (test fix)

## Files Created/Modified

- `apps/web/lib/supabase/server.ts` — `createServerSupabaseClient()`
- `apps/web/lib/supabase/middleware.ts` — `updateSession(request, response)`
- `apps/web/lib/supabase/constants.ts` — `AUTH_LOCALE_METADATA_KEY`
- `apps/web/lib/auth/actions.ts` — `signOutAction`
- `apps/web/middleware.ts` — refresh on non-redirect path
- `apps/web/wrangler.jsonc` — `images.binding = IMAGES` ×2
- `apps/web/lib/env.d.ts` — IMAGES + auth secrets
- `apps/web/.dev.vars.example` — names only
- `apps/web/tests/integration/auth-session.spec.ts` — 308, Set-Cookie, no credential leak

## Decisions Made

- Registry drift: `@supabase/ssr` 0.12.4→0.12.5, `@supabase/supabase-js` 2.112.3→2.112.4, `resend` 6.22.0→6.24.0. No major bump. `zod` already 4.4.3. `standardwebhooks` 1.0.0.
- Local `supabase start` was running (Docker) but Task 3 used placeholders by default; `getUser()` failure must not fail the spec.

## Deviations from Plan

- `scripts/public-env-allowlist.json` `allowed` is already `["NEXT_PUBLIC_TURNSTILE_SITE_KEY"]` — left as-is (plan's `allowed.length===0` check is stale).
- `.dev.vars.example` is matched by `.gitignore` `.dev.vars.*`; committed with `git add -f`.
- `signOutAction` uses `redirect({ href: "/", locale })` after `getLocale()` because next-intl 4's `createNavigation().redirect` requires `{ href, locale }`.
- Spec hits `GET /en` not `GET /en/` — trailing-slash 308 to `/en` is not the locale strip.

**Total deviations:** 4 (stale acceptances / API shape)
**Impact on plan:** No scope creep. AUTH-03/04 still hold.

## Issues Encountered

None blocking.

## User Setup Required

Local `supabase start` prints `SUPABASE_URL` / `SUPABASE_ANON_KEY` into `.dev.vars`. Hosted values stay owner-held until 05-24. No new paid accounts.

## Next Phase Readiness

05-07 / 05-12 / 05-16 / 05-20 can import these files. Wave 1 continues with 05-02.

## Self-Check: PASSED

- `pnpm typecheck` exit 0
- `pnpm lint` exit 0 (pre-existing warnings only)
- `pnpm check:public-env` exit 0
- `pnpm check:db-fences` exit 0
- `pnpm i18n:check` exit 0
- playwright auth-session 4 passed
- `pnpm test:visual` not re-run (this plan renders no UI)

---
*Phase: 05-public-surfaces-customer-accounts*
*Completed: 2026-08-28*
