# Booking Flow — Confirmation

**Route (proposed):** `/book/confirmation/[bookingId]`
**Nav path:** Checkout (payment succeeded, webhook confirmed) → **this page**
**Milestone:** M002 S05–S06 (`docs/BUILD-PLAYBOOK.md`)
**Source:** Figma board, node `12:427` onward

## Purpose

Confirm success to the customer, deliver the voucher, and offer guests a path into an account without blocking anyone who doesn't want one.

## Entry points

- Checkout, only after the Stripe webhook has confirmed the booking (not on browser redirect alone — see [booking-checkout.md](booking-checkout.md) edge cases).

## Page flow

1. **Booking Confirmed** (server state, already true by the time this page renders).
2. **Voucher Emailed** — Resend sends confirmation + voucher (`docs/SCOPE-OF-WORK.md` §4.5). Page does not block on email send completing.
3. **Confirmation Page** — booking reference, route, datetime, vehicle, passenger, total paid, on-screen voucher content (same content as the email).
4. **Claim into Account** — shown **guest only**. Signed-in customers skip straight past this; guests get a CTA to set a password / claim via the emailed link, attaching this booking (and any future guest bookings under the same email) to a new account.
5. → [account-booking-history.md](account-booking-history.md) (account holders land here directly; guests land here after claiming).

## Data shown

| Field | Notes |
|---|---|
| Booking reference | Human-readable id for support/voucher lookup |
| Voucher content | Must match emailed version exactly |
| Payment status | Paid/confirmed only — this page should not be reachable in an unpaid state |

## Exit points

- Guest, no claim → done, can close; booking is still reachable via the secure emailed link (`docs/PROJECT-BRIEF.md` "secure booking-management page (works logged-in or token link)").
- Guest, claims account → account created, booking attached → Booking History.
- Signed-in customer → Booking History.

## Edge cases

- Email delivery failure (Resend bounce/delay) → confirmation page itself is still the source of truth; don't imply "check your email" as the only proof of booking.
- Guest tries to claim with an email that already has an account → route into sign-in, then attach.

## Constraints

- Claim-into-account is guest-only, optional, and happens after payment — never gates checkout (`docs/DECISIONS.md` #10).
- Pre-trip reminder + status-change emails are scheduled from this point forward, not shown as UI on this page (`docs/SCOPE-OF-WORK.md` §4.5).

## Open questions

- None outstanding beyond the auth-method question already flagged in [booking-details-extras.md](booking-details-extras.md).
