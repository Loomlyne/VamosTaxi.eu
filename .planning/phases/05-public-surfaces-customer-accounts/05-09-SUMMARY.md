---
phase: 05-public-surfaces-customer-accounts
plan: 09
subsystem: ui
tags: [legal, privacy, cookies, playwright, next-intl]

requires:
  - phase: 05-04
    provides: LegalPage, LegalToc, PendingSlot
provides:
  - /privacy
  - /cookies
affects: [05-10, 05-23]

tech-stack:
  added: []
  patterns: ["legal pages through shared LegalPage shell; TBC via PendingSlot"]

key-files:
  created:
    - apps/web/app/[locale]/privacy/page.tsx
    - apps/web/app/[locale]/cookies/page.tsx
    - apps/web/tests/visual/legal-privacy-cookies.spec.ts
  modified:
    - apps/web/components/legal/LegalToc.tsx

key-decisions:
  - "Cookie banner CTAs port as href=#change / #choice (D-20 / Phase 10)"
  - "Live [data-tok] is 17 privacy / 21 cookies; plan grep 19/14 counted CSS"

patterns-established:
  - "LegalPage hero owns date+version PendingSlots; body ports remaining mock pills"

requirements-completed: [SITE-05, SITE-06, SITE-07, SITE-02, I18N-08]

duration: 40min
completed: 2026-08-30
---

# Phase 05: 05-09 privacy + cookies

**`/privacy` and `/cookies` through the 05-04 shell. 32 screenshots. TBC pills stay English.**

## Performance

- **Duration:** leftover close-out this sitting (Task 3)
- **Tasks:** 3
- **Files modified:** 4

## Accomplishments

- Privacy: 10 sections, 17 live `[data-tok]` (15 body + 2 LegalPage hero)
- Cookies: 7 sections, 21 live `[data-tok]`, table `data-lenis-prevent`
- No CookieBanner, no `force-dynamic`, no invented legal values
- No new i18n keys

## Task Commits

1. **Task 1: privacy page** - `6429302` (feat)
2. **Task 2: cookie page** - `77c89cd` (feat)
3. **Task 3: visual proofs** - `863fd1e` (test)

## Deviations from Plan

Plan Task 3 asked for 19 / 14 pills. `grep -c data-tok` on the mocks counts CSS rules. Mock *content* is 17 / 21. Spec asserts those.

Banner affordances: mock buttons that would open SITE-08 are `href="#change"` / `#choice` (Phase 10).

1440 Playwright spawn on port 4190 never bound under detached `next dev`; spec uses 4194.

Full `pnpm test:visual` not re-run (same as 05-04). This spec: 54 passed, 6 skipped (390-only).

## User Setup Required

None

## Next Phase Readiness

05-10 can copy this spec shape for cancellation/imprint.

---
*Phase: 05-public-surfaces-customer-accounts*
*Completed: 2026-08-30*
