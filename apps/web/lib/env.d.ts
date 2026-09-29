// Typed Cloudflare bindings surface (D-34, PLAT-01/PLAT-02).
//
// Every binding declared in `apps/web/wrangler.jsonc` gets a matching member below, so a
// Phase 3-7 consumer that mistypes a binding name (`env.GEO_CAHCE`) gets a compile error
// instead of an `undefined` at the edge — the key_link `wrangler.jsonc` -> `env.d.ts` this
// plan's must_haves require. No `export`/`import` statement: this is an ambient script file,
// same convention `wrangler types` itself generates, so `CloudflareEnv` is visible everywhere
// without an explicit import.
//
// The concrete runtime shapes (`KVNamespace`, `R2Bucket`, `Queue`, `Hyperdrive`, `Fetcher`)
// come from `@cloudflare/workers-types` (devDependency, pinned to match this file's
// `compatibility_date` in wrangler.jsonc) rather than hand-declared stand-ins, so a Phase 3-7
// consumer also gets real method-shape checking (`env.GEO_CACHE.get(...)` etc.), not just
// name-typo protection.
/// <reference types="@cloudflare/workers-types" />

interface CloudflareEnv {
  /**
   * Static asset binding for OpenNext's generated Worker — `apps/web/wrangler.jsonc`'s
   * top-level `assets` block (D-01 already wires `fetch: handler.fetch` against it in
   * `worker.ts`; typed here so it appears on the same env surface as every other binding).
   */
  ASSETS: Fetcher;

  /**
   * Geo/quote cache KV namespace (`apps/web/wrangler.jsonc` `env.staging`/`env.production`
   * `kv_namespaces`). Phase 4 (pricing/quotes) is the first real consumer.
   */
  GEO_CACHE: KVNamespace;

  /**
   * Chauffeur/vehicle photo storage R2 bucket (`apps/web/wrangler.jsonc` `r2_buckets`).
   * Phase 5/6 are the first real consumers.
   */
  PHOTOS: R2Bucket;

  /**
   * Workers AI (`env.staging`/`env.production` `ai` block). Translates extra names on save (D-44).
   * Optional: absent in tests and local runs, the save still succeeds.
   */
  AI?: Ai;

  /**
   * Inbound support-mail files (`support/{submissionId}/{messageId}/{fileId}`).
   * Never PHOTOS. Bound in 14-07; optional so unit tests typecheck without the bucket.
   */
  SUPPORT_FILES?: R2Bucket;

  /**
   * Stripe webhook fan-out queue — both producer and consumer bind under this name
   * (`apps/web/wrangler.jsonc` `queues.producers`/`queues.consumers`). Phase 7 (payment) is
   * the first real consumer; `worker.ts`'s `queue()` handler already acks every message as a
   * proven no-op (D-36).
   */
  STRIPE_EVENTS: Queue;

  /**
   * Supabase direct-connection pool via Cloudflare Hyperdrive — the cacheable, public-content
   * path (`apps/web/wrangler.jsonc` `env.production.hyperdrive`, `env.staging`'s twin stays
   * commented until plan 03-07 supplies a real config id). `lib/db/public.ts`'s `publicSql`
   * is the only consumer (D-11): `vamos_public`, branded to the five §14d public tables,
   * never identity or billing data. Required, not optional (D-13/FC-07) — Phase 3 wires both
   * bindings everywhere `wrangler.jsonc` declares them, so a Phase 3-7 consumer that mistypes
   * or forgets to declare it gets a compile error, not a runtime `undefined`.
   */
  HYPERDRIVE: Hyperdrive;

  /**
   * Supabase direct-connection pool via Cloudflare Hyperdrive — the cache-disabled,
   * identity-and-billing path (`apps/web/wrangler.jsonc` `env.production.hyperdrive`,
   * `env.staging`'s twin stays commented until plan 03-07 supplies a real config id).
   * `lib/db/identity.ts`'s seven named wrappers (`asAnon`/`asCustomer`/`asStaff`/`asGuest`/
   * `asQuote`/`asCheckout`/`asSystem`) are the only consumer (D-08/D-12) — anything carrying identity, auth,
   * permissions or the `pricing_live` flag reads this binding, never the cacheable
   * `HYPERDRIVE` above. Required, not optional, matching `HYPERDRIVE`'s reasoning.
   */
  HYPERDRIVE_NOCACHE: Hyperdrive;

