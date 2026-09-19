# Phase 19 — Research

**Date:** 2026-09-18
**Status:** paper. Not execute.

## What exists

- Worker `vamos` on `vamostaxi.site`. `origin/main` `env.staging.name` is `vamos`.
- Hyperdrive binds in `apps/web/wrangler.jsonc` (public + cache-disabled). Direct connection only.
- Quote abuse: `QUOTE_RATE_LIMITER` 8/60 verified cookie, `QUOTE_RATE_LIMITER_BARE` 4/60, per colo. Fail open if the binding throws; zone rule 30/60 managed_challenge remains.
- Checkout/pay and Stripe webhook are not on that public quote limiter (Phase 10 D-13).
- Marketing HTML is edge-cached (Phase 10 D-24). `/api`, `/checkout`, `/confirmation` are not.
- Stripe on staging/live Worker is **test** until owner live keys.
- Public amounts `CHF 000` until OPS Publish.

## 10k concurrent checkouts vs current stack

| Layer | Today | 10k concurrent pays |
|-------|--------|---------------------|
| Marketing browse | Phase 10 edge cache | Irrelevant |
| Quote | 8/60 per verified IP per colo | 10k distinct clients, not one k6 IP |
| Hyperdrive Free | 100k queries/day | **Cannot**. Owner buys paid. |
| Postgres Free (Supabase Zurich `yaumjzvylngfjhtuffqs`) | small pool via Hyperdrive | Owner confirms compute after Hyperdrive SKU |
| Stripe test | dummy cards | Confirm test-mode request quota |
| Mapbox | token on quote | Confirm quota; fail closed if exceeded |

Do not invent a Hyperdrive SKU or a CHF amount. Paste from Cloudflare/Stripe/Mapbox dashboards into this file when bought.

## Validation architecture

- Unit: `apps/web/lib/**/*.test.ts` — fail-closed 429, no CHF invent, checkout not a booking on `/trip`.
- Do **not** point verify at `tests/integration/*.spec.ts` (excluded, `passWithNoTests`).
- Load proof is owner-gated execute after D-04. Not a public URL. Not this paper sitting.

## Must-nots

- No `.eu`. No `sk_live_`. No Publish click. No `db push`. No restore onto live. No disabling rate limits. No driver app.
