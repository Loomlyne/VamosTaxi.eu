# Scroll and speed: live measurement, 2026-09-30 (no edit)

Live https://vamostaxi.site, worker `vamos` (main `5b394833` SEO ship, read 13:0x). Branch `fix/site-speed`, cut from `origin/main` `02cae35c`. No product file changed.

Method: Playwright 1.63 + Chrome Headless Shell 153 (downloaded 2026-09-30 with the owner's yes), run with the sandbox off. Laptop = 1440x900, phone = 390x844 at 3x with touch and **4x CPU slowdown**. Each cell is the median of 3 loads; scroll = 40 wheel ticks down and 20 up (laptop) or two touch gestures (phone), every frame timed by `requestAnimationFrame`. Scripts and raw results sit in this folder: `measure.mjs` (+ `live.json`, `live.log`), `cost.mjs` (Chrome's own main-thread counters), `probe3.mjs` (time per scroll handler), `twin.mjs`, `cls.mjs`, `repeat.mjs`.

## The cause

**The design system's own scroller writes `--vt-scroll` on `<html>` on every scroll event, and that restyles the whole page each time.** `design-system/_ds_bundle.js` (source `assets/vamos-scroll.js`, `VamosScroll`) starts at boot. On every native scroll event, and on every frame of its own wheel loop, `signal()` reads `scrollHeight` and sets the custom property `--vt-scroll` on the root element, then fires a `vamos:scroll` event. A custom property change on the root invalidates style for every element. **Nothing in the repo reads `--vt-scroll` or `vamos:scroll`** (searched app, assets, design-system components, apps/web; only the design system's own readme mentions it).

Main-thread time spent on style recalculation during the same scroll run (Chrome `RecalcStyleDuration`, two runs each; "without" = that one write skipped, everything else identical):

| Page | Size | With the write | Without | Recalcs with / without |
|---|---|---|---|---|
| /faq | phone (4x CPU) | 4316 and 5147 ms | 4 and 7 ms | 422 / 2 |
| /faq | laptop | 409 and 557 ms | 7 and 11 ms | 354 / 128 |
| / | phone (4x CPU) | 5311 and 5338 ms | 994 ms | 393-439 / 530 |
| / | laptop | 3208 and 3948 ms | 693 and 834 ms | 1412 / 1026 |

Total task time: /faq phone 4996-6161 ms down to 194-602 ms; home laptop 4884-5571 ms down to 2522-2980 ms.

The same file also ships a second wheel smoother (`VamosScroll`, lerp 0.12) on top of Lenis (lerp 0.12). Both are live on every mock page (`VamosScroll.enabled` and `window.__vtLenis` both true). The design system's own comment says: "If a consuming app already ships Lenis, delete this file".

## Suspects, each with a number

| Suspect | Verdict | Evidence |
|---|---|---|
| Lenis | Real but second-order. Not the glitch. | Handler time per scroll run: 4-5 ms total (`probe3`). Main-thread task with Lenis vs without (both with the `--vt-scroll` write skipped): laptop 1638 vs 1493 ms, phone 4x CPU 3564 vs 2634 ms. Two smoothers at once (Lenis + VamosScroll) glide the same as either alone in a synthetic wheel test (`twin.mjs`): no fighting visible in that test. Headless raster is software, so feel on a real GPU is **not measured**. |
| Babel standalone compiling each page | **Dismissed.** | No request for Babel on home, /faq, /about or /checkout (`probe.mjs`: babel=[]); scripts are React 18.3.1 + the 205 KB (br) design-system bundle + 139 KB (br) dictionary. |
| Class photos | Real, owned by another session. | Home laptop: three PNGs, 2.7, 2.4 and 2.3 MB. Phone home did not fetch them (images 1.6 MB). |
| Another big image, not a class photo | New lead. | `/about` loads `/photos/site/fleet-van-street.jpg` at 4.0 MB: half of the page's 8.1 MB. |
| Language runtime re-translating | Minor. | One 25 ms task at 4x CPU during load (`vamos-locale.js`); its scroll observers cost under 1 ms. It does change text heights after first paint, which adds to layout shift (below). |
| Fonts, hero photo | Minor. | Poppins ships as four `.ttf` files of about 150 KB each (650-720 KB of fonts on laptop). Hero 296 KB. FCP is 1.6-1.95 s on all pages. |
| Backdrop blur on the sticky header | **Dismissed.** | Blur removed: task time 1638 vs 1656 ms laptop, 3414 vs 3564 ms phone. |
| Arabic font stylesheet blocked by our CSP | No speed cost, a wrong font. | `fonts.googleapis.com/css2?family=Noto+Sans+Arabic` fails with a CSP violation on `/ar`; Arabic falls back to the system font. Not fixed here (Phase 20 F17). |

## Other findings

- **The page builds itself after first paint.** Layout shift (CLS, goal below 0.1): home 0.12 laptop and 0.25-0.36 phone; /faq 0.13 laptop and 0.19-0.32 phone; /about 0.17 phone; /checkout 0.00. Sources: home `#book` form grows from 112 to 304 px at about 2.2 s and the hero shifts; /faq and /about `MAIN` moves 15 px and text blocks grow when translated text replaces the first text (about 1.9-2.6 s).
- **Every page view sends 70-82 conditional requests.** Static files answer `cache-control: public, max-age=0, must-revalidate`. A second visit to home, /faq or /about: 82, 73 and 70 requests revalidated (67, 68 and 65 of them `304`), 22-27 KB transferred.
- Phone home is the one page with dropped frames in the scroll trace: 49 of about 200 frames over 25 ms, p95 50 ms, at 4x CPU; /faq, /about and /checkout show none. It stays 42-49 without Lenis.
- Remaining per-scroll work on home with both scrollers' effects removed (style recalc 430 ms on laptop, about 1000 recalcs): home's own scroll listeners (`app/home/home.dc.html`, `StreamableComponent.componentDidMount/Update`). Not touched: `app/home/*` belongs to another session.

## Not measured

A real phone or a real GPU (headless raster, frame times cap at 16.7 ms), Safari, a slow mobile network, the time a human feels the glide. CPU slowdown is an emulation. Live network varied between runs (first-paint cells move by up to 1 s between runs), so judge by the recalc counters in `cost.mjs`, which do not depend on the network. The Transfer KB column of `live.json` is not comparable between `base` and `nolenis` on home: images load as the trace scrolls.

## Server side (read-only, added after the owner's answer on caching)

- **Postgres is not the cost.** `pg_stat_statements`, app queries only: `quote_rate_book` 1293 calls at 17.3 ms mean, `quote_settings_version` 321 calls at 8.3 ms, published-reviews read 132 calls at 1.5 ms, booking reads 9-11 ms. The database is 24 MB. Performance advisors: 48 foreign keys without an index (INFO, all on small tables), 21 unused indexes, one duplicate index on `distance_bands`, one double SELECT policy on `reviews`. Nothing serious; nothing that shows on a page.
- **Calls per page view** (live, laptop): home 4 API calls plus 14 component files; /faq and /about 3 API calls plus 4 component files each. `/api/fx` is cached (1 h). `/api/reviews` (same rows for every visitor, one database read each time) and `/api/auth/session` answer `private, no-store`. Home calls `/api/quote` twice at 0.9-1.0 s each.
- Every `.dc.html` component file (14 on home) answers `max-age=0, must-revalidate`.
