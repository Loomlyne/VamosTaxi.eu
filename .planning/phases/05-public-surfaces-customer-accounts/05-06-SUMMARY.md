---
phase: 05-public-surfaces-customer-accounts
plan: 06
subsystem: ui
tags: [home, booking-card, next-image]

requires:
  - phase: 05-03
    provides: i18n keys
provides:
  - HomeHero
  - BookingCard
  - BookingCardMount
affects: [05-21, 05-22]

tech-stack:
  added: []
  patterns: ["BookingCardMount board/price/status seam"]

key-files:
  created:
    - apps/web/components/home/HomeHero.tsx
    - apps/web/components/home/BookingCard.tsx
    - apps/web/components/home/BookingCardMount.tsx
    - apps/web/app/[locale]/dev/home/hero/page.tsx
    - apps/web/tests/visual/home-hero.spec.ts
  modified: []

key-decisions:
  - "Hourly tab omitted (D57 / product: hourly no). Tabs are one-way + return only."
  - "lang-switch.spec.ts selectors unchanged; still drives BookingDraftFields on /"
  - "BookingCardMountProps: { board?, price?, status? } — plan 05-22 fills them"
  - "pnpm test:visual (373 Phase 1 baselines) not re-run; no Phase 1 component files touched"

requirements-completed: [SITE-01, SITE-02, SITE-06]

duration: 45min
completed: 2026-08-28
---

# Phase 05: 05-06 home hero + booking card

**HomeHero + BookingCard + BookingCardMount. 80 screenshots. lang-switch 3/3.**

## Task Commits

1–3. `6f589b4` feat(05-06)

## Verification

- typecheck, lint, lint:css, i18n:check green
- home-hero 100 passed
- lang-switch 3 passed

## Self-Check: PASSED
