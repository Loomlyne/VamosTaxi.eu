# Services — City to City

**Route (proposed):** `/services/city-to-city`
**Nav path:** Home "Services Section" or global nav "Services" → **this page**
**Milestone:** M004 S03 (`docs/BUILD-PLAYBOOK.md`)
**Source:** Figma board, node `24:396`

## Purpose

Landing page for inter-city / private transfers within Switzerland (`docs/PROJECT-BRIEF.md` "City-to-city/private transfers"), positioned as longer, calculated-distance trips vs the airport wedge.

## Entry points

- Home "Services Section."
- Global nav "Services."
- SEO shell landing.

## Page flow

1. **Hero** — city-to-city / private transfer framing, comfort and luggage capacity emphasis for longer trips.
2. **Trust bullets** — fixed price at booking (calculated-route pricing, `docs/PROJECT-BRIEF.md` pricing engine), professional driver, door-to-door.
3. **Booking widget embed** — prefilled `service=city-to-city`, no fixed origin (unlike airport, this is any-city-to-any-city within the service area).
4. **Popular routes** (optional) — links into [services-fixed-route-template.md](services-fixed-route-template.md) instances if any city pairs are configured as fixed routes.
5. **Why Vamos** recap (reuse of Home section).
6. **FAQ** — city-to-city specific (multi-stop, luggage limits).
7. Repeated CTA into the booking widget.

## Data captured

Same as [booking-details-extras.md](booking-details-extras.md) once engaged.

## Exit points

- → Home booking widget / [booking-details-extras.md](booking-details-extras.md), `service=city-to-city` context carried through.

## Edge cases

- Destination outside configured service zones (`service_zones` per `docs/PROJECT-BRIEF.md` data model) → widget should reject or flag before quoting, not after checkout.

## Constraints

- Swiss local operator only, not a multi-country product (`docs/DECISIONS.md` #6).

## Open questions

- None.
