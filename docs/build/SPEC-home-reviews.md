# 05 — Home · Reviews section

**Surface:** `home.dc.html` (booking website, home) · **Component:** `Reviews.dc.html`
**Position in site map:** Widget → How It Works → Services → Why Vamos → **Reviews** → FAQ → Footer
**Status:** built, content **blocked** on real review data + a confirmed platform account · spec'd 3 Aug 2026
**Reference:** Figma `700 web` → `/Main/263`, node **315:25968** ("What clients say about us")

---

## 1. Purpose

Third-party proof, in the traveller's own words, immediately before the FAQ answers the
objections those words raise. It carries no price and no CTA — the widget above owns conversion.

Non-goals: no star average, no review count, no "rated 4.9 by 2,300 travellers" band. See §3.

---

## 2. Form — one card, one quote (not a grid)

Straight from the reference frame, so the page gets a fourth distinct rhythm: Services is an
icon-card grid, Why Vamos is a numbered editorial list, Reviews is **one attribution card next
to one large quote**, advanced by a carousel.

Geometry transcribed from the Figma frame (1440 wide, 140 gutters → 1160 content):

| Element | File value | Built as |
|---|---|---|
| Card | 360 × 494, radius **20**, `#F7F7F8` | `360fr` column, radius 20px, `--vt-grey-50` `#F6F6F6` |
| Column gap | 40 | `column-gap:40px` |
| Quote panel | 760 wide, 1px rules top **and** bottom | `760fr` column, `border-top/bottom`; on desktop the box is pulled 40px left (padding restored, so the text does not move) so it sits **flush against the card with no gap**, with `border-top/right/bottom` and the card's own 20px radius mirrored on its right corners. Card and panel therefore read as one continuous shape: the card takes `20px 0 0 20px`, the panel `0 20px 20px 0`, and the seam between grey and white is the only join. Review notes, Koussay, 3 Aug. Mobile keeps a full-radius card and top/bottom rules only — stacked, a lone right rule reads as a stray line |
| Quote type | 36px / 1.4 / −0.03em, weight 600, centred, 610 measure | `clamp(21px,2.35vw,28px)` / 1.45 / −0.02em, Qurova 600, `max-width:34ch` |
| Avatar | 157 circle, centred, 114 from card top | `clamp(112px,12.4vw,148px)` circle |
| Platform mark | 120 × 34.7, 45 from card top | 36px-tall mark slot |
| Pagination | 248 × 50, row gap 30, 88px dot row, 37 from card bottom | identical; 50px circles, 13px dot gap, 7px dots |

Quote size is the one deliberate departure: 36px is drawn for a 610px measure on a 1440 canvas;
at this project's 1200/1088 container the same optical weight lands at 24–28px, which is also
what the brief asks for. Radius 20px likewise overrides the system's 16px card radius — the
reference's proportion, kept on purpose.

**Recolour:** the reference's purple accent is dropped completely. Nothing in this section is
yellow either — yellow means action (design system §3) and there is no action here.

---

## 3. Content — the rule that outranks the layout

**Nothing on this page may look like a review that does not exist.** Carried over unchanged from
the earlier Reviews brief and applied the same way as `CHF 000` in the funnel:

- **No count, no average, no rating.** Not in the heading, not as a badge, not as stars.
- **Quotes are verbatim or absent.** A real review is pasted from the platform and trimmed only
  at the end, marked with `…`; it is never paraphrased, re-punctuated or stitched together.
- **The five placeholders in the file describe their own slot** — "One verbatim sentence from a
  real review sits here", "This is about the longest excerpt the measure holds…". They are
  self-evidently not testimonials, and their lengths deliberately span the range the block must
  hold (one line → truncated) so the layout is proven before real text arrives.
- **Names:** first name + last initial only, everywhere in this project. The placeholder reads
  `First L.` on every slide, which is what the field will look like — not a plausible invented
  Swiss name.
