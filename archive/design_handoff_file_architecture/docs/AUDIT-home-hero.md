# `home.dc.html` — full technical & design audit
**Vamos Taxi V1 booking home** · audited 3 Aug 2026 · 882 lines (template ~200, logic ~640)

Everything below is verified against the running page (measurements taken at 390×667,
390×844, 911×1115, 1120×700 and 1440×740), against the sibling pages, and against the
Vamos Taxi design-system guide + tokens. Severity: **P0** breaks the funnel · **P1** wrong
or off-brand in normal use · **P2** cleanup.

---

## 1. What the file is now

One DC, one screen: a full-viewport photo hero that contains *the entire funnel steps 1+2*.

```
div (page bg)
└─ [data-hero]  overflow:hidden · bg rectangle-msch3rzt-lwc6.png · min-height:100svh
   ├─ checker conic-gradient (decor, aria-hidden)
   ├─ scrim  linear-gradient(rgb(20 21 21/.34) → .12 @24% → .82)
   └─ [data-hero-inner]  position:relative · flex column · max-width 1440
      ├─ header (logo · phone · lang · currency · sign-in | mobile: phone + burger)
      └─ flex:1, justify-content:flex-end
         ├─ copy block (kicker / h1 / sub)
         ├─ #book  [data-bookcard]
         │  ├─ [data-upto-wide] compact summary button + trust bullets   (< 1080)
         │  └─ shell → [data-sheetbody]  = inline form (≥1080) / bottom sheet (<1080)
         │     ├─ Tabs (one way · return · hourly) + trust bullets
         │     └─ [data-fields] grid: flight · pickup · swap · dest · when · party
         └─ [data-fleet-strip] 4 vehicle cards with live prices (canvas "dust" animation)
```

Three responsive tiers, and **three independent sources of truth for them**:
helmet media queries (699 / 1079 px), `TIER()` via `matchMedia`, and `this._mqs` change
listeners. Tier drives `shellCss` / `bodyCss` / `compact` / `sheetOpen` in JS while the CSS
hides the counterpart block. See 2.2 — this is the single most dangerous thing in the file.

Everything below the hero (fixed-price band, waiting-time block, ski section, route of the
season, weekly routes, about, yellow-arc CTA, footer) has been **deleted from the template
but not from the logic** — see 7.1.

---

## 2. P0 — funnel blockers

### 2.1 On a phone, the booking sheet renders entirely below the fold and cannot be reached
Measured at 390×667 after tapping the summary button:

| what | value |
|---|---|
| viewport | 390 × **667** |
| hero / `[data-hero-inner]` height | **799** |
| scrim shell (`position:absolute; inset:0`) | y 0 → 799 |
| `[data-sheetbody]` | **y 799 → 1413** (h 614) |
| sheet pixels below the fold | **746 of 614** — i.e. *all of it* |
| "Show fixed prices" CTA | y 823 → 867 (off-screen) |
| `document.body.style.overflow` | `hidden` (scroll locked) |

`shellCss` positions the sheet with `position:absolute;inset:0`, so its containing block is
`[data-hero-inner]` — the **hero**, not the viewport. The hero is taller than the viewport on
any phone shorter than ~800 px (iPhone SE/8/12 mini, most Androids in-browser with the URL
bar), so the sheet is pinned to the hero's bottom edge, off-screen, while `lockScroll(true)`
prevents scrolling to it. The user sees the page dim and nothing else; the only escape is a
blind tap on the scrim (Escape needs a hardware keyboard).

Fix: `position:fixed` on the shell (and drop `inset:0`→`inset:auto 0 0 0` with
`max-height:92svh` on the body), or portal the sheet out of `#book`. The hero's
`overflow:hidden` also has to go, or the sheet must not be a descendant of it.

### 2.2 Resizing across 1080 px can hide the booking widget completely
Reproduced: load at 390 px, widen to 1440 px. CSS immediately hides
`[data-upto-wide]` (the compact summary button), but the JS `tier` stayed `0`, so
`shellCss` was still `display:none`. Result: **no compact button and no inline form — the
booking widget is gone**, and the hero shows only headline + vehicle cards.

