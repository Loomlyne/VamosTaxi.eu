---
phase: 21-charge-gate-visible-refusal-payable-intent
reviewed: 2026-09-23T10:19:08Z
depth: standard
files_reviewed: 18
files_reviewed_list:
  - apps/web/app/[locale]/checkout/CheckoutClient.tsx
  - apps/web/app/[locale]/checkout/PaymentPanel.tsx
  - apps/web/app/[locale]/checkout/pay/[token]/PayClient.tsx
  - apps/web/app/api/checkout/intent/route.ts
  - apps/web/app/api/checkout/pay-link/open/route.ts
  - apps/web/app/api/checkout/pay-link/route.ts
  - apps/web/app/api/checkout/requote/route.ts
  - apps/web/lib/checkout/charge-gate.ts
  - apps/web/lib/checkout/charge-gate.test.ts
  - apps/web/lib/checkout/intent.ts
  - apps/web/lib/checkout/intent.test.ts
  - apps/web/lib/checkout/pay-land.test.ts
  - apps/web/lib/checkout/pay-link-gate.test.ts
  - apps/web/lib/checkout/payable-account.test.ts
  - apps/web/lib/checkout/requote-cancel.test.ts
  - apps/web/lib/checkout/select-off.test.ts
  - apps/web/lib/checkout/token-pay.test.ts
  - packages/db/supabase/migrations/20260923121000_checkout_pay_link_lock_exp.sql
findings:
  critical: 1
  warning: 3
  info: 2
  total: 6
status: issues
---

# Phase 21: Code Review Report

**Reviewed:** 2026-09-23T10:19:08Z
**Depth:** standard
**Files Reviewed:** 18
**Status:** issues

## Summary

Reviewed the phase charge-gate diff against `origin/main` (checkout client, pay panel, token page, intent / pay-link / requote routes, charge-gate helpers, and the pay-link hash migration). Advisory only. No product code was changed.

The mint gates that are in place look right: a missing class id is `pricing_not_live` before Stripe, an expired lock is `quote_expired` before `stripeFromEnv` on the pay-link send path, a hash miss does not open Stripe, and a new pay-link token is pinned to the lock exp rather than the checkout window. The migration grants `vamos_checkout` only.

The hole is an already-mounted Checkout Session. After the lock fires, the card confirm bails out, but Apple Pay and Link still call `checkout.confirm()`. Stripe will not let that session expire in under 30 minutes, and a refused settle does not refund the charge.

## Narrative Findings (AI reviewer)

## Critical Issues

### CR-01: Lock flag does not stop Apple Pay or Link confirm

**File:** `apps/web/app/[locale]/checkout/PaymentPanel.tsx:363-377`
**Issue:** `locked` is the gate for a session that is already on the page (`CheckoutClient.tsx:1129`, `PayClient.tsx:197-198`). The card callback returns early when `locked` is true (`PaymentPanel.tsx:339`). `onExpress` does not. It is the `onConfirm` handler for `ExpressCheckoutElement` (`PaymentPanel.tsx:151`), which is mounted for Apple Pay and Link (`PaymentPanel.tsx:139-143`). `pointer-events: none` does not cancel a wallet sheet that is already open, and it does not stop `onConfirm`. `stripeSessionExpiresAtUnix` keeps a Checkout Session alive for at least 30 minutes, so the session is still confirmable after a shorter quote lock. `captureAllowed` then skips settle when the lock is past and does not refund. The card is charged and the booking stays unpaid.

**Fix:** Fail the express event when locked, and expire the session when the lock hits so a sheet that is already open cannot capture.

```tsx
async function onExpress(event: ExpressConfirmEvent) {
  if (locked) {
    event.paymentFailed({ reason: "fail" });
    return;
  }
  // existing confirm path
}
```

Do not treat `pointer-events: none` as the charge gate. The server has to expire the Checkout Session at lock exp; the UI flag cannot.

## Warnings

### WR-01: `email_failed` is shown as "payment did not start"

**File:** `apps/web/app/[locale]/checkout/CheckoutClient.tsx:77-87`
**Issue:** `POST /api/checkout/pay-link` returns 502 `{ error: "email_failed", code: "email_failed" }` only after the booking and token are stored (`apps/web/app/api/checkout/pay-link/route.ts:175-211`). `REFUSAL_KEYS` has no `email_failed`. `sendPayLink` maps any unknown code to `payCouldNotStart` (`CheckoutClient.tsx:1063`), whose copy tells the passenger to try Pay and continue. That starts the card path, not a resend. The wire code was split from `invalid_request` so it would not collapse; the only caller still collapses it.

**Fix:** Map `email_failed` to its own checkout string: the link was not sent, the booking exists, retry send. Do not reuse `payCouldNotStart`.

### WR-02: Requote can cancel the booking and leave the Stripe session open

**File:** `apps/web/app/api/checkout/requote/route.ts:66-68`
**Issue:** The open-payment lookup swallows every error and continues. Cancel then runs, and `ok: true` is returned even when `sessionId` is null, so `expireCheckoutSession` never runs. A second tab that already holds `client_secret` can still confirm. After cancel, settle will not mark the booking paid, and this route does not refund. The expire `catch` at lines 92-94 has the same outcome when the lookup succeeded but expire failed.

**Fix:** Do not return `ok: true` unless the session was expired or there was no session. Surface a lookup failure instead of treating it as "no session". Have the cancel RPC return the session id so expire does not depend on a prior query that is allowed to fail open.

### WR-03: A missing `token_expires_at` 500s a payable open

**File:** `apps/web/app/api/checkout/pay-link/open/route.ts:57-58`
**Issue:** `isoInstant` calls `toISOString()` on `new Date(String(value))`. If the owner has not applied `20260923121000_checkout_pay_link_lock_exp.sql`, the hash RPC has no `token_expires_at` column. `row.token_expires_at` is undefined, `new Date("undefined")` is invalid, and `toISOString()` throws. That throw is outside the SQL `catch`, so a valid token becomes a 500. `PayClient` then shows `paymentWindowClosed`. The same throw happens if the driver returns a non-date string.

**Fix:**

```ts
function isoInstant(value: unknown): string | null {
  const date = value instanceof Date ? value : new Date(String(value ?? ""));
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}
```

If `lock_expires_at` cannot be formed, refuse `quote_expired`. Do not let `openPaidJson` throw.

## Info

### IN-01: Lock tests pin the card callback and miss express confirm

**File:** `apps/web/lib/checkout/pay-land.test.ts:144`
**Issue:** The lock test asserts the source contains `if (locked) return;`, which is the card `onReady` callback. `onExpress` has no such guard, so the pin stays green while Apple Pay and Link can still confirm. Same pattern in the other source-text pins: they check string order, not the confirm call.

**Fix:** Assert `onExpress` calls `paymentFailed` when `locked` is true, or drive the panel with a fake `onConfirm`. Do not treat the card-callback string as the whole gate.

### IN-02: Zero rappen is selectable on checkout and refused on the token page

**File:** `apps/web/lib/checkout/charge-gate.ts:4-6`
**Issue:** `classIsSelectable(0)` is true, and `charge-gate.test.ts` pins that. Pay-link open refuses `charged <= 0` as `pricing_not_live` before a session. A zero-fare class can mint on checkout and then show "pricing not live" to the payer who opens the link.

**Fix:** Pick one rule. If zero is not payable, `classIsSelectable` should reject it. If a zero fare is a real price, open should not call it `pricing_not_live`.

---

_Reviewed: 2026-09-23T10:19:08Z_
_Reviewer: Hermes (gsd-code-reviewer)_
_Depth: standard_
