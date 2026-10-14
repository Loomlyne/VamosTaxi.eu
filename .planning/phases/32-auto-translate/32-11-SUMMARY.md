---
phase: 32-auto-translate
plan: 11
subsystem: home-reviews
tags: [reviews, translation, dc-mock, i18n]
requires: [32-04, 32-08]
provides:
  - VamosReviews review rows carry ref and lang; VamosReviews.translate(ref, lang)
  - Home review card Translate / Translating… / Show original / Try again control
key-files:
  modified:
    - app/vamos-reviews.js
    - app/home/Reviews.dc.html
    - apps/web/lib/icons/dynamic-icon-bindings.ts
  created:
    - apps/web/lib/public/reviews-translate-dc.test.ts
metrics:
  tasks: 2
  completed: 2026-10-14
---

# Phase 32 Plan 11: Home review card translate Summary

A review card on the home page shows a Translate button when its language is known and differs from the site language; a tap shows Translating…, then the translation with Show original; a failure shows "Translation not available" and Try again. Nothing is fetched at load.

## Commits
- 15b74ae4: store `ref`, `lang`, `translate(ref, lang)` (GET `/api/reviews/<ref>/translation?lang=`; resolves `{ok,text}` or `{ok:false}`, never throws, no storage).
- f89bb8bc: `[data-rv-tr-row]`/`[data-rv-tr]`/`[data-rv-tr-note]` markup and CSS in both loops (still wall and drift wall), logic (`tap`, `setTr`, 20 s ceiling, locale reset, timers cleared on unmount), icon binding (`r.trIcon`: globe, loader-circle), vm-run test.

## Verification
- vitest: reviews-translate-dc (11), icon-files-exist and lib/icons, lib/translate, audit-26-2-u08, reviews-json: all passed (184 + 28 + 20 across runs).
- `pnpm i18n:check` passed; `tsc --noEmit` clean for the new test; eslint clean.
- `node scripts/sync-dc-mock-to-public.mjs` run (public copy is not tracked).
- Not run: browser proof at 1440/1024/768/390 x en/de/fr/ar (plan 32-12).
- Stack lock: not used (no database needed).

## Deviations from Plan
- Prototype keyed by `r.id`; per plan this uses `r.ref` (`trShow` also requires a non-empty ref). `r.id` count in Reviews.dc.html stays 0.
- The plan asked for a reduced-motion rule for the loader spin. The kit icon has no spin animation, so a defensive `animation:none; transition:none` rule on `[data-rv-tr]` was added instead of a spin override.

## Known Stubs
None.

## Self-Check: PASSED
Files exist; commits 15b74ae4 and f89bb8bc are on the branch.
