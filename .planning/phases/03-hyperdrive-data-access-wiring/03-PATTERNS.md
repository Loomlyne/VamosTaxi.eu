# Phase 3: Hyperdrive Data Access Wiring - Pattern Map

**Mapped:** 2026-08-24
**Files analyzed:** 30 (across the research's proposed P1–P6 split; `apps/isolation-probe` and
`packages/db/test/deployed/**` counted even though P4/P6 are the deferred-if-unprovisioned half)
**Analogs found:** 30 / 30 — but 11 of those are **role-match only** (no TypeScript `postgres.js`
wrapper, no Vitest config, no ESLint config, and no Cloudflare Worker fetch handler exist
anywhere in this repo yet). Read the caveat below before trusting the raw count.

## Caveat that matters more than the count

Unlike Phase 2 (which had zero SQL to imitate and used `02-SCHEMA-DRAFT.md` as the design-doc
analog for every migration), Phase 3 lands in a repo that now has **real Phase 2 SQL** to bind
against — the four roles, the `app.*` identity helpers and the pgTAP conventions are load-bearing
analogs, not placeholders. But Phase 3's *TypeScript* half has almost nothing to imitate:

- `packages/db/` contains exactly `package.json` + `README.md` + `supabase/` (migrations and
  pgTAP only) — **no `src/`, no `test/`, no `.ts` file of any kind.**
- No ESLint config exists anywhere in the repo (`find … -iname "eslint*"` returns nothing), so
  D-08/D-10's `no-restricted-imports` / `no-restricted-syntax` rules have no wiring pattern to
  copy — the planner is installing ESLint itself, not extending it.
- No `postgres.js` client, no Vitest config, no `route.ts` (App Router Route Handler), and no
  Cloudflare Worker other than `apps/web`'s own `worker.ts` exist in this codebase.
- `03-RESEARCH.md`'s own "Code Examples" section (lines 1664–2060) **is** the concrete
  implementation source for `withIdentity`, the named wrappers, `publicSql`, the `wrangler.jsonc`
  shape and the WAE query — it was written by reconciling three competing sketches, so treat it
  as "the exact code to place," not "a similar file to imitate." Where a codebase file exists as a
  role-match analog (`apps/web/lib/logger.ts`, `apps/web/lib/env.d.ts`,
  `scripts/check-next-public-allowlist.mjs`), it is the **convention** source (doc-header style,
  redaction pattern, drift-check shape) — the research's code block is the **content** source. Use
  both; do not invent a third shape.
