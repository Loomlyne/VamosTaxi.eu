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

Three staging-only probes, each `autonomous: false` because the database password and
dashboard are owner-held. Owned by Plan 02-10. Full context: `02-CONTEXT.md` D-25/D-27/D-33.

| Probe | Decision ID | Question | Exact statement / command | Expected result | Encoded fallback |
|---|---|---|---|---|---|
| Role grant | ~~D-25 (U1)~~ **RESOLVED 2026-08-24 — permitted; no fallback needed** | Can `vamos_edge` be granted the built-in `authenticated` role so a policy can say `TO authenticated`? | `grant authenticated to vamos_edge with inherit false, set true;` run against the hosted project | Grant succeeds with no error | Create `vamos_customer nologin` mirroring `authenticated`'s grants; use `TO vamos_customer` everywhere a policy would otherwise say `TO authenticated` |
| Seed re-run semantics | ~~D-27 (U3)~~ **RESOLVED 2026-08-24 — does NOT re-run (CLI hashes seed files)** | Does `supabase db push --include-seed` re-run `seed.sql` on every push, or only on first apply? | `supabase db push --include-seed --dry-run` against a scratch project, then a real second push, diffing row counts | Either behaviour is acceptable | Assumed load-bearing either way — every generated `INSERT` in `seed.sql` already carries `ON CONFLICT … DO UPDATE` (D-22), so a re-run is a no-op regardless of the answer |
| Custom Access Token Hook wiring | D-33 (U15) | Does the production dashboard path match the docs ("Authentication → Hooks (Beta)")? | Check the **live dashboard** directly, not from docs alone — Beta labelling implies drift | Path matches, hook can be enabled from the UI | pgTAP (Plan 02-02) already proves the hook function itself is correct; if the dashboard path differs, only the *invocation* wiring changes, not the function body |

## R2 jurisdiction note (D-24, cross-reference)

See `docs/build/CLOUDFLARE-RESOURCES.md` § "Jurisdiction note (D-24)" — the `PHOTOS` buckets
were created with `--location eu` (a best-effort hint, not a guarantee) and must be verified or
recreated with `--jurisdiction eu` before Phase 6's first upload. Recorded here too because it
is a residency fact alongside the Supabase region above, not because the bucket lives in this
project.
