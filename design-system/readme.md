# Vamos Taxi — Design System

The brand and product design system for **Vamos Taxi GmbH**, a Swiss pre-booked
transfer operator (Zurich first), and for the greenfield V1 platform being built to
replace its current agency CMS site.

> **Ride with class** — the tagline printed under the wordmark in the supplied logo files.

---

## 1. Company & product context

Vamos Taxi GmbH (Bleicherstrasse 16, 8953 Dietikon ZH · CH-020.4.077.792-7) sells
**scheduled** private transfers: airport pickups (ZRH, GVA), city and long-distance
runs including ski routes (Zermatt, St. Moritz, Verbier, Chamonix), executive
chauffeur work and corporate accounts. Customers book ahead — today for tomorrow —
get a fixed price, pay, and a driver is waiting at the agreed time.

**This is not on-demand ride-hailing.** No street hail, no surge, no live "car
arriving in 3 minutes", no driver app, no global marketplace. Every design decision
in this system should reinforce *booked ahead, priced up front, driver waiting*.

### Products represented here

| Surface | Status | In this system |
|---|---|---|
| Customer booking website (mobile-first, strong desktop) | greenfield V1 | foundations, components and the build rules — §6.1. No page files |
| Dispatcher / ops dashboard | greenfield V1 | same — the ops shell is described in §6.1, not shipped as a screen |
| Current production site `vamostaxi.eu` | Inware **Freshpage** PHP CMS — explicitly **not** forked | requirements + content source only |
| Android app `com.app.vamostaxim` | separate surface | out of scope |

Planned stack for the rebuild (matters for handoff, not for these mocks):
Next.js App Router · TypeScript · Tailwind · shadcn/ui · Supabase · Vercel ·
Mapbox · Stripe **standard** (not Connect) · Resend.

### Sources this system was built from

Read-only inputs supplied by the user — do not assume the reader has them:

- **Codebase / docs repo:** `VamosTaxi.eu/` (local mount) — same content on GitHub at
  <https://github.com/Loomlyne/VamosTaxi.eu>. Key documents:
  `docs/PROJECT-BRIEF.md`, `docs/DECISIONS.md`, `docs/INPUTS-NEEDED.md`,
  `docs/RESEARCH.md`, `docs/CURRENT-SITE-AUDIT.md`, `docs/OFFICE-HOURS-DESIGN.md`,
  `AGENTS.md`. **There is no production application code in the repo** — it is a
  brief-and-decisions repo, so this system encodes the *documented* V1 surfaces as
  rules and components, not as recreations of existing React code.
- **Brand pack:** `brand-guideline-vamos-taxi/` (local mount) — `Brand Guideline
  VAMOS TAXI.pdf`, `LOGO/`, `COLORS/`, `FONT/` (Qurova + Poppins), `PATTERNS/`,
  `SOCIAL MEDIA/`, `VOUCHER/`, `STATIONAIRY/`, `BUISNESS CARD/`, `STICKERS CAR/`.
  Brand-guide author: KAADI DESIGN (Tunis).
