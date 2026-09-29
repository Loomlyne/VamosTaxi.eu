---
quick_id: 260928-cpn
phase: 26.1
follows: 26.1-32
subsystem: checkout, ops
tags: [coupon, checkout, i18n, tdd]
key-files:
  modified:
    - apps/web/lib/checkout/coupon-recovery.ts
    - apps/web/lib/checkout/coupon-recovery.test.ts
    - apps/web/app/[locale]/checkout/CheckoutClient.tsx
    - app/ops/OpsDetail.dc.html
    - apps/web/lib/ops/ops-detail-i18n.test.ts
decisions:
  - "A failed coupon-recovery reprice restores the lock's coupon as applied, clears the recovery ref and exhausts the automatic intent retry, so nothing repeats without a click"
completed: 2026-09-28
---

# Quick 260928-cpn: coupon recovery after a failed reprice

Closes two warnings from 26.1-VERIFICATION.md (commit 6cedd991): checkout blocked when the coupon-recovery reprice fails, and the ops-detail parity test reading single-quoted values only. Applies the verifier's four translation touch-ups.

## Commits

| # | Hash | Subject |
|---|------|---------|
| 1 | a4303dc4 | test(26.1): failing tests for a failed coupon recovery reprice |
| 2 | 22c7fb3a | fix(26.1): checkout stays payable when the coupon recovery reprice fails |
| 3 | 15d02a25 | fix(26.1): ops booking detail wording in ar, fr, de; parity test reads every value form |

## What changed

- `applyCouponCode` resolves `Promise<boolean>`: `true` only after it writes the new lock, `false` on every early return, on the failure path and in the catch. Failure path and catch do not touch `intentAttempts` or `intentTick`.
- New `couponRecoveryOutcome({ action, repriceOk, lockCoupon })` returns `recovered`, `restore_lock_coupon` or `none`.
- Both refusal branches (`startPayment`, `sendPayLink`) await the reprice into `repriced`, re-read the lock's coupon after it, and on `restore_lock_coupon` set `couponApplied` back to it, keep `couponInvalid` and `couponNoLongerValid`, clear `couponRecoveryAttempted` and set `intentAttempts` to `INTENT_AUTO_ATTEMPTS` (6, now a named constant shared with the auto-intent effect).
- `sendPayLink` reads `readDraft().lock || draft.lock || trip?.lock`.
- OpsDetail `T`: ar `lineAirportFee` الاستقبال, ar `dispatch` التشغيل, fr `takeCard` "Encaisser par carte", de `noFlight`/`noCoupon` "Keiner".
- Parity test walks the object literal (strings, templates, comments, nesting) instead of matching `key:'`; still 152 keys per language.

## Deviations from Plan

**1. [Rule 1 - Bug] Automatic intent retry stopped after a failed recovery reprice**
- Found during: Task 1.
- Issue: the payment-step auto-intent effect bumps `intentTick` itself after a failed attempt (up to 6). Once the recovery ref is cleared, each automatic retry would refuse and reprice again: up to 5 more reprices without a click.
- Fix: on `restore_lock_coupon` both branches set `intentAttempts.current = INTENT_AUTO_ATTEMPTS`. The effect stops, shows its existing refusal (`current ?? "payCouldNotStart"`), and waits for a click. It is never reset to 0 and `setIntentTick` is never called on this path.
- Clicks that resume: Remove on the coupon field (reprice without coupon; on success resets attempts and bumps the tick), an extras toggle, or sending a pay link.

**2. Existing wiring test updated**
- The ref-reset count went from 2 to 4 (one per refusal branch), and that test's title now names the failed recovery reprice as the third reset.

## Known limit

After a refusal from the automatic intent, no card form is mounted, so a Pay click shows `completeCard` rather than running `startPayment`. The click that recovers is Remove on the coupon field. This matches what happened before this change.

## Browser-only proof

Owner UAT 15-17, plus: block `/api/quote/reprice` in devtools, trigger the refusal, and check that the field shows the coupon with Remove and the no-longer-valid message, the price stays discounted, and nothing retries. Unblock, click Remove, and check that the price returns to the amount without the coupon and the card form appears.

## Self-Check: PASSED
