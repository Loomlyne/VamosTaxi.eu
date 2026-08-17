# Dashboard connections — customer booking detail

**Screen:** `app/booking-detail.dc.html`
**Who uses it:** signed-in customer, reached from Booking history
**Status today:** one fixture booking (`VT-4821`); the file's own note says "English only this cycle, like the rest of the Account section" and "No backend, no Stripe call, no admin status controls" — deliberately read-only by design (§"Out of scope" block in the file)

## 1. What the screen shows

- Route, date/time, vehicle class, driver note ("for the driver").
- Timeline: New → Confirmed → Driver assigned → Completed, each with a timestamp (or Cancelled / Voucher-shown as terminal states).
- Receipt: trip + price + payment method (masked card), a Print receipt action.
- Values-owed panel when relevant (surcharges, late-cancel share, refund payout time) — currently token-driven per `LEGAL-PLACEHOLDER-CHECKLIST.md`.
- Deliberately no edit controls: flight-number editing, resending the confirmation, and any status control are explicitly out of scope here — those live in `manage-booking.dc.html` (customer self-serve) or `ops-detail.dc.html` (dispatcher).

## 2. What actually needs wiring (read-only)

- `GET /api/bookings/:id` scoped to `customer_id = auth.uid()` — reference, route, timestamps, price breakdown, masked payment method, driver-visible note, current `booking_events` (see `SPEC-ops-detail.md` §3 — this screen reads the same event log dispatch writes to, it just never writes to it).
- Print receipt can be a client-side `window.print()` against a print-styled version of this same data — no server endpoint needed beyond the read above.

## 3. What stays a link out, not a rebuild here

- "Manage or cancel" → `manage-booking.dc.html` (see that spec for the write surface).
- Any admin-only field (dispatcher note, internal status override) is never sent to this screen's API response at all — not just hidden in the UI.

## 4. Open questions

- None on data shape — this screen's own scope note is unusually explicit already. The open question is purely sequencing: it can ship as soon as `GET /api/bookings/:id` exists, independent of `manage-booking`'s write endpoints.
