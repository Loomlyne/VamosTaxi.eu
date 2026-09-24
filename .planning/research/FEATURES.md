# Feature Research

**Domain:** Consent-gated Meta Pixel PageView + one Stripe-webhook Purchase (v1.3 Meta measurement)
**Researched:** 2026-09-23
**Confidence:** HIGH on the locked v1.3 scope (PROJECT.md) and on Meta primary docs fetched the same day. MEDIUM on this pixel's Events Manager toggles — automatic events, automatic advanced matching, and the first-party cookie switch were not opened for pixel `1595596972063765`. LOW on other taxi sites' pixels — not crawled this pass.

## How this file was built

v1.0 FEATURES.md surveyed the airport-transfer category. v1.1 surveyed Ops Support. v1.2 surveyed Stripe TEST checkout. Those files stay in `.planning/research/v1.0-archive/`, `v1.1-archive/`, and `v1.2-archive/`. This file does not repeat them.

It answers one question:

> How does a consent-gated Meta Pixel plus server Purchase typically behave, and which of those behaviors are table stakes vs anti-features for this locked scope?

v1.3 measures ads only. It does not change quote, pay, or confirmation.[unverified] Stripe stays test. Host stays `vamostaxi.site`. No `.eu`. No invented banner, cookies, or privacy lines. No invented CHF.[unverified]

## How a consent-gated pixel plus server Purchase typically behaves

A stock Meta install is not consent-gated. The base snippet is meant to sit in `<head>` on every page, load `fbevents.js`, call `fbq('init')`, and call `fbq('track', 'PageView')` every time that snippet loads. Meta recommends leaving that PageView call intact.[2] The same sample includes a `<noscript>` image pointed at `facebook.com/tr` with `ev=PageView`.[2] The GDPR page does not say "do not download the script." It says pause sending pixel fires until cookie consent is granted, call `fbq('consent', 'revoke')` before `init`, call `fbq('consent', 'grant')` after that, and call revoke on every page.[1] That sample still loads the library before a yes.

Once the pixel runs, Meta says it receives HTTP headers — which may include IP, browser, page location, document, referrer, and the person using the site — plus the pixel id and the Facebook cookie.[1] It also lists button-click labels and the pages those clicks open.[1] Form field values are not captured unless advanced matching or conversion tracking includes them.[1]

`_fbp` is not something the site invents. When the pixel is installed and uses first-party cookies, it saves a unique identifier to `_fbp` if one does not already exist.[5] The default cookie setting is both first-party and third-party.[14] Business tools terms require a clear disclosure of cookie use and of data shared with third parties.[14]

`_fbc` is the formatted ad click id. Meta's documented path does not wait for the pixel: retrieve `fbclid` from the URL, format it, set `_fbc` as an HTTP cookie with a 90-day expiration, and send `fbc` with every Conversions API event.[5] If you are generating that value on a server and not saving the cookie, their format still tells you to use subdomain index `1` and the time you first saw `fbclid`.[5] An ad click is not consent. That path is how a server event carries a click id with no banner yes.

The browser Purchase Meta documents is a thank-you or confirmation page: checkout finished, land on that page, send `Purchase`.[11]

`currency` and `value` are required for that event.[11] `value` has to be a monetary amount, and currency has to be a valid ISO 4217 three-digit code.[8]

Published examples pair a decimal amount with that code (`30.00` / `USD`, `123.45` / `usd`).[3][9] Around that, the standard catalog is the middle of the funnel: `ViewContent`, `InitiateCheckout`, `AddPaymentInfo`, `Lead`, `Schedule`, `Search`, `CompleteRegistration`, `Contact`.[11] None of those are required in order to send PageView.

Meta's recommended Conversions API setup is redundant: the same events from the browser and from the server, so they can be deduped.[4][13] A split setup — PageView in the browser, Purchase only on the server — is an official option, and Meta calls it not as optimal as redundant.[13]

Deduping with `event_id` needs a browser event and a server event with the same id and name, on the same pixel, inside 48 hours; the later one is dropped.[4] If they land within 5 minutes, Meta favors the browser event.[6]

Two server events in a row are not discarded, even with the same information. Server-only sends are not deduped at all.[4] A webhook retry is a second Purchase unless we send once. `event_id` does not save a server-only retry.

