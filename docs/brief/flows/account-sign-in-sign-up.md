# Account — Sign In and Sign Up

**Route (proposed):** `/account/sign-in`, `/account/sign-up` (or one page, tab-toggled)
**Nav path:** Global nav "Account" (signed out) → **this page**
**Milestone:** M002 S03 (`docs/BUILD-PLAYBOOK.md`)
**Source:** Figma board, node `24:378`

> **Status (2026-08-04):** whether this full Account section ships alongside the new public "Manage a booking" page, or gets superseded by it, is undecided. See [README.md](README.md#not-built--next-up) and [manage-a-booking.md](manage-a-booking.md). Don't build past a wireframe until that resolves.

## Purpose

Auth entry point on top of Supabase Auth. Not a gate — guest checkout bypasses this entirely (`docs/DECISIONS.md` #10).

## Entry points

- Global nav "Account" while signed out.
- "Create account" branch inside [booking-details-extras.md](booking-details-extras.md) (inline variant, same underlying auth call, different surface).
- "Sign in" CTA surfaced after a guest tries to claim a booking with an email that already has an account.

## Page flow

1. **Sign In / Sign Up toggle.**
2. **Sign In** — email + password, or magic link (both offered, user's choice — locked 2026-08-04) → "Forgot password" link (password path only) → reset flow.
3. **Sign Up** — email + password, or magic link → creates `profiles` row (`docs/PROJECT-BRIEF.md` data model).
4. On success → redirect to whatever triggered sign-in (return-to url) if present, else → [account-profile.md](account-profile.md) for new sign-ups or [account-booking-history.md](account-booking-history.md) for returning users.

## Data captured

| Field | Notes |
|---|---|
| Email | Primary identifier |
| Password or magic-link request | Both supported; user picks per session |

## Exit points

- Success → Profile (new) / Booking History (returning) / original return-to context.
- "Forgot password" → reset email sent screen.

## Edge cases

- Sign-up with an email that already has guest bookings but no account → **auto-attaches by verified email match** (locked 2026-08-04) — Supabase confirms the email at signup, so matching guest bookings get attached automatically, in addition to the explicit claim link in [booking-confirmation.md](booking-confirmation.md).
- Sign-up with an email that already has an account → surface "sign in instead."

## Constraints

- Supabase Auth is the confirmed provider (`docs/DECISIONS.md` #9); no third-party auth vendor.
- RLS on `profiles` and all customer tables (`docs/PROJECT-BRIEF.md` Security requirements).
- Auth method: both email+password and magic link, user's choice (locked 2026-08-04).
- Guest booking auto-attach: by verified email match at signup, not claim-link-only (locked 2026-08-04).

## Open questions

- Whether this page ships at all, or "Manage a booking" (see status note above) becomes the only self-serve booking path — undecided.
