---
phase: 05-public-surfaces-customer-accounts
plan: 26
subsystem: reset-form-state-and-invite-harness
status: verification-complete-ship-pending
---

# Plan 05-26 Summary — Recovery-state retention and invite test harness

## Delivered

- Changed canonical `app/pages/ResetForm.dc.html` so password, confirmation, and validation state
  are cleared only on a genuine stage transition. A same-stage `nonce` refresh from asynchronous
  recovery-session bootstrap now preserves values the customer has entered.
- Regenerated the ignored public DC mirror through `node scripts/sync-dc-mock-to-public.mjs`; the
  canonical source remains the only authored reset page.
- Replaced direct mutation of readonly `process.env.NODE_ENV` in `invite.test.ts` with
  `vi.stubEnv()` and `vi.unstubAllEnvs()`. Production invite URL logic was not modified.

## Verification

- `pnpm --filter web exec vitest run lib/ops/invite.test.ts` — 3 passed.
- `pnpm --filter web exec playwright test tests/integration/auth-flows.spec.ts --project=component-1440 --workers=1 --grep "AUTH-02 reset password from emailed link, expired without a session"` — passed.
- Final complete auth suite, visual suite, lint, typecheck, build, and diff check are recorded in
  `05-25-SUMMARY.md` and passed from this final repair tree.

## Ship status

The repair is ready for the required PR, independent review/security pass, CI, and merged-SHA
staging deployment. No external service, secret, hosted Auth setting, or live DNS setting was
changed during execution.
