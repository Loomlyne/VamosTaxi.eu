---
phase: 31-refunds-in-stripe
plan: 04
subsystem: email / refunds
tags: [email, resend, refunds, i18n]
requires:
  - "31-03: notification_claim_refund, notification_refund_read (migration 20261012220000)"
provides:
  - "apps/web/lib/checkout/refund-mail.ts: mailCustomerRefund(env, input) and deliverRefundMailByClaim(env, claimId), never throw; *WithDeps for tests; REFUND_MAIL_TEMPLATE_VERSION = refund@2026-10-13-1"
  - "apps/web/lib/checkout/refund-mail-alert.ts: alertRefundMailNotSent(env, { reference, stripeRefundId }) to SUPPORT_EMAIL"
  - "packages/emails: sendRefund forwards idempotencyKey; sendRefundMailAlert (English, internal); owner-signed issued copy in refund.ts"
  - ".planning/decisions/2026-10-12-refund-mail-copy.md: M1..M6, four languages"
affects: [31-05 (wires the sender into the webhook and the sweep), 31-06 (edits send.ts and index.ts after this), 31-13 (hand-over lists the alert text and M2/M4)]
tech-stack:
  added: []
  patterns: [claim-send-settle with injected deps, Resend idempotency key per recipient, decision-file byte pins]
key-files:
  created:
    - apps/web/lib/checkout/refund-mail.ts
    - apps/web/lib/checkout/refund-mail.test.ts
    - apps/web/lib/checkout/refund-mail-alert.ts
    - .planning/decisions/2026-10-12-refund-mail-copy.md
  modified:
    - packages/emails/src/lib/send.ts
    - packages/emails/src/lib/send.test.ts
    - packages/emails/src/index.ts
    - packages/emails/src/refund.ts
    - packages/emails/src/refund.test.ts
decisions:
  - "Task 2 gate: the owner signed the refund mail copy exactly as drafted in 31-CONTEXT (S-06, question form via the controller, 2026-10-13 ~16:20 +04); heading = subject words, greeting without a name = Hello, / Guten Tag / Bonjour, / مرحبًا،"
  - "REFUND_MAIL_TEMPLATE_VERSION = refund@2026-10-13-1 (signature date = Task 1 date, no change in Task 3)"
  - "The claim's error column gets fixed short codes only (missing_copy, no_api_key, no_recipient, read_failed, send_failed, send_threw), never Resend's text"
  - "If any recipient's send fails, the claim is settled with the error so the sweep retries; a recipient that got it is guarded by its idempotency key"
  - "Arabic subject isolates the reference too (heading = subject words, both isolated)"
metrics:
  duration: "about 8 min (2026-10-13 12:52Z to 13:00Z)"
  completed: 2026-10-13
  tasks: 3
  files: 9
---

# Phase 31 Plan 04: Customer refund mail Summary

When Stripe records a refund, `mailCustomerRefund` claims one mail per Stripe refund (`notification_claim_refund`), reads the booking through `checkout_booking_for_email`, sends the owner-signed copy in the booking's language with that refund's own amount to the contact and a different payer (Resend keys `refund-mail:<re_id>` and `refund-mail:<re_id>:payer`), and settles the claim. It never throws. A failed send stays on the claim for the sweep (`deliverRefundMailByClaim`). A claim that throws or returns no row sends info@ one English alert with the reference and the refund id only.

## Task 2: copy signature (gate already answered)

The owner signed the refund mail copy as drafted in 31-CONTEXT "Customer refund mail", en/de/fr/ar, verbatim: S-06, question form relayed by the controller, 2026-10-13 ~16:20 +04. The heading inside the mail repeats the subject words. The greeting without a name drops the name: "Hello," / "Guten Tag" / "Bonjour," / "مرحبًا،". Both rules come from the signed text and are listed in the 31-13 hand-over. No commit, because no files changed. Verify grep passed.

## Commits

| Task | Commit | What |
|------|--------|------|
| 1 RED | c2a6dad3 | refund-mail.test.ts (26 cases), send.test.ts idempotency + alert cases |
| 1 GREEN | 73c4b5bc | refund-mail.ts, refund-mail-alert.ts, sendRefund idempotencyKey, sendRefundMailAlert, index export |
| 3 RED | db0e1ebb | decision file M1..M6 + refund.test.ts byte pins |
| 3 GREEN | e09f3873 | signed copy in refund.ts, Arabic reference isolation, `{amount}` kept without a usable amount |

