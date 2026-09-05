---
phase: 07-checkout-payment
plan: 10
subsystem: web
tags: [checkout, stripe, webhook, e2e]

requires:
  - phase: 07-checkout-payment
    provides: webhook route + Queue consumer + confirmation poller
provides:
  - offline PAY-05 (webhook_ordering + webhook-replay)
  - D-27 option B recorded
  - gated scripts/stripe-e2e.mjs (no live charge until owner matrix)
affects: [08, 09, 11]

tech-stack:
  added: []
  patterns:
    - Stripe.webhooks.generateTestHeaderString for fixture signing
    - D-27 B: quote-publish.md, never a sacrificial rate_versions row

key-files:
  created:
    - packages/db/supabase/tests/webhook_ordering.test.sql
    - apps/web/tests/integration/webhook-replay.spec.ts
    - scripts/stripe-fixture-sign.mjs
    - scripts/stripe-e2e.mjs
    - docs/runbooks/stripe-test-mode-e2e.md
  modified:
    - .github/workflows/pr.yml
    - docs/build/OWNER-ANSWERS.md

key-decisions:
  - "D-27 = B. Real owner matrix in test mode. A (synthetic staging rate) and C (defer to Phase 11) rejected."
  - "SDK generateTestHeaderString exists; no hand-rolled signer."
  - "CHECKOUT_UI_MODE remains elements (07-04). Probe file still refuses without owner invocation; not re-probed this sitting."

requirements-completed: [PAY-05]
requirements-stub-only: [PAY-02-live, PAY-03-live, PAY-04-live, PAY-06-live, PAY-07-live]

completed: 2026-09-06T12:00:00Z
---

# Plan 07-10 Summary

Offline PAY-05 plus a gated live script. No invented fare. No PR.

## Task 1 — offline PAY-05

`webhook_ordering.test.sql` — 14 pgTAP, rollback, no CHF figures. Duplicate event, out-of-order superseded, in-order both begin, two PaymentIntents `23505`, second `notification_claim` null.

`webhook-replay.spec.ts` — 4 Playwright, real `verifyStripeEvent`, no `vi.mock` of the verifier. Signed fixture 200; replay 200 ledger unchanged; one altered character 400; out-of-order canceled superseded.

Signer: `Stripe.webhooks.generateTestHeaderString` in `scripts/stripe-fixture-sign.mjs` and the spec.

CI: comments on the visual job name `webhook_ordering` / `webhook-replay`. Database job already runs all pgTAP.

## Task 2 — D-27

**B — owner's real matrix in test mode.**

Rejected: A (staging-only synthetic rate), C (defer live E2E to Phase 11).

Observed:

- Stripe test account exists. Publishable key in wrangler vars (front/staging/ops-changes). Secret on staging Worker. Production still placeholder. Live keys out until Phase 11.
- Adaptive Pricing dashboard toggle: not confirmed.
- TWINT: not available (UAE entity). Cards / Apple Pay / Google Pay / Link on. Charge currency CHF.
- Resend sandbox: not confirmed.
- No live `rate_versions` row.

## Task 3 — gated live pass

`node scripts/stripe-e2e.mjs --dry-run` exits 0, prints option B, waits on the matrix, will not write `rate_versions`. Probe is step 1. `pricing_not_live` is step 2 under every option. `sk_test_` guard. Runbook: `docs/runbooks/stripe-test-mode-e2e.md`.

Live charge (quote → pay → webhook → voucher → one email) **has not run**. It waits on D-46 / `quote-publish.md`.

## Honest remainder for verify-work

Proven without Stripe / without a live price: PAY-05 (duplicate, order, two intents, second email).

Proven only by stubs / not yet live: Adaptive Pricing converting, TWINT in the Element, Resend delivering, confirmation voucher against a real charge (PAY-02/03/04/06/07 live).
