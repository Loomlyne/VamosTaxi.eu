# Project rules — Vamos Taxi

## The Vamos design system is the only source of visual truth
Every screen, section and component comes from the bound design system: yellow `#FDC20B` / charcoal `#1E1F1F` / grey `#DEDEDE`, Qurova display + Poppins UI, 4px space scale, pill fields and buttons, 16px cards with a `#DEDEDE` hairline. Load the bundle in every `.dc.html` `<helmet>` and compose with its components (`Button`, `Card`, `Input`, `Tabs`, `StatusBadge`, `RouteSummary`, `PriceSummary`, `Table`, `List`…) instead of restyling raw HTML.

- Never invent a colour, font, radius or shadow. If a value is missing, derive it from `var(--vt-*)` tokens or ask.
- Never restate an existing component in local CSS. Local `[data-*]` rules are for layout and things the kit has no component for.
- Amounts read `CHF 000` / `CHF 00.00` (§2). Icons come only from the vendored Lucide set through `Icon`: no hand-drawn SVG, emoji, or `→` as an icon. Exceptions: WhatsApp uses `assets/social/whatsapp*.svg` in `#25D366`; reviews use each platform's mark from `assets/reviews/` (§5).
- Photography is the supplied brand photography, on a scrim when type sits over it.

## Nothing may look AI-generated
If a screen could be mistaken for a generic AI page, it is wrong. Never: decorative or aggressive gradients, coloured glows, tinted cards with a left-border accent, pill decoration with no meaning; generic type (Inter, Roboto, Arial), emoji, filler copy, invented stats, icon-only three-column feature grids; placeholder text to fill a section (an empty-feeling section is a layout problem).

Copy follows brand voice (§2): confident, plain, second person, present tense, sentence case, short enough that German can grow 30 %. UPPERCASE only for button labels, kickers, table headers and badges.

## Repetitive patterns become components with states
A pattern used more than a couple of times becomes its own `Name.dc.html` used via `dc-import`. Declare every prop in `data-props` (variant, tone, size, state, copy). Build all states in the same pass (default, hover/press, focus, selected, disabled, loading skeleton, empty, error) and keep an in-page states gallery while under review. Add a prop rather than forking a component.

## No glow, ever
No coloured or soft glow on hover, focus, press or active states, on anything. Never `--vt-shadow-accent`, no tinted `box-shadow`, no blurred halo. Every `.dc.html` sets `--vt-shadow-accent:none` in `:root`; keep it in new components. Allowed: colour/fill/border change, `translateY(1px)` on press, neutral charcoal shadow tokens (`--vt-shadow-xs`…`-xl`), focus ring `--vt-ring`. Text inputs skip `--vt-ring`: every page sets `.vt-input--focus{box-shadow:none}` (charcoal border only); keep it.

## No tinted yellow or brownish surfaces
Brand yellow is `#FDC20B` at full strength as a small accent (primary button, badge, kicker, monogram, stamp). Never `--vt-yellow-50/-100/-200/-300` backgrounds or borders (no cream panels, pale icon tiles, tinted alerts) and never `--vt-yellow-600/-700` as text or icon colour. That includes kit components whose default is tinted: `Alert tone="accent"`, `ListRow icon=…`, `Badge tone="warning"`. Use `tone="inverse"`/`"info"`, a charcoal panel, or white with a `--vt-border-subtle` hairline; if no untinted variant exists, build from tokens. Attention comes from charcoal, full yellow on charcoal, or `--vt-danger` / `--vt-success`.

## Shared header and footer on every public page
```html
<dc-import name="SiteHeader" variant="inverse" hint-size="100%,76px"></dc-import>
…page…
<dc-import name="SiteFooter" hint-size="100%,520px"></dc-import>
```
Never hand-roll either. `variant="inverse"` (charcoal sticky) is default; `overlay` only for a hero with a photograph (home). The control row is fixed: logo, language, currency, sign in, yellow *Book a transfer* pill. No phone pill in the header (the public phone lives in `ContactFab`). `cta="{{ no }}"` drops the CTA where the booking card is in view (home). A page that relabels in place passes `lang`/`cur`/`onLang`/`onCur`; otherwise the header stores the choice and reloads. `SiteFooter` needs no props. The ops console (`ops-*.dc.html`) uses `OpsSidebar` instead.

## Legal placeholders
A value the client still owes is human words in a `data-tok` pill (CSS appends `TBC`), never `{TOKEN_NAME}`.

## Four languages in the same pass
Every page, section and component ships in English, German, French and Arabic. A surface is not finished until every visible string is in `app/vamos-i18n-dict.js` with `de`, `fr`, `ar` (Swiss German, "ss" not "ß"): labels, buttons, headings, hints, errors, empty states, badges, `placeholder`, `aria-label`, `title`, `alt`. Write the markup in English, add strings in the same pass. Concatenated strings go in `patterns` as regex entries. Only internal copy stays English (review scaffolds, client-input notes, `TBC` labels). Long legal pages that exist in some languages carry `data-vt-legal="<languages>"` on `<main>`.

## Language and currency are platform-wide
Everything reacts to one store, `app/vamos-locale.js` (loaded in every `<helmet>` after `vamos-i18n-dict.js`). Never read `localStorage.vamosLang`/`vamosCurrency` directly and never reload to apply a choice: use `VamosLocale.setLang(v)` / `.setCur(v)`. Logic classes subscribe in `componentDidMount` (`this._offLocale = window.VamosLocale.onChange(v => this.setState({lang:v.lang, cur:v.cur}))`) and release in `componentWillUnmount`. Prices: `VamosLocale.money('000')`, never a hard-coded `CHF`; the switch changes the mark, never the number. Arabic: runtime sets `dir="rtl"`; use logical properties (`margin-inline-start`, `inset-inline-end`, `padding-inline`), never `left`/`right` on anything carrying text.

## Desktop → tablet → mobile in the same pass
Check every page at 1440, 1024, 768 and 390 px before calling it done. Fluid first (`clamp()`, `minmax()`/`auto-fit`, `flex-wrap`, `min-width:0` on text flex children); breakpoints only where the shape changes. No sideways scroll at 390 px; the booking widget stacks first on mobile. Touch targets 44px (54px for booking fields and primary CTAs). German grows ~30 %, Arabic reverses.

## Scrolling is native
No smooth-scroll library (Lenis and the design-system scroller were removed 2026-09-30: they made scrolling glitch). Never add one, and never write a custom property on `<html>` from a scroll handler. In-page jumps use `window.scrollTo` with `behavior:'auto'` under `prefers-reduced-motion`, else `'smooth'`, offset -88 for the sticky header; only `home.dc.html` keeps `html{scroll-behavior:smooth}` (no-preference only). A self-scrolling panel uses `overflow` plus `overscroll-behavior: contain`.
