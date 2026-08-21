# Research Brief — Migrations & Seed Mechanics (Phase 2: Data Schema, RLS & Staff Auth Foundations)

Lane: migrations-seed only. No schema/RLS/auth-policy design here — that's DATA-02/03/04 territory.

## 0. What the repo already commits to

`packages/db/README.md` (read): "Migrations will live here as SQL files versioned in order, plus a thin `postgres.js` access helper... Phase 3 wires the binding." `packages/db/package.json` is an empty scaffold (`main: index.ts`, no deps yet).

`docs/build/GSD-LAUNCH.md` §Phase 2 already names the tool: `supabase init` + local dev, "all schema as versioned migrations in `packages/db`", done-when `supabase db push` to staging, `supabase test db`, `supabase gen types`. §Phase 3 confirms Hyperdrive/postgres.js is **not** this phase's job — `apps/web/wrangler.jsonc` already omits the `hyperdrive` block for `env.staging` with a comment that Phase 3 adds it once `wrangler hyperdrive create` runs against a real project. `env.production.hyperdrive` exists only as a placeholder id + a `localConnectionString` for `wrangler dev`.

No `.github/workflows/*` file runs any Supabase command today — `pr.yml`, `deploy-staging.yml`, `deploy-production.yml` only typecheck/build/deploy the Worker. **This is a real gap Phase 2 must close**: a migration step has to be added to `deploy-staging.yml` (push to `main`) and `deploy-production.yml` (tag), before the Worker deploy step, or schema drifts from what the Worker expects.

Nothing under the repo is named `supabase/` yet (`find -iname '*supabase*'` returns only doc mentions) — Phase 2 is a clean start.

## 1. Migration tooling — decision

