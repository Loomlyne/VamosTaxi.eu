# Architecture Research

**Domain:** Booking + payments + dispatch system, single Cloudflare Worker (Next.js 15 via `@opennextjs/cloudflare`) + Supabase Postgres via Hyperdrive
**Researched:** 2026-08-17
**Confidence:** HIGH (Cloudflare Queues semantics, Stripe idempotency, `@opennextjs/cloudflare` monorepo behaviour, Supabase Realtime authorization are all current-docs-verified). MEDIUM on the exact quote-lock/pricing-snapshot table shape — this is a design decision this document makes explicit, not a documented external pattern.

## Standard Architecture

### System Overview

```
┌───────────────────────────────────────────────────────────────────────────┐
│                         Browser (customer / ops staff)                     │
│   Public pages (RSC/SSR/ISR)         Ops console (SSR, role-gated route)   │
└───────────────┬───────────────────────────────────┬─────────────────────┘
                 │ HTTPS                              │ HTTPS + WS (Realtime)
                 ▼                                     ▼
┌───────────────────────────────────────────────────────────────────────────┐
│                   ONE Cloudflare Worker (Next.js 15 App Router)            │
│  ┌─────────────┐ ┌───────────────┐ ┌────────────────┐ ┌────────────────┐ │
│  │ Public       │ │ /api/quote     │ │ /api/checkout   │ │ /api/stripe/    │ │
│  │ RSC routes   │ │ (pricing engine│ │ (PaymentIntent  │ │ webhook         │ │
│  │ (/,/about..) │ │  read-mostly)  │ │  create)        │ │ (verify+enqueue)│ │
│  └─────────────┘ └───────────────┘ └────────────────┘ └────────────────┘ │
│  ┌─────────────┐ ┌───────────────┐ ┌────────────────┐                     │
│  │ Ops routes   │ │ /api/manage-   │ │ Cron triggers   │                     │
│  │ /(ops)/ops/* │ │ booking, /flight│ │ (expire quotes, │                     │
│  │ (staff-gated)│ │ /:no           │ │ reminders)       │                     │
│  └─────────────┘ └───────────────┘ └────────────────┘                     │
└──────┬───────────────┬───────────────┬──────────────┬─────────────────────┘
       │ Hyperdrive    │ KV (cache)    │ Queue (produce)│ supabase-js
       ▼               ▼               ▼                ▼
┌────────────┐  ┌─────────────┐  ┌───────────────┐  ┌──────────────────────┐
│ Supabase   │  │ Cloudflare   │  │ Cloudflare     │  │ Supabase Auth/       │
│ Postgres   │  │ KV           │  │ Queue          │  │ Storage/Realtime      │
│ (RLS, all  │  │ geocode 24h, │  │ stripe-events  │  │ (JWT verify, R2/     │
│ writes go  │  │ quote KV     │  └──────┬────────┘  │ Storage buckets,     │
│ through it)│  │ optional)    │         │           │ Realtime on bookings)│
└────────────┘  └─────────────┘         ▼           └──────────────────────┘
                                  ┌───────────────┐
                                  │ Same Worker,   │
                                  │ Queue consumer │
                                  │ export (async)  │
                                  │ → booking write │
                                  │ → Resend email  │
                                  └───────────────┘
```

### Component Responsibilities

