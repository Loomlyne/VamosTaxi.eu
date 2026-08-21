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
   * Supabase direct-connection pool via Cloudflare Hyperdrive. Declared only under
   * `env.production` in `wrangler.jsonc`, with a placeholder id — Phase 3 owns the real
   * connection string (T-01-12: never guessed here). Optional because `env.staging` has no
   * matching `hyperdrive` block until Phase 3 provisions one; a Phase 3-7 consumer that reads
   * `env.HYPERDRIVE` without a null check gets a compile error under `strict`, which is the
   * point — this binding must never be assumed present before Phase 3 lands it everywhere.
   */
  HYPERDRIVE?: Hyperdrive;

  /**
   * Plain, non-secret deploy-environment marker (`apps/web/wrangler.jsonc` `env.staging`
   * `vars.DEPLOY_ENV`) — `apps/web/middleware.ts` reads this to scope the
   * `X-Robots-Tag: noindex` header (D-37) to staging only. Never a credential value; safe to
   * read from a plaintext `vars` block per T-01-13's accepted-risk disposition. Undefined
   * under `env.production`, which is exactly what keeps the header off production.
   */
  DEPLOY_ENV?: string;
}
