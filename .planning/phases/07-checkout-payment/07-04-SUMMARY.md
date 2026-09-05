---
phase: 07-checkout-payment
plan: 04
subsystem: web
tags: [checkout, stripe, identity, workers]

requires:
  - phase: 07-checkout-payment
    provides: vamos_checkout and vamos_system nologin roles
  - phase: 07-checkout-payment
    provides: Settlement RPCs granted to vamos_system
provides:
  - asCheckout and asSystem wrappers on HYPERDRIVE_NOCACHE
  - Stripe Checkout Session module (create/expire/retrieve/refund)
  - CHECKOUT_UI_MODE = elements
affects: [07-05, 07-07, 07-09]

tech-stack:
  added:
    - stripe@22.6.1
    - "@stripe/stripe-js@9.15.0"
    - "@stripe/react-stripe-js@6.9.0"
  patterns:
    - Fetch HTTP client for Workers
    - Adaptive Pricing + Dashboard payment methods

key-files:
  created:
    - apps/web/lib/checkout/stripe.ts
    - apps/web/lib/checkout/currency.ts
    - apps/web/lib/checkout/stripe.test.ts
    - apps/web/lib/checkout/currency.test.ts
    - scripts/stripe-session-probe.mjs
  modified:
    - packages/db/src/identity.ts
    - apps/web/lib/db/identity.ts
    - apps/web/lib/env.d.ts
    - apps/web/wrangler.jsonc
    - eslint.config.mjs
    - scripts/public-env-allowlist.json
    - .planning/phases/04-quote-pricing-engine/04-API-CONTRACT.md
    - .planning/phases/04-quote-pricing-engine/research/quote-lock-expiry.md

key-decisions:
  - "CHECKOUT_UI_MODE is `elements`, not `custom`. Stripe 2026-03-25.dahlia renamed custom→elements and rejects the legacy value. Product unchanged: Payment Element on our page."
  - "Checkout Sessions have no automatic_payment_methods field. Comment + Adaptive Pricing satisfy D-09; dashboard is the PM gate."
  - "asCheckout binds JWT only when claims are non-null (signed-in). Guest checkout binds nothing extra."

patterns-established:
  - "One Stripe module. Later plans import it; they do not construct a second client."

requirements-completed: [PAY-02]

completed: 2026-09-05T19:07:00Z
---

# Plan 07-04 Summary

Identity wrappers and the Stripe module for Checkout Sessions.

## Task 1 — asCheckout / asSystem

`IdentityKind` is seven members. `PG_ROLE.checkout = vamos_checkout`, `PG_ROLE.system = vamos_system`. Signed-in checkout binds `request.jwt.claims`; guest checkout (`null`) and system bind nothing extra. `asSystem` takes no claims argument (compile-time proof). ESLint D-08 message lists all seven wrappers.

## Task 2 — Stripe module

Researched = installed: `stripe@22.6.1`, `@stripe/stripe-js@9.15.0`, `@stripe/react-stripe-js@6.9.0`.

`stripeFromEnv` uses `Stripe.createFetchHttpClient()`, `apiVersion: "2026-08-26.dahlia"`, retries 2, timeout 10s. `createCheckoutSession` charges `chf` via `price_data`, enables `adaptive_pricing`, expands `payment_intent`, expires via `checkout.sessions.expire`. Refunds take `payment_intent`, never `charge`.

`STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` are typed Worker secrets (not in `vars`). `STRIPE_PUBLISHABLE_KEY` is `pk_test_placeholder` in wrangler vars. `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` is on the public-env allow-list; no `NEXT_PUBLIC_*` identifier is used in source yet.

`scripts/stripe-session-probe.mjs` exists with an `sk_test_` guard. Not run.

## Task 3 — docs

`04-API-CONTRACT.md` §6 and `quote-lock-expiry.md` §3.1 now create/expire a Checkout Session. Dated ADR-014 §1 notes added.

## CHECKOUT_UI_MODE

**`elements`**. Citation: https://docs.stripe.com/changelog/dahlia/2026-03-25/updates-available-checkout-session-ui-modes (resolved 2026-09-05). `custom` / `hosted` / `embedded` fail on Dahlia. stripe-node `SessionCreateParams.UiMode` is `'elements' | 'embedded_page' | 'form' | 'hosted_page'`.

## Verification

- `pnpm --filter web exec vitest run lib/checkout` — 9/9 pass
- `pnpm --filter @vamos/db exec vitest run test/local/identity-contract.test.ts` — 9/9 pass
- `pnpm check:public-env` — pass
- `pnpm typecheck` — pass
- `grep -rc paymentIntents.cancel apps/web/` — 0

## Commits

- `4660f31` feat(07-04): checkout and system identity wrappers
- `5afae8d` feat(07-04): Stripe Checkout Session module
- `34d49f0` docs(07-04): Checkout Session instead of PaymentIntent