  /**
   * Workers Analytics Engine binding for DATA-05's latency instrument (`apps/web/wrangler.jsonc`
   * `env.staging`/`env.production` `analytics_engine_datasets`, dataset `vamos_db_latency`).
   * `lib/db/identity.ts` writes one data point per `withIdentity` call, on both the success
   * and the error branch (D-23); the p50 itself is queried later with
   * `quantileExactWeighted(0.5)` from a deployed staging Worker (plan 03-07) — this binding's
   * existence is necessary but not sufficient for that number to exist.
   */
  DB_LATENCY: AnalyticsEngineDataset;

  /**
   * Plain, non-secret deploy-environment marker (`apps/web/wrangler.jsonc` `env.staging`
   * `vars.DEPLOY_ENV`) — `apps/web/middleware.ts` reads this to scope the
   * `X-Robots-Tag: noindex` header (D-37) to staging only. Never a credential value; safe to
   * read from a plaintext `vars` block per T-01-13's accepted-risk disposition. Undefined
   * under `env.production`, which is exactly what keeps the header off production.
   */
  DEPLOY_ENV?: string;

  /**
   * K76 Worker surface pin (`public` | `dashboard`). Not a credential.
   * `public` on Worker `vamos` (apex+www). Dashboard TLS is Worker
   * `vamos-dashboard` → named entrypoint `Dashboard`, which ignores this var.
   */
  VAMOS_SURFACE?: string;

  // ── Phase 4 quote / pricing bindings (plan 04-07 owns the full surface) ──

  /**
   * HMAC secret for the QUOTE-04 lock token (`wrangler secret put QUOTE_LOCK_SECRET`).
   * REQUIRED — a missing secret must be a boot failure, not a silently unsigned token.
   * First consumer: plan 04-07 `lib/quote/lock.ts` (mintLock / verifyLock).
   * Never appears in wrangler.jsonc `vars`.
   */
  QUOTE_LOCK_SECRET: string;

  /**
   * Previous lock secret during a rotation window only (D-28).
   * OPTIONAL — absence is the normal state. Present only for one lock TTL after
   * rotation so in-flight checkouts dual-verify. First consumer: plan 04-07 verifyLock.
   * Never appears in wrangler.jsonc `vars`.
   */
  QUOTE_LOCK_SECRET_PREVIOUS?: string;

  /**
   * HMAC secret for the QUOTE-09 `vamos_qs` visitor cookie (`wrangler secret put VAMOS_QS_SECRET`).
   * REQUIRED. A DIFFERENT value from QUOTE_LOCK_SECRET — one secret must never sign two
   * token kinds. First consumer: plan 04-07 `lib/abuse/vamos-qs.ts`.
   * Never appears in wrangler.jsonc `vars`.
   */
  VAMOS_QS_SECRET: string;
  /**
   * HMAC key for the 26.1 D-17 staff re-auth cookie `vt_reauth` (`lib/auth/reauth.ts`).
   * `wrangler secret put STAFF_REAUTH_SECRET` (owner step, 26.1-26). Its own value — never a
   * quote, visitor or Supabase secret. At least 32 characters. Absent → password/email change,
   * sign-in method switch and factor removal are refused with `reauth-unavailable`.
   */
  STAFF_REAUTH_SECRET?: string;

  /**
   * Mapbox access token (D-47 owner-gated). OPTIONAL — feature degrades when absent
   * rather than blocking Worker boot before the owner has an account.
   * First consumer: plan 04-10 `/api/geo/*` and quote Directions.
   * Never appears in wrangler.jsonc `vars`.
   */
  MAPBOX_TOKEN?: string;

  /**
   * Cloudflare Turnstile siteverify secret (D-47 owner-gated). OPTIONAL — degrades
   * rather than blocks boot. First consumer: plan 04-13 Turnstile gate.
   * Never appears in wrangler.jsonc `vars`.
   */
  TURNSTILE_SECRET?: string;

  /**
   * AeroDataBox (or successor) flight API key (D-47 / ADR-014 §4 deferred). OPTIONAL —
   * may never arrive at all. First consumer: plan 04-12 `/api/flight`.
   * Never appears in wrangler.jsonc `vars`.
   */
  FLIGHT_API_KEY?: string;

