# @vamos/db

Supabase (Postgres) migrations, RLS policies, seed generation and the pgTAP test suite for
Vamos Taxi. The local Supabase project lives at `packages/db/supabase/` (moved here from the
repo root on 2026-08-23, D-38, so every executor and CI job runs the CLI from one working
directory — see `pnpm-workspace.yaml`'s `allowBuilds.supabase` and the pinned exact
`supabase@2.115.0` devDependency at the workspace root, D-21).

## Commands

Every script below runs with cwd `packages/db`, where the CLI resolves `./supabase/config.toml`.
Call them either directly (`pnpm --filter @vamos/db run <script>`) or through the root-level
`db:*` aliases (`pnpm db:start`, `pnpm db:reset`, …) that delegate to this package.

| Script | Command | Purpose |
|---|---|---|
| `start` | `supabase start` | Boot the local stack (Postgres 54322, API 54321, Studio disabled, Inbucket/Mailpit 54324) |
| `stop` | `supabase stop` | Stop the local stack |
| `reset` | `supabase db reset` | Drop and recreate the local database, replay every migration, then `seed.sql` |
| `test:db` | `supabase test db` | Run the pgTAP suite in `supabase/tests/` |
| `types` | `supabase gen types typescript --local --schema public > database.types.ts` | Regenerate committed TypeScript types from the local schema |
| `types:check` | `supabase gen types typescript --local --schema public \| diff -q - database.types.ts` | CI drift gate — fails if `database.types.ts` is stale |
| `seed:gen` | `node seed/generate-seed.mjs` | Regenerate `supabase/seed.sql` from `apps/web/i18n/messages/*.json` and `app/vamos-reviews.js`'s `SEED` array (D-22) |
| `seed:check` | `node seed/generate-seed.mjs --check` | CI drift gate — fails if the committed `seed.sql` doesn't match what the generator would produce |
| `push` | `supabase db push --include-seed` | Deploy migrations (+ seed) to the hosted project — owner-gated, Plan 02-10 |
| `link` | `supabase link --project-ref yaumjzvylngfjhtuffqs` | Re-link this directory to the hosted project (ref recorded in `docs/build/SUPABASE-RESOURCES.md`, D-37) |

Two test-loop shapes:

- **Single-file authoring loop** while writing one pgTAP file:
  `pnpm --filter @vamos/db run test:db supabase/tests/<name>.test.sql` — `supabase test db`
  accepts a file or directory path, so there's no need to run the whole suite while iterating.
- **Full gate** before opening a PR: `pnpm db:reset && pnpm db:test` — proves every migration
  applies clean from zero (the actual DATA-07 proof) and then that the whole pgTAP suite passes
  against that fresh state.

## Migration numbering rule (D-21)

Every Phase 2 migration file has a **pre-assigned name**, fixed in the table below, in the form
`packages/db/supabase/migrations/20260823000NN_<name>.sql` with `NN` = `01`…`24`. This satisfies
D-21's "never hand-type a colliding timestamp" intent by construction: because the full filename
(including the ordinal) is decided in the plan before any migration is written, no two plans in
this phase can produce the same prefix, and cross-plan foreign-key order is fixed in advance —
each later plan's migration numbers slot into the gaps this table already reserves.

**From Phase 3 onward, every new migration is created with `supabase migration new <name>`**
(never a hand-typed timestamp) so the CLI's own clock generates a collision-free prefix.

| # | File | Contents |
|---|---|---|
| 01 | `20260823000001_extensions` | `pgcrypto`, `btree_gist`, `citext`, `pgtap` into `extensions`; database `search_path` |
| 02 | `20260823000002_roles_and_helpers` | `vamos_edge`, `vamos_public`, `vamos_guest`, `vamos_staff`; `app` schema; `app.jwt/uid/manage_token_hash` (`app.is_staff/is_admin` land in 06 with the `staff` table) |
| 03 | `20260823000003_types` | every enum type; the `rappen` domain |
| 04 | `20260823000004_settings` | `settings`, `settings_versions` |
| 05 | `20260823000005_fleet` | `vehicle_classes`, `vehicles`, `chauffeurs` |
| 06 | `20260823000006_customers_and_staff` | `customers`, `staff`, `custom_access_token_hook` |
| 07 | `20260823000007_content_and_reviews` | `content_strings`, `reviews` |
| 08 | `20260823000008_rate_versions` | `rate_versions`, `service_zones`, `distance_rates`, `fixed_routes`, `surcharges`, freeze trigger |
| 09 | `20260823000009_coupons` | `coupons` only (redemptions move to 15, after `booking_payments`) |
| 10 | `20260823000010_bookings` | reference counter + generator, `bookings` |
| 11 | `20260823000011_booking_legs` | `booking_legs`, both exclusion constraints, buffer-snapshot trigger |
| 12 | `20260823000012_booking_access_tokens` | token table, `app.booking_has_manage_token`, `manage_booking_*` SECURITY DEFINER functions |
| 13 | `20260823000013_price_snapshots` | `price_snapshots`, `price_snapshot_legs`, rate-version-flag trigger, `bookings.price_snapshot_id` FK |
| 14 | `20260823000014_payments_refunds` | `booking_payments` + charge gate + update whitelist, `booking_refunds`, `stripe_events`, `booking_notifications` |
| 15 | `20260823000015_coupon_redemptions` | `coupon_redemptions` |
| 16 | `20260823000016_booking_events` | `booking_events` |
| 17 | `20260823000017_audit_log` | `audit_log`, `tg_audit_row`, per-table triggers |
| 18 | `20260823000018_consent_log` | `consent_log`, `record_consent()` |
| 19 | `20260823000019_append_only` | `tg_append_only` (incl. the snapshot-binding carve-out), triggers, revokes, `FORCE ROW LEVEL SECURITY` |
| 20 | `20260823000020_rls_enable` | `ENABLE ROW LEVEL SECURITY` on every table |
| 21 | `20260823000021_rls_customer` | `revoke all on all tables` baseline (must run first), DATA-02 column-scoped grants + policies |
| 22 | `20260823000022_rls_guest` | DATA-03 grants + policies |
| 23 | `20260823000023_rls_staff` | DATA-04 / AUTH-05 grants + policies, ledger tables SELECT-only, `realtime.messages` board authorization |
| 24 | `20260823000024_rls_public` | anon/`vamos_public` content grants, `settings_public` view (definer), `record_consent()` grant |