- **CRITICAL — the GUC/role names `withIdentity` must call are frozen by real, applied Phase 2
  SQL, not by the research prose.** `packages/db/supabase/migrations/20260823000002_roles_and_helpers.sql`
  is the literal source of truth for `PG_ROLE` values, the two `set_config` keys, and the U2
  fallback shape. Quote from that migration, not from `03-RESEARCH.md`'s Lane 3, wherever the two
  agree (they do, today) — the migration is the executable one.

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `packages/db/src/identity.ts` | service (core wrapper) | request-response (transactional) | `packages/db/supabase/migrations/20260823000002_roles_and_helpers.sql` (GUC/role names) + `apps/web/lib/logger.ts` (TS module/doc conventions) | content: research code ex. 1 / convention: role-match |
| `packages/db/src/public.ts` | service | CRUD (cached read) | `03-RESEARCH.md` code ex. 3 + `apps/web/lib/logger.ts` | content: research / convention: role-match |
| `packages/db/src/claims.ts` | utility (transform) | transform | `packages/db/supabase/migrations/20260823000002_roles_and_helpers.sql` (`app.jwt()`/claims shape) + Phase 2 `VamosClaims` sketch in `03-RESEARCH.md` code ex. 1 | content: research / no TS analog |
| `packages/db/src/verify.ts` | utility | request-response (token verify) | none in repo (`jose` not yet a dependency anywhere) | **no analog** |
| `packages/db/package.json` (edit) | config | — | itself, current committed version; `apps/web/package.json` (sibling workspace shape) | real analog (edit) |
| ESLint config (`no-restricted-imports`, `no-restricted-syntax`) | config | — | none — no ESLint config anywhere in this repo | **no analog** |
| `packages/db/vitest.config.ts` | config | — | none — Vitest not a dependency anywhere; `apps/web/playwright.config.ts` is the nearest test-runner-config shape | role-match only |
| `packages/db/test/local/connection-reuse.test.ts` | test (integration, local) | event-driven (pinned-backend simulation) | `packages/db/supabase/tests/identity_helpers.test.sql` (what it must reproduce in TS) + `03-RESEARCH.md` §"local half" | content: research / role-match: pgTAP sibling |
| `packages/db/supabase/tests/fail_closed.test.sql` | test (pgTAP) | request-response | `packages/db/supabase/tests/identity_helpers.test.sql` (exact same file, same conventions) | **exact match** |
| `packages/db/supabase/tests/cross_claim.test.sql` | test (pgTAP) | request-response | `packages/db/supabase/tests/identity_helpers.test.sql` | **exact match** |
| `packages/db/supabase/tests/set_local_without_begin.test.sql` | test (pgTAP) | request-response | `packages/db/supabase/tests/identity_helpers.test.sql` | **exact match** |
| `packages/db/mutants/M1_grant_layer_removed.sql` | migration-like (mutant) | batch (apply/rollback) | `packages/db/supabase/migrations/20260823000002_roles_and_helpers.sql` (the grants it un-does) | design-doc/migration analog |
| `packages/db/mutants/M2_policy_predicate_weakened.sql` | migration-like (mutant) | batch | `02-SCHEMA-DRAFT.md` §14a policy predicate (not yet a migration — Phase 2's RLS migrations land later than the 6 seen today) | design-doc analog |
| `packages/db/scripts/mutation-gate.mjs` | utility (CI script) | batch | `scripts/migrate-dictionary.mjs` (`--check` drift-apply-diff shape) | **real codebase analog (convention)** |
| `apps/web/lib/db/identity.ts` | service (named wrappers + WAE) | request-response | `apps/web/lib/logger.ts` (doc-header, redaction/try-catch conventions) + `03-RESEARCH.md` code ex. 2 | content: research / convention: role-match |
| `apps/web/lib/db/public.ts` | service | CRUD (cached read) | `apps/web/lib/logger.ts` + `03-RESEARCH.md` code ex. 3 | content: research / convention: role-match |
| `apps/web/wrangler.jsonc` (edit) | config | — | itself, current committed version | **exact match — same file** |
| `apps/web/lib/env.d.ts` (edit) | config (types) | — | itself, current committed version | **exact match — same file** |
| `apps/web/worker.ts` (edit — `scheduled`/`queue` take real `env`) | entry point | event-driven (Cron/Queue) | itself, current committed version | **exact match — same file** |
| CI grep script (banned-pattern gate) | utility (CI script) | batch | `scripts/check-next-public-allowlist.mjs` (walk + regex + allowlist + exit code) | **real codebase analog** |
| `apps/isolation-probe/src/index.ts` | route/controller (Worker fetch handler) | request-response | `apps/web/worker.ts` (`ExportedHandler` shape, structured logging via `withRequestContext`) | role-match |
| `apps/isolation-probe/wrangler.jsonc` | config | — | `apps/web/wrangler.jsonc` (named-environment / binding shape) | role-match (same repo convention) |
| `packages/db/test/fixtures/two-customers.ts` | test fixture | batch (seed) | `packages/db/supabase/migrations/20260823000006_customers_and_staff.sql` (the exact table/column shape it must insert against) | design-doc/migration analog |
| `packages/db/test/support/drive.ts` | test utility | batch (concurrency driver) | none in repo (no comparable concurrency harness exists) | **no analog** |
| `packages/db/test/support/hyperdrive-metrics.ts` | test utility | transform | none in repo | **no analog** |
| `packages/db/test/deployed/config-preconditions.test.ts` | test (deployed, deferred) | request-response | `packages/db/supabase/tests/extensions.test.sql` (assertion-style conventions) | role-match |
| `packages/db/test/deployed/negative-controls.test.ts` | test (deployed, deferred) | event-driven | `03-RESEARCH.md` code ex. 8 (NC1/NC3 as written) | content: research / no TS analog |
| `packages/db/test/deployed/data-06-isolation.test.ts` | test (deployed, deferred) | event-driven | `03-RESEARCH.md` §"residue probe and adjacency set" | content: research / no TS analog |
| `.github/workflows/pr.yml` (edit) | config (CI) | batch | itself, current committed version | **exact match — same file** |
| `.github/workflows/deploy-staging.yml` (edit) | config (CI) | batch | itself, current committed version | **exact match — same file** |
| `.github/workflows/deploy-production.yml` (edit) | config (CI) | batch | itself, current committed version | **exact match — same file** |

---

## Pattern Assignments

Grouped by the research's proposed P1–P6 split (`03-CONTEXT.md` "Proposed plan split
`[informational]`"), because each group shares one analog set. P6 items are included for
completeness even though they are deferred-if-unprovisioned (D-29/D-42).

### P1 — `withIdentity` core: `packages/db/src/identity.ts`, `public.ts`, `claims.ts`, `verify.ts`, `package.json`, ESLint config

**Primary analog for the GUC/role contract:** `packages/db/supabase/migrations/20260823000002_roles_and_helpers.sql`
(read in full — lines 1–153).

**The exact role map to freeze `PG_ROLE` against** (migration lines 27–54, 59–69) — do not
retype these from `03-RESEARCH.md` prose, copy from the applied migration:

```sql
-- from 20260823000002_roles_and_helpers.sql
create role vamos_guest nologin;   -- DATA-03
create role vamos_staff nologin;   -- DATA-04
create role vamos_edge login noinherit;
create role vamos_public login noinherit;

grant anon          to vamos_edge with inherit false, set true;
grant authenticated to vamos_edge with inherit false, set true;   -- D-32/U1: becomes
                                                                   -- vamos_customer only if
                                                                   -- the managed-platform
                                                                   -- fallback fires — do not
                                                                   -- pre-emptively rename here
grant vamos_guest to vamos_edge with inherit false, set true;
grant vamos_staff to vamos_edge with inherit false, set true;
```

This gives `PG_ROLE = { anon: "anon", customer: "authenticated", staff: "vamos_staff", guest:
"vamos_guest" }` exactly as `03-RESEARCH.md` code example 1 has it — the two sources agree today.
If D-32/U1's fallback ever fires, the rename happens in the Phase 2 migration file per D-32, not
here; `identity.ts` reads `PG_ROLE.customer` symbolically and never hardcodes `"authenticated"`
outside that one map.

**The two `set_config` keys and the identity-helper contract `withIdentity` must be compatible
with** (migration lines 124–144, and proven live in `packages/db/supabase/tests/identity_helpers.test.sql`
lines 21–48):

```sql
-- app.uid() reads the sub claim out of request.jwt.claims — this is the second set_config key
-- withIdentity must write for kind in {"customer","staff"}.
create or replace function app.uid() returns uuid
  language sql stable set search_path = '' as $$
  select nullif(app.jwt() ->> 'sub', '')::uuid
$$;

-- app.manage_token_hash() decodes a HEX GUC — this is the key for kind === "guest". The raw
-- token never reaches SQL; the Worker hashes it before calling asGuest (D-14).
create or replace function app.manage_token_hash() returns bytea
  language sql stable set search_path = '' as $$
  select decode(nullif(current_setting('request.vamos.manage_token_hash', true), ''), 'hex')
$$;
```

So `withIdentity`'s two `set_config` calls must write `request.jwt.claims` (JSON, for
customer/staff) or `request.vamos.manage_token_hash` (hex string, for guest) — matching these
exact GUC names character-for-character, since `app.jwt()`/`app.uid()`/`app.manage_token_hash()`
are what every later RLS policy reads.

