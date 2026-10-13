---
phase: 31-refunds-in-stripe
plan: 06
subsystem: cron / stripe reconciliation / email
tags: [cron, stripe, reconciliation, email, automation]
requires:
  - "31-03: public.refund_check_read(jsonb) (migration 20261012220000), vamos_system only"
  - "31-04: refund mail helpers (untouched here)"
provides:
  - "packages/emails: renderRefundCheckEmail, renderRefundCheckDidNotRun, RefundCheckReport, sendRefundCheck"
  - "apps/web/lib/checkout/refund-check.ts: refundCheckWithDeps, refundCheck(env), RefundCheckResult, REFUND_CHECK_CAP"
  - "apps/web/lib/db/system-reads.ts: loadRefundCheckRows(env, items) + RefundCheckRow"
  - "apps/web/lib/ops/must-fix-mail.ts: deliverRefundCheckAlert, deliverRefundCheckDidNotRun"
  - "apps/web/worker.ts: third try/catch in the 0 3 * * * branch (refund_check)"
affects: [31-13 (hand-over: two new internal lines, deferred footer item), controller live apply of 20261012220000 before deploy]
tech-stack:
  added: []
  patterns: [WithDeps pure core + env wrapper (stripe-fee shape), definer reader with sql.json list, Stripe autoPagingToArray capped one past the limit]
key-files:
  created:
    - packages/emails/src/refund-check.ts
    - packages/emails/src/refund-check.test.ts
    - apps/web/lib/checkout/refund-check.ts
    - apps/web/lib/checkout/refund-check.test.ts
    - apps/web/lib/checkout/refund-check.local.test.ts
    - .planning/phases/31-refunds-in-stripe/deferred-items.md
  modified:
    - packages/emails/src/lib/send.ts
    - packages/emails/src/index.ts
    - apps/web/lib/db/system-reads.ts
    - apps/web/lib/ops/must-fix-mail.ts
    - apps/web/worker.ts
decisions:
  - "Stripe is asked for 501 refunds (autoPagingToArray limit 501); more than 500 compares the newest 500 and sets truncated, so 'Stripe listed more than 500 refunds' is only said when it is true (plan said exactly 500 -> truncated)"
  - "Month in the mail comes from a fixed English three-letter table: en-GB Intl prints September as 'Sept' in current ICU; day, year and time still come from Intl in Europe/Zurich"
  - "Refund check mails use the phone-only footer (as refund.ts); the layouts' default footer is the sign-in link line"
  - "A Stripe-succeeded refund whose site row is both reversed and of another amount gives both lines (amount and status)"
  - "Non-CHF refunds are left out before the reader and not counted in any skip field (the result contract has none)"
  - "The core refuses a reader answer that does not line up with its input (refund_check_rows_mismatch) rather than guessing"
metrics:
  duration: "about 10 min (2026-10-13 13:19Z to 13:29Z)"
  completed: 2026-10-13
  tasks: 3
  files: 11
---

# Phase 31 Plan 06: Nightly read-only refund check Summary

At 03:00 UTC the Worker now lists the Stripe refunds created between 48 hours and 30 minutes ago (pages of 100, capped at 500) and compares each with the site through `refund_check_read`, called as vamos_system with the list passed by `sql.json`. When something is wrong it sends one English mail to info@ listing references, CHF amounts and Stripe ids. If Stripe does not answer, it sends one short "did not run" mail instead. It uses only `stripe.refunds.list`, writes nothing, and logs counts only.

## Commits

| Task | Commit | What |
|------|--------|------|
| 1 RED | d0c65d97 | `packages/emails/src/refund-check.test.ts` (failing) |
| 1 GREEN | d385a6fb | `refund-check.ts` renderers, `sendRefundCheck`, index exports |
| 2 RED | e61d4a68 | `apps/web/lib/checkout/refund-check.test.ts` (failing) |
| 2 GREEN | 34991af0 | core + env wrapper, `loadRefundCheckRows`, the two deliver helpers |
| 3 | d01e830d | `worker.ts` 03:00 block, its source pin, `refund-check.local.test.ts` |

## The owner email, word for word

