# Phase 19 — Research (rewritten 2026-09-29)

Replaces the 2026-09-18 research. Facts below were read from the repo at af93fc8e and from the
Cloudflare and Stripe docs on 2026-09-29. Numbers the owner must read from his dashboards are
marked **owner pastes** — never filled in by the agent.

## The flow under test (26.3, live)

| Step | Where | Touches |
|---|---|---|
| Price | `GET/POST /api/quote`, `/api/checkout/price` | quote limiter (KV `QUOTE_ABUSE`, 8/60 verified, 4/60 bare), Mapbox via KV `GEO_CACHE`, Postgres (rate book row 18) |
| Checkout page | `/checkout` | SSR, `checkout_resume_read`, extras + `extra_labels` |
| PAY | `POST /api/checkout/intent` | reprice server-side, booking row, `checkout_open_payment`, Stripe `checkout.sessions.create` |
| Stripe hosted page | checkout.stripe.com | Stripe only |
| Return | `/api/checkout/return`, `/api/checkout/status/[ref]` | poll until settled |
| Webhook | `POST /api/stripe/webhook` → queue `STRIPE_EVENTS` → `queue()` in `worker.ts` | `checkout_payment_settle`, confirmation mail (Resend) |
| Hourly | cron `0 * * * *` | `purge_unpaid_booking`, confirmation resend |

## Limits that decide the design

| Layer | Limit | Source | Consequence |
|---|---|---|---|
| Stripe sandbox | 25 requests/second per account (global and per endpoint) | docs.stripe.com/rate-limits | 10,000 sessions at once is impossible on real Stripe → burst uses a fake (D-02) |
| Hyperdrive, Workers Free | 100,000 queries/day, ~20 origin connections per config | developers.cloudflare.com/hyperdrive/platform/limits and /pricing | Free cannot carry the burst |
| Hyperdrive, Workers Paid | unlimited queries, ~100 origin connections per config (soft) | same | Owner subscribes (D-10) |
| Quote limiter | 8/60 verified, 4/60 bare, per IP per colo | `lib/abuse/rate-limit.ts`, `wrangler.jsonc` | Load from a few machines is stopped → secret pass on test Worker only (D-08) |
| Mapbox | `MAPBOX_DAILY_UNIT_SENTINEL` "5000" trips a breaker on `vamos` | `wrangler.jsonc` | Test uses a small address set so answers come from `GEO_CACHE`; the test Worker has its own sentinel value |
| Supabase copy | max direct connections depend on compute size | Supabase dashboard | **owner pastes** the copy's compute size and connection limit |
| Stripe sandbox quota for 200 real payments | 25 rps | docs | pace ≤ 10 rps to leave room for webhooks and retrieves |

## Lead found while reading (for Phase 20, not fixed here)

`app/api/checkout/intent/route.ts` checks Origin but has no per-visitor limit (no
`checkRateLimit`/Turnstile import). Phase 20 runs first and decides. Plan 19-03 records whatever
limit Phase 20 left in place and tests the burst through it.

## What the test Worker needs (env `surge` in `apps/web/wrangler.jsonc`)

- `name: "vamos-surge"`, `workers_dev: true` (no custom domain), `DEPLOY_ENV: "surge"`,
  `VAMOS_SURFACE: "public"`.
- Own Hyperdrive configs (cache on / cache off) pointing at the copy's direct connection string
  — created by the owner's `wrangler hyperdrive create` run with his credential in his terminal.
- Own KV namespaces, own queue `vamos-stripe-events-surge`, own R2 not needed.
- Own secrets: Stripe sandbox secret key, a webhook secret for a sandbox endpoint pointing at the
  test Worker's address, `SURGE_PASS` (D-08), Resend: a sandbox/test key or mail disabled
  no e-mail at all (D-15).
- `crons` on: the hourly purge and resend must run during the test.

## Open items for the owner at the plan gate

1. **E-mail from the copy — decided (D-15):** no e-mail from the test Worker; count one
   confirmation notification row per booking.
2. **Load machine.** Proposal: the owner's Mac, k6, 10,000 virtual users; if the Mac cannot open
   10,000 connections, a second machine he names.

## Must-nots

No `.eu`. No `sk_live_`. No Publish click. No `db push`. No restore onto live. No disabling limits
on `vamos`. No public load-test address. No driver app.