- **Uploaded fonts + logos:** `uploads/` (Qurova ×5, Poppins ×24, logo PNG/JPG/PDF/AI).
- **Icons:** Lucide (<https://github.com/lucide-icons/lucide>) — substitution, see
  §5 Iconography.
- **Mounted Figma file:** `Rolic.app` — an unrelated iOS UI kit that is attached to
  this project. It is **not** a Vamos source; see §4.1 for exactly what was taken
  from it and what was deliberately skipped.

Anyone extending this system should read the GitHub repo above for product truth
(scope, decisions, pending inputs) before designing new screens.

### Known contradictions in the source brand guide

Resolved here, flagged so nobody "fixes" them back:

| Conflict in the PDF | Resolution used |
|---|---|
| Two taglines: "Where every ride is first class" and "Ride with class" | **Ride with class** — it is what the logo artwork actually says |
| Type pages show Qurova, DM Sans *and* Poppins | **Qurova** display/headings, **Poppins** body/UI. DM Sans dropped |
| Neutral described as `#DEDEDE`, one plate prints `#D4632B` (orange) | `#DEDEDE`; the orange is a stray from the template |
| A mockup carries unrelated French drink copy | ignored |
| Supplied logo SVGs paint the checker `#FFC306` and the letters `rgb(22,22,22)` | artwork left verbatim; `--vt-yellow` / `--vt-charcoal` stay `#FDC20B` / `#1E1F1F` |
| Marketing claim "48,350+ routes" | not used — unverifiable |

---

## 2. Content fundamentals

**Voice:** confident, plain, second person. You address the traveller as *you*; the
company is *we*. Sentences are short and state a fact you can be held to.
Premium comes from restraint, not adjectives.

**Casing:** sentence case everywhere — headlines, buttons in long form, nav, chips.
UPPERCASE with `0.09em` tracking is a *typographic* device reserved for button
labels, field kickers, table headers, badges and eyebrows — never a whole sentence.
**Settled with the client (July 2026): CTAs stay uppercase.** The `ctaSentenceCase`
tweak survives as an override for consumers who need long in-flow labels, and
`Button` keeps its `sentenceCase` prop for the same reason.

**Person & tense:** present tense, active voice. "Your driver will be waiting at
08:15", not "A driver has been dispatched to your location."

**Emoji:** never. Not in product, not in marketing. The supplied social templates
use none.

**Numbers:** figures are set in Qurova and stated exactly — `60 minutes`, `24 hours`,
`18.4 km`, `CHF 000`. Currency is CHF, symbol first with a space.

**Never invent a CHF price.** The fare matrix is a pending client input; in mocks
every amount reads `CHF 000` / `CHF 00.00`. This rule comes from the repo's own
`AGENTS.md` and it applies to slides, decks and screenshots too.

### Examples

Good — these are the register:

- "Ride with class"
- "Reliable, fixed-price airport and corporate rides booked in under one minute."
- "Wherever you land, Vamos is ready" *(supplied social template)*
- "Airport rides made easy" *(supplied social template)*
- "Touch down, ride out — anywhere you go, Vamos Taxi takes you there" *(supplied)*
- "Fixed price before you pay · free cancellation up to 24 h"
- "60 minutes of airport waiting are included in every transfer."
- "At the agreed time your assigned driver is already there."

Wrong — do not write these:

- "WHERE EVERY RIDE IS FIRST CLASS!!!" (shouting, dead tagline)
- "Book now and save big 🚕✨" (emoji, discount voice)
- "48,350+ routes worldwide" (unverifiable marketplace claim)
- "Your ride is arriving in 3 minutes" (wrong product — this is not on-demand)
- "CHF 142.50" in a mock (invented price)

**Microcopy patterns**

- Field hints explain *why*: "Your voucher goes here", "The driver calls this number on arrival".
- Errors are instructions, not blame: "Check the flight number".
- Reassurance sits next to the money: "No charge until the last step".
- Ops copy is neutral and literal: "Awaiting payment", "Driver assigned", "Refund due".
- German is a launch language; keep strings short enough to grow ~30 %.

---

## 3. Visual foundations

### Colour

Three fixed brand colours (`COLORS/COLORS.pdf`), nothing else invented:

| Token | Hex | CMYK | Role |
|---|---|---|---|
| `--vt-yellow` | `#FDC20B` | 0/26/93/0 | the single accent: primary action, focus, active state, checker motif |
| `--vt-charcoal` | `#1E1F1F` | 75/65/60/80 | ground: headers, footers, hero, voucher, sidebar, all text |
| `--vt-grey` | `#DEDEDE` | 16/11/12/0 | hairlines, rules, disabled, quiet surfaces |

Everything else in `tokens/colors.css` is a derived tint/shade (`--vt-yellow-50…700`,
`--vt-charcoal-950…600`, `--vt-grey-500…50`) plus a small semantic set
(`--vt-success/warning/danger/info` + tints) authored in oklch **because the brand
guide defines none** and booking states need them.

Rules that keep it on-brand:

- **Yellow means action or attention. Never selection, never a large text field.**
  Selected states are a 2px charcoal border; yellow fills buttons, focus rings,
  active nav, the one metric a dispatcher must act on.
- **Only `--vt-yellow-400` and `-500` still paint yellow.** Law 02 (§8) aliases
  steps 50–300 to white/grey and 600–700 to charcoal in `tokens/laws.css`; the
  raw scale stays in `colors.css` as reference. Tinted-yellow surfaces are out.
- Charcoal on yellow. White on yellow only at display size (the social arc).
- Two background colours per screen maximum: white/`--vt-bg-page` and charcoal.
- No gradients other than the photographic scrims and the yellow arc veil.

### Type

- **Qurova** (supplied, 5 weights) — display, headings, prices, counters, references
  like `VT-4821`. Tracking `-0.02em` display / `-0.01em` headings, leading 1.04–1.18.
- **Poppins** (SIL OFL, supplied) — body, UI, labels, tables. Leading 1.6 body,
  1.45 tight.
- Scale in `tokens/typography.css`: display 1–3 (clamped), heading 1–4 (32/26/20/17),
  body lg/md/sm/xs (18/16/14/13), label md/sm (13/11 uppercase, 0.09em),
  figures lg/md/sm (38/26/19).
- Body copy never below 13px; slide text never below 24px.
- Bold-italic Poppins appears in the supplied social templates for the second line
  of a headline — a marketing device only, not UI.

### Space, radius, structure

4px base scale (4 → 128). Radii: `4px` badges · `8px` tooltips · **pill fields, no exceptions**
(`--vt-radius-field`, client direction — flip that one token back to
`--vt-radius-md` to restore the original 12px field) ·
`16px` cards · `24px` sheets/booking widget · **pill** for every button and chip.
Control heights 36/44/54 — 44px is the floor for anything a customer taps, 54px for
booking-widget fields and primary CTAs. Container 1200px, gutter `clamp(20px,5vw,56px)`.

### Cards & surfaces

White, `16px` radius, **1px `#DEDEDE` hairline plus a whisper shadow**
(`--vt-shadow-sm`). Raised/floating variants drop the border and take a bigger
neutral shadow — the booking widget is the one `--vt-shadow-lg` element on the home
page. Charcoal cards (`tone="inverse"`) carry vouchers, selected summaries and trust
blocks. No coloured left-border accents. No rounded-corner-plus-tint decoration.

### Shadows

Neutral charcoal, low spread, never black: `xs` hairline lift → `xl` dialogs.
**No coloured shadow anywhere** — law 01 (§8) sets `--vt-shadow-accent:none`, so
the yellow CTA glow this system used to ship is gone. Inner shadows are used
once, as a 1px top highlight on charcoal surfaces.

### Borders

1px `--vt-border-subtle` for structure; 2px `--vt-charcoal-900` to mean *chosen*;
`rgb(255 255 255 / .14)` on charcoal. The `PriceSummary` total sits above a 2px
charcoal rule — that rule is a brand signature, keep it.

### Photography

Supplied brand photography is **premium black vehicles in cool daylight** — a
charcoal Mercedes V-Class on a city street, a black sedan on an apron beside a
private jet, a suited chauffeur at the rear door. Cool, slightly desaturated, no
warm filter, no grain, no people-first lifestyle shots. Vehicles are always clean
and dark; the brand never shows a yellow taxi.

White type over photography **always** sits on protection: `--vt-scrim-bottom`
(bottom-up charcoal veil) or `--vt-scrim-left` (left-to-right). Never raw white text
on an unprotected photo, never a text-shadow.

### The two signature devices

1. **Checker motif** — the three yellow pixels topping the logo's *V*, taken from
   the classic taxi checkerboard and read as "digital". Used as a corner mark
   (`assets/patterns/checker-mark.png`, flush to a top-right corner, one per
   surface) or as a tile watermark at 5–8 % opacity
   (`assets/patterns/checker-tile.png`). Never centred, never inside text.
   The brand guide reads the three pixels three ways at once: the classic taxi
   checkerboard, the digital turn (pixels = tech/data), and a "spark" of ignition.
   The yellow bar crossing the *t* is the guide's second construction note — a road
   marking, so it means forward motion; never recolour or straighten it.
2. **Yellow arc** — a translucent yellow circle (`--vt-veil-yellow`, 88 % alpha)
   bleeding off the bottom of an image, carrying white display type. Straight from
   the supplied Instagram templates; used once per page as the closing CTA band.

### Transparency & blur

Sparing. Scrims and the arc veil are the sanctioned transparencies.
`--vt-blur-panel` exists for a sticky glass header over a map; do not blur cards,
do not stack glass on glass.

### Motion

Short, flat, no bounce — movement reads as *punctual*, not playful.
80ms press · 140ms hover/focus · 200ms toasts and dialogs · 320ms sheets.
Easing `cubic-bezier(.2,0,.2,1)` standard, `cubic-bezier(.16,1,.3,1)` for entrances.
Dialogs rise 10px and fade; toasts rise 8px. Nothing scales, nothing springs,
nothing loops. `prefers-reduced-motion` is honoured globally in `tokens/base.css`.

### States

- **Hover:** primary → one step darker yellow, **no glow** (§8 law 01);
  secondary → charcoal-800; ghost → grey-50 fill and charcoal border;
  rows → grey-50; links → charcoal-700.
- **Press:** darker fill **plus `translateY(1px)`**. Never a scale.
- **Focus:** 3px `rgb(253 194 11 / .45)` ring on buttons, checkboxes, rows and
  cards. **On a text field the signal is the charcoal border alone** — a yellow
  halo around a pill field reads as an error. Focus is always visible; this
  product is used one-handed at an airport.
- **Selected:** 2px charcoal border (cards, vehicles) or charcoal fill (tags, tabs).
- **Disabled:** 42 % opacity, no shadow, `not-allowed`.
- **Loading / empty:** state it in words ("Awaiting live Stripe data"), never a
  fake number or a shimmering block pretending to be data.

### Layout rules

Mobile-first, but desktop is where dispatch lives. Sticky charcoal site header
(76px). The booking widget floats over the hero on desktop and stacks first on
mobile. Quote and checkout are a two-column layout with a **sticky right rail**
(journey + fare) at `top:96px`. Ops is a fixed 236px charcoal sidebar plus a sticky
detail panel. Tables scroll, page chrome does not.

---

## 4. Components

Built in `components/`, grouped by concern. No source component library existed
(the rebuild is greenfield), so this is a standard set sized to the documented V1
surfaces — plus the transfer-specific pieces the brief demands.

**Core** — `Button`, `IconButton`, `Icon`, `Logo`, `CheckerMark`, `Card`, `Badge`, `Tag`, `Avatar`
**Forms** — `Input`, `Textarea`, `Select`, `DatePicker`, `Checkbox`, `Radio`, `Switch`, `Counter`
**Navigation** — `Tabs`, `StepIndicator`, `SectionHeader`
**Feedback** — `Alert`, `Toast`, `Tooltip`, `Dialog`, `ProgressIndicator`
**Transfer** — `VehicleCard`, `RouteSummary`, `PriceSummary`, `StatusBadge`
**Data** — `StatTile`, `Table`, `List` + `ListRow`

Each directory holds `<Name>.jsx`, `<Name>.d.ts`, `<Name>.prompt.md` and one
`@dsCard` HTML showing its states. Read the `.prompt.md` before using a component —
it carries the rules that keep usage on-brand.

### Intentional additions

The brand guide defines no UI inventory, so everything is an addition; these are the
ones worth naming because they encode product rules rather than style:

- `Icon` — wrapper around the substituted Lucide set (see §5).
- `Logo` / `CheckerMark` — render supplied artwork so nobody re-typesets the wordmark.
- `StatusBadge` — owns the booking lifecycle → colour mapping
  (quote · pending · paid · confirmed · assigned · completed · cancelled · refunded · no-show).
- `RouteSummary`, `VehicleCard`, `PriceSummary` — the three blocks the funnel,
  voucher and ops detail all reuse, so a journey and a fare never get re-typeset.
- `Counter` — passenger/luggage stepper clamped to vehicle capacity.
- `StatTile`, `Table`, `List`/`ListRow` — dispatcher primitives.
- `DatePicker` — pickup date **and** time in one control, because "when" is one decision.
- `SectionHeader`, `ProgressIndicator`, `Avatar` — see §4.1.

### 4.1 The mounted Figma kit — what was taken from it

A Figma file is mounted on this project: **`Rolic.app`** — an iOS mobile UI kit
(53 component sets + ~6,244 icon symbols, 317 Figma variables). **It is a
different product from Vamos Taxi**: Urbanist / Plus Jakarta Sans / Onest /
SF Pro type, `#597EF7` blue, and an inventory of native-iOS furniture
(`_Keys / Letter`, `System / Keyboards`, `Status bar`, `Dynamic island`,
`Action Sheets`, iPhone-notch device frames).

Nothing in it comes from the Vamos Taxi brand pack or the
`Loomlyne/VamosTaxi.eu` product docs, and Vamos V1 is responsive web only
(`docs/DECISIONS.md` 5). It is therefore kept **separate**, in
`components/mobile/` — see §4.2.

Where a kit family had a real Vamos use, it was **rebuilt in the Vamos visual
language** (charcoal/yellow, Qurova/Poppins) rather than imported:

| Kit family | Vamos component |
|---|---|
| Button · Action / Buttons · Pill Buttons | `Button` |
| Button Icon · Tool Bar / Button | `IconButton` |
| Input · Text Filed · Search Field · Tool Bar / Input | `Input`, `Textarea` |
| Picker | `Select` |
| Date Picker | `DatePicker` |
| Checkbox · Radio Button · Switch | `Checkbox`, `Radio`, `Switch` |
| Segmented Control · Navigation · Navigation Menu · Pill Bar | `Tabs` |
| Section Header · Nav title | `SectionHeader` |
| Progress Indicator · Page Dot | `ProgressIndicator` |
| Avatar · Profile Icon | `Avatar` |
| List · Item | `List` + `ListRow` |
| Tag · Dot | `Tag`, `Badge` |
| Toast · Tooltip · Diaglog [sic] | `Toast`, `Tooltip`, `Dialog`, `Alert` |
| icons (glyph set) | `Icon` over the vendored Lucide set |
| Pricing · Premium Banner | `PriceSummary`, `VehicleCard` |

The kit's ~6,244 Solar-style icon symbols are deliberately **not** imported: the
system already ships a coherent 49-glyph Lucide subset (§5), and a second
icon library would leave consumers with two competing sets.

### 4.2 `components/mobile/` — the materialized Rolic.app kit

At the user's instruction the kit's families were extracted from the mounted
`.fig` into `components/mobile/` (62 exports). They are **generated code** —
faithful to Rolic's own iOS visual language (Urbanist / Plus Jakarta Sans /
SF Pro, `#597EF7`, `--colors-*` / `--element-*` variables from
`components/mobile/fig-tokens.css`) — **not** Vamos-branded components. Do not
mix them into a Vamos surface: use `components/core|forms|navigation|feedback|transfer|data`
for anything wearing the Vamos identity.

