# Account — Manage or Cancel

**Route (proposed):** `/account/bookings/[id]/manage`
**Nav path:** Booking Detail "Manage or Cancel" CTA → **this page** (or modal on the detail page)
**Milestone:** M002 S06 (`docs/BUILD-PLAYBOOK.md`)
**Source:** Figma board, node `24:390`

> **Status (2026-08-04):** overlaps heavily with the new public [manage-a-booking.md](manage-a-booking.md) (lookup-gated, no account required, same cancel/modify logic). Whether this authenticated version ships alongside it or gets superseded is undecided — see [README.md](README.md#not-built--next-up). Don't build past a wireframe until that resolves.

## Purpose

Self-service cancellation within Client-configured policy. Modification scope is looser — see open questions.

## Entry points

- [account-booking-detail.md](account-booking-detail.md) CTA, authenticated or token-link guest.

## Page flow

1. **Policy check** — is this booking inside the free-cancel window?
   - **Yes** → Cancel button → confirm modal (optional reason) → cancels, status updates, refund initiated per policy.
   - **No** → show the configured cancellation fee/blocked message, with a contact-support fallback.
2. **Modify** — scope not fully defined by SOW (see Open questions); at minimum, a "contact us to change this booking" fallback should always work.

## Data captured

| Field | Notes |
|---|---|
| Cancellation reason | Optional, for internal reporting |

## Exit points

- Cancelled → back to Booking Detail/History with updated status; customer receives a status-change email (`docs/SCOPE-OF-WORK.md` §4.5).
- Blocked → contact-support link/CTA.

## Edge cases

- Booking already assigned a driver / in progress → cancel policy may differ from a not-yet-assigned booking; admin-side status should be the source of truth for what's still cancellable.
- Refund handling: **always admin-reviewed** (locked 2026-08-04) — the self-serve flow computes the entitled refund share by policy and flags it; a human executes the actual Stripe refund from the admin dashboard's "Refund tracking" feature. No auto-refund on cancel.

## Constraints

- Cancel window, refund rules, and waiting rules are Client-configured policy, not hardcoded (`docs/SCOPE-OF-WORK.md` §7.1 blocking inputs — "Booking policy: min advance time, free cancel window, refund rules, waiting rules").
- Refund execution is always admin-reviewed, never automatic (locked 2026-08-04).

## Open questions

- Self-service **modify**: the newer [manage-a-booking.md](manage-a-booking.md) spec narrows this to "change pickup date/time only," gated by a modification-deadline rule whose threshold is still pending client/legal-checklist input — not a scope decision anymore, just a missing number.
