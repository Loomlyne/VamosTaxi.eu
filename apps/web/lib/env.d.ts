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
   * `lib/db/identity.ts`'s five named wrappers (`asAnon`/`asCustomer`/`asStaff`/`asGuest`/
   * `asQuote`) are the only consumer (D-08/D-12) — anything carrying identity, auth,
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
}
