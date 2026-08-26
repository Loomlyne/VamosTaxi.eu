# Phase 3 · DATA-06 — the concurrent two-customer isolation proof

**Lane:** `isolation-proof` · **Date:** 2026-08-22 · **Scope:** Phase 3, success criterion 2 only.
**Builds on (does not re-litigate):** D1, D2, D3, D19 and `research/rls-hyperdrive.md` §5/§7.

---

## 0. Verdict up front

The DATA-06 criterion as written in `ROADMAP.md` — *"two concurrent requests as two different customers, run against the pooled connection, never see each other's row — proven by a concurrent two-customer isolation integration test"* — is **not provable by the test it names**, on its own. Two concurrent requests that return correct rows prove nothing unless you also prove **that the two requests actually shared a physical Postgres backend**. Without that, a green run is indistinguishable from a run where Hyperdrive happened to hand out two separate origin connections, which is the trivial case.

So the proof has three parts, and all three must be present or the gate is theatre:

1. **A coverage measurement** that turns "we ran N requests" into "we observed S occasions on which customer B's transaction ran on the *same backend PID* that had just served customer A" — with `S` asserted, and a run where `S` is too low reported as **INCONCLUSIVE**, not PASS.
2. **A residue probe as the first statement inside every transaction**, reading `current_user` and `current_setting('request.jwt.claims', true)` *before* the role and claims are bound. On a re-used connection this is the only statement that can ever see the previous request's identity.
3. **Negative controls that the suite must go red against** — one runtime variant (session-scoped `SET`, no transaction), one lost-`BEGIN` variant, one no-wrapper variant, and two *migration mutants* (grant layer removed, policy predicate weakened) run against a scratch local database.

Everything else — the grant layer, `SET LOCAL`, Postgres' own plan-cache invalidation — is what makes the leak structurally impossible. The test's job is to prove those mechanisms are actually in force in the deployed artefact, not to search for leaks.

One hard fact up front: **none of the deployed half of this proof can be executed today.** There is no Cloudflare account and no Supabase project. Everything in §5–§8 is design that must be *run* before Phase 3 can be marked done; §4 and §9 can be run on a laptop the moment Phase 2's migrations land.

---

## 1. What is actually being excluded

Hyperdrive is a **transaction-mode pooler with a single global Endpoint next to the origin database**, shared across every Worker on the account that binds that config:

