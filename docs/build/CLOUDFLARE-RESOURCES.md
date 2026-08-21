# Cloudflare Resources — vamos-web

D-34's "one place to see the Worker's full surface." Every binding declared in
`apps/web/wrangler.jsonc` is listed here with the resource that genuinely backs it, so
Phases 3-7 add code against plumbing that already exists rather than provisioning it under
deadline pressure (01-RESEARCH.md Pitfall 4).

**Account:** a fresh Cloudflare account (`koussayzayeni@gmail.com`, account id
`e64b47deef83692806ab23279d53633e`) provisioned from scratch for this project — separate
from any other account on this machine. No resource below was reused from another project.

## Bindings

| Binding | Resource kind | Staging identifier | Production identifier | Creating command | First consumer |
|---|---|---|---|---|---|
| `ASSETS` | Workers Assets (build output, not an account-level resource) | `.open-next/assets` directory (top-level in `wrangler.jsonc`, shared by both environments — assets are static output, not a provisioned resource) | same | `pnpm --filter web run deploy` (runs `opennextjs-cloudflare build` first) | Phase 1 (already wired — `worker.ts`'s `fetch` re-exports OpenNext's handler against it) |
| `GEO_CACHE` | KV namespace | `geo-cache-staging` — id `48cd800d63e44c03aa1f49be83d39d7a` | `geo-cache-production` — id `a11bc8c7d13d4eeb9c2dad091e978dcb` | `wrangler kv namespace create geo-cache-staging` / `wrangler kv namespace create geo-cache-production` | Phase 4 (geocoding + quote cache) |
| `PHOTOS` | R2 bucket (eu jurisdiction) | `vamos-photos-staging` | `vamos-photos-production` | `wrangler r2 bucket create vamos-photos-staging --location eu` / `wrangler r2 bucket create vamos-photos-production --location eu` | Phase 5/6 (chauffeur/vehicle photos) |
| `STRIPE_EVENTS` | Queue (producer + consumer, same queue) | `vamos-stripe-events-staging` | `vamos-stripe-events-production` | `wrangler queues create vamos-stripe-events-staging` / `wrangler queues create vamos-stripe-events-production` | Phase 5/7 (Stripe webhook fan-out) — Phase 1's `worker.ts` `queue()` handler is a proven no-op against it (D-36) |
| — (cron trigger, no binding name) | Scheduled Trigger | `0 3 * * *` (registered directly in `wrangler.jsonc` `env.staging.triggers.crons` — no separate provisioning command; a trigger is config, not an account resource) | `0 3 * * *` (`env.production.triggers.crons`) | n/a — declared in `wrangler.jsonc` | Phase 4 (quote expiry) / Phase 9 (reminders, no-show sweep) — Phase 1's `worker.ts` `scheduled()` handler is a proven no-op against it (D-36) |
| `HYPERDRIVE` | Hyperdrive config (pools Supabase's **direct** connection string, never the pooled 6543 Supavisor string — T-01-12) | **not declared.** Omitted deliberately: `wrangler deploy` validates a Hyperdrive `id` against the live API as a real UUID, so a placeholder here fails the deploy outright (unlike KV/R2/Queues, which tolerate a not-yet-real id in config). Phase 3 adds this block once `wrangler hyperdrive create` runs against a real staging Supabase Postgres. | Declared with a placeholder id and a `localConnectionString` for local `wrangler dev` only (`apps/web/wrangler.jsonc` `env.production.hyperdrive`) — Phase 3 owns the real value; nothing in Phase 1 connects to this binding, and production never deploys before Phase 3 lands it. | `wrangler hyperdrive create <name> --connection-string=<supabase-direct-string>` (Phase 3) | Phase 3 (data access from Workers) |
| `DEPLOY_ENV` | Plaintext `vars` entry (never a secret — see below) | `"staging"` (`env.staging.vars.DEPLOY_ENV`) | undefined (no `vars` block under `env.production`) | n/a — declared in `wrangler.jsonc` | Phase 1 (`apps/web/middleware.ts` reads it to scope the `X-Robots-Tag: noindex` header to staging only, D-37) |
| — (not a binding) | Turnstile site-key pair | delivered as a secret (`TURNSTILE_SECRET` via `wrangler secret put`) plus a public site key, not a `wrangler.jsonc` binding shape at all | same mechanism | `wrangler secret put TURNSTILE_SECRET --env <env>` (Phase 4) | Phase 4 (public quote form bot protection) |

**No `vars` entry above holds a credential-shaped value** — `DEPLOY_ENV` is a plain
environment marker, not a secret; every real credential (Stripe, Supabase, Resend, Mapbox,
AeroDataBox, Turnstile, Sentry) reaches the Worker via `wrangler secret put`, per PLAT-06 and
threat T-01-01, and is never written to `wrangler.jsonc`.

## Cloudflare Access — deferred by explicit owner decision

D-37 calls for staging to sit behind Cloudflare Access. This plan's Task 3 was **not**
completed for the Access half: when asked which identity provider to configure, the owner's
answer was "keep it later, it's fine." No Access application, no policy, and no Zero Trust
identity provider were created against this account in this pass.

**What is done instead, so staging is not fully open:** the `X-Robots-Tag: noindex` header
(`apps/web/middleware.ts`, environment-conditioned on `DEPLOY_ENV`) keeps a crawler that
reaches staging from competing with the live site's search ranking. It does **not** stop a
human or scraper from reaching the URL at all — that is Access's job, and it remains undone.

**When this is picked back up:** 01-RESEARCH.md's State of the Art table (2026-08-14
Cloudflare changelog) records Worker-level Access as newly supported and simpler than the
older self-hosted-application pattern — attach the policy to the **staging Worker only**,
never production. A Worker-level Access policy covers **every route on that Worker**, so if
it were ever applied to production it would also gate Phase 7's Stripe webhook endpoint,
which must stay publicly reachable for Stripe to call it (T-01-11). Verify the mechanism
empirically against a live account before trusting the changelog claim (RESEARCH Assumption
A3, medium confidence) — if Worker-level Access does not gate the custom hostname as
documented, fall back to the older self-hosted-application pattern bound to the staging
hostname, and update this row with whichever mechanism was actually used.

## Logpush — deferred by explicit owner decision

D-38 calls for the structured logs `apps/web/lib/logger.ts` emits to be enabled for Logpush
so the `wrangler tail` observation in 01-04's Task 2 is repeatable rather than a one-off
terminal session. This was **not** enabled: it needs a Logpush destination (an R2 bucket in
this account is the zero-extra-vendor option), and no destination has been chosen yet —
same category of decision as Access above, deferred rather than guessed.

**When this is picked back up:** Cloudflare Dashboard → Workers & Pages → the Worker → Logs
→ Logpush, pointed at the confirmed R2 bucket (or an alternate destination if one is chosen
later). No code change is needed on the Worker side — `lib/logger.ts` already emits
structured JSON lines to the Workers Logs sink `wrangler tail` reads from; Logpush only adds
a durable, queryable destination for the same stream.

## Resources deleted after the staging/production split

The original unsuffixed shared resources (`geo-cache`, `vamos-photos`,
`vamos-stripe-events`) were deleted once the per-environment split above replaced them — do
not recreate them under the old names.