The failure mode exists because layout is decided twice (CSS) and (JS) with no fallback: any
missed `resize`/`matchMedia` event — window resize, tablet rotation, devtools open, iframe
embed, browser zoom — yields a state the CSS and the JS disagree about. Nothing in the
render is defensive: `display:none` is the JS default for tier < 2.

Fix: drive layout entirely from CSS (the media queries already exist); keep JS state for
*open/closed* only. `bodyCss` becomes a class-free inline style on a `[data-sheet]` element
whose display is chosen by the same media queries that hide its counterpart.

### 2.3 The vehicle class the customer picks is thrown away at checkout
- `home` writes `saveTrip({… vehicle: 'eclass' | 'sclass' | 'vclass' | 'sprinter' })`
- `checkout.dc.html:129` maps only `{ economy, business, van }` and falls back:
  `VEHICLE_NAME[trip.vehicle] || 'Business'`

So every selection lands on checkout as **"Business"**, in the summary line, the fare line
and the sticky rail. Also `home`'s own `DEFAULT_TRIP.vehicle` is `'business'`, i.e. the file
contradicts itself.

### 2.4 The funnel skips a page that the next page links back to
`pick()` → `location.href = 'checkout.dc.html'`. Nothing in the project links to
`quote.dc.html` any more (grep: 0 references) — yet checkout's back button is
`href="quote.dc.html"` ("Change vehicle") and its `StepIndicator` still declares four steps
`['Route','Vehicle','Details','Payment']` with `current=2`. The customer therefore: books on
one screen, sees a 4-step indicator that claims they completed two screens, and "Change
vehicle" drops them onto an orphaned page with its own copy of the trip state.

### 2.5 Prices are invented — the one rule the system says never to design around
The guide, §2 and §7.1: *"Never invent a CHF price … in mocks every amount reads `CHF 000`
/ `CHF 00.00`. This rule … applies to slides, decks and screenshots too."*

`price()` computes fares from `Math.hypot()` on invented lat/long-ish offsets
(`18 + 3.05 × km`, `× v.mult`, `× 1.9` for returns), `HOURLY` hard-codes 98/152/132/225, and
`CURS` invents FX rates (EUR 1.05 / USD 1.24 / AED 4.55). Live capture from the current
preview: **AED 346 · AED 537 · AED 469 · AED 742**. Checkout, confirmation and every ops
screen still read `CHF 000.00`, so the flow also *contradicts itself* mid-funnel: a customer
sees AED 537 on the hero and `CHF 000.00` one click later.

If the demo needs motion in the price slot, animate `CHF 000` → `CHF 000`; keep the
mechanism, drop the numbers.

---

## 3. P1 — design-system violations

