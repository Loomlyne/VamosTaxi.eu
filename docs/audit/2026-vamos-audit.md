# Vamos Taxi — audit, 2026-09-27

Read-only. HEAD `f0238bd` (branch `claude/vamos-taxi-audit-nv3crt`). Live hosts: `vamostaxi.site`, `dashboard.vamostaxi.site`. Supabase `yaumjzvylngfjhtuffqs` read with SELECT, advisors and schema only. No commit, deploy, migration, Stripe or email action was taken.

Evidence files in this folder:
- `screenshots/`: 100 full-page JPEGs, captured with GET requests only.
- `ui.config.vamos.json`: draft config.
- `notes/`: raw notes for design, connections, security and UI System, plus the hard-coded value counts.

Tags: **C** Critical · **H** High · **M** Medium · **L** Low. **[Unverified]** means I read it statically or could not confirm it.

---

## 0. Facts that change the brief

| Brief said | Verified | Evidence |
|---|---|---|
| Live rate_version id is 5 | **Live is 18.** Version 5 is `retired`; 12 bookings were sold under it. Version 18 has 3 distance_rates, 0 distance_bands, 6 fixed_routes, 1 surcharge and 0 region_premiums. Version 19 is a draft. | `rate_versions`, read on the live DB |
| Vehicles: V-Class and S-Class only | **Active classes are `saden` "Saden" (typo), `mercedes-benz-v-class` named "Van", and `van-luxury` "Van luxury".** There is no S-Class. Inactive: economy, business, first, van, and a test class `mahaha`. The mocks and i18n still sell Economy/Business/First/Van. | `vehicle_classes`, live; notes/design-audit.md §5 |
| Emails / tickets go to `#support` | No Slack or `#support` channel exists in the code. Tickets are Resend inbound email into `support_messages`. | `app/api/webhooks/resend/route.ts:94-120` |
| Driver side | None. Chauffeurs only receive assign/unassign emails. | `lib/ops/assign.ts:219-225` |
| Mobile app / PWA | None. | none in repo |
| "Real paid bookings" | **Every payment is Stripe test mode.** All `booking_payments` rows are `cs_test_…`. The connected account is "Vamostaxi.site sandbox" (`acct_1UIZmq…`, livemode false). No live money has moved. | live DB + Stripe read |
| Stripe sandbox matches the DB | **It does not.** The sandbox's 4 Checkout Sessions (Sept 22–24) exist in the DB but have **no `stripe_events` rows**. The DB's 46 events and its 4 "succeeded" sessions do **not exist** in this sandbox ("No such checkout.session"). | Stripe `GET /v1/checkout/sessions`, live DB |

CLAUDE.md still lists Economy/Business/Van as the product names. You need to decide which rule wins (plan step 2.1).

---

## 1. System map

### Surfaces

The public site, booking flow and dashboard are all served by Cloudflare Worker **`vamos`**, which is the `env.staging` block in `apps/web/wrangler.jsonc`. The dashboard host goes through the gateway Worker `vamos-dashboard` (`wrangler.dashboard.jsonc`) into the `Dashboard` entrypoint of `vamos` (`worker.ts:57-61`). `env.production` (`vamos-web-production`) is not deployed and still holds placeholders.

| Surface | Routes | Rendering | Touches |
|---|---|---|---|
| Public marketing and legal | `/ /about /faq /contact /terms /privacy /cookies /cancellation /imprint /coming-soon /sitemap` | **.dc.html mocks** rewritten by `middleware.ts:30-49`. The React pages under `app/[locale]/*` exist but are shadowed. | `content_strings`, `reviews`, `service_zones`, `/api/contact` → `contact_submissions` + `contact_delivery_outbox`, `/api/consent` → `consent_log` |
| Booking funnel | `/checkout{,/trip,/details,/payment,/pay/[token]}`, `/confirmation[/ref]`, `/review` | **React** (Next 15) | `/api/quote` (Mapbox via `GEO_CACHE` KV, Turnstile, `QUOTE_RATE_LIMITER*`), `/api/checkout/*` → `checkout_*` RPCs, `bookings`, `booking_legs`, `price_snapshots(+_legs)`, `booking_payments`, `booking_access_tokens`. Stripe Checkout Session (`ui_mode: elements`, CHF). |
| Customer account | `/sign-in /sign-up /reset-password /account/* /bookings /booking-detail` | DC mocks | Supabase Auth, `/api/account/*` (RLS `asCustomer`), `customers` |
| Manage booking (guest) | `/manage-booking?token=` | DC mock | `/api/manage/*` → `manage_booking_*` RPCs with a hashed token |
| Ops dashboard | `dashboard.vamostaxi.site/login`, `/dashboard`… | **DC mock** `app/ops/ops.dc.html` (20 files, ~11.9k lines) via `serveOpsDc` (`middleware.ts:131-158`) | `/api/staff/*` and server actions, polling every 3 s (`app/vamos-ops-data.js:108-133`) |
| Emails | Confirmation, lifecycle (cancel, refund, reminder_24h, assignment, time/flight change, review request), pay-link, auth hook, digest, contact | Resend (`packages/emails`) plus the CF `send_email` binding for auth and contact | `booking_notifications`, `staff_daily_digests`, queue `vamos-stripe-events-staging` |
| Support tickets | Ops Support screen | DC | `support_messages`, `support_message_files` (R2 `SUPPORT_FILES`), `support_inbound_events` |
| Cron | hourly: expire-unpaid, reminder_24h, health, 06:00 Zurich digest · 03:00: notification sweep | `worker.ts:86-133` | service role (`lib/supabase/service.ts`) |

No Supabase Edge Functions exist (live check).

### Data flow

```
Browser (DC home widget / React checkout)
  │ POST /api/quote  ── Turnstile + CF ratelimit 8/60 · 4/60 ── Mapbox (KV cache)
  ▼
lib/pricing/priceQuote.ts  (rate book = quote_rate_book(): status='live' ORDER BY id DESC LIMIT 1 → v18)
  per leg: start (base or airport_start) + per_km × km + class distance bands
         + ONE fixed_routes pair extra (canton beats city)  + surcharges (incl. % of fare)
         + extras + return_trip line − coupon          (integer rappen, half-up per line)
  → HMAC-signed quote lock (lib/quote/lock.ts)
  ▼
POST /api/checkout/intent  → verify lock → + catalog extras → + VAT 8.1 % on top (lib/checkout/vat.ts)
  → checkout_create_booking RPC (bookings, legs, price_snapshots, booking_payments, manage token)
  → Stripe Checkout Session: amount from server, currency CHF hard-set (lib/checkout/stripe.ts:113-121)
  ▼
Stripe ── webhook ─► /api/stripe/webhook (constructEventAsync on raw body) → stripe_events (dedupe)
                        → Queue STRIPE_EVENTS → worker.ts consumer → settle.ts
                        → checkout_payment_settle: pending → paid → confirmed   (DLQ after 8 retries, nothing consumes the DLQ)
  ▼
booking_notifications → Resend confirmation → customer + info@vamostaxi.site copy
  ▼
Ops dashboard: GET /api/staff/bookings polled every 3 s (no Realtime)
Tickets: Resend inbound email.received → support_messages → Ops Support (refetch on focus); staff replies bcc info@
```

