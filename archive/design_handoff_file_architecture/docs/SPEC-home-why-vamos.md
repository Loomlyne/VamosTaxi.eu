# 04 — Home · Why Vamos section

**Surface:** `home.dc.html` (booking website, home) · **Component:** `WhyVamos.dc.html`
**Position in site map:** Widget → How It Works → Services → **Why Vamos** → Reviews → FAQ → Footer
**Status:** built, copy **unfrozen** (dev placeholder, visibly marked) · spec'd 3 Aug 2026

---

## 1. Purpose

The one section on the page that argues, in words, why a pre-booked transfer is a different
product from a hailed ride. It is a **Learn** surface: it carries no price, no vehicle picker
and no primary CTA — the quote widget above owns conversion.

Non-goals: no icon cards (that is Services' signature), no quote/avatar cards (that is Reviews,
next), no stat band, no "trusted by" line. See §2.

---

## 2. Form — deliberately not a card grid

Services is an icon-card grid; Reviews will be quote/avatar cards. Three card grids in a row
flattens the page's rhythm, so this section is **editorial and text-forward**:

- intro on the left (top on mobile) — eyebrow, H2, one deck line, one quiet text link
- a vertical numbered list of five reasons on the right (below on mobile)
- 1px `--vt-grey-300` hairline between each row, and closing the last — the **same divider
  treatment as the hero trust strip**
- numerals `01`–`05` in `--vt-yellow-700` (accent-on-light) instead of icons

No boxes, no fills, no shadows anywhere in the section. The only surface with a border is the
dev-only notice, which does not ship.

---

## 3. Content

Sentence case per design system §2. Voice: plain, second person, present tense.

| # | Headline | Support line |
|---|---|---|
| 01 | Fixed price, no surge | The price shown when you book is the price charged — no meter, no demand pricing, no surprise at the curb. |
| 02 | Scheduled, not on-demand | Your driver is booked for your exact pickup time: pickup scheduled for 06:30, not the nearest available car. |
| 03 | Local Swiss operator | We drive from Dietikon ZH — Zurich and Geneva airports, the city, and the Alpine routes we run every week. |
| 04 | Professional drivers *(claim pending approval)* | Vetted for airport and corporate travel. |
| 05 | Built for business travel | Invoiced transfers, corporate accounts and scheduling you can plan a week around. |

Intro: eyebrow "Why Vamos" · H2 "Booked ahead, priced up front, driver waiting." · deck
"Five things that hold on every transfer we drive, from the 05:00 airport run to a cross-town
board meeting."

### Content rules honoured

- **Scheduled Certainty** (CONTENT-STYLE.md): 02 states a scheduled time
  ("pickup scheduled for 06:30"), never "your ride is arriving".
- **Local Restraint:** 03 is a plain fact of geography and operations — no ranking, no
  "Switzerland's #1", no superlative of any kind.
- **No invented numbers.** There is no review count, no "trusted by X companies", no years-in-
  business figure. Omitted entirely rather than placeheld: an obviously fake stat reads as a
  lie, where missing copy reads as a gap. This is the one placeholder type the section refuses.
- **04 is marked pending on the page itself** — a hairline uppercase tag
  "Claim pending approval" beside the headline — because a driver-vetting promise is a legal
  claim and none is approved in the copy register yet.
- **Dev-only notice** under the list states that all five headlines are unregistered
  placeholder copy, that 04 needs an approved claim, and why no stat appears. Behind
  `showPlaceholderNotice` (default `true`) so it can be switched off for a client review.
  *Note the Services precedent: its visible notice was removed at review on 3 Aug — if the
  same call is made here, flip the tweak rather than deleting the markup.*

---

## 4. CTA

None that competes with the widget. One quiet secondary text link in the intro column —
**"Back to booking"** with a Lucide `arrow-up`, underlined by a 1px `--vt-grey-300` rule that
goes charcoal on hover, `#book` as target, 44px minimum height. Behind `showBackToBooking`.
The `↑` is drawn as the real Lucide glyph, not a unicode arrow (design system §5).

---

## 5. Layout

