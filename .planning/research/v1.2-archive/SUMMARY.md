# Project Research Summary

**Project:** Vamos Taxi V1 — milestone v1.2 Payment
**Domain:** Stripe TEST Custom Checkout on `vamostaxi.site` (card, Apple Pay, Google Pay, TWINT, Link); webhook confirms; live account later is wrangler secrets only
**Researched:** 2026-09-22
**Confidence:** HIGH on keep Custom Checkout (`ui_mode: "elements"`), webhook/queue settle, CHF charge, one session per booking, visible unpriced/expired refusal; MEDIUM on TWINT rendering (TEST entity may be UAE) and wallet-button visibility (device/domain)

> v1.2 only. Frozen v1.0 booking research lives in `.planning/research/v1.0-archive/`. Frozen v1.1 Ops Support research lives in `.planning/research/v1.1-archive/`. Do not restate those. Do not number these phases as 16/17/19/20 — those leftovers stay parked. Quote/class rebuild and fare Publish are not this milestone. No `sk_live_`. No `.eu`. No invented fares.

## Executive Summary

v1.2 unfreezes **pay** on a funnel that already exists. Phase 7 minted unpaid `VT-` bookings, Checkout Sessions (`ui_mode: "elements"`), webhook → Queue → `checkout_payment_settle`, and a DC `PaymentPanel`. The product is still a locked Swiss airport-transfer quote: the customer pays that snapshot in Stripe TEST on `vamostaxi.site`, or they requote. Dummy card must capture. Thank-you waits on the webhook. Later live Stripe is `wrangler secret put` + publishable var — not a checkout rewrite.

**Recommended approach:** keep Custom Checkout. Split Card Elements stay the DC card block. Express Checkout Element stays Apple Pay / Link / Google Pay (`"auto"`, not `"never"`). Add Checkout `PaymentElement` only as the TWINT collector (ECE does not list TWINT). Dashboard methods + Adaptive Pricing; never `payment_method_types`. Charge always `chf`. One open Checkout Session per booking; token-open reuses; first successful charge wins; loser sees the same confirmation. Traveller gets confirmation + manage; other payer gets a receipt only. Pay-link needs company name + VAT (address optional); self-pay does not. Unpriced class stays `CHF 000` and refuses visibly. Live book id 15 priced **mahaha** only — do not invent the rest.

**Key risks:** (1) unpriced / expired / `email_failed` collapsed into `payCouldNotStart`; (2) Pay and continue no-ops after pay-link (`updateBillingAddress(null)`, stale confirm); (3) thank-you treating `confirm()` as paid; (4) minting a second payable session so dual-payer double-charges; (5) TEST→live becoming a PaymentIntent rewrite or mixed `pk_test_` / `sk_live_`. Mitigation is the phase order below: visible refusal and a payable `client_secret` before wallets; card capture + webhook wait before dual-payer polish; secrets-only cutover documented, never executed here.

## Reconciled decisions (STACK vs ARCHITECTURE vs FEATURES)

These were explicit disagreements. Roadmap and plans treat the **Decision** column as binding.

