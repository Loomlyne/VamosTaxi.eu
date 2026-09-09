# Stripe test-mode E2E

For the person who runs the first real test-mode charge after the owner matrix exists.

Test mode until Phase 11. Never paste a live key. Secrets go through `wrangler secret put`, never the chat, never `wrangler.jsonc` `vars`.

This pass is gated by **D-27 option B** in `docs/build/OWNER-ANSWERS.md` (2026-09-06): the owner's real matrix in test mode. Options A (staging-only synthetic rate) and C (defer the live charge to Phase 11) were rejected.

Until a live `rate_versions` row exists, `scripts/stripe-e2e.mjs` stops after the probe and the `pricing_not_live` assertion. It does not invent a fare and does not write `rate_versions`. Publish with `docs/runbooks/quote-publish.md`.

## Prerequisites

- Stripe Dashboard **Test mode on**. Keys start with `sk_test_` / `pk_test_`.
- `STRIPE_SECRET_KEY` on the staging Worker (`wrangler secret put`).
- Publishable key already in wrangler vars for front / staging / ops-changes.
- `STRIPE_WEBHOOK_SECRET` from `stripe listen` (not the Dashboard endpoint secret). Paste only at the wrangler prompt. Mechanics: `docs/runbooks/stripe-webhook.md`.
- Adaptive Pricing: confirm in Dashboard → Settings → Adaptive Pricing before claiming presentment works.
- TWINT: requires a Swiss Stripe entity. The current test account is UAE — TWINT will not appear. Charge currency stays the engine currency. Do not add a Worker flag.
- Resend: confirmation mail needs `RESEND_API_KEY` on the Worker. Unconfirmed this sitting.

## Command

```
node scripts/stripe-e2e.mjs --dry-run
```

Prints the recorded D-27 option and the step list. Exit 0.

```
STRIPE_SECRET_KEY=… node scripts/stripe-e2e.mjs
```

Owner terminal only. The script refuses any key that does not start with `sk_test_`. First step is always `scripts/stripe-session-probe.mjs`.

## What each step proves

1. Probe — `ui_mode` empirically (`CHECKOUT_UI_MODE` lives in plan 07-04, not a second constant here).
2. `POST /api/checkout/intent` with no live rate → `409 pricing_not_live`. No Stripe object, no snapshot, no booking reference (QUOTE-10). Runs under every D-27 option.
3. Owner matrix via `quote-publish.md` (`draft → live`). Not a second publish path.
4. Intent → Checkout Session with a resolved payment intent id; booking `pending`; payment `requires_payment` (PAY-02).
5. Test card succeeds; decline card leaves the booking `pending` and sends no confirmation (PAY-03 / PAY-04).
6. With `stripe listen` forwarding: webhook → `stripe_events` row → booking `confirmed` → one `booking_notifications.sent_at` (PAY-04, PAY-06).
7. Dashboard Resend of the same event: nothing changes, no second email (PAY-05 live counterpart). Offline proof is `webhook_ordering.test.sql` + `webhook-replay.spec.ts`.
8. Confirmation page: reference, route, time, vehicle, paid total (PAY-07). Email carries `.ics` in the booking locale (PAY-06).
9. TWINT: observe Stripe's Element, not a Worker setting. Skip with a written note if the entity is not Swiss.

## Teardown

Expire every Checkout Session this pass created (`checkout.sessions.expire`). Do not leave open sessions.

There is no sacrificial rate version under option B. Do not `UPDATE rate_versions` back to draft unless the owner is rolling back a publish they just made — that procedure is in `quote-publish.md`.

Final line of a completed live run must say the environment was left as found.
