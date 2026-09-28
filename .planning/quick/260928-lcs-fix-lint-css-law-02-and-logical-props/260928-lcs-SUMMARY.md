---
phase: quick-260928-lcs
plan: 01
subsystem: web-css
tags: [stylelint, law-02, law-03, logical-properties, rtl, cookie-banner, services]
key-files:
  modified:
    - apps/web/components/consent/CookieBanner.css
    - apps/web/components/home/ServiceCard.css
    - apps/web/components/home/Services.css
---

# Summary

`pnpm lint:css` went from 11 errors to 0. `pnpm typecheck` passes.

- Cookie banner link hover: `--vt-yellow-700` → `--vt-charcoal-900`. At rest it is
  charcoal with a grey-300 underline; on hover the underline turns charcoal. No brown
  text remains.
- ServiceCard / Services: 10 physical box properties → logical equivalents. In a
  horizontal writing mode these resolve to the same axes, so the render is unchanged.

## Visual check (local `next dev`)

- Screenshots at 1440 and 390, in LTR and in RTL (`dir="rtl"`, `lang="ar"` set on the
  document), cover the ServiceCard, the Services strip and the CookieBanner.
- ServiceCard and Services screenshots are byte-identical to origin/main in both
  directions. RTL mirrors: title, description and "learn more" are
  inline-end-aligned, and the arrow is flipped.
- The CookieBanner differs from origin/main only in its hover frames. `scrollWidth`
  equals the viewport at 390.
- Reaching these surfaces locally needed two temporary, uncommitted bypasses. The
  `/dev` gallery 404s on every host, and `/` serves the DC mock, which means the Next
  CookieBanner cannot be reached. Both bypasses were reverted before the commit.

## Pre-existing, out of scope (seen during the check, not changed)

- `[data-svc-cta]` yellow CTA card in the Services strip: headline overflows the top
  of the card at 1440 (LTR and RTL), identical on origin/main.
- Service photos render as broken images in the local `/dev/home/services` gallery.