**Formula check:** The code matches the business formula (start + per-km × distance + one city/canton pair extra + extras − coupon), plus four additions: distance bands, percent surcharges, a return-trip line, and **VAT added on top** at checkout. `min_fare` is not applied as a floor. There is no SQL pricing function; the price is computed only in TypeScript. (notes/connections-audit.md §2)

---

## 2. Design findings

### Current system (inventory)
- **Where tokens live:** `design-system/tokens/*.css`, with `laws.css` imported last. They are copied byte-for-byte to `apps/web/public/brand/tokens/`; only the font URL paths differ. The Next app adds `arabic.css` (Noto Sans Arabic).
- **Emails** use hex constants in `packages/emails/src/chrome.ts:4-10`. They match the tokens.
- There is no Tailwind anywhere. `design-system/readme.md:33` still says "Tailwind · shadcn/ui · Vercel".
- **Colour:** yellow `#FDC20B`, charcoal `#1E1F1F` and grey `#DEDEDE`, plus scales and semantic oklch tokens. **Type:** Qurova for display and Poppins for body. **Space:** a 4px scale from 0 to 128. **Radius:** 4/8/12/16/24/pill. **Controls:** 36/44/54. **Shadows:** neutral xs–xl. **Motion:** 80–480 ms. **Icons:** 57 vendored Lucide icons via `Icon`. **Logo:** 9 SVGs.
- **Hard-coded values** (colour, radius, font-size, shadow, font-family) by surface:

  | Surface | Files | Hard-coded values |
  |---|---|---|
  | apps/web | 210 | 173 |
  | DC public mocks | 41 | 645 |
  | DC ops | 22 | 127 |
  | Emails | 27 | 88 |

  Top files: `app/home/home.dc.html` (75), the two `WhenPicker.dc.html` copies (54 each), the two `SiteFooter.dc.html` copies (52 each). Full table: `notes/counts.md`.

### Findings

