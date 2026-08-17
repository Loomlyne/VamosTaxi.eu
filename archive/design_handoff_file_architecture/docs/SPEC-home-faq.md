# 05 — Home · FAQ section

**Surface:** `home.dc.html` (booking website, home) · **Component:** `FAQ.dc.html`
**Position in site map:** … → Why Vamos → Reviews → **FAQ** → Footer
**Source of truth:** Figma `700 web` /Main/510 — node **32:18065** (read from the mounted file, not from a description)
**Status:** built 3 Aug 2026 · 3 of 5 answers final, 2 marked pending client input

---

## 1. Geometry — taken verbatim from node 32:18065

| Element | Source value | Kept? |
|---|---|---|
| Card grid | 3 × 360px, 40px gutter | yes (40px gutter verbatim; cards are `minmax(0,1fr)` in the project's 1200px container, so ~336px there) |
| Card radius | 20px | yes — same radius Reviews took from its own frame |
| Collapsed card | white fill, 1px inner stroke | yes |
| Expanded card | subtle grey fill, no stroke | yes |
| Question inset | 31px (card 360 − text 299) | yes |
| Question type | 24px semibold, line-height 1.35, tracking −0.03em | yes |
| Toggle | 50px circle, 30px from the card's trailing edge, **centre on the card's bottom edge** — it straddles, `matrix(0,±1,1,0,…)` in the source | yes, `bottom:-25px` |
| Chevron | one glyph, rotated (−90° collapsed / +90° expanded in the source) | yes — rotate, never swap |
| Card heights | hardcoded 230px / 354px | **no** — see §3 |
| Section heading | 52px semibold | **no** — see §4 |

Row gap is **44px**, not 40px: the toggle hangs 25px below its card, so 40px would leave only
15px of clearance when the grid wraps, and less than the circle's radius on a stacked mobile
column. 44px keeps the overhang reading as an overhang.

---

## 2. Content

Three answers are final; two touch policy that is still open (`ASSET-AND-COPY-REGISTER.md`
C03/C04) and are marked on the page.

| # | Question | Answer status |
|---|---|---|
| 1 | Is the price I see the final price? | **final** — server-side pricing, confirmed in writing, does not change after booking |
| 2 | Do I need an account to book? | **final** — guest checkout, email + mobile only |
| 3 | What payment methods do you accept? | **final** — card via Stripe; anything else is "shown at checkout", never listed |
| 4 | How far in advance do I need to book? | **placeholder** — minimum advance-booking rule not set |
| 5 | Can I cancel or change my booking? | **placeholder** — cancellation/refund policy with client + legal |

The two placeholders carry a 22px `Pending client input` flag (label-sm uppercase, 1px
`--vt-grey-300`, `info` glyph) above copy that states the gap instead of a policy. **No window,
fee or refund term is asserted** — in particular the marketed "free cancellation up to 24 h"
line is not repeated here as if it were terms.

Note the precedent: section-level dev notices were removed at review (Koussay, 3 Aug — see
SPEC-home-services §2), so this is a per-answer marker on customer-facing copy, not a scaffold
block. It disappears with the answer when the card is closed.

---

## 3. Behaviour

- **Exclusive open.** Opening a card closes whichever was open. Clicking the open card closes
  it (all-closed is a legal state). `singleOpen` can relax this to independent cards.
- **No pinned heights.** The source's 230/354 are its placeholder copy's heights. Each card
  hugs its content (`min-height:190px` only so a one-line question still reads as a card) and
  the answer animates `grid-template-rows: 0fr → 1fr` with the inner element `overflow:hidden`
  — so real copy of any length expands without clipping, in either language.
- **Timing** 200ms `--vt-ease-standard`, the system's panel/step timing (`expandMs`, 0–400).
  Height + opacity only; no scroll-jack, no autoplay, so no motion-budget exception is needed
  here (unlike Services and Reviews).
- `prefers-reduced-motion: reduce` → all transitions off; the state change is instant.
- **States:** collapsed card hover → border `--vt-charcoal-900`; toggle hover →
  `--vt-charcoal-800`; press → `translateY(1px)`; focus-visible → `--vt-ring` on the question.

### Accessibility

- One `<button>` per card, inside an `<h3>` (H2 → H3, no skipped level); the question text is
  the accessible name and the whole 24px three-line block is the hit target, well over 44px.
- `aria-expanded` on the button, `aria-controls` → panel; panel is `role="region"`
  `aria-labelledby` the question.
- Collapsed panels flip to `visibility:hidden` at the end of the transition, so a closed answer
  is out of the accessibility tree and out of Tab order while still animating open smoothly.
- The circle is `aria-hidden` decoration inside the button — never a second control.
- Behaviour is one delegated `click` listener on the section, so cards are literal markup:
  every question and answer stays directly editable, and opening one never re-renders.

---

## 4. Token / substitution notes

Same rule as the other sections: the brief names Swiss Departure tokens, this project is bound
to the **Vamos Taxi** system, so its tokens are used.

| Brief | Used here |
|---|---|
| ink-950 `#1E1F1F` | `--vt-charcoal-900` (identical value) |
| canvas-subtle `#F8F8F8` | `--vt-grey-50` `#F6F6F6` |
| border `#C7C7C7` | `--vt-grey-300` `#C2C3C3` |
| text-muted `#616464` | `--vt-text-secondary` (answers) · `--vt-text-muted` (pending flag) |
| Poppins / Qurova | unchanged — `--vt-font-body` / `--vt-font-display` |
| H2 38px | `--vt-display-3` `clamp(28px,3.2vw,40px)` — the Vamos ramp step nearest 38px, and the same H2 size How It Works and Services already use. Neither 52px (source) nor a one-off 38px |
| Accent `#5B40FF` toggle | `--vt-charcoal-900` fill + white chevron. Yellow is one primary action per region; three yellow toggles on screen would break that rule |
| Source chevron asset (expiring URL) | project's vendored `assets/icons/chevron-down.svg` through `Icon` — nothing ships pointing at a Figma asset link |

---

## 5. Responsive

| Width | Grid |
|---|---|
| ≥1024 | 3 columns (desktop, the source frame's canvas) |
| 700–1023 | 2 columns |
| <700 | 1 column, full width, same mechanic |

---

## 6. Tweaks exposed

| Prop | Type | Default | Why |
|---|---|---|---|
| `expandMs` | 0–400 ms | `200` | The one motion dial; 0 makes the accordion instant for review |
| `singleOpen` | boolean | `true` | Exclusive open is the convention, but a long FAQ page sometimes wants free-standing cards |
| `startOpen` | boolean | `true` | First card open on load (the Figma frame shows one card open) vs all closed |

---

## 7. Next.js handoff — `components/sections/faq-section.tsx`

Built here as a Design Component; the port is one client component, Tailwind, mobile-first:

- shadcn/ui `Accordion` with `type="single" collapsible` gives the exclusive-open behaviour and
  the ARIA wiring for free — `type="multiple"` is the `singleOpen={false}` case.
- Keep the grid **outside** the primitive: `Accordion` wraps a
  `grid gap-x-10 gap-y-11 sm:grid-cols-2 lg:grid-cols-3 items-start`, one `AccordionItem` per
  card. Card chrome (radius 20, white → subtle fill, stroke → transparent) goes on the item via
  `data-[state=open]:` variants.
- Replace Radix's default height animation with the `grid-rows-[0fr]` →
  `data-[state=open]:grid-rows-[1fr]` pattern used here rather than reintroducing fixed heights,
  and gate it on `motion-reduce:transition-none`.
- The toggle is `AccordionTrigger` with `[&>svg]:hidden` and its own absolutely positioned
  50px circle (`-bottom-[25px] end-[30px]`), chevron rotated by
  `data-[state=open]:rotate-180`.
- Content is a `FAQ_ITEMS` array of `{ q, a, pending }`; `pending` renders the flag. Whatever
  replaces items 4 and 5 must clear C03/C04 first.
