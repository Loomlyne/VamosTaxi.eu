# Architecture Research

**Domain:** v1.3 Meta measurement on the existing Worker `vamos` (OpenNext) + public site `vamostaxi.site` + Supabase `yaumjzvylngfjhtuffqs`
**Researched:** 2026-09-23
**Confidence:** HIGH on the live plug-in points (consent write, banner host, CSP, webhook HTTP handler, queue settle, paid transition). MEDIUM on Meta discarding a second server-only Purchase that reuses `event_id` — their dedupe doc is written for pixel+CAPI overlap, so once-only is our row, not theirs.

v1.3 does **not** add a payment stack, a thank-you confirm, or a second webhook. It measures ads only: one browser PageView after Accept, and one Purchase from the existing Stripe paid path, in the CHF Stripe charged. Quote, Checkout Session shape, `checkout_payment_settle`, and confirmation stay as they are.

v1.2 Payment architecture is archived at `.planning/research/v1.2-archive/ARCHITECTURE.md`. Do not edit that archive.

## Standard Architecture

### System Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ Browser (guest or signed-in) — customer pages only                         │
│  Banner: Accept / Dismiss until a choice (not home-only)                   │
│  Pixel 1595596972063765 loads only if flag + marketing + route allow       │
│  fbq PageView only. No Purchase. No noscript. No advanced matching.        │
│  _fbp / _fbc stay in the browser until a same-origin write stores them     │
├─────────────────────────────────────────────────────────────────────────────┤
│ Worker vamos (OpenNext)                                                     │
│  POST /api/consent  → record_consent (accept_all stores marketing=true)    │
│  POST /api/meta/click → click ids on the booking (not Stripe metadata)     │
│  POST /api/stripe/webhook → verify, record, enqueue, 200. No Meta. No paid.│
│  queue() → handleStripeMessage → checkout_payment_settle (paid truth)      │
│            then, only if that settle just paid a real CHF booking charge:  │
│            one CAPI Purchase. Retry reuses the stored event_id.            │
├─────────────────────────────────────────────────────────────────────────────┤
│ Postgres (SECURITY DEFINER, vamos_system)                                   │
│  consent_log (append-only, latest row wins)                                 │
│  booking_payments.charged_rappen + charged_currency='CHF' (the amount)      │
│  NEW booking click-id row + NEW purchase outbox (not a second confirm)      │
└─────────────────────────────────────────────────────────────────────────────┘
         │ CAPI only                              │ never the browser
         ▼                                        ▼
  graph.facebook.com                         Stripe (test until he says)
