# Stack Research

**Domain:** v1.2 Payment — Stripe TEST Custom Checkout on `vamostaxi.site` (card, Apple Pay, Google Pay, TWINT, Link); webhook confirms; live account later is wrangler secrets only
**Researched:** 2026-09-22
**Confidence:** HIGH on keep Custom Checkout (`ui_mode: "elements"`), webhook/queue, Workers HMAC, CHF charge, Dashboard methods, Apple Pay / Link / Google Pay domain registration; MEDIUM on whether Checkout `PaymentElement` can surface TWINT without a second card UI next to the DC split fields

> v1.2 only. Do **not** re-litigate the frozen v1.0 / v1.1 stack. Those live in
> `.planning/research/v1.0-archive/` and `.planning/research/v1.1-archive/`.
>
> **Already in place (leave alone):** Cloudflare Workers + OpenNext (`next@15.5.25`,
> `@opennextjs/cloudflare@1.20.2`, `wrangler@4.124.0`), Worker `vamos` on
> `vamostaxi.site` / `www.vamostaxi.site`, Supabase Zurich `yaumjzvylngfjhtuffqs`
> behind Hyperdrive, `bookings` + `booking_payments` + `stripe_events`,
> `STRIPE_EVENTS` queue `vamos-stripe-events-staging`, Checkout Sessions
> `ui_mode: "elements"` (Dahlia rename of `custom`), API `2026-08-26.dahlia`,
> `stripe@22.6.1` + `@stripe/stripe-js@9.15.0` + `@stripe/react-stripe-js@6.9.0`,
> `CheckoutElementsProvider` + split Card Elements + `ExpressCheckoutElement`,
> `POST /api/stripe/webhook` → `constructEventAsync` → `stripe_event_record` →
> Queue → `settle.ts`, confirmation page polls until webhook-settled. Charge
> always `chf`. No `payment_method_types`. No Vercel. No Stripe Connect. No
> `sk_live_`. No `vamostaxi.eu`. Pay UI stays the DC mock.

## Recommended Stack

### Core Technologies

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| Stripe Checkout Sessions `ui_mode: "elements"` | API **2026-08-26.dahlia** (pinned in `stripe.ts`) | Server session + `client_secret` for on-page pay | This **is** Custom Checkout after Dahlia (2026-03-25) renamed `custom` → `elements`. Keeps DC chrome, Adaptive Pricing, Dashboard methods, `return_url`, 24h session expiry clamp, and the existing webhook settle path. Already shipping in `createCheckoutSession`. |
| `stripe` (Node, Fetch client) | **22.6.1** (repo) | Sessions, refunds, `constructEventAsync` | Pin. Workers need `Stripe.createFetchHttpClient()` + `createSubtleCryptoProvider()`. Do not bump mid-milestone. |
| `@stripe/react-stripe-js` `/checkout` | **6.9.0** (repo; npm latest 6.11.0) | `CheckoutElementsProvider`, `ExpressCheckoutElement`, `useCheckoutElements`, Checkout `PaymentElement` | Confirm with `checkout.confirm({ redirect: "if_required" })`, not `stripe.confirmPayment`. Pin 6.9.0 unless a TWINT Payment Element bug forces 6.11.0. |
| `@stripe/stripe-js` | **9.15.0** (repo; npm latest 9.16.0, Stripe.js **dahlia**) | `loadStripe` in the browser | v9 = dahlia. One module-scoped Stripe.js object per document (already). |
| Stripe Dashboard payment methods + Adaptive Pricing | Platform | Card, wallets, TWINT, Link without a hand-built `payment_method_types` map | D-09/D-10. Line items stay `currency: "chf"`. TWINT **requires** CHF. Do not invent a charge currency. |
| Cloudflare Queue `STRIPE_EVENTS` | existing `vamos-stripe-events-staging` | Webhook fan-out | Handler stays verify → record → enqueue → 200. Settle on the consumer. Stripe retries slow endpoints. |

