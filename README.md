# VamosTaxi.eu

Production rebuild of [vamostaxi.eu](https://www.vamostaxi.eu/) as a premium pre-booked airport transfer and chauffeur platform.

## Product

- Customer booking website (mobile-first, strong desktop)
- Customer accounts, booking history, manage booking
- Mapbox map pin + search for pickup/destination
- Fixed-route and distance-based pricing
- Vehicle selection, extras, coupons/vouchers at checkout
- Stripe standard checkout (not Connect) + Swiss methods where eligible
- Booking confirmations and vouchers (Resend)
- Dispatcher/admin dashboard
- Manual driver and vehicle assignment (no driver app)

Swiss local **scheduled** transfer product (book ahead; driver waits at set time). Transfeero-level UX quality. Not on-demand Uber, not a global marketplace.

## Documents

- [`docs/PROJECT-BRIEF.md`](docs/PROJECT-BRIEF.md): consolidated product and technical brief
- [`docs/DECISIONS.md`](docs/DECISIONS.md): confirmed decisions and scope boundaries
- [`docs/INPUTS-NEEDED.md`](docs/INPUTS-NEEDED.md): business information still required
- [`docs/RESEARCH.md`](docs/RESEARCH.md): website, competitor, brand and open-source research
- [`docs/CURRENT-SITE-AUDIT.md`](docs/CURRENT-SITE-AUDIT.md): full public-surface audit of live vamostaxi.eu (stack, template, admin exposure, booking, payments, rebuild map)
- [`docs/SCOPE-OF-WORK.md`](docs/SCOPE-OF-WORK.md): client Scope of Work / delivery contract (3–4 weeks V1)
- [`deliverables/Vamos-Taxi-Scope-of-Work-V1.docx`](deliverables/Vamos-Taxi-Scope-of-Work-V1.docx): client-ready Word version
- [`docs/BUILD-PLAYBOOK.md`](docs/BUILD-PLAYBOOK.md): tool routing (Claude Design / Claude Code / Cursor / Hermes) × GSD phases
- [`docs/OFFICE-HOURS-DESIGN.md`](docs/OFFICE-HOURS-DESIGN.md): office-hours design lock (copy of gstack design doc)
- [`assets/brand/Brand Guideline VAMOS TAXI.pdf`](assets/brand/Brand%20Guideline%20VAMOS%20TAXI.pdf): supplied brand guide

## Current phase

Phase 0 + M001 next. GSD milestones M001–M004 sliced (25 plans). No production application code yet.

Active: **M001/S01 App scaffold** after Claude Design freeze (see BUILD-PLAYBOOK).

Live-site audit completed 2026-07-16: Freshpage/Inware PHP site; rebuild remains greenfield Next.js/Supabase.