```

The HTTP webhook is not the paid transition. `apps/web/app/api/stripe/webhook/route.ts` verifies the signature, calls `stripe_event_record`, enqueues `{eventId, type, objectId, stripeCreated}`, and returns 200. `apps/web/lib/checkout/webhook.ts` states the rule: this handler never marks paid and never captures. `apps/web/worker.ts` `queue()` calls `handleStripeMessage`. `checkout_payment_settle` is the only pending → paid → confirmed path (`packages/db/supabase/migrations/20260827000004_settlement_rpcs.sql`). Purchase is a side effect after that RPC returns a newly paid booking charge. It does not insert a payment, does not set `bookings.status`, and does not run on `/confirmation/[ref]`.

### Component Responsibilities

| Component | Responsibility | Typical implementation |
|-----------|----------------|------------------------|
| `CookieBanner` + `POST /api/consent` | Accept / Dismiss only. No new switches. | Existing two-button banner. Accept stays `accept_all` + Turnstile. Dismiss stays `reject_all`. |
| `recordConsent` (`lib/consent/bind.ts`) | The only consent write. Today every method stores `marketing=false`. | Accept stores `marketing=true`. Dismiss and `settings_change` stay false. Subject still comes from the GUC, never from the body. |
| `SiteShell` | Decides who sees the banner and who may mount the pixel. | Banner on customer pages until a choice. Pixel mount is a sibling, not inside the banner (the banner unmounts after the choice; later navigations still need PageView). |
| Route gate | PageView only if marketing is on and the URL has no booking secret. | Deny by route identity, not only by a live query string. Middleware already 302-strips `token` / `mb` on manage-booking. |
| Click-id store | `_fbp` and `_fbc` where the paid path can read them for that booking. | New side row keyed by `booking_id`. Not Stripe metadata. Not `stripe_events.payload`. |
| Queue consumer | Paid truth, then one Purchase. | Existing `settle.ts`. New outbox drain even when `stripe_event_begin` says `already_processed`. |
| CAPI sender | One Purchase, CHF charged amount, no PII. | Worker `fetch` to Graph. Token from `wrangler secret put`. Staging test event code only. |
| Legal flag | Pixel stays unloaded until owner lines exist in en/de/fr/ar. | Fail-closed constant. TBC pills are not a licence to load `fbevents.js`. |

## Recommended Project Structure

```
apps/web/lib/meta/
├── gate.ts                 # route allow/deny. Pure. No network.
├── pixel.tsx               # client loader. PageView only. Behind the legal flag.
├── click.ts                # read _fbp/_fbc from a Cookie header; never log them
├── capi.ts                 # Graph POST. Builds a payload that cannot see email or reference.
└── purchase.ts             # consumer side effect. Outbox + same event_id on retry.
apps/web/app/api/meta/click/route.ts   # same-origin write of click ids onto an unpaid booking
packages/db/supabase/migrations/       # click-id table + purchase outbox + SECURITY DEFINER RPCs
```

Existing files that change, and nothing else in the charge path:

```
apps/web/lib/consent/bind.ts                          # marketing true only for accept_all
apps/web/app/api/auth/route.ts                        # signup must not clobber an Accept
apps/web/components/shell/SiteShell.tsx               # banner not home-only; mount pixel gate
apps/web/lib/security/headers.ts                      # Facebook hosts on script/connect/img
apps/web/lib/checkout/settle.ts                       # after settle, drain Purchase outbox
```

### Structure Rationale

- **`lib/meta/`:** measurement is not checkout. Keeping it out of `lib/checkout/stripe.ts` stops click ids and the CAPI token from riding the Stripe client.
- **A side table, not columns on `bookings` forced through `checkout_create_booking`:** the create-booking RPC is the charge insert. Do not add Meta arguments to it. Copy click ids after the booking id exists.
- **SECURITY DEFINER RPCs, `vamos_system` only:** `consent_log` has no table SELECT for the worker roles. The queue consumer already cannot write `stripe_events` except through `stripe_event_*`. Same shape for the purchase read: one function returns marketing, click ids, charged rappen, currency, and sent flag. It does not return email, name, reference, route, or flight.
- **Do not edit** `app/api/stripe/webhook/route.ts`, `lib/checkout/webhook.ts`, `lib/checkout/stripe.ts` (`sessions.create`), `checkout_payment_settle`, the thank-you page, or extra-wait settle.

## Architectural Patterns

### Pattern 1: Browser gate and server proof are different stores

**What:** The pixel needs a fast browser signal. The Purchase needs the append-only ledger. They are not the same cookie.

**When to use:** PageView on navigation, and Purchase at settle time.

**Trade-offs:** A mirror cookie can be stale for one tab. That can miss or extra-fire a PageView. It cannot fire a Purchase. The webhook ignores the mirror.

**Example:**

```typescript
// accept_all only. reject_all and settings_change stay marketing: false.
// Signup (auth/route.ts) writes settings_change or reject_all today.
// That insert is a new consent_log row. Latest row wins at settle time.
// Do not let signup downgrade an Accept — skip the append if a row exists,
// or copy the latest marketing flag. Do not pass marketing from the client.
const marketing = method === "accept_all";
```

`consent_subject` stays HttpOnly (`lib/consent/cookie.ts`). The client cannot read it. Set a non-HttpOnly mirror on the Accept response and clear it on Dismiss and on `settings_change`. `POST /api/consent` already returns `Set-Cookie`. Add the mirror there. Do not mint it on GET (the cache pitfall in `cookie.ts`).

`settings_change` is the cookies-page “record choice again” button and the footer prefs listener. It is not Accept. It stays `marketing=false`. No category switches.

### Pattern 2: Purchase is a post-settle side effect with its own outbox

**What:** The paid transition commits inside `checkout_payment_settle`, which also sets `stripe_events.processed_at`. A queue redelivery then hits `stripe_event_begin` → `already_processed` and returns before any code that sits under `should_process`. If CAPI runs only in the `!already_settled` branch, a failed Graph call is lost on retry, or a naive retry sends a second Purchase.

**When to use:** Any side effect that must be once, and must survive the existing dedupe.

**Trade-offs:** One new table and a drain step in `settle.ts`. No change to the paid RPC. Confirmation email stays independent — a Meta failure must not roll back paid, and an email failure must not skip the outbox insert.

**Example:**

```typescript
// After the existing settle call, not instead of it.
// already_processed still enters this drain. It does not call checkout_payment_settle again.
if (unsent) {
  await sendPurchase(unsent.eventId); // same id as the first attempt
  if (!sent) return { retry: true };
}
```

`event_id` is a uuid stored on the outbox row at insert, or the Stripe `evt_` id. It is not the booking reference (`VT-…`). Meta’s own docs say two consecutive server events are not discarded by the fbp method. Our unique key on `booking_id` is the once-gate. Same `event_id` on retry is so a redelivery that Meta does dedupe collapses, and so we never mint a second id.

Do not send when `session.metadata.kind === "extra"`. Extra-wait is not the booking charge. One Purchase per booking, not per Stripe object.

### Pattern 3: Route identity, not “does the query string still contain token”

**What:** `middleware.ts` 302-strips `token` and `mb` on `/manage-booking` and `/booking-detail` into the HttpOnly `vt_manage` cookie before the page paints. A check of `location.search` after that redirect would load the pixel on the token page.

**When to use:** Every pixel mount, including client navigations.

**Trade-offs:** A few public pages that look “clean” stay dark. That is the point. `fbclid` is not a booking token — do not strip it. The landing page needs it so the pixel can set `_fbc`.

**Example:**

```typescript
// Deny even when the query is already gone.
// /checkout/pay/[token] keeps the secret in the path. Never mount.
// /confirmation/[ref] is not a pay token, but fbevents.js sends location.href.
// A booking reference in that URL would leave the browser. Deny it too.
const denied =
  path === "/manage-booking" ||
  path === "/booking-detail" ||
  path.startsWith("/checkout/pay/") ||
  path === "/confirmation" ||
  path.startsWith("/confirmation/") ||
  path.startsWith("/ops") ||
  path.startsWith("/dev") ||
  hostIsDashboard;