Nine names collide with Vamos primitives and carry a `Mobile` prefix so both can
ship: `MobileAvatar`, `MobileButton`, `MobileCheckbox`, `MobileDatePicker`,
`MobileList`, `MobileProgressIndicator`, `MobileSectionHeader`, `MobileSwitch`,
`MobileTag`, `MobileToast`, `MobileTooltip`.

Controls and content: `ActionButtons`, `ActionSheets`, `ButtonIcon`, `Button3`,
`ButtonVerticalStack`, `Diaglog`, `Dot`, `Emoji`, `Icons`, `Images`, `Item`,
`NavTitle`, `Navigation`, `NavigationMenu`, `PageDot`, `Picker`, `PillBar`,
`PillButtons`, `PremiumBanner`, `Pricing`, `ProfileIcon`, `RadioButton`,
`SearchField`, `SegmentedControl`, `Slider`, `TextFiled` *(sic — the source
layer name)*, `ToolBarButton`, `ToolBarInput`.

Native iOS furniture: `StatusBar`, `DynamicIsland`, `SystemKeyboards`,
`KeysIcon`, `KeysLabel`, `KeysLetter`, `KeysNumerics`, `Delete`,
`BackgroundKeyboardBG`, `BackgroundKeyboardBG2`, `BackgroundPrimaryBG`,
`BackgroundPrimaryBG2`, `LayoutDefaultWithMicTheme`,
`LayoutDefaultWithMicTheme2`, `ThemeLightOrientationPortraitCase`,
`ThemeDarkOrientationPortraitCase`.

