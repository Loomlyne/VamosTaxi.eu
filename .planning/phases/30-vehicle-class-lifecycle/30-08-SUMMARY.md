---
phase: 30-vehicle-class-lifecycle
plan: 08
subsystem: ops-console-client
tags: [OpsPricing, go-live, retire, retired-list, bring-back, i18n]
requires:
  - phase: 30-02
    provides: signed copy keys in the dictionary
  - phase: 30-04
    provides: VamosOps.classes() with server status, missing, unassignedPaidTrips
  - phase: 30-06
    provides: OpsTable footDelete, actionsGap, tapArea, onAskDelete
provides:
  - Pricing class cell with LIVE/DRAFT badges from server status only
  - Go live dialog driven by the server missing list (Photo, Seats, Bags, Price)
  - Retire dialog with chauffeur count, unassigned paid trips line, last-Live warning, 140-character reason
  - Retired list with Bring back and a screen-reader announcement
affects: [30-10]
key-files:
  modified: [app/ops/OpsPricing.dc.html, apps/web/lib/ops/ops-pricing-tabs.test.ts, apps/web/lib/ops/ops-dc-arabic-count-lines.test.ts]
  created: [apps/web/lib/ops/ops-dc-class-lifecycle.test.ts]
requirements-completed: [CLS-03, CLS-04, CLS-05, CLS-10, CLS-14]
completed: 2026-10-13
---

# Phase 30 Plan 08: Pricing class lifecycle UI Summary

The Pricing page now shows and drives Draft, Live and Retired from the server row only: DRAFT opens the Go live checklist (Photo, Seats, Bags, Price in that order), the row's eye-off icon opens the Retire dialog, and a folded Retired list brings a class back as a Draft. The old delete/hide dialog is gone, seats and bags start empty (no `|| 3`), and no new control publishes a price book.

## Interruption and resume

The first executor run was interrupted after committing the page work (`d645d968`, covering the page side of Tasks 1, 2 and 3 plus the Task 1 and Task 3 vm tests) and left an uncommitted +198-line edit to `ops-dc-class-lifecycle.test.ts`. This run reviewed that diff against Task 2 step 4 (it matched: trips line, chauffeur count line, last-Live warning, reason cap, retireClass arguments, error keeps reason, source has no old keys, class table props), ran it (45 pass) and committed it as is. The test-side work still missing from the plan was then finished: the Arabic count case (Task 2 step 5), the `ops-pricing-tabs` rewrite (step 6) and the Task 3 vm tests. No page code was changed in the resume.

## Tasks

| Task | Commit | Notes |
|------|--------|-------|
| 0 sheet 11 gate | n/a | satisfied: sheet-11a and sheet-11b signed 2026-10-12 in 30-DESIGN-SIGNED.md |
| 1-3 page rebuild | d645d968 | badges, Go live dialog, Retire dialog without delete/hide path, Retired list, focus and live region |
| 2 tests: Retire dialog | 11a87e3b | facts, warning, reason cap, result, class table props |
| 2 tests: Arabic forms | 61862954 | "Retire unassigned-trips line: the four forms (and 100+)" |
| 2 tests: Retire only | 454f4c79 | `ops-pricing-tabs` describe rewritten, five absence/presence cases |
| 3 tests | 9791793c | Retired list, Bring back, announce in four languages, source rules |

## Verification

- `ops-dc-class-lifecycle` 54, `ops-dc-p4`, `ops-pricing-tabs` 14, `ops-dc-editor-foot`, `ops-dc-arabic-count-lines` 6 (whole file): 101 tests pass in one run (5 files).
- `node scripts/check-i18n-coverage.mjs`: passed (2699 keys).
- Acceptance greps on OpsPricing: `max-width:78px` 0, old delete/hide keys 0, `tDeleteClass` 0, `c.active === false || c.hiddenAt` 0, `retireTrips` 0, `|| 3` 0, `aria-haspopup` 1, `footDelete=` 1, `allowEmpty:true` 2, `.publish(` 1 (the owner's existing Publish), logical-property check on the d645d968 diff 0. The one remaining `trash-2` is the "discard" menu item of another table, not the class table.
- Not verified: the 1440/1024/768/390 visual check in en/de/fr/ar (planned for the 30-10 lab brief); the full gate (30-10).

## Deviations from Plan

None in scope. Plan Task 3 verify uses `pnpm i18n:check`; run as `node scripts/check-i18n-coverage.mjs` per the worktree rule (no pnpm here).

## Known Stubs

None.

## Self-Check: PASSED

Commits d645d968, 11a87e3b, 61862954, 454f4c79, 9791793c exist; `ops-dc-class-lifecycle.test.ts` exists.
