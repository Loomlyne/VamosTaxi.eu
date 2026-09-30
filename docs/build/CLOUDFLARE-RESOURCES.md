# Cloudflare Resources — vamos-web

D-34's "one place to see the Worker's full surface." Every binding declared in
`apps/web/wrangler.jsonc` is listed here with the resource that genuinely backs it, so
Phases 3-7 add code against plumbing that already exists rather than provisioning it under
deadline pressure (01-RESEARCH.md Pitfall 4).

**Account:** a fresh Cloudflare account (`koussayzayeni@gmail.com`, account id
`e64b47deef83692806ab23279d53633e`) provisioned from scratch for this project — separate
from any other account on this machine. No resource below was reused from another project.

**Which Worker is live (checked against `apps/web/wrangler.jsonc`, 2026-09-30):** the env named
`staging` in that file names the Worker `vamos` and carries the custom domains `vamostaxi.site` and
`www.vamostaxi.site`, so it is the live Worker. The "staging" wording in the table below is the env key,
not a second site. `vamos-web-staging` (the name used in the 2026-08 provisioning log further down) no
longer exists as a Worker name; `env.production` (`vamos-web-production`) is not deployed. Worker `vamos`
is deployed from the owner's Mac with wrangler; a push to `main` does not deploy it.

## Bindings

