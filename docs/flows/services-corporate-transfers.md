# Services — Corporate Transfers

**Route (proposed):** `/services/corporate-transfers`
**Nav path:** Home "Services Section" or global nav "Services" → **this page**
**Milestone:** M004 S03 (`docs/BUILD-PLAYBOOK.md`)
**Source:** Figma board, node `24:399`

## Purpose

B2B-angled landing page for corporate transportation (`docs/PROJECT-BRIEF.md` "Corporate transportation").

> **Status (2026-08-04):** client wants "real B2B billing" eventually (confirmed, not just a marketing page), but the concrete shape (Stripe Invoicing / net terms vs. a company account with multiple bookers vs. both) is not decided yet. Until that's picked, build this as the marketing page + standard single-Stripe-checkout flow below — no billing schema work. Treat the eventual B2B billing feature as likely SOW change-order territory (`docs/SCOPE-OF-WORK.md` §10), not default V1 scope.

## Entry points

- Home "Services Section."
- Global nav "Services."
- Direct sales / outreach link.

## Page flow

1. **Hero** — reliability + professionalism framing for business travel and guest transport.
2. **Trust bullets** — fixed pricing, on-time guarantee framing, account-friendly (booking history for repeat use via [account-booking-history.md](account-booking-history.md)).
3. **Booking widget embed** — prefilled `service=corporate`, same passenger/extras flow as any other booking.
4. **Contact/inquiry option** — for volume or account-billing requests that fall outside the standard self-serve Stripe checkout (see Open questions).
5. **FAQ** — invoicing, receipts (Stripe receipt email covers standard case).
6. Repeated CTA into the booking widget.

## Data captured

Same as [booking-details-extras.md](booking-details-extras.md) once engaged. No separate corporate-account fields are scoped for V1.

## Exit points

- → Home booking widget / [booking-details-extras.md](booking-details-extras.md), `service=corporate` context carried through.
- → Contact page, for out-of-band requests.

## Edge cases

- A "corporate account" with saved billing/multiple travelers is not in V1 scope — every booking still goes through the standard single Stripe checkout (`docs/SCOPE-OF-WORK.md` §5 out-of-scope list has no B2B billing carve-out).

## Constraints

- One Stripe merchant account, one checkout path — no separate invoicing/PO flow (`docs/SCOPE-OF-WORK.md` §4.4, standard Stripe only).

## Open questions

- Which B2B billing shape: Stripe Invoicing/net-terms, a company account with multiple bookers, or both — client confirmed wanting "real" billing but hasn't picked a shape.
- Until that lands, this page stays marketing-only + standard checkout, same as every other service page.
