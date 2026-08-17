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
| Customer booking website (mobile-first, strong desktop) | greenfield V1, in design freeze | `ui_kits/booking-website/` |
| Dispatcher / ops dashboard | greenfield V1 | `ui_kits/ops-dashboard/` |
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
  brief-and-decisions repo, so the UI kits here are recreations of the *documented*
  V1 surfaces, not of existing React components.
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
- Charcoal on yellow. White on yellow only at display size (the social arc).
- Two background colours per screen maximum: white/`--vt-bg-page` and charcoal.
- No gradients other than the photographic scrims and the yellow arc veil.
- **No tinted yellow or brownish-yellow surfaces.** `--vt-yellow-50…300` as a
  background and `--vt-yellow-600/700` as a text or icon colour are out of the palette:
  the tints read as cream alert strips, the deep steps read brown. `tokens/laws.css`
  aliases all six to neutrals. Attention is charcoal, full-strength yellow on charcoal,
  or the semantic `--vt-danger` / `--vt-success` — never a wash. §8.

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
Inner shadows are used once, as a 1px top highlight on charcoal surfaces.

**Nothing glows.** `--vt-shadow-accent` — the yellow 34 %-alpha halo this system used to
put under a hovered primary button — is set to `none` in `tokens/laws.css`, and no
coloured tint or blurred halo replaces it on any element. §8.

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

- **Hover:** primary → one step darker yellow, no glow; secondary → charcoal-800;
  ghost → grey-50 fill and charcoal border; rows → grey-50; links → yellow-700.
- **Press:** darker fill **plus `translateY(1px)`**. Never a scale.
- **Focus:** 3px `rgb(253 194 11 / .45)` ring. Focus is always visible — this product is
  used one-handed at an airport. **Text fields are the exception:** a focused field shows
  the charcoal border only, because a ring on a pill field of `--vt-control-lg` height
  reads as a glow. §8.
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

### 4.4 `app/` — the product layer, as Design Components

The system now has two architectures, and this is the one to build on.

`components/<group>/` are **primitives**, compiled into `_ds_bundle.js` and mounted with
`x-import`. `app/` is the **product layer** built on top of them: 18 composed components
and 23 screens, each a single `.dc.html` Design Component that opens directly in a
browser, streams as it renders, and is imported by name:

```html
<dc-import name="SiteHeader" variant="inverse" hint-size="100%,76px"></dc-import>
```

Nothing in `app/` duplicates a primitive — every file loads the bundle and composes it.

**Chrome** — `SiteHeader`, `SiteFooter` (mandatory, §8) · `OpsSidebar`
**Sections** — `Services` + `ServiceCard` · `WhyVamos` · `HowItWorks` · `Reviews` · `FAQ`
**Booking** — `WhenPicker` · `StepCounter` · `BrandSelect` · `BookingRow`
**Auth** — `AuthForm` · `ResetForm` · `PhoneVerify` · `AuthStates` (states gallery)
**System** — `CookieBanner`

**Screens** — `home` `about` `contact` `faq` `become-a-partner` · `checkout`
`confirmation` · `sign-in` `reset-password` `account` `bookings` `booking-detail`
`manage-booking` · `terms` `privacy` `cookies` `cancellation` `imprint` ·
`ops-board` `ops-detail` `ops-pricing` `ops-login` `ops-coming-soon`

Every prop, every state and the `<helmet>` to copy when adding a file are in
`app/README.md`. `MIGRATION.md` maps each `ui_kits/` screen to the component that
supersedes it.

Three rules govern this folder:

- **Styling is inline.** No stylesheets, no CSS classes beyond the design system's own —
  class-based CSS delays paint until both rules and markup have streamed.
- **A pattern that appears more than a couple of times becomes a component** with real
  props, and every state it will ever need is built in the same pass — default, hover,
  focus, selected, disabled, loading skeleton, empty, error. Do not fork a component to
  change one value; add the prop.
- **Do not restate a primitive in local CSS.** Local `[data-*]` rules are for layout and
  for things the kit genuinely has no component for.

---

## 5. Iconography

**No icon assets were supplied.** The brand pack contains logos, patterns and
photography only; the current Freshpage site loads a Font Awesome kit that is not
redistributable and the rebuild targets shadcn/ui, whose default set is Lucide.

