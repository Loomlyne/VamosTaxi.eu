# Coding Conventions

**Analysis Date:** 2026-08-17

## Overview

This codebase is in design-phase (Phase 0–1 of build). Production app code does not yet exist. Conventions documented here are **product rules** from binding documents (`CLAUDE.md`, `design-system/readme.md §8 "The four platform laws"`) and **current code patterns** in design mocks (`app/` Design Components). The production build will enforce these via linting (`design-system/_adherence.oxlintrc.json`) and code review gates.

## The Four Platform Laws (binding)

These are **non-negotiable** product constraints, not style preferences. Every surface must pass these rules before "done".

### Law 01 · No Glow, Ever

**Rule:** No coloured or blurred halo on hover, focus, press, or active states — not on buttons, cards, icons, links, inputs, or anything else.

**What this means:**
- `--vt-shadow-accent: none` must be set in every `.dc.html` file's `:root` style block (neutralises design system's default yellow button hover glow)
- Text inputs get `.vt-input--focus { box-shadow: none }` — focus signal is the charcoal border only (no yellow ring)
- **Allowed instead:** colour step on hover · `translateY(1px)` on press · `--vt-ring` (charcoal/yellow ring) on focus for buttons, checkboxes, rows, cards
- Neutral shadow tokens (`--vt-shadow-xs`…`--vt-shadow-xl`) are OK; yellow/tinted shadows are not

**File locations enforcing this:**
- `design-system/tokens/laws.css` (imported last, overrides everything)
- Every `.dc.html` file in `app/` sets both lines in `<helmet><style>:root { --vt-shadow-accent: none } .vt-input--focus { box-shadow: none }</style></helmet>`

### Law 02 · No Tinted Yellow

**Rule:** `#FDC20B` at full strength as a small accent only. Never pale-yellow tints and never brownish-yellow.

**What this means:**
- Never use `--vt-yellow-50` / `-100` / `-200` / `-300` as backgrounds or borders (cream panels, pale icon tiles, tinted alert strips are banned)
- Never use `--vt-yellow-600` / `-700` as text or icon colour (reads brown, not gold)
- This includes design-system component defaults that ship tinted: `Alert tone="accent"` (yellow-50), `ListRow icon=…` (yellow-50 lead), `Badge tone="warning"` — use `tone="inverse"` / `tone="info"` / charcoal / white with `--vt-border-subtle` hairline instead
- When a kit component has no untinted variant, build from tokens rather than shipping the tint
- Attention is carried by: charcoal · full-strength yellow on charcoal · semantic `--vt-danger` / `--vt-success`

**File locations enforcing this:**
- `design-system/tokens/laws.css` aliases `--vt-yellow-50…300` to white/grey and `-600/-700` to charcoal automatically
- `design-system/tokens/colors.css` defines the raw scale; only `-400` and `-500` remain yellow

### Law 03 · Four Languages, Same Pass

**Rule:** Every page, section, component ships in **English, German, French, Arabic** before "done". Not "later", not "English-only until M004".

**What this means:**
- Every visible string — including `placeholder`, `aria-label`, `title`, `alt` — must resolve in `app/vamos-i18n-dict.js` with `de`, `fr`, `ar`
- Strings the code concatenates go in `patterns` as regex entries (never untranslated because it has a number)
- Arabic is RTL and first-class: lay out with **logical properties** (`margin-inline-start`, `inset-inline-end`, `padding-inline`), never `left`/`right` for anything carrying text
- The runtime sets `dir="rtl"` on the document when Arabic is active
- Long-form legal pages that genuinely only exist in some languages carry `data-vt-legal="<languages>"` on `<main>` instead of pretending
- Internal copy (review scaffolds, TBC labels) stays English on purpose
- Production: `vamos-i18n-dict.js` becomes the `content_strings` table; admin edit UI is the ops Content screen; routes get `hreflang` (`/de/…`)

**Verification:**
- Run `VamosLocale.coverage(root)` on every new surface — it returns the list of untranslated strings
- Check the surface in German at 1080px (strings grow ~30%) and in Arabic with `dir="rtl"`

### Law 04 · A Pending Value is a Labelled Gap

