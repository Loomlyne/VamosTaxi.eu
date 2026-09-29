# Phase 27: Consent record - Context

**Gathered:** 2026-09-30
**Status:** Ready for planning
**Branch:** `gsd/phase-27-consent-record` in `/Users/koss/Developer/vamos-wt/phase-27`, cut from `origin/main` `61cf7377`

<domain>
## Phase Boundary

Every customer choice about cookies is saved in `consent_log`, and the banner that asks for it
shows on every customer page until the visitor chooses, including checkout, confirmation and the
pay link. Accept writes Meta on. Necessary only writes Meta off. The latest row for a visitor wins.
The owner's three Meta texts replace the empty Phase 26 slots, and the consent policy version moves
to the Zurich date of the ship day, so older Accepts ask again.

Not in this phase: loading the pixel (28), saving `_fbp`/`_fbc` (28), sending Purchase (29),
opening `META_LEGAL_GATE_OPEN` (28 opens it together with the owner's Events Manager flag).
Nothing is sent to Meta by this phase.

</domain>

<findings>
## What is true on live today (checked 2026-09-30)

- **The database banner reaches nobody.** `apps/web/components/consent/CookieBanner.tsx` (POSTs
  `/api/consent`) is mounted by `SiteShell` only when the path is home (`SiteShell.tsx:64`), and
  home is served by the mock (`middleware.ts` `DC_PAGES["/"]`). The Next pages customers do reach,
  `/checkout/*`, `/confirmation/*` and `/checkout/pay/[token]`, therefore show no banner at all.
- **The banner customers see is the mock** `app/home/CookieBanner.dc.html` (home) and
  `app/pages/CookieBanner.dc.html` (about, faq, contact, terms, privacy, cookies, cancellation,
  imprint, sitemap, manage-booking, booking-detail). It saves the choice in `localStorage`
  `vamosCookieConsent` only. It never calls `/api/consent`. Sign-in, account and bookings mocks do
  not import it.
- **Live `consent_log`** (read-only query): 3 rows. id 1 and 2: `accept_all`, marketing false,
  `2026-09-12` (12 and 14 Sept, from before home became a mock). id 3: `reject_all`, customer set,
  2026-09-29 14:05 UTC, written by sign-up confirmation.
- **Nothing reads `consent_log`.** No SELECT grant for anon/authenticated; no reader function.
- **Sign-up overwrite.** `apps/web/lib/auth/signup-consent.ts` writes a necessary-only row on
  e-mail confirmation (`settings_change` if a `consent_subject` cookie exists, else `reject_all`).
  Under "latest row wins" that switches an earlier Accept off.
- The mock `cookies.dc.html` and `privacy.dc.html` have no Meta slots; the Phase 26 slots exist
  only in the Next pages, which `/cookies` and `/privacy` never reach (mock wins in middleware).

</findings>

<decisions>
## Implementation Decisions

### Sign-up confirmation (owner, 2026-09-30)
- **D-01:** Confirming the e-mail writes **no** cookie row. Only the banner and Cookie preferences
  write cookie choices. Example: Lena presses Accept, then signs up and confirms; she stays on
  Accept. The consent to open an account is 26.5's own account record, not `consent_log`.
- **D-02:** The existing row id 3 stays. `consent_log` is append-only; no UPDATE, no DELETE.
- **D-03:** Remove the `consent_log` write from `signup-consent.ts` / the callback. Coordinate with
  26.5 (`gsd/phase-26.5-checkout-account`), which owns account consent; do not break its tick box.
  The `signup_consent` metadata flag handling stays harmless (no cookie row).
- **D-03a (owner, 2026-09-30, second question):** the `/sign-up` page gets the same account notice
  and tick box that 26.5 builds for checkout; the tick is saved in 26.5's account record table
  (text version, language, time), never in `consent_log`. Example: Marco signs up on
  vamostaxi.site/sign-up, ticks, and his agreement is recorded there. Built in Phase 27 after 26.5
  has shipped (depends on its table and notice text; reuse, do not fork). Until that lands the
  removed row is not replaced — it never recorded an agreement (it was necessary-only).
- **D-03b:** Row id 3 (2026-09-29, `reject_all`, customer set) must not decide Meta. It is under
  `2026-09-12`, so the new version excludes it; a pgTAP test proves it.

### Which banner, where (owner, 2026-09-30)
- **D-04:** Today's banner, all three buttons, same look on every customer page: **Accept all**,
  **Necessary only**, **Manage preferences** (four switches). No new layout, no new switch.
- **D-05:** Accept all = marketing on (Meta on). Necessary only = marketing off. In Manage
  preferences the Marketing switch = Meta on or off; Save choices writes a `settings_change` row
  with exactly the switches shown. Functional and Analytics are recorded as chosen (nothing runs
  on them).
- **D-06:** Every choice is saved in `consent_log` through `/api/consent` (the existing route and
  `record_consent`), not only in the browser. The browser copy may stay as a display cache only;
  the server row is the truth.
- **D-07:** The banner shows on every customer page until the visitor chooses: all mock pages that
  import it today, plus sign-in, account and bookings, plus the Next pages `/checkout/*`,
  `/confirmation/*` and the pay link `/checkout/pay/[token]`. Ops and dashboard never show it.
- **D-08:** "Chosen" means the server has a row for this visitor's `consent_subject` under the
  **current** policy version. A row under an older version does not count (Phase 26 D-14).
- **D-09:** The Next pages use the same banner look and copy as the mock (port, do not invent).
  Home stays on the mock banner.
- **D-10:** "Cookie preferences" (footer link, `vamos:cookie-prefs`) opens Manage preferences with
  the visitor's current saved choice, on mock and Next pages, so a later Necessary only is possible
  anywhere.

### Copy (owner, 2026-09-30)
- **D-11:** Banner body = the owner's banner text, verbatim, four languages
  (`.planning/decisions/2026-09-30-meta-wording.md` §1). It replaces "Strictly necessary cookies
  keep the booking flow working…" on the mock and `banner-body` / `necessary-cookies-only` on Next.
- **D-12:** Under it, a link labelled only **"Cookie policy"** to `/cookies`. No sentence added to
  his text. "Read the cookie policy." goes.
- **D-13:** Manage preferences, Marketing row: description and meta line replaced by the owner's
  cookies-page Meta text (§2), verbatim, four languages. "Nothing in this category is running
  today" and "none / not used" go.
- **D-14:** Cookies page Meta row = §2 text; privacy page Meta line = §3 text. On the mock pages
  customers see (`app/pages/cookies.dc.html`, `app/pages/privacy.dc.html`) and in the Next pages'
  Phase 26 slots (`data-meta-slot`). Verbatim, four languages, bold as in the decision file.
- **D-15:** The banner title "You choose what we measure", kicker, button labels and the other
  three preference rows stay as they are.
- **D-16:** Never reword, shorten, re-translate or add a sentence to §1–§3. Arabic in RTL with
  `_fbp`/`_fbc` kept LTR (`.vt-dir-keep`).

- **D-16a (owner, 2026-09-30, UI-SPEC Q-1):** remove "Reset my choice" and the line "Resetting clears the record and brings the banner back…" from /cookies. Lena changes her mind with "Change preferences" / "Necessary only"; each change is a new record.

### Banner code: vanilla-cookieconsent (owner, 2026-09-30, question form)
- **D-21:** Adopt **vanilla-cookieconsent** (orestbida/cookieconsent). Checked from its repository and
  docs on 2026-09-30: licence MIT (`LICENSE`, "Copyright (c) 2020-2025 Orest Bida"); version 3.1.0
  (GitHub latest release 2025-02-04, npm `latest` 3.1.0); right-to-left through `language.rtl`;
  runs without a build step (`dist/cookieconsent.umd.js` about 23 KB, plus `dist/cookieconsent.css`);
  asks again when `revision` changes. Option A (keep our own banner) was recommended as shorter;
  the owner chose B.
- **D-22:** Vendored into `assets/` like Lenis (`assets/cookieconsent/cookieconsent.umd.js`,
  `.css`, `LICENSE`, version noted), no CDN, no npm package on the mock pages. The Next pages load
  the same vendored files from `public/assets`. One config file (`assets/cookieconsent-boot.js`)
  shared by mock and Next pages; it replaces `app/home/CookieBanner.dc.html`,
  `app/pages/CookieBanner.dc.html` and `apps/web/components/consent/CookieBanner.tsx`.
- **D-23:** Look: restyled with `--vt-*` tokens only, to match today's banner and preferences sheet
  (D-04, D-15): Qurova + Poppins, pill buttons, 16px cards with `#DEDEDE` hairline, no glow, no
  tinted yellow. The library's own colours, radii and shadows are overridden; nothing from its
  default theme may show. Three buttons: Accept all / Necessary only / Manage preferences; four
  categories: necessary (read-only), functional, analytics, marketing.
- **D-24:** Copy: the four languages go into the library's `language.translations` from
  `app/vamos-i18n-dict.js` / the Next messages; the owner's §1 (banner) and §2 (Marketing row) are
  passed verbatim. `language.rtl: 'ar'`. Language follows `VamosLocale` (`setLanguage` on
  `vamos:locale`), never its own detector.
- **D-25:** Server is the truth (D-06). `onFirstConsent` / `onChange` POST `/api/consent` with the
  accepted categories. Accept all first gets the Turnstile token (invisible, `action: consent`);
  if Turnstile or the POST fails, the library's choice is undone (`acceptCategory([])` / reset),
  the banner stays, and the error shows. The library's stored choice is only a display cache; it
  never counts as consent. Storage: `cookie.useLocalStorage: true` under the existing key
  `vamosCookieConsent`, so no new cookie is added and the cookies-page row stays true (any change
  in duration or wording goes to the owner first).
- **D-26:** `revision` = the policy version as a number (Zurich date `YYYYMMDD`, same string as
  `CONSENT_POLICY_VERSION`, D-17). The banner also shows when the server has no row for this visitor
  under the current version (D-08), even if the library's cache says chosen.
- **D-27:** Pixel (Phase 28, recorded here so B is judged whole): the library's script-tag blocking
  (`type="text/plain" data-category`) is **not** used for the pixel, because it leaves the script in
  the HTML and META-07 forbids a dismissed person getting a page that contains it. The pixel is never
  in any HTML. Phase 28 loads it from the library's `onConsent` / `onChange` hook with
  `CookieConsent.loadScript`, only when marketing is accepted and the server row confirms it, and
  only on allowed routes. Pay link, manage-booking, ops/dashboard and any URL carrying a booking
  reference never run the loader (route deny-list checked in the hook and by a test). Marketing
  pages stay cacheable because the cached HTML carries no pixel and no per-visitor state.
- **D-28:** Unchanged: owner texts verbatim, four languages, provable on the server, account tick
  and guest record stay out of `consent_log`, design system is the only visual source.

### Policy version
- **D-17:** `CONSENT_POLICY_VERSION` becomes the Zurich date of the day the texts ship (Phase 26
  D-13, D-15). Same string shown as the date on the cookies and privacy pages. The two September
  Accepts and any `2026-09-12` row no longer count; the banner asks again.
- **D-18:** `bind.ts` stops hard-coding `marketing: false`; categories come from the choice. The
  Phase 26 pin "marketing stays false" is replaced by pins for D-05 and D-17.

### Reading the record
- **D-19:** One narrow `SECURITY DEFINER` reader returns the latest row for a subject under the
  current version (marketing on/off, recorded_at). No table grant to anon/authenticated. Phases 28
  and 29 use it; 27 uses it to decide whether the banner shows. Runs through the Worker's client
  options (`fetch_types: false`); no arrays unless registered in `packages/db/src/pg-types.ts`.
- **D-20:** "A later Necessary only stops future events; Accept after payment does not backfill"
  is proved in 27 at the record level: the reader answers "as of time T". Phase 29 asks as of the
  paid time.

### Carried forward
- Nothing to Meta before Accept; `META_LEGAL_GATE_OPEN` stays `false` in this phase.
- The pixel never loads on a pay link (Phase 28 enforces; 27 adds nothing that loads it).
- Accept keeps its Turnstile check (`action: consent`), Necessary only does not (existing route).
- No `sk_live_`, no `vamostaxi.eu`, no invented legal copy, no invented CHF, no hashed e-mail or
  phone, no browser Purchase, no middle events. Quote, pay and confirmation logic unchanged
  (the banner is added to those pages; nothing in their flow changes).

### Claude's Discretion
- How the mock learns the server choice (e.g. middleware injects a flag into the served mock HTML,
  or a small no-store GET). A cached marketing page must never carry one visitor's choice to
  another: the marketing cache key or the flag must be per-visitor / uncached.
- How Turnstile renders inside the mock banner (existing site key, `action: consent`).
- Banner placement on phone checkout: must not cover the Pay button; reuse the mock's
  measured body padding.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

- `.planning/decisions/2026-09-30-meta-wording.md` — the three texts, verbatim, four languages; 90 days; Meta Platforms Ireland Ltd
- `.planning/decisions/2026-09-30-priorities-and-ship-mode.md` — order 27 → 28 → 29, ship-mode limits
- `.planning/phases/26-legal-gate/26-CONTEXT.md` — D-12…D-15 version rules, D-19 all-or-nothing
- `.planning/phases/26-legal-gate/26-VERIFICATION.md` — the seven Phase 26 pins
- `.planning/REQUIREMENTS.md` — META-03, META-04, META-05
- `.planning/ROADMAP.md` — Phase 27 success criteria
- `CLAUDE.local.md` — one job, one branch, one ship; read-only live DB
- `apps/web/middleware.ts` — `DC_PAGES`, `MARKETING_CACHE_PATHS`, `NO_STORE_PATH_PREFIXES`
- `app/home/CookieBanner.dc.html`, `app/pages/CookieBanner.dc.html` — the live banner
- `app/home/SiteFooter.dc.html`, `app/pages/SiteFooter.dc.html` — Cookie preferences trigger
- `app/pages/cookies.dc.html`, `app/pages/privacy.dc.html`, `app/vamos-i18n-dict.js` — live legal pages and strings (shared with other sessions: append only)
- `apps/web/components/consent/CookieBanner.tsx`, `apps/web/components/shell/SiteShell.tsx`, `apps/web/app/[locale]/layout.tsx`
- `apps/web/app/api/consent/route.ts`, `apps/web/lib/consent/{bind,cookie,ip,policy}.ts`
- `apps/web/lib/auth/signup-consent.ts` — D-01/D-03
- `apps/web/lib/meta/legal-gate.ts`, `apps/web/lib/meta/legal-gate.test.ts`
- `packages/db/supabase/migrations/20260823000018_consent_log.sql` — table and `record_consent`
- `packages/db/src/pg-types.ts` — array registration (Worker client `fetch_types: false`)

</canonical_refs>

<code_context>
## Existing Code Insights

- `record_consent(...)` is SECURITY DEFINER, subject from GUC `request.vamos.consent_subject`,
  granted to anon/authenticated/vamos_guest/vamos_public. Reuse it; add only a reader.
- `/api/consent` POST: CSRF check, rate limit, Turnstile on accept, mints `consent_subject`
  (HttpOnly, 1 year) on first write. Needs to accept the three category booleans for
  `settings_change`.
- `readConsentSubject` rejects non-UUID values. The cookie is HttpOnly, so mock JS cannot read it.
- `MARKETING_CACHE_PATHS` caches mock HTML for `/`, `/about`, … — any per-visitor banner state
  must not be baked into a cached response.
- Migration numbers (control session, 2026-09-30): Phase 27 owns `20261002100000`–`20261002190000`.
  The reader is `20261002100000`. SECURITY DEFINER, `search_path = ''`, schema-qualified, EXECUTE
  only to the calling role, no table grant, pgTAP for grants and for "latest row under the current
  policy version".
- Ship order 26.4.2 → 26.5 → 27: plan against 26.5's account record table as it lands on main.

</code_context>

<not_verified_yet>
## Known limits

- Between the 27 ship and the 28 ship, the privacy text says Meta records page views after Accept
  while no pixel is loaded yet. The text over-describes; nothing is sent. 28 makes it true.
- No lawyer has read the texts (decision file).

</not_verified_yet>

<deferred>
## Deferred Ideas

- Pixel, `_fbp`/`_fbc`, Events Manager confirmation flag, opening `META_LEGAL_GATE_OPEN` — Phase 28.
- Server Purchase from the settle queue — Phase 29.

</deferred>

---

*Phase: 27-Consent record*
*Context gathered: 2026-09-30*
