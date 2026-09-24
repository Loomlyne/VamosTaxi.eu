# Project Research Summary

**Project:** Vamos Taxi
**Domain:** v1.3 Meta measurement on the existing booking site — PageView after Accept, one webhook Purchase
**Researched:** 2026-09-23
**Confidence:** HIGH

## Executive Summary

v1.3 measures ads. It does not change quote, pay, or confirmation. After the customer clicks Accept, and only after the owner has pasted banner, cookies, and privacy lines in en/de/fr/ar, allowed customer pages load pixel `1595596972063765` and send PageView. A paid booking sends one Purchase from the existing Stripe paid path, in the CHF Stripe charged, with `_fbp` and `_fbc` when the pixel wrote them. Nothing else is a conversion.

Experts install Meta's snippet in `<head>`, call `fbq('consent', 'revoke')` until a yes, and send Purchase from the thank-you page, often with hashed email and a full URL. That install is the anti-pattern here. The script stays out of the document until Accept. There is no browser Purchase, no middle-funnel event, no Zaraz, no GTM, no pixel SDK, and no new consent product. The Conversions API call is a Worker `fetch` to Graph `v26.0` from the queue consumer that already settles the charge. The HTTP webhook stays verify, record, enqueue, 200.

The main risk is treating Meta's sample as the spec. Their GDPR snippet still downloads `fbevents.js`. Their website event wants `client_user_agent` and a URL that can carry a booking reference. Their dedupe does not collapse two server Purchases. Mitigation is the phase order below: legal lines before the pixel can load, Accept means `marketing: true` on a new consent row, PageView only on routes with no token and no booking reference, and one Purchase gated by our own sent row. If Graph rejects the narrow payload, stop and ask. Do not add email, phone, name, route, flight, booking reference, IP, or user-agent to make the score move. No `sk_live_`. No `vamostaxi.eu`. No invented legal copy. No invented CHF.

## Key Findings

### Recommended Stack

No new package. The pixel is Meta's official snippet (`https://connect.facebook.net/en_US/fbevents.js`), injected by our code after every gate, with `autoConfig` off and no advanced-matching object. The only browser call is `fbq('track', 'PageView')`. Purchase is `POST https://graph.facebook.com/v26.0/1595596972063765/events` from the existing Worker, token in `wrangler secret put`, staging `test_event_code` only. Do not add `react-facebook-pixel`, `facebook-nodejs-business-sdk`, a parameter builder, Zaraz, GTM, a CMP, or Conversions API Gateway. Do not bump Next, React, Stripe, or wrangler for this milestone. Details: [STACK.md](STACK.md).

**Core technologies:**
- Official Meta Pixel snippet: one browser PageView after Accept — a wrapper still downloads the same file and cannot refuse to inject it
- Graph Conversions API `v26.0`: one server Purchase — pin the version; v20.0 is removed 2026-09-24; do not call an unversioned host
- Worker `fetch`: the outbound POST — public host, no SDK, token stays a Worker secret
- Existing Stripe settle path (`stripe@22.6.1`, `STRIPE_EVENTS` queue): the one Purchase — after the existing once-only paid row, not from the browser and not from the webhook HTTP handler
- Existing Supabase (`yaumjzvylngfjhtuffqs`): consent bit already exists; click ids and a sent flag are columns or a side row on that project, not a new database

### Expected Features

Table stakes are the lock, not Meta's recommended install. A traveller does not come for a pixel. Missing a row below means the milestone is not done. A Meta checklist item the lock rejects is an anti-feature. Details: [FEATURES.md](FEATURES.md).

**Must have (table stakes):**
- No `fbevents.js` and no Conversions API call before Accept, and none until owner banner, cookies, and privacy lines exist in en/de/fr/ar
- Accept logs Meta on; Dismiss logs Meta off; latest `consent_log` row wins; no new switches
- PageView only, pixel `1595596972063765`, on public pages with no token, plus signed-in account and bookings
- Never ops, never a pay link, never manage-booking — a token in the URL is enough to skip, including after client-side navigation
- One Purchase from the Stripe paid path, currency `CHF`, value the francs charged (`charged_rappen / 100`), nothing when unpriced `CHF 000`
- Attach `_fbp` and `_fbc` only if the pixel wrote them after Accept; omit a missing key; if neither was stored before the charge, send nothing
- `event_source_url` is `https://vamostaxi.site` only — no path, so a booking reference or pay-link token cannot ride along
- No email, phone, name, route, flight number, booking reference, IP, or user-agent in the payload
- A later Dismiss stops future events; Accept after payment does not backfill a Purchase
- Staging sends `test_event_code`; the token is a wrangler secret; quote, pay, and confirmation stay as they are