**Proof that `set_config(role, …, true)` behaves like `SET LOCAL ROLE`, which `withIdentity`'s
first statement depends on** (`identity_helpers.test.sql` lines 50–56 — U2 is closed, not
open, contrary to `03-RESEARCH.md`'s framing of it as still-to-check):

```sql
savepoint identity_scope;
select set_config('role', 'authenticated', true);
select is(current_user::text, 'authenticated', '…switches current_user inside the subtransaction');
rollback to savepoint identity_scope;
select is(current_user::text, 'postgres', '…reverts to the outer role after rollback (D-26)');
```

This is the local proof research U2 called for — `03-RESEARCH.md` line 616's four-line check is
already superseded by this committed pgTAP file. Do not re-run the check as new work; cite this
file.

**The `withIdentity` implementation itself** — content source is `03-RESEARCH.md` lines
1676–1772 (code example 1) verbatim, reconciled against the GUC names above. Key shape to
preserve: `client()` builds a fresh `postgres(cs, { max: 1, fetch_types: false, prepare: true,
connect_timeout: 10 })` per call; `sql.begin(async (tx) => { … return fn(tx); })` so ROLLBACK-on-
throw is postgres.js's own behaviour, not hand-rolled; `fn` returns data, never `tx`.

**Doc-header and module-boundary convention to copy** (not the SQL content, the *shape* of a
justification comment) — `apps/web/lib/logger.ts` lines 1–20:

```ts
// Structured JSON logger (D-38, PLAT-06) — the trail Phase 7's booking failures need to
// already exist rather than being added after an incident. …
//
// Two hard rules, because this logger will carry real booking traffic from Phase 7:
//  1. `LogFields` only accepts scalar values … a call site that tries to log one gets a
//     compile error instead of leaking it at runtime.
//  2. Any field whose *key* looks credential-shaped is redacted before serialisation …
```

`identity.ts` should open the same way: a "why this exists" paragraph citing D-07/D-08/D-09, then
a numbered list of hard invariants (never `sql.end()`, `fn` never returns `tx`, `postgres` is
importable from nowhere else) — matching the project's established convention of naming the
decision id inline rather than a bare comment.

**`packages/db/package.json` edit** — analog is the file itself (read in full above) plus
`apps/web/package.json` as the sibling-workspace shape to imitate for `exports`/`dependencies`:
add `"exports"` map for `./identity`, `./public`, `./database.types` (D-13/D-80), add `"postgres"`
as a real `dependencies` entry (today the package has zero runtime dependencies), and fix
`"main"` away from the nonexistent `index.ts`.

**ESLint config — no analog.** The planner is installing ESLint from nothing (`no-restricted-imports`
banning raw `postgres` outside `packages/db/src/{identity,public}.ts` and the probe;
`no-restricted-syntax` banning `ReturnStatement` of `tx`). Root `package.json`'s existing script
list (`typecheck`, `lint:css`, `i18n:check`) is the place a new `pnpm lint` script would join, but
there is no CSS-linter-equivalent JS/TS linter wired anywhere yet — treat this as new
infrastructure, not an edit.

### P2 — Local isolation: simulator, pgTAP, mutants

**pgTAP test files — exact-match analog, same conventions, same directory:**
`packages/db/supabase/tests/identity_helpers.test.sql` (read in full above) and
`packages/db/supabase/tests/extensions.test.sql` (lines 1–60 read) establish every convention the
three new files must follow:

- Header comment names the decisions it proves (`-- Proves D-01/D-26: …`) before `select plan(N)`.
- `begin; select plan(N); … select * from finish(); rollback;` — pgTAP tests run inside a
  transaction that is always rolled back, so no test leaves committed state.
- 3-arg forms throughout: `is(actual, expected, description)`, `ok(boolean, description)`,
  `throws_ok($$ sql $$, sqlstate, message_or_null, description)`, `lives_ok($$ sql $$,
  description)`, `has_role(name, description)`, `has_extension(schema, name, description)`.
- Claims are set with `select set_config('request.jwt.claims', '{"sub":"…","role":"authenticated"}', true);`
  — the exact JSON shape `fail_closed.test.sql`/`cross_claim.test.sql` should reuse.
- `set local role anon; select throws_ok(…, '42501', null, …); reset role;` is the established
  fail-closed proof pattern (`identity_helpers.test.sql` lines 60–70) — `fail_closed.test.sql`
  copies this shape for `vamos_edge` itself (no `set local role` at all — the point of the test).
- `function_privs_are('app', 'manage_token_hash', array[]::name[], 'anon', array[]::name[], …)` —
  the 6-arg grant-introspection form for asserting a role holds zero privileges on a function.

**`packages/db/test/local/connection-reuse.test.ts` (the DATA-06 local half)** — content source is
`03-RESEARCH.md`'s "local half" and "Every survival path" table (§"Lane 4", modes 1/4/6/12); no TS
analog exists. It must call the **shipped** `withIdentity` (D-16/D-77) with `opts.client` set to a
`sql.reserve()`d connection — not an inlined copy of the SQL. Fixture rows must match
`packages/db/supabase/migrations/20260823000006_customers_and_staff.sql`'s actual `customers`/
`bookings` shape (see P4 below), not `isolation-proof.md`'s stale sketch (D-19/D-81).

**`packages/db/scripts/mutation-gate.mjs` — the strongest real analog in this plan.**
`scripts/migrate-dictionary.mjs` (lines 13, 59, 789–799) establishes the exact "apply, check,
report drift, exit non-zero" convention:

```js
// scripts/migrate-dictionary.mjs
//   node scripts/migrate-dictionary.mjs --check     # dry run: fail if regenerating would change
//                                                    # a committed file
…
const CHECK = process.argv.includes("--check");
…
console.error(`DRIFT: ${file} differs from what's committed — re-run without --check to regenerate.`);
```

`mutation-gate.mjs` is structurally the inverse (apply a mutant SQL file, assert the pgTAP suite
now fails, then roll the mutant back) but should keep the same shape: a plain Node script (no new
test-runner dependency), a clear one-line failure message naming which mutant produced a green
suite, and a non-zero exit code that `pr.yml` treats as blocking. `packages/db/package.json`'s
existing `"types:check"` script (`supabase gen types … | diff -q - database.types.ts`) is the
same "generate-then-diff-then-fail" idea already living in this exact package, one line away.

**`packages/db/vitest.config.ts` — no real analog.** `apps/web/playwright.config.ts` exists but is
a four-viewport visual-regression config, structurally unrelated to a `node`-environment unit-test
config. Build from `03-RESEARCH.md`'s stated shape (`environment: "node"`, `include:
["test/**/*.test.ts"]`, no `vitest-pool-workers`) rather than adapting Playwright's config.

### P3 — OpenNext wrappers, wrangler shape, CI greps

**`apps/web/wrangler.jsonc` — exact match, edit in place.** Full current file read above. Three
load-bearing facts the edit must preserve:

1. The file's own comment block explains **why** `env.staging` currently omits `hyperdrive`
   entirely (`wrangler deploy` validates the id as a real UUID; a placeholder fails outright) —
   keep that comment or replace it with the equivalent D-01 explanation once both bindings exist
   under both environments.
2. `HYPERDRIVE` today lives **only** under `env.production`, with a `localConnectionString` of
   `postgres:postgres@localhost:5432` — D-04 explicitly strikes this value as a pre-roles
   superuser login. The edit must replace it with the two `54322` / `vamos_edge` / `vamos_public`
   strings from `03-RESEARCH.md` code example 6, and add `HYPERDRIVE_NOCACHE` under **both**
   named environments (today: neither has it).
3. The file's own top-of-file comment already states the binding-inheritance rule ("named
   environments below do not inherit [top-level bindings]") — new `placement` and
   `analytics_engine_datasets` blocks go **inside** `env.staging`/`env.production`, matching every
   existing binding array (`kv_namespaces`, `r2_buckets`, `queues`), never at the top level.

**`apps/web/lib/env.d.ts` — exact match, edit in place.** Full current file read above. The
existing `HYPERDRIVE?: Hyperdrive` member's own doc comment says *"Phase 3 owns the real
connection string"* and *"a Phase 3-7 consumer that reads `env.HYPERDRIVE` without a null check
gets a compile error … this binding must never be assumed present before Phase 3 lands it
everywhere"* — the edit makes both `HYPERDRIVE` and `HYPERDRIVE_NOCACHE` **required** (drop the
`?`) and adds `DB_LATENCY: AnalyticsEngineDataset`, following the exact doc-comment convention
every other member already uses (cites the wrangler.jsonc block it corresponds to, names which
phase is the first real consumer). `/// <reference types="@cloudflare/workers-types" />` at the
top is already how `Hyperdrive`/`KVNamespace`/`Queue` resolve — `AnalyticsEngineDataset` comes
from the same package, no new import needed.

**`apps/web/worker.ts` — exact match, edit in place.** Full current file read above. The
`scheduled`/`queue` handlers currently take `_env` (unused, prefixed to satisfy the linter) — the
edit renames to `env: CloudflareEnv` per D-06/D-24, and the file's own existing convention
(`withRequestContext({ requestId, route, locale: null })` then `emit("info", "scheduled", {...})`)
is what any new log line inside those handlers should reuse verbatim — do not introduce a second
logging shape.

**`apps/web/lib/db/identity.ts` (named wrappers + WAE)** — content source is `03-RESEARCH.md`
lines 1783–1841 (code example 2). Convention source is `apps/web/lib/logger.ts`'s try/catch +
structured-emit shape: wrap the core call in `try { … } catch (err) { …; throw err; }`, write one
data point on every branch (mirrors logger.ts's "every line is one JSON object" discipline, here
applied to `DB_LATENCY.writeDataPoint`), and re-throw unmodified so callers still branch on
`err.code`.

**CI grep script.** `scripts/check-next-public-allowlist.mjs` (read in full above) is the
strongest analog in the whole phase for this file: `walk()` recursively collects non-binary,
non-excluded files; a compiled `RegExp` finds matches; results are checked against a JSON
allowlist; `process.exit(sourceOk && bundleOk ? 0 : 1)` at the bottom. The new script should keep
the same shape — walk `apps/web` and `packages/db`, apply the seven bans from `03-RESEARCH.md`
item 10's grep block (raw `postgres` import outside the two `packages/db` modules, module-scope
client, `sql.reserve()` in app code, identity import on a non-`force-dynamic` route,
`set_config(…, false)`, bare `SET ROLE`/`SET SESSION`, unfenced `sql.unsafe(`), and print one line
per violation the way `check-next-public-allowlist.mjs` does (`  - ${id}`), not a single bulk
failure. `EXCLUDED_DIRS` / `BINARY_EXT` constants are directly reusable.

