# External Integrations

**Analysis Date:** 2026-08-17

## Summary

This is a design package, not a production app. **Integrations in the mocks are simulated via localStorage.** **Real integrations are planned for production** (Phases 1–9) and documented in `docs/build/GSD-LAUNCH.md`. This document maps both.

---

## APIs & External Services

### Present (Mocks)

**No real external APIs.** All integrations are stubbed:
- Flight autofill: mock data only (not connected to AeroDataBox or FlightAware)
- Mapbox: not integrated (pickup/destination strings are text fields, no geocoding)
- Pricing: hardcoded mock values, no Stripe

### Planned (Production)

**Mapbox:**
- **What it does:** Geocoding (address → coordinates), Directions (route → distance/duration), Autocomplete (place search)
- **SDK/Client:** Mapbox SDK (browser + server-side)
- **Auth:** `MAPBOX_TOKEN` (publishable, in `wrangler.jsonc`)
- **Cache:** KV (24 h TTL by place-id pair) to avoid repeated requests
- **Usage:** `/api/quote` endpoint (Phase 4) and checkout map (Phase 6)
- **Status:** PLANNED — account exists, no code yet

**AeroDataBox or FlightAware:**
- **What it does:** Flight status lookup (flight number → departure/arrival times, current status)
- **Auth:** API key (AeroDataBox or FlightAware, environment variable)
- **Cache:** KV (request-level cache, graceful degradation if API is down)
- **Usage:** `/api/flight/:no` endpoint (Phase 4) for autofill on booking widget
- **Notes:** Provider choice not final; both are acceptable. GSD-LAUNCH calls it "aviation data provider"
- **Status:** PLANNED — account TBD, no code yet

---

## Data Storage

### Present (Mocks)

**localStorage only:**
- `VamosLocale` — language (en/de/fr/ar), currency (CHF/EUR/USD/AED)
- `VamosOps` — vehicles, chauffeurs, bookings, customers, coupons, routes, rates, surcharges, settings, profile
- `vamos-reviews` — published reviews
- All data resets on page reload (no persistence across browser close)

### Planned (Production)

**Supabase (PostgreSQL, eu-central Frankfurt):**
- **Connection:** Direct connection string via Cloudflare Hyperdrive (edge pooling)
- **Client:** `postgres.js` (or `pg`) with `max: 5` connections
- **Region:** eu-central (Frankfurt) — closest to Zurich, GDPR compliance
- **Plan:** Pro ($25/month)

**Tables (Phase 2 schema mirrors `VamosOps` contract exactly):**
- `auth.users` — Supabase built-in (email, password hash, etc.)
- `profiles` — extends auth.users, adds `role` enum (customer|dispatcher|admin)
- `vehicle_classes` — economy/business/van with capacity numbers
- `vehicles`, `chauffeurs` — asset inventory with photos, expiry dates
- `bookings` — ref, route, pickup_at, flight_no, pax/bags, class, `price_chf` nullable, status enum, customer_id, manage_token, assigned chauffeur/vehicle
- `booking_events` — append-only timeline (who/what/when) for audit trail + ops detail view
- `customers` — view over profiles (signups + guest contact rows)
- `coupons`, `coupon_redemptions` — discount codes with redemption tracking
- `fixed_routes`, `distance_rates`, `surcharges` — pricing data (per class, per km, conditions)
- `reviews` — published reviews (author, rating, text, source, published bool, sort)
- `content_strings` — i18n strings (key, en/de/fr/ar) — replaces `vamos-i18n-dict.js` at runtime
- `settings` — singleton (waiting-time minutes, min advance booking, contact details)
- `stripe_events` — webhook dedup (id pk)
- `booking_events` — append-only audit trail (every status change, assignment, email send)

**Realtime:**
- **Scope:** Ops console only (≤ a few staff subscribers, well inside Pro 500 concurrent limit)
- **Channels:** `bookings` table (live board updates when status changes)
- **Customers:** Never hold Realtime sockets (public pages are SSR/ISR, no subscriptions)

**Storage Buckets:**
- `chauffeur-photos` — driver mugshots (staff write, public read via transformed URLs)
- `vehicle-photos` — vehicle gallery
- `review-photos` — customer-uploaded review images
- **Alternative:** Cloudflare R2 + Image Resizing (same bill, image processing at edge)

---

## Authentication & Identity

### Present (Mocks)

**Stubbed:**
- `vamosAuth` — customer login (localStorage `= '1'`)
- `vamosOpsAuth` — staff login (localStorage `= '1'`, no password validation)
- No real auth, no token handling

### Planned (Production)

**Supabase Auth:**

**Customers (Phase 2):**
- Email + password signup/login
- Email OTP for passwordless login
- Phone verify (Twilio Verify via Supabase, or defer post-launch)
- Manage token (UUID) for unauth booking access (manage-booking page without sign-in)

