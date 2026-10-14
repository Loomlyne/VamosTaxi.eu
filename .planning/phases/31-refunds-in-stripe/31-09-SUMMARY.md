---
phase: 31-refunds-in-stripe
plan: 09
subsystem: dashboard (DC mock) / refunds
tags: [dashboard, dc-mock, refunds, stripe, i18n]
requires: ["31-01 GET /api/staff/bookings/{id}/stripe-payments", "31-02 refund senders removed"]
provides:
  - "OpsDetail Refund in Stripe menu item (admin, paid; disabled until links), Which payment? list, Refund to check note, Refund failed link"
  - "OpsDetail stripeTargets(): single source for the list and the click (dashboard.stripe.com origin only, D-14 filter)"
  - "apps/web/lib/ops/ops-refund-stripe-dc.test.ts (source pins + vm logic tests)"
affects: [31-13 (browser run 1440/1024/768/390, lab e2e p6-browser run, whole lib/ops run, Phase 30 merge of T-table lines)]
tech-stack:
  added: []
  patterns: [links fetched on open so window.open runs synchronously in the click, per-booking-key result store, per-part bidi isolation]
key-files:
  created:
    - apps/web/lib/ops/ops-refund-stripe-dc.test.ts
  modified:
    - app/ops/OpsDetail.dc.html
    - apps/web/lib/ops/customers-board.test.ts
    - apps/web/lib/ops/ops-class-change-dc.test.ts
    - apps/web/lib/ops/ops-dc-u08.test.ts
    - apps/web/lib/ops/ops-p6-edit-dc.test.ts
    - apps/web/lib/ops/ops-dc-dash-design.test.ts
    - apps/web/lib/ops/ops-toast-tone-dc.test.ts
    - apps/web/lib/ops/ops-p6-server-dc.test.ts
    - apps/web/lib/ops/payment-changed.test.ts
    - apps/web/tests/e2e-worker/p6-browser.e2e.mjs
  deleted:
    - apps/web/lib/ops/ops-refund-review-dc.test.ts
decisions:
  - "errInvalid, errNotPaid and errNothing were deleted with the other retired T keys: their only use was the deleted refund error map (no dead copy, UI-SPEC line 254)"
  - "errByCode keeps 'payment-changed' (plan) and adds 'no-stripe-payment'; payment-changed.test.ts now proves the mapping by state instead of a refund POST"
  - "Element order in the refund column kept as the signed prototype has it (note, list, Refunded, dispute, error, failed); the UI-SPEC prose order says 'unchanged slots', so nothing was moved"
metrics:
  duration: "about 12 min (2026-10-13 13:29Z to 13:41Z)"
  completed: 2026-10-13
  tasks: 3
  files: 12
---

# Phase 31 Plan 09: Dashboard Refund in Stripe Summary

The dashboard booking detail no longer sends a refund: an admin on a paid booking gets "Refund in Stripe" (external-link) in Actions, disabled until `GET /api/staff/bookings/{id}/stripe-payments` answers ok; one payment opens its Stripe page in a new tab inside the click, several show the signed "Which payment?" list of OPEN IN STRIPE links, none shows "This booking has no Stripe payment to open."; "Refund to check" is a neutral info note per S-04, and Refund failed points to Stripe. The decision box, both dialogs, the post-trip panel, the picker, the credit box and every refund sender are deleted, with their T keys in all four languages.

## Tasks

| Task | Name | Commit | Files |
| ---- | ---- | ------ | ----- |
| 1 | Re-anchor the four saveEdit slicers; new DC test (RED) | 38d383e3 | customers-board, ops-class-change-dc, ops-dc-u08, ops-p6-edit-dc tests; ops-refund-stripe-dc.test.ts |
| 2 | Port the signed prototype, apply deviations 1-6, delete the decision box (GREEN) | 0a259c4f | app/ops/OpsDetail.dc.html; ops-refund-review-dc.test.ts deleted |
| 3 | Move the remaining DC tests and the lab e2e | 8e892ffd | ops-dc-dash-design, ops-toast-tone-dc, ops-p6-server-dc, payment-changed tests; p6-browser.e2e.mjs |

## What changed in OpsDetail.dc.html

- Prototype hunks applied with `git apply --include='app/ops/*'` (applied cleanly), then the UI-SPEC deviations:
  1. menu item `disabled: !stripeLoaded`; a rejected or non-ok fetch stores nothing (`.catch(() => {})`).
  2. menu branch rewritten: `stripeTargets()` then `window.open(targets[0].url, '_blank', 'noopener')` in a try and return; several set `stripeListFor` and `goRefund()`; none sets `refundError` `no-stripe-payment`. No code after the returns, no busy guard.
  3. Refund failed Alert shows OPEN IN STRIPE only inside `sc-if stripeOneUrl`.
  4. row detail `isolate(eventWhen(capturedAt)) + ' · ' + isolate(chfText(chargedRappen))`, span carries `data-vt-no-i18n`.
  5. `showRefundDue` reads status, paid, refundStatus, refundRappen, tripPassed only; `refundFailedShown` = admin and `refund_status === 'failed'`.
