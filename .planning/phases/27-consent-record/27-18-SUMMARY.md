COMPLETE: D-36 built

# Phase 27 Plan 18: Sign-in link creates no account (D-36) Summary

Gate 27-13 checked first: `PRECONDITION MET`.

## Commits
- 4323ccc3 test(27-18): sign-in link creates no account (D-36) (red)
- 0004855d feat(27-18): the sign-in link creates no account for an unknown address (D-36)
- 8d14036e refactor(27-18): drop the unused signup_consent pending flag
- d2e4dd4e test(27-18): e2e and browser expectations for the sign-in link (D-36)

## What was built
- `app/api/auth/route.ts`, generic magic branch, mode signin: `createUser: false`; unused `safeReturnTo` import removed. Sign-up (`createUser: !dashboard`), checkout branch untouched.
- Orchestrator addition: the same branch now awaits `holdCheckoutFloor({ startedAt })` (the helper the checkout branch uses, imported already, no new mechanism) after `runOtp` for every signin request, so known and unknown addresses take the same minimum time. Sign-up is not held.
- `lib/auth/actions.ts` requestOtpAction signin: `createUser: false`.
- `signup_consent` flag removed from run.ts (both writes), constants.ts, and their tests. Pin in record.test.ts now asserts the flag is gone; the no-recordConsent pin is unchanged.
- e2e check 3b, runbook section for 3b, auth-flows.spec: the magic-link test first creates a confirmed account (spec's own sign-up plus confirm steps), plus a new test that a fresh address sees "Send another link" and has no auth.users row.

## Verification
- `vitest run tests/unit/auth app/api/auth lib/auth`: 21 files, 199 tests passed. After Task 2: `lib/auth tests/unit/auth lib/consent/record.test.ts lib/checkout/phase-26-5-laws.test.ts lib/checkout/provision-account.test.ts`: 22 files, 246 passed.
- New unit tests: shouldCreateUser false with and without returnTo; unknown (otp_disabled) and known bodies byte-equal; `holdCheckoutFloor` called once for the known and once for the unknown address (mocked spy); sign-up still true and not held; dashboard false; actions.ts source pin.
- tsc: 0 errors matching api/auth, lib/auth, constants, auth-flows.spec. Greps for `signup_consent|SIGNUP_CONSENT_METADATA_KEY` (non-test) and `recordConsent|record_consent` under auth: empty. `apps/web/lib/checkout` untouched. `node --check` on the e2e script passes.
- other-device.e2e.mjs: read only. It creates EMAIL's auth user via the admin API (line 92, email_confirm true) before line 160, so the link sign-in there is unaffected; not edited.

## Threat T-27-57
Mitigated by the shared floor: runOtp answers `{ stage: sent }` for every address, and the generic sign-in branch now holds the same minimum time as the checkout branch (`holdCheckoutFloor`), so a missing mail hook for an unknown address does not show in timing.

## Deviations
1. [Rule 1 - conflict with the plan] `tests/unit/auth/staff-link-no-account.test.ts` case "public site keeps creating users" pinned the pre-D-36 behaviour and cannot stay green; the plan said to leave the file unedited. Renamed to "public site sign-in link never creates users either (27 D-36)" and expects false. The dashboard case is unchanged.
2. `requestOtpAction` (server action) does not get the floor; only the route branch was asked for. Nothing in the app currently calls it for sign-in besides the route path; flag if it should be held too.
3. Existing route tests on the signin branch now take about 1.2 s each in real time (harness uses real timers); acceptable, suite still green.

## Not verified
- Worker e2e (check 3b) and the database-backed Playwright spec were not run (no Worker build, port 59322 stack not used); 27-14 runs them.
- The real timing equality of the floor is proven by the spy and the existing floor unit tests, not measured on a Worker.

## Self-Check: PASSED
