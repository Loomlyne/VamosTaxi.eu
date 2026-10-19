# Plan: Meta events and Google tag (agency request), 2026-10-09

Status: SIGNED by the owner 2026-10-09 ("go"). D1 to D5 answered. Wording adopted (`.planning/decisions/2026-10-09-ad-tracking-wording.md`) and consent version to move on ship. Nothing is built yet. Map: `.planning/codebase/TRACKING.md`.
Runs as `/gsd-quick` jobs, each in its own worktree cut from `origin/main`, handed to the controller. Only the controller commits `main`, applies anything live, and deploys.

## Owner decisions needed first (question form, one each)

| # | Decision | Recommended | Why it matters |
|---|---|---|---|
| D1 | Checkout events (InitiateCheckout, AddPaymentInfo) and Purchase: **A** load the browser pixel on `/checkout` and `/confirmation`, or **B** send them from our server (Conversions API) with a fixed page address | **B** | A sends the route (`/checkout?from=…&to=…`) and the booking reference to Meta in the page address, which his own privacy text says we do not send. B keeps both out. Purchase is already B (Phase 29) |
| D2 | Google tag: **load only after the visitor accepts Marketing** (denied default written inline, no request), or **always load, denied by default** as the agency wrote | Only after Accept | Always-load pings Google before consent; the site says everything else is off until switched on. Cost: no modelled conversions for refusers |
| D3 | New legal lines: may the agent **draft** (a) Google lines and (b) the widened Meta lines, four languages, for him to read and adopt as he did on 2026-09-30? | Yes | Without adopted text neither Google nor the new Meta events may go live. A new policy version re-asks every visitor |
| D4 | Ids: Google `transaction_id` and Meta events: **opaque id** or the **real reference** `VT-26-…`? | Opaque (asked; **he chose the real reference**, see below) | His 2026-09-30 text says no booking reference goes to Meta |
| D5 | Referrers from Facebook / Instagram with a long address | Yes, verified (answered: any Meta product, verified) | Today ad clicks from Facebook and Instagram with a long address are not counted |