**Should have (competitive):**
- Purchase is the Stripe charge, not the thank-you paint — this is the measurement distinction, not a second channel
- Owner confirms in Events Manager that this pixel is not also collecting button clicks, automatic advanced matching, or a thank-you Purchase — code cannot see those toggles

**Defer (v2+):**
- Middle-funnel events (`ViewContent`, `InitiateCheckout`, `AddPaymentInfo`, and the rest)
- Hashed email or phone, full IP, user-agent, browser Purchase deduped against the webhook
- Dropping `test_event_code` so events count in ads — only when the owner says so
- Live Stripe (`sk_live_`) and `vamostaxi.eu` DNS
- Refund, negative Purchase, Subscribe, or Schedule

### Architecture Approach

Measurement plugs into the consent write and the existing queue settle. It does not add a payment stack, a second webhook, or a thank-you confirm. The browser gate (a non-HttpOnly mirror set only after Accept) is not the proof. Purchase re-reads the latest `consent_log` row. Click ids are stored before pay, where the queue consumer can read them, not in Stripe metadata and not on the Stripe request. Purchase runs after `checkout_payment_settle` commits a real CHF booking charge, including on a redelivery that already says `already_processed`, with the same `event_id`. A Meta failure does not roll back paid and does not change the webhook HTTP status. Details: [ARCHITECTURE.md](ARCHITECTURE.md).

**Major components:**
1. Consent write and banner host — Accept stores `marketing: true`; Dismiss stays false; banner on customer pages until a choice; pixel is a sibling, not inside the banner
2. Route gate and pixel loader — PageView only when the legal flag, the marketing mirror, and the route allowlist all pass; deny pay-link, manage-booking, ops, and any URL whose path is a booking reference
3. Click-id store — `_fbp` / `_fbc` copied onto the unpaid booking after the pixel sets them; pay-link cannot write; a paid booking cannot be updated to backfill
4. Purchase outbox and CAPI sender — one Graph POST from the settle consumer; unique per booking; origin-only URL; `fbp` and `fbc` only; CHF from `charged_rappen`

### Critical Pitfalls

The failures are already in this repo's consent, cache, CSP, and webhook code, plus Meta's own samples. Details: [PITFALLS.md](PITFALLS.md).

1. **Meta's consent sample still loads `fbevents.js`** — do not put the snippet in the layout; no `revoke` stub; `fbclid` is not consent
2. **Accept still writes `marketing: false`, and cookie presence is not a grant** — flip only `accept_all`; bump `policy_version`; do not reinterpret old necessary-only rows
3. **Home-only banner, token URLs, and cached HTML** — the banner is not home-only; the pixel allowlist is stricter than the banner; cached marketing HTML never contains the script; Dismiss users must not share an Accept variant
4. **Thank-you Purchase plus webhook and queue retries** — no browser Purchase; do not call Graph from the HTTP webhook; one opaque `event_id` per booking, reused on retry; Meta will not drop a second server event
5. **Payload wider than the lock, or the wrong amount** — no email, phone, name, route, flight, booking reference, IP, or user-agent; value is charged CHF major units; `CHF 000` sends nothing; the CAPI token never enters the client, the repo, or a log line

## Implications for Roadmap

Suggested phases append after frozen Phase 25. They are not a restart at Phase 1. They are not Phases 7, 10, or 21–25. Those phases already shipped or are frozen payment work. v1.2 Payment stays planned, not current. Quote, class rebuild, and fare Publish stay out.

### Phase 26: Legal gate
**Rationale:** The pixel stays unloaded until the owner pastes the lines. Drafting them to unblock the flag is the failure. This has to close before Accept changes meaning.
**Delivers:** A fail-closed flag. A paste check for banner, cookies, and privacy in en, de, fr, and ar. A new `policy_version`. The flag stays off in this phase. No drafted sentences.
**Addresses:** Pixel dark until owner legal lines; no invented banner, cookies, or privacy copy
**Avoids:** Old Accept rows, or stand-in copy, becoming the licence to load `fbevents.js`

### Phase 27: Consent record
**Rationale:** Today every consent method stores `marketing: false`, and any `consent_subject` cookie hides the banner. The pixel and the Purchase both read this row. They must not invent a parallel flag.
**Delivers:** `accept_all` stores `marketing: true`. Dismiss and `settings_change` stay false. Signup does not downgrade an Accept. Banner asks on customer pages until a choice. Latest row wins. No new switches.
**Uses:** Existing `record_consent` and `consent_log`
**Implements:** The consent write in `bind.ts` and the banner host in `SiteShell`

