---
phase: quick-260928-svc
plan: 01
subsystem: web-css
tags: [services, cta, overflow, container-queries, rtl, de, responsive]
key-files:
  modified:
    - apps/web/components/home/Services.css
---

# Summary

The yellow `[data-svc-cta]` card in the Services strip clipped its headline at the top
at 1440. The 4-up row leaves a ~259px card with a fixed 4/5 shape, while the title
clamp was viewport-based and already at 28px. `justify-content: flex-end` plus
`overflow: hidden` pushed the overflow out of the top edge.

Clip before the fix, at 1440: EN 44px, FR 138px, DE 169px, AR 12px. Other widths fitted.

## Fix

- Title size is now `max(18px, min(clamp(22px, 2.2vw, 28px), 9.5cqi))`, and the card is
  an inline-size container. Only the narrow 4-up card gets smaller type (19.3px at
  1440). 1024, 768 and 390 keep their previous sizes.
- Safety net: removed `min-block-size: 0` and `overflow: hidden`, so the 4/5 shape is a
  minimum and the card grows when content needs it.
- Track items get `inline-size: 100%`. Without it, a taller row stretched each item's
  height, and `aspect-ratio` turned that into extra width, so every card overflowed its
  column.
- Copy and tokens are unchanged.

## Verification (local `next dev`, temporary uncommitted `/dev` + locale-prefix bypass)

- Checked at 1440, 1024, 768 and 390 in EN, DE, FR and AR (`dir="rtl"`). The headline and
  kicker sit inside the card padding in every case. Nothing scrolls sideways.
- Sweep from 360 to 1920 in 20px steps, all four locales: no clipping. German at 1110 to
  1150 fits exactly. At 1120 the card grows 3px, and the whole row grows with it.
- Stress test with the headline doubled at 1440 in DE: every card stays 259px wide, the
  row grows to 473px, and the kicker stays inside.
- `pnpm lint:css` exit 0 (with the #63 lint commit cherry-picked). `pnpm typecheck` exit 0.

## Not fixed here (pre-existing)

- The CTA pill label wraps to two lines ("BOOK A / TRANSFER") inside its fixed 48px
  height at 1440.
- German "Flughafentransfer" in `ServiceCard` runs past the card's inline padding at
  1440.
