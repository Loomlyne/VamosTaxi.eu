# Architecture Research

**Domain:** v1.2 Payment on the existing Worker `vamos` + Supabase `yaumjzvylngfjhtuffqs` + Stripe TEST Checkout (Custom / `ui_mode: elements`)
**Researched:** 2026-09-22
**Confidence:** HIGH on the live code path (intent, pay-link, webhook, settle, PaymentPanel). MEDIUM on Dashboard-only methods (TWINT needs a Swiss Stripe entity; Google Pay is currently forced `never` in the Express element).

v1.2 does **not** add a second payment stack. Phase 7 already created the unpaid booking, Checkout Session, webhook, queue, and settle RPCs. This milestone makes that path take a real TEST charge on `vamostaxi.site`, refuse unpriced/expired quotes visibly, and finish the dual-payer (in-page + email pay-link) product rules. Live Stripe later is wrangler secret/config swap only. Charge currency is always CHF. Do not invent fares. Do not write `sk_live_`. Do not wipe `yaumjzvylngfjhtuffqs` — existing paid Zurich bookings are real.

v1.1 Ops Support architecture is archived at `.planning/research/v1.1-archive/ARCHITECTURE.md`. v1.0 booking architecture is at `.planning/research/v1.0-archive/ARCHITECTURE.md`.

## Standard Architecture

### System Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ Browser (guest or JWT email)                                                │
│  /checkout/{trip,details,payment}   /checkout/pay/[token]   /bookings       │
│  /confirmation/[ref]  (polls status; never confirms)                        │
│  PaymentPanel: CardNumberElement + ExpressCheckoutElement                   │
│  confirm({ paymentMethod: card.id })  |  wallets via express event          │
└───────────────┬───────────────────────────────┬─────────────────────────────┘
                │ POST intent / pay-link / open │ GET /api/checkout/status/:ref
                ▼                               ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ ONE Cloudflare Worker `vamos` (Next.js 15 / OpenNext)                       │
│  ┌──────────────────┐ ┌──────────────────┐ ┌─────────────────────────────┐  │
│  │ POST /api/       │ │ POST /api/       │ │ POST /api/stripe/webhook    │  │
│  │ checkout/intent  │ │ checkout/pay-link│ │ verify → stripe_event_record│  │
│  │ runCheckoutIntent│ │ + setPayLink     │ │ → STRIPE_EVENTS.send        │  │
│  └────────┬─────────┘ │ + sendPayLink    │ │ ACK 200. No state machine.  │  │
│           │           └────────┬─────────┘ └──────────────┬──────────────┘  │
│  ┌────────┴────────────────────┴─┐                        │                 │
│  │ POST /api/checkout/pay-link/  │                        │                 │
│  │ open  (token → client_secret) │                        │                 │
│  └───────────────────────────────┘                        │                 │
└──────┬──────────────┬──────────────┬──────────────────────┴─────────────────┘
       │ Hyperdrive   │ Stripe API   │ Queue produce
       ▼              ▼              ▼
┌────────────┐  ┌─────────────┐  ┌──────────────────┐
│ Postgres   │  │ Stripe TEST │  │ Queue consumer   │
│ (RLS; RPC  │  │ Checkout    │  │ worker.ts queue()│
│ writers    │  │ Session     │  │ handleStripeMsg  │
│ only)      │  │ CHF charge  │  │ settle.ts        │
└────────────┘  │ Adaptive FX │  └────────┬─────────┘
                │ presentment │           │ asSystem
                └─────────────┘           ▼
                                 checkout_payment_settle
                                 → booking paid→confirmed
                                 → deliverConfirmation
                                 (traveller manage; other
                                  payer should be receipt)
