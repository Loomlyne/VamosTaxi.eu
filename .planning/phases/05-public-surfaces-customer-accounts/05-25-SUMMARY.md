---
phase: 05-public-surfaces-customer-accounts
plan: 25
subsystem: account-session-guard
status: verification-complete-ship-pending
---

# Plan 05-25 Summary — Account session guard

## Delivered

- Made the server `/api/auth/session` response authoritative for every displayed account identity
  field in the canonical DC account page. A non-signed-in or unavailable session now clears
  `localStorage.vamosAuth` and redirects to `/sign-in`; a valid session replaces mismatched cached
  name, email, and verification state before rendering the editable account surface.
- Made a profile Save response of `{ ok: false, reason: "no-user" }` clear the cache and redirect
  to `/sign-in`, replacing the misleading generic Save error for an expired session.
- Added browser coverage for signed-out snapshot, unavailable snapshot, and post-mount session
  expiry; added a real local Supabase profile-save assertion for persisted user metadata.
- Aligned two stale unit expectations with already-shipped contracts: a missing operational timezone
  defaults to `Europe/Zurich`, and chauffeur labels use the existing `ops.spoken.*` translations.
  The pricing and chauffeur production sources were not changed.
- Kept the existing account API contract, metadata schema, design, providers, pricing, and ops
  surfaces unchanged.

## Adjacent auth verification completed in this repair branch

- Corrected DC locale resolution to call `VamosLocale.lang()` when the runtime exposes a method,
  preserving the selected signup locale in real Supabase metadata.
- Added local-only Supabase Auth confirmation/redirect entries for the fixed Playwright servers;
  no hosted Supabase configuration changed.
- Added a server Supabase credential fallback for local Next test processes while retaining Worker
  environment bindings as the production source.

## Verification

- `pnpm --filter web exec playwright test tests/integration/account-session-guard.spec.ts --project=component-1440 --workers=1` — 4 passed.
- `pnpm --filter web exec playwright test tests/integration/auth-flows.spec.ts --project=component-1440 --workers=1` — 10 passed.
- `pnpm --filter web exec playwright test tests/visual/auth-forms.spec.ts --project=component-1440 --project=component-390 --workers=1` — 37 passed, 3 project-defined skips.
- `pnpm run lint` — pass with 25 existing warnings and no errors.
- `pnpm run typecheck` — pass.
- `pnpm test:unit` — pass: 47 web test files / 596 tests, plus 9 database and 26 email tests.
- `pnpm run build` — pass; expected `ENVIRONMENT_FALLBACK` messages occurred only during static generation.
- `pnpm audit --prod --json` — zero production advisories after the exact `next@15.5.25`,
  `postcss@8.5.26`, and `sharp@0.35.4` resolution update.
- `git diff --check` — pass.

## Password-reset proof

The real local recovery flow proves a successful password update rejects the old password and
allows a fresh sign-in with the replacement password.

## Ship status

Staging deployment is intentionally pending the branch → PR → review/security → CI → merge
workflow. It will deploy only the merged `origin/main` SHA to `vamos-web-staging`; no production
worker, DNS, pricing, or hosted Auth configuration is included in this repair.