A website server event needs `action_source` (`website` means the conversion was made on your website), `event_source_url` (should match the verified domain; required for website events), and `client_user_agent` (required for website events, not hashed).[6][7]

`user_data` must include at least one customer-information parameter, correctly formatted.[7] `fbp` and `fbc` are in that set and must not be hashed.[7]

Email and phone, if sent, require hashing.[7][12]

Meta lists email, IP, name, and phone as high-quality match parameters, and says `fbp` / `fbc` change across browser sessions so you should refresh them when you can.[5][10]

`event_time` is Unix seconds in GMT and may be earlier than the POST, but if any event is more than 7 days old the whole request is rejected and no events are processed.[6] Real time or within 1 hour is what they want for attribution and optimization; more than 2 hours can cut performance; 24 hours or more is called a significant attribution problem.[13] If you already gate Pixel sharing on consent, use that same logic for Conversions API.[13]

`test_event_code` is how Test Events shows a server payload. Remove it when sending a production payload. Events sent with the code are not dropped — they still enter Events Manager and are used for targeting and ads measurement.[9]

Two documented paths add events or identity without a Purchase call we wrote. The pixel automatically detects a button click and passes the relevant form fields to Meta.[15] Manual advanced matching puts email, first name, and last name on `fbq('init')`, and the pixel hashes them with SHA-256.[12] A "PageView only" snippet is not, by itself, a promise that nothing else leaves the browser.

`opt_out: true` is not a substitute for not sending. Meta still takes the event and only uses it for attribution.[6] Limited Data Use is a flag on an event you are already posting, not a way to skip the POST.[9]

## Expected behavior (locked v1.3)

From PROJECT.md. This is the product, not a suggestion. It is narrower than Meta's recommended install on purpose.

- Pixel `1595596972063765` loads only after Accept, and only after the owner has pasted banner, cookies, and privacy lines in en/de/fr/ar.[unverified] Do not draft those lines. A TBC pill is not a licence to load `fbevents.js`.[unverified]
- Browser event is PageView only.[unverified] Surfaces: public pages with no token in the URL, plus signed-in account and bookings. Never ops. Never a pay link. Never manage-booking. A token in the URL is enough to skip, including after a client-side navigation.[unverified]
- One Purchase, from the Stripe webhook, after the charge is real. Currency CHF. Value is the charged amount.[unverified] `event_id` is an opaque id for that charge, not the booking reference. Attach `_fbp` and `_fbc` only if the pixel actually wrote them after Accept.[unverified]
- No email, phone, name, route, flight number, or booking reference in the payload. Match the ad click with `_fbp` and `_fbc` only.[unverified]
- Unpriced `CHF 000` sends nothing. Not a zero Purchase.[unverified]
- Accept and Dismiss stay. Accept means Meta on. Dismiss means Meta off. The choice is logged server-side. Banner asks on every customer page until they choose. No new switches.[unverified]
- A later Dismiss stops future events. Accepting after payment does not backfill a Purchase.[unverified]
- Conversions API token via `wrangler secret put`. Staging sends a Meta test event code. Do not put the token or the test code in the repo or in this file.[unverified]
- Quote, pay, confirmation, cookieless Cloudflare analytics, live Stripe, and `vamostaxi.eu` are untouched.[unverified]

## Existing surface this milestone extends

Do not rebuild the banner or the webhook. v1.3 turns Accept into a Meta gate. Today it does not.[unverified]

| Surface | What it already does | v1.3 implication |
|---------|----------------------|------------------|
| `apps/web/lib/consent/bind.ts` | Accept, Dismiss, and settings all call `record_consent` with `marketing: false` hardcoded | Accept must mean Meta on. Dismiss stays off. No second table. No new banner button. Phase 10 D-03 ("Dismiss same as Accept") is overridden for Meta only |
| `consent_log` / `record_consent()` | Append-only. Withdrawal is a new row, not an UPDATE. Subject is a GUC, not an RPC argument | The row that gates the pixel and the webhook is the latest row. A Dismiss after Accept is a new row |
| Banner | Accept / Dismiss on customer pages. Ops has no banner (Phase 10 D-07). Copy is not ours to draft | Pixel stays unloaded until owner lines exist in en/de/fr/ar. Missing one language means the lines are not in |
| Cloudflare Web Analytics | Cookieless. Phase 10 D-01: do not invent a cookie for it | Do not gate it on Accept. Do not replace it with the pixel |
| Stripe webhook | Verifies, then confirms the booking. Thank-you waits. First successful charge wins | Purchase is a side effect of that confirm. It does not confirm, refund, or mint a second charge |
| Pay link / manage-booking | Token in the URL. Recap or manage, not a public marketing page | Never load the pixel. The pixel would receive the page location.[1] |
| Unpriced class | `CHF 000`, pay refused | No PageView exception and no Purchase. Nothing |

