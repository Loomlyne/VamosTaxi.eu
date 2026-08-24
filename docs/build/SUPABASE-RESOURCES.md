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
