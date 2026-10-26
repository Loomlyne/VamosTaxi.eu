---
phase: quick-261026-ckc
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - app/vamos-consent.js
  - app/home/CookieBanner.dc.html
  - app/pages/CookieBanner.dc.html
  - apps/web/components/consent/CookieBanner.tsx
  - apps/web/app/api/consent/route.ts
  - apps/web/lib/consent/choice.ts
  - apps/web/components/tags/SiteTags.tsx
  - scripts/dc-page-base.mjs
  - apps/web/lib/tracking/booking-conversion.ts          # new
  - apps/web/app/[locale]/confirmation/[ref]/ConfirmationClient.tsx
  - tests next to each file (unit), apps/web/tests/unit/consent/route.test.ts
autonomous: false
requirements: [QUICK-261026-ckc]

must_haves:
  inputs_from_owner:
    - "Google Ads conversion label for the new action 'Booking completed' (conversion id AW-368142830 is known)"
  truths:
    - "On / and on a Next page, Accept all, Necessary only and Save in Manage preferences each record the choice and close the banner with no Turnstile widget, no token, and no request to challenges.cloudflare.com from the banner"
    - "POST /api/consent with marketing true and no turnstileToken returns 200 and writes one consent row; the per-IP rate limit still answers 429; a stray turnstileToken in the body is ignored"
    - "Contact, reviews, sign-up and forgot-password keep Turnstile unchanged"
    - "Before any choice every Google hit carries consent default denied (gcd not all 'l'); after Accept all the next hits carry granted for ad_storage, ad_user_data, ad_personalization and analytics_storage; after Necessary only they stay denied"
    - "A returning visitor's saved server choice is applied on page load (from /api/consent/state) on mock and Next pages"
    - "Meta Pixel and the Cloudflare beacon behave exactly as today (no fbq consent call)"
    - "When /confirmation/<ref> reaches the confirmed state, one Google Ads conversion (send_to AW-368142830/<label>, value = charged CHF amount, currency CHF, transaction_id = <ref>), one GA4 purchase (transaction_id = <ref>) and one Meta Purchase (eventID = <ref>, value, currency CHF) go out"
    - "Reloading or revisiting the same confirmation page sends nothing again (per-reference guard in localStorage, plus transaction_id / eventID dedupe on the vendor side)"
    - "Processing, failed and refunded-only confirmation states send nothing"
    - "No amount is invented: value comes from the booking's charged rappen; a voucher booking with nothing charged sends value 0"
  out_of_scope:
    - "Banner, /cookies, /privacy wording (owner's words, 2026-10-19 item 1)"
    - "Google Ads advertiser verification, retiring the old URL conversion actions, GTM container edits (owner, in Google)"
    - "Meta Conversions API (server side)"
    - "Deploy: owner's Ship signature"
---

<objective>
Fix the three things the owner reported on 2026-10-26 that live in code: Accept all must save and close at once; Google must receive consent signals (Consent Mode v2 advanced); a completed booking on vamostaxi.site must reach Google Ads, GA4 and Meta as one conversion.
Decision record: `.planning/decisions/2026-10-26-banner-check-consent-mode-ads-conversion.md`.
Output: one branch, atomic commits per task, PR as draft. No deploy.
</objective>

<context>
@CLAUDE.md
@.claude/CLAUDE.md
@.planning/decisions/2026-10-19-tracking-count-every-visit.md
@.planning/decisions/2026-10-26-banner-check-consent-mode-ads-conversion.md
The Consent Mode bridge removed in `8dfa74d8` (SiteTags.tsx `CONSENT`, dc-page-base.mjs `TAGS_HEAD` first script) is the starting point for task 2, minus its two Meta lines (`fbq('consent', …)`).
The live home page is a synced mock (`scripts/sync-dc-mock-to-public.mjs`): it runs `app/vamos-consent.js` and `app/home/CookieBanner.dc.html`, so every change lands in the mock path and the Next path.
</context>

<tasks>