**Rule:** A number the client still owes us stays a human-worded `[data-tok]` pill, never `{TOKEN_NAME}`, never an invented figure.

**What this means:**
- Markup: `<span data-tok>free cancel window</span>` before pickup
- CSS appends `TBC`, so it reads "free cancel window TBC" — legible in review, impossible to mistake for data, searchable when the answer lands
- Never invent a CHF price, even in tests or fixtures visible to a reviewer (Phase 4 flag `pricing_live=false` keeps checkout disabled until the owner approves the real matrix)
- Use `VamosLocale.money(null)` → `CHF 000` for placeholder amounts; `money(n)` only when the real number lands
- Production: `data-tok` pills disappear one at a time as answers land; the number comes from the `settings` table, not copy
- Punch list: `grep -r 'data-tok' app/` + `docs/LEGAL-PLACEHOLDER-CHECKLIST.md` tracks who owes each one

## Naming Patterns

### Files

**Design Components (pages & sections):**
- Pattern: `PascalCase.dc.html`
- Examples: `home.dc.html`, `SiteHeader.dc.html`, `AuthForm.dc.html`, `OpsReviews.dc.html`
- Scope: Page files live in `app/home/`, `app/pages/`, `app/ops/`; shared components live in `app/home/`, referenced via `<dc-import name="ComponentName" …>`

**Pages (customer-facing):**
- Pattern: `kebab-case.dc.html` or `PascalCase.dc.html` depending on component type
- Examples in `app/pages/`: `checkout.dc.html`, `confirmation.dc.html`, `sign-in.dc.html`, `account.dc.html`, `manage-booking.dc.html`, `about.dc.html`, `terms.dc.html`

**Shared runtimes:**
- Pattern: `vamos-*.js`
- Examples: `vamos-locale.js`, `vamos-i18n-dict.js`, `vamos-ops-data.js`, `vamos-reviews.js`, `vamos-page-transition.js`
- Loaded in every page's `<helmet>` after design-system bundle

**Support scripts:**
- Pattern: `support.js`
- Copied to each folder (`app/`, `app/home/`, `app/pages/`, `app/ops/`); they are identical

### CSS Custom Properties

**Design system tokens:**
- Pattern: `--vt-*`
- Namespaces:
  - `--vt-yellow`, `--vt-charcoal`, `--vt-grey` (brand colours)
  - `--vt-yellow-*`, `--vt-charcoal-*`, `--vt-grey-*` (tint scales)
  - `--vt-success`, `--vt-warning`, `--vt-danger`, `--vt-info` (semantic colours)
  - `--vt-font-display`, `--vt-font-body` (typography families)
  - `--vt-heading-*`, `--vt-body-*`, `--vt-label-*` (type scales)
  - `--vt-shadow-*` (elevation), `--vt-ring` (focus ring), `--vt-blur-panel` (glass)
  - `--vt-radius-field`, `--vt-radius-*` (border radius)
  - `--vt-transition-control`, `--vt-transition-sheet` (motion)
  - `--vt-scrim-bottom`, `--vt-scrim-left` (photography protection)

**Design system CSS classes:**
- Pattern: `.vt-*`
- Examples: `.vt-input--focus`, `.vt-nav-lo`, `.vt-nav-md`, `.vt-dir-keep` (keep LTR inside RTL text)
- Never invent local CSS class names; use `[data-*]` for layout rules instead

### Data Attributes

**Layout & state:**
- Pattern: `data-*` (hyphenated)
- Examples: `data-bookcard="1"`, `data-upto-wide="1"`, `data-hide-narrow="true"`, `data-fields="1"`, `data-sugroot="1"`, `data-shell="1"`, `data-sheetbody="1"`, `data-sheetonly="1"`, `data-scroll-native` (native scrolling inside region), `data-lenis-prevent` (nested scroller — Lenis skips it), `data-om-label="Flight"` (observer/instrumentation)
- **Purpose:** Responsive layout rules hang off these attributes; they are **never class selectors** (CSS classes are design-system only)
- **Localisation:** `data-i18n-skip` opts a subtree out of translation; `data-vt-legal="<languages>"` marks legal pages with restricted language coverage