If D1 is A, Job 4 becomes a larger job (strip the page address before the pixel, which the owner's text does not allow today) and needs a new discuss. The rest below assumes **B**.

## Answers so far (owner, 2026-10-09, question form)

- D1 = **B**, server events for the checkout. D2 = **only after Accept**. D3 = **yes, draft the lines**.
- D4 = **the real booking reference goes to Google and to Meta** ("so we can track better and know exactly which ones"). This overrides the "no booking reference" sentence of the 2026-09-30 Meta text, so Job 1 must replace that sentence with an owner-adopted one that names the reference, for Meta and for Google. Consequences below (Job 1, 4, 6).
- D5 = **wider than the three hosts**: visitors who arrive directly (no referrer) are counted as today; visitors who really come from Facebook, Instagram or any other Meta product are no longer skipped, but the referrer is **verified** so it cannot be a way in (rule in Job 2+3, item 2).

## What is NOT asked of the agency, and why

- `eventID:'purchase_'+reference` as the browser event id: not needed. With B there is no browser Purchase to de-duplicate against. The reference still goes to Meta (D4) as `custom_data.order_id` on the server Purchase, InitiateCheckout and AddPaymentInfo carry it when a booking exists, and the existing UUID `event_id` stays (the `meta_purchase_events.event_id` column is a UUID; changing it to `purchase_VT-…` would need a migration and the claim function, which this plan avoids).
- "Allow booking, payment and confirmation pages": not needed under B. The allow-list stays as is, plus `service`.

## Jobs

Three lanes run in parallel (disjoint files), after one legal job the owner signs. Each job ends with the gates (typecheck, lint, unit, build), tests below, and a hand-over file. Flags stay closed until Job 1 is live.

### Job 1: Legal lines and policy version (owner-signed)  [blocks go-live of 3, 4, 5, 6]
Files: `.planning/decisions/2026-10-09-ad-tracking-wording.md` (new), `app/vamos-meta-texts.js`, `apps/web/i18n/messages/{en,de,fr,ar}.json`, `app/vamos-i18n-dict.js`, `app/pages/CookieBanner.dc.html`, `app/home/CookieBanner.dc.html`, `apps/web/components/consent/CookieBanner.tsx`, `app/pages/cookies.dc.html`, `app/pages/privacy.dc.html`, the Next `cookies` and `privacy` pages, `.planning/ADR-010-privacy-subprocessor-list-cloudflare.md` (add Google Ireland Ltd), `apps/web/lib/consent/policy.ts`, `owner-texts.test.ts`.
1. Draft only, in the decision file, en/de/fr/ar (Swiss German "ss"): banner line, cookies row (Google cookies set after Accept, their lifetimes read from Google's own docs, not guessed), privacy line, and the widened Meta lines (what each new event contains). Both privacy lines must now say that the **booking reference** goes to Meta and to Google with the amount (D4) and that neither receives name, email, phone, route or flight. He reads and adopts.
2. After adoption: copy verbatim into mock texts and Next messages; extend `owner-texts.test.ts` to the new sections byte for byte.
3. Bump `CONSENT_POLICY_VERSION` (test pin moves with it) only on his word in the same question.
Verify: owner-texts test; all four languages on banner, `/cookies`, `/privacy` at 390 and 1440 (Arabic RTL).

### Job 2+3: Meta in the browser on the clean pages (lane L1)
Files: `app/vamos-meta.js`, `apps/web/lib/meta/pixel-pages.ts`, `pixel-pages.cases.ts`, `vamos-meta.test.ts`, `pixel-pages.test.ts`, `apps/web/tests/fixtures/fbevents-stub.js` and the two integration specs, `app/home/home.dc.html`, `app/pages/contact.dc.html`.
1. Allow-list, both twins and the case table: add key `service` (value `[a-z_-]{1,32}` only; `/?service=airport#book` allowed; `/sign-in`, `/sign-up` still no query). Add cases: allowed `?service=airport`, `?service=airport&utm_source=x`, refused `?service=a%40b.c`, `?service=x&token=1`.
2. Referrer (D5): a referrer from a Meta product is accepted with its full long address, only when ALL of these hold, checked in `referrerAllowed` in both twins (browser ES5 and `pixel-pages.ts` helper) and in the shared case table:
   - parses as a URL, scheme `https:` exactly, no username or password, no port, length at most 2048;
   - host is exactly one of, or a dot-separated subdomain of, a fixed list of Meta's own registrable domains: `facebook.com`, `instagram.com`, `messenger.com`, `threads.net`, `fb.com`, `fb.me` (final list confirmed against Meta's documentation in the job; `whatsapp.com` only if confirmed). Match is on whole labels: `l.facebook.com`, `lm.facebook.com`, `l.instagram.com` pass; `evilfacebook.com`, `facebook.com.evil.test`, `facebook.com@evil.test`, `faceb00k.com`, punycode look-alikes and `http://` fail;
   - the decoded address (same five-round decode as the page address) contains no `@` and no `vt-<digit>`;
   - no hash.
   Every other outside site keeps the strict rule (bare origin only). No referrer, or our own clean page, as today (a direct visit to vamostaxi.site is counted, nothing changes there). Cases: allowed `https://l.facebook.com/l.php?u=…&h=…`, `https://lm.facebook.com/l.php?…`, `https://l.instagram.com/?u=…`, `https://m.facebook.com/`, `https://www.instagram.com/p/abc/`; refused every look-alike above, a Meta host with an e-mail or `VT-26-1` inside, a Meta host over `http:`, `https://l.facebook.com:8443/`, and `https://example.test/page?token=abc`.
3. New `VamosMeta.track(name, params)`: same four checks as PageView (gate, switches, allow-list, server-confirmed marketing); name from a fixed list (`ViewContent`, `Lead`, `Contact`); no user data, no free text; queued until the pixel has booted; after withdraw it does nothing.
4. ViewContent: in `home.dc.html`, where the "Show fixed prices" press builds the `/checkout?…` address (about line 1969), call `track('ViewContent', {content_name:'transfer'})` first. No route, no price. Navigation follows at once, so the pixel call must use Meta's beacon transport; prove it is not lost on navigation in the browser test.
5. Contact: one capturing click listener in `vamos-meta.js` for `a[href^="tel:"]`, `a[href^="mailto:"]`, `a[href*="wa.me/"]` (covers every mock component without editing each). Event `Contact`, param `content_category` = `whatsapp`|`phone`|`email`, nothing else. Never the number or address.
6. Lead: in `contact.dc.html` after `/api/contact` returns ok, `track('Lead')`, no fields.
Not covered by this lane: the `wa.me` / `tel:` links on the Next confirmation page (no pixel there under B). Say so in the hand-over.
Verify: unit table; browser test with the real `fbevents.js` and every request to Meta intercepted and never sent (the Phase 28 plan 28-07 method): each event appears once, with only the listed params; none without Marketing; none after withdraw; none on a refused address.

### Job 4: Meta from the server for the booking funnel (lane L2, only if D1 = B)
Files: `apps/web/lib/meta/capi.ts` (+ test), new `apps/web/lib/meta/track-event.ts`, new `apps/web/app/api/track/route.ts` (or inside the existing routes), `apps/web/app/[locale]/checkout/CheckoutPage.tsx` (`choose`), `apps/web/app/api/checkout/intent/route.ts`, `lib/abuse/*` (a rate limit), `lib/meta/legal-gate.ts` reuse.
1. Generalise `capi.ts`: `buildEvent` for `InitiateCheckout` and `AddPaymentInfo` (`currency CHF`, `value` from the selected quote in francs, `fbp`/`fbc` from the cookie header, fixed `event_source_url`, a client-made UUID as `event_id`, no other field; `custom_data.order_id` = the reference once a booking row exists, which is only at the Pay press). Purchase gets `custom_data.order_id` = the reference too (D4); the reference is read for the claimed booking (a read by `vamos_system`; if that needs the claim function to return it, that is one migration, number from the controller, applied and read back by the controller before the deploy).
2. AddPaymentInfo: sent from the existing Pay press path in `/api/checkout/intent`, next to `scheduleMetaClickIdSave`, same consent check (`metaClickIdsToSave` rules: public origin, consent subject, marketing on right now), inside `ctx.waitUntil` so the Pay answer is never slower.
3. InitiateCheckout: when a class is chosen, one `POST /api/track` `{event:'InitiateCheckout', id, class}`. Server: fixed event list, origin check, rate limit, consent read, then CAPI. Never returns anything useful to a caller.
4. Same gate and token rules as Purchase: `metaMeasurementAllowed()`, token never logged, outcome logged as code and status only. In Stripe test mode the test event code is required, exactly as Purchase.
5. Open: whether Meta accepts the event without `client_user_agent` (the owner's text forbids sending more). Proof comes from a real Test events run (Job 7). If rejected, stop and ask him; do not widen the payload.
Verify: unit tests like `purchase.test.ts` (gate closed, no token, no consent, no ids, duplicate id, Graph 4xx and timeout); no new table; a migration only if the claim function must return the reference.

### Job 5: Google tag loader (lane L3)
Files: new `app/vamos-google.js` (ES5, standalone, reads consent with `fetch('/api/consent/state')` when `VamosConsent` is absent), `app/pages/CookieBanner.dc.html` and `app/home/CookieBanner.dc.html` (one script tag next to `vamos-meta.js`; merge after Job 1 touches these files), `apps/web/app/[locale]/layout.tsx` (`next/script`, public host only, never dashboard), `apps/web/lib/security/headers.ts`, `apps/web/lib/meta/pixel-csp.ts` or a sibling for Google, `apps/web/middleware.ts`, `apps/web/components/consent/CookieBanner.tsx` (listen already exists: `vamos:consent-recorded`), tests.
1. Inline default, always: `window.dataLayer`, `gtag`, `gtag('consent','default',{ad_storage,ad_user_data,ad_personalization,analytics_storage:'denied'})`. No network.
2. D2 = after Accept: when the server says marketing on under the current policy version (checked on every page load, so "already accepted" is covered), load `https://www.googletagmanager.com/gtag/js?id=AW-368142830`, `gtag('js', new Date())`, then `gtag('consent','update', {ad_*: granted; analytics_storage: granted only if Analytics is on})`, then `gtag('config','AW-368142830', {send_page_view:false, page_location:<scrubbed>, page_referrer:''})`.
   (D2 = always: load at once with denied; same update on Accept.)
3. Scrubbed address: origin + path with the reference and the pay token replaced by `:ref` / `:token`, no query, no hash. Host must be `vamostaxi.site`; never on `dashboard.`, never on ops.
4. Withdraw (Necessary only, or Marketing off): `gtag('consent','update', all denied)` and delete `_gcl_au`, `_gcl_aw`, `_gcl_dc`, `_ga*`, `_gac_*` (every domain form), as `clearMeta` does for Meta. Same BFCache `pageshow` and `storage` handling as `vamos-meta.js`.
5. CSP: a `googleTag` option in `contentSecurityPolicy` adding exactly the hosts the tag needs (`googletagmanager.com`, `google-analytics.com`, `googleadservices.com`, `google.com`, `doubleclick.net`, to be read from a real run, not guessed). Chosen per address: public pages and `/confirmation`, never pay links, never dashboard. `Content-Security-Policy` for Next pages moves from static to middleware for those addresses; the existing Meta per-address pattern is the model.
Verify: browser test, all requests to Google intercepted and never sent: nothing before Accept (D2), nothing on a pay link or the dashboard, consent update fires on Accept and on a reload, withdraw stops it and clears the cookies, `page_location` never contains a token, reference or query.

### Job 6: Google conversion on the confirmation (lane L3, after Job 5)
Files: `apps/web/app/[locale]/confirmation/[ref]/ConfirmationClient.tsx` and test, `app/vamos-google.js`.
1. `VamosGoogle.conversion({value, currency:'CHF', transactionId})` is called once when the phase first becomes `confirmed` (`isVoucherStatus`). `value` = charged francs (`receipt.chargedRappen / 100`, else `priceTotalRappen / 100`); `currency` always `CHF` (display FX never reaches it).
2. Sends `gtag('event','conversion',{send_to:'AW-368142830/liI8CIe79pUdEO7Txa8B', value, currency:'CHF', transaction_id})`. `transaction_id` = the real booking reference (D4).
3. Once only: local storage key per transaction id written before sending, plus Google's own de-duplication on `transaction_id`. A reload, the 5 s status poller, a back-forward return and a second tab all send nothing more.
4. No consent or tag not loaded: no conversion, no queue (a later accept does not replay it; stated in the hand-over).
5. Paid versus not: a confirmed booking is a paid one today (Stripe or pay link); there is no separate unpaid confirmation to count.
Verify: component test for once-only and for value and currency; browser test with Google requests intercepted.

### Job 7: Proof (control session, then the owner)
1. Test lab run (`vamos-tester`, `.planning/templates/TEST-BRIEF.md`): home to confirmation with Accept all, Necessary only, and Marketing off after Accept, in en and ar; screenshot at 390 and 1440. A lab run is not proof for live.
2. Owner step: set `META_TEST_EVENT_CODE` (his terminal, never in chat); Events Manager, Test events: PageView, ViewContent, Contact, Lead, InitiateCheckout, AddPaymentInfo, Purchase (4242 payment) each once, each deduplicated.
3. Google Ads: Tag Assistant shows the tag, consent mode states, and one conversion with value and transaction id; conversion status leaves "Inactive" once Google sees it.
4. After deploy (controller): live URLs checked for headers and no request before Accept; 4242 payment, then `booking_payments` and `meta_purchase_events` read-only.
5. Real money (Stripe live) and the `.eu` cutover are his word each time; both change the host constants (`vamos-meta.js` `HOST`, `pixel-pages.ts`, `capi.ts` `PURCHASE_EVENT_SOURCE_URL`, the Google host check).

## Order and files

| Lane | Jobs | Files owned | Starts |
|---|---|---|---|
| Legal | 1 | texts, banners, policy, cookies/privacy pages | now, owner signs the draft |
| L1 | 2+3 | `vamos-meta.js`, `pixel-pages*`, `home.dc.html`, `contact.dc.html` | after D5, can ship before Job 1 only for allow-list and referrer (no new event until Job 1 is live) |
| L2 | 4 | `capi.ts`, `/api/track`, `CheckoutPage.tsx`, `/api/checkout/intent` | after D1 |
| L3 | 5 then 6 | `vamos-google.js`, `headers.ts`, `layout.tsx`, `ConfirmationClient.tsx` | after D2, D3, D4 |
| Proof | 7 | none | after all lanes |

Go-live gate: Job 1 live (texts adopted, version bumped) before any Google request or any new Meta event leaves the site. New flags (`GOOGLE_TAG_ON`, `META_EVENTS_ON`) default false and flip only in the proof job.

## Risks written down

- Policy version bump re-asks every returning visitor (consent rate dips once).
- Meta may reject server events without `client_user_agent`; Purchase has the same open risk today.
- Without a user agent or IP, Meta's matching rests on `fbp` / `fbc` only; reported match quality will look low. Raising it needs a wider payload and therefore his new words.
- CSP additions for Google are the loosest part of the plan; the host list must come from an intercepted real run.
- Mock pages are static HTML cached at the edge: any loader change needs the `scripts/sync-dc-mock-to-public.mjs` copy and a deploy, and the cached HTML must not vary per visitor.
- Shared files: `CookieBanner.dc.html` (Job 1 and Job 5), `messages/*.json` and `vamos-i18n-dict.js` (Job 1 only); do not run those two jobs at the same time on them.