  /**
   * Dedicated abuse / daily-breaker KV namespace (D-37) — never GEO_CACHE.
   * TTL semantics differ; mixing a daily counter with a cache is how one evicts the other.
   * REQUIRED. First consumer: plan 04-13 `quote:mapbox-budget:YYYY-MM-DD` breaker.
   * Binding declared in wrangler.jsonc `kv_namespaces` (both envs); real ids TODO(08-deploy).
   */
  QUOTE_ABUSE: KVNamespace;

  /**
   * Workers Analytics Engine dataset for quote abuse / Mapbox trip metrics.
   * REQUIRED. wrangler.jsonc `analytics_engine_datasets` → dataset `vamos_quote_abuse`.
   * First consumer: plan 04-13.
   */
  QUOTE_ABUSE_METRICS: AnalyticsEngineDataset;

  /**
   * Rate-limit binding for the verified-cookie 8/60 bucket (D-36 layer 2a).
   * REQUIRED. Limit is fixed per binding — see QUOTE_RATE_LIMITER_BARE for the bare-IP half.
   * First consumer: plan 04-13.
   */
  QUOTE_RATE_LIMITER: RateLimit;

  /**
   * Rate-limit binding for the bare-IP / unverifiable-cookie 4/60 bucket (D-36 layer 2b).
   * REQUIRED and SEPARATE from QUOTE_RATE_LIMITER: an unverifiable cookie must fall into
   * the SMALLER bucket, never into a fresh copy of the larger one.
   * First consumer: plan 04-13.
   */
  QUOTE_RATE_LIMITER_BARE: RateLimit;

  /**
   * Rate-limit binding for /api/auth (10 per 60 s per IP). Own bucket: sign-in must not share
   * the 4/60 quote allowance. OPTIONAL in types: when the binding is missing the route logs and
   * allows the attempt, so a misconfiguration never locks everyone out of sign-in.
   */
  AUTH_RATE_LIMITER?: RateLimit;

  /**
   * Engineering unit-count sentinel for the daily Mapbox breaker (D-54 / U37).
   * OPTIONAL string parsed with `Number.parseInt` — a UNIT COUNT, never a franc figure.
   * No Mapbox plan exists yet, so no ceiling in francs can be honest. Trips rather than logs.
   * First consumer: plan 04-13. Declared in wrangler.jsonc `vars` (both envs).
   */
  MAPBOX_DAILY_UNIT_SENTINEL?: string;

  /**
   * Staging-only draft-pricing preview flag (D-33).
   * OPTIONAL. ABSENT from production by design — its absence is the control.
   * Every read is `env.PRICING_PREVIEW === "true"`. Both traps are closed by that one
   * comparison: a missing binding is falsy, and the string `"false"` is also falsy,
   * where a bare `if (env.PRICING_PREVIEW)` would treat `"false"` as true.
   * Setting `"false"` under production would be a bug, not belt-and-braces.
   * First consumer: plan 04-09 / 04-11 quote path.
   */
  PRICING_PREVIEW?: string;

  // ── Phase 5 auth / public-surface bindings (plan 05-01) ──

  /**
   * Cloudflare Images binding (`apps/web/wrangler.jsonc` `env.staging`/`env.production`
   * `images.binding`). D-13 — first consumed by plan 05-06's hero. Without this,
   * `/_next/image` answers 200 with the original, unresized file.
   */
  IMAGES: ImagesBinding;

  /**
   * Supabase Auth URL (server-only). Required — local `supabase start` supplies it
   * from the first commit. Never a browser-exposed env name;
   * `scripts/public-env-allowlist.json` forbids `SUPABASE_URL` in the client bundle.
   * `wrangler secret put` in staging/prod.
   */
  SUPABASE_URL: string;

  /**
   * Supabase anon/publishable key (server-only). Required. Never a browser-exposed
   * env name; `scripts/public-env-allowlist.json` forbids `SUPABASE_ANON_KEY` in the
   * client bundle. `wrangler secret put` in staging/prod.
   */
  SUPABASE_ANON_KEY: string;

  /**
   * Supabase service-role key (server-only). Used only by the Worker scheduled digest through
   * `lib/supabase/service.ts`; fetch/RSC code must use identity-scoped doors instead.
   * `wrangler secret put` in staging/prod.
   */
  SUPABASE_SERVICE_ROLE_KEY: string;