## Feature Landscape

Table stakes are what this lock needs so one consented PageView and one charged Purchase actually arrive, and so nothing else does.[unverified] A Meta recommendation that the lock rejects is an anti-feature, not a gap.[unverified]

### Table Stakes (Users Expect These)

The "user" here is the owner reading Events Manager, plus a regulator reading the consent log. A traveller does not come for a pixel.[unverified] Missing a row below means the milestone is not done. Missing a Meta-required website field means the Purchase is posted and dropped.[6][7]

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| No Meta script and no CAPI call before Accept | The lock. Meta's own sample still loads the library, then revokes.[1][2] That is not this gate | MEDIUM | Do not inject `fbevents.js`, the noscript image, or a Graph `/{pixel}/events` POST until Accept is the latest logged choice. A returning visitor with Accept may load. A visitor with no row, or with Dismiss, must not |
| Pixel dark until owner legal lines are pasted | Meta requires a cookie and sharing disclosure.[14] PROJECT forbids invented copy | LOW | Banner, cookies, and privacy lines, en/de/fr/ar, from the owner. One missing language keeps the pixel unloaded. Do not draft stand-in sentences |
| Accept means Meta on; Dismiss means Meta off; logged server-side | Two buttons already exist. Today both store `marketing: false` | LOW | Reuse `record_consent`. New row, never UPDATE. No category grid. Necessary cookies stay necessary. Site still works on Dismiss |
| Later Dismiss stops future events | Meta's revoke has to be called on every page, and Conversions API is supposed to use the same consent logic as the pixel.[1][13] | LOW | Check the latest row at PageView time and again at webhook send time. An event already sent is not recalled. Do not send `opt_out: true` as a fake stop — that event is still taken and used for attribution.[6] |
| No Purchase backfill if Accept happens after payment | The lock. The pixel may not have run, so `_fbp` may not exist for that charge | LOW | Consent has to be Accept before the charge, and still Accept when the webhook sends. A yes on the thank-you page does not create a Purchase for the charge that already happened |
| PageView only, pixel `1595596972063765`, allowlist URLs | Base code's documented fire is one PageView per load.[2] The lock keeps that and cuts every other browser event | MEDIUM | Public pages with no token, plus signed-in account and bookings. Apply that to the URL after client-side navigations. One pixel id. No second snippet, no tag manager, no partner app |
| Never ops, pay-link, or manage-booking | Those URLs carry a token. The pixel receives page location.[1] | LOW | A token anywhere in the URL skips, even if the path would otherwise be public. Ops has no banner and no pixel |
| One Purchase from the Stripe webhook | Thank-you is a paint. The charge is the webhook. Meta will not drop a second server event.[4] | MEDIUM | Send once per winning charge, on the confirming webhook, not on a delay. `event_time` within 7 days or the batch is rejected; within an hour is the useful window.[6][13] Webhook retry must not send again. Do not confirm the booking from this call |
| CHF + charged amount | Purchase requires currency and value; value is a monetary amount; currency is a valid ISO 4217 code.[8][11] | LOW | Currency `CHF`. Value is the francs Stripe charged, in the same major-unit shape as Meta's `30.00` example, not the integer rappen field and not `CHF 000`.[3] Unpriced sends no event at all |
| Opaque `event_id` | The lock requires one. Meta's example uses an order number as `event_id`, which would put a booking reference in the payload.[6] | LOW | Unique per charge. Not the booking reference, not an email, not a flight number. It does not dedupe a server retry by itself.[4] Our once-only send does |
| Pass through real `_fbp` and `_fbc` | Pixel writes `_fbp` after it runs.[5] Meta wants both on the server event when they exist.[5] The lock says attach them, and match with them only | LOW | Read the cookies the pixel set after Accept. Store them on the booking before pay. Send them unhashed.[7] If a cookie was blocked, omit it. Do not invent `fb.1.<time>.<random>` |
| Website fields the Purchase needs, and nothing else | A website event requires `event_source_url` and `client_user_agent`. `action_source` is required on every server event.[6][7] | LOW | `action_source: website`. `event_source_url` is the origin only (`https://vamostaxi.site`), no path. Query-stripping does not remove a booking reference or pay-link token from the path, and those must not be in the payload. Do not send `client_user_agent` or `client_ip_address`. Match is `_fbp` and `_fbc` only. If Graph rejects the event for a missing user-agent or an origin-only URL, stop and ask. Do not add them. No email, phone, name, route, flight, booking reference, `external_id`, or `order_id` |
| Staging test event code; secret in wrangler | Test Events is how you see the server payload.[9] The token is a secret | LOW | Staging payload includes the test event code. Any payload that is meant to be production omits it. Do not print the code or the token into planning docs. Owner runs `wrangler secret put` |
| Funnel unchanged | Core value is quote, pay, confirmation. v1.3 measures | LOW | No new checkout step, no pay-path rewrite, no Cloudflare analytics cookie, no live `sk_live_`, no `.eu` DNS |

