---
name: vamos-taxi-design
description: Use this skill to generate well-branded interfaces and assets for Vamos Taxi, either for production or throwaway prototypes/mocks/etc. Contains essential design guidelines, colors, type, fonts, assets, and UI kit components for protoyping.
user-invocable: true
---

Read the README.md file within this skill, and explore the other available files.
If creating visual artifacts (slides, mocks, throwaway prototypes, etc), copy assets out and create static HTML files for the user to view. If working on production code, you can copy assets and read the rules here to become an expert in designing with this brand.
If the user invokes this skill without any other guidance, ask them what they want to build or design, ask some questions, and act as an expert designer who outputs HTML artifacts _or_ production code, depending on the need.

## Where to start

- `app/` is the product layer and the layer to build on — 18 composed Design Components
  and 23 real screens. `app/README.md` lists every prop and the `<helmet>` to copy.
- `components/<group>/` are the primitives those compose (`Button`, `Input`, `Card`,
  `StatusBadge`, `PriceSummary`), shipped in `_ds_bundle.js`.
- `MIGRATION.md` maps the older `ui_kits/` mocks to the component that supersedes each.

## Non-negotiables for this brand

- **Never invent a CHF price.** Fares are a pending client input; write `CHF 000`.
  A value the client still owes is a `data-tok` pill in human words, never `{TOKEN}`.
- Vamos Taxi is a **scheduled** transfer service — never write on-demand copy
  ("arriving in 3 minutes", "hail a ride", live tracking).
- Yellow `#FDC20B` means action or attention only; selection is a 2px charcoal border.
- **No glow, ever.** No coloured or blurred halo on any state, on anything.
- **No tinted yellow or brownish surfaces.** `--vt-yellow-50…300` backgrounds and
  `--vt-yellow-600/700` text are out of the palette, including in kit components whose
  own default is tinted.
- Sentence case; uppercase only for button labels, kickers, table headers, badges.
- No emoji, ever. No hand-drawn SVG icons — use the Lucide files in `assets/icons/`.
- White type over photography always sits on a scrim.
- **Every page uses `SiteHeader` and `SiteFooter`.** Ops uses `OpsSidebar` instead.
- **Four languages in the same pass** — every visible string lands in
  `app/vamos-i18n-dict.js` with `de`, `fr` and `ar` before the work is done. Arabic is
  RTL: logical properties only.
- **Desktop, tablet and mobile in the same pass** — checked at 1440 / 1024 / 768 / 390.
- Nothing may look AI-generated: no decorative gradients, no emoji, no invented stats,
  no filler sections.
