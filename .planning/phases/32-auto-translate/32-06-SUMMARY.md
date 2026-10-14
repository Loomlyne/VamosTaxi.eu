---
phase: 32-auto-translate
plan: 06
subsystem: extras-translation
tags: [workers-ai, gemma-4, extras, pricing, i18n]
requires: [32-01, 32-02]
provides:
  - planExtraLabels on the shared engine (one translateText call for the missing languages)
affects: [32-05 (nightly extras fill completes what a failed save left empty)]
key-files:
  modified:
    - apps/web/lib/ops/extra-label-translate.ts
    - apps/web/lib/ops/extra-label-translate.test.ts
    - apps/web/lib/ops/rate-book-labels.test.ts
    - apps/web/app/[locale]/(ops)/api/staff/rate-book/route.ts
decisions:
  - "translateExtraName and the m2m100 TRANSLATE_MODEL export are gone; the model id comes only from lib/translate/model.ts"
  - "One translateText call (10 s limit) asks only the languages still missing; AiLike is re-exported from the engine so the route import is unchanged"
  - "ß to ss and the guard are done by the engine; the module keeps only the MAX_LABEL (80) cap"
metrics:
  tasks: 2
  files: 4
  completed: 2026-10-14
---

# Phase 32 Plan 06: Extras on the shared translator Summary

Extras names are translated by the one Gemma engine (`translateText`) in a single call for the missing languages; the staff-wins rules in `planExtraLabels` are unchanged, a failed or rejected language stays empty (nightly fill completes it), and there is no mark and no Pricing UI change.

## Tasks

| # | Task | Commit |
|---|---|---|
| 1 | planExtraLabels on the shared engine, tests moved to the Gemma shape | `bdbc9f23` |
| 2 | Route comment points at the shared translator and the nightly fill | `6d20c98a` |

## Verification (2026-10-14, stubs only, no network)

- `vitest run lib/ops/extra-label-translate.test.ts lib/ops/rate-book-labels.test.ts`: 2 files, 13 tests passed. Cases: one call for de/fr/ar and model id equals `TRANSLATE_MODEL`; typed de kept and only fr/ar asked; rename keeps typed, re-translates machine; unchanged English makes no call; no binding / throw / timeout leaves null without throwing; guard-rejected language stays null; ß becomes ss; 80-character cap.
- `tsc --noEmit` (apps/web): exit 0. `eslint` on the three files: exit 0.
- `git grep m2m100 -- apps/web packages scripts app`: no match. `grep -c translateText extra-label-translate.ts` = 3.
- `git diff <merge-base 1c28a8ba> -- route.ts`: 6 inserted comment lines, 1 removed; `app/ops/OpsPricing.dc.html`: no change.

## Deviations from Plan

None to the contract. Test stubs return Arabic letters for `ar` (the engine guard rejects Arabic output in Latin script, which is the intended behaviour). `saveExtraLabels` already ran after the surcharge save and swallowed every error, so Task 2 changed a comment only.

## Known Stubs

None.

## Threat Flags

None. T-32-18 (staff-wins, tested), T-32-19 (10 s limit, catch-all in `saveExtraLabels`), T-32-20 (engine guard, 80 cap) are covered.

## Self-Check: PASSED

Files exist; commits `bdbc9f23` and `6d20c98a` are in `git log`.