| Conflict | STACK | ARCHITECTURE / PITFALLS | FEATURES | Decision | Rationale |
|----------|-------|-------------------------|----------|----------|-----------|
| TWINT on-page | Add Checkout `PaymentElement` inside `CheckoutElementsProvider`; wallets off so ECE keeps wallets | Skip UAT with a written note if TEST entity is UAE; never stub a TWINT radio | P1 Swiss differentiator; ECE unsupported | **Both.** Mount PaymentElement as TWINT collector. UAT skip with a written note if Dashboard cannot offer TWINT. No Worker flag. No fake method. | Live cutover must stay secrets-only, so the collector has to exist. Capability is Dashboard, not code. |
| `async_payment_succeeded` | **Add** — today `outcomeFor` returns `"ignore"` | `checkout.session.completed` + retrieved `payment_status === "paid"` already covers delayed TWINT | Webhook is SoT; poller observes | **Add** the event to the same succeed path. Still retrieve Session; still gate on `payment_status`. Do not fulfill on `payment_intent.succeeded` alone. | Cheap insurance. TWINT is usually immediate; delayed methods must not sit as `"ignore"`. |
| Google Pay | ECE `googlePay: "auto"` (not `"always"`) | Enable; tests currently freeze `"never"` | PROJECT.md lists it; P1 if product wins | **Product wins.** `"auto"`. Unlock `checkout-comments.test.ts`. | `"never"` is a code freeze against the milestone list. `"always"` lies on Safari. |
| `return_url` | Not a STACK change | Intent returns `/checkout/payment`; 3DS/TWINT should resume into `/confirmation/{ref}` | Thank-you waits; `confirm()` is not paid | **ARCHITECTURE.** Point `return_url` at the confirmation wait room. Do not settle there. | Redirect methods leave the tab. Dead payment step after 3DS is a silent failure. |
| Company address | — | SQL + `companyReady()` still require address | PROJECT.md: name + VAT required; address optional | **PROJECT.md.** Schema, SQL, UI move together. No invented VAT format. | Self-pay must not need business fields. Address-required is leftover, not product. |
| Payer mail | — | `notify.ts` sends `sendConfirmation` + `manageUrl` to `payer_email` | Other payer: receipt only | **FEATURES / PROJECT.md.** Split templates. Receipt is a distinct kind. | Manage on the payer is a cancel weapon. Same template is the bug. |
| Hosted / PI-only | Never. Keep `ui_mode: "elements"` | Keep. Do not new a PaymentIntent API | In-page Elements is the differentiator | **Keep Custom Checkout.** No hosted, embedded, form, or PI-only rewrite. | Phase 7 already left PI-only. Hosted is a pay-UI rewrite. Dahlia rejects `custom`. |

## Key Findings

### Recommended Stack

Full detail: [STACK.md](./STACK.md). v1.0/v1.1 stack is frozen (Workers + OpenNext, Worker `vamos` on `vamostaxi.site`, Supabase `yaumjzvylngfjhtuffqs` via Hyperdrive, `STRIPE_EVENTS` queue). v1.2 adds **no new packages**. Pin `stripe@22.6.1`, `@stripe/stripe-js@9.15.0`, `@stripe/react-stripe-js@6.9.0`. Do not bump unless TWINT on 6.9.0 is blocked.

**Core technologies:**
- Checkout Sessions `ui_mode: "elements"` (API `2026-08-26.dahlia`) — Custom Checkout after Dahlia renamed `custom` → `elements`. DC chrome, Adaptive Pricing, 24h `expires_at` clamp, existing settle path
- Split Card Elements + Express Checkout Element + Checkout `PaymentElement` (TWINT only) — confirm via `checkout.confirm({ redirect: "if_required" })`, never `stripe.confirmPayment` / `confirmTwintPayment`
- Dashboard payment methods + Adaptive Pricing — card, Apple Pay, Google Pay, TWINT, Link. No `payment_method_types`. Charge `chf`. TWINT requires CHF presentment
- Cloudflare Queue `vamos-stripe-events-staging` — webhook stays verify → `constructEventAsync` (SubtleCrypto) → record → enqueue → 200. Settle on the consumer
- `wrangler secret put` — `STRIPE_SECRET_KEY` (`sk_test_`) + `STRIPE_WEBHOOK_SECRET` (Dashboard endpoint `whsec_`, not `stripe listen`). `STRIPE_PUBLISHABLE_KEY` is the only Stripe value in `vars` (`pk_test_…`)

Payment method domains: register `vamostaxi.site` **and** `www.vamostaxi.site` in TEST. Repeat on the live account at cutover — test registration does not carry. Apple Pay association file is Dashboard bytes, 200, no redirect, no locale prefix. Do not invent the file.

### Expected Features

Full detail: [FEATURES.md](./FEATURES.md). A pre-booked transfer is not a cart. The unit is a **locked quote**. Two clocks: quote lock 24h (product; pay-link TTL; resend does not restart) and Stripe Session `expires_at` (clamped 30 min–24h). They must match. SCA/3DS is not a product feature — swallowing `requires_action` or a decline is.