- `stripeTargets(refundKey)`: rows of this booking key only, URL must start with `https://dashboard.stripe.com/`, open rows (`leftRappen > 0`) else the newest row.
- acceptPending `refund_due` toast is `fillAmounts(t.tripDoneRefund, { a: chfText(|differenceRappen|) })`.
- T tables: prototype keys added; classNoteCheaper, tripNoteCheaper, classDoneRefund, tripDoneRefund set to the UI-SPEC rows; 41 retired keys deleted in en, de, fr and ar (each removed exactly 4 times). The assign block and Phase 30 keys untouched (C-03).
- Retired CSS (`[data-ops-refund-pct|pick|payrow|full|unit]`) deleted; `[data-ops-refund-region|row|label|pay]`, `[data-ops-decide-body]` and `[data-ops-decide-foot]` (still used by the cancel/class dialogs) kept. `--vt-shadow-accent:none` and `.vt-input--focus{box-shadow:none}` kept.

## Verification

- RED (Task 1): ops-refund-stripe-dc.test.ts 39 failed, 10 passed (49) on the unchanged page; the four re-anchored files 63 passed.
- Task 2 verify: ops-refund-stripe-dc, ops-detail-i18n, ops-dc-chauffeur-class, ops-dc-p4, customers-board, ops-class-change-dc, ops-dc-u08, ops-p6-edit-dc: 8 files, 165 passed.
- Task 3 / plan verification: `vitest run $(grep -l "OpsDetail" lib/ops/*.test.ts)`: 28 files, 563 passed, 0 failed.
- Extra readers of OpsDetail outside lib/ops: public-no-internal-ids, phase-26-3-laws, account/bookings: 3 files, 56 passed; `node --test scripts/strip-public-comments.test.mjs`: 10 passed.
- `node --check tests/e2e-worker/p6-browser.e2e.mjs`: OK.
- Acceptance greps on OpsDetail: refund senders/handlers 0; `/refund'` 0; `/stripe-payments'` 1; `refundInStripe:'` 4; `tone="accent"` 0; `--vt-shadow-accent:none` 1; `ß` 0. `markRefund` in the four slicer tests 0. Task 3 grep (markRefund, refundClick, tRefundBody, `tripCreditBody:'` outside absence lines) 0 in all three files. `Refund due: ` in the e2e 0.
- Copy: the new test proves every T string equals its `app/vamos-i18n-dict.js` entry (strings) or pattern (`{a}` = `$1`) in de, fr and ar; the dict already held them, so it was not edited.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] payment-changed.test.ts refund case**
- **Found during:** Task 3 (acceptance: every lib/ops test that reads OpsDetail must pass)
- **Issue:** its four "Refund answered payment-changed" cases called `renderVals().markRefund()` and expected a POST to `/refund`, which D-01 removes (31-02 summary left these DC cases to 31-09).
- **Fix:** the case now sets `refundError { code: 'payment-changed' }` and proves the refund error box shows the signed sentence in four languages and that no POST is made; the `'payment-changed'` entry stays in errByCode (count pin of 2 still holds).
- **Files modified:** apps/web/lib/ops/payment-changed.test.ts
- **Commit:** 8e892ffd

**2. [Rule 1 - Test follows signed behaviour] ops-dc-dash-design section 1**
- **Issue:** "a paid, unassigned trip lists every valid action" listed no refund item; per UI-SPEC the admin now sees Refund in Stripe on every paid booking.
- **Fix:** the expected list gains `refund` / "Refund in Stripe" above Cancel. The `"{{ markRefund }}"` entry of the bar-absence loop was dropped (the page-wide absence is pinned in ops-refund-stripe-dc.test.ts) so the acceptance grep reads 0.
- **Commit:** 8e892ffd

**3. [Rule 2 - Dead copy] errInvalid, errNotPaid, errNothing deleted**
- Not in the plan's explicit list; their only use was the deleted refund error map. Deleted in all four tables (ops-detail-i18n parity green) and added to the test's retired list.
- **Commit:** 0a259c4f

No deviation from the signed design: markup, CSS and copy are the prototype's plus the six UI-SPEC deviations.

## Not verified

- Browser run at 1440/1024/768/390 in en/de/fr/ar and `VamosLocale.coverage(root)` on the real shell (UI-SPEC deviation 6): plan 31-13.
- The lab e2e `p6-browser.e2e.mjs` was edited, not run (lab only, not in gate:local): plan 31-13.
- The Stripe Dashboard URL forms on a real payment (31-01 assumption A1): controller before ship.
- Popup-blocker behaviour of the synchronous `window.open` in a real browser (vm test proves it is called inside the click, without an async step).
- `goRefund()` (kept per plan) focuses the first `input`/`button` in the region; the list's OPEN IN STRIPE buttons render as links, so after the list opens focus may stay on the menu. Scroll works. Noted for 31-13's browser run, not changed (KEEP in plan).

## Known Stubs

None.

## Threat Flags

None beyond the plan's register: T-31-39 (dashboard.stripe.com origin filter, `noopener noreferrer` anchors, `'noopener'` window.open, vm test drops other URLs), T-31-40 (no refund POST; source pins), T-31-41 (admin only; dispatcher vm test), T-31-42 (per-key store; other-key vm test), T-31-43 (links fetched on open; synchronous click) are in place.

## TDD Gate Compliance

test(31-09) 38d383e3 (RED, 39 failing) -> feat(31-09) 0a259c4f (GREEN). Task 3 test-only commit 8e892ffd. No refactor commit.

## Self-Check: PASSED

All key files exist (ops-refund-stripe-dc.test.ts present, ops-refund-review-dc.test.ts absent); commits 38d383e3, 0a259c4f, 8e892ffd are in the branch log.