| Component | Responsibility | Typical Implementation |
|-----------|----------------|------------------------|
| Public RSC routes | Marketing, legal, account pages — read-mostly, cached | Next.js Server Components, ISR/edge cache, no direct Postgres hit on the hot path |
| Pricing engine (`/api/quote`) | Compute a price for a route + class, write a `quote` row, return a `quote_id` | Route handler: Mapbox (KV-cached) → rate lookup (DB, short-TTL cache) → insert `bookings` row status=`quote` |
| Checkout (`/api/checkout`) | Turn a live quote into a PaymentIntent | Reads the `bookings` row by `quote_id` + un-expired check, creates Stripe PaymentIntent with `booking_id` in metadata, idempotency key = `booking_id` |
| Stripe webhook (`/api/stripe/webhook`) | Verify signature, dedupe, enqueue, ACK fast | `constructEventAsync` + Workers subtle-crypto provider; insert `stripe_events(id)` `ON CONFLICT DO NOTHING`; if inserted, `env.QUEUE.send(event)`; return 200 in all cases Stripe should not retry |
| Queue consumer | Do the actual state transition + side effects | Same Worker's `queue()` export; idempotent by `booking_id`+event type; writes `booking_events`, sends email, never re-verifies Stripe signature (already done) |
| Ops console (`/(ops)/ops/*`) | Staff dispatch surface: board, detail, assignment, manual booking, content, pricing admin | Same Next.js app, role-gated layout, Supabase Realtime subscription on `bookings`/`booking_events` for the live board only |
| Supabase Postgres (via Hyperdrive) | System of record — bookings, pricing tables, customers, content strings, audit trail | `postgres.js`/`pg` over Hyperdrive, RLS on every table, short transactions |
| Supabase Auth | Identity for customers and staff | JWT verified in Worker/middleware; custom claim `role` for staff; TOTP MFA for staff |
| Supabase Realtime | Live push for the ops board only | Private channel + Realtime Authorization RLS on `realtime.messages`; not used by public/customer routes |
| Cloudflare KV | Cache for expensive/slow-changing lookups | Geocode results (24h), flight lookups, optionally quote-adjacent reference data |
| Cloudflare Queue | Decouples "Stripe told us" from "we finished processing" | `stripe-events` queue, consumer batch size 1–10, `max_retries`, DLQ configured |
| `packages/db` | Schema migrations + generated types, shared by app and any scripts | Supabase CLI migrations, `supabase gen types typescript` output committed |
| `packages/emails` | Transactional email templates, 4 languages | React Email (or similar) components, rendered server-side, sent via Resend from the queue consumer |

## Recommended Project Structure

```
vamos-platform/                  # repo root (or a subtree of this repo — see §1 below)
├── apps/
│   └── web/                     # the ONE Next.js app / ONE Worker
│       ├── app/
│       │   ├── (public)/        # /, /about, /faq, /legal/*, /checkout, /confirmation/[ref]
│       │   ├── (account)/       # /account, /account/bookings[/[ref]], /manage-booking
│       │   ├── (ops)/ops/       # role-gated route group — dispatch console
│       │   └── api/
│       │       ├── quote/route.ts
│       │       ├── checkout/route.ts
│       │       ├── stripe/webhook/route.ts
│       │       ├── flight/[no]/route.ts
│       │       └── health/route.ts
│       ├── lib/
│       │   ├── db/              # Hyperdrive client + query functions, imports packages/db TYPES only
│       │   ├── pricing/         # pricing engine: fixed-route, per-km, surcharges, coupons
│       │   ├── stripe/          # PaymentIntent + webhook verification helpers
│       │   ├── auth/            # @supabase/ssr cookie handling, role mapping
│       │   └── locale/          # server-side mirror of VamosLocale money()/t()
│       ├── components/          # ported design-system React components (same class names)
│       ├── queue-consumer.ts    # exported `queue()` handler, same Worker
│       ├── wrangler.jsonc
│       └── open-next.config.ts
├── packages/
│   ├── db/
│   │   ├── migrations/          # supabase migrations (SQL, versioned, forward-only)
│   │   ├── seed/                # vehicle classes, settings, FAQ/content strings
│   │   └── types/                # `supabase gen types typescript` output — TYPES ONLY, no runtime code
│   └── emails/
│       ├── templates/            # confirmation, driver-assigned, refund, reminder — en/de/fr/ar
│       └── render.ts             # pure render function, no network/DB access
└── package.json                  # npm/pnpm workspaces root
```

### Structure Rationale

