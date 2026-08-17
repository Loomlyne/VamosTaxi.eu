# Technology Stack

**Analysis Date:** 2026-08-17

## Overview

This repository contains a **finished design package** with working HTML mocks of every customer and ops screen. No production application code exists yet. The mocks run as static `.dc.html` files in a browser with runtime libraries loaded from CDN (React, Babel) and vendored assets (design system, fonts, icons, Lenis).

## Current State (Design Mocks)

### Languages

**Primary:**
- JavaScript — runtime JSX compilation and state management in the mocks

### Runtime (Mocks)

**Environment:**
- Browser (no Node.js build step for mocks)

**Runtime Libraries (loaded at runtime):**
- React 18.3.1 (from unpkg, SRI-pinned in `app/support.js`)
- ReactDOM 18.3.1 (from unpkg, SRI-pinned)
- @babel/standalone 7.29.0 (for JSX-to-JS compilation at load time)

**Vendored (local filesystem):**
- Lenis 1.3.23 (`assets/lenis.js`, `assets/lenis.css`, `assets/lenis-boot.js`) — smooth scroll runtime

### Frameworks & Build

**No build step for mocks.** Each `.dc.html` file:
- Declares icon and logo dependencies as `<meta name="ext-resource-dependency">`
- Loads `app/support.js` (compiled dc-runtime for Design Component rendering)
- Loads `design-system/_ds_bundle.js` (UMD-style global namespace)
- Loads React, ReactDOM, and Babel from unpkg on first page load (subsequent pages reuse cached libraries)

**Design Component Runtime:**
- `app/support.js` — compiles and runs Design Components (`<x-dc>` markup + JavaScript)
- `app/*/support.js` — identical copies in `home/`, `pages/`, `ops/` folders for relative path resolution

### CSS & Design Tokens

**Design System Bundle:**
- Location: `design-system/`
- Entry point: `design-system/styles.css` (imports all token files, components, fonts)
- Token files: `tokens/fonts.css`, `tokens/colors.css`, `tokens/typography.css`, `tokens/spacing.css`, `tokens/elevation.css`, `tokens/motion.css`, `tokens/base.css`, `tokens/laws.css`
- Components: 100+ React components (Button, Input, Card, StatusBadge, Table, etc.)
- Fonts: Qurova (5 weights, display/figures), Poppins (4 weights, body/labels)

**Compiled bundle:**
- `design-system/_ds_bundle.js` — all components as `window.VamosTaxiDesignSystem_245af1` namespace (UMD)

### Icons & Assets

**Icons:**
- 57+ Lucide SVGs (ISC license) in `assets/icons/`, vendored verbatim from lucide-icons/lucide main branch
- Rendered as CSS masks through `Icon` component (no `<img>`, no `<svg>`)

**Logo:**
- 9 brand SVGs in `assets/logo/` (wordmark/lockup/mark × primary/reversed/white)

**Patterns:**
- `assets/patterns/` — checker mark, checker tile (CSS-rendered through `CheckerMark` component)

**Photography:**
- `assets/photography/` — one supplied V-Class reference photograph

**Web Fonts:**
- `design-system/.../assets/fonts/` — Qurova (5 weights), Poppins (4 weights)

### State Management (Mocks)

**Storage:**
- `localStorage` only
- `VamosLocale` (`app/vamos-locale.js`) — language (en/de/fr/ar) + currency (CHF/EUR/USD/AED), platform-wide
- `VamosOps` (`app/vamos-ops-data.js`) — ops data contract: vehicles, chauffeurs, bookings, customers, coupons, routes, rates, surcharges, settings, profile
- `vamos-reviews.js` — published reviews store
- `vamos-page-transition.js` — cross-page transition animation state

**I18n:**
- `app/vamos-i18n-dict.js` — 128+ strings × 4 languages (en, de, fr, ar) + regex patterns for concatenated strings

### Configuration

**Environment:**
- No `.env` file (mocks use localStorage, no external config)
- Static file serving required (do not use `file://` URLs; relative paths require a server like `npx serve .`)

**Build:**
- No build configuration; `.dc.html` files are source and runnable as-is

### Package Managers

**Not applicable.** This is a design package, not a Node.js project. No `package.json`, no `npm install`, no dependencies to manage.

---

## Planned Production Stack (Next.js + Cloudflare + Supabase)

**Target:** Phases 1–9 in `docs/build/GSD-LAUNCH.md`. This stack is **designed but not scaffolded yet**.

### Languages

**Primary:**
- TypeScript (strict mode)

### Runtime

**Environment:**
- Cloudflare Workers (serverless edge compute)
- Node.js compatibility flags enabled (for postgres.js driver)

**Framework:**
- Next.js 15 (App Router, SSR/ISG)
- Built with `@opennextjs/cloudflare` (adapter that transforms Next.js into a Worker bundle)