**Pending values:**
- Pattern: `data-tok`
- Markup: `<span data-tok>policy number here</span>`
- CSS in `design-system/tokens/laws.css` appends ` TBC` visually

**Component props (Design Components):**
- Pattern: `data-props` declaration in the component's `<helmet>` (not visible in mocks, but tooling reads it for documentation)

## Code Style

### Markup Language

**Files:** Plain HTML (`*.dc.html`), no JSX, no transpilation at build time.

**Syntax:** HTML5 + inline `style=""` + React-like JS template literals for dynamic content.

**Templates:** Double-brace syntax for variable substitution: `{{ variableName }}`

**Conditionals:** `<sc-if value="{{ condition }}" hint-placeholder-val="true">…</sc-if>`

**Loops:** `<sc-for list="{{ array }}" as="item" hint-placeholder-count="3">…</sc-for>`

**Component import (Design Components):**
```html
<dc-import name="SiteHeader" variant="inverse" hint-size="100%,76px"></dc-import>
```

**Component import (Design System components):**
```html
<x-import component-from-global-scope="VamosTaxiDesignSystem_245af1.Button" 
  variant="primary" size="md" onClick="{{ handler }}" hint-size="140px,36px">Label</x-import>
```

### Styling

**Inline styles only** — never local CSS classes. Exceptions: design-system class names (`.vt-*`) and rare `[data-*]` layout rules in a `<style>` block.

**Use logical properties for RTL:** `margin-inline-start` (not `margin-left`), `inset-inline-end` (not `right`), `padding-inline` (not `padding-left/right`) for anything that carries text or is affected by `dir="rtl"`.

**Responsive:** Fluid first with `clamp()` for type and gutters, `minmax()`/`auto-fit` for grids, `flex-wrap`, `min-width:0` on flex children holding text. Breakpoints only where layout shape changes, not to patch overflow.

**Motion:** Use token variables: `transition: var(--vt-transition-control)` (140ms, form focus/hover), `transition: var(--vt-transition-sheet)` (320ms, sheet entrance). Never `scroll-behavior: smooth` (Lenis owns it).

**Design system usage:** Every component comes through `x-import component-from-global-scope="VamosTaxiDesignSystem_245af1.<ComponentName>"` — `Button`, `Input`, `Card`, `Badge`, `Icon`, `Logo`, `Counter`, `DatePicker`, `RouteSummary`, `PriceSummary`, `StatusBadge`, `Table`, `List`/`ListRow`, etc. Keep class names verbatim when porting to React (CSS stays unchanged).

### JavaScript

**Language:** Plain JavaScript (ES2020+). No JSX in mocks; production app is Next.js 15 with TypeScript.

**Components in mocks:**
```javascript
class Component extends DCLogic {
  state = { … };
  
  componentDidMount() {
    // Subscribe to global stores
    this._offLocale = window.VamosLocale.onChange(v => this.setState({ lang: v.lang, cur: v.cur }));
  }
  
  componentWillUnmount() {
    this._offLocale?.();
  }
  
  render() { return … }
}
```

**Global stores (runtime contracts, not to be broken):**
- `window.VamosLocale` — language + currency; `setLang()`, `setCur()`, `onChange()`, `t()`, `money()`, `coverage()` (verification of translation completeness)
- `window.VamosOps` — ops data; collections + singletons with `all()`, `get()`, `add()`, `update()`, `onChange()`, `reset()`
- `window.VamosAuth` (customer) and `window.VamosOpsAuth` (staff) — placeholder auth mocks; production uses Supabase Auth + custom JWT claims

**Handlers & event names:** Event handlers are `on<EventName>` in camelCase (`onClick`, `onChange`, `onFocus`, `onKeyDown`). Custom DOM events (for cross-page messaging) use kebab-case: `vamos:scroll`, `vamos:navigate`.

**Localisation in logic:**
- Never read `localStorage.vamosLang` / `vamosCurrency` directly; always use `VamosLocale.setLang(v)` / `setCur(v)`
- Never reload the page to apply a choice; `setLang()` relabels the DOM in place
- For concatenated strings (e.g., "60 minutes waiting included"), put them in `patterns` in `vamos-i18n-dict.js` as regex entries
- For currency: always use `VamosLocale.money(amount)`, never hard-coded `CHF` strings