- **`apps/web` is the only deployable.** Everything that runs inside the Worker's request lifecycle lives here. `packages/*` exist to be *imported at build time*, not to run standalone.
- **`packages/db` ships types and SQL text, never a runtime client.** The Worker's data access layer (`postgres.js`/`pg` over Hyperdrive) lives in `apps/web/lib/db`, not in the package — a package that opens its own DB connection or imports `pg` at module scope becomes something `@opennextjs/cloudflare`'s bundler has to resolve for the Workers runtime, and Node-only packages you didn't intend to ship to the edge (a CLI's `pg-native` fallback, a Node `fs`-based migration runner) are exactly what breaks the build. `packages/db` should be pure data (SQL files) + a types module with zero dependencies.
- **`packages/emails` is pure and side-effect-free.** Template render functions take data in, return HTML/text out. No Resend client, no DB query inside the package — the *caller* (the queue consumer) fetches data, calls `render()`, then sends. This keeps the package importable from a future admin tool, a test, or a script without dragging in a Workers-only fetch client.
- **What breaks when a Worker imports from a package**, concretely (verified against current OpenNext/Cloudflare docs):
  - A package with **Node.js APIs Workers doesn't implement** even under `nodejs_compat` (e.g. native modules, `worker_threads`, some `fs` calls) fails at bundle or runtime — keep `packages/*` platform-agnostic (pure functions, no filesystem, no child processes).
  - A package published with **conditional exports** that resolve to a Node-specific entrypoint by default needs to be added to `serverExternalPackages` in `next.config.ts`, or told to use its `workerd`/`edge` export — decide this per dependency, don't assume default resolution is edge-safe.
  - **Large packages bundled into the Worker inflate the bundle** toward Workers' size limit; keep `packages/db`'s generated-types file free of runtime code so it tree-shakes to nothing.
  - **Anything importing `packages/db`'s migration runner or seed scripts must not be imported by `apps/web` at all** — those run via Supabase CLI in CI/local dev, never inside the deployed Worker.
- **Where this monorepo actually lives:** per `PROJECT.md`'s key decisions, `apps/web` lands inside *this* repo (`Loomlyne/VamosTaxi.eu`), next to `app/` (the mocks), `design-system/`, `docs/` — not a separate `vamos-platform` repo. `GSD-LAUNCH.md`'s "GitHub repo `vamos-platform`" is superseded by that decision; treat the structure above as rooted at this repo, with `apps/web`, `packages/db`, `packages/emails` added alongside the existing top-level folders.

## Architectural Patterns

### Pattern 1: Server-authoritative quote as a database row, not a signed token

**What:** A quote is not computed twice (once for display, once for charge). `POST /api/quote` computes the price once and persists it as a `bookings` row with `status='quote'`. Every subsequent step (checkout, PaymentIntent, confirmation) reads *that row*, never recomputes.

**When to use:** Any flow where "the price the customer saw" must be "the price they pay" even if pricing rules change between the two moments (a surcharge table edit, a coupon expiring, a fixed-route price update).

**Trade-offs:** Requires a `bookings` row to exist before payment (some churn from abandoned quotes — mitigated by the 30-minute TTL and a cron sweep). In exchange, there is exactly one price computation path, one place to add audit logging, and no risk of "quote API" and "charge API" drifting apart.

**Example:**
```sql
-- bookings row created by /api/quote — authority lives here, not in a JWT
insert into bookings (
  id, status, class, route_from, route_to, distance_km,
  price_chf, price_breakdown, pricing_source, rate_version_id,
  quote_expires_at
) values (
  gen_booking_ref(), 'quote', $class, $from, $to, $distance_km,
  $price_chf, $breakdown_jsonb, $source, $rate_version_id,
  now() + interval '30 minutes'
) returning id, price_chf, quote_expires_at;
```

### Pattern 2: Immutable price snapshot (never re-join to live rate tables)

**What:** `price_chf` and a `price_breakdown` JSONB (base fare, per-km amount, each surcharge line, coupon applied, currency) are written onto the `bookings` row itself at quote time. `fixed_routes`, `distance_rates`, `surcharges`, `coupons` are **inputs** to the computation, never read again for an existing booking. A `rate_version_id` (or a timestamp) records *which* version of the rate tables produced the number, for audit/debugging only — it is never used to recompute.

**When to use:** Always, for money. This is the mechanism that satisfies "later rule changes never alter historical bookings" (`PROJECT.md` constraint).

**Trade-offs:** Denormalizes price data onto every booking row (small storage cost, worth it). Requires discipline: no code path may "refresh" a booking's price from current rates except a deliberate, audited re-quote flow (e.g. dispatcher manually repricing a phone booking — that's a *new* quote event, logged in `booking_events`, not a silent recalculation).

