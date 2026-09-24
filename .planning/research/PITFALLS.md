# Pitfalls Research

**Domain:** v1.3 Meta measurement — consent-gated Pixel `1595596972063765` (PageView only) plus one Conversions API Purchase, added to the existing `apps/web` consent, CSP, cache, and Stripe webhook/queue settle path
**Researched:** 2026-09-23
**Confidence:** HIGH on this repo's consent, CSP, cache, and payment code (`bind.ts`, `CookieBanner.tsx`, `SiteShell.tsx`, `headers.ts`, `middleware.ts`, `webhook.ts`, `settle.ts`, `stripe.ts`, `pay-link.ts`). MEDIUM on the owner's Events Manager switches (automatic advanced matching, test event code, domain verification) — those are not in the repo. LOW on treating Meta's own sample as safe: their GDPR snippet still downloads `fbevents.js`.

v1.0 booking/Hyperdrive pitfalls: `.planning/research/v1.0-archive/PITFALLS.md`.
v1.1 Ops Support pitfalls: `.planning/research/v1.1-archive/PITFALLS.md`.
v1.2 Payment pitfalls: `.planning/research/v1.2-archive/PITFALLS.md`.

This file covers **only** what fails when this tracker is added to the system that already exists. It does not change quote, pay, or confirmation. It does not unfreeze v1.2 Phases 21–25. It does not start frozen 16/17/19/20. No `sk_live_`. No `vamostaxi.eu` DNS. No invented legal copy. No hashed email or phone — lower match quality is an accepted tradeoff.

v1.3 phases are not numbered yet (`STATE.md`: defining requirements, `total_phases: 0`). Prevention phases below are the workstreams the roadmap should create. Do not reuse Phase 7, Phase 10, or Phases 21–25 as the owner of this work. Those phases already shipped or are frozen payment work. A planner who hangs Meta on them will either reopen pay or ship the pixel with no plan.

Workstreams, in the order they have to land:

1. **Legal gate** — owner pastes banner, cookies, and privacy lines in en/de/fr/ar. Pixel stays unloaded until all four exist. `policy_version` bumps. Do not draft the lines.
2. **Consent record** — Accept writes `marketing: true` server-side; Dismiss writes `marketing: false`; latest row wins. Banner asks on every allowed customer page until they choose. Never on ops, pay-link, manage-booking, or any URL that carries a token.
3. **Pixel PageView** — `fbevents.js` loads only after that server-logged Accept. PageView only. CSP allowlist does not open ops. Cached HTML does not contain the script. No token in the URL the pixel sends.
4. **CAPI Purchase** — one Purchase from the queue consumer after a real paid settle. Stable opaque `event_id`. Charged CHF in major units. No PII. No `CHF 000`. No thank-you fire. No backfill.
5. **Secrets and staging** — access token via `wrangler secret put` only. Staging sends `test_event_code`. Production does not. Stripe stays test.
6. **Verification** — the negatives are the acceptance test: script absent, no Purchase on thank-you, no PII, no token URL, no value on an unpriced class.

## Critical Pitfalls

### Pitfall 1: Meta's own consent sample still loads `fbevents.js`

**What goes wrong:**
The pixel script is on the page before Accept. It can set `_fbp`, read `location.href` (including `fbclid`), and send a PageView. A landing with `fbclid` is treated as consent because "they came from the ad."

**Why it happens:**
Meta's GDPR page tells you to call `fbq('consent', 'revoke')` before `init`, then `fbq('consent', 'grant')` later. That sample still downloads `fbevents.js`. `fbclid` is a click id, not a choice. The current site has no pixel, so the first person to "follow the docs" installs the official snippet in the layout and calls it done.

**How to avoid:**
- Do not load `https://connect.facebook.net/.../fbevents.js` until Accept has been written server-side for this subject. No stub, no `revoke`, no tag manager, no `next/script` in a layout that renders for everyone.
- `fbclid` may be copied into `_fbc` only after that Accept. Do not set `_fbp` or `_fbc` on the landing request.
- A URL with `fbclid` and no consent row is a PageView of zero. That undercount is correct.

**Warning signs:** Network tab shows `fbevents.js` or `facebook.com/tr` on a fresh session, on Dismiss, or on a URL whose only "signal" is `fbclid`. A comment that cites Meta's consent API as the gate.

**Phase to address:** Pixel PageView. Legal gate must already be closed or this phase does not start.

---

### Pitfall 2: Accept still means `marketing: false`, and the cookie cannot prove otherwise

**What goes wrong:**
The customer clicks Accept. The pixel loads. `consent_log` says marketing was refused. A regulator reading the log sees no consent. Or the opposite: Dismiss is treated as Accept because both writes set the same cookie, so the pixel loads for people who refused.

**Why it happens:**
`apps/web/lib/consent/bind.ts` hardcodes `CATEGORIES.marketing: false` for `accept_all`, `reject_all`, and `settings_change`. The banner title is `necessary-cookies-only`. `POST /api/consent` sets HttpOnly `consent_subject` on every successful write, including Dismiss. `app/[locale]/layout.tsx` treats any valid `consent_subject` as `hasConsent` and hides the banner. `middleware.ts` caches marketing HTML with `X-Consent-Present: 1` for that same boolean — presence, not the grant. `apps/web/lib/consent/record.test.ts` locks the false write. A pixel gated on "cookie exists" or "Accept button returned 200" disagrees with the row.

Swiss nFADP / GDPR: consent is the server row, not a cookie. The cookie is only the subject id. It is HttpOnly, so the pixel script cannot read it anyway.

**How to avoid:**
- Accept writes `marketing: true` in the same transaction as `record_consent`, and only after the owner lines exist. Dismiss writes `marketing: false`. Do not update old rows. `consent_log` is append-only.
- The pixel gate reads the **latest** row for that subject. Cookie presence is not a grant. `settings_change` (footer `vamos:cookie-prefs`, cookies-page button) must not become a third switch and must not load the pixel. Today it also writes `marketing: false`.
- Bump `CONSENT_POLICY_VERSION` (now `2026-09-12`) when Accept changes meaning. Rows under the old version are necessary-only. Do not reinterpret them.
- CAPI re-reads that latest row at send time. A JS-readable `vamos_meta=1` cookie may tell the browser to fetch the script; it must not authorize Purchase. A forged flag loads a script in the forger's own browser. It must not make the worker call Graph.

