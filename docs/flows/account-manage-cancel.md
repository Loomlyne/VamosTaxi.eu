# Account — Manage or Cancel

**Route (proposed):** `/account/bookings/[id]/manage`
**Nav path:** Booking Detail "Manage or Cancel" CTA → **this page** (or modal on the detail page)
**Milestone:** M002 S06 (`docs/BUILD-PLAYBOOK.md`)
**Source:** Figma board, node `24:390`

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
- Refund handling: does cancellation auto-refund via Stripe, or just flag for admin review (`docs/PROJECT-BRIEF.md` admin dashboard has a distinct "Refund tracking" feature, suggesting refunds are admin-processed, not automatic)?

## Constraints

- Cancel window, refund rules, and waiting rules are Client-configured policy, not hardcoded (`docs/SCOPE-OF-WORK.md` §7.1 blocking inputs — "Booking policy: min advance time, free cancel window, refund rules, waiting rules").

## Open questions

- Self-service **modify** (reschedule date/time/vehicle) vs cancel-and-rebook only vs contact-only — not defined in SOW/PROJECT-BRIEF. Needs a decision before M002 S06.
- Auto-refund on cancel vs admin-reviewed refund — SOW's admin "Refund tracking" feature implies the latter; confirm before building.
