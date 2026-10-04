# R2-4 Reviews wall self-drift (pictures only, no product file touched)

Recommendation: Option A (vertical drift). CSS: proposal.css. Option B (horizontal marquee): proposalB.css.
Shot script: shots.mjs (needs a node static server: serve.mjs <public dir> 4800; python http.server resets connections under this load).

## DOM the coder produces (Reviews.dc.html + byte copy app/pages/Reviews.dc.html)
Threshold: published reviews > 6 -> `data-rv-drift="y"` on the wall, else today's CSS-columns masonry unchanged.
Columns n = 1 (<=680px) / 2 (<=1080px) / 3 (wider), the repo breakpoints; cards dealt round-robin (i % n); component recomputes on matchMedia change.

    <div data-rv-wall data-rv-drift="y" style="--rv-cols:3">       <!-- fixed-height masked viewport -->
      <ul data-rv-col style="--rv-count:5">                         <!-- one track per column -->
        <li data-rv-item>…real cards…</li>
        <li data-rv-item data-rv-clone aria-hidden="true" inert>…same cards again…</li>
      </ul> x n
    </div>

Clones: aria-hidden + inert, so no focus, no AT duplicates, links not tabbable. Loop is translateY(-50%) of the track, seamless because every item has the same bottom margin.
Reading order for AT/keyboard is column by column (col 1 top-to-bottom first); acceptable, cards are independent.

## Decisions
- Direction: vertical upward drift, per-column speed 1 / 1.15 / .9 (duration = cards-in-column x 9s x k, about 45 s per loop at 5 cards, about 10 px/s).
- Threshold: more than 6 published reviews. 6 = static (R2-4-after-6-static-*), 14 = drifting.
- Viewport height clamp(520px, 80svh, 720px). Edge fade 56px, mask-image on the wall: it fades the cards out, adds no colour, so it is a soft crop and not a decorative gradient. Hard-crop fallback = delete the two mask-image lines.
- Pause: :hover and :focus-within on the wall (proven in Chromium: transform moves -32 px in 1.5 s, held at -33.16 px under hover). Touch has no hover: drift continues while a finger scrolls the page; wall itself does not capture touch (no overflow scroll), page scroll stays native.
- prefers-reduced-motion: animation none, clones display:none, viewport height auto, no mask: all reviews shown (390 height 3405 px, 1440 height 1177 px, no sideways scroll).
- RTL: columns follow dir; star rows stay LTR as today. Option B flips direction via its own rtl keyframes.
- Law check: no scroll library, nothing written on <html> from scroll, tokens only (space-5, gap), no glow, no tint, no new strings (i18n: none).

## Risks
- Cards under a fixed height crop mid-card at the top and bottom by design; the fade hides the cut.
- Heights per column differ, so columns loop at different moments (intended, avoids lockstep).
- A reader who wants one specific review on a phone waits for the drift; hover/focus pause helps only on desktop. Alternative if that bothers him: below 680px keep the static wall (one-line change: threshold only above 680px).
- Files the coder touches: app/home/Reviews.dc.html and byte copy app/pages/Reviews.dc.html (CSS + renderVals deal-into-columns + matchMedia). Tests: add a drift spec (threshold, clone inert, reduced motion); existing home-reviews spec targets the React twin and is unaffected.
