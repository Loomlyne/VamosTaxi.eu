# Dashboard connections — pricing rules (ops)

**Screen:** `app/ops-pricing.dc.html`
**Who uses it:** signed-in dispatcher/admin
**Status today:** placeholder rows, `CHF 000` throughout — the fare matrix is S7's biggest open client input

## 1. What the screen shows

- A rules table: route or zone, vehicle class, base fare, per-km rate, surcharges (airport, night, ski-season).
- Presumably a form or row-edit for each rule.

## 2. What an admin needs to edit here

- Create/edit/archive a pricing rule (route or zone × vehicle class).
- Set surcharge amounts and their active windows (e.g. ski season Dec–Apr).
- See which rule a given past booking priced against (for support/dispute resolution).

## 3. Proposed data model

```
pricing_rules
  id, vehicle_class_id fk, zone_or_route text, base_fare numeric, per_km_rate numeric,
  active_from date nullable, active_to date nullable, created_by, created_at, updated_at

surcharges
  id, name, applies_to (airport|night|ski_season|custom), amount numeric, window_start, window_end
```

`bookings.fare_amount` should also carry `pricing_rule_id` (nullable) so a historical booking's price is traceable even after the rule changes later.

## 4. Proposed API / RPC surface

- `GET/POST/PATCH/DELETE /api/ops/pricing-rules`
- `GET/POST/PATCH/DELETE /api/ops/surcharges`
- A pure pricing function (`quote(pickup, dropoff, vehicle_class, pickup_at) -> fare`) that both the customer-facing quote widget and this admin screen call, so the two are never allowed to compute a fare two different ways.

## 5. Open questions

- This is entirely blocked on the client supplying the real fare matrix (§7 of the design system guide) — the schema above is a reasonable shape to build against once numbers exist, not a request to invent numbers now.
- Who is allowed to edit pricing — every dispatcher, or an admin-only role distinct from dispatch?