| # | Rule (guide) | What the file does |
|---|---|---|
| 3.1 | Vehicle classes are settled: **Economy 3/3, Business, Van 8/8** ("do not reopen") | `FLEET` = E-Class 4/3, S-Class 3/3, V-Class 7/6, Sprinter 19/12 — new names, new capacities, plus invented interior copy ("Cognac leather, flagship comfort", "19 seats, red-piped leather") |
| 3.2 | Body copy never below **13 px**; smallest token `--vt-body-xs:13px` | Live histogram inside the hero: **9 px ×10, 10 px ×8, 11 px ×32, 11.5 px ×8** — 58 nodes under the floor, including the fixed-price eyebrow and all vehicle metadata |
| 3.3 | Prices are Qurova figures (`--vt-figure-sm:19px`) | Dust renders the fare at **17 px** in a fixed **92×22 px** slot and auto-shrinks to **13 px** when the string doesn't fit (any 4-digit or AED amount) — the most important number on the page is the smallest-set one |
| 3.4 | Photo protection uses `--vt-scrim-bottom` (`rgb(17 18 18)`, .86 → .55 @34% → 0 @78%) | Hand-rolled `linear-gradient(rgb(20 21 21/.34), .12 @24%, .82)` — an off-token charcoal (#141515 vs `--vt-charcoal-950` #111212) and an inverted ramp that darkens the top (where white pills already sit) and leaves the mid-band at 12 % |
| 3.5 | Sheet/dialog scrim token `--vt-bg-scrim: rgb(17 18 18/.62)` | `rgb(20 21 21/.55)` again hand-rolled |
| 3.6 | Checker motif: use `assets/patterns/checker-*.png`, watermark at **5–8 %** | Hand-built `conic-gradient` at **16 %** opacity, radially masked — twice the sanctioned weight, and it lands on the brightest part of the photo where it reads as noise |
| 3.7 | "**Focus is always visible** — this product is used one-handed at an airport" | `all:unset` on the mobile burger, the summary button, the lang/currency chips (and `WhenPicker`'s trigger) kills `base.css`'s `:focus-visible{box-shadow:var(--vt-ring)}` — inline declarations beat the stylesheet. Measured: `boxShadow: "none"`, `outline-style: none`. **No focus ring on any of them** |
| 3.8 | 44 px minimum for anything a customer taps | Swap `IconButton size="sm"` measures **32 px**; the lang/currency chips are 36 px |
| 3.9 | "Loading/empty: state it in words, never … a shimmering block pretending to be data" | The skeleton overlay is grey blocks + `vt-skelpulse` infinite pulse (it does at least carry "Getting your fixed price…"); the pre-quote state is a bare `—`, and the error state is `AED ---` with no words at all |
| 3.10 | Motion: "short, flat … nothing scales, nothing springs, **nothing loops**" | The dust field enters `mode:'dust'` and wobbles on `requestAnimationFrame` **indefinitely** while a quote is in flight — 4 cards × 340 particles ≈ 1 360 `fillRect`s per frame, sine-driven, looping |
| 3.11 | Currency is CHF, symbol first | 4 currencies with invented rates, formatted `toLocaleString('en-US')` regardless of locale — a German/Swiss user sees `1,234` where Swiss convention is `1’234` |
| 3.12 | Sentence case; UPPERCASE only as a typographic device | Fine — kicker/eyebrows/badges only. ✅ |
| 3.13 | Two background colours per screen max, charcoal + white | ✅ |

---

## 4. P1 — layout & interaction defects (measured)

**4.1 The hero does not fit a laptop, and the prices are what falls off.**
At 1440×740: hero **815 px** tall, fleet-card bottom at **775** — the price row of all four
cards is cut by the fold. At 1120×700: hero 801, cards end at 761. `min-height:100svh` is
declared on *both* `[data-hero]` and `[data-hero-inner]`, so the hero can only ever be ≥ one
viewport, never = one viewport; the page then has ~75–115 px of dangling scroll and nothing
else in it (no footer, no next section) to justify scrolling.

**4.2 The address autocomplete is clipped by the hero.**
At 1440×740, focusing pickup: dropdown `y 548 → 843` (h 295), `position:absolute`, and
**28 px is clipped by `[data-hero]{overflow:hidden}`** — plus 103 px below the fold. On a
1440×700 window it loses ~70 px, i.e. the last two suggestions. Note that `WhenPicker`
*solves exactly this problem properly* (`clipBox()` walks to the nearest non-visible-overflow
ancestor, measures above/below, flips up, caps `max-height`). The suggestion list in this
file does the same job with a fixed `top:calc(100% + 6px)` at tier 2 — two sibling controls,
two behaviours.

**4.3 The pickup value is truncated at every width.**
`inputText.truncated === true` at 1440 (input inner width 221 px, value
"Zurich Airport (ZRH), Terminal 2"). At 1080 the six-column grid
(`126px | 1.05fr | 34px | 1.05fr | 1.25fr | auto`) leaves pickup/dest ≈ 165 px ⇒ ~18
characters. The *optional* flight field holds a fixed 126 px while the two mandatory fields
starve. The unused string `flightChip: "Add a flight number"` in `T` shows this was already
designed as a chip once — that's the right answer.

**4.4 The mobile swap button never rotates.** `swapBtnCss = 'transform:rotate(90deg)'` is
passed as `style="{{ swapBtnCss }}"` to a DS `IconButton`; measured `transform: none` at
390 px. On mobile the fields stack vertically while the swap glyph still points left↔right.

**4.5 DOM order ≠ visual order.** `[data-f=flight]` is first in the DOM but placed last by
`grid-template-areas` on mobile and tablet. Keyboard/AT users start in the optional flight
field and tab "backwards" through the form (WCAG 2.4.3 / 1.3.2).

**4.6 Dead clicks.** A card whose result is `na` or `err` keeps `cursor:pointer`, hover
shadow and `role="button"`, and `pick()` silently returns. With `errorRatePct` defaulting to
**6 %**, roughly one demo in sixteen puts all four cards into a state where nothing can be
selected, with no message and no retry — `T.quoteErr` ("Couldn't price this — try again")
exists but is never rendered.

**4.7 Prefilled state is wrong content.** `DEFAULT_TRIP` seeds the destination as
`Bleicherstrasse 16, 8953 Dietikon` — **Vamos Taxi's own registered office**. Every first-time
visitor is quoted a ride to the operator's back office, with a date (Fri 14 Aug) and time
(08:15) they didn't choose, and prices computed from it.

**4.8 The calendar is frozen.** `baseMonth="2026-08"` is a literal and `fmtDate()` derives
weekday names from `dowRef` assuming 1 Aug 2026 = Saturday. Correct for this month only;
any other month labels every date wrong. There's also no "no past dates" rule, so a
pre-booked-transfer product accepts a pickup that already happened.

---

## 5. P1 — accessibility

1. **`announce` is dead.** `fireQuote()` composes a full route + four-fare announcement into
   `state.announce`, `renderVals` exposes it, and **no live region exists in the template any
   more** (it went with the deleted sections). Prices change silently for screen-reader users.
2. **The autocomplete is keyboard-unusable.** Suggestions are `<div onMouseDown>` with no
   `role="listbox"/"option"`, no `aria-expanded`/`aria-controls`/`aria-activedescendant`, no
   arrow-key or Enter handling. You can type an address but you cannot choose one without a
   pointer.
3. **The bottom sheet is not a dialog.** The trigger claims `aria-haspopup="dialog"`, but the
   sheet has no `role="dialog"`, no `aria-modal`, no label, no focus move, no focus trap and
   no focus restore. Focus stays on the trigger, behind the scrim.
4. **`role="menu"` without the pattern.** Menu items are links; no arrow-key navigation, no
   `tabindex` management, no focus move on open. A plain popover with a list would be both
   simpler and more correct.
5. **Double-announced prices.** The Dust `<span>` carries the visible fare *and* a
   visually-hidden `{{ v.sr }}` span repeats "V-Class: AED 469".
6. **No landmarks.** No `<main>`, no `<header>`/`<nav>` elements (the header is a `div` with
   `data-om-label="header"`), no skip link, single `h1` ✅.
7. **`aria-disabled` missing** on unselectable vehicle cards (see 4.6).
8. **Contrast is unverified where it matters**: `--vt-text-inverse-muted` sub-copy sits on a
   scrim that is only 12 % opaque at 24 % height (3.4). Needs a measured check per breakpoint,
   since `cover` re-crops the photo at every aspect ratio.

---

## 6. Performance

- **Hero image: `rectangle-msch3rzt-lwc6.png`, 1440×1024, 1.3 MB PNG, fully opaque.** It is
  the LCP element, loaded as a CSS background (so no `preload`, no `fetchpriority`, no
  `srcset`, no `<img>` decode hints), in a format that costs ~6–8× a comparable JPEG/WebP
  (~150–220 KB). One 1440-wide source also means upscaling on large displays and a 3.7×
  over-download on a 390 px phone. This is the first impression of an airport-transfer product
  whose users are on hotel/airport Wi-Fi.
- **Two orphaned 1.3 MB-class assets** in the project root: `rectangle-msch23iq-dqll.png`,
  `rectangle-msch2rwv-7g2c.png` (0 references).
- **Dust engine**: on every quote it runs `getImageData` over a `2×` offscreen canvas per card
  (4×), then a shared rAF loop; `mode:'dust'` never self-terminates, so a slow/failed quote
  leaves the loop running at 60 fps. `Dust` instances are created in ref callbacks and
  **never destroyed** — `componentWillUnmount` doesn't call `destroy()`, so `Dust.all` leaks
  and can tick detached nodes.
- **`dustParticles` tweak is inert**: `count` is read once, in the `Dust` constructor. Changing
  the tweak does nothing until the cards remount.
- **`quoteLatencyMs` is multiplied by `0.6 + Math.random()*0.9`**, so the "1 500 ms" default
  actually ranges 900–2 250 ms; the label promises precision the code doesn't keep.
- Every `sc-for` row in the suggestion list mounts its own `<x-import>` Icon (a masked span) —
  fine, but the list re-creates all `pick` closures on every keystroke.

---

## 7. Code quality

### 7.1 Dead code: ~40 % of the logic serves markup that no longer exists
`renderVals()` returns **33 keys nothing consumes**: `announce`, `routes`, `pickSeason`,
`tPending`, `tFixedPriceEyebrow/H2/Body`, `tHowPricing`, `tAirportPickups`, `tWaiting60`,
`tIncluded`, `tWaitingBody`, `tSkiSeason/Body/Transfers`, `tSeasonEyebrow`, `tRacksIncluded`,
`tSeasonBody`, `tGetRoute`, `tRoutesWeekly`, `tRoutesDisclaimer`, `tFrom`,
`tAboutEyebrow/H2/Body`, `tCloseH2a/b`, `bookLabel`, `tTrust`, `tTrustShort`, plus unused
number constants `n22`, `n44`, `n56`, `pt3`. The `ROUTES` array and `pickRoute()` are built
per render for nobody. `T.en`/`T.de` still carry ~30 strings each for the deleted sections;
`T.fr`/`T.ar` never had them, so those languages silently fall back to English through
`Object.assign({}, T.en, T[lang])` — which also means **any missing translation fails open to
English with no warning** (fr/ar are missing every section string; `T.ar` has no `dowRef`
problem but no `pending`, `flightChip`, etc.).

### 7.2 The trip contract is copy-pasted, not shared
`readTrip`/`saveTrip`/`DEFAULT_TRIP` exist independently in `home.dc.html` and
`checkout.dc.html` (and the shapes already diverge: only home writes `selectedDay`,
`returnDay`, `returnLabel`). That divergence is what produced 2.3. This is exactly the case
the DC rules allow a shared plain `.js` module for.

### 7.3 Style holes fight the streaming model
`shellCss`, `bodyCss`, `sugCss`, `swapRowCss`, `swapBtnCss` and `o.css` are whole-style
strings interpolated through `{{ }}`. They can't resolve until the logic runs, so those
elements are unstyled during streaming; they're invisible to the editor's style tooling; and
`swapBtnCss` demonstrably doesn't apply at all (4.4). Only genuinely live values belong in a
style hole — `bodyCss` is 90 % static.

### 7.4 Smaller things
- `SiteHeader.dc.html` and `SiteFooter.dc.html` exist and are imported **nowhere**; the hero
  re-implements the header inline. The page has **no footer at all** — for a Swiss GmbH that
  means no imprint, no company address, no terms/cancellation link, no payment marks.
- `hero-explorations.dc.html` is the origin of this code and still holds the older
  `T` tables — a second place to keep in sync.
- `lockScroll()` toggles `document.body.style.overflow`, which is unreliable on iOS Safari and
  clobbers any host-level value.
- `_reposSug` follows scroll but not `resize`; an open dropdown detaches from its field on
  resize (it's `position:fixed` at tier < 2).
- `fmtDash()` returns `"AED ---"`; the em-dash placeholder `'—'` is a second, different
  empty-state notation.
- `pax` is capped at 8 while `Sprinter.cap = 19`, so `na` can never fire for it — the capacity
  branch is unreachable for that class.
- `dir` is set on the hero root only; the Arabic path also sets Qurova as the display face,
  which has no Arabic coverage, so `h1` silently falls back to a system font.
- `title="{{ v.title }}"` puts the same native tooltip ("Select a class to continue") on all
  four cards.
- `badgeEl()` builds the flight chip with `React.createElement` — legitimate here (it's passed
  as a *prop* to a DS `Input`), worth a comment so nobody "fixes" it into markup.

---

## 8. Art direction — the hero photograph

The image is a black sedan at night, rear door open, warm amber cabin light, wet asphalt,
subject in the right 55 %, left 45 % near-black.

- The brand's photography rule is explicit: *premium black vehicles in **cool daylight**, cool,
  slightly desaturated, **no warm filter**, no grain*. This frame is the opposite on three of
  those axes, and warm gold is the one hue that competes with `--vt-yellow`.
- It also fights the headline. "Land in Zurich. Your driver is waiting." is an arrivals-hall
  promise; the picture is a night-time limo pickup. Airport transfers are overwhelmingly a
  daylight product.
- Because the booking card spans the full width and the copy is left-aligned over the black
  half, the only interesting part of the photo (door, cabin) is *behind the widget* on desktop,
  and the left half is a flat black rectangle the photo isn't needed for.
- `center/cover` with no per-breakpoint `background-position`: the source is 1.4:1, the hero is
  2.06:1 at 1440×700 (≈50 % of the frame height cropped) and 0.49:1 at 390×800 (≈3× horizontal
  crop, leaving only a door-and-seat close-up). The subject is not art-directed at any size.
- §7.2/7.3 of the guide list vehicle and destination photography as **pending client inputs**.
  This is an unvetted, machine-named export standing in for that gap — worth an explicit
  "placeholder" label so it doesn't reach a client review as a decision.

---

## 9. Fix order

**Now (P0)** — 2.1 sheet → `position:fixed` · 2.2 make CSS the only breakpoint authority ·
2.3 one shared trip module with one vehicle-id vocabulary · 2.4 decide 3-step or 4-step and
make the indicator + "Change vehicle" agree (delete or rebuild `quote.dc.html`) ·
2.5 every amount back to `CHF 000`.

**Next (P1)** — restore the live region (5.1) · make the suggestion list a real combobox
(5.2) and give it `WhenPicker`'s clip logic (4.2) · sheet becomes a labelled modal dialog
(5.3) · drop `all:unset` or re-add `box-shadow:var(--vt-ring)` on `:focus-visible` (3.7) ·
swap button to 44 px (3.8) · lift the sub-13 px type to `--vt-body-xs` and the fare to
`--vt-figure-sm` (3.2, 3.3) · scrim/checker/sheet-scrim onto tokens (3.4–3.6) ·
flight → chip, widen pickup/dest (4.3) · fix DOM order (4.5) · `aria-disabled` + muted styling
on unselectable cards, plus a visible error with retry (4.6) · re-crop / re-shoot the hero and
convert to WebP with a `preload` (6, 8) · clear the prefilled office address (4.7).

**Cleanup (P2)** — delete the 33 dead keys, `ROUTES`, `pickRoute`, the orphaned section
strings in `T`, the two orphaned PNGs · destroy `Dust` instances on unmount and stop the idle
loop · either use `SiteHeader`/`SiteFooter` or delete them, and give the page a footer ·
make `dustParticles` live · pull `bodyCss`/`sugCss` mostly back into static inline styles.