### Phase 28: Pixel PageView
**Rationale:** The script must not be in the document until Accept, the legal flag, and the route gate all pass. CSP and the marketing cache will either block the beacon or serve the script to people who refused.
**Delivers:** Official snippet, PageView only, route denylist (ops, pay-link, manage-booking, confirmation reference, any token URL), Facebook hosts on the public CSP, cached HTML that stays clean, no `<noscript>` image, no advanced matching. Click ids persisted after Accept so the later Purchase has something legal to attach. Flag still off until the owner lines are in.
**Uses:** Official `fbevents.js`; existing security headers
**Implements:** Route gate and pixel loader

### Phase 29: Webhook Purchase
**Rationale:** The conversion is the charge. The HTTP webhook must not call Graph, or a Meta blip changes pay. Meta's dedupe will not save a retried server event.
**Delivers:** One Purchase from the settle consumer after a real CHF booking charge. Value `charged_rappen / 100`, currency `CHF`. Origin-only `event_source_url`. `user_data` is `fbp` and `fbc` only. Opaque `event_id`, stable across retries, not the booking reference. Outbox so a redelivery does not send twice and a failed Graph call is not lost. Staging `test_event_code`. Token via `wrangler secret put`. No backfill. No `CHF 000`. No browser Purchase. No `sk_live_`. No `.eu`.
**Uses:** Worker `fetch`, Graph `v26.0`, existing `STRIPE_EVENTS` queue, existing `checkout_payment_settle`
**Implements:** Purchase outbox drain beside settle, and the CAPI sender

### Phase Ordering Rationale

- Legal lines before the consent write changes what Accept means. Otherwise the pixel loads under a banner that still says necessary cookies only.
- The consent row before any script. PageView and Purchase both consume that row.
- Pixel and click-id persistence before Purchase. The webhook request has no customer cookies. Ids have to be stored after Accept and before the charge.
- Purchase after the paid path is unchanged and the consent row means what the banner says. Do not start the Graph call in a payment plan.
- Secrets sit beside the first deploy that can call Graph, not before the legal flag can be on. Production omits `test_event_code`.
- Verification is on each phase, not a trailing-only phase. The negatives are the acceptance test: script absent, no Purchase on thank-you, no PII, no token URL, no value on an unpriced class.
- This order does not reopen quote, pay, confirmation, fare Publish, or frozen Phases 16, 17, 19, 20, or 21–25.

### Research Flags

Phases likely needing deeper research during planning:
- **Phase 29:** Graph may reject a Purchase whose `user_data` is only `fbp`/`fbc` and whose `event_source_url` has no path. That rejection is a stop. Do not research a PII workaround. Confirm with a staging test event, then ask the owner if it fails.
- **Phase 28:** Automatic advanced matching, automatic events, and the first-party cookie switch for pixel `1595596972063765` are not in the repo. The owner has to confirm them off before the flag flips. If they are on, do not load the script.

Phases with standard patterns (skip research-phase):
- **Phase 27:** The consent RPC already accepts `p_marketing`. This is an argument flip and a policy bump, not a new consent product.
- **Phase 28 CSP hosts:** The allowlist is documented (`connect.facebook.net`, `www.facebook.com`). Do not re-research Zaraz, GTM, or a pixel package. The public-versus-ops header split is a planning choice, not a new vendor.
- **Phase 26:** There is nothing to research. The lines come from the owner. Do not draft them.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | No new package, official snippet, and Worker `fetch` to Graph `v26.0` are documented. MEDIUM only on whether Graph accepts the narrow Purchase. |
| Features | HIGH | The feature list is the locked PROJECT.md scope, checked against Meta primary docs on 2026-09-23. Events Manager toggles for this pixel were not opened. |
| Architecture | HIGH | Consent write, banner host, CSP, webhook handler, queue settle, and the paid transition are in this repo. MEDIUM on Meta discarding a second server-only Purchase — once-only is our row. |
| Pitfalls | HIGH | Failures are traced to `bind.ts`, `SiteShell`, cache, CSP, and the Stripe queue. MEDIUM on the owner's Events Manager switches. |

**Overall confidence:** HIGH

### Gaps to Address