```

### Component Responsibilities

| Component | Responsibility | Typical Implementation |
|-----------|----------------|------------------------|
| `PaymentPanel.tsx` | Paint card + wallets; confirm against the Checkout Session `client_secret` | `@stripe/react-stripe-js/checkout` CheckoutElementsProvider + split Card Elements. Confirm is `checkout.confirm({ paymentMethod: card.id })`. Wallets use `expressCheckoutConfirmEvent`. |
| `CheckoutClient.tsx` | Trip/details/payment chrome; `startPayment` → intent; email pay-link; Pay and continue | Maps refusal codes to i18n. Today `invalid_request` collapses to `payCouldNotStart`. |
| `PayClient.tsx` | Token page: recap + same PaymentPanel; payer cannot edit the trip | `POST /api/checkout/pay-link/open` then confirm. |
| `/bookings` list | Unpaid `pending` row → `/checkout/payment` | `mapAccountBooking`: `pending` → UI `unpaid`, `payable` unless `is_test`. |
| `POST /api/checkout/intent` | Mint unpaid VT- + Checkout Session `client_secret` | Thin route. Business in `lib/checkout/intent.ts`. Writes only via `checkout_create_booking` / `checkout_attach_payment`. |
| `POST /api/checkout/pay-link` | Same intent, then token + branded mail | `runCheckoutIntent` → `checkout_set_pay_link` → Resend. 24h clock does not restart on resend. |
| `POST /api/checkout/pay-link/open` | Token → reusable `client_secret` | `checkout_pay_link_by_hash` then `checkout_open_payment` / `checkout_attach_payment`. Never a second chargeable session if one is still open. |
| `POST /api/stripe/webhook` | Verify, record, enqueue, 200 | `constructEventAsync`. No settle. No email. |
| `worker.ts` `queue()` | At-least-once consumer | `handleStripeMessage` → `checkout_payment_settle`. |
| `lib/checkout/stripe.ts` | The only Stripe client | Fetch HTTP client. `ui_mode: "elements"`. Charge `chf`. No `payment_method_types`. |
| `sessionIsPayable` | Reuse vs mint gate | Exported from `stripe.ts` (no standalone `sessionIsPayable.ts`). Needs `client_secret`, `status=open`, CHF amount match. |
| Postgres RPCs | System of record | `vamos_checkout` writes bookings/payments. `vamos_system` settles. Browser roles have no EXECUTE. |
| `is_test` | Test unpaid never opens Stripe; settle never captures | Intent `loadQuotePayGate`, pay-link/open, capture gate, `/bookings` Pay off. |
| Confirmation page | Wait room until webhook | Poll `GET /api/checkout/status/[ref]`. `confirm()` must not mark paid. |

## Recommended Project Structure

Keep the Phase 7 layout. v1.2 edits these files; it does not add a second app or a second Worker.

```
apps/web/
├── app/
│   ├── [locale]/
│   │   ├── checkout/
│   │   │   ├── CheckoutClient.tsx      # MODIFY — visible refusals, pay-link fields
│   │   │   ├── PaymentPanel.tsx        # MODIFY — wallets (Google Pay/TWINT/Link)
│   │   │   └── pay/[token]/PayClient.tsx  # MODIFY — DC recap; same panel
│   │   ├── confirmation/[ref]/         # KEEP — poller is the thank-you wait
│   │   └── account/bookings            # KEEP — unpaid href already /checkout/payment
│   └── api/
│       ├── checkout/
│       │   ├── intent/route.ts         # MODIFY only if wiring/refusals
│       │   ├── pay-link/route.ts       # MODIFY — company name+VAT, address optional
│       │   ├── pay-link/open/route.ts  # KEEP/tighten — reuse session
│       │   └── status/[ref]/route.ts   # KEEP — webhook wait
│       └── stripe/webhook/route.ts     # KEEP — verify/record/enqueue
├── lib/checkout/
│   ├── stripe.ts                       # KEEP — CHF, elements, no method map
│   ├── intent.ts                       # MODIFY — stop hiding priced-class failures
│   ├── create-booking.ts               # KEEP
│   ├── attach-payment.ts               # KEEP — second path on same booking
│   ├── load-open-payment.ts            # KEEP
│   ├── set-pay-link.ts                 # KEEP wrapper; SQL may relax address
│   ├── pay-link.ts                     # MODIFY — companyReady vs PROJECT.md
│   ├── webhook.ts / webhook-verify.ts  # KEEP
│   ├── settle.ts                       # KEEP first-wins; capture gate
│   └── notify.ts                       # MODIFY — traveller confirm vs payer receipt
├── worker.ts                           # KEEP queue + expire-unpaid cron
└── wrangler.jsonc                      # pk_test_ in vars; secrets never in git