**Money values in mocks:** All amounts are `CHF 000` until the client's price matrix lands (Phase 4 gate: `pricing_live=false` keeps this in force). Verification: `grep -r "CHF [0-9]" app/` should return nothing until Phase 9 flag flip.

## Responsive Design

### Breakpoints (no breakpoint media queries needed; use fluid + logical properties)

| Range | Name | Use |
|-------|------|-----|
| ≥ 1181px | desktop | full nav, booking widget floats over hero, ops runs sidebar + sticky detail panel |
| 1081–1180px | desktop narrow | nav links drop (`.vt-nav-lo`), ops columns collapse at 1240px |
| 681–1080px | tablet | header 60px, booking widget stacks, hero padding tightens, grids go 2-up at 900px, `.vt-nav-md` drops at 1000px |
| ≤ 680px | mobile | all 1-up, header phone pill hides at 620px, booking widget stacks first, tables scroll |

### Fixed Constraints

- Container: `1200px`
- Gutter: `clamp(20px, 5vw, 56px)`
- Sticky header: `76px` (60px under 1080px)
- Sticky right rail (quote/checkout): `top: 96px`
- Ops sidebar: fixed `236px`
- Control heights: `36px` (small) / `44px` (standard, minimum for touch) / `54px` (booking widget fields and primary CTAs)
- Nothing scrolls sideways at 390px
- Touch targets: **44px minimum** (54px for booking-widget fields and primary CTAs)
- Body copy: never below 13px
- German text grows ~30%; Arabic reverses direction — check every new surface in both before saying done

### Implementation Patterns

**Fluid sizing:**
```css
font-size: clamp(14px, 2.5vw, 18px);  /* type that scales with viewport */
padding: clamp(20px, 5vw, 56px);      /* gutter that adapts */
```

**Responsive grids:**
```css
display: grid;
grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));  /* 1-up on mobile, 2/3-up on desktop */
gap: clamp(12px, 3vw, 24px);
```

**Flex for text:**
```css
display: flex;
min-width: 0;  /* critical: allows text overflow inside flex children */
```

**Data attributes for layout changes:**
```html
<div data-upto-wide="1">…</div>  <!-- visible ≤ 1080px -->
<div data-hide-narrow="true">…</div>  <!-- hidden ≤ 680px -->
```

## Localisation

### Dictionary Structure

**File:** `app/vamos-i18n-dict.js`

**Format:** Object keyed by English source string (as it appears in the DOM):
```javascript
const VamosI18nDict = {
  en: { … },  // source; no values, just key presence
  de: { "Flight number": "Flugzahl", … },
  fr: { "Flight number": "Numéro de vol", … },
  ar: { "Flight number": "رقم الرحلة", … }
};

// Regex patterns for concatenated strings:
VamosI18nDict.patterns = {
  de: [
    [/(\d+)\s+minutes?\s+waiting/, "$1 Minuten Wartezeit"],
    …
  ],
  …
};
```

**Production:** This becomes the `content_strings` table (key, en/de/fr/ar columns); admin edit UI is the ops Content screen.

### Runtime API

| Call | Behaviour |
|------|-----------|
| `VamosLocale.setLang('en'\|'de'\|'fr'\|'ar')` | relabel entire page in place (no reload), set `lang` + `dir`, persist |
| `VamosLocale.setCur('CHF'\|'EUR'\|'USD'…)` | re-render every `[data-money]` element |
| `VamosLocale.onChange(fn)` | subscribe to lang/cur changes; `fn({lang, cur})`; returns unsubscribe |
| `VamosLocale.t(str)` | one string in active language (keyed by English source) |
| `VamosLocale.money(n)` | `CHF 1'250.00` or `CHF 000` if `n` is `null` |
| `VamosLocale.observe()` | keep translating nodes React adds after boot (production only) |
| `VamosLocale.coverage(root)` | list untranslated strings under a DOM node — **run on every new surface before calling done** |

### Arabic-Specific

