---
phase: 31-refunds-in-stripe
plan: 10
subsystem: customer pages (DC mock) / i18n / refunds
tags: [customer, dc-mock, i18n, refunds, copy]
requires: ["31-07 cancel answers without refundRappen", "31-08 cancellation e-mail W3 (refundPolicy)"]
provides:
  - "booking-detail and manage-booking cancel sheet: W1 in both windows; dead card one refundPolicyCard block (heading Refund, W3)"
  - "pages no longer read result.body.refundRappen after a cancel"
  - "vamos-manage-ticket.js refundLine: W2 for a cancelled pending_ops trip, no branch on refundOwedRappen"
  - "React twins checkout.cancelSheetFull/cancelSheetOps = W1, refundPendingOps = W2 (en/de/fr/ar); seed regenerated"
  - "refund-texts-20-10.test.ts pins W1/W2/W3 to 2026-10-12-refund-wording-signed.md and bans the retired promise sentences"
affects: [31-12 (cancelSub O-1 still as before), 31-13 (browser run of both pages, BookingRow owner question)]
tech-stack:
  added: []
  patterns: [byte-for-byte pins read from the decision file, vm run of the page logic with a leaking cancel answer]
key-files:
  created: []
  modified:
    - app/pages/booking-detail.dc.html
    - app/pages/manage-booking.dc.html
    - app/vamos-manage-ticket.js
    - app/vamos-i18n-dict.js
    - apps/web/i18n/messages/en.json
    - apps/web/i18n/messages/de.json
    - apps/web/i18n/messages/fr.json
    - apps/web/i18n/messages/ar.json
    - apps/web/i18n/key-map.json
    - packages/db/supabase/seed.sql
    - apps/web/lib/ops/class-change-customer-line.test.ts
    - apps/web/lib/checkout/booking-pages-polish.test.ts
    - apps/web/lib/ops/voucher.test.ts
    - apps/web/lib/legal/refund-texts-20-10.test.ts
decisions:
  - "Dead card: refundFull/refundReview collapsed into one refundPolicyCard flag (refundStatus pending_ops only)"
  - "Unused React twin account.refund-waiting-on-review deleted (messages and key-map): its DC source line is gone and the plan's banned list covers twin files"
  - "Banned list also carries the four languages of the retired T2 sentence, the old Refund row label and the old under-review value"
metrics:
  duration: "about 6 min of edits (2026-10-13 13:42Z to 13:48Z), plus reading"
  completed: 2026-10-13
  tasks: 2
  files: 14
---

# Phase 31 Plan 10: Customer refund wording on pages, ticket JS, dict and twins Summary

Every customer surface of a paid cancel now carries the signed policy line and no amount: the cancel sheet on booking-detail and manage-booking reads W1 ("This trip will be cancelled. Any refund follows the cancellation policy.") in both windows, the account Refund row reads W2, the dead card reads heading "Refund" with W3, and the React twins and seed follow in four languages. The pages stop reading `result.body.refundRappen` after a cancel. The owner-approved class/trip difference lines, `cancellation.dc.html`, `cancelSub` (O-1, plan 31-12), the "See what comes back" button and the "— keep it, because that is what your refund is calculated from." line (S-08) are unchanged.

## Tasks

| Task | Name | Commits | Files |
|------|------|---------|-------|
| 1 | DC pages, ticket JS and dictionary clean-up | d04f0ec5 (RED), 436e1ba4 (GREEN) | both pages, vamos-manage-ticket.js, vamos-i18n-dict.js, class-change-customer-line.test.ts, booking-pages-polish.test.ts |
| 2 | React twins, seed, voucher badge and the legal pin test | 74c659bc (RED), cb3ecb23 (GREEN) | four messages JSON, key-map.json, seed.sql, voucher.test.ts, refund-texts-20-10.test.ts |

## What changed

- Pages: the signed prototype hunks (31-prototype-wip.patch l.182-265) applied; the two dead-card `sc-if` blocks replaced by one `sc-if value="{{ refundPolicyCard }}"`; logic `refundPolicyCard: refundStatus === 'pending_ops'`; `refundOwedRappen: result.body.refundRappen || null` removed from both cancel success handlers (other fields kept).
- `refundLine`: running trip with pending_ops still "", cancelled pending_ops returns `t("Refund follows the cancellation policy")`; Refunded / Failed / Processing unchanged. Comment: "Phase 31 D-04: one policy line for a cancelled paid trip; Stripe-recorded refunds read Refunded".
- Dict: six entries with zero uses outside the dict deleted (`Refund · waiting on review`, `Full refund · sent by our team`, `Refund under review`, `You will get a full refund of the amount you paid. ...`, the two old cancel-sheet sentences). Kept: "Our team decides the refund and tells you by email." (cancellation.dc.html) and the two "...our team sends it." difference lines. The committed Phase 31 block and Phase 30 entries untouched. `ß` count stays 1.
- Twins: values written from the decision file rows by script (keys unchanged; BookingVoucher and voucher-badge keep reading `refundPendingOps`). `ß` in de.json stays 1.
- Pin test: header names both decision files; T2, ROW and T5 describes replaced by W1 (pages twice, dict, both twin keys), W2 (exact dict entry, `t("…")` in ticket JS, twin), W3 (pages once, dict; the 31-08 e-mail W3 describe stays); banned lists extended.

