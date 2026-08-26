# Local toolchain probe — Supabase CLI + local Postgres

Settles the "## UNCERTAIN" items U1–U4 and the "## Validation Architecture" quick-run
question from `02-RESEARCH.md`, against the **local** Supabase dev stack only
(`supabase status`, `docker ps` confirm `API 127.0.0.1:54321`, `DB 127.0.0.1:54322`,
container `supabase_db_VamosTaxi.eu`). Nothing here touches a linked/managed project.

Environment: Supabase CLI `2.109.1` (Homebrew), local Postgres `17.6`
(`aarch64-unknown-linux-gnu`), `psql` not installed on the host (`which psql` → not
found) so all live-DB probes ran via `docker exec -i supabase_db_VamosTaxi.eu psql -U
postgres -d postgres -X`.

---

## Probe 1a — `supabase --version`

```
$ supabase --version
2.109.1
```

**Settles:** environment baseline for every other probe in this file.

---

## Probe 1b — `supabase test db --help`

```
$ supabase test db --help
DESCRIPTION
  Run pgTAP tests on the local or linked database.

USAGE
  supabase test db [flags] <path...>

ARGUMENTS
  path... string    Paths to test files or directories.

FLAGS
  --db-url string    Tests the database specified by the connection string (must be percent-encoded).
  --linked           Runs pgTAP tests on the linked project.
  --local            Runs pgTAP tests on the local database.

GLOBAL FLAGS
  --help, -h, --version, -v, --completions, --log-level, --output-format, --output/-o,
  --profile, --debug, --workdir, --experimental, --network-id, --yes, --dns-resolver,
  --create-ticket, --agent   [standard CLI-wide flags, identical across all `supabase`
  subcommands — omitted from every probe below after this one]
```

**Answer:** Yes — `supabase test db` takes `<path...>` (one or more paths to test files
*or directories*), confirmed by the `USAGE` line and the `ARGUMENTS` block. So a
per-file quick run is `supabase test db supabase/tests/foo.test.sql` (or a directory to
scope a wave). This is a real CLI capability, not something 02-RESEARCH.md needed to
guess at — the "no confirmed per-file flag" note in the Validation Architecture section
undersells what the CLI already does.

**Settles:** Validation Architecture "Quick run command" row — directly, via help text.

---

## Probe 1c — `supabase test new --help`

```
$ supabase test new --help
DESCRIPTION
  Create a new test file.

USAGE
  supabase test new [flags] <name>

ARGUMENTS
  name string    Name of the test file to create.

FLAGS
  --template, -t choice    Template framework to generate. (choices: pgtap)
```

**Settles:** confirms `supabase test new <name> -t pgtap` is the scaffolding command for
new pgTAP files in Wave 0 (not requested by U1–U4 directly, but needed for the Wave 0
gap list in Validation Architecture).

---

## Probe 1d — `supabase gen types --help` and `supabase gen types typescript --help`

```
$ supabase gen types --help
DESCRIPTION
  Generate types from Postgres schema.

USAGE
  supabase gen types [flags]

FLAGS
  --local                          Generate types from the local dev database.
  --linked                         Generate types from the linked project.
  --db-url string                  Generate types from a database url.
  --project-id string              Generate types from a project ID.
  --lang choice                    Output language of the generated types. (default typescript) (choices: typescript, go, swift, python)
  --schema, -s string              Comma separated list of schema to include.
  --swift-access-control choice    Access control for Swift generated types. (default internal) (choices: internal, public)
  --postgrest-v9-compat            Generate types compatible with PostgREST v9 and below.
  --query-timeout string           Maximum timeout allowed for the database query. (default 15s)

EXAMPLES
  # Generate types from the local dev database
  supabase gen types --local

  # Generate Go types from the linked project
  supabase gen types --linked --lang=go

  # Generate types from a project ID with specific schemas
  supabase gen types --project-id abc-def-123 --schema public --schema private

  # Generate types from a database URL
  supabase gen types --db-url 'postgresql://...' --schema public --schema auth

$ supabase gen types typescript --help
[identical output to the above — "typescript" is not a distinct registered subcommand
in CLI 2.109.1, it falls through to the same `gen types` command/help]
```

