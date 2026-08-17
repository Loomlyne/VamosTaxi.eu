# Dashboard connections — booking history

**Screen:** `app/bookings.dc.html`
**Who uses it:** signed-in customer
**Status today:** fixture list (`Upcoming (N)` / `Past (N)` tabs per the i18n dictionary's pattern entries) — no live data

## 1. What the screen shows

- Two tabs: Upcoming / Past, each a list of `BookingRow`s (route, date, vehicle class, `StatusBadge`, fare).
- Empty state ("Nothing booked yet") when the customer has no trips.
- Each row links to `booking-detail.dc.html?id=...`.
- "Show N more" pagination pattern (see the dictionary's `Show (\d+) more` / `Showing X of Y bookings` patterns — this screen paginates rather than infinite-scrolling).

## 2. Data need

Purely a read/list screen — no edits happen here directly (edits happen on `booking-detail`/`manage-booking`). The only interactive state is the tab and the pagination cursor.

## 3. Proposed API / RPC surface

- `GET /api/bookings?scope=upcoming|past&cursor=&limit=` — `scope` splits on `pickup_at >= now()` vs. `< now()`, both ordered and scoped to `customer_id = auth.uid()` under RLS. No new tables beyond `bookings` (see `SPEC-ops-board.md` §4).
- If a guest booking exists under the same email as a newly-created account, the sign-up flow's "we found N bookings under this email and added them to your account" behaviour (already a dictionary string) needs a one-time `UPDATE bookings SET customer_id = ... WHERE email = ... AND customer_id IS NULL` reconciliation — worth a named backend job/RPC rather than ad hoc.

## 4. Open questions

- Page size for "Show N more" — and does it matter for a customer who realistically has a handful of trips a year?
- Guest-to-account reconciliation — by email match alone, or does it require the booking reference too (safer, avoids merging a stranger's trip on a shared inbox)?