| Breakpoint | Structure |
|---|---|
| 360–1023 (16px gutter at 360) | Single column: intro, then the five rows stacked. Row grid `40px / 1fr`, 12px column gap, 22px padding top and bottom → 44px between text blocks. |
| ≥1024 | Two columns `5fr / 7fr`, column gap `clamp(48px,6vw,104px)`, `align-items:start`. Intro is `position:sticky; top:96px` (the system's rail offset) — `stickyIntro` turns it static. Row grid `64px / 1fr`, 24px column gap, `clamp(22px,2.4vw,28px)` padding → 44–56px between rows. |

Container 1200px, section padding `clamp(56px,7vw,104px)` — identical to How It Works and
Services, so the three sections keep one vertical rhythm. Background `--vt-bg-surface` (white);
Services sits on `--vt-bg-page`, so the page alternates without introducing a third colour.

Type: numerals `--vt-figure-sm` → `--vt-figure-md` in Qurova (the system sets **figures** in
Qurova; the display face is otherwise used for the H2 only, per the brief). Headlines are
Poppins 600 at `--vt-heading-4` (17px) → 19px; support lines `--vt-body-sm` → `--vt-body-md`,
`--vt-text-secondary`, `max-width:54ch`. Nothing is clamped or truncated — German grows ~30%.

---

## 6. Motion

Restrained, matching Services' fallback rather than its stage: **no pin, no scroll-jack, no
crossfade sequencing**.

- One `IntersectionObserver` (threshold 0.15, `rootMargin 0 0 -6% 0`), **one-shot** — each row,
  the intro and the notice get `data-seen="1"` on entry and are then unobserved.
- Per element: opacity 0 → 1 and `translateY(8px)` → 0 over 300ms `--vt-ease-out`.
- Rows 2–5 carry 60/120/180/240ms `transition-delay`, so a desktop viewport showing three rows
  at once reads as a short cascade, not a simultaneous pop.
- Attributes are written imperatively, so revealing never re-renders the template.
- `prefers-reduced-motion: reduce`, a missing `IntersectionObserver`, or
  `revealOnScroll: false` → everything renders visible with no transition at all.

---

## 7. Accessibility

- `aria-labelledby="why-title"`; H2 → H3 per row, no skipped levels.
- Numerals are `aria-hidden` decoration — they carry no meaning a screen reader needs, and the
  list is not an ordered ranking.
- Nothing is `display:none` or `visibility:hidden` at any reveal state: content is in the DOM
  and in reading order from first paint, so reading is never gated on animation.
- The single link is 44px tall, keeps a visible focus state (colour + border go charcoal) and
  is the only focusable element in the section.
- Text contrast: `--vt-yellow-700` numerals and `--vt-text-secondary` body on white; the
  10px uppercase tags are `--vt-text-muted` on white and are supplementary, never sole meaning.

---

## 8. Token / substitution notes

Brief names Swiss Departure tokens; this project is bound to the Vamos Taxi design system.
Mapping matches SPEC-home-services.md §7:

| Brief | Used here |
|---|---|
| ink-950 `#1E1F1F` | `--vt-text-primary` (`--vt-charcoal-900`) |
| text-muted `#616464` | `--vt-text-secondary` (`--vt-charcoal-600`); `--vt-text-muted` for the eyebrow and dev tags |
| text-accent-on-light `#875D00` | `--vt-yellow-700` `#A67B05` — the system's own accent-on-light |
| canvas `#FFFFFF` | `--vt-bg-surface` |
| canvas-subtle `#F8F8F8` | `--vt-grey-50` (dev notice only) |
| border `#C7C7C7` | `--vt-grey-300` `#C2C3C3` — decorative dividers |
| H2 28/38px, 600 | `--vt-display-3` `clamp(28px,3.2vw,40px)`, `--vt-weight-semibold` |
| Spacing 4px base | `--vt-space-*` scale (4px base) |

---

## 9. Next.js port — `components/sections/why-vamos-section.tsx`

App Router, Tailwind, shadcn/ui, mobile-first, **one** component (no desktop/mobile split):

- `REASONS` as a typed array (`{ n: string; title: string; body: string; pending?: boolean }`)
  mapped into `<li>`s inside a single `<ul>`; the five strings are authored as literal markup
  here only so they stay directly editable in the design tool.
- Grid: `grid lg:grid-cols-12 gap-8 lg:gap-x-[6vw]`, intro `lg:col-span-5 lg:sticky lg:top-24`,
  list `lg:col-span-7`; rows `border-t border-[#C7C7C7] py-[22px] lg:py-7`.
- Reveal: one `useEffect` + `IntersectionObserver` over the row refs, `unobserve` on first
  intersection, toggling a `data-seen` attribute that Tailwind targets with
  `data-[seen=true]:opacity-100 data-[seen=true]:translate-y-0`. No Framer Motion needed, and
  no scroll listener — keep it one-shot.
- Reduced motion: gate the observer on
  `window.matchMedia('(prefers-reduced-motion: reduce)').matches` and render revealed.
- shadcn/ui contributes nothing structural here (no Card, no Button) — the section is type and
  hairlines. Keep it that way; a Card wrapper would collapse it back into the Services grid.
- Props mirror the tweaks in §10.

---

## 10. Tweaks exposed

| Prop | Type | Default | Why |
|---|---|---|---|
| `stickyIntro` | boolean | `true` | Pinned vs static left column — the layout question the brief left open |
| `showBackToBooking` | boolean | `true` | The quiet secondary link is optional by the page's CTA rule |
| `showPlaceholderNotice` | boolean | `true` | Hide the dev-only notice for a client review without deleting it |
| `revealOnScroll` | boolean | `true` | Same switch as How It Works; off renders everything visible |
