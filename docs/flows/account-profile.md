# Account — Profile

**Route (proposed):** `/account/profile`
**Nav path:** Account (signed in) → **this page** (default landing after sign-in)
**Milestone:** M002 S03 (`docs/BUILD-PLAYBOOK.md`)
**Source:** Figma board, node `24:381`

> **Status (2026-08-04):** whether this full Account section ships alongside the new public "Manage a booking" page, or gets superseded by it, is undecided. See [README.md](README.md#not-built--next-up) and [manage-a-booking.md](manage-a-booking.md). Don't build past a wireframe until that resolves.

## Purpose

View/edit personal info used to prefill bookings ([booking-details-extras.md](booking-details-extras.md) "Prefill from Profile" branch).

## Entry points

- Account nav, signed in.
- Redirect target after sign-up.

## Page flow

1. **Personal info form** — name, phone, email.
2. **Security** — change password, change email (Supabase confirmation flow applies to email changes).
3. **Sign out.**

## Data captured

| Field | Notes |
|---|---|
| Name, phone | Used to prefill booking details |
| Email | Change triggers Supabase re-verification |
| Password | Change requires current password or reset flow |

## Exit points

- Nav → [account-booking-history.md](account-booking-history.md).
- Save → inline confirmation toast, stays on page.

## Edge cases

- Email change with unconfirmed new address → keep old email active for login until confirmed.

## Constraints

- RLS scoped to `auth.uid()` — a profile is only readable/writable by its owner (`docs/PROJECT-BRIEF.md` Security requirements).

## Open questions

- None.
