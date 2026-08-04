# Services — Fixed Route Page (template)

**Route (proposed):** `/routes/[slug]` (e.g. `/routes/zurich-airport-to-interlaken`)
**Nav path:** Linked from Services pages, Home, and search — one template, many generated instances
**Milestone:** M004 S03, "Airport/route SEO shells" (`docs/BUILD-PLAYBOOK.md`)
**Source:** Figma board, node `24:405` ("Fixed Route Pages," plural by design)

## Purpose

One reusable template rendering many programmatic SEO pages, one per configured fixed route (`docs/PROJECT-BRIEF.md` "Reusable destination and fixed-route SEO pages"; `docs/SCOPE-OF-WORK.md` §4.2 "SEO pages... initial set for key Swiss routes once Client lists them").

## Entry points

- Service pages (Airport Transfers, City to City) link to their relevant route instances.
- Organic search.
- Home, if a route is featured.

## Page flow (per instance)

1. **Route-specific hero** — "From [A] to [B]," distance/duration facts.
2. **Fixed price table by vehicle class** — pulled from the `fixed_routes` record for this A→B pair (`docs/PROJECT-BRIEF.md` data model). This overrides calculated pricing (`docs/PROJECT-BRIEF.md` Pricing engine, "Fixed routes").
3. **Route map preview** (Mapbox, static or light interactive) — planned route only, no live tracking (`docs/DECISIONS.md` #13).
4. **Generic trust content** — reused blocks (why Vamos, reviews) shared across all instances.
5. **FAQ** — can be generic or route-specific.
6. CTA → booking widget, prefilled with this route's pickup/destination and fixed-route id.

## Data captured

Same as [booking-details-extras.md](booking-details-extras.md) once engaged; this page's own "data" is really its render input, not user input:

| Input | Source |
|---|---|
| Pickup/destination pair | `fixed_routes` table |
| Price per vehicle class | `fixed_routes` table |
| Distance/duration | Mapbox directions or stored on the route record |

## Exit points

- → Home booking widget / [booking-details-extras.md](booking-details-extras.md), with pickup, destination, and `fixed_route_id` prefilled so the quote step skips straight to a fixed price.

## Edge cases

- Route configured but price stale/missing for a vehicle class → that class should not show as bookable on this page rather than showing a wrong price.

## Constraints

- Content and price for every instance come from client-supplied data — this is a **blocking input**: "Vehicle classes... Pricing: ...fixed routes list" (`docs/SCOPE-OF-WORK.md` §7.1). The template can be built before the data arrives; individual pages cannot go live without it.
- Fixed-route pricing always overrides calculated pricing for that pair (`docs/PROJECT-BRIEF.md`).

## Open questions

- Final list of routes to launch with — blocked on client input (`docs/INPUTS-NEEDED.md`).
