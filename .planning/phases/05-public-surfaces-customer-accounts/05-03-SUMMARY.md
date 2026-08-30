---
phase: 05-public-surfaces-customer-accounts
plan: 03
subsystem: i18n
tags: [i18n, legal, next-intl, playwright]

requires:
  - phase: 01
    provides: four-language dictionary, next-intl, design tokens
provides:
  - LEGAL_LANGUAGES
  - PHASE_5_ROUTES
  - LanguageCoverageNotice
affects: [05-04, 05-05, 05-06, 05-07, 05-10, 05-12, 05-16, 05-20]

tech-stack:
  added: []
  patterns: ["declared per-page language coverage, server-rendered notice"]

key-files:
  created:
    - apps/web/lib/legal-languages.ts
    - apps/web/components/legal/LanguageCoverageNotice.tsx
    - apps/web/components/legal/LanguageCoverageNotice.css
    - apps/web/components/legal/index.ts
    - apps/web/app/[locale]/dev/legal-notice/page.tsx
    - apps/web/tests/visual/legal-notice.spec.ts
  modified:
    - apps/web/i18n/messages/en.json
    - apps/web/i18n/messages/de.json
    - apps/web/i18n/messages/fr.json
    - apps/web/i18n/messages/ar.json
    - apps/web/i18n/key-map.json

key-decisions:
  - "imprint stays en/de (D-12)"
  - "/sign-up listed on PHASE_5_ROUTES before PUBLIC_ROUTES grows it in 05-16"
  - "become-a-partner stays in inventory; page not ported in V1"

requirements-completed: [I18N-08]

duration: 35min
completed: 2026-08-28
---

# Phase 05: 05-03 i18n + legal notice

**Four-language keys for the phase plus I18N-08 notice. Imprint declared en/de only.**

## Task Commits

1. **Task 1: keys** - `d6f153d` (feat)
2. **Task 2: registry + notice** - `a74fbd4` (feat)
3. **Task 3: gallery + baselines** - `86c0125` (test)

## Audit (Task 1)

Phase 1 already migrated the twelve mock surfaces into key-map. Scripted gap vs key-map for this plan: **0 missing mock strings**. Added 19 new keys the mocks never produced (auth email ×6, language-coverage ×3, lang names ×4, header.account-* ×4, common form status ×2). No new `$meta.pendingValueKeys` / `noParamKeys`.

## Verification

- `pnpm i18n:check` exit 0 (1595 keys)
- `pnpm typecheck` exit 0
- `pnpm lint:css` exit 0
- legal-notice playwright 28 passed, 16 snapshots
- `pnpm test:visual` full 373 not re-run this sitting

## Self-Check: PASSED

---
*Phase: 05-public-surfaces-customer-accounts*
*Completed: 2026-08-28*
