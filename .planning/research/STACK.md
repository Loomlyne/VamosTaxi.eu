# Stack Research

**Domain:** v1.3 Meta measurement — load `fbevents.js` only after Accept, and send one Purchase from the existing Stripe webhook
**Researched:** 2026-09-23
**Confidence:** HIGH on no new package, the official snippet, and Worker `fetch` to Graph. MEDIUM on whether Graph accepts a Purchase whose `user_data` is only `fbp`/`fbc` and whose `event_source_url` is the site origin with no path.

v1.3 only. Do not re-litigate the frozen v1.0 / v1.1 / v1.2 stack. Those files stay in `.planning/research/v1.0-archive/`, `v1.1-archive/`, and `v1.2-archive/`. This milestone does not change quote, pay, or confirmation.

## Recommended Stack

### Core Technologies

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| Official Meta Pixel snippet | Not an npm package. Script `https://connect.facebook.net/en_US/fbevents.js` | One browser event: `PageView`, and only after Accept | Meta's documented base code is that snippet. A wrapper still downloads the same file and cannot refuse to inject it. Pixel id `1595596972063765` is a public constant, not a secret. |
| Conversions API on Graph | **v26.0** (announced 2026-07-29; available until TBD). CAPI versions last at least two years. | One server `Purchase` | `POST https://graph.facebook.com/v26.0/1595596972063765/events`. The using-the-api sample still shows `v25.0`. Pin the current version, not the sample. Do not call an unversioned host. v20.0 is removed on 2026-09-24. |
| Worker `fetch` | `wrangler@4.124.0`, `compatibility_date` `2026-08-20`, flags `nodejs_compat` and `global_fetch_strictly_public` | Outbound POST from the existing Worker | The host is public. No SDK and no `axios`. The token stays in the Worker secret. |
| Existing Stripe settle path | `stripe@22.6.1` | The one Purchase | Send from the consumer the webhook already enqueues, after the existing once-only paid row. Do not add a queue. Do not send from the browser. |
| Existing Supabase | Project `yaumjzvylngfjhtuffqs`. JS client already `postgres@3.4.9` | Consent bit and the cookie join | `consent_log.marketing` already exists. `booking_payments` already has `charged_rappen` and `charged_currency`. It has no `_fbp` / `_fbc` columns. Add those two nullable text columns on that table. Not a new database. |

The Pixel is a JavaScript snippet that loads `fbevents.js` and then calls `fbq('track', 'PageView')`.[1] By default that library also records URLs, domains, and devices, so it must not load before Accept.[1]

Graph v26.0 is the current Marketing API line, and Graph v20.0 is removed on 2026-09-24.[7] Conversions API versions are supported for at least two years, which is why a pinned `v26.0` path is the stack choice rather than an unversioned URL.[3]

### Supporting Libraries

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| None | — | No runtime dependency | Do not `pnpm add` a pixel, SDK, parameter builder, tag manager, or CMP. |
| In-repo loader | n/a (a client module) | Inject the official snippet | Only after Accept, the legal-lines flag, and a customer route with no token. Call `fbq('set', 'autoConfig', false, '1595596972063765')` before `init`. Pass no advanced-matching object. Track `PageView` only. |
| `zod` | **4.4.3** (already in `apps/web`) | Reject a bad CAPI body before POST | Optional. Do not add a Meta schema package. |
| First-party readable flag | n/a | Tell the browser that Accept meant marketing on | The HttpOnly consent-subject cookie is set for both Accept and Dismiss. It cannot be the pixel gate. Set a separate readable cookie only after the server log succeeds. Clear it on Dismiss. |

`apps/web/lib/consent/bind.ts` passes `marketing: false` on every method today. Accept must pass `true` through the existing `record_consent` argument. Dismiss and `settings_change` stay `false`. Do not add a category switch. `apps/web/components/shell/SiteShell.tsx` renders `CookieBanner` only when the path is home (`isHome ? banner : null`) and already skips ops, dashboard, and `/dev`. Extending that existing banner to customer pages is a placement change, not a new component.

Turn automatic configuration off before `init`. Otherwise the Pixel sends button clicks and page metadata, including Open Graph and Schema.org fields.[2] That is how a PageView-only install leaks form fields and route-shaped titles. The official CSP note is to allow JavaScript from `https://connect.facebook.net`, and the same page says the Pixel loads `/en_US/fbevents.js` and `/signals/config/{pixelID}`.[2]

### Development Tools

