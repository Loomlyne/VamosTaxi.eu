# GSD — Vamos Taxi V1 on Cloudflare + Supabase (no Vercel)

Execution file, start → finish. Work top to bottom; every phase has **Goal → Steps → Done when**.
The design mocks in `app/` are the spec: every screen, state, and the `VamosOps` /
`VamosLocale` JS contracts are what the production app must reproduce. Amounts stay
`CHF 000` until the client's price matrix lands (design system §2/§7 — never invent a price).

**Stack (final):** Next.js 15 (App Router) built with `@opennextjs/cloudflare` → one
Cloudflare **Worker** (SSR + static assets) · **Supabase** (Postgres, Auth, Storage, Realtime)
via **Hyperdrive** for SQL · **Stripe** (standard) · **Resend** (email) · **Mapbox**
(geocode/route) · Cloudflare **Queues, KV, R2, Turnstile, WAF**. No Vercel anywhere.

**Environments:** `dev` (local `wrangler dev` + supabase CLI), `staging`, `prod` — one
Supabase project + one Worker env each. Staging on Micro compute, prod sized in Phase 8.

---

## Phase 0 — Accounts & prerequisites (half a day)

Goal: every external account exists, EU-hosted, with billing on.

1. Cloudflare account + the `vamostaxi.eu` zone (transfer DNS from current host; keep the
   old CMS live until Phase 9 cutover).
2. Supabase org → 2 projects (`vamos-staging`, `vamos-prod`), **region eu-central (Frankfurt)**
   — closest to Zurich. Pro plan ($25/project). — **amended 2026-08-23 (D-37): the created project
   is in Central Europe (Zurich)**
3. Stripe account (CH entity, CHF default). Activate TWINT via Stripe payment methods.
4. Resend account + domain `vamostaxi.eu` verified (SPF/DKIM/DMARC records in Cloudflare DNS).
5. Mapbox account (Geocoding + Directions APIs).
6. GitHub repo `vamos-platform` (monorepo: `apps/web`, `packages/db`, `packages/emails`).
7. Legal/owner inputs chased in parallel (they block later phases): CHF price matrix,
   policy numbers (cancel window, waiting fees, no-show), vehicle + destination photography,
   payment-provider marks, social brand kits, Qurova webfont license confirmation.

Done when: all dashboards reachable, secrets stored in a password manager, repo pushed.

## Phase 1 — Scaffold on Cloudflare Workers (1 day)

Goal: a deployed hello-world Next.js app on Workers with CI.

1. `npx create-next-app@latest apps/web --ts --app --tailwind`
2. `npm i -D @opennextjs/cloudflare wrangler` → add `open-next.config.ts`,
   `wrangler.jsonc` with `assets` binding, `compatibility_flags: ["nodejs_compat"]`,
   `compatibility_date` ≥ 2024-09-23 (needed by the `pg` driver later).
3. Scripts: `preview` = `opennextjs-cloudflare build && wrangler dev`,
   `deploy` = `opennextjs-cloudflare build && wrangler deploy`.
4. GitHub Actions: on PR → typecheck + build + `wrangler versions upload` (preview URL);
   on `main` → deploy staging; tag → deploy prod. Store `CLOUDFLARE_API_TOKEN` as repo secret.
5. Port the design tokens: copy `_ds` tokens/css + fonts + icons + logo SVGs into
   `apps/web/public/brand/` and wire `styles.css`. Rebuild `Button/Input/Card/StatusBadge/…`
   as React components 1:1 from the design-system bundle (same class names keeps CSS verbatim).
6. Domains: `staging.vamostaxi.eu` + `ops-staging.` now; prod domains in Phase 9.
   Ops console is a route group `/(ops)/ops/*` in the same app (one deploy, role-gated).

Done when: `https://staging.vamostaxi.eu` serves an SSR page from a Worker; CI green.

## Phase 2 — Supabase schema, RLS, auth (2–3 days)

Goal: the database IS the `vamos-ops-data.js` contract, secured.

