# Supabase Resources — vamos-taxi

Mirrors `docs/build/CLOUDFLARE-RESOURCES.md`'s register: one place to see the hosted Supabase
project's full surface, so later phases add code against plumbing that already exists rather
than provisioning it under deadline pressure.

## Hosted project

| Field | Value |
|---|---|
| Project ref | `yaumjzvylngfjhtuffqs` |
| Region | **Central Europe (Zurich)** |
| Postgres version | `17.6` (`.temp/postgres-version` reads `17.6.1.155`; local `config.toml` pins `major_version = 17`) |

**D-37 amendment (2026-08-23):** the hosted project was created in Central Europe (Zurich),
**not** the Frankfurt `eu-central` region that `02-RESEARCH.md`, `.planning/PROJECT.md` and
`.planning/ADR-007-edge-data-residency.md` originally assumed. Zurich is the launch market, so
this is strictly better for residency — Postgres now sits inside Switzerland rather than merely
close to it. `.claude/CLAUDE.md` still names Frankfurt; correcting it is the owner's file to
update (it lives outside `.planning/` and is not touched by this plan's file scope).

Because Postgres 17.6 is confirmed remote and `major_version = 17` locally (D-28), **every
generated column in this schema is written `STORED` explicitly** — the syntax that is correct
on both PG17 and PG18, so a future major-version bump on either side never silently breaks a
generated column definition.

## GitHub Actions secrets (not yet configured — owner-held)

Three secrets the deploy workflows (`pr.yml` / `deploy-staging.yml` / `deploy-production.yml`)
will consume once Plan 02-10 wires the CI migration step, joining the existing Cloudflare pair
(`CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`) documented in `GSD-LAUNCH.md`'s Secrets / env
matrix:

| Secret | Purpose | Status |
|---|---|---|
| `SUPABASE_ACCESS_TOKEN` | Authenticates the CLI (`supabase login` equivalent) for non-interactive CI runs | not yet configured — owner-held |
| `SUPABASE_DB_PASSWORD` | Database password for `supabase db push` / `supabase link` against the hosted project | not yet configured — owner-held |
| `SUPABASE_PROJECT_ID` | The project ref above (`yaumjzvylngfjhtuffqs`), passed to `--project-ref` in CI so it isn't hand-typed into every workflow file | not yet configured — owner-held |

No CI job this phase reads these — the `push` package script is never run by any CI job in
Phase 2; the first real hosted push is Plan 02-10's owner-gated checkpoint (T-02-18, accepted
risk this phase).

## Local stack facts

| Fact | Value |
|---|---|
| API URL | `http://127.0.0.1:54321` |
| DB URL | `postgresql://postgres:postgres@127.0.0.1:54322/postgres` (port **54322**) |
| Shadow DB port | `54320` |
| Inbucket / Mailpit (email testing) | `http://127.0.0.1:54324` |
| Studio | disabled locally (CI speed — see `packages/db/supabase/config.toml`) |

**Phase 3 flag (from 02-RESEARCH.md Lane 6):** `apps/web/wrangler.jsonc`'s
`env.production.hyperdrive.localConnectionString` still points at port `5432`, the Postgres
default, not this project's local port `54322`. Phase 3 must update that string when it wires
the Hyperdrive binding for local `wrangler dev`, or local Worker-to-DB calls will fail to
connect while `supabase status` reports everything healthy.

## Role-password procedure

See `packages/db/README.md` § Role-password procedure — `vamos_edge` and `vamos_public` are
created with no password in the migrations; `ALTER ROLE … PASSWORD '…'` is run out-of-band per
environment, never committed.

## D-43 (U32) — connection headroom, measured before the first `wrangler hyperdrive create`

**Measured 2026-08-25, plan 03-07, before any Hyperdrive config existed on this project** (list
was empty — `wrangler hyperdrive list` confirmed zero configs immediately beforehand). The
direct connection string is unreachable from the executor's own machine (see "IPv6-only origin"
below), so this ran through `supabase db query --linked`, which queries via the Management API
rather than opening a raw Postgres socket — sidesteps the reachability gap entirely, at the cost
of measuring at the moment the CLI call executes rather than continuously:

```sql
select current_setting('max_connections') as max_connections,
       (select count(*) from pg_stat_activity) as active_connections;
```

