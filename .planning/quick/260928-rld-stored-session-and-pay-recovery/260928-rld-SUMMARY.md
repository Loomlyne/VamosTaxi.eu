---
quick: 260928-rld
phase: 26.1
title: Stored payment session follows the lock; Pay recovers without a card form
closes: 26.1-VERIFICATION.md new warnings 1 and 2 (commit fa799869)
completed: 2026-09-28
commits:
  - 6b19ca54 test(26.1): failing tests for the stored payment session after a reprice
  - 0d17545d fix(26.1): a reprice invalidates the stored payment session
  - 7417144d test(26.1): failing tests for Pay without a card form
  - 34e43d9e fix(26.1): Pay recovers the price or starts the session when no card form is mounted
key-files:
  modified:
    - apps/web/lib/checkout/checkout-session-store.ts
    - apps/web/lib/checkout/checkout-session-store.test.ts
    - apps/web/lib/checkout/coupon-recovery.ts
    - apps/web/lib/checkout/coupon-recovery.test.ts
    - apps/web/app/[locale]/checkout/CheckoutClient.tsx
---

# Quick 260928-rld: stored session and Pay recovery

Client only. No server, SQL, i18n or `.dc.html` change. No new customer-visible string.

## Task A: a reprice invalidates the stored payment session

- The stored session now carries `lock`: the exact signed lock string the intent was created with (`startPayment`, `CheckoutClient.tsx:1110`). Exact string compare, no hash, so no collision; the lock is already client-visible.
- `readCheckoutSession(quoteId, lock)` restores only when the stored quote id and lock both match. Same quote with another lock, or an entry without a lock (written before this change), is deleted and not restored.
- `clearCheckoutSession(quoteId)` removes the entry for that quote id.
- Cleared at: new quote (560), flight sync re-sign (1193), coupon/extras reprice re-sign (1319), `restore_lock_coupon` in startPayment (1078) and in sendPayLink (1419).
- Restore effect passes the lock on screen: `trip?.lock || readDraft().lock` (604-605).

## Task B: Pay without a card form

`payClickAction({ hasSession, cardComplete, couponInvalid, lockCoupon })` in `coupon-recovery.ts`. `onPay` (1447) decides at 1462, after the expiry and pricing guards:

- `recover_price` (1468): one `applyCouponCode(null)` behind a `payRecovering` ref, keeps `couponNoLongerValid`, and shows `payCouldNotStart` if it fails. Never charges.
- `start_session` (1488): resets `intentAttempts`, clears a stale refusal except `pricingNotLive`/`quoteExpired`, and bumps `intentTick`. Never charges.
- `ask_card` (1498): `completeCard`, as before.
- `pay`: the gate at 1502, then `startPayment()` (1508) and `confirm()` (1528), the only call.

The `restore_lock_coupon` comment now names Pay, Remove and Send pay link as exits.

## Deviations

- `checkout-session-store.test.ts` "restores the secret for this quote only": calls changed to pass a lock, because `lock` is now required.
- `coupon-recovery.test.ts`: the `await applyCouponCode(null)` count went from 2 to 3, because of the new Pay `recover_price` call.
- RED: "restores a stored session when its lock fingerprint matches the current lock" passed before GREEN. Matching restore already worked, and `JSON.stringify` stored the extra field. It is a positive-path guard. The other 13 new tests failed in RED.

## Verification

- lib/checkout: 56 files, 512 tests passed.
- test:unit: 2,225 passed (2,211 baseline plus 14 new), 0 failed.
- typecheck: pass.
- lint: 0 errors (5 existing unused-directive warnings, none in changed files).
- lint:css, check:numbers and check:db-fences: pass.

## Self-Check: PASSED
