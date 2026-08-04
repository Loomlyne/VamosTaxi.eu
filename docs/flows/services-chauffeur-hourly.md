# Services — Chauffeur by the Hour

**Route (proposed):** `/services/chauffeur-by-the-hour`
**Nav path:** Home "Services Section" or global nav "Services" → **this page**
**Milestone:** Conditional — not confirmed for V1 launch
**Source:** Figma board, node `24:402`

## Status: conditional

`docs/PROJECT-BRIEF.md` lists this "if approved for launch," and `docs/OFFICE-HOURS-DESIGN.md` Open Questions still has "Hourly chauffeur in V1 yes/no" unresolved. Treat this doc as a spec-in-waiting, not a committed build item, until that's confirmed.

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

## Exit points

- → [booking-details-extras.md](booking-details-extras.md), with a duration-based price snapshot instead of a route-based one.

## Constraints

- Pricing engine must support an hourly rate model in addition to fixed/calculated routes — this is **not** in the current data model listed in `docs/PROJECT-BRIEF.md` (`pricing_rules`, `fixed_routes` are route-shaped). Needs a schema addition if approved.

## Open questions

- Is this in V1 at all? (`docs/OFFICE-HOURS-DESIGN.md` open question, unresolved as of this writing.)
- If yes: minimum booking hours, overage/extension handling, and whether it needs its own `hourly_rates` table.