### Supporting Libraries

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Split Card Elements (`CardNumberElement` / `CardExpiryElement` / `CardCvcElement`) | same `@stripe/react-stripe-js` | DC mock card block | Keep. `checkout.confirm({ paymentMethod })` accepts a PaymentMethod id. Do not replace with a single Payment Element card block (that is a redesign). |
| Checkout `PaymentElement` from `@stripe/react-stripe-js/checkout` | same | TWINT (bank redirect / QR) | **Add.** TWINT is not an Express Checkout method. Mount inside `CheckoutElementsProvider` with wallets off (`applePay`/`googlePay`/`link` never) so ECE keeps wallets. |
| `ExpressCheckoutElement` | same | Apple Pay, Google Pay, Link | Keep. Change `googlePay: "never"` → `"auto"`. Keep `paypal: "never"`. `link: "auto"` stays. |
| `zod` | **4.4.3** (already) | Intent / pay-link bodies | Do not parse the Stripe webhook JSON for HMAC; verify raw bytes first. |
| `postgres` (postgres.js) | **3.4.9** (already) | `stripe_event_record` / `checkout_payment_settle` as `vamos_system` | No new datastore. First-charge-wins is `booking_payments_one_success`. |

### Development Tools

| Tool | Purpose | Notes |
|------|---------|-------|
| Stripe Dashboard → Payment methods (TEST) | Enable card, Apple Pay, Google Pay, TWINT, Link | Dynamic methods. Do not pass `payment_method_types` in `sessions.create`. |
| Stripe Dashboard → Payment method domains | Register `vamostaxi.site` **and** `www.vamostaxi.site` | Required for Apple Pay, Google Pay, Link on Elements / Custom Checkout. Repeat on the **live** account at cutover — test registration does not carry. |
| Stripe Dashboard → Webhooks | Endpoint `https://vamostaxi.site/api/stripe/webhook` | Events below. Signing secret → `wrangler secret put STRIPE_WEBHOOK_SECRET --env staging`. CLI `stripe listen` prints a **different** `whsec_`. |
| `wrangler secret put` | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | Never `wrangler.jsonc` `vars`. `STRIPE_PUBLISHABLE_KEY` is the only Stripe value that belongs in `vars` (`pk_test_…` now). |
| WAF skip (already) | Do not challenge Stripe | `(http.request.uri.path eq "/api/stripe/webhook")`. No Turnstile on webhook or checkout. |
| Stripe CLI (local only) | `stripe listen --forward-to localhost:8787/api/stripe/webhook` | Local secret ≠ Dashboard secret. |

## Installation

```bash
# No new packages for v1.2. Pin what apps/web already has.
# (Do not add paypal, connect, stripe-cli as a runtime dep, or a second processor.)

# Already in apps/web:
#   stripe@22.6.1
#   @stripe/stripe-js@9.15.0
#   @stripe/react-stripe-js@6.9.0
```

```ts
// Server — already in apps/web/lib/checkout/stripe.ts
export const CHECKOUT_UI_MODE = "elements" as const; // Dahlia; never "custom" / "hosted" / "form"
// sessions.create({ mode: "payment", ui_mode: CHECKOUT_UI_MODE, adaptive_pricing: { enabled: true },
//   line_items: [{ price_data: { currency: "chf", unit_amount: chargedRappen } }],
//   return_url, /* no payment_method_types */ })

// Webhook — already: raw request.text() → constructEventAsync(..., SubtleCrypto) → record → queue → 200

// Client — keep CheckoutElementsProvider + ExpressCheckoutElement + split Card* .
// Add Checkout PaymentElement only for TWINT; confirm still checkout.confirm({ redirect: "if_required" }).
```

Dashboard / wrangler (TEST now; live later is the same commands on the live account / production env):

