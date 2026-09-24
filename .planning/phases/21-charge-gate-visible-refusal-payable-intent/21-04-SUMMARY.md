---
phase: 21-charge-gate-visible-refusal-payable-intent
plan: 04
subsystem: payments
tags: [stripe, pay-link, quote-lock, postgres]

requires:
  - phase: 21-01
    provides: charge-gate helpers for missing class id, UAE prefix, and lock exp
provides:
  - Pay-link send pins token exp to the quote lock and refuses before Stripe
  - Pay-link open refuses a dead or unpriced token before Stripe and returns lock_expires_at
  - Migration that adds token_expires_at to checkout_pay_link_by_hash, not applied
affects: [21-07, pay-link-open, PayClient]

tech-stack:
  added: []
  patterns:
    - "Pay-link token exp is payLinkTokenExpiresAt(lockPayload.exp); resend does not restart it"
    - "Hash miss and P0002/23P01 on pay-link open are quote_expired, not payment_window_closed"
    - "UAE prefix returns 503 { ok: false } with no code, before stripeFromEnv"

key-files:
  created:
    - apps/web/lib/checkout/pay-link-gate.test.ts
    - packages/db/supabase/migrations/20260923121000_checkout_pay_link_lock_exp.sql
  modified:
    - apps/web/app/api/checkout/pay-link/route.ts
    - apps/web/app/api/checkout/pay-link/open/route.ts

key-decisions:
  - "Token expires_at is the verified lock exp, including on resend"
  - "email_failed stays 502 with code email_failed"
  - "Owner applies the lock-exp migration; this plan does not"

patterns-established:
  - "Payable-path UAE stop is status 503 JSON { ok: false } with no code field"
  - "Open success JSON lock_expires_at comes from token_expires_at, not snapshot_expires_at"

requirements-completed: [PAY-08, PAY-09]

duration: 13min
completed: 2026-09-23
---

# Phase 21 Plan 04: Pay-link lock clock Summary

**Pay-link send and open refuse a dead or unpriced lock before Stripe, and the token clock is the original lock exp even on resend.**

## Performance

- **Duration:** 13 min
- **Started:** 2026-09-23T09:24:32Z
- **Completed:** 2026-09-23T09:37:54Z
- **Tasks:** 2 of 3 code tasks committed; Task 3 awaiting owner
- **Files modified:** 4

## Accomplishments

- Send path refuses a missing class id as `pricing_not_live`, a dead lock as `quote_expired`, and an unpriced class total as `pricing_not_live`, all before `stripeFromEnv`.
- A payable send on the UAE test prefix returns 503 `{ "ok": false }` with no `code` and does not call `stripeFromEnv`. Resend stamps `payLinkTokenExpiresAt(lockPayload.exp)`.
- Open path: hash miss and `P0002` / `23P01` are `quote_expired`. A null, non-finite, or non-positive charge is `pricing_not_live`. Both return before Stripe. Success JSON sets `lock_expires_at` from `token_expires_at`. `quote_already_booked` is unchanged. `email_failed` stays 502.

## Task Commits

1. **Task 1: Send path — class id, prefix, lock exp, email_failed** - `31aa282` (feat)
2. **Task 2: Open path — dead token and unpriced never create** - `42a8e99` (feat)
3. **Task 3: Owner applies the lock-exp return** - not applied. Awaiting owner.

**Plan metadata:** this commit (docs)

## Files Created/Modified

- `apps/web/app/api/checkout/pay-link/route.ts` - Lock exp, class-id refuse, UAE stop, `email_failed` 502
- `apps/web/app/api/checkout/pay-link/open/route.ts` - Dead/unpriced refuse before Stripe; `lock_expires_at` from `token_expires_at`
- `apps/web/lib/checkout/pay-link-gate.test.ts` - Source pins for the clock, codes, prefix, and migration grant
- `packages/db/supabase/migrations/20260923121000_checkout_pay_link_lock_exp.sql` - Drop and recreate `checkout_pay_link_by_hash` with `token_expires_at`. Written only.

## Decisions Made

- Token expiry is the verified lock exp on first send and on resend. The checkout window stays the Checkout Session clamp (`expires_at`), not the pay-link timer.
- `email_failed` stays status 502 and code `email_failed`. It is not a charge-gate code.
- Task 3 is an owner apply. The migration file is committed. It was not applied.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

**Owner SQL is still open. Do not deploy the open route until it is applied.**

Apply `packages/db/supabase/migrations/20260923121000_checkout_pay_link_lock_exp.sql` on a copy, then on Zurich `yaumjzvylngfjhtuffqs` only if that apply is explicitly requested.

- The file drops and recreates `public.checkout_pay_link_by_hash(bytea)` so the return row includes `token_expires_at` (`t.expires_at`).
- Grant is `vamos_checkout` only. Public, anon, and authenticated are revoked.
- Do not wipe `yaumjzvylngfjhtuffqs`. Do not run a full database push of the migration tree.
- Until that apply, PayClient must not timer off `expires_at`, and the open route that reads `token_expires_at` must not be deployed.

## Next Phase Readiness

- Send and open source pins are green. `quote_already_booked` is unchanged.
- Blocked on the owner apply above. 21-07 token chrome must not timer off `price_snapshots.expires_at`.
- Ready for the next plan only after that SQL is applied, or with the open-route deploy held.

## Self-Check: PASSED

- `31aa282` and `42a8e99` are on `gsd/21-04-pay-link`.
- `apps/web/lib/checkout/pay-link-gate.test.ts` and `packages/db/supabase/migrations/20260923121000_checkout_pay_link_lock_exp.sql` exist.
- Vitest `lib/checkout/pay-link-gate.test.ts` and `lib/checkout/charge-gate.test.ts`: 16 passed, exit 0.
- Migration file exists and does not contain a database-push command. Not applied.

---
*Phase: 21-charge-gate-visible-refusal-payable-intent*
*Completed: 2026-09-23*
