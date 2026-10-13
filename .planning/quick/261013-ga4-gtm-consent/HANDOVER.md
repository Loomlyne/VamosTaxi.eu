# Hand-over: GA4 under Analytics, Google Tag Manager behind a closed flag (job `261013-ga4-gtm-consent`)

Work session, branch `quick/ga4-gtm-consent`, worktree `.claude/worktrees/ga4-gtm`, cut from `origin/main` `71e3b326` (main had not moved at 18:08 +04, 2026-10-13). Nothing pushed, nothing deployed, no live database, Google or Stripe console touched.

Specs: `.planning/decisions/2026-10-11-ga4-wording.md` (adopted, binding, byte for byte) and the controller's brief (GA4 `G-K5MZME44P6`; GTM `GTM-KPKGT4VH` behind consent, wording draft only).

## What changed

### Job A: GA4 (ships)

- `app/vamos-google.js` restructured: one gtag.js script, two configs, each under its own server-confirmed choice (`GET /api/consent/state`).
  - Marketing on: Ads config as before; `ad_storage`/`ad_user_data` granted, `ad_personalization` **denied** (PR #77's intent; same comment line).
  - Analytics on: GA4 config with the scrubbed `page_location`/`page_referrer`, `page_title` = the scrubbed path (the confirmation title holds the reference), `cookie_expires: 7776000`, `allow_google_signals: false`, `allow_ad_personalization_signals: false`, `send_page_view: false` plus one explicit `page_view` with `send_to` the GA4 id (so the Ads tag never receives it).
  - Analytics only: every ad signal denied, no Ads config, script loaded by the GA4 id. Marketing only: no GA4, `analytics_storage` denied.
  - A later choice on the same page adds the other config to the script already there (no second script, no second `js`, no second page_view). `gtag('set','ads_data_redaction',true)` once.
  - Withdraw is per choice: Analytics off denies `analytics_storage`, drops queued GA4 events, deletes `_ga`, `_gid`, `_gat`, `FPLC`, `FPID`, `_ga_*`, `_gat_*` on every domain form and never re-adds GA4 on that page; Marketing off does the same for the Ads signals and `_gcl_*`/`_gac_*`; both off is the old full withdraw (everything denied, every Google cookie deleted). Storage events from another tab, `pageshow` from the back-forward cache and server answers follow the same split. A server answer no longer cancels another answer still on its way (only real withdraws bump the sequence).
  - Events (GA4 only, `send_to` the GA4 id, scrubbed page fields, nothing else): price button `view_item`, contact form `generate_lead`, WhatsApp/phone/email links `contact` with `method` (own delegated click listener, so it also works on the Next pages), vehicle chosen `begin_checkout`, going to payment `add_payment_info`. `VamosGoogle.track(name, params)` takes Meta's names and words; fixed list, 1.5 s de-dup, queue of five before the server answers, dropped after an answer without Analytics.
  - Paid booking: `VamosGoogle.conversion({ value, transactionId })` (unchanged API, unchanged pre-load queue) now sends the Ads conversion under Marketing and a GA4 `purchase` (`transaction_id`, `value`, `currency: 'CHF'`) under Analytics, each once per reference with its own local-storage key (`vamosGoogleConv:<ref>`, `vamosGaPurchase:<ref>`).
- Call sites: `app/home/home.dc.html` (price button, next to the Meta call), `app/pages/contact.dc.html` (form accepted), `apps/web/app/[locale]/checkout/CheckoutPage.tsx` (first eligible vehicle, inside `trackInitiate`), `CheckoutForm.tsx` (intent answer OK, right before the Stripe redirect), through new `apps/web/lib/google/steps.ts` (`googleStep`).
- Flags: `apps/web/lib/google/flag.ts` gains `GA4_OPEN = true` (loader `ANALYTICS_ON`), `GTM_OPEN = false` (loader `GTM_ON`), `GA4_MEASUREMENT_ID`, `GTM_CONTAINER_ID`; each pair pinned by a test. `GA4_OPEN` is a one-line kill switch for GA4 alone.
- Wording byte for byte from the decision file §1–4 into `app/vamos-meta-texts.js` (`analyticsRow`, `gaRow`, `gaPrivacyLine`, `gaProcessor`) and `apps/web/i18n/messages/{en,de,fr,ar}.json` (`cookies.ga-banner-row`, `cookies.ga-row`, `legal.ga-privacy-line`, `legal.ga-processor`). In the messages the literal `<id>` is ICU-quoted (`_ga_'<id>'`) so next-intl does not read it as a tag; the test unquotes it and also renders every owner text through next-intl's `createTranslator(...).markup` and compares with the decision file.
  - Banner Analytics row (both mock banners and `components/consent/CookieBanner.tsx`): the owner sentence plus row meta `Cloudflare Web Analytics (cookieless) · Google Analytics` / `Up to 90 days` (dictionary entries de/fr/ar added; Next keys `sheet-analytics-providers` re-valued, `sheet-analytics-duration` new; `sheet-not-used` and `tells-us-which-step-of-a-booking-people-abandon` removed, old dictionary sentence removed).
  - Cookies page: GA row in the Analytics table (`app/pages/cookies.dc.html`), and in the Next twin's analytics section.
  - Privacy page: GA line after the Google Ads line, and the GA purpose as a second line in the existing `Google Ireland Ltd` processor row (mock and Next).
- `CONSENT_POLICY_VERSION` `2026-10-09` → `2026-10-13` (`apps/web/lib/consent/policy.ts`). Mirrors moved: `legal-gate.test.ts` pin, `banner-meta-clear.test.ts` (3 stubs), `tests/e2e-worker/meta-click-ids.e2e.mjs`, `packages/db/supabase/tests/meta_purchase.test.sql` (every consent row and claim literal), `packages/db/test/local/{meta-purchase,meta-purchase-lock-order,refund-lock-order}.test.ts`. No migration.
- CSP (`apps/web/lib/security/headers.ts`, so mock pages and the Next `/checkout`, `/confirmation/<ref>` rows alike): `https://*.google-analytics.com` in connect-src and img-src, `https://*.analytics.google.com` in connect-src. `www.googletagmanager.com` was already in script/connect/img/frame. Tests in `google.test.ts` and `next-config-headers.test.ts`; `tests/integration/google-tag.spec.ts` now accepts leftmost-wildcard hosts.
- Seed regenerated (`packages/db/supabase/seed.sql`): +5 keys, −2, header 2710 keys, 106 no-param-reason; `seed_idempotent.test.sql` re-pinned. `noParamKeys` for `cookies.ga-row`, `cookies.sheet-analytics-duration`, `legal.ga-privacy-line`.
- `legal-gate.test.ts` needle scan: the GA4 id, the GTM id, `gtm.js` and `google-analytics.com` allowed only in the loader, the flag file and the policy builder; the Next privacy slot now holds three owner paragraphs.
- `owner-texts.test.ts`: four GA4 sections × four languages, mock and Next; `Site analytics, only with your consent ·` added to the label exceptions (the existing Cloudflare processor row; the owner's GA4 processor text reuses that phrase).

### Job B: Google Tag Manager (code only, flag OFF)

- In `app/vamos-google.js` behind `var GTM_ON = false;`. Loads only when Analytics **and** Marketing are both on (server-decided), after the denied default and the granted update, on the same address list: `dataLayer.push({'gtm.start': …, event: 'gtm.js'})` and `https://www.googletagmanager.com/gtm.js?id=GTM-KPKGT4VH`. No noscript iframe (pinned). Withdrawing either choice after it ran: everything denied for the rest of that page, every GA4 and Ads cookie deleted, the container marked revoked and never added again on that page.
- Draft wording: `.planning/decisions/2026-10-13-gtm-wording-DRAFT.md` (DRAFT, not adopted, no lawyer): banner sentence, cookies row, privacy line, processor row in en/de/fr/ar, and the facts table. Nothing of it is on the site.

## Tests run (times +04, 2026-10-13)

- `vitest run lib/google` 139 passed (new: analytics-only, marketing-only, both, both upgrades, older-answer race, withdraw analytics / marketing / both, storage split, GA4 events table and refusals, contact clicks, purchase once only and separate keys, allow-list, page_location scrubbed, GTM forced on: both / one / later / withdraw / off-list / no noscript, `googleStep`, CSP).
- `vitest run` over every suite that reads the touched files (lib/consent, lib/meta, lib/security, lib/checkout, lib/legal, components/consent, the mock-twin unit tests, home tests): 179 files, 2781 passed, 0 failed, at 18:05 after `node scripts/sync-dc-mock-to-public.mjs`.
- `pnpm typecheck`, eslint on touched files, `pnpm i18n:check` (2702 keys), `pnpm db:seed:check` (no drift): pass.
- `pnpm gate:local` (check:public-env, typecheck, lint:css, lint, i18n:check, legal-claims, numbers, build, test:unit, test:db-lab): `exit=0` at 18:14 (`gate.log` here). Web unit 6082 passed / 52 skipped; db 14; emails 293; db-lab 76 + 11 + 39. One extra loader test (older-answer race) was added after the gate's unit step had started; it was run on its own (139/139 in `lib/google`) and is in the commit.
- pgTAP in an own native lab stack (`lab.sh up ga4gtm --no-dash`, `pgtap`, `destroy`): `Files=116, Tests=3436` PASS, `exit=0` at 18:20 (`pgtap.log` here); covers the re-pinned `seed_idempotent.test.sql` and the moved literal in `meta_purchase.test.sql`. Stack destroyed.

Commit: `4c576fbc` (code, tests, texts, seed). Planning commit on top: this file, the GTM draft and the two logs.

## Not built, and why

- No GA4 `items` array on `begin_checkout` / `purchase` and no value on `begin_checkout`: the adopted text lists the amount only for a paid booking, and the class is not listed.
- No replay to a newly granted tag of a purchase already processed on the same page (Analytics first, then Marketing on the confirmation page sends the purchase but not the Ads conversion, and the reverse). Same rule as the existing "a later Accept does not replay it".
- One GA4 page_view per page load. An in-place address change (the checkout rewrites only its query) sends none; events read the current path each time.
- GTM wording not on the site; GTM flag stays false.
- The real-gtag.js browser spec (`google-tag.spec.ts`, needs Google's script downloaded once) was not run; its host check was updated for the wildcards only.
- No visual pass at 1440/1024/768/390 or in Arabic: the banner Analytics row is one sentence longer with a meta line, the cookies Analytics table one row longer, the privacy page one paragraph and one line longer (same components as the Google Ads rows). Needs the lab or Hermes.

## PR #77 (`quick/remarketing-off`) merge note

Expected conflict in two files, both trivial: `app/vamos-google.js` (PR 77 changes `ad_personalization: 'granted'` to `'denied'` with the comment `/* Owner 2026-10-12: remarketing off until he adopts its wording. Measurement only. */` inside the old `bootGoogle`; this branch replaced that block with `consentNow()`, which already carries the same comment and `'denied'`) and `apps/web/lib/google/google.test.ts` (PR 77 renames one test and flips one expectation in a test this branch rewrote). Resolution: take this branch's side of both files. PR 77's DRAFT file merges cleanly. If PR 77 lands first, merge `origin/main` here and keep ours; if this lands first, PR 77 becomes empty for code and keeps only its DRAFT note.

## Owner steps (numbered, his browser; before the controller ships)

1. analytics.google.com → Admin → Data streams → the vamostaxi.site stream → **Enhanced measurement: off** (all of it). Otherwise GA4 itself sends a page view with the full address when `/checkout` rewrites its query (the route and the flight), plus outbound-click, form and site-search events: the adopted text would be untrue. This is a ship blocker for GA4; if it cannot be done first, the controller ships with `GA4_OPEN = false` / `ANALYTICS_ON = false`.
2. Admin → Data settings → Data retention: **2 months**.
3. Admin → Data settings → Data collection: **Google signals off**; ads personalisation off (the code also sends both as false).
4. Admin → Product links → Google Ads links: link to Google Ads account **368142830**.
5. Read and adopt (or change) `.planning/decisions/2026-10-13-gtm-wording-DRAFT.md`; on adoption a later job flips `GTM_OPEN`/`GTM_ON`, adds the texts and bumps the consent version again.
6. After deploy: one 4242 payment with Tag Assistant open on the live `/confirmation/<ref>`: one Ads conversion, one GA4 purchase, `page_location` `/confirmation/:ref`, cookies `_ga`, `_ga_K5MZME44P6`, `_gcl_au` (`_gcl_aw` only with an ad click).

## Files changed

`app/vamos-google.js`, `app/vamos-meta-texts.js`, `app/vamos-i18n-dict.js`, `app/home/{CookieBanner,home}.dc.html`, `app/pages/{CookieBanner,contact,cookies,privacy}.dc.html`, `apps/web/lib/google/{flag.ts,steps.ts (new),google.test.ts,next-config-headers.test.ts}`, `apps/web/lib/security/headers.ts`, `apps/web/lib/consent/{policy.ts,owner-texts.test.ts}`, `apps/web/lib/meta/legal-gate.test.ts`, `apps/web/lib/security/public-no-internal-ids.test.ts`, `apps/web/components/consent/{CookieBanner.tsx,banner-meta-clear.test.ts}`, `apps/web/app/[locale]/{cookies,privacy}/page.tsx`, `apps/web/app/[locale]/checkout/{CheckoutPage,CheckoutForm}.tsx`, `apps/web/i18n/messages/{en,de,fr,ar}.json`, `apps/web/tests/integration/google-tag.spec.ts`, `apps/web/tests/e2e-worker/meta-click-ids.e2e.mjs`, `packages/db/supabase/{seed.sql,tests/meta_purchase.test.sql,tests/seed_idempotent.test.sql}`, `packages/db/test/local/{meta-purchase,meta-purchase-lock-order,refund-lock-order}.test.ts`, `.planning/decisions/2026-10-13-gtm-wording-DRAFT.md` (new), this file and `gate.log`.
