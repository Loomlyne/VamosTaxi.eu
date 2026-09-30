# SEO head, favicon, share picture, per-language addresses — hand-over

Branch `feat/seo-head-and-favicon` in `/Users/koss/Developer/vamos-wt/seo-head`. Cut from `origin/main` `a9713e4b`;
`origin/main` `f9afdb88` (26.4.2 live) merged in, no conflict. Phase 27 is not on main yet, so main must be merged
again when the control session says it is. No push, no PR, no deploy, no database change.
Final commit: see `git log -1` on the branch (hand-over commit, last on the branch).

Owner decisions, 2026-09-30, through the question form: text approved as written, language option **B** built on this branch.
Text and decisions: `.planning/decisions/2026-09-30-seo-head-text.md`.

## What changed

| Piece | Where |
|---|---|
| One table: path, title, description, share image, indexable, four languages | `apps/web/lib/seo/pages.json` |
| Head written into the first HTML of every mock (html lang/dir, title, description, canonical, hreflang, Open Graph, Twitter, icons, manifest, theme-color, JSON-LD) | `apps/web/lib/seo/head.ts`, called from `apps/web/middleware.ts` (one import, `seoMockRoute`, `withSeoHead`; `serveDcHtml`, `DC_PAGES`, `applyPublicCacheHeaders` untouched) |
| `/de` `/fr` `/ar` are real addresses on the nine indexable pages; `/en/...` and any prefix on a private page still 308 to the unprefixed address | `middleware.ts` (prefix block), `lib/dc-mock-urls.ts` (`gatePublicRequest` in `worker.ts` redirected them first) |
| Unprefixed page with a German/French/Arabic `NEXT_LOCALE` cookie: 302 to `/de/...` (no cookie, no redirect: crawlers get English) | `lib/seo/head.ts` `seoRoute` |
| A language switch in the page moves the address and retitles the tab, no reload | `app/vamos-locale.js` (`followAddress`) |
| Sitemap: 9 pages x 4 language addresses with hreflang (36 URLs) | `apps/web/app/sitemap.ts` |
| robots.txt public unchanged; dashboard host answers `Disallow: /` | `apps/web/worker.ts` |
| Icons, manifest, theme colour on the Next pages and the dashboard mocks | `app/[locale]/layout.tsx`, `iconHeadTags()` in `serveOpsDc` |
| Favicon set, manifest, share picture | `apps/web/public/` (`favicon.ico` 16/24/32/48/64, `icon.svg`, `apple-touch-icon.png` 180, `icon-192.png`, `icon-512.png`, `icon-maskable-512.png`, `site.webmanifest`, `og-image.jpg` 1200x630) |
| Generators and how to rebuild | `scripts/seo-assets/` |
| Tests | `apps/web/lib/seo/head.test.ts` (new), `apps/web/lib/dc-mock-urls.test.ts` (updated for option B) |

## Before and after, per page (live `vamostaxi.site` on 2026-09-30 vs local Worker build of this branch)

| Page | Before: lang / title / description / canonical / OG / icon | After (English address) | Lighthouse SEO |
|---|---|---|---|
| `/` | none of them | `lang=en`, title, description, canonical, hreflang x5, OG, Twitter, icons, Organization JSON-LD | 83 → 100 |
| `/about` | none | all present | 83 → 100 |
| `/faq` | none | all present, FAQPage JSON-LD (English address only) | 83 → 100 |
| `/contact` `/terms` `/privacy` `/cookies` `/cancellation` `/imprint` | none | all present | not run |
| `/sign-in` `/sign-up` `/reset-password` `/manage-booking` (+ `/booking-detail` `/account` `/bookings` on the local build) | no head, `X-Robots-Tag: noindex, nofollow` | title in cookie language, `meta robots noindex, nofollow`, icons; no canonical, no OG, no share picture; header unchanged | not run |
| `/checkout` `/confirmation` (Next) | title only, `X-Robots-Tag: noindex` | unchanged title, `noindex`; icons and theme colour added by the layout | not run |
| `/favicon.ico` | 404 | 200 `image/vnd.microsoft.icon` | |

