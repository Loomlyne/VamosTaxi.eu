# Project rules — Vamos Taxi

## The Vamos design system is the only source of visual truth
Every screen, section and component comes out of the bound Vamos Taxi design system —
yellow `#FDC20B` / charcoal `#1E1F1F` / grey `#DEDEDE`, Qurova display + Poppins UI, the
4px space scale, pill fields and buttons, 16px cards with a `#DEDEDE` hairline. Load the
bundle in every `.dc.html` `<helmet>` and compose with its components (`Button`, `Card`,
`Input`, `Tabs`, `StatusBadge`, `RouteSummary`, `PriceSummary`, `Table`, `List`…) instead
of restyling raw HTML to look like them.

- Never invent a colour, a font, a radius or a shadow. If a value is missing, derive it
  from the tokens (`var(--vt-*)`) or ask — do not guess a hex.
- Never restate a design-system component in local CSS when the component exists. Local
  `[data-*]` rules are for layout and for things the kit genuinely has no component for.
- Amounts always read `CHF 000` / `CHF 00.00` (§2). Icons always come from the vendored
  Lucide set through `Icon` — never hand-drawn SVG, never emoji, never `→` as an icon.
- Photography is the supplied brand photography, on a scrim when type sits over it.

## Nothing may look AI-generated
The test for every screen is: could this be mistaken for a generic AI-generated page? If
yes, it is wrong. Concretely, none of these ever appear in this product:

- Aggressive or decorative gradients, coloured glows, tinted cards with a left-border
  accent, rounded-pill-everything decoration that carries no meaning.
- Generic type (Inter, Roboto, Arial), emoji, stock-sounding filler copy, invented stats,
  three-column "feature" grids of icons that say nothing.
- Padding sections with placeholder text to fill a page — an empty-feeling section is a
  layout problem, not a content gap.

Copy follows the brand voice in §2 of the design system: confident, plain, second person,
present tense, sentence case, short enough that German can grow 30 %. UPPERCASE is a
typographic device for button labels, kickers, table headers and badges only.

## Anything new and repetitive becomes a component with states
When a pattern shows up more than a couple of times — a row, a card, a badge, a field
group, a panel — do not copy-paste it into each page. Build it once as its own
`Name.dc.html` Design Component and use it through `dc-import` everywhere it appears.

- Give it real props and declare each one in `data-props`, so the whole thing is
  tweakable from the host: variant, tone, size, state, copy.
- Build every state it will ever need in the same pass — default, hover/press, focus,
  selected, disabled, loading (skeleton), empty, error — and make each state reachable
  by using the component, not only by a prop.
- Keep an in-page states gallery for it while it is being reviewed, so a reviewer can see
  all states side by side without hunting for them.
- Do not fork a component to change one value; add the prop.

