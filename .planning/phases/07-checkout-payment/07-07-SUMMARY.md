---
phase: 07-checkout-payment
plan: 07
subsystem: worker
tags: [stripe, webhook, queues, resend]

requires:
  - phase: 07-checkout-payment
    provides: Stripe module, settlement RPCs, confirmation email package
provides:
  - POST /api/stripe/webhook (verify, record, enqueue)
  - Queue consumer handleStripeMessage
  - notification_sweep at 03:00 UTC
  - docs/runbooks/stripe-webhook.md
affects: [apps/web, packages/db, docs/runbooks]

files-created:
  - apps/web/app/api/stripe/webhook/route.ts
  - apps/web/lib/checkout/webhook-verify.ts
  - apps/web/lib/checkout/webhook.ts
  - apps/web/lib/checkout/webhook.test.ts
  - apps/web/lib/checkout/settle.ts
  - apps/web/lib/checkout/settle.test.ts
  - apps/web/lib/checkout/notify.ts
  - packages/db/supabase/migrations/20260827000005_confirmation_mail.sql
  - docs/runbooks/stripe-webhook.md
files-modified:
  - apps/web/worker.ts
  - apps/web/wrangler.jsonc
  - apps/web/lib/env.d.ts
  - apps/web/middleware.ts
  - packages/emails/src/index.ts
key-files:
  - apps/web/app/api/stripe/webhook/route.ts
  - apps/web/lib/checkout/settle.ts
  - apps/web/worker.ts

decisions:
  - "middleware.ts matcher already excludes /api/* — no extra exclusion."
  - "Manage-link seam: checkout RPC returns no raw token. Second purpose=manage token via checkout_issue_manage_token (vamos_system has no INSERT grant on booking_access_tokens)."
  - "SWEEP_THRESHOLD = 10 minutes."
  - "DLQ names: vamos-stripe-events-staging-dlq and vamos-stripe-events-production-dlq. Not provisioned (no wrangler queues create in this plan)."
  - "D-15 corroborated: docs.stripe.com/checkout/fulfillment — session.completed + payment_status === paid."
  - "force-dynamic exported from settle.ts/notify.ts so D-06 fence accepts asSystem importers that are Queue/cron, not Route Handlers."
---

# Plan 07-07 Summary

Webhook HTTP stays four steps. State machine lives in the Queue consumer.

## Manage token

Hashes are one-way. Intent cookie holds the first raw token; the email cannot recover it. A second `purpose='manage'` row is minted at send time through `checkout_issue_manage_token`.

## Sweep

10 minutes. Cron `0 3 * * *` plus the existing hourly digest trigger.

## Not done here

`wrangler secret put` for `STRIPE_WEBHOOK_SECRET`, `STRIPE_SECRET_KEY`, `RESEND_API_KEY` — owner terminal, test mode. DLQs not created.
