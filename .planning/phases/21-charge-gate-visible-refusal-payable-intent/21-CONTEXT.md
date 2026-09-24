# Phase 21: Charge gate + visible refusal + payable intent - Context

**Gathered:** 2026-09-22
**Status:** Ready for planning

<domain>
## Phase Boundary

UAT can tell an unpriced `CHF 000` class from a missing `client_secret`. Stripe never opens for an unpriced class. A priced live-book class (**mahaha**) returns a reusable `client_secret`. Expired 24h lock refuses visibly; pay-link dies with that lock.

This phase does not capture a card, wait on webhooks, paint wallets, split traveller/payer mail, or write the TEST→live runbook. It does point TEST at the client's Stripe account before any new Checkout Session (D-14). It does not Publish fares or invent CHF. Leftovers 16/17/19/20 stay frozen. Custom Checkout stays.

</domain>

<decisions>
## Implementation Decisions

### When the refusal appears
- **D-01:** An unpriced class stays on home and checkout as `CHF 000` with **Select off**. Silent — no extra copy, no tooltip, no “pricing not live” on the card. They never reach Pay.
- **D-02:** If every class is unpriced, still show the cards, every Select off. Do not hide the board. Do not block the quote shell.
- **D-03:** Pay is a backstop. If they land on Pay unpriced or already expired: refuse the moment they land. Do not mount Stripe. Do not let them fill a card.
- **D-04:** If they sit on a priced Pay and the 24h lock hits zero: refuse immediately — no refresh, no next tap. If Stripe was already mounted, disable it (visible, cannot type). Do not mint a new session.

### Blocked Pay screen
- **D-05:** Blocked checkout Pay keeps the DC card layout. Alert + Requote. Card fields stay visible but dead. Pay and Email a pay link are disabled. Do not tear the form out.
- **D-06:** Land already expired / unpriced / dead token: **do not mount Stripe** and **do not create a Checkout Session**. Fill the slots with dummy DC inputs that look like the mock. Alert on top.
- **D-07:** Never create a session just to show disabled Stripe iframes.

### Requote
- **D-08:** Checkout Requote goes **Home** and wipes. New quote.
- **D-09:** Tapping Requote **cancels the unpaid booking immediately**, then Home. Do not wait for Home load or a new quote.
- **D-10:** Token page has **no Requote**. Expired copy only. Home would start the payer’s own booking.

### Token page vs checkout Pay
- **D-11:** Expired token keeps the trip recap, the Alert, and dummy dead fields. Payer cannot edit the trip.
- **D-12:** When the lock dies, **nobody** can pay — not traveller checkout, not token. Quote again from Home. Resend does not restart the clock.