Scaffolding and dependencies pulled in by the above: `Based`, `Component1`,
`Cursor`, `Elements`, `Frame4811`, `LinearArrowsActionDownloadMinimalistic`,
`LinearVideoAudioSoundFull`.

Still unbuilt, and staying that way: the kit's **page frames**, not component
sets — `iPhone 13 mini - 4/5/10/47/…`, `Content`, `Conversation`, `Episodes`,
`Frame 30`, `Gapper`, `image`. They are screen artboards of the Rolic product;
recreating them would mean building someone else's app inside this design
system. Ask if you want them as a separate UI kit.

Three generated files are large (`Button3` 384 KB, `Picker` 263 KB,
`MobileDatePicker` 101 KB) because every variant is inlined — expect bundle
weight if a consumer imports them.

### 4.3 `components/mobile/icons/` — the Rolic glyph set

At the user's request the mounted kit's icon library was materialized as icon data:
**395 Solar-style glyphs** in `components/mobile/icons/icon-data.js` (name →
`{ viewBox, body }`), rendered by `MobileIcon` — named so it can never be confused
with the Vamos `Icon`. Coverage is the **Bold** and **Bold duotone** styles of the
first seven categories (arrows · arrows-action · astronomy · building &
infrastructure · business & statistics · call · design tools);
`components/mobile/icons/icons.card.html` browses them.

