# Stack Research

**Domain:** Swiss pre-booked airport-transfer booking platform — Next.js on a single Cloudflare Worker, Supabase behind Hyperdrive, Stripe payments
**Researched:** 2026-08-17
**Confidence:** HIGH overall (official Cloudflare/Supabase/Stripe docs verified live); MEDIUM on a few fast-moving edges called out below

> The stack itself is fixed by the owner (`HANDOFF-CLAUDE-CODE.md` §3) and is not re-litigated
> here. This file documents **how to use each piece correctly right now** — current package
> versions, required config shapes, and the specific gotchas that will burn a Workers-based
> Next.js 15 + Supabase + Stripe build if missed.

## Recommended Stack

### Core Technologies

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| Next.js | **15.5.x** (latest patch, e.g. `15.5.23`) | App Router framework | 15.5 is the last minor before Next 16; it shipped stable Node.js middleware and Turbopack builds (beta). Next 15 is now the "Maintenance LTS" line getting security-only patches (15.5.18/15.5.21/15.5.23 seen in the last month) — pin to the newest 15.5.x patch, not a mid-series 15.x. |
| `@opennextjs/cloudflare` | **1.20.x** (latest, e.g. `1.20.2`) | Adapts Next.js build output to run as a Cloudflare Worker | The only supported non-Vercel path to run Next.js SSR on Workers. Reached 1.0 GA; current 1.x builds against **unmodified** Next.js 14.x/15.x output (no more patching Next internals). Actively tracks Next.js security patches. |
| `wrangler` | **latest 4.x** | Cloudflare CLI: dev, deploy, secrets, Hyperdrive/Queues/KV/R2 config | Required peer of `@opennextjs/cloudflare`; keep it current, the adapter's generated `wrangler.jsonc` schema moves with it. |
| Supabase (Postgres/Auth/Storage/Realtime) | Platform, Pro plan, **region eu-central (Frankfurt)** | Primary datastore | Fixed by owner. Frankfurt is the closest Supabase region to Zurich. |
| `postgres` (postgres.js) | **latest 3.x** | SQL driver from the Worker, through Hyperdrive | Cloudflare's own Hyperdrive docs recommend postgres.js or `pg` over the supabase-js query client for anything going through Hyperdrive; postgres.js has first-class named-prepared-statement support, which Hyperdrive explicitly calls out as the best-supported case. |
| `pg` (node-postgres) | **latest 8.x** | Alternative SQL driver | Equally supported by Hyperdrive; slightly more ceremony (`Client`/`Pool`, manual `.connect()`/`.end()`) but more familiar if the team already knows it. Pick **one**, not both. |
| Stripe (`stripe` npm package) | **latest 22.x** (e.g. `22.5.0`) | Payments — PaymentIntents, webhooks | Standard account (not Connect), CHF, cards + Apple Pay + Google Pay + TWINT. Node SDK runs on Workers when initialized with `Stripe.createFetchHttpClient()` and verified with the async, WebCrypto-based webhook path (below) — this is officially supported, Cloudflare even blogged about native Stripe support in Workers. |
| `@stripe/stripe-js` | **latest 9.x** | Client-side Payment Element | Loads Stripe.js in the browser for the Payment Element (Apple/Google Pay + TWINT show up automatically as payment-method-configuration-driven options, no separate SDK). |
| `@supabase/ssr` | **0.12.x** (latest) | Cookie-based Supabase Auth in Next.js middleware/server components | Purpose-built replacement for the deprecated `@supabase/auth-helpers-nextjs`. Works fine under the Node.js runtime that OpenNext's Worker actually uses (see Q1 below) since it only needs `fetch` + cookies, no Edge-runtime-specific API. |
| `@supabase/supabase-js` | **2.11x.x** (latest 2.x) | Auth/Storage/Realtime client | Fixed scope per the brief: **only** Auth token verification, Storage, and Realtime go through supabase-js. All row-level app queries go through Hyperdrive + SQL, never the PostgREST/query layer, to avoid double-hopping through Supavisor. |
| Resend | latest `resend` npm package | Transactional email | Official Cloudflare-Workers-compatible fetch-based SDK; no Node-only APIs. |
| Mapbox | Geocoding v6 + Directions v5 (`@mapbox/mapbox-sdk` or raw `fetch`) | Geocode + route distance/duration for pricing | Fixed. Cache geocode/route results in Workers KV — Mapbox usage is billed per request and pickup/dropoff pairs repeat heavily for Zurich airport traffic. |
| AeroDataBox | via RapidAPI or api.aerodatabox.com direct plan | Flight status for autofill + delay detection | Fixed. Cache flight-number lookups in KV with a short TTL (minutes, not hours — flight status changes) and degrade to manual time entry on API failure per `GSD-LAUNCH.md` Phase 4. |
| Sentry (`@sentry/nextjs`) | latest, Cloudflare-runtime build | Error monitoring, server + client | Sentry now ships an official **Cloudflare + Next.js (OpenNext)** setup guide (`docs.sentry.io/platforms/javascript/guides/cloudflare/frameworks/nextjs`), current as of mid-2025. It requires its own `compatibility_flags`/`compatibility_date` bump on top of OpenNext's — see Pitfalls below. Confidence: MEDIUM — this integration path is newer and has open historical GitHub issues around source-map upload and `AsyncLocalStorage` in edge contexts; smoke-test error capture in staging before relying on it. |

