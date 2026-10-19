---
phase: 261011-qbc-launch-readiness-check-of-meta-google-an
reviewed: 2026-10-11T15:07:53Z
depth: deep
files_reviewed: 24
files_reviewed_list:
  - app/vamos-meta.js
  - app/vamos-google.js
  - app/vamos-meta-texts.js
  - app/vamos-consent.js
  - app/home/CookieBanner.dc.html
  - app/pages/CookieBanner.dc.html
  - app/home/home.dc.html
  - app/pages/contact.dc.html
  - apps/web/lib/meta/capi.ts
  - apps/web/lib/meta/funnel.ts
  - apps/web/lib/meta/purchase.ts
  - apps/web/lib/meta/legal-gate.ts
  - apps/web/lib/meta/pixel-pages.ts
  - apps/web/lib/meta/pixel-csp.ts
  - apps/web/lib/meta/click-ids.ts
  - apps/web/lib/google/flag.ts
  - apps/web/lib/google/google-pages.ts
  - apps/web/app/api/track/route.ts
  - apps/web/app/api/checkout/intent/route.ts
  - apps/web/lib/checkout/confirmation-conversion.ts
  - apps/web/lib/checkout/settle.ts
  - apps/web/app/[locale]/confirmation/[ref]/ConfirmationClient.tsx
  - apps/web/app/[locale]/confirmation/[ref]/page.tsx
  - apps/web/app/[locale]/checkout/CheckoutPage.tsx
  - apps/web/app/[locale]/layout.tsx
  - apps/web/lib/security/headers.ts
  - apps/web/next.config.ts
  - apps/web/middleware.ts
  - apps/web/lib/consent/policy.ts
findings:
  critical: 1
  warning: 7
  info: 6
  total: 14
status: issues_found
---

# Quick 261011-qbc: Launch-readiness review of Meta and Google ad tracking

**Reviewed:** 2026-10-11T15:07:53Z
**Depth:** deep (cross-file, call chains traced from browser loaders to Graph / gtag calls)
**Files Reviewed:** 24 source files plus the three Oct 9 commits (`3c6808e5`, `e2600555`, `64923cef`) and the Phase 28/29 code they build on
**Status:** issues_found