| Tool | Purpose | Notes |
|------|---------|-------|
| `wrangler secret put META_CAPI_ACCESS_TOKEN` | System-user token | Owner runs it. Staging now, production later. Never `wrangler.jsonc` `vars`, never `NEXT_PUBLIC`, never the repo, never the client. |
| `wrangler secret put META_CAPI_TEST_EVENT_CODE --env staging` | Meta test event code | Staging only. The code rotates. Production must omit the field. |
| Events Manager → Test Events | See the staging Purchase | Owner tool. Not a dependency. |
| Events Manager → automatic advanced matching | Must stay off | Code cannot flip that dashboard switch. `autoConfig: false` is the in-page half. Do not pass email or phone into `fbq('init')`. |
| Pixel id constant | `1595596972063765` | Same id on staging and production. Public. Not a secret. |

## Installation

```bash
# No npm install. Do not add a pixel package, the Business SDK, a parameter
# builder, Zaraz, GTM, or a consent SaaS.

# Already pinned in apps/web/package.json — do not bump for this milestone:
#   next@15.5.25
#   react@19.2.8
#   react-dom@19.2.8
#   stripe@22.6.1
#   zod@4.4.3
#   @opennextjs/cloudflare@1.20.2   (devDependency)
#   wrangler@4.124.0                (devDependency)
#   postgres@3.4.9                  (devDependency, already the DB client)

# Owner, after en/de/fr/ar legal lines exist. Not an agent step.
# wrangler secret put META_CAPI_ACCESS_TOKEN --env staging
# wrangler secret put META_CAPI_TEST_EVENT_CODE --env staging
```

```ts
// Browser — official snippet, after every gate below. No <noscript> image.
// fbq('set', 'autoConfig', false, '1595596972063765')  // before init
// fbq('init', '1595596972063765')                      // no user-data object
// fbq('track', 'PageView')                             // the only browser event

// Server — existing settle consumer, not the webhook HTTP handler:
// POST https://graph.facebook.com/v26.0/1595596972063765/events
//   ?access_token=<META_CAPI_ACCESS_TOKEN>
// data[0]:
//   event_name: "Purchase"
//   event_time: unix seconds of the charge (not older than 7 days)
//   action_source: "website"
//   event_id: the Stripe event id (same id if the queue retries)
//   event_source_url: "https://vamostaxi.site"   // live public origin only, no path. Production wrangler env is not deployed.
//   custom_data: { currency: "CHF", value: charged_rappen / 100 }
//   user_data: { fbp, fbc }                      // omit a key that was not stored
// staging only: test_event_code from the staging secret
// production: do not send test_event_code
```

CSP edit is `apps/web/lib/security/headers.ts`. The live policy allows Stripe, Mapbox, and Turnstile. It does not allow Meta. Add only:

- `script-src`: `https://connect.facebook.net`
- `connect-src`: `https://connect.facebook.net` and `https://www.facebook.com`
- `img-src`: `https://www.facebook.com`

Do not add `graph.facebook.com` to the page policy. The Worker `fetch` is not bound by that header. A browser call to Graph would put the token in the client. Do not wildcard `*.facebook.com` or `*.facebook.net`. Do not add `www.instagram.com` or `gw.conversionsapigateway.com` unless a staging PageView is blocked on that host. The fetched `fbevents.js` (421831 bytes, 2026-09-23) names `https://www.facebook.com/tr/` as its endpoint and names the gateway host only as a script-URL allowlist constant. We will not use the gateway.

Send the Purchase with `POST` to the pixel `/events` edge.[3] `event_time` may be up to 7 days before the send; older than that, Meta rejects the whole request.[3] `event_source_url` is required for website events and must match the verified domain.[6] Send the origin only. A path can carry a pay-link token or a booking reference, and those must not be in the payload. If a test event is rejected for origin-only, stop and ask. Do not send the request path.

`currency` is required on a purchase and must be an ISO 4217 code.[4] The locked charge currency is CHF. `value` is required and must be a monetary amount.[4] Send francs (`charged_rappen / 100`), not rappen. If `charged_rappen` is 0, or `charged_currency` is not `chf`, send nothing. A zero Purchase is both forbidden here and a bad Meta event.

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| Official snippet, injected after the gates | `react-facebook-pixel@1.0.4` | Never on this app. See What NOT to Use. The raw loader is the one that can stay unloaded. |
| Worker `fetch` to Graph `v26.0` | `facebook-nodejs-business-sdk@24.0.1` | Only if we left Workers and needed the SDK's hashing. We send nothing that needs hashing, and the published SDK is still 24.0.1. |
| Two columns on existing `booking_payments` | Stripe Checkout Session `metadata` | Metadata means editing `lib/checkout/stripe.ts`. That file already stores `booking_reference`. This milestone does not change pay. Do not copy `booking_reference` into Meta. |
| Existing `STRIPE_EVENTS` queue | A new Meta queue, or Conversions API Gateway | The webhook handler must stay short. The consumer already retries. Gateway is a separate host. |
| Origin-only `event_source_url` | The full browser URL | Full URL is what Meta's examples show. Use it only if the owner accepts a path with no token and no booking ref. Default is origin-only. |
| `event_id` = Stripe `evt_…` | A random UUID per attempt | A random id makes a queue retry look like a second Purchase. Meta's pixel-vs-server dedup is not our once-only gate. |

