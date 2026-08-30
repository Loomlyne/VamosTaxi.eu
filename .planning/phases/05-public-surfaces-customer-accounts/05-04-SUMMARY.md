---
phase: 05-public-surfaces-customer-accounts
plan: 04
subsystem: ui
tags: [legal, terms, next-intl, playwright]

requires:
  - phase: 05-03
    provides: LanguageCoverageNotice, LEGAL_LANGUAGES, i18n keys
provides:
  - LegalPage
  - LegalToc
  - PendingSlot
  - /terms
affects: [05-09, 05-10]

tech-stack:
  added: []
  patterns: ["shared legal shell + PendingSlot TBC"]

key-files:
  created:
    - apps/web/components/legal/LegalPage.tsx
    - apps/web/components/legal/LegalPage.css
    - apps/web/components/legal/LegalToc.tsx
    - apps/web/components/legal/PendingSlot.tsx
    - apps/web/components/legal/LegalPrintButton.tsx
    - apps/web/app/[locale]/terms/page.tsx
    - apps/web/tests/visual/legal-terms.spec.ts
  modified:
    - apps/web/components/legal/index.ts

key-decisions:
  - "Prose link hover is charcoal (Law 02), not yellow-700"
  - "Print is a tiny client button; LegalPage stays a server component"

requirements-completed: [SITE-05, SITE-02, SITE-07, I18N-08]

duration: 50min
completed: 2026-08-28
---

# Phase 05: 05-04 legal shell + terms

**Shared LegalPage/LegalToc/PendingSlot. `/terms` in four languages, 16 sections, 16 screenshots.**

## Task Commits

1. **Task 1: shell** - `7a98516`
2. **Task 2: TOC** - `4d87146`
3. **Task 3: terms** - `cc75fca`

## Content

- 16 `<section>` blocks ported
- `data-tok` pills on the page: 21 in the mock; ported via PendingSlot (English TBC)
- No new i18n keys (used 05-03 / Phase 1 keys)
- LegalPage props: `page`, `sections`, `titleKey`, `standfirstKey`, `kickerKey`, `effectiveDateLabel`, `versionLabel`, `children`

## Verification

- typecheck, i18n:check, lint:css green
- legal-terms playwright 33 passed, 16 snapshots
- full `pnpm test:visual` not re-run

## Self-Check: PASSED

---
*Phase: 05-public-surfaces-customer-accounts*
*Completed: 2026-08-28*