packages/db/supabase/migrations/        # NEW SQL only if pay-link VAT/address rule changes
packages/emails/                        # NEW receipt template for other payer
```

### Structure Rationale

- **One Worker, one Stripe client, one charge currency.** Methods are Dashboard + Adaptive Pricing, not a Worker enum.
- **RPC writers stay behind identity doors.** Intent/pay-link = `asCheckout` (`vamos_checkout`). Webhook settle/email = `asSystem` (`vamos_system`). Do not grant table SELECT to `vamos_checkout` to “simplify” open-payment.
- **UI chrome stays Vamos.** Stripe paints fields inside existing DC classes. Do not redirect to hosted Checkout.
- **Emails stay in `packages/emails`.** `notify.ts` claims/settles the ledger; it must not confirm the booking.

## Architectural Patterns

### Pattern 1: Unpaid booking first, Stripe session second, webhook last

**What:** Traveller-complete details (`isTravelerComplete`) call `startPayment` → `POST /api/checkout/intent` → Stripe Checkout Session → `checkout_create_booking` (pending + `booking_payments.requires_payment`). The browser confirms with Stripe. Postgres becomes `paid`/`confirmed` only in `checkout_payment_settle`.

**When to use:** Every v1.2 pay surface (checkout Pay, `/bookings` unpaid, token page).

**Trade-offs:** An abandoned pending row exists until expire-unpaid cron or home `POST /api/checkout/abandon`. That is required so a refresh can reuse `client_secret` instead of 409 `quote_already_booked`.

**Example:**
```typescript
// intent.ts — reuse open session before minting
const existingOpen = await deps.loadOpenPayment(body.quote_id);
const reused = await payableFromOpen(existingOpen, deps, chargedRappen);
if (reused) return okIntentResponse(reused.row, reused.payable, ...);
```

### Pattern 2: Dual path, first webhook wins

**What:** Email pay-link and in-page card may both sit on the same pending booking. `checkout_attach_payment` inserts a second `booking_payments` row while status is still `pending`. Unique index `booking_payments_one_success_per_snapshot` plus settle’s `already_settled` make the second succeeded event a no-op (23505 ack, no second capture, no second confirmation mail).

**When to use:** Always. Do not serialize the two UIs.

**Trade-offs:** Two open Checkout Sessions can exist. The loser must still land on the same confirmation. Expire or fail the losing session after the winner settles so Stripe does not retry capture.

**Example:**
```sql
-- checkout_attach_payment: refuse if already succeeded; else INSERT requires_payment
if exists (select 1 from booking_payments where booking_id = v_booking.id and status = 'succeeded')
  then raise quote_already_booked;
```

### Pattern 3: Test/live coherence is secrets + `is_test`, not a code fork

**What:** Staging binds `sk_test_` / `pk_test_` / `whsec_` from `stripe listen` or the TEST Dashboard endpoint. A later live account is `wrangler secret put STRIPE_SECRET_KEY` + `STRIPE_WEBHOOK_SECRET` and a `pk_live_` var swap. `bookings.is_test` stays the capture/pay gate so a leftover test unpaid never opens a live session.

**When to use:** Cutover. Not v1.2 execution.

**Trade-offs:** Mixing test charges into live (or the reverse) is a data bug, not a Stripe bug. Do not copy test `cs_` / `pi_` ids into a live account. Do not invent CHF to “make TEST look live”.

### Pattern 4: Visible refusal, closed vocabulary

**What:** `lib/checkout/errors.ts` is the only intent/pay-link error shape. Unpriced class (`total_rappen == null`) is `409 pricing_not_live`. Expired lock is `409 quote_expired`. Schema/HMAC/`is_test`/missing session secret is `400 invalid_request`. The UI must show the mapped key, not swallow it as `payCouldNotStart`.

**When to use:** Every 4xx from intent and pay-link. UAT: success, 3DS, decline, expired, unpriced.

**Trade-offs:** `invalid_request` is still a bucket. v1.2 should stop mapping `pricing_not_live` and `quote_expired` into that bucket on the client, and should not mint Stripe objects for unpriced classes (already true in `intent.ts` once `chosen?.total_rappen` is null).

## Data Flow

### Request Flow — traveller pays in page

```
Details complete
    ↓