### Supporting Libraries

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Drizzle ORM (optional) | latest | Typed query layer over the Hyperdrive `postgres.js`/`pg` connection | `packages/db` in the monorepo shape the build plan specifies; not required, but keeps the 10+ tables (`bookings`, `booking_events`, `coupons`, …) typed without hand-writing every query. Works with both postgres.js and node-postgres drivers over Hyperdrive — same "reset the connection per request" caveat applies (see Pitfalls). |
| `zod` | latest | Runtime validation for `/api/quote`, webhook payloads, form input | Server-authoritative quotes and Stripe webhook bodies both need runtime schema checks before they touch the DB — TypeScript types alone don't validate untrusted input at the edge. |
| `react-email` + `@react-email/components` | latest | Building the Resend templates in 4 languages | Pairs naturally with Resend's official Next.js integration; keeps `packages/emails` testable/previewable outside the Worker. |
| `@marsidev/react-turnstile` (or hand-rolled widget + `env.TURNSTILE_SECRET` siteverify call) | latest | Turnstile on public forms (`/api/quote` abuse, contact/partner forms) | Client widget renders the token; **always** verify server-side via `https://challenges.cloudflare.com/turnstile/v0/siteverify` in the Worker — never trust the client-supplied token alone. |
| `date-fns-tz` or `Temporal` polyfill | latest | Europe/Zurich pickup-time handling, DST-safe | `bookings.pickup_at` is `timestamptz` but the UI, cron sweeps and emails all reason in Europe/Zurich local time; DST transitions (last Sunday March/October) will silently shift pickup times by an hour if this is done with naive `Date` math. |

### Development Tools

| Tool | Purpose | Notes |
|------|---------|-------|
| `supabase` CLI | Local Postgres, migrations, type generation | `supabase init`, versioned migrations in `packages/db`, `supabase gen types typescript` feeds both the app and Drizzle (if used). |
| `wrangler dev` / `opennextjs-cloudflare preview` | Local Worker runtime for testing | `next dev` alone does **not** exercise the real Workers runtime (Node.js compat layer, bindings, Hyperdrive). Always smoke-test with `opennextjs-cloudflare build && wrangler dev` before trusting a change that touches bindings, auth cookies, or the webhook path. |
| GitHub Actions | CI: typecheck, build, deploy | `wrangler versions upload` on PR gives a real preview URL on Workers infrastructure without touching prod — this replaces the Vercel-preview-deploy workflow the team doesn't have. |
| k6 | Load testing for the 10k-concurrent target (Phase 8) | Scripts already scoped in `GSD-LAUNCH.md`; nothing stack-specific to add here beyond: hit the Worker directly, not through DNS caching, to get real p95s. |

## Installation

