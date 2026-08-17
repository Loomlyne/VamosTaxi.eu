# Account — Booking Detail

**Route (proposed):** `/account/bookings/[id]` (also reachable via a secure token link for guests, per `docs/PROJECT-BRIEF.md` "works logged-in or token link")
**Nav path:** Booking History row → **this page**
**Milestone:** M002 S06 (`docs/BUILD-PLAYBOOK.md`)
**Source:** Figma board, node `24:387` (also mirrored on the admin side as its own dashboard page — see `docs/PROJECT-BRIEF.md` admin dashboard list, not the same UI)

> **Status (2026-08-04):** overlaps heavily with the new public [manage-a-booking.md](manage-a-booking.md) (lookup-gated, no account required). Whether this authenticated version ships alongside it or gets superseded is undecided — see [README.md](README.md#not-built--next-up). Don't build past a wireframe until that resolves.

## Purpose

Single-booking view: full trip detail, price breakdown, and the entry point into cancel/manage.

## Entry points

- [account-booking-history.md](account-booking-history.md) row click (authenticated).
- Secure token link from the voucher email (guest, no account).

## Page flow

1. **Trip detail** — route, datetime, vehicle class, passenger info, flight number, extras.
2. **Price breakdown** — the exact snapshot stored at booking time, not a live recalculation (`docs/PROJECT-BRIEF.md` pricing engine).
3. **Payment status.**
4. **Status history / timeline** — mirrors admin status workflow changes.
5. **Voucher** — re-download or reprint, same content as the original email.
6. CTA → [account-manage-cancel.md](account-manage-cancel.md).

## Data shown

| Field | Notes |
|---|---|
| Price breakdown | Immutable snapshot — later pricing-rule changes must never alter this (`docs/PROJECT-BRIEF.md`) |
| Status | Read-only here; changes happen from the admin side |

## Exit points

- → Manage or Cancel.
- Back → Booking History (authenticated) or nothing (token-link guest, dead-end page by design).

## Edge cases

- Token link reused after the booking is cancelled/completed → still viewable, just read-only with no manage actions where policy blocks it.
- Token link security: must not be guessable/sequential (`docs/PROJECT-BRIEF.md` Security requirements — audit trail, no secrets in URLs as plain ids).

## Constraints

- RLS: authenticated access scoped to `auth.uid()`; token access scoped to a signed/opaque token, not the raw booking id.

## Open questions

- Exact token scheme (signed JWT vs opaque random token stored server-side) — not specified in SOW/PROJECT-BRIEF, an implementation decision for M002.