Live-execution check (read-only, against local DB only):
```
$ supabase gen types typescript --local | head -3      # exit 0, valid TS output
$ supabase gen types --local --schema public | head -3  # exit 0, valid TS output
$ supabase gen types typescript --local --schema public | head -3  # exit 0, valid TS output
```
All three invocations connect and print `export type Json = …`. So the literal
`gen types typescript --local` form 02-RESEARCH.md assumed still works in 2.109.1 — the
trailing `typescript` token is accepted and ignored (it's the default `--lang` value
anyway) rather than being a real subcommand.

**Answer:** `--local` runs against the local DB; `--schema`/`-s` takes a comma-separated
list or repeats (`--schema public --schema private`); there is no `typescript`
subcommand distinct from the flag-based form — `supabase gen types --local
--lang=typescript --schema public` and `supabase gen types typescript --local --schema
public` are equivalent in this CLI version.

**Settles:** U4-adjacent tooling question (P7's `gen types` command in `deploy-staging.yml`
etc.) — not a numbered U-item, but load-bearing for the P7 CI job command.

---

## Probe 1e — `supabase db reset --help`

```
$ supabase db reset --help
DESCRIPTION
  Resets the local database to current migrations.

USAGE
  supabase db reset [flags]

FLAGS
  --db-url string       Resets the database specified by the connection string (must be percent-encoded).
  --linked              Resets the linked project with local migrations.
  --local                Resets the local database with local migrations.
  --no-seed             Skip running the seed script after reset.
  --sql-paths string    Override [db.seed].sql_paths for this reset. May be repeated; each value accepts a SQL file path or glob pattern relative to the supabase directory and force-enables seeding.
  --version string      Reset up to the specified version.
  --last integer         Reset up to the last n migration versions.
```

**Settles:** confirms `db reset` always re-seeds unless `--no-seed` is passed (seeding is
the default, not opt-in), and that `--sql-paths` can scope/override which seed files run
per reset — useful for the P7 seed-idempotency test design, not a numbered U-item.

---

## Probe 1f — `supabase db push --help`

```
$ supabase db push --help
DESCRIPTION
  Push new migrations to the remote database.

USAGE
  supabase db push [flags]

FLAGS
  --include-all            Include all migrations not found on remote history table.
  --include-roles          Include custom roles from supabase/roles.sql.
  --include-seed           Include seed data from your config.
  --dry-run                Print the migrations that would be applied, but don't actually apply them.
  --db-url string          Pushes to the database specified by the connection string (must be percent-encoded).
  --linked                 Pushes to the linked project.
  --local                  Pushes to the local database.
  --password, -p string    Password to your remote Postgres database.
```

**Exact flag:** `--include-seed` — "Include seed data from your config." That is the
*entire* help text for the flag; there is no mention anywhere in the help output of
whether the seed re-runs on every push or only the first time a project has no seed
history, and no mention of idempotency/dedup semantics for repeated pushes.

**Answer:** the CLI reference genuinely does not document re-run semantics, exactly as
02-RESEARCH.md's U3 row already suspected — this probe cannot settle U3 further because
`db push` is a `--linked`-only operation against a remote/managed project (HARD RULE:
never run `--linked`, never link this local project). U3 remains only answerable by
running `db push --include-seed --dry-run` against a real disposable Supabase project
that is *not* this local stack — out of scope here.

**Settles:** U3 — **not settled**, confirmed only that the CLI help text is silent on
re-run semantics (as 02-RESEARCH.md already assumed). U3 still requires a real remote
project test, which this probe explicitly may not perform.

---

## Probe 2a — `select version();`

```sql
$ docker exec -i supabase_db_VamosTaxi.eu psql -U postgres -d postgres -X -c "select version();"
                                      version
------------------------------------------------------------------------------------
 PostgreSQL 17.6 on aarch64-unknown-linux-gnu, compiled by gcc (GCC) 15.2.0, 64-bit
(1 row)
```

