# Quick 261015-isk · Summary

## Found (origin/main 0402375e)

- **Markup:** zero uses of `data-i18n-skip` in `app/`, `assets/`, `apps/web` or `docs/` markup. The 28 leftovers were converted in 26.2 (`78744e0a`); `apps/web/lib/i18n-opt-out.test.ts` guards `app/`, `apps/web/app`, `apps/web/components`. Only remaining carrier: `design-system/_ds_bundle.js` (vendored kit runtime). `app/vamos-locale.js` parks that runtime (`defend()`, line ~634), so it does not translate pages; not edited.
- **Docs already right:** `.claude/CLAUDE.md:260, :329` and `.planning/codebase/CONVENTIONS.md:119, :298` name `data-vt-no-i18n` (or `translate="no"`).
- **Doc still wrong:** `docs/build/LEGAL-PLACEHOLDER-CHECKLIST.md` row C26 said `CLAUDE.md` still documents `data-i18n-skip`. Corrected.
- Historical planning records (phase PLAN/SUMMARY/PATTERNS files, ADR-011, `MOCK-COPY-PASS-PROMPT.md`, audit reports) describe the state when written; left as they are.

## Changed

- `docs/build/LEGAL-PLACEHOLDER-CHECKLIST.md` C26: names `data-vt-no-i18n` / `translate="no"`, states the docs and the guard test.

## Verified

- `VamosLocale.coverage` (headless Chromium, `app/vamos-i18n-dict.js` + `app/vamos-locale.js` from this branch, lang `de`), one unknown string per case:
  - no attribute: 1 missing
  - `data-i18n-skip`: 1 missing (ignored, still translated)
  - `data-vt-no-i18n`: 0
  - `translate="no"`: 0
- `vitest run lib/i18n-opt-out.test.ts lib/checkout/phase-26-4-laws.test.ts lib/checkout/manage-pages-i18n.test.ts`: 3 files, 64 tests passed (run in the main checkout on 0402375e; this branch changes no code).

## Not done

- No markup change (none needed). No gate run (docs only). No deploy.
