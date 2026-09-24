# Feature Research

**Domain:** In-page Stripe TEST checkout + email pay-link for a locked Swiss airport-transfer quote (v1.2 Payment)
**Researched:** 2026-09-22
**Confidence:** HIGH on Vamos scope (PROJECT.md is authoritative); HIGH on Stripe TEST cards / 3DS / Link OTP / TWINT redirect (primary docs 2026-09-22); MEDIUM on wallet-button rendering (device/browser/domain dependent); MEDIUM on competitor pay-link UX (Blacklane / Welcome Pickups / Stripe Payment Links patterns, not a paid walkthrough of each funnel)

## How this file was built

v1.0 FEATURES.md surveyed the airport-transfer category. v1.1 surveyed Ops Support. This file does **not** repeat those. It answers one question for milestone v1.2 Payment:

> How do these payment features typically work? What is expected behavior? What is table stakes vs a differentiator vs an anti-feature? What does Stripe TEST actually do for TWINT / Link / Apple Pay / 3DS?

v1.0 research is at `.planning/research/v1.0-archive/`. Booking-funnel rebuild, fare Publish, calendar invite, live `sk_live_`, and `.eu` stay frozen. Unpriced class stays `CHF 000`. Do not invent fares.

## How checkout typically works

A pre-booked transfer is not a cart. The unit of work is a **locked quote**: pickup, dropoff, class, extras, total, expiry. The customer pays that snapshot or they requote. Competitors (Blacklane, Welcome Pickups, Suntransfers) all do some version of: show the fare → collect card/wallet → confirm the ride. Nobody in this category silently charges an unpriced class.

The industry payment stack for a small Swiss carrier is one merchant, one processor, one webhook:

| Layer | Typical vendor shape | Vamos v1.2 |
|-------|----------------------|------------|
| Collect PAN | PCI-scoped iframe (Stripe Elements / Checkout) | Split card fields + Express Checkout Element on `vamostaxi.site` chrome (DC mock is the visual spec) |
| Authorise | PaymentIntent / Checkout Session | Checkout Session `ui_mode: elements`, Dashboard methods, no `payment_method_types` (D-09/D-10) |
| Confirm paid | Signed webhook, not the browser `confirm()` | `checkout.session.completed` → verify → queue → settle. Thank-you polls; it does not write |
| Receipt | Processor receipt to billing email | Traveller: confirmation + manage. Other payer: receipt only |
| Someone else pays | Invoice / Payment Link / "bill my company" | Email a token to `/checkout/pay/[token]`; recap only |

Two clocks exist and they are not the same object:

1. **Quote lock (24h)** — product clock. Unpaid after this is expired; requote. Pay-link lasts as long as this lock. Resend must not restart it.
2. **Stripe Checkout Session `expires_at`** — Stripe clamps 30 minutes–24 hours. `stripeSessionExpiresAtUnix` already clamps; do not invent a third clock.

SCA / 3DS is not a product feature. It is a card-network/issuer requirement that Stripe's front ends run when the issuer asks. A checkout that treats `requires_action` as paid is broken. A checkout that swallows a decline is broken. A checkout that paints `CHF 000` as payable is broken.

Wallets are availability, not a radio list. Apple Pay paints on Safari + Wallet + registered domain. Google Pay paints on Chrome with a saved method. Link paints when Stripe detects an enrolled email/cookie. TWINT is a **bank redirect**, not a wallet button: mobile hops to the TWINT app; desktop shows a QR. Stripe's Express Checkout Element **does not support TWINT**. TWINT has to come from Checkout/Payment Element (or a hosted Checkout), with presentment **CHF**.

Pay-by-link in this category is "the company / parent / PA pays." The traveller still owns the trip. The payer must not edit the booking. First successful charge wins; the other path becomes a confirmation, not a second debit. Stripe enforces this if there is **one** Checkout Session per booking: a completed session cannot be paid again. Minting a second session on token-open is how double-charge sneaks in. `pay-link/open` already says: reuse the unpaid session.

## Expected behavior (locked v1.2)