Meta recommends the Business SDK because it hashes user parameters for you.[8] The package on npm is still that SDK, described as the Marketing API SDK for Javascript and Node.js.[11] That is a reason not to add it here. The milestone sends no email, phone, or name, so there is nothing to hash. `fbp` and `fbc` must not be hashed. The Pixel itself writes `_fbp` after it loads.[9] Do not mint `_fbp` before Accept.

Advertisers who do not send the same event from both the Pixel and the Conversions API do not need pixel-vs-server dedup for that event.[5] Purchase is server-only, so there is no browser Purchase to dedupe. Still send a stable `event_id` so a queue retry is the same event. The real once-only gate is the existing paid row, not a new Meta table.

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| Cloudflare Zaraz | A tag manager. It loads third-party tools outside the Accept gate and the legal-lines flag. Forbidden for this milestone. | The official snippet, injected by our code after those gates |
| Google Tag Manager | Same problem, plus a new script host and a container that can add `ViewContent` without a code review. | The official snippet |
| `react-facebook-pixel` | Worse than the raw loader. npm version **1.0.4**, last modified **2022-05-14**, described as "Pixel Kit for React". Release `1.0.4` was published **2020-12-09**. The repo is on React **19.2.8**. The package README's sample sets `autoConfig: true` and passes `em: 'some@email.com'` into `init`. It still downloads the same `fbevents.js`. It has no Accept gate, no legal-lines gate, and no route denylist. | Official snippet, `autoConfig` false, no user-data object |
| `facebook-nodejs-business-sdk` | npm **24.0.1**, modified **2025-11-21**. Graph **v26.0** shipped **2026-07-29**. Depends on `axios`. Hashes PII, which we must not send. | Worker `fetch` |
| `capi-param-builder`, `meta-capi-param-builder-clientjs` | Builds `fbp` / `fbc` and also hashes PII and fills IP and referrer. | Read `_fbp` and `_fbc` after Accept. Format `fbc` from `fbclid` only if the cookie is missing, and only after Accept. Do not lowercase `fbclid`. |
| Conversions API Gateway, Stape, Segment, RudderStack, Elevar | A new hosted or paid pipe. Stack is Workers plus the existing webhook. | Worker `fetch` from the settle consumer |
| Cookiebot, OneTrust, Iubenda, a second banner, category toggles | New CMP. Accept and Dismiss stay. No new switches. | Existing `CookieBanner`. Show it on customer pages until a choice. Do not draft the legal lines. |
| `<noscript>` image pixel | The official snippet includes `https://www.facebook.com/tr?...&ev=PageView&noscript=1`. It fires with no JavaScript gate. | Omit it. `img-src` still allows `www.facebook.com` because the script beacons there. |
| `fbq('track', 'Purchase')` and every other standard or custom event | Browser Purchase double-counts on refresh. Middle events are out. | Browser `PageView` only. One server Purchase. |
| Browser `fetch` to `graph.facebook.com` | The token would ship to the client. Page CSP is not the fix. | Server settle path |
| Hashed email, phone, name, `external_id`, `order_id`, `content_ids`, route, flight, booking ref, client IP, user agent | Lock: match the click with `_fbp` and `_fbc` only. `order_id` is a booking reference. IP and user agent raise match quality and are not in that noun list, but the lock still says those two cookies only. If Graph rejects the event, stop and ask. Do not add them to raise the score. | `user_data.fbp` and `user_data.fbc` only |
| `data_processing_options: ["LDU"]` with an invented country | LDU is the US limited-data flag. Accept is the consent gate. | Omit the field |
| A new database vendor, or a `meta_events` SaaS | Once-only is the existing payment row. | Existing Supabase. Two nullable columns at most. |
| Unversioned `graph.facebook.com` | Versions get removed. v20.0 goes on 2026-09-24. | `v26.0` |
| Loading before the owner lines exist | TBC copy is not a licence to load `fbevents.js`. Do not draft en/de/fr/ar banner, cookies, or privacy lines. | A code flag that stays false until those strings are in |
| `fbq('consent', 'revoke')` while the script is loaded | The file is already on the page. Dismiss must mean the script never loads, and a later Dismiss must stop future events. | Do not inject. If it was injected, remove it and do not track. |
| Wildcard CSP, or adding `graph.facebook.com` "because CAPI" | Wider than the script host, and it does not make the server call work. | The three directives above |

