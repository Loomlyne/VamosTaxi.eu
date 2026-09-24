# Phase 21: Charge gate + visible refusal + payable intent - Research

**Researched:** 2026-09-23
**Domain:** Custom Checkout charge gate (visible refusal, session reuse, client TEST account pointer)
**Confidence:** HIGH

## User Constraints (from CONTEXT.md)

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

Chrome is frozen in `21-UI-SPEC.md`. Do not rewrite it. CONTEXT D-01…D-17 win over ROADMAP wording that puts an Alert on the class card. ROADMAP success criterion 1’s “Alert + requote” is the Pay backstop only.

## Summary

The charge gate is already on the server. `runCheckoutIntent` refuses `pricing_not_live` and `quote_expired` before `createCheckoutSession`. What UAT still cannot see is a silent Select-off card, a Pay screen that never mounts Stripe.js when the class is `CHF 000` or the lock is already dead, and a lock-zero timer that does not mint a second session. Payable `client_secret` reuse (`checkout_open_payment` + `sessionIsPayable`) already works and must stay. It must not run against the UAE test account already bound on Worker `vamos`.

**Primary recommendation:** Keep Custom Checkout `ui_mode: "elements"`. Paint the refusal on the surfaces that already exist. Refuse before any Stripe client is constructed. Reuse the open session for **mahaha** only after the owner has pointed TEST at the client account. Do not Publish. Do not invent CHF. Do not add a package.

## Phase Requirements

| ID | Source | What must be true | Already true in code | This phase |
|----|--------|-------------------|----------------------|------------|
| PAY-08 | REQUIREMENTS.md | Unpriced `CHF 000` refuses visibly (`pricing_not_live`) and never opens Stripe | Intent returns 409 `pricing_not_live` when the chosen lock total is null (`intent.ts`). UI maps that code to `pricingNotLive`. | Select off, silent cards, Pay backstop with dummy fields, no Stripe mount, missing class id is the same code |
| PAY-09 | REQUIREMENTS.md | Expired 24h lock refuses visibly; pay-link dies with that lock; resend does not restart it | Intent returns 409 `quote_expired` from lock `exp`. Pay-link send calls that intent first. | Visible Alert, token page copy, token expiry pinned to lock `exp`, no new session after zero |

ROADMAP Phase 21 success criteria 3–5 are in scope and already mostly true: session reuse, `email_failed` 502, must-nots. Do not pull Phase 22–25 (card confirm, wallets, mail split, live runbook) into the plan.

## Architectural Responsibility Map

| Concern | Primary | Secondary | Rationale |
|---------|---------|-----------|-----------|
| Unpriced / expired refusal code | `apps/web/lib/checkout/intent.ts` + `errors.ts` | `app/api/checkout/intent/route.ts` | Codes already exist. Route must not translate them into `invalid_request` before they run. |
| Select off / `CHF 000` | `BookingBoard.tsx`, `CheckoutClassCards.tsx` | `peekLockClassRappen` | Display-only. Null rappen is not a fare. No new card copy. |
| Pay backstop chrome | `CheckoutClient.tsx`, `PayClient.tsx` | `21-UI-SPEC.md` | Frozen Alert + dummy fields. Do not mount `PaymentPanel` Stripe until a payable secret exists. |
| Session reuse | `loadOpenPayment` → `checkout_open_payment` + `sessionIsPayable` | `stripe.ts` `createCheckoutSession` | Refresh returns the same `client_secret`. Do not add a second object model. |
| Pay-link clock | `pay-link/route.ts` caller of `setPayLink` | `checkout_pay_link_by_hash` | Pin `p_token_expires_at` to lock `exp`. SQL already refuses `t.expires_at <= now()`. |
| Account pointer | Owner wrangler secrets + staging var | Prefix guard in the Worker | Agent never reads keys. Payable create stops while the bound publishable prefix is the UAE test account. |
| Guest Requote cancel | New definer RPC, owner-apply | Worker calls it, then navigates Home | No guest write door exists. See Schema. |

## Standard Stack

### Core

