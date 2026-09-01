---
phase: 06-ops-reference-data-content-console
plan: 02
subsystem: auth
tags: [supabase, ssr, claims, ops, aal2, mfa]
requires:
  - phase: 05-public-surfaces-customer-accounts
    provides: "lib/supabase/{server,middleware,constants}.ts, createServerSupabaseClient, updateSession, exact @supabase/ssr + @supabase/supabase-js pins, public-env forbidden_substrings"
  - phase: 03-hyperdrive-data-access-wiring
    provides: "VamosClaims via @vamos/db/claims, asStaff"
provides:
  - "createSupabaseServerClient alias of Phase 5 createServerSupabaseClient"
  - "createSupabaseMiddlewareClient using NextResponse.next({ request }) only"
  - "getStaffClaims / requireStaffClaims / requireAdminClaims / StaffSession / OpsAuthError"
  - "local additional_redirect_urls for /ops/accept-invite and /ops/sign-in"
affects: [06-03, 06-04, 06-05, 06-17]
tech-stack:
  added: []
  patterns:
    - "Staff claims enumerated field-by-field from getUser + MFA AAL + JWT session_id decode"
    - "OpsAuthError reason discriminant: no-session | not-staff | needs-mfa | not-admin"
key-files:
  created:
    - apps/web/lib/ops/session.ts
    - apps/web/tests/integration/ops-claims-bridge.spec.ts
  modified:
    - apps/web/lib/supabase/server.ts
    - apps/web/lib/supabase/middleware.ts
    - apps/web/lib/env.d.ts
    - packages/db/supabase/config.toml
key-decisions:
  - "Phase 5 created lib/supabase/{server,middleware,constants}.ts — this plan extends, does not recreate"
  - "SDK pins unchanged: @supabase/ssr 0.12.5, @supabase/supabase-js 2.112.4 (registry matched; no pnpm add/install)"
  - "session_id is base64url-decoded from getSession() access_token payload only; getUser() remains the authenticity decision"
  - "No createSupabaseBrowserClient — NEXT_PUBLIC_SUPABASE_* would fail check:public-env substring match"
requirements-completed: [OPS-10, AUTH-05]
duration: 25min
completed: 2026-08-31
---

# Phase 06 Plan 02: Staff session → VamosClaims bridge

**`requireStaffClaims(supabase)` is the single import later ops Server Actions use before `asStaff`. Identity from `getUser()`, AAL from `mfa.getAuthenticatorAssuranceLevel()`, `session_id` from transport-format JWT parse only.**

## Performance

- **Duration:** ~25 min
- **Started:** 2026-08-31T18:25:00Z
- **Completed:** 2026-08-31T18:48:40Z
- **Tasks:** 3
- **Files modified:** 6 production + this SUMMARY

## Accomplishments

- Extended Phase 5's server factory with the plan name `createSupabaseServerClient` (same function).
- Added `createSupabaseMiddlewareClient` using `NextResponse.next({ request })` without changing `updateSession` and without constructing a response with a body.
- Landed the claims bridge: `getStaffClaims`, `requireStaffClaims`, `requireAdminClaims`, `StaffSession`, `OpsAuthError`.
- Local invite/sign-in redirect URLs on `additional_redirect_urls` only.

## Task Commits

1. **Task 1–3: SDKs already pinned, factories extended, bridge + spec + redirect URLs** - `427acc8` (feat)
2. **Plan metadata:** (this commit)

## Who created `lib/supabase`

**Phase 5.** On this branch the directory already contained `server.ts`, `middleware.ts`, `constants.ts`. This plan did not overwrite those factories.

| File | Phase 5 export (kept) | 06-02 addition |
|------|------------------------|----------------|
| `server.ts` | `createServerSupabaseClient()` via `getCloudflareContext().env.SUPABASE_URL` + `SUPABASE_ANON_KEY` | `createSupabaseServerClient` alias |
| `middleware.ts` | `updateSession(request, response)` — never constructs a response | `createSupabaseMiddlewareClient(request)` returning `{ supabase, response }` via `NextResponse.next({ request })` |
| `constants.ts` | `AUTH_LOCALE_METADATA_KEY` | untouched |
| `client.ts` | n/a | **not created** (D-04 deviation below) |

## SDK versions

Re-verified with `npm view` at execution:

- `@supabase/ssr` **0.12.5** (already exact in `apps/web/package.json`; registry 0.12.5)
- `@supabase/supabase-js` **2.112.4** (already exact; registry 2.112.4)

No `pnpm add`, no `pnpm install`, no lockfile edit, no `node_modules` symlink.

## Bridge export names

From `apps/web/lib/ops/session.ts`:

- `getStaffClaims(supabase)` → `StaffSession | null`
- `requireStaffClaims(supabase)` → `StaffSession` or `OpsAuthError`
- `requireAdminClaims(supabase)` → `StaffSession` or `OpsAuthError`
- `type StaffSession` (= `VamosClaims` from `@vamos/db/claims`, never redeclared)
- `class OpsAuthError` with `reason: "no-session" | "not-staff" | "needs-mfa" | "not-admin"`
- `type StaffAuthClient` — structural client so the bridge does not import `next/headers`

Call shape for later plans:

