---
phase: 05-public-surfaces-customer-accounts
plan: 05
subsystem: ui
tags: [about, marketing, next-image]

requires:
  - phase: 05-03
    provides: i18n keys
provides:
  - PageHero
  - Prose
  - /about
affects: [05-11, 05-17]

tech-stack:
  added: []
  patterns: ["charcoal PageHero + next/image strip"]

key-files:
  created:
    - apps/web/components/marketing/PageHero.tsx
    - apps/web/components/marketing/Prose.tsx
    - apps/web/app/[locale]/about/page.tsx
    - apps/web/tests/visual/about.spec.ts
  modified: []

key-decisions:
  - "Two vendored photos only (hero-arrivals, fleet-van-street)"
  - "Local next/image assertion is optimizer URL shape, not Cloudflare IMAGES bytes"

requirements-completed: [SITE-04, SITE-07]

duration: 25min
completed: 2026-08-28
---

# Phase 05: 05-05 about + marketing shell

**PageHero/Prose landed. `/about` six sections, two photos, 16 screenshots.**

## Task Commits

1–3. `679b478` feat(05-05)

## Verification

- i18n:check, typecheck, lint:css green
- about.spec 33 passed

## Self-Check: PASSED

---
*Phase: 05-public-surfaces-customer-accounts*
*Completed: 2026-08-28*
