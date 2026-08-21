# Hyperdrive Data-Access Wiring — Phase 3 Research Brief (`hyperdrive-wiring` lane)

**Date:** 2026-08-22 · Lane: DATA-05, turning D1/D2/D3 into the actual data-access layer. This brief **extends** `.planning/phases/02-data-schema-rls-staff-auth-foundations/research/rls-hyperdrive.md` (the RLS-design lane) — it does not restate that lane's role/grant/policy design, `withIdentity` core shape, or the five DATA-06 proofs. Read that file first. This brief covers what it left as scaffolding: the exact dual-binding config (including the current repo gap), the `@opennextjs/cloudflare`-specific wiring, the closed-form `withIdentity(kind, claims, fn)` signature the task asked for, and — new ground — how to actually measure the p50 < 30 ms criterion without a paid APM.

---

## 0. What's already decided (D1–D3, quoted, not re-litigated)

- **D1** — identity reaches SQL via `set_config('role', …, true)` + `set_config('request.jwt.claims', …, true)`, both `is_local`, inside one explicit transaction, reverted by Postgres at COMMIT/ROLLBACK.
- **D2** — the security boundary is grants on `vamos_edge` (NOINHERIT login role, granted app roles `WITH INHERIT FALSE, SET TRUE`). Forgetting the wrapper raises `42501`, never a leak.
- **D3** — two Hyperdrive configs: `HYPERDRIVE_NOCACHE` (identity/transactions/auth/permission/billing) and `HYPERDRIVE` (public content, cacheable, `vamos_public` role).

`rls-hyperdrive.md` §3 already ships the DDL for `vamos_edge`/`vamos_public`, `app.jwt()`/`app.uid()`/`app.is_staff()`, and the RLS policies. §4 already ships a `withIdentity(env, identity, run)` draft and a `client()` factory. This brief takes that draft to production shape and answers everything DATA-05 asks that §4/§6 left open.

---

## 1. The wrangler.jsonc binding shape for BOTH Hyperdrive configs

### 1.1 What's actually in the repo right now (read, not edited here)

`apps/web/wrangler.jsonc` today has **one** Hyperdrive binding, only under `env.production`, pointed at a placeholder id, with an explicit comment that `env.staging` omits it because a placeholder ID fails `wrangler deploy`'s UUID validation. That single binding is also the cached-content shape (named `HYPERDRIVE`), not the identity-scoped one. Phase 3's job is:

1. add `HYPERDRIVE_NOCACHE` next to `HYPERDRIVE` under **both** `env.staging` and `env.production`,
2. replace both placeholder ids with real config ids the moment a Supabase project exists,
3. add a **local** connection string for `wrangler dev` under each binding.

### 1.2 The two config objects, and the exact setting that makes one cache-disabled