From PROJECT.md. This is the product, not a suggestion.

- Traveller pays a locked quote on `vamostaxi.site` in Stripe **TEST**: card, Apple Pay, Google Pay, TWINT, Link.
- `/bookings` unpaid row pays the **same** way (same `PaymentPanel`, not a second integration).
- Email a pay link: company name + VAT **required**; company address **optional**; payer email **required**. Self-pay (card/wallets) does **not** need business details. Do not invent a VAT format.
- Recipient opens the DC pay screen at `/checkout/pay/[token]`; recap only; cannot edit the booking.
- Token methods = checkout methods.
- Traveller and other payer may both complete; first successful charge wins; loser sees the same confirmation.
- Traveller: confirmation page + confirmation email + manage link. Other payer: receipt only (no manage).
- Webhook is source of truth. Thank-you waits on it, not on client `confirm()`.
- Pay link lasts as long as the quote lock (24h), then **visible** expired.
- UAT: success, 3DS, decline, expired/unpriced (`CHF 000`) — visible refusal, not silent.
- Charge always CHF. Live Stripe later is wrangler secrets only. No `sk_live_`. No `.eu`. No calendar invite. No quote/class rebuild. No fare Publish.

## Existing surface this milestone extends

Do not rebuild checkout. v1.2 unfreezes **pay**.

| Surface | What it already does | v1.2 implication |
|---------|----------------------|------------------|
| `PaymentPanel.tsx` | Checkout Elements provider + Express Checkout (Apple Pay `always`, Link `auto`, Google Pay **`never`**, PayPal `never`) + split card fields | Same panel on checkout, pay-link, unpaid resume. Google Pay `never` is locked by `checkout-comments.test.ts` and conflicts with PROJECT.md's method list |
| `CheckoutClient.tsx` | Pay and continue + Send pay link. Unpriced class disables CTAs (`classFareRappen == null`). Copy: card / Apple Pay / TWINT | Self-pay must not require company fields. Send-pay-link currently gates on payer email only |
| `PayClient.tsx` | POST `/api/checkout/pay-link/open`, recap, same `PaymentPanel`, no trip editors | Correct shape. Expired/already-booked must stay visible (`paymentWindowClosed` / `quoteAlreadyBooked`) |
| `POST /api/checkout/intent` | `runCheckoutIntent` → unpaid booking + Checkout Session | Idempotent; `quote_already_booked` 409 |
| `POST /api/checkout/pay-link` | Same intent, then `setPayLink`, email passenger + payer | "24h clock does not restart on resend." Charge gate unchanged |
| `POST /api/checkout/pay-link/open` | Reuse unpaid session. Never mint a second session | First-charge-wins depends on this |
| `lib/checkout/stripe.ts` | `ui_mode: "elements"`, Adaptive Pricing, CHF line item, no `payment_method_types` | TWINT/Link/wallets live or die in the **test Dashboard** payment-method config |
| Confirmation poller | Read-only. TWINT/3DS may never return to the tab | Correct. Do not confirm from `confirm()` |
| Webhook | Verify, record, enqueue, 200. Settle on the queue. Handler never marks paid | Correct Stripe pattern |
| `notify.ts` | After settle, `sendConfirmation` to contact; also sends the **same** payload (including `manageUrl`) to `payer_email` if different | Conflicts with "other payer gets a receipt only (no manage)" |
| `checkoutPayLinkSchema` | `payer_email` required; company name/address/VAT optional with default `""` | Tests accept a company pay-link **without** name/VAT. Conflicts with locked product |
| `companyReady()` | Company needs name **and** address **and** VAT | Address is required here; PROJECT.md says address optional. CheckoutClient does not call it |
| `/bookings` unpaid | `pay_url: /checkout/payment`, `payable` unless `is_test` | Same PaymentPanel path. Do not fork |

## Stripe TEST behavior (verified 2026-09-22)

