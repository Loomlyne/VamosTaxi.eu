# Dashboard connections — ops coming-soon

**Screen:** `app/ops-coming-soon.dc.html`
**Purpose:** catches every `OpsSidebar` nav item without a real screen yet (`Calendar`, `Drivers`, `Customers`, `Coupons`, `Settings`), reads a `?section=` (or `[section]`) param and states which one is pending.

## Not a screen to wire up — a router fallback

Nothing to connect here directly. As each real screen gets built, remove its entry from `OpsSidebar`'s nav config array (see `design_handoff_file_architecture/README.md` §3 — "OpsSidebar nav is one config array... items without a real screen route to the coming-soon placeholder") and point it at the new route instead. When every item has a real destination, this file and its route can retire.

## Screens it currently stands in for, and their eventual shape

- **Calendar** — a day/week view of bookings by pickup time; probably reuses the `bookings` table filtered/grouped by date, no new schema.
- **Drivers** — CRUD on the `drivers` table from `SPEC-ops-board.md` §4, plus availability toggling.
- **Customers** — read (and limited edit) view over the `customers` table; likely needs a booking-history join per customer.
- **Coupons** — a `coupons` table (code, discount type/amount, validity window, usage cap, redemption count) plus a redemption check in the pricing/checkout flow.
- **Settings** — dispatcher-facing config: which nav items are live, notification preferences, maybe the pricing-rule defaults from `SPEC-ops-pricing.md`.