<task type="auto">
  <name>Task 1: Cookie banner without the human check</name>
  <files>app/vamos-consent.js, app/home/CookieBanner.dc.html, app/pages/CookieBanner.dc.html, apps/web/components/consent/CookieBanner.tsx, apps/web/app/api/consent/route.ts, apps/web/lib/consent/choice.ts, their tests</files>
  <action>
  Server: drop the Turnstile branch from POST /api/consent (`needsTurnstile` and its verify call); keep the rate limit, input checks and the record write. Ignore any turnstileToken field.
  Next banner: `submit()` posts straight away for every choice; delete `pending`, `onToken`, `resetNonce`, the Turnstile widget slot and the "check" error; the "save" error and retry stay.
  Mock: both CookieBanner.dc.html copies stop calling `VamosConsent.turnstile` (warm and visible); `VamosConsent.save` sends no token. Keep `VamosConsent.turnstile()` itself if any other page uses it (contact, AuthForm); remove it only if nothing does. Remove the "Turnstile waiting" gallery state and the `turnstile` startState option.
  i18n: remove only strings that no surface uses any more; add none.
  </action>
  <verify>Unit: route test (marketing true, no token -> 200 + row; 429 still), banner tests. Local browser at 1440 and 390, en and ar: Accept all closes in one click, no request to challenges.cloudflare.com from the banner, footer "Cookie preferences" still opens the sheet with the saved choice.</verify>
</task>

<task type="auto">
  <name>Task 2: Google Consent Mode v2, advanced</name>
  <files>apps/web/components/tags/SiteTags.tsx, scripts/dc-page-base.mjs, their tests</files>
  <action>
  Put back a first head script, before GTM and gtag: `gtag('consent','default',{ad_storage, ad_user_data, ad_personalization, analytics_storage: 'denied', wait_for_update: 500})`; apply the saved server choice from /api/consent/state; listen for `vamos:consent` and send `gtag('consent','update', …)` (Analytics -> analytics_storage, Marketing -> the three ad_* keys). No Meta lines. Same text in both files; update the header comments to cite the 2026-10-26 decision.
  Check that both banners dispatch `vamos:consent` with the categories after a successful save (Next already does; mock through vamos-consent.js save()).
  </action>
  <verify>Unit tests on both tag blocks (default before GTM, no fbq consent). Local browser: dataLayer order is consent default -> gtm.js; Google hit before choice carries gcs/gcd denied; after Accept all granted; after Necessary only denied; returning visitor with a saved Accept all gets granted on load.</verify>
</task>

<task type="checkpoint:human">
  <name>Owner step: conversion label</name>
  <action>Owner creates the Google Ads conversion action "Booking completed" (Goals -> Conversions -> New -> Website -> set it up manually; value: use different values; count: one) and pastes the label. Task 3 waits for it.</action>
</task>

<task type="auto">
  <name>Task 3: Booking conversion on the confirmation page</name>
  <files>apps/web/lib/tracking/booking-conversion.ts (new) + test, apps/web/app/[locale]/confirmation/[ref]/ConfirmationClient.tsx</files>
  <action>
  `sendBookingConversion({ reference, chargedRappen })`: returns early if `localStorage['vamosConv:'+reference]` is set (try/catch); otherwise sends
  `gtag('event','conversion',{send_to:'AW-368142830/<label>', value, currency:'CHF', transaction_id: reference})`,
  `gtag('event','purchase',{transaction_id: reference, value, currency:'CHF'})`,
  `fbq('track','Purchase',{value, currency:'CHF'},{eventID: reference})`,
  then sets the key. value = chargedRappen / 100, or 0 when nothing was charged; never a made-up number. Works when gtag or fbq is missing (queues through dataLayer; skips fbq if absent).
  Call it once when the client reaches the confirmed state (fresh return and later visits), never for processing, failed or refunded-only.
  If the AW destination loaded by GTM does not pick up the conversion command, add `gtag('config','AW-368142830')` to the GTAG block in both tag files and note it.
  CSP: confirm googleadservices / googleads.g.doubleclick.net / www.google.com hits are allowed; change nothing that is not needed.
  </action>
  <verify>Unit: once per reference, value from rappen, nothing on other states. Local lab with Stripe test 4242: confirmation sends one conversion hit carrying the label and transaction_id, a GA4 purchase and a Meta Purchase; reload sends nothing.</verify>
</task>

</tasks>

<verification>
`pnpm gate:local`, `pnpm test:unit`, `pnpm build`. Browser check at 1440 / 1024 / 768 / 390 in en and ar on / and /checkout (banner). `VamosLocale.coverage()` empty on the banner. Adversarial self-review of the diff.
</verification>

<ship>
Owner signs the plan, then UAT, then Ship. After deploy, verify on vamostaxi.site: Accept all closes in one click; Google hits carry consent; one live 4242 booking shows a "Booking completed" conversion in Google Ads (it can take a few hours to appear) and a Purchase in Meta Events Manager.
</ship>