**Supabase CLI migrations, plain-numbered SQL, installed as a pinned npm devDependency.** Not declarative schemas (`supabase/schemas/` + `db diff`, [Supabase docs](https://supabase.com/docs/guides/local-development/declarative-database-schemas)) — that's a newer alpha-flavoured indirection layer (`@supabase/pg-delta`, [supabase/pg-toolbelt](https://github.com/orgs/supabase/discussions/44938)) that fights "versioned migrations in order," which the repo has already decided. Not a hand-rolled Node runner — it would have to reinvent what the CLI already does (ordered apply, remote history tracking, `db diff` capture, pgTAP test runner) and there is no reason to, since nothing here is Vercel-specific.

**Install** ([npm install guidance](https://supabase.com/docs/guides/local-development/cli/getting-started), current 2026 recommendation is devDependency over global brew for team version consistency):
```bash
pnpm add -D -w supabase   # root devDependency, pinned exact version (no ^)
```
CI mirrors the same pinned version via the official action, `supabase/setup-cli@v1` ([GitHub Marketplace](https://github.com/marketplace/actions/supabase-cli-action)), so a CLI upgrade is one PR that bumps both.

**Init & layout:**
```bash
cd packages/db
pnpm exec supabase init      # creates packages/db/supabase/{config.toml,migrations/,seed.sql}
```
```
packages/db/
  supabase/
    config.toml
    migrations/
      20260821120000_extensions_and_roles.sql
      20260821120001_profiles.sql
      20260821120002_vehicle_classes_vehicles_chauffeurs.sql
      20260821120003_bookings_booking_legs_booking_events.sql
      20260821120004_coupons_coupon_redemptions.sql
      20260821120005_fixed_routes_distance_rates_surcharges.sql
      20260821120006_reviews.sql
      20260821120007_content_strings.sql
      20260821120008_settings.sql
      20260821120009_stripe_events.sql
      20260821120010_rls_policies.sql       -- or interleaved per-table, see §2
      20260821120011_manage_token_rpc.sql   -- DATA-03 guest-token function
    seed.sql            -- generated, see §3 (do not hand-edit)
    tests/
      profiles_rls.test.sql
      bookings_rls.test.sql
      manage_token_rls.test.sql
      ops_role_rls.test.sql
  seed/
    generate-seed.mjs   -- reads apps/web/i18n/messages/*.json + app/vamos-reviews.js, writes supabase/seed.sql
  index.ts               -- thin postgres.js access helper (Phase 3 consumes)
  package.json
```
Migration filenames use the CLI's own `<timestamp>_<description>.sql` convention (`supabase migration new <name>` generates the timestamp) — never hand-type a timestamp, so two engineers on the same day don't collide ([Database Migrations guide](https://supabase.com/docs/guides/deployment/database-migrations)).

**Local dev loop:**
```bash
pnpm exec supabase start                    # local Postgres, Studio, Auth — one-time per machine
pnpm exec supabase migration new <name>     # scaffold, then hand-write the DDL
pnpm exec supabase db reset                 # drops local DB, replays every migration + seed.sql from zero
pnpm exec supabase db diff -f <name>        # only for capturing an ad-hoc Studio change into a migration; the primary path is hand-written SQL, not diff-driven, because RLS/grants/roles need to be authored deliberately, not inferred from a GUI click
```

**CI → staging → prod**, per the [Managing Environments guide](https://supabase.com/docs/guides/deployment/managing-environments) (its example 3-workflow shape maps directly onto the repo's existing `pr.yml` / `deploy-staging.yml` / `deploy-production.yml` split):

- `pr.yml` (add a job, doesn't touch a real project): `supabase start` locally in the runner, `supabase db reset` (proves every migration applies clean from zero every PR — the actual regression gate), then `supabase test db` (pgTAP, see §2), then `supabase gen types typescript --local` and `git diff --exit-code` against the committed types file (see §5). No secrets needed for this job.
- `deploy-staging.yml` (push to `main`, before the existing "Deploy Worker" step): `supabase link --project-ref $STAGING_PROJECT_ID` then `supabase db push --include-seed` against the **staging** project.
- `deploy-production.yml` (tag push, before "Deploy Worker"): same, against the **production** project ref. Given `deploy-production.yml`'s own comment ("today still serves the live Freshpage site... nothing at that hostname yet"), this step is real from day one even though the Worker route isn't live yet — the DB must be ready before Phase 11 cutover, not scrambled together at cutover time.

Required GitHub Actions secrets (new, not yet in the repo — `SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD`, `SUPABASE_PROJECT_ID` per env, [Managing Environments](https://supabase.com/docs/guides/deployment/managing-environments)):
```yaml
env:
  SUPABASE_ACCESS_TOKEN: ${{ secrets.SUPABASE_ACCESS_TOKEN }}        # shared, personal/org access token
  SUPABASE_DB_PASSWORD:  ${{ secrets.STAGING_SUPABASE_DB_PASSWORD }} # per-env
  SUPABASE_PROJECT_ID:   ${{ secrets.STAGING_SUPABASE_PROJECT_ID }}  # per-env, the project ref
```
This is a fourth secrets family alongside the `CLOUDFLARE_API_TOKEN`/`CLOUDFLARE_ACCOUNT_ID` pair `docs/build/GSD-LAUNCH.md` §Secrets already names — add it to that matrix when this phase lands.

`supabase db push` applies only migrations absent from the remote's history table, in timestamp order, so a repeated CI run is a no-op on schema (idempotent by construction) — [`supabase db push` reference](https://supabase.com/docs/reference/cli/supabase-db-push).

## 2. Ordering & idempotency — RLS, extensions, roles, grants

Everything that "reproduces a fresh environment exactly" (DATA-07's real ask) has to be a migration file, not a dashboard click or a manual `psql` session — the CLI's own guidance is blunt about this: *"never change the remote database directly... all schema changes require migration files"* ([Database Migrations guide](https://supabase.com/docs/guides/deployment/database-migrations)).

- **Extensions** (`pgcrypto` for `gen_random_uuid()`, `btree_gist` for the exclusion constraint Phase 8 needs on driver double-booking, `pgtap` for tests): `CREATE EXTENSION IF NOT EXISTS ... ;` in the first migration file. `IF NOT EXISTS` makes re-apply safe even though `db push` wouldn't re-run an applied migration anyway — belt and suspenders against a manual `db reset`.
- **Roles**: Supabase projects ship `anon`/`authenticated`/`service_role` already; this project's `dispatcher`/`admin` distinction is a JWT **claim value**, not a new Postgres role (`profiles.role` column + `auth.jwt() ->> 'role'` in policies), so there's no `supabase/roles.sql` / `--include-roles` need here — that flag exists for teams defining actual custom Postgres roles, which this project isn't doing. Confirmed against the `db push` flag list: `--include-roles` "incorporates custom roles defined in `supabase/roles.sql`" — skip it.
- **Grants**: every table gets `ALTER TABLE ... ENABLE ROW LEVEL SECURITY;` in the same migration file that creates it, immediately followed by its policies, or in a policies file directly after — write it as one PR per table (schema + RLS + a pgTAP test), never split across separate phases. `docs/build/GSD-LAUNCH.md` itself endorses this shape ("RLS tested with `supabase test db`" is inside Phase 2's own done-when, not deferred).
- **RLS test coverage**: `supabase/tests/*.sql`, pgTAP, run via `supabase test db` — [CLI reference](https://supabase.com/docs/reference/cli/supabase-test-db) confirms it's `pg_prove` against `supabase/tests`, each file wrapped in its own rolled-back transaction so tests never pollute local data. Write one test file per DATA-0x requirement this phase claims: a customer-reads-own-bookings test (DATA-02), a manage-token-only-guest-read test (DATA-03), a staff-role-vs-customer-role test on an ops table (DATA-04). This is the actual proof artifact for those three requirements, not just a nice-to-have.
- **Reproducibility check**: `supabase db reset` locally, and the PR-gate job doing the same in CI, is what proves "a fresh environment reproduces exactly" — it tears the local Postgres down to nothing and replays every migration + `seed.sql` from position zero every single PR. If that doesn't pass, DATA-07 isn't actually met no matter what staging looks like today.

## 3. Seeding (DATA-07)

**Decision: `packages/db/seed/generate-seed.mjs` is a build-time generator that writes a committed `packages/db/supabase/seed.sql`; the CLI applies it the normal way (`db reset` locally, `db push --include-seed` on deploy).** Not a runtime Node script invoked separately from migrations, not hand-typed SQL. Reasoning: the two real data sources are large and structured (four ~1500-line JSON catalogs, one JS array literal) — hand-typing INSERTs would drift from source on the next translation edit, and a separate runtime seeding script would be a second deploy step with its own auth/connection-string plumbing that Phase 3 hasn't wired yet. Generating `seed.sql` keeps seeding on the exact same rails (`supabase/`, CLI, CI secrets) as schema, with a diffable artifact a reviewer can read.

**Source audit (read-only, as instructed):**

- Content strings — **not** `app/vamos-i18n-dict.js` (that's the design-mock's flat dictionary + regex `patterns`, already superseded in `apps/web`). The real production source is `apps/web/i18n/messages/{en,de,fr,ar}.json` — next-intl nested namespace catalogs, confirmed identical shape and size across all four locales (1608 lines each; en.json = 20 top-level namespaces, 1538 leaf strings). Each file carries a reserved `$meta` top-level object (`pendingValueKeys`, `nonTranslatableKeys`, `noParamKeys`) that is build-time bookkeeping, not a message namespace — `apps/web/i18n/request.ts` already strips it before next-intl ever sees it (`stripMeta()`), and `scripts/check-i18n-coverage.mjs` skips any top-level key starting with `$`. `generate-seed.mjs` must do the same: flatten each JSON to dotted keys (`home.hero.title`), skip `$meta`, and skip any key listed in `$meta.nonTranslatableKeys` per ADR-011 (`common.brandName`, vehicle class names — these stay literal in every locale by design, not a translation gap).
- Reviews — `app/vamos-reviews.js`'s `SEED` array (5 rows, IIFE-wrapped JS, not JSON — `generate-seed.mjs` needs a small regex or a `new Function()` eval of just the `SEED = [...]` literal to lift it without executing the whole IIFE's localStorage-touching code). Field mapping to the `reviews` table is exact per the extracted contract (`id`→drop and let the table generate its own, `source`, `name`, `role`, `text`, `rating`, `route`, `vehicleClass`, `avatar`, `url`, `verified`, `published`; `locked` is *derived* — `isImported(source)` — never stored as seed input, compute it in SQL or a generated column instead of trusting a seeded value that could drift from the derivation rule).
- Vehicle classes / settings — no existing JS/JSON source at all (the mock's `RATE_DEFAULT_PAX` map and `VEHICLE_CLASSES` enum live inline in `app/vamos-ops-data.js`, not extracted as data); `generate-seed.mjs` hard-codes these three rows (Economy 3/3, Business, Van 8/8 — GSD-LAUNCH's own capacities note) and one `settings` singleton row. Per **ADR-002**, `settings.airport_waiting_minutes` / `settings.city_waiting_minutes` must be seeded **NULL**, never 60/15 — the generator must not "help" by inventing plausible defaults; that's the whole point of Law 04's `data-tok` pill design carrying through to the database.

**Idempotency**: every generated `INSERT` uses `ON CONFLICT (<natural-or-stable-key>) DO UPDATE SET ...` (content_strings keyed on `key`, vehicle_classes keyed on `slug`/`name`, reviews keyed on a deterministic id derived from the mock's own `rv-1`…`rv-5` ids so re-seeding never duplicates) — [current guidance](https://seedfa.st/blog/supabase-db-seed) on Supabase seed idempotency: *"write idempotent INSERT statements or use ON CONFLICT DO NOTHING/DO UPDATE to avoid errors on re-runs."* `supabase db reset` already truncates before replaying `seed.sql` locally, but staging/production only ever *push* forward (no reset), so `ON CONFLICT` is the only thing making a second `--include-seed` push safe there.

**Remote push caveat (UNCERTAIN, confirm before relying on it in CI):** the [`supabase db push` reference](https://supabase.com/docs/reference/cli/supabase-db-push) documents `--include-seed` as "include seed data from your config," but does not state whether it runs the seed file every push or only once — and a June 2026 community note ([seedfa.st](https://seedfa.st/blog/supabase-db-seed)) says *"the CLI's seed files target the local stack, and as of June 2026, a remote Supabase project does not pick them up automatically"* without the flag. **Check before wiring the CI step**: run `supabase db push --include-seed --dry-run` against a scratch/staging project once, by hand, and read what it reports it will execute. If it turns out to re-run the whole seed file unconditionally on every push (not just first-time), the `ON CONFLICT` idempotency above is load-bearing, not optional — confirm this with a real second push and diff the row counts before trusting it in `deploy-staging.yml`.

**Kept in sync with the running app**: right now `apps/web` does not read `content_strings` at all — `apps/web/i18n/request.ts` loads the JSON files directly and its own doc-comment names the seam explicitly: *"Phase 1's implementation reads the matching JSON file below; Phase 6 swaps this function's body for a `content_strings` query and no call site elsewhere has to move."* So until Phase 6, the JSON files are the only source the app actually renders from, and the DB's `content_strings` table is a forward-seeded mirror nobody queries yet — `generate-seed.mjs` must be re-run (and `seed.sql` re-committed, re-pushed) every time a translator edits `apps/web/i18n/messages/*.json`, or the mirror silently goes stale before it's ever load-bearing. Add a CI check next to `pnpm i18n:check` (D-17's existing gate) that fails if `packages/db/supabase/seed.sql` is older/different than what `generate-seed.mjs` would currently produce — same `git diff --exit-code` pattern the type-gen job already uses.

## 4. Rollback

Supabase migrations are **forward-only** — there is no `supabase migration down` in the CLI; *"to undo a migration, you write a new migration that reverses the changes"* ([community + docs consensus](https://github.com/orgs/supabase/discussions/11263)). A bad migration on a live project has two recovery paths, by severity:

- **Non-destructive bad migration** (wrong column type, missing index, an RLS policy too loose): write and push a new forward migration that corrects it. This is the normal path and should be assumed first.
- **Destructive bad migration** (dropped a column with data, corrupted rows via a bad `UPDATE` inside a migration file): **Point-in-Time Recovery**, available on the Pro plan this project is already budgeted for (`docs/build/GSD-LAUNCH.md` prices Supabase Pro at $25/project) — restore to any second within the retention window (7 days on Pro) via Dashboard → Settings → Database → Backups → Point-in-Time tab. The project is inaccessible during restore; downtime scales with DB size ([Backup and Restore guide](https://supabase.com/docs/guides/platform/backups)). This is why the PR-gate job's `supabase db reset` (full replay from zero, every PR) matters more than it looks — it's the thing that catches a migration that would corrupt data *before* it ever reaches staging or prod, since a local `db reset` failure blocks the merge.
- **Migration history desync** (a migration applied out-of-band, or CI died mid-push): `supabase migration list` shows local-vs-remote status; `supabase migration repair --status applied|reverted <timestamp>` manually corrects the remote history table without re-running the SQL — for the rare case where the DDL actually succeeded (or was manually reverted) but the CLI's bookkeeping doesn't know it.

No `down.sql` convention is needed or recommended for this project — don't build one; it doesn't match how the CLI or Supabase's own guidance works, and would be unmaintained scaffolding by Phase 5.

## 5. Typed access for postgres.js (no ORM)

**Decision: `supabase gen types typescript`, generated into `packages/db/database.types.ts`, committed to the repo and checked for drift in CI — not hand-written, not a SQL template-literal type library.** This is the only option that's free (no new dependency), stays exactly in sync with the migrations that are the actual source of truth, and needs zero hand-maintenance as tables change — [Generating TypeScript Types guide](https://supabase.com/docs/guides/api/rest/generating-types) confirms it "connects to your database (local or remote) and generates typed definitions that match your database tables, views, and stored procedures," including enums and foreign keys.

```bash
# local (dev loop, run after every migration change)
pnpm exec supabase gen types typescript --local > packages/db/database.types.ts

# CI drift-check (add to the PR-gate job, after supabase db reset)
pnpm exec supabase gen types typescript --local > /tmp/database.types.ts
diff -q /tmp/database.types.ts packages/db/database.types.ts || \
  (echo "database.types.ts is stale — regenerate and commit" && exit 1)
```
Pattern taken directly from Supabase's own [CI type-generation guide](https://supabase.com/docs/guides/deployment/ci/generating-types) (`supabase db start` → `gen types typescript --local` → `git diff --exit-code`), adapted to this repo's existing `pr.yml` gate job rather than a new workflow.

**Using the types with `postgres.js` (no ORM, no Drizzle, no Kysely — none is in `apps/web/package.json` or `pnpm-lock.yaml` today, and none should be added for this)**: `supabase gen types` output is a `Database` interface shaped for `supabase-js`'s builder (`Database['public']['Tables']['bookings']['Row']`), not postgres.js-native — but it's still the correct source, just consumed through a thin manual mapping in the Phase-3-owned `packages/db/index.ts` helper: import the row types (`type Booking = Database['public']['Tables']['bookings']['Row']`) and hand-write each query function's return type as `Promise<Booking[]>` etc. Do not reach for a "postgres.js + typed SQL template literal" library (e.g. `pgtyped`, `@ts-safeql`) — the stack notes are explicit that this project is "direct SQL with prepared statements," no query-generation tooling, and `supabase gen types` already gives 100% of the row-shape safety needed without a second code-gen pipeline to keep in sync.

---

## RECOMMENDATION (single decision, not a menu)

1. **Tooling**: Supabase CLI (`supabase` npm package, pinned devDependency at repo root), plain timestamped SQL migrations under `packages/db/supabase/migrations/`. No declarative-schema mode, no hand-rolled Node migration runner.
2. **Ordering**: one migration file per table = its DDL + its `ENABLE ROW LEVEL SECURITY` + its policies, in the dependency order listed in §1's file tree; extensions in the very first file with `IF NOT EXISTS`; no custom Postgres roles needed (staff/customer distinction is a JWT claim, not a DB role) so `--include-roles`/`roles.sql` is unused.
3. **Verification**: a pgTAP test file per RLS requirement (DATA-02/03/04) under `packages/db/supabase/tests/`, run via `supabase test db` in the PR-gate CI job, alongside a full `supabase db reset` (the actual "fresh environment reproduces exactly" proof for DATA-07).
4. **Seeding**: `packages/db/seed/generate-seed.mjs` reads `apps/web/i18n/messages/*.json` (stripping `$meta`, skipping ADR-011 non-translatable keys) and `app/vamos-reviews.js`'s `SEED` array, and writes a committed, idempotent (`ON CONFLICT DO UPDATE`) `packages/db/supabase/seed.sql`; `vehicle_classes` and `settings` (with waiting-minutes fields left NULL per ADR-002) are hard-coded in the generator since no JS/JSON source exists for them. CI fails if the committed `seed.sql` is stale relative to current sources — mirroring the existing `pnpm i18n:check` pattern.
5. **CI/CD**: add a migration step to `deploy-staging.yml` (push to `main`) and `deploy-production.yml` (tag push) — `supabase link --project-ref … && supabase db push --include-seed` — before the existing Worker deploy step, using three new per-env GitHub secrets (`SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD`, `SUPABASE_PROJECT_ID`) that don't exist in the repo today. **First confirm the `--include-seed` re-run behaviour against a real project with `--dry-run`** (documented behaviour is ambiguous — see §3) before trusting it unattended in CI.
6. **Rollback**: forward-only migrations always; Point-in-Time Recovery (Pro plan, 7-day window) is the only recovery path for a destructive migration that already ran on staging/prod. `supabase migration list`/`repair` fixes history bookkeeping only, never re-runs SQL.
7. **Types**: `supabase gen types typescript --local > packages/db/database.types.ts`, committed, drift-checked in CI (`git diff --exit-code`) the same way `apps/web` already drift-checks `scripts/check-i18n-coverage.mjs`. Consumed by hand in the Phase-3-owned `postgres.js` helper — no query-typing library.

**Open item for the implementer, not this phase's job to fix**: `apps/web/wrangler.jsonc`'s `env.production.hyperdrive.localConnectionString` currently points at `postgres://postgres:postgres@localhost:5432/postgres` (port 5432), but `supabase start`'s local Postgres listens on **54322** by default, not 5432 ([confirmed via `config.toml` default](https://supabase.com/docs/reference/cli/supabase-postgres-config)) — flagging so Phase 3 doesn't waste time on a silent connection-refused when wiring the Worker to the local stack.