**Must have (table stakes):**
- Pay the locked quote in-page on DC chrome — same `PaymentPanel` on checkout, unpaid `/bookings`, token page
- Card via Stripe iframe — TEST success `4242…`; decline `4000…0002` stays unpaid and visible
- 3DS / SCA — TEST `4000 0000 0000 3220`; stay in `requires_action`; thank-you still waits on webhook
- Webhook confirms; thank-you polls — `confirm()` is not paid
- First charge wins / no double debit — one Checkout Session; `pay-link/open` reuses; `quote_already_booked` 409; loser sees confirmation
- Expired lock visible; unpriced `CHF 000` refuses visibly — never invent rappen
- Traveller confirmation + manage (no `.ics` in v1.2); charge CHF (Adaptive Pricing may *present* another currency)
- Four languages, same pass, including decline / expired / 3DS copy

**Should have (competitive, in this milestone):**
- TWINT on the same DC pay screen — redirect/QR, not ECE; Dashboard + CHF; skip UAT with a note if entity is not Swiss
- Email pay-link for someone else — name + VAT required; address optional; payer email required; token recap-only
- Split: traveller manage vs payer receipt
- Google Pay `"auto"`; Link built-in (`link: "auto"`, `disableLink: false`); Apple Pay domain on `.site`
- Unpaid `/bookings` row, same panel

**Defer (v1.x / v2+ / never in v1.2):**
- Live `sk_live_` / `pk_live_` — wrangler secrets later, after TEST UAT is boring
- Calendar invite, quote/class rebuild, fare Publish, PayPal, cash, Connect, invoice portal, extra wait in pay-now
- Live `vamostaxi.eu` DNS — Phase 11
- Frozen leftovers 16 MX, 17 chauffeur, 19 close-out, 20 security

### Architecture Approach

Full detail: [ARCHITECTURE.md](./ARCHITECTURE.md). v1.2 does **not** add a second payment stack, Worker, or Stripe client. Identity doors stay: `asCheckout` writes unpaid; `asSystem` settles. Do not grant table SELECT to “simplify” open-payment.

**Major components:**
1. `PaymentPanel.tsx` — split card + ECE + TWINT PaymentElement; confirm against Session `client_secret`
2. `POST /api/checkout/intent` + `pay-link` + `pay-link/open` — unpaid booking + one Session; open reuses; never mint a second payable session while one is open
3. `POST /api/stripe/webhook` → Queue → `settle.ts` — only writer to `paid`/`confirmed`. Idempotency: `stripe_events` PK → `stripe_event_begin` → `checkout_payment_settle` / `booking_payments_one_success`
4. Confirmation poller — `GET /api/checkout/status/{ref}` until webhook-settled
5. `notify.ts` + `packages/emails` — traveller confirmation+manage; new receipt template for other payer
6. `is_test` — leftover test unpaid never opens a live session after cutover

**Data law:** lock `total_rappen` + extras (extra wait = 0 at pay) + VAT bps → `chargedRappen` → Stripe `unit_amount` in `chf`. Null class total never becomes a fare. Display FX is header-only (`/api/fx`). Do not recompute CHF at pay.

### Critical Pitfalls

Full detail: [PITFALLS.md](./PITFALLS.md). Live failures are evidence: Pay no-op after pay-link; `400 invalid_request`; unpriced Economy hidden as “Payment did not start”; book `ops-draft-from-14` id 15 mahaha-only; `updateBillingAddress(null)`; `email_failed` mapped to `invalid_request`.

1. **Unpriced `CHF 000` collapsed into `invalid_request` / `payCouldNotStart`** — charge gate is the lock (`peekLockClassRappen == null` → `pricing_not_live` on client **and** server). Missing `vehicle_classes` row is not a bad request. Never invent Economy/Business/First/Van fares.
2. **Pay and continue no-ops after pay-link** — never `updateBillingAddress(null)`. Pay click always ends Alert, 3DS/redirect, or wait-room. Silence is a bug. Rebind confirm after send-link; do not remint the session.
3. **Thank-you treats `confirm()` as paid** — Queue consumer is the only writer to confirmed. Poller stays. Do not settle on `return_url`.
4. **Dual payer mints a second chargeable session** — idempotent settle prevents double-confirm, **not** double-charge. Reuse via `loadOpenPayment` + `sessionIsPayable`. Two `cs_` on one booking is a refund conversation.
5. **TEST→live becomes a rewrite or mixed keys** — same-mode trio (publishable + secret + Dashboard `whsec_`). Browser Stripe.js uses the server-provided key, not baked `NEXT_PUBLIC_`. No `sk_live_` in v1.2. No `.eu`. Staging Worker stays `sk_test_` forever.