1. `supabase init` + local dev; all schema as versioned migrations in `packages/db`.
2. Tables (mirror the mock store shapes exactly — they are the agreed contract):
   - `profiles` (1:1 auth.users; `role` enum: `customer|dispatcher|admin`)
   - `vehicle_classes` (economy 3/3, business, van 8/8 — capacities per audit)
   - `vehicles`, `chauffeurs` (+ document expiry dates, photo path)
   - `bookings` — ref `VT-####`, route (from/to text + lat/lng + place ids), pickup_at
     (timestamptz, Europe/Zurich), flight_no, pax/bags, class, price_chf numeric **nullable
     until matrix lands**, status enum `quote|pending|paid|confirmed|assigned|completed|
     cancelled|refunded|no_show`, customer_id nullable (guest), manage_token uuid,
     assigned_chauffeur_id, assigned_vehicle_id, locale, notes
   - `booking_events` (append-only timeline: who/what/when — powers ops Detail + audit)
   - `customers` view over profiles + guest contact rows
   - `coupons` + `coupon_redemptions` (code, type, value, window, per-user + global caps)
   - `fixed_routes`, `distance_rates` (per class per km), `surcharges` (night/ski/child-seat…)
   - `reviews` (author, rating, text, source, published bool, sort) — feeds home Reviews
   - `content_strings` (key, en/de/fr/ar) — replaces `vamos-i18n-dict.js` at runtime
   - `settings` singleton (waiting-time minutes, min advance booking, contact details)
   - `stripe_events` (id pk) — webhook dedupe
3. RLS on everything: customers see own bookings (`auth.uid()` or valid `manage_token` via
   RPC), staff roles via JWT custom claim `role`; ops tables staff-only; public read for
   published `reviews`, `content_strings`, pricing tables. Write policies dispatcher/admin.
4. Auth: email+password and email OTP for customers; ops staff = invited users with
   `role=dispatcher|admin` claim (set via auth hook), TOTP MFA **required** for staff.
   Phone verify (mock `PhoneVerify` screen) → Supabase phone auth w/ Twilio Verify, or defer
   to post-launch (flag).
5. Seed script: vehicle classes, settings, FAQ/content strings, the current mock reviews.
6. Storage buckets: `chauffeur-photos`, `vehicle-photos`, `review-photos` (staff write,
   public read via transformed URLs) — or Cloudflare R2 + Images if preferred; pick ONE (R2
   recommended: same bill, image resizing at edge).

Done when: `supabase db push` to staging; RLS tested with `supabase test db`; a staff and a
customer user exist; TypeScript types generated (`supabase gen types`).

## Phase 3 — Data access from Workers (1 day)

Goal: fast, pooled SQL from the edge.

1. Create **Hyperdrive** config per env pointing at the Supabase **direct connection string
   (not the pooled one)** — Hyperdrive does the pooling itself near the DB.
2. Use `postgres.js` (or `pg`) with `max: 5`, prepared statements on; bind as
   `env.HYPERDRIVE.connectionString`. Keep transactions short (transaction-mode pooling).
3. The supabase-js client is used ONLY for Auth token verification, Storage and Realtime;
   all app queries go through Hyperdrive + SQL (or Drizzle on top).
4. Auth in SSR: `@supabase/ssr` cookie handling in Next middleware; verify JWT in the
   Worker, map claims → role.

Done when: p50 query round-trip from staging Worker < 30 ms; no "too many connections" under
`wrk`/`k6` smoke test.

## Phase 4 — Pricing engine + quote API (2–3 days)

Goal: the home booking widget returns a real, lockable quote.

1. `POST /api/quote`: geocode both ends (Mapbox, cached in KV 24 h by place-id pair) →
   distance/duration (Directions) → price per class = fixed-route override ∥ per-km rate ×
   distance + surcharges − coupon. Returns all classes + a `quote_id` (row in `bookings`
   with status `quote`, price locked, TTL 30 min).
2. Validation rules from `settings`: min advance time, service area, pax/bags ≤ class caps
   (mirror `Counter` clamps), ski-route surcharges by destination.
3. Flight autofill: `GET /api/flight/:no` → aviation data provider (AeroDataBox or
   FlightAware) behind KV cache; degrade gracefully to manual time when the API is down.
4. **Blocker discipline:** until the client CHF matrix lands the engine runs on a staging
   matrix flagged `pricing_live=false` — checkout stays disabled in prod, quote UI shows
   `CHF 000`. The flag flip is the launch trigger.