  /**
   * Cloudflare Email Sending binding (`wrangler.jsonc` `send_email`). Staging
   * only. From-address domain is vamostaxi.site.
   */
  EMAIL?: {
    send(message: {
      to: string | string[];
      from: { email: string; name?: string } | string;
      subject: string;
      html?: string;
      text?: string;
    }): Promise<{ messageId?: string }>;
  };

  /**
   * Supabase Auth Send Email Hook signing secret (plan 05-12). OPTIONAL — owner-gated
   * (05-CONTEXT deferred). `wrangler secret put`. Never in wrangler.jsonc `vars`.
   */
  SEND_EMAIL_HOOK_SECRET?: string;

  /**
   * Resend API key. REQUIRED for confirmation send (plan 07-07 Queue consumer
   * via `@vamos/emails`). `wrangler secret put RESEND_API_KEY`. Never in
   * wrangler.jsonc `vars`. Never `NEXT_PUBLIC_*`.
   */
  RESEND_API_KEY?: string;

  /**
   * Resend webhook signing secret (`whsec_…`). OPTIONAL until inbound
   * Support replies are enabled. `wrangler secret put RESEND_WEBHOOK_SECRET`.
   * Never in wrangler.jsonc `vars`. Never `NEXT_PUBLIC_*`.
   */
  RESEND_WEBHOOK_SECRET?: string;

  /**
   * Cloudflare Turnstile site key (plan 05-13). OPTIONAL — owner-gated. Read server-side
   * and passed to the widget as a prop, so it needs no browser-prefixed identifier.
   * Distinct from Phase 4's `TURNSTILE_SECRET` (quote-abuse siteverify).
   */
  TURNSTILE_SITE_KEY?: string;

  /**
   * Cloudflare Turnstile secret for Phase 5 forms (plan 05-13). OPTIONAL — owner-gated.
   * Distinct from Phase 4's `TURNSTILE_SECRET` quote-abuse binding; both may be present.
   */
  TURNSTILE_SECRET_KEY?: string;

  /**
   * Runtime dictionary source kill switch (plan 06-16, I18N-07).
   * OPTIONAL. Absence and any value other than `"db"` serve the repository JSON
   * files via the Phase 1 import. `"db"` reads `content_strings` through
   * `publicSql` on the cacheable HYPERDRIVE binding. Defaults to json until the
   * swap is proven in the environment being deployed to. Never a credential;
   * safe to set from a plaintext `vars` block. A kill switch that has to be
   * added under pressure is not a kill switch.
   */
  CONTENT_SOURCE?: string;

  // ── Phase 7 checkout / Stripe bindings (plan 07-04) ──

  /**
   * Stripe secret key. REQUIRED. `wrangler secret put STRIPE_SECRET_KEY`.
   * Never in wrangler.jsonc `vars`. Test mode (`sk_test_`) on staging until Phase 11.
   */
  STRIPE_SECRET_KEY: string;

  /**
   * Stripe webhook signing secret. REQUIRED. `wrangler secret put STRIPE_WEBHOOK_SECRET`.
   * Never in wrangler.jsonc `vars`.
   */
  STRIPE_WEBHOOK_SECRET: string;

  /**
   * Stripe publishable key. REQUIRED. wrangler.jsonc `vars` — not a secret.
   * `pk_test_` placeholder until the owner binds a real test key. Never `pk_live_`.
   */
  STRIPE_PUBLISHABLE_KEY: string;
  /** "on" adds TWINT to the hosted Checkout page; anything else is card only (D-20). */
  STRIPE_CHECKOUT_TWINT?: string;

  /**
   * Health probe secret (LAUNCH-03 / D-19). OPTIONAL — absence fail-closes
   * GET /api/internal/health to empty 404. `wrangler secret put HEALTH_PROBE_SECRET`.
   * Never in wrangler.jsonc `vars`. Never a placeholder value.
   */
  HEALTH_PROBE_SECRET?: string;
}

/**
 * Cloudflare Workers Rate Limiting binding shape.
 * `@cloudflare/workers-types` does not yet export this interface at the pinned
 * version; declared ambiently so QUOTE_RATE_LIMITER / QUOTE_RATE_LIMITER_BARE
 * type-check. Method surface matches the platform Rate Limiting API.
 */
interface RateLimit {
  limit(options: { key: string }): Promise<{ success: boolean }>;
}