Subject: `Refund check: {n} Stripe refund(s) do not match a booking` ({n} = number of finding lines across all sections)

Body (plain text; only the non-empty sections appear, in this order; example values from the tests):

```
Vamos Taxi

Tonight's check compared the refunds Stripe made in the last 48 hours with the bookings on vamostaxi.site.
Nothing was changed.

Stripe listed more than 500 refunds; the newest 500 were compared.

Missing on the booking (Stripe refunded, the booking shows nothing):
- VT-26-0001 · CHF 40.00 · refund re_x · 12 Oct 2026 14:05

Amounts differ:
- VT-26-0001 · Stripe CHF 40.00 · booking CHF 30.00 · refund re_x
- VT-26-0001 · booking refunded CHF 40.00 · refund records CHF 30.00

Status differs:
- VT-26-0001 · Stripe failed · booking refunded · refund re_x

Not linked to any booking:
- refund re_x · CHF 40.00 · payment pi_x

Open the payment in Stripe and the booking on your dashboard to see what happened. A refund missing on a booking usually means a webhook delivery failed: in Stripe, Developers › Webhooks shows failed deliveries and can resend them.

+41 79 626 70 82
```

The "Stripe listed more than 500…" line appears only when the cap is hit. A refund with no payment intent reads `payment none`. When Stripe succeeded but the site row was reversed, the status line reads `Stripe succeeded · booking failed`. Stripe's own status word is printed as Stripe sends it (`failed`, `canceled`). Times are in Europe/Zurich, 24 h.

Did-not-run mail: subject `Refund check did not run`, body `Stripe did not answer tonight's refund check, so nothing was compared. It runs again tomorrow at the same time.`, same phone footer.

HTML is the English layout (`lang="en"`). Every value is escaped, and each section is a paragraph heading followed by a list.

## New internal lines for sign-off

Neither line is in D-09. Both are marked in code with `Not in D-09: new internal line, awaiting the owner's sign-off (Phase 31 hand-over)`:

1. `- VT-26-0001 · booking refunded CHF 40.00 · refund records CHF 30.00` (totalDiffers, under "Amounts differ:")
2. `Stripe listed more than 500 refunds; the newest 500 were compared.` (truncated, after the intro)

Also derived and not in D-09 (for the same hand-over): the footer is the phone number `+41 79 626 70 82` alone, not the default sign-in footer, and the status words `succeeded` / `failed` appear for the reversed case.

## Verification

- `packages/emails`: `vitest run src/refund-check.test.ts src/lib/send.test.ts` 29/29 passed. `tsc --noEmit` exit 0. Acceptance greps: "Not in D-09" = 2, the intro line matches, `contact_name|contactEmail|name:` = 0.
- `apps/web` Task 2 verify: `refund-check.test.ts`, `system-reads.test.ts`, `stripe-fee.test.ts` 53/53 passed. The grep gate for `.(create|update|del|cancel)(` in `refund-check.ts` = 0. `pnpm check:db-fences` "all 8 checks passed (1287 files scanned)" (log `logs/31-06-db-fences-t2.log`, `exit=0`).
- Task 3 verify, the plan's command exactly as written (log `logs/31-06-task3-verify.log`, `exit=0`):
  - cron pins `refund-check`, `stripe-fee`, `settle`, `reminder`, `no-show-sweep`: 191/191 passed.
  - `refund-check.local.test.ts` on lab p31-refunds (port 45222 from LAB_DB_URL): `Tests 2 passed (2)`, 0 skipped.
  - `check:db-fences`: all 8 checks passed (1288 files).
