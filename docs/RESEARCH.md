# Research Summary

## Existing website

Source: [vamostaxi.eu](https://www.vamostaxi.eu/)

The current public site already communicates airport/private transfer services and contains a booking interface with place search. Its presentation and booking UX are dated relative to premium transfer competitors. The rebuild should preserve valid business content and routes while replacing the visual system, booking flow and operational backend.

Production market details must be confirmed from the business rather than inferred from the design agency or brand-guide contact information.

## Competitor reference

Source: [Transfeero](https://www.transfeero.com/en/)

Useful patterns:

- Booking widget above the fold
- Transfer and hourly-service modes
- Pickup, destination, date, time, passengers and return journey
- Vehicle cards and transparent quote progression
- Clear three-step explanation
- Reviews and trust signals
- Popular destination and route pages
- Premium imagery
- Strong mobile flow

Do not reproduce:

- Global supply marketplace
- Worldwide partner and affiliate systems
- Automatic driver matching
- Driver wallets and payouts
- Continuous tracking
- Native apps
- Large-scale international support infrastructure

## Brand guide

Source: `assets/brand/Brand Guideline VAMOS TAXI.pdf`

Direction:

- Premium yellow and charcoal identity
- Confident, high-contrast layouts
- Premium chauffeur and airport-transfer positioning

Issues requiring resolution:

- Two competing taglines: “Where every ride is first class” and “Ride with class.”
- Qurova, DM Sans and Poppins appear without a fully clear hierarchy.
- A neutral colour is described as `#DEDEDE`, while another displayed value is `#D4632B`, which is orange.
- One mockup contains unrelated French copy: “Ta pause fraîcheur après chaque effort.”
- The premium positioning is visually strong but the written promise remains generic.

Proposed concrete promise:

> Reliable, fixed-price airport and corporate rides booked in under one minute.

## Open-source feature research

Repositories were searched using the required workflow rather than broad taxi-app naming:

- pickup and destination
- flight number
- passengers and luggage
- vehicle classes
- return journeys and child seats
- fixed routes
- minimum fare and price per kilometre
- Stripe
- booking states
- driver and vehicle assignment
- admin dashboard
- Next.js, TypeScript and Supabase
- MIT licensing

### VTC_MVP

Closest feature match: Supabase, Stripe, fixed-route and per-km pricing, vehicle categories, passengers/luggage, drivers, refunds, RLS and dashboard.

Do not copy commercially without licence clarification. GitHub identifies MIT, but its README says the project is private/proprietary and its licence attribution is inconsistent. Its own testing-gap document indicates critical booking, Stripe, pricing and security tests are unfinished.

### Aurel Transfer

MIT Next.js work-in-progress containing a multi-step transfer flow, route/time, vehicle selection, extras, passenger details, city pages and SEO. Supabase and Stripe are planned rather than implemented, pricing is mocked and no admin dashboard exists.

A local production build was attempted and failed on lint/type-quality gates:

```text
serviceType is assigned but never used
vehicleOptions is assigned but never used
React is not defined
```

Useful as UX reference, not a production foundation.

### Private Hire Scrum App

MIT PHP/PostgreSQL/Supabase project with bookings, airport transfers, roles, driver dispatch, invoices, refunds and notifications. Feature-rich but mismatched to the selected Next.js stack and includes broader rental/community functionality.

### Auto Admin System for a Transfer Company

MIT Python automation that extracts booking emails, calculates Google Maps travel time, checks calendar availability, handles one-way/return journeys and gives operators accept/reject controls. Useful for later operations automation, but not a customer-facing booking foundation.

### MedusaJS

Mature MIT commerce framework, but oriented around products, variants, carts, inventory and orders. Vamos still requires custom routes, schedules, flight data, vehicle eligibility, transfer pricing and dispatch. It adds a separate backend and deployment burden, so it is not recommended for the one-month V1.

## Open-source conclusion

No complete, cleanly licensed, tested and production-ready MIT project was found that matches the full Vamos workflow. Start from a clean Next.js/Supabase foundation and implement the booking domain directly. Reuse patterns and ideas only where licence and code quality are clear.