The kit defines roughly **6,244** glyphs in five styles. The rest are not here: the
`.fig` exposes most of them as flattened vector art inside showcase posters rather
than as components, so a complete import is a long mechanical grind — ask for it as
its own piece of work.

**Which set to use:** Vamos surfaces use the 49 Lucide masks through `Icon` (§5).
`MobileIcon` exists for the Rolic mobile kit only. Never mix them on one screen.

---

## 5. Iconography

**No icon assets were supplied.** The brand pack contains logos, patterns and
photography only; the current Freshpage site loads a Font Awesome kit that is not
redistributable and the rebuild targets shadcn/ui, whose default set is Lucide.

**Substitution (flagged):** 56 **Lucide** outline SVGs (24×24, 2px stroke, round
caps) are vendored into `assets/icons/`, from
<https://github.com/lucide-icons/lucide> (ISC licence). This is the closest match to
the brand's geometric, rounded, even-weight letterforms. *If the client has a
preferred icon set, this is the one substitution to replace.*

- Rendered through `Icon` as a **CSS mask**, so glyphs inherit `currentColor` —
  point `--vt-icon-base` at `assets/icons/` for the page and pass `name`.
- Sizes: 12 in badges · 14–16 inline and in tags · 18 in fields and buttons ·
  20–21 in nav and feature blocks · 24+ in status headers. Never stretch.
- Colour: `currentColor` by default; `--vt-yellow-700` on light yellow tiles,
  `--vt-accent` on charcoal, semantic colours only for status.
- Vocabulary the product surfaces draw on: `plane-landing` / `plane-takeoff` (airport),
  `map-pin` (address), `calendar` / `clock` (when), `users` / `luggage` (capacity),
  `car-front` / `car` / `bus` (vehicle class), `navigation` (route, distance),
  `credit-card` / `banknote` / `receipt` (money), `ticket` (coupon/voucher),
  `shield-check` (trust), `snowflake` (ski), `baby` (child seat),
  `funnel` / `search` (table controls), `ellipsis` (row actions).
- **No emoji. No unicode glyphs as icons.** Arrows are `arrow-right` /
  `chevron-right`, not `→`. The one exception is the `→` in illustrative route
  strings ("ZRH → Zermatt"), where it is text, not an icon.
- **Do not hand-draw SVG.** If a glyph is missing, add the real Lucide file to
  `assets/icons/` and reference it by name.