`react-facebook-pixel` is the package people reach for, and it is the wrong one here.[10] Its README sample turns `autoConfig` on and puts an email in `init`.[12] That is the opposite of PageView-only and the opposite of "no hashed email". The raw snippet is shorter, matches the current docs, and can be kept out of the document until the gates pass.[1][2]

The test event code is for testing, and production payloads must omit it.[3] Events sent with that code are not dropped. They still enter Events Manager and can be used for targeting.[3] Staging must send the code, on the locked pixel id. Do not add a second pixel to dodge that. Production must not set the secret.

## Stack Patterns by Variant

**If the owner has not supplied banner, cookies, and privacy lines in en, de, fr, and ar:**

- Do not load `fbevents.js`, even after Accept
- Do not send Purchase
- Do not draft the lines to unblock the flag

**If there is no choice yet, or the choice was Dismiss:**

- Do not load the script
- A later Dismiss stops future events
- Accepting after a charge does not backfill a Purchase

**If Accept was logged, the legal-lines flag is on, and the route is a customer page with no token:**

- Load the snippet once
- `PageView` only, including a later client navigation
- Never on ops, a pay link, or manage-booking

**If the Worker is staging:**

- Send `test_event_code`
- Same pixel id

**If the Worker is production:**

- Omit `test_event_code`

**If `charged_rappen` is 0 or the charged currency is not `chf`:**

- Send nothing

**If neither `_fbp` nor `_fbc` was stored before the charge:**

- Send nothing
- Do not read a cookie that appeared only after a later Accept

**If the queue retries the same Stripe event:**

- Send the same `event_id`
- Do not send a second Purchase if the paid row already settled

## Version Compatibility

| Package A | Compatible With | Notes |
|-----------|-----------------|-------|
| `next@15.5.25` / `react@19.2.8` / `react-dom@19.2.8` | Official snippet via `document.createElement('script')` | No pixel package. `next/script` is already inside Next. Do not use `strategy="beforeInteractive"`. A conditional `next/script` is still easier to mount too early than a loader that returns null. |
| `wrangler@4.124.0` + `global_fetch_strictly_public` | `https://graph.facebook.com/v26.0/{pixel}/events` | Public host. No SDK. |
| `facebook-nodejs-business-sdk@24.0.1` | Marketing API through the 24.0 line, plus `axios@^1.4.0` | Not compatible with a v26.0 pin, and not added. npm modified 2025-11-21. |
| `react-facebook-pixel@1.0.4` | The README was written against React 16-era samples | Not added. App is React 19.2.8. |
| `stripe@22.6.1` | Existing `constructEventAsync` + `STRIPE_EVENTS` queue | Do not bump. Do not read `booking_reference` out of session metadata into the Meta body. |
| Graph `v26.0` | CAPI support floor of two years from release. Changelog says available until TBD. | Re-pin when that TBD becomes a date. Do not ship v20.0. |
| Live CSP in `headers.ts` | Must gain `connect.facebook.net` and `www.facebook.com` before a PageView can leave the browser | `graph.facebook.com` is a server host. Adding it to CSP does not enable CAPI. |
| `consent_log.marketing` / `record_consent` | Already the four booleans (`necessary`, `functional`, `analytics`, `marketing`) | Flip the existing marketing argument on Accept. No new column for the bit. New columns are only `_fbp` and `_fbc` on `booking_payments`. |

## Sources

[1] https://developers.facebook.com/docs/meta-pixel/get-started
[2] https://developers.facebook.com/docs/facebook-pixel/advanced
[3] https://developers.facebook.com/docs/marketing-api/conversions-api/using-the-api
[4] https://developers.facebook.com/docs/marketing-api/conversions-api/parameters/custom-data
[5] https://developers.facebook.com/docs/marketing-api/conversions-api/deduplicate-pixel-and-server-events
[6] https://developers.facebook.com/docs/marketing-api/conversions-api/parameters/server-event
[7] https://developers.facebook.com/blog/post/2026/07/29/introducing-graph-api-v26-and-marketing-api-v26
[8] https://developers.facebook.com/docs/marketing-api/conversions-api/best-practices
[9] https://developers.facebook.com/docs/marketing-api/conversions-api/parameters/fbp-and-fbc
[10] https://www.npmjs.com/package/react-facebook-pixel
[11] https://www.npmjs.com/package/facebook-nodejs-business-sdk
[12] https://github.com/zsajjad/react-facebook-pixel/blob/master/README.md
