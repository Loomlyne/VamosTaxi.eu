COMPLETE: D-03a built (server)

# Phase 27 Plan 15: sign-up needs the tick and records it Summary

Guards checked first: 27-17 "COMPLETE: D-03a built (grant)" and 27-18 "COMPLETE: D-36 built" both present.

## Commits
- e5bdc1ee test(27-15): sign-up needs the tick and records it (red)
- 12ca8d63 feat(27-15): sign-up is refused without the tick and records the agreement
- eaadbbe3 test(27-15): auth e2e expects the tick and the agreement record

## What was built
- `apps/web/lib/auth/signup-agreement.ts`: `signupConsentGiven`, `CONSENT_REQUIRED`, `SIGNUP_UNAVAILABLE`, `recordSignupAgreement` (asSystem, one `record_account_agreement('sign-up', null, email, 'create', ACCOUNT_NOTICE_VERSION, locale, ua<=300, truncated ip)`; failure logs the SQLSTATE only, returns false). Imports only `lib/consent/ip`.
- `schemas.ts`: `consent: z.literal(true)` in both sign-up schemas.
- `app/api/auth/route.ts`: magic sign-up and password sign-up on the public host: 400 consent-required without the tick, then parse, then record (503 signup-unavailable on failure), then Supabase. Dashboard host, sign-in, forgot, verify-code, resend, checkout branch untouched. 27-18's createUser false and `holdCheckoutFloor` kept.
- `lib/auth/actions.ts`: signUpAction and requestOtpAction (signup) record first; on failure return `{ stage: "sent" }` and call nothing. No timing floor (as ordered).
- `lib/db/identity.ts`: doc comment only.

## Commands and results
- `vitest run lib/auth tests/unit/auth app/api/auth lib/consent/record.test.ts lib/checkout/phase-26-5-laws.test.ts lib/db`: 27 files passed, 1 skipped (pre-existing DB-backed file), 273 tests passed.
- `git grep recordConsent|record_consent` in auth (non-test): empty. `recordSignupAgreement(` count: route.ts 2, actions.ts 2. `2026-09-29` in signup-agreement.ts: empty.
- `git diff --numstat HEAD -- apps/web/lib/checkout apps/web/app/api/checkout apps/web/components/checkout`: empty.
- tsc: 0 lines matching lib/auth or api/auth.
- `pnpm check:db-fences`: exit 0, 8 of 8 pass (after the allowlist entries below).
- Task 2: `node --check` ok; `consent: true` on 3 lines; `mode: "signup"` lines without it: 2 (the 1a0 requests); `account_agreement_records` 3 lines; 3b kept; 1a0 in script and runbook.

## Deviations
1. [Rule 3] `scripts/db-access-fence-allowlist.json` (not in the file list): the D-06 fence failed on `signup-agreement.ts` (identity wrapper importer that is neither a route nor force-dynamic), so a named `force_dynamic_exempt` entry was added (library, consumers are the route handler and a server action). The same run showed 27-17's `packages/db/test/local/signup-agreement.test.ts` failing the postgres-import and `sql.unsafe` fences; named entries added to `allowed_postgres_importers` and `allowed_unsafe` (same pattern as consent-reader.test.ts). The allowlist `_comment` texts were not updated.
2. `tests/unit/auth/signin-link-no-account.test.ts` (not in the file list) also posts a magic sign-up; it got `consent: true` and an asSystem mock.
3. The mock `asSystem` was added to signup-consent, dashboard-no-signup, cookies-dropped, signin-link-no-account and checkout-route tests; no assertion weakened.
4. e2e: check 1a now sends `locale: "de"` to prove the stored locale; check 8 also asserts 0 agreement rows for the dashboard address.

## Not verified
- The Worker e2e (run by 27-14, row 17): not built, not run.
- `packages/db/test/local/checkout-account.test.ts` red locally with `password authentication failed for user "vamos_edge"` (role passwords unset): known, not touched, not run here.
- Nothing hosted. Migration 20261002110000 must be on hosted before the Worker deploy (T-27-62).
- The sign-up form (mock page) must send `consent: true`; not in this plan's files, so the page tick wiring is not checked here.

## Self-Check: PASSED