**Answer:** major version is **17** (17.6). On PG17, generated columns support only
`GENERATED ALWAYS AS (...) STORED` — virtual (non-stored) generated columns were added
in PG18 and default to `VIRTUAL` there. So on this stack, every generated column
**must** be written with the explicit `STORED` keyword; there is no default to rely on
and no `VIRTUAL` option to accidentally reach for. 02-RESEARCH.md's plan to write
`stored` explicitly is correct and, on PG17, is also the *only* legal form (not a
defensive choice against an ambiguous default).

**Settles:** U4 — confirmed. Major version 17 (17.6), `stored` is required (not merely
correct-on-both) on this Postgres.

---

## Probe 2b — extension availability

```sql
$ docker exec -i supabase_db_VamosTaxi.eu psql -U postgres -d postgres -X -c "select name, default_version, installed_version from pg_available_extensions where name in ('pgtap','citext','pgcrypto','btree_gist','pg_net','pgjwt') order by 1;"
    name    | default_version | installed_version
------------+-----------------+-------------------
 btree_gist | 1.7             |
 citext     | 1.6             |
 pg_net     | 0.20.4          | 0.20.4
 pgcrypto   | 1.3             | 1.3
 pgjwt      | 0.2.0           |
 pgtap      | 1.3.3           |
(6 rows)
```

**Answer:** `pgtap` is **available to install** locally (version 1.3.3 in the image's
extension catalog) but is **not currently installed** (`installed_version` empty).
Same for `citext` (1.6) and `btree_gist` (1.7) — available, not yet installed.
`pgcrypto` (1.3) and `pg_net` (0.20.4) are already installed. `pgjwt` (0.2.0) is
available but not installed.

**Settles:** Validation Architecture / P1 dependency — pgTAP is confirmed present in
this Postgres image's extension catalog, so `create extension pgtap;` inside a
migration (or Wave 0 setup) will succeed without any additional Docker image
configuration.

---

## Probe 2c — U2: `set_config('role', …)` vs `SET LOCAL ROLE` in one session

```sql
$ docker exec -i supabase_db_VamosTaxi.eu psql -U postgres -d postgres -X <<'SQL'
begin;
select set_config('role','authenticated',true);
select current_user, current_setting('role');
commit;
select current_user;
SQL

BEGIN
  set_config
---------------
 authenticated
(1 row)

 current_user  | current_setting
---------------+-----------------
 authenticated | authenticated
(1 row)

COMMIT
 current_user
--------------
 postgres
(1 row)
```