- **Subtitle is not a job title.** The reference's "Art director at Airbnb" has no analogue for a
  transfer customer. It reads `Verified <Platform> review`. Trip context ("Airport transfer,
  Zurich") is the sanctioned alternative if the platform exposes it; either is true, an invented
  employer is not.
- **Dev-only notice** under the block states the remaining gaps (fake-data rule, platform
  account). Behind `showPendingNotice`, now default `false` after the 3 Aug review — the markup
  stays rather than being deleted. Same precedent as Services and Why Vamos.

---

## 4. Platform, per review — never sitewide

`ReviewCard` takes `platform: 'google' | 'tripadvisor' | 'trustpilot'` and renders **that**
review's source at the top of the card. One logo hardcoded across the section would misattribute
every review that came from somewhere else.

**Blocking question for the client:** which of the three has a real, live Vamos Taxi profile?
A platform mark on the page is a claim that an account exists behind it, so until that is
answered the mark slot renders the platform **name set in type** — the same substitution the
system already uses for payment marks (design system §7.4). No third-party logo is drawn,
traced or approximated by hand.

When the answer arrives: drop the official asset each platform's brand guidelines require into
`assets/platform/<platform>.svg`, point the mark slot at it, and only wire the platforms that
came back with a yes.

---

## 5. Layout

| Breakpoint | Structure |
|---|---|
| 360–899 | Single column: card, then the quote panel, then the pagination row centred **below the quote** (DOM order already is card → quote → nav, so nothing reorders). Card padding `26/20`, quote padding `30px 0`. |
| ≥900 | `360fr / 760fr`, 40px column gap, `align-items:stretch` so the quote panel and card share one height. The nav is absolutely positioned 37px from the card's bottom edge, centred in a column-width box; the card reserves 124px of bottom padding for it, so it can never collide with the identity block. |

Container 1200px, section padding `clamp(56px,7vw,90px) clamp(16px,3.2vw,56px)` and the
`14px` eyebrow → H2 stack — identical to How It Works, Services and Why Vamos, so the four
sections keep one vertical rhythm. Background `--vt-bg-surface` (white); the card is the only
tinted surface, and `--vt-bg-page` is the same `#F6F6F6`, which is why the section itself stays
white.

Both stacks (card identity, quote) are CSS-grid single-cell stacks: all five slides sit in
`grid-area:1/1`, so the panel is as tall as its longest quote and **nothing reflows on advance**.
No fixed heights, no measuring.

---

## 6. Motion

- **Auto-advance:** **2.5s dwell** (`autoplaySeconds`), 480ms slide (`slideMs`) on `--vt-ease-out` — `cubic-bezier(.16,1,.3,1)`, the same entrance curve the Why
  Vamos wipe uses, so the slide decelerates into place instead of snapping. Nothing scales,
  nothing springs.
- **A real slide, not a nudge** (review note, Koussay, 3 Aug): each stack is `overflow:hidden`, so
  the incoming slide travels a **full panel width** from the right to 0 while the outgoing one
  carries on to `-100%`. The pair moves together across the whole block — card identity and quote
  alike — with no cross-fade; opacity stays at 1 throughout.
- **Three states, not two:** `paint()` marks the slide that just left with `data-was="1"`, which is
  what parks it on the far side; without it the incoming slide would arrive over a static ghost.
- **Direction:** `data-dir` on the section mirrors both ends, so prev slides left-to-right.
- **Manual override is final.** Either arrow (or ArrowLeft/ArrowRight while the block holds
  focus) jumps immediately and **stops autoplay for the rest of the session** — a reader who has
  taken control is never overruled by the timer.
- **Pause on hover/focus** (required, not optional): `mouseenter`/`mouseleave` and
  `focus`/`blur` on the block hold the timer and release it on exit; two independent flags, so
  leaving the mouse while focus stays inside does not resume. A hidden tab also holds.
- **`prefers-reduced-motion: reduce`** → autoplay never arms and every transition is dropped;
  the arrows still work. `autoplaySeconds: 0` is the same thing as an explicit setting. At 1.5s
  the pause-on-hover/focus rule is doing real work: it is the only way to finish a long quote.
- Steps write `data-on` / `aria-hidden` imperatively — advancing costs a few attribute writes,
  not a React render, so the copy is never remounted while a user is editing it.

---

## 7. Accessibility

- `aria-labelledby="reviews-title"`; the block is `role="group"` +
  `aria-roledescription="carousel"`, each quote `role="group"` + `aria-roledescription="slide"` +
  `aria-label="Review n of 5"`.
- Off-screen slides are `aria-hidden="true"` and `visibility:hidden` (transitioned with a delay,
  so they stay hidden from the tab order but still animate out) — a screen reader never hears
  five quotes at once.
- Arrows are 50px, real `<button>`s, labelled "Previous review" / "Next review", with the
  system's 3px yellow focus ring and a `translateY(1px)` press.
- Dots are decorative (`aria-hidden`) status only, not controls: at 7px they cannot carry a 44px
  target without breaking the reference's 88px row, and the arrows already give full control.
- Manual navigation writes "Review n of 5" into a visually-hidden `aria-live="polite"` status.
  Autoplay does **not** announce — a live region firing every 6s is noise.
- The avatar is `aria-hidden`: the initials repeat the name beside it.

---

## 8. Token / substitution notes

| Brief | Used here |
|---|---|
| ink-950 `#1E1F1F` | `--vt-charcoal-900` / `--vt-text-primary` — H2, quote, name, avatar fill, arrow borders, active dot |
| text-muted `#616464` | `--vt-text-secondary` (`--vt-charcoal-600`) for the subtitle and notice; `--vt-text-muted` for the eyebrow |
| canvas-subtle `#F8F8F8` | `--vt-grey-50` `#F6F6F6` — the card |
| border `#C7C7C7` | `--vt-grey-200` `#DEDEDE` for the two quote rules (the brand's own hairline grey; `--vt-grey-300` `#C2C3C3` reads too heavy across a 760px rule) and `--vt-grey-300` for inactive dots and the notice frame, where it needs to be seen |
| reference purple | dropped — no accent in this section at all |
| Reference `Inter 600` | Qurova (display) for H2, quote, avatar initials; Poppins for name, subtitle, notice |

---

## 9. Next.js port — `components/sections/reviews-section.tsx`

App Router, Tailwind, shadcn/ui. Two files: the section and `ReviewCard`.

```ts
type Platform = 'google' | 'tripadvisor' | 'trustpilot';
type Review = {
  id: string;
  platform: Platform;            // per review — never a section-level constant
  firstName: string;             // "First"
  lastInitial: string;           // "L"
  quote: string;                 // verbatim; truncate, never rewrite
  truncated?: boolean;           // renders the trailing ellipsis
  tripContext?: string;          // optional subtitle alternative to "Verified … review"
};
```

- **Server-side fetch only.** `reviews-section.tsx` is a server component; it `await`s
  `getReviews()` from `lib/reviews.ts`, which reads `process.env.<PLATFORM>_API_KEY` and runs on
  the server with `next: { revalidate: 86400 }`. The key is never imported into, referenced by,
  or serialised to the client — the carousel is a small `'use client'` child that receives the
  already-fetched array as props.
- Rate limits and outages: cache the last good payload; on failure render nothing (the section
  is omitted) rather than an empty carousel or a skeleton pretending to hold reviews.
- Truncation happens server-side at a character budget, at a word boundary, appending `…`.
- Names are assembled server-side as `${firstName} ${lastInitial}.` — full surnames never reach
  the client bundle.
- `ReviewCard` props: `{ review, total, index, onPrev, onNext }`. It owns the mark slot, the
  initials circle (`getInitials(firstName, lastInitial)`), name, subtitle and pagination.
- Marks: `PLATFORM_MARK: Record<Platform, {src: string; alt: string} | null>` — `null` falls back
  to the typographic name, which is the current state for all three (§4).
- Carousel: `useEffect` interval keyed on `[index, paused, stopped]`, cleared on unmount;
  `useReducedMotion` (or a `matchMedia` check) gates arming; `onMouseEnter/Leave` and
  `onFocus/Blur` set `paused`; arrow handlers set `stopped` permanently.
- shadcn/ui contributes `Button` (`variant="outline" size="icon"`, `rounded-full`) for the two
  arrows. **Do not** reach for `Carousel`/Embla here: it wants equal-width slides in a scroller,
  where this layout keeps one static card and cross-fades a stacked quote.
- Grid: `grid lg:grid-cols-[360fr_760fr] lg:gap-x-10`, slides stacked with
  `[grid-area:1/1] data-[on=true]:opacity-100`.

---

## 10. Tweaks exposed

| Prop | Type | Default | Why |
|---|---|---|---|
| `autoplaySeconds` | range 0–12 s | `2.5` | Dwell per slide — 0 disables autoplay entirely |
| `slideMs` | range 200–900 ms | `480` | Slide duration. A full-width travel needs longer than a fade did; must stay well under the dwell |
| `showPendingNotice` | boolean | `false` | Switched off at review 3 Aug; the markup stays for the next data pass |

---

## 11. Open questions for the client

1. **Which platform(s) have a live profile?** Blocks every logo on this section (§4).
2. **Was "1.5s" the dwell per slide or the transition?** 1.5s of dwell is far too fast to read a
   quote; 1.5s of transition is far too slow. Built at 6s / 400ms until answered.
3. **Consent for names.** First name + last initial is our practice; confirm it also satisfies
   each platform's terms for republishing review text on our own site.
4. **How many reviews rotate?** Five slides are drawn; the layout holds any number, but past
   ~7 the dot row needs a different treatment.