### P4 — Probe Worker + harness (staging-only, designed now, unrun until P6)

**`apps/isolation-probe/src/index.ts`** — role-match analog `apps/web/worker.ts` (read in full
above) for the `ExportedHandler<CloudflareEnv>` shape and the structured-log convention
(`withRequestContext` + `emit(level, type, fields)`). No fetch-handler analog exists elsewhere in
the repo — `apps/web/worker.ts`'s `fetch: handler.fetch` just re-exports OpenNext's generated
handler, so the probe's own `fetch(request, env, ctx)` implementation (parsing `?impl=` and
`x-vamos-probe` header, per `03-RESEARCH.md` code examples 7–8) is genuinely new code, not an
adaptation.

**`apps/isolation-probe/wrangler.jsonc`** — role-match analog `apps/web/wrangler.jsonc`'s
named-environment/binding-array shape (already read in full above), scoped down to
`03-RESEARCH.md` code example 7's staging-only, three-binding form (`HYPERDRIVE_NOCACHE` at
`origin-connection-limit=5`, `HYPERDRIVE_APP`, `HYPERDRIVE_CACHED` for NC6).

**`packages/db/test/fixtures/two-customers.ts`** — the schema it inserts against is
`packages/db/supabase/migrations/20260823000006_customers_and_staff.sql` (not yet fully read in
this pass, but its existence and the D-19/D-81 correction are the load-bearing fact): fixtures
must use `customers(user_id, full_name, email)` — **not** `customers.id = auth uid` — and
`bookings.status = 'quote'` with `contact_name`/`contact_email` NOT NULL, exactly as
`03-RESEARCH.md` lines 752–764 already corrected (do not copy `isolation-proof.md` verbatim, per
D-19). No price columns are ever seeded (D-21/Law 04) — every fixture booking has NULL price
columns, matching `packages/db/supabase/migrations/20260823000004_settings.sql`'s
`pricing_live=false` posture (file not read this pass; cited from `03-CONTEXT.md` D-21).

