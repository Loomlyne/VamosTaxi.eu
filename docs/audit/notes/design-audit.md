# Vamos Taxi design audit (read-only), 2026-09-27, HEAD f0238bd

Scripts: scratchpad/count.mjs (hard-coded value counts), scratchpad/emoji.mjs (emoji/arrow scan). Raw count table: scratchpad/counts.md.
Severity tags: [C]ritical [H]igh [M]edium [L]ow. [Unverified] = static read only, not rendered.

## 1. Token inventory
- Source of truth: design-system/tokens/{colors,typography,spacing,elevation,motion,fonts,base,laws}.css. design-system/styles.css imports them with laws.css last.
- Next app: apps/web/app/globals.css:6-18 imports apps/web/public/brand/tokens/* in the same order plus arabic.css (Noto Sans Arabic via --vt-font-arabic, applied under [dir=rtl]). The copy matches design-system/tokens byte-for-byte except fonts.css, where only the url() paths differ (../fonts/ vs ../assets/fonts/). arabic.css exists only in the Next copy, so DC mocks get Arabic type from vamos-locale.js chrome() at runtime.
- No Tailwind config anywhere. design-system/readme.md:33 still says "Tailwind · shadcn/ui · Vercel", which contradicts CLAUDE.md (Cloudflare, no Tailwind). [L] doc drift.
- Emails: packages/emails/src/chrome.ts:4-10 hex constants (CHARCOAL #1E1F1F, GREY #DEDEDE, MUTED #545756, YELLOW #FDC20B, WHITE) and font stacks. All match tokens. No tinted colours (#FFFBEB appears only in the negative tests auth.test.ts:40 and ConfirmationEmail.test.tsx:68).
- Colour: brand --vt-yellow/#FDC20B, --vt-charcoal/#1E1F1F, --vt-grey/#DEDEDE; yellow-50..700; charcoal-950..600; grey-500..50; white/black; --vt-orange #D4632B (parked, unused); semantic success/warning/danger/info plus tints (oklch); aliases bg-*, text-*, border-*, accent, accent-hover, accent-press, focus (colors.css:1-82).
- Type: --vt-font-display (Qurova), --vt-font-body (Poppins), --vt-font-mono; weights 300-800; display-1..3 clamp(); heading-1..4 32/26/20/17px; body-lg..xs 18/16/14/13; label-md/sm 13/11; figure-lg/md/sm 38/26/19 (typography.css).
- Spacing: space-0..12 = 0/4/8/12/16/20/24/32/40/56/72/96/128. Radius: xs 4, sm 8, md 12, lg 16, xl 24, pill 999, field = pill. Control heights: 36/44/54. Containers: 640/960/1200/1360. Gutter clamp(20px,5vw,56px) (spacing.css).
- Shadow: none/xs/sm/md/lg/xl (neutral 17 18 18), shadow-accent (yellow glow, aliased to none in laws.css), inset, ring/ring-inverse (yellow 45/55%), blur-panel, glass-light/dark, scrim-bottom/left, veil-yellow (elevation.css).
- Motion: dur-instant..page 80/140/200/320/480ms, ease-standard/out/in, transition-control (motion.css).
- Laws (laws.css): shadow-accent:none; .vt-input--focus no shadow; yellow-50..300 aliased to white/greys and yellow-600/700 to charcoal; [data-tok] TBC pill.

## 2. Hard-coded values (see counts.md). Excludes design-system/tokens, public/, tests.
Totals per surface:
| Surface | files | colour | radius px | font-size | shadow | font-family | total |
|---|---|---|---|---|---|---|---|
| apps/web (css+tsx) | 210 | 49 | 51 | 70 | 3 | 0 | 173 |
| app DC mocks (home+pages) | 41 | 350 | 118 | 174 | 3 | 0 | 645 |
| app/ops DC | 22 | 22 | 45 | 57 | 3 | 0 | 127 |
| packages/emails | 27 | 5 | 4 | 69 | 0 | 10* | 88 |
*The 10 email font-family hits are ${BODY_FONT}/${DISPLAY_FONT} interpolations of chrome.ts constants, not literals.

Top 40 files: see counts.md. The leaders are app/home/home.dc.html (75), WhenPicker.dc.html x2 (54 each), SiteFooter.dc.html x2 (52 each), SiteHeader.dc.html x2 (24), coming-soon (24), OpsTable (22), apps/web SiteHeader.css (21), ops.dc.html (20), WhenPicker.css (19).
- Most DC "colour" literals are rgb(255 255 255/.84) inline on footer links (58 hits) and a hard-coded focus outline rgb(253 194 11/.45) repeated in about 40 DC files (e.g. app/home/home.dc.html:266), which re-states --vt-ring instead of using it. [L]
- Off-scale radii: 10px (26 hits), 20px (9), 9/6/5/2px, e.g. apps/web/components/shell/SiteHeaderAccount.css:15,24 and BrandSelect.css:34 use 10px. The scale is 4/8/12/16/24/pill. [M]
- Off-scale font sizes: 12px (48), 10px (23), 9px, 10.5/11.5/12.5/13.5/15px. Text below the 13px floor: app/home/home.dc.html:209,222,728(9px),772; app/pages/BookingRow.dc.html:47,52,66; app/ops/ops.dc.html:89; app/ops/OpsDetail.dc.html:42; app/home/WhyVamos.dc.html:71. [M]
- Button sizes are hard-coded at 12/13/14px (apps/web/components/core/Button.css:4-6). [L]

## 3. Divergence between surfaces
- [C] Most of the public site is still served by DC mocks, not React. apps/web/middleware.ts:30-49 (DC_PAGES) plus :572-579 rewrite these routes to .dc.html: / about faq contact terms privacy cookies cancellation imprint sign-in sign-up reset-password manage-booking booking-detail account(+/account/*) bookings coming-soon sitemap. Only /checkout(/trip,/details,/payment,/pay/[token]), /confirmation(/[ref]) and /review are React (plus /dev, gated in dev/layout.tsx). The React pages for home, about, faq, contact, terms, privacy, cookies, cancellation, imprint, sign-in, sign-up and reset-password exist under apps/web/app/[locale]/* but are shadowed, so they never reach users. A customer therefore crosses from the DC header, footer and locale runtime (home) into the React header, footer and next-intl (checkout) and back to DC (account).
- [H] The ops console is 100% DC. apps/web/app/[locale]/(ops) contains only API routes and server actions, no page.tsx. The UI is app/ops/ops.dc.html served by serveOpsDc (middleware.ts:131-158, 277-334), which injects localStorage vamosOpsAuth=1 (middleware.ts:141).
- [H] Duplicate implementations:
  - SiteHeader: app/home/SiteHeader.dc.html == app/pages/SiteHeader.dc.html (identical, 607 lines) and apps/web/components/shell/SiteHeader.tsx (506 lines) + SiteHeader.css.
  - SiteFooter: the home and pages DC copies have drifted (line 118: href "#faq" vs "/#faq"); plus the React SiteFooter.tsx.
  - CookieBanner: the home and pages DC copies differ (line 75); plus React consent/CookieBanner.tsx.
  - AuthForm: app/pages/AuthForm.dc.html vs app/ops/AuthForm.dc.html differ by 279 diff lines; plus React auth/AuthForm.tsx.
  - WhenPicker: DC x2 identical plus React forms/WhenPicker.tsx. BrandSelect: DC x3 (ops copy differs) plus React shell/BrandSelect.tsx. ResetForm: DC plus React.
  - Home sections (Services, Reviews, FAQ, WhyVamos, HowItWorks, ServiceCard): DC plus React in apps/web/components/home.
  - app/{home,pages,ops}/support.js are identical copies (md5 951ae391).
- Tokens: all four surfaces use the same --vt-* token set (DC through design-system/styles.css, Next through public/brand/tokens, emails through hex constants that equal the tokens). The emails cannot use CSS vars, so any token change has to be synced by hand. [L]
- Colours outside the tokens: payment and brand marks in SiteFooter.dc.html:172-188 (Visa, Mastercard #EB001B/#F79E1B/#FF5F00, Apple, Google #4285F4/#34A853/#FBBC05/#EA4335, TWINT #00C8D7/#FF3B6B/#7B61FF). These are trademark artwork and acceptable. Real invented values: #999 in print CSS (app/pages/faq.dc.html:93, cookies.dc.html:119), the bundler thumbnail #141515/#F5C518 (home.dc.html:79-80, dev only), and the ServiceCard "Specular" prop, which offers #A67B05 (yellow-700, brown) as an option (app/home/ServiceCard.dc.html:77). [L]
- Glass/blur: backdrop-filter:blur(20px) saturate(1.35) on the floating header (apps/web/components/shell/SiteHeader.css:26; app/*/SiteHeader.dc.html:58) is a literal and does not use --vt-blur-panel. [L]
- Stylelint (apps/web/.stylelintrc: use-logical, bans tinted yellow and shadow-accent) covers only apps/web CSS. None of the served DC files are gated. [H] process gap.

