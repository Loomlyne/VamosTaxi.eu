# Manage a Booking

**Route (proposed):** `/manage-booking`
**Nav path:** Public — linked from footer (every page), confirmation, cancellation policy page (×2), contact, terms, FAQ
**Status:** **Not built** — next up per Claude Design (2026-08-04)
**Source:** Claude Design spec, relayed 2026-08-04 (not on the original Figma board — this is a newer, broader design than the account-nested version drafted earlier)

## Relationship to the Account section

This page is public and lookup-gated — no sign-in required. It overlaps heavily with [account-booking-detail.md](account-booking-detail.md) and [account-manage-cancel.md](account-manage-cancel.md), which were drafted earlier assuming booking management lived under `/account/` (plus a token-link fallback for guests). Whether the full authenticated Account section (sign-in/up, profile, persistent history) still ships alongside this, or gets superseded by it, is **undecided** — see [README.md](README.md#not-built--next-up). Until that's resolved, build against *this* spec first — it's the more current one and the one Claude Design has already designed for.

## Purpose

Single self-serve entry point for anyone — guest or account holder — to find and manage a booking without needing to be signed in.

## Entry points

- Footer link, present on every page.
- Confirmation page.
- Cancellation policy page (two separate links).
- Contact page.
- Terms page.
- FAQ.

## Page flow

1. **Lookup gate** — booking reference + email/last name, OR a magic link from the confirmation email. Resolves to one specific booking without a session.
2. **View booking** — route, date/time, vehicle class, passengers/bags, price paid, status.
3. **Change pickup date/time** — subject to a modification-deadline rule (threshold value pending — see Open questions). Scope is narrow: date/time only, not route or vehicle class.
4. **Cancel booking** — runs the refund-share logic from the Cancellation Policy page (24h full-refund window; partial/no-show shares below that — exact tiers still open, legal-checklist items A2/A13). Refund **execution is always admin-reviewed** (locked 2026-08-04): this page computes and displays the entitled share, a human executes the actual Stripe refund from the admin dashboard.
5. **Re-download the voucher / resend confirmation email.**
6. **Add/edit flight number** for airport transfers.
7. **Fallback** — "call us with your reference" for anything the self-serve flow can't do.

## Data captured

| Field | Notes |
|---|---|
| Booking reference + email/last name, or magic-link token | Lookup credentials, no account/session created |
| New pickup date/time | Only if inside the modification-deadline window |
| Cancellation reason | Optional |

## Exit points

- Successful modify → updated booking view, same page.
- Cancel → booking marked cancelled, refund share flagged for admin, customer notified by email.
- Anything else → "call us" fallback with the booking reference pre-filled/displayed.

## Edge cases

- Wrong reference/email combination → generic "not found," don't reveal which part was wrong (avoid enumeration of valid booking references or registered emails).
- Modify attempted past the deadline → blocked with a policy message, falls through to cancel or contact-us.
- Cancel past the free-refund window → show the partial/no-refund share *before* asking for final confirmation, not after.
- Lookup succeeds for a booking that's already completed/cancelled → read-only view, no modify/cancel actions.

## Constraints

- Refund execution is always admin-reviewed, never auto-issued by this page (locked 2026-08-04, applies platform-wide per [account-manage-cancel.md](account-manage-cancel.md)).
- Exact refund-share percentages (A2/A13) and the modification-deadline threshold live in the legal checklist, which is in Claude Design's workspace, not this git repo — don't invent numbers here; ask for the actual values when building this for real.
- Lookup must not be brute-forceable (rate-limit the reference+email/last-name combination).

## Open questions

- Modification-deadline threshold value — pending client/legal-checklist input.
- Refund-share tiers/percentages (checklist A2/A13) — pending, not in this repo; ask the user to paste the relevant checklist items when this gets built.
- Does this page replace [account-booking-detail.md](account-booking-detail.md) / [account-manage-cancel.md](account-manage-cancel.md) outright, or do both exist? Undecided (2026-08-04).
