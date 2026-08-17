# Dashboard connections — ops board (dispatch)

**Screen:** `app/ops-board.dc.html` (+ `app/OpsSidebar.dc.html`, shared by every `ops-*` screen)
**Who uses it:** signed-in dispatcher, desktop-primary
**Status today:** static fixture rows (`VT-0001`, `00:00`, `CHF 000`) — no live data, no backend calls

## 1. What the screen shows

- Sticky charcoal sidebar (`OpsSidebar`): nav items `Board`, `Calendar`, `Drivers`, `Customers`, `Coupons`, `Pricing`, `Settings` — only Board, Pricing and a shared coming-soon route are real today.
- Four `StatTile` KPIs above the table (today's bookings, awaiting confirmation, in progress, revenue-style figure — exact four TBC with the client).
- A search + filter `Tag` row (status, date range, vehicle class) and a **New booking** button.
- The bookings `Table`: reference, route (pickup → drop-off), pickup time, vehicle class, customer name, `StatusBadge`, fare, row actions (`ellipsis` menu).
- Selecting a row opens `ops-detail.dc.html` for that booking id.

## 2. What a dispatcher needs to edit here

- Change the filter/search state (client-side is enough, but large data sets will want server-side filtering — see 4).
- Sort by column (pickup time default).
- Bulk-select rows for an action (assign driver, cancel) — **not built yet**; today only per-row navigation to detail exists.
- Trigger **New booking** — opens a manual-entry flow for a phone/email booking; no screen exists for this yet.

## 3. Real-time behaviour this table needs

A dispatcher board is only useful if it reflects reality without a manual refresh: a new booking, a payment landing, or another dispatcher assigning a driver should appear within a couple of seconds. Plan on Supabase Realtime (Postgres logical replication) subscribed to the `bookings` table, not polling.

## 4. Proposed data model (Postgres / Supabase)

```
bookings
  id                uuid pk
  reference          text unique          -- "VT-4821" display form, generated
  status             text                 -- quote|pending|paid|confirmed|assigned|completed|cancelled|refunded|no_show
  vehicle_class      text                 -- economy|business|van (fk-ish to vehicle_classes.id)
  pickup_address     text
  pickup_lat/lng     numeric
  dropoff_address    text
  dropoff_lat/lng    numeric
  pickup_at          timestamptz
  passenger_count    int
  bag_count          int
  flight_number      text nullable
  customer_id        uuid fk -> customers.id
  driver_id          uuid fk -> drivers.id, nullable
  fare_amount        numeric              -- minor units; CHF 000 in every mock until pricing lands
  currency           text default 'CHF'
  paid_at            timestamptz nullable
  notes_driver       text nullable        -- "for the driver" field on booking-detail
  notes_dispatch     text nullable        -- internal dispatcher note (ops-detail)
  created_at / updated_at   timestamptz

drivers
  id, name, phone, vehicle_class, vehicle_plate, status (available|on_trip|off), active boolean

customers
  id, name, email, phone, auth_user_id fk -> Supabase auth.users, created_at

vehicle_classes
  id, name, max_pax, max_bags, example_vehicle_text   -- the A13 token set in LEGAL-PLACEHOLDER-CHECKLIST.md
```

## 5. Proposed API / RPC surface

- `GET /api/ops/bookings?status=&from=&to=&q=` — paginated board rows (or a Supabase view + RLS-scoped `select` direct from the client, since dispatchers are one internal role).
- `GET /api/ops/stats/today` — the four KPI numbers, or compute client-side from a realtime-subscribed slice.
- `POST /api/ops/bookings` — manual booking entry (New booking button).
- Realtime channel on `bookings` (insert/update) scoped to a rolling window (e.g. next 14 days) so the subscription doesn't replay the whole table.

## 6. Open questions

- The four KPI tiles — which four numbers, and over what window (today vs. rolling 24h)?
- Is dispatcher role-based auth a single shared "ops" role, or per-dispatcher accounts with an audit trail on who assigned which driver?
- Bulk actions on the board (multi-select assign/cancel) — in scope for V1 or a fast-follow?