- **Graph may reject the narrow Purchase:** `user_data` is `fbp` and `fbc` only, and `event_source_url` is the origin. Meta's docs require `client_user_agent` and a website URL. If a staging test event is rejected, stop and ask. Do not add user-agent, IP, a path, or hashed contact data during planning.
- **Events Manager toggles:** Automatic advanced matching and automatic button-click collection are not visible from the repo. Confirm them off before any script load.
- **Where click ids live:** STACK.md suggests two nullable columns on `booking_payments`. ARCHITECTURE.md suggests a side row plus a purchase outbox, so the create-booking RPC and Stripe metadata stay untouched. Either store is compatible with the lock. The outbox is required for once-only retry. Do not put `_fbp` on the Checkout Session.
- **`event_id` shape:** It must not be the booking reference. A Stripe `evt_` id dedupes a retry of that event, but two paid sessions for one booking need a booking-level unique key or the loser also sends. Opaque id, one row per booking.
- **`fbclid` to `_fbc`:** Do not treat the click as consent. Do not set the cookie on the landing request. Default is: the pixel writes `_fbc` after Accept; if it did not, omit the key. Do not synthesize it on the Worker to raise match quality.
- **One CSP list versus a public-only list:** Widening the shared header does not by itself mount the pixel on ops. The route gate is the lock. If one list would let the dashboard load Facebook, split the header. Do not add `graph.facebook.com` to the page policy.
- **Banner on a token page:** The pixel never loads on ops, a pay link, or manage-booking. PROJECT.md also says the banner asks on every customer page until they choose. ARCHITECTURE.md allows the banner on a token page so the person can choose. PITFALLS.md keeps the banner off those URLs so the pixel allowlist is not derived from the banner. Planner locks that placement. Do not derive one list from the other.

## Sources

### Primary (HIGH confidence)
- [Meta Pixel get started](https://developers.facebook.com/docs/meta-pixel/get-started) — base snippet, PageView, noscript image
- [Meta Pixel advanced](https://developers.facebook.com/docs/facebook-pixel/advanced) — `autoConfig`, CSP hosts
- [Meta Pixel GDPR](https://developers.facebook.com/docs/meta-pixel/implementation/gdpr) — revoke sample still loads the script
- [Conversions API using the API](https://developers.facebook.com/docs/marketing-api/conversions-api/using-the-api) — `v26.0` pin versus sample, `test_event_code`
- [Server event parameters](https://developers.facebook.com/docs/marketing-api/conversions-api/parameters/server-event) — `event_source_url`, 7-day `event_time`, `action_source`
- [Customer information parameters](https://developers.facebook.com/docs/marketing-api/conversions-api/parameters/customer-information-parameters) — `fbp`/`fbc` not hashed; Meta also requires user-agent, which this lock refuses
- [Custom data](https://developers.facebook.com/docs/marketing-api/conversions-api/parameters/custom-data) — currency and monetary `value`
- [Deduplicate pixel and server events](https://developers.facebook.com/docs/marketing-api/conversions-api/deduplicate-pixel-and-server-events) — two server events are not discarded
- [fbp and fbc](https://developers.facebook.com/docs/marketing-api/conversions-api/parameters/fbp-and-fbc) — pixel writes `_fbp`; do not mint it before Accept
- [Graph API v26](https://developers.facebook.com/blog/post/2026/07/29/introducing-graph-api-v26-and-marketing-api-v26) — current version; v20.0 removed 2026-09-24
- `.planning/PROJECT.md` — locked v1.3 scope
- Live code cited in ARCHITECTURE.md and PITFALLS.md — consent bind, SiteShell, headers, webhook, settle, worker queue

### Secondary (MEDIUM confidence)
- [Advanced matching](https://developers.facebook.com/docs/meta-pixel/advanced/advanced-matching) — pixel can hash email and name from `init` or from an Events Manager switch
- [Automatic events](https://developers.facebook.com/docs/meta-pixel/implementation/automatic-events) — button clicks can leave without a `fbq('track')` we wrote
- [End-to-end implementation](https://developers.facebook.com/docs/marketing-api/conversions-api/guides/end-to-end-implementation) — redundant setup is what Meta prefers; split is allowed and weaker
- [Business tools cookies](https://www.facebook.com/business/help/471978536642445) — disclosure required; not a licence to draft our lines

### Tertiary (LOW confidence)
- npm pages for `react-facebook-pixel` and `facebook-nodejs-business-sdk` — versions and samples checked to reject them, not to adopt them
- Other taxi sites' pixels — not crawled this pass; not needed for this lock

---
*Research completed: 2026-09-23*
*Ready for roadmap: yes*