```

Allow public pages with no booking secret, including `/checkout/trip`, `/checkout/details`, and `/checkout/payment` (no token in those URLs), plus signed-in `/account` and `/bookings`. Deny `/review` when `token` or `bookingRef` is present. Deny any URL that still has `token` or `mb`. Ops and the dashboard host never mount the pixel. The banner may still show on a token page so the person can choose; the pixel must not.

## Data Flow

### Request Flow

```
Accept
  → POST /api/consent (accept_all, Turnstile)
  → record_consent marketing=true, subject from consent_subject cookie
  → Set-Cookie mirror
  → SiteShell mounts pixel only if legal flag and route allow
  → fbq('init', pixelId); fbq('track', 'PageView')
  → pixel sets _fbp / _fbc
  → POST /api/meta/click (and a copy onto the booking when the booking id exists)
  → stored where the queue consumer can SELECT by booking_id

Pay (unchanged)
  → POST /api/checkout/intent → Checkout Session (ui_mode elements) → booking + payment row
  → browser never confirms
  → Stripe → POST /api/stripe/webhook → enqueue
  → queue consumer → checkout_payment_settle → pending → paid → confirmed
  → if gates pass: one CAPI Purchase
  → deliverConfirmation as today (not a Meta gate)
```

### State Management

```
consent_log (append-only)
  latest row for the subject bound to the booking
    marketing=true  → Purchase may send
    marketing=false → stop. Do not leave a pending outbox for a later Accept to drain.

