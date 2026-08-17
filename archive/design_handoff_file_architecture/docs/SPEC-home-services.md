# 02 — Home · Services section

**Surface:** `home.dc.html` (booking website, home) · **Components:** `Services.dc.html` (section) + `ServiceCard.dc.html` (card)
**Position in site map:** Widget → How It Works → **Services** → Vehicle Fleet → Why Vamos → Reviews → FAQ → Footer
**Status:** built, copy **unfrozen** (dev placeholder) · spec'd 3 Aug 2026 · card + swap rebuilt 3 Aug 2026 (rev 5 — reference anatomy, terminal slide is a yellow button, dev notice removed)

---

## 1. Purpose

Four parallel service categories, presented so a visitor can **compare without pressure**
and leave for the dedicated service page that matches their trip. Not a funnel step, not a
sequence — parallel options with identical visual weight.

Non-goals: no 5th "Fixed Route Pages" card (that is an SEO page pattern cutting across all
four services, not a customer-facing category — **open question for Koussay: was a 5th
teaser actually wanted here?**), no badges, no "most popular", no per-card price.

---

## 2. Content

Sentence case per design system §2 (the brief's Title Case names are normalised).

| # | Name | Description | Link label | Destination |
|---|---|---|---|---|
| 1 | Airport transfers | Fixed-price rides to and from the airport, timed to your flight. | See airport transfers | `services-airport-transfers` |
| 2 | City to city | Private transfers between Swiss cities, scheduled for one exact time. | See city to city transfers | `services-city-to-city` |
| 3 | Corporate transfers | Reliable, invoiced transfers for business travel and events. | See corporate transfers | `services-corporate-transfers` |
| 4 | Chauffeur by the hour | Book a driver and vehicle for multiple stops across the day. | See chauffeur by the hour | `services-chauffeur-by-the-hour` |

Section header: eyebrow "Services" · H2 "Four services. One fixed price each." · deck
"Every one is booked ahead, priced up front and assigned to a driver before you travel."

**Card 4 is gated.** `showChauffeurByHour` (default `true`) hides it with no layout change —
the desktop grid is `auto-fit`, so three cards become three equal columns.

**Copy is still unregistered** in `ASSET-AND-COPY-REGISTER.md`, but that is tracked here, not
on the page: the visible dev notice and its `showPlaceholderNotice` tweak were removed at
review (Koussay, 3 Aug) — internal scaffolding does not ship in the design.
The four destination pages do not exist yet; hrefs point at the intended slugs.

---

## 3. Layout

Two modes from one component, gated by viewport and motion preference — not two components.

### 3.1 Desktop and tablet, motion allowed (`min-width:768px` and `prefers-reduced-motion: no-preference`)

Pinned two-zone stage, after the "What we do" reference: one **Featured** card (left, 58% of
the 1200px container) and one **Next** card (right, 0.62 scale → ~36% of the container),
both top-aligned, 6% gap. Geometry is one uniform scale plus a translate, so nothing reflows
mid-transition:

| Zone | Transform (origin `top left`) | Opacity |
|---|---|---|
| Featured | `translateX(0) scale(1)` | 1 |
| Next | `translateX(110.4%) scale(.62)` | 1 |
| Queued (all later slides) | `translateX(126%) scale(.62)` | 0 |
| Gone (all earlier slides) | `translateX(-19%) scale(.84)` | 0 |
| Terminal button (never featured) | `left:64%; width:36%; height:62%`, no scale | 0 → 1 at the last service |

`[data-svc-wrap]` is `100svh + (N−1) × 80svh` tall; `[data-svc-stage]` is `position:sticky;
top:0; height:100svh; overflow:hidden` and holds **the whole section in exactly one viewport** —
header, step ticks and track — so nothing of the section is ever
half-scrolled and the exiting card is clipped at the viewport edge. Track height
`clamp(320px,52svh,520px)`; stage padding
`clamp(20px,3.4vh,44px)`.

Positions are set as `data-pos` on the card **mounts** (`[data-sc-name="ServiceCard"]`), so the
sequencer owns all motion and the card component knows nothing about it.

Tablet (768–1023) runs the identical stage and choreography, just narrower: featured ~408px,
small ~253px at 768.

### 3.2 Mobile, motion allowed (`max-width:767px`) — solo mode

Same pin, one card. The track is one full-width card `clamp(260px,42svh,400px)` tall; each
step slides the featured card **out to the left** (`translateX(0 → -106%)`) while the next
enters **from the right** (`106% → 0`), no scaling, description visible throughout because
nothing is scaled down. Since there is no small zone, the yellow **All services** button is
the final step of the sequence instead of a companion — so mobile has N+1 steps to the
stage's N, at `scrollPerStep − 15svh` each. The section header wraps and the step ticks sit
under it.

### 3.3 Fallback — reduced motion at any width

The plain ServiceCard grid: 1 column at 360 (16px gutter), `repeat(2,minmax(0,1fr))` from
768 (24px+ gutter), equal-size cards, no pin, no morph, hover/focus only. Same card
anatomy, same DOM, same order — only the CSS mode differs, and none of the scroll logic runs.

---

## 4. Card treatment — default (ship-ready, zero photo dependency)

Anatomy after the reference: media block → name + arrow inline → muted one-line description →
thin divider at the card bottom. No card border, no fill, no shadow at any state.

- **Media block** on top (`flex:1`, 16px radius, `--vt-grey-100`, or `--vt-charcoal-900` with
  `tone="charcoal"`), holding the service's Lucide glyph at 44px, `--vt-charcoal-600` at 34%.
  This is the reference's grey plate and the drop zone for approved photography (**asset
  A05**) — no caption, no "pending" text, nothing that reads as a broken image