**Answer:** exactly as 02-RESEARCH.md predicted. Inside the transaction, both
`current_user` and `current_setting('role')` read back `authenticated` after
`set_config('role', 'authenticated', true)` — `is_local => true` behaves identically to
`SET LOCAL ROLE authenticated`, changing the *effective* role for the transaction. After
`commit`, `current_user` reverts to `postgres` (the session's real login role) —
confirming the setting is transaction-scoped, not session-scoped, and does not leak
into the next statement/transaction on the same connection. This is exactly the
behaviour a pooled Hyperdrive connection needs: a forgotten `commit`/rollback boundary
cannot carry one request's role into the next.

**Settles:** U2 — confirmed exactly as stated, no fallback needed.

---

## Probe 2d — role attributes

```sql
$ docker exec -i supabase_db_VamosTaxi.eu psql -U postgres -d postgres -X -c "select rolname, rolsuper, rolinherit, rolcanlogin, rolbypassrls from pg_roles where rolname in ('postgres','anon','authenticated','service_role','supabase_auth_admin','supabase_admin') order by 1;"
       rolname       | rolsuper | rolinherit | rolcanlogin | rolbypassrls
----------------------+----------+------------+-------------+--------------
 anon                 | f        | t          | f           | f
 authenticated        | f        | t          | f           | f
 postgres             | f        | t          | t           | t
 service_role         | f        | t          | f           | t
 supabase_admin       | t        | t          | t           | t
 supabase_admin       | t        | t          | t           | t
 supabase_auth_admin  | f        | f          | t           | f
(6 rows)
```

**Notable finding:** on this local image, `postgres` is **not** `rolsuper` (`f`) but
**does** carry `rolbypassrls = t` and `rolcanlogin = t` — it behaves like the managed
platform's convention (a non-superuser owner role that bypasses RLS by grant, not by
superuser status), which is closer to what production Supabase actually gives you than
a raw local superuser would be. `supabase_admin` is the one role that is a true
superuser locally. `supabase_auth_admin` is notably `rolinherit = f` (does not inherit
privileges from roles it's a member of) and `rolcanlogin = t` — the Auth service's own
login role, consistent with it being the role that must run the Custom Access Token
Hook function.

**Settles:** background for U1 and AUTH-05 (the hook runs as `supabase_auth_admin`
locally; U1's grant statement is run as `postgres`, which is not a raw superuser even
locally — makes the local dry run below a slightly closer proxy for the managed
platform's `postgres` role than "local Postgres superuser" would suggest).

---

## Probe 2e — U1: PG17 grant-with-options syntax dry run (rolled back)

```sql
$ docker exec -i supabase_db_VamosTaxi.eu psql -U postgres -d postgres -X <<'SQL'
begin;
create role vamos_edge_probe login noinherit;
grant authenticated to vamos_edge_probe with inherit false, set true;
select roleid::regrole, member::regrole, inherit_option, set_option from pg_auth_members where member='vamos_edge_probe'::regrole;
rollback;
SQL

BEGIN
CREATE ROLE
GRANT ROLE
    roleid     |      member      | inherit_option | set_option
---------------+------------------+----------------+------------
 authenticated | vamos_edge_probe | f              | t
(1 row)

ROLLBACK
```

Post-rollback check that nothing leaked:
```sql
$ docker exec -i supabase_db_VamosTaxi.eu psql -U postgres -d postgres -X -c "select rolname from pg_roles where rolname='vamos_edge_probe';"
 rolname
---------
(0 rows)
```

**Answer:** the exact grant syntax from 02-RESEARCH.md's U1 row —
`grant authenticated to vamos_edge_probe with inherit false, set true` — is valid PG17
syntax and the resulting `pg_auth_members` row shows `inherit_option = f`,
`set_option = t`, exactly matching what was requested. The `rollback` cleanly discarded
both the role and the grant (confirmed zero rows for `vamos_edge_probe` afterward — no
residue in the local database).

**This does NOT settle U1.** U1 asks whether **managed Supabase's own `postgres`
role**, on the real project, has sufficient privilege to run this statement against
`authenticated` — a role Supabase itself owns and provisions on the managed platform.
This probe only proves the *statement is syntactically valid and semantically correct
on PG17* using a local superuser-adjacent role that this project fully owns. It cannot
observe managed-platform-specific privilege restrictions (e.g., whether Supabase's
hosted `postgres` role is deliberately barred from re-granting `WITH SET TRUE` on its
own predefined roles) because no such restriction can exist or be absent in a
self-owned local database. **U1 still requires running this exact statement in the
staging/managed SQL editor**, as 02-RESEARCH.md's own "check that settles it" column
already specifies.

**Settles:** U1 — **partially**: confirms the grant syntax is valid PG17 and produces
the expected `pg_auth_members` row (removes "is this even legal SQL on PG17" as a
residual doubt). Does **not** settle the managed-platform permission question, which
remains a staging-only check.

---

## Probe 2f — server settings

```sql
$ docker exec -i supabase_db_VamosTaxi.eu psql -U postgres -d postgres -X -c "show server_version_num; show max_connections; select setting from pg_settings where name='row_security';"
 server_version_num
--------------------
 170006
(1 row)

 max_connections
------------------
 100
(1 row)

 setting
---------
 on
(1 row)
```

**Answer:** `server_version_num = 170006` (PG 17.6, matches Probe 2a). `max_connections
= 100` locally (the managed project's real limit is a separate, plan-dependent number —
this is only the local Docker image's default, relevant for local `pgTAP`/test
parallelism, not for Hyperdrive pool sizing). `row_security = on` globally, meaning RLS
is not disabled at the server-config level — a table's own `ENABLE ROW LEVEL SECURITY`
/ `FORCE ROW LEVEL SECURITY` state is what actually governs each table, but the
server-wide switch is not overriding it off.

**Settles:** background confirmation for D2 (fail-closed RLS baseline) and D19
(`force row level security` on audit tables) — the server-level `row_security` GUC is
not fighting either design.

---

## Probe 2g — installed extensions (`pg_extension`)

```sql
$ docker exec -i supabase_db_VamosTaxi.eu psql -U postgres -d postgres -X -c "select * from pg_extension order by extname;"
  oid  |      extname       | extowner | extnamespace | extrelocatable | extversion | extconfig | extcondition
-------+---------------------+----------+--------------+----------------+------------+-----------+--------------
 16664 | pg_net              |       10 |        16394 | f              | 0.20.4     |           |
 16515 | pg_stat_statements  |       10 |        16394 | t              | 1.11       |           |
 16406 | pgcrypto            |       10 |        16394 | t              | 1.3        |           |
 13615 | plpgsql             |       10 |           11 | f              | 1.0        |           |
 16604 | supabase_vault      |       10 |        16603 | f              | 0.3.1      | {16608}   | {""}
 16395 | uuid-ossp           |       10 |        16394 | t              | 1.1        |           |
(6 rows)
```

**Answer:** out of the box, this local Supabase image ships `pg_net`,
`pg_stat_statements`, `pgcrypto`, `plpgsql`, `supabase_vault`, `uuid-ossp` already
installed. Notably **`citext`, `btree_gist` and `pgtap` are not pre-installed** — P1's
`0001_extensions` migration must explicitly `create extension` all three; they are not
implicitly available just because the image supports them (consistent with Probe 2b).

**Settles:** P1 migration content — `citext`, `btree_gist`, `pgtap` all need explicit
`CREATE EXTENSION` statements; `pgcrypto` does not (already present, but a migration
should still declare it idempotently with `IF NOT EXISTS` for portability to a fresh
managed project where it may not be pre-installed).

---

## Probe 3 — `supabase/config.toml` grep

```
$ grep -n "test\|pgtap\|\[db.seed\]\|sql_paths\|\[auth\]\|enable_signup\|mfa\|totp\|hook" supabase/config.toml
66:[db.seed]
71:sql_paths = ["./seed.sql"]
103:...(inbucket/email-testing comments)
155:[auth]
176:enable_signup = true
179:# Allow/disallow testing manual linking of accounts
221:enable_signup = true
259:enable_signup = false
267:# Use pre-defined map of phone number to OTP for testing.
268:# [auth.sms.test_otp]
278:# This hook runs before a new user is created ...
279:# [auth.hook.before_user_created]
281:# uri = "pg-functions://postgres/auth/before-user-created-hook"
283:# This hook runs before a token is issued and allows you to add additional claims ...
284:# [auth.hook.custom_access_token]
286:# uri = "pg-functions://<database>/<schema>/<hook_name>"
297:[auth.mfa]
302:[auth.mfa.totp]
307:[auth.mfa.phone]
315:# [auth.mfa.web_authn]
```

Relevant blocks, verbatim:

```toml
[db.seed]
# If enabled, seeds the database after migrations during a db reset.
enabled = true
# Specifies an ordered list of seed files to load during db reset.
# Supports glob patterns relative to supabase directory: "./seeds/*.sql"
sql_paths = ["./seed.sql"]
```

```toml
[auth]
enabled = true
...
enable_signup = true            # top-level project signup switch
```

```toml
[auth.email]
# Allow/disallow new user signups via email to your project.
enable_signup = true
```

```toml
[auth.sms]
# Allow/disallow new user signups via SMS to your project.
enable_signup = false
```

```toml
# This hook runs before a token is issued and allows you to add additional claims based on the authentication method used.
# [auth.hook.custom_access_token]
# enabled = true
# uri = "pg-functions://<database>/<schema>/<hook_name>"
```

```toml
[auth.mfa]
# Control how many MFA factors can be enrolled at once per user.
max_enrolled_factors = 10

# Control MFA via App Authenticator (TOTP)
[auth.mfa.totp]
enroll_enabled = false
verify_enabled = false
```

**Answer:**
- `[db.seed]` exists, `enabled = true`, `sql_paths = ["./seed.sql"]` — a fresh
  `supabase db reset` will run `supabase/seed.sql` by default (that file does not exist
  yet either — P7's job).
- `pgtap` does **not** appear anywhere in `config.toml` — there is no CLI-managed
  pgTAP toggle; installing it is purely a `CREATE EXTENSION pgtap;` statement in a
  migration (confirmed by Probe 2b/2g — it is not a config-level feature flag).
- `[auth.hook.custom_access_token]` **exists in the file but is fully commented out**
  (`enabled = true` and the `uri` line are both commented). AUTH-05's Custom Access
  Token Hook is **not wired up yet locally** — enabling it means uncommenting this
  block and setting `uri = "pg-functions://postgres/public/<hook_function_name>"` (or
  wherever P2 defines the hook function) once that function exists.
- `[auth.mfa.totp]` **exists but both `enroll_enabled` and `verify_enabled` are
  `false`** — TOTP MFA is currently switched **off** in local config. AUTH-05 ("staff
  sign in by invitation only and must pass a second factor") requires flipping both to
  `true` before the local pgTAP suite can meaningfully exercise `aal2`-gated behavior
  end-to-end (the SQL-only `aal2` check itself doesn't need the toggle, but wiring a
  believable local dev loop for staff enrollment does).

**Settles:** AUTH-05 tooling prerequisite — confirms the hook and TOTP MFA are present
as config sections but inert by default; both need explicit config edits in Wave 0/P2,
not just migration SQL.

---

## Probe 4 — `supabase status -o env` (URLs only)

```
$ supabase status -o env 2>/dev/null | grep -v -i KEY | grep -v -i SECRET | grep -v -i JWT
API_URL="http://127.0.0.1:54321"
DB_URL="postgresql://postgres:postgres@127.0.0.1:54322/postgres"
FUNCTIONS_URL="http://127.0.0.1:54321/functions/v1"
GRAPHQL_URL="http://127.0.0.1:54321/graphql/v1"
INBUCKET_URL="http://127.0.0.1:54324"
MAILPIT_URL="http://127.0.0.1:54324"
MCP_URL="http://127.0.0.1:54321/mcp"
REST_URL="http://127.0.0.1:54321/rest/v1"
S3_PROTOCOL_REGION="local"
STORAGE_S3_URL="http://127.0.0.1:54321/storage/v1/s3"
STUDIO_URL="http://127.0.0.1:54323"
```

**Answer:** confirms the full local service topology matches the task brief (API
`54321`, DB `54322`) and additionally shows Studio (`54323`), the email testing UI
(`54324`, dual-named `INBUCKET_URL`/`MAILPIT_URL` — same service), REST/GraphQL/Storage
S3/Functions/MCP endpoints all live. `DB_URL` includes the well-known default local
dev password (`postgres:postgres`) — that string is not a secret (it is the fixed,
publicly documented local CLI default, already stated in the task brief) and is not a
key/secret/JWT, so it is not filtered by the `grep -v` chain; no project key, JWT, or
service-role secret is present in this output.

**Settles:** confirms the local stack topology assumed throughout this file; no
U-item directly, background only.

---

## Consequences for the plan

- **Validation Architecture's "Quick run command" should change.** `supabase test db`
  *does* accept `<path...>` (files or directories) per its own `--help`. The Phase 2
  plan's "Per task commit" sampling rate and the Wave-level test commands should read
  `supabase test db supabase/tests/<name>.test.sql` for a single-file check during
  authoring, reserving `supabase db reset && supabase test db` (no path) for the
  wave-merge/full-suite gate. The current "no confirmed per-file flag... treat as full
  run" line in 02-RESEARCH.md is now out of date and should be corrected, not treated
  as still-open.

- **pgTAP install path for P1.** `pgtap` (1.3.3), `citext` (1.6) and `btree_gist` (1.7)
  are all in `pg_available_extensions` but **not installed** on this local image, and
  none of them appear in `config.toml`. `0001_extensions` must `CREATE EXTENSION IF NOT
  EXISTS pgtap; CREATE EXTENSION IF NOT EXISTS citext; CREATE EXTENSION IF NOT EXISTS
  btree_gist;` (plus `pgcrypto`, already installed locally but not guaranteed on every
  fresh managed project — keep it `IF NOT EXISTS` too) as an actual migration
  statement. There is no CLI/config toggle that installs pgTAP for you.

- **U1 acceptance criteria should be split into two checks, not one.** The rolled-back
  local dry run (Probe 2e) proves the `grant … with inherit false, set true` statement
  is valid PG17 syntax and produces the exact `pg_auth_members` row expected — that
  half of U1 is now closed and does not need to be re-verified on staging. The
  remaining, and only remaining, open half is whether **managed Supabase's own
  `postgres` role** is permitted to run it — that is unverifiable locally by
  construction (this project owns every role in its own local database) and must stay
  a staging-SQL-editor gate exactly as 02-RESEARCH.md already specifies, run before P1
  is written. The plan's acceptance criterion for U1 should say "syntax confirmed
  locally; managed-platform privilege confirmed on staging" rather than leaving it as
  one undifferentiated open item.

- **U2 is fully closed — no fallback code path needed.** `set_config('role', $1, true)`
  behaves exactly like `SET LOCAL ROLE $1` (transaction-scoped, reverts on
  commit/rollback) on this Postgres. The `withIdentity` helper for Phase 3 can rely on
  `set_config` without needing the `PG_ROLE`-map `tx.unsafe('set local role ...')`
  fallback as a first choice — keep it as a documented fallback only, not "the safer
  default."

- **U3 remains genuinely open** — the `db push --include-seed` help text says nothing
  about re-run semantics (confirmed, not just assumed), and `db push` is inherently a
  `--linked` operation this probe was barred from running. P7's `ON CONFLICT` seed
  discipline must stay load-bearing (not "merely tidy") until someone runs
  `db push --include-seed --dry-run` against a real disposable Supabase project. Add an
  explicit line to the P7 plan: "U3 unresolved locally by design (requires
  `--linked`); seed script must be idempotent regardless of the answer."

- **U4 is fully closed and stronger than previously stated.** PG17 doesn't just make
  `stored` the *correct* choice — it makes `STORED` the *only legal* form for a
  generated column (virtual/non-stored generated columns are PG18+). Update the note
  in 02-RESEARCH.md from "writing stored explicitly is correct on both [PG17 and
  PG18]" to "required on PG17, and remains correct (though no longer the default) if a
  future PG18 upgrade ever happens."

- **AUTH-05 needs two config edits before the hook/TOTP loop is exercisable locally,
  even though the SQL-only `aal2` gate doesn't strictly require them.** Both
  `[auth.hook.custom_access_token]` and `[auth.mfa.totp]` exist in `config.toml` today
  but are inert (`enabled`/`enroll_enabled`/`verify_enabled` all default off or
  commented out). P2's plan should add an explicit Wave-0-or-P2 task: uncomment and
  configure `[auth.hook.custom_access_token]` (pointing at whatever
  schema/function P2 lands, e.g. `pg-functions://postgres/public/custom_access_token_hook`)
  and flip `[auth.mfa.totp].enroll_enabled` / `.verify_enabled` to `true`, distinct from
  writing the pgTAP test itself — otherwise `tests/staff_hook_claim.test.sql` can prove
  the SQL function works while the actual local dev loop (sign in, enroll TOTP, get an
  `aal2` session) still silently can't happen.

- **`gen types` command in P7's CI/deploy workflows should use the flag form, not the
  bare-subcommand form, for clarity** — both `supabase gen types --local --schema
  public` and `supabase gen types typescript --local --schema public` work identically
  in CLI 2.109.1, but only the first is documented behavior (per `--help`); the second
  works by the trailing token being silently accepted, not because `typescript` is a
  real registered subcommand. Prefer `supabase gen types --local --lang=typescript
  --schema public` in `packages/db`'s `gen:types` script and CI jobs so a future CLI
  version that starts rejecting stray positional args doesn't break the build.

- **Local `postgres` role is a useful (not perfect) proxy for managed Supabase's
  `postgres`.** It is not a raw superuser locally (`rolsuper = f`) but does carry
  `rolbypassrls = t` — closer in shape to the managed platform's non-superuser owner
  role than a vanilla local Postgres superuser would be. Worth noting in the P1 plan so
  nobody assumes local testing under `postgres` is testing "superuser behavior" when
  it's actually testing "bypass-RLS-owner behavior," which is the more relevant case
  for U1/D2.