CheckoutClient.startPayment
    ↓  POST /api/checkout/intent
checkIntentAgainstLock → refuse quote_expired / pricing_not_live / …
is_test? → 400 invalid_request
netRappen null? → 409 pricing_not_live
loadOpenPayment + sessionIsPayable? → reuse client_secret
    else createCheckoutSession (CHF rappen, ui_mode elements)
checkout_create_booking | checkout_attach_payment
    ↓
PaymentPanel: createPaymentMethod(card) → checkout.confirm({ paymentMethod: card.id })
    ↓ (3DS/TWINT may leave the tab)
router.push /confirmation/{ref}
    ↓ poll GET /api/checkout/status/{ref}
wait until webhook settle paints confirmed | failed
```

### Request Flow — email pay-link + whoever-first

```
Checkout “email a pay link”
  company name + VAT required; address optional (PROJECT.md; SQL today still requires address)
  payer email required
    ↓  POST /api/checkout/pay-link
runCheckoutIntent (same unpaid VT- + session)
checkout_set_pay_link (pay token; pay_link_sent_at first-send wins 24h)
Resend branded recap → passenger + payer
    ↓
Payer: /checkout/pay/[token] → POST pay-link/open → PaymentPanel (no edit)
Traveller: /checkout/payment → same booking, possibly second session via attach_payment
    ↓
Stripe checkout.session.completed (payment_status=paid)
    ↓  webhook verify/record/enqueue
queue: checkout_payment_settle
  first succeeded → pending→paid→confirmed
  second succeeded → 23505 / already_settled
    ↓
notify: traveller confirmation + manage link
        other payer receipt only (gap today: both get sendConfirmation)