| Library | Version | Purpose | Why |
|---------|---------|---------|-----|
| `stripe` | 22.6.1 (installed; npm registry confirms 22.6.1) | Checkout Session create / retrieve / expire | Already the only Stripe server client. `CHECKOUT_UI_MODE = "elements"`. API version in code: `2026-08-26.dahlia`. |
| `@stripe/stripe-js` | 9.15.0 | `loadStripe` for a payable secret only | Do not mount it for dummy fields. |
| `@stripe/react-stripe-js` | 6.9.0 | `CheckoutProvider` / Elements on the payable path | Phase 23 owns wallets. Do not bump. |
| `zod` | 4.4.3 | Intent and pay-link body parse | Already on the routes. |
| `vitest` | 4.1.11 | Unit gate | `apps/web/lib/**/*.test.ts` only. |

### Supporting

| Library | Version | Purpose | When |
|---------|---------|---------|------|
| next-intl | 4.13.7 | `checkout.pricingNotLive`, `checkout.quoteExpired`, `checkout.requote` | Reuse. en/de/fr/ar already match the UI-SPEC. No new card string. |
| Kit `Alert` / `Button` / `Input` | in-repo | Refusal chrome | `tone="info"` unpriced, `tone="danger"` expired. Never `accent`. |

### Alternatives Considered

| Instead of | Could use | Why not |
|------------|-----------|---------|
| Custom Checkout `ui_mode: "elements"` | Hosted Checkout (`success_url`) | Locked. Dahlia renamed `custom` → `elements`. Product is unchanged: Payment Element on Vamos chrome. |
| Checkout Session | PaymentIntent-only | Locked. More code, loses the session `client_secret` this phase returns. |
| Invent a CHF for Economy | Publish book 15 | Locked. Payable UAT class is **mahaha** only. Live book id **15**. |
| New Stripe SDK | Bump past 22.6.1 / 6.9.0 | Not required. Phase 23 owns a bump only if 6.9.0 blocks TWINT. |

**Installation:** none.

**Version verification:** `npm view stripe@22.6.1`, `@stripe/stripe-js@9.15.0`, `@stripe/react-stripe-js@6.9.0` on 2026-09-23. Do not `npm install`.

## Architecture Patterns

### System architecture

```
Home / checkout cards
  public fare null  →  CHF 000, Select off, no copy, no /intent
        │
        ▼ land on Pay anyway (backstop)
  peekLockClassRappen == null  OR  lock.exp <= now
        │
        ├─ refuse immediately
        ├─ dummy inputs (no loadStripe, no sessions.create)
        └─ Alert: pricingNotLive (info) or quoteExpired (danger)
        │
        ▼ priced AND lock live AND owner checkpoint passed
  POST /api/checkout/intent
        │
        ├─ checkIntentAgainstLock → 409 pricing_not_live | quote_expired
        │     (before Stripe client, before sessions.create)
        ├─ checkout_open_payment + sessionIsPayable → reuse client_secret
        └─ else sessions.create ui_mode=elements on the CLIENT test account
              │
              ▼ pay-link
        token expires_at = lock exp (not now + window)
        open: hash RPC; if not found → quoteExpired, dummy fields, no create
```

### Pattern: refuse before the Stripe SDK

**What:** Unpriced, missing class id, and expired lock return the existing refusal and never call `stripeFromEnv` or `createCheckoutSession`.
**When:** Every Pay land, every intent, every pay-link send, every token open.
**Why:** Today `postIntent` constructs `stripeFromEnv(env)` before the class-id check. A missing `STRIPE_SECRET_KEY` throws and the outer catch returns 500 `intent_unhandled`, so UAT cannot tell `CHF 000` from a missing secret. `lookupVehicleClassId` miss returns `invalid_request`, which `CheckoutClient` maps to `payCouldNotStart`.

```84:86:apps/web/app/api/checkout/intent/route.ts
  if (!vehicleClassId) {
    return refuse("invalid_request");
  }
```

ROADMAP SC 1: missing class id is the same refusal, not a bad request. Map that miss to `pricing_not_live`. Do not add a new code.

### Pattern: Select off is not hide

**What:** `publicFleet` already keeps a card whose `ineligible_reason !== "no_rate"`. `publicRappen` already paints null when `pricing_live` is false or rappen is null (`CHF 000` via `formatAmount`).
**Gap:** `BookingBoard` sets `disabled={!eligible}`. Eligible + null rappen is still selectable. `pricingNote` then shows the pricing-not-live label — that violates D-01 (silent card). `CheckoutClassCards` disables only on pax/bags fit, not on null `peekLockClassRappen`.
**Fix:** Select off when the displayed rappen is null. Keep the card. No tooltip. No `pricingNotLive` on the card. Do not filter the card out (that would merge unpriced with Phase 18 D-32 hide).

