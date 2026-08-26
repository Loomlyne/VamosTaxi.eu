# Phase 7: Checkout & Payment - Research

**Researched:** 2026-08-24
**Domain:** Stripe payments (Checkout Sessions, multi-currency FX, TWINT) on Cloudflare Workers, webhook-driven booking confirmation, transactional email with calendar invite
**Confidence:** MEDIUM-HIGH — Stripe/Resend integration patterns are HIGH (official docs fetched live); the F-14 multi-currency-vs-CHF-only product question is a genuine, newly-surfaced tension between ADR-014 §1 and TWINT's CHF-only requirement that needs an explicit owner/product call, flagged accordingly.

## Summary

Phase 7 is the convergence point every later money-touching surface depends on: a customer
carrying a locked quote (Phase 4) becomes a paid, webhook-confirmed booking. The schema this
phase writes against is already fully designed — `price_snapshots`, `booking_payments`,
`booking_refunds`, `stripe_events`, `booking_notifications`, `coupon_redemptions` are specified
column-for-column in `02-06-PLAN.md`'s `<interfaces>` block and `02-SCHEMA-DRAFT.md` §9 — but as
of this research date only migrations `20260823000001`–`009` exist in
`packages/db/supabase/migrations/`; the money tables (`…013`–`…015`) are Phase 2 Wave 6, not yet
executed. Phase 7 plans against the **designed** shape and must coordinate timing with whoever
lands Phase 2 Wave 6 (see Decisions, D-03).

