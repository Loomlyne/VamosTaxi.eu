# Dashboard connections — booking detail (ops)

**Screen:** `app/ops-detail.dc.html`
**Who uses it:** signed-in dispatcher, reached from the board
**Status today:** one fixture booking, in-memory state only — nothing persists on reload

## 1. What the screen shows

- Header: reference, `StatusBadge`, pickup time countdown.
- Tabs: Overview / Timeline / Payment (exact tab set — confirm against the live file).
- `RouteSummary` (pickup, drop-off, distance/eta), `PriceSummary` (fare breakdown, paid/outstanding), vehicle + passenger/bag counts.
- Driver panel: assigned driver card, or an **Assign driver** action opening a list + confirm dialog.
- Conditional `Alert`s: outstanding balance, refund due, flight delay.
- A dispatcher note field (free text, internal — never shown to the customer).
- Action row with a toast on success (assign, cancel, mark completed, refund).

## 2. What a dispatcher needs to edit here

- Assign / reassign a driver (list filtered to the booking's vehicle class and available status).
- Change status along the lifecycle (see `StatusBadge` states in the design system guide §4).
- Record/trigger a refund (amount, reason) — needs a real Stripe refund call, not just a status flip.
- Write or edit the dispatcher note.
- Resend the confirmation email (Resend).
- Edit the flight number if the customer calls in a change dispatch-side.

## 3. Proposed data model additions (beyond `bookings` in the board spec)

```
booking_events                       -- the Timeline tab
  id, booking_id fk, type (created|paid|assigned|driver_enroute|completed|cancelled|refunded|note),
  actor (system|dispatcher:<id>|customer), message, created_at

refunds
  id, booking_id fk, amount, reason, stripe_refund_id, status (pending|succeeded|failed), created_at
```

`bookings.notes_dispatch`, `driver_id`, `status` cover the rest (see board spec §4).

## 4. Proposed API / RPC surface

- `GET /api/ops/bookings/:id` — full detail incl. joined driver, customer, event history.
- `PATCH /api/ops/bookings/:id` — status change, driver assignment, note edit (each probably its own narrower endpoint so an audit event is written server-side, not left to the client to remember).
- `POST /api/ops/bookings/:id/assign-driver` `{driver_id}`
- `POST /api/ops/bookings/:id/refund` `{amount, reason}` → calls Stripe, writes `refunds` + a `booking_events` row.
- `POST /api/ops/bookings/:id/resend-confirmation`
- `GET /api/ops/drivers?vehicle_class=&status=available` — the assign-driver list.

## 5. Open questions

- Exact status lifecycle transitions a dispatcher may trigger by hand vs. ones that are system-only (e.g. `paid` should only ever come from a Stripe webhook, never a manual click).
- Partial refunds — amount is free-entry or constrained to the cancellation-policy tiers?
- Does reassigning a driver mid-trip need a customer notification (SMS/email), and is that in V1?