purchase outbox
  inserted only on the settle turn when the booking just became paid
  sent_at null → retry, same event_id
  sent_at set  → never again, including a second Stripe event for the same booking

mirror cookie
  browser PageView only. Webhook does not read it.
```

There is no client store of “we sent Purchase”. The thank-you page polls booking status. It does not call Meta.

### Key Data Flows

1. **Accept → marketing:** `CATEGORIES` in `bind.ts` is a constant `marketing: false` for every method, including `accept_all`. That is the write to change. `record_consent` already accepts `p_marketing`. Do not add a client-supplied boolean. `apps/web/lib/consent/record.test.ts` currently pins marketing false — update that test in the same change or it will forbid the milestone.

2. **Click ids → booking:** The queue consumer has no browser cookies. `_fbp` and `_fbc` must be stored before pay, keyed by `booking_id`. The pixel sets them after Accept, which may be before a booking exists. Store against `consent_subject` first, then copy onto the booking when `checkout_create_booking` returns an id. If the person accepts on `/checkout/payment` after the booking exists, the click route writes the booking row directly. Pay-link (`/checkout/pay/[token]`) must not call that route and must not overwrite the booker’s ids with the payer’s cookies. Guest and signed-in both create the booking through `asCheckout` / `intent.ts`. The copy is after `createBooking` returns. It is not a new argument on `sessions.create` and not a change to the charged amount.

3. **PageView:** Only if the legal flag is on, the mirror says marketing, and the route gate allows the URL. One event name: `PageView`. No `Purchase`, no `InitiateCheckout`, no `AddPaymentInfo`. No `<noscript>` image — that fires with no JS gate and would run on token pages if it were in the HTML. No `fbq('init', id, {em, ph})`.

4. **Purchase:** Only in the queue consumer, after `checkout_payment_settle` has committed a succeeded booking charge (`already_settled=false` on the insert turn). Gates, all required:
   - latest `consent_log` for the subject on that booking has `marketing=true` (a later Dismiss wins; an Accept after pay does not scan old paid rows)
   - not `kind=extra`
   - `booking_payments.charged_currency` is CHF (the column CHECK already is) and `charged_rappen > 0`
   - not an unpriced class (`is_chargeable` false never inserts a payment; still refuse a zero or missing amount)
   - not `bookings.is_test` (capture is already refused; do not send those)
   - outbox not already sent
   Amount is `charged_rappen / 100` in CHF. Not `session.amount_total`, not `currency_conversion.amount_total`, not `presentmentAmountMinor`, not the display FX from `/api/fx`. Adaptive Pricing can make `session.currency` something other than CHF while our row stays CHF. `fxFromSession` is for the payment row’s presentment fields. Purchase does not read it.

5. **CAPI body:** `event_name=Purchase`, `action_source=website`, stored `event_id`, `event_time` from the Stripe event `created` (not Worker `now` on retry; Meta rejects `event_time` older than 7 days — stop retrying past that and record `last_error`). `event_source_url` is `https://vamostaxi.site/` only. Never the request URL, never a token, never a reference. `user_data` is `fbp` and `fbc` only, and only if we actually stored them. Do not invent them. Do not send `em`, `ph`, `fn`, `ln`, `external_id`, `client_ip_address`, or `client_user_agent`. No content id that is a reference. Staging adds `test_event_code`. Production does not (that flag would mark live events as tests).

6. **Retry:** First settle inserts the outbox and attempts the send. Graph failure returns `{ retry: true }` from the consumer. `worker.ts` already calls `message.retry()`. The next delivery sees `already_processed` and must still drain the unsent row with the same `event_id`. It must not call `checkout_payment_settle` again. A second completing event for the same booking finds the unique row and does not insert another.

## Scaling Considerations

| Scale | Architecture adjustments |
|-------|--------------------------|
| This product (pre-booked transfers, not ride-hail) | One Graph call per paid booking, inline on the existing stripe queue, with a short timeout. No new queue. |
| A slow `graph.facebook.com` | Cap the fetch. Return retry. Paid and the confirmation email do not wait on Meta and do not roll back if Meta fails. |
| Retry storm | Unique `booking_id` plus `sent_at`. Stop after the 7-day `event_time` window. Do not sweep historical paid rows on Accept. |

