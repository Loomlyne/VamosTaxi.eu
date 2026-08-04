# Services — Chauffeur by the Hour

**Route (proposed):** `/services/chauffeur-by-the-hour`
**Nav path:** Home "Services Section" or global nav "Services" → **this page**
**Milestone:** Conditional — not confirmed for V1 launch
**Source:** Figma board, node `24:402`

## Status: proceeding, pricing model pending (2026-08-04)

`docs/PROJECT-BRIEF.md` lists this "if approved for launch," and `docs/OFFICE-HOURS-DESIGN.md` Open Questions still has "Hourly chauffeur in V1 yes/no" unresolved as written — but the working signal from this session is that it's moving forward: the client is preparing per-vehicle hourly pricing input for it, not cutting it. Treat this doc as active, with the pricing model itself as the remaining blocker (see below), and land a one-line confirmation in `docs/OFFICE-HOURS-DESIGN.md` when the client input arrives.

## Purpose

Duration-based booking (pickup + N hours) instead of the standard point-to-point pickup/destination model used everywhere else on the site.

## Why this one is structurally different

Every other booking path quotes on **route** (pickup → destination, distance/duration-based or fixed). Hourly chauffeur quotes on **duration** (hours × hourly rate + vehicle multiplier, no fixed destination required). This doesn't fit the standard [booking-details-extras.md](booking-details-extras.md) quote step as-is — it needs its own quote step (pickup point + duration/hours picker instead of pickup + destination), before rejoining the standard details/extras/checkout flow.

## Entry points (if approved)

- Home "Services Section."
- Global nav "Services."

## Page flow (if approved)

1. **Hero** — "book a driver by the hour" framing.
2. **Trust bullets** — flexibility, no fixed destination required.
3. **Duration-quote widget** — pickup point + hours selected (not the standard pickup/destination widget) → price = base + hours × hourly rate + vehicle multiplier.
4. Rejoins the standard flow at [booking-details-extras.md](booking-details-extras.md) (passenger, extras, coupon, checkout) once duration/price is set.
5. **FAQ** — minimum hours, overage handling, extra stops during the booked window.

## Data captured

| Field | Notes |
|---|---|
| Pickup point | No destination required |
| Duration (hours) | Drives price, needs a minimum-hours rule from the client |

**Pricing signal from client (2026-08-04, verbal, not yet formalized):** rate is **per specific vehicle**, not a flat rate per vehicle class — each car may carry its own hourly rate. Client also referenced **per-currency** pricing (not just a CHF rate converted at display time) and pricing that varies **by place**, possibly meaning per-zone or per-city rates. None of this is a locked spec yet — client will send the actual pricing calculator/values later. Do not invent numbers or a schema shape from this — just don't build a rigid single-CHF-rate-per-class assumption into the quote step.

## Exit points

- → [booking-details-extras.md](booking-details-extras.md), with a duration-based price snapshot instead of a route-based one.

## Constraints

- Pricing engine must support an hourly rate model in addition to fixed/calculated routes — this is **not** in the current data model listed in `docs/PROJECT-BRIEF.md` (`pricing_rules`, `fixed_routes` are route-shaped). Needs a schema addition.
- Possible multi-currency / per-vehicle / per-place pricing (see signal above) may not be a chauffeur-only concern — `docs/DECISIONS.md` currently has CHF as the sole (recommended, not yet locked) currency for the whole platform. If the client's calculator does turn out to need multiple currencies, that's a pricing-engine-wide decision, not just this page's — flag it to whoever owns `docs/DECISIONS.md` before scoping the schema.

## Open questions

- Formal go/no-go still not written down anywhere canonical (`docs/OFFICE-HOURS-DESIGN.md` still says unresolved) even though the working signal is "proceeding" — worth a one-line update once the client's pricing input lands.
- Exact pricing calculator: per-vehicle rates, currency list, place/zone variation, minimum hours, overage handling — all pending client input.
- Whether this needs its own `hourly_rates` table, and whether currency handling needs to be added platform-wide.