Added with the platform upgrade (§8): `chevron-up`, `arrow-up`, `circle-alert`,
`loader-circle`, `file-text`, `message-circle`, `share-2`, `at-sign`.

**Social marks are not in this set and cannot be.** Lucide removed its brand
icons, and Instagram / Facebook / LinkedIn marks are trademarks that must come
from each platform's own brand kit — the same treatment the payment-provider
marks get (§7). Until they are supplied, a footer states the channels in type or
uses `share-2` / `at-sign`. Do not draw an approximation.

### Brand assets on disk

| Path | What |
|---|---|
| `assets/logo/wordmark-{primary,reversed,white}.svg` | **vector** wordmark: charcoal · white+yellow · all-white |
| `assets/logo/lockup-{primary,reversed,white}.svg` | **vector** wordmark + "Ride with class" tagline |
| `assets/logo/mark-{primary,reversed,white}.svg` | **vector** V mark alone — favicon, avatar, app tile |
| `assets/logo/favicon.svg` | `mark-primary`; pages also link `mark-reversed` for dark tabs |
| `assets/logo/*.png` | the earlier PNG crops, kept for consumers that cannot take SVG |
| `assets/logo/vamos-lockup-{light,charcoal,yellow}.jpg` | original supplied square lockups |
| `assets/patterns/checker-mark.png` | the 3-pixel checker mark, transparent |
| `assets/patterns/checker-tile.png` | seamless yellow/white checkerboard |
| `assets/photography/fleet-van-street.jpg` | supplied V-Class photograph (only clean photo available) |
| `assets/brand-samples/` | supplied Instagram templates, letterhead, colour plate |
| `assets/fonts/` | Qurova ×5, Poppins ×6 + OFL licence |
| `assets/source/` | untouched copies of what was imported |

The client supplied **nine SVGs** in July 2026 (three colourways × wordmark, lockup,
mark), so nothing rasterises any more: `Logo` renders them through
`form="wordmark|lockup|mark"` and every product page links `favicon.svg`. The `.ai`
sources stay in `assets/source/`; social artwork is still PNG-only.

---

## 6. Index of this system

| Path | Contents |
|---|---|
| `styles.css` | the single entry point consumers link — `@import`s only |
| `tokens/fonts.css` | `@font-face` for Qurova + Poppins |
| `tokens/colors.css` | brand colours, derived scales, semantic set, aliases |
| `tokens/typography.css` | families, weights, display/heading/body/label/figure scales |
| `tokens/spacing.css` | space scale, radii, control heights, containers |
| `tokens/elevation.css` | shadows, rings, scrims, arc veil, glass |
| `tokens/motion.css` | durations, easings, the shared control transition |
| `tokens/base.css` | element defaults, link colours, reduced-motion |
| `tokens/laws.css` | **the four platform laws — imported last, overrides the layers above** (§8) |
| `assets/vamos-i18n-dict.js` | 128 strings × de/fr/ar + 7 patterns each, keyed by the English source string (§9) |
| `assets/vamos-locale.js` | `VamosLocale` — the one language and currency store (§9) |
| `components/mobile/fig-tokens.css` | 317 Rolic.app Figma variables (own namespace; never overrides `--vt-*`) |
| `components/mobile/fig-assets.css` | bitmap classes for the generated mobile components |
| `components/core/` | `Button` `IconButton` `Icon` `Logo` `CheckerMark` `Card` `Badge` `Tag` `Avatar` |
| `components/forms/` | `Input` `Textarea` `Select` `DatePicker` `Checkbox` `Radio` `Switch` `Counter` |
| `components/navigation/` | `Tabs` `StepIndicator` `SectionHeader` |
| `components/feedback/` | `Alert` `Toast` `Tooltip` `Dialog` `ProgressIndicator` |
| `components/transfer/` | `VehicleCard` `RouteSummary` `PriceSummary` `StatusBadge` |
| `components/data/` | `StatTile` `Table` `List` `ListRow` |
| `components/mobile/` | 62 generated exports from the mounted `Rolic.app` .fig — separate iOS visual language, see §4.2 |
| `components/mobile/icons/` | `MobileIcon` + 395 Solar-style glyphs from the same .fig, see §4.3 |
| `guidelines/` | 30 specimen cards — Laws, Colors, Type, Spacing, Motion, Brand, Localisation |
| `assets/` | logo, icons, patterns, photography, brand samples, fonts |
| `thumbnail.html` | homepage tile |
| `SKILL.md` | Agent-Skills entry point |
| `github.md` | source-repo association for one-click sync |

**Start here:** `guidelines/building-pages.html` for how to compose a surface,
`guidelines/laws.html` for the four laws, the rest of `guidelines/` for
foundations, and `components/*/*.prompt.md` for any component you touch.

### 6.1 There are no page files — build them

**This system ships foundations, components and rules. It does not ship screens.**
The booking-website and ops-dashboard reference pages, and the nine template
folders that mirrored them, were removed in August 2026. Two reasons, both worth
keeping in mind when someone proposes adding them back:

- A frozen mock of a home page goes stale the week after it is drawn, and then
  quietly contradicts the guide it sits next to.
- Consuming projects were copying a screen's layout wholesale instead of
  composing from the parts, so product decisions were being inherited from a
  mock rather than made.

Build the surface where it belongs — in the consuming project — from the
components in `_ds_bundle.js`, following the build order in
`guidelines/building-pages.html`:

1. **Content in English first**, in the register of §2. Every CHF amount is
   `CHF 000`; every policy number is a `[data-tok]` pill (§8 law 04).
2. **The shell.** Public: sticky charcoal header (76px, 60px under 1080),
   1200px container, gutter `clamp(20px,5vw,56px)`, footer. Ops: fixed 236px
   charcoal sidebar and a sticky detail panel — ops is the one surface that does
   not use the site header.
3. **Compose, never re-typeset.** A journey is `RouteSummary`, a fare is
   `PriceSummary`, a lifecycle state is `StatusBadge`, a class is
   `VehicleCard`, a stepper is `Counter`, "when" is `DatePicker`. If the block
   exists, importing it is the only correct move.
4. **Spend the accent once or twice** — primary action, focus ring, active nav.
   Two background colours per page maximum. One checker mark per surface, flush
   to a top-right corner. One arc CTA band, at the close.
5. **Run the four laws** (§8), then the breakpoints (§11) at 1080 and 680 — not
   just at 1440.
6. **Run `VamosLocale.coverage(root)`** and clear it, then read the surface in
   German at 1080px and in Arabic with `dir="rtl"` (§9).

The page head to copy is in `guidelines/building-pages.html`. In a consuming
project every path resolves against the bound `_ds/<folder>` tree, including the
three asset-base vars `--vt-icon-base`, `--vt-logo-base` and
`--vt-pattern-base` that `Icon`, `Logo` and `CheckerMark` read.

Note: `@startingPoint` is deprecated and templates are gone with the screens. If
a genuinely reusable scaffold is ever needed again, add it as a
`templates/<slug>/` Design Component — but the default answer is a rule in
`guidelines/`, not another page to keep in sync.

---

## 7. Pending client inputs that limit this system

From `docs/INPUTS-NEEDED.md` — respect these gaps rather than inventing around them.

**Still open:**

1. **CHF price matrix, fixed routes, surcharges** → every amount is `CHF 000`.
   This is the last money gap and the one rule never to design around.
2. **Vehicle photography** → only the V-Class shot exists; Economy and Business fall
   back to an icon tile.
3. **Destination / lifestyle photography** → no hero library; the one photo repeats.
4. **Payment-provider marks** (Visa, Mastercard, TWINT, PayPal, Apple Pay, cash)
   → stated in type in the footer.
5. **Policy numbers** (min advance booking, cancellation window beyond the marketed
   24 h, waiting fees, no-show) → shown as marketing claims only.
6. **Social artwork** → the supplied Instagram templates are PNG; no editable master.
7. **Social marks** (Instagram, Facebook, LinkedIn) → trademarks, not icon-set
   glyphs; they must come from each platform's brand kit. §5.

**Answered, July 2026 — do not reopen:**

- **Logo SVG + favicon** → received. Nine SVGs in `assets/logo/`; `Logo` gained
  `form="wordmark|lockup|mark"`; every product page links `favicon.svg` plus
  `mark-reversed.svg` for dark tabs. §5.
- **Vehicle class names and capacities** → the client accepted the audit values as
  they stand for V1: **Economy 3/3, Business, Van 8/8**. Treat them as real, and
  re-confirm only if the fleet changes.
- **CTA casing** → **uppercase**, as the brand guide sets it. §2.
- **German** → a launch language; `guidelines/localisation-de.html` measures every
  shipped label's growth against its German equivalent.

---

## 8. The four platform laws

Corrections the V1 product build sent back to the system, August 2026. Each one
is written as a **token value or an override rule** in `tokens/laws.css`, which
`styles.css` imports **last** — so a consumer gets the behaviour whether or not
they read this file. Moving that import up the list silently re-enables what the
build removed. Specimen: `guidelines/laws.html`.

**01 · No glow, ever.** No coloured or blurred halo on hover, focus, press or
active — not on buttons, cards, icons, links or inputs. Hover is a colour step,
press moves 1px, focus shows the ring. `--vt-shadow-accent` is now `none`, so
every existing `box-shadow:var(--vt-shadow-accent)` resolves away. On a **text
field** the focus signal is the charcoal border alone: a 3px yellow halo around
a pill field reads as an error state. Buttons, checkboxes, rows and cards keep
`--vt-ring`.

**02 · No tinted yellow.** Full-strength `#FDC20B` is a small accent. The pale
tints read as cream alert strips and the deep steps read brown; neither is the
brand. `--vt-yellow-50…300` alias to white and grey, `-600/-700` to charcoal, so
a tinted default inherited from a kit degrades to a clean surface instead of
shipping. `-400` and `-500` are untouched. This cascades automatically through
`--vt-bg-accent-tint`, `--vt-warning-tint`, `--vt-text-link-hover` and every
tinted icon tile.