**`packages/db/test/support/drive.ts`, `hyperdrive-metrics.ts`, and the three
`packages/db/test/deployed/*.test.ts` files** — no analog. Content source is `03-RESEARCH.md`
code examples 7–9 and the "residue probe and adjacency set" section; convention source (assertion
style, `expect(...).not.toEqual({...})` shape) is standard Vitest, matching code example 8 as
written.

### P5 — `.github/workflows/pr.yml` (edit — append local jobs)

**Exact match, edit in place.** Full current file read above (86 lines). The existing single
`gate` job runs, in order: secret scan → pnpm/node setup → install → `check:public-env` →
`typecheck` → `lint:css` → `i18n:check` → `build` → Playwright install → `test:visual` →
OpenNext build → preview upload. Phase 3's local jobs (`supabase start` → `supabase test db` →
`vitest run test/local` → `mutation-gate`) join this **same** `gate` job as additional steps
(per `03-CONTEXT.md` D-31's "Sampling Rate" / "Phase gate" language: "the full local suite green
in `pr.yml`"), inserted before or after the existing `Build` step depending on whether Postgres
needs to be up for `pnpm typecheck` (it does not) — follow the existing step-naming convention
(`name:` describes the gate, references the decision id in a trailing parenthetical, e.g. `"CSS
law + RTL logical-property lint (D-21, D-32)"`).

### P6 — Staging Hyperdrive + DATA-06 + p50 (deferred-if-unprovisioned)

**`.github/workflows/deploy-staging.yml` / `deploy-production.yml`** — exact match, edit in place
(both read in full above). `deploy-staging.yml`'s existing `deploy` job already establishes the
"smoke test with `curl -sf … | grep -q …`" convention (German `lang="de"`, Arabic `dir="rtl"`) —
the DATA-06 job's own smoke assertions (`data-06-isolation` request against the deployed probe,
adjacency floor check) should read the same way: one `curl`/fetch per named assertion, not a
bundled script. `deploy-production.yml`'s three D-20 structural gates (no probe `dist`, no
`isolation-probe` string in `apps/web`, no `PROBE_SECRET` on the production Worker) are new `gate`
job steps in that file, following the same `run:` shell-one-liner convention the file already uses
for its "Smoke test — deferred until Phase 11 cutover" step (an `echo`-only step is an accepted
pattern in this file for "not yet applicable, explain why").