**Staff (Phase 2):**
- Invite-only (admin creates users, sends invite links)
- Email + password login (or OAuth, TBD)
- **TOTP MFA required** (two-factor code, non-negotiable)
- JWT custom claim `role` (dispatcher|admin) — checked in RLS and Next middleware
- No password resets for staff; re-invite instead

**Middleware (Phase 3):**
- `@supabase/ssr` — cookie-based auth in Next middleware
- Verify JWT, map claims → request context (role, user_id)
- Refresh token rotation on each request

---

## Monitoring & Observability

### Present (Mocks)

**None.** Console errors only.

### Planned (Production)

**Logs:**
- Workers Logs (structured, queryable via Cloudflare dashboard)
- Logpush (stream to external destination, e.g., Datadog, Splunk)

**Error Tracking (Phase 8):**
- Sentry (server + client-side errors)
- Integration: `@sentry/nextjs`

**Dashboards:**
- Cloudflare Analytics (Workers, KV, Queues)
- Supabase Dashboard (query count, connection pool, auth events)
- Stripe Dashboard (payment volume, chargeback rate, refund rate)
- Uptime checks on `/`, `/api/health` (checks DB + Stripe + Mapbox)

---

## CI/CD & Deployment

### Present (Mocks)

**Not applicable.** Static files, no build system.

### Planned (Production)

**Hosting:** Cloudflare Workers (serverless, auto-scaled)

**CI/CD (Phase 1):**

**GitHub Actions Workflows:**

1. **On PR:** typecheck + build + `wrangler versions upload` → preview URL (not Vercel)
2. **On push to main:** deploy to staging (staging.vamostaxi.eu)
3. **On tag (e.g., v1.0.0):** deploy to prod (vamostaxi.eu)

**Secrets Storage:**
- `CLOUDFLARE_API_TOKEN` (repo secret, for wrangler authentication)
- `SUPABASE_SERVICE_ROLE_KEY` (for migrations)
- Individual `DATABASE_URL`, `STRIPE_SECRET_KEY`, etc.

---

## Environment Configuration

### Required Environment Variables (Planned)

**Cloudflare Workers (`wrangler.jsonc`):**
```
HYPERDRIVE                  # Hyperdrive binding to Supabase direct connection
CLOUDFLARE_ACCOUNT_ID       # Account ID (in wrangler.jsonc)
CLOUDFLARE_API_TOKEN        # API token (GitHub secret)
```

**Supabase:**
```
DATABASE_URL                # Direct connection (via Hyperdrive, not pooled)
SUPABASE_URL                # Project URL (for Auth)
SUPABASE_ANON_KEY           # Public anon key (for client-side Auth)
SUPABASE_SERVICE_ROLE_KEY   # Service role (migrations, RLS bypass)
```

**Stripe:**
```
STRIPE_PUBLISHABLE_KEY      # Public key (for Payment Element)
STRIPE_SECRET_KEY           # Secret key (for webhook verification, PaymentIntent creation)
STRIPE_WEBHOOK_SECRET       # Webhook signing secret (for `/api/stripe/webhook`)
```

**Resend:**
```
RESEND_API_KEY              # API key for transactional email
```

**Mapbox:**
```
MAPBOX_TOKEN                # Publishable token (geocoding, directions)
```

**Aviation Data:**
```
AERODATABOX_API_KEY         # (or FLIGHTAWARE_API_KEY, depending on provider choice)
```

**Other:**
```
ENVIRONMENT                 # dev | staging | prod
PRICING_LIVE                # false (until price matrix lands), then true at Phase 9
```

### Secrets Storage

**Local Development:**
- `.env.local` (git-ignored, never committed)

**Production:**
- Cloudflare Workers Secrets (bound to wrangler.jsonc)
- GitHub Secrets (for CI/CD only)
- **Never in code, never in git, never in logs**

---

## Webhooks & Callbacks

### Present (Mocks)

**None.** All state is localStorage.

### Planned (Production)

**Incoming Webhooks:**

**Stripe Webhook (Phase 5):**
- **Endpoint:** POST `/api/stripe/webhook`
- **Events:** `payment_intent.succeeded`, `payment_intent.payment_failed`, `charge.refunded`, `charge.dispute.created`
- **Handler:** Verify signature with `constructEventAsync` + `Stripe.createSubtleCryptoProvider()` (Workers has no sync crypto), deduplicate via `stripe_events` table, enqueue to Cloudflare Queues
- **Response:** 200 OK immediately (async processing)
- **Security:** Stripe signature validation only; no API key in webhook

**Supabase Webhook (optional, Phase 5+):**
- Database triggers → Supabase Edge Functions → external systems (optional; not in MVP)

### Outgoing Webhooks

**None planned.** Vamos is a closed system (no partner integrations yet).

---

## Third-Party SDKs Summary

