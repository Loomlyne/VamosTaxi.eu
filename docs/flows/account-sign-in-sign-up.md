# Account — Sign In and Sign Up

**Route (proposed):** `/account/sign-in`, `/account/sign-up` (or one page, tab-toggled)
**Nav path:** Global nav "Account" (signed out) → **this page**
**Milestone:** M002 S03 (`docs/BUILD-PLAYBOOK.md`)
**Source:** Figma board, node `24:378`

## Purpose

Auth entry point on top of Supabase Auth. Not a gate — guest checkout bypasses this entirely (`docs/DECISIONS.md` #10).

## Entry points

- Global nav "Account" while signed out.
- "Create account" branch inside [booking-details-extras.md](booking-details-extras.md) (inline variant, same underlying auth call, different surface).
- "Sign in" CTA surfaced after a guest tries to claim a booking with an email that already has an account.

## Page flow

1. **Sign In / Sign Up toggle.**
2. **Sign In** — email + password (or magic link, method not yet locked, see Open questions) → "Forgot password" link → reset flow.
3. **Sign Up** — email + password (or magic link) → creates `profiles` row (`docs/PROJECT-BRIEF.md` data model).
4. On success → redirect to whatever triggered sign-in (return-to url) if present, else → [account-profile.md](account-profile.md) for new sign-ups or [account-booking-history.md](account-booking-history.md) for returning users.

## Data captured

| Field | Notes |
|---|---|
| Email | Primary identifier |
| Password or magic-link request | Method TBD |

## Exit points

- Success → Profile (new) / Booking History (returning) / original return-to context.
- "Forgot password" → reset email sent screen.

## Edge cases

- Sign-up with an email that already has guest bookings but no account → should those auto-attach by email match, or only via the explicit claim link in [booking-confirmation.md](booking-confirmation.md)? Flagged below, needs a product decision.
- Sign-up with an email that already has an account → surface "sign in instead."

## Constraints

- Supabase Auth is the confirmed provider (`docs/DECISIONS.md` #9); no third-party auth vendor.
- RLS on `profiles` and all customer tables (`docs/PROJECT-BRIEF.md` Security requirements).

## Open questions

- Password vs magic link vs both — open in `docs/DECISIONS.md` "Recommended but awaiting confirmation."
- Should a fresh sign-up auto-attach prior guest bookings under the same email, or is the emailed claim link the only path? Not addressed in SOW/PROJECT-BRIEF — worth a one-line decision before M002 S03.