**Warning signs:** `record.test.ts` still expects `marketing: false` after the phase that claims Accept means Meta on. Pixel loads when `X-Consent-Present` is 1. `CONSENT_RECORDED_EVENT` loads the script for `settings_change`. No new `consent_log` row on Accept.

**Phase to address:** Consent record. Blocked on Legal gate. Pixel PageView and CAPI Purchase both consume this row; they do not invent a parallel flag.

---

### Pitfall 3: The banner is home-only, and "show it everywhere" puts it on token pages

**What goes wrong:**
Two failures, one from each direction. Leave the banner where it is, and a customer who lands on `/faq` or `/pricing` from an ad never gets a choice — so either they are never measured, or a layout-level pixel measures them with no banner. Remove the home check without an allowlist, and the banner (then the pixel) appears on `/checkout/pay/{token}` and `/manage-booking`, whose URL is the secret.

**Why it happens:**
`SiteShell.tsx` renders `{isHome ? banner : null}` after stripping the locale prefix. Ops and `/dev` skip the shell entirely, which is necessary but not sufficient. The milestone wants the banner on every customer page until they choose. Pay-link (`payLinkPath` → `/{locale}/checkout/pay/${rawToken}`), manage-booking, and booking-detail are customer-looking routes that carry a token. Middleware strips the manage-booking query onto an HttpOnly cookie and redirects, but the first request URL still has the token. PageView sends the full URL. Referrer-Policy `strict-origin-when-cross-origin` does not stop `fbevents.js` from reading `location.href`.

**How to avoid:**
- Banner allowlist and pixel allowlist are different lists. Do not derive one from the other.
- Banner: every customer page that does not carry a token, until a choice exists. Not home-only. Not ops. Not pay-link. Not manage-booking. Not booking-detail. Not `/dev`.
- Pixel: only where the banner may show **and** the URL has no token, no `code`, no booking reference, no email. Public pages with a clean URL, plus signed-in `/account` and `/bookings` when those paths do not embed a reference. Confirmation is `/confirmation/[ref]` — the ref is the booking reference — so no pixel there even though it is a customer page.
- Ops is `dashboard.vamostaxi.site` and `serveOpsDc`, not the locale layout. Do not add the pixel to a shared `public/app` script that `ops.dc.html` loads. A layout-only gate misses that path.

**Warning signs:** `isHome ? banner` still the only mount after the consent phase. Pixel script in `app/[locale]/layout.tsx` with no path check. A test that only loads `/` and calls the pixel done. PageView on a URL containing `pay/`, `token`, `code=`, or `VT-`.

**Phase to address:** Consent record for the banner move. Pixel PageView for the stricter script allowlist. Verification must hit a non-home page, a pay-link, and manage-booking, not only `/`.

---

### Pitfall 4: One CSP list serves the public site and the ops console

**What goes wrong:**
The pixel is "installed" and silent, because CSP blocks `connect.facebook.net`. Or the fix adds Facebook hosts to the shared header list, and the ops console can load Facebook even when the route gate is correct. Or a partial allowlist (script-src only) lets the script parse and then fails the beacon, which looks like a consent bug.

**Why it happens:**
`apps/web/lib/security/headers.ts` `SECURITY_HEADER_PAIRS` is the one CSP. It allowlists Stripe, Turnstile, Mapbox, and `unpkg.com`. It does not allow Facebook. `applySecurityHeaders` runs for public responses and for `serveOpsDc`. The file comment says a dashboard without this list ships with no CSP, so people copy the same string. `headers.test.ts` asserts the Stripe token lists exactly. A drive-by edit that only adds a host, or that loosens the test to `toContain`, either fails CI or opens ops.

The browser pixel needs a tight set, not `*.facebook.com` on `script-src`:

- `script-src`: `https://connect.facebook.net`
- `connect-src` and `img-src`: `https://www.facebook.com` (the beacon is often an image to `/tr`)
- CAPI is server-side. `graph.facebook.com` does not belong in the browser CSP.

**How to avoid:**
- Split the header list. Public responses may gain those hosts. Ops / dashboard CSP must not. Do not remove Stripe, Turnstile, or Mapbox hosts to "make room." Funnel CSP wins if a tighten breaks checkout — that comment is already in `headers.ts`.
- Update `headers.test.ts` to lock both lists: public has the three Facebook hosts and still has Stripe; ops has Stripe and does not have Facebook.
- CSP is not the consent gate. A stolen script tag on a public page would still be a bug. The route gate comes first.

**Warning signs:** `fbevents.js` blocked in the console and called "consent working." `serveOpsDc` responses include `connect.facebook.net`. `script-src` contains `*.facebook.com` or `*.fbcdn.net`. Ops CSP test deleted to make CI green.

**Phase to address:** Pixel PageView. Do not fold this into a payment phase. v1.2 CSP work was about Stripe Elements, not Facebook.

---

### Pitfall 5: Cached marketing HTML cannot tell Accept from Dismiss

**What goes wrong:**
The "consent present" cache variant contains `fbevents.js`. Everyone who has ever clicked Accept or Dismiss shares that variant, so Dismiss users get the pixel from the CDN. Or the script is baked into the anonymous variant and fires before any choice. Edge cache also makes a later Dismiss look late: the old HTML keeps loading the script for up to `s-maxage=300` plus `stale-while-revalidate=3600`.

**Why it happens:**
`MARKETING_CACHE_PATHS` is `/`, `/about`, `/faq`, `/contact`, `/terms`, `/privacy`, `/cookies`, `/cancellation`, `/imprint`. Those GETs are `public, s-maxage=300, stale-while-revalidate=3600` with `Vary: X-Consent-Present`. The header is `1` when `consent_subject` is a UUID, which both buttons set. `cookie.ts` already forbids minting that cookie on GET. A server component that inlines the Facebook script based on the cookie repeats the bug at the CDN. `layout.tsx` already calls `cookies()`, so do not "fix" cache by adding another cookie read that still cannot see `marketing`.

Checkout, confirmation, bookings, and account are `no-store`. That does not save the marketing pages, which are exactly where PageView matters.

**How to avoid:**
- The cached document never includes `fbevents.js`, a Facebook preconnect, or an inline `fbq` stub. Both cache variants stay clean.
- A first-party loader, after paint, asks a `no-store` check of the latest consent row (or reads a non-HttpOnly flag that was set only when that row was `marketing: true`) and only then inserts the script. Dismiss clears the flag and must not wait for CDN expiry.
- Do not mint `_fbp` on the cached GET. Do not `Set-Cookie` from a marketing GET.

