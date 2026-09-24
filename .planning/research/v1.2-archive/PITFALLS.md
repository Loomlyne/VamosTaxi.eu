# Pitfalls Research

**Domain:** v1.2 Payment — Stripe TEST checkout on the existing `apps/web` funnel (Checkout Sessions `ui_mode: elements`, webhook + Queue settle, pay-link, dual payer) with a later live-account cutover that must stay wrangler secrets only
**Researched:** 2026-09-22
**Confidence:** HIGH on this repo's live failures and payment code (`PaymentPanel.tsx`, `CheckoutClient.tsx`, `intent.ts`, `errors.ts`, `stripe.ts`, `webhook.ts`, `settle.ts`, `pay-link` routes, `notify.ts`); MEDIUM on live-account TWINT/Apple Pay until the owner Dashboard (Swiss entity, domain file, capabilities) is inspected.

v1.0 booking/Hyperdrive pitfalls: `.planning/research/v1.0-archive/PITFALLS.md`.
v1.1 Ops Support pitfalls: `.planning/research/v1.1-archive/PITFALLS.md`.
This file covers **only** adding v1.2 pay features to the checkout that already exists, and the TEST→live cutover that must not become a second checkout rewrite. Quote/class rebuild, fare Publish, `sk_live_`, and `.eu` DNS are out.

v1.2 phases are not numbered yet. Prevention phases below are the workstreams the roadmap should create — not v1.0 Phase 7 (already marked complete) and not frozen 16/17/19/20.

Live failures treated as evidence, not rumor:

- Pay and continue did nothing after Email a pay link + a filled card.
- Intent/pay-link `400 {code:invalid_request}`; unpriced Economy `CHF 000` became `pricing_not_live` then hid as "Payment did not start".
- Live rate book `ops-draft-from-14` (id 15) only priced **mahaha**. Do not invent other class fares.
- `updateBillingAddress(null)` was in the confirm path.
- `email_failed` was mapped to `invalid_request`.
- Dual-copy `apps/web/public/app` is gitignored; do not copy ops mocks there.
- Do not restore page-transition cubes/glow.

## Critical Pitfalls

### Pitfall 1: Unpriced class (`CHF 000`) collapsed into `invalid_request` / "Payment did not start"

**What goes wrong:**
Customer picks a class the live book did not price. Recap already shows `CHF 000`. `POST /api/checkout/intent` or `/pay-link` returns `400 {code:invalid_request}` because `lookupVehicleClassId` found no `vehicle_classes` row (or schema parse failed), **or** the server correctly returns `pricing_not_live` and `CheckoutClient` `REFUSAL_KEYS` maps it, then a later catch/default overwrites it as `payCouldNotStart`. UAT sees a silent or generic "Payment did not start" instead of a visible unpriced refusal.

**Why it happens:**
`errors.ts` is a closed vocabulary, but callers still treat "cannot look up class id" as a bad request. `intent.ts` maps unknown quote codes to `invalid_request`. Pay-link refuses `!vehicleClassId` as `invalid_request` **before** the lock's null `total_rappen` can become `pricing_not_live`. The payment CTA's catch uses `current ?? "payCouldNotStart"`, so any missed code becomes the same string. Economy/Business/First/Van still feel like the public ladder even after Phase 18 (live book only).

**How to avoid:**
- Charge gate is the lock: `peekLockClassRappen(lock, slug) == null` → refuse `pricing_not_live` on the client **and** the server. Never open Stripe.
- Missing `vehicle_classes` row for a lock slug is `pricing_not_live` (or `quote_not_found`), not `invalid_request`.
- Do not invent a fare for Economy or any other unpriced class. Live book id 15 priced **mahaha** only — that is the priced class; everything else stays `CHF 000`.
- Keep `pricing_not_live` out of the `payCouldNotStart` default. Alert + requote, not a disabled button with no copy.

**Warning signs:** Network tab `400 invalid_request` on intent while the recap is `CHF 000`; Pay disabled with no Alert; tests that only assert `!res.ok`; any hardcoded Economy/Business/First/Van fare in checkout.

**Phase to address:** v1.2 Charge gate / unpriced refusal (before any Stripe session create). Re-verify in UAT.

---

### Pitfall 2: Mapping `email_failed` (and every other 4xx/5xx) to `invalid_request`

**What goes wrong:**
Pay-link mints the unpaid `VT-` and Checkout Session, then Resend fails. The route already returns `{code:email_failed}` `502`, but the client `REFUSAL_KEYS` has no `email_failed` entry so it becomes `payCouldNotStart`. A previous pass mapped it to `invalid_request`. The traveller thinks payment is broken; ops sees a dangling unpaid booking; retry may hit `quote_already_booked`.

**Why it happens:**
`CHECKOUT_REFUSALS` has no `email_failed`. UI authors extend `REFUSAL_KEYS` with a fallback instead of a dedicated key. "Keep the vocabulary small" looks like collapsing codes.

