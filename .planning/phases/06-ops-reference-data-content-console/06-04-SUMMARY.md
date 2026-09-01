---
phase: 06-ops-reference-data-content-console
plan: 04
subsystem: ops
tags: [mfa, totp, staff-auth, dashboard-host]
requires:
  - phase: 06-ops-reference-data-content-console
    provides: "06-03 ops shell / dashboard host gate"
provides:
  - "Staff sign-in + MFA challenge screens (option-a)"
  - "ops-fixtures + role/aal gate specs"
key-files:
  - apps/web/app/[locale]/(ops)/ops/sign-in/page.tsx
  - apps/web/app/[locale]/(ops)/ops/mfa-challenge/page.tsx
  - apps/web/components/ops/OpsAuthCard.tsx
  - apps/web/components/ops/OpsSignInForm.tsx
  - apps/web/components/ops/OpsMfaChallengeForm.tsx
  - apps/web/lib/auth/staff-ops.ts
  - apps/web/tests/support/ops-fixtures.ts
  - apps/web/tests/integration/ops-role-gate.spec.ts
  - apps/web/tests/integration/ops-aal-gate.spec.ts
key-decisions:
  - "Task 1: option-a (two pages, single TOTP field, no factor list, no recovery)"
  - "No browser Supabase client (06-02 / D-04 allowlist). Sign-in and MFA run as Server Actions in lib/auth/staff-ops.ts"
  - "Task 4 hosted JWT proof still open — Wave 4 must not start until it lands"
patterns-established:
  - "OpsAuthCard charcoal full-bleed + centred Card; forms never render OpsShell"
  - "createStaffFixture({ role, enrolTotp }) / totpCode / resetStaffFixtures — loopback-only"
  - "One generic credential-failure Alert; one generic MFA-failure Alert"
requirements-completed: [AUTH-05, OPS-10]
---

# Plan 06-04 Summary — Staff sign-in and MFA

**Task 1 decision:** option-a.

## Task 2 — screens

- `/ops/sign-in` and `/ops/mfa-challenge` on `dashboard.vamostaxi.site` (middleware exempt).
- Shared `OpsAuthCard` (charcoal ground, reversed logo, Card, site back-link).
- `OpsSignInForm` → `staffSignInAction` → `router.replace("/ops")`. Middleware is the only aal branch.
- `OpsMfaChallengeForm` lists the single verified factor, challenges, verifies. No factor → `/ops/accept-invite`. `next` accepted only if it `startsWith("/")` and is not protocol-relative.
- After verify, `public.staff_claim_invite()` via `asStaff` is non-fatal.
- New ops keys: `email`, `credential-failed`, `mfa-failed`, `internal-tool-note`.

**Deviation:** plan named `createSupabaseBrowserClient()`. 06-02 forbids `NEXT_PUBLIC_*` / browser client. Actions live in `apps/web/lib/auth/staff-ops.ts` so `lib/ops` stays totp-string-free.

## Task 3 — fixtures and gates

- `tests/support/ops-fixtures.ts` throws unless Auth/DB URLs are 127.0.0.1 or localhost.
- `ops-role-gate.spec.ts`: one `test.fixme` naming 06-07. Other assertions live.
- `ops-aal-gate.spec.ts`: aal1 → mfa-challenge; exempt routes no loop; verify then vehicles.
- Playwright `@ops-role-gate` / `@ops-aal-gate` component-1440: **6 skipped** (local Auth down / keys unset). Skip-not-fail as specified.

## Task 4 — hosted hook (OPEN)

Not run. Need a redacted hosted JWT with `aal: "aal2"` and `app_metadata.vamos_role`. Do not start Wave 4 until that paste.

## Self-check

- i18n:check passed (1690 keys)
- OpsAuthCard.css stylelint clean; yellow-tint grep 0; `tone="accent"` 0
- `one-time-code` 1; `startsWith("/")` 1 in MFA form
- `totp|hmac|sha1` 0 under `components/ops` and `lib/ops`
- typecheck: 06-04 files clean; inherited red on auth-signout / home-content / ops-claims extra / contact visual