**Substitution (flagged):** 58 **Lucide** outline SVGs (24×24, 2px stroke, round
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
- Vocabulary used across the kits: `plane-landing` / `plane-takeoff` (airport),
  `map-pin` (address), `calendar` / `clock` (when), `users` / `luggage` (capacity),
  `car-front` / `car` / `bus` (vehicle class), `navigation` (route, distance),
  `credit-card` / `banknote` / `receipt` (money), `ticket` (coupon/voucher),
  `shield-check` (trust), `snowflake` (ski), `baby` (child seat),
  `funnel` / `search` (table controls), `ellipsis` (row actions),
  `circle-alert` (field error), `loader-circle` (sending), `file-text` (legal
  deference), `message-circle` (WhatsApp, chat), `chevron-up` / `arrow-up`
  (collapse, back to top).
- **Two glyphs are not Lucide and are flagged as such:** `facebook.svg` and
  `instagram.svg` are filled 22×22 brand marks; `youtube.svg` comes from Lucide
  **v0.263.1** because `main` has since removed every brand icon. The social row
  deliberately mixes two provenances — do not "fix" it by redrawing them.
- **No emoji. No unicode glyphs as icons.** Arrows are `arrow-right` /
  `chevron-right`, not `→`. The one exception is the `→` in illustrative route
  strings ("ZRH → Zermatt"), where it is text, not an icon.
- **Do not hand-draw SVG.** If a glyph is missing, add the real Lucide file to
  `assets/icons/` and reference it by name.

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
| `guidelines/` | 26 specimen cards — Colors, Type, Spacing, Brand, Localisation |
| `ui_kits/booking-website/` | Real linked pages — `home.html` → `quote.html` → `checkout.html` → `confirmation.html`; `index.html` is the same flow as one click-through |
| `ui_kits/ops-dashboard/` | Real linked pages — `bookings-board.html`, `booking-detail.html`, `pricing-rules.html`; `index.html` is the same board with the live detail panel |
| `templates/booking-page/` | Copy-to-start booking landing page (Design Component) — see §6.1 |
| `templates/ops-dashboard/` | Copy-to-start dispatch shell (Design Component) — see §6.1 |
| `app/` | **the product layer** — 18 Design Components + 23 screens + the locale runtime, §4.4 |
| `app/README.md` | every prop and state in `app/`, and the `<helmet>` to copy |
| `tokens/laws.css` | the four house laws — no glow, no yellow tints, field focus, `[data-tok]` |
| `app/vamos-i18n-dict.js` | every visible string in `de` / `fr` / `ar` + `patterns` |
| `app/vamos-locale.js` | `VamosLocale` — the one language + currency store, §9 |
| `assets/lenis*.js` / `.css` | vendored smooth scroll + the house settings, §10 |
| `MIGRATION.md` | old `ui_kits/` screen → new Design Component |
| `assets/` | logo, icons, patterns, photography, brand samples, fonts |
| `thumbnail.html` | homepage tile |
| `SKILL.md` | Agent-Skills entry point |
| `github.md` | source-repo association for one-click sync |

**Start here:** `app/home.dc.html` for the customer product and `app/README.md` for the
component catalogue. The originals below are the V1 reference mocks and still valid:
`ui_kits/booking-website/home.html` for the customer product
(each screen is its own page, so they can be improved one at a time),
`ui_kits/ops-dashboard/index.html` for dispatch, `guidelines/` for foundations.

### 6.1 Templates

Nine entries populate the picker consuming projects see. Seven are the product
screens themselves — `templates/booking-{home,quote,checkout,confirmation}/` and
`templates/ops-{bookings-board,booking-detail,pricing-rules}/`. Each is a thin
`index.html` that loads `../../styles.css`, `../../_ds_bundle.js` and the kit's own
JSX by relative path, so there is **no duplicated screen code**: edit
`ui_kits/<kit>/*.jsx` and every template follows.

Note: `@startingPoint` is deprecated — templates replaced it. Do not re-add those
tags; add a `templates/<slug>/` folder instead.

The two hand-authored Design Components below are the ones to copy when you want a
page to *extend* rather than mirror the shipped screens.

`templates/booking-page/BookingPage.dc.html` is a Design Component a consuming
project copies wholesale: sticky charcoal header, hero + quote widget
(`Tabs` · `Input` · `DatePicker` · `Counter` · `Button`), trust row, three
`VehicleCard` classes and the footer. All copy is static markup, so every string
is directly editable; three tweaks cover what editing cannot do —
`ctaSentenceCase` (flips every CTA between the brand's uppercase labels and
sentence case — uppercase is now the settled client answer, so this is an override,
§2), `showTrustRow` and `showVehicleClasses`.

It loads the system through a sibling `ds-base.js`, which is the **only file to
edit on copy**: its single `base` line resolves `styles.css`, `_ds_bundle.js` and
the three asset-base vars (`--vt-icon-base`, `--vt-logo-base`,
`--vt-pattern-base`) that `Icon`, `Logo` and `CheckerMark` read. Point `base` at
the bound `_ds/<folder>` tree and the page renders with real icons and logo.

`templates/ops-dashboard/OpsDashboard.dc.html` is the dispatch counterpart:
charcoal sidebar, search + New booking bar, four `StatTile` KPIs, filter `Tag`s
and the bookings `Table` with `StatusBadge` cells and a selected row. Its board
rows are placeholders (`VT-0001`, `00:00`, `CHF 000`) — wire them to a real data
source rather than editing plausible values in.

Prices in both read `CHF 000` per §2 — do not fill them with plausible numbers.

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

## 8. Platform laws

Four rules that hold across every surface, product and marketing alike. They are stated
as code in `tokens/laws.css` and repeated locally in every Design Component's `:root`, so
a file behaves correctly even outside this tree.

### 8.1 Nothing may look AI-generated

The test for every screen: could this be mistaken for a generic AI-generated page? If yes,
it is wrong. None of these ever appear in this product — aggressive or decorative
gradients, coloured glows, tinted cards with a left-border accent, rounded-pill decoration
that carries no meaning, generic type (Inter, Roboto, Arial), emoji, invented stats,
three-column icon "feature" grids that say nothing, or a section padded with placeholder
text to fill a page. An empty-feeling section is a layout problem, not a content gap.

### 8.2 No glow, ever

No coloured or blurred halo on hover, focus, press or active state — not on buttons,
cards, icons, links, inputs or anything else. `--vt-shadow-accent` is `none`; no
`box-shadow` carries a colour tint.

Allowed instead: a colour or fill change, a border change, `translateY(1px)` on press,
the neutral charcoal shadows `--vt-shadow-xs`…`xl`, and the focus ring `--vt-ring`.
Text fields are the one exception to the ring — a focused field shows the charcoal border
only.

### 8.3 No tinted yellow or brownish surfaces

`#FDC20B` at full strength is a small accent: a primary button, a badge, a kicker, a
monogram, a stamp label. `--vt-yellow-50/100/200/300` as a background or border and
`--vt-yellow-600/700` as a text or icon colour are out of the palette, on any surface.

That includes kit components whose own default is tinted — `Alert tone="accent"`
(yellow-50), `ListRow icon=…` (yellow-50 lead tile, yellow-700 glyph),
`Badge tone="warning"`. Use `tone="inverse"` / `tone="info"`, a charcoal panel, or plain
white with a `--vt-border-subtle` hairline instead; when a component has no untinted
variant, build the piece from tokens rather than shipping the tint.

### 8.4 Every page uses the shared header and footer

`SiteHeader` and `SiteFooter` are mandatory on every public page. Never hand-roll either.

```html
<dc-import name="SiteHeader" variant="inverse" hint-size="100%,76px"></dc-import>
…page…
<dc-import name="SiteFooter" hint-size="100%,520px"></dc-import>
```

`variant="inverse"` — the charcoal sticky bar — is the default everywhere.
`variant="overlay"` is only for a page whose hero already carries a photograph; home uses
it. The control row is fixed and identical on every page: logo, phone pill, language,
currency, sign in, and the yellow *Book a transfer* pill. Pass `cta="{{ no }}"` on a page
that already has the booking card in view. The ops console is the one exception — it is a
signed-in dispatch surface and uses `OpsSidebar`.

### 8.5 Placeholders in legal copy

A value the client still owes us is written as **human words in a `data-tok` pill**, never
as `{TOKEN_NAME}`. The pill appends its own `TBC` tag, so it reads "Free cancel window
TBC" — a labelled gap, not a broken template. Prices stay `CHF 000` (§2).

---

## 9. Four languages, in the same pass

Every page, section and component ships in **English, German, French and Arabic**. A
surface is not finished — not "for now", not "English only until the next milestone" —
until every visible string it renders exists in `app/vamos-i18n-dict.js` with `de`, `fr`
and `ar`. This applies to new components as much as to pages: build the markup in
English, then add its strings before calling the work done.

- That includes labels, buttons, headings, hints, errors, empty states, badge labels,
  `placeholder`, `aria-label`, `title` and `alt`.
- Strings the code concatenates go in `patterns` as a regex entry — never leave a built
  string untranslated because it has a number in it.
- German is Swiss German: "ss", never "ß".
- The only copy that stays English on purpose is internal — review scaffolds, client-input
  notes, `TBC` labels.

### One store, one broadcast

`app/vamos-locale.js`, loaded in every page's `<helmet>` after `vamos-i18n-dict.js`:

```html
<script src="vamos-i18n-dict.js"></script>
<script src="vamos-locale.js"></script>
```

- **Never** read `localStorage.vamosLang` / `vamosCurrency` directly, and never reload the
  page to apply a choice. `VamosLocale.setLang(v)` / `.setCur(v)` relabel the whole page
  in place, and re-run on every React re-render.
- A logic class holding `lang`/`cur` in state subscribes in `componentDidMount`:
  `this._offLocale = window.VamosLocale.onChange(v => this.setState({lang:v.lang, cur:v.cur}))`,
  released in `componentWillUnmount`.
- Prices are never a hard-coded `CHF` string in logic — `VamosLocale.money('000')`. The
  amount stays `000` (§2); the currency switch changes the mark, never the number.
- **Arabic is first-class.** The runtime sets `dir="rtl"` and swaps in an Arabic type
  fallback, so lay out with logical properties (`margin-inline-start`, `inset-inline-end`,
  `padding-inline`) and never `left`/`right` for anything carrying text. Check the page in
  Arabic before saying it is done.
- A long-form legal page that genuinely only exists in some languages carries
  `data-vt-legal="<languages>"` on `<main>`; the runtime then says so instead of
  pretending.

---

## 10. Smooth scrolling is Lenis, everywhere

Every page loads the vendored Lenis (`darkroomengineering/lenis`, MIT, 1.3.23) from
`assets/`:

```html
<link rel="stylesheet" href="../assets/lenis.css">
<script src="../assets/lenis.js"></script>
<script src="../assets/lenis-boot.js"></script>
```

`assets/lenis-boot.js` owns the single instance and the house settings — lerp `0.12`, no
bounce, `anchors:true`, `allowNestedScroll:true`, native touch, `prefers-reduced-motion`
honoured, and it stops the instance while a sheet locks the body. Never construct a second
`Lenis`, never re-add `scroll-behavior:smooth`, and put `data-lenis-prevent` on any panel
that owns its own scroll.

`assets/lenis.js` is the published dist with the ESM export swapped for `window.Lenis`
plus a `if (window.Lenis) return` load guard — several Design Components load it from
their own `<helmet>`, and a second evaluation throws.

This is the only motion that is *continuous*. Everything else stays as §3 sets it: short,
flat, no bounce, nothing loops.

---

## 11. Every surface is built desktop → tablet → mobile, in one pass

No screen is "desktop for now". Each page or section is laid out for all three from the
start and checked at **1440, 1024, 768 and 390 px** before it is called done.

- Fluid first: `clamp()` for type and page gutters, `minmax()` / `auto-fit` grids,
  `flex-wrap`, `min-width:0` on flex children that hold text. Breakpoints only where the
  layout has to change shape — not to patch overflow.
- Nothing scrolls sideways at 390 px, and the booking widget stacks first on mobile.
- Touch targets stay 44 px minimum; 54 px for booking-widget fields and primary CTAs.
- German strings grow ~30 % and Arabic reverses direction. A layout that only fits English
  is not finished.
