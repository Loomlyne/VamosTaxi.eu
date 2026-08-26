# Phase 3: Hyperdrive Data Access Wiring - Context

**Gathered:** 2026-08-23
**Status:** Ready for planning (after Phase 2 executes)
**Source:** Research express path (03-RESEARCH.md, Phase 2 CONTEXT D-03/D-37/D-38, ADR-007, ADR-014)

<domain>
## Phase Boundary

The Worker reaches Postgres only through Hyperdrive, on Supabase's **direct** connection
string, and a request's auth context cannot survive onto the next request that borrows the
same pooled backend. One function — `withIdentity` in `packages/db` — is the only door into
identity-scoped data; a caller who forgets it gets SQLSTATE `42501`, never a stale row.

Requirements covered: DATA-05, DATA-06.

**In scope:**
- Two Hyperdrive configs bound under **both** `env.staging` and `env.production` in
  `apps/web/wrangler.jsonc`: `HYPERDRIVE_NOCACHE` (cache-disabled, `vamos_edge`, identity and
  billing) and `HYPERDRIVE` (cacheable, `vamos_public`, public content only) — Phase 2 D-03.
- `withIdentity` + `publicSql` in `packages/db/src/`, with the closed `PG_ROLE` map, explicit
  `BEGIN`, both `set_config(…, is_local => true)` calls, ROLLBACK-on-throw, and the five named
  wrappers (`asCustomer`/`asStaff`/`asGuest`/`asAnon`/`asQuote`) in `apps/web/lib/db/`.
- postgres.js constructed per invocation with the D27 option set; module scope, `sql.end()` and
  `sql.reserve()` fenced out of app code by ESLint and CI grep.
- OpenNext wiring: `getCloudflareContext().env` on fetch/RSC, handler `env` on Cron/Queue,
  `force-dynamic` on every file that imports an identity wrapper.
- Placement Hints under each named environment, pinned at the AWS region that backs the
  Supabase project (D-25 below), plus Workers Analytics Engine instrumentation of every
  `withIdentity` call so DATA-05's p50 is a real percentile.
- The DATA-06 proof in two layers: a local connection-reuse simulator + pgTAP + mutation gate
  against `supabase start` (executable now), and a staging-only `apps/isolation-probe` Worker
  with negative controls and an adjacency floor (designed here, run in P6).
- CI greps that make a raw `postgres` import, a module-scope client, `sql.reserve()` in app
  code, an identity import on a static route, `set_config(…, false)`, plain `SET ROLE` /
  `SET SESSION`, and unfenced `sql.unsafe(` fail the build.

**Out of scope:**
- **No migrations.** Phase 3 writes no file under `packages/db/supabase/migrations/`. Every
  `.sql` file it adds is a pgTAP test (`packages/db/supabase/tests/*.test.sql`) or a mutation-
  gate mutant (`packages/db/mutants/*.sql`) that is applied and rolled back by the gate script.
  Confirmed against the research's six-plan file scope — no migration path appears in any plan.
  The schema-push gate stays quiet for this phase.
- No quote or pricing engine — Phase 4. Phase 3 ships the `asQuote` door the engine calls
  through, nothing that computes a price.
- No new tables, roles, grants or policies. Those are Phase 2's; Phase 3 consumes them.
- No product routes. `/api/account/bookings` and friends are Phase 5; the probe Worker proves
  the probe, not the OpenNext app (research U31 / ISOL-08).
- No UI of any kind.

</domain>

<decisions>
## Implementation Decisions

Every bullet below cites the originating research decision (`research Dn`) or uncertainty
(`research Un`) in parentheses for traceability back to `03-RESEARCH.md`. Phase 2 decisions are
cited as "Phase 2 D-nn" and refer to `02-CONTEXT.md`.

### Hyperdrive topology and the connection string (DATA-05)
- **D-01:** (research D25) Two Hyperdrive configs, `HYPERDRIVE_NOCACHE` + `HYPERDRIVE`, bound
  under **both** `env.staging` and `env.production`. Cache is disabled by `--caching-disabled`
  at `wrangler hyperdrive create` time. The credential lives inside the Hyperdrive config
  object, addressed by an opaque `id` — never in `wrangler.jsonc`, never `wrangler secret put`.
  Implements Phase 2 D-03.
- **D-02:** (research D26) Both configs point at the **direct** string
  `postgres://<role>:<pw>@db.<ref>.supabase.co:5432/postgres`. Never Supavisor `:6543` in any
  shape, never `postgres` or `authenticator` as the login role. Hyperdrive *is* the pooler.