Loser UI: same /confirmation/{ref} voucher
```

### State Management

```
Quote lock (HMAC, 24h)     → charge amount + pay-link TTL
bookings.status            → quote | pending | paid | confirmed | cancelled
booking_payments.status    → requires_payment | succeeded | failed | canceled
stripe_events              → dedupe + processed_at with settle
is_test                    → never capture, never open Stripe
display currency           → header FX only; Stripe line is CHF
```

Client: `vamosTrip` / quote lock in storage until home wipe. Server lock is authority. Do not recompute CHF at pay.

### Key Data Flows

1. **Intent amount:** lock class `total_rappen` + extras (waiting extra is 0 at pay) + VAT bps from launch flags → `chargedRappen` → Stripe `unit_amount` in `chf`. Null class total never becomes a made-up fare.
2. **Session reuse:** `checkout_open_payment` returns latest `requires_payment` session id; Worker retrieves Stripe; `sessionIsPayable` decides reuse vs mint+attach.
3. **Fulfillment:** `checkout.session.completed` + `payment_status === paid` (covers card and delayed TWINT). Not `payment_intent.succeeded` alone. Not browser `confirm()`.
4. **Confirmation visibility:** status route needs manage cookie or JWT email matching `contact_email`. Guest pay still sets manage cookie on intent. Token payer without cookie must still see the same confirmation after win (v1.2 must not leave the loser/payer on `visible: false`).
5. **FX:** Adaptive Pricing may present EUR/USD/AED; `fxFromSession` is written at settle for the receipt. Charge stays CHF. Header FX is `/api/fx`, not Stripe.

## New vs modified (v1.2)

### Keep (do not rebuild)

| Piece | Why |
|-------|-----|
| Worker `vamos`, Hyperdrive, project `yaumjzvylngfjhtuffqs` | Live paid Zurich rows |
| `stripeFromEnv` / `CHECKOUT_UI_MODE = "elements"` | Custom Checkout on Vamos chrome |
| RPCs `checkout_create_booking`, `checkout_attach_payment`, `checkout_open_payment`, `checkout_set_pay_link`, `checkout_pay_link_by_hash`, `checkout_payment_settle` | Already the writers |
| Webhook → Queue → settle | Source of truth |
| `CHARGE_CURRENCY = "chf"` | Product law |
| Confirmation poller | Thank-you wait |
| `/bookings` unpaid → `/checkout/payment` | Same pay path |
| `is_test` capture/pay gates | Test/live coherence |

### Modify

| Piece | Change |
|-------|--------|
| `CheckoutClient` refusal map | Show `pricingNotLive` / `quoteExpired` / `paymentWindowClosed`. Stop hiding 400s as silent `payCouldNotStart`. |
| `PaymentPanel` Express options | Enable Google Pay (today `"never"`). Do not add a Worker `payment_method_types` list. TWINT/Link from Dashboard. Confirm path stays `paymentMethod: card.id` for card. |
| `intent.ts` / intent route | Keep unpriced → `pricing_not_live`. Diagnose remaining `invalid_request` (missing `client_secret` on Elements session, `is_test`, zod, empty `vehicleClassId` / `snapshotPolicy`). |
| Pay-link company rule | PROJECT.md: name + VAT required, address optional, no invented VAT format. Today `companyReady` and `checkout_set_pay_link` require address too — SQL + TS must move together. Self-pay does not need business fields. |
| `notify.ts` | Split traveller confirmation (manage URL) from other-payer receipt (no manage). Stop sending the confirmation template to `payer_email`. |
| Token `PayClient` | DC pay screen recap; methods = checkout; expired/unpriced/already-paid visible. |
| Confirmation access | Whoever paid (token or traveller) and the loser path must see the same voucher. |
| `return_url` | Intent currently returns to `/checkout/payment`. 3DS/TWINT should resume into the wait room for that `reference`, not a dead payment step. |

### New

| Piece | Why |
|-------|-----|
| Payer receipt email in `packages/emails` | Product: other payer gets a receipt only |
| Optional small SQL on `checkout_set_pay_link` | Address optional for company |
| Dashboard TEST method enablement (not code) | Card, Apple Pay, Google Pay, TWINT, Link — owner Stripe TEST account |
| UAT script/runbook pass on `vamostaxi.site` | Success, 3DS, decline, expired lock, unpriced `CHF 000` |

Not new: a second Stripe client, Connect, PayPal, PaymentIntent-only API, quote/class rebuild, live DNS, `sk_live_`.

## Build order

Dependency order, not a wish list. Each step is false until the live surface and the live row agree.

1. **Visible refusal on intent/pay-link.** Unpriced class `409 pricing_not_live` must paint. Expired lock must paint. Without this, UAT cannot tell a CHF 000 class from a session-secret bug.
2. **Intent returns a payable `client_secret` for a priced class.** Fix the live 400 `invalid_request` on `POST /api/checkout/intent` and pay-link. Reuse `checkout_open_payment` + `sessionIsPayable`. Do not invent rappen.
3. **Card confirm on PaymentPanel.** Keep `confirm({ paymentMethod: card.id })`. Dummy TEST card captures. Decline stays `pending`, no confirmation mail.
4. **Thank-you waits on webhook.** Confirmation poll already exists; do not treat `confirm()` as paid. Align 3DS/TWINT `return_url` with `/confirmation/{ref}`.
5. **Wallets.** Dashboard methods + Express element (Apple Pay, Google Pay, Link). TWINT if the TEST entity is Swiss; if not, skip with a written note — do not fake TWINT in the Worker.
6. **Whoever-first.** In-page + pay-link on one booking; first `checkout_payment_settle` succeeded wins; unique index holds; loser sees the same confirmation; expire the losing session.
7. **Pay-link product rules.** Company name + VAT; address optional; payer email required; token recap-only; TTL = quote lock 24h (`pay_link_sent_at` first send); token methods = checkout.
8. **Mail split.** Traveller: confirmation + manage. Other payer: receipt only. Ledger `notification_claim` still one confirmation; receipt is a distinct kind.
9. **`/bookings` unpaid.** Same intent reuse (already href `/checkout/payment`). JWT email = `contact_email`. `is_test` keeps Pay off.
10. **Secret-swap design only.** Document `STRIPE_SECRET_KEY` + `STRIPE_WEBHOOK_SECRET` + publishable var. No live keys in v1.2. `is_test` rows never mix into live capture.

Do not start 5–8 while 1–4 still hide failures. Do not apply SQL until the owner says apply. Do not deploy until he says deploy.

## Scaling Considerations

| Scale | Architecture Adjustments |
|-------|--------------------------|
| Staging TEST (now) | One Worker, one TEST Stripe account, Hyperdrive pool, queue batch small. Correctness over throughput. |
| Launch browsers | Public pages cached; pay endpoints remain per-booking writes. Webhook stays verify+enqueue. |
| Two payers on one booking | Not a scale problem — uniqueness of succeeded payment is. |

### Scaling Priorities

1. **First bottleneck:** Stripe webhook latency. Keep the route under Stripe’s timeout; settle on the queue.
2. **Second bottleneck:** Double confirm / double charge under Queue at-least-once. Already handled by `stripe_events` + `already_settled` + unique succeeded index. Do not “fix” by deleting the second payment row by hand on live data.

## Anti-Patterns

### Anti-Pattern 1: Hide `invalid_request` as `payCouldNotStart`

**What people do:** Map every intent 400 to a generic pay failure.
**Why it's wrong:** Unpriced `CHF 000`, `is_test`, missing `client_secret`, and zod failures become indistinguishable. UAT cannot refuse visibly.
**Do this instead:** Keep `REFUSAL_KEYS`. Surface `pricingNotLive` / `quoteExpired` / `paymentWindowClosed`. Log sqlstate on RPC 500; never invent a fare to make the button work.

### Anti-Pattern 2: Confirm the booking in the browser

**What people do:** `confirm()` then `status=confirmed`, or skip the poller.
**Why it's wrong:** TWINT/3DS can leave the tab. Stripe retries. The product says webhook is source of truth.
**Do this instead:** PaymentPanel may navigate to `/confirmation/{ref}`; the page waits on `GET /api/checkout/status/{ref}`.

### Anti-Pattern 3: Pass `payment_method_types` or a second processor

**What people do:** Hard-code card/TWINT/Apple Pay in `sessions.create`, or add PayPal.
**Why it's wrong:** D-09/D-10. Swiss PayPal is out of V1. TWINT is entity-gated in Dashboard.
**Do this instead:** Dashboard Adaptive Pricing + Express element options. Charge CHF.

### Anti-Pattern 4: Mint a new Checkout Session when one is still open

**What people do:** Every Pay click creates `cs_`.
**Why it's wrong:** `quote_already_booked`, lost `client_secret`, two charges racing.
**Do this instead:** `checkout_open_payment` → `sessionIsPayable` → reuse. Attach only when the stored session is dead.

### Anti-Pattern 5: Mix TEST and live money

**What people do:** Put `sk_live_` next to test bookings, or capture `is_test` rows after cutover.
**Why it's wrong:** Real Zurich paid rows live in this project. Test charges must not land on the live account.
**Do this instead:** Secret swap + `is_test` gate. Never restore onto `yaumjzvylngfjhtuffqs`.

### Anti-Pattern 6: Recompute or invent CHF at pay

**What people do:** Use display FX, a hardcoded class floor, or `CHF 000` as `0` then charge anyway.
**Why it's wrong:** Unpriced class must refuse. Display currency is header-only.
**Do this instead:** Lock `total_rappen` + extras + VAT. Null → `pricing_not_live`.

### Anti-Pattern 7: Grant tables to `vamos_checkout` / `vamos_system`

**What people do:** `SELECT` on `bookings` so the Worker can “just look up the row”.
**Why it's wrong:** Ban #5 / identity contract. `vamos_system` looking up bookings without a definer is `42501`.
**Do this instead:** Definer RPCs. `asCheckout` / `asSystem` wrappers stay on the route.

## Integration Points

### External Services

| Service | Integration Pattern | Notes |
|---------|---------------------|-------|
| Stripe TEST | Checkout Session `ui_mode: elements`, webhook, refunds later | Secrets: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`. Publishable in wrangler `vars` (`pk_test_`). No `sk_live_` in v1.2. |
| Stripe Dashboard | Payment methods + Adaptive Pricing | TWINT needs Swiss entity (current TEST account may be UAE — skip with a note). Do not invent a Worker flag. |
| Resend | Pay-link mail, confirmation, receipt | `RESEND_API_KEY`. Pay-link branded recap already exists. Receipt template is new. |
| Cloudflare Queue `STRIPE_EVENTS` | Webhook fan-out | Identifiers only; payload stays in `stripe_events`. |
| Hyperdrive / Postgres | `asQuote` / `asCheckout` / `asSystem` | Direct URL only. Hosted SQL apply is owner-gated. |
| WAF | Skip `/api/stripe/webhook` | Do not Turnstile the webhook. |

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| CheckoutClient ↔ intent | POST JSON + closed refusal codes | Guest; unpaid booking on JWT email when signed in (`actorCustomerId` currently null on the route — signed-in bind is PAY-03 / identity, not a new stack). |
| Intent ↔ Stripe | `createCheckoutSession` idempotency key | Elements often have `payment_intent=null` until confirm; store session id; `checkoutPaymentIntentId` may fall back to `session.id`. |
| Intent ↔ Postgres | RPCs only | `checkout_create_booking` requires `stripe_checkout_session_id` at insert. |
| Pay-link ↔ intent | Same `runCheckoutIntent` | Dual path on purpose. |
| Webhook ↔ settle | Queue message `{eventId, type, objectId}` | Webhook never updates `bookings.status`. |
| Settle ↔ notify | After succeeded && !already_settled | Extra-fare sessions (`metadata.kind=extra`) skip trip confirmation. |
| `/bookings` ↔ payment | href `/checkout/payment` | Same lock in client storage; same intent reuse. |

