# Booking Flow — Checkout

**Route (proposed):** `/book/checkout`
**Nav path:** Details & Extras (final total reviewed) → **this page**
**Milestone:** M002 S04 (`docs/BUILD-PLAYBOOK.md`)
**Source:** Figma board, node `12:406` onward

## Purpose

Take payment via Stripe on a server-authoritative, already-snapshotted price, and hand off to webhook-driven confirmation. No client-trusted pricing at this step.

## Entry points

- Details & Extras, after "Review Final Total" is confirmed. Trip summary + coupon are locked at this point — going back to Details & Extras should re-run this step, not patch state in place.

## Page flow

1. **Trip Summary Shown** — final read-only recap (route, datetime, vehicle, passenger, extras, discount, total).
2. **Stripe Checkout Opens** — standard Stripe account (Checkout or PaymentIntents), not Stripe Connect (`docs/DECISIONS.md` #15). Offline/pay-later shown only if client enables it (`docs/SCOPE-OF-WORK.md` §4.2).
3. **"Payment succeeded?"**
   - **Yes** → **Stripe Webhook** fires server-side → booking flips to confirmed (this is the source of truth, not the client redirect) → [booking-confirmation.md](booking-confirmation.md).
   - **No** → **Payment Failed** screen → **"Retry?"**
     - **Yes** → back to "Stripe Checkout Opens" (same locked price snapshot, no re-quote).
     - **No** → **Booking Expires Unpaid** — booking record stays but never confirms; no manual re-entry needed (`docs/DECISIONS.md` #17).

## Data captured

| Field | Notes |
|---|---|
| Stripe PaymentIntent / Checkout Session id | Stored on booking |
| Amount charged | Must match the snapshot total, not a live recalculation |
| Payment status | Driven by webhook, not client-side redirect result |

## Exit points

- Success → Confirmation page.
- Abandoned/expired → no forward exit; booking is left in an unpaid, non-blocking state.

## Edge cases

- User closes tab mid-Stripe-checkout → webhook never fires → booking stays unpaid, expires per policy.
- Webhook arrives before/after the browser redirect → UI must not rely on the redirect alone to show "confirmed"; poll or listen for the webhook-driven status.
- Duplicate webhook delivery → booking/payment creation must be idempotent (`docs/PROJECT-BRIEF.md` Security requirements).

## Constraints

- Stripe webhook signature verification required (`docs/SCOPE-OF-WORK.md` §4.7).
- Price at this step is the snapshot from Details & Extras — never recalculated client-side (`docs/PROJECT-BRIEF.md` pricing engine).
- No Stripe Connect, no multi-party payouts (`docs/DECISIONS.md` #15, #23 out-of-scope list).

## Open questions

- Instant confirm vs dispatcher approval on payment — open in `docs/OFFICE-HOURS-DESIGN.md`.
- TWINT eligibility depends on client's live Stripe account — open in `docs/OFFICE-HOURS-DESIGN.md`.