```bash
# Core
npm install next@^15.5 react@^19 react-dom@^19
npm install -D @opennextjs/cloudflare wrangler

# Database access (pick ONE driver)
npm install postgres            # postgres.js — recommended default
# — or —
npm install pg && npm install -D @types/pg

# Supabase (auth/storage/realtime only — not the query layer)
npm install @supabase/ssr @supabase/supabase-js

# Payments
npm install stripe @stripe/stripe-js @stripe/react-stripe-js

# Email
npm install resend react-email @react-email/components

# Validation / dates
npm install zod date-fns-tz

# Error monitoring
npm install @sentry/nextjs

# Turnstile (client widget)
npm install @marsidev/react-turnstile

# Dev dependencies
npm install -D typescript @types/node
```

```jsonc
// wrangler.jsonc — minimum shape for @opennextjs/cloudflare + Next.js 15
{
  "$schema": "node_modules/wrangler/config-schema.json",
  "name": "vamos-web",
  "main": ".open-next/worker.js",
  "compatibility_date": "2025-08-16",       // ≥ Sentry's floor; also satisfies OpenNext's 2024-09-23 floor
  "compatibility_flags": ["nodejs_compat", "global_fetch_strictly_public"],
  "assets": {
    "directory": ".open-next/assets",
    "binding": "ASSETS"
  },
  "services": [
    { "binding": "WORKER_SELF_REFERENCE", "service": "vamos-web" }
  ],
  "hyperdrive": [
    { "binding": "HYPERDRIVE", "id": "<hyperdrive-config-id>" }
  ],
  "queues": {
    "producers": [{ "queue": "vamos-webhooks", "binding": "PAYMENT_QUEUE" }],
    "consumers": [{ "queue": "vamos-webhooks", "max_batch_size": 10, "max_retries": 5 }]
  },
  "kv_namespaces": [{ "binding": "GEO_CACHE", "id": "<kv-id>" }],
  "r2_buckets": [{ "binding": "NEXT_INC_CACHE_R2_BUCKET", "bucket_name": "vamos-isr-cache" }],
  "triggers": {
    "crons": ["*/15 * * * *", "0 3 * * *"]   // quote expiry sweep, nightly reminder/no-show sweep
  }
}
```

## Answers to the five specific questions

### 1. `@opennextjs/cloudflare` — version, config shape, limitations