### Scaling Priorities

1. **First bottleneck:** a hung Graph call holding a queue message. Timeout and retry. Do not move the call into the HTTP webhook — Stripe already times that route out, which is why it only enqueues.
2. **Second bottleneck:** click ids missing because the person paid before the pixel POST landed. The outbox retry can attach ids that arrived before `sent_at`. Do not delay `checkout_payment_settle` for the pixel.

## Anti-Patterns

### Anti-Pattern 1: Purchase on the thank-you page

**What people do:** `fbq('track', 'Purchase')` when `/confirmation/[ref]` loads.
**Why it's wrong:** Refresh double-counts. The page polls; it does not decide paid. The URL contains the booking reference, which the pixel would send as `location.href`.
**Do this instead:** Purchase only from the queue consumer, once, after `checkout_payment_settle`.

### Anti-Pattern 2: Meta inside the HTTP webhook, or a second confirm

**What people do:** Call Graph from `POST /api/stripe/webhook`, or mark the booking paid in a new route because “the webhook is the source of truth”.
**Why it's wrong:** That route must stay verify → record → enqueue → 200. It does not know paid yet. A slow Graph call makes Stripe retry. A second confirm path races `checkout_payment_settle`.
**Do this instead:** Side effect in `settle.ts` after the existing RPC. Drain on `already_processed`.

### Anti-Pattern 3: Token check on the query string only

**What people do:** `if (!url.searchParams.get('token')) loadPixel()`.
**Why it's wrong:** Manage-booking and booking-detail strip the secret into `vt_manage` before paint. Pay-link keeps it in the path. Confirmation keeps the reference in the path. The pixel sends the URL.
**Do this instead:** Deny those routes by path. Allow `/account` and `/bookings` when the URL has no secret. Do not treat `fbclid` as a booking token.

### Anti-Pattern 4: Charged amount from Stripe presentment or display FX

**What people do:** Send `session.amount_total` or the on-screen converted total as Purchase `value`.
**Why it's wrong:** Charge is always CHF rappen on `booking_payments`. Adaptive Pricing and `/api/fx` are display. An unpriced class is `CHF 000` and must send nothing.
**Do this instead:** `charged_rappen / 100` and `currency: CHF`, and only when `charged_rappen > 0`.

### Anti-Pattern 5: Click ids in Stripe metadata, or PII in the Graph body

**What people do:** Put `_fbp` on the Checkout Session, or hash email into `user_data` because Meta’s sample payload shows `em`.
**Why it's wrong:** Session metadata is copied into `stripe_events.payload`. The milestone forbids email, phone, name, route, flight number, and booking reference in the payload. Hashed email is out. The settle row’s `contact_email` and `reference` exist for the confirmation mail — the CAPI builder must not take that row.
**Do this instead:** Side table. Separate RPC. `fbp` / `fbc` only.

### Anti-Pattern 6: Loading the pixel before owner copy, or via a noscript tag

**What people do:** Drop Meta’s base snippet in the layout `<head>`, including the `<noscript>` image, and fill banner text with a draft.
**Why it's wrong:** The snippet fires PageView with no consent check and on token pages. Banner, cookies, and privacy lines in en/de/fr/ar are the owner’s. Pending slots on the cookies page are not those lines.
**Do this instead:** Fail-closed flag. No script until the flag is on. No noscript. Do not draft the lines.

### Anti-Pattern 7: Signup or settings_change as a silent Dismiss — or as a silent Accept

**What people do:** Leave `appendSignupConsent` writing `settings_change` with `marketing=false` after an Accept, or flip every method to `marketing=true`.
**Why it's wrong:** Latest row wins. Signup would stop a later Purchase. Flipping every method would turn Dismiss and the cookies-page button into Accept.
**Do this instead:** `marketing=true` only for `accept_all`. Signup must not insert a downgrade.