### Pattern: dummy fields, not a dead iframe

**What:** `PaymentPanel` always mounts `<Elements stripe={promise}>` even when `clientSecret` is empty. `CheckoutProvider` is correctly gated on `secret`, but the card iframes are not. `CheckoutClient` always renders `PaymentPanel` on the payment step.
**Fix:** If unpriced, expired, or no payable secret: do not render `PaymentPanel`. Render disabled kit `Input`s with the existing labels (`cardNumber`, `cardExpiry`, `cardCvc`, `cardCountry`). Pay and Email a pay link stay in the layout, `disabled`. Alert on top. Requote is `Button size="md"` (UI-SPEC), checkout Pay only.

### Pattern: lock zero does not mint

**What:** `checkIntentAgainstLock` already returns `quote_expired` when `payload.exp` is past worker or Postgres now. `QUOTE_LOCK_MINUTES = 1440`.
**Gap:** No client timer. A priced Pay that sits until zero still has a mounted session. D-04: disable that session (cannot type), set `quoteExpired`, do not call intent again.
**Decorative vs authoritative:** `lib/quote/lock.ts` says the Worker/UI clock is decorative. The authoritative check is `payload.exp` against Postgres `now()` inside intent, and `quote_lock_expires_at` on the snapshot. The timer exists so the screen does not wait for the next tap. The server still refuses.

### Pattern: reuse, do not replace, the open session

**What:** `payableFromOpen` retrieves the stored session and `sessionIsPayable` requires `client_secret`, `status` open (or unset), and CHF amount equal to `chargedRappen`.
**Keep:** That path for mahaha. Tests already cover reuse and the 23001 replay (`intent.test.ts`).
**Do not:** Mint on the UAE account. If retrieve fails after the key swap, that is “old session not reused” (D-16) — create the replacement only on the client account, only while the lock is live.

### Anti-patterns

- **Do not** call `sessions.create` to populate disabled iframes.
- **Do not** map `pricing_not_live` or `quote_expired` to `payCouldNotStart`, `invalid_request`, or `paymentWindowClosed` on these surfaces.
- **Do not** put Requote on the token page.
- **Do not** set `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`. `browserStripe` prefers it over the intent `publishable_key`. It is unset in wrangler today. Phase 25 owns that bake. This phase must not introduce it.
- **Do not** read, log, or commit `sk_test_` / `pk_test_` / `whsec_`. Prefix `pk_test_51U65pW` is enough to name the bound UAE account.

## Don't Hand-Roll

| Problem | Don't build | Use instead | Why |
|---------|-------------|-------------|-----|
| Card collection | A card form that talks to Stripe | Existing `PaymentPanel` only after a payable secret | Phase 22 owns confirm. Dummy slots are kit `Input`s, not a second Stripe form. |
| Price | A CHF constant for Economy / business / van | Lock `class_totals[].total_rappen` and `peekLockClassRappen` | Null stays `CHF 000`. Book 15 prices **mahaha** only. |
| Lock MAC | A new expiry token | `verifyLock` / `checkIntentAgainstLock` | HMAC already pins `exp`. |
| Session reuse | A new table or PaymentIntent lookup | `checkout_open_payment` + `sessionIsPayable` | Granted to `vamos_checkout` only. |
| Copy | A second English sentence | `checkout.pricingNotLive`, `checkout.quoteExpired`, `checkout.requote` | Already en/de/fr/ar. UI-SPEC forbids rewrite. |
| Account switch | A Stripe account id in git | Owner `wrangler secret put` + staging var replace | D-17: do not invent the account id. |

**Key insight:** The bug UAT hits (“Payment did not start” on Economy `CHF 000`) is a collapsed code and a mounted Stripe field, not a missing payment stack.

## Runtime State Inventory

This phase points TEST at another Stripe account. It is not a rename, but stored session ids and wrangler bindings are live state.