- Separate local log `logs/31-06-refund-check-local.log`: `Tests 2 passed (2)`, `exit=0`.
- `apps/web` `tsc --noEmit -p tsconfig.json`: exit 0 (log `logs/31-06-tsc.log`).
- The local test uses the real Worker client (`vamos_edge` → vamos_system, `fetch_types: false`). One booking has three recorded refunds, one of them reversed. With a stand-in Stripe list (recorded, reversed with Stripe `failed`, amount 1000 against 900 on the site, missing, unlinked), the report is exactly missing + amountDiffers + unlinked. The reversed one gives no finding. The row counts of bookings, booking_payments, booking_refunds and booking_notifications are unchanged. A second case changes the booking's `refunded_rappen` and gets one totalDiffers line (3100 against 2400).
- `grep -n "refundCheck(env)" apps/web/worker.ts` matches once, at line 142, inside the `0 3 * * *` branch and before its `return;`. The hourly branch, `wrangler.jsonc` and the two existing 03:00 blocks are unchanged.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] "Sept" from en-GB Intl**
- **Found during:** Task 1 (checked before writing)
- **Issue:** `Intl.DateTimeFormat("en-GB", { month: "short" })` gives "12 Sept 2026, 14:05" on Node 26 / current ICU. The approved line format uses three letters.
- **Fix:** day, year and time still come from Intl (Europe/Zurich, h23). The month number maps to a fixed `Jan…Dec` table, and the day is not zero-padded. A test covers September and winter (CET).
- **Commit:** d385a6fb

**2. [Rule 1 - Bug] Default layout footer is the sign-in line**
- **Found during:** Task 1 (first GREEN run)
- **Issue:** `layoutText` / `layoutHtml` without options end the mail with "This link works once and expires after 1 hour."
- **Fix:** the phone-only footer that `refund.ts` uses, pinned by a test. The same issue in 31-04's `sendRefundMailAlert` is logged in `deferred-items.md` and was not fixed here (out of scope).
- **Commit:** d385a6fb

**3. [Rule 1 - Accuracy] Truncated only when Stripe listed more than 500**
- **Issue:** the plan's `autoPagingToArray({ limit: 500 })` with "exactly 500 → truncated" would print "Stripe listed more than 500 refunds" on a night with exactly 500.
- **Fix:** the wrapper asks for 501. The core compares the newest 500 and sets truncated when more than 500 came back or the lister says so. Tests cover 501 (truncated) and 500 (not truncated).
- **Commit:** 34991af0

**4. [Rule 3 - Blocking] check:db-fences refused module-scope Sets**
- **Issue:** `IN_FLIGHT` / `STRIPE_UNDONE` as module `Set`s tripped the isolate-memoisation fence.
- **Fix:** readonly arrays with `includes`.
- **Commit:** 34991af0

**5. [Test typing] tsc on the new test**
- The `vi.fn` stand-ins got typed parameters so `mock.calls[0][0]` typechecks. Fixed before the GREEN commit.

## Not verified

- A real Stripe list call (only stand-ins). The `created: { gte, lt }`, `limit: 100` and `autoPagingToArray({ limit: 501 })` call shape is pinned by a unit test against a client that exposes only `refunds.list`.
- A real Resend send of either mail.
- The cron firing on a Worker build. Until the controller applies migration 20261012220000 on live, the function is missing there, so the block logs `refund_check` `{ outcome: "failed" }` and the other two 03:00 blocks are unaffected (T-31-30).
- Prettier formatting of the new files was not run (no full gate run, per the job rules).

## Known Stubs

None.

## Threat Flags

None. T-31-26 to T-31-31 are mitigated as planned:
- list only, with a grep gate and a list-only client stand-in
- STABLE definer, with row counts unchanged on the lab
- the log carries counts, booleans and a fixed `kind` word, and a test asserts Stripe's error text is not in it
- the report type has no name or address field, the recipient is always SUPPORT_EMAIL, and the HTML is escaped
- the cron block has its own try/catch
- `MustFixMailError` is thrown on a failed send, and the did-not-run mail goes out when Stripe is down

## TDD Gate Compliance

Task 1: RED d0c65d97, then GREEN d385a6fb. Task 2: RED e61d4a68, then GREEN 34991af0. Task 3 (type auto, not TDD): d01e830d.

## Self-Check: PASSED

- FOUND: packages/emails/src/refund-check.ts, packages/emails/src/refund-check.test.ts
- FOUND: apps/web/lib/checkout/refund-check.ts, refund-check.test.ts, refund-check.local.test.ts
- FOUND: d0c65d97, d385a6fb, e61d4a68, 34991af0, d01e830d