- **D-03:** (research D35) Origin pool sizes: 25 on the identity config, 15 on the public config
  (40 of Micro's 60), and a **dedicated** staging-only config capped at 5 for the isolation
  probe so 32-way concurrency makes backend reuse a pigeonhole. Probe and app config ids are
  pinned in a checked-in allowlist test so the 5-origin config can never be bound as
  `apps/web`'s `HYPERDRIVE_NOCACHE`.
- **D-04:** (research D34) The only local connection string this phase documents is port
  **54322** (`supabase start`), logging in as `vamos_edge` / `vamos_public`. The current
  `postgres:postgres@localhost:5432` placeholder is a pre-roles boot value and is struck as an
  identity login — a superuser carries `BYPASSRLS` and makes Phase 2 D-02's `42501` untestable.
  `CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_<BINDING>` overrides the committed value in CI.

### postgres.js lifecycle and OpenNext
- **D-05:** (research D27) postgres.js is constructed **per invocation** inside `withIdentity` /
  `publicSql`: identity `max: 1`, public `max: 5`, both `fetch_types: false`, `prepare: true`,
  `connect_timeout: 10`, no `idle_timeout`, no `sql.end()` anywhere in `apps/**` or
  `packages/db/src/**`. Module scope is a hard Workers error that is silent on the first
  request; `prepare: false` silently disables Hyperdrive's cache.
- **D-06:** (research D36) `env` arrives via `getCloudflareContext()` on fetch/RSC only; Cron and
  Queue handlers take `env` from the Worker argument. Node.js runtime, never
  `runtime = 'edge'`. Every file importing an identity wrapper is a Route Handler or exports
  `dynamic = "force-dynamic"`, enforced by grep with a named allow-list for `publicSql` content
  pages.

### `withIdentity` — the one door (DATA-06 structural half)
- **D-07:** (research D28) Core lives at `packages/db/src/identity.ts` and takes a
  **connection string** first — `packages/db` must not depend on OpenNext `env`. The probe and
  the app import the same function; a copy in `apps/web` would make the proof worthless.
  `sql.begin()` ROLLBACKs and rethrows unmodified on throw; callers branch on `err.code`.
- **D-08:** (research D76) One frozen signature:
  `withIdentity(cs, kind, claims, fn, opts?)`. `apps/web` imports the **named wrappers only**
  (`asCustomer`/`asStaff`/`asGuest`/`asAnon`/`asQuote`); CI fails any `@vamos/db` import under
  `apps/web/app` or `apps/web/lib` except the wrapper file. `fn` must return data — returning
  `tx` is an ESLint error and a type error. Phase 2's union sketch and Phase 4's
  `withIdentity(env, identity, …)` are both struck.
- **D-09:** (research D29) `PG_ROLE = { anon, customer: "authenticated", staff: "vamos_staff",
  guest: "vamos_guest" }`, keyed by our discriminant, never by a token field. `claimsForSql`
  strips `user_metadata` rather than trusting it not to be read (Phase 2 D-04).
- **D-10:** (research D30) A forgotten wrapper gets SQLSTATE `42501` and nothing else.
  `postgres` is importable only from the two `packages/db` modules plus the staging probe;
  ESLint `no-restricted-imports` and the CI greps are the compile-time half, the `42501` the
  runtime safety net. If a no-wrapper path ever returns a row count, the design is void.
- **D-11:** (research D39) `publicSql(env)` runs on `HYPERDRIVE` as `vamos_public`, no identity,
  no transaction, `max: 5`, branded to the §14d table set only (`content_strings`, `reviews`,
  `vehicle_classes`, `service_zones`, `settings_public`). Identity data is never issued on this
  binding.
- **D-12:** (research D79) The quote/ledger path is `asQuote` (or definer RPCs) on
  **`HYPERDRIVE_NOCACHE`**. Pricing tables are never granted to `vamos_public`. Phase 4's D60
  "load the rate book via `HYPERDRIVE`" contradicts Phase 2 D-03 and is refused — the planner
  should record the refusal against Phase 4's research, not soften it here.
- **D-13:** (research D80) `@vamos/db` becomes a real module: `exports` for `./identity`,
  `./public`, `./database.types`; `postgres` as a dependency; `workspace:*` from `apps/web`;
  `transpilePackages` in Next config. Today it is `"main": "index.ts"` pointing at a file that
  does not exist, so every sample import fails `next build`.

### The DATA-06 proof
- **D-14:** (research D33) Proof architecture: staging-only `apps/isolation-probe` importing
  `@vamos/db`; Vitest in `node` environment (not Playwright, not vitest-pool-workers); a
  cross-customer adjacency count `S` with a floor; a residue probe; six deployed negative
  controls plus two local migration mutants. "200 requests returned the right rows" without an
  asserted `S` is theatre.
- **D-15:** (research D37) The residue probe is `opts.probe` **inside the shipped function** —
  production never sets it, the probe Worker always does. Not an always-on probe (extra RTT on
  every production call) and not a probe-only fork of the SQL.
- **D-16:** (research D77) Tests call the shipped function. `opts.client` is test-only, so the
  local simulator can hand `withIdentity` a `sql.reserve()`d client and run it on a pinned
  backend. There is no inlined `runCorrect` SQL in the probe or the simulator.
- **D-17:** (research D78) NC1 — the primary negative control — is a session-scoped `SET`
  **inside** `BEGIN`/`COMMIT` (`impl=session_in_txn`), because PG 17 keeps an `is_local=false`
  SET across COMMIT while Hyperdrive's `RESET` masks the no-transaction variant. The no-txn
  session SET is U27's measurement, not the D1 mutant.
- **D-18:** (research D38) Negative-control discipline splits in two: **mutants** (NC1, NC2, NC3,
  NC6, M1, M2, `is_local=false`) fail the job if they come back green; **hazards** (abandoned
  request, `waitUntil`-captured `tx`) fail the job if unobserved, or if residue follows a
  confirmed dirty origin. One blanket "fails if a control passes" rule inverts NC4/NC5.
- **D-19:** (research D81) Isolation fixtures match `02-SCHEMA-DRAFT.md`, not
  `isolation-proof.md` verbatim: `customers(user_id, full_name, email)`, `bookings.status =
  'quote'` with contact NOT NULLs, policy `c.user_id = app.uid()`, ordering by `created_at` /
  `booking_legs.scheduled_at` — never `bookings.pickup_at`, which does not exist.
- **D-20:** (research D82) `opts.probe` is stripped at compile time unless
  `DEPLOY_ENV === "staging"` or `VAMOS_ISOLATION_PROBE === "1"`; it is not a caller flag a
  production import can set. `deploy-production.yml` gains the three structural gates (no probe
  dist, no `isolation-probe` string in `apps/web`, no `PROBE_SECRET` on the production Worker).
- **D-21:** (research D40) Isolation fixtures carry **no money**: NULL price columns, no
  `rate_versions` row with `status='live'`, and any surface the probe or a local page renders
  shows the `CHF 000` placeholder by data. Never invent a figure to make a booking fixture look
  complete (Law 04, Phase 2 D-34).

### Placement and latency (DATA-05)
- **D-22:** (research D31) Placement Hints (`"placement": { "region": … }`) inside **each**
  `env.*` block — not Smart Placement (learns slowly, solves the wrong problem for one
  single-homed database), not a top-level key (named environments drop it). The entire margin
  between passing and failing DATA-05 is Worker placement, not query tuning.
- **D-23:** (research D32) Instrumentation is Workers Analytics Engine: binding `DB_LATENCY`,
  dataset `vamos_db_latency`, written from the `apps/web` wrappers (the package has no `env`),
  queried with `quantileExactWeighted(0.5)`. Not paid APM, not Workers Logs, and never
  Cloudflare's own 1–3 ms figure asserted as a measurement. The staging p50 is recorded
  **DEFERRED** until a Worker exists.
- **D-24:** (research D83) Placement Hints pin **fetch handlers only**. Queues consumers and Cron
  handlers are unplaced and their latency is explicitly outside DATA-05; they still go through
  `withIdentity`, and they take `env` from the Worker argument. Record this in the phase summary
  regardless of plan tier — it is also a correction to ADR-007's framing.

### Corrections settled 2026-08-23 (newer than the research)
- **D-25:** **The placement target is Zurich, not Frankfurt.** The hosted Supabase project is
  `yaumjzvylngfjhtuffqs`, region **Central Europe (Zurich)** (Phase 2 D-37), which Supabase's
  region table backs with AWS **`eu-central-2`**. The Placement Hint is therefore
  `"placement": { "region": "aws:eu-central-2" }`, superseding research D31's
  `aws:eu-central-1`. This also closes the "confirm the provisioned project's region" half of
  research U25 — what remains open there is only whether the `region` shorthand suffices or
  `placement.host`/`hostname` probes are needed. Source: Supabase regions doc (see
  `<canonical_refs>`).
- **D-26:** The planner adds a doc task that replaces the stale region value in
  `03-RESEARCH.md` at these lines: config/value occurrences **60, 1008, 1123 (D31 row), 1156
  (U25 row), 1161 (U30 row), 1402, 1914, 1933, 1978**; prose "Frankfurt"/"eu-central" occurrences
  **975, 1000, 1011, 1041–1042, 1079, 1081–1082, 1086, 1327, 1433, 1519, 1604**. The same task
  amends ADR-007 and PROJECT.md, which both still say Frankfurt (Phase 2 D-37 already schedules
  that amendment — do not do it twice).
- **D-27:** Every latency figure in `03-RESEARCH.md` is Frankfurt-derived (Cloudflare's
  1–3 ms-when-nearby × the 5-RTT `withIdentity` shape, "single-digit to low-teens ms";
  "100–150 ms" from a distant PoP). Zurich is a different AWS region with different PoP
  adjacency, so **every one of those numbers is an expectation to be re-measured**, not a
  carried-over baseline. Nothing in the design changes; the DATA-05 number is still DEFERRED
  until measured from the staging Worker (D-23).
- **D-28:** The Supabase CLI project lives at **`packages/db/supabase/`** (Phase 2 D-38 — Phase 2
  Wave 0 performs the move from the repo root). Phase 3 writes its pgTAP files to
  `packages/db/supabase/tests/` and runs every CLI call through `packages/db`'s package scripts.
  Phase 3 does **not** redo the move, re-init, or re-link.
- **D-29:** Owner/account state, both halves recorded honestly: ADR-014 §4 confirms a
  **Cloudflare account exists** (Free plan until go-live), which retires the research's flat "no
  Cloudflare account". But `.planning/STATE.md`'s blocker still stands as the *execution*
  prerequisite — `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, and the `vamostaxi.eu` zone
  with existing Freshpage DNS imported — and without those, `wrangler hyperdrive create` and the
  staging deploy cannot run. P6 stays deferred-if-unprovisioned; P1–P5 are unaffected.
- **D-30:** **Phase 2 executed is a hard precondition.** Every pgTAP file, the connection-reuse
  simulator, the mutation gate and the fail-closed assertions presume Phase 2's schema, its four
  roles, the `app.*` helpers and the `vamos_edge` grants already exist on the target database.
  If Phase 2 is unexecuted, P1 still lands the TypeScript against the frozen contract with a
  mocked `sql.begin`, and P2/P5 wait. Do not stub a role or a grant to make a test go green.
- **D-31:** Phase 3 adds **no migrations of its own** (see `<domain>`). Its `.sql` files are
  pgTAP tests and mutation-gate mutants; the mutants are applied and rolled back by
  `packages/db/scripts/mutation-gate.mjs` and never committed to the migration sequence.

### Execution-time checks the plan must run (research UNCERTAIN items, with fallback)
- **D-32:** (U1) Phase 2 P1 must have answered whether managed Supabase's `postgres` role can run
  `grant authenticated to vamos_edge with inherit false, set true`. If its fallback fired,
  `PG_ROLE.customer` is `"vamos_customer"` and **nothing else in the wrapper moves**. Phase 3
  does not search-replace policies after Phase 2's `0002` merged; P5 re-runs Phase 2's pgTAP
  enumerator that fails if `PG_ROLE.customer` and `pg_policies.roles` disagree.
- **D-33:** (U2) Confirm `set_config('role', $1, true)` ≡ `SET LOCAL ROLE $1` with the four-line
  check on `supabase start` in P1: `begin; select set_config('role','authenticated',true);
  select current_user; commit; select current_user;` — expect `authenticated` then `vamos_edge`.
  Fallback is a **closed-map switch** of literal statements, never `unsafe` + string concat.
  Blocks `withIdentity`'s first statement.
- **D-34:** (U3) Whether `supabase db push --include-seed` re-runs the seed is Phase 2's question
  and is carried only because it gates the `deploy-staging.yml` migration step Phase 3's P6
  deploys behind. Phase 3 assumes load-bearing either way and does not change the answer.
- **D-35:** (U23) Check `npx wrangler hyperdrive update <id> --caching-disabled --help` against a
  real config. Docs show the flag only on `create`. If unsupported, the recovery runbook is
  delete + recreate + re-point the binding id — not a patch. Affects wrong-cache-mode recovery,
  not the happy path.
- **D-36:** (U24) Smoke-test one RLS-gated route through `opennextjs-cloudflare build &&
  preview`, not only `next dev`, to confirm `getCloudflareContext()`'s "async mode" does not
  change this usage. Fallback is the documented async form at the wrapper boundary only.
- **D-37:** (U25) With D-25's region confirmed, what remains is whether `placement.region` alone
  is enough for Hyperdrive or `placement.host`/`hostname` L4/L7 probes are needed. Measure p50
  with the region hint alone; add host probes only if it misses the 30 ms bar.
- **D-38:** (U26) Measure whether the five sequential tagged-template awaits inside `sql.begin`
  issue five network flushes or postgres.js pipelines some: `log_statement=all` +
  `log_line_prefix='%m '` on local Supabase, count flushes, compare to the WAE p50. Production
  `withIdentity` stays sequential-await until this is measured; standardise the array-return
  form on hot paths only if the measured number sits close to 5×RTT.
- **D-39:** (U27) NC1's `residue` count measures whether Hyperdrive's documented `RESET` actually
  clears `role` and `request.jwt.claims` (`RESET ALL` ≠ `DISCARD ALL`). If it is 0, record the
  finding **and** record explicitly that the design does not depend on it — D1/D2 do the work.
  NC1 green with zero evidence is an escalation, not a pass.
- **D-40:** (U28) NC4 measures what happens to an origin connection whose client dies mid
  transaction. Watch for `25P02`, residue, and `Failed to acquire a connection from the pool`
  across the 400 follow-up probes. Abandoned-request safety, not the happy path.
- **D-41:** (U29) Confirm Supabase Admin `createUser` accepts `@example.com` when email
  confirmations are on, at the first deployed fixture run. Fallback: a dedicated verified test
  domain, or `email_confirm: true` with a project-level allowlist. The local simulator uses
  Phase 2's pgTAP ids and never touches Auth, so this blocks only the deployed half.
- **D-42:** (U30) `wrangler deploy` either accepts or rejects the Placement Hints block on the
  Free plan. Record the outcome — and the Queues/Cron exclusion (D-24) — in the phase summary
  either way. Fallback if unavailable: DATA-05 is measured unplaced and the miss is reported as
  a plan-tier finding, not hidden.
- **D-43:** (U32) Run `show max_connections;` and `select count(*) from pg_stat_activity;` on the
  provisioned project **before** the first `wrangler hyperdrive create`. The 25 + 15 split
  assumes Auth, Realtime and PostgREST do not compete meaningfully; size it with unplaced
  Cron/Queue sweeps in mind (D-24). Fallback: lower both limits proportionally.
- **D-44:** (U59) `asQuote`'s door is definer RPCs called inside `asAnon`/`asCustomer` by
  preference. A fifth `IdentityKind` backed by a `vamos_quote nologin` role is a **Phase 2**
  role-set addition, not a Phase 3 one. Either way, pricing tables are never granted to
  `vamos_public` (D-12).
- **D-45:** (U61) The adjacency set must include a **guest pair and a staff pair**, not only two
  customers, and the entry probe must assert `request.vamos.manage_token_hash` is EMPTY on
  entry — the residue SQL as drafted omits it. Without this, DATA-03 and AUTH-05 are unproven
  under the pool.

### Claude's Discretion
- Plan-to-file mapping beyond the research's six-plan split — merging P3 and P4, or splitting P1
  into contract-then-implementation, is the planner's call as long as P1 stays a hard gate and
  P6 stays deferred-if-unprovisioned.
- The exact Vitest project/workspace layout in `packages/db` (one config with two projects for
  `test/local` and `test/deployed`, versus two configs) — the research names the runner and the
  environment, not the config shape.
- ESLint rule wiring (flat config vs. per-package overrides) for `no-restricted-imports` and the
  `ReturnStatement`-of-`tx` rule, as long as both fire in CI.
- Whether the CI greps live inline in `pr.yml` or in a committed script that `pr.yml` calls —
  the research is silent; a script is easier to test locally.
- Iteration counts beyond the research's `PROBE_REQUESTS=400` / `PROBE_CONCURRENCY=32` /
  `PROBE_MIN_ADJACENCY=200`, which are starting values to be re-derived once the real pool size
  is known (D-43).

### Proposed plan split `[informational]`
Reproduced from 03-RESEARCH.md's "Proposed Phase 3 plan split" — a recommendation the planner
may adopt, adapt or replace; not a locked decision. The coverage gate should not treat this
table or the wave diagram as D-NN items.

| # | Plan | Goal (one line) | File scope | Depends on | Parallel with |
|---|---|---|---|---|---|
| **P1** | **`withIdentity` in `packages/db`** | The only door into identity-scoped data exists, with all four actors, closed `PG_ROLE`, ROLLBACK-on-throw, `opts.probe`, and `publicSql`. postgres.js constructed per-invocation with D27's options. `postgres` import fenced | `packages/db/src/identity.ts`, `packages/db/src/public.ts`, `packages/db/src/claims.ts` (`claimsForSql`, `VamosClaims` type), ESLint `no-restricted-imports`, unit tests with a local `postgres` against `supabase start` **or** a mocked `sql.begin` if Phase 2 roles are not in yet | Phase 2 P1 roles if hitting a real DB; otherwise the TypeScript contract alone | nothing (hard gate) |
| **P2** | **Local isolation: simulator, pgTAP, mutants** | Residue on a pinned backend fails 100 % of the time; forgotten wrapper is `42501`; two mutants turn the suite red | `packages/db/test/local/connection-reuse.test.ts`, `packages/db/supabase/tests/fail_closed.test.sql`, `cross_claim.test.sql`, `set_local_without_begin.test.sql`, `packages/db/mutants/M1_*.sql`, `M2_*.sql`, `packages/db/scripts/mutation-gate.mjs`, Vitest config (`node`, `*.test.ts`, no Playwright) | P1; Phase 2 P6 (grants) for pgTAP to be meaningful | P3 (file-disjoint) |
| **P3** | **OpenNext wrappers, wrangler shape, CI greps** | App call sites see `asCustomer(env, claims, fn)`; WAE write-path present; `force-dynamic` grep; Placement Hints block in both envs; `localConnectionString` on 54322 as `vamos_edge` / `vamos_public`; WAE dataset binding declared. Real Hyperdrive ids **not** required — staging keeps omitting a fake UUID; production keeps its placeholder until P6 | `apps/web/lib/db/identity.ts`, `apps/web/lib/db/public.ts`, `apps/web/wrangler.jsonc` (placement, analytics_engine_datasets, localConnectionString, commented dual-binding shape), `npx wrangler types`, grep in `pr.yml` | P1 | P2, P4 |
| **P4** | **Probe Worker + harness, as source** | `apps/isolation-probe` exists, staging-only, closed `impl` union, imports `@vamos/db`. Vitest deployed harness, fixtures, adjacency helper, negative-control tests **written**. Nothing in this plan deploys or talks to Cloudflare | `apps/isolation-probe/**`, `packages/db/test/fixtures/two-customers.ts`, `test/support/drive.ts`, `test/support/hyperdrive-metrics.ts`, `test/deployed/*.test.ts` (skipped unless `PROBE_BASE_URL` is set), production `grep` that the probe is absent from `apps/web` | P1 | P3 |
| **P5** | **Local gate: P1–P4 against `supabase start`** | Connection-reuse simulator green; mutation gate red-against-mutants; fail-closed pgTAP green; identity wrappers typecheck; `force-dynamic` grep green; probe package typechecks and is not in a production build | `pr.yml` jobs listed in `isolation-proof.md` §13 (the local half only) | P2, P3, P4 | — |
| **P6** | **Staging Hyperdrive + DATA-06 + p50 — DEFERRED if unprovisioned** | `wrangler hyperdrive create` twice per environment (D25/D26/D35); bind real ids; deploy app + probe to staging; config preconditions; NC1–NC6 go red as expected; isolation gate with `S` floor; WAE `quantileExactWeighted(0.5)` recorded. **If still unprovisioned: do not mark this plan done. Record DATA-05 p50 as DEFERRED. Do not treat P5 as the ROADMAP gate.** | wrangler Hyperdrive configs; `deploy-staging.yml` `data-06` job from `isolation-proof.md` §13; a one-line `DATA-05 p50 = DEFERRED (no staging Worker)` in the phase summary until the number exists | P5; Cloudflare API token + account id (D-29); Supabase project; Phase 2 executed on that project (U1 answered) | — |

```
P1 ──┬── P2 ──┐
     ├── P3 ──┼── P5 ── P6 (deferred-if-unprovisioned)
     └── P4 ──┘
```
Wave 1: **P1** alone. Wave 2: **P2**, **P3**, **P4** in parallel (P3 does not need a live
Hyperdrive id; P4 does not deploy). Wave 3: **P5** alone — the local gate. Wave 4: **P6** when
the account credentials exist. Until then the phase is **in progress, local slice landed,
staging measurement DEFERRED**.

</decisions>

<specifics>
## Specific Ideas

- The two Hyperdrive bindings, by name: **`HYPERDRIVE_NOCACHE`** (`--caching-disabled`,
  `vamos_edge`, identity + billing, `origin-connection-limit=25`) and **`HYPERDRIVE`**
  (`vamos_public`, cacheable public content, `origin-connection-limit=15`). A third,
  staging-only config at limit **5** backs `apps/isolation-probe`.
- Connection-string rule, stated once:
  `postgres://<login_role>:<pw>@db.<ref>.supabase.co:5432/postgres` — port **5432**.
  Never `:6543`, never `aws-0-<region>.pooler.supabase.com`, never `postgres` or
  `authenticator` as the login role. Local is `127.0.0.1:54322` — port **54322** — as
  `vamos_edge` / `vamos_public`.
- The frozen core signature, exact:
  `withIdentity<K extends IdentityKind, T>(connectionString: string, kind: K, claims:
  ClaimsFor<K>, fn: (tx: postgres.TransactionSql) => Promise<T>, opts?: { probe?: boolean;
  client?: postgres.Sql }): Promise<T>`.
- The five call-site wrappers, exact: `asAnon(env, fn)`, `asCustomer(env, claims, fn)`,
  `asStaff(env, claims, fn)`, `asGuest(env, manageTokenHashHex, fn)`, `asQuote(env, fn)` — all
  in `apps/web/lib/db/identity.ts`, all on `HYPERDRIVE_NOCACHE`, all writing the WAE data point.
- WAE binding **`DB_LATENCY`** → dataset **`vamos_db_latency`**; `blobs: [kind, "ok" | sqlstate]`,
  `doubles: [ms]`, `indexes: [kind]`; read with `quantileExactWeighted(0.5)(double1,
  _sample_interval)`.
- SQLSTATEs the wrappers and call sites branch on, never message text: `42501`
  insufficient_privilege (forgotten wrapper / lost BEGIN), `25P02` in-failed-transaction (NC4),
  `23505` unique_violation, `23P01` exclusion_violation (Phase 8).
- Env vars and CI variables the phase introduces: `DEPLOY_ENV` (already present),
  `VAMOS_ISOLATION_PROBE`, `CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_<BINDING>`,
  `PROBE_BASE_URL`, `PROBE_SECRET`, `PROBE_HYPERDRIVE_CONFIG_ID`, `PROBE_REQUESTS`,
  `PROBE_CONCURRENCY`, `PROBE_MIN_ADJACENCY`, `CF_ACCOUNT_ID`, `CF_ANALYTICS_TOKEN`.
- Test commands the plan is built around:
  - **Vitest** (`packages/db`, `environment: node`) — unit tests for `withIdentity`, the
    connection-reuse simulator (`pnpm --filter @vamos/db exec vitest run test/local`) and the
    deployed harness (`… vitest run test/deployed/*.test.ts`, skipped unless `PROBE_BASE_URL`
    is set). Vitest is **not** a dependency anywhere in this repo today — installing it is
    Phase 3 Wave 0 work.
  - **pgTAP** via `supabase test db <path>` from `packages/db` — the CLI accepts file and
    directory arguments, so a single file is the quick run and
    `supabase db reset && supabase test db` is the full suite.
  - **Mutation gate**: `pnpm --filter @vamos/db run mutation-gate` — applies each
    `packages/db/mutants/*.sql`, asserts the pgTAP suite goes **red**, rolls back.
  - **Playwright** stays where it is (`apps/web/tests/`, `pnpm test:visual`) for any web-facing
    check; it is not the DATA-06 vehicle.
- The probe/app config-id allowlist test is checked in, so the 5-origin probe config can never
  be bound as `apps/web`'s `HYPERDRIVE_NOCACHE`.

</specifics>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase research (primary source for this CONTEXT)
- `.planning/phases/03-hyperdrive-data-access-wiring/03-RESEARCH.md` — the five lanes, the
  D25–D40 + D76–D83 decision table (~line 1111), the U1/U2/U3 + U23–U32 + U59/U61 uncertainty
  table (~1144), the lane disagreements (~1169), the owner blockers (~1197–1245), the six-plan
  split (~1247), the Standard Stack / Architecture Patterns / Anti-Patterns / Common Pitfalls /
  Code Examples (~1334–2062), and DATA-05/DATA-06 restated (~2063). **Read D-25/D-26/D-27 above
  first** — the region value in this file is stale in ~20 places.
- `.planning/phases/03-hyperdrive-data-access-wiring/03-HARDEN.md` — the 27-finding harden
  ledger (ISOL-01…12, FC-01…11, F1–F4) that produced D76–D83, U59 and U61.
- `.planning/phases/03-hyperdrive-data-access-wiring/research/hyperdrive-wiring.md` — the
  collapsed binding / client-lifecycle / wrapper / latency lanes: §1 bindings and pool sizing,
  §2 postgres.js and OpenNext, §3 `withIdentity`, §4 placement and WAE.
- `.planning/phases/03-hyperdrive-data-access-wiring/research/isolation-proof.md` — the
  isolation lane: §2 the fifteen survival paths, §4 local vs deployed, §5 the probe surface,
  §6 why the helper moved to `packages/db`, §7 the harness, §9 the negative controls, §10
  fail-closed SQL, §12 configuration assertions, §13 CI wiring, §14 what invalidates the proof.
- `.planning/phases/03-hyperdrive-data-access-wiring/verify/isolation-soundness.md`,
  `verify/forward-compat.md`, `verify/fidelity-against-phase-2.md` — the three harden lenses;
  read before changing any negative control, the wrapper signature, or a fixture.

### Phase 2 artifacts this phase binds to
- `.planning/phases/02-data-schema-rls-staff-auth-foundations/02-CONTEXT.md` — **D-01** (identity
  via `set_config` in one transaction), **D-02** (the grant on privilege-less `vamos_edge` is
  the boundary), **D-03** (the two Hyperdrive configs), **D-04/D-05** (staff claim + `aal2`),
  **D-15/D-16** (manage token), **D-37** (project ref `yaumjzvylngfjhtuffqs`, region Central
  Europe (Zurich)), **D-38** (`packages/db/supabase/`).
- `.planning/phases/02-data-schema-rls-staff-auth-foundations/02-RESEARCH.md` — Lane 1
  (RLS over Hyperdrive, prepared-statement safety, the DATA-06 proof design) and Lane 6 (the
  5432/54322 mismatch this phase's D-04 resolves).
- `.planning/phases/02-data-schema-rls-staff-auth-foundations/02-SCHEMA-DRAFT.md` — §2 roles and
  `app.*` helpers, §14a–14f the policies the isolation fixtures must satisfy, §14d the exact
  table set `publicSql` is branded to. Fixtures are written against this file, not against
  `isolation-proof.md` verbatim (D-19).

### Architecture decisions that bind this phase
- `.planning/ADR-007-edge-data-residency.md` — the placement/residency proposal. Still says
  Frankfurt and still proposes **Smart Placement**; this phase chooses Placement Hints (D-22)
  at the Zurich AWS region (D-25), and records that placement covers fetch handlers only
  (D-24). The counsel question the ADR raises is untouched and stays open.
- `.planning/ADR-014-owner-sitting-2026-08-22.md` — **§4 Accounts**: Cloudflare **exists**, Free
  plan until go-live; Supabase/Stripe/Resend/Mapbox created when asked. §7 Cloudflare Web
  Analytics (not PostHog). The "still open" list keeps the CHF matrix open, which is why D-21
  holds.

### Configuration and requirements
- `apps/web/wrangler.jsonc` — today: one `HYPERDRIVE` binding under `env.production` only, with
  a non-UUID placeholder id and a `localConnectionString` pointing at
  `postgres:postgres@localhost:5432`; `env.staging` omits the binding entirely because a
  placeholder UUID fails `wrangler deploy` validation. Its comments name Phase 3 as the fixer.
  Read its top-level comment about named environments not inheriting bindings before adding
  `placement` or `analytics_engine_datasets`.
- `.planning/ROADMAP.md` § Phase 3 — the goal ("hard gate — no other phase's real query work can
  be trusted until this is verified under concurrency") and the two success criteria that map
  1:1 onto DATA-05 and DATA-06.
- `.planning/REQUIREMENTS.md` — DATA-05 (line 45) and DATA-06 (line 46) verbatim; status table
  lines 202–203.
- `.planning/STATE.md` § Blockers/Concerns — the direct-vs-pooled string blocker, the residency
  blocker, and the Cloudflare API token / account id / zone blocker that D-29 carries.
- `packages/db/README.md` — the empty Phase 1 scaffold that promises "a thin `postgres.js`
  access helper consumed by `apps/web` through Cloudflare Hyperdrive (Phase 3 wires the
  binding)". D-13 makes it a real module.
- `.github/workflows/pr.yml`, `deploy-staging.yml`, `deploy-production.yml` — the existing single
  `gate` job (typecheck, lint:css, i18n:check, build, Playwright visual, opennext build) that
  P5's local jobs join, and the two deploy workflows P6 and D-20 extend.

### External documentation
- https://supabase.com/docs/guides/platform/regions — **the source for D-25**: "Central Europe
  (Zurich), `eu-central-2`" (and "Central EU (Frankfurt), `eu-central-1`", the value the
  research carries).
- https://developers.cloudflare.com/hyperdrive/ — Hyperdrive concepts, and specifically
  `configuration/tune-connection-pool/` (origin connection limits, D-03),
  `concepts/query-caching/` (`--caching-disabled`, D-01),
  `examples/connect-to-postgres/postgres-database-providers/supabase/` (use the Direct
  connection string, D-02), `configuration/local-development/` (`localConnectionString`, D-04).
- https://developers.cloudflare.com/workers/configuration/placement/ and
  https://developers.cloudflare.com/changelog/2026-01-22-explicit-placement-hints/ — Placement
  Hints vs Smart Placement, and "only affects fetch event handlers" (D-22, D-24).
- https://developers.cloudflare.com/analytics/analytics-engine/sql-reference/aggregate-functions/
  — `quantileExactWeighted` (D-23).
- https://opennext.js.org/cloudflare/bindings — `getCloudflareContext()` (D-06).
- https://github.com/porsager/postgres — `sql.begin` ROLLBACK-on-throw, `sql.reserve()`,
  `prepare`, `fetch_types` (D-05, D-07).

### Project rules
- `CLAUDE.md` — Law 04 (a pending value is a labelled gap): the fixture-level analogue is D-21,
  seed no price and let the surface render the placeholder.
- `.claude/CLAUDE.md` — the fixed stack (Cloudflare Workers via `@opennextjs/cloudflare`,
  Supabase behind Hyperdrive, `postgres.js`, no Vercel), the security posture (RLS everywhere,
  server-authoritative quotes, no secrets in the repo), and the EU-hosted / region-pinning
  constraint that D-25 corrects from Frankfurt to Zurich.

</canonical_refs>

<deferred>
## Deferred Ideas

Items the research explicitly assigns elsewhere, plus the two success criteria that cannot be
claimed until infrastructure exists. None of these block P1–P5.

- **DATA-05's p50 measurement — DEFERRED, precisely.** What is deferred is *the number*: one
  `quantileExactWeighted(0.5)` over `vamos_db_latency` from a deployed **staging** Worker. What
  is **not** deferred is the design and the instrumentation — Placement Hints, the WAE binding
  and the write path all land in P3. Deferred to **P6 of this phase**, once the Cloudflare API
  token and account id exist (D-29) and a Supabase project is reachable. Until then the phase
  summary carries the literal line `DATA-05 p50 = DEFERRED (no staging Worker)`. A local
  `supabase start` timing is laptop-to-localhost and is **not** the criterion; a Frankfurt-derived
  estimate is not a measurement (D-27).
- **DATA-06's deployed half.** The local simulator proves the Postgres half deterministically.
  Hyperdrive's `RESET` behaviour, abandoned-transaction handling, `cacheStatus` and `waitUntil`
  are only observable against a deployed Worker. Deferred to **P6**. A green local run is not
  DATA-06.
- **U31 / ISOL-08 — DATA-06 against the real product route.** The probe Worker proves the probe,
  not OpenNext. Re-pointing the isolation harness at `/api/account/bookings`, plus the CI grep
  for module-scope `Map`/`Set`/`cache`/`memo`/`store` under `apps/web`, is owned by **Phase 5**,
  when those routes exist.
- **The Phase 4 D60 contradiction.** Phase 4's research proposes loading the rate book through
  the cached `HYPERDRIVE` binding. D-12 refuses it. Correcting Phase 4's own document is owned
  by Phase 4's planning, not by Phase 3.
- **FC-04's Phase 7 writer.** Phase 3 lands the `asQuote` door and the guest/staff adjacency
  coverage; the checkout INSERT that uses a definer RPC inside `asAnon`/`asCustomer` is **Phase
  7**.
- **U13 / ADR-007 — Cloudflare Regional Services.** Whether it is available and affordable, and
  whether its Queues/Cron coverage gap changes what ADR-007 can promise, is a Cloudflare
  account-team question owned by the ADR-007 revision in **Phase 10**. D-24's finding (placement
  pins fetch only) feeds that revision.
- **ADR-007's counsel question.** Whether transient processing of passenger data at a Cloudflare
  PoP is a "transfer" under nFADP/GDPR is a legal question. Engineering ships the placement
  default; counsel answers the doctrine. Still open, still gating **Phase 10** monitoring.
- **A dedicated production Supabase project.** The research assumes one Micro instance may back
  both Worker environments through Phases 3–8 and sizes the pools accordingly (D-03). Splitting
  staging and production databases is a later, owner-facing decision.

</deferred>

---

*Phase: 03-hyperdrive-data-access-wiring*
*Context gathered: 2026-08-23 via research express path*
