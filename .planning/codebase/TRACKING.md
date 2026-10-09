# Ad tracking map (Meta + Google), read 2026-10-09

Focused map for the agency's Meta and Google requests. Read from the code on `main` (`80c173e9`). Nothing was changed. The other six files in this folder are older (Sep 2 / Oct 3) and were not refreshed.

## 1. Two kinds of page

| | Mock pages (`app/pages/*.dc.html`, `app/home/home.dc.html`) | Next pages (`apps/web/app/[locale]/…`) |
|---|---|---|
| Routes | `/`, `/about`, `/faq`, `/contact`, `/terms`, `/privacy`, `/cookies`, `/cancellation`, `/imprint`, `/sign-in`, `/sign-up`, `/account*`, `/bookings`, `/manage-booking`, `/coming-soon`, `/sitemap` (map `DC_PAGES` in `apps/web/middleware.ts`) | `/checkout` (one page; `/checkout/trip`, `/details`, `/payment` only redirect to it), `/checkout/pay/[token]`, `/confirmation/[ref]`, `/review`, dashboard |
| Consent runtime | `app/vamos-consent.js` (`window.VamosConsent`) | React `CookieBanner.tsx`; no `VamosConsent`; fires `vamos:consent-recorded` |
| Meta pixel | Yes: `app/vamos-meta.js`, pulled in by `CookieBanner.dc.html` | **No** |
| CSP | Per address from middleware: `metaPixelCspFor` → `contentSecurityPolicy({ metaPixel: true })` | Static `SECURITY_HEADER_PAIRS`, never names Meta |
| Google | none | none |

The booking funnel (choose class, pay, confirmation) lives entirely on Next pages. Every event the agency wants after "Show fixed prices" happens where no tracker exists.

## 2. What exists for Meta (pixel `1595596972063765`)

- **Gate:** `lib/meta/legal-gate.ts` (`META_LEGAL_GATE_OPEN`, `META_EVENTS_MANAGER_SWITCHES_OFF`, both `true`); mirrored as `GATE_OPEN` / `SWITCHES_OFF` in `app/vamos-meta.js`. A test pins the two together.
- **Loader `app/vamos-meta.js`:** boots only when the server (`GET /api/consent/state`) says marketing is on under the current policy version, the address passes the allow-list and the referrer is clean. Sets `autoConfig false`, `disablePushState`, `init` with the id only, one `PageView`. Withdraw → `fbq('consent','revoke')` and deletes `_fbp`, `_fbc`, `_fbleid` and two local storage keys. **PageView is the only event. There is no `track()` API.**
- **Allow-list** (two twins that must agree through `lib/meta/pixel-pages.cases.ts`): `app/vamos-meta.js` (ES5) and `lib/meta/pixel-pages.ts`. Exact paths only. Query keys allowed: `fbclid` and `utm_*`. `/sign-in` and `/sign-up` take no query at all. Hash: plain anchor. Anything with `@` or `vt-<digit>` in it (decoded up to 5 times) is refused.
- **Referrer rule (`referrerAllowed`):** no referrer, or our own clean page, or an outside site **only when it sent its bare origin** (`/`, no query, no hash). Facebook and Instagram send `https://l.facebook.com/l.php?u=…&h=…`, so **ad traffic from them is dropped today** (case table row "outside referrer with a path and query is skipped (WR-02)").
  - Owner decision 2026-10-09 (D5): referrers from Meta products are to be accepted with their full address, verified by exact whole-label host match, https only, no credentials or port, no `@` or reference inside. Plan: `.planning/quick/261009-ad-tracking/PLAN.md`.