- **Current version:** `1.20.x` (npm), tracking Next.js `15.5.x`/`16.x` in lockstep — reached 1.0 GA and now builds against **unmodified** Next.js output rather than patching Next internals. Confidence: HIGH (npm registry + official changelog).
- **`compatibility_date`:** must be **`2024-09-23` or later** — this is the floor for the Node.js APIs the adapter depends on. If Sentry is added, bump to **`2025-08-16` or later** (Sentry's own floor for `https.request` support) — the later date satisfies both.
- **`compatibility_flags`:** `["nodejs_compat"]` is required. Add `"global_fetch_strictly_public"` (recommended by the adapter's generated config) to stop server-side `fetch` from reaching internal Worker services.
- **`assets` binding:** `{ "directory": ".open-next/assets", "binding": "ASSETS" }` — do not hand-edit these paths; they're generated by the build.
- **`main`:** `.open-next/worker.js` by default. **This must change** to a custom entry file the moment you need `scheduled()` (Cron Triggers) or a `queue()` consumer in the same Worker (see Q5) — re-export `fetch` from the generated worker and add the extra handlers alongside it; re-export `DOQueueHandler`/`DOShardedTagCache` too if using the Durable-Object-backed ISR queue/tag cache.
- **Runtime model:** the adapter runs Next.js **exclusively on the Node.js runtime** inside the Worker (not the Edge runtime) — this is actually an advantage over some other Workers deployment paths, because it gets you the *full* set of Next.js features rather than the Edge-runtime subset.
- **Known limitations vs Vercel/other hosts** (HIGH confidence, current as of the OpenNext docs read live):
  - **Node.js Middleware** (the `export const runtime = "nodejs"` middleware mode introduced in Next 15.2) is **not yet supported** — stick to standard (Edge-compatible) middleware, which is exactly what `@supabase/ssr`'s middleware pattern uses, so this does not block the auth flow.
  - **Image optimization**: `next/image` with the default loader does **not** work out of the box — you must either set `images.unoptimized = true` or wire a custom `loader: "custom"` pointing at Cloudflare's `/cdn-cgi/image/` transform endpoint (only PNG/JPEG/WEBP/AVIF/GIF/SVG supported).
  - **ISR/revalidation** works but is *not* Vercel's managed ISR — you must explicitly choose and wire an incremental-cache backend (R2, KV, or static-assets-only) plus a tag-cache backend (D1 or Durable-Object-SQLite) plus a revalidation queue backend (Durable-Object queue, in-memory, or "direct" debug mode). **Recommendation for this project: R2 for the incremental cache + D1 for the tag cache + the Durable Object queue** — the site is read-heavy (home, marketing, legal) with infrequent revalidation (reviews, FAQ, content_strings edits from ops), which is exactly the R2+D1 profile the docs recommend for smaller deployments. Cloudflare explicitly advises **against KV** for the incremental cache because it's only eventually consistent.
  - Cache purge / on-demand `revalidatePath`/`revalidateTag` only works reliably on **custom domains** (zone-based deployments), not on `*.workers.dev` — another reason `staging.vamostaxi.eu` needs to be a real Cloudflare-zone custom domain from Phase 1, not a `workers.dev` subdomain.
  - **PPR** (Partial Prerendering) is supported but cache interception does not work with it and is off by default — leave PPR off unless a specific page needs it and you've tested the interaction.
  - **Next.js 16 caveat (informational, not a launch blocker):** there is an open, actively-discussed compatibility gap between Next.js 16's new "Proxy" middleware architecture and the current OpenNext Cloudflare adapter. Since this project is pinned to **Next.js 15**, it doesn't block launch — but do not upgrade to Next 16 opportunistically mid-build without re-verifying adapter support first.

### 2. Hyperdrive + Supabase — connection string, driver, limits, prepared statements

- **Always use Supabase's DIRECT connection string** (the `db.<project-ref>.supabase.co:5432` one), **never** the pooled/Supavisor transaction-mode string. Hyperdrive does its own global connection pooling near the origin database; pointing it at an already-pooled connection string double-pools and defeats prepared-statement support. This is stated explicitly in Cloudflare's own Supabase-specific Hyperdrive doc. Confidence: HIGH.
- **Driver:** postgres.js (`postgres` package) or `pg` — both are Hyperdrive's officially recommended drivers over the Supabase JS query client for anything that isn't Auth/Storage/Realtime. Named prepared statements are best-supported by these two; other drivers "may have worse performance or may not be supported."
- **Connection pattern in the Worker:** create a **new client per request** (do not try to persist a module-scope pool across invocations — Workers isolates don't support that the way long-lived Node processes do). Hyperdrive itself maintains the real pool to the origin, so per-request client creation is cheap. With `pg`, close the client via `ctx.waitUntil(client.end())` *after* the response is returned so cleanup doesn't add to response latency. With postgres.js, `max: 5` per Hyperdrive-bound client is the documented ceiling (Workers limits concurrent external connections per invocation) — the build plan's `max: 5` is correct and should not be raised.
- **Max origin connections (Hyperdrive-side, not driver-side):** **~20 on Cloudflare's Free tier, ~100 on Paid** per Hyperdrive configuration. Idle-connection timeout to the origin is 10 minutes; initial connection timeout is 15 seconds; **max query duration is 60 seconds**; max cached query response size is 50 MB. Design any reporting/export queries (e.g. a future finance report) to stay well under the 60 s ceiling or move them off the request path into a Queue/cron job.
- **Prepared statements / transaction-mode caveats:** Hyperdrive operates as a **transaction-mode pool** to the origin — a connection is held for the duration of one transaction, then returned to the pool and **reset** (any `SET` session state does not persist). Do **not** wrap multiple unrelated DB operations in one transaction just to preserve session state — it blocks pool reuse and hurts scaling. Keep transactions short and scoped to a single logical write (e.g. the booking-status transition + its `booking_events` row, not the whole checkout flow).
- **supabase-js scope discipline:** per the fixed architecture, supabase-js talks to Supabase directly for **Auth token verification, Storage, and Realtime only**. All row-level application queries (`bookings`, `coupons`, `settings`, etc.) go through Hyperdrive + SQL. Mixing the two paths for the same table risks inconsistent read timing (Realtime/PostgREST vs. Hyperdrive's pooled connection) and is explicitly what the fixed stack is designed to avoid.

### 3. Stripe on Workers — webhook verification, CHF, TWINT, idempotency

- **Workers has no synchronous Node `crypto`**, so the standard `stripe.webhooks.constructEvent()` (sync, HMAC via Node's `crypto` module) will throw. The correct call is:

  ```ts
  import Stripe from "stripe";

  const stripe = new Stripe(env.STRIPE_SECRET_KEY, {
    httpClient: Stripe.createFetchHttpClient(),
  });
  const cryptoProvider = Stripe.createSubtleCryptoProvider();

  export async function verifyStripeWebhook(request: Request, env: Env) {
    const sig = request.headers.get("stripe-signature")!;
    const body = await request.text();               // raw body — do not JSON.parse first
    return await stripe.webhooks.constructEventAsync(
      body,
      sig,
      env.STRIPE_WEBHOOK_SECRET,
      undefined,
      cryptoProvider,                                  // WebCrypto-based SubtleCrypto provider
    );
  }
  ```

  Both `httpClient: Stripe.createFetchHttpClient()` on the client constructor and `Stripe.createSubtleCryptoProvider()` passed into `constructEventAsync` are required for Workers — Cloudflare has native/blogged support for the Stripe SDK specifically because of this pairing. Confidence: HIGH (Stripe's own Cloudflare Workers template + Cloudflare's blog post confirm this exact pattern).
  - Read the raw body with `.text()` **once** — a known Workers/Stripe gotcha is "Body has already been used" if the same `Request` is read twice (e.g. logging middleware that also awaits `.json()`); clone with `request.clone()` if you need the body twice.
- **CHF PaymentIntents:** create the PaymentIntent with `currency: "chf"` and `automatic_payment_methods: { enabled: true }` (recommended over hardcoding a `payment_method_types` array) so Stripe surfaces cards, Apple Pay, Google Pay, and TWINT automatically based on the Payment Method Configuration active on the CH-entity account and the customer's device/browser — this matches the "cards + TWINT + Apple/Google Pay" requirement without per-method client logic.
- **TWINT enablement:** activate it once in the Stripe Dashboard → **Settings → Payment methods** (filter by "Bank redirects" to find it faster). The Stripe account **must be a Swiss entity** to receive TWINT payouts — confirmed already fixed by the "Stripe standard account, CHF" decision. TWINT is a redirect-style method: mobile customers bounce to the TWINT app, desktop customers scan a QR code — the Payment Element/redirect flow (`stripe.confirmPayment` with a `return_url`) handles this automatically; no custom redirect handling needed if using the Payment Element.
- **Idempotency:** pass an `Idempotency-Key` header (or the SDK's `{ idempotencyKey }` request option) on **every** PaymentIntent-creating request keyed to the booking/quote id, so a client retry (flaky mobile network at an airport) cannot create two charges for one booking. On the webhook side, the build plan's `stripe_events (id pk)` table with `INSERT ... ON CONFLICT (id) DO NOTHING` before enqueuing to Cloudflare Queues is the correct dedupe pattern — Stripe **can and does** redeliver the same event, and Queues can also redeliver a message on consumer failure, so dedupe needs to happen at the Stripe-event-id level, not just the queue-message level.

### 4. `@supabase/ssr` in Next middleware on a Worker + custom JWT claims

- **`@supabase/ssr` works unmodified** inside OpenNext's Worker because Next.js middleware there still runs on the (Edge-compatible) middleware runtime that `@supabase/ssr` targets — only the *page/route* rendering moved to Node.js runtime under OpenNext, not middleware itself. The standard pattern applies:

  ```ts
  // middleware.ts
  import { createServerClient } from "@supabase/ssr";
  import { NextResponse, type NextRequest } from "next/server";

  export async function middleware(request: NextRequest) {
    let response = NextResponse.next({ request });
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll: () => request.cookies.getAll(),
          setAll: (cookiesToSet) => {
            cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
            response = NextResponse.next({ request });
            cookiesToSet.forEach(({ name, value, options }) =>
              response.cookies.set(name, value, options),
            );
          },
        },
      },
    );
    await supabase.auth.getClaims();   // refreshes the session; do NOT use getSession() server-side
    return response;
  }
  ```

  **Use `supabase.auth.getClaims()`, never `getSession()`, on the server** — Supabase's own docs are explicit that `getSession()` server-side trusts an unverified cookie value, while `getClaims()` verifies the JWT signature against Supabase's published keys. This matters directly for the ops route group's staff-gating.
- **Custom JWT claims (the `role: dispatcher|admin` claim the build plan needs):** implemented via a **Custom Access Token Hook** — a Postgres function (`custom_access_token_hook(event jsonb) returns jsonb`) registered under **Authentication → Hooks** in the Supabase dashboard. It receives the pending claims, and you `jsonb_set`/`jsonb_build_object` in the `role` value read from `profiles.role` before Supabase signs the token. Supabase auto-grants `supabase_auth_admin` execute permission on the function. The hook only affects the **access token JWT**, not the `auth.getUser()` response shape — read the role by decoding the JWT (or via `getClaims()`, which returns the verified claim set) rather than expecting it on the user object.
- **Route-group gating:** `/(ops)/ops/*` middleware checks the `role` claim from `getClaims()`, redirects to `/ops/sign-in` if absent/wrong role, and — per the fixed requirement — TOTP MFA enrollment/verification (`supabase.auth.mfa.*`) gates staff sign-in before the session is considered fully authenticated for ops routes.

### 5. Cloudflare Queues + Cron Triggers in the same Worker

- **Queues consumer for payment webhooks:** the webhook route's only job is to verify the signature (§3), `INSERT ... ON CONFLICT DO NOTHING` the Stripe event id, `env.PAYMENT_QUEUE.send(event)`, and return `200` fast — Stripe times out and retries webhooks that don't ack quickly, and the actual state-machine work (booking `pending→paid→confirmed`, email send, `booking_events` write) belongs in the **queue consumer**, not the webhook handler, so a slow email provider or a DB hiccup can't cause Stripe to see a failed/timed-out webhook and duplicate-retry it.
- **Wrangler config:** producers and consumers are declared separately —
  ```jsonc
  "queues": {
    "producers": [{ "queue": "vamos-webhooks", "binding": "PAYMENT_QUEUE" }],
    "consumers": [{ "queue": "vamos-webhooks", "max_batch_size": 10, "max_retries": 5 }]
  }
  ```
  and the consumer is a `queue(batch, env, ctx)` export — batches default to 10 messages; process each message idempotently (re-check `stripe_events`/booking status before mutating) since Queues guarantees at-least-once delivery, not exactly-once.
- **Combining `fetch`, `scheduled`, and `queue` in ONE Worker (required by the "one Worker" architecture decision):** the default `@opennextjs/cloudflare` build only exports a `fetch` handler from `.open-next/worker.js`. To add Cron Triggers and a Queues consumer to the *same* deployed Worker, write a thin custom entry file and point `wrangler.jsonc`'s `main` at it instead of the generated file directly:

  ```ts
  // src/worker.ts
  import nextHandler from "../.open-next/worker.js";

  export default {
    fetch: nextHandler.fetch,
    async scheduled(event: ScheduledController, env: Env, ctx: ExecutionContext) {
      switch (event.cron) {
        case "*/15 * * * *": /* expire stale 30-min quote locks */ break;
        case "0 3 * * *":    /* T-24h reminder emails + no-show sweep */ break;
      }
    },
    async queue(batch: MessageBatch, env: Env, ctx: ExecutionContext) {
      for (const msg of batch.messages) { /* process Stripe event, then msg.ack() */ }
    },
  } satisfies ExportedHandler<Env>;

  // Re-export only if using the DO-backed ISR queue/tag cache from Q1:
  export { DOQueueHandler, DOShardedTagCache } from "../.open-next/worker.js";
  ```
- **Cron Triggers config:** declared under `triggers.crons` as an array of standard cron expressions, evaluated in **UTC** (not Europe/Zurich) — `0 3 * * *` is 03:00 UTC = 04:00 or 05:00 local depending on DST, so if the reminder sweep needs to fire at a specific *local* clock time, compute the UTC offset in code (via `date-fns-tz`) rather than hardcoding a UTC cron that silently drifts an hour twice a year. Multiple triggers share the single `scheduled()` handler; branch on `event.cron` (or `controller.cron`) to run the right job. For any sweep expected to take more than a few seconds, have `scheduled()` enqueue work onto a Queue rather than doing it inline — Cron Trigger invocations have the same CPU-time constraints as a normal Worker request.

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|--------------------------|
| postgres.js for Hyperdrive | `pg` (node-postgres) | If the team is already fluent in `pg`'s API/error types, or needs a feature postgres.js lacks (rare); functionally both are Hyperdrive's blessed drivers — this is a team-preference choice, not a correctness one. |
| R2 + D1 + DO queue for ISR cache | KV for incremental cache | Never for this project — Cloudflare's own docs advise against KV here because it's eventually consistent, which risks serving stale legal/pricing content after an ops edit. Keep KV for the Mapbox/AeroDataBox response cache instead, where eventual consistency is harmless. |
| Custom Turnstile siteverify call in the Worker | A managed WAF-only bot rule | Turnstile protects specific form submissions (quote spam, contact/partner forms) with a UX the user sees; WAF/rate-limiting rules (already in the fixed stack) protect the edge broadly. Use both — they solve different layers, not either/or. |

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|--------------|
| `stripe.webhooks.constructEvent()` (sync) in the Worker | Throws — Workers has no synchronous Node `crypto`, which sync HMAC verification needs. | `constructEventAsync()` + `Stripe.createSubtleCryptoProvider()` (§3 above). |
| Supabase's **pooled/Supavisor** connection string as the Hyperdrive origin | Double-pools (Supavisor transaction pool → Hyperdrive pool), breaks named prepared statements, and is explicitly against Cloudflare's own Supabase guide. | The **direct** connection string only. |
| supabase-js for row-level app queries (`bookings`, `coupons`, pricing tables, etc.) | Bypasses Hyperdrive's pooling/caching entirely and creates a second, inconsistent read path against the same tables Realtime/PostgREST also touches. | Hyperdrive + `postgres.js`/`pg` for all app SQL; supabase-js only for Auth/Storage/Realtime. |
| `next/image`'s default loader, unconfigured, on Workers | Silently fails to optimize/serve images correctly — OpenNext doesn't proxy Vercel's image optimization API. | `images.unoptimized = true` for simple cases, or a custom loader against Cloudflare's `/cdn-cgi/image/` endpoint if real-time resizing is wanted. |
| KV as the Next.js incremental cache backend | Eventually consistent — a content edit in ops (reviews, FAQ, `content_strings`) can serve stale for longer than acceptable. | R2 for the incremental cache, D1 (or DO-SQLite at higher scale) for the tag cache. |
| Doing the full booking-state-machine transition inside the Stripe webhook HTTP handler | Slow downstream work (email send, DB writes) inside the handler risks Stripe seeing a timeout and retrying, which then races with the queue-based retry too. | Verify + dedupe + enqueue in the webhook handler; do the actual work in the Queues consumer. |
| Hardcoding a UTC cron expression and assuming it maps to a fixed Europe/Zurich local time | Switzerland observes DST (CEST/CET); a `0 3 * * *` UTC cron drifts an hour relative to local wall-clock time twice a year. | Compute/adjust for the CH offset in the `scheduled()` handler logic, or schedule two crons that only act in their respective DST window. |
| Assuming Node.js Middleware (Next 15.2's `runtime: "nodejs"` middleware mode) works under OpenNext today | Explicitly listed as **not yet supported** by the adapter. | Use standard (Edge-runtime-compatible) middleware — which is what `@supabase/ssr`'s documented pattern already uses, so this costs nothing in practice. |

## Stack Patterns by Variant

**If a page/section needs on-demand revalidation the moment ops edits content (reviews, FAQ, `content_strings`, `settings`):**
- Use `revalidateTag()`/`revalidatePath()` from the ops write action, backed by the D1 tag cache.
- Because on-demand purge is reliable only on a real custom domain (not `*.workers.dev`), make sure `staging.vamostaxi.eu` and prod are both zone-bound custom domains from Phase 1 onward.

**If a scheduled job (reminder emails, no-show sweep) is more than a few seconds of work:**
- Use Cron Trigger → `env.PAYMENT_QUEUE`-style queue `.send()` → separate queue consumer, not inline work in `scheduled()`.

**If Sentry error capture looks unreliable in staging (dropped server errors, source-map gaps):**
- Treat it as an open integration risk (MEDIUM confidence area), not a project bug first — check `docs.sentry.io`'s Cloudflare/Next.js guide for the current `compatibility_date` floor and confirm `nodejs_compat` + the Sentry-required flags are both present before debugging further.

## Version Compatibility

| Package A | Compatible With | Notes |
|-----------|------------------|-------|
| `@opennextjs/cloudflare@1.20.x` | `next@15.5.x`, `next@16.2.x` | The 1.x adapter line tracks both current Next major lines; pin `next` to `15.5.x` per the fixed-stack decision and don't opportunistically jump to 16 without re-checking the adapter's Next-16-Proxy-architecture compatibility notes first. |
| `wrangler@4.x` | `@opennextjs/cloudflare@1.20.x` | Keep both current together; the adapter's generated `wrangler.jsonc` schema assumes a recent Wrangler. |
| `compatibility_date: "2024-09-23"` (OpenNext floor) vs `"2025-08-16"` (Sentry floor) | Both apply to the same Worker | Set `compatibility_date` to the **later** of the two dates actually required by everything installed (currently Sentry's `2025-08-16`) — a later date is always safe for an earlier floor requirement. |
| `postgres.js`/`pg` prepared statements | Hyperdrive's transaction-mode pool | Fine for `SELECT`/simple `INSERT`/`UPDATE`; avoid multi-statement transactions relying on session-level `SET` state, since the pooled connection resets on transaction return. |
| `@supabase/ssr@0.12.x` | Next.js middleware (Edge-compatible runtime) under OpenNext | No conflict — middleware doesn't run in OpenNext's Node.js-runtime page rendering path, so `@supabase/ssr`'s documented Next.js pattern needs no Workers-specific changes. |

## Sources

- `developers.cloudflare.com/hyperdrive/examples/connect-to-postgres/postgres-database-providers/supabase/` — direct-vs-pooled connection string guidance for Supabase specifically. HIGH.
- `developers.cloudflare.com/hyperdrive/platform/limits/` — max connections (Free ~20 / Paid ~100), 60 s query timeout, 50 MB cache limit, 10 min idle timeout. HIGH.
- `developers.cloudflare.com/hyperdrive/configuration/how-hyperdrive-works/` — transaction-mode pooling behavior, prepared statement support, SET-state reset caveat. HIGH.
- `opennext.js.org/cloudflare/get-started`, `.../caching`, `.../howtos/custom-worker`, `.../howtos/image` — wrangler.jsonc shape, ISR/cache backend options, custom worker pattern for cron/queue, image optimization config. HIGH (official OpenNext docs, fetched live).
- npm registry (`@opennextjs/cloudflare`, `@supabase/ssr`, `@supabase/supabase-js`, `stripe`) — current published versions as of research date. HIGH.
- `docs.stripe.com/payment-method/twint`, `stripe.com/legal/twint` — TWINT enablement and CH-entity requirement. HIGH.
- Stripe's `stripe-node-cloudflare-worker-template` (GitHub) + Cloudflare's "Stripe support in Workers" blog post — `constructEventAsync`/`createSubtleCryptoProvider`/`createFetchHttpClient` pattern. HIGH.
- `supabase.com/docs/guides/auth/server-side/nextjs`, `.../auth/auth-hooks/custom-access-token-hook` — middleware cookie pattern, `getClaims()` vs `getSession()`, custom JWT role claims. HIGH.
- `developers.cloudflare.com/queues/*`, `developers.cloudflare.com/workers/runtime-apis/handlers/scheduled/` — Queues producer/consumer config, Cron Trigger UTC scheduling, multi-cron `event.cron` branching. HIGH.
- `docs.sentry.io/platforms/javascript/guides/cloudflare/frameworks/nextjs/` — Sentry-on-OpenNext-Cloudflare config requirements. MEDIUM-HIGH (official, current, but a newer integration path with some historical rough edges found in GitHub issue search).
- WebSearch aggregation across Cloudflare community threads, dev.to write-ups on cron+queue custom workers — corroborating detail where official docs were thin (e.g. exact custom-worker code shape). MEDIUM.

---
*Stack research for: Swiss pre-booked airport-transfer platform on Next.js 15 + Cloudflare Workers + Supabase*
*Researched: 2026-08-17*
