---
phase: 31-refunds-in-stripe
plan: 11
subsystem: config / stripe
tags: [config, stripe, wrangler]
requires:
  - "31-01 (STRIPE_ACCOUNT_ID optional var in env.d.ts; stripePaymentUrl regex)"
provides:
  - "env.staging.vars.STRIPE_ACCOUNT_ID = acct_1UIZmAQbJiSLxJfu (apps/web/wrangler.jsonc)"
  - "pin test apps/web/lib/checkout/stripe-account-var.test.ts"
affects: [31-01 / 31-09 (REFUND links carry the live account segment after the next deploy)]
tech-stack:
  added: []
  patterns: [config pin test that parses wrangler.jsonc with full-line comments stripped, account id tied to the publishable key's embedded account segment]
key-files:
  created:
    - apps/web/lib/checkout/stripe-account-var.test.ts
  modified:
    - apps/web/wrangler.jsonc
decisions:
  - "STRIPE_ACCOUNT_ID lives only in env.staging (the live Worker vamos); env.production and the top-level vars stay without it; the sandbox id stays only in .dev.vars.example"
metrics:
  duration: "about 3 min (2026-10-13 13:49Z to 13:52Z)"
  completed: 2026-10-13
  tasks: 2
  files: 2
---

# Phase 31 Plan 11: Live STRIPE_ACCOUNT_ID Summary

The live Worker config (`env.staging`) now carries `STRIPE_ACCOUNT_ID = acct_1UIZmAQbJiSLxJfu`, so the dashboard REFUND links open the live Stripe account after the next deploy; a pin test ties the id to the live publishable key and keeps it out of production and away from the sandbox id.

## Gate answer (Task 1)

- **Answer:** confirmed, `acct_1UIZmAQbJiSLxJfu`.
- **Who and when:** the controller, 2026-10-13 about 16:20 +04, checked against the live publishable key in `apps/web/wrangler.jsonc` (`pk_live_51UIZmAQbJiSLxJfu…`). Recorded in 31-CONTEXT S-11.
- No secret key was read or printed. Only the account segment of the publishable key was compared, inside the test.

## Tasks

| Task | Name | Commits | Files |
| ---- | ---- | ------- | ----- |
| 1 | Controller confirms the live Stripe account id | none (gate answered in 31-CONTEXT S-11) | none |
| 2 | Write the var and pin it | 29a860ca (RED), 890c7625 (GREEN) | stripe-account-var.test.ts, wrangler.jsonc |

## What the pin checks

1. `env.staging.vars.STRIPE_ACCOUNT_ID` is `acct_1UIZmAQbJiSLxJfu` and fits `^acct_[A-Za-z0-9]{8,64}$`.
2. `env.production.vars` and the top-level `vars` have no `STRIPE_ACCOUNT_ID`.
3. The sandbox id `acct_1UIZmqHcNp9GZYjz` is not in the file.
4. `"STRIPE_ACCOUNT_ID"` appears once.
5. The text after `pk_live_51` in the staging publishable key starts with the id minus `acct_1` (`UIZmAQbJiSLxJfu`). The confirmed id meets this rule, so the assertion stays.

## Verification

- RED: `stripe-account-var.test.ts` had 3 failures and 2 passes before the var was added.
- GREEN: `vitest run lib/checkout/stripe-account-var.test.ts lib/dev-gallery.test.ts lib/checkout/stripe-dashboard-url.test.ts lib/ops/stripe-payments.test.ts lib/checkout/stripe-sandbox-only.test.ts`: 5 files, 50 tests passed.
- The other suites that read wrangler.jsonc (`public-chf`, `k76-split-workers`, `leak-gate`, `ops-assets`, `intent-limits`, `settle`): 6 files, 169 tests passed.
- `pnpm check:public-env`: exit 0 (no build output, so the built-bundle scan was skipped).
- Acceptance greps: `"STRIPE_ACCOUNT_ID"` count 1; sandbox id count 0.

## Deviations from Plan

**1. Comment wording in wrangler.jsonc made accurate.** The plan set the comment text "confirmed in the Stripe Dashboard by the controller". S-11 records the check as made against the live publishable key, so the comment says "confirmed by the controller against the live publishable key on 2026-10-13 (31-CONTEXT S-11)". Config only, no change in behaviour. Commit 890c7625.

Apart from that, the plan ran as written.

## Not verified

- No deploy, so the live Worker does not have the var yet. It arrives with the next `pnpm --filter web run deploy -- --env staging`, which needs Koss's Ship.
- No REFUND link was opened in a browser against the live Stripe account.
- Full `test:unit`, `gate:local` and builds were not run (by instruction). The control session runs them.

## Self-Check: PASSED

- FOUND: apps/web/lib/checkout/stripe-account-var.test.ts
- FOUND: apps/web/wrangler.jsonc contains STRIPE_ACCOUNT_ID
- FOUND: 29a860ca
- FOUND: 890c7625