**03 · Four languages, same pass.** English, German, French and Arabic. A
surface is not finished until every visible string — including `placeholder`,
`aria-label`, `title` and `alt` — resolves in the dictionary. Arabic is RTL and
first-class. §9.

**04 · A pending value is a labelled gap.** A number the client still owes us is
written as human words in a `[data-tok]` pill that appends its own TBC tag —
legible in a review, impossible to mistake for data, searchable when the answer
lands. Never `{TOKEN_NAME}`, never a plausible invented figure, and never a CHF
price (§2, §7).

```html
Cancel free up to <span data-tok>free cancel window</span> before pickup.
```

---

## 9. Four languages

Two files, no build step, no key plumbing:

```html
<script src="assets/vamos-i18n-dict.js"></script>
<script src="assets/vamos-locale.js"></script>
```

The dictionary is keyed by the **English source string exactly as it renders in
the DOM**, so a surface is written in English and translated in place.
`VamosLocale.setLang('de')` walks text nodes and the four translatable
attributes, then sets `lang` and `dir` on the document — it never reloads.

| Call | Does |
|---|---|
| `setLang('en'\|'de'\|'fr'\|'ar')` | translate in place, set `lang` + `dir`, persist |
| `setCur('CHF'\|'EUR'\|'USD')` | re-render every `[data-money]` |
| `onChange(fn)` | `fn({lang, cur})`; returns an unsubscribe |
| `t(str)` | one string in the active language |
| `money(n)` / `money(null)` | `CHF 1'250.00` / **`CHF 000`** — law 04 holds |
| `observe()` | keep translating nodes React adds after boot |
| `coverage(root)` | the list of strings that do **not** resolve yet |

**Scope, stated plainly:** the shipped dictionary is **128 strings × de/fr/ar
plus 7 regex patterns each** — the vocabulary *this design system* ships
(component labels, the booking funnel, the ops board, footer and legal chrome).
A product surface extends the same object rather than starting a second one:

```js
Object.assign(VamosI18nDict.de, { 'Your new string': '…' });
```

Deliberately **not** translated: "Ride with class" (the tagline is set artwork),
product names (`Vamos Taxi`, `Economy`, `Business`, `Van`), codes and references
(`ZRH`, `VT-4821`, `CHF`), and anything inside `[data-tok]`.

**Arabic.** Direction is a document-level switch, never a per-block hack. Put
`.vt-dir-keep` on anything that must stay LTR inside Arabic text — references,
times, flight numbers, CHF figures. `[data-vt-no-i18n]` opts a subtree out
entirely (a language switcher labels itself in its own language).

Run `VamosLocale.coverage(root)` before calling a surface finished; it returns
every string with no entry in de, fr or ar. Live specimen:
`guidelines/localisation.html`. German growth headroom:
`guidelines/localisation-de.html`.

---

## 10. Scroll

Scrolling is native. The design system ships no scroller and no scroll signal:
wheel, trackpad, touch and keyboard move the page the way the browser does.

- In-page jumps call `window.scrollTo` with `behavior: 'smooth'`, or `'auto'`
  under `prefers-reduced-motion`; the anchor offset is `−88px` (clears the 76px
  sticky header).
- A panel that owns its own scroll uses plain `overflow` plus
  `overscroll-behavior: contain`.
- Removed 2026-09-30: `assets/vamos-scroll.js` (`VamosScroll`, `--vt-scroll`,
  `vamos:scroll`). It set a custom property on `<html>` at every scroll event,
  which restyled the whole page each time, and nothing read it.

---

## 11. The responsive contract

Three breakpoints, and these are the numbers the shipped kits actually use — not
a fresh scale. Mobile-first, but desktop is where dispatch lives.

| Range | Name | What changes |
|---|---|---|
| ≥ 1181px | desktop | full nav, booking widget floats over the hero, ops runs sidebar + sticky detail panel |
| 1081–1180px | desktop narrow | `.vt-nav-lo` links drop; ops columns collapse at 1240px |
| 681–1080px | tablet | header 60px, booking widget stacks to full-width slots, hero padding tightens, 3/4-up grids go 2-up at 900px, `.vt-nav-md` drops at 1000px |
| ≤ 680px | mobile | everything 1-up, header phone pill hides at 620px, booking widget stacks first, tables scroll |

Fixed regardless of width: container `1200px`, gutter `clamp(20px,5vw,56px)`,
sticky header `76px` (60px under 1080), sticky right rail at `top:96px`, ops
sidebar `236px`, control heights 36/44/54 with **44px the floor for anything a
customer taps**. Tables scroll; page chrome does not. Body copy never below 13px.

German runs ~30 % longer than English (§2) — check a surface in DE at 1080px,
not just at 1440px, and check Arabic with `dir="rtl"` at the same width.
