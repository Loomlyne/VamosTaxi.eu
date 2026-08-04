# Account — Booking History

**Route (proposed):** `/account/bookings`
**Nav path:** Profile nav, or direct landing post-confirmation/post-claim → **this page**
**Milestone:** M002 S06 (`docs/BUILD-PLAYBOOK.md`)
**Source:** Figma board, node `24:384`

## Purpose

List all bookings tied to the signed-in account so a returning customer can find and manage a trip without a voucher email in hand.

## Entry points

- Account nav.
- [booking-confirmation.md](booking-confirmation.md), for signed-in customers or guests who just claimed.

## Page flow

1. **Upcoming / Past filter** (or tabs).
2. **List/table** — pickup date/time, route, vehicle class, status, price, "View" link per row.
3. **Empty state** — no bookings yet, CTA back to Home booking widget.

## Data shown

| Field | Notes |
|---|---|
| Status | Reflects admin status workflow (`docs/PROJECT-BRIEF.md` admin dashboard: new → confirmed → assigned → completed / cancelled) |
| Price | Snapshot value, not recalculated |

## Exit points

- Row click → [account-booking-detail.md](account-booking-detail.md).

## Edge cases

- Guest bookings not yet claimed do **not** appear here (they're not attached to the account) — only reachable via the token link from the voucher email until claimed.

## Constraints

- RLS scoped to `auth.uid()` — a list can only ever return the signed-in user's own bookings (`docs/PROJECT-BRIEF.md` Security requirements).

## Open questions

- None.
