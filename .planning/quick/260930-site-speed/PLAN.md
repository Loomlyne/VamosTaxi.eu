# Site speed plan (for signature), 2026-09-30

Owner answers so far (question form): native scrolling, both scrollers out; shrink the `/about` photo; "do caching and reduce reading and postgres and all to get faster and less computer use".

## 1. Native scrolling everywhere (signed: "Remove both, native scrolling")
- The existing plan `.planning/quick/260928-q4t-remove-lenis-smooth-scroll-entirely-mock/` (untracked in the main checkout) removes Lenis from every mock, the Next pages, the tests and the rule lines (root `CLAUDE.md` "Smooth scrolling is Lenis, everywhere" becomes "Scrolling is native"). Reuse it.
- **Exact block to remove from `design-system/_ds_bundle.js` (vendored; the owner's word is needed to edit it):** lines 763-935 of main `02cae35c`: from the comment `// assets/vamos-scroll.js` through the closing `})(); } catch (e) { __ds_ns.__errors.push({ path: "assets/vamos-scroll.js", ... }); }`. Also the `"assets/vamos-scroll.js":"b10ecc247301"` entry in the `@ds-bundle` header (line 1) and in `design-system/_ds_manifest.json` (a preview card subtitle), and `design-system/readme.md` lines 484 and 682-684.
- **Proof that no page reads `--vt-scroll`, `vamos:scroll` or `window.VamosScroll`:** `git grep -n -i "vt-scroll\|vamos:scroll\|VamosScroll" -- . ':!design-system/_ds_bundle.js' ':!.planning'` on main `02cae35c` returns only `.claude/CLAUDE.md:348` (a rule sentence), `design-system/readme.md` 484/682/684 (docs), `design-system/_ds_manifest.json` (a label), and `apps/web/lib/lenis-provider.tsx` / `SiteFooter.tsx`, where `useVamosScroll` is a Lenis hook name, not the global. No `.dc.html`, no `assets/*.js`, no `apps/web` page reads the variable, the event or the global. Re-run the same command after the edit: the only survivors must be the prose lines.
- **Second bug in the same block:** `VamosScroll` moves the page with `window.scrollTo` on wheel, which an `overflow: hidden` lock does not stop, so on desktop the page behind an open sheet or dialog still scrolls by wheel (seen in the scroll-lock test: body locked, 6 wheel ticks, `scrollY` 714). Removing the block fixes that too.
- **That plan misses the measured cause.** It says no page loads the design system's `VamosScroll` and forbids editing `design-system/_ds_bundle.js`. `VamosScroll` is inside the bundle and starts on every mock page (`VamosScroll.enabled` = true live); its per-scroll write of `--vt-scroll` is the 3-5 second restyle storm (see MEASUREMENT.md). The bundle needs the block `assets/vamos-scroll.js` removed (one contiguous IIFE, about 170 lines; nothing reads `--vt-scroll` or `vamos:scroll`), and `design-system/readme.md` section 10 edited to match.
- Buys (measured, same scroll run): style recalc /faq phone 4.3-5.1 s to 4-7 ms; home laptop 3.2-3.9 s to 0.7-0.8 s; Lenis's own loop another 0.15 s laptop, 0.9 s at 4x CPU.
- Files others own, routed by the control session: `app/home/*` (26.4.2, 26.5), checkout components, `apps/web/tests/*` (26.0), `.github`. Order: after those land, then one job.

## 2. Caching (owner: "do caching")
- `apps/web/public/_headers`: fonts, photos, `assets/vendor/*` (React 18.3.1 has its version in the name): `public, max-age=31536000, immutable`. Our scripts, dictionary and `.dc.html` components: `public, max-age=300, stale-while-revalidate=86400`. Removes about 70 conditional requests per repeat page view (home 82, /faq 73, /about 70 measured).
- `/api/reviews`: `public, s-maxage=300` instead of `private, no-store`. Same rows for everyone, so one Worker run and one database read per 5 minutes instead of one per page view. A newly published review shows within 5 minutes.
- Not proposed: changing `/api/auth/session`, `/api/quote`, checkout APIs (per visitor, stay uncached).

## 3. Shrink `/about` photo (signed)
`photos/site/fleet-van-street.jpg`, 4.0 MB of the page's 8.1 MB, to web size (other site photos are about 300 KB). Same picture.

## 4. Postgres (owner: "reduce reading and postgres")
Measured: not a cost. Mean 1.5-17 ms per query, 24 MB database, advisors at INFO. No change proposed. Optional: cache the published price book in the Worker for 60 s (saves about 17 ms per quote, but a price change then takes up to 60 s to show, which touches pricing; owner decides).

## 5. Next, not in this plan (needs its own design and signature)
Layout shift after first paint (CLS 0.12-0.36 on home and /faq: booking form grows, translated text replaces first text), `/api/quote` at 0.9-1.0 s twice on home, Poppins as `.ttf` (4 x 150 KB) to `.woff2`, home's own scroll listeners (`app/home/home.dc.html`), the Arabic font stylesheet blocked by CSP (Phase 20 F17).

## Hand-over numbers
Same scripts (`measure.mjs`, `cost.mjs`) on a local Worker build of the finished branch, same pages, sizes and method, next to the live numbers in MEASUREMENT.md.