## 4. Law violations
- Glow: [L] No coloured box-shadow and no rendered use of --vt-shadow-accent was found. Only HowItWorks.dc.html:490 has inset 0 0 0 1px var(--vt-yellow), which acts as a border. 17 of 22 ops DC files lack `--vt-shadow-accent:none` and 19 lack the `.vt-input--focus{box-shadow:none}` line (e.g. OpsBoard, OpsDash, OpsTable, OpsSidebar, OpsDetail), as do HowItWorks.dc.html and BookingRow.dc.html. They are neutralised at runtime by the host ops.dc.html :root and by laws.css, but this breaks the per-file rule in CLAUDE.md. [L]
- Tinted yellow (source level, neutralised at runtime by the laws.css aliases): [M]
  - app/ops/OpsBoard.dc.html:36 [data-ops-tag] background yellow-100 / colour yellow-700; :404 DS.Badge tone:'warning'.
  - app/home/home.dc.html:406 (yellow-700 text), :527/:589/:633/:2671 (yellow-50 background + yellow text pills), :2741 (warning-tint).
  - app/home|pages/CookieBanner.dc.html:48,55 (yellow-700 text).
  - Legal DC pages imprint:61,63; cookies:62,64; terms:68,70; cancellation:68,70,224,229; faq:50,84 use yellow-50 backgrounds and yellow-700 hover and icon colours.
  - app/pages/checkout.dc.html:124 Badge tone="accent" (dead file, since /checkout is React).