- **CSP:** Meta hosts only on allow-listed addresses (`pixel-csp.ts`, `headers.ts`). `Referrer-Policy: strict-origin` everywhere.
- **Click ids:** at the Pay press `scheduleMetaClickIdSave` (`lib/meta/click-ids.ts`, called from `/api/checkout/intent`) saves `_fbp` / `_fbc` on the unpaid booking only when marketing consent is on right now. RPC `checkout_set_meta_click_ids`.
- **Purchase (server, Phase 29):** Stripe webhook → settle queue (`lib/checkout/settle.ts:567`) → `sendMetaPurchase` (`lib/meta/purchase.ts`) → DB claim `meta_purchase_claim` (once per booking, consent re-checked, ids wiped after) → one Conversions API POST (`lib/meta/capi.ts`, Graph v26.0). Payload: `event_id` (a UUID from the claim row), time, `currency CHF`, `value`, `fbp`/`fbc`, fixed `event_source_url https://vamostaxi.site`. Nothing else.
  - Sends nothing today: Stripe is in test mode and `META_TEST_EVENT_CODE` is not set, so a test payment records `no_test_code`. This is why Meta saw "only PageView".
  - The event has no `client_user_agent` / IP (the owner's text forbids more). Meta usually wants a user agent on website events. Unverified until a real test event is posted.
- **Tests that pin this:** `vamos-meta.test.ts` (502 lines), `legal-gate.test.ts`, `pixel-csp.test.ts`, `pixel-pages.test.ts`, `capi.test.ts`, `purchase.test.ts`, `click-ids*.test.ts`, `owner-texts.test.ts` (the three owner texts byte-equal in mock and in `messages/*.json`), `tests/integration/meta-pixel-28*.spec.ts`, `tests/e2e-worker/meta-*.mjs`, `tests/fixtures/fbevents-stub.js`.

## 3. What exists for Google

Nothing. No `gtag`, no `googletagmanager`, no `AW-368142830`, no `dataLayer`, no Google host in any CSP. `static.cloudflareinsights.com` (Cloudflare Web Analytics, cookieless, after the Analytics tick) is the only analytics.

## 4. Consent model

- Categories: functional, analytics, marketing. Accept all = all three; Necessary only = none. Stored server-side per consent subject cookie; `localStorage.vamosCookieConsent` is a display cache.
- `CONSENT_POLICY_VERSION = "2026-10-01"` (`lib/consent/policy.ts`). Changing it re-asks every visitor; a test pins it; only with the owner's word.
- Legal text is the owner's. The Meta lines are in `.planning/decisions/2026-09-30-meta-wording.md` (banner, cookies row, privacy line, four languages). They name **Meta only**, say Meta measures "visits … and completed bookings", and say "We do not send your name, email, phone number, route, flight or booking reference". `.planning/decisions/2026-10-01-meta-events-manager-switches.md` holds the Events Manager switches (both off).
- Google is named nowhere in banner, cookies page, privacy page or ADR-010 (sub-processors).

## 5. Where each requested event lives in the code

| Agency item | Trigger in the code | Page kind | Tracker there today |
|---|---|---|---|
| Meta ViewContent: click "Show fixed prices" | `showPrices` button in `app/home/home.dc.html`; handler ends in `location.assign(prefix + '/checkout?' + …)` (about line 1969) | mock (allowed) | pixel yes, no event |
| Meta InitiateCheckout: choose vehicle | `choose(slug)` in `checkout/CheckoutPage.tsx:288` (`ClassSection`) | Next `/checkout` | none |
| Meta AddPaymentInfo: payment step | One page, so the Pay press: `CheckoutForm.tsx` ~line 867, `fetch('/api/checkout/intent')` then `location.assign(stripeUrl)` | Next `/checkout` | none |
| Meta Purchase after payment | already server-side (Phase 29, above). Stripe's page is a top-level navigation; return → `/api/checkout/return` → `/confirmation/[ref]` | Next | none in browser |
| Meta Lead: contact form sent | `app/pages/contact.dc.html:434` `fetch('/api/contact')`; Next twin `components/forms/ContactForm.tsx` (dev gallery) | mock `/contact` (allowed) | pixel yes, no event |
| Meta Contact: WhatsApp / phone / email clicks | `wa.me`, `tel:`, `mailto:` links in `ContactButton`, `ContactRow`, `SiteHeader`, `SiteFooter`, `FaqSection`, `AirportMeet`, `contact.dc.html`, legal pages (about 15 mock files) and `components/shell/ContactRow.tsx`, `ConfirmationClient.tsx` | both | pixel only on mock |
| Meta: allow booking, payment, confirmation pages | refused today by owner decision D-02 and by `pixel-pages.ts`; a **reference** (`VT-26-07331`) sits in the confirmation path, a **route** (from/to) in the `/checkout` query, a **token** in `/checkout/pay/<token>` | Next | n/a |
| Meta: allow `service` param | not in the allow-list; `/?service=airport#book` is refused. Nothing in the repo reads `service` yet (no link of that form exists; home ignores it) | mock `/` | n/a |
| Meta: do not block Facebook / Instagram referrers | `referrerAllowed` in `app/vamos-meta.js` (+ case table) | mock | blocks them |
| Google tag on all pages, consent mode | none; needs a loader on both page kinds, CSP for Google hosts | both | none |
| Google consent update on Accept all, and on each load when already accepted | banner Accept (`CookieBanner.dc.html` → `VamosConsent.save`; `CookieBanner.tsx` `acceptAll`) | both | n/a |
| Google conversion, once, on confirmed booking | `ConfirmationClient.tsx` when phase becomes confirmed (`isVoucherStatus`); amount `receipt.chargedRappen` / `priceTotalRappen`; reference is the `ref` prop | Next `/confirmation/[ref]` | none |

## 6. Conflicts the agency's text creates with what is already decided

1. **Owner's privacy text vs the requested events.** It says we send Meta "a page was opened" and, after a paid booking, "the amount paid and the two cookie identifiers", and "not … booking reference". ViewContent, Lead, Contact, InitiateCheckout, AddPaymentInfo are new kinds of message. `eventID:'purchase_'+reference` would put the booking reference into Meta. `CLAUDE.local.md`: use the three texts verbatim, never reword or add. So new events need new owner-adopted lines (decision file, four languages, policy version bump).
2. **The pixel on `/checkout` or `/confirmation` leaks the route and the reference.** Meta's script sends the full page address (`dl`). `/checkout?from=…&to=…` carries the route; `/confirmation/VT-…` the reference. The owner's text says neither is sent. Dedup does not need the reference: the Purchase already has its own UUID `event_id`. There is no browser Purchase to dedup against unless one is added.
3. **Google is not in any legal text.** Banner, cookies page, privacy page and the sub-processor ADR need Google lines in four languages before any Google request is made. The site's stated rule is "everything else is off until you switch it on".
4. **Google "tag on all pages, in head, consent denied by default".** In consent mode the denied tag still calls Google (cookieless pings with page address and user agent). That is not "nothing before consent". Safer variant: write the denied default inline (no network), load `gtag.js` only after the server confirms marketing. Costs Google's modelled conversions for refusers.
5. **Google page address.** The tag sends `page_location` and `page_referrer` automatically. On "all pages" that includes `/checkout/pay/<token>`, `/confirmation/VT-…`, `/sign-in/confirm?token…`, `/reset-password?…`. Must be overridden with a scrubbed path, no query, no hash, and the dashboard and ops hosts must never load it.
6. **`transaction_id = booking reference`** sends the reference to Google. Owner decision 2026-10-09 (D4): the real reference goes to both Google and Meta; the privacy text must be changed to say so.
7. **"Paid or not":** a booking reaches confirmed only after payment today (Stripe, or a pay link), so "paid or not" has no extra case; the unpaid state is a pending row that never reaches the confirmation voucher.
8. **Accept all:** the agency's "Accept all" maps to our categories: `ad_*` follows Marketing, `analytics_storage` follows Analytics. Accept all grants all four, as asked; a visitor who ticks only Marketing is not granted analytics.

## 7. Facts that block a live proof regardless of code

- Stripe is test mode; Meta's Purchase and Google's conversion see no real money until the owner flips live (his word each time).
- `META_TEST_EVENT_CODE` not set (owner secret step). Until it is, test payments send nothing to Meta.
- Google Ads conversion label `liI8CIe79pUdEO7Txa8B` and `AW-368142830` come from the agency; they are public ids, not secrets.
- Pixel and loader host is the literal `vamostaxi.site` (also `PURCHASE_EVENT_SOURCE_URL`); both change at the `.eu` cutover.
- `apps/web/public/app/` is a gitignored copy of `app/`; run `node scripts/sync-dc-mock-to-public.mjs` before any browser test.