| Service | Package | Version | Use Case | Status |
|---------|---------|---------|----------|--------|
| **Supabase** | `@supabase/ssr`, `@supabase/supabase-js` | latest | Auth, Storage, Realtime | PLANNED |
| **Supabase CLI** | `supabase` | latest | Local dev, migrations | PLANNED |
| **Stripe** | `stripe` | latest | Payment processing | PLANNED |
| **Stripe.js** | `@stripe/stripe-js` | latest | Payment Element (browser) | PLANNED |
| **Resend** | `resend` | latest | Email sending | PLANNED |
| **Mapbox SDK** | `@mapbox/mapbox-sdk` or `mapbox-gl` | latest | Geocoding, Directions, (optional map) | PLANNED |
| **OpenNext** | `@opennextjs/cloudflare` | latest | Next.js → Cloudflare adapter | PLANNED |
| **Wrangler** | `wrangler` | latest | Cloudflare CLI | PLANNED |
| **Lenis** | vendored 1.3.23 | 1.3.23 | Smooth scroll | PRESENT (mocks) |
| **React** | unpkg CDN | 18.3.1 | JSX rendering | PRESENT (mocks) |
| **@babel/standalone** | unpkg CDN | 7.29.0 | JSX → JS compilation | PRESENT (mocks) |
| **Sentry** | `@sentry/nextjs` | latest | Error tracking | PLANNED (Phase 8) |
| **Twilio Verify** (opt) | `twilio` | latest | Phone OTP | PLANNED (opt) |

---

## Planned Secrets & Access Control

| Secret | Provider | Owner | Phase | Notes |
|--------|----------|-------|-------|-------|
| `MAPBOX_TOKEN` | Mapbox | Dev account | Phase 0 | Public (publishable) token OK for browser |
| `STRIPE_PUBLISHABLE_KEY` | Stripe | Dev account | Phase 0 | Public token |
| `STRIPE_SECRET_KEY` | Stripe | Dev account | Phase 0 | Secret; CI/CD only |
| `STRIPE_WEBHOOK_SECRET` | Stripe | Dev account | Phase 0 | Webhook signing; CI/CD only |
| `SUPABASE_ANON_KEY` | Supabase | Dev project | Phase 0 | Public; frontend use OK |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase | Dev project | Phase 0 | Secret; backend only |
| `DATABASE_URL` | Supabase | Dev project | Phase 0 | Via Hyperdrive binding, secret |
| `RESEND_API_KEY` | Resend | Dev account | Phase 0 | Secret; backend only |
| `AERODATABOX_API_KEY` | AeroDataBox | Dev account | Phase 0 | Secret; backend only (if chosen) |
| `CLOUDFLARE_API_TOKEN` | Cloudflare | Account | Phase 0 | Secret; CI/CD only (GitHub Actions) |
| `PRICING_LIVE` | Internal flag | Owner | Phase 9 | Controls checkout enable/disable |

---

## Data Flow Diagrams

### Booking Flow (Production)

```
Customer (browser)
    ↓
GET /                (home page, SSR)
    ↓
POST /api/quote      (Mapbox geocode/directions → cached KV → price lookup)
    ↓
GET /checkout        (locked quote + Stripe Payment Element)
    ↓
POST /checkout       (create PaymentIntent, Stripe.js completes payment)
    ↓
Stripe webhook → /api/stripe/webhook (verify signature, enqueue to Queues)
    ↓
Cloudflare Queue Consumer
    │
    ├─→ Update booking status: quote → pending → paid → confirmed
    ├─→ Insert booking_events (audit trail)
    └─→ Send confirmation email (Resend, 4 languages)
    ↓
Customer GET /confirmation/[ref] (real booking data from DB)
```

### Ops Console (Production)

```
Staff (authenticated)
    ↓
GET /ops             (SSR, Realtime subscription to bookings table)
    ↓
GET /ops/[ref]       (booking detail, booking_events timeline)
    ↓
POST /ops/[ref]/assign (update booking.assigned_chauffeur_id + vehicle_id)
    │
    └─→ Database trigger → booking_events insert → Realtime broadcast
    │
    └─→ Send driver email/SMS (Resend)
    ↓
Realtime update in ops console (staff sees live status change)
```

---

## Phase Blockers (External)

**Cannot start production work without these from the owner:**

1. **CHF price matrix** — blocks Phase 4 (pricing engine); Phase 9 launch gate
2. **Policy numbers** — cancel window, waiting fees, no-show penalty — blocks Phase 5+ logic
3. **Vehicle + destination photography** — blocks Phase 6 (ops board polish)
4. **Payment provider marks** — Stripe/TWINT/Apple Pay logos for footer
5. **Social brand kits** — LinkedIn, Instagram, etc.
6. **Qurova webfont license confirmation** — redistribution rights check

See `docs/build/GSD-LAUNCH.md` § Phase 0 and `HANDOFF-CLAUDE-CODE.md` § 8 for full details.

---

*Integration audit: 2026-08-17*