Also bind into plans: `email_failed` stays `email_failed` (502), not `invalid_request`; pay-link clock = quote lock 24h, resend does not restart; token page recap-only; `/bookings` unpaid pays the existing session, not a new quote; never log `client_secret` / `sk_` / `whsec_`; never copy mocks into gitignored `apps/web/public/app/`; never restore cubes/glow.

## Implications for Roadmap

v1.2 phases are **new workstreams**, not a continuation of 16/17/19/20 (frozen) and not a rebuild of Phase 7 (already complete). Do not start wallets or dual-payer polish while intent still hides failures. SQL apply and deploy stay owner-gated. Funnel quote/class rebuild is a must-not on every phase.

### Phase 1: Charge gate + visible refusal + payable intent
**Rationale:** UAT cannot tell `CHF 000` from a missing `client_secret` while every 400 is `payCouldNotStart`. Stripe must not open for an unpriced class. A priced class (live book: **mahaha**) must return a reusable `client_secret`.
**Delivers:** Lock-null → `409 pricing_not_live` painted as `pricingNotLive` (Alert + requote). Expired lock → `quoteExpired`. Stop mapping those (and `email_failed`) into `payCouldNotStart` / `invalid_request`. Missing class id is `pricing_not_live`, not a bad request. Intent reuses `checkout_open_payment` + `sessionIsPayable`. No invented rappen. No Stripe objects for unpriced.
**Addresses:** Table-stakes visible decline/expired/unpriced; FEATURES charge gate
**Avoids:** Pitfalls 1, 2 (`email_failed` vocabulary), 14 (invented CHF)

### Phase 2: Card confirm + thank-you webhook wait
**Rationale:** Dummy TEST card is the milestone proof. Wallets on a panel that no-ops after pay-link is wasted UAT. Webhook must be SoT before dual-payer or TWINT redirect.
**Delivers:** `PaymentPanel` confirm with real fields only — no `updateBillingAddress(null)`. After pay-link send, same session, confirm still bound. TEST `4242…` captures; `4000…0002` visible decline, booking stays unpaid. `return_url` → `/confirmation/{ref}`. Poller waits; `confirm()` does not mark paid. Add `checkout.session.async_payment_succeeded` to the succeed path (still retrieve Session, gate `payment_status === paid`). Handler stays short.
**Uses:** Existing `stripe@22.6.1` Fetch client, `constructEventAsync`, Queue consumer, `ConfirmationClient`
**Implements:** Card path + fulfillment (ARCHITECTURE patterns 1 and 4)
**Avoids:** Pitfalls 3, 4; webhook HTTP settle; `payment_intent.succeeded` as a second confirm path

### Phase 3: Wallets + Dashboard methods
**Rationale:** Card works; now paint what PROJECT.md listed. Domain registration and Dashboard enablement are this phase, not a Worker enum.
**Delivers:** ECE `googlePay: "auto"` (unlock comments test); keep `paypal: "never"`, `link: "auto"`. Register payment method domains for `vamostaxi.site` + `www`. Host Apple association file if `apple_pay.status !== active` (Dashboard bytes; 200; no locale 308). Mount Checkout PaymentElement as TWINT collector (wallets off on that element). Enable methods in **TEST** Dashboard. UAT: 3DS `4000 0000 0000 3220`; Link OTP table; Apple Pay on Safari against `.site`; Google Pay on Chrome. TWINT: TEST redirect if Swiss capability; otherwise **written skip** — do not stub a radio.
**Uses:** Dashboard Adaptive Pricing; payment method domains; Checkout PaymentElement
**Implements:** STACK wallet/TWINT patterns
**Avoids:** Pitfall 10; `payment_method_types`; PayPal; Worker TWINT flag; Apple Pay domain on `.eu`

