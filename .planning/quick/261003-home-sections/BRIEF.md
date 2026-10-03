# Brief for every build job (quick 261003-home-sections)

Worktree (work ONLY here): `/Users/koss/Developer/VamosTaxi.eu/.claude/worktrees/design-home-sections`, branch `design/home-sections`.
Read first: `CLAUDE.md` (repo root), `.claude/CLAUDE.md`, and in this folder `PLAN.md`, `DECISIONS.md`.
Signed pictures to match: `screens/` in this folder (file names given in your job). Sketch source for exact copy and layout:
`sketch-home.js`, `sketch-more.js`, `sketch-classes.html`, `sketch-home.html` (CSS). The sketch is a picture, not code to paste:
rebuild it as a Design Component in the style of the existing sections (`app/home/HowItWorks.dc.html`, `app/home/Services.dc.html`).

## Hard rules
- Edit ONLY the files your job lists. Never edit `app/vamos-i18n-dict.js`, `app/home/home.dc.html`, or another job's file.
- Do not commit, do not push, do not run `git stash`, `git checkout`, `git reset`. The lead commits.
- Do not run the full test suites (`pnpm test*`, vitest, playwright suites). Your browser check below is enough.
- Never kill a process you did not start; never pattern-kill. Port 4792 is the lead's static server; leave it running.
- Design system only: `--vt-*` tokens, `--vt-shadow-accent:none` and `.vt-input--focus{box-shadow:none}` in `:root`/helmet,
  no glow, no `--vt-yellow-50…300` or `-600/-700`, Lucide icons via the DS `Icon` (`<x-import component-from-global-scope="VamosTaxiDesignSystem_245af1.Icon" …>`),
  logical properties only (no left/right for text), `class="vt-dir-keep"` on codes, numbers, phone numbers, `[data-*]` attributes for layout (no new class names).
- Copy: sentence case; UPPERCASE only for buttons, kickers, badges. No invented facts, no prices. Lines marked "hidden until the owner gives the text" in PLAN.md are not rendered at all (no TBC, no placeholder).
- Every state the component can be in: default, hover/press (colour or border step, `translateY(1px)` press), focus (`--vt-ring`), loading skeleton when it waits for data, empty, error. Native scrolling only; a sideways row uses `overflow-x:auto; overscroll-behavior-x:contain`.
- Language: subscribe with `this._offLocale = window.VamosLocale.onChange(v => this.setState({lang:v.lang}))` in `componentDidMount`, release in `componentWillUnmount`. Write English in markup.

## Translations (do not touch the shared dictionary)
Write every visible string (text, `aria-label`, `alt`, `title`, `placeholder`) of your component into
`.planning/quick/261003-home-sections/i18n/<JOB>.js` in this exact form (Swiss German "ss", never "ß"):

```js
window.__homeI18n = window.__homeI18n || [];
window.__homeI18n.push({
  strings: {
    'English text exactly as rendered': { de: '…', fr: '…', ar: '…' },
  },
  patterns: [ /* { re: /^Up to (\d+) passengers$/, de: 'Bis zu $1 Passagiere', fr: '…', ar: '…' } */ ],
});
```

Strings with a number or value inside go in `patterns`. Brand/product names stay Latin (Economy, Business, Van luxury, Vamos Taxi, ZRH, GVA, BSL, TWINT, Stripe, Google, Trustpilot, Tripadvisor).

## Check in a browser before you report
1. `cp app/home/<YourFile>.dc.html apps/web/public/app/home/` (component files are copied verbatim).
2. Playwright (no install): `import { chromium } from '/Users/koss/Developer/VamosTaxi.eu/node_modules/.pnpm/playwright-core@1.62.1/node_modules/playwright-core/index.mjs'`.
   Run node with the sandbox off. Open `http://127.0.0.1:4792/app/home/<YourFile>.dc.html`.
   Stub `/api/*` with `page.route` when your component fetches (example payloads in PLAN.md / below). Never call vamostaxi.site from the component test.
3. Before checking a language, merge your fragment and switch: inject your `i18n/<JOB>.js` with `page.addScriptTag({path})`, then
   `page.evaluate(() => { (window.__homeI18n||[]).forEach(f => { Object.assign(window.VamosI18n.strings, f.strings); (f.patterns||[]).forEach(p => window.VamosI18n.patterns.unshift(p)); }); window.VamosLocale.setLang('de'); })`.
4. At 1440, 1024, 768 and 390 in en, de, fr, ar: no sideways scroll (`document.documentElement.scrollWidth <= innerWidth`),
   `VamosLocale.coverage(document.body)` returns no string from your component.
5. Save screenshots to `.planning/quick/261003-home-sections/screens/built-<JOB>-<lang>-<width>.png` (en 1440, de 768, ar 390, en 390 at least).
   Write your scripts under `.planning/quick/261003-home-sections/work/<JOB>/`.

## Report back (short)
Files changed, states built, what you checked and the result, anything you could not do, any fact you were unsure of.

## Live payload examples (read-only, 2026-10-03)
`GET /api/quote` (no query) →
`{"ok":true,"classes":[{"slug":"saden","name":"Economy","effective_max_pax":3,"max_bags":3,"photo_url":"/photos/classes/…png","eligible":true},{"slug":"mercedes-benz-v-class","name":"Business","effective_max_pax":7,"max_bags":6,…},{"slug":"van-luxury","name":"Van luxury","effective_max_pax":12,"max_bags":9,…}],"fixed_routes":[{"key":"…","from":"Zurich Airport, The Circle 16-Flughafen CH, 8302 Kloten, Switzerland","to":"Davos, the Grisons, Switzerland","from_mapbox_id":"dXJuOm1ieHBvaTpmNWZiMjZhYy1kOWYwLTQ0ZTQtOTg0NC01Yjc0ZmI2YmQ0ZWM","to_mapbox_id":"dXJuOm1ieHBsYzphNmdz"},{"…":"St. Moritz, the Grisons, Switzerland","to_mapbox_id":"dXJuOm1ieHBsYzpBWjBvTEE"}]}`
Class photos live at `https://vamostaxi.site/photos/classes/…` (in a stub, use `/assets/photography/class-economy.jpg` etc.).
`GET /api/reviews` → `{"ok":true,"data":[{"id","source":"google|tripadvisor|trustpilot","authorName","authorRole","body","rating":1-5,"routeLabel","sourceUrl","verified","published","sortOrder"}]}`
(read through `window.VamosReviews`, see `app/home/Reviews.dc.html` and `app/vamos-reviews.js`).