**Example:**
```typescript
// pricing/engine.ts — pure function, no DB writes itself
type PriceResult = {
  priceChf: string;           // "000" placeholder until pricing_live=true
  breakdown: { base: string; perKm?: string; surcharges: { code: string; amount: string }[]; coupon?: { code: string; amount: string } };
  source: 'fixed_route' | 'per_km';
  rateVersionId: string;
};
// caller (route handler) is the only place that persists the result onto bookings
```

### Pattern 3: Idempotent money movement — deterministic keys, not retries

**What:** Every operation that could double-execute is keyed deterministically off the `booking_id`, not a random UUID generated per attempt:
- Stripe PaymentIntent creation: `idempotencyKey: booking.id` (Stripe's own dedup, 24h window) — a retried checkout click never creates a second PaymentIntent for the same booking.
- Stripe webhook dedup: `stripe_events(id primary key)`; `INSERT ... ON CONFLICT (id) DO NOTHING`; if zero rows affected, the event was already processed — skip enqueue, still return 200.
- Queue consumer: the state transition itself is a conditional update (`UPDATE bookings SET status='paid' WHERE id=$1 AND status='pending'`), not an unconditional write — replaying the same queue message twice is a no-op the second time.
- Booking creation from `/api/quote`: no idempotency key needed (it's not money movement — worst case is an orphaned `quote` row, cleaned up by the expiry cron), but repeated `/api/checkout` calls for the same `quote_id` must be idempotent for the same reason as PaymentIntent creation.

**When to use:** Every write in the quote → lock → checkout → payment → confirmation chain that involves money or a status transition.

**Trade-offs:** None real — this is strictly required for a Cloudflare Queues consumer, since Queues is **at-least-once delivery, not exactly-once** (Cloudflare's own docs are explicit that consumers must be idempotent). Skipping this is not a shortcut, it's a guaranteed double-charge or double-confirmation-email bug under retry.

**Example:**
```typescript
// webhook handler — synchronous part, must be fast
const event = await stripe.webhooks.constructEventAsync(body, sig, secret, undefined, cryptoProvider);
const { rowCount } = await sql`
  insert into stripe_events (id, type, received_at) values (${event.id}, ${event.type}, now())
  on conflict (id) do nothing`;
if (rowCount > 0) await env.STRIPE_QUEUE.send({ eventId: event.id, type: event.type, data: event.data });
return new Response('ok', { status: 200 }); // ACK regardless — dedup already happened
```

## Data Flow

### Request Flow — Quote → Lock → Checkout → Payment → Confirmation

```
Home widget                /api/quote                 bookings table
  │  POST route+class+date   │                            │
  ├──────────────────────────▶ geocode (Mapbox, KV 24h)    │
  │                           │ distance/duration          │
  │                           │ price = fixed_route ∥       │
  │                           │   per_km*dist + surcharges  │
  │                           │   − coupon (pure function)  │
  │                           │ INSERT bookings              │
  │                           │   status='quote'             │
  │                           │   price_chf, breakdown        │
  │                           │   quote_expires_at=now()+30m │
  │  ◀────────── {quote_id, price_chf, expires_at} ─────────┤
  │
Checkout page               /api/checkout                Stripe
  │ GET quote by quote_id ───▶ SELECT ... WHERE id=$1        │
  │                             AND status='quote'            │
  │                             AND quote_expires_at > now()  │  ← lock enforcement:
  │                           (expired/consumed → 410, force  │    re-quote required
  │                            customer back to widget)       │
  │ passenger details ────────▶ UPDATE bookings SET            │
  │                             status='pending', customer_*   │
  │                           create PaymentIntent              │
  │                             idempotencyKey=booking.id ──────▶ PaymentIntent
  │                             metadata.booking_id=$1           │  created
  │ ◀──────────── clientSecret ────────────────────────────────┤
  │ Stripe.js confirms payment (card/Apple Pay/Google Pay/TWINT) directly with Stripe
                                                                  │
Stripe                      /api/stripe/webhook            Queue           Queue consumer
  │ payment_intent.succeeded ▶ verify signature               │               │
  │                            INSERT stripe_events             │               │
  │                              ON CONFLICT DO NOTHING          │               │
  │                            if inserted: enqueue ─────────────▶ send          │
  │                            return 200 (always, fast)                          │
  │                                                                              ▼
  │                                                          UPDATE bookings SET
  │                                                            status='paid'
  │                                                            WHERE status='pending'
  │                                                          INSERT booking_events
  │                                                          render+send confirmation
  │                                                            email (packages/emails)
  │                                                          UPDATE status='confirmed'
```

**Where authority lives, explicitly:**
- **Price authority:** the `bookings.price_chf` + `price_breakdown` column, written once at quote time. Nothing downstream recomputes it. Checkout, the PaymentIntent amount, and the confirmation email all read this same column.
- **Lock enforcement:** `quote_expires_at` checked at the one moment it matters — when checkout tries to move `quote → pending`. Not a separate lock table, not a client-held token; a plain `WHERE quote_expires_at > now()` on the read. 30 minutes matches `PROJECT.md`'s stated quote lock.
- **Booking status authority:** the `bookings.status` column, mutated only via conditional `UPDATE ... WHERE status = <expected prior state>`, each transition appended to `booking_events` (the audit trail). Nothing ever reads `status` from anywhere but Postgres — not from Stripe's event, not from a cookie.
- **Double-booking prevention:** at this product's scale (pre-booked transfers, not on-demand), double-booking risk isn't concurrent seat contention on a route — it's the *same customer* creating two PaymentIntents for the same quote (double-click, back-button-resubmit) or a webhook retry producing two "paid" transitions. Both are covered by Pattern 3 above (Stripe idempotency key + conditional status update), not by row-locking a route/time slot.

### State Management

```
Public/customer side                         Ops side
┌────────────────────────┐                  ┌──────────────────────────┐
│ Server: Postgres is the │                  │ Server: same Postgres     │
│ single source of truth  │                  │                            │
│ Client: React state +   │                  │ Client: Supabase Realtime │
│ @supabase/ssr cookie for │                 │ subscription (private      │
│ session; VamosLocale-    │                 │ channel, RLS-authorized)   │
│ equivalent lang/cur      │                 │ on bookings + booking_     │
│ cookie, read server-side │                 │ events — board updates     │
│ for SSR, no client poll  │                 │ live without polling        │
└────────────────────────┘                  └──────────────────────────┘
```

- Customer-facing state (locale, currency, booking-in-progress) stays cookie + server-rendered — no client-side Postgres reads, no Realtime subscription for the public site.
- Ops staff state is the only place Realtime is used, scoped to a handful of concurrent staff sessions (well inside Supabase's included concurrent-connection tier).

### Key Data Flows

1. **Pricing computation:** input (route, class, date/time, coupon code) → pure function in `apps/web/lib/pricing` → output (price + breakdown) → persisted once onto `bookings`. Reference tables (`fixed_routes`, `distance_rates`, `surcharges`, `coupons`) are read, never written, by this path.
2. **Payment confirmation:** Stripe is the source of truth for "did the card work"; Postgres is the source of truth for "what does the booking record say" — the webhook → queue → consumer path is the *only* bridge between the two, and it is one-directional (Stripe → Postgres, never Postgres polling Stripe).
3. **Ops live board:** Postgres write (any INSERT/UPDATE on `bookings`) → Supabase Realtime → private, RLS-authorized channel → ops React client. No polling, no client-side fetch loop.
4. **Public content (reviews, FAQ, legal, pricing tables for display):** Postgres → cached at the edge (ISR/Cache Rules + short-TTL Worker-side cache) → served to thousands of browsers without touching Postgres per request.

## Scaling Considerations

| Scale | Architecture Adjustments |
|-------|--------------------------|
| Pre-launch / staging | Single Supabase Micro/Small instance, Hyperdrive default pool, no KV caching needed yet — correctness over throughput |
| Launch, 10k concurrent browsers (`PROJECT.md` target) | Public routes fully cached (ISR + Cache Rules + `stale-while-revalidate`); `/api/quote` is the only public endpoint that must hit Postgres, and even that's dominated by Mapbox latency (KV-cached 24h) not DB latency; Supabase on Small (2GB), PITR on; rate limits + Turnstile on `/api/quote` and public forms |
| Booking volume growth (bookings/day, not browsers) | Bookings are low-frequency writes relative to browsing traffic — this axis scales by Hyperdrive connection pooling headroom and Queue throughput, not by Worker count (Workers already autoscale) |
| Ops staff growth | Realtime concurrent connections stay small (staff headcount, not customer count) — no architecture change needed until staff count is in the hundreds, which this product will not reach |

### Scaling Priorities

1. **First bottleneck: Postgres connections from a serverless edge runtime.** Every Worker invocation is a fresh execution context; without Hyperdrive's connection pooling near the database, thousands of edge requests would each try to open a Postgres connection and exhaust `max_connections`. Hyperdrive is the fix already specified in the fixed stack (Phase 3) — it must be in place *before* any load test, not retrofitted after.
2. **Second bottleneck: uncached public reads.** If home/marketing/legal pages hit Postgres per request, 10k concurrent browsers turns into 10k concurrent queries. The fix is ISR/edge caching on everything that doesn't need per-request freshness (reviews, FAQ, legal, static pricing display) — this is Phase 8 in `GSD-LAUNCH.md` and should be treated as load-bearing, not optional polish.
3. **Third, much smaller bottleneck: Stripe webhook bursts.** A payment provider retry storm (rare, but possible during a Stripe incident) is absorbed by the Queue, not by the synchronous webhook handler — this is exactly why the webhook handler's only job is verify+dedupe+enqueue+ACK, never the actual booking mutation.

## Anti-Patterns

### Anti-Pattern 1: Recomputing price at checkout or in the webhook

**What people do:** Re-run the pricing function when the customer reaches checkout ("just to be safe") or, worse, when the webhook fires, using whatever the rate tables say *right now*.

**Why it's wrong:** Directly violates the constraint that later rule changes never alter historical bookings. It also reopens the exact race the quote-lock exists to prevent — a rate change between quote and payment silently changes what the customer is charged versus what they were shown.

**Do this instead:** Compute once, at `/api/quote`, persist the result onto the `bookings` row, and read that column everywhere downstream. If a booking's price is genuinely wrong (data entry error, dispatcher correction), that is a manual, audited re-price event — a new row in `booking_events` with an actor and a reason, never a silent recomputation.

### Anti-Pattern 2: Doing the booking mutation inside the Stripe webhook handler

**What people do:** Verify the Stripe signature, then directly `UPDATE bookings SET status='paid'` and send the confirmation email, all inside the webhook route handler, before returning 200.

**Why it's wrong:** Stripe expects a fast ACK (documented timeout expectations) and will retry on timeout or non-2xx — retries during a slow email send or a slow DB write turn into duplicate processing exactly where idempotency matters most. It also couples "did we receive the event" to "did every side effect succeed," so a transient Resend outage would cause Stripe to keep retrying a webhook whose actual booking update already succeeded.

**Do this instead:** The webhook handler's entire job is: verify signature → insert into `stripe_events` with `ON CONFLICT DO NOTHING` → if newly inserted, enqueue to Cloudflare Queues → return 200. All booking mutation, emails, and side effects happen in the queue consumer, which can retry independently of Stripe's own retry semantics and is itself idempotent (Pattern 3).

### Anti-Pattern 3: Reading booking state from anywhere but Postgres

**What people do:** Trust a client-held cookie, a Stripe object's local cache, or a KV entry as the current truth for a booking's status.

**Why it's wrong:** Creates multiple sources of truth that can drift — a customer refreshing a stale confirmation page, an ops dashboard reading a cached value while a refund is in flight, etc. This product's core value proposition ("trust that the driver will be there") depends on the booking record being unambiguous.

**Do this instead:** `bookings.status` in Postgres is the only authority. Caching (KV, ISR) is allowed for *read-mostly, non-authoritative* content (marketing pages, published reviews) — never for a specific booking's live status. The confirmation page and manage-booking page are SSR, reading fresh from Postgres on each load; they are not statically cached.

### Anti-Pattern 4: Letting `packages/db` or `packages/emails` become a runtime dependency with side effects

**What people do:** Put a live `pg` client, a Resend SDK call, or a filesystem read inside a shared package so "both the app and the scripts can use it."

**Why it's wrong:** The moment a shared package opens its own DB connection or does I/O, `@opennextjs/cloudflare`'s bundler has to resolve every dependency of that package for the Workers runtime — including transitive Node-only dependencies never audited for edge compatibility. It also means the package can't be safely imported into a queue consumer, a script, or a test without dragging along its opinions about connection pooling or environment variables.

**Do this instead:** Keep `packages/db` to SQL files + generated types (zero runtime deps). Keep `packages/emails` to pure render functions (data in, HTML out, zero deps beyond the templating library). Every actual I/O call — the Hyperdrive query, the Resend send — lives in `apps/web`, called by the route handler or queue consumer that owns that request's lifecycle.

## Integration Points

### External Services

| Service | Integration Pattern | Notes |
|---------|---------------------|-------|
| Supabase Postgres | Hyperdrive-pooled `postgres.js`/`pg`, direct connection string (not the pooled one — Hyperdrive pools) | supabase-js reserved for Auth/Storage/Realtime only, per `GSD-LAUNCH.md` Phase 3 |
| Stripe | PaymentIntent (CHF) + webhook, `constructEventAsync` + `Stripe.createSubtleCryptoProvider()` (Workers has no sync crypto) | Idempotency key = `booking.id`; webhook route allow-listed by signature only |
| Resend | Called from the queue consumer only, never from the webhook handler | Templates from `packages/emails`, rendered per-language |
| Mapbox | Geocoding + Directions, called from `/api/quote` | Results cached in KV 24h by place-id pair — this is the main latency lever for quote speed |
| AeroDataBox (flight) | `/api/flight/:no`, KV-cached | Degrades gracefully to manual time entry when the API is down — never blocks the booking flow |
| Cloudflare Queues | `stripe-events` queue, consumer in the same Worker (`queue()` export) | At-least-once delivery — every consumer action must be idempotent; configure `max_retries` + a dead-letter queue so a permanently-failing message doesn't loop forever |
| Cloudflare KV | Geocode cache, flight cache, optionally short-TTL reference-data cache | Not used for booking status or anything that must be immediately consistent |
| Cloudflare R2 | Chauffeur/vehicle/review photo storage (alternative to Supabase Storage — pick one, `GSD-LAUNCH.md` recommends R2) | Public read, staff write |

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| Public routes ↔ pricing engine | Direct function call within the same Worker (`/api/quote` route handler calls `lib/pricing`) | No network hop — pricing is a pure function, not a separate service |
| Checkout ↔ Stripe | Server-side Stripe SDK call from the route handler | Client only ever sees a `clientSecret`, never talks to Postgres directly |
| Stripe webhook ↔ queue consumer | Cloudflare Queue (async, same Worker, two separate exported handlers: `fetch()` and `queue()`) | This is the one deliberately decoupled boundary in the whole system — see Pattern 3 and Anti-Pattern 2 |
| Public site ↔ ops console | Shared Postgres, shared session/auth system, disjoint route groups (`(public)`/`(account)` vs `(ops)`) | Same deploy, same Worker, enforced separation via role-gated layout + RLS, not via network boundary |
| `apps/web` ↔ `packages/db` | Build-time import of SQL/types only | See Anti-Pattern 4 |
| `apps/web` ↔ `packages/emails` | Build-time import of pure render functions | See Anti-Pattern 4 |

## Build Order & Parallelization

This section translates the boundaries above into a build sequence, cross-referencing `GSD-LAUNCH.md`'s phase numbering.

**Strict dependency chain (cannot parallelize):**
1. Scaffold (`apps/web` on Workers, CI, design tokens ported) — Phase 1
2. Supabase schema + RLS + auth (`packages/db` migrations) — Phase 2 — blocks everything that reads/writes data
3. Hyperdrive data access wired into `apps/web/lib/db` — Phase 3 — blocks any real query
4. Pricing engine + `/api/quote` — Phase 4 — blocks checkout, since checkout reads a quote row
5. Checkout + payment + webhook/queue lifecycle — Phase 5 — blocks any surface that shows real booking status (confirmation, account, ops board)

**Genuinely parallelizable once Phase 3 (data access) lands:**
- **Public surface porting** (Phase 6 marketing/legal/account pages) and **pricing engine build** (Phase 4) touch almost disjoint code — the pricing engine owns `lib/pricing` + `bookings`/`fixed_routes`/`distance_rates`/`surcharges`/`coupons`; page porting owns `app/(public)/*` reading `reviews`/`content_strings`/`settings`. These can run concurrently once the schema (Phase 2) and Hyperdrive wiring (Phase 3) exist, since page-porting work for static/ISR pages doesn't depend on the pricing engine being finished — only the home booking widget and checkout do.
- **`packages/emails` templates** (all four languages) have zero dependency on the queue consumer being wired — they're pure render functions and can be built and visually reviewed the moment the design system's React components exist (post-Phase 1), fully in parallel with Phases 2–5.
- **Ops console screens that don't touch live money** (fleet, chauffeurs, content editor, pricing-table admin, reviews admin) depend only on Phase 2 (schema) + Phase 3 (data access) — they can be built in parallel with Phase 4/5 (pricing engine, checkout), since they're CRUD over reference tables, not participants in the payment state machine. Only **OpsBoard** (needs live `bookings` + Realtime) and **OpsDetail's assignment flow** (needs the full booking lifecycle) are gated on Phase 5.
- **Hardening work** (Phase 8: cache rules, rate limits, Turnstile, WAF, observability) is largely orthogonal to feature build-out and can be started incrementally as soon as each surface it targets exists — it doesn't need to wait for every phase to finish, only for the specific route it's hardening.

**Sequencing implication for the roadmap:** treat "pricing engine" and "surface porting (static/ISR pages + email templates + non-money ops screens)" as two parallel tracks after the data-access phase, converging at checkout/payment, which is the one phase every money-touching surface (confirmation, account bookings, ops board, ops detail assignment) is downstream of.

## Sources

- [OpenNext Cloudflare — GitHub](https://github.com/opennextjs/opennextjs-cloudflare) — HIGH confidence, official adapter repo
- [Next.js on Cloudflare Workers — Cloudflare docs](https://developers.cloudflare.com/workers/framework-guides/web-apps/nextjs/) — HIGH confidence, official docs
- [OpenNext Cloudflare Troubleshooting](https://opennext.js.org/cloudflare/troubleshooting) — HIGH confidence, official docs (serverExternalPackages guidance)
- [Deploying a Next.js Monorepo to Cloudflare Workers — Lewis Kori](https://lewiskori.com/blog/deploying-a-next-js-monorepo-to-cloudflare-workers/) — MEDIUM confidence, practitioner write-up, cross-checked against official docs
- [Cloudflare Queues — Batching, Retries and Delays](https://developers.cloudflare.com/queues/configuration/batching-retries/) — HIGH confidence, official docs (at-least-once, max_retries default 3)
- [Cloudflare Queues — Dead Letter Queues](https://developers.cloudflare.com/queues/configuration/dead-letter-queues/) — HIGH confidence, official docs
- [Supabase Realtime — Broadcast and Presence Authorization](https://supabase.com/blog/supabase-realtime-broadcast-and-presence-authorization) — HIGH confidence, official Supabase blog
- [Supabase Realtime Authorization docs](https://supabase.com/docs/guides/realtime/authorization) — HIGH confidence, official docs (private channels, RLS on `realtime.messages`)
- [Supabase Postgres Changes docs](https://supabase.com/docs/guides/realtime/postgres-changes) — HIGH confidence, official docs
- Stripe idempotency key pattern (deterministic key per operation, 24h dedup window) — HIGH confidence, well-established Stripe API behavior, cross-checked across multiple practitioner sources
- `docs/build/GSD-LAUNCH.md` (this repo) — the fixed phase plan and proposed schema this document is grounded in
- `.planning/codebase/ARCHITECTURE.md` (this repo) — existing mock-package structure and end-state architecture sketch this document extends

---
*Architecture research for: Vamos Taxi V1 — booking/payments/dispatch on Cloudflare Workers + Supabase*
*Researched: 2026-08-17*