## Integration Points

### External Services

| Service | Integration pattern | Notes |
|---------|---------------------|-------|
| Meta Pixel `1595596972063765` | Client script from `https://connect.facebook.net/en_US/fbevents.js` after the gates. `fbq('init', id)` then `fbq('track', 'PageView')`. | Public id. No token in the client. Script locale file stays `en_US`; page locale does not change the loader URL. |
| Meta Conversions API | Worker `fetch` to `https://graph.facebook.com/{pinned-version}/{pixel-id}/events`. Pin a version in `capi.ts`. Do not call an unversioned host. | Access token via `wrangler secret put`. Staging `test_event_code` is a var or secret, not a repo file. CSP does not apply to this server-side call. |
| Stripe | Unchanged. Webhook is the payment source of truth. Consumer settles. | Do not put Meta fields on the Checkout Session. Stripe stays test. No `sk_live_`. |
| Cloudflare Workers | Same Worker `vamos`. Queue `STRIPE_EVENTS` already fans the webhook out. | No new queue. Secret binding on that worker. |

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| Banner ↔ consent ledger | `POST /api/consent` → `recordConsent` → `record_consent` | Accept means Meta on. Dismiss means off. Choice is the new row, not a cookie rewrite. |
| Layout ↔ SiteShell | Layout already passes `banner` when there is no `consent_subject` and the host is not the dashboard. SiteShell drops it unless `isHome`. | Change the drop. Keep the ops / dashboard / dev skip. `banner-contract.test.ts` pins `isHome ? banner : null` — update it in the same change. |
| SiteShell ↔ pixel | Sibling client mount. Listens for `vamos:consent-recorded` so Accept on this page can PageView without a reload. | Banner unmount is not pixel unmount. Dismiss clears the mirror and does not load. |
| Click route ↔ booking | Same-origin POST after the pixel sets cookies. Copy-on-create for ids stored against the subject. | Not granted on the pay-link page. Refuses once the booking is paid (no backfill attach). |
| `settle.ts` ↔ CAPI | Function call after `settlePayment`. Separate read RPC. | Does not receive `SettleRow`. Does not import the confirmation mailer into the payload builder. |
| CSP ↔ pixel | `SECURITY_HEADER_PAIRS` in `lib/security/headers.ts`, also applied by the ops header helper. | One shared policy. Widening it does not mount the pixel on ops. Do not fork a second CSP. |

CSP add, and only these:

- `script-src`: `https://connect.facebook.net`
- `connect-src`: `https://www.facebook.com` `https://connect.facebook.net`
- `img-src`: `https://www.facebook.com` (the library beacons with an image even without a noscript tag)

Do not add Facebook to `frame-src`. Do not add `graph.facebook.com` to CSP for a server-side call. Update `headers.test.ts` in the same change. Current `script-src` / `connect-src` allow Stripe, Turnstile, Mapbox, and unpkg — they do not allow Facebook.

### New vs modified

**Modified**

| File | Change |
|------|--------|
| `apps/web/lib/consent/bind.ts` | `accept_all` stores `marketing=true`. Other methods stay false. |
| `apps/web/app/api/auth/route.ts` | Signup consent append must not downgrade an existing Accept. |
| `apps/web/components/shell/SiteShell.tsx` | Banner on customer pages until a choice, not home-only. Mount the pixel gate here. |
| `apps/web/lib/security/headers.ts` | Facebook hosts listed above. |
| `apps/web/lib/checkout/settle.ts` | After the existing settle, insert/drain the purchase outbox. `already_processed` still drains. No change to capture rules or to `checkout_payment_settle`. |
| Tests that pin the old behaviour | `record.test.ts` (marketing always false), `banner-contract.test.ts` (home-only banner), `headers.test.ts` (CSP token list). |

**New**

| Piece | Why |
|-------|-----|
| `apps/web/lib/meta/*` | Gate, loader, CAPI, purchase drain. |
| `POST /api/meta/click` | Browser cookies are invisible to the queue. |
| Migration: click-id row + purchase outbox + two RPCs | Webhook path can read click ids and marketing without a table grant, and without PII columns in the return. |
| Legal flag, default off | Owner lines in en/de/fr/ar are not in the repo as a licence to load the script. |
| `wrangler secret put` for the CAPI token; staging test event code | Not in git. Not in the client bundle. |