**How to avoid:**
- Pay-link email failure stays `email_failed` (or a new closed code), never `invalid_request`.
- Surface "link was not sent" distinct from "this class is unpriced" and "pay did not start".
- Booking + session may already exist (`loadOpenPayment`). Retry must resend mail on the same session, not mint a second PI.

**Warning signs:** `REFUSAL_KEYS.email_failed = "payCouldNotStart"` or `"invalid_request"`; 502 body `{code:invalid_request}`; unpaid `VT-` with no mail and a generic pay error.

**Phase to address:** v1.2 Pay-link send. Client refusal map in the same plan as the route.

---

### Pitfall 3: Pay and continue no-ops after Email a pay link (or any confirm-path throw)

**What goes wrong:**
Traveller sends a pay link, fills the card, clicks Pay and continue. Nothing happens — no Alert, no navigation, no Stripe confirm. Live instance: confirm called `updateBillingAddress(null)` and died. Same class of bug: `cardCreate.current` unset, Checkout Session `useCheckoutElements` still loading, `confirmPayRef` null after 25s, or `checkout.confirm` throws and the catch swallows it as busy→idle.

**Why it happens:**
`PaymentPanel` is two Stripe trees: `CheckoutElementsProvider` (wallets, session confirm) + `Elements` (split card fields). Confirm waits on both. Pay-link and self-pay share one Checkout Session / idempotency key. Sending the link does not remount the panel; `onReady` may already have closed over a stale session. Stripe Checkout `confirm` rejects `null` billing updates. Errors become `payCouldNotStart` or vanish if `busy` clears with `refusal` still null.

**How to avoid:**
- Never call `updateBillingAddress(null)` (or pass empty address objects) on confirm.
- Pay click must always end in a visible state: 3DS/redirect, confirmation wait, or Alert. Silence is a bug.
- After pay-link send, keep the same session; rebind `onReady` if the secret is already present.
- Confirm must use `checkout.confirm({ paymentMethod, email, redirect: "if_required" })` only with real fields. Skip optional updates rather than nulling them.
- Do not wait 25s with no progress copy.

**Warning signs:** Button aria-busy flickers then idle; no `/confirmation` navigation; console Stripe "invalid billing"; `confirmPayRef.current` null while card fields show complete; pay-link success copy on screen and Pay still wired to a dead confirm.

**Phase to address:** v1.2 PaymentPanel confirm wiring (self-pay **and** token page share this component).

---

### Pitfall 4: Thank-you treats client `confirm()` as paid

**What goes wrong:**
`PaymentPanel` already `router.push(/confirmation/${reference})` on `confirm` success. If confirmation SSR paints a voucher from that navigation, or skips the poller because `confirm()` returned, a failed capture / delayed TWINT / 3DS still-open PI looks confirmed. Two payers: the loser can also land on a fake thank-you. Stripe runbook: anyone who "fixes" a slow confirmation by confirming on the return URL reintroduces the bug.

**Why it happens:**
Checkout Session `confirm` + `redirect: if_required` feels like fulfillment. `ConfirmationClient` is already a read-only poller (D-16); a "speed up" patch is the regression.

**How to avoid:**
- Webhook Queue consumer (`settle.ts` on `checkout.session.completed` + `payment_status === paid`) is the only writer to confirmed.
- Thank-you stays processing until poll sees voucher status / captured payment. TWINT/3DS may never return to the tab.
- Do not add `payment_intent.succeeded` as a second confirm path that races the session event (settle already chose session `payment_status` to cover delayed TWINT).

**Warning signs:** Confirmation HTML with `data-confirmation-state="confirmed"` before `stripe_events.processed_at`; tests that assert paid after `confirm()` without a webhook fixture; return_url handler that calls settle.

**Phase to address:** v1.2 Thank-you / confirmation poller. Do not regress `webhook.ts` (verify → record → enqueue → 200).

---

### Pitfall 5: Dual payer mints a second chargeable session

**What goes wrong:**
Traveller pays on `/checkout/payment` while the other payer pays `/checkout/pay/[token]`. Two Checkout Sessions / PaymentIntents both succeed. Webhook confirms once; the second hits `booking_payments_one_success` — that is a **refund conversation**, not a retry (`docs/runbooks/stripe-webhook.md`). Customer is double-charged. The required product is: first successful charge wins; loser sees the **same** confirmation; no second capture.

**Why it happens:**
Intent creates the session before the booking row. Pay-link calls `runCheckoutIntent` again. If `loadOpenPayment` / `sessionIsPayable` fails (expired secret, amount mismatch, missing `client_secret` on Elements sessions), code creates another session instead of refusing or retrieving. Token page and checkout do not share a "already paid" read before confirm.