### Client test account (this sitting)
- **D-14:** The Stripe account already bound on Worker `vamos` is not the client's. Staging `STRIPE_PUBLISHABLE_KEY` is the UAE test account (`pk_test_51U65pW…`). Do not mint a new Checkout Session on it. Payable intent uses the **client's Stripe TEST account** only.
- **D-15:** Owner changes the connection before any new session: `wrangler secret put STRIPE_SECRET_KEY` (client `sk_test_`), `wrangler secret put STRIPE_WEBHOOK_SECRET` (that account's endpoint), replace staging `STRIPE_PUBLISHABLE_KEY` with that account's `pk_test_`. Agent never reads, stores, or pastes keys. No `sk_live_`. No key in chat.
- **D-16:** Webhook endpoint is registered on the **client** test Dashboard, not the old account. Old open sessions are not reused. If the owner has not put the keys, the payable-intent task stops at that checkpoint. Unpriced and expired still never open Stripe, on either account.
- **D-17:** Phase 25 still owns the TEST→live runbook. This phase only points TEST at the client account so later live cutover is a same-account secret swap, not a migration between accounts. Do not invent the client's account id.

### Inherited (do not reopen)
- **D-13:** No invented rappen. No fare Publish. Payable UAT class is **mahaha**. Keep Custom Checkout `ui_mode: "elements"`. No `sk_live_`. No `.eu`. `email_failed` stays `email_failed` (502). `pricing_not_live` / expired stay those codes — not `payCouldNotStart` / `invalid_request`. Unpriced/expired never open Stripe objects. Leftovers 16/17/19/20 untouched. Phase 18 D-13 (24h lock, unpaid keep snapshot until then) and D-32 (hide-from-public) stay; unpriced is not hide, but the public card looks the same (`CHF 000`, Select off).

### Claude's Discretion
- Alert tone: never `accent` / tinted yellow. Use existing danger/info tokens.
- Dummy DC field markup matching PaymentPanel labels (number / expiry / CVC / country).
- Client timer vs worker poll internals for D-04 — must fire at zero without a reload.
- Whether live Select is already off (BookingBoard / class cards) — product requires it; research confirms, plan makes it true.
- Reuse existing `checkout_open_payment` + `sessionIsPayable` for mahaha (ROADMAP SC 3).
- Four-language Alert copy: reuse `pricingNotLive` / `quoteExpired` if they match; new strings same sitting en/de/fr/ar. Silent Select means **no** new card copy.

</decisions>

<specifics>
## Specific Ideas

- Live bug: fill card → Pay → dead “Payment did not start” because Economy is `CHF 000` on book id 15. Refusal must not wait for that click.
- Owner: “it should be never unpriced” means Select is off so they never reach Pay — not that we invent fares or Publish a four-class sheet.
- Token payer is not the traveller. Requote-to-Home on the token page is wrong.
- 2026-09-23: client Stripe account is not the one already in use. Switch to the client test account now (token + connection) so TEST→live later is the same account.

</specifics>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### This phase
- `.planning/phases/21-charge-gate-visible-refusal-payable-intent/21-CONTEXT.md` — this file; D-01…D-13 win on conflict
- `.planning/ROADMAP.md` — Phase 21 goal + success criteria PAY-08 / PAY-09
- `.planning/REQUIREMENTS.md` — PAY-08, PAY-09
- `.planning/PROJECT.md` — v1.2 Payment milestone lock (TEST now, live later = secrets)

### Research
- `.planning/research/SUMMARY.md` — charge gate first; unpriced paints `pricing_not_live`
- `.planning/research/PITFALLS.md` — book 15 mahaha-only; `payCouldNotStart` hide; `email_failed` → `invalid_request`
- `.planning/research/ARCHITECTURE.md` — build order: visible refusals → payable `client_secret`

### Prior phases (inherit, do not reopen)
- `.planning/phases/18-ops-pricing-source/18-CONTEXT.md` — D-13 24h lock; D-32 hide = listed, Select off, `CHF 000`
- `.planning/phases/07-checkout-payment/` — Custom Checkout; do not switch hosted / PI-only

### Code
- `apps/web/app/[locale]/checkout/CheckoutClient.tsx` — payment step, requote, pay-link
- `apps/web/app/[locale]/checkout/PaymentPanel.tsx` — Custom Checkout Elements
- `apps/web/app/[locale]/checkout/pay/[token]/PayClient.tsx` — token landing
- `apps/web/app/api/checkout/intent/route.ts` — `409 pricing_not_live`
- `apps/web/lib/checkout/vamos-trip.ts` — `peekLockClassRappen`
- `apps/web/lib/checkout/errors.ts` — do not collapse codes
- `CLAUDE.md` — `--vt-*`, `CHF 000`, four languages, no glow

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `peekLockClassRappen` — null class total = unpriced
- Intent `409 {"code":"pricing_not_live"}` — keep this code, paint it
- i18n `pricingNotLive`, `quoteExpired`, `payCouldNotStart` (last must not swallow the first two)
- Alert component — no tinted yellow
- `CheckoutClassCards` / home Select — must be off when rappen is null

### Established Patterns
- Four locales same sitting; Arabic RTL logical properties
- Amounts `CHF 000` / `CHF 00.00` until a real number
- Home `/` wipes previous quote/lock and the previous unpaid row
- Custom Checkout `ui_mode: "elements"` — do not replace

### Integration Points
- Home class cards + checkout trip Select
- `/checkout/pay` step and `/checkout/pay/[token]`
- `POST /api/checkout/intent` and `POST /api/checkout/pay-link`
- `booking_payments` open session reuse for mahaha

### Landmines
- Live published book **id 15** `ops-draft-from-14` — only **mahaha** priced. Economy/business intent 409. Do not invent CHF. Do not Publish.
- Bound Stripe account is UAE test (`pk_test_51U65pW…` in staging vars). Not the client. D-14…D-17. Do not print the full key.
- `browserStripe()` baked `NEXT_PUBLIC_` vs intent publishable — Phase 25, not 21.
- Dual-copy: do not write `apps/web/public/app/`.

</code_context>

<deferred>
## Deferred Ideas

- Card capture, decline, thank-you webhook wait, `updateBillingAddress(null)` — Phase 22
- Apple Pay / Google Pay `auto` / Link / TWINT — Phase 23
- Pay-link company+VAT, first-charge-wins, traveller vs payer mail — Phase 24
- `/bookings` unpaid reuse + TEST→live runbook — Phase 25
- Owner Publish of a four-class sheet — not this milestone
- Hide-from-public ops flag (Phase 18 D-32) — already exists; do not merge with unpriced in copy

</deferred>

---

*Phase: 21-charge-gate-visible-refusal-payable-intent*
*Context gathered: 2026-09-22*