**Warning signs:** View-source of `/` or `/faq` contains `connect.facebook.net`. `Vary` grows a marketing-grant header that is not actually computed. A test that only checks `Cache-Control` and not the body.

**Phase to address:** Pixel PageView, with the consent row from Consent record. Verification fetches the cached HTML as a Dismiss user and as a user with no cookie.

---

### Pitfall 6: Purchase on the thank-you page, then again from the webhook

**What goes wrong:**
One paid booking becomes two Purchases. Refresh, back, and the confirmation poll each fire again. Meta's dedupe does not save you: if the browser event and the server event share `event_name` + `event_id` and arrive within about five minutes, Meta keeps the browser event — the one that may have scraped the form. If the ids differ, both count. The thank-you URL is `/confirmation/[ref]`, so a PageView there also sends the booking reference.

**Why it happens:**
Every Meta "install Purchase" guide puts `fbq('track', 'Purchase')` on the success page. `ConfirmationClient` already polls until the webhook has settled. That poll turning true is the obvious hook. The product rule is the opposite: browser event is PageView only. Purchase is webhook-only. Thank-you waits on the webhook; it does not confirm the booking and it does not tell Meta.

**How to avoid:**
- No `Purchase`, `Subscribe`, or custom conversion on the confirmation page, the payment page, or the client poll. No `fbq('track', ...)` other than PageView, and not on confirmation at all.
- Do not "dedupe" by sending the same `event_id` from the browser. Do not send the browser event.
- Confirmation stays a no-pixel route because the path is the booking reference.

**Warning signs:** `ConfirmationClient.tsx` or `confirmation/[ref]/page.tsx` contains `fbq`, `Purchase`, or `fbevents`. Events Manager shows a browser Purchase and a server Purchase for one charge. A test that only asserts the webhook sent, and never asserts the thank-you did not.

**Phase to address:** CAPI Purchase. Verification loads thank-you twice and asserts zero browser Purchase.

---

### Pitfall 7: Stripe retries and the queue will send Purchase more than once

**What goes wrong:**
One charge is reported many times. Ads optimization learns a fake conversion rate. Or a Meta outage returns 500 from the webhook, Stripe retries for days, and pay confirmation is delayed — v1.3 was not allowed to change pay.

**Why it happens:**
`webhook.ts` records, then enqueues **even when the insert is a duplicate**, and returns 500 if enqueue throws so Stripe will retry. The comment in that file is the constraint: Stripe times out a slow endpoint and retries it. `worker.ts` `message.retry()`s when settle asks for a retry or throws. `settle.ts` already gates the confirmation email on `outcome === succeeded && !already_settled && !extra`. A CAPI call beside that email, or worse in the HTTP handler, does not have its own sent row.

Meta's dedupe window is 48 hours on `event_name` + `event_id`, and only if both copies use the same id. Stripe retries longer than that. `event_time` older than 7 days rejects the **entire** request. A retry that stamps `Date.now()` lies about when the charge happened. A retry that mints a new UUID is a new Purchase.

Dual payer makes it worse. First charge wins. Two Checkout Sessions can both reach `payment_status === paid`. Two Stripe `event.id`s are two Purchases if that is your `event_id`. The booking reference must not be the `event_id` either — that sends the reference to Meta. Meta's own example uses an order number. Do not follow it.

**How to avoid:**
- Do not call Graph from `handleStripeWebhook`. Ack Stripe as today. Payment state stays on the queue.
- Send only from the consumer, after admission (`should_process`), after `payment_status === paid`, after `captureAllowed`, and only when `!already_settled && !extra` on the **first** successful settle. `kind === "extra"` / product name `Fare difference` is not a second Purchase of the booking.
- Mint one opaque `event_id` (UUID) once, store it on our side, reuse it on every retry. Not `event.id`. Not `cs_`. Not `pi_`. Not `VT-`. Not `booking_id` if that id is shown to the customer. Unique on the booking, so the losing dual-payer session is a no-op.
- Insert the "sending" row before the HTTP call. A retry sees the row and does not mint a new id. A Graph failure may `message.retry()` only because settle is already idempotent. A Graph failure must not 500 the webhook HTTP handler.
- `event_time` is the charge time in unix seconds (GMT), not processing time. If the message is older than 7 days, ack and record a non-PII skip. Do not rewrite `event_time` to now.
- `action_source` is `website`. `system_generated` is for renewals. This is not a renewal.

**Warning signs:** `fetch('https://graph.facebook.com/...')` inside `webhook.ts` or the route handler. `event_id: event.id` or `event_id: row.reference`. Purchase count in Events Manager higher than `booking_payments` successes. A Meta 500 that leaves the booking unpaid or unemailed.

**Phase to address:** CAPI Purchase. Do not put the call in a payment plan. Verification replays `webhook-replay.spec.ts`'s already-settled case and asserts one send, then a second delivery that does not send.

---

### Pitfall 8: The webhook request has no `_fbp`, no `_fbc`, and the wrong IP

**What goes wrong:**
Purchase goes out with no click id, so it cannot match the ad. Or it goes out with Stripe's IP and Stripe's user-agent as `client_ip_address` / `client_user_agent`, which poisons match and is not the customer. Or `_fbc` is built from `fbclid` on the landing, before Accept, and stored "for later."

**Why it happens:**
The browser sets `_fbp` and `_fbc`. Stripe's servers call `/api/stripe/webhook`. That request's cookies are Stripe's, not the customer's. `CF-Connecting-IP` on that request is Stripe. `settle.ts` re-reads the Checkout Session, which has `customer_email`, `client_reference_id` (the booking reference), and `metadata.booking_reference`. It does not have the Meta cookies. The tempting fix is to spread `user_data` from the session, or to add hashed email because Events Manager shows a low event match quality score.

Match quality without email is the accepted tradeoff. It is not a reason to add email, phone, name, or an `external_id` that is the customer id or the booking reference.

**How to avoid:**
- After Accept, and only then, read `_fbp` and `_fbc` in the browser and store them on our booking or payment row at checkout, before the customer leaves for any redirect. The webhook reads that column. It does not read `Cookie` on the Stripe request.
- Do not put `_fbp` / `_fbc` in Stripe `metadata`. Metadata already carries `booking_reference` and is visible on the Stripe object. Do not add a second copy of the reference.
- `user_data` keys are `fbp` and `fbc` only. If both are missing, do not invent `em`, `ph`, `fn`, `external_id`, or the webhook IP. Skip the send, store a non-PII reason, ack the message. An empty `user_data` object can fail the whole Graph request — a skip is cleaner than a padded payload.
- Do not capture `fbclid` into `_fbc` before the consent row exists.