### Phase 4: Dual-payer, pay-link product, mail split
**Rationale:** First-charge-wins is one session plus product rules, not settle uniqueness alone. Do this after a card can actually capture, or race UAT is noise.
**Delivers:** Token open reuses unpaid session (never mint second). Two browsers: first succeeded settle wins; loser routes to the same `/confirmation/{ref}` (not `paymentWindowClosed`). Pay-link: company name + VAT required, address optional (SQL + `companyReady` + schema move together); payer email required; self-pay skips business details; no VAT regex. Token page recap-only DC pay; methods = checkout; cannot edit. TTL = quote lock 24h; resend does not restart (`pay_link_sent_at` first send). New receipt email: other payer, no manage. Traveller: confirmation + manage. No `.ics`. No default vehicle label `"business"`.
**Addresses:** FEATURES differentiators (pay-link, recap-only, mail split, loser confirmation)
**Avoids:** Pitfalls 5, 6, 7, 8, 9

### Phase 5: `/bookings` unpaid + TEST UAT + secret-swap design
**Rationale:** Account list is Postgres-first; checkout is lock-first. That fork mints a new PI if left last. Cutover is documentation in this milestone, not keys.
**Delivers:** Unpaid row pays the **existing** open session (same amount, same `cs_`), not a new quote. Home abandon must not cancel a row the customer opened from `/bookings` to finish paying. Full UAT on `vamostaxi.site`: success, 3DS, decline, expired lock, unpriced `CHF 000` — all visible. Runbook: TEST→live is `wrangler secret put STRIPE_SECRET_KEY` + `STRIPE_WEBHOOK_SECRET` together, publishable var same mode, new live Dashboard webhook + payment method domains; browser uses intent publishable key; staging stays `sk_test_` forever. No `sk_live_` in git, chat, or this milestone’s Worker. `is_test` rows never capture after cutover.
**Avoids:** Pitfalls 11, 13, 15; mixed keys; fare Publish; `.eu`; live DB wipe

### Phase Ordering Rationale

- Refusal + payable intent first — every later UAT path is indistinguishable while 400s are generic and unpriced classes open Stripe or look like card failure.
- Card + webhook wait second — dummy capture is the core value; TWINT/3DS leave the tab; dual-payer is a lie if `confirm()` writes confirmed.
- Wallets third — Dashboard/domain/TWINT entity are orthogonal to card capture; do not block Phase 2 on Safari Wallet.
- Dual-payer / pay-link / mail fourth — product rules on a path that already charges once.
- Account unpaid + cutover design last — `/bookings` reuses Phase 1–2 session logic; live keys are owner-gated and not this milestone.
- This order avoids rebuilding Custom Checkout, inventing fares, and turning cutover into a PaymentIntent rewrite.

### Research Flags

Phases likely needing deeper research during planning:
- **Phase 3 (wallets / TWINT):** Owner TEST Stripe entity (Swiss vs UAE) and TWINT capability. Apple Pay association file bytes come from Dashboard — do not invent. Confirm PaymentElement on `@stripe/react-stripe-js@6.9.0` surfaces TWINT without a second card UI; bump to 6.11.0 only if blocked.
- **Phase 4 (pay-link SQL):** `checkout_set_pay_link` address-required is a hosted SQL change — owner-apply, not agent `db push`. Exact VAT copy (not format) needs plan-time UI-SPEC, not a CHE- regex.
- **Phase 5 (cutover):** `env.production` in `wrangler.jsonc` still has `pk_test_placeholder` and is **not deployed**. Document only. Live webhook `whsec_` does not exist yet — do not guess it.

Phases with standard patterns (skip research-phase):
- **Phase 1 refusals:** closed vocabulary in `errors.ts` + existing `pricing_not_live` server path.
- **Phase 2 webhook/queue:** already the architecture; do not re-research Stripe fulfillment.
- **Phase 2 card Elements:** already shipping; the work is confirm wiring, not a new Stripe tree for card.
- **Confirmation poller / `/bookings` href:** already the right shape.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Official Dahlia `ui_mode: elements`, webhook fulfillment, PMD, TWINT CHF, in-repo pins. MEDIUM only on TWINT-via-PaymentElement next to split cards on 6.9.0. |
| Features | HIGH | PROJECT.md is authoritative. Stripe TEST cards / 3DS / Link OTP / TWINT redirect verified 2026-09-22. MEDIUM on wallet-button rendering (device/browser). |
| Architecture | HIGH | Live code path verified (intent, pay-link, webhook, settle, PaymentPanel). MEDIUM on Dashboard-only methods until owner account is inspected. |
| Pitfalls | HIGH | Live staging failures + in-repo confirm/refusal/notify bugs. MEDIUM on live-account TWINT/Apple Pay until Dashboard inspected. |

