# Site speed, hand-over B: native scrolling

Branch `fix/native-scroll`, cut from `origin/main` `51b851e3`; `origin/main` `3b4f86d8` (site speed A live) merged, no conflict. Commits by name: `8e55ef0a` (mock side), `4cc006cb` (design-system bundle), `a334bab2` (Next side), `c66ac56e` (rules and docs), `657c638f` (merge of main), `bb9021f0` (guard test), `1314bae6` (this hand-over). No push, no deploy, no database change.
**Waits for the class cards and Phase 27 to land on `main`** (control session's order); merge `main` again and re-run before it is taken. Expect conflicts only in `app/home/home.dc.html`, `app/home/BookingSheet.dc.html` and any file those sessions still edit; each of my edits there is one removed Lenis line or comment.
Owner's word: "Remove both, native scrolling" (question form, 2026-09-30), which also changes the Lenis rule in root `CLAUDE.md`.

## What is gone

| Piece | Where |
|---|---|
| The three Lenis tags in 47 mock files | `app/home/*`, `app/pages/*`, `app/ops/*` (only those three lines each; `git diff --numstat` showed 0 added, 3 removed in every file) |
| `assets/lenis.js`, `assets/lenis.css`, `assets/lenis-boot.js` (the boot script also carried the lock fix shipped 14:46) | `assets/` |
| `window.vtScrollTo` and its five callers, now native `window.scrollTo` (offset -88 or -24 as before, `auto` under reduced motion) | `app/vamos-page-transition.js`, `app/home/SiteFooter.dc.html`, `app/pages/SiteFooter.dc.html`, `app/home/HowItWorks.dc.html`, `app/home/home.dc.html` (`land()`) |
| `window.__vtLenis` use in home's phone "scroll the form into view" (kept the native branch) | `app/home/home.dc.html` (one line) |
| **Dead code from the 26.4.2 workaround:** the `window.__vtLenis.start()` block in `BookingSheet._unlock()` (5 lines incl. comment) | `app/home/BookingSheet.dc.html` |
| Two stale Lenis comments reworded | `app/home/home.dc.html` (anchor comment), `app/home/Reviews.dc.html` (axis lock) |
| **`VamosScroll` from the design-system bundle:** lines 763-935 of `design-system/_ds_bundle.js` (`// assets/vamos-scroll.js` through its `catch`), the `"assets/vamos-scroll.js"` hash in the `@ds-bundle` header, the "Scroll runtime" card in `_ds_manifest.json`, readme section 10 rewritten ("Scrolling is native") and its file-table row | `design-system/` |
| `LenisProvider`, `useVamosScroll`, the `lenis` npm package and its three `pnpm-lock.yaml` blocks (hand-removed; `pnpm install --frozen-lockfile --offline` passes) | `apps/web/lib/lenis-provider.tsx` (deleted), `apps/web/app/[locale]/providers.tsx`, `apps/web/package.json`, `pnpm-lock.yaml` |
| New native helper for the footer FAQ jump | `apps/web/lib/scroll.ts` (+ `scroll.test.ts`), `apps/web/components/shell/SiteFooter.tsx` |
| Inert `data-lenis-prevent` on Next components, and their comments; `overscroll-behavior: contain` added where Lenis's stylesheet gave it (`.vt-tabs`, `.vt-tabs--block`, `.vt-tablewrap`) | `components/feedback/Dialog.{tsx,css}`, `components/home/BookingCard.tsx`, `components/navigation/Tabs.{tsx,css}`, `components/data/Table.{tsx,css}`, `app/[locale]/cookies/page.tsx`, dev `NavigationGallery.tsx` |
| Rules: root `CLAUDE.md` section "Smooth scrolling is Lenis, everywhere" becomes "Scrolling is native"; `.claude/CLAUDE.md` likewise plus six Lenis lines; handoff, README, github.md, three docs/build files | see commit `c66ac56e` |

**Specs changed (all under `apps/web/tests`, mine for this job):** deleted `integration/lenis.spec.ts` and `integration/lenis-lock-release.spec.ts` (the lock fix of 14:46 is obsolete with the file); rewritten `integration/feedback-behaviour.spec.ts` (scroll lock test now asserts the inline body lock and its release, dialog-body test unchanged); `visual/home-booking-sheet.spec.ts` (two tests: Lenis assertions removed, the lock release and wheel checks stay); comments only in `integration/currency.spec.ts`, `integration/ssr-locale.spec.ts`, `visual/error-pages.spec.ts`; `playwright.config.ts` (one entry). Also `lib/legal/privacy-account-paragraph.test.ts`: its "manage-booking mock untouched relative to origin/main" guard now allows exactly the three Lenis tag lines to differ (otherwise any branch that removes them fails it until merge).

**Left on purpose:** inert `data-lenis-prevent="1"` attributes in `app/ops/{BrandSelect,OpsBoard,OpsPricing,OpsSidebar,OpsTable}.dc.html`, `app/pages/account.dc.html`, `app/home/home.dc.html` (travellers panel) and `app/home/BookingSheet.dc.html` (sheet body): harmless, smaller diff, and `apps/web/lib/ops/ops-write-contract.test.ts` pins the ops table one. Two guard tests keep "Lenis" in their titles (`phase-26-4-laws.test.ts`, `home-one-form-264.test.ts`; they assert `new Lenis` never comes back). `data-scroll-native` is now inert too. Older history in `github.md` and `.planning/` is untouched.

## Before and after (same scripts, pages, sizes, method; before = live `vamostaxi.site` today with both scrollers on, after = local Worker build of this branch)

Main-thread cost of one scroll run (Chrome counters, `cost.mjs`, two runs each; phone = 4x CPU slowdown):

| Page | Size | Task time before | after | Style recalc before | after |
|---|---|---|---|---|---|
| / | laptop | 3673-3832 ms | 1007-1087 ms | 2697-2777 ms | 363-397 ms |
| / | phone | 6758-6779 ms | 2035-2440 ms | 5477-5482 ms | 662-784 ms |
| /faq | laptop | 544-599 ms | 87-91 ms | 361-394 ms | 4 ms |
| /faq | phone | 2622-2695 ms | 69-82 ms | 2376-2435 ms | 0 ms |

Frames (`measure.mjs`, median of 3; `live.json` on the site-speed branch vs `local-B.json`): phone home scroll frames over 25 ms **49 of about 200 (p95 50 ms) down to 2 (p95 16.8 ms)**; other pages 0 before and after. Scroll handler calls per run: home laptop 1629 down to 300, /faq laptop 1260 down to 161.
What remains on home (1000 style recalcs laptop) is home's own scroll listeners (`app/home/home.dc.html`); not touched here.

## Proof (local Worker build, `native.mjs`, all PASS)

For `/`, `/faq`, `/about`, `/contact`, `/sign-in`: no request for a Lenis file, no `VamosScroll`/`Lenis`/`__vtLenis` global, no `--vt-scroll` on `<html>` after scrolling, wheel moves the page (1440 px after 12 ticks on the four long pages). `/faq` with a body lock: wheel does **not** move the page (scrollY 0; before, `VamosScroll` moved it 714 px behind a lock), and moves it again once the lock is released. Phone `/faq` at 390 with touch: swipe moves the page; the real menu locks the body and the page behind does not move; Escape releases the lock and the swipe works again.
`git grep -n -i "VamosScroll\|vt-scroll\|vamos:scroll" -- . ':!archive' ':!.planning'` now finds only the readme's removal note and the `github.md` removal entry; nothing in `app/`, `assets/` or `apps/web` reads the property, the event or the global.

## Checks

typecheck, `vitest run` (full set once as lead), lint (0 errors, 5 old warnings), lint:css, check:numbers, check:legal-claims, check:public-env, i18n:check, db:seed:check, `node --test scripts/dc-page-base.test.mjs`, worker build: all pass after the guard-test fix (the one failure on the first run was the manage-booking guard above).

## Not verified

- **Playwright specs not run:** `feedback-behaviour.spec.ts` and `home-booking-sheet.spec.ts` need their dev-server or harness setup; `native.mjs` covers the same lock and release behaviour on the built Worker instead. Run both before Ship.
- A real phone or GPU, Safari, how it feels by hand. The numbers are main-thread cost under a headless browser with CPU slowdown.
- The design-system bundle is vendored: the owner's word covers removing `VamosScroll`; nothing else in it changed.
- `/checkout`, `/confirmation` and other Next pages: their only scroll code was the provider, now gone; no page-specific scroll test was run beyond the helper unit test and `/checkout` in `measure.mjs` (no dropped frames).

## Owner UAT (after deploy)

1. Open https://vamostaxi.site/faq on your phone and scroll. Expect it to follow your finger with no stalls.
2. Open the menu, then close it. Expect the page to scroll again at once.
3. On a laptop open the home page and scroll with the wheel and the trackpad. Expect normal browser scrolling (no glide), no stutter.
4. Open the booking sheet on the phone, close it: the page scrolls again.
5. Open a dialog on the site; with it open, the page behind must not move.
6. Click "FAQs" in the footer of the home page: it jumps to the FAQ below the header.