- [M] Real bug from the aliasing: --vt-accent-press = yellow-600 (colors.css:80) is aliased to charcoal-900 (laws.css:46), and primary text is --vt-text-on-accent = charcoal-900 (colors.css:69). On :active, a primary button therefore renders charcoal text on a charcoal fill and the label disappears. This affects apps/web/components/core/Button.css:16 and every DC file that repeats the rule (e.g. app/ops/ops.dc.html:39).
- Emoji: none found in any surface (Extended_Pictographic scan).
- Arrow as icon: app/home/WhenPicker.dc.html:62 and app/pages/WhenPicker.dc.html:62 use a standalone `<span>→</span>` separator; the keyboard hint glyphs ↑↓↵ in app/home/home.dc.html:613,657. "A → B" route strings are allowed text (readme §5), but they do not mirror in RTL. [L]
- Hand-drawn SVG icons that should be Icon: app/home/Reviews.dc.html:143 (external-link), :161 (check); app/home/HowItWorks.dc.html:1142 (arrow), :1148 (check). The decorative arc (Services.dc.html:130) and the HowItWorks map illustration (:996) are illustrations. React: 0 inline SVGs. [M]
- Hard-coded CHF in logic: [L] apps/web/app/[locale]/checkout/pay/[token]/PayClient.tsx:259 formats the amount as "CHF" regardless of the currency switch; CheckoutClient.tsx:257 has a fallback literal; app/pages/confirmation.dc.html:75 total="CHF 000.00" literal; app/ops/OpsDetail.dc.html:312 'CHF 000'; app/pages/account.dc.html:515. Otherwise money goes through lib/currency.ts and VamosLocale.money.
- Physical left/right properties (approximate regex count): apps/web 15 (mostly comments noting the logical fix; WhenPicker.tsx has 5 JS rect coordinates), DC home+pages 48, DC ops 19, emails 0. Text-bearing cases: app/home|pages/CookieBanner.dc.html:65 (left:32px at >=640px, so the banner does not mirror in Arabic); app/pages/sign-in.dc.html:89, reset-password.dc.html:82, AuthStates.dc.html:162 (decorative checker, right:0); app/ops/OpsReviews.dc.html:163 left:0;right:0 (symmetric, OK); the rest are JS popover coordinates (OpsTable:372,433, ops BrandSelect:58). [L-M]
- i18n: `node scripts/check-i18n-coverage.mjs` passed: 2493 keys, 1001 literal call sites resolved, 35 non-literal keys skipped (listed in the output: CheckoutClient.tsx:1467..2170, LegalPage/LegalToc, PageHero, FaqCard, StatusBadge.tsx:82 ...). The script only covers the Next app's messages. The DC dictionary app/vamos-i18n-dict.js has 1567 entries, all with de/fr/ar and no ß, plus 46 patterns. Whether every string rendered by the DC mocks (the actual public site and the ops console) is in the dictionary cannot be checked statically, because VamosLocale.coverage() needs the DOM. [Unverified][H]
- Swiss German: apps/web/i18n/messages/de.json:1901 "Dieses Foto ist zu groß" should use "gross". [L]

