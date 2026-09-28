---
quick: 260928-lat
phase: 26.1
title: A late payment-session answer is discarded; clearing the session resets cardComplete
closes: 26.1-VERIFICATION.md warnings 1 and 3 (commit f7fe6d0f)
completed: 2026-09-28
commits:
  - b6f1ea05 test(26.1): failing tests for a late payment-session answer
  - fe98c268 fix(26.1): a payment-session answer for an older lock is discarded
  - a7ecff12 test(26.1): failing tests for cardComplete after the card form unmounts
  - 018afd7a fix(26.1): clearing the payment session resets cardComplete
key-files:
  created:
    - apps/web/lib/checkout/intent-answer.ts
    - apps/web/lib/checkout/intent-answer.test.ts
  modified:
    - apps/web/app/[locale]/checkout/CheckoutClient.tsx
    - apps/web/lib/checkout/coupon-recovery.test.ts
    - apps/web/lib/checkout/checkout-session-store.test.ts
---

# Quick 260928-lat: late intent answer and cardComplete

Client only. No server, SQL, i18n or `.dc.html` change. No new customer-visible string.

## Task 1: an intent answer for an older lock is discarded

- `intentAnswerAction({ sentLock, currentLock })` in `lib/checkout/intent-answer.ts`: `mount` when both trim to the same non-empty string, otherwise `discard`.
- `startPayment` (`CheckoutClient.tsx:979`) re-reads the lock when the answer arrives (`readDraft().lock || draft.lock || trip?.lock`, 1063) and decides at 1064. This is before `if (!res.ok)`, so a late success and a late refusal are handled the same way.
- On `discard` (1065-1074): no secret, hex, ref, reference, publishable key, VAT rate or stored session is set; no refusal is shown; no coupon recovery runs. `intentStarted` is released, `intentGate` is cleared (1072), `intentTick` is bumped once, and the result is `"stale"`.
- `"stale"` is a new result. The automatic intent effect returns on it without counting (706). Pay returns on it without a refusal (1534); that path cannot be reached today, because Pay only calls `startPayment` with a session already open.
- No loop: a discard needs the lock to change during the request. The next run captures the lock on screen at its start, so it discards again only if the customer reprices again during that request.
- The server session for the older lock is left alone. `intent.ts:494-497` expires it when the next session opens.

## Task 2: clearing the payment session resets cardComplete

`dropPaymentSession(quoteId)` (400) clears the secret, the hex, `clientSecretRef`, the stored session, `confirmPay` and `cardComplete`. It is called from:

- new quote: 574 (`stored.quoteId ?? ""`, because `quoteChanged` already implies an id)
- flight reprice success: 1221
- coupon/extras reprice success: 1343
- the failed recovery in `startPayment`: 1109. No secret exists there, so nothing unmounts.

## Deviations

- `sendPayLink`'s failed recovery (1444) still calls only `clearCheckoutSession(quoteId)`. The reprice failed, so the lock did not change, and a card form already on screen stays mounted and keeps reporting whether the card is complete. Resetting `cardComplete` there would send a complete card to `ask_card`. This path does not clear the client secret, so the rule "every path that clears the secret resets cardComplete" still holds.
- A new wiring test asserted `currentLock: answerLock,` with a trailing comma. The call fits on one line, so GREEN changed the check to a word-boundary regex.
- The RED commit of task 2 had a tuple type error in the new test. GREEN fixed it with `as const`.
- Existing assertions changed in `checkout-session-store.test.ts`:
  - "every path that clears the in-memory client secret…": the `clientSecretRef.current = null;` count went from 3 to 1 because the line is now in the helper. The two re-sign paths are found by `dropPaymentSession(quoteId);`, and the new quote by `dropPaymentSession(stored.quoteId ?? "");`.
  - "a restore_lock_coupon outcome clears the stored session in both refusal branches": `startPayment` expects `dropPaymentSession(quoteId);` and `sendPayLink` still expects `clearCheckoutSession(quoteId);`.
- Not changed: the `catch` of `startPayment` (network error or timeout) still counts as a failure even if the lock changed meanwhile. Out of scope.

## Verification

- lib/checkout: 57 files, 522 tests passed (512 + 10 new).
- test:unit: 2,235 passed (db 9, emails 105, web 2,121), 0 failed. Baseline was 2,225.
- typecheck: pass. lint: 0 errors, 5 existing warnings, none in changed files. lint:css, check:numbers, check:db-fences: pass.

## Self-Check: PASSED