**Warning signs:** CAPI code reads `request.headers.get('cookie')` or `cf-connecting-ip` inside the webhook or the queue consumer. `user_data.em` or a sha256 of `contact_email`. `SettleRow` spread into the Graph body. Events Manager "fix match quality" treated as a requirement.

**Phase to address:** CAPI Purchase for the send. Pixel PageView / checkout must persist the two cookies after Accept, or the webhook has nothing legal to attach. Verification: a Stripe-signed webhook fixture with no Cookie header still sends `fbp`/`fbc` from the row, or skips, and never sends email.

---

### Pitfall 9: The objects already in hand are full of fields Meta must not get

**What goes wrong:**
Purchase or PageView includes email, phone, name, route, flight number, or booking reference. That can be a deliberate "match quality" add, or a spread of a row that already has those columns, or the pixel's automatic advanced matching reading the checkout form, or `event_source_url` / `order_id` / `content_ids` carrying the same facts under another name.

**Why it happens:**
`SettleRow` has `contact_email` and `reference`. The Checkout Session is created with `customer_email`, `client_reference_id: bookingReference`, and `metadata.booking_reference`. Checkout and account pages render email, phone, name, and flight in the DOM. Meta automatic advanced matching is an Events Manager switch, not a field we pass: it detects those inputs and hashes them even when our payload omits `user_data`. Official custom-data parameters include `order_id`, `search_string`, `origin_airport`, `destination_airport`, `contents`, and `content_ids`. A travel integration fills those by habit. PageView sends the full URL, so a reference in the path is a send.

The pixel also receives button labels and form field names once the script is on the page. A button whose label is `VT-26-0001` is a reference leaving the building. Do not put the reference in a control the pixel can see on a page where the script is allowed.

**How to avoid:**
- Build the Graph body from an allowlist: `event_name`, `event_time`, `event_id`, `action_source`, `event_source_url` (clean), `user_data.fbp`, `user_data.fbc`, `custom_data.currency`, `custom_data.value`. Nothing else. No `contents`. No `order_id`. No `content_name` that is a route. Product name on the Stripe line today is `Airport transfer` or `Fare difference` — do not replace that with pickup and dropoff to "help Meta."
- `event_source_url` is required for website events. It must be a clean URL on the host that actually served the page (`vamostaxi.site` while DNS stays there). Never the pay-link, never `/confirmation/{ref}`, never a manage token, never `vamostaxi.eu`. A pay-link charge can still be the one Purchase — the milestone is one Purchase per paid booking — but the URL attached to it is the site origin only (`https://vamostaxi.site`), not a path and not `payLinkPath`. A path can carry a booking reference.
- Owner turns automatic advanced matching off on pixel `1595596972063765` before any script load. Code never passes advanced-matching parameters to `fbq('init')`. If Events Manager still has it on, the pixel stays unloaded. We cannot see that switch from the repo; verification has to watch the browser payload for `em` / `ph` / `fn`.
- Do not send a middle-funnel event (quote seen, checkout started, pay step) "while we are here." PageView and one Purchase only.

**Warning signs:** Graph body built by spreading `session`, `metadata`, or `SettleRow`. `order_id: reference`. Network payload from checkout contains `em=`. Pixel init object has any key other than the pixel id. A new event name in Events Manager.

**Phase to address:** CAPI Purchase for the body. Pixel PageView for automatic advanced matching and the URL allowlist. Legal gate does not include drafting a sentence that says we send email — we do not.

---

### Pitfall 10: Rappen sent as francs, or `CHF 000` sent as a Purchase

**What goes wrong:**
ROAS is 100× high, or an unpriced class becomes a conversion worth zero, or a presentment currency (EUR/USD/AED from Adaptive Pricing) is reported as what the customer was charged. Meta then optimizes toward the wrong amount. Or a test booking and a fare-difference extra each count as another sale.

**Why it happens:**
Money in this repo is `rappen` integer minor units. Stripe `unit_amount` is that integer. `CHF 185.00` is `18500`. Meta's `value` is a monetary amount in major units — their server-event example is `100.00`, not `10000`. `fxFromSession` already separates `session.currency` / `currency_conversion.amount_total` (what Adaptive Pricing showed) from the charge, which `stripe.ts` pins to CHF. Sending `amount_total` when the session currency is not CHF reports the wrong number and the wrong currency.

`CHF 000` is the unpriced display. The lock's `total_rappen` is null. A previous payment bug collapsed that into `invalid_request` and "Payment did not start." The measurement version of the same bug is sending `value: 0` or omitting the refuse and still sending Purchase. Meta counts a zero-value Purchase. Stripe's minimum charge is 0.50 CHF, so a real charge is at least 50 rappen.

`captureAllowed` already refuses `is_test`, cancelled, and expired locks. `outcomeFor` treats `checkout.session.completed` as paid only when `payment_status === paid`. TWINT can complete the session before it is paid. Hooking CAPI to `session.completed` alone counts unpaid attempts.

**How to avoid:**
- Value is charged CHF major units: integer rappen from our payment row, divided by 100, currency `CHF`. Not `session.amount_total`. Not presentment. Not a float computed earlier in the pricing engine.
- Send nothing when rappen is null, 0, or the class is still `CHF 000` / `pricing_not_live`. Do not send `value: 0`. Do not invent a fare so the event will validate.
- Send only when the existing settle gates say this is the winning real charge: paid, capture allowed, not `is_test`, not `extra`, not the losing dual-payer session.
- Stripe **test mode** (`sk_test_`) on staging is how you verify. That is not `is_test` on the booking row, and it is not a reason to switch to `sk_live_`. Staging events use `test_event_code` so they do not enter ads optimization.

**Warning signs:** `value: session.amount_total` or `value: chargedRappen` without `/ 100`. `currency: session.currency` under Adaptive Pricing. A Purchase for Economy while the recap still says `CHF 000`. Events Manager revenue 100× the Stripe gross.

**Phase to address:** CAPI Purchase. The charge gate already lives in settle. Do not reopen quote or Phase 18 to "fix" the amount. Verification uses a known rappen fixture (for example 18500 → 185.00 CHF) and an unpriced fixture that sends nothing.

---

### Pitfall 11: Old Accept rows, and drafted legal lines, become the licence to load the pixel

