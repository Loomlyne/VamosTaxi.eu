# Quick 261015-isk · i18n opt-out attribute: markup and docs

**Goal:** no surface uses `data-i18n-skip` (the runtime ignores it), and every doc that tells a builder how to opt a subtree out of translation names `data-vt-no-i18n` (or `translate="no"`).

**Files:** markup under `app/`, `assets/`, `apps/web` if any carries the attribute; `.claude/CLAUDE.md`; `.planning/codebase/CONVENTIONS.md`; `docs/` lines that call the docs wrong.

**Check:** `grep -rn data-i18n-skip app assets apps/web docs` shows no markup; `VamosLocale.coverage` in Chromium proves which attribute is honoured; `i18n-opt-out`, `phase-26-4-laws`, `manage-pages-i18n` tests pass.