### Differentiators (Competitive Advantage)

This milestone does not compete. The traveller-facing product stays the booking.[unverified] The only measurement distinction is that the conversion is the charge, which is what makes the booking trustworthy. Do not grow this list.[unverified]

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Purchase is the Stripe charge, not the thank-you paint | Meta's documented Purchase is the confirmation page.[3][11] A painted thank-you is not a paid booking. A refresh would send it again, and Meta does not drop browser-only duplicates.[4] | LOW | This is why browser Purchase is refused, not a second channel to add later in the same milestone. Webhook already confirms. Purchase hangs off that |

### Anti-Features (Commonly Requested, Often Problematic)

These are the behaviors a normal pixel install, a Meta checklist, or an Events Manager warning will push. They are out.[unverified]

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Load `fbevents.js`, then `consent: revoke` until Accept | It is Meta's GDPR sample.[1] CMPs ship it | The script and the noscript image still run before a yes. The lock is no Meta script before Accept | Do not insert the snippet at all until Accept and the owner lines are in |
| `<noscript>` PageView image | It is in the base-code sample.[2] | The sample image hits `facebook.com/tr` with `ev=PageView`, with no consent check and no allowlist check | Omit it. PageView is the JS call after Accept, on an allowlisted URL only |
| Middle-funnel events (`ViewContent`, `InitiateCheckout`, `AddPaymentInfo`, `Lead`, `Schedule`, `Search`, `Contact`, `CompleteRegistration`) | Standard catalog. Meta's split-setup example is PageView and ViewContent in the browser, Lead or Purchase on the server.[11][13] | The lock is PageView + one Purchase. A quote or a pay click is not a conversion | Do not call `fbq('track')` for anything but PageView. Do not send those names on CAPI |
| Browser Purchase on thank-you | It is the documented Purchase.[11] Redundant setup wants it on both sides.[10] | Refresh double-counts. Server-only dedupe will not collapse it with the webhook, and a near-simultaneous browser event is the one Meta prefers.[6] | Webhook Purchase only |
| Redundant browser + server Purchase | Meta's recommended setup.[10][13] | Same double-count, and it needs a browser Purchase the lock forbids | Split is the official narrower option.[13] Ours is narrower still: PageView in the browser, Purchase only on the server |
| Hashed email, phone, or name | Meta lists email, IP, name, and phone as high-quality match parameters.[10] Advanced matching hashes email and name in `fbq('init')`.[12] Conversions API is designed not to accept unhashed contact information.[7] | The lock is `_fbp` and `_fbc` only. A low match score is not a licence to add PII | Send `fbp` / `fbc` when the pixel wrote them. Do not turn on manual advanced matching. Do not hash to "fix" match quality |
| `external_id`, booking reference, route, flight number | Meta's other dedupe path uses `fbp` and/or `external_id`. Their `event_id` example is an order number.[4][6] | Booking reference in the payload is forbidden. `external_id` is a customer id we do not send | Opaque `event_id`. No customer id. No trip fields |
| Full `client_ip_address` or `client_user_agent` | Meta says the browser IP helps matching and must not be hashed, and that `client_user_agent` is required for website events.[7] | Match is `_fbp` / `_fbc` only. Consent log already stores a truncated IP. A full IP or the browser user-agent is a wider share than the lock | Do not put IP or user-agent in `user_data`. If Graph rejects the event, stop and ask. Do not add them to raise the score.[7] |
| Set `_fbc` or fire CAPI because `fbclid` is in the URL | Meta recommends formatting `fbclid`, storing it as a 90-day `_fbc` cookie, and sending `fbc` with every server event, including a server-generated value when you are not saving the cookie.[5] | An ad click is not Accept. It bypasses the banner | Ignore `fbclid` until the pixel, after Accept, has written `_fbc`. Do not Set-Cookie it from the Worker |
| Relying on the pixel's automatic button-click detection | The pixel detects a button click and passes the relevant form fields without a `fbq('track')` we wrote.[15] | Button labels and field names become data at Meta. That is a middle funnel we did not write | Do not add click or form tracking. PageView is the only browser call |
| A thank-you URL treated as the Purchase | Meta's documented Purchase is the confirmation page the visitor lands on.[11] | A painted thank-you is not the Stripe charge, and a token URL would be a page location.[1] | Do not send Purchase from that page. Purchase is the webhook only |
| Category switch grid (analytics / marketing / functional) | Banners often ship one. Phase 10 D-05 already forbids fake toggles | Accept/Dismiss are the only choices. A grid is a new switch | Two buttons. Accept = Meta on. Dismiss = Meta off |
| Invented banner, cookies, or privacy text | The pixel cannot load without a disclosure.[14] | PROJECT forbids drafting it. Four languages. TBC is not a licence | Pixel stays unloaded until the owner pastes en/de/fr/ar |
| `opt_out` or Limited Data Use as the consent mechanism | `opt_out: true` still sends the event and uses it for attribution.[6] LDU is a processing flag on an event you are already posting.[9] | Dismiss means no call | Do not POST |
| Ops pixel, pay-link pixel, manage-booking pixel | "Pixel on every page" is the install guide.[2] | Token and staff URLs would be page locations at Meta.[1] | Allowlist only |
| Second pixel, GTM, or a partner app | Duplicate installs are how a pixel fires beside the gate | Two inits, two PageViews, one of them ungated | One id, injected by us, after Accept |
| Backfill Purchase after a late Accept | Recovers "lost" conversions | The lock forbids it. The click ids for that charge were never consented | Drop it. Next visit can PageView. That charge does not |
| Zero-value or `CHF 000` Purchase | Keeps the event stream continuous | Unpriced is not a charge. A zero Purchase is still an event | Send nothing |
| `test_event_code` on a payload that is supposed to count as real ads | Copy-paste from staging. Test events are not dropped; they are used for targeting and measurement.[9] | Staging must send the code. A later real-ads payload must not. Leaving it on pollutes measurement; removing it on staging hides the test | Staging includes it. Production payload omits it. Not this milestone's flip |
| Live Stripe or `vamostaxi.eu` | "While we are here" | Out of v1.3. Payment milestone is frozen. Phase 11 owns live DNS | Staging host. Test keys. Secret swap later, not in this research |
| Refund / negative Purchase / Subscribe / Schedule as a booking event | The catalog has them.[3] | Cancel and refund are not this milestone. Schedule would mark a quote as a conversion | One Purchase for the winning charge. No inverse event |