**Overall confidence:** HIGH — enough to roadmap. Remaining gaps are Dashboard values (TWINT capability, PMD, association file) and owner-gated SQL, not stack choice.

### Gaps to Address

- **TEST Stripe entity / TWINT:** Runbook says UAE. If still true, Phase 3 writes a skip note; do not fake TWINT. Re-check at live cutover (Swiss onboarding is a live constraint, not a TEST blocker).
- **Google Pay vs frozen test:** Product list vs `checkout-comments.test.ts` — Phase 3 unlocks the test. Do not leave `"never"`.
- **Pay-link address SQL:** `checkout_set_pay_link` still requires address. Owner applies the migration. Agent does not `supabase db push`.
- **Confirmation visibility for token payer / loser:** status route today wants manage cookie or JWT matching `contact_email`. Phase 4 must not leave them on `visible: false`.
- **Intent `invalid_request` root cause:** live 400s are mixed (`is_test`, missing `client_secret` on Elements session, zod, empty `vehicleClassId`). Phase 1 diagnoses; do not “fix” by inventing a fare.
- **`NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` override in `browserStripe`:** cutover landmine. Phase 5 runbook + code: browser uses server-provided key.
- **Priced class for UAT:** live book id 15 priced **mahaha** only. UAT pays that class. Other classes stay `CHF 000`. Do not Publish. Do not invent.

## Sources

### Primary (HIGH confidence)

- Context7 `/websites/stripe` — Checkout `ui_mode: elements`, webhook fulfillment, payment method domains, TWINT, async payment events
- [Checkout Session UI mode changelog (Dahlia 2026-03-25)](https://docs.stripe.com/changelog/dahlia/2026-03-25/updates-available-checkout-session-ui-modes) — `custom` → `elements`
- [Build a custom checkout page](https://docs.stripe.com/payments/quickstart?client=react&ui=elements)
- [Checkout fulfillment](https://docs.stripe.com/payments/checkout/fulfillment) — webhooks required; `completed` + `async_payment_succeeded` / `failed`
- [TWINT](https://docs.stripe.com/payments/twint) / [Accept TWINT](https://docs.stripe.com/payments/twint/accept-a-payment) — CHF, Dashboard, redirect/QR; Direct API legacy
- [Payment method support](https://docs.stripe.com/payments/payment-methods/payment-method-support) — TWINT not on ECE
- [Apple Pay (web)](https://docs.stripe.com/apple-pay?platform=web) + [Register payment method domains](https://docs.stripe.com/payments/payment-methods/pmd-registration)
- [Stripe testing](https://docs.stripe.com/testing) — `4242…`, decline `4000…0002`, 3DS `4000 0000 0000 3220`, Link OTP
- In-repo: `apps/web/lib/checkout/{stripe,intent,webhook,settle,notify,errors}.ts`, `PaymentPanel.tsx`, `CheckoutClient.tsx`, `PayClient.tsx`, `wrangler.jsonc`, `docs/runbooks/stripe-webhook.md`, `docs/runbooks/stripe-test-mode-e2e.md`
- `.planning/PROJECT.md` — v1.2 Payment (2026-09-22)

### Secondary (MEDIUM confidence)

- npm `@stripe/react-stripe-js@6.11.0` / `@stripe/stripe-js@9.16.0` (2026-09-22) — latest; **do not bump** unless 6.9.0 blocks TWINT
- Blacklane / Welcome Pickups / Stripe Payment Links — category pay-link patterns, not a paid walkthrough

### Tertiary (LOW confidence)

- Owner TEST Stripe country / TWINT capability — inspect Dashboard at Phase 3
- Apple Pay association file contents — Dashboard-generated; do not invent
- Exact live `whsec_` / `pk_live_` — must not exist in this milestone

---
*Research completed: 2026-09-22*
*Ready for roadmap: yes*