---

## Shared Patterns

### SQLSTATE branching, never message text
**Source:** `03-CONTEXT.md` D-10, `packages/db/supabase/tests/identity_helpers.test.sql` line
65–69 (`throws_ok($$ … $$, '42501', null, …)`).
**Apply to:** `withIdentity`, every named wrapper, every route handler that calls one, the
`fail_closed.test.sql`/`cross_claim.test.sql` pgTAP files, and `NC3` in the deployed harness.
```ts
} catch (err) {
  if (err instanceof postgres.PostgresError && err.code === "42501") { /* forgotten wrapper */ }
  throw err;
}
```

### Doc-header names the decision id inline
**Source:** `apps/web/lib/logger.ts` lines 1–13, `apps/web/lib/env.d.ts` lines 1–14,
`packages/db/supabase/migrations/20260823000002_roles_and_helpers.sql` lines 1–21.
**Apply to:** every new file in this phase — `identity.ts`, `public.ts`, the wrappers, the CI
scripts, the wrangler edits. Every non-obvious line cites the `D-NN` it encodes, not a bare
comment.

### `--check` / drift-apply-diff CLI convention
**Source:** `scripts/migrate-dictionary.mjs` lines 13, 59, 789–799;
`packages/db/package.json`'s `types:check` script.
**Apply to:** `packages/db/scripts/mutation-gate.mjs` and the new CI grep script, if built as
committed scripts rather than inline `pr.yml` steps (the research leaves this to the planner's
discretion).

