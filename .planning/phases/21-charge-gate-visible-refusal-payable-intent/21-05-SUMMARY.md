---
phase: 21-charge-gate-visible-refusal-payable-intent
plan: 05
subsystem: ui
tags: [checkout, stripe, pay-land, requote, lock-zero]

requires:
  - phase: 21-charge-gate-visible-refusal-payable-intent
    provides: classIsSelectable and 21-02 Select-off so unpriced classes never enter a live Pay mount
provides:
  - Unpriced or already-expired Pay land shows an Alert and dummy fields and does not mount Stripe
  - Lock zero disables a mounted PaymentPanel and does not POST intent
  - Payment-sheet Requote posts /api/checkout/requote and goes Home only when ok is true
affects: [21-06, 21-07]

tech-stack:
  added: []
  patterns: [source-pin pay-land.test.ts, trip expires_at timer, data-pay-locked wrapper]

key-files:
  created:
    - apps/web/lib/checkout/pay-land.test.ts
  modified:
    - apps/web/app/[locale]/checkout/CheckoutClient.tsx
    - apps/web/app/[locale]/checkout/PaymentPanel.tsx

key-decisions:
  - "Already-expired Pay stays on the payment step. bouncePath would send a past expires_at home, which hides the refusal."
  - "Lock zero leaves a mounted PaymentPanel in place and passes locked. Dummy Inputs are only when Stripe was not mounted."
  - "Requote navigates only after JSON ok true. requote_not_applied stays on the refusal and does not clear storage."

patterns-established:
  - "Pay-land Alert is the first child of vt-checkout__payblock, role=alert, tone info or danger, never accent."
  - "onQuoteLockZero sets quoteExpired and does not touch intent, clientSecretRef, or QUOTE_LOCK_MINUTES."

requirements-completed: [PAY-08, PAY-09]

duration: 15 min
completed: 2026-09-23
---

# Phase 21 Plan 05: Pay land refusal Summary

**Blocked Pay shows an Alert and dummy fields without Stripe, lock zero disables a mounted panel, and Requote goes Home only after a real cancel**

## Performance

- **Duration:** 15 min
- **Started:** 2026-09-23T09:40:00Z
- **Completed:** 2026-09-23T09:54:34Z
- **Tasks:** 3
- **Files modified:** 3

## Accomplishments

- Unpriced or already-expired Pay does not render PaymentPanel, does not call loadStripe, and the payment-step effect returns before startPayment. Alert is info `pricingNotLive` or danger `quoteExpired`, role=alert, never accent. Dummy fields use kit Input size md disabled, empty values, format-hint placeholders, and a disabled Select value CH. Pay and Email a pay link stay disabled.
- `onQuoteLockZero` schedules from trip `expires_at`. At zero it sets the expired refusal. It does not POST `/api/checkout/intent`, clear `clientSecretRef`, or call `startPayment`. A mounted panel gets `locked` (`data-pay-locked`, pointer-events none, aria-disabled). Unmounted Stripe becomes the dummy land.
- Payment-sheet Requote is Button ghost md sentenceCase with no href. Click posts `/api/checkout/requote` with the trip quote id. Storage clears and Home opens only when JSON `ok` is true. A non-ok response, including `requote_not_applied`, stays. The trip-rail priceChanged control still uses `href={homeHref}`.

## Task Commits

Each task was committed atomically:

1. **Task 1: Land blocked — dummy fields, Alert, no Stripe** - `fd42e977` (feat)
2. **Task 2: Lock zero disables mounted Stripe and does not mint** - `dc206857` (feat)
3. **Task 3: Requote cancels then goes Home, or stays if cancel did not apply** - `a4661c54` (feat)

**Plan metadata:** docs commit for this SUMMARY (STATE.md and ROADMAP.md not staged)

## Files Created/Modified

- `apps/web/app/[locale]/checkout/CheckoutClient.tsx` - Pay-land Alert, dummy fields, expires_at timer, Requote POST.
- `apps/web/app/[locale]/checkout/PaymentPanel.tsx` - `locked` prop. browserStripe unchanged.
- `apps/web/lib/checkout/pay-land.test.ts` - readFileSync pins. Does not import Stripe.

## Decisions Made

- Expired Pay land does not follow `bouncePath` home. The refusal has to paint on the payment card.
- `startPayment` returns skip when the class is not selectable or the lock is past, so a details Continue on an expired lock cannot mint before the payment step lands.
- Country dummy option label is `CH`. No invented PAN. Placeholders are the existing format hints.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Expired Pay was bouncing home before the refusal could paint**
- **Found during:** Task 1 (Land blocked)
- **Issue:** `bouncePath` treats a past `expires_at` as no lock and replaces the route with `/`. The payment card never mounted.
- **Fix:** Stay when `step === "payment"` and `lockExpired(trip)`. Trip and details still bounce.
- **Files modified:** `apps/web/app/[locale]/checkout/CheckoutClient.tsx`
- **Verification:** Source pin plus the existing `lockExpired` helper. No edit to `steps.ts`.
- **Committed in:** `fd42e977` (Task 1)

**2. [Rule 2 - Missing critical] startPayment could still POST on an expired Continue**
- **Found during:** Task 1 (Land blocked)
- **Issue:** `continueDetails` calls `startPayment` before the payment push when the class is selectable. A past lock would mint, then land with a secret.
- **Fix:** `startPayment` returns skip before the intent fetch when `lockExpired` or the peek is not selectable. It does not map that skip to `payCouldNotStart`.
- **Files modified:** `apps/web/app/[locale]/checkout/CheckoutClient.tsx`
- **Verification:** `pay-land.test.ts` effect returns before `startPayment`. Guard is before the fetch.
- **Committed in:** `fd42e977` (Task 1)

---

**Total deviations:** 2 auto-fixed (1 bug, 1 missing critical)
**Impact on plan:** Both keep the land refusal from minting a session. No new copy, no new i18n, no Stripe key.

## Issues Encountered

None. `pay-land.test.ts` and `select-off.test.ts` passed via the main vitest binary (14 and 7 tests).

## User Setup Required

None - no external service configuration required. `/api/checkout/requote` is 21-06. Until that definer is applied, Requote stays on the refusal.

## Next Phase Readiness

- 21-06 can implement `POST /api/checkout/requote`. This client already posts `{ quote_id, quoteId }` and navigates only on `ok: true`.
- 21-07 must not reuse `onQuoteLockZero`. The token page has its own clock.
- Pixel check is UAT against `21-UI-SPEC.md`, not Playwright.

## Self-Check: PASSED

- `fd42e977` present on `gsd/21-05-pay-land`
- `dc206857` present
- `a4661c54` present
- `apps/web/lib/checkout/pay-land.test.ts` exists
- `21-05-SUMMARY.md` exists after this commit

---
*Phase: 21-charge-gate-visible-refusal-payable-intent*
*Completed: 2026-09-23*