**How to avoid:**
- One open Checkout Session per quote/booking. Reuse via `loadOpenPayment` + `retrieve` + `sessionWithSecret`. Amount must still match `chargedRappen`.
- Before confirm, both UIs must handle `quote_already_booked` / already-settled by routing to the same confirmation, not by creating PI #2.
- Webhook settle remains idempotent (`stripe_events` PK, `stripe_event_begin`, `already_settled`, `notification_claim`). That prevents double-confirm, **not** double-charge — double-charge is prevented only by not minting a second payable session.
- Do not expire-and-recreate the session because the traveller sent a pay-link.

**Warning signs:** Two `cs_` ids on one `booking_id`; Stripe Dashboard two succeeded PIs; loser sees "Payment did not start" instead of the voucher; new `idempotency_key` on Pay click (already documented in `CheckoutClient` as causing `quote_already_booked`).

**Phase to address:** v1.2 Dual-payer / first charge wins (intent reuse + token open + settle). Race UAT with two browsers.

---

### Pitfall 6: Pay-link clock ≠ quote lock 24h (or restarts on resend)

**What goes wrong:**
Quote lock is hardcoded 24h (Phase 18 D-13). Stripe Checkout Session `expires_at` is clamped 30 minutes–24 hours (`stripeSessionExpiresAtUnix`). Token `tokenExpiresAt` is set from intent `expires_at`. If any of lock / Stripe session / token / email copy diverge, the payer hits a dead link while checkout still looks payable, or pays after the lock expired and settle `captureAllowed` acks without capturing (D-23) — money authorized, booking still pending.

**Why it happens:**
Three clocks. `payLinkSentAt` already says first send wins; a "helpful" resend that remints the token or session restarts the window. Token page maps every open failure to `paymentWindowClosed`, hiding `quote_already_booked`.