### Walk + regex + allowlist + exit-code CI script shape
**Source:** `scripts/check-next-public-allowlist.mjs` (full file read above).
**Apply to:** the banned-import/banned-pattern CI grep script (item 10 of "What Phase 3 must
produce").

### `postgres` import fence
**Source:** `03-CONTEXT.md` D-10, `03-RESEARCH.md` line 611–614.
**Apply to:** ESLint `no-restricted-imports` config (ban `postgres` outside
`packages/db/src/identity.ts`, `packages/db/src/public.ts`, and `apps/isolation-probe`) — no
existing ESLint config to extend; this is new infrastructure applied to every `.ts`/`.tsx` under
`apps/web` and `packages/db`.

### Named-environment binding blocks never inherit
**Source:** `apps/web/wrangler.jsonc`'s own top-of-file comment (read in full above).
**Apply to:** every new `placement`, `analytics_engine_datasets`, and `hyperdrive` block in both
`apps/web/wrangler.jsonc` and the new `apps/isolation-probe/wrangler.jsonc` — always nested inside
`env.staging`/`env.production` (or the probe's flat single-environment shape), never top-level.

---

## No Analog Found

Files with no close match anywhere in this codebase (planner should build from
`03-RESEARCH.md`'s Code Examples / stated shapes, not search further):

| File | Role | Data Flow | Reason |
|---|---|---|---|
| `packages/db/src/verify.ts` | utility | request-response | `jose` is not yet a dependency anywhere in the repo; no token-verification code exists to imitate. Content source: `03-RESEARCH.md` Standard Stack row for `jose` + isolation-proof.md §7.2 (cited, not read this pass) |
| ESLint config (root or per-package) | config | — | No ESLint config of any kind exists in this repo today (`find … -iname eslint*` empty). This is new tooling, not an edit |
| `packages/db/vitest.config.ts` | config | — | Vitest is not a dependency anywhere; `apps/web/playwright.config.ts` is a four-viewport visual-regression config, not a `node`-environment unit-test config — do not adapt it |
| `packages/db/test/support/drive.ts` | test utility | batch (concurrency driver) | No comparable concurrency-driving harness exists in the repo; content source is `03-RESEARCH.md`'s adjacency-set section |
| `packages/db/test/support/hyperdrive-metrics.ts` | test utility | transform | Same — no analog, build from the research's stated WAE/metrics shape |
| `apps/isolation-probe/src/index.ts` | route/controller | request-response | No standalone Cloudflare Worker fetch handler exists elsewhere in the repo (`apps/web/worker.ts`'s `fetch` is a pass-through to OpenNext's generated handler, not a hand-written one) |

## Metadata

**Analog search scope:** `packages/db/**` (all of `src/`, `supabase/migrations/`,
`supabase/tests/`, `package.json`, `README.md`), `apps/web/{wrangler.jsonc, worker.ts,
next.config.ts, lib/env.d.ts, lib/logger.ts, lib/*.ts, tsconfig.json, package.json, tests/**,
playwright.config.ts}`, `.github/workflows/*.yml`, `scripts/*.mjs`, root `package.json` +
`pnpm-workspace.yaml` + `tsconfig.base.json`, `.planning/phases/02-*/02-PATTERNS.md` (format
precedent).
**Files scanned:** ~45 read or grepped directly; full contents read for
`20260823000002_roles_and_helpers.sql`, `identity_helpers.test.sql`, `extensions.test.sql`
(partial), `apps/web/wrangler.jsonc`, `apps/web/worker.ts`, `apps/web/lib/env.d.ts`,
`apps/web/lib/logger.ts`, `apps/web/next.config.ts`, `apps/web/tests/support/server-harness.ts`,
`.github/workflows/{pr,deploy-staging,deploy-production}.yml`,
`scripts/check-next-public-allowlist.mjs`, `packages/db/package.json`, root `package.json`,
`apps/web/package.json`, `apps/web/tsconfig.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`.
**Pattern extraction date:** 2026-08-24.
