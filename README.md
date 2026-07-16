# VamosTaxi.eu

Production rebuild of [vamostaxi.eu](https://www.vamostaxi.eu/) as a premium pre-booked airport transfer and chauffeur platform.

## Product

- Customer booking website
- Fixed-route and distance-based pricing
- Vehicle selection and extras
- Stripe checkout with Swiss payment methods
- Booking confirmations and vouchers
- Dispatcher/admin dashboard
- Manual driver and vehicle assignment

This is a scheduled-transfer product, not an Uber-like ride-hailing marketplace.

## Documents

- [`docs/PROJECT-BRIEF.md`](docs/PROJECT-BRIEF.md): consolidated product and technical brief
- [`docs/DECISIONS.md`](docs/DECISIONS.md): confirmed decisions and scope boundaries
- [`docs/INPUTS-NEEDED.md`](docs/INPUTS-NEEDED.md): business information still required
- [`docs/RESEARCH.md`](docs/RESEARCH.md): website, competitor, brand and open-source research
- [`docs/CURRENT-SITE-AUDIT.md`](docs/CURRENT-SITE-AUDIT.md): full public-surface audit of live vamostaxi.eu (stack, template, admin exposure, booking, payments, rebuild map)
- [`assets/brand/Brand Guideline VAMOS TAXI.pdf`](assets/brand/Brand%20Guideline%20VAMOS%20TAXI.pdf): supplied brand guide

## Current phase

Discovery and GSD project definition. No production application code exists yet.

Live-site audit completed 2026-07-16: Freshpage/Inware PHP site with booking module; rebuild remains greenfield Next.js/Supabase.