| Binding | Resource kind | Staging identifier | Production identifier | Creating command | First consumer |
|---|---|---|---|---|---|
| `ASSETS` | Workers Assets (build output, not an account-level resource) | `.open-next/assets` directory (top-level in `wrangler.jsonc`, shared by both environments — assets are static output, not a provisioned resource) | same | `pnpm --filter web run deploy` (runs `opennextjs-cloudflare build` first) | Phase 1 (already wired — `worker.ts`'s `fetch` re-exports OpenNext's handler against it) |
| `GEO_CACHE` | KV namespace | `geo-cache-staging` — id `48cd800d63e44c03aa1f49be83d39d7a` | `geo-cache-production` — id `a11bc8c7d13d4eeb9c2dad091e978dcb` | `wrangler kv namespace create geo-cache-staging` / `wrangler kv namespace create geo-cache-production` | Phase 4 (geocoding + quote cache) |
| `PHOTOS` | R2 bucket (eu jurisdiction) | `vamos-photos-staging` | `vamos-photos-production` | `wrangler r2 bucket create vamos-photos-staging --location eu` / `wrangler r2 bucket create vamos-photos-production --location eu` | Phase 5/6 (chauffeur/vehicle photos) |
| `STRIPE_EVENTS` | Queue (producer + consumer, same queue) | `vamos-stripe-events-staging` | `vamos-stripe-events-production` | `wrangler queues create vamos-stripe-events-staging` / `wrangler queues create vamos-stripe-events-production` | Phase 5/7 (Stripe webhook fan-out) — Phase 1's `worker.ts` `queue()` handler is a proven no-op against it (D-36) |
| — (cron trigger, no binding name) | Scheduled Trigger | `0 * * * *` (hourly) and `0 3 * * *` (registered directly in `wrangler.jsonc` `env.staging.triggers.crons` — no separate provisioning command; a trigger is config, not an account resource) | the same two (`env.production.triggers.crons`) | n/a — declared in `wrangler.jsonc` | `worker.ts` `scheduled()`: every other tick (including the hourly one) runs the unpaid purge, unpaid expiry, 24 h reminder, stuck-notification sweep and health probe, then the staff digest when it is 06:00 in Zurich; the `0 3 * * *` tick runs only the stuck-notification sweep. (Was a Phase 1 no-op.) **D-29: this Cron does not write `price_snapshots`.** `expires_at <= now() AND booking_id IS NULL` already IS an expired quote; a sweep that rewrites rows would add a mutation path to an append-only table for no new information. Phase 9 (reminders, no-show sweep) may attach later — still not quote expiry. |
| `HYPERDRIVE_NOCACHE` | Hyperdrive config, identity/billing (pools Supabase's **direct** connection string, never the pooled 6543 Supavisor string — T-01-12) | `vamos-rls-staging` — id `71523abbbb7542fdbff01f66d9a858ed`, `vamos_edge`, `db.yaumjzvylngfjhtuffqs.supabase.co:5432`, caching **disabled**, `origin_connection_limit=20` (D-43-derived; research figure was 25) | **not declared.** `env.production` is not deployed until Phase 11 (D-33) — creating a production config now would draw on the same `max_connections` ceiling D-43 just measured for no consumer. | `wrangler hyperdrive create vamos-rls-staging --connection-string=<direct string, vamos_edge> --caching-disabled --origin-connection-limit=20` (plan 03-07, 2026-08-25) | Phase 3 (identity/billing data access), `apps/web/lib/db/identity.ts`'s five wrappers |
| `HYPERDRIVE` | Hyperdrive config, public/cacheable content (same direct-string rule) | `vamos-public-staging` — id `b53693800b7e4c1c94205774baa73420`, `vamos_public`, `db.yaumjzvylngfjhtuffqs.supabase.co:5432`, caching **enabled** (default), `origin_connection_limit=12` (D-43-derived; research figure was 15) | **not declared** (same reasoning as `HYPERDRIVE_NOCACHE` production above) | `wrangler hyperdrive create vamos-public-staging --connection-string=<direct string, vamos_public> --origin-connection-limit=12` (plan 03-07, 2026-08-25) | Phase 3 (public content data access), `apps/web/lib/db/public.ts` |
| — (not an `apps/web` binding) | Hyperdrive config, dedicated isolation-probe origin (D-03) | `vamos-probe-staging` — id `49fcf0baedbe44b29b7bc78f81d3421d`, `vamos_edge`, same direct string, caching **disabled**, `origin_connection_limit=5` (Cloudflare's documented floor — unchanged by D-43) | n/a — staging-only, never has a production twin (D-20) | `wrangler hyperdrive create vamos-probe-staging --connection-string=<direct string, vamos_edge> --caching-disabled --origin-connection-limit=5` (plan 03-07, 2026-08-25) | `apps/isolation-probe`'s `HYPERDRIVE_NOCACHE` binding only — pinned distinct from the app's own `HYPERDRIVE_NOCACHE` id by `packages/db/test/support/config-allowlist.json` (T-03-10) |
| `DEPLOY_ENV` | Plaintext `vars` entry (never a secret — see below) | `"staging"` (`env.staging.vars.DEPLOY_ENV`) | undefined (no `vars` block under `env.production`) | n/a — declared in `wrangler.jsonc` | Phase 1 (`apps/web/middleware.ts` reads it to scope the `X-Robots-Tag: noindex` header to staging only, D-37) |
| — (not a binding) | Turnstile site-key pair | delivered as a secret (`TURNSTILE_SECRET` via `wrangler secret put`) plus a public site key, not a `wrangler.jsonc` binding shape at all | same mechanism | `wrangler secret put TURNSTILE_SECRET --env <env>` (Phase 4) | Phase 4 (public quote form bot protection) |

**No `vars` entry above holds a credential-shaped value** — `DEPLOY_ENV` is a plain
environment marker, not a secret; every real credential (Stripe, Supabase, Resend, Mapbox,
AeroDataBox, Turnstile, Sentry) reaches the Worker via `wrangler secret put`, per PLAT-06 and
threat T-01-01, and is never written to `wrangler.jsonc`.

## D-35 (U23) — `--caching-disabled` on `wrangler hyperdrive update`

**Resolved 2026-08-25, plan 03-07, checked against a real config, not only `--help` text.**
`wrangler hyperdrive update <id> --caching-disabled --help` lists the flag under "Caching
Options" on `update`, identically to `create`. Confirmed empirically, not just from the help
text: `wrangler hyperdrive update 49fcf0baedbe44b29b7bc78f81d3421d --caching-disabled` against
the live `vamos-probe-staging` config returned `200` with `caching.disabled: true` and an
updated `modified_on` timestamp — the API call genuinely executed, not a client-side no-op.

**Consequence: the wrong-cache-mode recovery runbook is a patch, not delete-recreate-repoint.**
The research's fallback ("Docs show the flag only on `create`... recovery is delete + recreate +
re-point the binding id") does not apply. If a config is ever created with the wrong cache mode,
the fix is a single in-place command that touches no binding id anywhere:

```
wrangler hyperdrive update <id> --caching-disabled       # enforce cache-disabled
wrangler hyperdrive update <id> --caching-disabled=false # re-enable caching (untested this session — inferred from yargs boolean-flag negation, not empirically confirmed)
```

Neither `apps/web/wrangler.jsonc`, `apps/isolation-probe/wrangler.jsonc`, nor
`packages/db/test/support/config-allowlist.json` need editing for this class of fix — the
config `id` never changes, only its cache setting.

## D-43 (U32) — connection headroom

**Resolved 2026-08-25, plan 03-07.** Full measurement, arithmetic and derived pool sizes live in
`docs/build/SUPABASE-RESOURCES.md` § "D-43 (U32) — connection headroom, measured before the
first `wrangler hyperdrive create`" (cross-referenced here rather than duplicated, matching this
file's own "R2 jurisdiction note" precedent below). Summary: `max_connections=60`,
`pg_stat_activity` baseline `=13`; the research's 25+15+5=45 split left only 2 connections of
headroom (not comfortable), so all three Hyperdrive origin-connection limits were lowered
proportionally — identity **20** (was 25), public **12** (was 15), probe held at Cloudflare's
own floor of **5** (unchanged) — for a total of 37 and a 10-connection headroom.

## Plan 03-07 Task 3 — deployment status (2026-08-25, IN PROGRESS, not complete)

**`apps/isolation-probe` deployed successfully.** `vamos-isolation-probe-staging` —
`https://vamos-isolation-probe-staging.koussayzayeni.workers.dev`. `PROBE_SECRET` set via
`wrangler secret put` (freshly generated, never written to any file or log). Gate verified:
a request with no `x-vamos-probe` header and a request with a wrong secret both return an
opaque `404` with byte-identical bodies.

**D-42 (U30) — Placement Hints on the Free plan, PARTIALLY confirmed.** Queried
`GET /accounts/{account}/workers/scripts/vamos-isolation-probe-staging/settings` after deploy:
`"placement": { "mode": "targeted", "target": [40] }` — Placement Hints ARE accepted on this
Free-plan account for the probe Worker (`mode: "targeted"` is Cloudflare's internal name for an
explicit Placement Hint, as opposed to `"smart"` for Smart Placement; `target: [40]` is a
Cloudflare colo/region code, presumably Zurich). **`apps/web`'s own confirmation is still
pending** — see the Analytics Engine blocker below, which stopped its deploy before Cloudflare
ever evaluated its `placement` block. D-24's exclusion is recorded regardless of that outcome:
Placement Hints pin fetch handlers only — `apps/web/wrangler.jsonc`'s `env.staging.triggers.crons`
and `env.staging.queues.consumers` are unplaced, and their latency is explicitly outside DATA-05.

**`apps/web` deploy to staging BLOCKED — Workers Analytics Engine is not enabled on this
Cloudflare account.** `pnpm --filter web run deploy -- --env staging` built successfully
(OpenNext build, asset upload) and failed only at the final `wrangler` API call, on the
`DB_LATENCY` → `vamos_db_latency` `analytics_engine_datasets` binding:

```
✘ [ERROR] A request to the Cloudflare API (/accounts/e64b47deef83692806ab23279d53633e/workers/scripts/vamos-web-staging/versions) failed.
  You need to enable Analytics Engine. Head to the Cloudflare Dashboard to enable:
  https://dash.cloudflare.com/e64b47deef83692806ab23279d53633e/workers/analytics-engine [code: 10089]
```

Checked for an API/CLI path around this (account settings endpoint, `wrangler` flags) — none
found; Cloudflare's own error message names the dashboard as the only route, and this executor's
Cloudflare API token has no scope that substitutes for the one-time account-level opt-in a human
must click. **This is a genuine `checkpoint:human-action` gate, not a bug and not something to
work around by removing the WAE binding** — DATA-05's entire instrument is that binding (D-23).

**Rule 1 fix, in the same file:** the `deploy` job's existing "Deploy Worker (staging
environment)" step read `pnpm --filter web deploy --env staging` — confirmed empirically this
session that bare `pnpm --filter web deploy` (no `run`) invokes **pnpm's own built-in `deploy`
command** (https://pnpm.io/cli/deploy), not this package's `deploy` script, so it fails on
`Unknown option: 'env'` before `wrangler` ever runs. Fixed to
`pnpm --filter web run deploy -- --env staging`, the same invocation that got this session past
argument parsing and to the real Analytics Engine blocker above.

**What is still needed to finish this plan (owner action required):**
1. Visit https://dash.cloudflare.com/e64b47deef83692806ab23279d53633e/workers/analytics-engine
   and enable Workers Analytics Engine (one-time, account-level).
2. Re-run `pnpm --filter web run deploy -- --env staging` — should then succeed and settle
   D-42 for `apps/web` itself.
3. Generate `/api/dev/db-smoke` traffic against the deployed staging Worker and query
   `quantileExactWeighted(0.5)` over `vamos_db_latency` (`p50Latency` in
   `packages/db/test/support/hyperdrive-metrics.ts`) to produce DATA-05's real number.
4. Supply `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY` and `VAMOS_OWNER_URL` (the hosted
   project's Postgres superuser password, direct-string form) as environment variables — these
   were never part of the five credentials this executor received (`CLOUDFLARE_API_TOKEN`,
   `CLOUDFLARE_ACCOUNT_ID`, `VAMOS_EDGE_PW`, `VAMOS_PUBLIC_PW`), and `packages/db/test/fixtures/
   two-customers.ts`'s `seedFixtures()` needs all three to mint real Auth users and seed
   isolation fixtures. Note: `ownerSql()` in that same file opens a DIRECT Postgres socket to
   `VAMOS_OWNER_URL` — unreachable from this executor's own laptop (IPv6-only origin, see
   `docs/build/SUPABASE-RESOURCES.md` § "IPv6-only origin"). Whether the GitHub Actions runner
   this plan's new `data-06` CI job runs on has outbound IPv6 is unverified.
5. Once (1)-(4) hold, run `negative-controls.test.ts` and `data-06-isolation.test.ts` for real
   and record `S`/`distinctPids`/`peakInFlight` per pairing.

**What already ran for real, this session, against live infrastructure:**
`config-preconditions.test.ts` — 6/6 passed against the three real Hyperdrive configs above
(port 5432 confirmed on all five allowlist entries with a filled id, login roles confirmed,
caching modes confirmed, `origin_connection_limit` 20/12/5 confirmed, probe/app id distinctness
confirmed, `prepare: true` confirmed in `packages/db/src/identity.ts`).

## Jurisdiction note (D-24)

The `PHOTOS` buckets above were created with `--location eu`, which Cloudflare documents as a
**best-effort hint**, not a binding guarantee — it influences where a bucket is likely to be
provisioned but does not enforce a jurisdiction. D-24 requires the stronger
`jurisdiction: "eu"` setting, and that setting can only be applied at bucket **creation** —
it cannot be changed on an existing bucket afterwards.

Before Phase 6's first upload, run `wrangler r2 bucket info vamos-photos-staging` and
`wrangler r2 bucket info vamos-photos-production`. If `jurisdiction` does not read `eu` for
either bucket, delete the (still-empty) bucket and recreate it with
`wrangler r2 bucket create <name> --location eu --jurisdiction eu` before anything is ever
written to it — recreating after the first upload means the objects themselves would need to
be migrated to the new bucket, not just a setting flipped on the existing one.

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

## QUOTE-09 Layer 1 — zone Rate Limiting Rule (dashboard, not source)

Configuration a human applies in the Cloudflare dashboard. Layers 2 and 3 ship in Worker
source either way. Do **not** apply this rule from this plan; record it here so the person
who applies it has the expression and the cost line in one place.

**One Rate Limiting Rule** (research AM-03 — the drafted expression covered only
`POST /api/quote`; cover quote **and** geo in the single Free-plan slot):

- Characteristic: `ip.src`
- Rate: 30 requests / 60 seconds
- Action: `managed_challenge` (not `block`)
- Expression covering `/api/quote*` **AND** `/api/geo/*` in one rule:

```
(http.request.uri.path matches "^/api/quote" or http.request.uri.path matches "^/api/geo/")
```

**U36 — zone plan cost line (owner decision, not assumed):** Cloudflare Free ships **one**
rate-limiting rule and no OWASP CRS. Pro adds a second rule slot and CRS and is a new
monthly cost the owner signs off. Layers 2 and 3 (Workers `ratelimits` bindings + Turnstile)
ship on Free. Do **not** recommend Business for `cf.unique_visitor_id` — CGNAT is solved at
the Worker layer (`vamos_qs`).

**If CRS is ever enabled:** Sensitivity **Low**, Action **Log** first. A JSON POST carrying
`O'Brien`, `LX318` and German, French or Arabic names will false-positive on apostrophes and
SQL-shaped substrings. Blocking before a clean staging week means refusing real customers by
name. Promote to Block only after staging traffic with real multilingual names is clean.

**Non-JSON caveat for the widget:** an edge `managed_challenge` returns HTML, not JSON. A
response that is not the quote shape means "challenged — reload and retry once", not a parse
error. That action is not in `QUOTE_ERRORS` because the edge never produces JSON.

## D-29 — no Cron mutates `price_snapshots`

Asserted against `apps/web/worker.ts` `scheduled` (Phase 1 no-op: emits one structured log
line, writes nothing). The existing `triggers.crons` entry `0 3 * * *` stays what Phase 1
shipped — add no Cron and remove none. GSD-LAUNCH's "Cron expire stale quotes" is a holdover
from a mutable status column. `expires_at <= now() AND booking_id IS NULL` already IS an
expired quote.

## Plan 06-06 — PHOTOS buckets and IMAGES (D-20 / D-21)

Checked 2026-09-01 during 06-06 execute. `apps/web/wrangler.jsonc` already binds:

| Env | Binding | Bucket / resource | Notes |
|---|---|---|---|
| staging | `PHOTOS` | `vamos-photos-staging` | Already declared. Not recreated. |
| production | `PHOTOS` | `vamos-photos-production` | Already declared. **Not created this sitting** (production bucket is Phase 11). |
| staging | `IMAGES` | `"images": { "binding": "IMAGES" }` | Present. D-21: photo display uses `next/image`. |
| production | `IMAGES` | `"images": { "binding": "IMAGES" }` | Present. Same branch. |

Jurisdiction: D-20 / D-24 require `--jurisdiction=eu` at **creation**. This sitting did not
run `wrangler r2 bucket create` (irreversible flag; production bucket out of scope). If
`vamos-photos-staging` already exists from an earlier provision, it is reused. A bucket
that exists **without** `eu` cannot be fixed in place — that is a rename + `wrangler.jsonc`
edit, not a patch.

`wrangler.jsonc` ids and `localConnectionString` placeholders were left unchanged.