## Feature Dependencies

```
Owner legal lines (en/de/fr/ar, pasted, not drafted)
    └──requires──> Pixel allowed to load

Latest consent row = Accept (marketing on)
    └──requires──> fbevents.js + PageView on an allowlisted URL
                       └──requires──> Pixel-written _fbp (and _fbc if the pixel stored the click)

Those cookies stored before payment
    └──requires──> Webhook can attach them

Latest row still Accept at send time
    └──requires──> One CAPI Purchase
                       └──requires──> Winning Stripe charge, priced, CHF, not CHF 000

Dismiss row ──conflicts──> any later PageView or Purchase

Browser Purchase ──conflicts──> webhook-only Purchase
fbclid → fbc synthesis ──conflicts──> consent before any Meta call
Hashed email/phone/name ──conflicts──> match with _fbp and _fbc only
test_event_code ──conflicts──> a later real-ads payload
```

### Dependency Notes

- **Pixel load requires owner lines and Accept:** Disclosure is a Meta business-tools requirement.[14] The lock is stricter than revoke-after-load.[1] Both have to be true. Either one missing keeps the script out.
- **PageView requires the allowlist on the URL that is actually showing:** Client-side navigation onto a token URL must not emit PageView. The pixel receives page location.[1]
- **Purchase requires a charge that already happened under Accept:** The webhook is the clock. Thank-you is not. A yes after payment does not walk backward.
- **Purchase requires our own once-only send:** Meta drops a later event only when a browser twin with the same `event_id` and name arrived inside 48 hours.[4][6] We will not send that twin. Two server events with the same information are both kept.[4] A retried webhook is a second Purchase unless we remember we sent.
- **`_fbp` / `_fbc` enhance the Purchase; they do not authorize it:** Attach what the pixel wrote. Absence is omit, not fabricate, and not a reason to read `fbclid`.[5]
- **Dismiss conflicts with every future send:** Same rule on the browser and on CAPI.[13] Do not implement that as `opt_out`.[6]
- **Browser Purchase conflicts with the charge being the conversion:** If a browser event and a server event arrive within 5 minutes, Meta favors the browser event.[6] Sending both would let the thank-you paint win.
- **Hashed PII conflicts with the match lock:** EMQ will complain. That complaint is not a requirement.
- **Staging test code conflicts with a later counted payload:** The code is required to see staging events, and those events are not discarded.[9] Do not treat "remove the code" as a silent default of this milestone, and do not leave the code on when he later wants real measurement.

