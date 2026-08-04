# Booking Flow — Details & Extras

**Route (proposed):** `/book/details`
**Nav path:** Home booking widget (or Service page) → vehicle selected → **this page**
**Milestone:** M002 S01–S03 (`docs/BUILD-PLAYBOOK.md`)
**Source:** Figma "Customer Site Map and Booking Flow" board, node `12:373` onward

## Purpose

Capture passenger + trip details, resolve identity (guest vs account), apply coupon, and get the customer to a confirmed final price before Stripe.

## Entry points

- Home booking widget: pickup/destination set → date/time/passengers set → vehicle class selected ("select class")
- Service landing pages (Airport Transfers, City to City, Corporate, Chauffeur, Fixed Route) with route/service prefilled

## Page flow

1. **Trip summary recap** (persistent sidebar or top card) — route, date/time, vehicle class, running price. Carries return-journey toggle state from the widget.
2. **Passenger info** — name, phone, email (skipped/prefilled if signed in).
3. **Flight number** — optional field. If arrived here via the home widget with flight number already entered, this is prefilled (widget autofills pickup/time from flight number; this step just confirms it).
4. **Extras** — child seats, extra stops, etc., only the ones configured for the selected vehicle class/capacity.
5. **Identity fork — "Signed in?"**
   - **Yes** → prefill contact fields from profile → skip to step 7.
   - **No** → **"Guest or account?"**
     - **Guest** → email-only capture, no password.
     - **Create account** → inline email + password (or magic link) capture.
6. **Confirm Contact Details** — both branches land here before continuing.
7. **Coupon code** (optional field) — **"Coupon valid?"**
   - Valid → "Discount Applied", total updates.
   - No code entered → skip straight to review.
   - Rejected → inline error, "Re-enter" loops back to the same field (does not block the rest of the page).
8. **Review Final Total** — full breakdown per the pricing formula in `docs/PROJECT-BRIEF.md` (base + distance + surcharges + vehicle multiplier + extras − discount). This exact breakdown is what gets snapshotted on the booking.
9. CTA → **Checkout** ([booking-checkout.md](booking-checkout.md)).

## Data captured

| Field | Required | Notes |
|---|---|---|
| Passenger name, phone, email | Yes (email optional if signed in and on file) | |
| Flight number | No | Drives driver meet-and-greet, not automated flight tracking (out of scope, see `docs/DECISIONS.md`) |
| Extras | No | Filtered by vehicle capacity rules |
| Guest email / account credentials | Yes, one path | Guest checkout is a locked decision, do not force account creation |
| Coupon code | No | Server-validated, never trust client-side discount math |

## Exit points

- Primary: → Checkout, with a locked price snapshot and resolved identity (guest email or account id).
- Back: → vehicle selection (price panel), if user edits trip basics.

## Edge cases

- Passenger/luggage count exceeds selected vehicle capacity → block progress, prompt to pick a different class (validation rule from `docs/SCOPE-OF-WORK.md` §4.3).
- Booking time inside minimum-advance-booking window → block with explicit message (policy value pending client input, `docs/INPUTS-NEEDED.md`).
- Coupon rejected repeatedly → no lockout needed for V1, just re-enter.
- User signs in mid-flow (from guest state) → merge in profile data without losing entered trip details.

## Constraints

- Guest checkout allowed for conversion; claim-into-account happens post-payment via email link, not here (`docs/DECISIONS.md` #10).
- No live flight-status integration in V1 — field is just data capture (`docs/PROJECT-BRIEF.md` out-of-scope list).
- Price shown here must be server-calculated, not computed in the browser (`docs/SCOPE-OF-WORK.md` §4.3).

## Open questions

- Exact auth method (password vs magic link vs both) — not locked in `docs/DECISIONS.md`, only "Supabase Auth" is confirmed.
