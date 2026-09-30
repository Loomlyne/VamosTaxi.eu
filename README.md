# VamosTaxi.eu

Production rebuild of [vamostaxi.eu](https://www.vamostaxi.eu/) as a premium pre-booked airport transfer and chauffeur platform: Vamos Taxi V1 — brief, design system, and working design mocks for a Swiss pre-booked transfer platform.

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

## Ops runbook

English numbered click-paths for live Ops (refunds, resend voucher, manual assignment) and a copy-only database restore: [`docs/runbook/`](docs/runbook/).

Support: **info@vamostaxi.site** and **+41 79 626 70 82**.

## Layout

This repo has three parts, kept visibly separate:

- **`design-system/`** — the bound Vamos Taxi design system: tokens, components, fonts, and the compiled bundle every mock loads. Source of visual truth; see `design-system/readme.md`.
- **`app/`** — every screen as a working `.dc.html` mock (`home/`, `pages/`, `ops/`), plus the JS runtimes they share (`vamos-i18n-dict.js`, `vamos-locale.js`, `vamos-ops-data.js`, …). This is the spec for the production build.
- **`docs/`** — split into:
  - `docs/brief/` — the project's own planning material: product brief, decisions, research, site audit, scope of work, build playbook, and per-page flow specs.
  - `docs/build/` — the incoming design package's build docs: launch plan, gap audit, per-screen specs, i18n backlog, legal-placeholder checklist, and review scaffolds.
- **`archive/`** — two frozen historical snapshots (`ds-upgrade/`, `design_handoff_file_architecture/`), kept for history and never edited or path-rewritten.

Also at root: `assets/` (shared icons/logo/patterns/photography the app loads, plus `assets/brand/` with the supplied brand guideline PDF), `deliverables/` and `scripts/` (client-facing Scope of Work + invoice and the scripts that generated them), `CLAUDE.md` (product rules), `HANDOFF-CLAUDE-CODE.md` (handoff notes), `github.md` (vendored-asset provenance for Lucide), and the root hero/rectangle images used on the home page.

## Running the mocks

```
npx serve .
```

Then open `app/home/home.dc.html`.

## Current phase

Phase 0 + M001 next. GSD milestones M001–M004 sliced (25 plans). No production application code yet.

Active: **M001/S01 App scaffold** after Claude Design freeze (see `docs/brief/BUILD-PLAYBOOK.md`).

Live-site audit completed 2026-07-16: Freshpage/Inware PHP site; rebuild remains greenfield Next.js/Supabase.

## Building the production app

Start with [`HANDOFF-CLAUDE-CODE.md`](HANDOFF-CLAUDE-CODE.md) — it's the handoff for anyone about to build the production app from this design package.
