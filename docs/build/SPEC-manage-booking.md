# Dashboard connections — manage a booking (self-serve)

**Screen:** `app/manage-booking.dc.html`
**Who uses it:** guest (via emailed link) or signed-in customer
**Status today:** fixture booking, refund-tier copy driven by `data-tok` placeholders (free/late/no-show shares are pending client decisions, see `LEGAL-PLACEHOLDER-CHECKLIST.md` A2)

## 1. What the screen shows

- The booking summary (route, time, vehicle, price).
- A live countdown to pickup, which drives which tier of the cancellation policy applies (`earlyTier` / `lateTier` in the file's own state names).
- The refund amount and share the customer would get back *right now*, computed from that countdown against the cancellation-policy windows.
- Change vs. cancel actions.

## 2. What a customer needs to edit here

- **Cancel** the booking — with the refund share shown *before* they confirm, never after.
- **Change** time/address/passenger count/vehicle class up to the modification deadline (per `docs/SPEC-*` and the cancellation policy §"Changing a booking") — beyond that deadline the UI should say so and route to a call, not silently accept the edit.
- Guest access is by a one-time link token (no password); a signed-in customer reaches the same screen from Booking history.

## 3. Proposed data model additions

```
booking_access_tokens                 -- the "manage-booking link in your confirmation email"
  id, booking_id fk, token (opaque, unguessable), expires_at, used_at nullable
```

The refund-tier logic itself is pure computation (pickup_at − now(), compared against the cancellation policy's windows and shares) — those windows/shares belong in a small config table or even constants, NOT hardcoded per-screen, since `cancellation.dc.html`'s legal copy and this screen's live computation must always agree (this is exactly the "one document, one answer" rule the cancellation page states about itself).

```
cancellation_policy                   -- singleton-ish config row, or a versioned table if it ever needs history
  free_cancel_window_hours, full_refund_share, partial_refund_share,
  large_vehicle_seats, large_vehicle_window_hours, modification_deadline_hours
```

## 4. Proposed API / RPC surface

- `GET /api/manage-booking?token=...` (guest) or `GET /api/manage-booking/:id` (signed-in) — booking + a server-computed `refund_preview` (amount, share, tier), so the client never re-derives money math from raw policy numbers itself.
- `POST /api/manage-booking/:id/cancel` `{token?}` → cancels, triggers the Stripe refund for the computed share, writes a `booking_events` row, sends a confirmation email (Resend).
- `POST /api/manage-booking/:id/modify` `{pickup_at?, pickup_address?, dropoff_address?, passenger_count?, bag_count?, vehicle_class?}` → re-quotes the fare, charges/refunds the difference, only accepted before the modification deadline.

## 5. Open questions

- The refund-tier numbers themselves are the actual blocker (A2 in the checklist) — the computation shape above is ready to receive real numbers, not a request to guess them.
- Does a **change** that crosses into a different vehicle class re-run the full quote engine (`SPEC-ops-pricing.md`), or only scale the existing fare?
- Token expiry for the guest link — does it expire only after the trip, or on a fixed duration regardless of pickup date?
