# J1 hand-over: Stripe mode guard (payments review, 2026-10-09)

Branch `pay/j1-mode-guard` (worktree `.claude/worktrees/pay-j1-mode-guard`), cut from `origin/main` `80c173e9`, two commits (`b1a9217a`, `41512621`). Owner signed the job order and the decisions on 2026-10-09 (question form). Owner's word: Worker `vamos` runs Stripe LIVE mode.

## What changed

- `lib/checkout/stripe-mode.ts` (new): reads the mode of secret, restricted and publishable keys (surrounding whitespace ignored). `stripeFromEnv` refuses a value that is not a Stripe key.
- Webhook: an event whose `livemode` differs from the secret key's mode is refused (400, error log `stripe_webhook_mode_mismatch`). A missing webhook secret or an unusable key is a 500 with error log `stripe_webhook_config` (was a 400 that looked like a forged request).
- Staff refund, paid edit, class/trip change, withdraw: the `sk_live_`-only refusal (`stripe-test-only`) is gone, so the owner can refund real money in the app; `rk_live_` no longer slips through (U3). A bound value that is not a Stripe key is refused with `stripe-failed` before anything is written.
- Health probe: `payments` is false when secret and publishable key modes differ or Stripe's account mode differs; the hourly log line is `error` level when any dependency is down.
- Stripe session expiry floor 31 minutes (was 30). Production block TWINT `off` until TWINT shows active on the live account.
- Tests: new `stripe-mode.test.ts` (real signed events through `verifyStripeEvent`), `probe-mode.test.ts`; INT-01 pin and the public-chf grep gate reworked for live mode; replay fixtures carry `livemode`.
- Findings covered: W1-02, 03, 04, 05, 06, 09, 11, 15; W6-08; U3. Not in J1: W1-07, 08, 10 (gitleaks allowlist), 12 to 14, 16 to 20 (later jobs or J10).

## Checks run

`pnpm exec vitest run` in `apps/web`: 460 files passed, 5490 tests passed, 41 skipped. `tsc --noEmit` clean. Fresh review (`2026-10-09-stripe-J1-REVIEW.md`): FIX FIRST on R01 (key whitespace), R02 (replay fixtures lack `livemode`), R05 (no real-verifier test), R03 (probe log level); all fixed in `41512621`. R04 and R06 below.

## Before the controller ships (numbers for the owner, not code)

1. Stripe dashboard, live mode: Developers, Webhooks. The endpoint for `https://vamostaxi.site/api/stripe/webhook` must be a LIVE endpoint, and `STRIPE_WEBHOOK_SECRET` on the Worker must be that endpoint's signing secret. If it is a test endpoint's secret, this change refuses every event it sends (they were being processed against the live database before).
2. After the deploy: Stripe live webhook, Recent deliveries must be 200. Cloudflare Worker logs: no `stripe_webhook_mode_mismatch`, no `stripe_webhook_config`, and the next hourly `health_probe` line shows `payments: true`.
3. Roll back by redeploying the previous Worker version if the probe shows `payments: false` after deploy.

## Open and owed (owner words)

- R06: the staff refund path has never run against a live key. One small real payment of the owner's own, then refund it from the dashboard in the app, before the first real customer refund. Amount: the owner names it.
- R04: Stripe test-mode bookings (the 43 old ones) cannot be refunded or changed through a live key; their Stripe ids do not exist in live mode. The failure is clean (no half-written state). The `stripe-test-only` code and its Ops UI string (`errTestOnly`, four languages) are now dead and go in J10.
- The 4242 card is declined on a live key, so rule 8 (4242 after every checkout deploy) cannot be done; the owner agreed: sandbox proof per job, one real payment at the end.