Primary: [docs.stripe.com/testing](https://docs.stripe.com/testing), [TWINT](https://docs.stripe.com/payments/twint), [TWINT accept](https://docs.stripe.com/payments/twint/accept-a-payment), [Link](https://docs.stripe.com/payments/link), [Apple Pay](https://docs.stripe.com/apple-pay), [wallets test page](https://docs.stripe.com/testing/wallets).

**Rules that apply to every method**

- Test API keys only (`pk_test_` / `sk_test_`). Real cards in live mode are forbidden by Stripe's SSA.
- Test charges do not move funds.
- Card-level state from one test can poison the next; use a different card per independent UAT path.
- Do not load-test against the test environment (rate limits).
- Enable methods in the **test** Dashboard. Vamos never passes `payment_method_types`.

### Card

| Scenario | Number | What Stripe does | What Vamos must show |
|----------|--------|------------------|----------------------|
| Success | `4242 4242 4242 4242` | Charge succeeds. Any future expiry (docs use 12/34), any 3-digit CVC. **Not enrolled in 3DS** — even if Radar requests 3DS, the customer is not prompted | Confirmation wait → voucher after webhook |
| Generic decline | `4000 0000 0000 0002` | `card_declined` / `generic_decline` | Visible refusal on the pay screen. Booking stays unpaid. No fake success |
| 3DS required → OK | `4000 0000 0000 3220` (IE) or `4000 0084 0000 0027` (US) | Challenge modal / redirect. Payment succeeds only after authentication. Default Radar requests 3DS | Stay in `requires_action` until done; thank-you still waits on webhook |
| 3DS required → decline after auth | `4000 0084 0000 1629` | Authenticates, then `card_declined` | Visible decline. Not confirmed |
| 3DS frictionless | `4000 0000 3220 0000` | 3DS required on all transactions; frictionless (no UI) if the issuer allows | Same as success from the traveller's point of view |

`confirm({ redirect: "if_required" })` is the right client call. 3DS redirects **do not** run for payments created in the Stripe Dashboard — UAT has to use the site.

### TWINT

- Presentment **CHF only**. Max **5000.00 CHF**. No manual capture. Full/partial refunds up to 180 days.
- Flow: pick TWINT → mobile redirect into a TWINT app, or desktop QR → immediate succeeded/failed.
- **Express Checkout Element does not support TWINT.** A card+ECE-only panel cannot be the TWINT UAT surface unless Checkout Elements also presents TWINT as a method (Payment Element / Dashboard dynamic methods on the session).
- TEST (Checkout): select TWINT, click Pay. Redirect page: authenticate → PaymentIntent `requires_action` → `succeeded`. "Fail test payment" → `requires_payment_method`.
- TWINT is **immediate notification**, not a delayed voucher. The confirmation poller is still required because the customer may never return to the tab (mobile hop).
- Live `twint_payments` stays `pending` until TWINT merchant onboarding (reachable site, legal notice with name/form/address/contact, CHF prices). That is a **live** cutover constraint, not a TEST blocker, and not this milestone's rewrite.

### Link

- Stripe wallet. Detects enrollee by email, phone, or cookie; OTP; then autofill.
- TEST: any valid email creates a sandbox Link account. OTP table:
  - any other 6 digits → success
  - `000001` → invalid
  - `000002` → expired
  - `000003` → max attempts
- Do not store real user data in sandbox Link accounts.
- Current panel: `link: "auto"` on ECE, `disableLink: false` on `CardNumberElement`. No custom Link overlay (`vt-checkout__link-layer` is banned by test). That matches Stripe's built-in Link, not a house UI.

### Apple Pay

- Elements / embedded Checkout: **register the domain** (`payment_method_domains`) per environment, including each sandbox. Hosted Checkout/Payment Links skip this; Vamos does not use those.
- Stripe's current docs: you **cannot** save Stripe test cards or Apple Pay sandbox cards into Wallet to test Apple Pay.
- Button visibility is device/browser: Safari (or supported browser), Wallet with a card, biometric, not a private window, "allow websites to check for Apple Pay" on. ECE `applePay: "always"` can still **show** the button with no cards.
- If the demo at `/testing/wallets?ui=express-checkout-element` shows Apple Pay and Vamos does not: domain registration or iframe `allow="payment"`, not a missing radio.
- India IPs: Stripe hides Apple Pay in every mode.

### Google Pay

- Chrome (not incognito), "allow sites to check if you have payment methods saved," supported device/region.
- Stripe's wallet test page is the rendering oracle.
- **Product vs code:** PROJECT.md lists Google Pay. `PaymentPanel` sets `googlePay: "never"` and comments tests freeze that. UAT cannot pass Google Pay until that flag and the Dashboard config agree.

## Feature Landscape

### Table Stakes (Users Expect These)

Missing these = the funnel is not a paid booking. Users do not give credit for having them.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Pay the locked quote in-page | I saw a price, I pay that price, I get a driver. Core value | MEDIUM | DC pay mock. Same `PaymentPanel` on checkout / unpaid `/bookings` / token page |
| Card (Visa/Mastercard) via Stripe iframe | Default worldwide. PAN never hits Vamos | LOW–MEDIUM | Split fields already painted. Success = `4242…` |
| Visible decline | A failed card that looks like success is a support incident and a chargeback | LOW | `4000…0002`. Stay on pay screen. Unpaid row remains payable |
| 3DS / SCA challenge | EU/UK cards will demand it; Swiss cards often follow | MEDIUM | Stripe runs it. Client must not skip `requires_action`. Poller observes |
| Webhook confirms; thank-you waits | Stripe's fulfillment rule. Client `confirm()` is not paid | MEDIUM | Already the architecture. Do not short-circuit |
| First charge wins / no double debit | Two browsers, one quote. Category baseline | HIGH | One Checkout Session. `pay-link/open` reuses. `quote_already_booked` 409. Loser sees confirmation |
| Expired lock is visible | 24h quote is the contract. Silent expire looks like a bug | LOW | `quoteExpired` / `paymentWindowClosed` + requote. Pay-link same clock, no restart |
| Unpriced class refuses visibly (`CHF 000`) | Charging nothing, or inventing a fare, is worse than a refusal | LOW | CTA disabled + `pricingNotLive`. Never invent rappen |
| Traveller confirmation + manage link | Proof of purchase. Guest checkout lives on the token | MEDIUM | After webhook settle. Calendar invite is **out** |
| Charge in CHF, display may convert | Traveller must not be surprised by the settlement currency | LOW | Adaptive Pricing may *show* another currency in Stripe chrome; Vamos chrome uses `/api/fx`. Do not invent a charge currency |
| PCI + signed webhook + idempotency | Table stakes of taking money | MEDIUM | Exists. Do not add Turnstile on pay (D-14) |
| Four languages, same pass | Product law, not a payment extra | MEDIUM | EN/DE/FR/AR including decline/expired/3DS copy |

### Differentiators (Competitive Advantage)

Not required to "have payments." Valuable because Vamos is a small Swiss carrier, not Blacklane Business.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| TWINT on the same DC pay screen | Swiss table-stakes *locally*; a differentiator vs global aggregators that ship card-only | MEDIUM | Redirect/QR, not ECE. Dashboard enable + CHF session. TEST redirect page is the UAT |
| Email pay-link for someone else | Corporate/PA/parent pays without an invoice portal or a second processor | MEDIUM | Company name + VAT required; address optional; payer email required. Token page recap-only |
| Recap-only token page | Payer cannot change class or extras and blow the lock | LOW | `PayClient` already has no editors |
| Split: traveller manage vs payer receipt | Payer should not get a cancel/manage weapon; traveller still owns the trip | LOW–MEDIUM | `notify.ts` currently sends confirmation+manage to the payer too — that is the gap |
| Loser sees the winner confirmation | Avoids I paid / I didn't / refresh support | MEDIUM | Same confirmation route; webhook is the only writer |
| In-page Elements on Vamos chrome | Bound design system. Hosted Stripe Checkout would look like a different company | MEDIUM | Already chosen (`ui_mode: elements`). Do not redirect to Stripe-hosted Checkout |
| Unpaid `/bookings` row, same panel | Resume without re-entering the trip | LOW | `pay_url → /checkout/payment` |

### Anti-Features (Commonly Requested, Often Problematic)

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| PayPal | Footer still has the old mark; travellers ask | Stripe has no Swiss-merchant PayPal. Second processor, webhook, refund path. PROJECT.md out | Card + wallets + TWINT |
| Client `confirm()` = paid | Faster thank-you | 3DS/TWINT leave the tab; webhook retries; double-fulfill | Poll confirmation until settle |
| Invent a fare / charge `CHF 000` | Just let them book | Legal + ops lie. Unpriced class is a Publish problem, frozen | Visible `pricingNotLive` |
| Second Checkout Session on token open | Session expired / missing secret | Two payable intents → two charges | Reuse unpaid session; refuse if already booked |
| Restart 24h clock on resend | They didn't see the email | Quote lock is the price contract | First send wins (`payLinkSentAt`) |
| Company VAT format invention | Validate CHE-… | Owner has not given a format. Wrong regex rejects real payers | Required non-empty name + VAT; do not invent pattern |
| Require business details on self-pay | Neat form | Blocks the leisure traveller. Locked: self-pay does not need them | Company fields only for send-pay-link |
| Require company address | Matches `companyReady()` today | Locked product: address optional | Name + VAT required; address optional |
| Manage link on the payer receipt | Same email template is easier | Payer can cancel the traveller's ride | Receipt only |
| Stripe-hosted Checkout / Payment Links product | Faster than DC chrome | Breaks the mock, i18n, and four languages same pass | `ui_mode: elements` on-site |
| Calendar invite (.ics) | Category table stakes in v1.0 research | Explicitly out of v1.2 | Confirmation page + email |
| Quote rebuild / fare Publish | Unpriced class hurts conversion | Frozen leftovers. Not a pay bug | Refuse `CHF 000` |
| `sk_live_` / `.eu` | We're ready | Secrets-only later cutover. Live DNS is Phase 11 | TEST on `vamostaxi.site` |
| Cash / pay-the-driver | Old site had `barzahlung` | Unpaid means card or pay-link still open. Ops comment: cash is not a V1 path | Card/wallets/TWINT/link |
| Extra wait in the Stripe pay-now | Capture delay at the airport | D-23: ops marks arrival; no silent debit. TWINT has no manual capture anyway | Pay the locked quote only |
| Connect / marketplace split | Pay the driver their share | Vamos is the carrier, one merchant | Stripe standard |
| Pay-later / full invoice portal | Blacklane Business | A second product (credit, dunning, PDF). Pay-link is the thin version | Email pay-link |
| Hand-built `payment_method_types` map | Force TWINT on screen | Conflicts D-09/D-10. Dashboard + Adaptive Pricing are the gate | Enable in test Dashboard; paint what Stripe returns |
| Custom Link overlay | Match a mock that is not Stripe Link | Stripe owns OTP/enrollment. House UI desyncs TEST OTP | ECE `link: "auto"` + card `disableLink: false` |

## Feature Dependencies

```
Locked quote (24h, priced class)
    └──requires──> payable rappen (not CHF 000)
    └──requires──> checkout window open
         └──creates──> unpaid booking + one Checkout Session
              ├──self-pay──> PaymentPanel (card / Apple Pay / Link / Google Pay / TWINT)
              └──pay-link──> company name + VAT + payer email
                   └──emails──> /checkout/pay/[token]
                        └──open──> reuse same session (never mint second)
                             └──confirm──> Stripe 3DS / TWINT redirect / wallet sheet
                                  └──webhook──> settle
                                       ├──traveller──> confirmation page + email + manage
                                       └──other payer──> receipt only
                                            └──loser path──> same confirmation (no second charge)

Dashboard payment methods ──enables──> TWINT / Link / wallets
Domain registration ──enables──> Apple Pay (Elements)
CHF presentment ──requires──> TWINT
Express Checkout Element ──does not support──> TWINT
client confirm() ──conflicts with──> paid
pay-link clock restart ──conflicts with──> 24h quote lock
sk_live_ / .eu ──conflicts with──> v1.2 TEST
```

### Dependency Notes

- **Payable amount requires a priced class.** Unpriced stays `CHF 000` and refuses. Fare Publish is not this milestone.
- **TWINT requires CHF + Dashboard enable + a UI that is not ECE-only.** If the only painted methods are split card + ECE, TWINT UAT has nowhere to click.
- **Apple Pay requires domain registration** for this Elements integration, plus a real Safari/Wallet. TEST cards cannot be loaded into Wallet (Stripe's current docs).
- **Google Pay requires the ECE flag to stop being `never`** and a Chrome wallet. Product lists it; tests currently freeze `never`.
- **First-charge-wins requires one session.** Token-open must reuse. Intent 409 `quote_already_booked` is the other door.
- **Thank-you requires the poller**, because TWINT and 3DS may never return to the tab (`ConfirmationClient` comment).
- **Payer receipt requires a different template (or a stripped payload)** than traveller confirmation. Today `notify.ts` reuses `sendConfirmation` with `manageUrl`.
- **Pay-link company fields:** schema/tests allow empty name/VAT; `companyReady()` requires address; PROJECT.md requires name+VAT, address optional. Align to PROJECT.md. Do not invent VAT format.
- **Live TWINT onboarding** (legal notice, reachable site) is a later secrets cutover constraint, not a reason to skip TEST.

## MVP Definition

### Launch With (v1.2)

Minimum that takes a locked quote to a webhook-confirmed booking on `vamostaxi.site` TEST.

- [ ] In-page Pay and continue: card + Apple Pay + Link + TWINT + Google Pay (TEST)
- [ ] Unpaid `/bookings` row uses the same panel
- [ ] Email pay-link: name + VAT required, address optional, payer email required; self-pay skips business details
- [ ] Token page is recap-only DC pay; same methods; cannot edit
- [ ] First successful charge wins; loser sees the same confirmation; no second charge
- [ ] Traveller: confirmation page + email + manage. Other payer: receipt only
- [ ] Webhook is source of truth; thank-you waits
- [ ] UAT visible: success (`4242…`), 3DS (`4000 0000 0000 3220`), decline (`4000 0000 0000 0002`), expired lock, unpriced `CHF 000`
- [ ] Pay-link expires with the 24h quote lock (visible expired; resend does not restart)

### Add After Validation (v1.x)

- [ ] Live Stripe (`sk_live_`) via wrangler secrets only — trigger: TEST UAT boring and TWINT capability not `pending`
- [ ] Payer-specific receipt template (if launch still strips manage from the same mail) — trigger: a real other-payer complains, or legal wants a VAT invoice PDF
- [ ] Apple Pay domain pack for every future hostname — trigger: any new origin
- [ ] Google Pay on if still `never` after Dashboard review — trigger: product list vs ECE flag still disagree

### Future Consideration (v2+)

- [ ] Calendar invite — deferred on purpose
- [ ] Quote/class rebuild and fare Publish — frozen leftovers
- [ ] PayPal — still a second processor
- [ ] Invoice portal / pay-later / net-30 — pay-link is the thin version
- [ ] Cash / pay driver
- [ ] Stripe Connect
- [ ] Live `.eu` DNS — Phase 11

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Card pay on locked quote | HIGH | LOW–MEDIUM (exists) | P1 |
| Webhook settle + thank-you wait | HIGH | MEDIUM (exists) | P1 |
| Visible decline / 3DS / expired / `CHF 000` | HIGH | LOW–MEDIUM | P1 |
| First charge wins (one session) | HIGH | MEDIUM (open-path must not mint) | P1 |
| Unpaid `/bookings` same panel | HIGH | LOW | P1 |
| Pay-link email + recap token page | HIGH | MEDIUM | P1 |
| Company name + VAT required; address optional | HIGH | LOW (schema/UI align) | P1 |
| Traveller confirmation vs payer receipt | HIGH | LOW–MEDIUM | P1 |
| TWINT (CHF, not ECE) | HIGH (CH) | MEDIUM | P1 |
| Apple Pay (ECE + domain) | HIGH (iOS) | MEDIUM (device/domain) | P1 |
| Link (built-in, test OTP) | MEDIUM | LOW (already `auto`) | P1 |
| Google Pay | HIGH in PROJECT.md / MEDIUM in current tests | LOW (flag) + device | P1 if product list wins |
| Four-language pay copy | HIGH | MEDIUM | P1 |
| Live `sk_live_` | HIGH later | LOW (secrets) | P2 — not v1.2 |
| ICS invite | MEDIUM | LOW | P3 — out |
| PayPal / cash / Connect / invoice portal | LOW here | HIGH | P3 — do not build |

**Priority key:**
- P1: Must have for v1.2 — without it a dummy card does not become a confirmed booking, or UAT is silent
- P2: After TEST is boring (live secrets, receipt PDF)
- P3: Explicitly out, or a different product

## Competitor Feature Analysis

| Feature | Blacklane / Welcome Pickups | Stripe Payment Links | Typical CH taxi site | Vamos v1.2 |
|---------|-----------------------------|----------------------|----------------------|------------|
| Pay now | Card + Apple/Google Pay | Hosted Stripe page | Card + TWINT, sometimes cash | In-page Elements on DC chrome |
| TWINT | Rare (global) | If Dashboard CHF | Expected | Required; not ECE |
| Someone else pays | Business account / invoice | Share a URL | Phone the office | Email token; recap-only |
| Payer can edit trip | Usually no | No | N/A | No |
| Double-open | One order | One link, one session | Manual | One session; first charge wins |
| Confirmation vs receipt | Customer gets the trip; billing entity gets invoice | Receipt to billing email | Mixed | Traveller manage; payer receipt |
| Fulfillment | Provider webhook | `checkout.session.completed` | Often email us | Webhook + poller |
| Unpriced | Hidden | Price required | Phone quote | Visible `CHF 000` refusal |
| PayPal | Sometimes | No (CH merchant) | Sometimes | Out |
| Cash | No | No | Yes | Out |

## Sources

- `.planning/PROJECT.md` — v1.2 Payment goal, methods, pay-link rules, webhook, out-of-scope
- `apps/web/app/[locale]/checkout/PaymentPanel.tsx` — ECE + split card; Apple Pay `always`, Link `auto`, Google Pay `never`
- `apps/web/app/[locale]/checkout/CheckoutClient.tsx` — Pay and continue + send pay-link
- `apps/web/app/[locale]/checkout/pay/[token]/PayClient.tsx` — recap-only token pay
- `apps/web/app/api/checkout/intent/route.ts`, `pay-link/route.ts`, `pay-link/open/route.ts`
- `apps/web/lib/checkout/stripe.ts` — Checkout Session `ui_mode: elements`, no `payment_method_types`, CHF, 24h clamp
- `apps/web/lib/checkout/webhook.ts`, `settle.ts`, `ConfirmationClient.tsx` — verify/enqueue; poller is the observer
- `apps/web/lib/checkout/notify.ts`, `pay-link.ts`, `intent-schema.ts` — receipt vs confirmation; company field gaps
- `apps/web/lib/account/bookings.ts` — unpaid row → `/checkout/payment`
- [Stripe testing](https://docs.stripe.com/testing) — `4242…`, decline `4000…0002`, 3DS `4000 0000 0000 3220`, Link OTP table
- [TWINT](https://docs.stripe.com/payments/twint) / [accept a TWINT payment](https://docs.stripe.com/payments/twint/accept-a-payment) — CHF, 5000 cap, ECE unsupported, TEST redirect authenticate/fail
- [Link](https://docs.stripe.com/payments/link) — email/OTP wallet
- [Apple Pay](https://docs.stripe.com/apple-pay) — domain registration; cannot save test cards to Wallet
- [Wallet rendering tests](https://docs.stripe.com/testing/wallets) — ECE device/browser checklist
- v1.0 archive FEATURES — category table stakes (card + TWINT); ICS is category-stakes but **out** of v1.2

---
*Feature research for: v1.2 Payment (Stripe TEST on vamostaxi.site)*
*Researched: 2026-09-22*