**Not modified**

`app/api/stripe/webhook/route.ts`, `lib/checkout/webhook.ts`, `lib/checkout/stripe.ts` session create, `checkout_payment_settle`, thank-you confirm, extra-wait settle, CookieBanner button set, quote, class, fare Publish.

The only checkout touch allowed is a copy of already-stored click ids after `createBooking` returns a booking id. No new Stripe parameter. No new charge. No new confirm.

### Build order

1. **Fail-closed flag and a test that `fbevents.js` is absent.** Legal lines are an owner gate. Do not draft them. Do not flip the flag in this step.
2. **Consent write.** `accept_all` → `marketing=true`. Dismiss and `settings_change` stay false. Signup must not clobber. Fix the bind test that requires marketing false.
3. **Banner host.** SiteShell shows the sheet on customer pages until a choice. Still skip ops, dashboard, dev. Token pages may show the banner and must not mount the pixel. Fix the home-only test.
4. **Route gate,** pure function, tested: deny pay-link, manage-booking, booking-detail, confirmation (reference in the path), review with `token` or `bookingRef`, ops, dev, dashboard, and any URL that still has `token` or `mb`. Allow public pages, checkout trip/details/payment, `/account`, `/bookings`. Do not strip `fbclid`.
5. **CSP allowlist** and the headers test. Before any loader ships, or the script is blocked and looks like a product bug.
6. **Click-id table and RPCs.** Write path from the click route and the post-create copy. Pay-link cannot write. Paid booking cannot be updated to backfill.
7. **Pixel client** behind the flag (still off), the mirror, and the route gate. PageView only.
8. **Purchase outbox and the settle drain.** Gates above. CHF from `charged_rappen`. Same `event_id` on retry. No PII. Skip extra, skip zero, skip marketing false, skip already sent. Do not send `bookings.is_test`.
9. **Secret and staging test event code.** Owner copy in en/de/fr/ar, then flip the flag. Not before.

## Sources

- Live code: `apps/web/lib/consent/bind.ts`, `apps/web/lib/consent/cookie.ts`, `apps/web/app/api/consent/route.ts`, `apps/web/app/api/auth/route.ts` (`appendSignupConsent`), `apps/web/components/consent/CookieBanner.tsx`, `apps/web/components/shell/SiteShell.tsx`, `apps/web/app/[locale]/layout.tsx`, `apps/web/lib/security/headers.ts`, `apps/web/app/api/stripe/webhook/route.ts`, `apps/web/lib/checkout/webhook.ts`, `apps/web/lib/checkout/settle.ts`, `apps/web/worker.ts`, `apps/web/middleware.ts` (manage-token strip), `packages/db/supabase/migrations/20260823000018_consent_log.sql`, `packages/db/supabase/migrations/20260827000004_settlement_rpcs.sql`, `packages/db/supabase/migrations/20260823000014_payments_refunds.sql` (`charged_rappen > 0`, `charged_currency = 'CHF'`).
- Meta Pixel base code (`connect.facebook.net` / `www.facebook.com/tr`): https://developers.facebook.com/docs/meta-pixel/get-started
- Conversions API server event parameters (`event_id`, `event_time` 7-day window, `event_source_url` for website, `action_source`): https://developers.facebook.com/docs/marketing-api/conversions-api/parameters/server-event
- Deduplicate pixel and server events (server-only retries are not what that dedupe promises): https://developers.facebook.com/docs/marketing-api/conversions-api/deduplicate-pixel-and-server-events
- Milestone locks: `.planning/PROJECT.md` v1.3 (PageView + one webhook Purchase, no hashed email, no browser Purchase, no token URLs, pixel unloaded until owner lines).

---
*Architecture research for: v1.3 Meta PageView + one webhook Purchase on the existing Vamos charge path*
*Researched: 2026-09-23*