- No card border, no fill, no shadow at any state: the card sits on the page and is closed by
  a single 1px `--vt-border-subtle` divider under the text, per the reference
- H3 name low-left — Qurova semibold, `--vt-heading-3` in the grid, `clamp(26px,2.7vw,40px)`
  featured
- 46px circular `arrow-right` affordance bottom-right, 1px `--vt-grey-300` ring (**not** a
  button element, no yellow fill); ring + glyph go `--vt-yellow`/`--vt-yellow-700` on hover
- One-line description — Poppins `--vt-body-sm`, `--vt-text-secondary`, `max-width:44ch`.
  On the stage it is **only shown on the Featured card** (it fades in as a card grows): at
  0.62 scale a 14px description would render ~9px, below the system's 13px floor. Queued
  cards therefore read media + name + arrow. It stays in the DOM for assistive tech
- Divider: 1px `--vt-grey-300` pinned to the card bottom with `margin-top:auto`
- The **terminal slide is a button, not a card** (Koussay, 3 Aug): a solid `--vt-yellow`
  panel at the small slot's exact geometry carrying an uppercase kicker, a 26px Qurova line
  and a charcoal pill (`All services` + `arrow-right`) that links to `services`. It never
  becomes Featured, so its type is never scaled and stays crisp — it is simply what occupies
  the small zone once the last service is Featured

### 4.1 Photography upgrade path (**asset A05**)

When client photography is approved and registered, it drops straight into the media block at
the same 16px radius (`object-fit:cover`), and the glyph moves to a 32px white overlay badge
top-left. No layout change, no toggle: the block is already the right shape. Until then the
glyph tile stands on its own — never unrelated stock, never a "pending" caption.

---

## 5. Interaction

### 5.1 The step sequence (desktop only)

N services (card 4 only when enabled) rotate through Featured; the terminal **button** is not
part of the rotation — it is painted into the small zone (`data-pos="next"`) exactly when the
last service is Featured, and fades out again if the user scrolls back.

Advancing one step plays three moves at once, each with its **own** duration and easing —
uniform tweens are what made the earlier version read as a slide rather than a swap:

1. Featured → **gone**: `scale(1)→.84`, `translateX(0)→-19%`, opacity→0 — 560ms
   `cubic-bezier(.4,0,1,1)` (accelerating away, out of the frame fast)