**Deployment:**
- `wrangler` CLI (`@cloudflare/wrangler`)
- CI: GitHub Actions (on PR → build + preview; on main → deploy staging; on tag → deploy prod)

### Databases & Data Access

**Primary Database:**
- Supabase (PostgreSQL, eu-central Frankfurt region, Pro plan)
- Direct connection string via **Cloudflare Hyperdrive** (pooled connection at the edge)
- SQL driver: `postgres.js` (or `pg`) with `max: 5` connections, prepared statements enabled

**Auth & Realtime:**
- Supabase Auth (email+password, email OTP for customers; invite-only staff with TOTP MFA)
- Supabase Storage (chauffeur-photos, vehicle-photos, review-photos buckets or Cloudflare R2)
- Supabase Realtime (ops board subscribers only, ≤ a few staff)

**Middleware Auth:**
- `@supabase/ssr` — SSR cookie handling in Next middleware

### External Services

**Payments:**
- Stripe standard (not Connect) — PaymentIntent, webhook handling, test-mode required before launch

**Email:**
- Resend — transactional email, templates in `packages/emails` (4 languages: en, de, fr, ar)

**Maps:**
- Mapbox Geocoding + Directions APIs — cached in Cloudflare KV by place-id pair (24 h TTL)

**Flight Data:**
- AeroDataBox or FlightAware — aviation API for flight autofill, cached in KV

**Cloudflare Services:**
- Queues — webhook fan-out (e.g., Stripe → multiple handlers)
- KV — geo cache, quote cache, flight data cache
- R2 — photo storage (alternative to Supabase Storage)
- Turnstile — CAPTCHA on public forms and quote API
- WAF — managed rules, rate limiting
- Cron Triggers — quote expiry, reminder emails, no-show sweep
- Logpush — structured logging

### Code Structure (Monorepo)

**Shape:** Root monorepo with three packages:
- `apps/web` — Next.js app (SSR + ops console route group)
- `packages/db` — Supabase migrations (SQL versioning)
- `packages/emails` — Resend email templates (React/JSX, 4 languages)

### Configuration

**Environment Variables:**
- Secrets matrix in `docs/build/GSD-LAUNCH.md` § Secrets
- Cloudflare: `HYPERDRIVE` binding, `STRIPE_WEBHOOK_SECRET`, `MAPBOX_TOKEN`, etc.
- Supabase: project URL, anon key, service role key
- Resend: API key
- Stripe: live + test keys

**Runtime Config:**
- Supabase region: **eu-central (Frankfurt)** — closest to Zurich
- Stripe currency: CHF (standard, not Connect)
- Cloudflare compute: `compatibility_date >= 2024-09-23` (required by postgres.js)

### Build & Deployment

**Build Step:**
- `opennextjs-cloudflare build` → `dist/` folder with Worker code
- `wrangler deploy` → deploys to Cloudflare Workers

**Environments:**
- `dev` (local `wrangler dev` + `supabase start`)
- `staging` (staging.vamostaxi.eu, Micro compute)
- `prod` (vamostaxi.eu, sized in Phase 8)

**DNS & Hosting:**
- Domain: `vamostaxi.eu` (currently on Freshpage/Inware PHP site)
- Cutover planned Phase 9 (301 redirect map, live checklist, one-week watch)

### Design System (Production)

**Token Files:**
- Copy from `design-system/tokens/*.css` into `apps/web/public/brand/` (unchanged, including `tokens/laws.css` as final import)
- React components rebuilt from design-system source, keeping same class names (CSS stays verbatim)

**Fonts & Icons:**
- Fonts: copy Qurova + Poppins from `design-system/.../assets/fonts/`
- Icons: copy Lucide SVGs from `assets/icons/` (or serve via CSS mask)
- Logo: copy SVGs from `assets/logo/`

---

## Key Decisions

| Concern | Decision | Rationale |
|---|---|---|
| **No Vercel** | Cloudflare Workers only | No ISR, no image optimization; every feature must work on OpenNext + Workers |
| **EU-hosted** | Supabase eu-central (Frankfurt) | Closest to Zurich; GDPR compliance |
| **SQL over ORM** | `postgres.js` via Hyperdrive | Direct SQL, prepared statements, pooling at the edge |
| **No second database** | Supabase primary only | Auth, Storage, Realtime included; no separate Redis needed (KV for ephemeral cache) |
| **Stripe standard** | Not Connect | Simpler for a single-entity taxi service; no marketplace multi-pay |
| **One app, two routes** | Ops is route group `/(ops)/ops/*` | Same Next app, same deploy, role-gated by JWT claim `role` |
| **Amounts as `CHF 000`** | Until matrix lands | Never invent prices; `pricing_live=false` flag gates checkout; flag flip is launch trigger |

---

*Stack analysis: 2026-08-17*