- The runtime sets `dir="rtl"` on the document; never set it per-element
- Use logical properties everywhere: `margin-inline-start`, `inset-inline-end`, `padding-inline`, `float: inline-start`
- Put `.vt-dir-keep` on anything that must stay LTR inside Arabic: references, times, flight numbers, CHF figures, codes like `VT-4821`
- Use `[data-i18n-skip]` to opt a subtree out of translation (e.g., a language switcher that labels itself in its own language)
- Check every new surface in Arabic with `dir="rtl"` before saying done; `VamosLocale.coverage(root)` must return empty

## Lenis Smooth Scrolling

**Rule:** Lenis owns scrolling everywhere; one instance per page, vendor configuration only.

### Implementation

**Load in every page `<helmet>`:**
```html
<link rel="stylesheet" href="../../assets/lenis.css">
<script src="../../assets/lenis.js"></script>
<script src="../../assets/lenis-boot.js"></script>
```

**House settings (non-negotiable):**
- Lerp: `0.12` (smooth but responsive)
- No bounce
- `anchors: true` (auto-navigate to `#hash` links)
- `allowNestedScroll: true` (regions can own their scroll)
- Native touch + keyboard + scrollbar drag
- `prefers-reduced-motion` honoured globally

**Marking nested scrollers:**
- Put `data-lenis-prevent` on any panel that owns its own scroll (tables, the ops board, code blocks)
- Lenis skips these regions

**Never:**
- Construct a second `Lenis()` instance
- Re-add `scroll-behavior: smooth` anywhere
- Use `Lenis` for programmatic scrolling instead of `VamosScroll.scrollTo('#anchor', { offset: -96 })` (adjusts for sticky header)

**Production:** Confirm `Lenis` is configured identically in Next.js route wrappers; if Lenis is already in the app, delete the vendored file and rely on the package, configured with the same settings.

## Copy Voice

**Casing:**
- **Sentence case** — headlines, buttons in long form, nav, chips (only the first word and proper nouns capitalised)
- **UPPERCASE** — button labels, field kickers, table headers, badges, eyebrows (typographic emphasis only, never a whole sentence)
- CTAs are **uppercase** (settled with client, July 2026)

**Register:**
- Confident, plain, second person — address the traveller as *you*; the company is *we*
- Short sentences stating facts you can be held to
- Present tense, active voice: "Your driver is waiting at 08:15" not "A driver has been dispatched"
- Never: emoji, invented stats, stock filler copy, "48,350+ routes worldwide" (unverifiable)

**Money, numbers, time:**
- Figures set in Qurova, stated exactly: `60 minutes`, `24 hours`, `18.4 km`
- Currency always `CHF` with a space: `CHF 000` (mocks) / `CHF 1'250.00` (when real)
- Never invent a price, even in tests or screenshots
- Use `VamosLocale.money()` in logic; amounts stay `000` in markup until the matrix lands

**Microcopy:**
- Field hints explain *why*: "Your voucher goes here"
- Error messages are instructions, not blame: "Check the flight number"
- Reassurance near money: "No charge until the last step"
- Ops copy is neutral and literal: "Awaiting payment", "Driver assigned", "Refund due"
- German strings grow ~30%; keep hints short

**Never:**
- "Ride with class" (tagline is set artwork, never change it)
- Product names vary (always `Vamos Taxi`, `Economy`, `Business`, `Van`)
- Codes/references change (always `ZRH`, `CHF`, `VT-4821`)
- Copy inside `[data-tok]` pills (those are pending client input, translate them in place)

## Error Handling

**Pattern:** Errors are instructions, never blame.

**Display:**
- Form field: `error="{{ message }}"` on the component; it renders in red with the text
- Toast/alert: semantic colour (`--vt-danger` for critical, `--vt-warning` for recoverable)
- HTTP: graceful degradation (flight autofill API down → prompt for manual time)
- Validation: "Check the flight number" not "Invalid flight"

**Recovery:**
- Always offer next step (retry, alternative, contact support)
- Keep error state until the user fixes the input

## Comments

**When to comment:**
- Complex business logic (pricing surcharge calculation, RLS policy intent)
- Non-obvious state management (why a flag is in localStorage vs Supabase)
- Workarounds and their expiry conditions

