# Services — Airport Transfers

**Route (proposed):** `/services/airport-transfers`
**Nav path:** Home "Services Section" or global nav "Services" → **this page**
**Milestone:** M004 S03 (SEO shells) + M001 booking widget reuse (`docs/BUILD-PLAYBOOK.md`)
**Source:** Figma board, node `24:393`

## Purpose

Service-specific landing page for Zurich-first airport transfers — the primary product wedge (`docs/OFFICE-HOURS-DESIGN.md` "Narrowest wedge"). Converts into the same booking widget as Home, prefilled for this service.

## Entry points

- Home "Services Section."
- Global nav "Services" → this is the first/primary item.
- Paid or organic search landing (SEO shell, `docs/SCOPE-OF-WORK.md` §4.2).

## Page flow

1. **Hero** — "Zurich Airport ↔ anywhere in Switzerland" framing, fixed price + driver-waits promise.
2. **Trust bullets** — fixed price confirmed at booking, flight number captured for meet-and-greet timing (not live flight tracking — that's out of scope, `docs/PROJECT-BRIEF.md`), professional driver.
3. **Booking widget embed** — same component as Home, prefilled with `service=airport-transfer`.
4. **Example fixed-route prices** — table linking into individual [services-fixed-route-template.md](services-fixed-route-template.md) instances for popular airport routes.
5. **How it works** recap (reuse of Home section content).
6. **FAQ** — airport-specific (e.g. "what if my flight is delayed?" → answer driven by the booking policy, not live tracking).
7. Repeated CTA into the booking widget.

## Data captured

Same as [booking-details-extras.md](booking-details-extras.md) once the widget is engaged — this page itself only captures the initial pickup/destination/flight prefill context.

## Exit points

- → Home booking widget / [booking-details-extras.md](booking-details-extras.md), with `service=airport-transfer` context carried through.

## Edge cases

- No fixed routes configured yet for a given airport pair → widget falls back to calculated pricing, page should not imply a fixed price it can't show.

## Constraints

- Flight number is data capture only, no automated flight-status integration in V1 (`docs/PROJECT-BRIEF.md` out-of-scope list).

## Open questions

- None beyond the general fixed-route data dependency in [services-fixed-route-template.md](services-fixed-route-template.md).