Three reorderings versus `02-SCHEMA-DRAFT.md` §16's illustrative sequence, each load-bearing:

- **`content_and_reviews` moved to 07** (immediately after `customers_and_staff`), ahead of
  `audit_log` (17). `tg_audit_row` (17) attaches its trigger to both `content_strings` and
  `reviews` as well as the admin-curated tables — both target tables must already exist when 17
  runs, and putting content/reviews early also keeps every "reference data" table (04–07)
  together as one readable block.
- **`coupon_redemptions` moved to 15**, after `payments_refunds` (14) instead of immediately
  after `booking_access_tokens`. D-29 (ADR-014 §6) FKs `coupon_redemptions` to a
  `booking_payments` row (consumption happens at payment, not at quote), so the table it
  references must exist first.
- **`consent_log` stays immediately before `append_only`** (18 before 19, matching the draft's
  relative order) — `append_only`'s trigger, revokes and `FORCE ROW LEVEL SECURITY` apply to
  `consent_log` along with every other append-only table, so the table must exist first or the
  whole reset aborts at `relation "public.consent_log" does not exist`.

**Forward-only. There is no `supabase migration down` and no `down.sql` convention** (D-21). A
bad migration is corrected by a new forward migration, and a destructive one by Point-in-Time
Recovery (Supabase Pro plan, 7-day window) — never by hand-editing or deleting a committed file.

## Role-password procedure

Migrations create the two login roles (`vamos_edge`, `vamos_public`) as
`LOGIN NOINHERIT` with **no password** — the Supabase CLI does not expand psql variables inside
a migration file, so a literal password or an `env(...)` placeholder would either commit a
secret or fail to resolve. Passwords are set out-of-band, per environment, once Phase 3 wires
each role into a Hyperdrive connection string:

```sql
ALTER ROLE vamos_edge PASSWORD '…';
ALTER ROLE vamos_public PASSWORD '…';
```

Run each statement directly against the target environment (local: `psql` on port 54322;
staging/production: the Supabase SQL editor or `psql` over the direct connection string) —
**never** commit either statement with a real password filled in, and never add them to a
migration file. This is D-21's "no secret literal in the repo" intent applied to the two login
roles this schema introduces.

## Before the first hosted push

Three staging-only probes from `02-CONTEXT.md` must run against the hosted project
(`yaumjzvylngfjhtuffqs`, see `docs/build/SUPABASE-RESOURCES.md`) before `pnpm db:push` is used
for real. All three stay `autonomous: false` — the database password and dashboard are
owner-held — so Plan 02-10 is where a human runs them. Full detail (statement, expected result,
encoded fallback) lives in `docs/build/SUPABASE-RESOURCES.md`'s probe table; summarised here:

| Probe | Question | Statement | Fallback if it fails |
|---|---|---|---|
| D-25 (U1) | Can `vamos_edge` be granted the built-in `authenticated` role? | `grant authenticated to vamos_edge with inherit false, set true;` | Create `vamos_customer nologin` mirroring `authenticated`'s grants; use `TO vamos_customer` everywhere a policy would say `TO authenticated` |
| D-27 (U3) | Does `supabase db push --include-seed` re-run the seed on every push? | `--dry-run` against a scratch project, then a real second push, diff row counts | Assumed load-bearing either way — every generated `INSERT` already carries `ON CONFLICT`, so a re-run is a no-op regardless of the answer |
| D-33 (U15) | Is the Custom Access Token Hook wired the same way the docs describe? | Check "Authentication → Hooks (Beta)" on the **live dashboard**, not from docs alone | pgTAP proves the hook function itself works; if the dashboard path differs, only the *invocation* wiring changes, not the function |

## Local project facts

- Ports: API `54321`, Postgres `54322`, shadow `54320`, Inbucket/Mailpit `54324`. Studio,
  analytics and the edge runtime are disabled locally (`config.toml`) for CI speed — `auth`,
  `realtime`, `api` and `db` stay enabled because `auth.users` and `realtime.messages` are
  referenced by later migrations.
- `packages/db/supabase/.temp/` and `.branches/` are git-ignored (the moved `.gitignore`) and
  hold linked-project metadata, including the local Postgres version confirmation for D-28:
  `.temp/postgres-version` reads `17.6.1.155`, matching `config.toml`'s `major_version = 17` — so
  every generated column in this schema is written `STORED` explicitly, correct on both.