## MVP Definition

### Launch With (v1)

This milestone's launch is staging on `vamostaxi.site`, Stripe still test, pixel still dark until the owner lines exist.[unverified]

- [ ] Owner banner, cookies, and privacy lines in en/de/fr/ar are the only copy that can turn the pixel on — why the disclosure exists.[14]
- [ ] Accept logs Meta on and then loads pixel `1595596972063765` for PageView on allowlisted URLs only — the browser half
- [ ] Dismiss logs Meta off and stops the next PageView and the next Purchase — the gate has to hold after a yes
- [ ] One webhook Purchase, CHF, charged amount, opaque `event_id`, real `_fbp` / `_fbc` when present, origin-only `event_source_url`, no user-agent, no excluded PII — the conversion half
- [ ] No backfill, no `fbclid` synthesis, no browser Purchase, no middle event, no token URL — the lock is the absence as much as the send
- [ ] Staging CAPI uses the test event code; token is a wrangler secret — so the send can be seen without putting the secret in git.[9]
- [ ] Quote, pay, confirmation, and cookieless Cloudflare analytics behave as they do now — this milestone does not touch the funnel

### Add After Validation (v1.x)

Not more events. Only the cutover he has not asked for.[unverified]

- [ ] Drop `test_event_code` only when he says this pixel should count in ads — test events are already used for targeting, so this is a deliberate flip, not a cleanup.[9]
- [ ] Confirm in Events Manager that this pixel is not also collecting button clicks, advanced matching, or a thank-you Purchase — those paths are documented without a Purchase call we wrote, and code cannot see the console toggles.[12][15]

### Future Consideration (v2+)

Do not pull these into v1.3 planning.[unverified]