## 5. Component quality
Password fields and the show/hide toggle:
| Surface | File:line | Served? | Eye toggle (inline-end) |
|---|---|---|---|
| Customer sign-in/sign-up (DC) | app/pages/AuthForm.dc.html:139-143 | yes (/sign-in, /sign-up) | YES, [data-af-eye] inset-inline-end:6px, 42x54 |
| Customer reset (DC) new + confirm | app/pages/ResetForm.dc.html:97-107 | yes (/reset-password) | YES x2 |
| Ops sign-in (DC) | app/ops/AuthForm.dc.html:139-143 via ops-login.dc.html:56 | yes (dash /login) | YES (ops/AuthForm.dc.html:85) |
| Ops settings, change password x2 | app/ops/OpsSettings.dc.html:169-183 | yes | YES, but 32x32 (OpsSettings.dc.html:14), below 44px |
| React sign-in/sign-up | apps/web/components/auth/AuthForm.tsx:181 | shadowed by DC | YES (Input built-in, forms/Input.tsx:110-120) |
| React reset new + confirm | apps/web/components/auth/ResetForm.tsx:74,83 | shadowed | YES x2 |
| Checkout create-account password | apps/web/app/[locale]/checkout/CheckoutClient.tsx:1764 | yes | YES |
| Ops accept-invite | no page; OPS_EXEMPT lists /ops/accept-invite (middleware.ts:88), but the public host 404s /ops and the dash host serves only /login. The invite is claimed silently inside ops AuthForm.dc.html:403-420 | n/a | NO PAGE |
| Ops MFA challenge | no page (same OPS_EXEMPT entry); OpsProfile.dc.html:188 says two-step "Needs a provider connected" | n/a | NO PAGE (TOTP MFA required by CLAUDE.md is missing) [H] |
The React reveal button is 32x32 (forms/Input.css:37) and its focus-visible is only a colour change with outline:none (Input.css:39). [M] touch target and focus visibility.