| Category | Items found | Action |
|----------|-------------|--------|
| Stored data | `booking_payments.stripe_checkout_session_id` for unpaid rows, created on the UAE test account | Do not reuse after the swap. Retrieve-miss is expected. Do not copy those ids onto the client account. No backfill. |
| Live service config | Worker `vamos` staging `STRIPE_PUBLISHABLE_KEY` (wrangler var, UAE prefix `pk_test_51U65pW`). `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` are secrets, not in `vars`. Production var is the placeholder name only. | Owner replaces all three before any new session. Agent does not read them. |
| OS-registered state | None for this phase. | None. |
| Secrets/env vars | Names only: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` (`env.d.ts`, `wrangler secret put`), `STRIPE_PUBLISHABLE_KEY` (staging `vars`). | No key in git, chat, tests, or this file. |
| Build artifacts | `browserStripe` module cache keyed by publishable key | After the var replace, a long-lived tab can keep the old key until reload. UAT uses a fresh load. Do not set `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`. |

**Webhook:** D-16 is an owner Dashboard step on the **client** test account, pointing at the existing Worker endpoint. This phase does not wait on `checkout.session.completed` (Phase 22). The secret must still be put before the first new session so the later swap is the same account.

## Common Pitfalls

### Pitfall 1: `invalid_request` paints “Payment did not start”
**What goes wrong:** Economy `CHF 000` looks like a missing `client_secret`.
**Why:** `REFUSAL_KEYS.invalid_request` is `payCouldNotStart`. Route returns `invalid_request` when `lookupVehicleClassId` misses. `onPay` also does `setRefusal(current => current ?? "payCouldNotStart")`.
**How to avoid:** Missing class id and null rappen stay `pricing_not_live`. Do not change `email_failed`. Do not change `errors.ts` to collapse codes. `pricing_not_live` has `action: null` on the wire; the Pay screen still shows Requote because UI-SPEC says so, not because the JSON gained `action: "requote"`.
**Warning signs:** Alert text is “Payment did not start. Try Pay and continue again.”

### Pitfall 2: Stripe.js mounts with an empty secret
**What goes wrong:** Disabled iframes, or a session created only to fill them.
**Why:** `PaymentPanel` always renders `<Elements>`. `CheckoutClient` always renders `PaymentPanel` on the payment step.
**How to avoid:** Dummy kit inputs when there is no payable secret. `createCheckoutSession` is unreachable from the unpriced and expired branches.
**Warning signs:** Network call to `api.stripe.com` or `m.stripe.network` on an unpriced Pay land.

### Pitfall 3: Select off was assumed done
**What goes wrong:** Traveller selects Economy, continues, hits the Pay backstop.
**Why:** Home disable is `!eligible`, not null rappen. Checkout class buttons disable on fit only. Discretion asked research to confirm. It is not off.
**How to avoid:** One predicate: displayed rappen null → `aria-disabled`, not hidden. Silent.
**Warning signs:** A `pricingNotLive` string on the fleet card, or a hidden board when every class is `CHF 000`.

### Pitfall 4: Pay-link clock is not the quote lock
**What goes wrong:** Resend restarts a 24h pay window. Token open mints a session after the lock is dead.
**Why:** `runCheckoutIntent` sets `expiresAt` to `workerNow + checkoutWindowMinutes` and the pay-link route passes that to `setPayLink`. `checkout_set_pay_link` inserts a **new** token each send (`on conflict (token_hash) do nothing` does not update the old row). Comment in SQL says `pay_link_sent_at` does not restart; the token `expires_at` argument does, if the caller passes now+window. `checkout_pay_link_by_hash` checks `t.expires_at > now()` and `s.expires_at > now()` (payment window), **not** `s.quote_lock_expires_at`. Those clocks are different columns. Both settings are 1440 minutes, but the lock starts at quote time and `expires_at` starts at snapshot write.
**How to avoid:** Pass lock `payload.exp` as `tokenExpiresAt`. Never `max(old, now+window)`. Send path already dies with `quote_expired` when intent runs first — keep that, and do it before Stripe. Open path: if the hash RPC does not return a row, return `quote_expired` for a token that was issued, and do not `sessions.create`. Do not paint `paymentWindowClosed` on that page (UI-SPEC).
**Warning signs:** A new Checkout Session id in the client Dashboard after the lock timestamp.

### Pitfall 5: Requote is a link, and the abandon route does not exist
**What goes wrong:** D-09 fails. The unpaid row stays `requires_payment`. The next intent reuses the old session.
**Why:** Requote is a home link. `app/home/home.dc.html` `beginHomeBooking` POSTs `/api/checkout/abandon`. That route is not in `apps/web`. `checkout_cancel_unpaid` is `authenticated` + JWT email, and it does not change `booking_payments.status`, so `checkout_open_payment` would still return the session. Paid cancel returns `unpaid_use_hard_delete`. `vamos_checkout` has no table UPDATE.
**How to avoid:** Owner-apply a definer the Worker can execute. See Schema. Do not grant anon. Do not call paid-cancel. Client navigation is not the cancel.
**Warning signs:** Home loads, `checkout_open_payment` still returns a session id.

### Pitfall 6: Payable create on the UAE account
**What goes wrong:** mahaha `client_secret` belongs to the wrong account. Later live cutover is a migration, which D-17 forbids.
**Why:** Staging publishable var is the UAE test prefix. Secret and webhook secret are the matching account until the owner replaces them.
**How to avoid:** Payable `sessions.create` / retrieve-for-reuse stops while `STRIPE_PUBLISHABLE_KEY` starts with `pk_test_51U65pW`. Compare the prefix only. Do not log the rest. Unpriced and expired never call Stripe, so they pass on either account. If the owner has not put the three values, the payable task stops. Do not invent an account id. Do not mint a session to see if the key works.
**Warning signs:** A new Checkout Session whose account is not the client test Dashboard.

### Pitfall 7: `email_failed` collapse
**What goes wrong:** A Resend failure looks like a charge-gate refusal.
**Why:** Someone cleans up codes.
**How to avoid:** `pay-link/route.ts` stays `502` with code `email_failed`. No i18n remap onto `pricingNotLive`.

## Code Examples

### Refusal before Stripe (existing, keep)

```typescript
// apps/web/lib/checkout/intent.ts — runCheckoutIntent
// Source: repo. checkIntentAgainstLock already returns quote_expired / pricing_not_live.
if (!checked.ok) {
  return refuse(mapQuoteCode(checked.code));
}
// null class total — same function, still before createCheckoutSession
if (netRappen == null) {
  return refuse("pricing_not_live");
}
```

`errors.ts`: `pricing_not_live` and `quote_expired` are 409. Do not retarget them at 400.

### Session reuse (existing, keep)

```typescript
// apps/web/lib/checkout/stripe.ts
export function sessionIsPayable(session, chargedRappen): session is Stripe.Checkout.Session {
  if (!session?.client_secret) return false;
  if (session.status && session.status !== "open") return false;
  // CHF amount must match chargedRappen when currency is chf
  return true;
}
```

Create stays `mode: "payment"`, `ui_mode: "elements"`, `return_url` set, no `success_url`, no `payment_method_types`. Stripe docs: `ui_mode=elements` is the Checkout Session displayed with Elements; `success_url` is not allowed for that mode. https://docs.stripe.com/api/checkout/sessions/create

### Payable account guard (new, prefix only)

```typescript
/** Bound staging account is not the client's. Do not mint on it. */
export function stripeAccountIsLegacyUaeTest(publishableKey: string): boolean {
  return publishableKey.startsWith("pk_test_51U65pW");
}
```

No full key in the test. No secret read.

### Pay-link expiry (caller change, no SQL)

```typescript
// Pass the verified lock exp. checkout_set_pay_link does not clamp this argument.
// Resend inserts a new token; the exp must be the original lock, not now+window.
tokenExpiresAt: new Date(lockPayload.exp);
```

## State of the Art

| Old approach | Current | When | Impact |
|--------------|---------|------|--------|
| `ui_mode: "custom"` | `ui_mode: "elements"` | Stripe Dahlia, 2026-03-25; pinned in `stripe.ts` against 22.6.1 | Do not send `custom`. Do not switch to `hosted_page`. |
| 30-minute quote lock | 24h / 1440 minutes | Phase 18 D-13, migration `20260907000001_quote_lock_24h.sql` | Lock `exp` and `quote_lock_expires_at`. Not a new hours field. |
| Hosted Checkout redirect | Elements on Vamos chrome | Phase 7 | Stay. |

**Deprecated:** `ui_mode` values `custom` / hosted redirect for this product. PaymentIntent-only rewrite. `pk_live_` / `sk_live_` until Phase 25.

## Schema

No `supabase db push`. No new table. No fare Publish.

| Change | Needed? | Who applies | Autonomous |
|--------|---------|-------------|------------|
| Unpriced / expired refusal, dummy fields, session reuse, prefix guard, token exp = lock `exp` | No migration | Worker code | true |
| `checkout_pay_link_by_hash` also require `quote_lock_expires_at > now()` | Not required if every new token exp is the lock `exp` (hash already requires `t.expires_at > now()`). Optional hardening only. | Owner, if taken | false |
| Guest Requote cancel (D-09) | **Yes.** No existing `vamos_checkout` function cancels an unpaid row and clears `requires_payment`. | Owner-apply one definer. Agent writes the migration file; owner applies. Agent does not push. | **false** |

D-09 RPC shape, not a script to run from this phase:

- `security definer`, `search_path` empty, `EXECUTE` for `vamos_checkout` only. Revoke `public`, `anon`, `authenticated`.
- Input: `quote_id` (the checkout Worker already has it). Pending or `quote` only. No captured charge.
- Set booking and legs to the existing cancelled status. Set `booking_payments.status` to the existing enum value `canceled` (American spelling, migration `20260823000014_payments_refunds.sql`) so `checkout_open_payment` returns null. Do not invent a status. Do not insert `booking_refunds`.
- Do not call Stripe inside the function. Worker may `expireCheckoutSession` only after the client-account checkpoint. While the publishable prefix is `pk_test_51U65pW`, skip the Stripe expire call — do not mint, and do not need the UAE API to satisfy “do not reuse.”

Until that RPC is applied, Requote must not pretend the row is gone. The refusal UI does not wait on it.

## Assumptions Log

| # | Claim | Section | Risk if wrong |
|---|-------|---------|---------------|
| A1 | `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` is unset in the Worker build (referenced only in `PaymentPanel`, not in wrangler vars). | Anti-patterns | If a build bakes it, Elements and the Session are different accounts. Do not set it. Phase 25 owns the preference line. |
| A2 | Book id 15 still prices only **mahaha**. Not re-queried against hosted SQL this sitting. | Summary | If someone Published, UAT class changes. Do not Publish to check. CONTEXT is the lock. |
| A3 | `checkout_set_pay_link` will store a lock `exp` that is still in the future without clamping. | Pitfall 4 | If a later migration clamps `p_token_expires_at` to now+window, resend restarts the clock again. Re-read that function before planning the call. |

A2 is a product lock, not a license to query fares. A3 is verified against `20260907000002_checkout_company_paylink.sql` as it exists today (no clamp).

## Open Questions

1. **Client Stripe account id**
   - What we know: it is not the account behind staging prefix `pk_test_51U65pW`.
   - What's unclear: the id. D-17 forbids inventing it.
   - Recommendation: owner checkpoint. Payable task stops until the three bindings are replaced. Do not ask the agent to paste keys.

2. **D-09 until the owner applies the RPC**
   - What we know: no guest write door.
   - What's unclear: when the owner will apply.
   - Recommendation: plan the RPC as owner-apply, `autonomous: false`. Do not block PAY-08 on it. Do not fake cancel in the client.

## Environment Availability

| Dependency | Required by | Available | Version | Fallback |
|------------|-------------|-----------|---------|----------|
| `vitest` | Nyquist | yes | 4.1.11 | — |
| `stripe` / Elements packages | Payable path | yes, installed | 22.6.1 / 9.15.0 / 6.9.0 | Do not add another |
| Worker `vamos` staging | UAT | yes, named | — | — |
| Client `sk_test_` / webhook secret / `pk_test_` | Payable mahaha session | no, not this account | — | Stop payable task. Unpriced/expired still ship. |
| Hosted SQL push | D-09 | Owner | — | Refusal UI does not need it |
| `.planning/graphs/graph.json` | Graphify | no, absent | — | Ignored |

**Missing with no fallback:** client TEST keys, for the payable-intent task only.

**Missing with fallback:** D-09 RPC. Refusal, dummy fields, and “do not mint” do not need it.

## Validation Architecture

Nyquist is on (`workflow.nyquist_validation: true`). Security enforcement is on, ASVS level 1.

### Test Framework

| Property | Value |
|----------|-------|
| Framework | vitest 4.1.11 |
| Config file | `apps/web/vitest.config.ts` |
| Quick run command | `cd apps/web && npx vitest run lib/checkout/intent.test.ts lib/checkout/checkout-fields.test.ts lib/quote/intent.test.ts` |
| Full suite command | `cd apps/web && npx vitest run lib/**/*.test.ts` |

`vitest.config.ts` excludes `tests/integration/**` and `**/*.spec.ts`. `passWithNoTests: true`. **Do not** use `vitest run tests/integration/*.spec.ts` — that glob is excluded and an empty match is vacuously green.

Do not edit `apps/web/lib/checkout/checkout-comments.test.ts` in a way that drops `refusal === "pricingNotLive"`. That file is dirty from another session; leave it unless a plan task owns it.

### Phase Requirements → Test Map

| Req ID | Behavior | Test type | Automated command | File exists? |
|--------|----------|-----------|-------------------|--------------|
| PAY-08 | Null class total → 409 `pricing_not_live`, create not called | unit | `cd apps/web && npx vitest run lib/checkout/intent.test.ts` | yes — `returns 409 pricing_not_live` |
| PAY-08 | `peekLockClassRappen` null for missing slug | unit | `cd apps/web && npx vitest run lib/checkout/checkout-fields.test.ts` | yes |
| PAY-08 | Missing `vehicleClassId` is `pricing_not_live`, not `invalid_request` | unit | same intent file | Wave 0 — route/deps seam |
| PAY-08 | Displayed rappen null → not selectable; card still listed | unit | `lib/**/*.test.ts` | Wave 0 — extract predicate into `lib/` so the mandated glob covers it |
| PAY-08 | UAE prefix blocks `sessions.create`; unpriced path does not call it | unit | `lib/**/*.test.ts` | Wave 0 |
| PAY-09 | Expired lock → 409 `quote_expired`, create not called | unit | `lib/checkout/intent.test.ts` | yes — `returns 409 quote_expired` |
| PAY-09 | Pay-link token exp is lock `exp`, not now+window; resend does not extend | unit | `lib/**/*.test.ts` | Wave 0 |
| PAY-09 | `email_failed` stays 502 and is not a charge-gate code | unit | `lib/**/*.test.ts` | Wave 0 if not already asserted outside the dirty comments test |
| SC 3 | Open session reused; create not called | unit | `lib/checkout/intent.test.ts` | yes — `reuses the unpaid session` |
| D-04 | `exp <= now` → refuse, no second create | unit | `lib/quote/intent.test.ts` + intent.test | server yes; client timer is UAT |

### Sampling Rate

- **Per task commit:** `cd apps/web && npx vitest run lib/checkout/intent.test.ts lib/checkout/checkout-fields.test.ts lib/quote/intent.test.ts`
- **Per wave merge:** `cd apps/web && npx vitest run lib/**/*.test.ts`
- **Phase gate:** that full lib suite green before `/gsd:verify-work`. UAT on staging is human: unpriced card, Pay land, lock zero, mahaha secret after the owner checkpoint.

### Wave 0 Gaps

- [ ] `apps/web/lib/checkout/charge-gate.test.ts` — prefix guard, token-exp pin, missing class id → `pricing_not_live`, selectable predicate. No key material.
- [ ] Do not add `tests/integration/*.spec.ts` as the proof.

UI mount (no Stripe iframe, dummy inputs, Alert tone, no Requote on the token page) is not in the lib glob. Cover the predicate in lib. Confirm the screen in UAT against `21-UI-SPEC.md`. Do not point Nyquist at Playwright.

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard control |
|---------------|---------|------------------|
| V2 Authentication | no | No new login. Token page is the existing hashed pay token. |
| V3 Session Management | yes | `client_secret` is a bearer for one Checkout Session. Reuse it. Do not log it. Do not put it in a new cookie. |
| V4 Access Control | yes | `vamos_checkout` EXECUTE only. No anon grant on the D-09 RPC. No service-role table write from the route. |
| V5 Input Validation | yes | Existing zod on intent and pay-link. Do not trust client rappen. Lock HMAC + Postgres `now()` are the gate. |
| V6 Cryptography | yes | Stripe SDK and existing HMAC. Do not hand-roll webhook signatures. Agent never reads `STRIPE_WEBHOOK_SECRET`. |

### Known Threat Patterns

| Pattern | STRIDE | Mitigation |
|---------|--------|------------|
| Invented CHF / Publish to make Economy payable | Tampering | Null stays null. No rate-book write. |
| `sessions.create` on the UAE account | Spoofing | Prefix guard + owner checkpoint. No key in logs. |
| Secret in RESEARCH, tests, or chat | Information disclosure | Prefix `pk_test_51U65pW` only. `wrangler secret put` is owner-typed. |
| Anon `EXECUTE` on a cancel RPC | Elevation | `vamos_checkout` only. Pending/quote only. |
| Collapsed error codes | Repudiation | Keep `pricing_not_live`, `quote_expired`, `email_failed` distinct. |
| CSRF on intent / pay-link | Tampering | Keep `csrfForbidden` already on those POSTs. |

**Threat model:** this phase adds no new trust boundary. It stops a Checkout Session from being created when the quote is not payable, and it stops that create from hitting the wrong Stripe account.

## Sources

### Primary (HIGH)

- `.planning/phases/21-charge-gate-visible-refusal-payable-intent/21-CONTEXT.md` — D-01…D-17
- `.planning/phases/21-charge-gate-visible-refusal-payable-intent/21-UI-SPEC.md` — frozen chrome, copy, tones
- `.planning/ROADMAP.md` Phase 21 — PAY-08 / PAY-09 success criteria
- `.planning/REQUIREMENTS.md` — PAY-08, PAY-09
- `apps/web/lib/checkout/intent.ts`, `errors.ts`, `stripe.ts`, `vamos-trip.ts` `peekLockClassRappen`
- `apps/web/app/api/checkout/intent/route.ts` — `invalid_request` on missing class id; Stripe client constructed first
- `apps/web/app/api/checkout/pay-link/route.ts` — `email_failed` 502; intent `expires_at` passed to `setPayLink`
- `apps/web/app/api/checkout/pay-link/open/route.ts` — reuse, else `sessions.create`; hash miss → `payment_window_closed`
- `apps/web/app/[locale]/checkout/CheckoutClient.tsx`, `PaymentPanel.tsx`, `pay/[token]/PayClient.tsx`
- `apps/web/components/home/BookingBoard.tsx` — `disabled={!eligible}`; `publicRappen`
- `packages/db/supabase/migrations/20260909133000_checkout_open_payment.sql`
- `packages/db/supabase/migrations/20260907000002_checkout_company_paylink.sql` — token insert, hash checks `s.expires_at` not `quote_lock_expires_at`
- `packages/db/supabase/migrations/20260825000007_quote_snapshot_rpc.sql` — two clocks
- `packages/db/supabase/migrations/20260911180000_checkout_cancel_unpaid.sql` — authenticated only
- `apps/web/lib/env.d.ts` — binding names
- `apps/web/wrangler.jsonc` — staging publishable var is the UAE test account (prefix only; value not copied here)
- https://docs.stripe.com/api/checkout/sessions/create — `ui_mode=elements`; `success_url` not allowed for that mode; `client_secret` on the Session

### Secondary (MEDIUM)

- `.planning/research/SUMMARY.md`, `PITFALLS.md`, `ARCHITECTURE.md` — charge gate first; do not hide `pricing_not_live` behind `payCouldNotStart`
- `apps/web/lib/quote/lock.ts` — UI clock is decorative; 1440 minutes
- `app/home/home.dc.html` `beginHomeBooking` — calls `/api/checkout/abandon`, which is not an `apps/web` route

### Tertiary (LOW)

- None. Book 15 was not re-read from hosted SQL this sitting (A2).

## Metadata

**Confidence breakdown:**

- Standard stack: HIGH — versions installed and confirmed on npm; no new package.
- Architecture: HIGH — refusal, reuse, pay-link, and Select paths read in repo.
- Pitfalls: HIGH — code matches the UAT bug (collapsed code, Elements always mounted, Select not tied to null rappen, token exp is the checkout window).
- D-09 write door: HIGH that it is missing; the RPC itself is not applied.

**Research date:** 2026-09-23
**Valid until:** 2026-10-23 (stable checkout stack; account pointer is an owner step, not a library change)

## Planning notes (do not expand scope)

- Files another session has dirty — read, do not revert: `CheckoutClient.tsx`, `PaymentPanel.tsx`, `app/api/checkout/pay-link/route.ts`, `checkout-comments.test.ts`.
- Leftovers 16 / 17 / 19 / 20 untouched.
- No `.eu`. No `sk_live_`. No fare Publish. No card capture, wallets, traveller/payer mail split, or TEST→live runbook.
- Payable UAT class: **mahaha**. Live book id: **15**.
- `email_failed` stays `email_failed` (502).

## RESEARCH COMPLETE