**What goes wrong:**
The pixel loads under the current banner, which says necessary cookies only. Or someone writes en/de/fr/ar "cookie" sentences so the gate can open, and those sentences are wrong. Or Arabic is missing and the code falls back to English. Or every historical `accept_all` row is treated as Meta consent because the method name matches.

**Why it happens:**
`CookieBanner.tsx` uses `necessary-cookies-only`. `CONSENT_POLICY_VERSION` is `2026-09-12`. Privacy still has `PendingSlot` for the analytics provider, regions, and retention. The project rule is that TBC pills are not a licence, and the pixel stays unloaded until the owner pastes banner, cookies, and privacy lines in all four languages. `record_consent` is append-only; an `UPDATE consent_log SET marketing = true` is both a lie and a migration the tests forbid.

`settings_change` and the cookies page are easy places to "explain Meta" by editing translation files. That is drafting.

**How to avoid:**
- Legal gate is a paste check, not a copywriting task. All four locales, all three surfaces (banner, cookies, privacy). One missing Arabic line blocks the pixel on every locale, not only `/ar`.
- New `policy_version` when those lines land. Only an Accept recorded under that version with `marketing: true` may load the script. Old rows stay necessary-only.
- Do not add a category switch, a prefs modal, or a third button. Accept means Meta on. Dismiss means Meta off.
- Turnstile on Accept stays. Do not skip the challenge so the pixel appears faster. Do not load the script before `POST /api/consent` returns ok.

**Warning signs:** New strings in `vamos-i18n-dict.js` or `messages/*.json` that mention Meta, Facebook, or ads and were not pasted by the owner. Pixel loads while the banner title is still necessary-only. `policy_version` unchanged. A migration that updates old `consent_log` rows.

**Phase to address:** Legal gate, before Consent record changes the meaning of Accept. Verification refuses to load the script when any of the four locales is missing.

---

### Pitfall 12: The access token lands in the client, the repo, or a log line

**What goes wrong:**
Anyone who can read the bundle, the git history, or Worker logs can send events as Vamos, or read them. Rotating the token does not remove it from an old deploy or a log drain. A `test_event_code` left on in production hides real purchases from ads reporting. A missing code on staging writes test charges into the live pixel.

**Why it happens:**
The pixel id `1595596972063765` is public. It has to be in the browser. The CAPI access token is not. Meta's curl examples put `access_token` on the query string, which then shows up in `fetch` error logs and in Cloudflare request logs. The existing pattern in this repo is `wrangler secret put` for `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, and `RESEND_API_KEY`, never `NEXT_PUBLIC_*`, never `wrangler.jsonc` `vars`. The first draft usually breaks that pattern because the pixel id and the token sit next to each other in a quickstart.

**How to avoid:**
- Token: `wrangler secret put` only. Not the client, not `NEXT_PUBLIC_`, not `vars`, not `.env` committed, not a test fixture, not a comment. Send it in a header or the POST body, never the URL. Do not log the request or the body.
- Pixel id may be in the client. Do not "hide" it. Do not treat a leak of the id as a token leak, or a leak of the token as fine because "the id is already public."
- Staging sets `test_event_code`. Production must not. The code is not the token, but it still does not belong in the client bundle.
- Do not cut `vamostaxi.eu` DNS, and do not introduce `sk_live_`, because Events Manager is empty or the domain is unverified. Empty is expected while Stripe is test and staging uses the test code. Domain verification uses the host that already serves the site.

**Warning signs:** `NEXT_PUBLIC_META`, `access_token=` in source, token in `wrangler.jsonc`, Graph URL logged on failure, `test_event_code` in the production env, `sk_live_` anywhere, a DNS change in the same PR as the pixel.

**Phase to address:** Secrets and staging. Verification greps the client bundle and the repo for the token shape and fails on a hit. Do not print the token in the test output.

---

### Pitfall 13: A later Dismiss is ignored, or a later Accept backfills the sale

**What goes wrong:**
Someone refuses after accepting, and PageView keeps firing because `_fbp` is still in the jar or the CDN still has the script. Or they accept only after paying, and a job sends the Purchase they did not agree to before the charge. Or a refund sends a second event that includes the reference.

**Why it happens:**
The milestone is explicit: a later Dismiss stops future events. Accepting after payment does not backfill a Purchase. The code that exists today hides the banner forever once any `consent_subject` exists, so there is no later choice unless the banner phase adds one. A queue consumer that only checks "an accept_all row exists" will find the old necessary-only row, or will find an Accept that happened tomorrow.

**How to avoid:**
- At send time, the latest row must be `marketing: true` under the new policy version, and that grant must have been recorded **before** the charge. Both conditions. Fail either one and skip.
- Dismiss appends `marketing: false` and clears the browser flag immediately. Do not delete the historical PageView from Meta. Do not send a compensating event.
- No scanner over paid bookings. No Refund, no negative `value`, no second Purchase on cancel. Those are out of this milestone.
- Banner comes back when there is no current choice. It does not come back on ops or token URLs.

**Warning signs:** Purchase query is `WHERE method = 'accept_all'` with no `created_at` against the charge and no "latest row" order. A cron that calls Graph for bookings missing a Meta id. Cancel route gains a Meta call.

**Phase to address:** Consent record for the later Dismiss write. CAPI Purchase for the send-time check. Verification: pay, then Dismiss, then a webhook retry sends nothing; Accept after the charge sends nothing.

---

## Technical Debt Patterns