Other components:
- Button: no loading state (Button.tsx:10 comment). [M]
- PlaceCombo (Mapbox geocode): no loading, no-results or error state. A failed fetch collapses to an empty list (forms/PlaceCombo.tsx:94-109). [M]
- Maps: no Mapbox GL map is rendered anywhere (no mapbox-gl dependency), only geocoding/directions APIs. HowItWorks uses an SVG illustration. [L]
- TimePicker.tsx and WhenPicker.tsx: no error or disabled handling. Toast.tsx: tones neutral/success/danger only, enter/exit only. Dialog.tsx:182 close IconButton size sm = 32px (IconButton.css:6). Table/List/PriceSummary/RouteSummary/Reviews/BookingBoard do have loading, empty and error branches. [M/L]
- CheckoutClassCards.tsx:80: check icon in var(--vt-accent) yellow on white has low contrast. [L]
- Vehicle classes, [C] product mismatch with the V-Class/S-Class-only rule:
  - DB: packages/db/supabase/migrations/20260823000005_fleet.sql:13 CHECK (slug in ('economy','business','first','van')); seed.sql:41-43 seeds economy/business/van.
  - Public: app/home/home.dc.html:1130,1190,1249 (Economy/Business/First/Van with "Sedan or similar", "Executive sedan", "S-Class or similar", "Minivan or similar"), :1412; app/pages/booking-detail.dc.html:673-676 and manage-booking.dc.html:673-676 (Economy/First/Van, S-Class, Minivan); checkout.dc.html:166, confirmation.dc.html:112; about.dc.html:172,198 ("The V-Class, our Van class").
  - Ops: OpsFleet.dc.html:334 fallback ['Economy','Business','First','Van'], :385 "Sedan or similar"; OpsNewTrip.dc.html:244.
  - i18n: en.json:799 sedan-or-similar, :1096 minivan-or-similar, :1107 s-class-or-similar, :2368 "Minibus, 9 seats or more".
  - Dev galleries: TransferGallery.tsx:330,354 "Mercedes E-Class or similar"; FormsGallery.tsx:232.
  - Photos: assets/photography/class-{economy,business,first,van}.jpg. class-economy.jpg is an E-Class sedan.
  - 52 files mention "Economy". CLAUDE.md itself names Economy/Business/Van as product names, so the new rule conflicts with the binding docs and needs a decision.

## 6. Avatars and people photos
- No pravatar, randomuser, dicebear, gravatar or ui-avatars. app/image-slot.js:47-97 supports Unsplash URLs with attribution. Used by WhyVamos.dc.html:34,125-127; no Unsplash src is currently set. [L]
- Initials avatars: React Reviews.tsx:266 `<Avatar name={authorName} size="xl">` (initials from author name); SiteHeaderAccount.tsx:164,248,258; DC SiteHeader.dc.html:175,180,242; account.dc.html:173; OpsFleet.dc.html:49,438 (chauffeur initials); OpsProfile.dc.html:63,497; OpsSupportTicket.dc.html:439.
- reviews.avatar_path column exists (seed.sql:2520-2535). The seeded reviews are placeholder copy ("First L.", rating 5, verified flag) on google/tripadvisor/trustpilot sources. [M] if published in prod: fake-looking reviews.
- [H] Photography: design-system/readme.md:457,560 says only fleet-van-street.jpg is supplied, but assets/photography holds 21 images (added d504ae4, b758724, 8b409c7, 92d6af1). why-driver-door.jpg shows a person (a chauffeur by a V-Class on a Paris-style street with blank plates); class-economy.jpg is an E-Class with a blank plate. Both look AI-generated or stock [Unverified provenance]. They are used on public pages: Services.dc.html:102-118, apps/web/components/home/Services.tsx:54-85, WhyVamos.dc.html:125-127, home.dc.html:274-276 (hero-oneway/airport/city), ops-login.dc.html:51.