| # | Sev | Finding | Evidence |
|---|---|---|---|
| D1 | **C** | **The site is split across two front-end stacks.** Every public page except checkout, confirmation and review is still a runtime-Babel .dc.html mock. The React versions exist but never reach users. A customer goes from DC home to React checkout and back to DC account, with two headers, two footers, two cookie banners and two i18n runtimes. | `middleware.ts:30-49, 572-579`; `app/[locale]/{about,faq,…}/page.tsx` shadowed |
| D2 | **C** | **The vehicle line-up contradicts your rule and looks unfinished.** The live classes are "Saden", "Van" and "Van luxury". Home cards show `CHF 000`. The mocks sell Economy/Business/First/Van and "S-Class or similar". | live `vehicle_classes`; `home.dc.html:1130,1190,1249`; screenshots `pub-home-*` |
| D3 | **C** | **Placeholder review copy is live on home.** Examples: "One verbatim sentence from a real review sits here…", "First L.", "German reviews land here too…". It also appears untranslated in de/fr/ar. | screenshots `pub-home-*`; seed `reviews` |
| D4 | **H** | **Primary button label disappears on press.** `--vt-accent-press` aliases yellow-600, which `laws.css` maps to charcoal, so a pressed primary button shows charcoal text on a charcoal fill. | `colors.css:80`, `laws.css:46`, `components/core/Button.css:16`, `app/ops/ops.dc.html:39` |
| D5 | **H** | **Duplicate component implementations.** SiteHeader exists 3× (DC ×2 plus React), SiteFooter 3× and already drifted (`#faq` vs `/#faq`, line 118), CookieBanner 3×, AuthForm 3× (the DC copies differ by 279 lines), WhenPicker 3×, BrandSelect 4×, plus every home section, and `support.js` 3×. | notes/design-audit.md §3 |
| D6 | **H** | **The ops console is 100% DC mock.** There is no React page, and no lint, type or test coverage on the UI. Stylelint (logical properties, tinted-yellow ban) only covers `apps/web` CSS, not a single served DC file. | `middleware.ts:131-158`; `apps/web/.stylelintrc` |
| D7 | **H** | **Tap targets below 44px at 390.** Booking tabs are 38px, the Pickup/Destination/Flight inputs 42px (spec 54), steppers 32×32, footer social icons 26×26, the "Forgot password?" link 21px, sign-in tabs 40px, and header pills 36px at every width. In React: Dialog close 32px, Input reveal 32px, OpsSettings eye 32px. | `notes/live-checks.json` (scratchpad); `forms/Input.css:37`, `IconButton.css:6` |
| D8 | **H** | **Muted text contrast fails site-wide.** `rgb(118,120,119)` measures 4.45:1 on white and 4.11:1 on `#F6F6F6` (hints, kickers, legal TOC, FAQ numbers). The home "One way" tab is white on `#ECECEC`, 1.18:1. | live checks, 1440 and 390 |
| D9 | **H** | **Photography provenance.** The design system readme says one supplied photo; `assets/photography` has 21. `why-driver-door.jpg` (a person) and `class-economy.jpg` (an E-Class with a blank plate) look stock or AI-generated [Unverified]. Home has 68 empty `alt` attributes, including content photos. | `design-system/readme.md:457,560`; commits d504ae4, b758724, 8b409c7, 92d6af1 |
| D10 | **M** | **Missing or incomplete translations in the live DOM.** de/fr/ar: "Average of 5 published reviews", footer "Explore", aria-labels "Select" and "Vamos Taxi on YouTube / TikTok". French contact page: "Contact", "Call, message, or email the team directly." German sign-in: "Show password" and the image alt. Arabic ops sign-in: "Show password". The i18n gate script covers only Next messages, not the DC dictionary that serves the site. | screenshots `*-de|fr|ar-*`; `scripts/check-i18n-coverage.mjs` |
| D11 | **M** | **CSP blocks the Arabic font.** Noto Sans Arabic is blocked, so Arabic falls back to a system font. Cloudflare Insights is also blocked (112 console errors). | live console, `lib/security/headers.ts:17` |
| D12 | **M** | **Broken asset requests on home.** `GET /app/home/{{ v.image }}` returns 404 (19×), plus 47 `ERR_INVALID_URL` errors, and `cubes-grid.js` returns 404. | live network log |
| D13 | **M** | **Most pages have an empty `<title>`:** home, about, legal, sign-in and ops login. | live DOM |
| D14 | **M** | **Tinted yellow at source.** It is neutralised at runtime by the laws.css aliases, but it breaks the per-file law: `OpsBoard.dc.html:36` (yellow-100/700), `home.dc.html:406,527,589,633,2671`, `CookieBanner.dc.html:48,55`, the legal pages (imprint, cookies, terms, cancellation, faq), `ServiceCard.dc.html:77` (#A67B05 option). | notes §4 |
| D15 | **M** | **Off-scale tokens.** Radii 10px (26 uses), 20px (9) and 9/6/5/2px. Font sizes 12px (48), 10px (23), 9px, and fractional px. Text below the 13px floor at `home.dc.html:209,222,728,772`, `BookingRow.dc.html:47,52,66`, `ops.dc.html:89`. | notes/counts.md |
| D16 | **M** | **Missing component states.** Button has no loading state (`Button.tsx:10`). PlaceCombo has no loading, empty or error state (`PlaceCombo.tsx:94-109`). TimePicker and WhenPicker have no error or disabled state. Toast has only 3 tones. | notes §5 |
| D17 | **M** | **Routing oddities.** `/checkout` with no trip renders the whole home page at the checkout URL. Signed-out `/account` shows sign-in in place instead of redirecting. `/coming-soon` is public. There are no language URLs: `/de` etc. 308 to the unprefixed path, and language lives only in `localStorage`, which hurts hreflang/SEO. | live curl + screenshots |
| D18 | **M** | **Hand-drawn SVG icons instead of `Icon`:** `Reviews.dc.html:143,161`, `HowItWorks.dc.html:1142,1148`. A `→` glyph is used as an icon in `WhenPicker.dc.html:62`. | notes §4 |
| D19 | **L** | Physical `left`/`right` on text: `CookieBanner.dc.html:65` (the banner does not mirror in RTL). 17 of 22 ops DC files lack the per-file `--vt-shadow-accent:none` and `.vt-input--focus` lines. Hard-coded `CHF` in `PayClient.tsx:259`. Swiss German "groß" in `i18n/messages/de.json:1901`. | notes §4 |
| D20 | **L** | The cookie banner covers the booking widget on first paint at every width. | screenshots |

**Checked and OK:** no horizontal overflow at 390/768/1440 on any page; no glow rendered; no emoji; every password field has an inline-end show/hide eye (sign-in, sign-up, reset ×2, ops login, ops settings ×2, checkout create-account), though the ops settings eye is 32px; tables scroll inside wrappers; checkout collapses correctly at 900 and 640; no dark mode exists (the dark-scheme screenshot is identical).

### Avatars and motion
- **People imagery:** no stock or fake faces from avatar services (no pravatar, randomuser, gravatar or ui-avatars). Initials avatars appear in reviews, the header account button, ops fleet (chauffeurs), profile and tickets. The only people photos are the chauffeur in `why-driver-door.jpg` and the one in the svc-airport photo (D9).
- **DiceBear:** fits in ops only (staff, chauffeurs and customers without a photo). Not on public review cards, where a generated face would look fabricated, and not on chauffeur photos a customer needs to recognise.
- **Animation today:** Lenis only as a dependency (1.3.26 in Next, 1.3.23 vendored in DC; the versions differ). Plus hand-rolled CSS: about 108 `@keyframes`, about 370 transitions, WAAPI and rAF calls.
- **anime.js:** not installed. Your target, "anime.js only", conflicts with the CLAUDE.md rule "Lenis everywhere". Recommendation: anime.js replaces the CSS entrance animations only, and Lenis stays for scrolling. You decide (plan step 2.1).
- **CountUp:** conflicts with `CHF 000` and the no-invented-numbers rule. Use it only on real ops KPIs.

### Design system verdict: current system vs UI System

The UI System repo (`@ui-system/core` and `@ui-system/react`) is at v0.1.0 with one commit and no tests. The packages are workspace-only, not published to npm, and the whole bundle is marked `'use client'`. By default it breaks three Vamos laws:

1. **No glow:** focused inputs get a 4px ring at 35% yellow.
2. **No tinted yellow:** `accent-soft` is cream, `accent-text` renders brown, and `warning` is derived from yellow.
3. **Arabic RTL:** it has about 42 physical `left`/`right` rules and no i18n; labels are hard-coded English.

It also loads fonts from Google Fonts (Qurova isn't there), draws its own icons instead of Lucide, and its Reveal animations run 620–950 ms with scale and blur (Vamos allows 80–480 ms). Full component map: `notes/uisystem-compare.md`.

| Surface | Verdict | Effort | Risk to live bookings |
|---|---|---|---|
| Public website | **Keep** the Vamos kit. The real work is finishing the DC → React cut-over (D1). | 0 d for UI System. The cut-over is separate (plan phase 3). | None from UI System |
| Booking flow (checkout, confirmation, manage) | **Keep. Do not touch.** | 0 d | **High** if migrated: Stripe Elements layout, 54px targets, RTL |
| Customer account | Keep | 0 d | Low |
| Ops dashboard | **Migrate components, but only once ops is ported to React.** UI System AppShell, Table and Drawer could be used through a `--uis-*` → `--vt-*` mapping plus patches for focus, tints and RTL. Tokens-only migration buys nothing, because Vamos already has tokens. | React port ≈ 18–25 d either way. UI System adds ≈ 3–4 d of patches and saves ≈ 2–3 d, so net 0 to +2 d. | Low for booking, medium for ops |
| Emails | Keep (inline hex; SVG avatars render badly in Gmail/Outlook) | 0 d | None |

`ui.config.vamos.json` is filled only from existing tokens; each value is sourced in notes §6. `success`, `danger` and `info` are exact hex conversions of the oklch tokens, not new colours. Still null and needing your input: roundness, chip radius, type preset, mono font, and shadow depth. The config format has no slot for the Arabic font, the reversed logo, the 54px CTA height, or the border-only focus model.

### Mobbin references (web): where Vamos falls short
1. [Klook – airport transfer search](https://mobbin.com/screens/3ac05a68-0612-4f3b-bd07-33be139115ce): pick-up/drop-off radio plus a single-row form over a photo, with priced popular routes underneath. Vamos has no priced popular-route cards, because its fixed routes are hidden.
2. [Expedia – airport transportation](https://mobbin.com/screens/60c31ce8-7a49-4392-9a86-ec8e26113ade): the flight arrival date and time drive the pickup, and a round-trip checkbox is inline. Vamos's flight field is 42px and the steppers 32px.
3. [Expedia – transfer class cards](https://mobbin.com/screens/0c6b344d-3481-47b8-835d-b40bbae5ed85): photo, capacity icons, free-cancellation line and a real price. Vamos shows `CHF 000` and "Saden".
4. [Uber – choose a ride](https://mobbin.com/screens/f02004cb-1480-435c-a94a-0e4d1c98092f): the selected class has a strong outline, with the route map and a sticky CTA beside it. Vamos renders no map (geocoding only).
5. [Uber – home booking](https://mobbin.com/screens/49b09b66-6c27-449a-839f-cd9c99eaaa8f): pickup and dropoff joined by one route line, with date and time as two chips. Compare the Vamos stacked widget with its 38px tabs.
6. [KAYAK – checkout with summary rail](https://mobbin.com/screens/27e92235-5e13-4a84-92a6-0dd3253d94e9): a free-cancellation reassurance block next to the details. Vamos has the rail, but the cancel window is still a TBC token.
7. [Kiwi.com – flight details form](https://mobbin.com/screens/c7cdbea8-ee70-43c3-8f2b-9f084b0cf589): airline code and flight number with hint text. That is a good model for Vamos's flight field errors.
8. [TravelPerk – trip summary](https://mobbin.com/screens/2deaaf89-a1b1-4799-8c22-1b03cc1a8725): itemised price breakdown per line. Compare the Vamos PriceSummary, where VAT is added on top.

There is no app, so Appllama doesn't apply.

---

## 3. Connections findings

| # | Sev | Finding | Evidence |
|---|---|---|---|
| X0 | **C** | **Stripe payments are not reaching the database, and one was lost (sandbox).** The sandbox has one webhook endpoint `we_1UIpns…` → `https://vamostaxi.site/api/stripe/webhook`, enabled, for the 4 `checkout.session.*` / `payment_intent.canceled` events. Yet none of the sandbox's sessions has a `stripe_events` row. Session `cs_test_a1lyA5…` is **paid, CHF 77.80** (`pi_3UJC18…`, `status: succeeded`, created 2026-09-24). The DB still has its payment at `requires_payment` and the booking at `cancelled`, and Stripe shows **0 refunds**. **Cause (strong inference):** two Stripe accounts point at the same Worker.

- Every object ID in the Vamos sandbox `acct_1UIZmqHcNp9GZYjz` carries `HcNp9GZYjz`.
- All 46 events in the DB (09-07 → 09-24 22:42) carry `AJS2YBf21S`, so they come from a **second, older account** that still delivers to `vamostaxi.site/api/stripe/webhook`.
- The Worker creates sessions with the **Vamos sandbox** secret key, but its `STRIPE_WEBHOOK_SECRET` is the **old account's**. Every Vamos-sandbox delivery therefore fails the signature check.
- The Vamos endpoint was created 2026-09-23 13:01 and edited 2026-09-25 16:36.

**What the charge shows:** `ch_3UJC18…` is Apple Pay (Mastercard ending 6201), approved and captured on 2026-09-24, "Payment complete". Owner recollection: the Apple Pay flow appeared not to go through.

The Worker secret value was not read. Before live keys, this would mean customers charged and bookings cancelled. | Stripe sandbox reads; live DB; `app/api/stripe/webhook/route.ts:26-29` |
| X0b | **H** | **Staff refunds for Checkout bookings will fail.** At session creation `payment_intent` is null (`ui_mode: elements`), so `checkoutPaymentIntentId()` falls back to the **session id**, and `booking_payments.stripe_payment_intent_id` stores `cs_test_…`, as all 4 succeeded rows show. `refund.ts:113` passes that value to Stripe as `payment_intent`. The refund is refused, and nothing updates the column at settlement [code-verified, not executed]. | `lib/checkout/stripe.ts:169-174`; `lib/ops/refund.ts:93-117`; live `booking_payments` |
| X1 | **C** | **Paid bookings cancelled with no refund on record.** 3 bookings have `booking_payments.status=succeeded`, `bookings.status=cancelled`, `is_test=false` (created 2026-09-09) and **0 `booking_refunds` rows**. Separately, when a session completes after the booking was cancelled or expired, the capture gate acks the event and does nothing. The session uses automatic capture, so **Stripe keeps the money with no refund issued**. Nothing listens for `charge.refunded` or disputes, so a refund made in the Stripe dashboard never reaches the DB. Whether Stripe shows these 3 as refunded is [Unverified]. | live DB; `lib/checkout/settle.ts:46-53,163-179` |
| X2 | **H** | **One paid checkout is stuck in the dead-letter queue.** A `checkout.session.completed` event from 2026-09-23 has `processed_at` null after 9 attempts, which is past `max_retries` 8. It sits in the DLQ, and nothing consumes or alerts on the DLQ. That booking may be paid without being confirmed. [Unverified which booking] | live `stripe_events`; `wrangler.jsonc:55-63` |
| X3 | **H** | **Coupon usage caps are not enforced on web bookings.** Checkout always passes `couponId: null`, so `coupon_redemptions` is never written (0 rows live). `evaluate_coupon` is called with a null customer and email. Max-uses and per-customer caps therefore never trip, and ops redemption counts miss web usage. | `lib/checkout/intent.ts:352`, `lib/quote/engine.ts:208` |
| X4 | **H** | **The launch flag is bypassed at checkout.** `pricing_live` is hard-coded `true` in the intent and pay-link routes. If the rate book fails to load, the live-version check is skipped (fail-open). Checkout "reprice" echoes the lock's own totals instead of recomputing them. | `app/api/checkout/intent/route.ts:112-135`; `pay-link/route.ts:133-142` |
| X5 | **M** | **No Realtime.** The `supabase_realtime` publication has no tables. Ops polls every 3 s while the tab is visible; tickets refresh only on focus. New bookings do appear without a manual refresh, but by polling. | live `pg_publication_tables`; `app/vamos-ops-data.js:108-133` |
| X6 | **M** | **Emails.** There is no Gmail copy anywhere. The confirmation goes to the customer plus an `info@vamostaxi.site` copy that contains the **live manage-link token**. Lifecycle copies go to `bookings@`, not `info@`, which contradicts the rule in `packages/emails/src/lib/send.ts:112-116`. Copy outcomes are not logged. A missing `RESEND_API_KEY` returns silently with no row. The Resend webhook ignores bounces and complaints. The sweep retries only confirmations. | `lib/checkout/notify.ts:46-47,128-135`; `lib/lifecycle/notify-lifecycle.ts`; `api/webhooks/resend/route.ts:107` |
| X7 | **M** | **Refunds only hit the first charge.** The refund sums all captured payments but refunds against the first PaymentIntent only, so a booking with a second (edit) payment is under-refunded. | `lib/ops/refund.ts:93-117` |
| X8 | **M** | **No single source of truth for types.** `database.types.ts` is generated and CI-checked but imported by nothing in `apps/web`. The ticket status list exists 4×. Vehicle, chauffeur and rate-version statuses are typed by hand. Booking status groupings are in 5 places. The booking reference regex is 4–5 digits in one place and 4 in another. Class slugs are hard-coded (`notify.ts:118` defaults to "business"). | notes/connections-audit.md §8 |
| X9 | **M** | **Unpaid-cancel and cron expiry leave Stripe sessions open.** They cancel the DB row but never expire the Stripe session, so a customer can still pay a cancelled booking, which then falls into X1. | `api/account/bookings/cancel/route.ts:32-43`; `lib/checkout/expire-unpaid.ts:10-21` |
| X10 | **M** | **Env drift.** `CONTACT_EMAIL_FROM`, `CONTACT_SUPPORT_RECIPIENT` and `CONTACT_TURNSTILE_ALLOWED_HOSTNAMES` are not in `env.d.ts`. `SEND_EMAIL_HOOK_SECRET`, `VAMOS_QS_SECRET`, `RESEND_WEBHOOK_SECRET`, `HEALTH_PROBE_SECRET` and `TURNSTILE_SECRET_KEY` (vs `TURNSTILE_SECRET`) are missing from the secrets matrix. `SENTRY_DSN` is documented but has no code. `env.production` has `pk_test_placeholder`, a placeholder `QUOTE_ABUSE` id, placeholder Hyperdrive ids, and no `SUPPORT_FILES` or `EMAIL` binding. Missing rate-limit bindings fail open. | `wrangler.jsonc:109-171`; `lib/abuse/guards.ts:125-136` |
| X11 | **L** | Stripe metadata `booking_id` actually holds the quote_id. The idempotency key is supplied by the client and has no max length. | `lib/checkout/intent.ts:297-307` |

**Checked and OK:**
- The Stripe amount is computed on the server and CHF is hard-set.
- `sessionIsPayable` re-checks amount and currency.
- The webhook verifies the raw-body signature, dedupes on `stripe_events`, and sends events through the queue.
- Confirmation emails are claim-before-send with a dedupe key.
- The contact form uses an outbox.

### Mapbox (code only; no account access yet)
- **Endpoints used:** Search Box suggest and retrieve, Geocoding v6 reverse, Directions v5 `driving` (never Matrix or traffic), and Tilequery on `mapbox-streets-v8` to snap car-free-town pins onto a road (`lib/geo/mapbox.ts:35-40`). `MAPBOX_TOKEN` lives only in the Worker, behind the `/api/geo/*` proxies (`app/api/geo/suggest/route.ts:3`). No Mapbox GL map is rendered anywhere.
- **Caching:** `GEO_CACHE` is deliberately **not** used, citing the Mapbox Product Terms (`lib/geo/mapbox.ts:8-13`). This contradicts CLAUDE.md's "cached in KV by place-id pair (24 h TTL)"; the doc is stale. **L**
- **Service area:** any two points inside a Europe-wide box (lng −31.5…40, lat 27.5…72) can be quoted, or a named fixed route (`lib/geo/serviceArea.ts:37-43`). For a Zurich-first product, that means a Lisbon → Istanbul transfer can be priced. This is a product decision. **M**
- **Spend guard:** a daily breaker of 5000 units (`MAPBOX_DAILY_UNIT_SENTINEL`, `lib/abuse/breaker.ts`) plus the quote rate limits. Mapbox calls time out after 8 s and degrade gracefully when there is no token.
- The CSP `connect-src` still allows `maps.googleapis.com`, which no code uses (`lib/security/headers.ts:18`). **L**
- **[Unverified]:** token scopes and URL restrictions, monthly usage vs the free tier, and whether the token is a public `pk.` or secret `sk.` token. These need Mapbox account access.

---

## 4. Security findings

| # | Sev | Finding | Evidence |
|---|---|---|---|
| S1 | **H** | **Staff MFA is off.** The DB `app.is_staff()`/`is_admin()` were redefined without the `aal2` check, and the dashboard gate checks only the role. One phished admin password gives full PII access, refunds, pricing changes and staff invites. There is no MFA challenge page. This contradicts the CLAUDE.md "TOTP MFA for staff" constraint. | `migrations/20260901000001_staff_invitation_acceptance_gate.sql:9-30`; `middleware.ts:299-328`; `lib/ops/session.ts:125` |
| S2 | **H** | **Staff can change password or email without re-authenticating.** Combined with S1, a hijacked session can lock the owner out. [Unverified: whether Supabase "secure password change" is on] | `app/[locale]/(ops)/ops/profile/actions.ts:73-100` |
| S3 | **H** | **Leaked-password protection is disabled** in Supabase Auth. | Supabase security advisor |
| S4 | **M** | **CSP is weak.** `script-src 'unsafe-inline' 'unsafe-eval' unpkg.com` lets any npm package load from unpkg. The DC runtime needs it (in-browser Babel, React from unpkg), so it only goes away once DC is retired. | `lib/security/headers.ts:17`; live header |
| S5 | **M** | **Auth cookies use library defaults:** `httpOnly:false`, no explicit `Secure`, 400-day max-age. Any XSS (see S4) can read the staff session. | `@supabase/ssr` defaults; no override in `lib/supabase/{server,middleware}.ts` |
| S6 | **M** | **SECURITY DEFINER functions callable without signing in.** `anon` can execute `evaluate_coupon` (coupon enumeration, and an oracle for "has email X used coupon Y"), `quote_rate_book`, `quote_settings_version`, `quote_lock_deadline` and `record_consent`. `authenticated` can execute `checkout_cancel_unpaid`, `customer_confirmation_read` and `staff_claim_invite`. Exposure depends on whether the PostgREST Data API is used; the anon key does not appear in the browser bundle. | Supabase security advisor; `migrations/20260919000002_restore_anon_quote_rpcs.sql:10` |
| S7 | **M** | **No PII retention.** `stripe_events.payload` (billing name, address, last4), `contact_submissions`, `support_messages`, `consent_log` (user agent, truncated IP) and `bookings.contact_*` are kept forever. `customers.erased_at` exists but nothing fills it. This is an nFADP/GDPR gap. | `worker.ts:66-133` |
| S8 | **M** | **Pay-link can send branded mail to any address.** `/api/checkout/pay-link` emails any `payer_email` with attacker-supplied `company_name` and `company_address` text. Protection is CSRF and holding a valid quote lock (the quote step has Turnstile and a rate limit). I found no rate limit on the pay-link route itself. [Partially verified] | `app/api/checkout/pay-link/route.ts:51,183-214` |
| S9 | **M** | **The Hyperdrive login is equivalent to service role.** The `vamos_edge` login is a member of `vamos_staff`, `vamos_system`, `vamos_checkout`, `vamos_guest`, `anon` and `authenticated`, so its Hyperdrive password grants all of them. This is by design (F-21), but it must be in the rotation runbook. | live `pg_auth_members` |
| S10 | **L** | Static `/app/ops/*.dc.html` files are served from assets without CSP or XFO, and a client-settable `x-vamos-dc-asset: 1` header skips `gatePublicRequest`. Only static mock code is exposed. | `public/_headers`; `lib/dc-mock-urls.ts:100,176` |
| S11 | **L** | Manage-token fixation: `vt_manage` is set from any `?token=` without validation. The first URL, token included, lands in Workers logs (observability is on). | `middleware.ts:519-538` |
| S12 | **L** | Settlement doesn't re-check `amount_total`/currency against the snapshot (defence in depth). Checkout email is only `z.string().min(1)`. Raw Postgres `err.message` is logged. `/api/reviews/photo` has no rate limit. Published reviews expose `booking_id` to anon. | `lib/checkout/intent-schema.ts:69-73`; `intent.ts:424` |
| S13 | **L** | **Dependencies.** `pnpm audit --prod`: 0. Full audit: 5 high and 2 moderate, all dev or build tooling (fast-uri, js-yaml via stylelint; qs via @opennextjs/aws). | `pnpm audit` |
| S14 | **Info** | **Supabase performance advisor.** 47 unindexed foreign keys, 12 unused indexes, one duplicate index on `distance_bands`, and multiple permissive SELECT policies on `reviews`. Three tables have RLS with no policies (`booking_reference_counters`, `contact_delivery_outbox`, `staff_daily_digests`), which is fine because they are deny-all and system-only. | advisors |

**Checked and OK:**
- RLS is on for all 39 public tables. The staff gates are **RESTRICTIVE** policies layered over permissive ones. Ledger tables are FORCE RLS. Grants are revoked from anon, authenticated and PUBLIC, apart from curated public reads.
- All 86 SECURITY DEFINER functions set `search_path`.
- The service-role key is used only in the cron and the admin-gated invite route, never in `NEXT_PUBLIC`, and an allowlist check guards this.
- Every `/api/staff/*` route and ops server action calls `requireStaffClaims`/`requireAdminClaims`, plus an Origin check on writes.
- Account routes check CSRF, rate-limit, and use RLS ownership. Manage tokens are sha256-hashed 32-byte values.
- The auth callback `next` is allowlisted (no open redirect).
- SQL uses tagged templates only. There is no `dangerouslySetInnerHTML`.
- Uploads are validated by MIME type, magic bytes, a 5 MB cap and a key allowlist.
- Turnstile is on quote, contact, reviews and consent.
- **Secrets in git history (795 commits, all branches):** no live secrets. Hits are placeholders, a test `whsec_` fixture (`apps/web/tests/integration/email-hook.spec.ts`, commit `113c345`), local-dev Postgres URLs, and Stripe publishable test keys, which are public by design.
- **Headers:** HSTS for one year with includeSubDomains, XFO DENY, nosniff, referrer policy and permissions policy on both hosts.
- **WAF:** no WAF rules in the repo. [Unverified: Cloudflare dashboard]

### Price tampering test plan (describe only; run on a staging copy, never on live)
1. `/api/quote` → change `total_rappen` or `lines` in the intent body. Expect 400: the strict schema forbids those fields (`FORBIDDEN_SERVER_FIELDS`).
2. Swap `vehicle_class` without re-quoting. Expect the class to be priced from the lock, or refused.
3. Flip bytes in the lock payload or signature. Expect `lock_invalid`.
4. Replay an expired lock. Expect `payment_window_closed`.
5. Drop extras that are in the lock from the body. Expect the lock extras to still apply.
6. Coupon: use it past its max, run two parallel checkouts, or send a `body.coupon` different from the lock's. **Expect this to fail today (X3).**
7. Reuse `idempotency_key` with a different body. Expect the same session or a refusal.
8. Forge or replay a webhook. Expect 400 and dedupe.
9. Call `/api/checkout/return` with another booking's ref. Expect no cross-settlement.
10. Cancel an unpaid booking, then pay its still-open Stripe session. **Expect money captured with no refund today (X1 + X9).**
11. Set `livemode`/`is_test` bookings: expect capture to be refused.

---

## 5. Fix plan: GSD-ready phases

`.planning/` exists, so these are proposed as new phases on the existing roadmap, not a new project. Each phase needs your discuss → plan → UAT → ship gates.

**Phase A: Money and security criticals (first; touches live payments; staging copy first)**
0. X0 + X0b: **you** compare the Worker's `STRIPE_WEBHOOK_SECRET` with the signing secret of `we_1UIpns…` in your terminal and dashboard (one numbered human step; I never see the value). Then read the endpoint's delivery log for 400s, and reconcile `cs_test_a1lyA5…` (CHF 77.80 paid, booking cancelled). Fix: store the real PI id at settlement and refund by PI or session lookup.
1. X1: reconcile the 3 paid+cancelled bookings against Stripe with you (read-only listing first). Then: expire the Stripe session on every cancel or expire path (X9); auto-refund, or queue a staff refund, when the capture gate refuses a paid session; handle `charge.refunded` and `charge.dispute.*`.
2. X2: identify the dead-lettered `checkout.session.completed`, add a DLQ consumer and an alert, and replay it safely.
3. S1 + S2 + S3: restore `aal2` in `app.is_staff()`/`is_admin()` and the dashboard gate, build the MFA enrol/challenge pages, require re-authentication for password and email change, and turn on leaked-password protection. Your call on timing, since the MFA pause was your 2026-09-01 decision.
4. X3: write `coupon_redemptions` at payment, and pass the customer and email into `evaluate_coupon`.
5. X4: fail closed when the rate book fails to load; replace the hard-coded `pricing_live=true` with the real flag.

**Phase B: Security hardening**
6. S6: revoke anon EXECUTE on `evaluate_coupon` (proxy it through the Worker), and review the other SECURITY DEFINER grants.
7. S5: set the Supabase cookie options (`secure`, shorter max-age). httpOnly needs an SSR-only auth path.
8. S8: rate-limit pay-link, and escape or cap the company fields in the email.
9. S7: retention job (payload scrub on `stripe_events`, TTL on contact, support and consent data) plus the erasure worker. Needs your legal input on retention periods.
10. S10–S12, S13 dev dependencies, and the X10 env matrix cleanup plus production placeholders.

**Phase C: Product decisions (discuss only, no code)**
11. The vehicle line-up (V-Class/S-Class vs the current Saden/Van/Van luxury and CLAUDE.md's Economy/Business/Van). Rate version 18 vs 5. Real reviews vs placeholders. Photography provenance. anime.js vs Lenis. MFA timing.

**Phase D: Design system consolidation (retire the DC mocks)**
12. Point public routes at the existing React pages one at a time, starting with low-risk legal pages and ending with home, using a parity checklist at 390/768/1440 × EN/DE/FR/AR. Checkout stays untouched.
13. Delete the duplicate DC components as each React replacement ships (D5). Extend stylelint and the i18n gate to anything still DC (D6, D10).
14. Once no DC runtime remains: drop `unsafe-eval`, `unsafe-inline` and unpkg from the CSP, and allow the Arabic font (S4, D11).
15. Ops: port to React. Decide UI System AppShell/Table (with patches) vs the Vamos kit at that phase's discuss gate. DiceBear goes in ops only.

**Phase E: Polish**
16. D4 press-state bug, D7 tap targets, D8 contrast (darken the muted token, which is a token-level decision for you), D13 titles, D12 broken assets, D16 component states, D14/D15/D18/D19 law and scale clean-up, D17 routing and locale URLs, D20 cookie banner placement.
17. X5 (optional): move ops polling to Supabase Realtime.
18. X6: email copy policy (Gmail copy, stop putting the live token in the info@ copy, bounce handling). X7: multi-payment refunds. X8: shared generated types.

---

## Verified vs [Unverified]

**Verified:**
- Live DB facts: rate version 18 is live; vehicle classes; RLS and policies (RESTRICTIVE gates); grants and roles; no Realtime; 3 paid+cancelled bookings with 0 refunds; 1 dead-lettered completed event; advisors output.
- Live site: headers, redirects, titles, contrast, tap targets, console and network errors, untranslated strings, password eyes present, no dark mode, no overflow.
- Code paths cited with file and line: capture gate, coupon null, MFA paused, pricing formula, Stripe webhook.
- Git history secret scan and `pnpm audit`.

- Stripe sandbox (read-only): 1 webhook endpoint to the correct URL; 4 sessions, 1 paid (CHF 77.80) and unrecorded in the DB; 0 refunds; the DB's older sessions are absent from this account.
- Cloudflare: Workers `vamos` and `vamos-dashboard` exist. The Hyperdrive configs `vamos-public-staging` and `vamos-rls-staging` match the ids in `wrangler.jsonc`, with connection limits 12 and 20 (plus an extra `vamos-probe-staging` using `vamos_edge`).

**[Unverified]:**
- Why webhooks are not recorded (secret mismatch is the likely cause; the delivery log and secret were not readable).
- Which Stripe account the DB's older 46 events came from, and so the refund state of the 3 X1 bookings and the dead-lettered event.
- Cloudflare WAF, rate-limit and cache rules. The connected Cloudflare tools expose Workers, KV, R2, D1 and Hyperdrive only.
- Supabase "secure password change" setting.
- Photo provenance.
- Signed-in customer and ops screens (not captured; read-only rules).
- DC dictionary coverage outside the captured pages.
- The ops layout at 390/768 behind login.
- `env.production` secrets (not deployed).

**One next step:** in your terminal, check that the Worker `vamos` `STRIPE_WEBHOOK_SECRET` matches the signing secret of Stripe endpoint `we_1UIpns…` (sandbox → Developers → Webhooks), and open that endpoint's delivery log. Tell me "match" or "mismatch", plus the HTTP status of the latest deliveries.

---

## 6. Owner decisions (collected 2026-09-27)

| # | Topic | Decision |
|---|---|---|
| 1 | Mapbox access | Connect the official Mapbox MCP server (`https://mcp.mapbox.com/mcp`, OAuth). It exposes geospatial tools only, with no token or usage admin, so account scopes and usage stay [Unverified] unless read in your terminal. |
| 2 | Stripe accounts | Keep **only** the Vamos Taxi sandbox (`acct_1UIZmqHcNp9GZYjz`). Retire the old account (`…AJS2YBf21S`) and its webhook to `vamostaxi.site`. |
| 3 | CHF 77.80 sandbox charge | Start a refund for it in the sandbox and record it in `booking_refunds`, so the trail exists. Requirement: a started payment must never stop part-way or block the customer; a Stripe success must always land as a confirmed booking. |
| 4 | Staff MFA | Restore TOTP (aal2) now, in Phase A. |
| 5 | Vehicle line-up | **Economy, Business, Van luxury.** Rename Saden → Economy and V-Class (slug `mercedes-benz-v-class`) → Business. Keep Van luxury. Drop First. CLAUDE.md and every mock follow this line-up. |
| 6 | Price formula (owner's rule) | Per leg: **start fare + per-km × km + city-to-city pair price (if the pair matches) + airport pickup fee (if picking up at an airport, added on top of the start fare) + extras − coupon; VAT 8.1 % on top.** No distance bands and no region premiums. Every amount is entered by the owner in the dashboard; nothing is invented. |
| 7 | Rate version | Version 18's *structure* is right (start, per-km, airport, city pairs). Its label says "placeholder, not owner-approved", so the owner reviews the numbers in the dashboard; version 5's model (bands, premiums) is not wanted. |
| 8 | City-to-city direction | One pair covers **both directions**. |
| 9 | Service area | Freelance drivers across Europe, Vamos brokers at a margin. **Every trip books and pays instantly**, short or long. The Europe box stays. |
| 10 | Deleting in the dashboard | **Hard delete when nothing references the row** (e.g. `mahaha`). When bookings reference it, hide it everywhere and tell the user why. "Deleted" must never mean "still visible". |

### Pricing mismatches found from decisions 6–10 (all High; Phase A)
- **P0 (Critical):** the live book (18) is labelled "Staging matrix — placeholder, not owner-approved"; customers are priced on it. Each clone also appends another "draft" to the label.
- **P1:** the airport fee **replaces** the start fare instead of adding to it (`apps/web/lib/pricing/lines.ts:456-459`). Owner's example (10 km Economy from the airport): expected CHF 20 + 30 + 25 = 75; the code charges 30 + 25 = 55.
- **P2:** city-to-city pairs are one-way (`lines.ts:366-369`, comment: "A to B does not match B to A"). The owner wants both directions.
- **P3:** version 18's 6 city pairs are all `live=false`. The Business (V-Class) prices are empty. The "origin" zone is a street address (`zurich-airport-the-circle-16-flughafen-ch-8302-k`), not a city, so no pair applies today.
- **P4:** a class deleted in the dashboard still exists (`mahaha`, inactive, 1 row). Delete is a soft hide.
- **P5:** `min_fare` is stored but never applied (`lines.ts:435`). Owner to say whether a minimum fare exists.

| # | Topic | Decision |
|---|---|---|
| 11 | Reviews | Plan item: connect **Trustpilot (primary)**, Google and Tripadvisor as real review sources. This changes ADR-008 ("no platform import at launch"). |
| 12 | Photos | Owner reviews a numbered gallery (27 images, 18.1 MB; 1.2 MB not referenced anywhere) and names the ones to delete. |
| 13 | Motion | **anime.js for entrance/UI motion + Lenis for smooth scroll.** CSS keyframes migrate to anime.js; CLAUDE.md is updated to say so. |
| 14 | Price formula (final) | **start fare + per-km × km + airport fee (airport pickup only, on top) + city-to-city price (pair match, both directions) + every surcharge enabled in the dashboard (child seat, etc.) − coupon; VAT 8.1 % on top. No minimum fare.** |
| 15 | Photos (checked against code) | Keep 6/7/8 (dest-*: used through a built filename, `HowItWorks.dc.html:1494`; the gallery badge was wrong). Keep 10/11/13 (hero slides, `home.dc.html:274-276`). Delete 12 (hero-night-fleet, unused). Delete 24 (root hero-arrivals, byte-identical to 22) after the build script's list is updated; keep 22. Delete 25/26/27 (rectangle PNGs, 5.1 MB; copied by the build, used by no page). The R2 `/photos/site/*` copies are cleaned up separately. |
| 16 | Ops components | **Vamos kit, compiled** (no UI System). The ops mock is compiled at build time, pixel-identical, the same way as the public site. |
| 17 | Photos (extra) | Delete 25, 26, 27 (rectangles) and also **22 and 24** (hero-arrivals). Their slots (About hero, home hero fallback, Why Vamos) get another relevant existing photo, chosen by the owner. |
| 18 | React pilot | One-page comparison done (Imprint, `imprint-side-by-side.html`). **The hidden React page is not identical:** the desktop table of contents is gone; real values (date, version, UID CHE-296.035.710, credits) became TBC pills; internal "CLIENT INPUT" notes are visible to customers; the phone button is empty; the "German version is binding" line is missing; the footer design differs; the CTA case differs. Evidence for the compile path. |
| 19 | Mock pages (public + ops) | **Compile** at build time: pixel-identical, and in-browser Babel/unpkg are removed. The hidden React pages are retired, or swapped in only when a pixel diff shows zero difference. |
| 20 | Team email copies | **One team copy to info@vamostaxi.site for every booking event, without the customer's private manage link.** Staff act in the dashboard. `bookings@` copies stop. |
| 21 | Replacement photo | **9 fleet-van-street** (the brand-supplied V-Class photo) replaces hero-arrivals in the About hero, the home hero fallback and Why Vamos. |
| 22 | Language URLs | **Yes:** `/de/…`, `/fr/…`, `/ar/…` with hreflang. The switcher still relabels in place. |
| 23 | Accessibility polish | Yes, **after** compiling, as a separate reviewed step with before/after screenshots: hint grey to at least 4.5:1, booking fields to 54 px, steppers and icons to 44 px. |
| 24 | Retention | **Follow Swiss rules.** Booking, payment and refund records (the accounting record) are kept 10 years (Swiss Code of Obligations art. 958f). Under the nFADP, all other personal data is kept only as long as its purpose needs; proposed periods go to counsel for sign-off, and nothing is invented here. Stripe event payloads are scrubbed down to IDs and amounts after settlement. |
| 25 | Support tickets | **Keep the built-in dashboard tickets.** No Slack, no Intercom for now; the info@ alert covers notification. |
| 26 | Save the audit | Commit `docs/audit/` only to `claude/vamos-taxi-audit-nv3crt`, with a draft PR. No code. |
| 27 | Old Stripe account | Owner disables the old account's (`…AJS2YBf21S`) webhook to `vamostaxi.site`. Agent prepares the numbered steps. |
| 28 | Fix plan order | **Signed:** Phase A (money + security) → B (hardening) → compile mocks → polish. Phase A discuss opens next. |

### Mapbox checks (Mapbox MCP connected, 2026-09-27)
- **Route check:** ZRH Airport (arrivals forecourt) → Swiss National Museum, `mapbox/driving`: **10.19 km, 14 min** (A11/A1L).
- **The same trip priced with the live book's current Economy ("Saden") numbers:** start 20.00, 2.50/km, airport 30.00.

  | | Owner rule | Code today |
  |---|---|---|
  | Subtotal | 20.00 + 30.00 + 25.48 = **CHF 75.48** | 30.00 + 25.48 = **CHF 55.48** |
  | + VAT 8.1 % | CHF 81.59 | CHF 59.97 |

  This confirms P1.
- **Service zones (live `service_zones`, 12 rows)** — why P3 means no city pair matches today:
  - Duplicates: `zrh-airport` next to `zurich-airport-the-circle-16-flughafen-ch-8302-k` (a shopping-centre address), and `st-moritz` next to `st-moritz-the-grisons-switzerland`.
  - A point of interest stored as a zone: `swiss-national-museum-museumstrasse-2-8001-zu-ri`.
  - No zone has type `canton`, so the canton rule (`lines.ts`) never fires.
  - Zones carry no coordinates or polygons, only a Mapbox place-ID tag, so a pair matches only when the customer picks that exact place ID. **P6 (High):** zones must be real areas (city or canton polygons, or a radius around an airport) so any address inside matches.
- **Account-level items** (token scopes, URL restrictions, monthly usage) are not exposed by the Mapbox MCP and stay [Unverified].

### Added 2026-09-27 (after the repo became public)
- **X12 (High):** `main` fails **28 unit tests in 19 files** (`vitest run`: 28 failed | 1603 passed). From 2026-09-26 (run 267), every Actions run died before starting, so #56, #57 and the direct pushes to `main` shipped untested. Failures include the ops dual-copy byte-equality checks, `ops-dashboard-host` (middleware now uses `NextResponse.rewrite`), `quote/respond` contract and error codes, `pay-land`, `customers-board` and `sqlstate`. Plan: its own fix phase before Phase 26.1 code lands; each failing test is triaged as stale test vs real regression with the owner.
- **S15 (High, owner action):** the repo was switched to **public**, exposing `deliverables/` (invoice, scope of work), this audit's unfixed findings, and `.planning/`. The recommendation is to return it to private; CI minutes are handled by PR #59.
- **X13 (High):** the database cannot be rebuilt from the repo. `packages/db/supabase/migrations/20260919000001_revoke_anon_snapshot_and_rls_auto_enable.sql` statement 1 revokes on `public.rls_auto_enable()`, a function that exists only in the hosted project. A from-zero replay fails with 42883, so the pgTAP/RLS gate and seed/types drift have not run since 2026-09-19, and disaster recovery from migrations is broken. Fix: a guarded revoke, or a migration that defines the function.
