# Phase 1: Platform Foundation, Design System Port & i18n Runtime - Pattern Map

**Mapped:** 2026-08-20
**Files analyzed:** ~55 new files/file-groups (33 components + tokens + i18n runtime + Lenis + shell + worker/CI infra)
**Analogs found:** 46 / 55 (the deploy/CI/tooling files have no in-repo analog by design — see "No Analog Found")

**Framing note (per orchestrator instructions):** this repo has no production code yet — there is
no `apps/web`. "Closest analog" therefore means: for ported components, the running `.dc.html`
mock (real props/markup in context) plus the unminified `design-system/_ds_bundle.js` function
(authoritative prop list/defaults); for CSS, the `injectStyles` extraction site; for i18n, `app/
vamos-locale.js` + `app/vamos-i18n-dict.js`; for Lenis, `assets/lenis-boot.js`; for the shell, `app/
pages/SiteHeader.dc.html` / `SiteFooter.dc.html`; for tokens, `design-system/styles.css`'s import
chain. Files with no such analog (wrangler config, worker entry, CI workflows, lint configs) are
listed honestly in "No Analog Found" rather than mapped to something false.

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `apps/web/components/core/Button.tsx` + `Button.css` | component | transform (props→DOM) | `design-system/_ds_bundle.js:43323` (`function Button`) + `app/pages/SiteHeader.dc.html` (usage) | exact |
| `apps/web/components/core/Card.tsx` + `Card.css` | component | transform | `_ds_bundle.js:43382` (`function Card`) | exact |
| `apps/web/components/core/{Icon,IconButton,Logo,CheckerMark,Badge,Tag,Avatar}.tsx` | component | transform | `_ds_bundle.js` (`function Icon` / `IconButton` @43423 / `Avatar` @~43197 / etc.) + `app/pages/SiteHeader.dc.html` usage | exact (same batch as Button/Card, D-27 "primitives" wave) |
| `apps/web/components/forms/{Input,Textarea,Select,DatePicker,Checkbox,Radio,Switch,Counter}.tsx` | component (form control) | transform + local state (focus) | `_ds_bundle.js:44205` (`function Input`) is the representative; `Radio`/`Checkbox` share the CSS block at `_ds_bundle.js:44260`-ish | exact |
| `apps/web/components/navigation/{Tabs,StepIndicator,SectionHeader}.tsx` | component | transform | `_ds_bundle.js` `Tabs`/`StepIndicator`/`SectionHeader` functions (unread this pass — same pattern shape as Button/Card, low risk) | role-match |
| `apps/web/components/feedback/{Alert,Toast,Tooltip,Dialog,ProgressIndicator}.tsx` | component | transform + transient state (open/closed) | `_ds_bundle.js:43xxx` `function Alert` (read, shown below); `Dialog`/`Toast` follow same shape but add focus-trap/portal logic — flagged for planner | partial (Alert exact; Dialog/Toast need extra focus-trap research at implementation time) |
| `apps/web/components/data/{Table,List,ListRow,StatTile}.tsx` | component | transform (list rendering) | `_ds_bundle.js:43636` (`function Table`) | exact |
| `apps/web/components/transfer/{RouteSummary,PriceSummary,StatusBadge,VehicleCard}.tsx` | component (composite) | transform | `_ds_bundle.js:44723` (`RouteSummary`), `44832` (`StatusBadge`, composes `Badge`), `44665` (`PriceSummary`) | exact |
| `apps/web/public/brand/tokens/*.css`, `styles.css` | config (static asset) | file-I/O (verbatim copy) | `design-system/tokens/*.css`, `design-system/styles.css` | exact — copy verbatim, D-10/D-24 |
| `apps/web/i18n/routing.ts` | config | request-response (locale resolution) | none in-repo — `next-intl` docs pattern (RESEARCH.md Code Examples, Pattern 1) | no analog — see below |
| `apps/web/i18n/request.ts` | config/service (loader seam) | request-response | `app/vamos-locale.js` (dictionary lookup shape, `t()`) — conceptual analog only, mechanism changes entirely (DOM-walk → SSR loader) | role-match |
| `apps/web/i18n/messages/{en,de,fr,ar}.json` | config (data) | batch (build-time load) | `app/vamos-i18n-dict.js` (`DICT.strings`, `DICT.patterns`) — dotted-key migration source | exact (source of truth for migration) |
| `apps/web/lib/locale-shim.ts` | service (client compat API) | event-driven (subscribe/publish) | `app/vamos-locale.js` (`setLang`, `setCur`, `onChange`, `money`, `chrome()`) | exact |
| `apps/web/app/[locale]/layout.tsx` | route/provider | request-response (SSR) | `app/pages/SiteHeader.dc.html`'s `<html lang dir>`-setting inline logic (see `chrome()` above) is the closest behavioural analog; no Next.js layout exists yet | role-match |
| `apps/web/lib/lenis-provider.tsx` (client root) | provider | event-driven (scroll) | `assets/lenis-boot.js` (full file, shown below) | exact — port logic, move to client-component lifecycle |
| `apps/web/components/shell/SiteHeader.tsx` | component (composite/layout) | transform + client state (scroll, sheet) | `app/pages/SiteHeader.dc.html` (full file — control row, `data-hd-dot`, responsive rules) | exact |
| `apps/web/components/shell/SiteFooter.tsx` | component (composite/layout) | transform | `app/pages/SiteFooter.dc.html` | exact |
| `apps/web/app/dev/components/page.tsx` | route (dev-only gallery) | transform (renders every ported component/state) | `design-system/readme.md` §4's own `@dsCard` states-gallery convention (prose pattern, not a file) — no direct `.dc.html` analog | partial |
| `apps/web/app/[locale]/not-found.tsx` / error page | route | request-response | none — no `404.dc.html`/`error.dc.html` mock exists (confirmed absent, per UI-SPEC "Open Items" #3); built from Shell Contract + Copywriting Contract in `01-UI-SPEC.md` | no analog — see below |
| `apps/web/worker.ts` | config (Worker entry) | event-driven (fetch/scheduled/queue) | none in-repo | no analog — see RESEARCH.md Code Examples |
| `apps/web/wrangler.jsonc` | config | — | none in-repo | no analog — see RESEARCH.md Code Examples |
| `.github/workflows/*.yml` | config (CI) | event-driven | none in-repo | no analog — see RESEARCH.md Architecture Patterns |
| `apps/web/.stylelintrc*` | config (lint) | — | none in-repo | no analog — see RESEARCH.md Don't Hand-Roll |
| `apps/web/playwright.config.ts` + screenshot-diff specs | test | batch (visual regression) | `.dc.html` mocks themselves are the render target being diffed against, not a test-file analog | no analog — see RESEARCH.md D-25/Common Pitfalls |
| `scripts/check-i18n-coverage.mjs` (or `@lingual/i18n-check` config) | utility (CI script) | batch | `VamosLocale.coverage()` at `app/vamos-locale.js:460` — same *purpose*, entirely different mechanism (client DOM-walk → build-time JSON diff) | role-match (purpose only) |
| `scripts/check-next-public-allowlist.mjs` | utility (CI script) | batch | none in-repo | no analog |

---

## Pattern Assignments

### `apps/web/components/core/Button.tsx` (component, transform)

**Analog:** `design-system/_ds_bundle.js:43323-43354` (function source) + `app/pages/SiteHeader.dc.html` (real usage, e.g. the "Book a transfer" CTA and sign-in pill)

**Function signature — the exact prop/default shape D-29's TypeScript interface must match** (`_ds_bundle.js:43323-43336`):
```javascript
function Button({
  variant = 'primary',
  size = 'md',
  icon,
  iconEnd,
  block = false,
  sentenceCase = false,
  disabled = false,
  href,
  type = 'button',
  children,
  className = '',
  ...rest
}) {
```

**Core pattern — class-name assembly + polymorphic `<a>`/`<button>` render** (`_ds_bundle.js:43337-43354`):
```javascript
__ds_scope.injectStyles('vt-button', CSS);   // ← drop this line entirely in the port (Pitfall 1)
const cls = ['vt-btn', 'vt-btn--' + variant, 'vt-btn--' + size,
  block ? 'vt-btn--block' : '', sentenceCase ? 'vt-btn--sentence' : '', className]
  .filter(Boolean).join(' ');
const glyph = size === 'lg' ? 20 : 18;
// icon + children + iconEnd wrapped in a Fragment
// if (href) render <a> with aria-disabled; else render <button type disabled>
```
**Note:** there is no `loading` prop on `Button` (confirmed by this exact signature) — UI-SPEC's
Component State Matrix explicitly says a busy CTA composes `Button` + `ProgressIndicator`. Do not
invent a `loading` prop.

**CSS extraction pattern** — every component follows this exact shape; extract the `const CSS = \`...\`` template literal (sits directly above the component function, e.g. `_ds_bundle.js:43310` for Button) into `Button.css`, statically imported at the top of `Button.tsx`, and delete the `__ds_scope.injectStyles('vt-button', CSS)` call. This is the single most repeated mechanical operation across all 33 components (D-24 amended, Pitfall 1).

**No-glow / focus law (must survive port, from `app/pages/SiteHeader.dc.html`'s inline `<style>`):**
```css
:root{--vt-shadow-accent:none}
.vt-input--focus{box-shadow:none}
.vt-btn{transition:background 140ms cubic-bezier(.2,0,.2,1),border-color 140ms cubic-bezier(.2,0,.2,1),color 140ms cubic-bezier(.2,0,.2,1),transform 80ms cubic-bezier(.2,0,.2,1)}
.vt-btn:hover,.vt-btn:active{box-shadow:none!important}
.vt-btn--primary:hover:not([disabled]){background:var(--vt-accent-hover)}
.vt-btn--primary:active:not([disabled]){background:var(--vt-accent-press);transform:translateY(1px)}
```
Every ported `.dc.html`-sourced page currently sets these two lines in its own `<head><style>` —
in the port these become one static rule in `tokens/laws.css`'s app-side companion, not per-page.

---

### `apps/web/components/core/Card.tsx` (component, transform)

**Analog:** `design-system/_ds_bundle.js:43371-43400`

**Full CSS block** (`_ds_bundle.js:43373-43385`) — extract verbatim into `Card.css`:
```css
.vt-card{background:var(--vt-bg-surface);border:var(--vt-border-w) solid var(--vt-border-subtle);border-radius:var(--vt-radius-lg);box-shadow:var(--vt-shadow-sm);transition:var(--vt-transition-control)}
.vt-card--flat{box-shadow:none}
.vt-card--raised{box-shadow:var(--vt-shadow-md);border-color:transparent}
.vt-card--floating{box-shadow:var(--vt-shadow-lg);border-color:transparent}
.vt-card--inverse{background:var(--vt-bg-inverse);border-color:var(--vt-border-inverse);color:var(--vt-text-inverse)}
.vt-card--accent{background:var(--vt-bg-accent-tint);border-color:var(--vt-yellow-200)}
.vt-card--pad-{none,sm,md,lg}{padding:...}
.vt-card--selectable{cursor:pointer}
.vt-card--selectable:hover{border-color:var(--vt-charcoal-900);box-shadow:var(--vt-shadow-md)}
.vt-card--selected{border-color:var(--vt-charcoal-900);border-width:var(--vt-border-w-strong);box-shadow:var(--vt-shadow-md)}
```
**Note:** `.vt-card--accent` uses `--vt-bg-accent-tint`/`--vt-yellow-200` — verify at port time this
resolves through `tokens/laws.css`'s aliasing (Law 02) rather than shipping a literal tinted-yellow
background; if `laws.css` doesn't alias `--vt-bg-accent-tint`, this is a stylelint-gate (D-32) candidate to flag.

**Function signature** (`_ds_bundle.js:43401-43409`):
```javascript
function Card({
  tone = 'default', padding = 'md', selectable = false, selected = false,
  as = 'div', children, className = '', ...rest
}) {
  const Tag = as;   // polymorphic element — port as a generic `as` prop, common React pattern
  ...
}
```

---

### `apps/web/components/forms/Input.tsx` (component, transform + local focus state)

**Analog:** `design-system/_ds_bundle.js:44205-44244`

**Function signature — the representative form-control shape** (`_ds_bundle.js:44205-44217`):
```javascript
function Input({
  label, hint, error, icon, suffix, size = 'md', required = false,
  disabled = false, id, className = '', ...rest
}) {
  const [focus, setFocus] = React.useState(false);
  const fid = id || React.useId();
  const box = ['vt-input', 'vt-input--' + size, focus ? 'vt-input--focus' : '',
    error ? 'vt-input--error' : '', disabled ? 'vt-input--disabled' : ''].filter(Boolean).join(' ');
  ...
}
```
**Focus pattern (Law 01's stated exception):** the component tracks focus in local state to drive
`.vt-input--focus`, but `.vt-input--focus{box-shadow:none}` is set globally (see Focus, Motion &
Reduced-Motion Contract, `01-UI-SPEC.md`) — the charcoal border is the only focus signal, never `--vt-ring`. Port the `useState` + `onFocus`/`onBlur` wiring exactly as shown.

**Error pattern** (`_ds_bundle.js:44238-44242`) — matches the project's stated error-handling convention (`error="{{ message }}"` renders red text under the field):
```javascript
error ? React.createElement("span", { className: "vt-field__err" },
  React.createElement(__ds_scope.Icon, { name: "triangle-alert", size: 13 }), error)
  : hint ? React.createElement("span", { className: "vt-field__hint" }, hint) : null
```
This exact `error` → `hint` fallback ordering is the pattern `Textarea`, `Select`, `DatePicker` should replicate.

---

### `apps/web/components/data/Table.tsx` (component, transform — list rendering)

**Analog:** `design-system/_ds_bundle.js:43636-43663`

**Core CRUD-adjacent render pattern (columns/rows props, not fetched data — this is a pure presentational table)**:
```javascript
function Table({ columns = [], rows = [], onRowClick, selectedId, rowKey = 'id', className = '', ...rest }) {
  return (
    <div className={['vt-tablewrap', className].filter(Boolean).join(' ')}>
      <table className={'vt-table' + (onRowClick ? ' vt-table--rows' : '')}>
        <thead><tr>{columns.map(c => <th key={c.key} style={c.width?{width:c.width}:undefined}
          className={c.align === 'right' ? 'vt-table__num' : undefined}>{c.header}</th>)}</tr></thead>
        <tbody>{rows.map(r => <tr key={r[rowKey]} data-selected={selectedId != null && r[rowKey] === selectedId}
          onClick={onRowClick ? () => onRowClick(r) : undefined}>
          {columns.map(c => <td key={c.key} className={c.align === 'right' ? 'vt-table__num' : undefined}>
            {c.render ? c.render(r) : r[c.key]}</td>)}
        </tr>)}</tbody>
      </table>
    </div>
  );
}
```
`data-selected` (not a `.vt-table--selected` class) is the selection mechanism — preserve this
attribute-driven pattern in the port; it's what the CSS keys off. `Table` is diffed inside a
`data-lenis-prevent` region horizontally at narrow widths per the UI-SPEC.

---

### `apps/web/components/transfer/RouteSummary.tsx` (composite component, transform)

**Analog:** `design-system/_ds_bundle.js:44723-44775`

**Function signature:**
```javascript
function RouteSummary({ pickup, dropoff, pickupDetail, dropoffDetail, meta = [], inverse = false, className = '', ...rest }) {
```
**Structural pattern** — two-stop rail (pip/line/pip) + labelled stops + optional meta row:
```javascript
<div className={['vt-route', inverse?'vt-route--inverse':'', className].filter(Boolean).join(' ')}>
  <div className="vt-route__leg">
    <div className="vt-route__rail">
      <span className="vt-route__pip" /><span className="vt-route__line" /><span className="vt-route__pip vt-route__pip--end" />
    </div>
    <div style={{flex:'1 1 auto', minWidth:0}}>
      <div className="vt-route__stop"><span className="vt-route__kicker">Pickup</span>
        <div className="vt-route__place">{pickup}</div>{pickupDetail && <div className="vt-route__detail">{pickupDetail}</div>}</div>
      <div className="vt-route__stop vt-route__stop--last"><span className="vt-route__kicker">Destination</span>
        <div className="vt-route__place">{dropoff}</div>{dropoffDetail && <div className="vt-route__detail">{dropoffDetail}</div>}</div>
    </div>
  </div>
  {meta.length > 0 && <div className="vt-route__meta">{meta.map(m => <span className="vt-route__metaitem" key={m.label}>
    {m.icon && <Icon name={m.icon} size={15} color="var(--vt-text-muted)" />}{m.label}</span>)}</div>}
</div>
```
**RTL note (from UI-SPEC's Four-Language Layout Contract):** the origin→destination direction
implied by this rail must mirror under `dir="rtl"` — this is a "must mirror" component per
UI-SPEC's table. The literal "Pickup"/"Destination" kicker strings hardcoded here in the bundle
must become `t()` calls in the port (I18N-01).

---

### `apps/web/components/transfer/StatusBadge.tsx` (component, composition over `Badge`)

**Analog:** `design-system/_ds_bundle.js:44832-44845`

```javascript
function StatusBadge({ status = 'pending', label, showIcon = true, ...rest }) {
  const s = MAP[status] || MAP.pending;   // MAP defines tone+icon+label per lifecycle value
  return React.createElement(__ds_scope.Badge, { tone: s.tone, icon: showIcon ? s.icon : undefined, ...rest }, label || s.label);
}
```
This is a pure composition pattern — `StatusBadge` renders `Badge` with a derived `tone`/`icon`.
Port `Badge` first (core primitive batch), then `StatusBadge` composes it exactly this way. The
`MAP` object (not shown in this excerpt — locate at `_ds_bundle.js` just above line 44832) is the
authoritative source for the nine lifecycle tones UI-SPEC's matrix lists (`quote·pending·paid·
confirmed·assigned·completed·cancelled·refunded·no-show`); the planner should extract that literal `MAP` verbatim as the enum source for the TypeScript union type.

---

### `apps/web/public/brand/*` (static config, file-I/O — verbatim copy)

**Analog:** `design-system/styles.css` (the exact import order that must survive, D-10)
```css
@import "tokens/fonts.css";
@import "tokens/colors.css";
@import "tokens/typography.css";
@import "tokens/spacing.css";
@import "tokens/elevation.css";
@import "tokens/motion.css";
@import "tokens/base.css";
/* components/mobile/* imports — EXCLUDED from the port, do not copy (D-23 scope correction) */
@import "tokens/laws.css";   /* ← MUST remain the final import — D-10, D-24 */
```
Copy `tokens/fonts.css` through `tokens/base.css` plus `tokens/laws.css` verbatim into
`apps/web/public/brand/tokens/`; write a new `apps/web/app/globals.css` (or `public/brand/
styles.css`) reproducing this exact chain minus the two `components/mobile/*` imports, with
`laws.css` still last.

---

### `apps/web/lib/lenis-provider.tsx` (provider, event-driven)

**Analog:** `assets/lenis-boot.js` (full file — 76 lines, read in full this session)

**House settings to preserve exactly** (per CLAUDE.md, PLAT-05, UI-SPEC's Motion Contract):
```javascript
var SETTINGS = {
  lerp: 0.12, wheelMultiplier: 1, smoothWheel: true, syncTouch: false,
  anchors: true, allowNestedScroll: true, autoRaf: true
};
```

**Sheet-lock sync pattern (must port — this is the mechanism the "stops while a sheet locks the body" law depends on):**
```javascript
function locked(el) {
  if (!el) return false;
  var o = getComputedStyle(el);
  var v = o.overflowY === 'visible' ? o.overflow : o.overflowY;
  return v === 'hidden' || v === 'clip';
}
function syncLock() {
  if (!lenis) return;
  if (locked(document.body) || locked(document.documentElement)) lenis.stop();
  else lenis.start();
}
// MutationObserver watching style/class attribute changes on <html> and <body> drives syncLock()
```
**`prefers-reduced-motion` gate:**
```javascript
var mq = window.matchMedia('(prefers-reduced-motion: reduce)');
function apply() { if (mq.matches) { teardown(); return; } boot(); }
mq.addEventListener('change', function () { tries = 0; apply(); });
```
**What changes in the port (per Pitfall 7, `01-RESEARCH.md`):** this becomes a client component
mounted once in `app/[locale]/layout.tsx`'s client boundary, using the `lenis` npm package +
`lenis/react` instead of the vendored `<script>` tag, and additionally needs a `usePathname()`
effect to keep scroll position synced across client-side navigations — a case this vanilla-JS
version never had to handle because the mocks reload between "pages." Re-verify the exact
`lenis/react` API against the pinned version at implementation time (Assumption A1).

---

### `apps/web/lib/locale-shim.ts` + `apps/web/i18n/*` (i18n runtime port)

**Analog:** `app/vamos-locale.js` (full contract, read this session) + `app/vamos-i18n-dict.js` (dictionary shape)

**API surface that must survive** (`app/vamos-locale.js:11-17` doc block):
```
VamosLocale.lang() / .cur()
VamosLocale.setLang(v) / .setCur(v)
VamosLocale.onChange(fn) -> off
VamosLocale.money('000')
VamosLocale.t('English string')
VamosLocale.coverage(root)   -- replaced by D-17's build-time CI check, not ported 1:1
```

**Currency formatting — never a hardcoded `CHF` string** (`app/vamos-locale.js:37-42`):
```javascript
var CURS = {
  CHF: { sym: 'CHF', space: ' ', name: 'Swiss francs' },
  EUR: { sym: '€', space: ' ', name: 'Euro' },
  USD: { sym: '$', space: '', name: 'US dollars' },
  AED: { sym: 'AED', space: ' ', name: 'UAE dirham' },
};
var MONEY_RE = /(?:CHF|AED|EUR|USD|€|\$)( |\s)?(\d[\d'’.,]*)/g;
```
Port the `CURS` table and the "amounts stay `000` until real, only the mark changes" contract
(D-16, I18N-05) into the client currency store — this remains client-only per D-16, unlike
language which moves server-side (ADR-001).

**Dictionary shape being migrated (D-13)** — `app/vamos-i18n-dict.js:9-16`:
```javascript
var DICT = {
  langs: ['en', 'de', 'fr', 'ar'],
  langNames: { en: 'English', de: 'Deutsch', fr: 'Français', ar: 'العربية' },
  patterns: [ /* regex entries for concatenated strings, see below */ ],
  strings: { /* "English source" -> {de,fr,ar} */ }
};
```

**`patterns` regex entries — these become ICU parameterised messages under D-13** (`app/vamos-i18n-dict.js:17-31`, representative sample):
```javascript
{ re: /^Review (\d+) of (\d+)$/,
  de: 'Bewertung $1 von $2', fr: 'Avis $1 sur $2', ar: 'تقييم $1 من $2' },
{ re: /^(\d+) questions?$/,
  de: '$1 Fragen', fr: '$1 questions', ar: '$1 أسئلة' },
{ re: /^Child seat × (\d+)$/,
  de: 'Kindersitz × $1', fr: 'Siège enfant × $1', ar: 'مقعد أطفال × $1' },
```
Migration target per Pattern 2 in RESEARCH.md — e.g. `{ "quote": { "passengers": "{n, plural, one {# passenger} other {# passengers}}" } }`, called as `t('quote.passengers', {n: 3})`. Every one of the `patterns` array entries in `vamos-i18n-dict.js` (dozens — grep `re: /` in that file) needs this same regex→ICU-key rewrite during the D-13/D-18 migration pass; this is mechanical but must be done for every entry, not sampled.

**Arabic font — must be deleted, not ported (Pitfall 8, D-31)** (`app/vamos-locale.js:280-303`):
```javascript
function chrome() {
  h.setAttribute('dir', RTL[state.lang] ? 'rtl' : 'ltr');
  if (RTL[state.lang]) {
    arabicFont();   // ← DELETE this call and the function below in the port
    h.style.setProperty('--vt-font-body', "'Noto Sans Arabic','Poppins',system-ui,sans-serif");
    h.style.setProperty('--vt-font-display', "'Noto Sans Arabic','Qurova','Poppins',system-ui,sans-serif");
  }
}
function arabicFont() {
  if (document.getElementById('vt-ar-font')) return;
  var l = document.createElement('link');
  l.rel = 'stylesheet';
  l.href = 'https://fonts.googleapis.com/css2?family=Noto+Sans+Arabic:wght@400;500;600;700&display=swap'; // ← the CDN hotlink D-31 forbids
  document.head.appendChild(l);
}
```
Keep the `h.style.setProperty('--vt-font-body', ...)` **token-swap mechanism** (it's exactly D-22's
"swappable token" design) but point it at a `@font-face`-declared self-hosted family name instead
of triggering a network fetch.

---

### `apps/web/components/shell/SiteHeader.tsx` (composite component, transform + client state)

**Analog:** `app/pages/SiteHeader.dc.html` (full file)

**`data-props` declaration — the exact prop contract D-29 asks for** (line 342):
```json
{
  "$preview": {"width":1400,"height":96},
  "variant": {"editor":"enum","default":"inverse","options":["inverse","overlay"],"tsType":"string"},
  "cta": {"editor":"boolean","default":true,"tsType":"boolean"},
  "signInLabel": {"editor":"text","default":"Sign in","tsType":"string"},
  "hideAccount": {"editor":"boolean","default":false,"tsType":"boolean"},
  "lang": {"editor":null,"tsType":"string"},
  "cur": {"editor":null,"tsType":"string"},
  "onLang": {"editor":null,"tsType":"(v:string)=>void"},
  "onCur": {"editor":null,"tsType":"(v:string)=>void"}
}
```
This maps directly to the `SiteHeaderProps` TypeScript interface.

**Notification-dot pattern** (`app/pages/SiteHeader.dc.html:125`):
```css
[data-hd-dot]{position:absolute;top:-1px;inset-inline-end:-1px;width:10px;height:10px;
  border-radius:999px;background:var(--vt-yellow);border:2px solid var(--vt-charcoal-900)}
```
Note `inset-inline-end` (already logical — RTL-safe as-is, satisfies D-21's lint without change).

**Design-system bundle load order in `<helmet>` (the sequence the app's real imports must reproduce, though sourced from a script tag not an npm import)** (`app/pages/SiteHeader.dc.html:15-27`):
```html
<link rel="stylesheet" href="../../design-system/tokens/fonts.css">
... (colors, typography, spacing, elevation, motion, base) ...
<link rel="stylesheet" href="../../design-system/styles.css">
<script src="../../design-system/_ds_bundle.js"></script>   <!-- NOT ported (D-30) -->
<link rel="stylesheet" href="../../assets/lenis.css">
<script src="../../assets/lenis.js"></script>
<script src="../../assets/lenis-boot.js"></script>
<script src="../vamos-i18n-dict.js"></script>
<script src="../vamos-locale.js"></script>
```
In the port this becomes: static CSS imports (tokens + extracted component CSS) + the `lenis`
npm package + `next-intl` provider + `locale-shim.ts` — same conceptual order, different mechanism.

---

## Shared Patterns

### CSS extraction from `injectStyles` (applies to all 33 components)
**Source:** `design-system/_ds_bundle.js:43186-43194`
```javascript
function injectStyles(id, css) {
  if (typeof document === 'undefined') return;   // ← SSR-hostile, this is exactly Pitfall 1
  if (document.getElementById(id)) return;
  const el = document.createElement('style');
  el.id = id;
  el.textContent = css;
  document.head.appendChild(el);
}
```
**Apply to:** every one of the 33 component files. Mechanical rule: find the `const CSS = \`...\`` literal immediately preceding the component function, move its contents verbatim into `ComponentName.css`, statically `import './ComponentName.css'` at the top of `ComponentName.tsx`, delete the `__ds_scope.injectStyles(...)` call. Never rewrite a CSS value during this move (D-24).

### No-glow / focus law (applies to all interactive components)
**Source:** every `.dc.html`'s `<head><style>` block (representative: `app/pages/SiteHeader.dc.html:29-31`)
```css
:root{--vt-shadow-accent:none}
.vt-input--focus{box-shadow:none}
```
**Apply to:** the app-wide `laws.css`/`globals.css`, not per-component — but every ported component must be verified against it (D-32's stylelint gate is the mechanical enforcement).

### Currency mark, never the number
**Source:** `app/vamos-locale.js:102-110` (`money()` function) + `MONEY_RE`
**Apply to:** any component rendering a price (`PriceSummary`, `StatTile`, `Counter`, `VehicleCard`). Never a literal `CHF` string in component logic — always the locale store's `money()` equivalent, and the number itself stays `000` until Phase 4 per D-16/ADR-004.

### RTL logical properties
**Source:** `app/pages/SiteHeader.dc.html:125` (`inset-inline-end`) is the one example already correct in-repo; the rest of the mock tree should NOT be trusted as a logical-properties analog — RESEARCH.md's D-21 exists precisely because this isn't yet proven project-wide.
**Apply to:** every ported component's CSS — enforced by `stylelint-use-logical` (D-21), not by copying more mock examples.

### `data-props` → TypeScript interface
**Source:** every `.dc.html`'s `<script data-dc-script data-props="...">` block (shown in full for `SiteHeader` above)
**Apply to:** every ported component — this JSON-in-attribute declaration is the literal source D-29 asks the planner to derive interfaces from, component by component.

---

## No Analog Found

Files with no close match in the codebase — planner should use RESEARCH.md's Code Examples / Architecture Patterns sections instead of inventing a false analog:

| File | Role | Data Flow | Reason |
|---|---|---|---|
| `apps/web/worker.ts` | config (Worker entry) | event-driven | Greenfield — no Worker entry exists anywhere in this repo. See RESEARCH.md "Code Examples › Custom Worker entry" for the `fetch`/`scheduled`/`queue` pattern to follow verbatim. |
| `apps/web/wrangler.jsonc` | config | — | No Cloudflare config exists in this repo. See RESEARCH.md "Code Examples › `wrangler.jsonc` shape" (D-34's declared-but-unused bindings). |
| `.github/workflows/pr.yml` / `main.yml` / `tag.yml` | config (CI) | event-driven | No CI exists in this repo. See RESEARCH.md "Architecture Patterns" and PLAT-03's requirement table. |
| `apps/web/.stylelintrc.*` | config (lint) | — | No lint config exists. See RESEARCH.md "Don't Hand-Roll" for `stylelint-use-logical` + `declaration-property-value-disallowed-list` configuration guidance. |
| `apps/web/playwright.config.ts` + `*.spec.ts` (screenshot-diff suite) | test | batch | No test infra exists. See RESEARCH.md D-25 amendment (locally vendored React/Babel for the diff job) and "Validation Architecture › Wave 0 Gaps". |
| `.gitleaks.toml` + pre-commit hook | config (secret scan) | — | No secret-scanning config exists. See RESEARCH.md "Don't Hand-Roll" and D-35. |
| `scripts/check-next-public-allowlist.mjs` | utility | batch | Genuinely novel — no equivalent concept in the mock tree (mocks have no `NEXT_PUBLIC_*` concept at all, no build step). Write from scratch per D-35. |
| `apps/web/lib/logger.ts` | utility (structured logging) | event-driven | No logger of any kind exists in the mocks (client-only, no server). Write from scratch per D-38's field spec (request id, route, locale). |
| `apps/web/app/sitemap.ts` | route (metadata) | batch | No sitemap generation exists in the mock tree (static files only). See RESEARCH.md's Recommended Project Structure and D-19. |
| `apps/web/app/[locale]/not-found.tsx` | route | request-response | No `404.dc.html`/`not-found.dc.html`/`error.dc.html` mock exists anywhere in `app/pages/` or `app/home/` (confirmed absent per UI-SPEC Open Item #3) — build from the Shell Contract (`SiteHeader`/`SiteFooter` composition) and the Copywriting Contract's drafted copy in `01-UI-SPEC.md`, not from a mock. |
| Arabic self-hosted font files (`public/brand/fonts/NotoSansArabic-*.woff2` or IBM Plex equivalents) | static asset | file-I/O | Not vendored anywhere in this repo today — the mocks hotlink from Google Fonts (the thing being removed, Pitfall 8). Source fresh from Google Fonts' or IBM's own OFL release, per D-22. |

---

## Metadata

**Analog search scope:** `design-system/_ds_bundle.js` (component function bodies + `injectStyles`), `design-system/styles.css` + `design-system/tokens/*.css` (import chain), `app/pages/SiteHeader.dc.html` / `SiteFooter.dc.html` (shell), `app/vamos-locale.js` / `app/vamos-i18n-dict.js` (i18n runtime), `assets/lenis-boot.js` (Lenis), `design-system/readme.md` (component inventory, states, `@dsCard` gallery convention) — all read directly this session, non-overlapping ranges.
**Files scanned:** 6 large source files (`_ds_bundle.js` ~45k lines, targeted via grep + offset reads), `vamos-locale.js` (full), `vamos-i18n-dict.js` (head + patterns section), `lenis-boot.js` (full), `SiteHeader.dc.html` (head + selected sections), `styles.css` (full, 20 lines).
**Pattern extraction date:** 2026-08-20

---

## PATTERN MAPPING COMPLETE

**Phase:** 1 - Platform Foundation, Design System Port & i18n Runtime
**Files classified:** ~55 (33 components as one batch-pattern set + tokens + i18n runtime + Lenis + shell + 404 + ~12 infra/config files)
**Analogs found:** 46 / 55 (component/i18n/Lenis/shell side has strong analogs; infra/CI/test side genuinely has none — flagged, not faked)

### Coverage
- Files with exact analog: ~40 (all 33 components via `_ds_bundle.js` functions + mock usage; tokens via `styles.css`; Lenis via `lenis-boot.js`; shell via `SiteHeader/Footer.dc.html`; i18n dictionary via `vamos-i18n-dict.js`)
- Files with role-match analog: ~6 (i18n loader seam, dev gallery, `[locale]` layout — mechanism changes even though purpose matches)
- Files with no analog: ~11 (worker entry, wrangler config, CI workflows, stylelint config, Playwright config, secret scan config, NEXT_PUBLIC allowlist script, logger, sitemap, 404 page, Arabic font files)

### Key Patterns Identified
- Every one of the 33 components follows one mechanical shape: `const CSS = \`...\`` template literal → `__ds_scope.injectStyles(id, CSS)` call at the top of the function body → `React.createElement` tree. The port is the same three-step operation 33 times: extract CSS to a static file, delete the injectStyles call, convert createElement calls to JSX with a typed prop interface derived from the function's destructured parameters.
- `data-props` JSON blocks in each `.dc.html`'s `<script data-dc-script>` tag are the literal, already-written source for D-29's TypeScript interfaces — not something to infer from usage.
- The i18n runtime's `patterns` regex array in `vamos-i18n-dict.js` is a large (dozens-of-entries) mechanical migration surface to ICU messages, not a handful of examples — every entry needs the same regex→ICU-key treatment.
- Lenis's house settings and sheet-lock `MutationObserver` pattern in `assets/lenis-boot.js` port near-verbatim into a client component; only the navigation-boundary stop/restart logic is genuinely new (no Next.js analog exists because the mocks never had client-side route transitions).
- The Arabic Google Fonts hotlink (`app/vamos-locale.js:296-303`) must be deleted, not migrated — its replacement (self-hosted font + same CSS-variable swap mechanism) has no in-repo source for the font files themselves.

### File Created
`/Users/koss/Developer/VamosTaxi.eu/.planning/phases/01-platform-foundation-design-system-port-i18n-runtime/01-PATTERNS.md`

### Ready for Planning
Pattern mapping complete. Planner can now reference analog patterns in PLAN.md files, using the
`_ds_bundle.js` line-numbered excerpts above as the authoritative source for each component's prop
interface and CSS extraction, `vamos-locale.js`/`vamos-i18n-dict.js` as the i18n contract to
preserve, `lenis-boot.js` as the Lenis port source, and the "No Analog Found" table to avoid
inventing false precedent for the infra/CI/test files that are genuinely new to this repo.