## 7. Animation
- package.json deps: lenis 1.3.26 only (apps/web/package.json). No framer-motion, gsap or anime.js in any package.json or lockfile. The DC side vendors assets/lenis.js 1.3.23 (a version mismatch with the Next app's 1.3.26). [L]
- Counts: apps/web 25 @keyframes / 76 transition / 44 animation decls / 2 rAF; DC home+pages 79 / 269 / 102 / 3 WAAPI .animate / 14 rAF; DC ops 4 / 25 / 6 / 5 rAF.
- Target "anime.js only" conflicts with CLAUDE.md "Smooth scrolling is Lenis, everywhere" and lib/lenis-provider (providers.tsx:5). anime.js is not installed. Migration would touch about 108 keyframes and about 370 transitions. [M] decision needed.
- Lenis boot missing in the ops sub-screens (they inherit from ops.dc.html, which loads it) and in BookingRow.dc.html (child component). 11 data-lenis-prevent in ops. No scroll-behavior:smooth found.

## 8. Responsive
- Tables: React Table.css:5-6 has .vt-tablewrap overflow-x:auto with min-inline-size:720px, so it scrolls correctly. Ops OpsBoard.dc.html:20-22 has overflow-x:auto on [data-vt-board] with min-width 880px (OK); OpsTable.dc.html:37-38 wrapper OK; OpsSupportTicket.dc.html:102-103 OK.
- Checkout: checkout.css:24 two-column (1fr 380px) collapses at 900px (:618); recap and cards collapse at 640px (:633-643). OK.
- CSS files with grid/flex and no @media (fluid by design, but not verified at 390px): error-pages.css, review/review.css, home.css, BookingBoard.css, HomeHero.css, FlightField.css, TimePicker.css, Counter.css, StepIndicator.css ... [Unverified][L]
- Fixed widths: CookieBanner.css:101 inline-size:452px inside min-width:640px (OK). Ops sidebar is a fixed 236px with a 900px media query (OpsSidebar.dc.html:18); the ops layout was not rendered at 390/768 [Unverified].
- Touch targets under 44px: Dialog close 32px, Input reveal 32px, OpsSettings eye 32px, IconButton size="sm" used in ops.dc.html, OpsCalendar, OpsCalendarBoard, bookings.dc.html. [M]

## Appendix: top 40 files by hard-coded values
| # | File | colour | radius px | font-size | shadow | font-family | total |
|---|---|---|---|---|---|---|---|
| 1 | app/home/home.dc.html | 20 | 31 | 24 | 0 | 0 | 75 |
| 2 | app/home/WhenPicker.dc.html | 3 | 24 | 27 | 0 | 0 | 54 |
| 3 | app/pages/WhenPicker.dc.html | 3 | 24 | 27 | 0 | 0 | 54 |
| 4 | app/home/SiteFooter.dc.html | 33 | 1 | 18 | 0 | 0 | 52 |
| 5 | app/pages/SiteFooter.dc.html | 33 | 1 | 18 | 0 | 0 | 52 |
| 6 | app/home/SiteHeader.dc.html | 11 | 6 | 7 | 0 | 0 | 24 |
| 7 | app/pages/SiteHeader.dc.html | 11 | 6 | 7 | 0 | 0 | 24 |
| 8 | app/pages/coming-soon.dc.html | 19 | 3 | 2 | 0 | 0 | 24 |
| 9 | app/ops/OpsTable.dc.html | 0 | 4 | 18 | 0 | 0 | 22 |
| 10 | apps/web/components/shell/SiteHeader.css | 11 | 5 | 5 | 0 | 0 | 21 |
| 11 | app/ops/ops.dc.html | 5 | 9 | 6 | 0 | 0 | 20 |
| 12 | apps/web/components/forms/WhenPicker.css | 0 | 7 | 12 | 0 | 0 | 19 |
| 13 | app/pages/BookingRow.dc.html | 8 | 3 | 7 | 0 | 0 | 18 |
| 14 | packages/emails/src/ConfirmationEmail.tsx | 0 | 0 | 18 | 0 | 0 | 18 |
| 15 | app/pages/terms.dc.html | 16 | 0 | 1 | 0 | 0 | 17 |
| 16 | app/ops/BrandSelect.dc.html | 3 | 4 | 7 | 2 | 0 | 16 |
| 17 | packages/emails/src/PayLinkEmail.tsx | 0 | 2 | 14 | 0 | 0 | 16 |
| 18 | app/pages/account.dc.html | 11 | 1 | 3 | 0 | 0 | 15 |
| 19 | packages/emails/src/contact.ts | 0 | 1 | 7 | 0 | 7 | 15 |
| 20 | app/pages/cancellation.dc.html | 13 | 0 | 1 | 0 | 0 | 14 |
| 21 | app/pages/cookies.dc.html | 13 | 0 | 1 | 0 | 0 | 14 |
| 22 | app/pages/imprint.dc.html | 13 | 0 | 1 | 0 | 0 | 14 |
| 23 | app/pages/privacy.dc.html | 13 | 0 | 1 | 0 | 0 | 14 |
| 24 | app/ops/OpsSidebar.dc.html | 1 | 12 | 1 | 0 | 0 | 14 |
| 25 | apps/web/components/home/Reviews.css | 0 | 11 | 2 | 0 | 0 | 13 |
| 26 | app/pages/about.dc.html | 12 | 0 | 0 | 0 | 0 | 12 |
| 27 | app/pages/faq.dc.html | 8 | 3 | 1 | 0 | 0 | 12 |
| 28 | packages/emails/src/lib/lifecycle-mail.tsx | 0 | 1 | 11 | 0 | 0 | 12 |
| 29 | apps/web/components/home/HomeHero.css | 11 | 0 | 0 | 0 | 0 | 11 |
| 30 | apps/web/components/shell/SiteFooter.css | 6 | 1 | 4 | 0 | 0 | 11 |
| 31 | app/home/WhyVamos.dc.html | 5 | 2 | 4 | 0 | 0 | 11 |
| 32 | app/pages/booking-detail.dc.html | 9 | 1 | 1 | 0 | 0 | 11 |
| 33 | app/pages/manage-booking.dc.html | 9 | 1 | 1 | 0 | 0 | 11 |
| 34 | apps/web/components/legal/LegalPage.css | 9 | 0 | 1 | 0 | 0 | 10 |
| 35 | app/home/HowItWorks.dc.html | 4 | 0 | 3 | 3 | 0 | 10 |
| 36 | app/home/BrandSelect.dc.html | 4 | 1 | 4 | 0 | 0 | 9 |
| 37 | app/pages/BrandSelect.dc.html | 4 | 1 | 4 | 0 | 0 | 9 |
| 38 | app/pages/reset-password.dc.html | 7 | 0 | 2 | 0 | 0 | 9 |
| 39 | app/pages/sign-in.dc.html | 7 | 0 | 2 | 0 | 0 | 9 |
| 40 | apps/web/components/home/HowItWorks.css | 4 | 2 | 1 | 1 | 0 | 8 |

Totals per surface
| Surface | files | colour | radius | font-size | shadow | font-family | total |
|---|---|---|---|---|---|---|---|
| apps/web | 210 | 49 | 51 | 70 | 3 | 0 | 173 |
| app (DC mocks, non-ops) | 41 | 350 | 118 | 174 | 3 | 0 | 645 |
| app/ops (DC ops console) | 22 | 22 | 45 | 57 | 3 | 0 | 127 |
| packages/emails | 27 | 5 | 4 | 69 | 0 | 10 | 88 |
