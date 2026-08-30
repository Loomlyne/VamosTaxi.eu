---
phase: 05-public-surfaces-customer-accounts
plan: 14
subsystem: ui
tags: [home, how-it-works, why-vamos, playwright]

requires:
  - phase: 05-06
    provides: HomeHero pattern, home i18n keys
provides:
  - HowItWorks
  - WhyVamos
affects: [05-18, 05-21]

tech-stack:
  added: []
  patterns: ["home sections as standalone galleries before compose"]

key-files:
  created:
    - apps/web/components/home/HowItWorks.tsx
    - apps/web/components/home/HowItWorks.css
    - apps/web/components/home/WhyVamos.tsx
    - apps/web/components/home/WhyVamos.css
    - apps/web/app/[locale]/dev/home/how-it-works/page.tsx
    - apps/web/app/[locale]/dev/home/why-vamos/page.tsx
    - apps/web/tests/visual/home-how-it-works.spec.ts
    - apps/web/tests/visual/home-why-vamos.spec.ts
  modified: []

key-decisions:
  - "Gallery screenshots scroll the tile into view; toBeVisible failed at 390 when inverse tiles sat under another section"
  - "No second Lenis; scroll via IntersectionObserver"

patterns-established:
  - "Home section galleries use data-state tiles; visual specs attach then screenshot"

requirements-completed: [SITE-01, SITE-06]

duration: 50min
completed: 2026-08-30
---

# Phase 05: 05-14 HowItWorks + WhyVamos

**Standalone how-it-works and why-Vamos sections with galleries and four-viewport baselines.**

## Task Commits

1. **Task 1: HowItWorks** - `423a75c`
2. **Task 2: WhyVamos** - `38ee7ce` / `a3bd0ae`
3. **Task 3: visual proofs** - this sitting

## Verification

- Playwright both specs: 180 passed, 12 skipped (viewport-gated). Full `pnpm test:visual` not re-run.

## User Setup Required

None

---
*Phase: 05-public-surfaces-customer-accounts*
*Completed: 2026-08-30*
