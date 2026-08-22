# Phase 3 Research — Hyperdrive Data Access Wiring

**Date:** 2026-08-22.
**Requirements:** DATA-05, DATA-06.
**Builds on (does not re-litigate):** D1–D24 in `02-RESEARCH.md`. If this document
contradicts one of those, it names the id and records why. The 8-lens harden
pass names two contradictions of later-phase text, not of D1–D24: Phase 4
D60 (cached rate book) is refused by D3/D79; `isolation-proof.md` fixture SQL
and NC1/NC4/NC5 constructions are superseded here (D78, D81, D38).
**Sources:** `research/hyperdrive-wiring.md` (the collapsed Wave A lanes
`hyperdrive-bindings`, `pg-client-lifecycle`, `with-identity-wrapper`,
`latency-instrumentation`) and `research/isolation-proof.md` (the collapsed
`isolation-proof` lane). Load-bearing claims cite the source section.
**Harden pass:** `03-HARDEN.md` (27 findings, dropped 0). New decisions
D76–D83; new uncertainties U59–U61. D25–D40 and U23–U32 keep their ids;
several Chosen/check cells are corrected in place.
**Cannot complete this phase:** there is no Cloudflare account and no Supabase
project. Local work against `supabase start` is the executable slice. The
staging p50 measurement is **DEFERRED**, not passed. A green local run is not
the gate. DATA-06 is not claimed passed locally, and the deployed probe
Worker — when it exists — proves the probe, not the OpenNext app (U31).

---

## What Phase 3 must produce

1. Two Hyperdrive configs bound under **both** `env.staging` and
   `env.production` in `apps/web/wrangler.jsonc`, per D3: `HYPERDRIVE_NOCACHE`
   (cache-disabled, `vamos_edge`, identity, transactions, **and billing**) and
   `HYPERDRIVE` (cacheable, `vamos_public`, public content only). Credentials
   live inside the Hyperdrive config object, never in `wrangler.jsonc` and
   never as a `wrangler secret put`. Identity and billing are never issued on
   the cached binding (D3, D39, D79).
2. Both configs pointed at Supabase's **direct** connection string
   (`db.<ref>.supabase.co:5432`), never the pooled Supavisor `:6543` string.
3. A postgres.js client constructed **per invocation**, never at module scope,
   with `max: 1` / `fetch_types: false` / `prepare: true` / `connect_timeout: 10`
   on the identity path and `max: 5` on the public path. No `idle_timeout`. No
   `sql.end()` in `apps/**` or `packages/db/src/**` (allow-list
   `packages/db/test/local` only).
4. One frozen door: `withIdentity` in `packages/db` (connection string first,
   optional test-only `client` for a reserved connection) implementing D1+D2
   in full: explicit `BEGIN`, both `set_config` calls with `is_local => true`,
   the closed `PG_ROLE` map, ROLLBACK-on-throw, and the four actor variants
   plus the quote/ledger path on the **same** NOCACHE binding (D79 / U59).
   `apps/web` call sites import `asCustomer` / `asStaff` / `asGuest` / `asAnon`
   / `asQuote` only — never `withIdentity` from `@vamos/db` (D76). A caller
   who forgets the wrapper gets SQLSTATE `42501`, never a stale row.
   `@vamos/db` is a real JS module (`exports`, `postgres` dependency,
   `transpilePackages`) or OpenNext cannot import it (D80).
5. `publicSql` on the cached binding: no identity, no transaction, branded to
   the §14d table set only (`content_strings`, `reviews`, `vehicle_classes`,
   `service_zones`, `settings_public`).
6. OpenNext wiring: `env` arrives through `getCloudflareContext()` on fetch
   / RSC; Cron and Queue handlers take `env` from the Worker argument, never
   `getCloudflareContext()`. Every file that imports an identity wrapper is a
   Route Handler or exports `dynamic = "force-dynamic"` (grep covers the
   named wrappers, `@vamos/db`, and `@/lib/db/public` with a content-page
   allow-list).
7. Placement Hints `"placement": { "region": "aws:eu-central-1" }` under both
   named environments — not Smart Placement. Placement pins **fetch only**.
   Queues/Cron are unplaced; their latency is out of DATA-05 (D31, D83).
8. Workers Analytics Engine instrumentation of every `withIdentity` call, so
   DATA-05's p50 is a real percentile over real traffic, not a single-shot
   timing. The staging measurement itself is recorded as **DEFERRED** until a
   Worker exists.
9. The DATA-06 proof, in two layers: a local connection-reuse simulator plus
   pgTAP / mutation gate that run against `supabase start` (this is the first
   executable slice); and a deployed concurrent isolation test against a
   staging-only probe Worker, **calling the shipped `withIdentity`** (D77),
   **with mutants that the suite is shown to go red against** and hazards
   that are not allowed to look green by construction (D38, D78). The
   deployed half is designed here and unrun until the account exists. A
   green local run is not DATA-06. The probe Worker — when it exists —
   proves the probe, not `/api/account/bookings` (U31 / ISOL-08).
10. CI greps that make a raw `postgres` import, a `sql.reserve()` in app
    code, a module-scope client, an identity import on a static route,
    `set_config(..., false)`, plain `SET ROLE`/`SET SESSION`, and
    `sql.unsafe(` outside the allow-listed identity/probe mutants fail the
    build — the runtime `42501` is the safety net, not the only gate.

Phase 2 must be executed before any of this connects to a real schema. No
migration exists today. **U1 is a hard gate on Phase 2 P1**, not a rewrite
Phase 3 runs after `0002` has shipped: do not merge the roles migration
until the managed grant has been run on the real project, or land
`vamos_customer` as the designed role from the first file (FC-08). If U1's
fallback fires, `PG_ROLE.customer` changes and every `TO authenticated`
policy is rewritten **in that same Phase 2 file**, with a pgTAP enumerator
that fails if `PG_ROLE.customer` and `pg_policies.roles` disagree. Phase 3
does not retarget policies after Phase 4 has copied the role name.

### Review pass — what the two harvested lanes changed

The 8-lane Wave A run collapsed into two files. They agree on D1/D2/D3, on
per-request postgres.js, on `--caching-disabled` as the cache knob, on
Placement Hints over Smart Placement, and on fail-closed `42501`. They
disagreed on four things this synthesis resolves without touching D1–D24:

| Disagreement | `hyperdrive-wiring.md` | `isolation-proof.md` | Chosen | Why |
|---|---|---|---|---|
| Where `withIdentity` lives | `apps/web/lib/db/identity.ts` | `packages/db/src/identity.ts` | **packages/db** (D28) | `packages/db/README.md` already promises the helper; a probe that imports a copy in `apps/web` proves nothing (`isolation-proof.md` §6) |
| First argument | `env: CloudflareEnv` | `connectionString: string` | **connectionString** (D28) | `packages/db` must not depend on OpenNext's `env`. Named wrappers in `apps/web` extract `env.HYPERDRIVE_NOCACHE.connectionString` and write WAE |
| Kind vs union | `withIdentity(env, kind, claims, fn)` | `withIdentity(cs, identity, run)` | **kind + claims** (D28) | Wave A asked for this signature; the four named wrappers then read as plain calls (`hyperdrive-wiring.md` §3) |
| Local port / role | `postgres://postgres:postgres@localhost:5432/postgres` is "correct" (`§1.4`) | `vamos_edge@…:54322` (`§5.1`) | **54322 + `vamos_edge` / `vamos_public`** (D34) | `02-RESEARCH.md` Lane 6 already flagged the 5432/54322 mismatch; connecting as `postgres` locally carries `BYPASSRLS` and makes the grant layer untestable |

No D1–D24 decision is reopened. Phase 2's sketch path
`apps/web/lib/db/identity.ts` was a file-location, not a decision id.

### Review pass — 8-lens harden (lenses-returned 8, Phase 3's 3)

27 findings in `03-HARDEN.md`. Applied 26, deferred 1 (ISOL-08 → Phase 5 /
U31), rejected 0, dropped 0. The synthesis was wrong on eight load-bearing
constructions; those are corrected here, not left as comments in the
harvested lanes.

| Finding cluster | Was | Now | Why |
|---|---|---|---|
| DATA-06 calls a copy of the SQL (ISOL-01) | Probe `runCorrect` and the simulator inline `set_config` | Shipped `withIdentity` only; test-only `opts.client` for `sql.reserve()` (D77) | "If it lives in `apps/web`, the probe tests a copy, and the proof is worthless" was already the isolation lane's own rule |
| Three signatures (FC-01) | Phase 2 union, wiring `{kind,claims}`, D28 `connectionString` first | One: core `withIdentity(cs, kind, claims, fn, opts?)`; apps/web named wrappers only (D76) | Phase 4 `quote-lock-expiry.md` cannot type-check against three shapes |
| NC1 is RESET-maskable (ISOL-02) | Session `SET` **outside** a transaction | `impl=session_in_txn`: `is_local=false` **inside** `BEGIN`/`COMMIT` (D78). No-txn session SET is U27's measurement, not the D1 mutant | PG 17 SET: session `SET` inside a committed txn persists; Hyperdrive RESET between queries masks the no-txn variant |
| D38 vs NC4/NC5 (ISOL-03/04/05) | "Job fails if a control passes" for NC1–NC6 as a set | **Mutants** fail the job if green; **hazards** fail if unobserved or if a leak follows a confirmed dirty origin (D38) | NC4/NC5 expected green-looking outcomes; implementing D38 as written inverts them |
| Fixtures / mode 15 (F1–F3) | `pickup_at`, `status='quoted'`, `customers.id = auth uid` | `02-SCHEMA-DRAFT`: `scheduled_at` on `booking_legs`, `status='quote'`, `customers.user_id`, policy `c.user_id = app.uid()` (D81) | Verbatim copies of `isolation-proof.md` abort on the first `supabase start` |
| Billing on cached HYPERDRIVE (FC-02) | Two doors; Phase 4 D60 loads the rate book via `HYPERDRIVE` | Third path `asQuote` on **NOCACHE** (D79). No grant of pricing tables to `vamos_public` | D3 forbids billing on the cached binding; a grant "fix" is survival path 13 |
| `@vamos/db` is not a module (FC-03) | `"main": "index.ts"`, no `exports`, no `postgres` | `exports` + `postgres` + `workspace:*` + `transpilePackages` (D80) | Every sample `from "@vamos/db/identity"` fails `next build` |
| U1 after Phase 2 ships (FC-08) | "rewrite every `TO authenticated`" in Phase 3 | Hard gate on Phase 2 P1; Phase 3 does not retarget policies | Roadmap is 2 → 3 → 4; a post-hoc rewrite leaves quote SQL on the wrong role |
| U2 conflated with U1 (ISOL-12) | Deferred to hosted project; fallback is `unsafe` + `+` concat | Four-line check runs on `supabase start` in P1; fallback is a closed-map switch, not concat | `set_config('role')` is Postgres behaviour; local Superuser is U1's question, not U2's |
| DATA-06 as product proof (ISOL-08) | Implied by the probe | Probe Worker only. Confirming run on `/api/account/bookings` is Phase 5 (U31) | Mode 14 is not SQL; the probe is not OpenNext |

---

## Lane 1 — Hyperdrive bindings (DATA-05 topology)

**Verdict:** two configs, same physical database, different login role, one
CLI flag. The connection string is not a Worker secret.

### Both `wrangler.jsonc` configs, per D3

Today `apps/web/wrangler.jsonc` has **one** Hyperdrive binding, only under
`env.production`, with a placeholder id, and `env.staging` omits it because a
placeholder UUID fails `wrangler deploy`'s validation
(`hyperdrive-wiring.md` §1.1; confirmed against the file). Phase 3 adds
`HYPERDRIVE_NOCACHE` next to `HYPERDRIVE` under **both** named environments
the moment real config ids exist. Until then the local
`localConnectionString` is what `wrangler dev` uses, and staging simply
cannot bind a fake id.