- [ ] Middle-funnel events — wait until he asks for a funnel, not a single Purchase
- [ ] Hashed email or phone — wait for an explicit match-policy change. EMQ is not that change
- [ ] Browser Purchase deduped against the webhook — wait until server-only Purchase is proven. Adding it now reopens double-count.[4]
- [ ] Full IP in `user_data` — wait for a lock. Consent log truncation is the current privacy shape
- [ ] Live Stripe and `vamostaxi.eu` — still not this milestone

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Consent before script and before CAPI | HIGH | MEDIUM | P1 |
| Pixel dark until owner lines (en/de/fr/ar) | HIGH | LOW | P1 |
| Accept on / Dismiss off, logged, no new switch | HIGH | LOW | P1 |
| PageView allowlist, one pixel, no token URL | HIGH | MEDIUM | P1 |
| One webhook Purchase, CHF, charged amount, once | HIGH | MEDIUM | P1 |
| Real `_fbp` / `_fbc` pass-through, no `fbclid` synthesis | HIGH | LOW | P1 |
| No PII, no route, no booking reference | HIGH | LOW | P1 |
| Staging test event code, secret via wrangler | HIGH | LOW | P1 |
| Dismiss stops future sends; no backfill | HIGH | LOW | P1 |
| Charge-backed Purchase instead of thank-you Purchase | HIGH | LOW | P1 |
| Events Manager checked for extra collection | MEDIUM | LOW | P2 |
| Drop test event code for real ads measurement | MEDIUM | LOW | P3 |
| Middle funnel, hashed match, browser Purchase, full IP | LOW | HIGH | P3 |

**Priority key:**

- P1: Must have for this milestone[unverified]
- P2: Owner console check once events flow. Not a new event[unverified]
- P3: Not this milestone[unverified]

## Competitor Feature Analysis

Columns are Meta's own documented install and Meta's own GDPR sample, not other taxi sites. Blacklane and Welcome Pickups were not crawled for pixels this pass.[unverified] Do not treat a blank cell as "they don't do this."[unverified]

| Feature | Meta documented install | Meta GDPR sample | Our approach |
|---------|-------------------------|------------------|--------------|
| When the script loads | Base code in `<head>` on every page, PageView on load, noscript image included.[2] | Same snippet, then `consent: revoke` until grant. Revoke on every page.[1] | No script and no image until Accept, and not until owner lines are in |
| Browser events | PageView plus whatever standard events you call. Purchase on the confirmation page.[3][11] | Same, after grant | PageView only, allowlisted URLs |
| Server Purchase | Redundant with the browser event, shared `event_id`.[10][13] | Same consent logic as the pixel.[13] | Webhook only, once, same consent row. No browser twin |
| Match keys | Email, phone, name, IP, `fbp`, `fbc`.[7][10] | Not specified beyond the pixel cookie | `_fbp` and `_fbc` only. No hash. No IP. No user-agent |
| Click id without a yes | Format `fbclid`, store a 90-day `_fbc`, send `fbc` on every server event, including a server-generated value.[5] | Not a consent signal | Ignore `fbclid` until the pixel writes `_fbc` after Accept |
| Extra collection with no Purchase call | Pixel detects button clicks and can hash email and name on `init`.[12][15] | Revoke-before-init does not remove the base snippet.[1] | Do not add those calls. Owner confirms the pixel is not collecting them |
| Test traffic | `test_event_code` for tests only; those events still count.[9] | n/a | Staging sends the code. A counted production payload must not |

## Sources

[1] https://developers.facebook.com/docs/meta-pixel/implementation/gdpr
    > "Use the following API to pause sending Pixel fires to Facebook, and once cookie consent is granted, send Pixel fires to Facebook. You need to call revoke on every page."
    > "Revoke consent before 'init' is called"
    > "We don't capture field values unless you include them as part of Advanced Matching, or conversion tracking"
    > "Http Headers – Anything that is generally present in HTTP headers, a standard web protocol sent between any browser request and any server on the internet."
    > "Button Click Data – Includes any buttons clicked by site visitors, the labels of those buttons and any pages visited as a result of the button clicks."
[2] https://developers.facebook.com/docs/meta-pixel/get-started
    > "We recommend that you leave this function call intact"
    > "Placing the code within your tags reduces the chances of browsers or third-party code blocking the Pixel's execution."
[3] https://developers.facebook.com/docs/meta-pixel/implementation/conversion-tracking
    > "fbq('track', 'Purchase', {currency: "USD", value: 30.00});"
    > "you could call the fbq('track') function on your _purchase confirmation page_"
