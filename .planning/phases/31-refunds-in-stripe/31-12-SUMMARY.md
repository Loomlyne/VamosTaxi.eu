---
phase: 31-refunds-in-stripe
plan: 12
subsystem: customer pages (DC mock) / i18n / refunds
tags: [customer, copy, owner-decision, i18n]
requires: ["31-08 decision file with the O-1 answer", "31-10 cancel sheet W1 and the refund pin test"]
provides:
  - "decision file: W6 rows under ## O-1 (A, signed 2026-10-13 ~16:20 +04, question form via the controller)"
  - "booking-detail and manage-booking: cancelSub is W6 for every window (windowKind ternary dropped)"
  - "dict: W6 in de/fr/ar verbatim from S-07; the two old refund-amount sub-lines deleted"
  - "refund-texts-20-10.test.ts pins W6 on both pages and in the dict, bans the two old lines, keeps the S-08 lines"
affects: [31-13 (browser run of both pages shows the new sub-line under Cancel this transfer)]
tech-stack:
  added: []
  patterns: [byte-for-byte pin read from the decision file]
key-files:
  created: []
  modified:
    - .planning/decisions/2026-10-12-refund-wording-signed.md
    - app/pages/booking-detail.dc.html
    - app/pages/manage-booking.dc.html
    - app/vamos-i18n-dict.js
    - apps/web/lib/checkout/manage-pages-i18n.test.ts
    - apps/web/lib/legal/refund-texts-20-10.test.ts
decisions:
  - "O-1 = A (owner, 2026-10-13 ~16:20 +04, question form via the controller, S-07): one cancel sub-line for both windows"
  - "W6 sits under ## O-1 in the decision file so the pin test reads it like W1-W3"
metrics:
  duration: "about 5 min (2026-10-13 13:49Z to 13:54Z)"
  completed: 2026-10-13
---

# Phase 31 Plan 12: O-1 cancel sub-line Summary

Under "Cancel this transfer", booking-detail and manage-booking now show one line for both windows: "Read the cancellation policy before anything is confirmed." (de "Lesen Sie die Stornierungsbedingungen, bevor etwas bestätigt wird.", fr "Consultez la politique d’annulation avant toute confirmation.", ar "اطّلع على سياسة الإلغاء قبل تأكيد أي شيء."). It replaces the two lines that still promised to show a refund amount. No amount, no "Stripe" (D-04).

## Owner answer (Task 1)

O-1 = A, signed 2026-10-13 ~16:20 (+04), owner, question form via the controller (31-CONTEXT S-07). The decision file already recorded it in "## O-1" (written by 31-08). This plan added the W6 rows there.

## Tasks

| # | Task | Commits | Files |
|---|------|---------|-------|
| 1 | Owner answers O-1 | none (already answered and recorded) | none |
| 2 | Record W6, apply it to both pages | 9473814a (RED), e1ebb6d6 (GREEN) | decision file, booking-detail.dc.html, manage-booking.dc.html, vamos-i18n-dict.js, manage-pages-i18n.test.ts, refund-texts-20-10.test.ts |

## Verification

- RED: 5 failed / 55 passed (manage-pages-i18n 4, refund-texts-20-10 1), as expected before the change
- `node scripts/sync-dc-mock-to-public.mjs`: synced 20 pages
- `vitest run lib/checkout/manage-pages-i18n.test.ts lib/checkout/booking-pages-polish.test.ts lib/legal/refund-texts-20-10.test.ts`: 3 files, 243 passed
- `node scripts/check-i18n-coverage.mjs`: passed, 2698 keys
- `node packages/db/seed/generate-seed.mjs --check`: no drift (the dict does not feed the seed)
- Acceptance greps: `^## O-1` once, not "pending"; W6 English once in each page and once in the dict; "See the refund you are due" 0 in both pages and the dict; "See what comes back at this notice" 0 under app/, apps/, packages/ except the ban list in the test
- S-08 kept: the "See what comes back" button and "— keep it, because that is what your refund is calculated from." unchanged on both pages (now also pinned)

## Deviations from Plan

**1. [Rule 2 - drift guard] W6 pinned in refund-texts-20-10.test.ts**
- The plan only listed manage-pages-i18n.test.ts. W6 is now also read from the decision file and pinned byte for byte in cancelSub on both pages and in the dict, the two old lines are banned there, and the S-08 lines are pinned so they stay. Same pattern 31-08/31-10 used for W1-W5.
- Commit: 9473814a

No other deviation. The archived `archive/ds-upgrade/app/manage-booking.dc.html` still carries the old lines; it is an archive copy that reaches no one, so it was left alone. Commits went to the owner's phase branch `phase-31-refunds-in-stripe`, as instructed.

## Not verified

- No browser run of the two pages in four languages at 1440/1024/768/390 (planned for 31-13). The line replaces one of the same length in the same span, so layout risk is low.

## Known Stubs

None.

## Threat Flags

None. T-31-52 mitigated: text verbatim from 31-CONTEXT S-07, answer and time in the decision file, pinned by test.

## Self-Check: PASSED

- FOUND: .planning/phases/31-refunds-in-stripe/31-12-SUMMARY.md
- FOUND: 9473814a, e1ebb6d6