Shortcuts that look small next to "just add the pixel."

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| `fbq('consent', 'revoke')` while the script is in the layout | Matches Meta's GDPR sample | Script and `_fbp` exist before Accept | Never |
| Gate the pixel on `consent_subject` presence or `X-Consent-Present` | No schema change | Dismiss and Accept share the cache variant and the cookie | Never |
| Leave `marketing: false` and load the pixel anyway | Avoids a consent migration and a policy bump | The log proves the opposite of what the site did | Never |
| Reinterpret old `accept_all` rows as Meta consent | No one has to click again | Those clicks were for necessary-only, under `2026-09-12` | Never |
| Draft the missing de/fr/ar lines so the gate opens | Unblocks the pixel the same day | Invented legal copy; Arabic fallback is still a draft | Never |
| Hash email or phone to raise match quality | Events Manager score moves | Breaks the locked tradeoff; checkout PII reaches Meta | Never |
| `event_id` = Stripe `event.id` or `VT-` reference | Unique without a new column | Double count on dual payer, or the reference is sent | Never |
| Call Graph inside the webhook HTTP handler | One less hop | Stripe timeouts, retries, and a pay outage when Meta is down | Never |
| Send `value: chargedRappen` or `amount_total` | No conversion math | 100× ROAS, or Adaptive Pricing currency | Never |
| Send `value: 0` for `CHF 000` | Event still "succeeds" | Unpriced class becomes a conversion | Never |
| Put the token in `NEXT_PUBLIC_` or `wrangler.jsonc` `vars` | Local dev works | Token in the bundle and in git | Never |
| Add Facebook hosts to the shared CSP | Pixel loads on staging | Ops console can load Facebook | Never |
| Bake `fbevents.js` into cached marketing HTML | No client loader | Dismiss users get the pixel for the cache TTL | Never |
| Browser Purchase on thank-you "in case the webhook fails" | A number appears in Events Manager | Double count; browser event wins the 5-minute dedupe | Never |
| `sk_live_` or `.eu` DNS so events look real | Events Manager matches production ads | Live charges and live DNS before their phase | Never |
| `test_event_code` copied into production | Staging and prod configs match | Real purchases never enter ads reporting | Never |
| Middle-funnel events (checkout started, pay step) | More columns in Events Manager | Out of scope; more URLs and more PII surface | Never |
| Refund or negative Purchase on cancel | Ads spend looks net | Second event, easy to attach the reference | Never, in v1.3 |
| Store `_fbp` in Stripe metadata | Webhook can see it without a migration | Meta id sits next to `booking_reference` on the Stripe object | Never |
| Skip Turnstile on Accept so the pixel is faster | Fewer failed grants | Accept is no longer the same challenge as today | Never |

## Integration Gotchas

Common mistakes when connecting Meta to this stack.

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| Meta Pixel | Official snippet in the locale layout, `consent: revoke` until Accept | Do not download `fbevents.js` until the latest consent row is `marketing: true` under the new policy version |
| Meta Pixel | `fbq('init', id, { em, ph })` or Events Manager automatic advanced matching left on | No user data in `init`. Owner disables automatic advanced matching before the first load. If it is on, do not load |
| Meta Pixel | PageView on every route the layout wraps | Allowlist clean customer URLs only. Never ops, pay-link, manage-booking, booking-detail, confirmation `/[ref]`, auth `code=`, `/dev` |
| Conversions API | Purchase from confirmation poll plus webhook | Webhook path only, and only in the queue consumer, once |
| Conversions API | `event_id` from the Stripe event, so retries "dedupe themselves" | One opaque id per booking, stored here, reused. Meta's 48-hour window is not our lock |
| Conversions API | Read `_fbp` / `_fbc` on the webhook request | Persist them at checkout after Accept. The webhook is Stripe's HTTP client |
| Conversions API | `user_data` from `SettleRow` or the Checkout Session | `fbp` and `fbc` only. Missing both: skip, do not pad |
| Conversions API | `value` = Stripe `amount_total` or rappen | Charged CHF major units from our row (`rappen / 100`), currency `CHF` |
| Conversions API | `event_source_url` = success URL or pay-link | Origin only (`https://vamostaxi.site`), no path. Pay-link charges still count once, without that path. A path can carry a booking reference |
| Conversions API | `action_source: system_generated` because a worker sent it | `website`. The worker is the transport. The charge happened on the site |
| Conversions API | `event_time: Date.now()` on retry | Charge time. Older than 7 days: skip and ack, do not lie |
| Stripe webhook | Graph failure returns 500 | HTTP handler stays verify, record, enqueue, 200. Meta retry is the queue message, after settle has its own idempotency |
| Stripe session | `checkout.session.completed` means paid | Only `payment_status === paid`, and only if `captureAllowed` and not `extra` and not `is_test` |
| Adaptive Pricing | Report the currency the customer saw | Report the CHF we charged. Presentment is not the charge |
| CSP | Add `connect.facebook.net` to `SECURITY_HEADER_PAIRS` | Public list only. Ops list stays without Facebook. Tests lock both |
| Cache | Vary on consent cookie and inline the script | Cached HTML stays clean. Loader is after a no-store check |
| Consent POST | Treat 200 as Meta on | 200 means a row was written. Read `marketing` on that row. Dismiss also returns 200 |
| `wrangler secret` | Token beside the pixel id in `env.d.ts` as a public var | Secret binding only. Pixel id is the public one |
| Events Manager | Low match quality filed as a bug | Accepted. Do not add email. Staging uses `test_event_code` so the low score is not in production optimization |
| Domain verification | Point `vamostaxi.eu` at the worker so Meta will verify | Out of scope. `event_source_url` uses the host already in DNS |

## Performance Traps

Patterns that are fine in a quickstart and wrong on this worker.

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| `fbevents.js` in cached marketing HTML | Every anonymous and Dismiss hit waits on `connect.facebook.net`; CDN serves one consent state to everyone | Script stays out of `MARKETING_CACHE_PATHS` bodies. Load async, after Accept, after paint | Immediately — those pages are `s-maxage=300` with SWR 3600, and the Phase 10 target is a large anonymous audience |
| Graph call before webhook 200 | Stripe times out, retries, confirmation email waits on Meta | CAPI only on the queue, after settle. Short timeout. Failure retries the message, not the HTTP ack | First Meta blip, or any Graph call slower than Stripe's webhook budget |
| Consent write on every PageView | `consent_log` and the quote rate limiter grow with traffic; `POST /api/consent` already uses `QUOTE_RATE_LIMITER_BARE` | One row per choice, not per navigation. PageView does not call `record_consent` | A campaign sending the home page to many browsers |
| Purchase per queue retry | Events Manager conversion count climbs while `booking_payments` does not | Sent-row with a stable `event_id` before the HTTP call | First duplicate enqueue — `webhook.ts` already enqueues duplicates on purpose |
| Pixel on the pay click path | Pay and continue waits on `fbq` or on a consent round-trip | Pay does not await the pixel. v1.3 does not change pay | Checkout, where Stripe Elements is already the slow script |
| Blocking the quote widget on the banner or the pixel | Home quote feels late; the widget is the core value | Banner and pixel are after the widget. They do not gate the fare | Home, which is the only page that shows the banner today |

Expected scale for this milestone is measurement of real bookings, not a new 10k-browser design. Do not rebuild the cache to Vary on the full consent UUID. That would pin a variant per visitor and throw away the marketing cache. The clean-HTML rule keeps the cache.

## Security Mistakes