```bash
# TEST (v1.2) — Worker vamos, env staging
wrangler secret put STRIPE_SECRET_KEY --env staging          # sk_test_…
wrangler secret put STRIPE_WEBHOOK_SECRET --env staging      # whsec_ from Dashboard endpoint

# Publishable key stays in wrangler.jsonc env.staging.vars as pk_test_…
# Never commit sk_live_ / pk_live_ / a live whsec.

# LIVE cutover (not v1.2) — same Worker code, different secrets + vars
# wrangler secret put STRIPE_SECRET_KEY --env <live>
# wrangler secret put STRIPE_WEBHOOK_SECRET --env <live>     # new endpoint secret
# then set STRIPE_PUBLISHABLE_KEY vars to pk_live_…
# Re-register payment method domains on the live account.
# Staging Worker stays sk_test_ forever.
```

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| Checkout Sessions `ui_mode: "elements"` (Custom Checkout) | Hosted Checkout `ui_mode: "hosted_page"` | Never for Vamos. Stripe-hosted page is a pay-UI rewrite. DC mock stays. |
| Checkout Sessions `ui_mode: "elements"` | Embedded Checkout `ui_mode: "embedded_page"` | Never. Stripe-owned form, not DC split card + express row. |
| Checkout Sessions `ui_mode: "elements"` | Checkout `ui_mode: "form"` (Dahlia addition) | Never. Stripe form UI, not the mock. |
| Checkout Sessions `ui_mode: "elements"` | PaymentIntents + Payment Element only | Only if Custom Checkout could not do TWINT on-page. It can. PI-only drops Adaptive Pricing on the Session, `expires_at` clamp, and the existing settle path. v1.0 research named this; Phase 7 already left it. Do not switch. |
| Split Card Elements + ECE + Checkout PaymentElement (TWINT) | One Payment Element for every method | Pixel-faithful DC card block forbids it. Payment Element is the TWINT collector, not the card redesign. |
| Dashboard dynamic methods (no `payment_method_types`) | Hard-coded `payment_method_types: ["card","twint",…]` | Only if Dashboard enablement is blocked. Hard-coding fights Adaptive Pricing and D-09/D-10. |
| Webhook = source of truth; thank-you polls | Confirm booking on `checkout.confirm()` / `return_url` | Never. Stripe docs: webhooks required for fulfillment; customer may drop before landing. Already `ConfirmationClient` processing → confirmed. |
| `constructEventAsync` + SubtleCrypto | Sync `constructEvent` | Never on Workers (no Node `crypto`). |

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| `ui_mode: "custom"` / `"hosted"` / `"embedded"` | Dahlia (2026-03-25) rejects these strings | `"elements"` / `"hosted_page"` / `"embedded_page"` — and we only use `"elements"` |
| `sk_live_` / `pk_live_` in v1.2 | Milestone is TEST on `vamostaxi.site` | `sk_test_` secret + `pk_test_` vars. Live is a later secret swap |
| Stripe Connect / PayPal / a second processor | Out of scope. Swiss-merchant PayPal is a second webhook + refund path | Stripe standard, one merchant, CHF |
| `payment_method_types` on the Session | Overrides Dashboard + Adaptive Pricing | Enable methods in Dashboard |
| `stripe.confirmTwintPayment` / PaymentIntent client secret on the pay page | That is the PI Direct API path (Stripe even labels the old TWINT PI guide legacy) | `checkout.confirm` on the Session |
| Hosting Stripe.js yourself / bundling it | PCI: must load from `js.stripe.com` | `loadStripe` (already) |
| Turnstile or WAF challenge on `/api/stripe/webhook` or `/checkout` | Stripe is not a browser; captcha on pay is a product ban | HMAC only; existing WAF skip |
| Confirming paid from the browser | Race + drop-off; TWINT redirect returns before settle | Queue consumer + confirmation poll |
| Apple Pay Apple Merchant ID / CSR | Stripe handles merchant validation | Payment method domains + association file if `apple_pay.status !== active` |
| `vamostaxi.eu` domain, live DNS, production Worker deploy | Phase 11 | `vamostaxi.site` TEST |

## Stack Patterns by Variant

**Custom Checkout vs Payment Element vs Checkout Sessions — decision:**

- Use **Checkout Sessions** with **`ui_mode: "elements"`** (Custom Checkout). Session is the unit of pay (intent, expire, Adaptive Pricing, metadata `booking_id`).
- Use **split Card Elements** for the DC card block (already). Confirm via `checkout.confirm({ paymentMethod })`.
- Use **ExpressCheckoutElement** for Apple Pay, Google Pay, Link (already). Confirm via `checkout.confirm({ expressCheckoutConfirmEvent })`.
- Use **Checkout `PaymentElement`** only as the TWINT (redirect/QR) collector. Not as a replacement for the card block.
- Do not use hosted/embedded/form Checkout. Do not new a PaymentIntent API for v1.2.