The three Lighthouse "before" runs are against live, the "after" runs against `http://localhost:4300` (local Worker, `wrangler dev --local`).
Before: failed audits `document-title` and `meta-description`; after: none failed.

## Checks

| Check | Result |
|---|---|
| typecheck | pass |
| unit tests (`vitest run`, after merging main) | pass |
| lint | pass, 0 errors, 5 warnings that were already there |
| lint:css | pass |
| check:numbers, check:legal-claims, check:public-env | pass |
| i18n:check | pass, 2626 keys |
| db:seed:check | no drift |
| build (`opennextjs-cloudflare build`) | pass, run five times, last on this code |
| Table test: every served page has a row, every page a title in 4 languages, every indexable page a description in 4 languages, no two pages share a title or description in a language, lengths, no claim words | pass |
| Sitemap list equals the indexable rows | pass |
| Local Worker, first HTML, 9 public pages English: title, description, canonical, og:image, icon, apple, manifest, theme, hreflang, before any script | pass (table in this session's transcript) |
| Local Worker `/de` `/fr` `/ar`, `/de/about`, `/ar/faq`, `/fr/imprint`, `/de/cancellation`: right `lang`, `dir=rtl` for Arabic, title, canonical in that language, `og:locale` | pass |
| Real Chromium: `/de/faq`, `/fr/about`, `/ar` paint in their language (`lang`/`dir` at DOMContentLoaded, German/French/Arabic H1), switch to English lands on `/faq`, `/about`, `/`, title follows, switching back lands on the prefixed address | pass |
| `/checkout` from a German visit: Next page in German (title "Ihre Fahrt"), `/faq` with the German cookie lands on `/de/faq` | pass |
| Private paths `X-Robots-Tag: noindex, nofollow` (mocks), `noindex` (checkout, confirmation) | pass |
| `/de/checkout/trip`, `/de/sign-in`, `/en/about` still 308 to the unprefixed address | pass |
| Dashboard host `/robots.txt` = `Disallow: /`, `X-Robots-Tag: noindex`; favicon reachable there | pass (forced host on the local Worker) |

## Not verified

1. Schema.org validator and Google's Rich Results Test. They read a public URL; nothing is deployed. The JSON-LD is two small objects (Organization on home, FAQPage on `/faq`) and the table test checks their keys. Run both after the control session deploys.
2. Tab pictures in real Chrome, Safari and Firefox. Only a simulated tab strip (light and dark) and a simulated link card were rendered, in Chromium: `tab-and-preview-simulated.png`. The cached Playwright Firefox and WebKit builds do not match the installed Playwright, so neither started. Real tab pictures stay with the owner's steps below.
3. A real link preview (WhatsApp, LinkedIn). Needs a public URL.
4. Cloudflare edge caching by cookie. The Worker answers `302, private, no-store` when a language cookie asks for another address and `public, s-maxage=300` for each language address. Whether the edge ever caches the English `/about` for a visitor with a German cookie was not tested; the page would then relabel in place through the existing language store, and the address would stay on the unprefixed page.
5. German, French and Arabic FAQPage JSON-LD: not emitted. The answers on those pages are translated in the browser, so their text is not in the first HTML and could not match.
6. Private page titles in four languages were written by the agent and not read by the owner (recorded in the decisions file).
7. The dashboard mock pages got icon links only (their own titles are unchanged); not opened past the login redirect on the local Worker.
8. The Lighthouse runs use Chrome for Testing 1234 headless with the sandbox off, SEO category only.

## Needs a change by another session

- `apps/web/tests/integration/locale-follow-26-3.spec.ts:163` asserts that `GET /de/about` redirects. Under option B it answers 200 in German. 26.0 owns that folder; I did not edit it.
- `apps/web/tests/visual/about.spec.ts` and `legal-cancellation-imprint.spec.ts` open `/de/about` etc.; they now load the page at that address instead of following a redirect. Not run here.
- `apps/web/tests/integration/ssr-locale.spec.ts` compares the `/de` `/fr` `/ar` home titles with the old mock titles; the tab title is now the approved one. Not run here.

## Files outside this job's own that I changed

`app/vamos-locale.js` (shared runtime, one function and one call), `apps/web/middleware.ts`, `apps/web/worker.ts`,
`apps/web/lib/dc-mock-urls.ts`, `apps/web/lib/dc-mock-urls.test.ts`, `apps/web/lib/metadata.ts`,
`apps/web/app/[locale]/layout.tsx`, `apps/web/app/sitemap.ts`, `apps/web/app/robots.ts`.
Not touched: `app/home/*`, checkout, consent, `lib/meta`, CookieBanner, `.github`, `apps/web/tests`, ops files, ROADMAP, STATE.

## Open source

- **Chosen: `favicons` 7.3.1, MIT** (github.com/itgalaxy/favicons, last push 2026-09-23). Run once in a scratch folder, output committed, no runtime dependency, nothing added to `package.json`. It needs `sharp` (scratch only). Its ICO output carried five sizes (16, 24, 32, 48, 64); the manifest it writes was replaced by a short hand-written one.
- **RealFaviconGenerator**: its `core` repo is MIT but its npm packages (`@realfavicongenerator/check-favicon` 0.9.3) say ISC; the old `realfavicon-cli` has no licence and was last pushed in 2024. Not used. The checker is an option for the owner's own check.
- **`schema-dts` 2.0.0, Apache-2.0** (Google), types only. Not adopted: two small JSON-LD objects, covered by tests; adding a dependency was not worth it.
- **Next.js Metadata API**: used for the Next pages' icons, manifest, theme colour and `metadataBase`; no SEO package.
- **`favico.js` 0.3.10 (MIT), `tinycon` 0.6.8 (MIT)**: no use. The product has no unread count or progress to show on a tab.
- Lighthouse (Apache-2.0) for the scores, run through `npx`.

The repo's `assets/logo/favicon.svg` uses `#FFC306` and `#1E1E1E`. The tab icon is redrawn in the brand `#FDC20B` and `#1E1F1F` only (yellow mark on a charcoal square, so it shows on a light and on a dark tab).

## Owner UAT (after the control session deploys)

1. Open https://vamostaxi.site in Chrome. Expect the tab to read "Vamos Taxi – Pre-booked taxi transfers in Switzerland" with a yellow mark on a charcoal square. Switch the browser to dark mode: the mark stays visible.
2. Open https://vamostaxi.site/de/faq. Expect the page in German, the tab in German, and the address staying `/de/faq`.
3. On that page, switch the language to English in the header. Expect the address to become `/faq` and the tab to turn English, with no reload.
4. Open https://vamostaxi.site/ar. Expect the page right-to-left, the tab in Arabic.
5. Open Safari and Firefox on https://vamostaxi.site. Expect the same tab text and icon.
6. Paste https://vamostaxi.site into WhatsApp (and https://vamostaxi.site/faq). Expect the night photo with the wordmark, the title and the description. Do not send it; look at the preview and delete it.
7. Open https://vamostaxi.site/sign-in. Expect a tab "Sign in | Vamos Taxi" and no share picture when you paste the link.
8. Open https://vamostaxi.site/sitemap.xml. Expect 36 addresses, nine pages in four languages.
9. After a few days, search `site:vamostaxi.site`. Expect only the nine public pages, in the languages Google picked up, and none of the private ones.
10. Paste the home page address into https://validator.schema.org and https://search.google.com/test/rich-results. Expect an Organization on home and a FAQPage on `/faq`, no errors.
