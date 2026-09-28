---
phase: quick-260928-lcs
plan: 01
type: quick
---

# Fix `pnpm lint:css` on main (11 errors)

Goal: `pnpm lint:css` exits 0 on main without disabling any rule.

## Tasks

1. `apps/web/components/consent/CookieBanner.css:77` — `.vt-ck-link:hover` uses
   `--vt-yellow-700` as text colour (Law 02). Use `--vt-charcoal-900`, matching the
   house link hover in `LegalPage.css` / `Prose.css`: charcoal text, underline steps
   grey-300 → charcoal.
2. `apps/web/components/home/ServiceCard.css` (65, 66, 102, 110, 117, 147, 148, 161,
   162) and `Services.css:33` — physical box properties flagged by
   `csstools/use-logical`. Swap for logical equivalents: `width`→`inline-size`,
   `height`→`block-size`, `bottom`→`inset-block-end`, `padding-top`→
   `padding-block-start`, `margin-top`→`margin-block-start`, `min-width`→
   `min-inline-size`, `min-height`→`min-block-size`.

## Verify

- `pnpm lint:css` exit 0, `pnpm typecheck` exit 0.
- Screenshot ServiceCard gallery, Services strip and CookieBanner at 1440 and 390,
  LTR and RTL, and diff against origin/main.