5. Rate-limit `/api/quote` (Cloudflare rate-limiting rule, e.g. 20/min/IP) + Turnstile on
   the widget after N anonymous quotes.

Done when: widget → real quote in < 800 ms warm; k6: 200 rps quote traffic, p95 < 1.5 s.

## Phase 5 — Checkout, payments, lifecycle (3–4 days)

Goal: money moves; bookings live the full status lifecycle.

1. Checkout page reads the locked quote → collects passenger details → creates Stripe
   **PaymentIntent** (CHF; cards + TWINT + Apple/Google Pay) with `booking_id` metadata.
   Currency display can show EUR/USD marks, but the charge is CHF (locale runtime rule:
   the mark changes, the number doesn't).
2. Webhook Worker route `/api/stripe/webhook`: verify with `constructEventAsync` +
   `Stripe.createSubtleCryptoProvider()` (Workers has no sync crypto), insert event id into
   `stripe_events` (`ON CONFLICT DO NOTHING`), enqueue to **Cloudflare Queues**, ACK 200 fast.
3. Queue consumer: `payment_intent.succeeded` → booking `pending→paid→confirmed`, write
   `booking_events`, send confirmation email (Resend, EN/DE/FR/AR templates in
   `packages/emails`) with manage link `manage-booking?token=…` + ICS attachment.
4. Cancellation/refund: customer self-serve inside the policy window (`settings`), else
   request → ops approves → Stripe refund → status `refunded`; every step a `booking_event`.
5. Ops assignment: dispatcher sets chauffeur+vehicle → status `assigned` → driver email/SMS
   (SMS optional post-launch), customer "driver details" email.
6. Cron (Workers Cron Triggers): expire stale quotes, T-24h reminder emails, no-show sweep.

Done when: Stripe test-mode E2E green (book → pay → confirm → assign → complete; cancel →
refund); webhook replay-safe; every email renders in all four languages.

## Phase 6 — Port the surfaces (5–8 days, parallelizable)

Goal: every mock page becomes a route, pixel-faithful, reading real data.

| Mock (app/…) | Route | Notes |
|---|---|---|
| home/home.dc.html | `/` | SSG + client widget; sections from DB (reviews, FAQ) |
| pages/checkout, confirmation | `/checkout`, `/confirmation/[ref]` | Phase 5 |
| pages/sign-in, reset-password | `/sign-in`, `/reset-password` | Supabase Auth |
| pages/account, bookings, booking-detail | `/account`, `/account/bookings[/ref]` | RLS-scoped |
| pages/manage-booking | `/manage-booking` | ref+email lookup AND tokened link |
| pages/about, faq, contact, become-a-partner, coming-soon | static/ISR | contact + partner forms → Turnstile + Resend + DB row |
| pages/terms, privacy, cookies, cancellation, imprint | `/legal/*` | versioned, `data-tok` gaps until inputs land |
| ops/* | `/ops/*` | staff-gated; Supabase **Realtime** on `bookings` for the live board |

Rules: SSR/ISR for everything public (SEO), `hreflang` for en/de/fr/ar routes (`/de/…`),
locale + currency in a cookie mirroring `VamosLocale`; keep Lenis, keep the checker mark,
keep the four laws. Delete nothing from the mock visually without a design decision.

Done when: route-by-route visual diff vs mocks approved at 1440/1024/768/390, in German and
Arabic (RTL), and the ops board updates live when a test booking pays.

## Phase 7 — i18n + content completion (2 days + translation lead time)

1. Port `vamos-i18n-dict.js` into `content_strings`; admin edit UI = ops Content screen.
2. Clear `docs/i18n-todo.txt` (~600 pending strings, mostly legal pages) — professional
   DE/FR/AR translation of terms/privacy/cookies/cancellation/imprint; until delivered the
   pages keep the `data-vt-legal` notice.
3. Replace every `data-tok` pill the moment the owner supplies the number (grep `data-tok`).

## Phase 8 — Hardening for 10k concurrent (2–3 days)

Target: 10k simultaneous visitors ≈ mostly reads. Workers autoscale; the DB is the only
thing to size.

1. **Cache**: home + marketing + legal = ISR/edge-cached (Cache Rules, `stale-while-revalidate`);
   quotes KV-cached by route pair; DB reads for public content cached 60 s in Worker.
   Result: browsing traffic ~never touches Postgres.
2. **Supabase compute**: prod on **Small (2 GB)** to start, alert-driven upgrade path to
   Medium ($60) — booking writes are low-frequency; Hyperdrive keeps actual DB connections
   to a handful. Enable PITR ($100/mo, 7-day window) before real bookings exist.
3. **Realtime**: only the ops console subscribes (≤ a few staff) — well inside the 500
   concurrent included on Pro. Customers never hold sockets.
4. **Protection**: WAF managed rules, rate limits on `/api/*`, Turnstile on every public
   form, bot fight mode on; Stripe webhook route allow-listed by signature only.
5. **Observability**: Workers Logs + Logpush, Sentry (server+client), Stripe/Supabase
   dashboards, uptime checks on `/`, `/api/health` (checks DB + Stripe + Mapbox), alerting
   to ops email/Slack.
6. **Load test**: k6 scripts — 10k VUs browse (cached), 500 VUs quoting, 50 VUs booking;
   pass = p95 page < 1 s, quote < 1.5 s, zero 5xx, DB CPU < 60 %.
7. Backups: nightly `pg_dump` to R2 in addition to PITR; restore drill documented.

## Phase 9 — Cutover & go-live (1 day + watch week)

1. Freeze content on the old Freshpage CMS; export anything still needed.
2. Point `vamostaxi.eu` DNS at the Worker; 301 map of every old CMS URL; submit sitemap.
3. Flip `pricing_live=true` once the matrix is loaded and owner-approved on staging.
4. Live checklist: Stripe live keys + webhook endpoint, Resend prod domain, cookie banner
   gating analytics, privacy/imprint reviewed (Swiss nFADP + GDPR), ops MFA enforced,
   on-call + runbook (refund, resend email, manual assignment, DB restore).
5. Watch week: error budget review daily; keep old CMS parked 30 days.

---

## Secrets / env matrix

`HYPERDRIVE` (binding) · `SUPABASE_URL` · `SUPABASE_ANON_KEY` · `SUPABASE_SERVICE_ROLE`
(server only) · `STRIPE_SECRET_KEY` · `STRIPE_WEBHOOK_SECRET` · `RESEND_API_KEY` ·
`MAPBOX_TOKEN` · `FLIGHT_API_KEY` · `TURNSTILE_SECRET` · `SENTRY_DSN` — all via
`wrangler secret put`, never in the repo.

CI/deploy also needs `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` as GitHub Actions
repository secrets (`.github/workflows/deploy-staging.yml` and `deploy-production.yml`) —
not yet configured; no Cloudflare account exists as of Phase 1 (see 01-01-SUMMARY.md).

Alongside that Cloudflare pair, the deploy workflows also need three Supabase CI secrets —
`SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD` and `SUPABASE_PROJECT_ID` — not yet configured,
owner-held; see `docs/build/SUPABASE-RESOURCES.md` for what each one gates and the probe
checklist that must run before the first hosted push.

**Automated gates proving this matrix stays honest (D-35, Phase 1):**
- `gitleaks` — a credential-pattern scan, wired twice from the same `.gitleaks.toml`: at
  pre-commit (`.husky/pre-commit`, staged diff) and as the first job in
  `.github/workflows/pr.yml` (full PR range), both before any build or deploy step runs.
- `scripts/check-next-public-allowlist.mjs` — fails when a `NEXT_PUBLIC_*` identifier is
  used in `apps/web` outside `scripts/public-env-allowlist.json`'s `allowed` array, and
  when a name from that file's `forbidden_substrings` array (the credential list above)
  is found in the built client bundle (`apps/web/.open-next/assets/**`).

## Cost at launch (order of magnitude, monthly)

Workers Paid $5 + usage · Supabase Pro 2×$25 + Small compute $15 + PITR $100 · Stripe per-txn
· Resend ~$20 · Mapbox free tier → ~$200/mo before traffic-driven overage.

## The five owner blockers (nothing above unblocks them)

1. CHF price matrix + surcharges → gates Phase 4/9 flag flip
2. Policy numbers (cancel window, waiting, no-show) → legal pages + refund logic
3. Vehicle/destination photography → home + vehicle cards
4. Payment + social brand marks → footer
5. Qurova webfont license → production font serving