## Never use glow effects
No glow anywhere in this application, ever. No coloured/soft glow on hover, focus,
press or active states — not on buttons, cards, icons, links, inputs or anything else.
Specifically: never `--vt-shadow-accent` (the design system's yellow button-hover glow),
no `box-shadow` with a coloured tint, no blurred halo behind an element.

Every `.dc.html` sets `--vt-shadow-accent:none` in its `:root` block so the design
system's own primary-button hover glow is neutralised — keep that line when creating new
Design Components in this project.

Allowed instead, for hover/press/focus: a colour or fill change, a border change,
`translateY(1px)` on press, and the neutral charcoal shadow tokens
(`--vt-shadow-xs`…`--vt-shadow-xl`) plus the focus ring `--vt-ring`.

Text inputs are the one exception to `--vt-ring`: every page also sets
`.vt-input--focus{box-shadow:none}` so a focused field shows only the charcoal border,
no yellow ring. Keep that line too.

## Never use tinted yellow or brownish surfaces
The brand yellow is `#FDC20B` at full strength, used as a small accent: a primary button,
a badge, a kicker, a monogram, a stamp label. The pale-yellow tints and the brown-ish
yellow text are **not** part of this product's palette, on any surface, ever:

- No `--vt-yellow-50` / `-100` / `-200` / `-300` backgrounds or borders — no cream panels,
  no pale-yellow icon tiles, no tinted alert strips.
- No `--vt-yellow-600` / `-700` as a text or icon colour. It reads brown, not gold.
- That includes design-system components whose own default is tinted: `Alert tone="accent"`
  (yellow-50), `ListRow icon=…` (yellow-50 lead tile, yellow-700 glyph), `Badge
  tone="warning"`. Use `tone="inverse"` / `tone="info"`, a charcoal panel, or plain white
  with a `--vt-border-subtle` hairline instead — and when a kit component has no untinted
  variant, build the piece from tokens rather than shipping the tint.

Attention is carried by charcoal, by full-strength yellow on a charcoal ground, or by the
semantic `--vt-danger` / `--vt-success` — never by a wash of pale yellow.

## Every page uses the shared header and footer
`SiteHeader` and `SiteFooter` are mandatory on every public page — old ones and any new
one. Never hand-roll a header or footer.

```html
<dc-import name="SiteHeader" variant="inverse" hint-size="100%,76px"></dc-import>
…page…
<dc-import name="SiteFooter" hint-size="100%,520px"></dc-import>
```

- `variant="inverse"` is the default: charcoal sticky bar. Use it everywhere.
- `variant="overlay"` is only for a page whose hero already carries a photograph —
  the same control row, transparent, sitting on the image. Home uses it.
- The control row is fixed and identical on every page: logo, language, currency,
  sign in, and a yellow *Book a transfer* pill. There is no phone pill in the header
  (removed 2026-09-20, #45): the public phone lives in the `ContactFab` overlay. Pass `cta="{{ no }}"` to drop
  the CTA on a page that already has the booking card in view (home).
- A page that relabels itself in place without reloading passes
  `lang`/`cur`/`onLang`/`onCur`; otherwise the header stores the choice and reloads.
- `SiteFooter` needs no props — the wordmark band and payment marks are on by default.

The ops console (`ops-*.dc.html`) is the one exception: it is a signed-in dispatch
surface and uses `OpsSidebar` instead.

## Placeholders in legal copy
A value the client still owes us is written as human words in a `data-tok` pill, never as
`{TOKEN_NAME}`. The pill's CSS appends a `TBC` tag, so it reads as "Free cancel window
TBC" — a labelled gap, not a broken template.

## Four languages, no exceptions, in the same pass
Every page, every section, every component ships in **English, German, French and
Arabic**. A surface is not finished — not "for now", not "this cycle", not "English
only until M004" — until every visible string it renders exists in
`app/vamos-i18n-dict.js` with `de`, `fr` and `ar`. This applies to new components as
much as to pages: build the markup in English, then add its strings in the same pass,
before calling the work done.

- That includes labels, buttons, headings, hints, errors, empty states, badge labels,
  `placeholder`, `aria-label`, `title` and `alt`.
- Strings the code concatenates go in `patterns` as a regex entry — never leave a
  built string untranslated because it has a number in it.
- Arabic is a first-class language, not an afterthought: `dir="rtl"` is applied by the
  runtime, so lay out with logical properties and check the page in Arabic before
  saying it is done.
- The only copy that stays English on purpose is internal: review scaffolds,
  client-input notes, `TBC` placeholder labels.
- A long-form legal page that genuinely only exists in some languages carries
  `data-vt-legal` so the runtime says so, instead of pretending.

## Language and currency are platform-wide, never per-section
Every new page, section or component must react to the language and currency choice.
There is one store and one broadcast: `app/vamos-locale.js` (loaded in every page's
`<helmet>` after `app/vamos-i18n-dict.js`).

```html
<script src="vamos-i18n-dict.js"></script>
<script src="vamos-locale.js"></script>
```

- **Never** read `localStorage.vamosLang` / `vamosCurrency` directly and never reload the
  page to apply a choice. Use `VamosLocale.setLang(v)` / `.setCur(v)`; both relabel the
  whole page in place.
- A logic class that keeps `lang`/`cur` in state subscribes in `componentDidMount`:
  `this._offLocale = window.VamosLocale.onChange((v) => this.setState({ lang: v.lang, cur: v.cur }))`,
  released in `componentWillUnmount`.
- **Write new copy in English in the markup, then add every visible string to
  `app/vamos-i18n-dict.js`** (`de`, `fr`, `ar` — Swiss German, "ss" not "ß"). The runtime
  translates text nodes plus `placeholder`, `aria-label`, `title` and `alt`, and re-runs on
  every React re-render, so a section needs no translation table of its own. Strings the
  code concatenates go in `patterns` as a regex entry.
- Prices: never a hard-coded `CHF` string in logic — `VamosLocale.money('000')`. Amounts
  stay `000` (design system §2); the currency switch changes the mark, never the number.
- Arabic is a supported language: the runtime sets `dir="rtl"` and swaps in an Arabic type
  fallback, so lay out with logical properties (`margin-inline-start`, `inset-inline-end`,
  `padding-inline`) and never `left`/`right` for anything that carries text.
- Long-form legal pages carry `data-vt-legal="<languages the text exists in>"` on `<main>`;
  the runtime then shows a notice instead of pretending the page is translated.
- Anything internal (review scaffolds, client-input notes) stays English on purpose.

## Build every surface desktop → tablet → mobile, in that pass
No screen is "desktop for now". Each new page or section is laid out for all three from
the start and checked at 1440, 1024, 768 and 390 px before it is called done.

- Fluid first: `clamp()` for type and page gutters, `minmax()`/`auto-fit` grids, `flex-wrap`,
  `min-width:0` on flex children that hold text. Breakpoints only where the layout has to
  change shape, not to patch overflow.
- Nothing may scroll sideways at 390 px, and the booking widget stacks first on mobile.
- Touch targets stay 44px minimum (54px for booking-widget fields and primary CTAs).
- German strings grow ~30 % and Arabic reverses direction — a layout that only fits
  English is not finished.

## Smooth scrolling is Lenis, everywhere
Every page loads the vendored Lenis (darkroomengineering/lenis, MIT) from `assets/`:

```html
<link rel="stylesheet" href="../assets/lenis.css">
<script src="../assets/lenis.js"></script>
<script src="../assets/lenis-boot.js"></script>
```

`assets/lenis-boot.js` owns the single instance and the house settings (lerp 0.12, no
bounce, `anchors:true`, `allowNestedScroll:true`, native touch, `prefers-reduced-motion`
honoured, and it stops the instance while a sheet locks the body). Never construct a
second `Lenis`, never re-add `scroll-behavior:smooth`, and put `data-lenis-prevent` on any
panel that owns its own scroll.