[4] https://developers.facebook.com/docs/marketing-api/conversions-api/deduplicate-pixel-and-server-events
    > "We call this a "redundant setup""
    > "Server events will not be discarded if a browser event has not been received in the past 48 hours"
    > "If you send us two consecutive server events with the same information, we do not discard either."
    > "sent to the same Pixel ID within 48 hours, we discard the subsequent events."
[5] https://developers.facebook.com/docs/marketing-api/conversions-api/parameters/fbp-and-fbc
    > "When the Meta Pixel is installed on a website, and the Pixel uses first-party cookies, the Pixel automatically saves a unique identifier to an _fbp cookie for the website domain if one does not already exist."
    > "with the 90 days expiration time once retrieved from the fbclid URL query parameter or the _fbc browser cookie."
    > "If you're generating this field on a server, and not saving an _fbc cookie, use the value 1."
    > "We recommend sending the fbc parameter with every event you send to the Conversions API."
    > "These values are subject to change over multiple browser sessions, so we recommend refreshing a user's profile with the latest value whenever possible."
[6] https://developers.facebook.com/docs/marketing-api/conversions-api/parameters/server-event
    > "The event_time can be up to 7 days before you send an event to Facebook. If any event_time in data is greater than 7 days in the past, we return an error for the entire request and process no events."
    > "The event_source_url is required for website events shared using the Conversions API."
    > "A flag that indicates we should not use this event for ads delivery optimization. If set to true, we only use the event for attribution."
    > "website — Conversion was made on your website."
    > "An order number or transaction ID are two potential identifiers that can be used for event_id."
    > "If a server and browser/app event arrive at approximately the same time (that is, within 5 minutes of each other), we favor the browser/app event."
[7] https://developers.facebook.com/docs/marketing-api/conversions-api/parameters/customer-information-parameters
    > "You must provide at least one of the following user_data parameters with the correct formatting in your request."
    > "Do not hash."
    > "The client_user_agent is required for website events shared using the Conversions API."
    > "Our systems are designed to not accept customer information that is unhashed Contact Information"
[8] https://developers.facebook.com/docs/marketing-api/conversions-api/parameters/custom-data
    > "Currency must be a valid ISO 4217 three-digit currency code."
    > "A numeric value associated with the event. This must represent a monetary amount."
[9] https://developers.facebook.com/docs/marketing-api/conversions-api/using-the-api
    > "The test_event_code field should be used only for testing. You need to remove it when sending your production payload. Events sent with test_event_code are not dropped. They flow into Events Manager and are used for targeting and ads measurement purposes."
    > ""currency": "usd", "value": 123.45"
[10] https://developers.facebook.com/docs/marketing-api/conversions-api/best-practices
    > "Examples of high-quality customer information parameters include: * email address (em) * IP address (client_ip_address) * name (fn and ln) * phone number (ph)"
[11] https://www.facebook.com/business/help/1292598407460746
    > "A person has finished the purchase or checkout flow and lands on thank you or confirmation page."
[12] https://developers.facebook.com/docs/meta-pixel/advanced/advanced-matching
    > "Values will be hashed automatically by the pixel using SHA-256"
[13] https://developers.facebook.com/docs/marketing-api/conversions-api/guides/end-to-end-implementation
    > "This option is not as optimal as a redundant setup."
    > "you could send PageView and ViewContent via Pixel, and Lead or Purchase via Conversions API."
    > "If you have logic for controlling consent with respect to sharing Pixel data, use the same logic with respect to sharing data via Conversions API."
    > "Sending your events in real time or within 1 hour helps ensure that they can be used for attribution and optimized for ad delivery. Sending your events more than 2 hours after they occurred can cause a significant decrease in performance"
    > "Events sent with a delay of 24 hours or more may experience significant issues with attribution and optimized ad delivery."
[14] https://www.facebook.com/business/help/471978536642445
    > "require you to clearly disclose to your website visitors how you use cookies and how you share data collected on your websites with third parties."
    > "This is the default option and is most likely your current Meta Pixel setting. With this option, you will use first-party cookie data with your pixel, in addition to third-party cookie data."
[15] https://developers.facebook.com/docs/meta-pixel/implementation/automatic-events
    > "When a visitor clicks a button, the Meta Pixel's JavaScript code automatically detects and passes the relevant form fields to Meta."