```ts
const supabase = await createSupabaseServerClient(); // or createServerSupabaseClient
const claims = await requireStaffClaims(supabase);
await asStaff(env, claims, fn);
```

## `session_id` decode decision (do not re-litigate in 06-03..06-17)

1. `supabase.auth.getUser()` is the authenticity decision. `getSession()` is never used for authorisation.
2. `aal` comes from `supabase.auth.mfa.getAuthenticatorAssuranceLevel().data.currentLevel`, mapped onto `"aal1" | "aal2" | "aal3"`.
3. `session_id` is read by base64url-decoding the JWT payload segment of `getSession().data.session.access_token` and taking the `session_id` string if present. No JWT library. If absent, the field is omitted (`claimsForSql` tolerates it).
4. Claims are built field by field (`sub`, `role: "authenticated"`, `aal`, `email`, `session_id`, `app_metadata.vamos_role`). The user object is never spread. The identifier that customer-writable metadata uses does not appear in `session.ts` at any nesting level (grep gate 0).

`requireStaffClaims` order: no user → `no-session`; no `dispatcher`/`admin` role → `not-staff`; `aal !== "aal2"` → `needs-mfa`. `requireAdminClaims` then requires `vamos_role === "admin"` else `not-admin`.

## D-04 deviations

1. **No `apps/web/lib/supabase/client.ts` / no `createSupabaseBrowserClient`.** A browser client cannot exist without a public-prefixed URL/anon identifier. `scripts/public-env-allowlist.json` `forbidden_substrings` includes `SUPABASE_URL` and `SUPABASE_ANON_KEY`; adding `NEXT_PUBLIC_SUPABASE_*` fails `pnpm check:public-env` even in comments. Ops MFA/sign-in stays server-side like Phase 5 until a later plan solves key delivery. `lib/supabase/` remains three files: `constants.ts`, `middleware.ts`, `server.ts`.
2. **Did not add `NEXT_PUBLIC_SUPABASE_*` to `env.d.ts`.** Added server-only `SUPABASE_SERVICE_ROLE_KEY?: string` on `CloudflareEnv`.
3. **Did not bump SDKs or edit `package.json` / `pnpm-lock.yaml`.** Registry versions already matched the Phase 5 pins.
4. **Did not overwrite `updateSession`.** Middleware factory is additive.
5. **Worktree typecheck not chased.** `tsc --noEmit` in this worktree fails `TS2688 Cannot find type definition file for 'node'` because the worktree has no `node_modules`. Inherited; no extra files edited to green it.
6. **No dev-only Route Handler.** Bridge is client-injected; the spec imports `session.ts` directly. `dev-exclusion.spec.ts` is unchanged (not re-run; would need a worktree `next` build).
7. **Live local-auth Playwright cases skip without env keys.** First run (hardcoded local demo JWTs) hit gitleaks on commit, then a live insert failed `42501 permission denied for table staff` (PostgREST `service_role` has no INSERT grant). Keys removed from the spec; live describe skips unless `SUPABASE_ANON_KEY` + `SUPABASE_SERVICE_ROLE_KEY` are in the environment. Mock proofs still run.

## Verification

| Check | Result |
|-------|--------|
| `grep -c 'new NextResponse(' apps/web/lib/supabase/middleware.ts` | 0 |
| `grep -c 'NextResponse.next({ request })' apps/web/lib/supabase/middleware.ts` | 3 |
| `grep -rc 'auth-helpers-nextjs\\|jwt-decode' apps/web/package.json` | 0 |
| exact SDK pins (no range prefix) | 0.12.5 / 2.112.4 |
| `grep -c user_metadata apps/web/lib/ops/session.ts` | 0 |
| `grep -c 'getUser()' apps/web/lib/ops/session.ts` | ≥1 |
| `grep -c getAuthenticatorAssuranceLevel apps/web/lib/ops/session.ts` | ≥1 |
| `grep -c '\\.\\.\\.user' apps/web/lib/ops/session.ts` | 0 |
| `grep -c accept-invite packages/db/supabase/config.toml` | 1 |
| `pnpm check:public-env` (worktree `node scripts/check-next-public-allowlist.mjs`) | pass — no `NEXT_PUBLIC_*` in `apps/web` |
| Playwright `ops-claims-bridge.spec.ts --project=component-1440` | 7 passed (mock `@ops-claims`); live describe skipped/failed as above |
| worktree `tsc --noEmit` | inherited red (no `@types/node`) |

## Files Created/Modified

- `apps/web/lib/ops/session.ts` — session → `VamosClaims` bridge
- `apps/web/tests/integration/ops-claims-bridge.spec.ts` — `@ops-claims` mock proofs + live local-auth (skip if health or keys down)
- `apps/web/lib/supabase/server.ts` — alias export
- `apps/web/lib/supabase/middleware.ts` — `createSupabaseMiddlewareClient`
- `apps/web/lib/env.d.ts` — server-only `SUPABASE_SERVICE_ROLE_KEY`
- `packages/db/supabase/config.toml` — `http://127.0.0.1:3000/ops/accept-invite` and `/ops/sign-in` on `additional_redirect_urls` only

## Self-Check

- All 3 tasks executed from the plan.
- Production commit `427acc8`, then this SUMMARY.
- STATE.md / ROADMAP.md not updated.