**How to avoid:**
- One expiry: quote lock 24h = pay-link expiry = session expiry (clamped only to Stripe's 24h max, which matches).
- Resend reuses token + session; do not restart the 24h clock.
- Expired/unpriced token page: visible expired / unpriced, not a blank pay form and not generic `paymentWindowClosed` for already-booked.

**Warning signs:** `setPayLink` with `new Date(now+24h)` instead of lock `expires_at`; Stripe session 30 min default; open route 409 mapped only to window-closed.

**Phase to address:** v1.2 Pay-link token + expiry. Same plan as branded mail.

---

### Pitfall 7: Company fields / VAT invented or required on self-pay

**What goes wrong:**
Product: pay-link needs company **name + VAT**; address optional; do not invent VAT format. Self-pay (card/wallets) does not need business details. Code drift: `companyReady` still requires name **and** address **and** VAT; `checkoutPayLinkSchema` accepts empty company fields; `billingKindFromFields` flips to `company` if any of the three is typed. Checkout then 400s or sends a link without VAT.

**Why it happens:**
DC fields exist for all three. Schema `.optional().default("")` looks like "product said optional". Address-required helper predates the v1.2 rule.

**How to avoid:**
- Pay-link: require company name + VAT when sending; address optional; no checksum/format invention.
- Self-pay: do not block Pay and continue on empty company fields.
- Keep `billing_kind` explicit; do not infer company from a stray address character.

**Warning signs:** Pay disabled until VAT; client-side CHE-123 regex; pay-link 400 `invalid_request` with filled card and empty company (wrong code again).

**Phase to address:** v1.2 Pay-link send (schema + UI). Not the charge gate.

---

### Pitfall 8: Token page is a second checkout (payer can edit the trip)

**What goes wrong:**
`/checkout/pay/[token]` reuses `CheckoutClient` or trip/details steps. Payer changes class, extras, or contact; intent reprices; HMAC lock no longer matches; or they pay a different amount than the email recap. Product: DC pay screen with recap; payer cannot edit.

**Why it happens:**
`PaymentPanel` is embedded in `CheckoutClient`. Copy-paste is faster than `PayClient` recap-only.

**How to avoid:**
- Token page = recap + same payment methods as checkout. No class cards, extras, coupon edit, or contact edit.
- Open route returns display fields + `client_secret` for the **existing** session only.

**Warning signs:** Token URL renders `data-checkout-step="trip"`; `applyCouponCode` on the token page; pay-link email amount ≠ session `amount_total`.

**Phase to address:** v1.2 Token page.

---

### Pitfall 9: Other payer gets the manage link (or traveller gets nothing)

**What goes wrong:**
`deliverConfirmation` sends the same `BookingForEmail` (including `manageUrl`) to contact, then to `payer_email` if different, then to support. v1.2: traveller always gets confirmation + confirmation email + manage link; different payer gets a **receipt only** (no manage). Calendar invite is **out** of v1.2 — do not reintroduce `.ics` as a "while we're here".

**Why it happens:**
`confirmationRecipients` and the notify extra-set treat every extra address as another confirmation. Fallback `vehicleClassLabel: … || "business"` invents a class name in mail.

**How to avoid:**
- Split templates: confirmation+manage for traveller; receipt without manage for other payer.
- Never default vehicle to `business` / Economy / First / Van. Use the lock slug or omit.
- Do not attach `.ics` in this milestone.

**Warning signs:** Payer mail contains `/manage-booking?token=`; email HTML says Business when the paid class was mahaha; new ics dependency in notify.

**Phase to address:** v1.2 Confirmation mail split (queue consumer only; never the browser).

---

### Pitfall 10: Wallets assumed from Dashboard while the panel cannot render them

**What goes wrong:**
Product asks card, Apple Pay, Google Pay, TWINT, Link in TEST. `PaymentPanel` Express Checkout sets `googlePay: "never"`, `paypal: "never"`, `paymentMethodOrder: ["link","apple_pay"]`. Split Card Elements are not the Payment Element — **TWINT will not appear** there. Runbook: current test account is **UAE**; TWINT needs a Swiss Stripe entity — do not add a Worker flag to fake it. Apple Pay needs domain verification on **`vamostaxi.site`** (the page origin), not `.eu`. 3DS must work in TEST (`redirect: "if_required"` + test cards); swallowing Stripe errors as `payCouldNotStart` hides 3DS/decline.

**Why it happens:**
Phase 7 research recommended Payment Element + Dashboard methods + Adaptive Pricing and forbade a hand-built method map (`stripe.ts` still says this). Split card fields were added for DC chrome. Express Checkout defaults get copied from a previous sitting. Google Pay "never" looks like a Safari-only Apple Pay polish.

**How to avoid:**
- Card + Link + Apple Pay + Google Pay on this chrome; TWINT only if the Stripe account can actually offer it (Swiss capability). Skip TWINT with a written note if the entity is not Swiss — do not stub a TWINT radio.
- Apple Pay: verify `vamostaxi.site` (and `www`) in Stripe Dashboard domain file. Do not wait for `.eu`.
- 3DS/decline/expired/unpriced each have a visible UAT path. Do not map decline to `payCouldNotStart` only.
- Do not pass `payment_method_types` on session create (D-09). Do not restore PayPal.

**Warning signs:** `googlePay: "never"` left in; TWINT radio in DC with no Stripe method; Apple Pay missing on Safari against staging; confirm without `redirect: "if_required"`.

**Phase to address:** v1.2 Wallet methods + TEST UAT. TWINT capability is owner Dashboard, not a code flag.

---

### Pitfall 11: TEST→live cutover becomes a checkout rewrite (or mixed-mode keys)

**What goes wrong:**
v1.2 goal: later live Stripe is wrangler secret/config swap only. A live sitting instead retargets PaymentIntents, changes `ui_mode`, rebuilds webhooks in app code, or ships `pk_live_` in `wrangler.jsonc`. Mixed mode: `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` baked `pk_test_` at OpenNext build while Worker `STRIPE_SECRET_KEY` is `sk_live_` — `browserStripe()` **prefers** `process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` over the intent `publishable_key`. Sessions fail. `stripe listen` `whsec_` left on staging while Dashboard live endpoint uses another secret → every webhook 400. Production `vars` still `pk_test_placeholder`. Apple Pay domain file still only on `.site` when traffic later moves — but v1.2 traffic **is** `.site`; do not bind `.eu`.

**Why it happens:**
Publishable key exists in three places (wrangler vars, NEXT_PUBLIC, intent JSON). Webhook secrets differ: CLI listen vs Dashboard endpoint vs live vs test. `stripe.ts` comment "never `pk_live_` here" is about the **repo**, not about never using live keys in secrets. Someone "fixes" cutover by editing PaymentPanel.

**How to avoid:**
- Cutover checklist (later, not this milestone): `wrangler secret put STRIPE_SECRET_KEY` + `STRIPE_WEBHOOK_SECRET` together; publishable via wrangler vars/secret, **same mode** as secret; Dashboard webhook URL + signing secret for that endpoint; never paste live keys in chat, git, or `vars` committed as `pk_live_`.
- Browser Stripe.js must use the server-provided publishable key (intent/open). Do not let a build-time `NEXT_PUBLIC_` test key override it.
- Test objects (`cs_test_`, `pi_test_`, test customers) do not exist on the live account. No data migration of Stripe ids.
- v1.2 itself stays `pk_test_` / `sk_test_`. Production wrangler env may exist but must not receive `sk_live_` in this milestone.

**Warning signs:** `pk_live_` or `sk_live_` in git (`public-chf.test.ts` already guards wrangler); webhook 400 after a secret put; Elements "publishable key" mismatch; code comments "for live we should switch to PaymentIntents".

**Phase to address:** Architecture now in every v1.2 payment plan. **Execute live keys only at a later owner-gated cutover** (not v1.2). Re-verify at v1.0 Phase 11 / close-out — do not do it here.

---

### Pitfall 12: Logging `client_secret` / `sk_` or copying mocks into gitignored `public/app`

**What goes wrong:**
Intent JSON includes `client_secret` and `client_secret_hex`. Debug `console.log(json)` puts a usable secret in Worker logs. `updateBillingAddress` / confirm traces dump the session. Dual-copy of DC mocks into `apps/web/public/app/` (gitignored) "fixes" pixels that vanish on the next rebuild. Restoring page-transition cubes/glow breaks platform law.

**Why it happens:**
Hex encoding exists because some clients mangled the secret; logging both "to compare" is tempting. `public/app` looks like the mock host.

**How to avoid:**
- Never log Stripe secret keys, webhook secrets, or `client_secret` / `client_secret_hex` values. Log session id (`cs_…`) and booking reference only.
- Do not copy ops/public mocks into `apps/web/public/app/`.
- Do not restore cubes/glow.

**Warning signs:** `console.log` near `decodeClientSecret`; git status silent after "updating mocks"; CSS `filter: glow` / cube transition in checkout.

**Phase to address:** Every v1.2 payment plan (logging + UI). Owner gates stay owner gates.

---

### Pitfall 13: `/bookings` unpaid pays a different amount or a new PI

**What goes wrong:**
Signed-in list maps `pending` → unpaid → `/checkout/payment`. That page reads `vamosTrip` localStorage, not the unpaid row. New quote, new idempotency key, new session, possibly a different class than the pending booking. Home `beginHomeBooking` may cancel the unpaid pending row on the next visit.

**Why it happens:**
Checkout is trip-lock-first. Account list is Postgres-first. Two sources of truth.

**How to avoid:**
- Unpaid row pays the **existing** open session (same path as token open / `loadOpenPayment`).
- Do not invent a fare to make the row payable. If the class is unpriced, visible `pricing_not_live`.
- Home abandon must not cancel a row the customer opened from `/bookings` to finish paying in another tab without an explicit new quote.

**Warning signs:** `/bookings` href to `/checkout/trip`; second `cs_` on the same reference; pending row cancelled when Pay is clicked.

**Phase to address:** v1.2 Account unpaid pay.

---

### Pitfall 14: Charge currency / Adaptive Pricing confused with inventing CHF

**What goes wrong:**
Session `price_data.currency` must stay engine CHF (`CHARGE_CURRENCY`). Adaptive Pricing may *present* EUR/USD/AED. A "fix TWINT" patch pins presentment to CHF in a way that breaks Adaptive Pricing, or a "fix FX" patch charges the display currency. Unpriced stays `CHF 000` — filling it from `/api/fx` or a sibling class is inventing a fare. Extra wait is not in Stripe pay-now (D-23).

**Why it happens:**
Display currency is client state (ADR-004). Recap uses `chfRappenToDisplay`. TWINT needs CHF presentment — Stripe drops TWINT automatically when presentment is not CHF; no Worker flag.

**How to avoid:**
- Charge CHF rappen from the lock + extras + VAT. Never accept `total_rappen` from the client (`FORBIDDEN_SERVER_FIELDS`).
- Do not invent class fares, VAT rates, or legal copy.
- Extra wait stays off the PI.

**Warning signs:** `unit_amount` taken from display major; `payment_method_types: ["twint"]`; FX multiply on `chargedRappen`; fallback fare when `total_rappen` is null.

**Phase to address:** v1.2 Charge gate + session create (`stripe.ts` already documents this — do not regress).

---

### Pitfall 15: Bypassing owner gates to "finish" payment

**What goes wrong:**
Agent puts `sk_live_`, binds `.eu`, Publishes the fare book, `supabase db push`, wipes `yaumjzvylngfjhtuffqs`, or disables MFA "so UAT can pay". Staging then charges real cards or destroys ops data.

**Why it happens:**
UAT blocked on unpriced mahaha-only book looks like a Publish problem. Live Stripe looks like the only way to test Apple Pay domain.

**How to avoid:**
- v1.2 is Stripe TEST on `vamostaxi.site`. Dummy cards. No `sk_live_`. No `.eu`. No fare Publish. No live DB restore/wipe. Secrets via `wrangler secret put` at the owner prompt.
- Apple Pay domain verification on `.site` is allowed; live account is not.

**Warning signs:** PR with `pk_live_`; DNS diff on `vamostaxi.eu`; `pricing_live` flipped in SQL; chat paste of `sk_`.

**Phase to address:** Never in v1.2 execute. Keep on the owner-gate list (secrets, live DB wipe, MFA, `sk_live_`, `.eu` DNS, fare Publish).

---

## Technical Debt Patterns

Shortcuts that seem reasonable but create long-term problems.

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Split Card Elements + Express Checkout instead of Payment Element | Matches DC card chrome | TWINT/Link/wallet drift; two Stripe trees; confirm races | Acceptable for v1.2 **if** wallets UAT lists what actually renders; not a substitute for TWINT capability |
| `REFUSAL_KEYS` fallback to `payCouldNotStart` | One Alert | Unpriced, email_failed, 3DS, decline all look the same | Never for `pricing_not_live`, `email_failed`, `quote_already_booked` |
| Mint new Checkout Session when retrieve has no `client_secret` | Unblocks the form | Second PI, double-charge | Never — retrieve/expand or refuse |
| New `idempotency_key` per Pay click | Feels like a retry | `quote_already_booked` on the real retry | Never — mint once per quote |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` override in `browserStripe` | Local demo without intent | TEST key baked over live vars at cutover | Never once intent returns a key |
| Confirm booking on `confirm()` / return_url | Instant thank-you | False paid, dual-payer lies | Never |
| Map `email_failed` → `invalid_request` | Closed vocabulary | Wrong UAT, dangling unpaid `VT-` | Never |
| Default vehicle label `"business"` in mail | No blank class | Invented class | Never |
| Copy DC into `apps/web/public/app/` | Pixels today | Gitignored; next rebuild wipes it | Never |
| Worker flag to hide missing TWINT | Green UAT | Lies about Swiss capability | Never — written skip |
| Put `pk_live_` in wrangler `vars` | Cutover "works" in git | Live key in repo | Never — secrets only |

## Integration Gotchas

Common mistakes when connecting to external services.

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| Stripe Checkout Sessions | Bare PaymentIntent; `ui_mode: custom` (rejected on Dahlia); `payment_method_types` map | `ui_mode: "elements"`, Dashboard methods + Adaptive Pricing, `CHECKOUT_UI_MODE` in `stripe.ts` |
| Stripe keys | Mix `pk_test_` / `sk_live_`; prefer `NEXT_PUBLIC_` over intent key | Same-mode trio: publishable + secret + webhook secret; browser uses server key |
| Stripe webhooks | `stripe listen` secret on the deployed Worker; settle in the HTTP handler | Dashboard endpoint secret on staging; HTTP = verify/record/enqueue 200; settle on Queue |
| Stripe Elements confirm | `updateBillingAddress(null)`; confirm before session `type === "success"` | Skip null updates; wait for checkout success or fail visible |
| Apple Pay | Domain file on `.eu` or Dashboard-only without the page origin | Verify `vamostaxi.site` (the origin that serves PaymentPanel) |
| Google Pay | `googlePay: "never"` left in Express Checkout | Enable when product says Google Pay; UAT on a capable browser |
| TWINT | Fake radio / Worker flag; expect it on a UAE test account | Swiss Stripe capability; skip with a note; no code flag |
| 3DS TEST | Treat `redirect: "if_required"` success as capture | Poll webhook; use TEST 3DS cards; visible decline |
| Resend pay-link | Treat send failure as intent invalid | `email_failed` 502; reuse session on retry |
| Resend confirmation | Same body to payer + traveller | Traveller confirmation+manage; payer receipt only |
| Quote lock | Reprice on token page; invent class totals | Server recompute vs lock; null total → `pricing_not_live` |
| Rate book | Assume Economy is priced | Live book classes only; id 15 = mahaha priced, others `CHF 000` |
| Cloudflare Queue | Batch/timeout leaves thank-you spinning | Staging already `max_batch_size: 1`, timeout 1s — do not "optimize" up |
| Wrangler | Secrets in `vars` or chat | `wrangler secret put`; tests assert no `sk_live_` in repo |

## Performance Traps

Patterns that work at small scale but fail as usage grows.

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Webhook HTTP does capture + email | Stripe retries; duplicate mail; 504 | Fast ack + Queue (`webhook.ts` / `settle.ts`) | First slow Resend already |
| Confirmation poll stop at 12s (`POLL_GIVE_UP_MS`) | Visual give-up while poll continues — or a "fix" that **stops** polling | Keep polling until voucher or failed; give-up is copy only | TWINT / 3DS / Queue retry |
| New Stripe session per extra/coupon toggle | Many open `cs_`; wrong amount charged | Expire-or-reuse; remint secret in panel | First coupon apply already clears secret — must not mint twice concurrently |
| Intent silent retry ×6 on payment step | Hidden 400 storm | Stop on `pricing_not_live`; don't retry invalid_request | Unpriced class on every load |
| Dual confirm (traveller + token) without session reuse | Two PIs | One session; first capture wins | Two open laptops |

## Security Mistakes

Domain-specific security issues beyond general web security.

| Mistake | Risk | Prevention |
|---------|------|------------|
| Log `client_secret` / `sk_` / `whsec_` | Anyone with logs can pay or forge webhooks | Log `cs_` id + reference only |
| Skip webhook signature (`constructEventAsync`) | Forged `checkout.session.completed` confirms bookings | 400 on `WebhookVerificationError`; never parse body first |
| Confirm from return_url / `confirm()` | Attacker hits thank-you without paying | Poll settled row only |
| Pay-link token in query logged or emailed in ops Slack | Other payer's URL is a bearer instrument | Token hash in DB (already); raw token only in mail |
| Token page allows trip edit | Payer changes destination/price | Recap-only |
| Client-supplied `total_rappen` | Underpay | `FORBIDDEN_SERVER_FIELDS` + lock recompute |
| Capture after lock expiry / `is_test` | Charge a cancelled/test row | `captureAllowed` (D-23 / D-33) |
| CSRF-less pay-link POST | Cross-site mints unpaid `VT-` + mail | Keep `csrfForbidden` |
| Mixed live/test keys | Live charges from staging UAT | Owner gate; tests on wrangler `pk_test_` |
| Restore/wipe `yaumjzvylngfjhtuffqs` | Destroy ops + paid rows | Owner gate |

## UX Pitfalls

Common user experience mistakes in this domain.

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Unpriced class as "Payment did not start" | Thinks the card is broken | `pricing_not_live` Alert + requote; keep `CHF 000` |
| Pay and continue does nothing | Abandon; retry → double submit | Always Alert, 3DS, or wait-room |
| Pay-link success then dead Pay button | Traveller cannot self-pay | Same session; confirm still bound |
| Token 409 as generic expired | Winner's payer sees "expired" not confirmation | `quote_already_booked` → same confirmation |
| Thank-you voucher before webhook | False confirmed, then email never arrives | Processing until poll |
| Other payer gets manage link | Stranger can cancel/change | Receipt only |
| Invented Economy fare on recap | Legal/price lie | `CHF 000` + refuse |
| Cubes/glow / mock copy in `public/app` | Brand law + vanished pixels | DC classes in the React app; no gitignored dual-copy |
| 3DS popup swallowed | Card charged or not, user stuck | `redirect: if_required` + processing page |
| Company VAT required on self-pay | Corporate fields block a tourist | Only for Email a pay link |

## "Looks Done But Isn't" Checklist

Things that appear complete but are missing critical pieces.

- [ ] **Pay and continue:** Click after filled card **and** after pay-link send actually confirms or Alerts — verify in the live browser, not by reading `onPay`.
- [ ] **Unpriced class:** Economy (or any non-mahaha class on book id 15) stays `CHF 000` and shows `pricing_not_live`, never `invalid_request`.
- [ ] **Refusal map:** `email_failed`, `pricing_not_live`, `quote_already_booked` each have their own UI key — grep `REFUSAL_KEYS` and `errors.ts`.
- [ ] **Confirm path:** No `updateBillingAddress(null)` (or null billing) in `PaymentPanel`.
- [ ] **Thank-you:** Voucher only after webhook settle; poller still running past 12s copy.
- [ ] **Dual payer:** Two browsers, one `cs_`, first capture wins, loser sees same confirmation, one Stripe charge.
- [ ] **Pay-link expiry:** Token, session, lock all 24h; resend does not restart.
- [ ] **Token page:** Recap-only; cannot edit trip; methods match checkout.
- [ ] **Mail:** Traveller confirmation+manage; other payer receipt only; no invented class; no `.ics` in v1.2.
- [ ] **Wallets:** Apple Pay domain on `vamostaxi.site`; Google Pay not `never` if in scope; TWINT skipped with a note unless Swiss capability; 3DS TEST card works.
- [ ] **`/bookings` unpaid:** Same session as checkout, not a new quote.
- [ ] **Secrets:** No `sk_live_` / `pk_live_` in repo; no `client_secret` in logs.
- [ ] **Cutover shape:** Browser key from server; webhook secret is the Dashboard endpoint; no PaymentIntent rewrite planned.
- [ ] **Mocks:** Nothing written to gitignored `apps/web/public/app/`; no cubes/glow.
- [ ] **Owner gates:** No Publish, no `.eu`, no live DB wipe, no MFA off.

## Recovery Strategies

When pitfalls occur despite prevention, how to recover.

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Unpriced class charged via invented fare | HIGH | Refund; never backfill other class prices; requote from live book |
| Double charge (two PIs) | HIGH | Refund the loser PI; keep `booking_payments_one_success`; do not retry settle |
| `email_failed` after mint | LOW | Resend on the same session/token; do not remint PI |
| Confirm no-op / `updateBillingAddress(null)` | LOW | Patch confirm; do not tell the customer to refresh into a second session blindly — reuse `loadOpenPayment` |
| Webhook 400 (wrong `whsec_`) | MEDIUM | Put the **endpoint** secret; Resend the Dashboard event (cannot double-charge if settle is idempotent) |
| Thank-you showed paid, capture later failed | HIGH | Ops: match Stripe vs `bookings.status`; do not let the UI stay voucher; refund if captured in error |
| Pay-link expired, lock still valid | LOW | Do not extend silently; requote or explicit resend policy — first-send clock stays |
| Mixed test/live keys | HIGH | Stop traffic; restore matching test trio on staging; never "fix" by putting live keys on staging |
| `client_secret` logged | MEDIUM | Rotate nothing for publishable; treat log store as secret; expire open sessions |
| Mocks in `public/app` | LOW | Delete; they were never deployed |

## Pitfall-to-Phase Mapping

How roadmap phases should address these pitfalls.

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| Unpriced → `invalid_request` / hidden pay start | Charge gate / unpriced refusal | Live book id 15: mahaha payable; other class `CHF 000` + `pricing_not_live` Alert |
| `email_failed` mapped to `invalid_request` | Pay-link send | Kill Resend key in TEST → 502 `email_failed` + distinct copy; unpaid row exists; retry sends |
| Pay no-op after pay-link / null billing | PaymentPanel confirm | After send-link, fill TEST card, Pay navigates or Alerts < 5s |
| Thank-you on `confirm()` | Thank-you poller | Break webhook secret: page stays processing, booking pending |
| Dual-payer second PI | Dual-payer / first charge wins | Two browsers; one `cs_`; one succeeded PI; loser confirmation |
| Pay-link clock ≠ 24h lock | Pay-link token + expiry | Token open after lock expiry = visible expired; resend keeps `sent_at` |
| Company VAT / self-pay | Pay-link send | Self-pay with empty company succeeds; pay-link without name+VAT refused without inventing format |
| Token page edits trip | Token page | No extras/class controls; recap matches email |
| Payer gets manage link | Confirmation mail split | Two inboxes: traveller manage URL, payer none |
| Wallets / 3DS / TWINT | Wallet methods + TEST UAT | Apple Pay on verified `.site`; 3DS TEST card; Google Pay not `never`; TWINT note if UAE account |
| `/bookings` new PI | Account unpaid pay | Unpaid row opens existing session amount |
| TEST→live rewrite / mixed keys | Architecture in every plan; live execute **later** | `browserStripe` does not prefer baked `NEXT_PUBLIC_` over intent; wrangler tests forbid `sk_live_` |
| Secret logging / gitignored mocks / glow | Every payment plan | Grep logs; `public/app` untouched; no cube CSS |
| Owner gates | Never in v1.2 execute | No `.eu`, no Publish, no live wipe, no `sk_live_` |

## Sources

- Live staging failures listed in the research brief (Pay no-op after pay-link; `400 invalid_request`; unpriced Economy hidden as pay-start; book `ops-draft-from-14` id 15 mahaha-only; `updateBillingAddress(null)`; `email_failed` → `invalid_request`)
- `apps/web/app/[locale]/checkout/PaymentPanel.tsx` — dual Elements trees; `browserStripe` prefers `NEXT_PUBLIC_`; confirm `router.push`; Express `googlePay: "never"`
- `apps/web/app/[locale]/checkout/CheckoutClient.tsx` — `REFUSAL_KEYS`; silent intent retry; pay-link + `onPay`
- `apps/web/lib/checkout/errors.ts` — closed vocabulary, no `email_failed`
- `apps/web/lib/checkout/stripe.ts` — `elements` ui_mode, CHF charge, 24h clamp, no `payment_method_types`
- `apps/web/lib/checkout/intent.ts` / `lock-to-rpc.ts` — `pricing_not_live` vs `invalid_request` on missing class id
- `apps/web/app/api/checkout/pay-link/route.ts` — `email_failed` 502; `!vehicleClassId` → `invalid_request`
- `apps/web/lib/checkout/webhook.ts` + `settle.ts` + `docs/runbooks/stripe-webhook.md` — fast ack, Queue, dual-PI refund conversation
- `apps/web/app/[locale]/confirmation/[ref]/ConfirmationClient.tsx` — poller is source of truth
- `apps/web/lib/checkout/notify.ts` — same confirmation to payer; `"business"` fallback
- `docs/runbooks/stripe-test-mode-e2e.md` — UAE test account vs TWINT; no invented fares; `stripe listen` secret ≠ Dashboard secret
- `.planning/PROJECT.md` v1.2 Payment (2026-09-22); `.planning/phases/07-checkout-payment/07-RESEARCH.md`
- Stripe Checkout fulfillment: session completed + `payment_status === paid`; Dahlia `ui_mode` rename (`custom` → `elements`)

---
*Pitfalls research for: v1.2 Payment (Stripe TEST on existing checkout; live cutover = secrets only)*
*Researched: 2026-09-22*