2. Next → **featured**: `scale(.62)→1` into the vacated zone, opacity stays 1 — 720ms
   `cubic-bezier(.16,1,.3,1)`, the system's entrance curve. This is the hero move
3. The following slide → **next**: `translateX(126%→110.4%)`, opacity 0→1 — 640ms transform
   (40ms delay) + 420ms fade (140ms delay), so it settles last

The Featured description fades in 240ms behind the growth, so the copy arrives after the
card has landed.

Once the last service is Featured and the yellow button has landed beside it, the pin releases
into Vehicle Fleet. **No loop back.**

**Smoothness:** one step per 700ms lock — a fast scroll queues the next step and cascades
rather than retargeting a transition mid-flight (the main source of jank in scroll-driven
morphs). Steps are written as attributes on the mounts, so stepping never re-renders the
template or remounts a card, and the WebGL edge canvases are never resized by the transform.

**Deviation from the brief, deliberate:** the step index is derived from pin scroll progress
(0.8 viewport per step by default, `scrollPerStep`), *not* from intercepted wheel/touch deltas. Same felt result —
one discrete transition per gesture — but the page can never be trapped if a transition
stalls, iOS momentum scroll needs no special case, and focus movement is untouched. There is
also no Framer Motion / GSAP in this environment: the transition is CSS `transform`/`opacity`
on `data-pos` states, applied imperatively so stepping never re-renders. For the Next.js
build, Framer Motion's layout animation over the same four `data-pos` states is the
straightforward port; keep the scroll-progress model rather than wheel capture.

### 5.2 Card states (both modes)

| State | Change |
|---|---|
| Hover | **specular edge highlight** tracing the media block (see 5.3) + the arrow affordance fills **solid `--vt-yellow`** with a charcoal glyph and `--vt-shadow-accent` (Koussay, 3 Aug: a yellow outline was not enough). The name and description are explicitly pinned to `--vt-text-primary` / `--vt-text-secondary` and **never** change colour on hover — the card is an `<a>`, so the global `a:hover` link colour has to be overridden for that |
| Focus (`:focus-visible`) | 3px `rgb(253 194 11/.45)` ring, 10px offset |
| Reduced motion | no specular canvas at all; static card, grid fallback instead of the stage |

### 5.3 Specular edge highlight (the one card affordance)

Ported from React Bits' `SpecularButton` — same rounded-rect SDF shader, same proximity and
steering maths, but rewritten on raw **WebGL2** because `ogl` cannot be installed here (and a
CDN dependency would break offline export). It lives in `ServiceCard`, on a canvas inset
−20px around **the media block** (the card itself has no outline any more), so the highlight
traces the block's rounded rect and the glow can bleed past the edge.

| Setting | Value | Note |
|---|---|---|
| `lineColor` | `#FDC20B` (`shineColor` prop) | yellow = action, and the card *is* the action; still no yellow fill |
| `baseColor` | `#C2C3C3` | the always-on hairline rim at rest |
| `intensity` | 1.15 (`shineIntensity`) | multiplied by pointer proximity, so it is dark until approached |
| `proximity` | 280px (`proximity` prop) | fades in as the cursor nears; angle points at the cursor |
| `radius` / `thickness` | 16px / 1.2px | matches the card radius |

Implementation notes that matter: geometry comes from `offsetWidth/offsetHeight` (never the
client rect) because the block sits inside a scaled ancestor on the stage, while the pointer
maths uses the client rect; and the render loop sleeps as soon as the highlight settles to
dark, so five idle cards cost nothing.

Whole card is the click target (one `<a>`, no nested interactive elements). The visible
affordance is the name + arrow, never colour alone.

---

## 6. Accessibility

- **Every slide is in the DOM at all times, in reading order** — queued cards are
  `opacity:0`, never `display:none`, so screen readers and Tab order are never gated by
  animation state
- **Keyboard is never scroll-jacked.** Nothing intercepts wheel or touch, so Tab moves freely;
  focusing a queued card promotes it to Featured (`focusin`), so the focused link is always
  the visible one