Domain-specific. General XSS and RLS are already in earlier phases.

| Mistake | Risk | Prevention |
|---------|------|------------|
| CAPI token in the client, repo, query string, or logs | Anyone can submit or read events as this pixel | `wrangler secret put`. Header or body only. Never log the request |
| PageView of pay-link, manage-booking, or confirmation | The full URL is the token or the booking reference, sent to Meta | Pixel allowlist. No script on those routes, including the request before the manage-booking redirect |
| Automatic advanced matching on a checkout form | Email, phone, and name are hashed and sent without a field we control | Events Manager switch off before load. No `em`/`ph`/`fn` in `init`. Watch the payload |
| Spreading `SettleRow` or session metadata into `user_data` | Email and `VT-` reference leave on the webhook path | Allowlist the Graph body. Test that `contact_email` and `reference` are absent |
| `event_id` or `order_id` set to the booking reference | Reference is visible in Events Manager | Opaque UUID stored here. No `order_id` |
| Forged marketing cookie trusted by the worker | A client flag authorizes a server event the log does not support | CAPI reads `consent_log`. Cookie is not the proof |
| `fbclid` stored as consent | Ad click becomes a lawful basis | Consent row first. `fbclid` is not a choice |
| Facebook hosts on the ops CSP | Dashboard can load a third party the route gate forgot | Split CSP. Ops list has no Facebook host |
| `UPDATE` old `consent_log` rows to `marketing: true` | Proof of consent is rewritten | Append a new row under a new `policy_version` only |
| `sk_live_` or live DNS in the measurement PR | Test checkout becomes a real charge, or the parked domain goes live | Secrets phase forbids both. Grep the diff |

## UX Pitfalls

The banner is the product surface. The pixel is not.

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Banner still says necessary-only while Meta loads | The choice on screen is not the choice recorded | Pixel stays unloaded until the owner lines replace that meaning, in all four languages |
| Banner only on home | A customer who enters on any other page is never asked, then either unmeasured or measured in silence | Ask on every allowed customer page until they choose. Do not ask on token pages |
| New toggles or a prefs grid | Two buttons become a category matrix the milestone forbids | Accept means Meta on. Dismiss means Meta off. No new switches |
| Arabic line missing, English shown on `/ar` | RTL customers accept a sentence they were not given | Missing any of en/de/fr/ar blocks the pixel everywhere |
| Pay button waits on the pixel or on Turnstile retry | Checkout feels broken; v1.2 already had a silent Pay click | Pixel is async and off the pay path. Turnstile stays on Accept only |
| Thank-you shows a tracking error, or fires Purchase on refresh | Confirmation looks unreliable; revenue is double-counted | Thank-you does not talk to Meta |
| Dismiss does nothing visible and PageView continues | Refusal is theater | Latest row is false; script does not load; future events stop |
| Accept after payment "repairs" the missing Purchase | A late click is treated as consent for a charge that already happened | Do not backfill |

## "Looks Done But Isn't" Checklist

Things that appear complete and are missing the gate that makes them true.

- [ ] **Script tag present:** Often missing the consent read — verify a fresh session, a Dismiss session, and an Accept session. Only Accept downloads `fbevents.js`.
- [ ] **Accept button:** Often still writes `marketing: false` — verify the new `consent_log` row, not the 200 and not the cookie.
- [ ] **Banner on home:** Often still `isHome` — verify a non-home customer page asks, and pay-link does not.
- [ ] **CSP updated:** Often the shared list — verify ops responses do not allow `connect.facebook.net`, and public responses allow the beacon hosts as well as the script host.
- [ ] **Cached page:** Often tested with `nocache` — verify the CDN body of `/` and `/faq` has no Facebook URL for both `X-Consent-Present` values.
- [ ] **Purchase in Events Manager:** Often the thank-you pixel — verify the browser sent no Purchase and the server sent one, with the same booking not two.
- [ ] **Webhook 200:** Often Graph called inline — verify Meta down does not change the HTTP status or skip the confirmation email.
- [ ] **Retry safe:** Often tested once — verify a second queue delivery and a duplicate Stripe event do not send a second Purchase.
- [ ] **Value:** Often the integer from Stripe — verify 18500 rappen is reported as 185.00 CHF, and `CHF 000` sends nothing.
- [ ] **Payload:** Often "we didn't add an email field" — verify the JSON has no email, phone, name, route, flight, reference, `order_id`, or webhook IP.
- [ ] **Legal lines:** Often English drafted in the branch — verify owner-pasted en/de/fr/ar on banner, cookies, and privacy, and that the pixel stays unloaded if any line is absent.
- [ ] **Token:** Often the pixel id checked in — verify the access token is a wrangler secret, absent from the client bundle, and not in the Graph URL.
- [ ] **Staging:** Often pointed at the live pixel with no test code — verify `test_event_code` on staging and absent in production. No `sk_live_`. No `.eu` DNS change.
- [ ] **Automatic advanced matching:** Often assumed off — verify the checkout request carries no hashed form fields.
- [ ] **Later choice:** Often untested — verify Dismiss after Accept stops the next PageView, and Accept after pay does not send Purchase.

## Recovery Strategies

When a pitfall has already happened. Do not "fix" it by sending more data.

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Script loaded before Accept | MEDIUM | Remove the script. Do not treat those PageViews as consented. Fix the gate before the next deploy. Do not backfill |
| `marketing: false` while the pixel ran | HIGH | Stop the pixel. Append a new policy version. Do not `UPDATE` old rows. Those visits were not Meta consent. Owner decides whether the legal lines need a correction |
| Purchase on thank-you, duplicates in Events Manager | MEDIUM | Remove the browser event. Keep one server `event_id` per booking going forward. Do not send reversal events in this milestone. Duplicates already inside Meta's 48-hour window may collapse only if the ids matched; do not count on it |
| PII or booking reference sent | HIGH | Stop the send path. Rotate nothing about the customer. Do not send a "cleaner" duplicate of the same purchase. Owner and counsel decide deletion with Meta. Do not put the payload in a ticket |
| Token in git or the bundle | HIGH | `wrangler secret put` a new token, revoke the old one in Events Manager, purge the secret from history if it was committed. Assume the old value is burned |
| Rappen reported as CHF | MEDIUM | Stop the send. Fix the divisor. Do not replay old events with a new `event_id` — that double-counts. A replay must reuse the original id and only if the first send is known not to have been accepted |
| `CHF 000` or unpaid session counted | LOW | Stop that branch. No compensating zero event |
| Facebook hosts on ops CSP | LOW | Split the list and redeploy the dashboard worker. Confirm a dashboard response has no Facebook host |
| Cached HTML contains the script | LOW | Ship clean HTML. Purge the marketing cache. Dismiss users keep getting the pixel until the purge |
| `test_event_code` in production | LOW | Remove it. Events during the overlap are under Test Events, not ads reporting. Do not re-send them without the code and a new id |
| Staging events in the live pixel with no test code | MEDIUM | Add `test_event_code`. Do not delete the pixel. Do not switch to `sk_live_` to "separate" them |
| Meta outage retried the webhook into a double charge | HIGH | Should be unreachable if Graph is not in the HTTP handler. If it happened, treat it as a payment incident from v1.2's idempotency rules, not as a Meta replay |
| Accept after pay was backfilled | MEDIUM | Stop the scanner. Do not send further backfill. Already-sent events stay sent; do not invent a delete API call in this milestone |