The single biggest finding this research adds beyond what Phase 2/3/4 already settled is a
genuine product tension inside ADR-014 §1 itself: the owner ratified "the customer may change
currency again on Stripe Checkout page" (multi-currency charging via Stripe FX), but Stripe's own
documentation confirms **TWINT requires the CHF presentment currency exactly** — it is not
available when a customer has switched the presentment currency to EUR/USD/AED. This is not a
blocker: Stripe's dynamic-payment-methods system already drops TWINT automatically for a non-CHF
presentment currency, so no custom code is needed, and Stripe's own design guidance for the
Currency Selector Element says exactly this ("the selected currency might affect available
payment methods"). But it does mean the mechanism ADR-014 names — "Stripe Checkout page" — is
architecturally specific: Adaptive Pricing (Stripe's multi-currency mechanism) is **only**
available through Elements bound to a **Checkout Session**, never through the bare Payment
Intents API. The correct integration shape is therefore a Stripe Checkout Session (not a bare
PaymentIntent) rendered through Stripe's custom-Elements UI mode inside the existing brand chrome
— not a redirect to a Stripe-hosted page, and not the plain `stripe.paymentIntents.create()` shown
illustratively in `04-API-CONTRACT.md` §6 and `research/quote-lock-expiry.md`, both of which
predate this reconciliation and say so explicitly ("shape; Phase 4/5 owns the real handler").

The second major finding is that the **checkout write path cannot be a sequence of raw INSERTs**
issued from the Worker under `asAnon`/`asCustomer` identity, the way the illustrative Phase 4
sketch shows it. `02-SCHEMA-DRAFT.md` §14a states directly: *"No INSERT policy on bookings for
`authenticated`: a quote is created by a server-authoritative route, never by the browser."* No
grant path exists for a direct multi-table insert under a `withIdentity`-scoped role. The checkout
writer must be a single `SECURITY DEFINER` RPC — architecturally identical to
`next_booking_reference()` and `manage_booking_cancel()`, both already in the schema — confirmed
independently by Phase 3's own finding (FC-04): "the checkout INSERT … uses a definer RPC inside
`asAnon`/`asCustomer` … Phase 7."

**Primary recommendation:** Build checkout on a Stripe Checkout Session (custom Elements UI mode)
with Adaptive Pricing + Currency Selector Element enabled, a single `SECURITY DEFINER` RPC for the
atomic booking-creation write, a fast-ack webhook handler that only verifies+dedupes+enqueues, and
a Cloudflare Queues consumer that owns the entire state-machine transition, email send and
calendar attachment — never the browser's return from the payment page.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Checkout form (passenger/contact/extras/coupon entry) | Browser / Client | Frontend Server (SSR shell) | Client Component collects input against the locked quote already held client-side; SSR renders the page chrome (header/footer/`RouteSummary`/`PriceSummary`) |
| Quote re-verification (steps 1–5 of `/api/checkout/intent`) | API / Backend | Database | Phase 4's contract — reads `price_snapshots`/`rate_versions` via `HYPERDRIVE_NOCACHE`, recomputes `priceQuote()`, is server-authoritative |
| Stripe Checkout Session creation | API / Backend | External (Stripe) | Server-authoritative amount (CHF rappen from the snapshot); must never accept a client-supplied total or currency for the charge |
| Payment method entry (card / Apple Pay / Google Pay / TWINT / currency switch) | Browser / Client (Stripe iframe) | — | Stripe Elements/Payment Element renders inside our page; PCI card-data scope stays entirely inside Stripe's iframe boundary (SAQ A eligibility — Don't Hand-Roll) |
| Booking + payment-attempt row creation | Database (`SECURITY DEFINER` RPC) | API / Backend (caller) | RLS has no INSERT grant on `bookings` for any client role by design (`02-SCHEMA-DRAFT.md` §14a); atomicity requires one transaction, not sequential statements |
| Webhook signature verification + event dedupe | API / Backend (Worker `fetch`) | Database (`stripe_events` insert) | Must ack Stripe in well under its timeout; all slow work is deferred |
| Booking state-machine transition (`pending→paid→confirmed`) | API / Backend (Worker `queue()`) | Database | Cloudflare Queues consumer in the same Worker (`STRIPE_EVENTS` binding already provisioned in `wrangler.jsonc`) |
| Confirmation email + ICS attachment | API / Backend (Queue consumer) | External (Resend) | Composed and sent from the consumer, never from the webhook handler or the browser |
| Confirmation page (`/confirmation/[ref]`) | Frontend Server (SSR) | Browser / Client (poll/Realtime) | Renders the reference/route/price on the server; the "processing" state polls/subscribes for the webhook-driven status flip, never sets it itself |
| Refund initiation (schema + API shape only — calculation is Phase 9) | Database | API / Backend | `booking_refunds` row shape and the Stripe refund call contract; the cancellation-tier math is explicitly out of scope (Phase 9, LIFE-02/03) |
| Manage-link token issuance | Database (same RPC as booking creation) | API / Backend | Mirrors `manage_booking_cancel()`'s pattern; the hash, not the raw token, is what Postgres ever sees |

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| PAY-01 | Customer reaches checkout carrying locked quote, enters passenger/contact details | Phase 4's `/api/checkout/intent` quote-side contract (steps 1–5, already specified); checkout page port drops the mock's PayPal/Cash radio group (D-15) |
| PAY-02 | Pay by card, Apple Pay, Google Pay or TWINT, charged in CHF | F-14 resolution (D-01/D-02): Stripe Checkout Session + `automatic_payment_methods`; TWINT/CHF interaction (D-04); package choices (Standard Stack) |
| PAY-03 | Complete booking as guest, no account | `booking_access_tokens` (Phase 2, already designed) + manage-token mint inside the booking RPC (D-13); RLS guest read path (`vamos_guest`, §14b) |
| PAY-04 | Booking confirmed only by verified webhook, never the browser return | Pitfall 6 (project's own PITFALLS.md), D-06/D-07/D-09/D-10 (Checkout-Session-aware webhook design), Common Pitfalls section |
| PAY-05 | Repeated/out-of-order webhook cannot double-charge, double-confirm, double-send | `stripe_events` PK dedupe + `booking_payments_one_success` (already designed, Phase 2), `booking_notifications.dedupe_key` claim-then-send (D-14), ordering rule (D-10) |
| PAY-06 | Confirmation email in customer's language with voucher, manage link, calendar invite | `packages/emails` (empty scaffold, filled here), `ics` package (D-13/D-14), `booking_notifications` claim-then-send (D-14), four-language requirement (CLAUDE.md Law 03) |
| PAY-07 | Confirmation page shows reference, route, time, vehicle, amount paid | Confirmation page architecture (Architectural Responsibility Map), Validation Architecture (visual + i18n proofs) |
</phase_requirements>

## Project Constraints (from CLAUDE.md)

- **No glow, ever.** Every ported `.dc.html` sets `--vt-shadow-accent:none`; Stripe's own default
  focus rings on its iframe-rendered fields are outside our CSS control — do not attempt to
  override them with a coloured glow via the Appearance API; use Stripe's `theme` + neutral
  `colorPrimary`/focus tokens only, matching `--vt-ring`'s charcoal, never yellow-tinted.
- **No tinted yellow/brownish surfaces.** The Stripe Payment/Currency-Selector Elements ship a
  default blue accent; the Appearance API must be configured to Vamos tokens (charcoal primary,
  full-strength `#FDC20B` only on the actual "Pay" button, which stays our own `Button` component,
  not a Stripe-rendered submit button, wherever the integration mode allows a custom submit control).
- **`CHF 000` until `pricing_live`.** Checkout intent must 409 with `pricing_not_live` for every
  caller while no `rate_versions` row is `status='live'` — this phase must remain fully buildable
  and testable with that gate in place (see Owner Blockers, "Stripe test-mode E2E vs `pricing_live`").
- **Four languages, same pass.** The checkout page's mock ships **English and German only**
  (confirmed by direct read of `app/pages/checkout.dc.html` — no `fr`/`de` French, no `ar` block in
  its `T` dictionary); the port must add French and Arabic in the same pass, including RTL layout
  and the mock's un-ported PayPal/Cash copy must NOT be carried over (D-15). The confirmation
  email template is new work with no mock precedent to inherit language gaps from.
- **Every page uses `SiteHeader`/`SiteFooter`.** Checkout and confirmation pages already do this in
  the mock; preserve it (`variant="inverse"`, `cta="{{ no }}"` is not set on either page in the
  mock — confirm whether the booking-in-progress state should suppress the header's own "Book a
  transfer" CTA to avoid a customer accidentally starting a second booking mid-checkout).
- **Placeholders in legal copy stay `data-tok` pills**, never invented numbers — applies directly
  to any as-yet-unconfirmed fee (the mock's child-seat line: `childSeatDesc:'Price pending — child
  seat fee is a client input'`).
- **Smooth scrolling is Lenis, everywhere** — the ported checkout/confirmation pages keep the
  single global Lenis instance; nothing about a Stripe iframe requires `data-lenis-prevent` (the
  iframe owns its own internal scroll only if its content overflows, which it should not at
  standard Payment Element field counts).

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `stripe` | 22.5.0 | Server-side Stripe SDK — Checkout Sessions, PaymentIntents (read), webhooks, refunds | `[VERIFIED: npm registry + official docs]`. Already the project's own `STACK.md` recommendation (HIGH confidence there); re-confirmed live via `npm view` and Stripe's own current docs during this research |
| `@stripe/stripe-js` | 9.14.0 | Loads Stripe.js in the browser | `[VERIFIED: npm registry + official docs]`. Required for any Elements-based integration, including the custom-UI-mode Checkout flow this phase recommends |
| `@stripe/react-stripe-js` | 6.8.2 | React bindings — `CheckoutProvider`, `PaymentElement`, `CurrencySelectorElement`, `useCheckoutElements` (the `@stripe/react-stripe-js/checkout` subpath) | `[VERIFIED: npm registry + official docs]`. Confirmed via `docs.stripe.com/elements/currency-selector-element` and `docs.stripe.com/payments/currencies/localize-prices/adaptive-pricing` (fetched live) |
| `resend` | 6.22.0 | Transactional email — confirmation send, attachments | `[VERIFIED: npm registry]`. Fetch-based, Workers-compatible (no Node-only APIs) per project's own `STACK.md`, re-confirmed via registry metadata |
| `@react-email/components` | 1.0.12 | Building the confirmation email template | `[VERIFIED: npm registry]`, official `resend/react-email` org |
| `@react-email/render` | 2.1.0 | Renders the JSX template to HTML for the Resend `html` field (or pass the React element directly per Resend's `react` send option — verify exact call shape at implementation time, see UNCERTAIN U-05) | `[ASSUMED]` — discovered from training knowledge, not an official doc fetched this session; registry-verified `[OK]` (official org, no postinstall, 11.3M weekly downloads) |
| `ics` | 3.12.0 | Generates the `.ics` calendar-invite attachment (`createEvent()`) | `[ASSUMED]` — package name from training knowledge, not official docs; registry-verified `[OK]` (adamgibbons/ics, 2014, ISC, 580K weekly downloads, no postinstall) |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `zod` | already in stack | Checkout-intent body validation, webhook-adjacent request shapes | Every route boundary in this codebase already uses it (Phase 4 pattern) — reuse, do not add a second validator |
| `postgres` (via `@vamos/db`) | already in stack | `withIdentity`/`asAnon`/`asCustomer` calls into the checkout RPC | Phase 3's door — do not import `postgres` directly in `apps/web` (CI-fenced) |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Stripe Checkout Session (custom Elements UI mode) | Bare `PaymentIntent` + Payment Element (the pattern in `04-API-CONTRACT.md`'s illustrative sketch) | Simpler, matches the sketch verbatim — but **Adaptive Pricing is not supported on the Payment Intents API at all** (official Stripe restriction). Choosing this path means ADR-014 §1's multi-currency charging cannot be built; only viable if the multi-currency requirement is descoped to CHF-only (see F-14) |
| Stripe Checkout Session (custom Elements UI mode) | Stripe-hosted Checkout (`ui_mode: 'hosted'`, full-page redirect) | Zero design-system integration work, but a full redirect away from vamostaxi.eu breaks brand chrome (header/footer disappear) and conflicts with the "nothing may look AI-generated" / consistent-brand mandate in CLAUDE.md |
| `ics` package | Hand-rolled `.ics` string builder | `ics` handles RFC 5545 escaping, timezone (`Europe/Zurich`), and recurrence edge cases correctly; hand-rolling calendar format strings is exactly the kind of "deceptively complex" problem this project's Don't Hand-Roll principle targets |
| Resend's own `react:` send parameter | Manual `@react-email/render` + `html:` string | Both work; the `react:` parameter (if confirmed to exist on the current SDK version, see U-05) is one fewer moving part. Either is fine — pick whichever the implementer confirms at Wave 0 |

**Installation:**
```bash
pnpm add --filter web stripe @stripe/stripe-js @stripe/react-stripe-js
pnpm add --filter @vamos/emails resend @react-email/components @react-email/render ics
```

**Version verification:** confirmed live via `npm view <pkg> version` on 2026-08-24 (see table
above). Training-data versions for this ecosystem move fast — re-run this check at Wave 0 rather
than trusting the numbers above if more than a few days have passed.

## Package Legitimacy Audit

Two independent checks were run: `slopcheck` (which internally shells out to `npm install` for a
dry classification pass — no packages were actually installed; every attempt aborted cleanly with
an `ERESOLVE` conflict against the repo's `pnpm`-managed tree before writing anything, confirmed
by `git status --porcelain -- package.json pnpm-lock.yaml` returning empty and `node_modules/`
containing no trace of any of the eight packages checked) and direct npm registry metadata
(`curl https://registry.npmjs.org/<pkg>`, maintainers, repository URL, license, `postinstall`
script presence, weekly downloads via `api.npmjs.org`).

| Package | Registry | Age | Downloads/wk | Source Repo | Maintainers (sample) | Postinstall | slopcheck | Disposition |
|---------|----------|-----|--------------|-------------|----------------------|-------------|-----------|-------------|
| `stripe` | npm | 15 yrs (2011) | 18.4M | github.com/stripe/stripe-node | stripe-bindings | none | [OK] | Approved |
| `@stripe/stripe-js` | npm | 6.5 yrs (2020) | 11.7M | github.com/stripe/stripe-js | rado-stripe, bmathews-stripe, others (official Stripe employee handles) | none | [OK] | Approved |
| `@stripe/react-stripe-js` | npm | 6.7 yrs (2019) | 8.5M | github.com/stripe/react-stripe-js | same Stripe org handles | none | [OK] | Approved |
| `resend` | npm | 9.5 yrs (2017; package repurposed under current org) | 10.0M | github.com/resend/resend-node | bukinoshita, zenorocha (Resend co-founders) | none | [OK] | Approved |
| `react-email` | npm | 10 yrs (2016; repurposed) | 3.7M | github.com/resend/react-email | zenorocha, bukinoshita, gabrielmfern | none | [OK] | Approved (dev/preview tooling, not a runtime dependency of the Worker) |
| `@react-email/components` | npm | 2.5 yrs (2023) | 5.3M | github.com/resend/react-email | same Resend org | none | [OK] | Approved |
| `@react-email/render` | npm | (same monorepo, current 2.1.0) | 11.3M | github.com/resend/react-email | same Resend org | none | [OK] | Approved — `[ASSUMED]` provenance (see Standard Stack) |
| `ics` | npm | 11.5 yrs (2014) | 580K | github.com/adamgibbons/ics | adamgibbons | none | [OK] | Approved — `[ASSUMED]` provenance (see Standard Stack) |

**Packages removed due to slopcheck `[SLOP]` verdict:** none.
**Packages flagged as suspicious `[SUS]`:** none.

All eight packages are from long-established, high-download, officially-maintained repositories
with no `postinstall` script. `@react-email/render` and `ics` are tagged `[ASSUMED]` per the
provenance rule (discovered via training knowledge / WebSearch synthesis, not an official doc
fetched this session) even though slopcheck and registry evidence both support them — the planner
should still gate their first install behind a lightweight `checkpoint:human-verify` given the
strict provenance rule, even though the practical risk here reads as low.

## Architecture Patterns

### System Architecture Diagram

```
Browser (checkout.dc.html port)
  │  1. POST /api/checkout/intent  { quote_id, lock, contact, extras, coupon, idempotency_key }
  ▼
Cloudflare Worker — fetch handler  (Phase 4 steps 1–5: quote re-check, HYPERDRIVE_NOCACHE)
  │  2. quote OK → create Stripe Checkout Session
  │     (Adaptive Pricing + Currency Selector; automatic_payment_methods)
  ▼
Stripe API  ──(network call, OUTSIDE any DB transaction)──►  Checkout Session + PaymentIntent
  │  3. session.client_secret, session.payment_intent.id returned
  ▼
Worker — ONE Postgres transaction via public.checkout_create_booking() [SECURITY DEFINER RPC]
  │  insert bookings (status='pending') → insert booking_legs → bind price_snapshot.booking_id
  │  → coupon FOR UPDATE + coupon_redemptions insert → insert booking_payments (fires the
  │  charge-gate trigger — the "no off switch" layer) → mint booking_access_tokens
  │
  ├─ gate raises restrict_violation ──► ROLLBACK, stripe.checkout.sessions.expire(session.id),
  │                                     409 to browser (never a booking, never a burned reference)
  │
  ▼ success
  200 { reference, client_secret }
  ▼
Browser — mounts Payment/Currency Selector Element against client_secret
  │  4. Customer enters card / Apple Pay / Google Pay / TWINT, confirms
  ▼
Stripe (async — TWINT/3DS may leave the page entirely) ──► webhook POST
  │
  ▼
Cloudflare Worker — fetch handler  /api/stripe/webhook
  │  5. constructEventAsync() + createSubtleCryptoProvider() — verify signature
  │  6. INSERT stripe_events (id) ON CONFLICT DO NOTHING  →  env.STRIPE_EVENTS.send(event)
  │  7. return 200 fast (no state-machine work here — Pitfall 5/6)
  ▼
Cloudflare Queues — vamos-stripe-events-{env}  (binding already provisioned, Phase 1)
  ▼
Cloudflare Worker — queue() consumer  (worker.ts, same Worker/deployment)
  │  8. re-check stripe_events.processed_at / booking_payments.status (idempotent against
  │     Queues' at-least-once redelivery)
  │  9. order by (object_id, stripe_created) — a canceled event delivered after succeeded
  │     must not un-confirm a booking (PAY-05)
  │  10. UPDATE booking_payments SET status='succeeded' (column-whitelist trigger only allows
  │      status/captured_at)  →  UPDATE bookings SET status='paid'→'confirmed'  →  INSERT
  │      booking_events (payment.succeeded, booking.status_changed)
  │  11. claim-then-send: INSERT booking_notifications (dedupe_key) → Resend send (voucher +
  │      manage link + .ics)  →  UPDATE booking_notifications SET sent_at
  ▼
Browser (confirmation page, polling/Realtime) ──► renders reference/route/vehicle/amount paid
  (never sets its own "confirmed" state from the return_url redirect — Pitfall 6)
```

### Recommended Project Structure
```
apps/web/
├── app/api/checkout/
│   └── intent/route.ts          # POST /api/checkout/intent — Phase 4 steps 1-5 + Stripe Session + RPC call
├── app/api/stripe/
│   └── webhook/route.ts         # POST /api/stripe/webhook — verify, dedupe, enqueue only
├── app/(public)/checkout/
│   └── page.tsx                  # ported checkout.dc.html, Client Component payment step
├── app/(public)/confirmation/[ref]/
│   └── page.tsx                  # ported confirmation.dc.html, polls/subscribes for status
├── lib/checkout/
│   ├── stripe.ts                 # Stripe client construction (createFetchHttpClient)
│   ├── webhook-verify.ts         # constructEventAsync + createSubtleCryptoProvider wrapper
│   └── currency.ts               # display-currency → Stripe presentment mapping helper
└── worker.ts                     # queue() consumer gains its first real case here (was a no-op)

packages/db/supabase/migrations/
└── <ts>_payment_fx.sql           # additive: relax charged_currency CHECK, add fx_rate/
                                   #   fx_source/fx_quoted_at/presentment_amount_minor (D-03)
packages/db/supabase/tests/
└── checkout_rpc.test.sql         # pgTAP: RPC grant model, coupon lock, manage-token mint

packages/emails/
├── src/ConfirmationEmail.tsx      # React Email template, en/de/fr/ar
├── src/lib/render.ts              # renders + sends via Resend, attaches .ics
└── src/lib/ics.ts                 # createEvent() wrapper
```

### Pattern 1: Checkout-Session-based multi-currency charging (resolves F-14)

**What:** Create a Stripe Checkout Session (never a bare PaymentIntent) with
`adaptive_pricing.enabled` reachable via the client-side `adaptivePricing: {allowed: true}` init
option, and mount `CurrencySelectorElement` + `PaymentElement` inside a `CheckoutProvider`
(`@stripe/react-stripe-js/checkout`) rather than redirecting to a Stripe-hosted page.

**When to use:** Any time the presentment currency the customer sees/pays in needs to be something
other than the merchant's fixed integration currency (CHF here) — this is the *only* Stripe-native
mechanism that supports it. It is the correct implementation of ADR-014 §1.

**Example:**
```ts
// Source: https://docs.stripe.com/payments/currencies/localize-prices/adaptive-pricing
//         https://docs.stripe.com/elements/currency-selector-element  (fetched live, 2026-08-24)
const session = await stripe.checkout.sessions.create(
  {
    mode: "payment",
    line_items: [{
      price_data: {
        currency: "chf",                    // the ONE priced currency (ADR-004 schema half)
        product_data: { name: `Transfer ${vehicleClass}` },
        unit_amount: snapshot.total_rappen,  // integer CHF minor units, server-derived only
      },
      quantity: 1,
    }],
    adaptive_pricing: { enabled: true },     // unlocks Currency Selector + TWINT-when-CHF etc.
    automatic_payment_methods: { enabled: true },
    payment_intent_data: { metadata: { booking_ref: reference, quote_id } },
    expires_at: Math.floor(Date.now() / 1000) + 30 * 60,  // matches checkout_window_minutes
    return_url: `${origin}/confirmation/${reference}`,     // UI-only; never the confirmation source
    expand: ["payment_intent"],
  },
  { idempotencyKey: idempotencyKeyForStripe },
);
// session.payment_intent.id is now synchronously available for booking_payments.stripe_payment_intent_id
```
```tsx
// Client — @stripe/react-stripe-js/checkout (verify exact ui_mode value at implementation
// time, see UNCERTAIN U-01 — Stripe's own docs use both "custom" and "elements" for what
// appears to be the same integration in different pages, an unresolved naming disagreement)
<CheckoutElementsProvider stripe={stripePromise} options={{ clientSecret, adaptivePricing: { allowed: true } }}>
  <CurrencySelectorElement />
  <PaymentElement />
</CheckoutElementsProvider>
```

### Pattern 2: The checkout write path is a single `SECURITY DEFINER` RPC, not sequential inserts

**What:** One Postgres function, callable by `anon`/`authenticated` (mirroring
`next_booking_reference()` and `manage_booking_cancel()`'s existing access-control shape), that
performs the entire booking-creation transaction atomically: insert `bookings`, insert
`booking_legs`, bind the chosen `price_snapshots.booking_id`, lock+insert `coupon_redemptions`,
insert `booking_payments` (which fires `tg_payment_matches_snapshot()` — the charge gate), and
mint `booking_access_tokens`.

**When to use:** Any state-changing write that a client-facing role (`anon`, `authenticated`,
`vamos_guest`) needs to perform where no RLS INSERT policy exists (which, per `02-SCHEMA-DRAFT.md`
§14a's own comment, is deliberately true of `bookings`).

**Example:**
```sql
-- Source: pattern mirrors public.manage_booking_cancel() and public.next_booking_reference(),
-- both already in 02-SCHEMA-DRAFT.md §7/§8. New for Phase 7.
create or replace function public.checkout_create_booking(
  p_quote_id uuid, p_vehicle_class_id uuid, p_contact jsonb, p_locale text,
  p_idempotency_key text, p_coupon_code text, p_stripe_payment_intent_id text,
  p_charged_rappen rappen, p_charged_currency char(3),
  p_fx_rate numeric, p_fx_source text, p_presentment_amount_minor bigint
) returns table (booking_id uuid, reference text, manage_token text)
language plpgsql security definer set search_path = '' as $$
declare v_booking_id uuid; v_reference text; v_snapshot public.price_snapshots%rowtype;
        v_raw_token bytea; v_expires timestamptz;
begin
  -- on bookings_idempotency unique violation, SELECT and return the existing row instead of
  -- raising — the U20 retry-safety contract (04-API-CONTRACT.md §1, "Idempotency (U20)")
  select * into v_snapshot from public.price_snapshots
    where quote_id = p_quote_id and vehicle_class_id = p_vehicle_class_id and booking_id is null;
  if not found then raise exception 'quote_not_found' using errcode = 'P0002'; end if;

  insert into public.bookings (customer_id, contact_name, contact_email, contact_phone,
      idempotency_key, quote_id, status, locale)
    values (app.uid(), p_contact->>'name', p_contact->>'email', p_contact->>'phone',
      p_idempotency_key, p_quote_id, 'pending', p_locale)
    returning id, reference into v_booking_id, v_reference;

  update public.price_snapshots set booking_id = v_booking_id where id = v_snapshot.id;
  -- … booking_legs, coupon FOR UPDATE + coupon_redemptions …

  insert into public.booking_payments (booking_id, snapshot_id, stripe_payment_intent_id,
      charged_rappen, charged_currency, fx_rate, fx_source, presentment_amount_minor, status)
    values (v_booking_id, v_snapshot.id, p_stripe_payment_intent_id, p_charged_rappen,
      p_charged_currency, p_fx_rate, p_fx_source, p_presentment_amount_minor, 'requires_payment');
    -- ↑ fires tg_payment_matches_snapshot() — unmodified, still compares charged_rappen to the
    --   CHF s.total_rappen regardless of charged_currency (see D-03)

  v_raw_token := extensions.gen_random_bytes(32);
  select (select max(scheduled_at) from public.booking_legs where booking_id = v_booking_id))
       + (v_snapshot_settings.manage_link_validity_days || ' days')::interval
    into v_expires;
  insert into public.booking_access_tokens (booking_id, token_hash, expires_at)
    values (v_booking_id, extensions.digest(v_raw_token, 'sha256'), v_expires);

  return query select v_booking_id, v_reference, encode(v_raw_token, 'base64');
end $$;
revoke all on function public.checkout_create_booking from public;
grant execute on function public.checkout_create_booking to anon, authenticated;
```

### Pattern 3: Webhook fast-ack, Queue-owned state machine (already established project-wide)

**What:** The webhook `fetch` handler's only job is signature verification, `stripe_events`
dedupe-insert, and enqueue. All state-changing work happens in the `queue()` consumer.

**When to use:** Always, for this webhook. Already documented at HIGH confidence in this
project's own `.planning/research/STACK.md` §3/§5 and `PITFALLS.md` Pitfall 5/6 — cited here, not
re-derived.

```ts
// Source: STACK.md §3 (project's own prior research, HIGH confidence, official-docs-verified)
const stripe = new Stripe(env.STRIPE_SECRET_KEY, { httpClient: Stripe.createFetchHttpClient() });
const cryptoProvider = Stripe.createSubtleCryptoProvider();

export async function POST(request: Request) {
  const sig = request.headers.get("stripe-signature")!;
  const body = await request.text();               // read ONCE — Workers bodies are single-use
  const event = await stripe.webhooks.constructEventAsync(
    body, sig, env.STRIPE_WEBHOOK_SECRET, undefined, cryptoProvider,
  );
  await publicSql(env)`insert into public.stripe_events (id, type, stripe_created, object_id, payload)
    values (${event.id}, ${event.type}, ${new Date(event.created * 1000)},
            ${event.data.object.id}, ${event.data.object}) on conflict (id) do nothing`;
  await env.STRIPE_EVENTS.send(event);
  return new Response(null, { status: 200 });
}
```

### Anti-Patterns to Avoid

- **Confirming a booking from the browser's `return_url` handler.** TWINT and any 3DS/redirect
  challenge leave the page entirely; the customer may close the app, lose connectivity, or come
  back to a stale tab. The webhook is the only source of truth (Pitfall 6, HIGH confidence,
  already in this project's own research).
- **Using `stripe.paymentIntents.cancel()` as the rollback compensation for a Checkout-Session
  flow.** Stripe's own API docs are explicit: *"You can't confirm or cancel the PaymentIntent for
  a Checkout Session. To cancel, expire the Checkout Session instead"* — use
  `stripe.checkout.sessions.expire(session.id)` (D-07).
- **Hand-building the presentment-currency-to-payment-method mapping.** Stripe's dynamic payment
  methods + Adaptive Pricing already drop TWINT for a non-CHF presentment currency automatically —
  do not write conditional logic that manually excludes TWINT by currency; that duplicates
  Stripe's own source of truth and will drift when Stripe adds/changes local methods.
- **Reading `settings.accepts_twint`/`accepts_card` as the actual payment-method gate.** These
  operational toggles exist for ops-facing copy/display only (per the executed
  `20260823000004_settings.sql`); the real gate is the Stripe Dashboard's Payment Method
  Configuration plus Adaptive Pricing's currency filtering. Two sources of truth for "is TWINT
  available right now" is exactly the kind of drift this project's own architecture avoids
  elsewhere (see Common Pitfalls).
- **Computing any expiry/window timestamp in the Worker with `Date.now()`** — every clock decision
  in this checkout path (quote lock, payment window, manage-token expiry) must be computed inside
  the same SQL statement that later compares it, per the project's own established rule (already
  proven for `price_snapshots.expires_at` in `research/quote-lock-expiry.md` §4).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|--------------|-----|
| Webhook signature verification | A manual HMAC-SHA256 comparison against the `Stripe-Signature` header | `stripe.webhooks.constructEventAsync()` + `Stripe.createSubtleCryptoProvider()` | Stripe's signature scheme includes timestamp-based replay tolerance and multiple-signature rotation support that a hand-rolled comparison will not reproduce correctly, and Workers has no synchronous `crypto` for the sync path anyway |
| Multi-currency FX conversion + rate guarantee | A custom exchange-rate table refreshed from some FX API | Stripe Adaptive Pricing (mid-market rate, 24 h guarantee, refund-consistent reversal) | Building this is a second source of currency truth that will drift from what Stripe actually settles; Stripe's own conversion is what the customer is actually charged, so any independent rate is cosmetic at best and misleading at worst |
| ICS/iCal file generation | Hand-built `.ics` text with manual RFC 5545 escaping | `ics` package's `createEvent()` | Calendar format has real edge cases (line folding at 75 octets, timezone `VTIMEZONE` blocks, escaping commas/semicolons in `SUMMARY`/`DESCRIPTION`) that are exactly the "deceptively complex, looks simple until a specific calendar client chokes on it" class of problem |
| Guest manage-token generation/hashing | Reinventing token entropy/hashing choices | The already-designed `booking_access_tokens` shape (32 random bytes, SHA-256, hashed *in the Worker* before it reaches Postgres) | Already specified and reasoned through in Phase 2 (`02-SCHEMA-DRAFT.md` §8) — re-deriving it in Phase 7 risks a subtly different (and unreviewed) security property |
| Webhook idempotency / ordering | A custom "have I seen this event" cache (KV, in-memory) | `stripe_events` table: PK on Stripe's own event id, ordering on `(object_id, stripe_created)` | Already designed and pgTAP-provable at the DB layer (Phase 2); a parallel cache is a second source of truth for exactly the invariant PAY-05 depends on |

**Key insight:** Every "don't hand-roll" item above already has a designed, cited answer
elsewhere in this project's own research and schema. Phase 7's job is almost entirely
*integration* — wiring Stripe's and Postgres's own correctly-designed primitives together — not
invention. The one genuinely new invention this phase makes is the FX schema addition (D-03),
and even that is additive to an already-designed table, not a new subsystem.

## Common Pitfalls

### Pitfall 1: Trusting the `return_url` redirect as a confirmation signal

**What goes wrong:** A card payment feels synchronous; TWINT and 3DS challenges are not.
**Why it happens:** Testing against cards only (the common, fast path) hides the gap until TWINT
or a failed/abandoned 3DS challenge is exercised.
**How to avoid:** The confirmation page's initial render is always a "processing" state; it polls
or subscribes (Supabase Realtime, already in the stack) for the webhook-driven status flip. Never
set `bookings.status` from a route the browser's `return_url` hits.
**Warning signs:** Any code path that sets `status='confirmed'` from a client-side handler.
*(Already documented at HIGH confidence in this project's own `PITFALLS.md` Pitfall 6 — cited,
not re-derived.)*

### Pitfall 2: Building against the illustrative PaymentIntent code as if it were final

**What goes wrong:** `04-API-CONTRACT.md` §6 and `research/quote-lock-expiry.md` §3.1 both sketch
`stripe.paymentIntents.create(...)` / `.cancel()`. Both files say explicitly "Phase 7 owns the
real handler" — but the sketch is detailed enough to be mistaken for a spec.
**Why it happens:** The sketch is genuinely correct for a CHF-only design; it simply predates the
ADR-014 §1 reconciliation this research performs.
**How to avoid:** Keep the sketch's **sequencing and error-handling logic** (pre-flight read →
Stripe call outside the DB transaction → one DB transaction → compensating cleanup on gate
failure) verbatim; swap the **object type** to a Checkout Session and the **cancel call** to
`sessions.expire()` (Patterns 1 and the Anti-Patterns list above).
**Warning signs:** Any code calling `stripe.paymentIntents.cancel()` in this phase.

### Pitfall 3: Two sources of truth for "which payment methods are available"

**What goes wrong:** `settings.accepts_twint`/`accepts_card` (operational toggles, ops-editable)
drift from the Stripe Dashboard's actual Payment Method Configuration + Adaptive Pricing currency
filtering, producing a checkout page that advertises TWINT when Stripe would not actually offer
it (or the reverse).
**Why it happens:** The `settings` table looks like the natural place to gate this, and it exists
already — but it was designed for descriptive copy, not as Stripe's method-availability oracle.
**How to avoid:** Use `automatic_payment_methods`/`adaptive_pricing` and let Stripe's own Element
render whatever is actually available; use `settings.accepts_*` only for marketing copy
("we accept TWINT") that degrades gracefully if the two ever disagree.

### Pitfall 4: `booking_notifications` claimed but never sent (a stuck row)

**What goes wrong:** The claim-then-send pattern inserts the notification row first (claiming the
`dedupe_key`) and sends second; if the Resend call throws mid-flight and the Worker is evicted
before the failure is recorded, the row exists with `sent_at IS NULL` and `failed_at IS NULL`
forever, and — because the `dedupe_key` is already claimed — a legitimate retry sees `23505` and
silently no-ops, so the customer never gets a confirmation email and nothing alerts anyone.
**Why it happens:** The claim-then-send pattern optimizes for "never double-send," which is
correct, but needs an explicit stuck-row sweep to also guarantee "never zero-send."
**How to avoid:** The `booking_notifications_pending` index (`where sent_at is null and failed_at
is null`, already in the Phase 2 schema) exists for exactly this — the daily cron (`0 3 * * *`,
already declared in `wrangler.jsonc`, currently a no-op) should sweep rows older than a short
threshold (e.g. 5 minutes) with neither `sent_at` nor `failed_at` set and retry or mark `failed_at`
with a diagnosable error. Scope precisely: build the sweep target list this phase; the actual
cron wiring for reminders (`reminder_24h`) is Phase 9 — only `confirmation` needs to work here,
but the sweep pattern should be written generically since Phase 9 reuses it.
**Warning signs:** A `booking_notifications` row more than a few minutes old with both `sent_at`
and `failed_at` NULL.

### Pitfall 5: Assuming the Checkout Session's PaymentIntent id is available without expanding it

**What goes wrong:** `booking_payments.stripe_payment_intent_id` is `not null`; if the Checkout
Session create call omits `expand: ["payment_intent"]`, `session.payment_intent` is a bare id
string in some SDK response shapes or requires a second round-trip, and the RPC call is written
assuming a fully synchronous single request.
**Why it happens:** Not every Stripe integration needs this field immediately — most Checkout
Session integrations only need `session.id` and `session.url`/`client_secret`.
**How to avoid:** Always pass `expand: ["payment_intent"]` on the Session `create()` call (shown
in Pattern 1); confirmed as an "Expandable" field on the Checkout Session object per Stripe's API
reference.

## Code Examples

### Confirmation email — claim-then-send with `.ics` attachment

```ts
// Source: pattern derived from 02-SCHEMA-DRAFT.md §9 "notification ledger" comment
// ("claimed before sending") + Resend's documented attachments shape
// (https://resend.com/docs/send-with-cloudflare-workers, WebSearch-verified 2026-08-24, MEDIUM)
import { createEvent } from "ics";

async function sendConfirmation(booking: BookingForEmail, env: Env) {
  const dedupeKey = `${booking.id}:confirmation:`;
  const claimed = await publicSql(env)`
    insert into public.booking_notifications (booking_id, kind, channel, locale, dedupe_key)
    values (${booking.id}, 'confirmation', 'email', ${booking.locale},
            ${dedupeKey})
    on conflict (dedupe_key) do nothing
    returning id`;
  if (claimed.length === 0) return; // already claimed by a concurrent/retried delivery — no-op

  const { value: icsContent } = createEvent({
    start: [/* from booking_legs.scheduled_local, Europe/Zurich */],
    title: `Vamos Taxi transfer — ${booking.reference}`,
    location: booking.pickupText,
    duration: { minutes: booking.estimatedDurationMinutes ?? 60 },
  });

  try {
    const { data, error } = await resend.emails.send({
      from: "Vamos Taxi <bookings@vamostaxi.eu>",
      to: booking.contactEmail,
      subject: t(booking.locale, "email.confirmation.subject", { ref: booking.reference }),
      react: ConfirmationEmail({ booking, locale: booking.locale }), // or render() + html:, see U-05
      attachments: [{ filename: `${booking.reference}.ics`, content: Buffer.from(icsContent!).toString("base64") }],
    });
    if (error) throw error;
    await publicSql(env)`update public.booking_notifications
      set sent_at = now(), provider_message_id = ${data!.id} where dedupe_key = ${dedupeKey}`;
  } catch (e) {
    await publicSql(env)`update public.booking_notifications
      set failed_at = now(), error = ${String(e)} where dedupe_key = ${dedupeKey}`;
    throw e; // let the Queue consumer's retry semantics handle re-delivery
  }
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|---------------|--------|
| Bare `PaymentIntent` + manual currency-mark-only display (`04-API-CONTRACT.md`'s illustrative sketch, this project's own `STACK.md` §3 "CHF PaymentIntents") | Checkout Session + Adaptive Pricing for genuine multi-currency charging | ADR-014 owner sitting, 2026-08-22 (one day before `STACK.md`'s own research date, but not folded into it) | Every piece of code that assumed a bare `PaymentIntent` object (illustrative sketches in Phase 4's research) needs the object-type swap described in Pattern 1/Pitfall 2 |
| `stripe.paymentIntents.cancel()` on checkout rollback | `stripe.checkout.sessions.expire()` | Consequence of the above — not a Stripe API change, a consequence of switching object types | Direct correction to the illustrative code in `quote-lock-expiry.md` |

**Deprecated/outdated:**
- The mock's PayPal and cash-to-driver payment options (`checkout.dc.html`'s `Radio` group) — both
  explicitly dropped by owner decisions dated after the mock was built (PayPal: no Swiss-merchant
  PayPal support via Stripe, `OWNER-ANSWERS.md` 2026-08-17; cash: "No" per ADR-014 §6,
  2026-08-22). This is one of the rare cases where CLAUDE.md's "mocks are final" rule is
  explicitly superseded by a later, dated owner decision — the same pattern already applied to the
  mock's Van-7-passenger capacity in Phase 4 (D-38).

## Decisions taken here

| # | Decision | Rationale | Confidence |
|---|----------|-----------|------------|
| D-01 | Checkout write route is `POST /api/checkout/intent` (not `/api/checkout`, the older naming in `quote-lock-expiry.md`) | `04-API-CONTRACT.md` §6 is the later, harden-pass-reconciled document and is explicit that this is the name Phase 7 must implement against | HIGH — direct citation |
| D-02 | **F-14 resolved: implement multi-currency charging per ADR-014 §1**, via a Stripe Checkout Session (never a bare PaymentIntent) with Adaptive Pricing + Currency Selector Element, rendered through Stripe's custom-Elements UI mode inside the existing page chrome (not a hosted redirect) | ADR-014 is dated 2026-08-22, explicitly described as "the most recent binding source" in both Phase 3 and Phase 4 CONTEXT docs, and its own text says "the customer may change currency again on Stripe Checkout page" — naming the mechanism. Adaptive Pricing is confirmed (official docs, live-fetched) to be available only through Elements+Checkout Sessions, never the Payment Intents API | MEDIUM-HIGH — product intent HIGH confidence (dated ADR), mechanism HIGH confidence (official docs), but this is the first research pass to reconcile the two — flag for a quick owner/product confirmation given the TWINT interaction below |
| D-03 | `booking_payments` schema needs additive columns: `fx_rate numeric(18,8)`, `fx_source text`, `fx_quoted_at timestamptz`, `presentment_amount_minor bigint`; relax `charged_currency` CHECK from `= 'CHF'` to `in ('CHF','EUR','USD','AED')`; add `check ((charged_currency = 'CHF') = (fx_rate is null))`. `charged_rappen` and the charge-gate trigger's comparison to `s.total_rappen` are **unchanged** — they always mean CHF, regardless of what currency Stripe actually settled | Directly satisfies the reviewer's own suggestion recorded in `02-06-PLAN.md`'s `<deferred>` block ("splitting the locked figure from the settlement figure … must NOT resolve it by relaxing the amount comparison, which is the layer of QUOTE-10 with no off switch"). As of this research date, `packages/db/supabase/migrations/…013`–`…015` (the money tables) do not yet exist — coordinate whether this lands as one migration alongside Phase 2 Wave 6, or as Phase 7's own additive migration immediately after | HIGH — directly cited, zero risk to the existing charge gate |
| D-04 | TWINT's automatic unavailability for non-CHF presentment currencies needs **no custom code** — Stripe's dynamic-payment-methods system + Adaptive Pricing already filters payment methods by currency | Official Stripe docs (fetched live): TWINT's create-PaymentIntent example hardcodes `currency: chf`; the Currency Selector Element design-best-practices doc states directly "the selected currency might affect available payment methods"; TWINT is separately listed as one of Adaptive Pricing's "payment methods that require presenting in local currency" — i.e. it becomes available precisely when CHF is the resolved presentment currency, and only then | HIGH — corroborated by two independent official-doc passages |
| D-05 | Checkout write path is a single `SECURITY DEFINER` RPC (`public.checkout_create_booking(...)`, Pattern 2), never sequential `INSERT`s issued directly under `asAnon`/`asCustomer` | `02-SCHEMA-DRAFT.md` §14a's own comment: "No INSERT policy on bookings for `authenticated`: a quote is created by a server-authoritative route, never by the browser." No grant path exists for a raw multi-statement insert. Independently confirmed by Phase 3's FC-04 finding ("Phase 7 writer is definer inside `asAnon`/`asCustomer`") | HIGH — directly cited from the schema draft's own text plus an independent Phase 3 finding |
| D-06 | The Stripe object (Checkout Session) is created **outside** any DB transaction — a plain network call between the pre-flight quote read and the RPC call | Matches `rls-hyperdrive.md`'s "one transaction per logical unit of work, never held open across a network call" rule, already established project-wide | HIGH — directly cited |
| D-07 | Compensating rollback on charge-gate failure is `stripe.checkout.sessions.expire(session.id)`, not `stripe.paymentIntents.cancel()` | Stripe's own API reference states directly: "You can't confirm or cancel the PaymentIntent for a Checkout Session. To cancel, expire the Checkout Session instead" | HIGH — official docs, fetched live |
| D-08 | Webhook route (`POST /api/stripe/webhook`) does signature verification + `stripe_events` dedupe-insert + `env.STRIPE_EVENTS.send()` only; returns 200 immediately. All state-machine work happens in the `queue()` consumer in `apps/web/worker.ts` | Already established HIGH-confidence project research (`STACK.md` §3/§5, `PITFALLS.md` Pitfall 5/6); `STRIPE_EVENTS` queue binding (producer+consumer) is already provisioned under both `env.staging` and `env.production` in `wrangler.jsonc` — this phase is the first real case attached to it | HIGH — directly cited, infra already provisioned |
| D-09 | Webhook consumer orders on `(object_id, stripe_created)`, never `received_at` | Matches the `stripe_events` table's own comment and Stripe's documented recommendation to order by the event's own `created` timestamp per object, not delivery order | HIGH — schema-cited + official-docs-corroborated |
| D-10 | Primary fulfillment signal is `checkout.session.completed` with an explicit `payment_status === 'paid'` check (covers both instant and delayed/redirect methods like TWINT uniformly), not branching directly on `payment_intent.succeeded` | Stripe's own guidance for Checkout-Session-based integrations recommends `checkout.session.completed` as the fulfillment event, with the `payment_status` check for async methods | MEDIUM — WebSearch-synthesized, not fetched from a single authoritative page; corroborate at implementation time against `docs.stripe.com/checkout/fulfillment` |
| D-11 | `bookings` row is inserted with `status='pending'` explicitly inside the RPC (never left at the table's `'quote'` default) | A booking created via checkout already carries contact details, a burned `VT-YY-####` reference, and a payment-attempt row — it is a real purchase attempt, not a price check; leaving it at the schema default is misleading and untested by any existing pgTAP proof | MEDIUM — reasoned from schema intent, not a directly-cited source; confirm no other phase assumes a different initial status |
| D-12 | The guest manage-token (`booking_access_tokens`) is minted **inside the same RPC transaction** that creates the booking, not lazily in the webhook consumer | Simpler (one transaction, mirrors `next_booking_reference()`'s "allocated at the moment of commitment" pattern); the raw token is never emailed until the confirmation send, so an unpaid/abandoned booking's unminted-but-unsent token row is inert — no security cost to eager minting | MEDIUM — a defensible default, not the only valid design; see UNCERTAIN U-03 for the alternative |
| D-13 | `packages/emails` ships exactly one template this phase: `confirmation` (`booking_notifications.kind = 'confirmation'`). `reminder_24h`/`assignment`/`review_request`/`cancellation`/`refund`/`manage_link_resend` are Phase 8/9's templates against the same table shape | PAY-06 names only the confirmation email; the other `kind` values already exist in the Phase 2 schema's CHECK list for forward-compatibility, not for this phase to fill | HIGH — directly scoped from the requirement text |
| D-14 | `booking_notifications` supports the documented INSERT-then-UPDATE(`sent_at`) claim-then-send pattern because it is **not** one of the four append-only-enforced tables (`price_snapshots`, `price_snapshot_legs`, `booking_events`, `booking_refunds`, `audit_log`, `consent_log` — the complete list, per `0016_append_only.sql`'s actual trigger attachments) | Directly verified by reading the append-only migration's trigger-attachment list — `booking_notifications` is absent from it, so the table's own comment ("claimed before sending") is buildable as designed, with no Phase-4-style contradiction to fix | HIGH — directly verified against the schema draft's own SQL, not assumed |
| D-15 | Port `checkout.dc.html` **without** its `Radio` payment-method group (Card/PayPal/Cash) and **without** its `payLabelCash`/`payCashDesc` copy — replace with the mounted Stripe Element, which renders its own method picker | PayPal has no Swiss-merchant Stripe support (`OWNER-ANSWERS.md`); cash-to-driver is explicitly "No" (ADR-014 §6). Both post-date the mock | HIGH — directly cited owner decisions |
| D-16 | `booking_refunds` needs **no** multi-currency schema changes even under D-02's multi-currency charging | Stripe's own Adaptive Pricing docs confirm: "You can issue a refund in your integration currency, and Stripe refunds your customer in the currency they used to make the payment. The refund uses the same exchange rate as the original transaction" — so `basis_rappen`/`refund_rappen` stay CHF exactly as Phase 2 already designed, regardless of `booking_payments.charged_currency` | HIGH — official docs, fetched live |

## Runtime State Inventory

Not applicable — Phase 7 is new-surface work (a checkout/payment flow that does not exist in any
running form today), not a rename, refactor, or migration of existing runtime state. Skipped per
the trigger condition in the output format.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|----------------|
| A1 | `@react-email/render`'s exact rendering call shape (or Resend SDK's native `react:` param) is the correct way to render the confirmation template | Standard Stack, Code Examples | Low — either approach works; wrong assumption costs a small implementation-time correction, not a design change |
| A2 | `ics` package (`createEvent()`) is the right calendar-invite library | Standard Stack, Don't Hand-Roll | Low — package is long-established and slopcheck-clean; a wrong function signature is a 10-minute fix, not a design risk |
| A3 | The exact Stripe Checkout `ui_mode` value for the fully-custom Elements integration is `'custom'` (some sources) or `'elements'` (Stripe's own Adaptive Pricing testing example uses `ui_mode=elements`) — this research could not fully reconcile the two within budget | Pattern 1, UNCERTAIN U-01 | MEDIUM — a wrong enum value fails fast at the first `sessions.create()` call in test mode, so this is cheap to discover but should be checked before writing the real handler, not discovered by trial and error against a live account |
| A4 | Manage-token minting is better done eagerly (inside the checkout RPC) than lazily (in the webhook consumer) | D-12, UNCERTAIN U-03 | LOW-MEDIUM — both are workable; picking wrong just means a later refactor to move the mint call, not a security or correctness defect |
| A5 | `checkout.session.completed` + `payment_status` check is Stripe's currently-recommended fulfillment event for a Checkout-Session-based integration, over branching on `payment_intent.succeeded` directly | D-10 | MEDIUM — if wrong, the consumer still works (both events fire and are idempotent against the same dedupe/ordering scheme) but may run redundant logic on both events; not a correctness risk, an efficiency one |

**If this table is empty:** N/A — see rows above.

## Open Questions

1. **Does the checkout page need to suppress `SiteHeader`'s own "Book a transfer" CTA while a
   payment is in progress?**
   - What we know: the mock does not set `cta="{{ no }}"` on either checkout or confirmation.
   - What's unclear: whether a customer clicking that CTA mid-payment (opening a second booking
     flow in the same tab) is a real risk worth a prop change, or a non-issue because the booking
     widget's own state (`vamosTrip`) would simply be overwritten harmlessly.
   - Recommendation: leave as the mock has it (CTA visible) unless the UI phase (`/gsd:ui-phase 7`,
     if run) flags it — this is a UX polish question, not a correctness one.

2. **Exact copy for "the charge currency must be stated in words, not only implied by the mark"**
   (ADR-004's own cost note, still binding).
   - What we know: ADR-004 explicitly requires checkout to state the charge currency in words, in
     all four languages; ADR-014 §1 repeats "Copy in en/de/fr/ar" as an open item for Phase 7.
   - What's unclear: the exact string and where it renders relative to the Currency Selector
     Element (Stripe's own placement guidance says "near the order total").
   - Recommendation: this is `/gsd:ui-phase 7` / discuss-phase territory, not a research gap —
     flag for the UI spec pass.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Stripe account (CH entity) | PAY-02, all of Phase 7's server-side work | ✗ | — | Owner creates when asked (ADR-014 §4); **test-mode API keys are available immediately on signup, before business verification completes** — Phase 7 can be built and tested in test mode without waiting for full CH-entity verification (see Owner Blockers) |
| Stripe Adaptive Pricing enablement | D-02 (multi-currency charging) | ✗ (account doesn't exist) | — | Cannot verify until the account exists; CH is not in Stripe's excluded-region list for Adaptive Pricing (only India is named as excluded) — no fallback needed if account is created, only a confirmation step |
| Resend account | PAY-06 | ✗ | — | Owner creates when asked (ADR-014 §4); Resend's own onboarding/sandbox mode typically allows test sends before a custom sending domain is verified — confirm at Wave 0 |
| `packages/emails`'s actual dependencies | PAY-06 | ✗ (empty scaffold, `main: index.ts` pointing at a non-existent file) | — | This phase is what fills it — no fallback needed, it is in-scope work |
| Cloudflare Queues `STRIPE_EVENTS` binding | PAY-04/05 | ✓ (declared in `wrangler.jsonc` under both `env.staging` and `env.production`) | — | — |
| Stripe CLI (local dev, webhook forwarding) | Local dev-loop testing | ✗ (not installed in this research environment) | — | `stripe listen --forward-to localhost:.../api/stripe/webhook` per Stripe's own local-testing guidance — install at Wave 0, not a design blocker |
| `pnpm db:*` / Supabase CLI commands | Would run pgTAP for the additive migration (D-03) | not run this session (explicit constraint: this research must not touch the database or working tree owned by another agent) | — | Deferred to the planner/executor |

**Missing dependencies with no fallback:**
- The real CHF price matrix — genuinely blocks a *committed, customer-visible* charge in any
  environment (by design, per `pricing_live=false`/QUOTE-10's "no off switch"). Does **not** block
  building or unit/integration-testing this phase (see Owner Blockers below for the E2E-testing
  nuance).

**Missing dependencies with fallback:**
- Stripe/Resend accounts: owner-provisioning is a known, named blocker with an explicit "ask when
  needed" pattern already established (ADR-014 §4); test-mode keys de-risk most of the build work.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | pgTAP (via Supabase CLI, `packages/db`) for DB-level proofs; Vitest for pure TS logic (webhook verification, ordering); Playwright for E2E/visual (`apps/web/tests`) |
| Config file | `packages/db/supabase/config.toml` (exists); `apps/web/vitest.config.ts` (installed by Phase 4 Wave 0 — Phase 7 depends on Phase 4, so this should already exist by Phase 7's execution time); `apps/web/playwright.config.ts` (exists) |
| Quick run command | `pnpm --filter @vamos/db run test:db supabase/tests/checkout_rpc.test.sql` / `pnpm --filter web exec vitest run lib/checkout` |
| Full suite command | `pnpm db:reset && pnpm db:test` + `pnpm --filter web exec vitest run` + `pnpm test:visual` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| PAY-01 | Guest reaches checkout with locked quote, enters details | integration (Playwright) | `pnpm test:visual -- checkout-guest.spec.ts` | ❌ Wave 0 |
| PAY-02 | Pays by card/Apple/Google/TWINT, charged appropriately | E2E (Playwright + Stripe test mode) + pgTAP (FX CHECK) | `pnpm --filter @vamos/db run test:db supabase/tests/checkout_rpc.test.sql` | ❌ Wave 0 |
| PAY-03 | Completes as guest, no account | integration (Playwright) + pgTAP (RLS grant model) | same as PAY-01/02 | ❌ Wave 0 |
| PAY-04 | Confirmed only by webhook, never browser return | unit (Vitest, mocked Stripe event POST directly at the route, no browser redirect involved) | `pnpm --filter web exec vitest run lib/checkout/webhook` | ❌ Wave 0 |
| PAY-05 | Repeat/out-of-order webhook can't double-charge/confirm/email | pgTAP (`stripe_events` PK, `booking_payments_one_success`, `booking_notifications.dedupe_key` — schema-level, exists once Phase 2 Wave 6 lands) + Vitest (ordering logic) | `pnpm --filter @vamos/db run test:db supabase/tests/charge_gate.test.sql` | ⚠️ depends on Phase 2 Wave 6 timing |
| PAY-06 | Confirmation email, 4 languages, voucher + manage link + ICS | unit (Vitest snapshot per locale) + integration (Resend test mode) | `pnpm --filter @vamos/emails exec vitest run` | ❌ Wave 0 |
| PAY-07 | Confirmation page shows reference/route/time/vehicle/paid | visual (Playwright, 4 breakpoints × en/de minimum per CLAUDE.md) | `pnpm test:visual -- confirmation.spec.ts` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** the relevant quick-run command for the file touched (pgTAP file, Vitest
  file, or Playwright spec).
- **Per wave merge:** `pnpm db:reset && pnpm db:test` + `pnpm --filter web exec vitest run`.
- **Phase gate:** full suite green, plus the Stripe test-mode E2E pass described in Owner
  Blockers, before `/gsd:verify-work`.

### Wave 0 Gaps
- [ ] `packages/db/supabase/tests/checkout_rpc.test.sql` — RPC grant model, coupon lock, manage-token mint, FX CHECK constraint
- [ ] `apps/web/tests/integration/checkout-guest.spec.ts` — covers PAY-01/03
- [ ] `apps/web/lib/checkout/webhook.test.ts` (Vitest) — covers PAY-04/05's non-browser-driven confirmation
- [ ] `apps/web/tests/visual/confirmation.spec.ts` — covers PAY-07
- [ ] `packages/emails/src/*.test.tsx` — covers PAY-06's 4-language render proof
- [ ] Confirm `apps/web/vitest.config.ts` exists (should, from Phase 4 Wave 0 — verify, don't assume)
- [ ] Stripe CLI installed locally for `stripe listen` webhook forwarding (dev-loop, not CI)

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-------------------|
| V2 Authentication | partial | Guest checkout is intentionally unauthenticated (PAY-03); signed-in path reuses Supabase Auth (Phase 1/6), not built here |
| V3 Session Management | yes | Guest manage-token: 32-byte random, SHA-256 hashed *before* reaching Postgres, reusable-not-single-use (already designed, Phase 2) — Phase 7 must not log the raw token anywhere (request logs, Sentry breadcrumbs, error messages) |
| V4 Access Control | yes | `SECURITY DEFINER` RPC grant model (D-05); RLS `FORCE ROW LEVEL SECURITY` on the append-only tables; no INSERT grant on `bookings` for any client role |
| V5 Input Validation | yes | zod schema on `/api/checkout/intent` body (Phase 4's contract, reused); webhook body is trusted only after `constructEventAsync` signature verification succeeds, never parsed/trusted before that |
| V6 Cryptography | yes | Stripe webhook HMAC verification via the SDK's own `constructEventAsync`/`createSubtleCryptoProvider` — never hand-rolled (Don't Hand-Roll); manage-token SHA-256 hashing already specified in Phase 2, reused unchanged |
| V14 Configuration | yes | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` reach the Worker via `wrangler secret put` only, never `NEXT_PUBLIC_*`; the existing `scripts/check-next-public-allowlist.mjs` CI gate (Phase 1) already fails a build that leaks a forbidden substring into the client bundle — no new gate needed, just don't violate the existing one |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|-----------------------|
| Retried/double-submitted checkout POST creates two bookings/charges | Tampering | `idempotency_key` (client-minted per attempt) forwarded to Stripe's own `Idempotency-Key`; `bookings_idempotency` partial unique index; `booking_payments_one_success` partial unique index — both already designed in Phase 2 |
| Forged webhook payload (attacker POSTs a fake `payment_intent.succeeded`) | Spoofing | `constructEventAsync` signature verification, reject on any failure — never process an unverified body |
| Replay of a legitimate past webhook to re-trigger confirmation/email | Replay / Tampering | `stripe_events` PK on Stripe's own event id + `processed_at` check before the consumer re-runs any side effect |
| Client-supplied price/currency/total smuggled into the checkout intent body | Tampering | zod boundary rejects `distance_m`/`total_rappen`/`rate_version_id`/`lines` from the client (Phase 4's existing contract); the charge gate re-derives everything server-side from the snapshot regardless |
| Manage token leaked via logs, Referer header, or error message | Information Disclosure | Hash-before-Postgres (already Phase 2); never log the raw token; the RPC's return value is the only place it exists in plaintext, and only in the response body over TLS |
| `STRIPE_WEBHOOK_SECRET`/`STRIPE_SECRET_KEY` leaked into the client bundle | Elevation of Privilege | `wrangler secret put` only; existing `check-next-public-allowlist.mjs` CI gate (Phase 1) already scans the built client bundle for forbidden substrings |
| Card/payment data touching Vamos's own server or logs | Elevation of Privilege / compliance | Never handled — Stripe Elements/Checkout renders the card fields inside Stripe's own iframe; PAN never crosses into `apps/web`'s JS or the Worker at all (SAQ A-eligible integration shape by construction) |

## Owner blockers that touch this phase

1. **Stripe account does not exist yet.** Owner creates when asked (ADR-014 §4). **Nuance that
   de-risks the schedule:** Stripe issues **test-mode** API keys immediately on signup, before
   full CH-entity business verification completes — Phase 7's entire build and most of its testing
   can proceed in test mode the moment the account is created, without waiting for live-mode
   activation. Live keys/webhook endpoint are a Phase 11 launch-checklist item (already in
   `GSD-LAUNCH.md`), not a Phase 7 blocker.

2. **Stripe Adaptive Pricing enablement is unverifiable until the account exists.** Once created,
   confirm in **Settings → Adaptive Pricing** in the Stripe Dashboard. CH is not in Stripe's
   documented exclusion list (only Indian businesses are excluded) — no reason to expect a
   problem, but this is a real "must confirm" step, not a formality to skip.

3. **TWINT enablement** requires the account to exist and (per this project's own `STACK.md`) a CH
   entity to receive TWINT payouts — toggle in **Settings → Payment methods** once available.

4. **Resend account does not exist yet.** Owner creates when asked (ADR-014 §4). A production
   sending-domain DNS verification is needed before real emails leave a `@vamostaxi.eu` address;
   Resend's own test/sandbox sending mode should unblock Wave 0 development regardless — confirm
   this at Wave 0 rather than assuming.

5. **The CHF price matrix is still open — and it creates a genuine tension with "Stripe test-mode
   E2E green" as a phase-exit bar.** `pricing_live=false` means `/api/checkout/intent` 409s for
   every caller (Phase 4's own contract, §9) — by design, with no off switch. A real Stripe
   test-mode charge-to-webhook-to-confirmation proof therefore needs **at least one `status='live'`
   `rate_versions` row** to exist somewhere reachable by the test. Phase 2's own precedent
   (`charge_gate.test.sql`'s synthetic 1/2/3-rappen fixture, explicitly commented "rolled back,
   never a real CHF amount") and Phase 4's own P8 plan tier ("staging `PRICING_PREVIEW`") both
   establish that a **staging-only, clearly-labeled, never-seeded, never-production synthetic test
   rate version** is the established pattern for exactly this situation — but CLAUDE.md's Law 04
   is written strictly enough ("never invent a CHF price anywhere — not in a migration, the seed,
   a fixture, or a screenshot") that this should not be assumed without an explicit sign-off. **This
   needs an explicit go-ahead before Phase 7's E2E proof plan (P8, below) is executed**, not a
   silent assumption either way.

## Proposed Phase 7 plan split

| # | Plan | Goal (one line) | File scope | Depends on | Parallel with |
|---|---|---|---|---|---|
| **P1** | **FX schema addition** | `booking_payments` gets `fx_rate`/`fx_source`/`fx_quoted_at`/`presentment_amount_minor`, relaxed `charged_currency` CHECK, unchanged charge gate (D-03) + pgTAP proving the gate is unmodified | `packages/db/supabase/migrations/<ts>_payment_fx.sql`, `tests/charge_gate_fx.test.sql` | Phase 2 Wave 6 landing (coordinate timing — this may fold into that plan instead of being separate, see Owner Blockers note) | nothing (schema gate) |
| **P2** | **Checkout-creation RPC** | `public.checkout_create_booking(...)` (Pattern 2): booking + legs + snapshot bind + coupon lock + payment-attempt row + manage-token mint, all in one transaction; pgTAP proving the RLS-grant model (direct insert still `42501`, RPC call succeeds under `anon`/`authenticated`) | `packages/db/supabase/migrations/<ts>_checkout_rpc.sql`, `tests/checkout_rpc.test.sql` | P1 | nothing |
| **P3** | **`/api/checkout/intent` Worker route** | Phase 4's quote re-check (steps 1–5, already specified) + Stripe Checkout Session creation (Adaptive Pricing, `automatic_payment_methods`, `expand: payment_intent`) + call P2's RPC + `sessions.expire()` compensation on gate failure | `apps/web/app/api/checkout/intent/route.ts`, `apps/web/lib/checkout/stripe.ts` | P2 | nothing |
| **P4** | **Checkout page port** | `checkout.dc.html` → Next.js Client Component; drop PayPal/Cash radio (D-15); mount `CheckoutElementsProvider`/`CurrencySelectorElement`/`PaymentElement` inside the existing `Card`/`RouteSummary`/`PriceSummary` chrome; four-language pass (the mock ships en/de only — add fr/ar in this pass); RTL check | `apps/web/app/(public)/checkout/page.tsx`, i18n dictionary additions | P3 | P5 |
| **P5** | **Webhook route + Queue consumer** | `POST /api/stripe/webhook` (verify+dedupe+enqueue, Pattern 3); `queue()` consumer in `worker.ts` gains its first real case (state machine `pending→paid→confirmed`, `booking_events` write, ordering per `(object_id, stripe_created)`) | `apps/web/app/api/stripe/webhook/route.ts`, `apps/web/worker.ts`, `apps/web/lib/checkout/webhook-verify.ts` | P1 (schema shape) | P4 |
| **P6** | **Confirmation email + calendar invite** | `packages/emails`'s first real template (`ConfirmationEmail.tsx`, 4 languages), `ics` generation, claim-then-send against `booking_notifications` (D-14), voucher + manage link content | `packages/emails/src/ConfirmationEmail.tsx`, `src/lib/render.ts`, `src/lib/ics.ts` | P2 (needs the manage token), P5 (needs the consumer to call it) | P7 |
| **P7** | **Confirmation page** | `/confirmation/[ref]` SSR page: "processing" state that polls/subscribes for the webhook-driven flip (Pitfall 1), then renders reference/route/time/vehicle/amount paid; four languages, four breakpoints | `apps/web/app/(public)/confirmation/[ref]/page.tsx` | P3 (return_url contract), P5 (status source) | P6 |
| **P8** | **E2E proof + owner-blocker-aware test fixture** | Stripe CLI local webhook forwarding harness; the staging-only synthetic test rate version (**pending explicit sign-off**, see Owner Blockers item 5); full test-mode E2E (book → pay → webhook → confirm → email); TWINT sandbox pass; out-of-order/duplicate webhook simulation; idempotent-retry simulation | test harness scripts, staging seed fixture (gated) | P1–P7 | nothing (phase gate) |

```
P1 ── P2 ── P3 ──┬── P4 ──┐
                  ├── P5 ──┼── P6 ── P8
                  │        └── P7 ──┘
                  └────────────────┘
```
Wave 1: **P1**. Wave 2: **P2**. Wave 3: **P3**. Wave 4: **P4** and **P5** in parallel (P4 touches
only the client page; P5 touches only the webhook route/consumer — file-disjoint). Wave 5: **P6**
and **P7** in parallel (P6 touches `packages/emails`; P7 touches the confirmation page —
file-disjoint). Wave 6: **P8**, the phase gate, blocked on the owner sign-off named in Owner
Blockers item 5.

## Sources

### Primary (HIGH confidence)
- `docs.stripe.com/elements/currency-selector-element` — fetched live, 2026-08-24
- `docs.stripe.com/payments/currencies/localize-prices/adaptive-pricing` (+`?payment-ui=embedded-components`) — fetched live, 2026-08-24
- `docs.stripe.com/payments/twint/accept-a-payment` (+`?payment-ui=direct-api`) — fetched live, 2026-08-24
- Stripe API reference, "Expire a Checkout Session" (`docs.stripe.com/api/checkout/sessions/expire`) — WebSearch-corroborated, official domain
- This project's own `.planning/research/STACK.md` §3/§5 (Stripe on Workers, webhook verification, Queues) — HIGH confidence there, cited not re-derived
- This project's own `.planning/research/PITFALLS.md` Pitfalls 5, 6, 7 — HIGH-confidence prior research, cited
- `.planning/phases/02-data-schema-rls-staff-auth-foundations/02-SCHEMA-DRAFT.md` §7–§10, §14a/14b — direct read of the designed schema
- `.planning/phases/02-data-schema-rls-staff-auth-foundations/02-06-PLAN.md` `<interfaces>`/`<deferred>` — the binding money-table contract and the explicit F-14 hand-off
- `packages/db/supabase/migrations/20260823000004_settings.sql` — direct read of the actual executed migration (ground truth over the stale schema-draft prose for `settings_versions` columns)
- `.planning/ADR-004-currency-display-only.md`, `.planning/ADR-014-owner-sitting-2026-08-22.md` — direct read
- `.planning/phases/04-quote-pricing-engine/04-API-CONTRACT.md` §6, `research/quote-lock-expiry.md` — direct read of the illustrative checkout-intent sketch this research corrects
- npm registry metadata (`npm view`, `curl registry.npmjs.org`, `api.npmjs.org/downloads`) — fetched live, 2026-08-24

### Secondary (MEDIUM confidence)
- WebSearch aggregation on `checkout.session.completed` vs `payment_intent.succeeded` fulfillment guidance (D-10) — multiple corroborating community/official sources, not a single authoritative page fetched directly
- WebSearch aggregation on Resend attachments/`.ics` send shape — not fetched from Resend's own docs page directly this session
- WebSearch on Stripe idempotency key best practices — general guidance, consistent with this project's own established `idempotency_key` design (Phase 4)

### Tertiary (LOW confidence)
- Exact `ui_mode` enum value for the custom-Elements Checkout integration (`'custom'` vs
  `'elements'`) — sources disagreed; flagged as UNCERTAIN U-01, not asserted as fact anywhere in
  this document's Decisions table

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — every package version-verified live against the npm registry, all major
  Stripe/Resend integration claims fetched from official docs during this session
- Architecture: MEDIUM-HIGH — the Checkout-Session-vs-PaymentIntent reconciliation (D-02) is new
  synthesis this research performs, not a pre-existing decision; everything downstream of that
  choice (RPC pattern, webhook pattern) is HIGH confidence, directly cited from the codebase's own
  design intent
- Pitfalls: HIGH — five of the project's own PITFALLS.md items already cover this domain at HIGH
  confidence; this research adds two Phase-7-specific pitfalls (illustrative-code-as-spec,
  two-sources-of-truth-for-payment-methods) reasoned from direct schema/docs evidence

**Research date:** 2026-08-24
**Valid until:** 14 days (Stripe's Adaptive Pricing / Checkout Elements APIs are actively evolving
— the `ui_mode` naming disagreement found in this research is itself evidence of that; re-verify
against Stripe's live API reference before writing the final handler if more than two weeks pass)