### Identity doors (load-bearing)

| Door | Role | May |
|------|------|-----|
| `asQuote` | `vamos_quote` | now(), class id lookup, rate book |
| `asCheckout` | `vamos_checkout` | create booking, attach payment, open payment, set pay-link |
| `asSystem` | `vamos_system` | `stripe_event_*`, `checkout_payment_settle`, notification claim |
| JWT customer | `authenticated` | list own bookings by email; cannot confirm pay |

## Live gaps this document is allowed to name

- Intent/pay-link often 400 `invalid_request`; unpriced correctly 409 `pricing_not_live`; UI still folds 400 into `payCouldNotStart`.
- Confirm is card `paymentMethod: card.id` only; Google Pay Express is `"never"`.
- `notify.ts` sends `sendConfirmation` (with manage URL) to `payer_email`.
- `checkout_set_pay_link` still requires company address.
- Intent `return_url` is `/checkout/payment`, not the confirmation wait room.
- `sessionIsPayable` lives in `stripe.ts`, not a separate file.

## Sources

- Live code: `apps/web/lib/checkout/{stripe,intent,create-booking,load-open-payment,attach-payment,set-pay-link,pay-link,webhook,settle,notify,errors}.ts`
- Routes: `apps/web/app/api/checkout/intent/route.ts`, `pay-link/route.ts`, `pay-link/open/route.ts`, `app/api/stripe/webhook/route.ts`
- UI: `PaymentPanel.tsx`, `CheckoutClient.tsx`, `PayClient.tsx`, `ConfirmationClient.tsx`, `lib/account/bookings.ts`
- SQL: `20260827000004_settlement_rpcs.sql`, `20260907000002_checkout_company_paylink.sql`, `20260909133000_checkout_open_payment.sql`
- Product: `.planning/PROJECT.md` (v1.2 Payment), `vamos-booking-flow` skill
- Runbooks: `docs/runbooks/stripe-webhook.md`, `docs/runbooks/stripe-test-mode-e2e.md`
- Prior research (superseded where it says PaymentIntent-only / 30-minute lock): `.planning/research/v1.0-archive/ARCHITECTURE.md`

---
*Architecture research for: Vamos Taxi v1.2 Payment integration*
*Researched: 2026-09-22*