## Pitfall-to-Phase Mapping

v1.3 phases are not numbered yet. The names below are the workstreams the roadmap should create. They are not Phases 21–25, and they are not a reopen of Phase 7 or Phase 10.

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| Official snippet loads the script; `fbclid` treated as consent | Pixel PageView | Fresh URL with `fbclid` and no consent row: no `fbevents.js`, no `/tr` |
| Accept writes `marketing: false`; cookie presence used as the grant | Consent record | Accept row has `marketing: true` and the new `policy_version`; Dismiss row is false; pixel ignores cookie presence |
| Banner home-only, or banner on token URLs | Consent record | Non-home customer page asks; pay-link and manage-booking do not |
| Shared CSP blocks the pixel or opens ops | Pixel PageView | Public CSP has the Facebook hosts; ops CSP does not; Stripe hosts still present |
| Cached HTML serves the script to Dismiss | Pixel PageView | Cached body of `/` and `/faq` has no Facebook URL for present and absent |
| Browser Purchase on thank-you | CAPI Purchase | Two loads of `/confirmation/{ref}` send no Purchase and no PageView |
| Webhook and queue retries double-send | CAPI Purchase | Duplicate Stripe event and second queue delivery: one Graph call, same `event_id` |
| Webhook has no `_fbp` / has Stripe's IP | CAPI Purchase | Fixture with no Cookie header sends only row-stored `fbp`/`fbc`, or skips |
| Email, reference, route, flight in the payload or via advanced matching | CAPI Purchase and Pixel PageView | Allowlist test on the body; checkout network log has no `em`/`ph`; automatic matching confirmed off |
| Rappen as francs; `CHF 000` as Purchase; presentment currency | CAPI Purchase | 18500 → 185.00 `CHF`; null rappen and unpaid session send nothing |
| Drafted or partial legal lines; old rows reused | Legal gate | Pixel unloaded if any of en/de/fr/ar is missing; old `2026-09-12` rows do not load the script |
| Token in client, repo, or logs; test code in production | Secrets and staging | Bundle grep clean; staging has `test_event_code`; production does not; no `sk_live_`; no `.eu` DNS |
| Later Dismiss ignored; late Accept backfills | Consent record and CAPI Purchase | Dismiss stops the next PageView; Accept after pay sends no Purchase |
| Meta failure changes pay | CAPI Purchase | Graph error does not change webhook HTTP status or skip confirmation email |
| Looks-done gaps in the checklist | Verification | Checklist above is the UAT script, including the negative routes |

Suggested order: Legal gate → Consent record → Pixel PageView → CAPI Purchase, with Secrets and staging beside the first deploy that can call Graph, and Verification on each of those rather than as a final-only pass. Purchase persistence of `_fbp`/`_fbc` has to be designed with Pixel PageView even though the send is CAPI Purchase. Do not start CAPI before the consent row means what the banner says.

## Sources

- This repo: `apps/web/lib/consent/bind.ts`, `cookie.ts`, `policy.ts`, `app/api/consent/route.ts`, `components/consent/CookieBanner.tsx`, `components/shell/SiteShell.tsx`, `app/[locale]/layout.tsx`, `lib/security/headers.ts`, `middleware.ts` (`MARKETING_CACHE_PATHS`, `X-Consent-Present`), `lib/checkout/webhook.ts`, `settle.ts`, `stripe.ts`, `pay-link.ts`, `worker.ts` queue ack/retry. Privacy page still uses `PendingSlot` for the analytics provider.
- `.planning/PROJECT.md` (2026-09-23) — v1.3 goal, out-of-scope list, and the decision that Accept means Meta on only after owner lines exist.
- `.planning/STATE.md` — v1.3 phases not numbered; Phases 21–25 stay planned, not current.
- Meta, [General Data Protection Regulation](https://developers.facebook.com/docs/meta-pixel/implementation/gdpr/) — sample calls `fbq('consent', 'revoke')` only after the pixel script is in play. That is the trap, not the implementation.
- Meta, [Server Event Parameters](https://developers.facebook.com/docs/marketing-api/conversions-api/parameters/server-event) — `event_id` dedupe, browser event favored within about five minutes, `event_time` rejected after 7 days, `event_source_url` required for website events, `user_data` required, `action_source` values.
- Meta, [Conversions API end-to-end implementation](https://developers.facebook.com/documentation/ads-commerce/conversions-api/guides/end-to-end-implementation) — dedupe on `event_name` + `event_id` within 48 hours. Not a substitute for a sent-row, and shorter than Stripe's retry horizon.
- Meta, [custom data parameters](https://developers.facebook.com/docs/marketing-api/conversions-api/parameters/custom-data) — `value` is a monetary amount; `currency` is ISO 4217; `order_id` and airport fields exist and must not be filled from this booking.
- Meta, [advanced matching](https://developers.facebook.com/docs/meta-pixel/advanced/advanced-matching/) and the automatic advanced matching setting in Events Manager — form fields can be sent without a parameter we pass.
- Stripe fulfillment: `checkout.session.completed` with `payment_status === paid` is the signal `settle.ts` already uses. Amounts are minor units ([Stripe currencies](https://docs.stripe.com/currencies)); CHF 185.00 is 18500 rappen in this schema.
- v1.2 archive pitfalls — unpriced `CHF 000` must refuse, not be relabelled. Same refuse applies to Purchase value.

---
*Pitfalls research for: v1.3 Meta measurement on the existing Vamos consent and Stripe settle path*
*Researched: 2026-09-23*