## Verification

- RED Task 1: 5 failed / 190 passed (class-change-customer-line, booking-pages-polish). RED Task 2: 4 failed (refund-texts W1, W2, banned; voucher).
- Task 1 verify (sync + 5 files: class-change-customer-line, booking-pages-polish, manage-ticket-account-refund, manage-pages-i18n, customer-change-p6): 275 passed.
- Plan verification (sync + 8 files: refund-texts-20-10, voucher, class-change-customer-line, booking-pages-polish, voucher-badge, manage-pages-i18n, customer-change-p6, manage-ticket-account-refund) plus `lib/flight-lines.test.ts` (the only reader of key-map.json): 9 files, 313 passed.
- `node packages/db/seed/generate-seed.mjs --check`: no drift. `node scripts/check-i18n-coverage.mjs` (i18n:check): passed, 2698 keys.
- Acceptance greps: retired strings and `refundRappen` 0 in both pages; W1 2 in each page; retired row words 0 in vamos-manage-ticket.js; cancellation.dc.html line 1; `ß` dict 1, de.json 1; twin range free of team/review words in four languages; en.json node check exit 0; decision file named 3 times in the pin test.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Test strength] booking-pages-polish.test.ts gained a Phase 31 describe**
- **Found during:** Task 1 RED
- **Issue:** the file had no expectation on refundFull/refundReview/refundOwedRappen, so the plan would have left it unchanged and the "pages stop reading result.body.refundRappen" behaviour had no test.
- **Fix:** per page: markup pin (W1 twice, W3 once, `refundPolicyCard`, no refundFull/refundReview/refundRappen, no retired sentences) and a vm run of `confirmCancel` with a leaking answer (`refundRappen: 4000`) proving the ticket does not take it and `refundPolicyCard` is true. Existing tests unchanged.
- **Commit:** d04f0ec5

**2. [Rule 3 - Blocking] unused React twin `account.refund-waiting-on-review` deleted**
- **Found during:** Task 2 GREEN
- **Issue:** the plan's banned list (twin files included) caught "Refund · waiting on review" in `apps/web/i18n/messages/en.json` under a key the plan did not list. No component reads it; only `key-map.json` maps the deleted DC line to it.
- **Fix:** key removed from the four messages files and its key-map line; seed regenerated; i18n:check and `lib/flight-lines.test.ts` green.
- **Files modified:** apps/web/i18n/messages/{en,de,fr,ar}.json, apps/web/i18n/key-map.json, packages/db/supabase/seed.sql
- **Commit:** cb3ecb23

**3. [Rule 2 - Coverage] pin test extras**
- Banned list also holds the four languages of the retired T2 sentence, the old Refund row label and the old under-review value (each checked absent from every customer file first), and one case keeps "Our team decides the refund and tells you by email." on cancellation.dc.html and in the dict (T-31-48: the kept entry cannot be deleted by mistake). `refundLine` "failed" case added to class-change-customer-line.test.ts.
- **Commits:** 74c659bc, d04f0ec5

## Deferred (logged in deferred-items.md)

- `app/pages/BookingRow.dc.html:251` (account list, live) still reads "Cancelled by you. The refund is with our team for review." No amount and no Stripe, so D-04 holds, but it is not signed W wording and was outside this plan. Owner question for 31-13; no text proposed.

## Known Stubs

None.

## Threat Flags

None. T-31-45 (no amount, pages stop reading refundRappen, banned pins), T-31-46 ("Stripe" absent from W1-W3), T-31-47 (byte-for-byte pins, seed check), T-31-48 (deleted only zero-use entries, kept-line pin, i18n:check) in place.

## Not verified

- No browser run of the two pages at 1440/1024/768/390 in en/de/fr/ar and no `VamosLocale.coverage(root)` on the served pages (31-13).
- The whole lib/legal, lib/checkout and tests/unit folders not run (lead runs them once in 31-13).
- `tsc --noEmit` not run (plan did not ask; only test files and JSON/DC changed).

## TDD Gate Compliance

test(31-10) d04f0ec5 -> feat(31-10) 436e1ba4; test(31-10) 74c659bc -> feat(31-10) cb3ecb23. No refactor commit.

## Self-Check: PASSED

- FOUND: all 14 modified files.
- FOUND: d04f0ec5, 436e1ba4, 74c659bc, cb3ecb23 in the branch log.