**JSDoc/TSDoc (production):**
- Every exported function gets a doc block
- Parameter types and return types required
- Link to design spec or issue if not obvious
- Example: `/** Locks a quote for 30 minutes or until payment. See Phase 4 in GSD-LAUNCH.md. */`

**In mocks:**
- Scaffold comments explain special decisions (e.g., why the boot overlay exists; why icon URLs are declared in `<meta>`)
- No verbose commenting of obvious code

## Icon Usage

**Source:** Lucide only, through the `Icon` component (`assets/icons/` folder).

**Rule:** No emoji, no hand-drawn SVG, no unicode glyphs as icons. The one exception is `→` in route strings ("ZRH → Zermatt"), where it is text, not an icon.

**Vocab the product uses:**
- Navigation: `plane-landing`, `plane-takeoff`, `map-pin`, `navigation`, `arrow-right`, `chevron-*`
- Time/date: `calendar`, `clock`, `calendar-days`
- Capacity: `users`, `luggage`, `baby` (child seat)
- Vehicle: `car-front`, `car`, `bus`
- Money/receipt: `credit-card`, `banknote`, `receipt`, `ticket` (coupon), `funnel` (filter)
- Actions: `pencil` (edit), `log-out`, `menu`, `search`, `ellipsis` (more), `plus`, `minus`
- Status: `check`, `circle-check`, `shield-check`, `bell` (notification), `circle-alert`, `triangle-alert`
- Other: `snowflake` (ski route), `briefcase` (business class), `info`

**Added with platform upgrade (§8):** `chevron-up`, `arrow-up`, `circle-alert`, `loader-circle`, `file-text`, `message-circle`, `share-2`, `at-sign`

**If a glyph is missing:** Add the real Lucide file to `assets/icons/` and reference it by name. Do not approximate or draw.

**Social marks:** Instagram, Facebook, LinkedIn are trademarks (from brand kits, not icon sets). Payment marks (Visa, Mastercard, TWINT) are typed in the footer until supplied.

## File Structure Guidance

### Where to Add New Code

**New page component:**
- Location: `app/pages/<name>.dc.html` (public) or `app/ops/<name>.dc.html` (staff)
- Shell: use `<dc-import name="SiteHeader" …>` + page content + `<dc-import name="SiteFooter">`
- Exception: ops uses `<dc-import name="OpsSidebar">` instead of header

**Shared section component:**
- Location: `app/home/<ComponentName>.dc.html` or `app/ops/<ComponentName>.dc.html`
- Example: `Reviews.dc.html`, `FAQ.dc.html`, `AuthForm.dc.html`
- Import via `<dc-import name="ComponentName" …>` in parent page

**Shared runtime (global store/helper):**
- Location: `app/vamos-*.js`
- Pattern: `vamos-<purpose>.js` (e.g., `vamos-locale.js`, `vamos-ops-data.js`)
- Loaded in every page after design-system bundle

**Styles:**
- No local CSS files in mocks (design system tokens only)
- Production: copy `design-system/tokens/` and `design-system/styles.css` into `apps/web/public/brand/` (or wire via `@import` in `app/globals.css`); `tokens/laws.css` **must** stay the last import

**Design tokens:**
- Never invent colours, shadows, radii, or type scales — use `--vt-*` tokens or derive from them
- Never override design-system token values in local CSS — they are enforced by law

### Responsive Layout Checklist

Before marking a surface "done":

1. **Visual diff at 1440, 1024, 768, 390px** — against the mock
2. **German at 1080px** — strings grow ~30%; does everything still fit?
3. **Arabic at 1080px with `dir="rtl"`** — logical properties work, no LTR leakage
4. **Touch targets ≥ 44px** (54px for booking widget and primary CTAs)
5. **Lenis running** — no page reloads, one instance, `data-lenis-prevent` on nested scrollers
6. **Focus visible everywhere** — keyboard-navigable, focus ring shows
7. **The four laws hold:** no glow, no tinted yellow, `CHF 000`/`data-tok` intact, four languages present
8. **`VamosLocale.coverage(root)` returns empty** — no untranslated strings

---

*Convention analysis: 2026-08-17*