| Field | Value |
|---|---|
| `max_connections` | **60** (Supabase Micro compute, matches `03-RESEARCH.md`'s assumption) |
| `pg_stat_activity` count at measurement time | **13** (Auth, Realtime, PostgREST, Studio/dashboard sessions, and this measurement's own transient connection — no Hyperdrive config existed yet, so none of the 13 is a Hyperdrive origin) |

**The research's original 25 + 15 + 5 = 45 split does not leave comfortable headroom.**
`60 − 13 − 45 = 2` connections of spare capacity — not comfortable, given three compounding
factors: (a) 13 is a single point-in-time snapshot that will grow under real Auth/Realtime/
PostgREST traffic, not a floor; (b) D-24's unplaced Cron and Queues consumers draw on the same
`max_connections` ceiling even though their latency sits outside DATA-05's scope; (c) Cloudflare
Hyperdrive's own documented origin-connection-limit floor is 5 (`03-RESEARCH.md` "Sizing the two
pools"), which bounds how far the probe pool specifically can be lowered.

**Decision: lower all three limits proportionally (D-43's fallback), holding the probe at
Cloudflare's own floor.** Target: leave at least a 10-connection buffer above baseline + pools
(`60 − 13 − X ≥ 10` ⇒ `X ≤ 37`). The probe pool stays at the Cloudflare-documented floor of 5
(cannot go lower); the remaining 32-connection budget splits at the original 25:15 (5:3) ratio
between the identity and public configs:

- Probe (`vamos-probe-staging`): held at the floor, **5** (unchanged from the research's number).
- Remaining budget: `37 − 5 = 32`, split 5:3 → identity `32 × 5⁄8 = 20`, public `32 × 3⁄8 = 12`.

| Config | Research figure | **Derived figure (applied)** |
|---|---|---|
| `vamos-rls-staging` (`HYPERDRIVE_NOCACHE`, identity, `vamos_edge`) | 25 | **20** |
| `vamos-public-staging` (`HYPERDRIVE`, public, `vamos_public`) | 15 | **12** |
| `vamos-probe-staging` (dedicated 5-origin probe) | 5 | **5** (Cloudflare floor, unchanged) |
| **Total** | 45 | **37** |
| **Headroom (`60 − 13 − total`)** | 2 (not comfortable) | **10** |

Because the probe pool's own limit did not change (still 5, the value `test/support/drive.ts`'s
`ITERATION_DEFAULTS` and `PROBE_MIN_ADJACENCY=200` were already sized against), the isolation
harness's committed `PROBE_REQUESTS=400` / `PROBE_CONCURRENCY=32` / `PROBE_MIN_ADJACENCY=200`
starting values are **re-confirmed, not re-derived**: `E[S] ≈ (N − L) · 0.5` with `N=400`,
`L=5` gives `≈197`, already inside the committed 200 floor's own margin of error. Only the
identity and public app-side pools were resized; nothing about the probe's own connection
budget or the adjacency-floor arithmetic changes.

## IPv6-only origin — a laptop limitation, not a design defect

`db.yaumjzvylngfjhtuffqs.supabase.co` carries an `AAAA` record only (`2a05:d019:cf3:6a00:…`) —
**no `A` record at all.** Confirmed 2026-08-25: `dig A` returns empty, `dig AAAA` resolves.
Cloudflare Hyperdrive reaches it without issue (the three configs below were created against
this exact host on port 5432 and immediately read back over the Cloudflare API). The executor's
own machine has no IPv6 route to it (`curl -6` to an external IPv6-only echo service round-trips
through what is evidently a NAT64/DNS64 path, not a native route — a raw `psql`/`postgres.js`
connection from this laptop to the direct string times out / `ENOTFOUND`s). This is the
laptop's own network limitation, not a reason to switch the design to Supavisor's pooled port —
D-01/D-02/D-03's direct-connection design stands. Every precondition this plan needed against
the hosted project ran through `supabase db query --linked` (Management API, not a raw socket)
instead. **`packages/db/test/fixtures/two-customers.ts`'s `ownerSql()` opens a genuine direct
Postgres socket to `VAMOS_OWNER_URL`** — that function inherits the same unreachability from
wherever it runs. It has never been reachable from this executor's machine; whether the
`data-06` CI job in `deploy-staging.yml` (a GitHub Actions runner, not this laptop) has outbound
IPv6 is unverified and is the acceptance test for that job's first real run.

## Security note — service_role key exposed in a tool-output transcript (2026-08-25)

While investigating whether `SUPABASE_SERVICE_ROLE_KEY`/`SUPABASE_ANON_KEY` could be sourced
from the already-authenticated Supabase CLI session (`supabase projects api-keys --project-ref
yaumjzvylngfjhtuffqs`, no `--reveal` flag), the command's own JSON output printed the **legacy
`anon` and `service_role` API keys in full** to this executor's tool-call output — the CLI masks
its newer `sb_secret_...` key format by default but does **not** mask the older legacy JWT-format
keys the same call also returns. The `anon` key is Supabase's own public-by-design key (safe —
ships in every browser bundle, RLS is the actual boundary); the **`service_role` key is not** —
it bypasses RLS entirely and should be treated as compromised.

**No key was written to any file, committed, or used again this session** — this executor did
not print it a second time and did not proceed to use it for anything (the fixture-seeding work
that key would have unlocked was abandoned for the separate, independent reason that
`VAMOS_OWNER_URL` — the actual blocker — was never supplied and is unobtainable via any CLI
command tried). **Recommended owner action:** rotate the `service_role` key for
`yaumjzvylngfjhtuffqs` from the Supabase dashboard (Project Settings → API) as a precaution,
since it appeared in this session's tool-call transcript. The `anon` key needs no rotation — it
is meant to be public.

## Before the first hosted push — probe checklist

Owned by Plan 02-10. Full context: `02-CONTEXT.md` D-25/D-27/D-28/D-33.
U2 (`set_config('role', $1, true)` ≡ `SET LOCAL ROLE`) and U4 (local PG 17.6, `STORED`
generated columns required) were **settled locally** per
`research/local-toolchain-probe.md` — remote check not required.

Ready-to-paste commands (SQL editor unless noted) and **observed** results against
`yaumjzvylngfjhtuffqs`. The `vamos_customer` fallback was never applied.

| Probe | Decision ID | Exact statement / command | Expected | Observed |
|---|---|---|---|---|
| Role grant | D-25 (U1) | SQL editor: `begin; create role _probe_edge login noinherit; grant authenticated to _probe_edge with inherit false, set true; select inherit_option, set_option from pg_auth_members where member = '_probe_edge'::regrole; rollback;` — a failure at migration `…02`'s grant **is** the U1 answer. Live confirmation (no leftover role): `select r.rolname as member, g.rolname as granted, m.inherit_option, m.set_option from pg_auth_members m join pg_roles r on r.oid = m.member join pg_roles g on g.oid = m.roleid where r.rolname = 'vamos_edge' and g.rolname = 'authenticated';` | `inherit_option=f`, `set_option=t` | **permitted** (observed 2026-08-27): `vamos_edge → authenticated`, `inherit_option=false`, `set_option=true`. Four `vamos_*` roles only — no `vamos_customer`. First permitted 2026-08-24 when `…002` applied unmodified (24/24). Fallback not used. |
| First push | D-37 | Terminal: `SUPABASE_ACCESS_TOKEN=… SUPABASE_DB_PASSWORD=… pnpm db:link && pnpm db:push` | 24 migrations + seed | **observed 2026-08-24** (02-09 post-execution fix): all 24/24 applied; seed collapsed to a single `DO` block after Supavisor truncated the original multi-statement file. **Re-listed 2026-08-27:** `20260823000001`…`20260823000024` present (`extensions` … `rls_public`). |
| Seed re-run | D-27 (U3) | After first successful push: `pnpm --filter @vamos/db exec supabase db push --include-seed --dry-run`, then a real second push, then `select 'vehicle_classes', count(*) from vehicle_classes union all select 'settings', count(*) from settings union all select 'settings_versions', count(*) from settings_versions union all select 'content_strings', count(*) from content_strings union all select 'reviews', count(*) from reviews union all select 'service_zones', count(*) from service_zones union all select 'rate_versions', count(*) from rate_versions union all select 'distance_rates', count(*) from distance_rates union all select 'surcharges', count(*) from surcharges;` | Counts identical before/after | **does not re-run** (observed 2026-08-24): second push `{"upToDate":true,"seeds":[]}` — CLI hashes `supabase_migrations.seed_files`. **Reconfirmed 2026-08-27:** `seed_files` has `supabase/seed.sql` (hash present). Hosted counts: vehicle_classes=3, settings=1, settings_versions=1, content_strings=1516, reviews=5, service_zones=8, rate_versions=1, distance_rates=3, surcharges=8. |
| Custom Access Token Hook | D-33 (U15) | Dashboard: Authentication → Hooks → enable Custom Access Token hook → `public.custom_access_token_hook`. Record the menu path as actually observed. | Hook enabled | **enabled** (owner-attested 2026-08-24): observed menu path **Authentication → Hooks → "Customize Access Token (JWT) Claims hook" → Postgres function `public.custom_access_token_hook`**. **Reconfirmed 2026-08-27:** function `public.custom_access_token_hook(event jsonb)` exists; `EXECUTE` granted to `supabase_auth_admin`. Dashboard toggle has no read-only SQL surface. Residual: first hosted staff JWT with `app_metadata.vamos_role` is Phase 6. |
| Postgres version | D-28 | SQL editor: `select version();` | PostgreSQL 17.x | **observed 2026-08-27:** `PostgreSQL 17.6 on x86_64-pc-linux-gnu, compiled by gcc (GCC) 15.2.0, 64-bit`. Matches `.temp/postgres-version` `17.6.1.155`. |

### Hosted migration list (2026-08-27)

`01_extensions` `02_roles_and_helpers` `03_types` `04_settings` `05_fleet`
`06_customers_and_staff` `07_content_and_reviews` `08_rate_versions` `09_coupons`
`10_bookings` `11_booking_legs` `12_booking_access_tokens` `13_price_snapshots`
`14_payments_refunds` `15_coupon_redemptions` `16_booking_events` `17_audit_log`
`18_consent_log` `19_append_only` `20_rls_enable` `21_rls_customer` `22_rls_guest`
`23_rls_staff` `24_rls_public` — all version `202608230000NN`.

## R2 jurisdiction note (D-24, cross-reference)

See `docs/build/CLOUDFLARE-RESOURCES.md` § "Jurisdiction note (D-24)" — the `PHOTOS` buckets
were created with `--location eu` (a best-effort hint, not a guarantee) and must be verified or
recreated with `--jurisdiction eu` before Phase 6's first upload. Recorded here too because it
is a residency fact alongside the Supabase region above, not because the bucket lives in this
project.