Severity words used here: Critical / High / Medium / Low / Info (the task's scale). In the frontmatter, High and Medium are counted as `warning`, Low and Info as `info`.

## Summary

The Meta side is built with care: a strict allow-list twin in browser and server, no pixel/CAPI overlap so no event-id dedup problem exists, fixed event words, the token only in a request body, the Purchase gated by a database claim. The Google side has correct Consent Mode v2 defaults and a sound once-only conversion loader.

The one thing that is very likely broken at launch is the one thing the Google work exists for: **the Google Ads conversion on `/confirmation/[ref]`**. The page fires it from a React effect at mount, while the loader that receives it (`/app/vamos-google.js`) is a `next/script` `afterInteractive` tag, which is only appended to the document from its own effect and then executes asynchronously. On the normal path (Stripe return route settles, the page renders already confirmed) the call reaches `window.VamosGoogle === undefined`, is silently skipped, and the effect never re-runs. The integration spec proved the loader on a mock page served at a confirmation address, never the Next page, which is exactly where the timing bug lives (CR-01).

Second, no server event has ever reached Meta's Graph endpoint. The payload omits `client_user_agent` and `client_ip_address`, which Meta documents as required for `action_source: website`. If Meta rejects, every CAPI event (InitiateCheckout, AddPaymentInfo, Purchase) is lost with no retry, and the owner only finds out from a `rejected` row (WR-01).

Everything else is a gap by design, a hardening note or a test-coverage hole; listed below with a concrete fix each.

## Critical Issues

### CR-01: The Google conversion fires before the loader exists, and never again

**File:** `apps/web/app/[locale]/confirmation/[ref]/ConfirmationClient.tsx:575-584`, `apps/web/app/[locale]/layout.tsx:118`, `apps/web/app/[locale]/confirmation/[ref]/page.tsx:106-125`

**Issue:** The effect

```tsx
useEffect(() => {
  if (conversionValue === null) return;
  const google = (window as ...).VamosGoogle;
  try { google?.conversion?.({ value: conversionValue, transactionId: reference }); } catch {}
}, [conversionValue, reference]);
```

runs in React's first effect flush after hydration. The loader is `<Script src="/app/vamos-google.js" strategy="afterInteractive" />` (layout.tsx:118). In `next/dist/client/script.js:217-227` an `afterInteractive` script is appended to the DOM from the `Script` component's own `useEffect`; the external file then loads and executes asynchronously, in a later task. So during the first effect flush `window.VamosGoogle` is always `undefined`, the optional chain is a no-op, nothing is queued (the loader's own ≤3 queue only exists once the loader has run), and the effect's dependencies `[conversionValue, reference]` do not change again on that page load, so it never retries.

When is `conversionValue` already non-null at mount? On the normal path. `page.tsx:106-125`: a well-formed reference starts as `processing`, but when the booking is readable behind the manage cookie and `isVoucherStatus(read.status)` is true (the Stripe return route settled before redirecting, which `settle.ts:565-566` describes as the usual case) `initialPhase` becomes `"confirmed"`. Then `onReturnPath = initialPhase === "processing"` is `false` (ConfirmationClient.tsx:472), `confirmationConversion` takes the off-return-path branch, `paidAt` was captured seconds ago, `chargedRappen` is in the receipt, so the decision is non-null on the very first render. Result: no Google conversion for a customer who paid and came back normally. A reload repeats the same race. The only customers who do convert are those whose page first showed the loading screen and only later flipped to booked (cookie race or slow webhook), because that state change re-runs the effect after the loader has loaded.

The unit test "the page" in `confirmation-conversion.test.ts:68-80` reads the TSX as text; `google-tag.spec.ts` C calls `VamosGoogle.conversion` by hand on a mock page. Neither mounts the Next page with the loader loading late. The HANDOVER lists this exact case under "Not verified".

**Fix:** Make the hand-off order-independent. In the loader, drain a global queue the page can fill before the loader exists, and announce readiness:

```js
// app/vamos-google.js, inside start(), after the listeners are registered:
var early = window.vamosGoogleQueue;
if (early && early.length) { for (var i = 0; i < early.length; i++) conversion(early[i]); }
window.vamosGoogleQueue = { push: function (item) { conversion(item); } };
```

```tsx
// ConfirmationClient.tsx effect
const w = window as unknown as { VamosGoogle?: {...}; vamosGoogleQueue?: { push: (i: {...}) => unknown } | Array<...> };
if (w.VamosGoogle?.conversion) w.VamosGoogle.conversion(item);
else (w.vamosGoogleQueue = w.vamosGoogleQueue ?? []).push(item);
```

Keep the loader's own guards (flag, address, consent, ≤3 queued, once per reference) so the early queue adds no new path to Google. Then add a test that mounts `ConfirmationClient` with `initialPhase="confirmed"` and a recent `paidAt`, no `window.VamosGoogle` at mount, injects the loader afterwards, and asserts exactly one `gtag('event','conversion',…)`. Launch proof: one 4242 payment with Tag Assistant open, on the real `/confirmation/<ref>` page.

## Warnings

### WR-01 (High): Meta server events carry neither `client_user_agent` nor `client_ip_address`; no live event has ever been accepted

**File:** `apps/web/lib/meta/capi.ts:41-49, 73-113`, `apps/web/lib/meta/purchase.ts:152-173`, `apps/web/lib/meta/funnel.ts:66-79`

**Issue:** Every server event is `{event_name, event_time, action_source:"website", event_source_url, event_id, user_data:{fbp?,fbc?}, custom_data}`. Meta's Conversions API reference marks `client_user_agent` (and `client_ip_address`) as required for `action_source: website`; an event without them is answered with a 4xx `error.code 100` and the row is written `rejected` (`postPurchase` capi.ts:171-172), with no retry anywhere (`purchase.ts:175-187` just finishes the claim; `funnel.ts:79-86` logs). The HANDOVER states no real Graph call was made ("Open risk, same as the live Purchase"), `META_TEST_EVENT_CODE` is still an owner step, and the first live Purchase (`pk_live_` key since `6a5f274e`) has not been read back. If Meta rejects, InitiateCheckout, AddPaymentInfo and Purchase are all lost from day one, while the browser PageView/ViewContent/Lead/Contact still arrive, so Events Manager will look alive.

The adopted privacy line already says "Meta receives your IP address and browser details when its script loads", so adding the browser's `User-Agent` to the server event does not go beyond what the customer was told, but it is the owner's wording decision, not the reviewer's.

**Fix:** Before the switch is called "open": set `META_TEST_EVENT_CODE` on staging, press Pay once in test mode, and read `meta_purchase_events` plus the `meta_funnel` log lines for `outcome: sent`. If `rejected` with code 100: pass `client_user_agent: request.headers.get("user-agent")` into `sendFunnelEvent` from `/api/track` and `/api/checkout/intent`, store it beside the click ids at the Pay press (`checkout_set_meta_click_ids`) so the settle queue can send it with the Purchase, and have the owner strike or keep the privacy line accordingly. Add a capi.test case that pins the field once decided.

### WR-02 (Medium): `ad_personalization` is granted on Accept, beyond the "measure" wording

**File:** `app/vamos-google.js:195-200`, `.planning/decisions/2026-10-09-ad-tracking-wording.md` §1, §3b

**Issue:** On a Marketing accept the loader sends `consent update {ad_storage, ad_user_data, ad_personalization: 'granted'}`. The adopted banner and privacy texts promise measurement only ("measure visits … so we can see which adverts work"; "stores two cookies that remember which advert click brought you here. After a confirmed booking we send Google one message"). `ad_personalization: granted` is Google's signal for personalised advertising (remarketing lists, audience building); nothing in the adopted wording covers it. A conversion is recorded with `ad_storage` + `ad_user_data` alone.

**Fix:** Either keep `ad_personalization: 'denied'` in the update (one line, plus the `google.test.ts:192` expectation), or have the owner extend §1/§3b to say personalised adverts. Not the agent's call.

### WR-03 (Medium): InitiateCheckout gets a new event id on every `/checkout` load

**File:** `apps/web/app/[locale]/checkout/CheckoutPage.tsx:294-308`, `apps/web/app/api/track/route.ts:71-83`

**Issue:** `trackInitiate` guards with a per-mount `initiateSent` ref and sends `id: crypto.randomUUID()`. A reload, a back-navigation from the pay page, or a second tab sends a second InitiateCheckout with a fresh id; Meta cannot de-duplicate (no shared key, no `order_id` at that step). AddPaymentInfo and Purchase use ids derived from the booking, so only this step inflates. Counts, not money, but it skews the funnel the owner will read.

**Fix:** Derive the id per session: `sessionStorage` key `vamosIcId` set once (`crypto.randomUUID()`), reused for every `/api/track` on that tab; or derive it server-side from the consent subject + UTC day (SHA-256 → UUID shape, like `funnelEventIdFor`). Add a route test that two posts with the same id in 48 h are one Meta event (Meta dedups on `event_id` + `event_name`).

### WR-04 (Medium): Google conversion is browser-only on one page view; no server, Enhanced or offline path (gap, by design)

**File:** `apps/web/lib/checkout/confirmation-conversion.ts:33-49`, `app/vamos-google.js:161-175`

**Issue:** The conversion exists only if the paying customer (a) lands on `/confirmation/[ref]` on the same device, (b) with Marketing accepted under policy `2026-10-09`, (c) with gtag.js not blocked, (d) on the Stripe return or within 60 min of capture. A customer who closes the Stripe tab, whose return lands before settle and who then leaves, who paid through a pay link (pay links get no Google at all, spec E), who refused Marketing, or who runs an ad blocker, produces no conversion. The Meta Purchase has a server path; Google has none. `sendConversion` also writes the once-only localStorage key before calling `gtag` (vamos-google.js:165-168): if gtag.js failed to load on that view, the reference is marked seen and never retried on a later view.

**Fix (gap to accept or close):** Report as a known under-count. If the owner wants parity with Meta: Google Ads API offline conversion upload from the settle queue keyed by `gclid` saved at the Pay press (same decision shape as `metaClickIdsToSave`), which needs a wording change (§3b says the click code comes from the cookies). Small fix regardless: move the `localStorage.setItem` after a successful `gtag('event')` return, or only mark seen when `loaded && typeof window.gtag === 'function'` and gtag.js actually executed (`window.google_tag_data` present).

### WR-05 (Medium): A visitor whose first consent is on `/checkout` has no `_fbp`, so no CAPI event at all (gap, by design)

**File:** `apps/web/lib/meta/pixel-pages.ts:15-27`, `app/vamos-meta.js:56-65`, `apps/web/lib/meta/click-ids.ts:74-80`, `apps/web/lib/meta/capi.ts:76, 99`

**Issue:** The pixel runs only on the allow-listed mock pages; `/checkout` is not on it. `_fbp` is written by `fbevents.js` the first time the pixel runs after Accept. `buildFunnelEvent`/`buildPurchaseEvent` return null when both ids are missing. So a visitor who ignores the banner on home, goes to `/checkout`, and accepts in the React banner there, sends InitiateCheckout, AddPaymentInfo and Purchase nowhere. Same for a deep link straight to `/checkout`. Meta accepts events without `fbp` (lower match quality), so this is a product choice, not a Meta rule.

**Fix:** Accept and document, or allow the events without ids when consent is on (remove the `!fbp && !fbc → null` rule for funnel events; Purchase then needs a claim path for "no ids but consent on"). Either way, add it to the Events Manager proof as a known case.

### WR-06 (Medium): The Content-Security-Policy that reaches the browser on `/checkout` and `/confirmation/<ref>` is only proven in `headers()`, not on the Worker

**File:** `apps/web/next.config.ts:120-136`, `apps/web/middleware.ts:474, 794`, OpenNext `routingHandler.js:99-112`

**Issue:** The middleware stamps the no-Google policy on every Next page response (`applyStagingNoindex` → `applySecurityHeaders`, line 474; `applyPublicCacheHeaders` at 794). The Google rows in `next.config.ts` carry the same header key. Reading the installed `@opennextjs/aws@4.1.0` `routingHandler.js:99-112`: without `dangerous.middlewareHeadersOverrideNextConfigHeaders` the merge is `{...middlewareHeaders, ...nextConfigHeaders}`, so the config row wins and the Google hosts should be present. That is the right outcome, but it rests on an undocumented OpenNext default and on the catch-all `/:path*` row being listed before the Google rows (`getNextConfigHeaders` overwrites by key in list order, matcher.js:78-96). Nothing in CI asserts the served header; the HANDOVER says "Check after the flag is opened". If a future OpenNext version flips the default or someone adds the `dangerous` option, gtag.js is blocked on exactly the two pages that matter and the conversion dies silently (CSP violations do not reach the Worker log).

**Fix:** Add a Worker-build test (tests/e2e-worker, DB-less click-through pattern) that GETs `/checkout` and `/confirmation/VT-26-00001` and asserts one `Content-Security-Policy` header whose `script-src` contains `https://www.googletagmanager.com` and whose `frame-src` contains it; and a negative for `/checkout/pay/x`. Until then: one `curl -sI https://vamostaxi.site/checkout | grep -i content-security` after each deploy that touches headers.

### WR-07 (Medium): Google's remarketing frame hosts are not in the policy while `ad_personalization` is granted

**File:** `apps/web/lib/security/headers.ts:36-48`

**Issue:** Google's CSP guide lists, for Google Ads with remarketing, `frame-src https://td.doubleclick.net https://bid.g.doubleclick.net` and `script-src https://googleads.g.doubleclick.net`. The policy has only `googletagmanager.com` in `frame-src`. With `ad_personalization: granted` (WR-02) gtag.js may try the `td.doubleclick.net/td/rul/…` frame; blocked, it logs a CSP violation and loses the remarketing ping. The conversion itself (`googleads.g.doubleclick.net/pagead/…` img and `www.google.com/ccm/collect` connect) is covered, so no conversion is lost. The region list (`google.ch/de/fr/ae/at/it`) blocks the `1p-user-list` ping for visitors Google routes to another country domain (UK, US, NL…), by design per the comment.

**Fix:** Decide with WR-02. If personalisation stays granted, add `https://td.doubleclick.net` and `https://bid.g.doubleclick.net` to `GOOGLE_FRAME` and `https://googleads.g.doubleclick.net` to `GOOGLE_SCRIPT`, and extend `google.test.ts:442`. If it goes to denied, nothing to add.

## Info

### IN-01 (Low): ViewContent is a beacon raced against `location.assign`

**File:** `app/home/home.dc.html:1969-1971`, `app/vamos-meta.js:234-249`

**Issue:** `track('ViewContent')` is immediately followed by `location.assign(...)`. If the pixel is loaded (usual: it booted on Accept long before the press) the image/beacon request is in flight when the page unloads; browsers usually complete it, not always. If the pixel has not booted yet the event sits in the ≤5 queue and is lost with the page. Acknowledged in the HANDOVER.

**Fix:** Accept. Or delay navigation by `setTimeout(…, 0)` only when `fbq` exists (one tick for the request to start).

### IN-02 (Low): Meta page views are refused when the referrer is any non-Meta page with a path

**File:** `app/vamos-meta.js:153-163`

**Issue:** D5 fail-closed: a referrer like `https://partner-blog.ch/best-zurich-transfers` (any path) refuses the whole page view, so no `_fbp`, so no CAPI for that visitor. Google search sends a bare origin so it passes; Facebook/Instagram pass by host. Design choice, worth knowing when reading Events Manager numbers.

**Fix:** None required. If counts look low, consider allowing any referrer whose host is not `vamostaxi.site` but passing only its origin (the pixel sends `rl` itself; the loader cannot rewrite it) — that needs a product decision.

### IN-03 (Low): The confirmation page's conversion pin test reads source text, not behaviour

**File:** `apps/web/lib/checkout/confirmation-conversion.test.ts:68-80`

**Issue:** The test checks that the TSX contains `.conversion?.(` once and the dependency array literal. It would pass with CR-01 in place and would also pass if the effect were never reached. It gives false confidence.

**Fix:** Replace or complement with the mounted-component test described under CR-01.

### IN-04 (Info): Consent Mode v2 is correct

**File:** `app/vamos-google.js:105-112, 183-205, 245-256`

All four keys (`ad_storage`, `ad_user_data`, `ad_personalization`, `analytics_storage`) default to `denied` in-page before gtag.js is ever requested; the update to granted comes after a server-confirmed Marketing choice; withdraw re-denies and deletes the cookies; `analytics_storage` follows the Analytics choice. No `wait_for_update` is needed because gtag.js only loads after the decision. Mock pages get the loader synchronously from the banner helmet; Next pages get it `afterInteractive`, which still precedes the gtag.js the loader itself injects.

### IN-05 (Info): Privacy rules hold in the code paths read

**File:** `apps/web/lib/meta/capi.ts:41-58`, `app/vamos-meta.js:203-220, 253-259`, `app/vamos-google.js:86-94, 168-173`, `apps/web/app/api/track/route.ts:27-39`

Meta receives event name, time, fixed `event_source_url`, UUID event id, `fbp`/`fbc`, `currency CHF`, `value`, `order_id` = reference. Contact events carry only `whatsapp|phone|email`. The `/api/track` body is whitelisted to `event,id,value_rappen`. Google receives `value`, `currency`, `transaction_id`, the scrubbed `page_location` (path only, `:ref`), bare-origin `page_referrer`. No name, email, phone, route, flight or typed text in any path read. One thing the owner was told in the HANDOVER and should decide: gtag.js's own `ccm/collect` ping still reports the real `/confirmation/VT-…` path (the `:ref` scrub applies to `page_location` only); §3b does not mention a page-path ping.

### IN-06 (Info): Meta event-id dedup

**File:** `app/vamos-meta.js:203-207, 295`, `apps/web/lib/meta/funnel.ts:35-41`, `apps/web/lib/meta/purchase.ts:152-162`

Browser sends only PageView, ViewContent, Lead, Contact (no `eventID`); server sends only InitiateCheckout, AddPaymentInfo, Purchase (UUID `event_id`). No event name is sent from both sides, so there is nothing to de-duplicate and no double counting between pixel and CAPI. AddPaymentInfo is stable per booking (SHA-256 of the booking id); Purchase is claimed once in the database. Correct as designed; only InitiateCheckout (WR-03) lacks a stable key.

## Test coverage gaps

1. No test mounts `ConfirmationClient` with the Google loader absent at mount and loaded later (CR-01).
2. No test posts a real event to Meta's Graph endpoint, even in Test Events mode; `capi.test.ts`/`funnel.test.ts`/`purchase.test.ts` use fake fetch (WR-01). The owner step "set `META_TEST_EVENT_CODE`" is still open.
3. No Worker-level assertion of the served `Content-Security-Policy` on `/checkout` and `/confirmation/<ref>` (WR-06); `google-tag.spec.ts` serves mock HTML at those addresses with a hand-built policy.
4. No test for a reload of `/checkout` producing a second InitiateCheckout id (WR-03).
5. No test for "gtag.js blocked, localStorage key already written, conversion never retried" (WR-04).
6. `headers.test.ts` and `google.test.ts:442-454` pin the host list as written; they do not compare against Google's documented list, so a missing remarketing host (WR-07) is invisible.
7. Visual snapshots of the longer banner and the privacy/cookies pages were not re-baselined (HANDOVER).

## Launch blockers

1. **CR-01** — the Google Ads conversion on the real `/confirmation/[ref]` page does not fire on the normal paid-and-returned path. Fix the hand-off (early queue or ready event), add the mounted test, then prove with one 4242 payment and Tag Assistant on the live Next page.
2. **WR-01** — prove one Meta server event is `sent` (Test Events with `META_TEST_EVENT_CODE`, or the first live Purchase read back from `meta_purchase_events`). If Meta rejects for missing `client_user_agent`, decide the field and the wording before relying on CAPI numbers.
3. **WR-02 / WR-07 together** — one owner decision: `ad_personalization` granted (then extend the wording and the CSP frame hosts) or denied (then nothing else changes).
4. **WR-06** — one `curl -sI` of `/checkout` and `/confirmation/<ref>` after the next deploy to confirm the Google policy is the one served; add the Worker test so it stays true.

Not blockers, but known under-counts the owner should expect: WR-03 (InitiateCheckout inflation on reload), WR-04 (no Google conversion without the return visit), WR-05 (no CAPI without a prior pixel page view), IN-02 (page views refused on path-bearing referrers).

---

_Reviewed: 2026-10-11T15:07:53Z_
_Reviewer: Claude (gsd-code-reviewer, Fable 5.1)_
_Depth: deep_