Both configs point at the **same** database on the **direct** string
(`hyperdrive-wiring.md` §1.2, citing Cloudflare's Supabase guide: *"use the
Direct connection connection string rather than the pooled connection
strings"*):

```sh
# identity-scoped: RLS, transactions, never cached
npx wrangler hyperdrive create vamos-rls-staging \
  --connection-string="postgres://vamos_edge:${VAMOS_EDGE_PW}@db.<ref>.supabase.co:5432/postgres" \
  --caching-disabled
npx wrangler hyperdrive update <RLS_CONFIG_ID> --origin-connection-limit=25

# public-content: no identity, no transaction, cacheable
npx wrangler hyperdrive create vamos-public-staging \
  --connection-string="postgres://vamos_public:${VAMOS_PUBLIC_PW}@db.<ref>.supabase.co:5432/postgres"
npx wrangler hyperdrive update <PUBLIC_CONFIG_ID> --origin-connection-limit=15
```

The **exact setting that makes one cache-disabled** is the
`--caching-disabled` flag at **create** time. There is no documented
`wrangler hyperdrive update --caching-disabled`
(`hyperdrive-wiring.md` §1.2). If a config is created with the wrong cache
mode, the runbook is delete + recreate + re-point the binding id, not a
patch. That recreate path is U23.

`--max-age=<seconds>` (default 60) is the only other cache-relevant flag and
is meaningless on a `--caching-disabled` config.

Repeat the pair for production (`vamos-rls-production` /
`vamos-public-production`) against the production project's direct string,
once a dedicated production project exists. During Phases 3–8 a single Micro
instance may back both Worker environments; size the origin pools against
that (D35).

### How the DIRECT connection string is formed and stored

Formed:

```
postgres://<login_role>:<password>@db.<project-ref>.supabase.co:5432/postgres
```

- Host is `db.<ref>.supabase.co`, **port 5432**. Never
  `aws-0-<region>.pooler.supabase.com:6543`, never port 6543 in any shape.
  Supavisor is a second pooler sitting in front of the instance; Hyperdrive
  *is* the pooler (`02-RESEARCH.md` Lane 1 operating constraints;
  `hyperdrive-wiring.md` §1.2).
- Login role is `vamos_edge` (identity config) or `vamos_public` (cached
  config). Never `postgres`, never `authenticator`. Cloudflare's own
  Supabase example that `GRANT postgres TO hyperdrive_user` is rejected by
  D2 — `postgres` owns the tables and would bypass every policy
  (`02-RESEARCH.md` Lane 1).
- Password is generated once (`openssl rand -base64 32`), passed into the
  `wrangler hyperdrive create` invocation, and used in Phase 2's
  `create role … login password :'vamos_edge_password'` psql variable. It is
  not written into a committed file.

Stored: **inside the Hyperdrive config object**, addressed only by the
opaque config `id`. Nothing in `wrangler.jsonc` carries a credential — only
`binding` and `id` (`hyperdrive-wiring.md` §1.3):

```jsonc
"hyperdrive": [
  { "binding": "HYPERDRIVE",         "id": "<public config id>" },
  { "binding": "HYPERDRIVE_NOCACHE", "id": "<rls config id>" }
]
```

`wrangler secret put` is the wrong tool for this password. Rotation is
`wrangler hyperdrive update <id> --origin-password <new>`, which applies to
new connections going forward and does not purge Hyperdrive's query cache.

At runtime `env.HYPERDRIVE_NOCACHE.connectionString` is a
Cloudflare-synthesised string that routes through the platform proxy — it is
not the raw Supabase string re-served to the Worker.

### `localConnectionString` for `wrangler dev`

`wrangler dev` bypasses Hyperdrive entirely and connects straight to
whatever `localConnectionString` says — no pooling, no caching
(`hyperdrive-wiring.md` §1.4; `isolation-proof.md` §4.1). That makes it
**useless as a DATA-06 vehicle** and the right vehicle for day-to-day
feature work against `supabase start`.

`supabase start` listens on **127.0.0.1:54322**, not 5432
(`02-RESEARCH.md` Lane 6). Connecting as the `postgres` superuser locally
carries `BYPASSRLS` and would make D2's `42501` untestable. D34 is the
**only** local connection string this phase documents. The wiring lane's
`postgres://postgres:postgres@localhost:5432/postgres` "is correct"
(`hyperdrive-wiring.md` §1.4) is **struck**: it is a pre-roles boot
placeholder, not an identity login, and an implementer who copies it
cannot test D2 (ISOL-09). After Phase 2's roles migration exists — and
in the committed wrangler `localConnectionString` the moment those roles
exist:

| Binding | `localConnectionString` |
|---|---|
| `HYPERDRIVE_NOCACHE` | `postgres://vamos_edge:<local pw>@127.0.0.1:54322/postgres` |
| `HYPERDRIVE` | `postgres://vamos_public:<local pw>@127.0.0.1:54322/postgres` |

Until Phase 2 P1 lands, P1 of this phase compiles the TypeScript against
the decided contract and mocks `sql.begin`. It does **not** commit a
superuser string for later copy-paste.

An env var named
`CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_<BINDING_NAME>` overrides the
file value — use it in CI so the committed file can keep a non-secret local
placeholder (`hyperdrive-wiring.md` §1.4).

`wrangler dev --remote` runs the Worker on Cloudflare's network against the
**real** deployed Hyperdrive config. Scope it to the staging config only:
*"database writes or side effects will affect your production data"* if
pointed at production (`hyperdrive-wiring.md` §1.4).

### Sizing the two pools

Supabase Micro (the default Pro-plan compute, the tier this project is on
per `HANDOFF-CLAUDE-CODE.md` §3) allows **60 direct connections**.
`origin-connection-limit=25` (RLS) + `15` (public) = 40 of 60, leaving 20
for Studio, `db push`, pgTAP, and a second Worker environment sharing the
instance (`hyperdrive-wiring.md` §1.5). Confirm `show max_connections;` on
the provisioned project before treating 40 as safe — Realtime, PostgREST and
Auth also hold direct connections. That confirmation is U32.

The isolation-probe Worker uses a **dedicated** cache-disabled config on the
same `vamos_edge` credentials, capped at the documented Hyperdrive minimum
of **5** origin connections, so 64-way concurrency makes backend reuse a
pigeonhole certainty (`isolation-proof.md` §5.1). That config is
staging-only. Pin the probe vs app Hyperdrive **ids** in a checked-in
allowlist test so the probe's 5-origin config cannot be bound as
`apps/web` `HYPERDRIVE_NOCACHE` (FC-09). Size the 25+15 split with
unplaced Cron/Queue sweeps in mind (U32, D83) — 25 is a fetch-shaped
budget until those jobs exist, not a promise that a 03:00 no-show sweep
fits.

`HYPERDRIVE` (`vamos_public`) is public content only. Rate book,
coupons, snapshots, bookings, customers — anything identity or billing
— goes through `HYPERDRIVE_NOCACHE` (D3, D79). Phase 4 D60's "load the
rate book via `HYPERDRIVE`" is a named contradiction of D3 and is
refused here. Do not grant `rate_versions` / `distance_rates` /
`fixed_routes` / `surcharges` / `coupons` / `price_snapshots` to
`vamos_public` to make D60 look like D39.

---

## Lane 2 — postgres.js client lifecycle

**Verdict:** construct inside the handler, every time. Module scope is a
hard runtime error that is silent on the first request.

### Construction

Cloudflare's own reference (`hyperdrive-wiring.md` §2.1):

```ts
const sql = postgres(env.HYPERDRIVE.connectionString, {
  max: 5,
  fetch_types: false,
  prepare: true,
});
```

The identity path overrides `max` to **1**: `withIdentity` opens exactly one
transaction per call, a pool > 1 buys nothing, and it multiplies origin
connections against the 25-budget (`hyperdrive-wiring.md` §2.1, extending
`rls-hyperdrive.md`'s `client()`). Keep `max: 5` only on `publicSql()`,
where several independent cacheable reads inside one invocation can run
concurrently.

### Module scope vs per-invocation

Constructing `postgres(...)` at module scope is incompatible with the
Workers runtime. OpenNext's troubleshooting page documents the exact
symptom: *"Cannot perform I/O on behalf of a different request"* on the
**second** request, not the first, because the isolate reuses the module
but the runtime has already torn down the first request's I/O context
(`hyperdrive-wiring.md` §2.1). A smoke test that only cold-starts (a single
Playwright run against a fresh preview) will not catch it. The DATA-06
deployed run against a warm Worker doubles as the regression test for this.

### Options

| Option | Identity path | Public path | Why |
|---|---|---|---|
| `max` | `1` | `5` | One transaction per request vs concurrent cacheable reads. Cloudflare's generic ceiling is 5 ("Workers' limits") |
| `prepare` | `true` | `true` | `prepare: false` "makes queries uncacheable" — it disables Hyperdrive's query-plan cache, not just the client-side prepare. Keep true; plan-cache invalidation on role change makes it safe for RLS (`02-RESEARCH.md` Lane 1; `isolation-proof.md` §2 mode 6) |
| `fetch_types` | `false` | `false` | Must be off. A per-request client that is never reused would otherwise pay a `pg_catalog` round trip on every construction (`hyperdrive-wiring.md` §2.2) |
| `connect_timeout` | `10` (seconds) | `10` | Slightly under Hyperdrive's own 15 s initial-connection ceiling, so a stuck origin fails our error path first. Not load-bearing |
| `idle_timeout` | **do not set** | **do not set** | Governs when postgres.js closes an idle pooled connection *it* is holding. A per-request client has no idle period. Setting it implies a lifecycle that does not exist here |
| `sql.end()` | **do not call** in `apps/**` or `packages/db/src/**` | same | *"Workers-to-Hyperdrive connections are automatically cleaned up when the request or invocation ends"* (`hyperdrive-wiring.md` §2.2). This **corrects** `.planning/research/STACK.md:138`, which still recommends `ctx.waitUntil(client.end())`. The correction is not real until P3 edits that line (FC-06). Allow-list `packages/db/test/local` only — the isolation simulator's `finally { await sql.end() }` is Node test process teardown of a reserved conn, not a Worker lifecycle |

### What breaks under `@opennextjs/cloudflare` specifically

**`env` is not ambient.** Route handlers and Server Components do not receive
`env` as a `fetch(request, env, ctx)` argument. OpenNext's answer is
`getCloudflareContext()` (`hyperdrive-wiring.md` §2.3a):

```ts
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { asCustomer } from "@/lib/db/identity";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { env } = getCloudflareContext();
  const claims = await requireCustomer(request, env);
  // Trip time lives on booking_legs.scheduled_at (D11). bookings has no
  // pickup_at — that GSD-LAUNCH column is rejected. Order the commercial
  // record by created_at; join legs when the list must be "soonest pickup".
  const bookings = await asCustomer(env, claims, (tx) =>
    tx`select reference, status from public.bookings order by created_at desc`
  );
  return Response.json(bookings);
}
```

Types come from `npx wrangler types --env-interface CloudflareEnv`.
That generated file is the **single** source for `CloudflareEnv` (FC-07):
replace the hand `apps/web/lib/env.d.ts` Hyperdrive member with required
`HYPERDRIVE` **and** `HYPERDRIVE_NOCACHE` (and `DB_LATENCY`). CI: `git
diff --exit-code` on generated types plus a check that `CloudflareEnv`
names both bindings. A handler that compiles against today's optional
`HYPERDRIVE?: Hyperdrive` will read `env.HYPERDRIVE.connectionString` for
identity and coupons — the FC-02 footgun.

**Cron / Queue handlers do not have `getCloudflareContext()`.**
`apps/web/worker.ts` currently stubs `scheduled(controller, _env, _ctx)`
and `queue(batch, _env, _ctx)` as no-ops that drop `env`. Phase 7 Stripe
fan-out and Phase 9 LIFE-05 / no-show copy that stub and get an empty
binding. P3 replaces `_env` with `env: CloudflareEnv` and documents:

```ts
export async function scheduled(
  controller: ScheduledController,
  env: CloudflareEnv,
  ctx: ExecutionContext,
) {
  // Placement Hints do not apply to scheduled/queue (D31, D83).
  // New client, new BEGIN. Never getCloudflareContext(). Never waitUntil(sql.end()).
  ctx.waitUntil(asStaff(env, staffClaims, (tx) => tx`select …`));
}
```

If post-response work is required from a fetch handler:
`ctx.waitUntil(asCustomer(env, claims, fn))` — new client, new BEGIN,
never a captured `tx` (ISOL-04).

**Build-time trap.** `getCloudflareContext()` during `next build`'s static
generation returns **local/dev** binding values, because there is no request
to attach a Worker context to (`hyperdrive-wiring.md` §2.3b). The identity
path is structurally safe if it is only ever reached from dynamic Route
Handlers and from Server Components that opt out of static rendering (every
RLS-gated page must, because it needs a live cookie/JWT). Concrete rule:
**any file that imports `withIdentity` / `asCustomer` / `asStaff` /
`asGuest` / `asAnon` / `asQuote` must also export
`export const dynamic = "force-dynamic"`** (or be a Route Handler that
reads `request`). `publicSql` on a known static content page is the one
cached path that *should* be static — the grep must tell them apart
(FC-11). CI grep:

```bash
# Identity wrappers, core helper, and any re-export. Allow-list route.ts
# (dynamic by default) and a named list of publicSql content pages.
grep -rlE "from ['\"]@/lib/db/identity['\"]|from ['\"]@vamos/db" \
  apps/web --include="*.tsx" --include="*.ts" \
  | xargs grep -L "force-dynamic" && echo "FAIL: identity import in a non-dynamic route"

# P3 session-SET / reserve / unsafe fence (rls-hyperdrive.md §5 P3).
# Allow-list packages/db/src/identity.ts for set_config(..., true) only,
# and the probe's deliberate mutants.
grep -rE "set_config\([^)]*,\s*false\s*\)|\bsql\.unsafe\(|\breserve\(|SET\s+(?!LOCAL)(ROLE|SESSION)" \
  packages/db apps/web --include="*.ts" --include="*.tsx"
```

A lib file under `apps/web/lib/**` that imports the identity wrappers
forces `force-dynamic` on every importer — treat that as a fail unless
each importer is allow-listed. U24 is whether `getCloudflareContext()`'s
"async mode" changes anything — smoke-test one RLS-gated route through
`opennextjs-cloudflare build && preview`, not only `next dev`.

**Node.js runtime, never `export const runtime = 'edge'`.** Already a Phase 2
constraint (`02-RESEARCH.md` Lane 3). postgres.js needs `nodejs_compat`.
`compatibility_date >= 2024-09-23` remains required.

**`sql.reserve()` is banned in application code** and required in the local
simulator (`isolation-proof.md` §2 mode 12, §4.2). Reserving recreates
session-scoped semantics. CI grep on `apps/**`; allow-list
`packages/db/test/local`. The simulator passes the reserved client **into
the shipped `withIdentity`** (D77); it does not inline `set_config`.

**`fn` may not return `TransactionSql`.** Returning `tx` (or anything
closing over it) is a lint error, not a comment (ISOL-07). ESLint
`no-restricted-syntax` on `ReturnStatement` of `tx`; TypeScript: `fn`
returns `Promise<T>` where `T` does not extend `TransactionSql`. Local
NC: begin, bind, `.execute()` a SELECT without await, commit, then a
second identity on the reserved conn — the suite must go red if that
SELECT can still run as A.

---

## Lane 3 — `withIdentity` (D1 + D2, four actors)

**Verdict:** one function in `packages/db`, four named wrappers in
`apps/web`, closed `PG_ROLE` map, explicit transaction, fail closed.

### Location and signature (D28)

Phase 2's sketch put the file at `apps/web/lib/db/identity.ts`. The isolation
lane moved it to `packages/db/src/identity.ts` so the probe Worker and the
app import **the same function**. If it lives in `apps/web`, the probe tests
a copy and the proof is worthless (`isolation-proof.md` §6). `packages/db`
must not take `CloudflareEnv`.

**One frozen signature** (D76). Three incompatible shapes were in force at
once (Phase 2 `withIdentity(env, identity, run)` union object; wiring
lane `withIdentity(env, { kind, claims }, fn)`; D28 core
`withIdentity(connectionString, kind, claims, fn)`). Phase 4
`quote-lock-expiry.md` still does `withIdentity(env, identity, tx => …)`
and reads `identity.customerId`. Against D28 that is a type error. Freeze
before P1 lands:

```ts
withIdentity<K extends IdentityKind, T>(
  connectionString: string,
  kind: K,
  claims: ClaimsFor<K>,
  fn: (tx: postgres.TransactionSql) => Promise<T>,
  opts?: { probe?: boolean; client?: postgres.Sql },
): Promise<T>
```

- Core lives in `packages/db`. First argument is a connection string.
  `packages/db` must not depend on OpenNext `env`.
- `apps/web` call sites import **named wrappers only**:
  `asCustomer(env, claims, fn)` / `asStaff` / `asGuest(env, manageTokenHashHex, fn)`
  / `asAnon(env, fn)` / `asQuote(env, fn)`. CI fails
  `from ['"]@vamos/db` (or `@vamos/db/identity`) under `apps/web/app` and
  `apps/web/lib` except the wrapper file itself (D76).
- `VamosClaims.sub` is `auth.users.id`. `customers.id` is a **join**, not a
  bound field: `customer_id in (select c.id from public.customers c where
  c.user_id = (select app.uid()))`. Do not add `customerId` onto the GUC.
  Phase 4 quote-lock-expiry must join, not invent a wrapper field.
- Strike the Phase 2 union and `hyperdrive-wiring.md` §2.3a samples; this
  document is the call-site source.
- `opts.client` is **test-only** (D77): the local simulator passes a
  `sql.reserve()`d client so the shipped function runs on a pinned
  backend. Production omits it and constructs per-invocation. Probe
  `impl=correct` calls this function with `opts.probe`. There is no
  `runCorrect` inlined SQL.
- `opts.probe` is behind a compile-time guard (`import.meta` /
  `DEPLOY_ENV === "staging"` / `VAMOS_ISOLATION_PROBE === "1"`), not a
  caller flag that a production import of `@vamos/db` can set (FC-09,
  D82). Production sequential-await is the shape the probe proves; the
  residue statements are sequential `await` inside the same function, not
  a pipelined array copy.

Named wrappers in `apps/web/lib/db/identity.ts` extract
`env.HYPERDRIVE_NOCACHE.connectionString`, call through, and write the
WAE data point (Lane 5). Call sites in the app never see
`connectionString`.

### Closed `PG_ROLE` map

```ts
const PG_ROLE = {
  anon: "anon",
  customer: "authenticated",
  staff: "vamos_staff",
  guest: "vamos_guest",
} as const satisfies Record<IdentityKind, string>;
```

The map is keyed by **our** discriminant, decided by server logic after
token verification, never by a token field. A JWT whose payload claims
`role: "vamos_staff"` cannot reach this map (`hyperdrive-wiring.md` §3;
`isolation-proof.md` §6). `user_metadata` is stripped in `claimsForSql`
rather than trusted not to be read — it is user-writable via the client SDK
(D4).

If U1's fallback fires (`vamos_customer` instead of `authenticated`),
`PG_ROLE.customer` becomes `"vamos_customer"` and every `TO authenticated`
in the RLS migration is rewritten **in Phase 2's roles file**, not here.
Nothing else in this wrapper moves (`isolation-proof.md` §15 U-I5).
Phase 3 does not search-replace policies after `0002` has merged
(FC-08). A pgTAP enumerator, owned by Phase 2 and re-run in Phase 3 P5,
fails if `PG_ROLE.customer` and `pg_policies.roles` disagree.

### Behaviour on throw

`sql.begin()` issues `ROLLBACK` if anything in the callback throws, then
rethrows the original error unmodified (`hyperdrive-wiring.md` §3;
`isolation-proof.md` §2 mode 3, citing postgres.js: *"if anything fails
`ROLLBACK` will be called so the connection can be released"*). `SET LOCAL`
reverts on ROLLBACK too (PG 17 SET). Callers branch on
`err instanceof postgres.PostgresError && err.code === '…'`, never on
message text. `42501` is insufficient_privilege (forgotten wrapper or
lost BEGIN); `23505` is unique_violation (booking reference); `23P01` is
exclusion_violation (Phase 8).

`fn` must return **data**. Returning `tx` (or anything closing over it) is a
lint error (ESLint `no-restricted-syntax` + a type that excludes
`TransactionSql`): a query executed on `tx` after COMMIT is failure mode
#9 (`isolation-proof.md` §6; ISOL-07).

Do not call `sql.end()` in `apps/**` or `packages/db/src/**`.

### The four actor variants

| Wrapper | `kind` | `set_config('role', …)` | Second GUC | Claims required |
|---|---|---|---|---|
| `asAnon` | `"anon"` | `anon` | none | none |
| `asCustomer` | `"customer"` | `authenticated` | `request.jwt.claims` (stripped JSON) | `VamosClaims` (`sub` = `auth.users.id`) |
| `asStaff` | `"staff"` | `vamos_staff` | `request.jwt.claims` (stripped JSON) | `VamosClaims` (`aal` must be `aal2` for ops policies; the wrapper still binds whatever the verified token carries — SQL refuses aal1) |
| `asGuest` | `"guest"` | `vamos_guest` | `request.vamos.manage_token_hash` | `{ manageTokenHashHex }` hashed in the Worker **before** it reaches SQL (D14) |
| `asQuote` | `"quote"` (U59) | see D79 | none on the book-load path; customer/anon GUC bound when executing a definer RPC on behalf of a caller | none / caller claims |

`kind === "anon"`: no claim to set; RLS policies for `anon` see an empty
`app.jwt()` and rely on grants alone — `anon` has none on any customer/ops
table (`hyperdrive-wiring.md` §3). Public content does **not** go through
`asAnon`; it goes through `publicSql` on the other binding, because `anon`
still opens a transaction and would be uncacheable.

Guest mutations do not use this wrapper's `fn` for the write itself: D15
puts mutations in `SECURITY DEFINER` RPCs executed *inside* `asGuest`, so
the GUC is bound and `EXECUTE` is granted only to `vamos_guest`. Reads stay
in RLS.

**Quote / ledger path (D79).** Phase 4 `/api/quote` and `/api/checkout/intent`
cannot use `publicSql` (no grant on `rate_versions` / `coupons` /
`price_snapshots` — §14c) and must not gain that grant (that would put
billing on a 60 s cache, which D3 forbade). They also cannot raw-INSERT
`bookings` as `asAnon` (no grant; `asGuest` cannot run until D14 mints a
manage token **after** the row exists). Third named path, same
`HYPERDRIVE_NOCACHE` binding, never a third Hyperdrive config:

- **Preferred:** `SECURITY DEFINER` RPCs (`evaluate_coupon`, snapshot
  insert, `app.checkout_intent(...)`) executed **inside**
  `asAnon`/`asCustomer` so the GUC is bound and `EXECUTE` is granted.
  Guest checkout's writer is Phase 7's to land (FC-04 inherit); Phase 3
  documents the door so quote-lock-expiry does not ship `anon` as a table
  writer.
- **Fallback (U59):** a closed `vamos_quote` nologin role SET via a fifth
  `IdentityKind`, holding SELECT on frozen rate-book tables and INSERT on
  snapshots, never granted to `vamos_public`. Adding a role is a named
  addition to Phase 2's set, not a silent one.

Do **not** grant pricing tables to `vamos_public` to make Phase 4 D60 look
like D39. D60 is a named contradiction of D3 and is refused.

`asQuote` is untested under the pool until a sibling DATA-06 run (or P4
staff/quote pair) exists; residue SQL must still assert the quote role
reverts to `vamos_edge`.

### What a forgotten wrapper gets

A route that reaches for `postgres` directly against
`env.HYPERDRIVE_NOCACHE.connectionString` and runs
`select * from public.bookings` throws `PostgresError` with
`.code === "42501"`. `vamos_edge` holds no `SELECT` grant on any public
table until `set_config('role', …)` drops it into an application role
(`hyperdrive-wiring.md` §3.1; `isolation-proof.md` §9 NC3). It is a 500, not
stale or cross-tenant data. If this ever returns a number, D2 is void and
the phase stops.

`postgres` is importable only from `packages/db/src/identity.ts` and
`packages/db/src/public.ts` (and the staging-only probe). The ESLint
`no-restricted-imports` / CI grep from `rls-hyperdrive.md` §5 P3 is the
compile-time half of this claim; `42501` is the runtime half.

U2 is **Postgres behaviour**, testable on `supabase start`. It is not U1
(managed `GRANT … INHERIT FALSE`). The four-line check runs in P1 against
local PG (`02-RESEARCH.md` U2, exact check unchanged):

```sql
begin; select set_config('role','authenticated',true); select current_user; commit; select current_user;
```

Expect `authenticated` then `vamos_edge`. Do not leave `unsafe` + `+`
concat in the source "unused until staging" (ISOL-12): that is the only
string-concatenated SQL in the identity path, the option D1 rejected as
"no bind parameters." If the check fails, ship `SET LOCAL ROLE` via a
**closed-map switch**, not `+`:

```ts
const ROLE_SQL = {
  authenticated: "select set_config('role', 'authenticated', true)",
  anon: "select set_config('role', 'anon', true)",
  vamos_staff: "select set_config('role', 'vamos_staff', true)",
  vamos_guest: "select set_config('role', 'vamos_guest', true)",
} as const;
const stmt = ROLE_SQL[PG_ROLE[kind]];
await tx.unsafe(stmt);
```

If U2 requires a literal `SET LOCAL ROLE` (no `set_config`), the map
values become `'set local role authenticated'` etc. — still a closed
object, never `+ PG_ROLE[kind]`. A2 (`userBound === 'authenticated'`)
must run in the local simulator **against the shipped function**
(ISOL-01), not only on the deployed probe. U2 stays **open** until the
check has been run; the fallback shape is decided now.

---

## Lane 4 — Isolation proof (DATA-06)

**Verdict:** two concurrent correct-looking responses prove nothing unless
the two requests shared a physical backend. The proof is coverage (`S`) + a
residue probe + negative controls that must go red. Most of the mechanism
is Postgres-side and runs on a laptop. The Hyperdrive half is designed here
and **unrun**.

### What is being excluded

Hyperdrive is a transaction-mode pooler with a single global Endpoint next
to the origin (`isolation-proof.md` §1). Outside a transaction the
connection is released between every query, so a session-scoped `SET` is
not merely unsafe — it is *non-functional*. Inside a transaction one
backend is held for its duration, and `SET LOCAL` is reverted by Postgres
at COMMIT or ROLLBACK.

The failure excluded: **request-scoped identity state surviving on a backend
into the next transaction Hyperdrive assigns to that backend.**

### Every survival path

From `isolation-proof.md` §2. Modes marked "test-only" are why this phase
exists; the others are structurally closed by D1/D2.

| # | Path | Structurally prevented by D1/D2? | Caught only by a test? |
|---|---|---|---|
| 1 | Plain `SET` / `set_config(k, v, false)` **inside `BEGIN`/`COMMIT`** | **No.** D1 mandates `is_local => true` but nothing stops a developer writing `false`. PG 17 SET: once the surrounding transaction is committed, the effects persist until the end of the session. Grants (D2) catch the forgotten-wrapper case, not this one | **Yes** — NC1 (`impl=session_in_txn`) plus the CI grep plus a local `withIdentity` `is_local=false` mutant. Session SET *with no transaction* is U27, not this mutant (ISOL-02) |
| 2 | Transaction left open by early `return` before `withIdentity` settles | Partly: the isolate's I/O is torn down at request end without `waitUntil`, closing the client→Hyperdrive socket. What Endpoint then does with the origin connection is undocumented | **Yes** — NC4 (`impl=abandon`), which must `waitUntil` the open txn so BEGIN reaches the origin, then abort. U28 |
| 3 | Throw inside the transaction callback | **Yes.** postgres.js ROLLBACK; `SET LOCAL` reverts on ROLLBACK | No — provided the shipped function is the one that runs (D77) |
| 4 | A `BEGIN` that never happens (`sql` used instead of `tx`) | **Yes, doubly.** `SET LOCAL` outside a transaction "emits a warning and otherwise has no effect"; then `vamos_edge`'s zero grants raise `42501` | Confirmed by deployed NC2 (`impl=nobegin`) and a **Vitest autocommit** no-BEGIN file. pgTAP cannot do this (it runs inside a transaction; the savepoint body is mode 3, not mode 4 — ISOL-10). Drop the local pgTAP claim |
| 5 | Connection returned mid-transaction (abort, 30 s `waitUntil` ceiling, isolate kill, 60 s query ceiling) | Partly. Docs say "the connection is `RESET`"; `RESET ALL` is not `DISCARD ALL` and cannot run inside a failed transaction block | **Yes** — NC4. U28 |
| 6 | Prepared-statement plan reuse carrying another role's RLS rewrite | **Yes.** Hyperdrive re-prepends `Parse` per connection; `plancache.c` invalidates on `rewriteRoleId != GetUserId()`. Keep `prepare: true` | No — assert `prepare` is not disabled. Simulator reuse on a reserved conn is accidental coverage unless it calls `withIdentity` |
| 7 | postgres.js pipelining reordering `set_config` after the read | **Yes, if the array is inside one `BEGIN`.** Production `withIdentity` is sequential `await`; the probe must not prove a different shape (ISOL-01) | No |
| 8 | A pipelined batch *outside* a transaction | No — same class as no-txn session SET | **Yes** — U27 companion (`impl=session`), not NC1 |
| 9 | Unawaited query promise resolving after COMMIT on `tx` | Partly: queries execute when awaited. A dropped `.execute()` is not covered by a comment | **Yes** — typed wrapper + ESLint + local NC (ISOL-07) |
| 10 | `ctx.waitUntil` work after the response on a **captured `tx`** created during the request | No. The request context stays alive up to 30 s, so a captured `tx` is still usable | **Yes** — NC5 must SELECT on that same `tx` after the response and go **red**. A second test may assert the fenced pattern (new `withIdentity` inside waitUntil) is clean — that is a positive test, not NC5 (ISOL-04) |
| 11 | Client cached in module scope | **Yes.** Hard runtime error (`Cannot perform I/O on behalf of a different request`) | No — still regression-tested by the warm-Worker run |
| 12 | `sql.reserve()` pinning a connection across non-transactional queries | No — reserving recreates session-scoped semantics | **Yes**; banned in `apps/**`; **required** in the local simulator, which feeds the reserved client to shipped `withIdentity` |
| 13 | Identity **or billing** query issued on the cached `HYPERDRIVE` binding | **Yes.** `vamos_public` has no grant on `bookings` / pricing tables → `42501`. Belt: identity queries are in transactions, and `cacheStatus` enumerates `transaction` as non-cached | NC6 + branded `publicSql` allowlist (FC-05) + `cacheStatus` never `hit`. NC6 cannot populate Hyperdrive's query cache even if grants were wrong (it uses a transaction); the allowlist is the compile-time half |
| 14 | Next.js / React memoisation of a result set across requests in the same isolate | **No.** Not a Postgres leak | **Yes.** Phase 5 obligation (U31): re-point the harness at `/api/account/bookings`. Phase 3 P5 already greps `unstable_cache`, `React.cache`, `'use cache'`, and any module-scope collection — not a name regex. Until that confirming run, DATA-06 is proven for the **probe Worker only** (ISOL-08) |
| 15 | Claim for A satisfying a policy written for B | **Yes.** `02-SCHEMA-DRAFT.md` §14a: `customer_id in (select c.id from public.customers c where c.user_id = (select app.uid()))` plus the RESTRICTIVE `bookings_require_identity` policy. `app.uid()` returns JWT `sub` (`auth.users.id`), **not** `customers.id` | pgTAP cross-claim matrix + mutant M2 (weaken `user_id = app.uid()`, not `customer_id = app.uid()`) |

Modes **1, 2, 5, 8, 9, 10, 12, 14** are test-only. A control that can pass
while the bug is present is a blocker; NC1/NC4/NC5 as previously designed
could. The constructions below replace them.

### The residue probe and the adjacency set

The first statement inside `BEGIN` is the only place that can observe
residue (`isolation-proof.md` §3):

```sql
select current_user                                                  as user_at_entry,
       coalesce(nullif(current_setting('request.jwt.claims', true), ''), 'EMPTY')
                                                                     as claims_at_entry,
       coalesce(nullif(current_setting('request.vamos.manage_token_hash', true), ''), 'EMPTY')
                                                                     as guest_at_entry,
       pg_backend_pid()                                              as pid,
       clock_timestamp()                                             as t0;
```

- `user_at_entry` must be `vamos_edge` on 100 % of probes.
- `claims_at_entry` must be `'EMPTY'` on 100 % of probes.
- `guest_at_entry` must be `'EMPTY'` on 100 % of probes. Guest identity is
  `request.vamos.manage_token_hash` (D14/D15, `asGuest`). A surviving
  guest GUC reports `claims_at_entry === 'EMPTY'` and
  `user_at_entry === 'vamos_edge'` — A3/A4 would pass without this
  column (ISOL-06).
- `pid` is the coverage instrument: two probes reporting the same `pid`
  demonstrably ran on the same physical connection. `pg_backend_pid()` is
  not cacheable by Hyperdrive.
- `t0`/`t1` come from the **database server's** clock.

The assertion is not "no probe saw residue". It is:

> For every pair of probes *(p, q)* such that `p.pid === q.pid`, `q.t0 > p.t1`,
> no other probe on that pid falls between them, and `p.customer !== q.customer`
> — assert `q.user_at_entry === 'vamos_edge'` and `q.claims_at_entry === 'EMPTY'`
> and `q.guest_at_entry === 'EMPTY'` and `q.rows` contains exactly
> `q.customer`'s references.

That set of pairs is the **adjacency set**, size `S`. `S` is the real sample
size. `N` (number of requests) is not. A run whose `S` falls below the floor
reports **INCONCLUSIVE and fails**. A run that only asserts "correct rows
returned" is theatre (`isolation-proof.md` §0, §8).

### Two real identities, genuine concurrency, iteration count

**Identities.** Real Supabase Auth users, real access tokens, verified by
the same `verifyAccessToken` the app uses. Nothing is faked — a hand-minted
JWT would be rejected (HS256 refused, issuer and audience checked)
(`isolation-proof.md` §7.2). Seeded with `email_confirm: true` via the Admin
API, password-grant minted **once per run** (Auth is rate-limited 1800/hour,
bursts of 30 — signing in per request would throttle the harness before the
pool saturates). Each customer owns ≥ 3 bookings with disjoint
`VT-YY-####` references. **No amounts.** There is no live
`rate_versions` row with `status='live'` (D9 — there is no
`pricing_live` boolean to flip, in probe env or fixtures). Every price
column is NULL; every surface renders `CHF 000`. Never seed a price
(`isolation-proof.md` §7.2; F4).

Fixture SQL must match `02-SCHEMA-DRAFT.md` (F2, D81). Do **not** land
`isolation-proof.md` §7.2 / §10 verbatim:

```sql
-- customers.id is NOT auth.users.id. user_id is the FK. full_name is NOT NULL.
insert into public.customers (user_id, full_name, email)
values (${authUserId}, ${fullName}, ${email});

-- booking_status has 'quote', not 'quoted'.
-- contact_name / contact_email are NOT NULL. customer_id = customers.id.
insert into public.bookings (reference, customer_id, status, contact_name, contact_email)
values (public.next_booking_reference(), ${customerRow.id}, 'quote', ${fullName}, ${email});
```

JWT `sub` in a cross-claim is the **auth user**, not `bookings.customer_id`.
Do not insert legs unless the test needs them; trip time, when needed, is
`booking_legs.scheduled_at` (D11), never `bookings.pickup_at` (F1).

Teardown must not `DELETE FROM public.bookings` (D19: trigger +
`REVOKE DELETE` + RLS-with-no-policy + `FORCE RLS`; `afterAll` will
throw or no-op). Unique email per run; A1 asserts
`expect(refs).toEqual(expect.arrayContaining(mine.references))` **and**
`not.toEqual(expect.arrayContaining(other.references))` (ISOL-11).

Two customers remain the primary DATA-06 pair. **Also** a guest-pair and
a staff-pair (or a sibling gate in P2/P4): residue must see the
manage-token GUC empty, and Phase 8 `asStaff` / Phase 9 `asGuest` inherit
a path that has been in `S` (FC-04, U61). Guest checkout's table writer
is Phase 7 (`SECURITY DEFINER` `app.checkout_intent(...)` inside
`asAnon`/`asCustomer`, not a raw INSERT).

The fixture refuses to run unless `SUPABASE_URL` contains
`SUPABASE_STAGING_REF`.

**Concurrency.** Node's `fetch` is undici over HTTP/1.1 with no pipelining,
so one socket = one in-flight request. Pin the socket count with
`setGlobalDispatcher(new Agent({ connections, pipelining: 0 }))` and
**measure** `peakInFlight`. A serialised run is caught, not hoped against
(`isolation-proof.md` §7.3). Strict A/B alternation. The harness refuses a
`localhost` / `127.0.0.1` base URL — local does not exercise Hyperdrive
pooling.

**Iterations, as coverage not faith** (`isolation-proof.md` §8):

| Where | `N` | concurrency | pool | `S` floor |
|---|---|---|---|---|
| PR smoke (after staging deploy) | 400 | 32 | 5 | 200 |
| Nightly / phase gate | 2 000 | 64 | 5 | 1 000 |
| Confirming run at real pool size | 2 000 | 64 | app config (25) | 200 |
| Pre-launch, Phase 11 | 20 000 | 64 | 5 | 10 000 |

With origin pool 5 and 64-way concurrency, after the first 5 probes every
subsequent probe lands on a backend that just served someone else.
`E[S] ≈ (N − L) · 0.5`, so `N = 2000, L = 5` yields `S ≈ 1000`. Zero
failures in `S` adjacency events bounds a random residual leak at
`p ≤ 3/S` with 95 % confidence (rule of three). **A deterministic bug is
caught at `S = 1`; no `S` makes a systematically-safe design safer.** The
assurance is D1, D2, and the negative controls. Do not let a large `N` in a
CI log be read as security evidence.

### The local half — first executable slice

`wrangler dev` with `localConnectionString` does not pool.
`@cloudflare/vitest-pool-workers` runs on Miniflare; remote Hyperdrive
bindings are "currently unsupported" (`isolation-proof.md` §4.1). Everything
local is a Postgres-side proof, and that is most of the mechanism:

| Provable locally against `supabase start` | How |
|---|---|
| Fail-closed grants (`42501` with no wrapper) | pgTAP `fail_closed.test.sql` |
| Lost `BEGIN` fails closed | **Vitest against `vamos_edge`, one statement at a time, autocommit** (`packages/db/test/local/no-begin.test.ts`). Not pgTAP: pgTAP runs inside a transaction, and the savepoint body in `set_local_without_begin.test.sql` is mode 3, not mode 4 (ISOL-10). Keep that file only as a ROLLBACK-reverts assertion, not as the no-BEGIN claim |
| Claim for A never satisfies policy for B | pgTAP `cross_claim.test.sql` against the §14a predicate (`c.user_id = app.uid()`) |
| Residue on a genuinely re-used connection | Connection-reuse simulator (`sql.reserve()` **passed into shipped `withIdentity`**, D77) — *deterministically stronger than the Hyperdrive test* |
| Session `SET` / `is_local=false` **inside** `BEGIN`/`COMMIT` survives on a pinned conn | Local NC on the reserved conn (the red Hyperdrive NC1 may never show if RESET works — ISOL-02, ISOL-11) |
| U2 `set_config('role')` ≡ `SET LOCAL ROLE` | Four-line check in P1 (local PG). A2 against the shipped function |
| Migration mutants (grant layer removed, policy predicate weakened, `is_local=false` in `withIdentity`) | `packages/db/scripts/mutation-gate.mjs` — the suite **must** go red |

The simulator pins **one** physical backend and replays A then B then a
bare probe **through shipped `withIdentity`**, passing the reserved
client as `opts.client`. Because the connection is pinned, a residue bug
fails 100 % of the time — on Hyperdrive it would fail only when the pool
happened to reuse. A second pass on the same reserved conn issues
`set_config(..., false)` inside `BEGIN`/`COMMIT` (or a `withIdentity`
mutant with `is_local=false`) and asserts the next entry probe sees
residue — the one place local can catch ISOL-02 at 100 %. This test is
banned in application code and mandatory here. **It should exist before
Phase 3 opens**, alongside Phase 2's pgTAP suite. It needs neither
Cloudflare nor a hosted Supabase project. It does not call `sql.end()`
except in the Node process `finally` of the test file.

Playwright is the wrong runner: `pnpm test:visual` is four viewport
projects, which would quadruple the database load and make `N`
structurally ambiguous (`isolation-proof.md` §7.1). Use Vitest, `node`
environment, `*.test.ts` in `packages/db`, `pool: "forks"`,
`fileParallelism: false`.

### The deployed half — staging-only probe Worker

Do **not** put probe routes in `apps/web`. A route that must 404 in
production is one forgotten env var away from being an unauthenticated
`SELECT` on `bookings`, and staging is not behind Cloudflare Access
(`isolation-proof.md` §5). Instead: `apps/isolation-probe` — its own
Worker, deployed only to staging, importing the identical `withIdentity`
from `@vamos/db`. Production physically cannot contain it: no production
environment in its `wrangler.jsonc`, no job in `deploy-production.yml`.
Further gates: constant-time `PROBE_SECRET` header (opaque 404 otherwise);
closed `impl` union; no caller-supplied SQL; production `grep` for the
package name; `wrangler secret list` confirms `PROBE_SECRET` is absent from
the production Worker.

Hyperdrive configs are account-level and shared, so the probe and the app
draw from the same origin pool when the confirming run points
`HYPERDRIVE_APP` at the app's real config. The dedicated 5-connection
config is what makes the pigeonhole run a certainty.

The honest gap: the probe does not exercise Next.js/OpenNext's request
lifecycle. **Phase 5 obligation (U31):** once `/api/account/bookings`
exists, re-point the harness at it for one confirming run. Until then
the phase summary must say DATA-06 is proven for the **probe Worker
only**. Do not record DATA-06 as proven for the product on a local run
or on the deployed probe gate. Phase 3 P5 still lands the isolate-memo
grep (`unstable_cache`, `React.cache`, `'use cache'`, any module-scope
collection) so Phase 5 does not invent it under time pressure (FC-11).

`impl` is a closed union:
`correct | session_in_txn | session | nobegin | nowrapper | waituntil_captured | waituntil_fenced | abandon | cached`.

`impl=correct` **calls shipped `withIdentity(..., { probe: true })`**.
Delete `runCorrect`'s inlined SQL (ISOL-01). Production sequential-await
is the shape under test.

Production-hard (D82): `opts.probe` is compile-time-stripped unless the
probe build defines `VAMOS_ISOLATION_PROBE`. Add the three
`isolation-proof.md` §13 steps to the **real**
`.github/workflows/deploy-production.yml` in P4 (`test ! -d
apps/isolation-probe/dist`, grep `isolation-probe` in `apps/web` **and**
`packages/db`, `wrangler secret list` has no `PROBE_SECRET`). Name the
probe package so `pnpm --filter web` cannot match it; `"private": true`,
no `deploy` script. `pnpm-workspace.yaml` `apps/*` will otherwise pick
it up the moment P4 creates it.

### Negative controls — mutants vs hazards

A test suite that has never been shown to fail proves nothing. D38 as
previously written applied "the job **fails if a control passes**" to
NC1–NC6 as a set. NC1/NC2/NC3/NC6 are mutants that must go red.
NC4/NC5 were hazard tests whose *expected* signal was green-looking
("no residue", "rows are the waitUntil-caller's own"). Implementing D38
as written fails the pipeline when abandon/waitUntil are handled
correctly; implementing NC4/NC5 as written violates D38 (ISOL-03).
Split:

**Mutants** — job **fails if a mutant is green**:

| Id | Variant | Bug present | Expected red signal |
|---|---|---|---|
| **NC1** | `impl=session_in_txn`: `sql.begin` + `set_config(..., false)` + COMMIT, then a follow-up `opts.probe` on the same `pid` | Failure mode #1 (D1's actual footgun) | `S_session` ≥ a floor **and** a later entry sees non-`EMPTY` claims **or** `current_user ≠ vamos_edge` **or** a foreign row. If residue is 0, record U27 **and still fail NC1 as a control** — RESET is not the tenant boundary (P2 / D1). Run NC3 on that same dirty backend so leftover `SET ROLE` cannot void the grant wall |
| **NC2** | `impl=nobegin`: `is_local => true` but no `BEGIN` | Failure mode #4 | `42501`, no rows. Deployed. Local half is Vitest autocommit, not pgTAP |
| **NC3** | `impl=nowrapper`: `select count(*) from public.bookings` as `vamos_edge` | D2's load-bearing claim | `42501`. **If this ever returns a number, the entire design is void** |
| **NC6** | `impl=cached`: same sequence against `HYPERDRIVE` / `vamos_public` | Failure mode #13 | `42501` — the cached binding cannot serve identity **or billing** data at all |
| **M1** | `M1_grant_layer_removed.sql`: `vamos_edge` inherits and holds a direct `SELECT` on `bookings` | Grant layer | `fail_closed.test.sql` **and** the Vitest no-BEGIN file go red |
| **M2** | `M2_policy_predicate_weakened.sql`: weaken `user_id = app.uid()` (not `customer_id = app.uid()`) | §14a predicate | `cross_claim.test.sql` / `bookings_customer_rls.test.sql` go red |
| **M3** | `withIdentity` mutant with `is_local => false` | D1 inside the shipped function | Local simulator on the reserved conn goes red |

**Hazards** — job **fails if the hazard is not observed** (INCONCLUSIVE, not
green) **or** if residue / starvation / `25P02` / a foreign row appears on
a later `correct` probe after a confirmed dirty origin:

| Id | Variant | Hazard | Construction / fail rule |
|---|---|---|---|
| **NC4** | `impl=abandon` | Failure modes #2/#5 | `waitUntil` the open transaction (so BEGIN is sent), bind identity, then abort (Worker `throw`, 60 s Hyperdrive query ceiling, or `pg_terminate_backend` from the owner role). Follow-up adjacency on **that `pid`**. Fail INCONCLUSIVE if no abandon is observed to have held an origin (`pg_stat_activity` / origin-connection-limit saturation). Do **not** treat "400 later probes were clean" as evidence (ISOL-05). Settles U28 |
| **NC5** | `impl=waituntil_captured` | Failure mode #10 | Hold `sql.begin`, bind identity, return the HTTP response, then inside `waitUntil` run a SELECT **on that same `tx`** (and a second request as the other customer). The suite **goes red** (foreign row, or query-after-COMMIT, or held origin). CI grep: no `waitUntil` closure over `tx` / `sql` from `withIdentity` (ISOL-04) |
| **NC5+** | `impl=waituntil_fenced` | Mode 10, correctly fenced | Positive test, not a mutant: new `withIdentity` inside `waitUntil`. Residue empty; rows are the waitUntil-caller's own. Does not satisfy D38's "fails if a control passes" |

**U27 companion, not NC1:** `impl=session` (session `SET`, **no
transaction**) measures whether Hyperdrive RESET between queries masks
the no-txn variant. Orphaned `42501` from connection-split is evidence
of pooling, not of D1. Zero residue here is recorded as U27 and is
**not** a pass of NC1.

A5 (`cacheStatus` never `hit`) stays a validity gate on the identity
config. It does not prove an app `publicSql` read of identity data —
that is the branded-client allowlist (FC-05).

### Validity gates on the deployed run

If any of these fail, the run is INCONCLUSIVE, not green
(`isolation-proof.md` §7.4, §14):

- V1 — every probe reached Postgres through Cloudflare (`cf-ray` present,
  `pid` a positive integer). Not `wrangler dev` local.
- V2 — requests were genuinely concurrent (`peakInFlight ≥ concurrency − 2`,
  more than one distinct pid).
- V3 — fixture non-degenerate (≥ 3 bookings each, disjoint references).
  Two empty result sets satisfy a naive equality check.
- V4 — connections were actually shared (`S ≥` floor, `distinctPids ≤
  concurrency / 2`).
- A1 — no customer ever receives the other's row
  (`arrayContaining(mine)` **and** not `arrayContaining(other)` — leftover
  rows from prior runs must not make this flake; do not DELETE against D19).
- A2 — `userBound === 'authenticated'` inside every customer transaction
  (otherwise a no-op `set_config` plus an over-granted `vamos_edge` looks
  identical to success — this is the U2 tripwire). Runs locally against
  the shipped function, not only deployed.
- A3 — no probe found residue on entry (`claims_at_entry` **and**
  `guest_at_entry` EMPTY, `user_at_entry === 'vamos_edge'`).
- A4 — on every shared-backend adjacent pair, the follower saw a clean
  session.
- A5 — Hyperdrive GraphQL `cacheStatus` for the identity config ∈
  `{disabled, transaction}`, never `hit`; and the window recorded a
  **non-zero** query count (zero queries means the probe did not use
  Hyperdrive).

Config preconditions, fail-fast (`isolation-proof.md` §12): probe config
`caching.disabled === true`, `origin_connection_limit === 5`,
`origin.port === 5432`, `origin.user === 'vamos_edge'`; `prepare: true` in
source.

---

## Lane 5 — Latency instrumentation (DATA-05)

**Verdict:** p50 < 30 ms measures one identity-scoped `withIdentity` call
from a Worker placed next to Frankfurt, not page TTFB. Instrument with
Workers Analytics Engine. Placement Hints, not Smart Placement. The number
**cannot be asserted** until a staging Worker exists. Record it as
**DEFERRED**.

### What p50 < 30 ms actually measures

The wall-clock time of one
`withIdentity(cs, "customer", claims, tx => tx\`select …\`)` call, start
(client construction) to resolved promise, for a single-row-ish read —
"a customer's own booking by id" (`hyperdrive-wiring.md` §4.1). It is
**not**:

- page TTFB (JWT verify + Next.js render + egress to the browser — a
  different, larger budget),
- a public-content query on `HYPERDRIVE` (designed to be answered from
  cache without touching Postgres on a hit),
- an aggregate / multi-join (Phase 4 quote reads have their own budget).

`withIdentity` is *up to* 5 sequential round trips (BEGIN, `set_config`
role, `set_config` claims, the query, COMMIT) unless pipelined
(`02-RESEARCH.md` Lane 1; `hyperdrive-wiring.md` §4.1). Cloudflare:
*"1–3 ms when placed nearby"* per round trip → 5–15 ms, under the 30 ms
bar. *"20–30 ms from a distant region"* → 100–150 ms, a 3–5× miss.
**The entire margin between passing and failing is Worker placement, not
query optimisation.** Placement near Frankfurt is a hard requirement of
this design, not an optimisation — the same conclusion Phase 2 already
drew, independent of ADR-007's residency framing.

### Smart Placement vs Placement Hints

| | Smart Placement | Placement Hints |
|---|---|---|
| Config | `"placement": { "mode": "smart" }` | `"placement": { "region": "aws:eu-central-1" }` |
| Mechanism | Learns over traffic which PoP is significantly faster than running near the requester | Deterministic: runs in the Cloudflare data centre with lowest latency to the named cloud region, from the first deploy |
| Warm-up | Needs consistent multi-location traffic; up to 15 minutes to activate | Immediate |
| Fit here | Poor — one back end (Supabase Frankfurt); no ambiguity for the learner to resolve | **Correct** — Cloudflare's own guidance for a single-homed database |

(`hyperdrive-wiring.md` §4.2, citing Smart Placement docs and the
2026-01-22 Placement Hints changelog.)

**Use Placement Hints, not Smart Placement.** Add the block inside each
`env.*` — named environments drop top-level `placement` the same way they
drop top-level bindings (the repo's own wrangler comment). This is also
the resolution of `02-RESEARCH.md` Lane 1's open placement item.

Placement *"only affects the execution of fetch event handlers"*
(`isolation-proof.md` §5.1, §15 U-I7). Queues consumers and Cron handlers
are **not** placed. Their DB access still goes through `withIdentity`
(`asStaff` / `asQuote`); their latency is **not** covered by DATA-05
(D83). The 5-RTT `withIdentity` shape from a distant PoP is the
100–150 ms miss Lane 5 already calculated, multiplied across a sweep,
holding `vamos_edge` backends against the 25 budget. Size U32 with
unplaced sweeps in mind. Record that in the phase summary regardless of
plan-tier availability — it is also a correction to ADR-007's framing.
Availability of the hint on the chosen plan is U30.

Do not let Phase 9 believe `wrangler.jsonc` `placement.region` covers
`0 3 * * *`. If counsel needs EU execution for reminder PII, that is
Regional Services / a dedicated placed fetch Worker that the cron
**enqueues** (U13), not a Placement Hint on `scheduled`. Cron/Queue
handlers take `env` from the Worker argument; `getCloudflareContext()` is
an OpenNext fetch/RSC API (FC-10).

Whether `placement.host` / `placement.hostname` L4/L7 probes are needed
for Hyperdrive, or the `region` shorthand is enough, is U25. Confirm the
provisioned Supabase project's region is actually `eu-central-1` (Frankfurt)
before treating `aws:eu-central-1` as the right value.

### Instrumenting without paid APM

Workers Analytics Engine. Free tier at time of writing: 100 000 writes/day
and 10 000 read queries/day included; the platform states you will not be
billed for WAE (`hyperdrive-wiring.md` §4.3). Fifth binding:

```jsonc
"analytics_engine_datasets": [
  { "binding": "DB_LATENCY", "dataset": "vamos_db_latency" }
]
```

Write the data point in the **apps/web wrappers**, not inside
`packages/db` (that package has no `env`). One place, every call site
benefits. `blobs: [kind, "ok" | sqlstate]`, `doubles: [ms]`,
`indexes: [kind]`. Query with the SQL API using
`quantileExactWeighted` — not `quantile` / `quantileTDigest`
(`hyperdrive-wiring.md` §4.3):

```sql
SELECT
  blob1 AS identity_kind,
  quantileExactWeighted(0.5)(double1, _sample_interval) AS p50_ms,
  quantileExactWeighted(0.95)(double1, _sample_interval) AS p95_ms,
  count() AS n
FROM vamos_db_latency
WHERE timestamp > NOW() - INTERVAL '1' DAY
GROUP BY blob1
```

Workers Logs (`observability.enabled: true` is already in wrangler.jsonc)
plus a `console.log` of `{ event: "db_latency", kind, ms }` is a debugging
tool (`wrangler tail`). It has no built-in percentile aggregation. It is
not the thing that answers "what's our p50."

### Realistic eu-central figures

With Placement Hints pinning the Worker near `eu-central-1` and Supabase in
Frankfurt: expect the 5-RTT `withIdentity` shape in the **single-digit to
low-teens milliseconds** for a single-row read, based on Cloudflare's
1–3 ms/RTT-when-nearby figure, with index-seek execution itself
sub-millisecond on `bookings.customer_id` (`hyperdrive-wiring.md` §4.4).
From a US or APAC PoP against Frankfurt: **100–150 ms**, a miss.

**This cannot be asserted with a precise figure before real infrastructure
exists.** Do not accept "should be fine" from this document or from
Cloudflare's marketing figures as a substitute for one real staging
measurement. Until a Cloudflare account and a Supabase project exist, the
DATA-05 success criterion is **DEFERRED** — designed, instrumented in
code, unmeasured. A local `supabase start` timing is a laptop-to-localhost
number and is not the criterion.

Whether sequential `await tx\`...\`` inside `sql.begin` issues 5 network
flushes or postgres.js pipelines some of them even in the non-array form
is U26. Check: `log_statement=all` + `log_line_prefix='%m '` on local
Supabase, count flushes; compare against the WAE p50 from a real staging
deploy. If the measured number is well under 5×RTT, the array-return
micro-optimisation is unnecessary complexity at every call site. If it is
close, standardise hot read paths on the array-return form
(`hyperdrive-wiring.md` §4.4). Until then, production `withIdentity` uses
sequential await (matches D1's readable shape). The probe's residue
sequence is the **same sequential await inside the shipped function**
(ISOL-01). A pipelined array copy in `runCorrect` is deleted — it proved
a different shape.

---

## Decisions taken here

D1–D24 remain settled. New decisions start at D25.

| # | Decision | Chosen | Rejected | Why | Depended on by |
|---|---|---|---|---|---|
| D25 | Dual Hyperdrive bindings in wrangler | `HYPERDRIVE_NOCACHE` + `HYPERDRIVE` under **both** `env.staging` and `env.production`; cache-disabled via `--caching-disabled` at create time | One config; `wrangler hyperdrive update --caching-disabled` as the happy path; putting the password in `wrangler secret put` | D3, implemented. Docs show `--caching-disabled` only on `create` (`hyperdrive-wiring.md` §1.2–1.3). The credential lives inside the Hyperdrive config object, addressed by opaque `id` | Every later query; the isolation probe |
| D26 | Direct connection string | `postgres://vamos_edge\|vamos_public:…@db.<ref>.supabase.co:5432/postgres` | Supavisor `:6543`; logging in as `postgres` / `authenticator` | Cloudflare's own Supabase guide forbids the pooled string; D2 forbids a login role that owns the tables (`hyperdrive-wiring.md` §1.2) | DATA-05's "direct connection string" clause |
| D27 | postgres.js lifecycle | Per-invocation, inside `withIdentity` / `publicSql`. Identity: `max: 1, fetch_types: false, prepare: true, connect_timeout: 10`. Public: `max: 5`, same flags. No `idle_timeout`. No `sql.end()` | Module-scope client; `max: 5` on the identity path; `prepare: false`; `ctx.waitUntil(sql.end())` | Module scope is a hard Workers error silent on first request. `prepare: false` silently disables Hyperdrive's cache. `sql.end()` is a stale STACK.md recommendation already corrected in Phase 2 (`hyperdrive-wiring.md` §2) | DATA-05, DATA-06, every call site |
| D28 | `withIdentity` location and signature | `packages/db/src/identity.ts`: `withIdentity(connectionString, kind, claims, fn, opts?)`. Named wrappers `asCustomer` / `asStaff` / `asGuest` / `asAnon` in `apps/web/lib/db/identity.ts` take `env`, extract the string, write WAE | File in `apps/web` only (Phase 2 sketch); `env` as first arg of the core function; union-object identity | Probe and app must import the same function (`isolation-proof.md` §6). `packages/db` must not depend on OpenNext `env`. Wave A asked for `kind, claims, fn` (`hyperdrive-wiring.md` §3) | DATA-06 proof; every identity-scoped query |
| D29 | Closed role map | `PG_ROLE = { anon: "anon", customer: "authenticated", staff: "vamos_staff", guest: "vamos_guest" }`. Claims JSON strips `user_metadata` | Reading the role name from the JWT; passing `user_metadata` through | D2's grant boundary made syntactically impossible to bypass from the caller. `user_metadata` is user-writable (D4) | U1 fallback changes only `PG_ROLE.customer` |
| D30 | Forgotten wrapper | SQLSTATE `42501`. `postgres` importable only from the two `packages/db` modules (+ staging probe). ESLint / CI grep is the compile-time half | Relying on Hyperdrive `RESET`; returning zero rows as "safe enough" | D2. If `nowrapper` ever returns a number, the design is void (`isolation-proof.md` §9 NC3) | DATA-02/03/04 remaining true under concurrency |
| D31 | Worker placement | Placement Hints `"placement": { "region": "aws:eu-central-1" }` inside each `env.*` block | Smart Placement (`mode: "smart"`); no placement; a top-level `placement` key | Nearby RTT is the whole DATA-05 margin. Smart Placement learns slowly and solves the wrong problem (one back end, known region). Named envs drop top-level keys (`hyperdrive-wiring.md` §4.2) | DATA-05; does **not** place Queues/Cron |
| D32 | Latency instrumentation | WAE dataset `vamos_db_latency`, written from the apps/web wrappers, queried with `quantileExactWeighted(0.5)`. Staging p50 **DEFERRED** until a Worker exists | Paid APM; asserting Cloudflare's 1–3 ms figure; treating a local timing as the gate; Workers Logs as the percentile source | Free, built-in, actual percentile over traffic (`hyperdrive-wiring.md` §4.3–4.4). A local number is laptop-to-localhost | DATA-05 success criterion |
| D33 | Isolation-proof architecture | Staging-only `apps/isolation-probe` importing `@vamos/db`; Vitest `node` (not Playwright, not vitest-pool-workers); adjacency/`S` coverage; residue probe as first statement when `opts.probe`; six deployed negative controls + two local mutants | Probe routes in `apps/web`; Playwright; Miniflare; "200 requests returned the right rows" without `S` | Without shared-backend coverage and a red negative control the gate is theatre (`isolation-proof.md` §0, §5, §7, §9) | DATA-06 |
| D34 | Local connection string | Port **54322**; identity binding logs in as `vamos_edge`; public binding as `vamos_public` | Port 5432; `postgres:postgres` as the Worker login once roles exist | `supabase start` listens on 54322 (`02-RESEARCH.md` Lane 6). Superuser `BYPASSRLS` would make D2 untestable locally (`isolation-proof.md` §5.1). Until Phase 2 roles land, `wrangler dev` may keep the current postgres placeholder so the platform boots | Local P1–P5; not a DATA-06 vehicle |
| D35 | Origin pool sizes | App: 25 (RLS) + 15 (public) against Micro's 60. Probe: dedicated cache-disabled config capped at 5 | One pool for everything; probe sharing the app's 25 | 40/60 leaves headroom for Studio, migrations, Auth/Realtime. Probe at 5 makes reuse a pigeonhole (`hyperdrive-wiring.md` §1.5; `isolation-proof.md` §5.1). Re-verify against real `max_connections` (U32) | Staging deploy (deferred) |
| D36 | OpenNext identity path | `getCloudflareContext().env`; `export const dynamic = "force-dynamic"` (or a `request`-reading Route Handler) on every identity import; Node.js runtime, never `edge` | Ambient `env`; calling `withIdentity` from an SSG page; `runtime = 'edge'` | OpenNext does not pass `env` as a handler argument; SSG sees local bindings; postgres.js needs `nodejs_compat` (`hyperdrive-wiring.md` §2.3) | Every RLS-gated route |
| D37 | Residue probe in the shipped function | Optional `opts.probe`. Production never sets it. The probe Worker always does. Same function, not a copied SQL sequence | Always-on residue probe in production (extra RTT on every call); a probe-only fork of `withIdentity` | DATA-06 must test the shipped function (`isolation-proof.md` §6). Production must not pay a probe it does not read | Isolation probe `impl=correct` |
| D38 | Negative-control discipline | **Mutants** (NC1 session-in-txn, NC2, NC3, NC6, M1, M2, `is_local=false`) — job fails if a mutant is green. **Hazards** (abandon, waitUntil-captured-tx) — job fails if the hazard is unobserved or if residue follows a confirmed dirty origin | One "fails if a control passes" rule for NC1–NC6 as a set | NC4/NC5 expected green-looking outcomes; implementing the old rule inverts them (ISOL-03) | DATA-06 |
| D39 | Public cached path | `publicSql(env)` on `HYPERDRIVE`, `vamos_public`, no transaction, `max: 5`. Identity data never issued on this binding | Putting public reads through `asAnon` (opens a transaction, uncacheable); reading `bookings` on `HYPERDRIVE` | D3. NC6 proves the cached binding cannot serve identity data (`hyperdrive-wiring.md` §3; `isolation-proof.md` §9 NC6) | Phase 5 content reads; Phase 6 `content_strings` |
| D40 | Isolation fixtures carry no money | Seed bookings with NULL price columns. No live `rate_versions` row. Surfaces render `CHF 000` by data | Inventing a CHF figure in a fixture, a probe response, or this document | Law 4. `isolation-proof.md` §7.2, §14 | DATA-06 fixture; QUOTE-10 remains intact |
| D76 | Frozen call-site signature | Core `withIdentity(cs, kind, claims, fn, opts?)`. `apps/web` imports named wrappers only (`asCustomer` / `asStaff` / `asGuest` / `asAnon` / `asQuote`). Ban `@vamos/db` under `apps/web/app` and `apps/web/lib` except the wrapper file | Three signatures in force (Phase 2 union, wiring `{kind,claims}`, D28) | FC-01; quote-lock-expiry cannot type-check | Every later caller |
| D77 | Tests call the shipped function | `opts.client` test-only for `sql.reserve()`. Probe `impl=correct` calls `withIdentity`. No inlined `runCorrect` SQL | Probe/simulator copy of `set_config` | ISOL-01; a production `is_local=>false` would not turn the suite red | DATA-06 |
| D78 | NC1 is session-SET **inside** BEGIN/COMMIT | `impl=session_in_txn`. No-txn session SET is U27's measurement, not the D1 mutant | Session SET with no transaction (Hyperdrive RESET-maskable) | ISOL-02; PG 17 SET persists `is_local=false` across COMMIT | DATA-06 mutants |
| D79 | Quote/ledger path on NOCACHE | `asQuote` / definer RPCs on `HYPERDRIVE_NOCACHE`. Never grant pricing tables to `vamos_public`. Phase 4 D60 cached rate-book is refused | `publicSql` on the rate book; billing on a 60 s cache | FC-02; D3 | `/api/quote`, checkout intent |
| D80 | `@vamos/db` is a real module | `exports` (`./identity`, `./public`, `./database.types`), `postgres` dependency, `workspace:*`, `transpilePackages` | `"main": "index.ts"` pointing at a missing file | FC-03; OpenNext cannot import the helper | P1 |
| D81 | Isolation fixtures match the draft | `customers (user_id, full_name, email)`; `bookings` `status='quote'` + contact NOT NULLs; policy `c.user_id = app.uid()`; order by `created_at` / `booking_legs.scheduled_at` never `pickup_at` | `isolation-proof.md` verbatim (`'quoted'`, uid as `customers.id`, `pickup_at`) | F1–F3; first `supabase start` aborts | P2/P4 fixtures |
| D82 | Probe flag is compile-time | `opts.probe` stripped unless `DEPLOY_ENV==="staging"` / `VAMOS_ISOLATION_PROBE`. Real `deploy-production.yml` gains the three production gates | Caller `{ probe: true }` in the production bundle | FC-09 | Production |
| D83 | Queues/Cron are unplaced | Placement Hints pin fetch only. Handlers take `env` from the Worker argument, never `getCloudflareContext()`. DATA-05 does not cover them | Believing `placement.region` covers `scheduled` / `queue` | FC-10; LIFE-05 | Phase 7/9 |

---

## UNCERTAIN — carried and new

U1, U2 and U3 are **not settled**. Their checks are unchanged. New items
start at U23. U4–U22 stay Phase 2's; they are not re-listed.

| # | Item | Why uncertain | The check that settles it | Blocks |
|---|---|---|---|---|
| U1 | Can managed Supabase's `postgres` role run `grant authenticated to vamos_edge with inherit false, set true`? | PG16+ grant options exist and Supabase is on PG17, but the managed role's own privileges are not documented | Run exactly that statement in the staging SQL editor as the first migration step. If refused, fall back to `create role vamos_customer nologin` mirroring `authenticated`'s grants and use `TO vamos_customer` in policies — no other change. `PG_ROLE.customer` becomes `"vamos_customer"`; `fail_closed.test.sql` assertion 2 enumerates the fallback role too | The roles migration (Phase 2 first file) **and** `withIdentity`'s map |
| U2 | `set_config('role', $1, true)` ≡ `SET LOCAL ROLE $1` | `role` is a GUC so this is near-certain, but it is not stated in PG's parameter table | Four-line check on `supabase start` in P1 (ISOL-12): `begin; select set_config('role','authenticated',true); select current_user; commit; select current_user;` — expect `authenticated` then `vamos_edge`. Fallback is a **closed-map switch** (`const stmt = { authenticated: 'set local role authenticated', … }[PG_ROLE[kind]]`), never `unsafe` + `+` concat | Phase 3 `withIdentity` |
| U3 | Does `supabase db push --include-seed` re-run the seed on every push or only once? | The CLI reference documents the flag but not the re-run semantics; a June 2026 community note says remote projects do not pick up seed files without it | `supabase db push --include-seed --dry-run` against a scratch project, then a real second push and diff row counts | The `deploy-staging.yml` migration step; makes `ON CONFLICT` load-bearing rather than optional |
| U23 | Does `wrangler hyperdrive update` accept `--caching-disabled`, or is it create-time only? | Docs show the flag only on `create` (`hyperdrive-wiring.md` §1.3, U-DATA05-1) | `npx wrangler hyperdrive update <id> --caching-disabled --help` against a real config. If unsupported, the runbook is delete + recreate + re-point the binding id | Wrong-cache-mode recovery; not the happy-path create |
| U24 | Does `getCloudflareContext()` "async mode" change this usage? | Mentioned in passing in OpenNext docs, not fully specified (`hyperdrive-wiring.md` §2.3b, U-DATA05-2) | Smoke-test one RLS-gated route through `opennextjs-cloudflare build && preview`, not only `next dev` | Identity path on a real OpenNext request context |
| U25 | Is `placement.region` enough for Hyperdrive, or do `host` / `hostname` L4/L7 probes need adding? | Docs describe host probes for infrastructure *not* on a named cloud provider. Supabase `db.<ref>.supabase.co` likely resolves to AWS in `eu-central-1`, but that is an assumption (`hyperdrive-wiring.md` §4.2, U-DATA05-3) | Confirm the provisioned project's region setting. Measure p50 with the region hint alone; add host probes only if it misses | DATA-05 measurement (deferred) |
| U26 | Sequential `await tx\`...\`` inside `sql.begin`: 5 flushes, or pipelined? | postgres.js may coalesce even the non-array form (`hyperdrive-wiring.md` §4.4, U-DATA05-4) | `log_statement=all` + `log_line_prefix='%m '` on local Supabase, count flushes; compare to WAE p50 on staging. If well under 5×RTT, do not carry the array-return micro-opt into every call site | Hot-path shape of `withIdentity`; not correctness |
| U27 | Does Hyperdrive's documented `RESET` on pool return actually clear `role` and `request.jwt.claims`? | Docs say "the connection is `RESET`" and nothing more; `RESET ALL` ≠ `DISCARD ALL` (`isolation-proof.md` §15 U-I2) | NC1's `residue` count. If it is 0, Hyperdrive *is* clearing them — record the finding, and record explicitly that the design does **not** depend on it (D1/D2 do the work) | Nothing — D1/D2 do not rely on this. NC1-with-zero-evidence is an escalation, not a pass |
| U28 | Origin connection whose client dies mid-transaction: rolled back, discarded, or returned dirty? | `RESET ALL` cannot run inside a failed transaction block (`isolation-proof.md` §15 U-I3) | NC4. Watch for `25P02`, residue, and `Failed to acquire a connection from the pool` in the 400 follow-up probes | Abandoned-request safety; not the happy path |
| U29 | Does Supabase Admin `createUser` accept `@example.com` addresses when email confirmations are on? | Project-config dependent (`isolation-proof.md` §15 U-I6) | First fixture run. Fallback: a dedicated verified test domain, or `email_confirm: true` with a project-level allowlist | Deployed DATA-06 fixture (deferred). Local simulator uses Phase 2's pgTAP ids, not Auth |
| U30 | Are Placement Hints available on the chosen plan? (Queues/Cron are not placed regardless.) | No account. Placement "only affects fetch event handlers" (`isolation-proof.md` §15 U-I7) | `wrangler deploy` accepts or rejects `"placement": { "region": "aws:eu-central-1" }`. Record the Queues/Cron exclusion in the phase summary either way | DATA-05; ADR-007 revision (residency, not latency) |
| U31 | Isolate-level memoisation of customer-scoped reads once Phase 5 adds real routes | Those routes do not exist (`isolation-proof.md` §15 U-I8; §2 mode 14) | Phase 5: re-point the isolation harness at `/api/account/bookings`; CI grep for module-scope `Map`/`Set`/`cache`/`memo`/`store` under `apps/web/app` and `apps/web/lib` | Phase 5, not Phase 3 |
| U32 | Actual `max_connections` on the provisioned Micro, and how many Auth/Realtime/PostgREST already hold | 40/60 assumes they do not compete meaningfully (`hyperdrive-wiring.md` §1.5) | `show max_connections;` plus `select count(*) from pg_stat_activity;` on staging before the first `hyperdrive create` | `--origin-connection-limit` values; not the local slice |
| U59 | `vamos_quote` nologin role as D79 fallback | Preferred path is definer RPCs inside `asAnon`/`asCustomer`. A fifth IdentityKind is a Phase 2 role-set addition | Owner/Phase 2: add the role in `0002` or keep definer-only. Do not grant pricing tables to `vamos_public` either way | D79 door if definer RPCs are not ready |
| U61 | Guest and staff in the DATA-06 adjacency set | Gate currently mints two customers; residue SQL omitted `request.vamos.manage_token_hash` | P2/P4: guest-pair + staff-pair; ENTRY_PROBE asserts the manage-token GUC is EMPTY on entry (FC-04, ISOL-06) | DATA-03/AUTH-05 under the pool |

---

## Where the two lanes disagreed

Resolved in the review-pass table and in D28 / D34 / D37. Restated so a
later reviewer does not re-litigate them:

- **File location.** Isolation wins. The probe must import the shipped
  function. Phase 2's `apps/web/lib/db/identity.ts` path was a sketch, not
  D1–D24. Named wrappers still live in `apps/web` so call sites stay
  `asCustomer(env, claims, fn)`.
- **`env` vs `connectionString`.** Isolation wins for the core function;
  wiring lane wins for the wrappers (WAE needs `env`).
- **`kind, claims` vs union object.** Wiring lane wins — Wave A asked for
  it; the four wrappers then read as plain calls.
- **Always-on residue probe vs probe-only fork.** Neither. Same function,
  `opts.probe` (D37). Production does not pay it; the probe does not fork
  the SQL.
- **Local `postgres@5432` vs `vamos_edge@54322`.** Isolation + Phase 2 Lane
  6 win. The wiring lane's "current placeholder is correct" was true for
  *booting* `wrangler dev` before roles exist, and false as the identity
  login once they do (D34).
- **Sequential await vs pipelined array in production `withIdentity`.**
  Sequential await until U26 is measured. Probe residue sequence is
  pipelined because it is six statements.

No disagreement touched D1, D2 or D3.

---

## Owner blockers that touch this phase

### 1. No Cloudflare account, no Supabase project — open

Nothing in Lane 1's `wrangler hyperdrive create`, Lane 5's p50, or Lane 4's
deployed isolation run can execute today. The same blocker holds Phase 1
plan 01-01 task 3 (deploy to staging.vamostaxi.eu). See `.planning/STATE.md`
→ Blockers.

**What this does not block:** P1–P5 below. `packages/db` identity helper,
local connection-reuse simulator, pgTAP extensions, mutation gate, OpenNext
wrappers against `localConnectionString`, the probe *package* as un-deployed
source, Vitest harness code, WAE write-path in the wrappers (no-ops when
the binding is missing: `env.DB_LATENCY?.writeDataPoint`).

**What it does block, and how they are recorded:**

| Item | Status |
|---|---|
| Real Hyperdrive config ids in `wrangler.jsonc` | Designed. Staging currently omits the binding because a placeholder UUID fails deploy. Production has a non-UUID placeholder that also cannot deploy. Land ids in P6 when `wrangler hyperdrive create` can run |
| DATA-06 concurrent two-customer run over a real pool | Designed, unrun. Local simulator + mutants + pgTAP are the executable proof of the *Postgres* half |
| DATA-05 p50 < 30 ms from the staging Worker | **DEFERRED.** Not passed. Not estimated-as-passed. A local timing is not the criterion |
| U1, U2, U3, U23, U25, U27, U28, U29, U30, U32 | Each has a named check that needs the project or the account |

Do not declare Phase 3 done on a local run. Do not write a latency figure
into a summary and call it measured.

### 2. Phase 2 is designed, not implemented

No migration exists. `vamos_edge` does not exist. P1 of this phase needs
Phase 2 P1's roles and helpers, and P2 of this phase needs Phase 2 P6's
grants. Either execute Phase 2 first, or accept that Phase 3 has nothing to
connect to. Resolve the four GSD-LAUNCH conflicts (`02-RESEARCH.md` "Where
lanes disagreed"; handoff §3) before that migration is written — they do
not change the Hyperdrive wrapper, but they change the tables it selects
from.

### 3. The CHF price matrix — open, unchanged

Fixtures in this phase seed **no price**. Every amount on any surface the
probe or a local page might render reads `CHF 000` by data (D40, QUOTE-10,
Law 4). Do not invent a number to make a booking look "real."

### 4. Policy numbers, photography, payment marks — do not block Phase 3

Carried from Phase 2. Waiting allowances stay NULL (ADR-002). No quote
engine runs in this phase.

---

## Proposed Phase 3 plan split

Six plans. The sequencing rule is that **P1 is a hard gate** (nothing
identity-scoped compiles without `withIdentity`) and **P1 cannot depend on
a live Hyperdrive** — local `supabase start` is the first executable slice.
P6 is last, marked **deferred-if-unprovisioned**, and contains both success
criteria that ROADMAP.md names. A local green run does not complete P6.

Phase 2 P1 (roles, helpers) must exist before this P1 can bind a role;
Phase 2 P6 (grants, policies) must exist before this P2's fail-closed
tests mean anything. If Phase 2 is still unexecuted, this P1 still lands
the TypeScript against the decided contract and its unit tests mock the
SQL — but the connection-reuse simulator and pgTAP wait.

| # | Plan | Goal (one line) | File scope | Depends on | Parallel with |
|---|---|---|---|---|---|
| **P1** | **`withIdentity` in `packages/db`** | The only door into identity-scoped data exists, with all four actors, closed `PG_ROLE`, ROLLBACK-on-throw, `opts.probe`, and `publicSql`. postgres.js constructed per-invocation with D27's options. `postgres` import fenced | `packages/db/src/identity.ts`, `packages/db/src/public.ts`, `packages/db/src/claims.ts` (`claimsForSql`, `VamosClaims` type), ESLint `no-restricted-imports`, unit tests with a local `postgres` against `supabase start` **or** a mocked `sql.begin` if Phase 2 roles are not in yet | Phase 2 P1 roles if hitting a real DB; otherwise the TypeScript contract alone | nothing (hard gate) |
| **P2** | **Local isolation: simulator, pgTAP, mutants** | Residue on a pinned backend fails 100 % of the time; forgotten wrapper is `42501`; two mutants turn the suite red | `packages/db/test/local/connection-reuse.test.ts`, `packages/db/supabase/tests/fail_closed.test.sql`, `cross_claim.test.sql`, `set_local_without_begin.test.sql`, `packages/db/mutants/M1_*.sql`, `M2_*.sql`, `packages/db/scripts/mutation-gate.mjs`, Vitest config (`node`, `*.test.ts`, no Playwright) | P1; Phase 2 P6 (grants) for pgTAP to be meaningful | P3 (file-disjoint) |
| **P3** | **OpenNext wrappers, wrangler shape, CI greps** | App call sites see `asCustomer(env, claims, fn)`; WAE write-path present; `force-dynamic` grep; Placement Hints block in both envs; `localConnectionString` on 54322 as `vamos_edge` / `vamos_public`; WAE dataset binding declared. Real Hyperdrive ids **not** required — staging keeps omitting a fake UUID; production keeps its placeholder until P6 | `apps/web/lib/db/identity.ts`, `apps/web/lib/db/public.ts`, `apps/web/wrangler.jsonc` (placement, analytics_engine_datasets, localConnectionString, commented dual-binding shape), `npx wrangler types`, grep in `pr.yml` | P1 | P2, P4 |
| **P4** | **Probe Worker + harness, as source** | `apps/isolation-probe` exists, staging-only, closed `impl` union, imports `@vamos/db`. Vitest deployed harness, fixtures, adjacency helper, negative-control tests **written**. Nothing in this plan deploys or talks to Cloudflare | `apps/isolation-probe/**`, `packages/db/test/fixtures/two-customers.ts`, `test/support/drive.ts`, `test/support/hyperdrive-metrics.ts`, `test/deployed/*.test.ts` (skipped unless `PROBE_BASE_URL` is set), production `grep` that the probe is absent from `apps/web` | P1 | P3 |
| **P5** | **Local gate: P1–P4 against `supabase start`** | Connection-reuse simulator green; mutation gate red-against-mutants; fail-closed pgTAP green; identity wrappers typecheck; `force-dynamic` grep green; probe package typechecks and is not in a production build | `pr.yml` jobs listed in `isolation-proof.md` §13 (the local half only) | P2, P3, P4 | — |
| **P6** | **Staging Hyperdrive + DATA-06 + p50 — DEFERRED if unprovisioned** | `wrangler hyperdrive create` twice per environment (D25/D26/D35); bind real ids; deploy app + probe to staging; config preconditions; NC1–NC6 go red as expected; isolation gate with `S` floor; WAE `quantileExactWeighted(0.5)` recorded. **If still unprovisioned: do not mark this plan done. Record DATA-05 p50 as DEFERRED. Do not treat P5 as the ROADMAP gate.** | wrangler Hyperdrive configs; `deploy-staging.yml` `data-06` job from `isolation-proof.md` §13; a one-line `DATA-05 p50 = DEFERRED (no staging Worker)` in the phase summary until the number exists | P5; Cloudflare account; Supabase project; Phase 2 executed on that project (U1 answered) | — |

### Sequencing, plainly

```
P1 ──┬── P2 ──┐
     ├── P3 ──┼── P5 ── P6 (deferred-if-unprovisioned)
     └── P4 ──┘
```

Wave 1: **P1** alone.
Wave 2: **P2**, **P3**, **P4** in parallel (P3 does not need a live
Hyperdrive id; P4 does not deploy).
Wave 3: **P5** alone — the local gate.
Wave 4: **P6** when the account exists. Until then the phase is
**in progress, local slice landed, staging measurement DEFERRED.**

### What cannot be fully verified until a Cloudflare account and a Supabase project exist

Everything in P1–P5 is provable on a laptop against `supabase start`. Three
things are not, and they are exactly ROADMAP.md's two success criteria plus
the inherited U-items:

- **DATA-06 over a pooled Hyperdrive connection.** The local simulator
  proves the Postgres half deterministically. It does not prove Hyperdrive's
  `RESET`, abandoned-transaction handling, `cacheStatus`, or `waitUntil`.
  Those are NC1/NC4/A5/NC5 against a deployed Worker
  (`isolation-proof.md` §4.3).
- **DATA-05 p50 < 30 ms from the staging Worker.** Instrument now (D32).
  Measure in P6. **DEFERRED**, not passed. A local timing is not the
  criterion (`hyperdrive-wiring.md` §4.4).
- **U1, U2, U3** — unchanged checks from `02-RESEARCH.md`. U1 and U2 block
  `withIdentity`'s final role name and first statement; they are answered
  against a real project, not against `supabase start` (local Superuser can
  grant anything, which is not the managed-role question).

The definition of done from the handoff, applied:

> Phase 3 is done when: both Hyperdrive configs are bound and the direct
> connection string is confirmed (5432, not 6543); `withIdentity` exists
> with all four actor variants and a caller that forgets it gets `42501`;
> the concurrent two-customer isolation test passes **and its negative
> control fails**; U1 and U2 are answered against a real project; p50 is
> measured from staging **or explicitly recorded as deferred with the
> reason**.

Until the account exists, the last two clauses stay open. The local slice
can still land.

---

## Wave A checklist — held to the questions

| Lane | Question | Status |
|---|---|---|
| `hyperdrive-bindings` | Both wrangler.jsonc configs per D3; exact cache-disabled setting; how the DIRECT string (5432, never 6543) is formed and stored | **Answered.** D25, D26, D34, D35. `--caching-disabled` at create. Stored inside the Hyperdrive config object, not `wrangler secret put`. U23 is whether update can flip the flag |
| `pg-client-lifecycle` | postgres.js construction in a Worker (module scope vs per-invocation); `max` / `idle_timeout` / `connect_timeout` / `prepare`; whether `fetch_types` must be off; what breaks under `@opennextjs/cloudflare` | **Answered.** D27, D36. Per-invocation, `max:1` identity / `max:5` public, `fetch_types: false`, `prepare: true`, `connect_timeout: 10`, no `idle_timeout`, no `sql.end()`. Module scope is a second-request I/O error. OpenNext: `getCloudflareContext`, `force-dynamic`. U24, U26 remain measurements, not design holes |
| `with-identity-wrapper` | `withIdentity(kind, claims, fn)` implementing D1+D2: explicit BEGIN, both `set_config` calls, closed `PG_ROLE`, throw behaviour, four actors, forgotten wrapper → `42501` | **Answered.** D28, D29, D30, D37, D39. Full TypeScript in Code Examples, copied from the lanes with the packages/db relocation |
| `isolation-proof` | Every survival path; structural vs test-only; test design with two real identities, genuine concurrency, iteration count; **plus a deliberate negative control the test must fail against** | **Answered.** 15 paths in Lane 4. Local simulator + deployed probe. `S` coverage. NC1 is the primary negative control (session-scoped SET, no transaction); NC2–NC6 and mutants M1/M2 accompany it. U27/U28/U29 are Hyperdrive/Auth behaviours the controls *measure*, not unanswered design |
| `latency-instrumentation` | What p50 < 30 ms measures; how to instrument without paid APM; realistic eu-central figures; what Smart Placement does and does not change | **Answered as design, measurement DEFERRED.** D31, D32. WAE `quantileExactWeighted`. Placement Hints, not Smart Placement. Nearby: single-digit to low-teens ms expected; distant: 100–150 ms. **No staging number is recorded as passed.** U25, U30, U32 wait on the account |

No Wave A question is silently filled in. U1/U2/U3 are carried with their
exact Phase 2 checks.

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `postgres` (porsager/postgres.js) | pin at plan time to the current stable; Cloudflare's Hyperdrive example is the **construction contract**, not a version pin | SQL driver over Hyperdrive | Fixed by `.claude/CLAUDE.md` / `STACK.md`: postgres.js via Hyperdrive, prepared statements, `max` capped for Workers. Not `pg` (heavier, same Hyperdrive constraints, no gain) |
| `@opennextjs/cloudflare` | already pinned in the workspace (Phase 1: `1.20.2` at research time) | `getCloudflareContext()`, Worker bundle | Identity path has no `env` argument without it (`hyperdrive-wiring.md` §2.3) |
| `wrangler` | already pinned (Phase 1: `4.124.0` at research time) | Hyperdrive create/update, types, deploy, secrets | The only CLI that can create a cache-disabled config and emit `CloudflareEnv` |
| `jose` | already in the Phase 2 token-verify contract | Verify Supabase access tokens at the edge for the probe and, later, the app | Isolation identities are real tokens (`isolation-proof.md` §7.2); do not drag `@supabase/supabase-js` into the hot path (`02-RESEARCH.md` Lane 1) |
| Next.js 15 App Router | already pinned | Route Handlers / Server Components that call the wrappers | Fixed by the stack. Node.js runtime only |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `vitest` | pin at plan time | DATA-06 local simulator, deployed harness, negative controls | `packages/db`, `environment: "node"`, `*.test.ts`. Not Playwright (four viewports). Not `@cloudflare/vitest-pool-workers` (Miniflare; Hyperdrive remote bindings unsupported) |
| `undici` | pin at plan time (or use Node 22's bundled undici) | Pin socket count so "64 concurrent" is a fact (`isolation-proof.md` §7.3) | Deployed harness only |
| `pgTAP` via `supabase test db` | shipped with Phase 2 | Fail-closed, cross-claim, lost-BEGIN | Local P2. Already the Phase 2 runner; do not add a second |
| Workers Analytics Engine | platform binding, not npm | DATA-05 percentiles | `DB_LATENCY` binding. Free tier as documented 2026-08-22; re-check pricing at provision time |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| postgres.js | `pg` / `node-postgres` | Cloudflare documents both. `pg` needs more compatibility surface and does not change Hyperdrive's pool semantics. Stack already picked postgres.js |
| postgres.js | `@supabase/supabase-js` for app data | Explicitly rejected by STACK.md and D2: a second read path that cannot `set_config` transaction-locally. supabase-js stays Auth / Storage / Realtime |
| WAE | Sentry / paid APM for p50 | Secrets matrix and subprocessor list (ADR-010) would have to add a vendor for a percentile WAE already computes. Sentry (if already planned) is for errors, not this gate |
| Placement Hints | Smart Placement | Learns slowly, solves "which of several backends" — we have one |
| Placement Hints | Regional Services / Data Localization Suite | Enterprise add-on; residency, not latency; does not cover Queues/Cron (`02-RESEARCH.md` Lane 7). Not this phase's latency tool |
| Vitest node | Playwright | Four viewport projects make `N` ambiguous (`isolation-proof.md` §7.1) |
| Vitest node | `@cloudflare/vitest-pool-workers` | Cannot see Hyperdrive. Right tool for Worker unit tests that do not need the pool |
| Probe Worker | A `/api/__probe` route in `apps/web` | One missed env var away from an unauthenticated `SELECT` on `bookings` (`isolation-proof.md` §5) |

**Installation (plan time, not this session):**

```bash
pnpm add -D -w vitest
pnpm --filter @vamos/db add postgres
# undici: only if Node 22's global fetch cannot take setGlobalDispatcher in the harness
```

Re-verify versions with `npm view <package> version` at plan time.
`@opennextjs/cloudflare` moves fast — use whatever Phase 1 pinned.

## Package Legitimacy Audit

| Package | Registry | Notes | Verdict |
|---------|----------|-------|---------|
| `postgres` | npm, porsager/postgres | Long-established, Cloudflare's documented Hyperdrive driver | Approved — already the stack decision |
| `vitest` | npm, VoidZero / Vite | Standard 2026 unit runner; already the obvious choice for Phase 4 rounding tests too | Approved |
| `undici` | npm, Node.js project | Node's own HTTP client; or use the bundled copy | Approved if needed |
| `jose` | npm | Phase 2 already chose it over supabase-js `getClaims()` | Approved — do not re-open |
| Workers Analytics Engine | Cloudflare platform | Not an npm package | Approved as the no-APM instrument |

No new `[SUS]` / `[SLOP]` packages. Do not add an ORM, a query builder, or
a second SQL client.

---

## Architecture Patterns

### System Architecture Diagram

```
Browser / Route Handler / Server Component / Queue consumer / Cron
      │
      ▼
OpenNext Worker  (placement.region = aws:eu-central-1, fetch handlers only)
 │
 │  getCloudflareContext().env
 │
 ├── public content ── publicSql(env)
 │         │
 │         ▼
 │   env.HYPERDRIVE                (vamos_public, cacheable)
 │         │
 │         ▼
 │   Hyperdrive Endpoint  ── cache hit? return; else origin
 │
 └── identity-scoped ── asCustomer|asStaff|asGuest|asAnon(env, …)
           │                writes WAE DB_LATENCY
           ▼
     withIdentity(cs, kind, claims, fn)     [@vamos/db]
           │  postgres(cs, { max:1, fetch_types:false, prepare:true })
           │  sql.begin:
           │    [probe? residue SELECT]
           │    set_config('role', PG_ROLE[kind], true)
           │    set_config('request.jwt.claims' | 'request.vamos.manage_token_hash', …, true)
           │    fn(tx)
           │  COMMIT  (ROLLBACK on throw)
           ▼
     env.HYPERDRIVE_NOCACHE         (vamos_edge, --caching-disabled)
           │
           ▼
     Hyperdrive Endpoint  (transaction-mode pool, RESET on return —
                           not the security boundary)
           │
           ▼
     Supabase Postgres  eu-central-1  :5432  (never :6543)
           login: vamos_edge NOINHERIT, zero table grants
           SET LOCAL ROLE → anon | authenticated | vamos_staff | vamos_guest
           RLS policies read app.uid() / app.jwt() / app.manage_token_hash()

Forgotten wrapper / lost BEGIN:
     vamos_edge SELECT → 42501     (D2, D30)

DATA-06 probe (staging only):
     apps/isolation-probe  ── same withIdentity, opts.probe: true
     dedicated Hyperdrive config origin-connection-limit=5
     NC1–NC6 + adjacency S
```

### Recommended Project Structure

```
packages/db/
├── src/
│   ├── identity.ts          # withIdentity, PG_ROLE, claimsForSql, IdentityKind
│   ├── public.ts            # publicSql(connectionString) — used by apps/web wrapper
│   └── verify.ts            # verifyAccessToken (Phase 2 contract; probe imports it)
├── test/
│   ├── local/
│   │   └── connection-reuse.test.ts
│   ├── deployed/
│   │   ├── config-preconditions.test.ts
│   │   ├── negative-controls.test.ts
│   │   └── data-06-isolation.test.ts   # skipped unless PROBE_BASE_URL set
│   ├── fixtures/two-customers.ts
│   └── support/{drive,hyperdrive-metrics}.ts
├── mutants/{M1_grant_layer_removed,M2_policy_predicate_weakened}.sql
├── scripts/mutation-gate.mjs
├── supabase/tests/{fail_closed,cross_claim,set_local_without_begin}.test.sql
└── vitest.config.ts

apps/web/
├── lib/db/
│   ├── identity.ts          # asCustomer/asStaff/asGuest/asAnon + WAE
│   └── public.ts            # publicSql(env) → packages/db
├── wrangler.jsonc           # dual hyperdrive, placement, DB_LATENCY
└── app/**/route.ts          # getCloudflareContext, force-dynamic

apps/isolation-probe/        # staging only; no production env
├── src/index.ts
└── wrangler.jsonc
```

### Pattern 1: One short transaction per request, identity bound inside it

**What:** `asCustomer(env, claims, fn)` opens one `BEGIN`, binds role and
claims with `is_local => true`, runs `fn`, commits. One logical unit of
work — a status transition plus its `booking_events` row is one
transaction; a Stripe webhook fan-out is not (`02-RESEARCH.md` Lane 1).
**When to use:** every identity-scoped read or write.
**When not to use:** public content (`publicSql`); work that must run after
the response (`waitUntil` must call `withIdentity` itself, not capture
`tx`).

### Pattern 2: Grants first, policies second, wrapper as the only door

**What:** `vamos_edge` holds nothing. Forgetting the wrapper is `42501`,
not a leak. Policies filter; they are not the boundary (D2).
**When to use:** always. There is no second door.

### Pattern 3: Two bindings, two login roles, cache as a property of the *path*

**What:** identity/transactions/auth/permission/billing →
`HYPERDRIVE_NOCACHE`. Cacheable public content → `HYPERDRIVE`. Never issue
an identity query on the cached binding (NC6).
**When to use:** every new query chooses a path by whether it needs a role.

### Pattern 4: Probe the shipped function, not a copy

**What:** `apps/isolation-probe` imports `@vamos/db`'s `withIdentity` with
`opts.probe: true`. Production never sets the flag.
**When to use:** DATA-06 only.

### Anti-Patterns to Avoid

- Module-scope `postgres(...)` (second-request I/O error; silent on first).
- `prepare: false` (silently disables Hyperdrive's cache).
- `sql.end()` / `idle_timeout` on a per-request client.
- `wrangler secret put` for the database password.
- Port 6543, anywhere.
- Local Worker login as `postgres` once roles exist (`BYPASSRLS`).
- Smart Placement for a single Frankfurt database.
- Probe routes in `apps/web`.
- Playwright for the isolation suite.
- Asserting DATA-05 from Cloudflare's marketing RTT.
- Declaring DATA-06 passed because "the rows looked right" with no `S`.
- A negative-control job that is allowed to stay green.
- Returning `tx` from the `withIdentity` callback.
- `sql.reserve()` in `apps/**`.
- Reading `user_metadata` in a policy or in `claimsForSql`.
- Inventing a CHF figure in a fixture.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Connection pooling from a Worker to Postgres | A module-scope pool, `pg-pool`, a custom multiplexer | Hyperdrive, two configs | The platform *is* the pooler; a second pool fights it and re-introduces session leakage |
| Request-scoped identity on a pooled connection | App-level "remember to SET ROLE"; a thread-local | `withIdentity` + D1 `SET LOCAL` + D2 grants | Postgres reverts `SET LOCAL` at COMMIT/ROLLBACK; Hyperdrive `RESET` is not the boundary |
| p50 latency | A CSV of `Date.now()` scraped from Logs; a paid APM for this one number | Workers Analytics Engine `quantileExactWeighted` | Free, built-in, actual percentile (`hyperdrive-wiring.md` §4.3) |
| Token verify on the probe | Hand-rolled HMAC; injecting claims past verify | Existing `jose` + JWKS path from Phase 2 | A faked token would make DATA-06 test the fixture, not the app |
| Isolation runner | Playwright API tests; a bash `curl` loop | Vitest `node` + undici Agent | Viewport multiplication / unpinned sockets make `N` and `peakInFlight` meaningless |
| Fail-closed proof | A comment that `vamos_edge` has no grants | pgTAP enumerating `pg_class` + NC3 + mutant M1 | A table added in Phase 5 must not escape the enumeration (`isolation-proof.md` §10) |
| Query builder / ORM | Drizzle, Kysely, Prisma against Hyperdrive | Tagged-template postgres.js | Stack decision. Types come from `supabase gen types` (D23), consumed by hand |

**Key insight:** the security property is in Postgres (grants + `SET LOCAL`).
The test's job is to prove those mechanisms are in force in the deployed
artefact, not to search for leaks. Hand-rolling a pool, a SET helper, or a
green-only suite would all put the boundary back in application discipline.

---

## Common Pitfalls

### Pitfall 1: Module-scope postgres.js is silent on the first request
**What goes wrong:** the client is constructed at import time, the first
preview request works, the second throws `Cannot perform I/O on behalf of
a different request`.
**Why it happens:** isolate reuse + per-request I/O context
(`hyperdrive-wiring.md` §2.1).
**How to avoid:** construct inside `withIdentity` / `publicSql` only. The
warm-Worker DATA-06 run is the regression test.
**Warning signs:** a smoke test that only cold-starts; a helper file with
`const sql = postgres(...)` at the top level.

### Pitfall 2: Port 6543, or port 5432 against `supabase start`
**What goes wrong:** Hyperdrive in front of Supavisor is a pooler in front
of a pooler (session-mode surprises, prepared-statement breakage). Locally,
5432 is not where `supabase start` listens (54322), so `wrangler dev`
connects to nothing — or to an unrelated Postgres.
**Why it happens:** Supabase's dashboard copies the pooled string by
default; Phase 1's wrangler placeholder used 5432
(`02-RESEARCH.md` Lane 6).
**How to avoid:** D26, D34. Config preconditions assert `origin.port ===
"5432"` on the *remote* config (`isolation-proof.md` §12).

### Pitfall 3: `prepare: false` "to be safe with RLS"
**What goes wrong:** Hyperdrive's query cache turns off; public content
path pays origin every time; identity path is not safer for it.
**Why it happens:** folklore from session-mode poolers.
**How to avoid:** D27. Plan-cache invalidation on role change is the actual
safety (`02-RESEARCH.md` Lane 1). Assert `prepare: true` in source
(`isolation-proof.md` §12).

### Pitfall 4: Placeholder Hyperdrive UUID fails `wrangler deploy`
**What goes wrong:** staging currently omits the binding for this reason;
putting `"id": "00000000-0000-0000-0000-000000000000"` back will fail the
existing deploy job.
**Why it happens:** wrangler validates Hyperdrive ids against the API
(`hyperdrive-wiring.md` §1.1; wrangler.jsonc comment).
**How to avoid:** do not bind a fake id. P3 lands `localConnectionString`
and the placement/WAE blocks; P6 lands real ids. Until P6, staging stays
omitted.

### Pitfall 5: `getCloudflareContext()` during SSG
**What goes wrong:** `next build` runs the identity path against local
bindings, or throws, or bakes a customer's query into a static page.
**Why it happens:** no request, so OpenNext returns dev values
(`hyperdrive-wiring.md` §2.3b).
**How to avoid:** D36 `force-dynamic` grep. Never import `@/lib/db/identity`
from a statically generated route.

### Pitfall 6: Treating a local timing as DATA-05
**What goes wrong:** `Date.now()` around `withIdentity` against
`127.0.0.1:54322` prints 3 ms; the phase is marked done; the first US-PoP
hit against Frankfurt is 120 ms.
**Why it happens:** the whole margin is placement (`hyperdrive-wiring.md`
§4.1).
**How to avoid:** D32. Staging p50 is **DEFERRED** until measured from the
placed Worker via WAE.

### Pitfall 7: A green isolation test with `S = 0`
**What goes wrong:** 2000 requests, all correct rows, Hyperdrive happened
to hand out unused origin connections, no backend was shared, nothing was
proved.
**Why it happens:** Hyperdrive reuse is probabilistic unless the pool is
capped and concurrency exceeds it (`isolation-proof.md` §0, §8).
**How to avoid:** V4 asserts `S` against a floor; below-floor is
INCONCLUSIVE, not PASS. Probe config `origin-connection-limit=5`.

### Pitfall 8: Negative controls that are allowed to pass
**What goes wrong:** NC1 returns zero residue, zero `42501`, zero leaks
because Hyperdrive `RESET` happened to clear session GUCs; the suite is
declared sound; a future Hyperdrive change stops resetting and there is no
alarm.
**Why it happens:** the control was written as "assert no leak" instead of
"assert the bug is visible" (`isolation-proof.md` §9 NC1).
**How to avoid:** D38. NC1 must produce evidence. Zero evidence escalates
as U27, it does not pass. Mutants must turn pgTAP red.

### Pitfall 9: `sql.reserve()` leaking into app code
**What goes wrong:** a connection is pinned across queries; session `SET`
starts working; D1's transaction assumption is silently false.
**Why it happens:** the local simulator requires `reserve()`; copy-paste
into a route (`isolation-proof.md` §2 mode 12).
**How to avoid:** CI grep `reserve(` under `apps/**`. Allow-list only
`packages/db/test/local`.

### Pitfall 10: Capturing `tx` in `waitUntil`
**What goes wrong:** the response returns, COMMIT runs, `waitUntil` then
queries on a finished transaction — or, if COMMIT was skipped, holds a
backend for 30 s with identity still bound (mode 10).
**Why it happens:** the request context stays alive
(`isolation-proof.md` §2 mode 10).
**How to avoid:** `fn` returns data, never `tx`. `waitUntil` work calls
`withIdentity` itself (NC5).

### Pitfall 11: Connecting locally as `postgres` after roles exist
**What goes wrong:** `BYPASSRLS`; every policy appears to pass; `42501`
never fires; P2's fail-closed tests are the only thing still telling the
truth, and only when they log in as `vamos_edge`.
**Why it happens:** Phase 1's placeholder is `postgres:postgres@5432`
(`hyperdrive-wiring.md` §1.4).
**How to avoid:** D34 once Phase 2 P1 lands.

### Pitfall 12: Inventing a CHF figure to make a booking fixture look complete
**What goes wrong:** Law 4 violation; fidelity grep; a reviewer treats the
number as a real fare.
**Why it happens:** empty-feeling test data.
**How to avoid:** D40. NULL prices, `CHF 000` by data. Do not reintroduce
an invented fare as an illustrative example — the fidelity grep looks for
that class of number.

---

## Code Examples

Copied from the harvested lanes, relocated per D28. This is the wrapper
Phase 3 lands — not a third design.

### 1. `withIdentity` — `packages/db/src/identity.ts`

From `hyperdrive-wiring.md` §3 (PG_ROLE, claims stripping, four actors,
throw/ROLLBACK, `42501` contract) and `isolation-proof.md` §6 (location,
`connectionString`, no `sql.end()`, closed map, U2 fallback comment), with
D37's `opts.probe`.

```ts
// packages/db/src/identity.ts
import postgres from "postgres";

export type IdentityKind = "anon" | "customer" | "staff" | "guest";

export interface VamosClaims {
  sub: string;
  role: "anon" | "authenticated";
  aal?: "aal1" | "aal2" | "aal3";
  email?: string;
  session_id?: string;
  app_metadata?: { vamos_role?: "dispatcher" | "admin"; [k: string]: unknown };
}

const PG_ROLE = {
  anon: "anon",
  customer: "authenticated",
  staff: "vamos_staff",
  guest: "vamos_guest",
} as const satisfies Record<IdentityKind, string>;

type ClaimsFor<K extends IdentityKind> =
  K extends "customer" | "staff" ? VamosClaims :
  K extends "guest" ? { manageTokenHashHex: string } :
  undefined;

export function claimsForSql(c: VamosClaims): string {
  // user_metadata is user-writable via the client SDK — stripped, not trusted.
  return JSON.stringify({
    sub: c.sub, role: c.role, aal: c.aal ?? "aal1",
    email: c.email, session_id: c.session_id,
    app_metadata: c.app_metadata ?? {},
  });
}

function client(connectionString: string) {
  return postgres(connectionString, {
    max: 1,
    fetch_types: false,
    prepare: true,
    connect_timeout: 10,
  });
}

const ENTRY_PROBE = `select current_user as user_at_entry,
       coalesce(nullif(current_setting('request.jwt.claims', true), ''), 'EMPTY') as claims_at_entry,
       pg_backend_pid() as pid,
       clock_timestamp() as t0`;

/**
 * The ONLY entry point to identity-scoped data (D1+D2). Opens one explicit
 * transaction, binds role and claim transaction-locally via set_config(…,
 * is_local=true), runs the caller's queries, commits. On throw, postgres.js's
 * sql.begin() issues ROLLBACK automatically and rethrows the original error
 * unmodified — a PostgresError carries the SQLSTATE on `.code`.
 * Never call sql.end() — Workers-to-Hyperdrive connections are cleaned up
 * at request end.
 * `fn` returns DATA, never `tx`.
 *
 * U2 fallback (unused until the check runs): if set_config('role', $1, true)
 * is not SET LOCAL ROLE, replace the first bind with
 * `await tx.unsafe('set local role ' + PG_ROLE[kind])` — injection-free
 * because PG_ROLE is a closed map.
 */
export async function withIdentity<K extends IdentityKind, T>(
  connectionString: string,
  kind: K,
  claims: ClaimsFor<K>,
  fn: (tx: postgres.TransactionSql) => Promise<T>,
  opts?: { probe?: boolean },
): Promise<T> {
  const sql = client(connectionString);
  return sql.begin(async (tx) => {
    if (opts?.probe) {
      await tx.unsafe(ENTRY_PROBE);
    }

    // 1. Drop to the least-privileged role. Bound parameter, extended protocol.
    await tx`select set_config('role', ${PG_ROLE[kind]}, true)`;

    // 2. Bind the identity the policies read. Postgres reverts this at
    //    COMMIT or ROLLBACK unconditionally — Hyperdrive's pool RESET is
    //    not what makes this safe.
    if (kind === "customer" || kind === "staff") {
      await tx`select set_config('request.jwt.claims',
        ${claimsForSql(claims as VamosClaims)}, true)`;
    } else if (kind === "guest") {
      await tx`select set_config('request.vamos.manage_token_hash',
        ${(claims as { manageTokenHashHex: string }).manageTokenHashHex}, true)`;
    }
    // kind === "anon": no claim to set.

    return fn(tx);
  });
}
```

`ENTRY_PROBE` is a module constant with no interpolation. The CI grep that
bans `sql.unsafe(` in `apps/web` must not also cover this one call, or it
is allow-listed by comment (`isolation-proof.md` §5.2).

### 2. Named wrappers + WAE — `apps/web/lib/db/identity.ts`

From `hyperdrive-wiring.md` §3 (wrappers) and §4.3 (WAE), adapted to call
the packages/db core (D28, D32).

```ts
// apps/web/lib/db/identity.ts
import {
  withIdentity as withIdentityCore,
  type IdentityKind,
  type VamosClaims,
} from "@vamos/db/identity";
import type postgres from "postgres";

export type { IdentityKind, VamosClaims };

type ClaimsFor<K extends IdentityKind> =
  K extends "customer" | "staff" ? VamosClaims :
  K extends "guest" ? { manageTokenHashHex: string } :
  undefined;

export async function withIdentity<K extends IdentityKind, T>(
  env: CloudflareEnv,
  kind: K,
  claims: ClaimsFor<K>,
  fn: (tx: postgres.TransactionSql) => Promise<T>,
): Promise<T> {
  const t0 = Date.now();
  try {
    const result = await withIdentityCore(
      env.HYPERDRIVE_NOCACHE.connectionString, kind, claims, fn,
    );
    env.DB_LATENCY?.writeDataPoint({
      blobs: [kind, "ok"],
      doubles: [Date.now() - t0],
      indexes: [kind],
    });
    return result;
  } catch (err) {
    env.DB_LATENCY?.writeDataPoint({
      blobs: [kind, (err as { code?: string })?.code ?? "unknown"],
      doubles: [Date.now() - t0],
      indexes: [kind],
    });
    throw err;
  }
}

export const asCustomer = <T,>(env: CloudflareEnv, claims: VamosClaims,
  fn: (tx: postgres.TransactionSql) => Promise<T>) =>
  withIdentity(env, "customer", claims, fn);

export const asStaff = <T,>(env: CloudflareEnv, claims: VamosClaims,
  fn: (tx: postgres.TransactionSql) => Promise<T>) =>
  withIdentity(env, "staff", claims, fn);

export const asGuest = <T,>(env: CloudflareEnv, manageTokenHashHex: string,
  fn: (tx: postgres.TransactionSql) => Promise<T>) =>
  withIdentity(env, "guest", { manageTokenHashHex }, fn);

export const asAnon = <T,>(env: CloudflareEnv,
  fn: (tx: postgres.TransactionSql) => Promise<T>) =>
  withIdentity(env, "anon", undefined, fn);
```

### 3. `publicSql` — cached path

From `hyperdrive-wiring.md` §3.

```ts
// packages/db/src/public.ts
import postgres from "postgres";

export function publicSql(connectionString: string) {
  return postgres(connectionString, {
    max: 5, fetch_types: false, prepare: true, connect_timeout: 10,
  });
}

// apps/web/lib/db/public.ts
import { publicSql as publicSqlCore } from "@vamos/db/public";

export function publicSql(env: CloudflareEnv) {
  return publicSqlCore(env.HYPERDRIVE.connectionString);
}
```

### 4. Forgotten wrapper → `42501`

From `hyperdrive-wiring.md` §3.1.

```ts
import postgres from "postgres";
const sql = postgres(env.HYPERDRIVE_NOCACHE.connectionString);
await sql`select * from public.bookings`;
// PostgresError { code: "42501" }  — 500, not another customer's rows.
```

### 5. OpenNext Route Handler

From `hyperdrive-wiring.md` §2.3a.

```ts
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { asCustomer } from "@/lib/db/identity";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { env } = getCloudflareContext();
  const claims = await requireCustomer(request, env);
  const bookings = await asCustomer(env, claims, (tx) =>
    tx`select reference, status from public.bookings order by pickup_at desc`
  );
  return Response.json(bookings);
}
```

Customer-visible errors this handler later maps (Phase 5) are i18n keys
with de/fr/ar in the same pass — never English-only prose, never a
concatenated German string (Swiss German uses "ss", never the Eszett). This
phase does not introduce customer-facing copy.

### 6. `wrangler.jsonc` — both configs, placement, WAE

From `hyperdrive-wiring.md` §1.3, §4.2, §4.3, with D34's local port/role.
Real `id` values land in P6; until then staging omits the hyperdrive array
so deploy does not fail UUID validation.

```jsonc
{
  "env": {
    "staging": {
      "name": "vamos-web-staging",
      "workers_dev": true,
      "vars": { "DEPLOY_ENV": "staging" },
      "placement": { "region": "aws:eu-central-1" },
      "analytics_engine_datasets": [
        { "binding": "DB_LATENCY", "dataset": "vamos_db_latency" }
      ],
      "hyperdrive": [
        {
          "binding": "HYPERDRIVE",
          "id": "<public config id from wrangler hyperdrive create>",
          "localConnectionString": "postgres://vamos_public:vamos_public@127.0.0.1:54322/postgres"
        },
        {
          "binding": "HYPERDRIVE_NOCACHE",
          "id": "<rls config id from wrangler hyperdrive create --caching-disabled>",
          "localConnectionString": "postgres://vamos_edge:vamos_edge@127.0.0.1:54322/postgres"
        }
      ]
    },
    "production": {
      "name": "vamos-web-production",
      "placement": { "region": "aws:eu-central-1" },
      "analytics_engine_datasets": [
        { "binding": "DB_LATENCY", "dataset": "vamos_db_latency" }
      ],
      "hyperdrive": [
        {
          "binding": "HYPERDRIVE",
          "id": "<production public config id>",
          "localConnectionString": "postgres://vamos_public:vamos_public@127.0.0.1:54322/postgres"
        },
        {
          "binding": "HYPERDRIVE_NOCACHE",
          "id": "<production rls config id>",
          "localConnectionString": "postgres://vamos_edge:vamos_edge@127.0.0.1:54322/postgres"
        }
      ]
    }
  }
}
```

Create-time (credentials never enter this file):

```sh
npx wrangler hyperdrive create vamos-rls-staging \
  --connection-string="postgres://vamos_edge:${VAMOS_EDGE_PW}@db.<ref>.supabase.co:5432/postgres" \
  --caching-disabled
npx wrangler hyperdrive update <RLS_CONFIG_ID> --origin-connection-limit=25

npx wrangler hyperdrive create vamos-public-staging \
  --connection-string="postgres://vamos_public:${VAMOS_PUBLIC_PW}@db.<ref>.supabase.co:5432/postgres"
npx wrangler hyperdrive update <PUBLIC_CONFIG_ID> --origin-connection-limit=15
```

### 7. Isolation-probe binding (staging only)

From `isolation-proof.md` §5.1. No production environment.

```jsonc
{
  "name": "vamos-isolation-probe-staging",
  "main": "src/index.ts",
  "compatibility_date": "2026-08-20",
  "compatibility_flags": ["nodejs_compat"],
  "workers_dev": true,
  "placement": { "region": "aws:eu-central-1" },
  "vars": { "DEPLOY_ENV": "staging" },
  "hyperdrive": [
    {
      "binding": "HYPERDRIVE_NOCACHE",
      "id": "<probe cache-disabled config, origin-connection-limit=5>",
      "localConnectionString": "postgres://vamos_edge:vamos_edge@127.0.0.1:54322/postgres"
    },
    {
      "binding": "HYPERDRIVE_APP",
      "id": "<app cache-disabled config, confirming run>",
      "localConnectionString": "postgres://vamos_edge:vamos_edge@127.0.0.1:54322/postgres"
    },
    {
      "binding": "HYPERDRIVE_CACHED",
      "id": "<app cached config, NC6>",
      "localConnectionString": "postgres://vamos_public:vamos_public@127.0.0.1:54322/postgres"
    }
  ]
}
```

### 8. Primary negative control (NC1) — the suite must go red

From `isolation-proof.md` §9. Session-scoped `SET`, no transaction. At
least one of residue / orphaned `42501` / leaked foreign row must appear.
Zero evidence is U27, not a pass.

```ts
it("NC1 · session-scoped SET without a transaction is broken", async () => {
  const { results } = await drive({
    baseUrl: BASE, secret: SECRET, impl: "session",
    identities: { a, b }, requests: 400, concurrency: 32,
  });
  const residue  = results.filter((r) => r.claimsAtEntry !== "EMPTY" || r.userAtEntry !== "vamos_edge");
  const orphaned = results.filter((r) => r.sqlstate === "42501");
  const leaked   = results.filter((r) => {
    const other = r.customer === "a" ? b : a;
    return r.rows?.some((x) => other.references.includes(x.reference)) ?? false;
  });
  expect(
    { residue: residue.length, orphaned: orphaned.length, leaked: leaked.length },
    "session impl looked SAFE — Hyperdrive RESET is masking failure mode #1.",
  ).not.toEqual({ residue: 0, orphaned: 0, leaked: 0 });
});
```

NC3, the fail-closed proof of D2, from the same section:

```ts
it("NC3 · a query with NO wrapper at all raises 42501", async () => {
  const res = await fetch(`${BASE}/probe?impl=nowrapper`, {
    headers: { "x-vamos-probe": SECRET, authorization: `Bearer ${a.accessToken}` },
  });
  const body = await res.json() as { sqlstate?: string; n?: number };
  expect(body.n, "vamos_edge returned a row count. THE ENTIRE DESIGN IS VOID.").toBeUndefined();
  expect(body.sqlstate).toBe("42501");
});
```

The connection-reuse simulator, residue probe, adjacency helper, fixture
(no amounts, `CHF 000` by data), and mutation SQL are in
`isolation-proof.md` §4.2, §3, §7.3, §7.2, §9.6 — land them verbatim in P2
and P4. Do not re-author a weaker copy.

### 9. WAE percentile query (DATA-05, deferred)

From `hyperdrive-wiring.md` §4.3.

```sql
SELECT
  blob1 AS identity_kind,
  quantileExactWeighted(0.5)(double1, _sample_interval) AS p50_ms,
  quantileExactWeighted(0.95)(double1, _sample_interval) AS p95_ms,
  count() AS n
FROM vamos_db_latency
WHERE timestamp > NOW() - INTERVAL '1' DAY
GROUP BY blob1
```

Until a staging Worker has written points, this query is empty and DATA-05
is **DEFERRED**. Do not substitute a local `Date.now()` delta.

---

## DATA-05 / DATA-06 restated against the requirements

**DATA-05** (REQUIREMENTS.md, verbatim): *Application queries reach
Postgres through Hyperdrive on the direct connection string, with p50
round-trip under 30 ms from the staging Worker.*

- Direct string: D26, asserted in config preconditions (`origin.port ===
  5432`).
- p50 < 30 ms: D31 + D32, **measured in P6 or recorded DEFERRED**. Expected
  nearby range is single-digit to low-teens ms; that is an expectation, not
  a measurement.

**DATA-06** (REQUIREMENTS.md, verbatim): *Request-scoped auth context
cannot leak between requests sharing a pooled connection.*

- Structural: D1 + D2 + D28–D30 + D37.
- Proof: D33 + D38. Local simulator first (P2). Deployed concurrent
  two-customer run with `S` floor and NC1-must-go-red in P6.
- A local green simulator is not "two concurrent requests against the
  pooled connection." It is the Postgres half. The ROADMAP success
  criterion names the pooled connection; that half waits on P6.

ROADMAP.md Phase 3 success criteria map 1:1 onto DATA-05 and DATA-06.
Neither is claimed passed by this document.