> "when a client is ready to send a query or open a transaction, it is assigned a connection on which to do so. This connection will be returned to the pool when the query or transaction concludes." — [Pools across the sea](https://blog.cloudflare.com/how-hyperdrive-speeds-up-database-access/)

> "Once Endpoint has these results, the connection is immediately returned to the pool." — same

> "a single Worker invocation may obtain **multiple connections** to perform its database operations and may need to `SET` any configurations for every query or transaction." — [Connection pooling](https://developers.cloudflare.com/hyperdrive/concepts/connection-pooling/)

Two consequences that shape the whole proof:

- **Outside a transaction, the connection is released between every single query.** So a session-scoped `SET` is not merely unsafe — it is *non-functional*: the `set_config` and the `SELECT` that depends on it can land on different backends. This is a much sharper indictment of the rejected option than "it might leak", and it gives the negative control a second, deterministic signal (§9.1).
- **Inside a transaction, one backend is held for its duration**, and `SET LOCAL` is reverted by Postgres at `COMMIT` *or* `ROLLBACK` — "the effects of `SET LOCAL` last only till the end of the current transaction, whether committed or not" ([PG 17 SET](https://www.postgresql.org/docs/17/sql-set.html)).

The failure being excluded is therefore precise: **request-scoped identity state surviving on a backend into the next transaction that Hyperdrive assigns to that backend.**

---

## 2. Enumeration of every survival path

| # | Path by which identity could survive into the next request on the same backend | Prevented structurally by | Caught only by a test? |
|---|---|---|---|
| **1** | Plain `SET` / `set_config(k, v, false)` instead of `SET LOCAL` | **No.** D1 mandates `is_local => true` but nothing in Postgres or Hyperdrive stops a developer writing `false`. Mitigated by grants (D2) only in the *forgotten-wrapper* case, not this one | **Yes** — plus the CI grep gate in `rls-hyperdrive.md` §5 P3 and an ESLint `no-restricted-imports` fence. This is failure mode #1 and the primary negative control (§9.1) |
| **2** | Transaction left open by an early `return` from the route handler before the `withIdentity` promise settles | Partly: the Workers runtime tears the isolate's I/O down at request end without `waitUntil`, closing the client→Hyperdrive socket mid-transaction. What the **Endpoint** then does with the origin connection is undocumented | **Yes** — `impl=abandon` control (§9.4). This is carried-forward uncertainty **U-I3** |
| **3** | A throw inside the transaction callback | **Yes.** postgres.js: "if anything fails `ROLLBACK` will be called so the connection can be released" ([postgres.js README](https://github.com/porsager/postgres)). And `SET LOCAL` reverts on ROLLBACK too | No |
| **4** | A `BEGIN` that never happens (wrapper refactored away, `sql` used instead of `tx`) | **Yes, doubly.** `SET LOCAL` outside a transaction block "emits a warning and otherwise has no effect" — so identity is *not set*; then `vamos_edge`'s zero grants raise `42501` (D2) | Confirmed by `impl=nobegin` (§9.3) and pgTAP `fail_closed.test.sql` |
| **5** | Connection returned to pool mid-transaction (request aborted, 30 s `waitUntil` ceiling hit, isolate killed, 60 s Hyperdrive query ceiling) | Partly. Docs say only "the connection is `RESET`", and `RESET ALL` is *not* `DISCARD ALL` and cannot run inside a failed transaction block. Whether Hyperdrive discards such a connection instead is undocumented | **Yes** — §9.4. **U-I3** |
| **6** | Prepared-statement plan reuse carrying another role's RLS rewrite | **Yes.** Hyperdrive re-prepends `Parse` per connection ([blog](https://blog.cloudflare.com/postgres-named-prepared-statements-supported-hyperdrive/)) and `plancache.c` invalidates on `rewriteRoleId != GetUserId()` / `dependsOnRole`. Keep `prepare: true` | No — but assert `prepare` is not disabled (§12) |
| **7** | postgres.js pipelining (`sql.begin(tx => [...])`) reordering the `set_config` after the read | **Yes.** Extended-protocol messages execute in order on one backend; the whole array is inside the same `BEGIN`/`COMMIT` | No |
| **8** | A pipelined batch issued *outside* a transaction | No — same class as #1 | **Yes** (§9.1) |
| **9** | An unawaited query promise resolving after `COMMIT` on the transaction's `sql` handle | Partly: "queries are first executed when `awaited`". A `.execute()`d-and-dropped query is not covered | **Yes**, and structurally fenced by never letting `tx` escape `withIdentity`'s callback (the callback returns *data*, never `tx`) |
| **10** | `ctx.waitUntil` work running after the response, on a client created during the request | No. The request context stays alive up to 30 s after the response ([Context](https://developers.cloudflare.com/workers/runtime-apis/context/)), so a captured `tx` is still usable | **Yes** — `impl=waituntil` control (§9.5). Fence: `waitUntil` work must call `withIdentity` itself |
| **11** | Client cached in module scope and reused across requests | **Yes.** Hard runtime error: `Cannot perform I/O on behalf of a different request` / `Disallowed operation called within global scope` ([Troubleshooting](https://developers.cloudflare.com/hyperdrive/observability/troubleshooting/)) | No |
| **12** | `sql.reserve()` pinning one connection across non-transactional queries | No — reserving re-creates session-scoped semantics | **Yes**; banned by the CI grep gate. *Required* in the local simulator (§4.2), forbidden in `apps/**` |
| **13** | Identity query issued on the **cached** `HYPERDRIVE` binding, cache serving A's rows to B | **Yes.** That binding logs in as `vamos_public`: no role memberships, no grant on `bookings` → `42501`. Belt: identity queries are in transactions, and `cacheStatus` enumerates `transaction` as a non-cached outcome | Assert `cacheStatus` never `hit` on the no-cache config (§12) |
| **14** | Next.js / React memoisation caching a *result set* across requests in the same isolate (a module-level `Map`, `unstable_cache`, an OpenNext incremental-cache entry keyed without the customer) | **No.** This is not a Postgres leak at all and no SQL mechanism sees it | **Yes.** Not covered by DATA-06's wording; §11.3 adds an assertion, and Phase 5 owns the general rule: *no customer-scoped read is ever memoised outside request scope* |
| **15** | `app_metadata` / claim confusion — a valid claim for A satisfying a policy written for B | **Yes.** `customer_id = (select app.uid())`, plus the RESTRICTIVE `bookings_require_identity` policy | pgTAP cross-claim matrix (§11) and the mutant in §9.6 |

**Modes 1, 2, 5, 8, 9, 10, 12 and 14 are test-only.** They are the reason this phase exists.

---

## 3. The two residue signals

Everything hinges on making the transaction report what it found on the backend *before* it bound anything. The first statement inside `BEGIN` is the only place that can observe residue:

```sql
select current_user                                                  as user_at_entry,
       coalesce(nullif(current_setting('request.jwt.claims', true), ''), 'EMPTY')
                                                                     as claims_at_entry,
       pg_backend_pid()                                              as pid,
       clock_timestamp()                                             as t0;
```

- `user_at_entry` must be **`vamos_edge`** on 100 % of probes. Anything else means a prior `SET ROLE` survived — which is simultaneously a leak *and* an answer to U5 (what Hyperdrive's `RESET` actually resets).
- `claims_at_entry` must be **`'EMPTY'`** on 100 % of probes.
- `pid` is the coverage instrument. It is the backend's own PID at the origin, so two probes reporting the same `pid` demonstrably ran on the same physical connection. `pg_backend_pid()` is not cacheable by Hyperdrive under any circumstances (volatile/stable functions are excluded, and the enclosing transaction excludes it regardless) — see [Query caching](https://developers.cloudflare.com/hyperdrive/concepts/query-caching/).
- `t0`/`t1` (`clock_timestamp()` in the first and last statement) come from the **database server's** clock, so ordering across concurrent Worker isolates is well-defined without any client-clock assumption.

The assertion this unlocks is not "no probe saw residue". It is the far narrower and far stronger:

> For every pair of probes *(p, q)* such that `p.pid === q.pid`, `q.t0 > p.t1`, no other probe on that pid falls between them, and `p.customer !== q.customer` — assert `q.user_at_entry === 'vamos_edge'` and `q.claims_at_entry === 'EMPTY'` and `q.rows` contains exactly `q.customer`'s references.

That set of pairs is the **adjacency set**, size `S`. `S` is the real sample size of the experiment. `N` (number of requests) is not.

---

## 4. What runs locally, and what genuinely needs a deployed Worker

### 4.1 Local, against `supabase start`, no Cloudflare account required

`supabase start` exposes Postgres on `127.0.0.1:54322`. `wrangler dev` with `localConnectionString` is **useless for this proof**:

> "When using `localConnectionString`, Hyperdrive's connection pooling and query caching do not take effect." — [Local development](https://developers.cloudflare.com/hyperdrive/configuration/local-development/)

And `@cloudflare/vitest-pool-workers` "Runs tests fully-locally using Miniflare", with remote bindings for Hyperdrive "currently unsupported" ([Local development](https://developers.cloudflare.com/workers/development-testing/)). So **vitest-pool-workers cannot prove DATA-06 either.** Everything local is a Postgres-side proof, and that is fine, because most of the mechanism *is* Postgres-side:

| Provable locally | How |
|---|---|
| Fail-closed grants (`42501` with no wrapper) | pgTAP `fail_closed.test.sql` |
| Lost `BEGIN` fails closed | pgTAP `set_local_without_begin.test.sql` |
| Claim for A never satisfies policy for B | pgTAP cross-claim matrix |
| **Residue on a genuinely re-used connection** | The connection-reuse simulator, §4.2 — *deterministically stronger than the Hyperdrive test* |
| Every negative control that is a migration mutant | §9.6 |

### 4.2 The connection-reuse simulator — the deterministic core

Hyperdrive gives you connection sharing *probabilistically*. `postgres.js`'s `reserve()` gives it to you *with certainty*. This test is banned in application code and mandatory here:

```ts
// packages/db/test/local/connection-reuse.test.ts
// Runs against `supabase start` (127.0.0.1:54322) as vamos_edge. No Cloudflare, no Worker.
//
// Pins ONE physical backend and replays the exact sequence Hyperdrive would produce
// probabilistically: customer A's transaction, then customer B's, then a bare probe.
// Because the connection is pinned, a residue bug fails 100% of the time here — where
// on Hyperdrive it would fail only when the pool happened to reuse the backend.
import { describe, expect, it, beforeAll, afterAll } from "vitest";
import postgres from "postgres";
import { withIdentity, claimsForSql } from "@vamos/db/identity";
import { seedTwoCustomers, type SeededCustomer } from "../fixtures/two-customers";

const EDGE_URL = process.env.VAMOS_EDGE_URL!; // postgres://vamos_edge:...@127.0.0.1:54322/postgres
let a: SeededCustomer, b: SeededCustomer;

beforeAll(async () => { ({ a, b } = await seedTwoCustomers()); });

describe("identity does not survive on a pinned backend", () => {
  it("reverts role and claims at COMMIT, on the same physical connection", async () => {
    const sql = postgres(EDGE_URL, { max: 1, prepare: true, fetch_types: false });
    const conn = await sql.reserve();           // <- pinned: every query below is one backend
    try {
      const [{ pg_backend_pid: pid0 }] = await conn`select pg_backend_pid()`;

      const aRows = await runOnConn(conn, a);
      expect(aRows.entry.user_at_entry).toBe("vamos_edge");
      expect(aRows.entry.claims_at_entry).toBe("EMPTY");
      expect(refs(aRows.rows)).toEqual(a.references);

      const bRows = await runOnConn(conn, b);
      // THE assertion. Same backend, immediately after A committed.
      expect(bRows.entry.pid).toBe(pid0);
      expect(bRows.entry.user_at_entry).toBe("vamos_edge");
      expect(bRows.entry.claims_at_entry).toBe("EMPTY");
      expect(refs(bRows.rows)).toEqual(b.references);
      expect(refs(bRows.rows)).not.toEqual(expect.arrayContaining(a.references));

      // And with no wrapper at all, on that same warm backend: fail closed, not stale rows.
      await expect(conn`select count(*) from public.bookings`).rejects.toMatchObject({
        code: "42501",
      });
      const [{ current_user: who }] = await conn`select current_user`;
      expect(who).toBe("vamos_edge");
    } finally {
      await conn.release();
      await sql.end();
    }
  });
});

/** The exact statement sequence the probe Worker issues, pipelined into one flush. */
async function runOnConn(conn: postgres.ReservedSql, c: SeededCustomer) {
  const r = await conn.begin((tx) => [
    tx`select current_user as user_at_entry,
              coalesce(nullif(current_setting('request.jwt.claims', true), ''), 'EMPTY')
                as claims_at_entry,
              pg_backend_pid() as pid,
              clock_timestamp() as t0`,
    tx`select set_config('role', 'authenticated', true)`,
    tx`select set_config('request.jwt.claims', ${claimsForSql(c.claims)}, true)`,
    tx`select current_user as user_bound`,
    tx`select reference, customer_id from public.bookings order by reference`,
  ]);
  const entry = (r[0] as unknown as Array<Record<string, unknown>>)[0];
  expect((r[3] as unknown as Array<{ user_bound: string }>)[0].user_bound).toBe("authenticated");
  return { entry, rows: r[4] as unknown as Array<{ reference: string; customer_id: string }> };
}

const refs = (rows: Array<{ reference: string }>) => rows.map((r) => r.reference).sort();
```

This is the single most valuable test in the lane, and it needs no cloud account. **It should exist before Phase 3 opens.**

### 4.3 Genuinely requires a deployed Worker over real Hyperdrive

- That Hyperdrive's `RESET`-on-return actually clears role and claims across *its* multiplexing, not just across `COMMIT`.
- That an abandoned in-flight transaction does not return a dirty backend to the pool.
- `cacheStatus` never `hit` on the identity binding.
- `waitUntil` work after the response.
- The latency half of Phase 3 (DATA-05, other lane).

`wrangler dev --remote` is an acceptable vehicle ("your Worker runs in Cloudflare's network and uses your deployed Hyperdrive configuration"), but CI cannot depend on an interactive session — use a deployed Worker.

---

## 5. The probe surface — a separate, staging-only Worker

**Do not put probe routes in `apps/web`.** A route in the app's tree that must 404 in production is one forgotten env var away from being an unauthenticated `SELECT` endpoint on the bookings table, and staging is *not* behind Cloudflare Access (`01-04-SUMMARY.md`: Access deferred by owner decision — the staging Worker is publicly reachable, carrying only `X-Robots-Tag: noindex`).

Instead: **`apps/isolation-probe` — its own Worker, deployed only to staging, importing the identical `withIdentity` from `@vamos/db`.** Production physically cannot contain it. Because Hyperdrive configs are account-level and "shared across Workers", the probe and the real app draw from the *same* origin pool, so the probe is representative of the app's exposure.

The one gap this creates is honest and must be recorded: the probe does not exercise Next.js/OpenNext's own request lifecycle. **Phase 5 obligation:** once `/api/account/bookings` exists, re-point the same harness at it for one confirming run.

### 5.1 `apps/isolation-probe/wrangler.jsonc`

```jsonc
{
  "$schema": "node_modules/wrangler/config-schema.json",
  "name": "vamos-isolation-probe-staging",
  "main": "src/index.ts",
  "compatibility_date": "2026-08-20",
  "compatibility_flags": ["nodejs_compat"],
  "workers_dev": true,
  "observability": { "enabled": true },

  // Runs where the app runs, so the measurement is comparable (DATA-05).
  // NOTE: "Placement only affects the execution of fetch event handlers."
  //   https://developers.cloudflare.com/workers/configuration/smart-placement/
  "placement": { "region": "aws:eu-central-1" },

  "vars": { "DEPLOY_ENV": "staging" },

  "kv_namespaces": [{ "binding": "PROBE_KV", "id": "<staging probe kv>" }],

  "hyperdrive": [
    // A DEDICATED cache-disabled config on the same vamos_edge credentials, capped at the
    // documented minimum of 5 origin connections, so 64-way concurrency makes backend reuse
    // a pigeonhole certainty rather than luck:
    //   wrangler hyperdrive create vamos-probe-staging \
    //     --connection-string="postgres://vamos_edge:...@<direct-host>:5432/postgres" \
    //     --caching-disabled
    //   wrangler hyperdrive update <id> --origin-connection-limit=5
    { "binding": "HYPERDRIVE_NOCACHE", "id": "<probe cache-disabled config id>",
      "localConnectionString": "postgres://vamos_edge:vamos_edge@localhost:54322/postgres" },

    // The app's real staging identity config, for the confirming run at production pool size.
    { "binding": "HYPERDRIVE_APP", "id": "<app cache-disabled config id>",
      "localConnectionString": "postgres://vamos_edge:vamos_edge@localhost:54322/postgres" },

    // The cached, vamos_public config — probed only to prove it CANNOT serve identity data.
    { "binding": "HYPERDRIVE_CACHED", "id": "<app cached config id>",
      "localConnectionString": "postgres://vamos_public:vamos_public@localhost:54322/postgres" }
  ]
}
```

### 5.2 `apps/isolation-probe/src/index.ts`

```ts
/**
 * Staging-only DATA-06 probe Worker.
 *
 * Never deployed to production: it has no production environment in wrangler.jsonc and
 * `deploy-production.yml` has no job that builds this package. Two further gates:
 *   1. every request requires a constant-time match on PROBE_SECRET (a wrangler secret
 *      that only exists on the staging Worker); anything else is an opaque 404.
 *   2. `impl` is a closed union. There is no path by which caller-supplied SQL reaches
 *      the database — the probe returns only the caller's OWN references and uuids.
 *
 * It exposes the failure modes of §2 as named variants so the harness can prove the
 * suite goes red against each. See .planning/phases/03-.../ISOLATION-PROOF.md.
 */
import postgres from "postgres";
import { withIdentity, claimsForSql, type VamosClaims } from "@vamos/db/identity";

const IMPLS = ["correct", "session", "nobegin", "nowrapper", "waituntil", "abandon", "cached"] as const;
type Impl = (typeof IMPLS)[number];

interface Env {
  DEPLOY_ENV: string;
  PROBE_SECRET: string;
  PROBE_KV: KVNamespace;
  HYPERDRIVE_NOCACHE: Hyperdrive;
  HYPERDRIVE_APP: Hyperdrive;
  HYPERDRIVE_CACHED: Hyperdrive;
  SUPABASE_URL: string;
}

const ENTRY_PROBE = `select current_user as user_at_entry,
       coalesce(nullif(current_setting('request.jwt.claims', true), ''), 'EMPTY') as claims_at_entry,
       pg_backend_pid() as pid,
       clock_timestamp() as t0`;

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

function client(cs: string, max = 1) {
  return postgres(cs, { max, prepare: true, fetch_types: false, connect_timeout: 10 });
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const notFound = new Response("Not found", { status: 404 });
    if (env.DEPLOY_ENV !== "staging" || !env.PROBE_SECRET) return notFound;
    const presented = request.headers.get("x-vamos-probe") ?? "";
    if (!timingSafeEqual(presented, env.PROBE_SECRET)) return notFound;

    const url = new URL(request.url);

    if (url.pathname === "/waituntil-result") {
      const v = await env.PROBE_KV.get(`wu:${url.searchParams.get("nonce")}`);
      return v ? new Response(v, { headers: { "content-type": "application/json" } })
               : new Response("{}", { status: 202, headers: { "content-type": "application/json" } });
    }
    if (url.pathname !== "/probe") return notFound;

    const impl = (url.searchParams.get("impl") ?? "correct") as Impl;
    if (!IMPLS.includes(impl)) return notFound;

    // The access token is verified by the SAME code path the app uses. A forged or
    // HS256-signed token is refused here, exactly as it would be on /api/account/bookings.
    const bearer = (request.headers.get("authorization") ?? "").replace(/^Bearer /i, "");
    let claims: VamosClaims;
    try {
      const { verifyAccessToken } = await import("@vamos/db/verify");
      claims = await verifyAccessToken(env, bearer);
    } catch {
      return Response.json({ error: "bad_token" }, { status: 401 });
    }

    try {
      switch (impl) {
        case "correct":  return Response.json(await runCorrect(env.HYPERDRIVE_NOCACHE.connectionString, claims, impl));
        case "cached":   return Response.json(await runCorrect(env.HYPERDRIVE_CACHED.connectionString, claims, impl));
        case "session":  return Response.json(await runSession(env, claims));
        case "nobegin":  return Response.json(await runNoBegin(env, claims));
        case "nowrapper":return Response.json(await runNoWrapper(env));
        case "waituntil":return runWaitUntil(env, ctx, claims);
        case "abandon":  return runAbandon(env, claims);
      }
    } catch (e) {
      const err = e as { code?: string; message?: string };
      return Response.json({ impl, error: true, sqlstate: err.code ?? null, message: err.message ?? null });
    }
  },
} satisfies ExportedHandler<Env>;

/* ---------------------------------------------------------------- correct ---- */
/** The shipped path. One transaction, both bindings transaction-local, pipelined. */
async function runCorrect(cs: string, claims: VamosClaims, impl: Impl) {
  const sql = client(cs);
  const r = await sql.begin((tx) => [
    tx.unsafe(ENTRY_PROBE),
    tx`select set_config('role', 'authenticated', true)`,
    tx`select set_config('request.jwt.claims', ${claimsForSql(claims)}, true)`,
    tx`select current_user as user_bound`,
    tx`select reference, customer_id from public.bookings order by reference`,
    tx`select clock_timestamp() as t1`,
  ]);
  const entry = (r[0] as any)[0];
  return {
    impl,
    pid: Number(entry.pid),
    userAtEntry: entry.user_at_entry as string,
    claimsAtEntry: entry.claims_at_entry as string,
    userBound: (r[3] as any)[0].user_bound as string,
    t0: entry.t0, t1: (r[5] as any)[0].t1,
    rows: (r[4] as any).map((x: any) => ({ reference: x.reference, customerId: x.customer_id })),
  };
}

/* ------------------------------------------------- NEGATIVE CONTROL: session ---- */
/**
 * Failure mode #1/#8: session-scoped set_config, NO transaction.
 * Two distinct expected symptoms, either of which fails the gate:
 *   (a) residue — a later probe on this backend sees claims_at_entry != 'EMPTY';
 *   (b) non-function — the SET and the SELECT land on DIFFERENT origin connections
 *       (Hyperdrive releases the connection between non-transactional queries), so the
 *       SELECT raises 42501 as vamos_edge. Recorded, not swallowed.
 */
async function runSession(env: Env, claims: VamosClaims) {
  const sql = client(env.HYPERDRIVE_NOCACHE.connectionString);
  const [entry] = (await sql.unsafe(ENTRY_PROBE)) as any;
  await sql`select set_config('role', 'authenticated', false)`;
  await sql`select set_config('request.jwt.claims', ${claimsForSql(claims)}, false)`;
  try {
    const rows = await sql`select reference, customer_id from public.bookings order by reference`;
    return { impl: "session", pid: Number(entry.pid), userAtEntry: entry.user_at_entry,
             claimsAtEntry: entry.claims_at_entry, t0: entry.t0, t1: null,
             rows: (rows as any).map((x: any) => ({ reference: x.reference, customerId: x.customer_id })) };
  } catch (e) {
    const err = e as { code?: string };
    return { impl: "session", pid: Number(entry.pid), userAtEntry: entry.user_at_entry,
             claimsAtEntry: entry.claims_at_entry, t0: entry.t0, t1: null,
             rows: null, sqlstate: err.code ?? null };
  }
}

/* ------------------------------------------------- NEGATIVE CONTROL: nobegin ---- */
/** Failure mode #4: is_local => true but no BEGIN. PG warns and does nothing; grants bite. */
async function runNoBegin(env: Env, claims: VamosClaims) {
  const sql = client(env.HYPERDRIVE_NOCACHE.connectionString);
  await sql`select set_config('role', 'authenticated', true)`;
  await sql`select set_config('request.jwt.claims', ${claimsForSql(claims)}, true)`;
  const rows = await sql`select reference from public.bookings`; // expected to throw 42501
  return { impl: "nobegin", rows: (rows as any).length };
}

/* ----------------------------------------------- FAIL-CLOSED PROOF: nowrapper ---- */
/** D2's load-bearing claim. If this ever returns a number, the whole design is void. */
async function runNoWrapper(env: Env) {
  const sql = client(env.HYPERDRIVE_NOCACHE.connectionString);
  const [row] = (await sql`select count(*)::int as n from public.bookings`) as any;
  return { impl: "nowrapper", n: row.n as number };
}

/* -------------------------------------------- NEGATIVE CONTROL: waitUntil (#10) ---- */
/** Response returns first; the DB work runs after, inside its own withIdentity. */
function runWaitUntil(env: Env, ctx: ExecutionContext, claims: VamosClaims): Response {
  const nonce = crypto.randomUUID();
  ctx.waitUntil((async () => {
    const out = await runCorrect(env.HYPERDRIVE_NOCACHE.connectionString, claims, "waituntil");
    await env.PROBE_KV.put(`wu:${nonce}`, JSON.stringify(out), { expirationTtl: 600 });
  })());
  return Response.json({ impl: "waituntil", nonce });
}

/* ---------------------------------------------- NEGATIVE CONTROL: abandon (#2/#5) ---- */
/**
 * Opens a transaction, binds identity, and returns WITHOUT committing and WITHOUT
 * awaiting or waitUntil-ing the promise. The client socket dies mid-transaction.
 * The harness then hammers `correct` and asserts nothing observes residue, nothing
 * returns 25P02, and the pool does not starve.
 */
function runAbandon(env: Env, claims: VamosClaims): Response {
  const sql = client(env.HYPERDRIVE_NOCACHE.connectionString);
  void sql.begin(async (tx) => {
    await tx`select set_config('role', 'authenticated', true)`;
    await tx`select set_config('request.jwt.claims', ${claimsForSql(claims)}, true)`;
    await new Promise((r) => setTimeout(r, 5_000)); // still open when the request dies
  }).catch(() => {});
  return Response.json({ impl: "abandon", abandoned: true });
}
```

One deliberate use of `tx.unsafe(ENTRY_PROBE)`: `ENTRY_PROBE` is a module constant with no interpolation. The CI grep gate in `rls-hyperdrive.md` §5 P3 bans `sql.unsafe(` in `apps/web/lib`/`apps/web/app`; it must be scoped so it does not also cover `apps/isolation-probe`, or this one call must be allow-listed by comment.

---

## 6. `withIdentity` moves into `@vamos/db`

`packages/db/README.md` already promises "a thin `postgres.js` access helper consumed by `apps/web`". Put it there rather than in `apps/web/lib/db`, so the probe Worker and the app import *the same function*. If it lives in `apps/web`, the probe tests a copy, and the proof is worthless.

```ts
// packages/db/src/identity.ts — the only door to identity-scoped data (D1, D2).
import postgres from "postgres";

export type DbIdentity =
  | { kind: "anon" }
  | { kind: "customer"; claims: VamosClaims }
  | { kind: "staff";    claims: VamosClaims }
  | { kind: "guest";    manageTokenHashHex: string };

/** Closed allowlist: the role name is chosen by OUR discriminant, never by a token string. */
const PG_ROLE = {
  anon: "anon", customer: "authenticated", staff: "vamos_staff", guest: "vamos_guest",
} as const satisfies Record<DbIdentity["kind"], string>;

/** user_metadata is user-writable and must never reach a policy — stripped, not trusted. */
export function claimsForSql(c: VamosClaims): string {
  return JSON.stringify({
    sub: c.sub, role: c.role, aal: c.aal ?? "aal1",
    email: c.email, session_id: c.session_id, app_metadata: c.app_metadata ?? {},
  });
}

/**
 * One short explicit transaction; role and claims bound transaction-locally; commit.
 * Never call sql.end() — Workers-to-Hyperdrive connections are cleaned up at request end.
 * `run` must return DATA. Returning `tx` (or anything closing over it) is a lint error:
 * a query executed on `tx` after COMMIT is failure mode #9.
 */
export async function withIdentity<T>(
  connectionString: string,
  identity: DbIdentity,
  run: (tx: postgres.TransactionSql) => Promise<T>,
): Promise<T> {
  const sql = postgres(connectionString, { max: 1, prepare: true, fetch_types: false, connect_timeout: 10 });
  return sql.begin(async (tx) => {
    await tx`select set_config('role', ${PG_ROLE[identity.kind]}, true)`;
    if (identity.kind === "customer" || identity.kind === "staff") {
      await tx`select set_config('request.jwt.claims', ${claimsForSql(identity.claims)}, true)`;
    } else if (identity.kind === "guest") {
      await tx`select set_config('request.vamos.manage_token_hash', ${identity.manageTokenHashHex}, true)`;
    }
    return run(tx);
  });
}
```

**U2 fallback, pre-wired.** If `set_config('role', $1, true)` turns out not to be `SET LOCAL ROLE`, swap the first line for `await tx.unsafe('set local role ' + PG_ROLE[identity.kind])` — injection-free because `PG_ROLE` is a closed map. The check is one statement; run it as the first thing on the staging project:

```sql
begin;
  select set_config('role','authenticated',true);
  select current_user;   -- expect: authenticated
commit;
select current_user;     -- expect: vamos_edge
```

---

## 7. The harness

### 7.1 Runner: Vitest, not Playwright

Playwright is already installed and `pnpm test:visual` is already a CI gate — but its config is `testDir: ./tests`, `testMatch: **/*.spec.ts`, with **four viewport projects**. Any spec dropped into that tree runs four times, at four viewport sizes, for an API test that has no viewport. That would quadruple the database load and make "how many iterations" structurally ambiguous — the single most important number in this lane.

Use **Vitest with the plain `node` environment** (not `@cloudflare/vitest-pool-workers`, which is Miniflare-local and cannot see Hyperdrive), in `packages/db`, on `*.test.ts` so there is no collision with Playwright's `*.spec.ts`. Phase 4's pricing-engine rounding tests need a unit runner anyway.

```ts
// packages/db/vitest.config.ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
    testTimeout: 300_000,
    hookTimeout: 300_000,
    pool: "forks",
    fileParallelism: false,   // one experiment at a time; the DB is the shared resource
    reporters: ["verbose"],
  },
});
```

### 7.2 Minting two real customer identities

Real Supabase Auth users, real access tokens verified by the real `verifyAccessToken`. Nothing is faked — a hand-minted JWT would be rejected (HS256 refused, issuer and audience checked), which is itself the point.

```ts
// packages/db/test/fixtures/two-customers.ts
import postgres from "postgres";

export interface SeededCustomer {
  userId: string; email: string; accessToken: string;
  claims: { sub: string; role: "authenticated"; aal: "aal1"; email: string };
  references: string[];  // sorted VT-YY-#### values this customer owns
}

const SUPABASE_URL  = req("SUPABASE_URL");
const SERVICE_ROLE  = req("SUPABASE_SERVICE_ROLE_KEY");
const ANON_KEY      = req("SUPABASE_ANON_KEY");
const OWNER_URL     = req("VAMOS_OWNER_URL"); // postgres role, direct, out-of-band

function req(k: string) { const v = process.env[k]; if (!v) throw new Error(`missing env ${k}`); return v; }

/** Refuses to run against anything but the declared staging project ref. */
function assertStaging() {
  const expected = req("SUPABASE_STAGING_REF");
  if (!SUPABASE_URL.includes(expected)) {
    throw new Error(`refusing to seed: SUPABASE_URL is not staging ref ${expected}`);
  }
}

export async function seedTwoCustomers(bookingsEach = 3) {
  assertStaging();
  const run = crypto.randomUUID().slice(0, 8);
  const a = await mint(`vamos-isolation-a-${run}@example.com`);
  const b = await mint(`vamos-isolation-b-${run}@example.com`);

  const sql = postgres(OWNER_URL, { max: 1, prepare: false });
  try {
    for (const c of [a, b]) {
      await sql`insert into public.customers (id, email) values (${c.userId}, ${c.email})
                on conflict (id) do nothing`;
      const refs: string[] = [];
      for (let i = 0; i < bookingsEach; i++) {
        // NO amounts. pricing_live is false by construction (no live rate_versions row),
        // every price column is NULL, and every surface renders CHF 000. Never seed a price.
        const [row] = await sql`
          insert into public.bookings (reference, customer_id, status)
          values (public.next_booking_reference(), ${c.userId}, 'quoted')
          returning reference`;
        refs.push(row.reference as string);
      }
      c.references = refs.sort();
    }
  } finally { await sql.end(); }

  if (a.references.some((r) => b.references.includes(r))) {
    throw new Error("fixture invalid: customers share a booking reference");
  }
  return { a, b, teardown: () => teardown([a, b]) };
}

async function mint(email: string): Promise<SeededCustomer> {
  const password = crypto.randomUUID() + "Aa1!";
  const created = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
    method: "POST",
    headers: { apikey: SERVICE_ROLE, authorization: `Bearer ${SERVICE_ROLE}`, "content-type": "application/json" },
    body: JSON.stringify({ email, password, email_confirm: true }),
  });
  if (!created.ok) throw new Error(`admin createUser failed: ${created.status} ${await created.text()}`);
  const user = (await created.json()) as { id: string };

  // Minted ONCE per run and reused across every request in the experiment. /auth/v1/token
  // is rate-limited to 1800/hour with bursts of 30, per IP — signing in per request would
  // throttle the harness long before the pool is saturated.
  const tok = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: ANON_KEY, "content-type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!tok.ok) throw new Error(`password grant failed: ${tok.status} ${await tok.text()}`);
  const { access_token } = (await tok.json()) as { access_token: string };

  return {
    userId: user.id, email, accessToken: access_token, references: [],
    claims: { sub: user.id, role: "authenticated", aal: "aal1", email },
  };
}

async function teardown(cs: SeededCustomer[]) {
  const sql = postgres(OWNER_URL, { max: 1, prepare: false });
  try {
    for (const c of cs) {
      await sql`delete from public.bookings where customer_id = ${c.userId}`;
      await sql`delete from public.customers where id = ${c.userId}`;
      await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${c.userId}`, {
        method: "DELETE",
        headers: { apikey: SERVICE_ROLE, authorization: `Bearer ${SERVICE_ROLE}` },
      });
    }
  } finally { await sql.end(); }
}
```

### 7.3 Forcing genuine concurrency

Node's global `fetch` is undici over HTTP/1.1 with no pipelining, so *one socket = one in-flight request*. Pin the socket count explicitly so "64 concurrent" is a fact, not a hope, and measure the peak in-flight count so a serialised run is caught:

```ts
// packages/db/test/support/drive.ts
import { Agent, setGlobalDispatcher, fetch as undiciFetch } from "undici";

export interface ProbeResult {
  impl: string; pid: number; userAtEntry: string; claimsAtEntry: string;
  userBound?: string; t0: string; t1: string | null;
  rows: Array<{ reference: string; customerId: string }> | null;
  sqlstate?: string | null; customer: "a" | "b"; httpStatus: number; cfRay: string | null;
}

export function pinSockets(connections: number) {
  setGlobalDispatcher(new Agent({ connections, pipelining: 0, keepAliveTimeout: 30_000 }));
}

export async function drive(opts: {
  baseUrl: string; secret: string; impl: string;
  identities: { a: { accessToken: string }; b: { accessToken: string } };
  requests: number; concurrency: number;
}): Promise<{ results: ProbeResult[]; peakInFlight: number }> {
  if (/localhost|127\.0\.0\.1/.test(opts.baseUrl)) {
    throw new Error("refusing to run: a local base URL does not exercise Hyperdrive pooling");
  }
  const results: ProbeResult[] = [];
  let inFlight = 0, peakInFlight = 0, issued = 0;

  const worker = async () => {
    while (issued < opts.requests) {
      const n = issued++;
      const which: "a" | "b" = n % 2 === 0 ? "a" : "b";     // strict alternation
      inFlight++; peakInFlight = Math.max(peakInFlight, inFlight);
      try {
        const res = await undiciFetch(`${opts.baseUrl}/probe?impl=${opts.impl}`, {
          headers: {
            "x-vamos-probe": opts.secret,
            authorization: `Bearer ${opts.identities[which].accessToken}`,
          },
        });
        const body = (await res.json()) as Omit<ProbeResult, "customer" | "httpStatus" | "cfRay">;
        results.push({ ...body, customer: which, httpStatus: res.status,
                       cfRay: res.headers.get("cf-ray") });
      } finally { inFlight--; }
    }
  };

  pinSockets(opts.concurrency);
  await Promise.all(Array.from({ length: opts.concurrency }, worker));
  return { results, peakInFlight };
}

/** The coverage instrument. Adjacent = same backend, consecutive in server time. */
export function adjacency(results: ProbeResult[]) {
  const byPid = new Map<number, ProbeResult[]>();
  for (const r of results) {
    if (!Number.isInteger(r.pid) || r.pid <= 0) continue;
    (byPid.get(r.pid) ?? byPid.set(r.pid, []).get(r.pid)!).push(r);
  }
  const pairs: Array<[ProbeResult, ProbeResult]> = [];
  for (const list of byPid.values()) {
    list.sort((x, y) => Date.parse(x.t0) - Date.parse(y.t0));
    for (let i = 1; i < list.length; i++) pairs.push([list[i - 1], list[i]]);
  }
  return {
    distinctPids: byPid.size,
    allPairs: pairs,
    crossCustomerPairs: pairs.filter(([p, q]) => p.customer !== q.customer),
  };
}
```

### 7.4 The gate test

```ts
// packages/db/test/deployed/data-06-isolation.test.ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { drive, adjacency, type ProbeResult } from "../support/drive";
import { seedTwoCustomers, type SeededCustomer } from "../fixtures/two-customers";
import { assertNoCacheHits } from "../support/hyperdrive-metrics";

const BASE = process.env.PROBE_BASE_URL!;      // https://vamos-isolation-probe-staging.<sub>.workers.dev
const SECRET = process.env.PROBE_SECRET!;
const REQUESTS   = Number(process.env.PROBE_REQUESTS   ?? 2000);
const CONCURRENCY= Number(process.env.PROBE_CONCURRENCY?? 64);
const MIN_ADJACENCY = Number(process.env.PROBE_MIN_ADJACENCY ?? 1000);

let a: SeededCustomer, b: SeededCustomer, teardown: () => Promise<void>;
const windowStart = new Date().toISOString();

beforeAll(async () => { ({ a, b, teardown } = await seedTwoCustomers()); }, 120_000);
afterAll(async () => { await teardown(); });

describe("DATA-06 — concurrent two-customer isolation over the Hyperdrive pool", () => {
  let results: ProbeResult[];
  let peakInFlight = 0;

  it("drives the experiment", async () => {
    const out = await drive({ baseUrl: BASE, secret: SECRET, impl: "correct",
      identities: { a, b }, requests: REQUESTS, concurrency: CONCURRENCY });
    results = out.results; peakInFlight = out.peakInFlight;
    expect(results).toHaveLength(REQUESTS);
  }, 600_000);

  /* --- VALIDITY GATES: if any of these fail, the run is INCONCLUSIVE, not green --- */

  it("V1 · every probe actually reached Postgres through Cloudflare", () => {
    for (const r of results) {
      expect(r.httpStatus).toBe(200);
      expect(r.cfRay).toBeTruthy();                 // not a local dev server
      expect(Number.isInteger(r.pid) && r.pid > 0).toBe(true);
    }
  });

  it("V2 · the requests were genuinely concurrent", () => {
    expect(peakInFlight).toBeGreaterThanOrEqual(CONCURRENCY - 2);
    expect(adjacency(results).distinctPids).toBeGreaterThan(1);
  });

  it("V3 · the fixture is non-degenerate", () => {
    expect(a.references.length).toBeGreaterThanOrEqual(3);
    expect(b.references.length).toBeGreaterThanOrEqual(3);
    expect(a.references.filter((r) => b.references.includes(r))).toHaveLength(0);
  });

  it("V4 · connections were actually SHARED between the two customers", () => {
    const { crossCustomerPairs, distinctPids } = adjacency(results);
    // With --origin-connection-limit=5 and 64-way concurrency this is a pigeonhole certainty.
    expect(distinctPids).toBeLessThanOrEqual(CONCURRENCY / 2);
    expect(crossCustomerPairs.length).toBeGreaterThanOrEqual(MIN_ADJACENCY);
  });

  /* --------------------------- THE ACTUAL CLAIMS --------------------------- */

  it("A1 · no customer ever receives another customer's row", () => {
    for (const r of results) {
      const mine  = r.customer === "a" ? a : b;
      const other = r.customer === "a" ? b : a;
      const refs = r.rows!.map((x) => x.reference).sort();
      expect(refs).toEqual(mine.references);
      for (const foreign of other.references) expect(refs).not.toContain(foreign);
      for (const row of r.rows!) expect(row.customerId).toBe(mine.userId);
    }
  });

  it("A2 · the role was actually switched inside every transaction", () => {
    for (const r of results) expect(r.userBound).toBe("authenticated");
  });

  it("A3 · no probe found residue on entry", () => {
    for (const r of results) {
      expect(r.userAtEntry).toBe("vamos_edge");
      expect(r.claimsAtEntry).toBe("EMPTY");
    }
  });

  it("A4 · TARGETED: on every shared backend, the follower saw a clean session", () => {
    const { crossCustomerPairs } = adjacency(results);
    for (const [prev, next] of crossCustomerPairs) {
      expect(next.claimsAtEntry).toBe("EMPTY");
      expect(next.userAtEntry).toBe("vamos_edge");
      const owner = next.customer === "a" ? a : b;
      expect(next.rows!.map((x) => x.reference).sort()).toEqual(owner.references);
      expect(Date.parse(next.t0)).toBeGreaterThanOrEqual(Date.parse(prev.t1!));
    }
  });

  it("A5 · the identity binding was never served from the Hyperdrive cache", async () => {
    await assertNoCacheHits({
      configId: process.env.PROBE_HYPERDRIVE_CONFIG_ID!,
      since: windowStart, until: new Date().toISOString(),
      allowed: new Set(["disabled", "transaction"]),
    });
  });
});
```

### 7.5 The out-of-band cache assertion

```ts
// packages/db/test/support/hyperdrive-metrics.ts
/** Reads hyperdriveQueriesAdaptiveGroups. Token needs Account Analytics: Read. */
export async function assertNoCacheHits(o: {
  configId: string; since: string; until: string; allowed: Set<string>;
}) {
  const res = await fetch("https://api.cloudflare.com/client/v4/graphql", {
    method: "POST",
    headers: { authorization: `Bearer ${process.env.CF_ANALYTICS_TOKEN}`, "content-type": "application/json" },
    body: JSON.stringify({
      query: `query($accountTag:string!,$configId:string!,$s:Time!,$e:Time!){
        viewer{accounts(filter:{accountTag:$accountTag}){
          hyperdriveQueriesAdaptiveGroups(limit:10000,filter:{
            configId:$configId, datetime_geq:$s, datetime_leq:$e
          }){ count dimensions{ cacheStatus } }}}}`,
      variables: { accountTag: process.env.CF_ACCOUNT_ID, configId: o.configId, s: o.since, e: o.until },
    }),
  });
  const j = await res.json() as any;
  const groups = j.data.viewer.accounts[0].hyperdriveQueriesAdaptiveGroups as
    Array<{ count: number; dimensions: { cacheStatus: string } }>;
  const bad = groups.filter((g) => !o.allowed.has(g.dimensions.cacheStatus) && g.count > 0);
  if (bad.length) {
    throw new Error(`identity binding served non-transaction cacheStatus: ${JSON.stringify(bad)}`);
  }
  if (!groups.some((g) => g.count > 0)) {
    throw new Error("no Hyperdrive queries recorded in the window — the probe did not use Hyperdrive");
  }
}
```

The second throw matters as much as the first: a metrics window with zero queries means the traffic never went through the Hyperdrive config under test.

---

## 8. How many iterations, honestly

**The structural claim is not probabilistic, so "N until confident" is the wrong frame.** Two numbers do the work instead:

**1. Coverage, which is measured, not assumed.** The experiment's real sample size is `S` = the cross-customer adjacency count. With an origin pool capped at the documented minimum of **5** and 64-way concurrency, the pigeonhole principle forces reuse: after the first 5 probes every subsequent probe lands on a backend that just served someone else. With strict A/B alternation across `N` probes, `E[S] ≈ (N − L) · 0.5` — so `N = 2000, L = 5` yields `S ≈ 1000`. The gate asserts `S ≥ 1000`; a run producing `S < 1000` reports **INCONCLUSIVE** and fails, because a run that never shared a connection has tested nothing.

**2. The residual stochastic bound, stated with its limits.** For anything genuinely random that survives (say a race window inside Hyperdrive's `RESET`), zero failures in `S` adjacency events bounds the per-event leak probability at **p ≤ 3/S with 95 % confidence** (rule of three):

| `S` | 95 % upper bound on p | Verdict |
|---|---|---|
| 200 | 1.5 % | Useless as an assurance. PR smoke only. |
| 1000 | 0.30 % | Nightly gate floor. |
| 10 000 | 0.03 % | Pre-launch (Phase 11) run. |

And the honest caveat, which must appear in the phase summary: **a deterministic bug is caught at `S = 1`; no `S` makes a systematically-safe design safer.** The assurance comes from the grant layer (D2), from Postgres reverting `SET LOCAL` itself (D1), and from the negative controls proving the suite can go red. `S` only bounds a random residual. Do not let a large `N` in a CI log be read as security evidence.

**Settings:**

| Where | `N` | concurrency | pool | `S` floor |
|---|---|---|---|---|
| PR (smoke, after staging deploy) | 400 | 32 | 5 | 200 |
| Nightly / phase gate | 2 000 | 64 | 5 | 1 000 |
| Confirming run at real pool size | 2 000 | 64 | app config (25) | 200 |
| Pre-launch, Phase 11 | 20 000 | 64 | 5 | 10 000 |

The confirming run at the app's real pool size exists to prove the answer does not depend on the artificially small pool.

---

## 9. The negative controls

A test suite that has never been shown to fail proves nothing. Every control below must be executed in CI, and **the job fails if a control passes.**

```ts
// packages/db/test/deployed/negative-controls.test.ts — each `it` asserts the BUG is present.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { drive, adjacency } from "../support/drive";
import { seedTwoCustomers, type SeededCustomer } from "../fixtures/two-customers";

const BASE = process.env.PROBE_BASE_URL!, SECRET = process.env.PROBE_SECRET!;
let a: SeededCustomer, b: SeededCustomer, teardown: () => Promise<void>;
beforeAll(async () => { ({ a, b, teardown } = await seedTwoCustomers()); }, 120_000);
afterAll(async () => { await teardown(); });

describe("negative controls — the suite MUST be able to go red", () => {
  it("NC1 · session-scoped SET without a transaction is broken", async () => {
    const { results } = await drive({ baseUrl: BASE, secret: SECRET, impl: "session",
      identities: { a, b }, requests: 400, concurrency: 32 });

    const residue   = results.filter((r) => r.claimsAtEntry !== "EMPTY" || r.userAtEntry !== "vamos_edge");
    const orphaned  = results.filter((r) => r.sqlstate === "42501");
    const leaked    = results.filter((r) => {
      const other = r.customer === "a" ? b : a;
      return r.rows?.some((x) => other.references.includes(x.reference)) ?? false;
    });

    // Two independent symptoms; at least one must appear, or we are depending on an
    // UNDOCUMENTED Cloudflare RESET behaviour to save us, which is not an acceptable
    // security posture even when it happens to work.
    const evidence = { residue: residue.length, orphaned: orphaned.length, leaked: leaked.length };
    expect(evidence, `session impl looked SAFE — Hyperdrive's RESET is masking failure mode #1.
      That is an implementation detail, not a boundary. Escalate: re-verify the grant layer,
      and record it against U-I2.`).not.toEqual({ residue: 0, orphaned: 0, leaked: 0 });
  }, 300_000);

  it("NC2 · SET LOCAL without BEGIN fails closed (42501), never returns rows", async () => {
    const res = await fetch(`${BASE}/probe?impl=nobegin`, {
      headers: { "x-vamos-probe": SECRET, authorization: `Bearer ${a.accessToken}` },
    });
    const body = await res.json() as { error?: boolean; sqlstate?: string; rows?: number };
    expect(body.error).toBe(true);
    expect(body.sqlstate).toBe("42501");
    expect(body.rows).toBeUndefined();
  });

  it("NC3 · a query with NO wrapper at all raises 42501 — D2's load-bearing claim", async () => {
    const res = await fetch(`${BASE}/probe?impl=nowrapper`, {
      headers: { "x-vamos-probe": SECRET, authorization: `Bearer ${a.accessToken}` },
    });
    const body = await res.json() as { error?: boolean; sqlstate?: string; n?: number };
    expect(body.n, "vamos_edge returned a row count. THE ENTIRE DESIGN IS VOID.").toBeUndefined();
    expect(body.sqlstate).toBe("42501");
  });

  it("NC4 · an abandoned open transaction leaves no residue and does not poison the pool", async () => {
    for (let i = 0; i < 10; i++) {
      await fetch(`${BASE}/probe?impl=abandon`, {
        headers: { "x-vamos-probe": SECRET, authorization: `Bearer ${a.accessToken}` },
      });
    }
    const { results } = await drive({ baseUrl: BASE, secret: SECRET, impl: "correct",
      identities: { a, b }, requests: 400, concurrency: 32 });
    for (const r of results) {
      expect(r.httpStatus).toBe(200);                    // pool not starved
      expect(r.sqlstate ?? null).toBeNull();             // no 25P02 in_failed_sql_transaction
      expect(r.claimsAtEntry).toBe("EMPTY");
      expect(r.userAtEntry).toBe("vamos_edge");
    }
    expect(adjacency(results).crossCustomerPairs.length).toBeGreaterThanOrEqual(150);
  }, 300_000);

  it("NC5 · waitUntil work after the response binds its own identity, sees no residue", async () => {
    const start = await fetch(`${BASE}/probe?impl=waituntil`, {
      headers: { "x-vamos-probe": SECRET, authorization: `Bearer ${b.accessToken}` },
    });
    const { nonce } = await start.json() as { nonce: string };
    let out: any = {};
    for (let i = 0; i < 30 && !out.pid; i++) {
      await new Promise((r) => setTimeout(r, 1000));
      out = await (await fetch(`${BASE}/waituntil-result?nonce=${nonce}`,
        { headers: { "x-vamos-probe": SECRET } })).json();
    }
    expect(out.pid, "waitUntil work never completed").toBeGreaterThan(0);
    expect(out.claimsAtEntry).toBe("EMPTY");
    expect(out.userAtEntry).toBe("vamos_edge");
    expect(out.rows.map((x: any) => x.reference).sort()).toEqual(b.references);
  }, 120_000);

  it("NC6 · the cached vamos_public binding cannot serve identity data at all", async () => {
    const res = await fetch(`${BASE}/probe?impl=cached`, {
      headers: { "x-vamos-probe": SECRET, authorization: `Bearer ${a.accessToken}` },
    });
    const body = await res.json() as { error?: boolean; sqlstate?: string };
    expect(body.error).toBe(true);
    expect(body.sqlstate).toBe("42501");   // vamos_public holds no membership and no grant
  });
});
```

### 9.6 Migration mutants — the local, deterministic controls

Two mutants prove the *schema* is what is doing the work. They run against a scratch local Supabase and the gate fails if pgTAP stays green.

```sql
-- packages/db/mutants/M1_grant_layer_removed.sql
-- Mutant of D2: vamos_edge inherits, and holds a direct grant.
-- EXPECTED: tests/fail_closed.test.sql and tests/set_local_without_begin.test.sql go RED.
alter role vamos_edge inherit;
grant authenticated to vamos_edge with inherit true, set true;
grant select on public.bookings to vamos_edge;
```

```sql
-- packages/db/mutants/M2_policy_predicate_weakened.sql
-- Mutant of DATA-02: the customer policy stops filtering by identity.
-- EXPECTED: tests/bookings_customer_rls.test.sql goes RED.
drop policy if exists bookings_select_own on public.bookings;
create policy bookings_select_own on public.bookings for select to authenticated using (true);
```

```js
// packages/db/scripts/mutation-gate.mjs
// For each mutant: reset -> apply mutant -> `supabase test db` MUST fail.
// A mutant that leaves the suite green means the suite is not testing what it claims.
import { execFileSync } from "node:child_process";
import { readdirSync } from "node:fs";

const mutants = readdirSync("mutants").filter((f) => f.endsWith(".sql")).sort();
let failures = [];

for (const m of mutants) {
  execFileSync("supabase", ["db", "reset", "--no-seed"], { stdio: "inherit" });
  execFileSync("psql", [process.env.VAMOS_OWNER_URL, "-v", "ON_ERROR_STOP=1", "-f", `mutants/${m}`],
    { stdio: "inherit" });
  let red = false;
  try { execFileSync("supabase", ["test", "db"], { stdio: "inherit" }); }
  catch { red = true; }
  console.log(`${m}: pgTAP ${red ? "RED (good)" : "GREEN (BAD)"}`);
  if (!red) failures.push(m);
}

execFileSync("supabase", ["db", "reset"], { stdio: "inherit" });
if (failures.length) {
  console.error(`mutation gate failed — these mutants did not break the suite: ${failures.join(", ")}`);
  process.exit(1);
}
```

---

## 10. Fail-closed verification, in SQL

The deployed NC3 above is the runtime half. The permanent half is pgTAP, extending `fail_closed.test.sql` from §15 of the schema draft so that *no table can be added later without being covered*:

```sql
-- packages/db/supabase/tests/fail_closed.test.sql
begin;
select plan(6);

-- 1. vamos_edge holds NO privilege on ANY table in public — enumerated, not listed.
select is_empty(
  $$ select c.relname
       from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind in ('r','p','v','m')
        and (   has_table_privilege('vamos_edge', c.oid, 'SELECT')
             or has_table_privilege('vamos_edge', c.oid, 'INSERT')
             or has_table_privilege('vamos_edge', c.oid, 'UPDATE')
             or has_table_privilege('vamos_edge', c.oid, 'DELETE')) $$,
  'vamos_edge holds no table privilege anywhere in public');

-- 2. Its role memberships are non-inheriting: it holds nothing until it SET ROLEs.
select is_empty(
  $$ select r.rolname from pg_auth_members m
       join pg_roles r on r.oid = m.roleid
       join pg_roles g on g.oid = m.member
      where g.rolname = 'vamos_edge' and m.inherit_option $$,
  'every membership of vamos_edge is granted WITH INHERIT FALSE');
select is(
  (select rolinherit from pg_roles where rolname = 'vamos_edge'), false,
  'vamos_edge is NOINHERIT');

-- 3. A wrapper-less read raises 42501, not rows.
select throws_ok($$ select count(*) from public.bookings $$, '42501',
  null, 'no wrapper => insufficient_privilege');

-- 4. SET LOCAL outside a transaction block does not bind identity.
--    (pgTAP runs inside a transaction, so this asserts the equivalent: an is_local
--     binding made and then rolled back leaves nothing behind.)
savepoint s;
select set_config('role', 'authenticated', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000001"}', true);
rollback to savepoint s;
select is((select current_user::text), 'vamos_edge',
  'role reverts on rollback to savepoint');

-- 5. The cached-path role cannot reach identity data either.
select throws_ok(
  $$ set local role vamos_public; select count(*) from public.bookings $$, '42501',
  null, 'vamos_public cannot read bookings');

select * from finish();
rollback;
```

And the cross-claim matrix, which is where "a claim for A can never satisfy a policy for B" actually gets proved:

```sql
-- packages/db/supabase/tests/cross_claim.test.sql
begin;
select plan(5);

insert into public.customers (id, email) values
  ('11111111-1111-1111-1111-111111111111','a@example.com'),
  ('22222222-2222-2222-2222-222222222222','b@example.com');
insert into public.bookings (reference, customer_id, status) values
  (public.next_booking_reference(),'11111111-1111-1111-1111-111111111111','quoted'),
  (public.next_booking_reference(),'22222222-2222-2222-2222-222222222222','quoted');

-- A sees only A.
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated","aal":"aal1"}', true);
select is((select count(*)::int from public.bookings), 1, 'A sees exactly one booking');
select is((select count(*)::int from public.bookings
            where customer_id='22222222-2222-2222-2222-222222222222'), 0,
          'A cannot see B by explicit predicate');

-- A cannot forge B by asserting a different sub in app_metadata or elsewhere.
select set_config('request.jwt.claims',
  '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated","aal":"aal1",
    "app_metadata":{"vamos_role":"admin","sub":"22222222-2222-2222-2222-222222222222"}}', true);
select is((select count(*)::int from public.bookings), 1,
          'a forged app_metadata.sub does not widen the row set');
select throws_ok($$ select count(*) from public.chauffeurs $$, '42501',
  null, 'a forged admin claim under `authenticated` still hits the grant wall');

-- No identity bound at all => zero rows (RESTRICTIVE bookings_require_identity), never all rows.
select set_config('request.jwt.claims', '', true);
select is((select count(*)::int from public.bookings), 0,
          'unbound identity yields zero rows, not the whole table');

select * from finish();
rollback;
```

---

## 11. Three assertions DATA-06's wording misses

1. **`userBound` is checked inside the transaction.** Without it, a run where `set_config('role', …)` silently did nothing (U2 being false) and the tables happened to have been granted to `vamos_edge` would return correct-looking rows. Checking `current_user = 'authenticated'` after the bind closes that.
2. **The `vamos_public` / cached-binding path (NC6).** DATA-06 says "the pooled connection", singular. There are two configs (D3), and the cached one is the one that could serve A's rows to B. It must be proved incapable, not merely unused.
3. **Isolate-level memoisation (failure mode #14).** Nothing in SQL can catch a module-level `Map` caching a customer's bookings. Add to the Phase 5 obligations, and add one cheap deployed assertion now: drive 200 alternating probes against a **single** Worker isolate (achievable by hammering with `keepAliveTimeout` high and low concurrency so requests land in the same isolate) and assert A never receives B's rows. Also assert as a CI grep gate that no file under `apps/web/app` or `apps/web/lib` declares a module-scope `Map`/`Set`/object literal whose name matches `/cache|memo|store/i`.

---

## 12. Configuration assertions (a green test on the wrong config proves nothing)

Run before the experiment, fail fast:

```ts
// packages/db/test/deployed/config-preconditions.test.ts
it("the probe config is cache-disabled and capped at the minimum pool", async () => {
  const cfg = JSON.parse(execFileSync("npx", ["wrangler", "hyperdrive", "get",
    process.env.PROBE_HYPERDRIVE_CONFIG_ID!, "--json"], { encoding: "utf8" }));
  expect(cfg.caching?.disabled).toBe(true);
  expect(cfg.origin_connection_limit).toBe(5);
  expect(String(cfg.origin?.port)).toBe("5432");   // direct string, never Supavisor 6543
  expect(cfg.origin?.user).toBe("vamos_edge");
});

it("postgres.js prepared statements are not disabled", () => {
  const src = readFileSync("src/identity.ts", "utf8");
  expect(src).toContain("prepare: true");
  expect(src).not.toMatch(/prepare:\s*false/);
});
```

---

## 13. CI wiring

```yaml
# .github/workflows/deploy-staging.yml — appended after the existing `deploy` job.
  data-06:
    name: DATA-06 · concurrent two-customer isolation
    needs: deploy
    runs-on: ubuntu-latest
    concurrency:
      # The experiment owns the staging database for its duration; two runs at once
      # would each see the other's fixture rows and both would be meaningless.
      group: data-06-staging
      cancel-in-progress: false
    env:
      PROBE_BASE_URL: ${{ vars.PROBE_BASE_URL }}
      PROBE_SECRET: ${{ secrets.PROBE_SECRET }}
      PROBE_HYPERDRIVE_CONFIG_ID: ${{ vars.PROBE_HYPERDRIVE_CONFIG_ID }}
      SUPABASE_URL: ${{ vars.SUPABASE_STAGING_URL }}
      SUPABASE_STAGING_REF: ${{ vars.SUPABASE_STAGING_REF }}
      SUPABASE_ANON_KEY: ${{ secrets.SUPABASE_STAGING_ANON_KEY }}
      SUPABASE_SERVICE_ROLE_KEY: ${{ secrets.SUPABASE_STAGING_SERVICE_ROLE_KEY }}
      VAMOS_OWNER_URL: ${{ secrets.SUPABASE_STAGING_OWNER_URL }}
      CF_ACCOUNT_ID: ${{ secrets.CF_ACCOUNT_ID }}
      CF_ANALYTICS_TOKEN: ${{ secrets.CF_ANALYTICS_TOKEN }}
      PROBE_REQUESTS: "400"
      PROBE_CONCURRENCY: "32"
      PROBE_MIN_ADJACENCY: "200"
    steps:
      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
      - uses: pnpm/action-setup@0977fd99725f1db4007ccb2928dbb4e90d06cc86 # v6.0.10
        with: { version: 11.7.0 }
      - uses: actions/setup-node@820762786026740c76f36085b0efc47a31fe5020 # v7.0.0
        with: { node-version: "22", cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - run: pnpm --filter @vamos/db exec wrangler deploy --config ../isolation-probe/wrangler.jsonc
      - name: Config preconditions
        run: pnpm --filter @vamos/db exec vitest run test/deployed/config-preconditions.test.ts
      - name: Negative controls (MUST detect the bugs)
        run: pnpm --filter @vamos/db exec vitest run test/deployed/negative-controls.test.ts
      - name: DATA-06 isolation gate
        run: pnpm --filter @vamos/db exec vitest run test/deployed/data-06-isolation.test.ts
```

```yaml
# .github/workflows/pr.yml — local half; needs no Cloudflare account.
      - run: pnpm --filter @vamos/db exec supabase start
      - name: pgTAP (RLS, fail-closed, cross-claim)
        run: pnpm --filter @vamos/db exec supabase test db
      - name: Connection-reuse simulator (pinned backend)
        run: pnpm --filter @vamos/db exec vitest run test/local
      - name: Mutation gate (the suite must go red against each mutant)
        run: pnpm --filter @vamos/db run mutation-gate
```

```yaml
# .github/workflows/deploy-production.yml — three structural gates.
      - name: The probe Worker must not exist in a production build
        run: |
          test ! -d apps/isolation-probe/dist
          ! grep -rn "isolation-probe" apps/web/ --include=*.ts --include=*.tsx --include=*.jsonc
      - name: PROBE_SECRET must not exist on the production Worker
        run: |
          ! npx wrangler secret list --env production --config apps/web/wrangler.jsonc \
            | grep -q PROBE_SECRET
```

---

## 14. What would make this proof invalid

A checklist for whoever reviews the Phase 3 summary. If any line is unchecked, the gate did not pass — it just went green.

- [ ] `S` (cross-customer adjacency count) was asserted, and a run below the floor reported INCONCLUSIVE. **A run that only asserts "correct rows returned" is theatre.**
- [ ] `pid` came from `pg_backend_pid()` inside the transaction, not from anything the Worker made up.
- [ ] `peakInFlight` was measured; the requests were not serialised by an undici agent with `connections: 1`.
- [ ] `cf-ray` present on every response — the harness did not accidentally target `wrangler dev` local, where "Hyperdrive's connection pooling and query caching do not take effect".
- [ ] Both fixtures had ≥ 3 bookings, disjoint reference sets, and both assertions ran (contains-mine **and** contains-none-of-theirs). Two empty result sets satisfy a naive equality check.
- [ ] The tokens were real Supabase access tokens verified by the shipped `verifyAccessToken` — not hand-built claims injected past verification.
- [ ] `userBound === 'authenticated'` was asserted; otherwise a no-op `set_config` plus an over-granted `vamos_edge` looks identical to success.
- [ ] Every negative control **failed** as expected. NC1 producing zero evidence means Hyperdrive's undocumented `RESET` is masking the bug — escalate, do not celebrate.
- [ ] The mutation gate ran and both mutants turned pgTAP red.
- [ ] Hyperdrive metrics recorded a non-zero query count in the window, and no `hit`.
- [ ] `origin_connection_limit` was 5 for the pigeonhole run, and a confirming run at the app's real pool size also passed.
- [ ] The probe Worker was deployed from the same commit as the app, importing `withIdentity` from `@vamos/db` — not a copy.
- [ ] The staging database was not being written to concurrently by another job.
- [ ] No CHF amount appears anywhere in the fixture, the probe, or the run log.

---

## 15. Uncertainties carried forward, with the exact check

| # | Item | Why it cannot be settled now | The check that settles it |
|---|---|---|---|
| **U-I1** | No Cloudflare account, no Supabase project exists. Nothing in §5, §7, §9 (NC1–NC6), §12, §13-staging can be executed today. | Owner blocker. | Provision both. Until then, ship §4.2, §10, §9.6 — which are ~70 % of the mechanism and need only `supabase start`. |
| **U-I2** | Does Hyperdrive's documented `RESET` on pool return actually clear `role` and `request.jwt.claims`? Docs say "the connection is `RESET`" and nothing more; `RESET ALL` ≠ `DISCARD ALL`. | Undocumented implementation detail. | NC1's `residue` count. If it is 0, Hyperdrive *is* clearing them — record the finding, and record explicitly that the design does **not** depend on it (D1/D2 do the work). Supersedes `rls-hyperdrive.md` U5 with a concrete measurement. |
| **U-I3** | What happens to an origin connection whose client dies mid-transaction: rolled back, discarded, or returned dirty? `RESET ALL` cannot run inside a failed transaction block. | Undocumented. | NC4. Watch for `25P02`, for residue, and for `Failed to acquire a connection from the pool` in the 400 follow-up probes. |
| **U-I4** | `set_config('role', $1, true)` ≡ `SET LOCAL ROLE` (inherited as **U2**). | Not stated in PG's parameter table. | The four-line `begin;…commit;` in §6. Run it on staging *before* Phase 2's `0002` is authored — the fallback (`tx.unsafe('set local role ' + PG_ROLE[kind])`) changes `withIdentity`, which the probe Worker also imports. |
| **U-I5** | **U1** (can managed Supabase's `postgres` grant `authenticated` to `vamos_edge` `with inherit false, set true`?). | No project. | If it fails and the `vamos_customer` fallback is taken, `fail_closed.test.sql` assertion 2 must enumerate memberships of the fallback role too, and `PG_ROLE.customer` changes. Nothing else in this lane moves. |
| **U-I6** | Does Supabase Admin `createUser` accept `@example.com` addresses on a project with email confirmations configured? | Project-config dependent. | First fixture run. Fallback: a dedicated verified test domain, or `email_confirm: true` with a project-level allowlist. |
| **U-I7** | Whether `placement: { region: "aws:eu-central-1" }` is available on the plan chosen — and note it "only affects the execution of fetch event handlers", so Queues consumers and Cron handlers are **not** placed. Their DB access still needs `withIdentity`, and their latency is not covered by DATA-05. | No account. | `wrangler deploy` accepts or rejects it. Record the Queues/Cron exclusion in the Phase 3 summary regardless — it is also a correction to ADR-007's framing. |
| **U-I8** | Whether isolate-level memoisation (failure mode #14) exists anywhere in the app once Phase 5 adds real customer routes. | Those routes do not exist. | Phase 5 obligation: re-point this harness at `/api/account/bookings`, plus the module-scope-cache grep gate. |

---

## RECOMMENDATION

**Prove DATA-06 with a PID-coverage-gated, residue-probing concurrency experiment driven by Vitest against a dedicated staging-only probe Worker (`apps/isolation-probe`) that imports the same `withIdentity` as the app from `@vamos/db`, running over its own cache-disabled Hyperdrive config capped at the documented minimum of 5 origin connections — and treat the experiment as valid only when it is accompanied by six negative controls and two migration mutants that the suite is shown to go red against.**

Concretely, Phase 3 ships:

1. **`withIdentity` in `packages/db/src/identity.ts`**, not in `apps/web` — so the probe tests the shipped function rather than a copy. Its transaction is the pipelined six-statement form of §5.2, whose **first statement is the residue probe** (`current_user`, `current_setting('request.jwt.claims', true)`, `pg_backend_pid()`, `clock_timestamp()`) executed *before* any binding, and whose fourth asserts `current_user = 'authenticated'` *after*.

2. **`apps/isolation-probe`** — a separate staging-only Worker with no production environment, gated by a constant-time `PROBE_SECRET` header (staging has no Cloudflare Access: `01-04-SUMMARY.md`), exposing a **closed union** of seven implementations and returning only the caller's own references. Three production gates: a `grep` for the package name, a `wrangler secret list` check that `PROBE_SECRET` is absent from production, and the absence of any production build job for the package.

3. **Vitest (`node` environment, `*.test.ts`) in `packages/db`** — not Playwright, whose four viewport projects would run every API spec four times and make the iteration count meaningless; and not `@cloudflare/vitest-pool-workers`, which "runs tests fully-locally using Miniflare" and for which Hyperdrive remote bindings are "currently unsupported".

4. **The gate assertion set:** four validity gates (reached Cloudflare · genuinely concurrent · non-degenerate fixture · **connections actually shared**) and five claims (no foreign row · role actually switched · no residue anywhere · **no residue on the specific shared-backend adjacent pairs** · `cacheStatus` never `hit`). A run whose cross-customer adjacency count `S` falls below the floor reports **INCONCLUSIVE and fails** — this single rule is what separates the proof from theatre.

5. **Iteration policy stated as coverage, not faith:** PR smoke `N=400 / c=32 / S≥200`; phase gate and nightly `N=2000 / c=64 / S≥1000` (rule-of-three bound p ≤ 0.3 % at 95 %); a confirming run at the app's real pool size; `N=20 000 / S≥10 000` before Phase 11. Accompanied, in the phase summary, by the sentence that a deterministic bug is caught at `S=1` and no `S` makes a systematically-safe design safer.

6. **Six deployed negative controls** — session-`SET`, lost-`BEGIN`, no-wrapper, abandoned-transaction, `waitUntil`, cached-binding — run **before** the gate in CI, with the job failing if any control passes. NC1 returning zero evidence is escalated as U-I2, not accepted.

7. **Two migration mutants** (`M1` grant layer removed, `M2` policy predicate weakened) driven by `packages/db/scripts/mutation-gate.mjs` against a scratch local database, plus the extended `fail_closed.test.sql` (which *enumerates* `pg_class` rather than listing tables, so a table added in Phase 5 cannot escape it) and the new `cross_claim.test.sql`.

8. **The connection-reuse simulator (§4.2) first** — it uses `postgres.js`'s `reserve()` to pin one backend and replay A→B→bare-probe, so a residue bug fails 100 % of the time. It runs on a laptop against `supabase start`, needs neither Cloudflare nor Supabase-cloud, and should be **written before Phase 3 opens**, alongside Phase 2's pgTAP suite.

State plainly in the Phase 3 plan what cannot be measured yet: **there is no Cloudflare account and no Supabase project, so items 2, 4, 5, 6 and the Hyperdrive half of item 12's preconditions are designed but unrun.** Do not report a latency figure, a pool-behaviour claim, or a DATA-06 pass until they have been executed against real infrastructure. Items 1, 7 and 8 can and should land first, and they carry most of the actual security.

Do not put the probe in `apps/web`. Do not prove isolation with `wrangler dev` or `vitest-pool-workers`. Do not report a run that never shared a backend as a pass. Do not let a session-`SET` control that happens to look safe be recorded as evidence that session `SET` is safe.

---

### Sources

- Cloudflare Hyperdrive: [Connection pooling](https://developers.cloudflare.com/hyperdrive/concepts/connection-pooling/) · [Connection lifecycle](https://developers.cloudflare.com/hyperdrive/concepts/connection-lifecycle/) · [How Hyperdrive works](https://developers.cloudflare.com/hyperdrive/configuration/how-hyperdrive-works/) · [Query caching](https://developers.cloudflare.com/hyperdrive/concepts/query-caching/) · [Local development](https://developers.cloudflare.com/hyperdrive/configuration/local-development/) · [Tune connection pool](https://developers.cloudflare.com/hyperdrive/configuration/tune-connection-pool/) · [Limits](https://developers.cloudflare.com/hyperdrive/platform/limits/) · [Metrics](https://developers.cloudflare.com/hyperdrive/observability/metrics/) · [Troubleshoot and debug](https://developers.cloudflare.com/hyperdrive/observability/troubleshooting/) · [Supabase provider guide](https://developers.cloudflare.com/hyperdrive/examples/connect-to-postgres/postgres-database-providers/supabase/)
- Cloudflare blog: [Pools across the sea](https://blog.cloudflare.com/how-hyperdrive-speeds-up-database-access/) · [Named prepared statements in Hyperdrive](https://blog.cloudflare.com/postgres-named-prepared-statements-supported-hyperdrive/)
- Cloudflare Workers: [Context (ctx.waitUntil)](https://developers.cloudflare.com/workers/runtime-apis/context/) · [Errors and exceptions](https://developers.cloudflare.com/workers/observability/errors/) · [Local development & remote bindings](https://developers.cloudflare.com/workers/development-testing/) · [Vitest integration](https://developers.cloudflare.com/workers/testing/vitest-integration/) · [Vitest recipes](https://developers.cloudflare.com/workers/testing/vitest-integration/recipes/) · [Smart Placement](https://developers.cloudflare.com/workers/configuration/smart-placement/)
- PostgreSQL 17: [SET](https://www.postgresql.org/docs/17/sql-set.html) · [DISCARD](https://www.postgresql.org/docs/17/sql-discard.html)
- [postgres.js README](https://github.com/porsager/postgres) · [Supabase Auth rate limits](https://supabase.com/docs/guides/auth/rate-limits)
- Repo (read-only): `.planning/phases/02-data-schema-rls-staff-auth-foundations/02-RESEARCH.md` (D1–D3, D19, U1–U3), `02-SCHEMA-DRAFT.md` §2/§13–15/§16, `research/rls-hyperdrive.md` §5/§7, `.planning/phases/01-.../01-04-SUMMARY.md` (Cloudflare Access deferred), `apps/web/wrangler.jsonc`, `apps/web/playwright.config.ts`, `packages/db/README.md`, `.github/workflows/*.yml`