- **Bounded scroll.** The pin is a fixed-height spacer — `100svh + (N−1) × scrollPerStep` (80svh default) — so the
  section eats a known, finite amount of scroll and releases even if a transition stalls
- `prefers-reduced-motion: reduce` → pin and choreography are disabled entirely at any width;
  the grid fallback renders. Mobile keeps the pin (solo mode) unless reduced motion is set
- One link per card; accessible name comes from the service name via
  `aria-labelledby="svc-t1…5"` on the anchor — so the name is "Airport transfers", not the
  whole card's text
- Icons are decorative and hidden from assistive tech; every icon is paired with a label
- Section is `aria-labelledby="svc-title"`; H2 → H3 order, no skipped levels
- Focus ring always visible; touch target is the whole card (well above 44px)
- German grows ~30% — nothing is clamped or truncated

---

## 7. Token / substitution notes (deviations from the brief, deliberate)

The brief names Swiss Departure tokens; this project is bound to the **Vamos Taxi design
system**, so its own tokens are used. Mapping:

| Brief | Used here | Note |
|---|---|---|
| canvas-subtle `#F8F8F8` | `--vt-grey-50` `#F6F6F6` | |
| border `#C7C7C7` | `--vt-grey-300` `#C2C3C3` | decorative only |
| border-input `#7D7D7D` → ink-950 on hover | `--vt-grey-300` → `--vt-charcoal-900` | resting border stays decorative; hover goes to charcoal |
| text-muted `#616464` | `--vt-text-secondary` | `--vt-text-muted` reserved for the placeholder notice |
| text-accent-on-light `#875D00` | `--vt-yellow-700` `#A67B05` | system's own accent-on-light |
| H2 28/38px | `--vt-display-3` `clamp(28px,3.2vw,40px)` | 28px at 360, caps at 40px — matches How It Works |
| **Solar Linear icons** | **Lucide 24px, 2px stroke** | The Vamos system vendors a 49-glyph Lucide subset (§5 of the guide) and forbids mixing icon sets. Glyphs used: `plane-landing`, `navigation`, `briefcase`, `clock`, `arrow-right`, `info`. If the client picks Solar, this is the one substitution to replace — attribution changes with it. |

---

## 8. `ServiceCard` — proposed COMPONENT-INVENTORY.md entry

| Component | Contract | Required states / accessibility |
|---|---|---|
| `ServiceCard` | icon, name, one-line description, link destination, optional image variant, optional hidden-until-approved flag | default/hover/focus; whole card is one link (no nested interactive elements); icon decorative (aria-hidden), name carries the accessible link name |

`ServiceCard` is now a real component — `ServiceCard.dc.html` — imported once per service by
the section. Contract as built: `href`, `titleId` (for `aria-labelledby`), `icon` (Lucide
glyph in the media block), `tone` (`grey` | `charcoal`), `accent` (arrow rests yellow),
`shineColor` / `shineIntensity` / `proximity` (specular edge), and the name + description
passed as children so both stay directly editable copy. The terminal button is **not** a
`ServiceCard` — it is markup in the section, because it is a button, not a service.

Implementation note for the Next.js build (`components/sections/services-section.tsx`,
Tailwind, shadcn/ui, mobile-first — desktop variant and fallback in **one** component, gated
by viewport + reduced motion): the cards are authored as literal markup here so every string
stays directly editable in the design tool. In code they should be a `SERVICES` array filtered by
`hidden`, with the terminal button rendered after it as its own element.

---

## 9. Tweaks exposed

| Prop | Type | Default | Why |
|---|---|---|---|
| `showChauffeurByHour` | boolean | `true` | Card 4 is "if approved" in the product brief |
| `mediaTone` | `'grey' \| 'charcoal'` | `'grey'` | Flips every media block between the quiet plate and the charcoal one |
| `scrollPerStep` | 50–140 svh | `80` | How much scroll one service swap costs — the pacing dial for the animation |