Both configs point at the **same physical database**, on the **direct** connection string (`db.<ref>.supabase.co:5432`, never the pooled Supavisor `:6543` string — Cloudflare's own Supabase guide is explicit: *"use the Direct connection connection string rather than the pooled connection strings"* ([Hyperdrive → Supabase](https://developers.cloudflare.com/hyperdrive/examples/connect-to-postgres/postgres-database-providers/supabase/))). They differ in **who logs in** and **one CLI flag**:

```sh
# ---- identity-scoped config: RLS, transactions, never cached ----
npx wrangler hyperdrive create vamos-rls-staging \
  --connection-string="postgres://vamos_edge:${VAMOS_EDGE_PW}@db.<ref>.supabase.co:5432/postgres" \
  --caching-disabled
npx wrangler hyperdrive update <RLS_CONFIG_ID> --origin-connection-limit=25

# ---- public-content config: no identity, no transaction, cacheable ----
npx wrangler hyperdrive create vamos-public-staging \
  --connection-string="postgres://vamos_public:${VAMOS_PUBLIC_PW}@db.<ref>.supabase.co:5432/postgres"
npx wrangler hyperdrive update <PUBLIC_CONFIG_ID> --origin-connection-limit=15
```

The **exact difference** is the `--caching-disabled` flag at creation time (there is no documented `wrangler hyperdrive update --caching-disabled`, so this is a create-time-only setting — plan to recreate the config, not patch it, if this is ever wrong). Cloudflare's example for the sibling flag confirms the cache knob's shape: `--max-age=<seconds>` (default 60) is the only other cache-relevant flag, and it's meaningless on a `--caching-disabled` config ([Get started](https://developers.cloudflare.com/hyperdrive/get-started/)).

### 1.3 How the connection string is "stored as a secret" — it is *not* a Worker secret

This is worth being precise about because DATA-05 says "stored as a secret" and the natural instinct is `wrangler secret put`. That is wrong for Hyperdrive. The connection string (including the password) is submitted once, at `wrangler hyperdrive create` time, and Cloudflare stores it **inside the Hyperdrive config object itself**, addressed only by the opaque config `id`. Nothing in `wrangler.jsonc` ever carries a credential — only `binding` and `id`:

```jsonc
"hyperdrive": [
  { "binding": "HYPERDRIVE",         "id": "<public config id>" },
  { "binding": "HYPERDRIVE_NOCACHE", "id": "<rls config id>" }
]
```

At runtime `env.HYPERDRIVE_NOCACHE.connectionString` is a Cloudflare-synthesised string that routes through the platform proxy — it is not the raw Supabase string re-served verbatim to the Worker ([Get started](https://developers.cloudflare.com/hyperdrive/get-started/) — *"Hyperdrive will provide a secure connection string that is only accessible from your Worker"*). Rotation is `wrangler hyperdrive update <id> --origin-password <new>`, which does **not** purge Hyperdrive's cache but does apply to new connections going forward. Practical consequence for the password's own lifecycle: generate it once with `openssl rand -base64 32` or similar, pass it directly into the `wrangler hyperdrive create` shell invocation (not a file, not an env var checked into anything), and never re-enter it anywhere else — `.planning/phases/02-.../research/rls-hyperdrive.md` §3's `create role vamos_edge login password :'vamos_edge_password'` uses a psql variable for exactly this reason (keeps the literal out of shell history/migration files too).

**UNCERTAIN — U-DATA05-1**: whether `wrangler hyperdrive update` accepts `--caching-disabled` as a mutation, or only as a create-time flag (docs show it only in the `create` example). *Check:* `npx wrangler hyperdrive update <id> --caching-disabled --help` against a real config once one exists; if unsupported, the runbook for "we shipped a config with the wrong cache mode" is delete + recreate + re-point the binding id, not a patch.

### 1.4 `localConnectionString` for `wrangler dev`

Standard `wrangler dev` bypasses Hyperdrive entirely and connects your Worker straight to whatever `localConnectionString` says — no pooling, no caching, works over TLS to a remote DB too ([Local development](https://developers.cloudflare.com/hyperdrive/configuration/local-development/)). The repo's current placeholder (`postgres://postgres:postgres@localhost:5432/postgres`, i.e. a local Supabase CLI stack on the default Postgres port) is correct for both bindings — point both `HYPERDRIVE` and `HYPERDRIVE_NOCACHE` at the same local Supabase instance during dev, since RLS still applies locally and the split only matters for Hyperdrive's own cache/pool behaviour, which doesn't exist in this mode anyway. The precedence rule to know: an env var named `CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_<BINDING_NAME>` overrides the file value if both are set — useful for a CI matrix that spins up ephemeral Postgres per run without touching `wrangler.jsonc`.

`wrangler dev --remote` instead runs the Worker in Cloudflare's network against the **real** deployed Hyperdrive config, pooling and caching included — the closest thing to a pre-deploy dress rehearsal, but *"database writes or side effects will affect your production data"* if pointed at the production config, so scope it to the staging config only.

### 1.5 Sizing the two pools against the actual database

Supabase's **Micro** compute tier — the tier Pro-plan projects run on by default and the one this project is provisioned on per `HANDOFF-CLAUDE-CODE.md` §3 — allows **60 direct connections** (distinct from the pooler's 200) [Supabase, Compute and Disk]. `origin-connection-limit=25` (RLS) + `15` (public) = 40 of 60, leaving 20 for Supabase Studio's SQL editor, `supabase db push`/pgTAP CI runs, and any second Worker environment sharing the same project (staging + production against one Micro instance during Phase 3–8, before a dedicated production project exists). This is tighter than it looks — **flag for the phase plan**: confirm actual `max_connections` on the provisioned project once it exists (`show max_connections;`), because Supabase's own background services (Realtime, PostgREST, Auth) also hold direct connections and 40/60 assumes they don't compete meaningfully with Hyperdrive's origin pool, which needs verifying, not assuming.

---

## 2. The postgres.js client, constructed correctly for a Worker behind Hyperdrive

### 2.1 Per-invocation, never module scope — and why the failure mode is worse than an error

Cloudflare's own reference construction, verbatim from the Hyperdrive Postgres.js example:

```ts
const sql = postgres(env.HYPERDRIVE.connectionString, {
  max: 5,
  fetch_types: false,
  prepare: true,
});
```
([postgres.js driver page](https://developers.cloudflare.com/hyperdrive/examples/connect-to-postgres/postgres-drivers-and-libraries/postgres-js))

`max: 5` is Cloudflare's own annotation — *"Limit the connections for the Worker request to 5 due to Workers' limits"* — but `rls-hyperdrive.md`'s `client()` correctly overrides this to `max: 1` for the identity-scoped config, because `withIdentity` opens exactly one transaction per call and a pool > 1 buys nothing while multiplying the origin-connection cost against the 25-connection budget in §1.5. Keep `max: 5` only on the `publicSql()` non-transactional path, where several independent cacheable reads inside one Worker invocation can legitimately run concurrently.

Constructing `postgres(...)` at module scope is not merely a style preference — it's a hard runtime error under `@opennextjs/cloudflare`, same as under raw Workers, and OpenNext's own troubleshooting page documents the exact symptom: *"Some DB clients (i.e. `postgres`) create a connection to the DB server when they are first instantiated and re-use it for later requests. This programming model is not compatible with the Workers runtime"* — manifesting as **"Cannot perform I/O on behalf of a different request"** on the *second* request, not the first, because the isolate reuses the module but the runtime has already torn down the first request's I/O context ([OpenNext troubleshooting](https://opennext.js.org/cloudflare/troubleshooting)). This matches exactly what `rls-hyperdrive.md` already prescribes (`client(env)` called inside `withIdentity`, never hoisted) — the only thing to add is that this bug is *silent on first request*, so a smoke test that only ever cold-starts (e.g. a single Playwright run against a fresh preview deploy) will not catch it. The DATA-06 proof's "200 interleaved requests against the deployed staging Worker" (already specified in `rls-hyperdrive.md` §7.1) doubles as the regression test for this — a second reason it must run against a warm, already-serving Worker.

### 2.2 `max` / `idle_timeout` / `connect_timeout` / `prepare` — what's correct here and what's a no-op

| Option | Value | Why |
|---|---|---|
| `max` | `1` (identity path), `5` (public path) | One transaction per request on the identity path; Cloudflare's own `5` ceiling is fine where there's no transaction to serialise against. |
| `prepare` | `true` | Must stay `true`. Cloudflare's troubleshooting page states `prepare: false` "makes queries uncacheable" — it disables Hyperdrive's own query-plan caching, not just postgres.js's client-side prepare. Setting it `false` silently costs you the public-content cache path entirely, independent of anything this lane is doing. |
| `fetch_types` | `false` | Must be disabled — this is Cloudflare's own example default, skipping a `pg_catalog` round trip on client construction that would otherwise run on *every* per-request client since none are reused. Skipping it is not optional tuning here the way it might be in a long-lived Node process; without it, every request pays an extra RTT before its first real query. |
| `idle_timeout` | **irrelevant — do not set it** | `idle_timeout` governs when postgres.js closes an *idle pooled connection it's holding open*. A per-request client that is never reused has no idle period to time out during — the client object is simply dropped when the request ends. Cloudflare is explicit that you must not call `sql.end()` either: *"You do not need to call `client.end()`, `sql.end()`… Workers-to-Hyperdrive connections are automatically cleaned up when the request or invocation ends"* ([Connection lifecycle](https://developers.cloudflare.com/hyperdrive/concepts/connection-lifecycle/)) — already flagged as correcting a stale recommendation in `.planning/research/STACK.md:138`, reconfirmed here. |
| `connect_timeout` | `10` (seconds) is a reasonable explicit value, though Hyperdrive's own initial-connection timeout is already 15 s at the platform level ([Limits](https://developers.cloudflare.com/hyperdrive/platform/limits/)) | Setting it slightly under Hyperdrive's own ceiling means a genuinely stuck origin fails your code's error path before Hyperdrive's own timeout fires and produces a less legible error. Not load-bearing; a no-op in the common case. |

### 2.3 What breaks under `@opennextjs/cloudflare` specifically (beyond raw-Workers postgres.js)

Two things are specific to this adapter, neither of which `rls-hyperdrive.md` covers since it doesn't discuss OpenNext at all:

**a) `env` is not ambient — it comes through `getCloudflareContext()`.** Route handlers and Server Components under OpenNext do not receive `env` as a function argument the way a raw Workers `fetch(request, env, ctx)` handler does; Next.js's own handler signature has no room for it. OpenNext's answer is `getCloudflareContext()`:

```ts
// apps/web/app/[locale]/account/bookings/route.ts (illustrative — not written here)
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { withIdentity } from "@/lib/db/identity";

export async function GET(request: Request) {
  const { env } = getCloudflareContext();
  const claims = await requireCustomer(request, env); // verify + throw 401
  const bookings = await withIdentity(env, { kind: "customer", claims }, (tx) =>
    tx`select * from public.bookings order by pickup_at desc`
  );
  return Response.json(bookings);
}
```
Types come from `npx wrangler types --env-interface CloudflareEnv`, which is what makes `env.HYPERDRIVE_NOCACHE` type-checked rather than an `any` — regenerate this whenever a binding is added, or the new `HYPERDRIVE_NOCACHE` binding silently type-checks as missing. ([OpenNext bindings guide](https://opennext.js.org/cloudflare/bindings))

**b) `getCloudflareContext()` has a build-time trap, and the identity path must never fall into it.** OpenNext's own docs warn: *"During SSG caution is advised since secrets and local development values from bindings… will be used for the pages' static generation"* — i.e. calling `getCloudflareContext()` during `next build`'s static generation returns **local/dev** binding values, not the deployed ones, because there's no real request to attach a Worker context to. This is not a new risk this lane invents — it's structurally impossible to trip if the identity-scoped path is *only* ever reached from dynamic route handlers and Server Components that opt out of static rendering (which every RLS-gated page must anyway, since it needs a live cookie/JWT). The concrete rule for the phase plan: **any file that imports `withIdentity` must also export `export const dynamic = "force-dynamic"`** (or be a Route Handler, which is dynamic by default when it reads `request` at all) — add this as a lint/CI grep alongside the existing `no-restricted-imports` gate on raw `postgres` imports from `rls-hyperdrive.md` §5 (P3), same mechanism, one more pattern:
```bash
# every file importing withIdentity must not be reachable from a statically-generated route
grep -rl "from ['\"]@/lib/db/identity['\"]" apps/web/app --include="*.tsx" --include="*.ts" \
  | xargs grep -L "force-dynamic" && echo "FAIL: identity import in a non-dynamic route"
```

**UNCERTAIN — U-DATA05-2**: whether `getCloudflareContext()`'s "async mode" (mentioned in passing in OpenNext's docs, not fully specified in what's fetchable) changes anything about *this* usage — the identity path never runs during SSG so it should be moot, but Phase 3 should still smoke-test one RLS-gated route through a full `opennextjs-cloudflare build && opennextjs-cloudflare preview` cycle (the repo's existing `pnpm preview` script) rather than only `next dev`, since `next dev` doesn't exercise OpenNext's request-context plumbing at all.

---

## 3. `withIdentity(kind, claims, fn)` — the exact wrapper, reconciled with D1/D2

`rls-hyperdrive.md` §4 ships `withIdentity(env, identity, run)` where `identity: DbIdentity` is a discriminated union. DATA-05's requested signature — `withIdentity(kind, claims, fn)` — is the same wrapper with the discriminant and payload split into separate parameters rather than a union object. Both are defensible; splitting them makes the four call-site variants (customer/guest/staff/public) read as plain function calls instead of object-literal construction at every call site, which is worth doing since this function is meant to be the *only* door into identity-scoped data and will be called from dozens of route handlers.

```ts
// apps/web/lib/db/identity.ts
import postgres from "postgres";
import type { VamosClaims } from "@/lib/auth/verify";

export type IdentityKind = "anon" | "customer" | "staff" | "guest";

/** Closed allowlist — the only thing set_config('role', …) is ever handed.
 *  A JWT whose payload claims role="vamos_staff" cannot reach this map;
 *  the map is keyed by *our* discriminant, decided by server logic, never
 *  by a token field. This is D2's grant boundary made syntactically
 *  impossible to bypass from the caller's side. */
const PG_ROLE = {
  anon: "anon",
  customer: "authenticated",
  staff: "vamos_staff",
  guest: "vamos_guest",
} as const satisfies Record<IdentityKind, string>;

type ClaimsFor<K extends IdentityKind> =
  K extends "customer" | "staff" ? VamosClaims :
  K extends "guest" ? { manageTokenHashHex: string } :
  undefined; // "anon" needs no claims

function claimsForSql(c: VamosClaims): string {
  // user_metadata is user-writable via the client SDK — it must never reach
  // a policy, so it is stripped here rather than trusted not to be read.
  return JSON.stringify({
    sub: c.sub, role: c.role, aal: c.aal ?? "aal1",
    email: c.email, session_id: c.session_id,
    app_metadata: c.app_metadata ?? {},
  });
}

function client(env: CloudflareEnv) {
  // Per-invocation, inside the handler, never module scope (§2.1). One
  // transaction per request ⇒ max:1, not Cloudflare's generic max:5.
  return postgres(env.HYPERDRIVE_NOCACHE.connectionString, {
    max: 1,
    fetch_types: false,
    prepare: true,
    connect_timeout: 10,
  });
}

/**
 * The ONLY entry point to identity-scoped data (D1+D2). Opens one explicit
 * transaction, binds role and claim transaction-locally via set_config(…,
 * is_local=true), runs the caller's queries, commits. On throw, postgres.js's
 * sql.begin() issues ROLLBACK automatically and rethrows the original error
 * unmodified — a PostgresError carries the SQLSTATE on `.code` (e.g. '42501'
 * for a missing grant, '23505' for a unique-constraint hit on
 * booking_reference), so callers branch on `.code`, never on message text.
 * `postgres` is importable only from this file — see the CI grep in
 * rls-hyperdrive.md §5 (P3).
 */
export async function withIdentity<K extends IdentityKind, T>(
  env: CloudflareEnv,
  kind: K,
  claims: ClaimsFor<K>,
  fn: (tx: postgres.TransactionSql) => Promise<T>,
): Promise<T> {
  const sql = client(env);
  return sql.begin(async (tx) => {
    // 1. Drop to the least-privileged role. `role` is a GUC, so
    //    set_config(…, is_local=true) is SET LOCAL ROLE with a bound
    //    parameter — extended protocol, no string concatenation (U4 in
    //    rls-hyperdrive.md: near-certain equivalence, unverified — the
    //    fallback there if this ever surprises still uses the closed
    //    PG_ROLE map, so no new injection surface is opened either way).
    await tx`select set_config('role', ${PG_ROLE[kind]}, true)`;

    // 2. Bind the identity the policies read. Postgres reverts this at
    //    COMMIT or ROLLBACK unconditionally — Cloudflare's pool RESET is
    //    not what makes this safe (rls-hyperdrive.md §5, P2).
    if (kind === "customer" || kind === "staff") {
      await tx`select set_config('request.jwt.claims',
        ${claimsForSql(claims as VamosClaims)}, true)`;
    } else if (kind === "guest") {
      await tx`select set_config('request.vamos.manage_token_hash',
        ${(claims as { manageTokenHashHex: string }).manageTokenHashHex}, true)`;
    }
    // kind === "anon": no claim to set; RLS policies for `anon` see an
    // empty app.jwt() and rely on grants alone (anon has none on any
    // customer/ops table per rls-hyperdrive.md §3).

    return fn(tx);
  });
}

// ---- The four variants, as thin named wrappers — this is what makes call
// sites read as plain function calls rather than object literals. ----

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

```ts
// apps/web/lib/db/public.ts — the cached path, no identity, no transaction
import postgres from "postgres";

/** Public content only. Logs in as vamos_public — SELECT on four content
 *  tables, no role memberships. No transaction ⇒ eligible for Hyperdrive's
 *  cache (§4). */
export function publicSql(env: CloudflareEnv) {
  return postgres(env.HYPERDRIVE.connectionString, {
    max: 5, fetch_types: false, prepare: true,
  });
}
```

### 3.1 What a caller that forgets the wrapper gets

```ts
// A route handler that (by mistake) reaches for `postgres` directly:
import postgres from "postgres";
const sql = postgres(env.HYPERDRIVE_NOCACHE.connectionString);
await sql`select * from public.bookings`;
```
This throws a `postgres.PostgresError` with `.code === "42501"` (`insufficient_privilege`) — `vamos_edge` (the login role for `HYPERDRIVE_NOCACHE`) holds no `SELECT` grant on `public.bookings` at all until `set_config('role', …)` drops it into `authenticated`/`vamos_staff`/`vamos_guest`. It is a 500, not stale or cross-tenant data. This is exactly `rls-hyperdrive.md` §7's assertion 2, and the reason `postgres` must be unimportable outside `apps/web/lib/db/*` (their P3 ESLint/grep gate) — a raw import compiling at all is the bug; the runtime 42501 is only the safety net behind it.

---

## 4. Latency: what p50 < 30 ms measures, how to instrument it for free, and realistic numbers

### 4.1 What the number actually measures

The p50 < 30 ms criterion is the **Worker→Hyperdrive→Postgres round trip for one representative identity-scoped query** — concretely, the wall-clock time of one `withIdentity(env, "customer", claims, tx => tx\`select …\`)` call, start (client construction) to resolved promise, for a single-row-ish read like "a customer's own booking by id." It is **not**:
- page TTFB (that also includes JWT verification, Next.js render, and network egress to the browser — a different, larger budget),
- a public-content query on `HYPERDRIVE` (that path is designed to be cached and answered without touching Postgres at all on a hit — comparing it against the identity path's budget would be comparing the wrong thing),
- an aggregate/multi-join query (pricing quote reads, which are Phase 4's `quote-engine-core` lane's budget, not this one's).

`rls-hyperdrive.md` §6 already derives the shape of the cost: `withIdentity` is *up to* 5 sequential round trips (BEGIN, `set_config` role, `set_config` claims, the query itself, COMMIT) unless pipelined. At Cloudflare's own stated *"1-3ms when placed nearby"* per round trip, 5 sequential RTTs land at 5–15 ms — comfortably under the 30 ms p50 bar. At *"20-30ms from a distant region"* per round trip, the same 5 RTTs land at 100–150 ms — 3–5× over budget. **The entire margin between passing and failing this criterion is Worker placement, not query optimisation** — which is why `rls-hyperdrive.md` calls Placement "a hard requirement of this design, not an optimisation," and this brief's job is to say precisely which placement mechanism and how to prove the number.

### 4.2 Smart Placement vs. Placement Hints — pick the deterministic one

Two distinct Workers features exist, easy to conflate:

| | **Smart Placement** | **Placement Hints** |
|---|---|---|
| Config | `"placement": { "mode": "smart" }` | `"placement": { "region": "aws:eu-central-1" }` |
| Mechanism | Cloudflare measures your Worker's own request-duration across candidate PoPs over time and moves it if a location is *significantly* faster than running near the requester | Deterministic: runs in the Cloudflare data centre with lowest latency to the named cloud region, from the first deploy |
| Warm-up | Needs "consistent traffic from multiple locations" and can take up to 15 minutes to activate | Immediate |
| Fit here | Poor — this app has one back end (Supabase Frankfurt); there's no "which region is the Worker's dependency in" ambiguity for Smart Placement to resolve, and its traffic-pattern learning adds a startup lag this project doesn't need | **Correct fit** — Cloudflare's own guidance: use Placement Hints "when you know the exact location of your back-end infrastructure, your Worker connects to a single database… and your infrastructure is single-homed" |

([Smart Placement](https://developers.cloudflare.com/workers/configuration/smart-placement/), [Placement Hints changelog, 2026-01-22](https://developers.cloudflare.com/changelog/2026-01-22-explicit-placement-hints/))

**Decision: use Placement Hints, not Smart Placement.** Add to `wrangler.jsonc` under both `env.staging` and `env.production` (top-level `placement` is dropped by named environments the same way top-level bindings are, per the repo's own existing comment — so it must live inside each `env.*` block, not at the file root):

```jsonc
"env": {
  "staging": {
    // ... existing bindings ...
    "placement": { "region": "aws:eu-central-1" }
  },
  "production": {
    // ... existing bindings ...
    "placement": { "region": "aws:eu-central-1" }
  }
}
```
Placement Hints were a January 2026 launch — recent enough that Phase 3 should re-check availability on the account's plan tier rather than assume GA-everywhere; the fetched docs describe it as available without naming a plan restriction, but that's worth a one-line confirmation against the account once billing is set up. This is also the resolution to `.planning/phases/02-.../02-RESEARCH.md:146`'s open item — that note already names the `aws:eu-central-1` config, this brief confirms it's the *hint* mechanism (not Smart Placement) and gives the exact per-environment placement.

**UNCERTAIN — U-DATA05-3**: whether `placement.host`/`placement.hostname` L4/L7 probes are needed for Hyperdrive specifically, or whether the `region` shorthand alone is sufficient since Hyperdrive itself (not the raw Postgres host) is the thing being reached. Cloudflare's docs describe the host/hostname probes for infrastructure *not* on a named cloud provider; Supabase's `db.<ref>.supabase.co` likely resolves to AWS infrastructure in `eu-central-1` (Frankfurt) already, which is why `aws:eu-central-1` is the right value — but this should be confirmed against the actual provisioned Supabase project's region setting once one exists, not assumed from the account's marketing region name.

### 4.3 Instrumenting it without a paid APM: Workers Analytics Engine

The free, built-in answer is **Workers Analytics Engine (WAE)** — not a third-party APM, a Cloudflare binding, free tier "100,000 [data points] included per day" for writes and "10,000 included per day" for read queries, with the platform stating *"you will not be billed for your use of Workers Analytics Engine"* at time of writing ([WAE pricing](https://developers.cloudflare.com/analytics/analytics-engine/pricing/)). Wire it as a fifth binding:

```jsonc
"analytics_engine_datasets": [
  { "binding": "DB_LATENCY", "dataset": "vamos_db_latency" }
]
```

Instrument inside `withIdentity` itself (one place, every call site benefits):

```ts
export async function withIdentity<K extends IdentityKind, T>(
  env: CloudflareEnv, kind: K, claims: ClaimsFor<K>,
  fn: (tx: postgres.TransactionSql) => Promise<T>,
): Promise<T> {
  const t0 = Date.now();
  const sql = client(env);
  try {
    const result = await sql.begin(async (tx) => {
      await tx`select set_config('role', ${PG_ROLE[kind]}, true)`;
      if (kind === "customer" || kind === "staff") {
        await tx`select set_config('request.jwt.claims', ${claimsForSql(claims as VamosClaims)}, true)`;
      } else if (kind === "guest") {
        await tx`select set_config('request.vamos.manage_token_hash', ${(claims as { manageTokenHashHex: string }).manageTokenHashHex}, true)`;
      }
      return fn(tx);
    });
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
```

Query it back with the SQL API (`https://api.cloudflare.com/client/v4/accounts/{account_id}/analytics_engine/sql`, API-token auth) using Analytics Engine's documented quantile function — note the name is `quantileExactWeighted`, not the more common `quantile`/`quantileTDigest`, and it requires the `_sample_interval` weight column Cloudflare's own worked example uses for exactly a "95th centile query time" case ([Aggregate functions](https://developers.cloudflare.com/analytics/analytics-engine/sql-reference/aggregate-functions/)):

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

This is the concrete, zero-cost mechanism for the p50 < 30 ms success criterion: it's a real percentile over real production/staging traffic, not a synthetic single-shot timing. As a cheaper fallback that needs no new binding at all, the repo already has `observability: { enabled: true }` in `wrangler.jsonc`, which turns on Workers Logs — a `console.log(JSON.stringify({ event: "db_latency", kind, ms: Date.now() - t0 }))` is queryable in the dashboard's Logs view or via `wrangler tail` for ad-hoc spot checks, but it has no built-in percentile aggregation the way WAE's SQL API does, so it's a debugging tool, not the thing that answers "what's our p50."

### 4.4 What a realistic number actually is, honestly

With Placement Hints correctly pinning the Worker near `eu-central-1` and Supabase's project also in Frankfurt (ADR-007's pinning, `HANDOFF-CLAUDE-CODE.md` §3's "eu-central Frankfurt" data-residency decision): expect the 5-RTT `withIdentity` shape to land in the **single-digit to low-teens milliseconds** range for a single-row read, based directly on Cloudflare's stated 1–3 ms/RTT-when-nearby figure — i.e. comfortably inside the 30 ms p50 bar, with margin for query execution time itself (index-seek reads on `bookings.customer_id` or `booking_legs.booking_id`, both already indexed per `rls-hyperdrive.md` §3, should be sub-millisecond server-side). Without Placement Hints — a Worker answering from, say, a US or APAC PoP for a Frankfurt database — the same shape is **100–150 ms**, a 3–5× miss. **This cannot be asserted with a precise figure before real infrastructure exists** (no Cloudflare account, no Supabase project provisioned yet, per the stated owner blocker) — it must be *measured*, not assumed, the first time a staging Worker exists, using exactly the §4.3 instrumentation. Do not accept a "should be fine" from this brief or from Cloudflare's general marketing figures as a substitute for one real staging measurement before Phase 3 is called done.

**UNCERTAIN — U-DATA05-4** (extends `rls-hyperdrive.md`'s U2): whether `sql.begin(async tx => {...})` with sequential `await tx\`...\`` calls inside (this brief's shape, and `rls-hyperdrive.md`'s primary `withIdentity`) actually issues 5 separate network flushes over Hyperdrive, or whether postgres.js's pipelining coalesces some of them even in the non-array-return form. *Check, exactly as `rls-hyperdrive.md` already specifies*: `log_statement=all` + `log_line_prefix='%m '` on local Supabase, count flushes; compare against the WAE `p50_ms` figure from a real staging deploy once one exists — if the measured number is well under the naive 5×RTT estimate, pipelining is doing more than assumed and the array-return micro-optimisation in `rls-hyperdrive.md`'s `readOneAsCustomer` example is unnecessary complexity to carry into every call site; if it's close to the naive estimate, standardise all hot read paths on the array-return form instead of the sequential-await form shown in §3 above.

---

## RECOMMENDATION

**Wire two Hyperdrive bindings (`HYPERDRIVE`, `HYPERDRIVE_NOCACHE`) under both `env.staging` and `env.production` in `apps/web/wrangler.jsonc`, backed by `vamos_public`/`vamos_edge` on Supabase's direct `:5432` string per D3; construct `postgres.js` per-request inside `withIdentity(env, kind, claims, fn)` (never module scope) with `max:1 / fetch_types:false / prepare:true` on the identity path and `max:5` on the public path; reach both only through `getCloudflareContext().env` in OpenNext route handlers/Server Components, never in a statically-generated route; pin both environments with `placement.region = "aws:eu-central-1"` (Placement Hints, not Smart Placement); and prove the p50 < 30 ms criterion with a Workers Analytics Engine dataset (`quantileExactWeighted(0.5)`) fed from inside `withIdentity` itself, measured against a real deployed staging Worker — never asserted from Cloudflare's general marketing latency figures alone.**

Concretely, Phase 3 ships:

1. `apps/web/wrangler.jsonc`: add `HYPERDRIVE_NOCACHE` binding + `placement` block to `env.staging` and `env.production`; replace both configs' placeholder ids the moment `wrangler hyperdrive create` runs against a real Supabase project (§1.1–1.2); add `analytics_engine_datasets: [{ binding: "DB_LATENCY", dataset: "vamos_db_latency" }]`.
2. `apps/web/lib/db/identity.ts`: `withIdentity(env, kind, claims, fn)` exactly as §3, plus the four named wrappers (`asCustomer`/`asStaff`/`asGuest`/`asAnon`) and the built-in WAE timing (§4.3). `apps/web/lib/db/public.ts`: `publicSql(env)`, no identity, no transaction.
3. CI gates: the existing `no-restricted-imports` rule on raw `postgres` (from `rls-hyperdrive.md` §5) plus a new grep requiring `export const dynamic = "force-dynamic"` on any file importing `withIdentity` (§2.3b).
4. `wrangler hyperdrive create` run twice per environment with `origin-connection-limit` 25 (RLS) / 15 (public), sized against Supabase Micro's 60-connection direct ceiling (§1.5) — re-verify against the real provisioned project's `max_connections` once it exists.
5. One real latency measurement against a deployed staging Worker before this phase is called done — not a projected number from this brief.

Do not use `wrangler secret put` for the database credential (it lives inside the Hyperdrive config object, addressed by opaque `id`). Do not set `prepare:false`. Do not set an `idle_timeout` or call `sql.end()`. Do not use Smart Placement where a deterministic region hint fits the single-database topology better. Do not call `withIdentity` from anything reachable during static generation.

---

### Sources

- [How Hyperdrive works](https://developers.cloudflare.com/hyperdrive/concepts/how-hyperdrive-works/) · [Connect to PostgreSQL](https://developers.cloudflare.com/hyperdrive/examples/connect-to-postgres/) · [Postgres.js driver](https://developers.cloudflare.com/hyperdrive/examples/connect-to-postgres/postgres-drivers-and-libraries/postgres-js) · [Hyperdrive → Supabase](https://developers.cloudflare.com/hyperdrive/examples/connect-to-postgres/postgres-database-providers/supabase/) · [Get started](https://developers.cloudflare.com/hyperdrive/get-started/) · [Local development](https://developers.cloudflare.com/hyperdrive/configuration/local-development/) · [Tune connection pool](https://developers.cloudflare.com/hyperdrive/configuration/tune-connection-pool/) · [Platform limits](https://developers.cloudflare.com/hyperdrive/platform/limits/) · [Metrics](https://developers.cloudflare.com/hyperdrive/observability/metrics/) · [Connection lifecycle](https://developers.cloudflare.com/hyperdrive/concepts/connection-lifecycle/)
- [Workers Smart Placement](https://developers.cloudflare.com/workers/configuration/smart-placement/) · [Placement Hints changelog](https://developers.cloudflare.com/changelog/2026-01-22-explicit-placement-hints/) · [Workers Placement config](https://developers.cloudflare.com/workers/configuration/placement/)
- [Workers Analytics Engine — get started](https://developers.cloudflare.com/analytics/analytics-engine/get-started/) · [WAE pricing](https://developers.cloudflare.com/analytics/analytics-engine/pricing/) · [WAE SQL aggregate functions](https://developers.cloudflare.com/analytics/analytics-engine/sql-reference/aggregate-functions/)
- [OpenNext Cloudflare — Bindings](https://opennext.js.org/cloudflare/bindings) · [OpenNext Cloudflare — Troubleshooting](https://opennext.js.org/cloudflare/troubleshooting) · [OpenNext Cloudflare — get started](https://opennext.js.org/cloudflare/get-started)
- [Supabase — Compute and Disk](https://supabase.com/docs/guides/platform/compute-and-disk)
- Repo, read-only: `apps/web/wrangler.jsonc`, `apps/web/worker.ts`, `apps/web/package.json`, `.planning/phases/02-data-schema-rls-staff-auth-foundations/research/rls-hyperdrive.md`, `.planning/phases/02-data-schema-rls-staff-auth-foundations/02-RESEARCH.md`