**If Apple Pay / Google Pay / Link do not show on `vamostaxi.site`:**

- Register both apex and `www` on [Payment method domains](https://dashboard.stripe.com/settings/payment_method_domains) in TEST.
- If `apple_pay.status` is inactive, host Stripe’s association file at `https://vamostaxi.site/.well-known/apple-developer-merchantid-domain-association` as **200, no redirect, no locale prefix**, then `POST /v1/payment_method_domains/:id/validate`. Do not invent the file bytes — paste what Dashboard gives. Mirror `app/.well-known/security.txt/route.ts`. Middleware matcher already skips dotted paths, so this must not 308 into `/en/…`.
- Register `www.vamostaxi.site` the same way. Apple treats www as a different domain.
- HTTPS is already on the custom domain. Apple Pay test uses a **real card** in Wallet + test keys (Stripe returns a test token; do not save Stripe test PANs into Apple Pay).

**If TWINT is missing:**

- Enable TWINT in Dashboard (Swiss merchant, presentment **CHF** — already `CHARGE_CURRENCY = "chf"`). Max 5000.00 CHF is a Stripe scheme cap; do not invent a fare.
- TWINT is a **bank redirect**: mobile → TWINT app, desktop → QR. ECE does not list TWINT. Mount Checkout PaymentElement.
- Thank-you **must** wait on the webhook. `checkout.confirm` with `redirect: "if_required"` will leave the page; `return_url` is not confirmation.
- TWINT merchant site rules (legal notice with company name, address, contact) are Dashboard onboarding, not a UI rewrite. Do not invent legal copy.

**If Google Pay is missing:**

- Code today sets `googlePay: "never"` (locked by `checkout-comments.test.ts`). v1.2 sets `"auto"` (not `"always"` — Google Pay is Chrome/Android only).
- Enable Google Pay in Dashboard. Same payment method domain registration as Apple Pay.
- Keep `paypal: "never"`.

**If Link is missing:**

- Enable Link in Dashboard. Domain registration covers Link (`link.status` on the PMD object).
- Keep `disableLink: false` on `CardNumberElement` and `link: "auto"` on ECE.
- Session already sends `customer_email`. HTTPS required (have it). Do not add Contact Details Element (would redesign the DC email field).

**Webhook events (Dashboard endpoint + `settle.ts`):**

| Event | Action |
|-------|--------|
| `checkout.session.completed` | Succeed only when retrieved session `payment_status === "paid"` (already). Covers instant card/wallets and TWINT when Stripe marks paid on completed. |
| `checkout.session.async_payment_succeeded` | **Add** — same succeed path. Today `outcomeFor` returns `"ignore"`. Required for delayed methods; cheap insurance for TWINT. |
| `checkout.session.async_payment_failed` | Fail (already) |
| `checkout.session.expired` | Fail (already) |
| `payment_intent.canceled` | Canceled (already) |

Do not fulfill on `payment_intent.succeeded` alone (D-15). Retrieve the Session; gate on `payment_status`. Idempotency: `stripe_events` pk → `stripe_event_begin` → `checkout_payment_settle` / `booking_payments_one_success` → notification `dedupe_key`. First successful charge wins; the other payer sees the same confirmation.

Handler stays short. Consumer `max_batch_size: 1`, `max_batch_timeout: 1`, `max_retries: 8`, DLQ `vamos-stripe-events-staging-dlq`.

**Test → live secrets (not a UI rewrite):**

1. v1.2 stays TEST on Worker `vamos` / `env.staging`. `STRIPE_PUBLISHABLE_KEY` in `vars` is `pk_test_…`. Secrets are `sk_test_` + Dashboard `whsec_`.
2. Live later: **new** live Dashboard webhook endpoint (new `whsec_`), live Payment method domains, live method enablement, then `wrangler secret put` of `STRIPE_SECRET_KEY` + `STRIPE_WEBHOOK_SECRET` on the live env and `vars` `STRIPE_PUBLISHABLE_KEY` = `pk_live_…`.
3. Do not put live keys on staging. Do not swap only the publishable key. Do not reuse the TEST `whsec_`. Do not bind `vamostaxi.eu`.
4. `env.production` in `wrangler.jsonc` currently has `pk_test_placeholder` and is **not deployed**. Cutover is config, not `PaymentPanel.tsx`.

## Version Compatibility

| Package A | Compatible With | Notes |
|-----------|-----------------|-------|
| `stripe@22.6.1` | API `2026-08-26.dahlia` | Pinned in `STRIPE_API_VERSION`. `LatestApiVersion` must stay this string. |
| `@stripe/stripe-js@9.15.0` | Stripe.js **dahlia** (v9 line) | `loadStripe` always fetches current Stripe.js; the npm major is the types/helper pin. |
| `@stripe/react-stripe-js@6.9.0` | `@stripe/stripe-js@9.x`, Checkout `/checkout` entry | Import `CheckoutElementsProvider` from `@stripe/react-stripe-js/checkout`, not the PaymentIntents `Elements` provider, for the session. Split Card* stay on a second `Elements` tree without `clientSecret` (already). |
| OpenNext Worker + `nodejs_compat` | `stripe` Fetch HTTP client | Sync HMAC will throw. Keep `constructEventAsync`. |
| Checkout Session `expires_at` | Quote lock 24h | Stripe allows 30 min–24h. `stripeSessionExpiresAtUnix` already clamps. Pay-link TTL = quote lock. |
| TWINT | `line_items` currency `chf` only | Adaptive Pricing may change **presentment**; charge stays CHF. |

## Sources

- Context7 `/websites/stripe` — Checkout `ui_mode: elements`, webhook fulfillment, payment method domains, TWINT, async payment events
- Context7 `/websites/stripe_js` — `CheckoutElementsProvider`, `ExpressCheckoutElement`, `checkout.confirm`, TWINT confirm (PI path — **not** used)
- [Checkout Session UI mode changelog (Dahlia 2026-03-25)](https://docs.stripe.com/changelog/dahlia/2026-03-25/updates-available-checkout-session-ui-modes) — `custom` → `elements`; do not use `form` / `hosted_page` / `embedded_page`. Verified 2026-09-22
- [Build a custom checkout page](https://docs.stripe.com/payments/quickstart?client=react&ui=elements) — Sessions + Payment Element + `CheckoutElementsProvider`. HIGH
- [TWINT](https://docs.stripe.com/payments/twint) / [Accept TWINT](https://docs.stripe.com/payments/twint/accept-a-payment) — CHF, Dashboard enable, redirect/QR, Checkout + Elements; Direct API marked legacy. HIGH
- [Payment method support](https://docs.stripe.com/payments/payment-methods/payment-method-support) — TWINT on Checkout and Payment Element, **not** Express Checkout Element. HIGH
- [Apple Pay (web)](https://docs.stripe.com/apple-pay?platform=web) + [Register payment method domains](https://docs.stripe.com/payments/payment-methods/pmd-registration) — apex + www, Elements/Custom Checkout require PMD; Stripe handles Apple merchant validation. HIGH
- [Checkout fulfillment](https://docs.stripe.com/payments/checkout/fulfillment) — webhooks required; `checkout.session.completed` + delayed `async_payment_succeeded` / `async_payment_failed`. HIGH
- [Link with Web Elements](https://docs.stripe.com/payments/link/elements-link) — Link in ECE and Card Element. HIGH
- npm `@stripe/stripe-js@9.16.0` / `@stripe/react-stripe-js@6.11.0` (2026-09-22) — latest; **do not bump** unless TWINT on 6.9.0 is blocked
- In-repo: `apps/web/lib/checkout/stripe.ts`, `webhook.ts`, `webhook-verify.ts`, `settle.ts`, `PaymentPanel.tsx`, `wrangler.jsonc`, `docs/runbooks/stripe-webhook.md`

---
*Stack research for: v1.2 Payment (Stripe TEST Custom Checkout on vamostaxi.site)*
*Researched: 2026-09-22*