## Verification

- `apps/web`: `vitest run lib/checkout/refund-mail.test.ts`: 26/26 passed.
- `packages/emails`: `vitest run src/refund.test.ts src/lib/send.test.ts src/layout.test.ts`: 72/72 passed (3 files).
- `packages/emails` `tsc --noEmit`: exit 0. `apps/web` `tsc --noEmit -p tsconfig.json`: no errors.
- `pnpm check:db-fences`: "all 8 checks passed (1284 files scanned)".
- Acceptance greps: force-dynamic 1 line; `alertRefundMailNotSent` in refund-mail.ts; `refund-mail-alert:` in the alert file; `sendRefundMailAlert` in index.ts; `notification_claim(` 0; C-04 words 0; no sharp s in refund.ts; "Refund issued — Vamos Taxi" 0.
- Not in this plan's diff: `apps/web/lib/ops/must-fix-mail.ts`, `packages/emails/src/messages/`, `scripts/db-access-fence-allowlist.json`, money-events.ts, settle.ts, notify.ts.
- No Resend call, no database, no live system touched. All tests use injected deps or a mocked `resend`.

## New internal lines for sign-off (31-13 hand-over)

The info@ alert from `sendRefundMailAlert` in `packages/emails/src/lib/send.ts`. It is English and internal. The code comment marks it as not owner-signed.

- Subject: `Refund mail not sent: {reference}`. `{reference}` is the booking reference, or the `re_` id when the reference could not be read.
- Body: `Stripe made refund {refundId} on booking {reference}, but the customer refund email could not be prepared, so the customer has not been told by email. Open the refund in Stripe and tell the customer yourself.` When the reference could not be read, `{reference}` reads `no reference`.

The derived customer lines are also listed for the hand-over: M2 (heading = subject) and M4 (greeting without a name), in `.planning/decisions/2026-10-12-refund-mail-copy.md`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug, test fixture] A booking UUID with "4000" tripped the ids-only log check**
- **Found during:** Task 1 GREEN
- **Issue:** the test checked that log fields never contain an amount (`/4000/`), but the fixture UUID itself contained `4000`.
- **Fix:** the fixture UUID no longer contains digits that look like an amount. Commit 73c4b5bc.

**2. [Rule 2 - Correctness] Fixed error codes on the claim instead of provider text**
- **Found during:** Task 1
- **Issue:** the plan says "<short error code>". Resend's error text can quote the recipient address, and that text would land in `booking_notifications`.
- **Fix:** `sendErrorCode` maps the known outcomes to fixed words. Anything else becomes `send_failed`, and a thrown send becomes `send_threw`. Tested.

**3. [Design note] `RefundMailDeps.claim` returns `number | null | undefined`**
- The plan typed it `Promise<number|null>`, but its behavior list needs "no row came back" (undefined) to be told apart from NULL (already claimed). The real binding returns undefined when no row comes back.

## Not verified

- Real I/O in `refundMailDeps(env)` (asSystem SQL against the lab or live database, the real Resend call). Plan 31-05 owns the local DB test and the wiring. No `*.local.test.ts` here.
- How the mail renders in real mail clients (Arabic RTL with isolates in the subject line). That is checked at the pre-ship real refund (D-13: no is_test filter).
- Resend's idempotency window (24 h) covers sweep retries inside a day only. After that, a retry to a recipient who already got the mail could send it again. The claim stays the first guard.

## Known Stubs

None. `pending` kind copy is unchanged builder wording with no caller in this plan.

## Threat Flags

None beyond the plan's register: T-31-16 to T-31-20a are implemented and tested (recipients only from the definer, claim plus idempotency keys, amount passed through, logs with ids only, signed copy pinned, failed-claim alert).

## TDD Gate Compliance

RED `c2a6dad3` then GREEN `73c4b5bc` (Task 1); RED `db0e1ebb` then GREEN `e09f3873` (Task 3). No refactor commits.

## Self-Check: PASSED

- FOUND: apps/web/lib/checkout/refund-mail.ts, refund-mail.test.ts, refund-mail-alert.ts
- FOUND: .planning/decisions/2026-10-12-refund-mail-copy.md (24 language rows)
- FOUND: c2a6dad3, 73c4b5bc, db0e1ebb, e09f3873
