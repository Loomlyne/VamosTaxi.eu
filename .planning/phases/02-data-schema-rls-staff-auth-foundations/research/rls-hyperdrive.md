# RLS over Hyperdrive — Phase 2/3 Research Brief (`rls-hyperdrive` lane)

**Date:** 2026-08-21 · **Stack:** Next.js 15 (OpenNext) → Cloudflare Worker → Hyperdrive → Supabase Postgres **17** (direct string, `:5432`), driver `postgres.js`, identity from Supabase Auth.

---

## 0. Verdict up front

RLS is enforceable on this stack, and it is enforceable *structurally* rather than by discipline — but only if you stop treating "set the claim" as the security boundary. The claim is the **filter**; the security boundary is the **login role's grants**.

The design is: Hyperdrive logs in as a role that owns nothing and is granted nothing (`vamos_edge`, `NOINHERIT`). Every request opens one short explicit transaction, does `set_config('role', …, true)` to drop into `anon` / `authenticated` / `vamos_guest` / `vamos_staff`, then `set_config('request.jwt.claims', …, true)`, then its queries, then commits. If any code path forgets the wrapper, the query does not return stale identity — it fails with `42501 insufficient_privilege`, because `vamos_edge` has no grant on any table. That is what makes DATA-06 a property of the schema rather than a property of the test suite.

---

## 1. Validating the Supabase JWT at the edge, with no round trip

### 1.1 What Supabase issues now

- Asymmetric signing keys are **the default for new projects**; `getClaims` verifies "locally via the WebCrypto API and a cached JWKS endpoint when the project uses asymmetric signing keys (the default for new projects)" ([Supabase, server-side client](https://supabase.com/docs/guides/auth/server-side/creating-a-client)).
- Supported algorithms: **ES256 (P-256)**, RS256 (RSA-2048), HS256 — HS256 is documented as "Not recommended for production applications". EdDSA "coming soon" ([Supabase, JWT signing keys](https://supabase.com/docs/guides/auth/signing-keys)).
- JWKS endpoint: `GET https://<project-ref>.supabase.co/auth/v1/.well-known/jwks.json`, "cached by Supabase's edge servers for 10 minutes… client libraries may cache the keys in memory for an additional 10 minutes" (same page).
- Key states: **Standby → Current → Previously used → Revoked**. Rotation without redeploy is the point of the design.
- Access-token claims (fixed set): required `iss, aud, exp, iat, sub, role, aal, session_id, email, phone, is_anonymous`; optional `jti, nbf, app_metadata, user_metadata, amr` ([Custom Access Token Hook](https://supabase.com/docs/guides/auth/auth-hooks/custom-access-token-hook)).
- **`role` is constrained to `enum: ["anon","authenticated"]`** in the hook's JSON Schema. It is the *Postgres* role, not your app role. Do not put `dispatcher`/`admin` there.
- `aal` is `aal1 | aal2 | aal3`; "JWTs without an `aal` claim are at the `aal1` level" ([MFA](https://supabase.com/docs/guides/auth/auth-mfa)).

### 1.2 Decision: verify with `jose` + a KV-backed JWKS cache, not `supabase.auth.getClaims()`

`getClaims()` is correct and does verify locally — but it drags `@supabase/supabase-js` + `@supabase/ssr` cookie machinery into the Worker's hot path for what is a 40-line operation, and its JWKS cache lives per-isolate, so a cold isolate pays a `fetch`. Use `supabase-js` for what the architecture already scopes it to (Auth flows, invites, Storage, Realtime) and verify tokens yourself with `jose` (pure WebCrypto, Workers-native), backed by KV so the JWKS fetch is amortised **across isolates**, not per isolate.

Zero-network-round-trip is achieved by KV + module-scope memo; the only fetch is a JWKS miss (10-minute TTL, matching Supabase's own edge cache).

```ts
// apps/web/lib/auth/verify.ts
import { createLocalJWKSet, jwtVerify, type JSONWebKeySet, type JWTPayload } from "jose";

const JWKS_KV_KEY = "auth:jwks:v1";
const JWKS_TTL_S = 600; // matches Supabase's own 10-minute edge cache

/** Caching JWKS *data* (not an I/O object) in module scope is legal in Workers. */
let memo: { jwks: JSONWebKeySet; until: number } | null = null;

async function getJwks(env: Env): Promise<JSONWebKeySet> {
  const now = Date.now();
  if (memo && memo.until > now) return memo.jwks;

  const cached = await env.GEO_CACHE.get<JSONWebKeySet>(JWKS_KV_KEY, "json");
  if (cached) {
    memo = { jwks: cached, until: now + JWKS_TTL_S * 1000 };
    return cached;
  }

  const res = await fetch(`${env.SUPABASE_URL}/auth/v1/.well-known/jwks.json`);
  if (!res.ok) throw new Error(`jwks_fetch_failed_${res.status}`);
  const jwks = (await res.json()) as JSONWebKeySet;

  await env.GEO_CACHE.put(JWKS_KV_KEY, JSON.stringify(jwks), { expirationTtl: JWKS_TTL_S });
  memo = { jwks, until: now + JWKS_TTL_S * 1000 };
  return jwks;
}

export interface VamosClaims extends JWTPayload {
  sub: string;
  role: "anon" | "authenticated";
  aal?: "aal1" | "aal2" | "aal3";
  session_id?: string;
  email?: string;
  is_anonymous?: boolean;
  app_metadata?: { vamos_role?: "dispatcher" | "admin"; [k: string]: unknown };
}

/**
 * Verifies a Supabase access token at the edge. Asymmetric only — HS256 is
 * refused so that a leaked legacy shared secret cannot be used to mint a token
 * (algorithm-downgrade defence). Throws on any failure; never returns partial trust.
 */
export async function verifyAccessToken(env: Env, jwt: string): Promise<VamosClaims> {
  const keySet = createLocalJWKSet(await getJwks(env));
  const { payload } = await jwtVerify(jwt, keySet, {
    algorithms: ["ES256", "RS256"],          // never "HS256"
    issuer: `${env.SUPABASE_URL}/auth/v1`,
    audience: "authenticated",
    clockTolerance: 5,
  });
  const c = payload as VamosClaims;
  if (!c.sub || (c.role !== "authenticated" && c.role !== "anon")) throw new Error("bad_claims");
  return c;
}
```

A key rotation that lands mid-TTL produces a `kid` miss. Handle it by clearing `memo`/KV once and retrying the verify exactly once, then failing — otherwise a rotation is a 10-minute outage.

**Staff role claim.** Register a Custom Access Token Hook that writes `app_metadata.vamos_role` (from `raw_app_meta_data`, which "cannot be updated by the user" — [RLS reference](https://supabase.com/docs/guides/database/postgres/row-level-security)). Leave `role` alone. Staff identity = `app_metadata.vamos_role ∈ {dispatcher, admin}` **and** `aal === 'aal2'` (AUTH-05, enforced twice: at the edge and again in SQL).

---

## 2. Binding that identity to the SQL session

### 2.1 The options, compared honestly

| Option | Verdict | Why |
|---|---|---|
| **A. `SET LOCAL` / `set_config(..., true)` inside an explicit transaction, plus `SET LOCAL ROLE`** | **CHOSEN** | Postgres itself reverts it: "the effects of `SET LOCAL` last only till the end of the current transaction, whether committed or not" ([PG SET](https://www.postgresql.org/docs/current/sql-set.html)). Hyperdrive explicitly supports it: "if you manually create a transaction with `BEGIN`/`COMMIT`, `SET` statements within the transaction will take effect" ([How Hyperdrive works](https://developers.cloudflare.com/hyperdrive/concepts/how-hyperdrive-works/)). Keeps `auth.uid()`-style policies, Supabase's own idioms, and pgTAP tests. |
| **B. `SET LOCAL ROLE` only, no claims** | Insufficient alone, **required as a companion** | Roles select *which policies apply* and *which grants exist*; they cannot express "this customer's rows". Supabase's own pgTAP guidance uses both: "Switch role and identity between cases with `set local role` and `set local request.jwt.claim.sub`". |
| **C. Plain `SET` (session-level), relying on Hyperdrive's `RESET`** | **REJECTED** | Hyperdrive does `RESET` on return to pool, but that makes a Cloudflare implementation detail your tenant-isolation boundary. Worse: within one Worker invocation, `postgres.js` may reuse the same client connection for several queries, so a plain `SET` leaks *forward* inside the request too. This is exactly Pitfall 3 in `.planning/research/PITFALLS.md`. |
| **D. Multi-statement simple query (`SET LOCAL …; SELECT …` in one message)** | **REJECTED as primary; possible micro-optimisation** | Genuinely 1 RTT, and Hyperdrive documents it works (`SET X; SELECT foo FROM bar;`). But the simple protocol has **no bind parameters**, so the claims JSON — the single most attacker-influenced value in the system — must be string-concatenated into SQL. Also disables prepared statements. Not worth one RTT. |
| **E. Pass claims as a bound arg to `SECURITY INVOKER` functions, drop `current_setting`** | **REJECTED** | Every table read becomes a bespoke function; RLS policies can no longer read the identity (they only see `current_setting`), so you end up re-implementing filtering inside function bodies — i.e. option F with extra steps. Also `SET ROLE` "cannot be used within a `SECURITY DEFINER` function" ([PG SET ROLE](https://www.postgresql.org/docs/current/sql-set-role.html)), so the role half can't move server-side anyway. |
| **F. Abandon RLS, use application-level `WHERE`** | **REJECTED** | Directly violates DATA-02/03/04. And the whole value is that it catches the one query out of ~40 where someone forgets the predicate. |

### 2.2 Why `set_config('role', …, true)` and not `SET LOCAL ROLE <name>`

`SET ROLE` is backed by the `role` GUC, so `SELECT set_config('role', $1, true)` is the transaction-local equivalent — and it takes the role name as a **bound parameter**, keeping the extended protocol and prepared statements. Combine it with a closed TypeScript allowlist so no user-controlled string can ever reach it. (Flagged as **U4** below with the one-line check.)

Two Postgres facts that matter here:

- "`SET ROLE` does not process session variables as specified by the role's `ALTER ROLE` settings; this only happens during login." So a role-default GUC cannot silently overwrite your claims. Good — but it also means you cannot use `ALTER ROLE authenticated SET …` for anything.
- PG16+ grant options: `GRANT r TO u WITH INHERIT FALSE, SET TRUE` — "the session user can use `SET ROLE` to drop the privileges assigned directly to the session user and instead acquire the privileges available to the named role". Supabase is on **Postgres 17** by default, so this is available.

---

## 3. DDL

```sql
-- ============================================================================
-- 0002_roles_and_helpers.sql
-- Roles and the identity helpers every policy reads. Runs once per environment.
-- ============================================================================

create schema if not exists app;
revoke all on schema app from public;
grant usage on schema app to anon, authenticated, vamos_guest, vamos_staff;

-- ---- Application roles (NOLOGIN: only ever reached via SET LOCAL ROLE) ----
create role vamos_guest nologin;   -- holder of a valid manage token (DATA-03)
create role vamos_staff nologin;   -- dispatcher / admin              (DATA-04)
-- `anon` and `authenticated` already exist on Supabase.

-- ---- The role Hyperdrive logs in as for every identity-scoped query --------
-- Owns nothing. Granted nothing. NOINHERIT plus per-grant INHERIT FALSE means
-- it holds zero privileges until it explicitly SET ROLEs. This is the whole
-- DATA-06 story: a query issued without the wrapper raises 42501, it does not
-- silently return the previous request's rows.
create role vamos_edge login password :'vamos_edge_password' noinherit;

grant anon          to vamos_edge with inherit false, set true;
grant authenticated to vamos_edge with inherit false, set true;
grant vamos_guest   to vamos_edge with inherit false, set true;
grant vamos_staff   to vamos_edge with inherit false, set true;

-- ---- The role the CACHED Hyperdrive config logs in as ---------------------
-- Public content only: no role memberships, direct SELECT on four tables,
-- RLS still on. Queries on this path need no transaction, so they stay
-- cacheable by Hyperdrive.
create role vamos_public login password :'vamos_public_password' noinherit;

-- ---- Identity helpers (ours, in app.*, so we do not depend on auth.* -------
--      internals and so pgTAP can test them directly) ----------------------
create or replace function app.jwt() returns jsonb
  language sql stable
  set search_path = ''
as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb)
$$;

create or replace function app.uid() returns uuid
  language sql stable
  set search_path = ''
as $$
  select nullif(app.jwt() ->> 'sub', '')::uuid
$$;

/** Hex-encoded sha256 of the manage token supplied on this request, or NULL. */
create or replace function app.manage_token_hash() returns bytea
  language sql stable
  set search_path = ''
as $$
  select decode(nullif(current_setting('request.vamos.manage_token_hash', true), ''), 'hex')
$$;

/**
 * Staff authorisation. Three independent conditions, all required:
 *  1. the verified JWT carries a staff app_metadata role (DATA-04),
 *  2. the session passed a second factor (AUTH-05 — enforced in SQL, not only
 *     in middleware, so a forgotten route guard is not a bypass),
 *  3. the staff row is still active (a JWT lives up to an hour; this makes
 *     revocation immediate). SECURITY DEFINER so `vamos_staff` needs no grant
 *     on public.staff.
 */
create or replace function app.is_staff() returns boolean
  language sql stable security definer
  set search_path = ''
as $$
  select coalesce(app.jwt() -> 'app_metadata' ->> 'vamos_role', '') in ('dispatcher','admin')
     and coalesce(app.jwt() ->> 'aal', 'aal1') = 'aal2'
     and exists (select 1 from public.staff s where s.user_id = app.uid() and s.active)
$$;

revoke all on function app.is_staff() from public;
grant execute on function app.is_staff() to vamos_staff;
grant execute on function app.jwt(), app.uid() to anon, authenticated, vamos_guest, vamos_staff;
grant execute on function app.manage_token_hash() to vamos_guest;
```

```sql
-- ============================================================================
-- 0003_bookings_rls.sql   (shape only — column list is the schema lane's)
-- ============================================================================

alter table public.bookings enable row level security;

-- Grants first. Policies decide *which rows*; grants decide *whether at all*,
-- and a missing grant raises 42501 before any policy runs.
revoke all on public.bookings from anon, authenticated, vamos_guest, vamos_staff, vamos_edge, vamos_public;
grant select                     on public.bookings to authenticated;
grant select                     on public.bookings to vamos_guest;
grant select, insert, update     on public.bookings to vamos_staff;
-- `anon` gets nothing: a quote is created by a server-authoritative route
-- running as vamos_staff-equivalent service logic, never by the browser.

-- DATA-02 — a customer reads only their own bookings.
create policy bookings_select_own
  on public.bookings for select to authenticated
  using (
    (select app.uid()) is not null
    and customer_id = (select app.uid())
  );

-- DATA-03 — a guest opens their booking with a valid manage token and nothing else.
-- Token is stored hashed; the raw token exists only in the emailed link.
create policy bookings_select_by_manage_token
  on public.bookings for select to vamos_guest
  using (
    app.manage_token_hash() is not null
    and manage_token_hash is not null
    and manage_token_hash = app.manage_token_hash()
  );

-- DATA-04 — staff, by role + second factor + active staff row.
create policy bookings_select_staff
  on public.bookings for select to vamos_staff using ((select app.is_staff()));
create policy bookings_update_staff
  on public.bookings for update to vamos_staff
  using ((select app.is_staff())) with check ((select app.is_staff()));

-- Belt: a RESTRICTIVE policy that refuses to serve `authenticated` when no
-- identity was bound at all. Restrictive policies AND with the permissive set.
create policy bookings_require_identity
  on public.bookings as restrictive for all to authenticated
  using ((select app.uid()) is not null);

-- Make the policy sargable — an RLS predicate is a WHERE clause and needs its index.
create index if not exists bookings_customer_id_idx on public.bookings (customer_id);
create unique index if not exists bookings_manage_token_hash_idx
  on public.bookings (manage_token_hash) where manage_token_hash is not null;
```

```sql
-- Child tables reach identity through the parent; the inner select is itself
-- RLS-filtered as the same role, so the two can never disagree.
alter table public.booking_legs enable row level security;
revoke all on public.booking_legs from anon, authenticated, vamos_guest, vamos_staff, vamos_edge, vamos_public;
grant select on public.booking_legs to authenticated, vamos_guest;
grant select, insert, update, delete on public.booking_legs to vamos_staff;

create policy legs_select_via_parent
  on public.booking_legs for select to authenticated, vamos_guest
  using (exists (select 1 from public.bookings b where b.id = booking_legs.booking_id));
create policy legs_staff
  on public.booking_legs for all to vamos_staff
  using ((select app.is_staff())) with check ((select app.is_staff()));
```

```sql
-- ============================================================================
-- 0004_ops_tables_rls.sql — DATA-04 enforced by GRANT, not only by policy
-- ============================================================================
do $$
declare t text;
begin
  foreach t in array array[
    'chauffeurs','vehicles','booking_events','coupons','coupon_redemptions',
    'distance_rates','fixed_routes','surcharges','staff','stripe_events'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    -- The line that makes "a customer session cannot reach ops data" structural:
    execute format('revoke all on public.%I from anon, authenticated, vamos_guest, vamos_edge, vamos_public', t);
    execute format('grant select, insert, update, delete on public.%I to vamos_staff', t);
    execute format($p$create policy %I on public.%I for all to vamos_staff
                      using ((select app.is_staff())) with check ((select app.is_staff()))$p$,
                   t || '_staff_all', t);
  end loop;
end $$;

-- Public content: readable with no identity at all, so these queries can run
-- outside a transaction and stay cacheable by Hyperdrive.
do $$
declare t text;
begin
  foreach t in array array['content_strings','reviews','vehicle_classes','settings'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated, vamos_edge, vamos_guest', t);
    execute format('grant select on public.%I to vamos_public, anon, authenticated, vamos_staff', t);
  end loop;
end $$;

create policy reviews_public_read on public.reviews for select
  to vamos_public, anon, authenticated using (published);
create policy content_strings_public_read on public.content_strings for select
  to vamos_public, anon, authenticated using (true);
-- (settings: expose a published subset via a security_invoker view rather than
--  the raw table — Postgres 15+ `with (security_invoker = true)`.)
```

Two things deliberately **not** done: no `FORCE ROW LEVEL SECURITY` (migrations and seeds run as the table owner and must not be filtered), and `vamos_edge`/`vamos_public` are never table owners and never `BYPASSRLS`. Note that Cloudflare's own Supabase guide suggests `GRANT postgres TO hyperdrive_user` — **do not do that**; the `postgres` role owns these tables and would bypass every policy.

---

## 4. TypeScript — the only way to reach the database

```ts
// apps/web/lib/db/identity.ts
import postgres from "postgres";
import type { VamosClaims } from "@/lib/auth/verify";

export type DbIdentity =
  | { kind: "anon" }
  | { kind: "customer"; claims: VamosClaims }
  | { kind: "staff"; claims: VamosClaims }
  | { kind: "guest"; manageTokenHashHex: string };

/**
 * Closed allowlist. The value handed to set_config('role', …) is chosen by
 * *our* discriminant, never by a string from the token. A JWT whose `role`
 * claim says "vamos_staff" cannot reach this map.
 */
const PG_ROLE = {
  anon: "anon",
  customer: "authenticated",
  staff: "vamos_staff",
  guest: "vamos_guest",
} as const satisfies Record<DbIdentity["kind"], string>;

/** Claims we are willing to expose to SQL. user_metadata is user-writable and
 *  must never reach a policy, so it is stripped here rather than trusted not
 *  to be referenced. */
function claimsForSql(c: VamosClaims): string {
  return JSON.stringify({
    sub: c.sub, role: c.role, aal: c.aal ?? "aal1",
    email: c.email, session_id: c.session_id,
    app_metadata: c.app_metadata ?? {},
  });
}

function client(env: Env) {
  // Per-invocation, inside the handler. Never module scope: Workers do not
  // allow I/O across requests, and Hyperdrive already pools for us.
  return postgres(env.HYPERDRIVE_NOCACHE.connectionString, {
    max: 1,             // one transaction at a time per request
    fetch_types: false, // skips postgres.js's pg_catalog type round trip
    prepare: true,      // Hyperdrive supports named prepared statements
    connect_timeout: 10,
  });
}

/**
 * The ONLY entry point to identity-scoped data. Opens one short explicit
 * transaction, binds the role and the claim transaction-locally, runs the
 * caller's queries, commits.
 *
 * Do not export the raw postgres() client from this module. See ADR/DATA-06.
 */
export async function withIdentity<T>(
  env: Env,
  identity: DbIdentity,
  run: (tx: postgres.TransactionSql) => Promise<T>,
): Promise<T> {
  const sql = client(env);
  return sql.begin(async (tx) => {
    // 1. Drop to the least-privileged role. `role` is a GUC, so set_config
    //    with is_local = true is SET LOCAL ROLE with a bound parameter.
    await tx`select set_config('role', ${PG_ROLE[identity.kind]}, true)`;

    // 2. Bind the identity the policies read. is_local = true ⇒ Postgres
    //    reverts it at COMMIT or ROLLBACK, unconditionally.
    if (identity.kind === "customer" || identity.kind === "staff") {
      await tx`select set_config('request.jwt.claims', ${claimsForSql(identity.claims)}, true)`;
    } else if (identity.kind === "guest") {
      await tx`select set_config('request.vamos.manage_token_hash', ${identity.manageTokenHashHex}, true)`;
    }

    return run(tx);
  });
}

/**
 * Hot read paths: postgres.js pipelines an array returned from the transaction
 * callback, collapsing the set-up statements and the read into one flush.
 * Use this shape wherever the query does not depend on a prior result.
 */
export async function readOneAsCustomer<T>(
  env: Env, claims: VamosClaims,
  query: (tx: postgres.TransactionSql) => postgres.PendingQuery<T[]>,
) {
  const sql = client(env);
  const results = await sql.begin((tx) => [
    tx`select set_config('role', 'authenticated', true)`,
    tx`select set_config('request.jwt.claims', ${claimsForSql(claims)}, true)`,
    query(tx),
  ]);
  return results[2] as unknown as T[];
}
```

```ts
// apps/web/lib/db/public.ts — the cached path, no identity, no transaction
import postgres from "postgres";

/** Public content only. Logs in as vamos_public, which has SELECT on exactly
 *  four tables and no role memberships. No transaction ⇒ Hyperdrive can cache. */
export function publicSql(env: Env) {
  return postgres(env.HYPERDRIVE.connectionString, {
    max: 5, fetch_types: false, prepare: true,
  });
}
```

Manage-token handling (DATA-03): the emailed link carries a 32-byte base64url token; the Worker computes `sha256` and passes only the hex digest to SQL, and the DB stores only the digest. A leaked backup therefore does not yield working manage links.

```ts
export async function manageTokenHashHex(token: string): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
```

**Client cleanup:** do not call `sql.end()`. Cloudflare is explicit: "You do **not** need to call `client.end()`, `sql.end()`… Workers-to-Hyperdrive connections are automatically cleaned up when the request or invocation ends" ([Connection lifecycle](https://developers.cloudflare.com/hyperdrive/concepts/connection-lifecycle/)). The `ctx.waitUntil(client.end())` advice in `.planning/research/STACK.md:138` is now **stale** and should be corrected in Phase 3.

---

## 5. DATA-06 — what must be true for the leak to be structurally impossible

Four independent properties. Any one of them failing still leaves the system safe; all four failing at once is the only leak path.

**P1 — Fail-closed by grants (the load-bearing one).** `vamos_edge` has `NOINHERIT`, is granted every application role `WITH INHERIT FALSE, SET TRUE`, and holds no direct privilege on any table. A query issued without the `SET LOCAL ROLE` step raises `42501` — "A missing grant raises a `42501` error before any policy runs" ([Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security)). A dropped wrapper is a 500, never a cross-tenant read. **Verify with:** `alter default privileges in schema public revoke all on tables from vamos_edge, vamos_public;` plus a CI query asserting `has_table_privilege('vamos_edge', t, 'SELECT') = false` for every table in `public`.

**P2 — Postgres, not Cloudflare, reverts the identity.** Every identity binding uses `set_config(…, true)` inside `BEGIN`/`COMMIT`. "The effects of `SET LOCAL` last only till the end of the current transaction, whether committed or not." And if the `BEGIN` is ever lost: "Issuing this outside of a transaction block emits a warning and otherwise has no effect" — so a dropped `BEGIN` *fails to set the identity* rather than leaking it, which then trips P1.

**P3 — Zero occurrences of session-scoped state.** No plain `SET`, no `set_config(x, y, false)`, no `sql.reserve()`, no `SELECT pg_advisory_lock` (session-scoped). CI gate:
```bash
! grep -rniE "set_config\([^)]*,\s*false\s*\)|\bsql\.unsafe\(|\breserve\(\)" apps/web/lib apps/web/app
! grep -rniE "^[^-]*\bSET\s+(?!LOCAL)(ROLE|SESSION|request\.)" apps/web
```
plus an ESLint `no-restricted-imports` rule forbidding `import postgres from "postgres"` anywhere except `apps/web/lib/db/*`, so `withIdentity`/`publicSql` are the only doors.

**P4 — The Hyperdrive cache can never key a row set to the wrong identity.** Identity-scoped queries run through the **cache-disabled** Hyperdrive binding *and* live inside an explicit transaction, and Hyperdrive's own `cacheStatus` metric enumerates `transaction` and `multiplestatements` as distinct non-cached outcomes alongside `disabled`, `hit`, `miss` ([Metrics](https://developers.cloudflare.com/hyperdrive/observability/metrics/)). Cloudflare's own guidance names this case: "Use a cache-disabled Hyperdrive configuration for reads that must be fresh… Good examples include authentication, sessions, permissions, billing state" ([Query caching](https://developers.cloudflare.com/hyperdrive/concepts/query-caching/)).

### Does prepared-statement caching or Hyperdrive's connection reuse change the answer?

**No — verified at the Postgres source level.** Hyperdrive deliberately does not pin a client to an origin connection; it keeps a per-client-connection HashMap of named `Parse` messages and re-prepends the `Parse` when a statement is missing on the connection it hands you ([Cloudflare blog](https://blog.cloudflare.com/postgres-named-prepared-statements-supported-hyperdrive/)). So the *same* prepared statement can execute on a connection previously used by another identity. That would be dangerous if a cached plan could carry another role's RLS rewrite. It cannot — `src/backend/utils/cache/plancache.c` records `rewriteRoleId` and `rewriteRowSecurity` at plan time and invalidates:

```c
/* If the query rewrite phase had a possible RLS dependency, we must redo
 * it if either the role or the row_security setting has changed. */
if (plansource->is_valid && plansource->dependsOnRLS &&
    (plansource->rewriteRoleId != GetUserId() ||
     plansource->rewriteRowSecurity != row_security))
    plansource->is_valid = false;
```
and, for generic plans, `if (plan->is_valid && plan->dependsOnRole && plan->planRoleId != GetUserId()) plan->is_valid = false;`. Keep `prepare: true` — Cloudflare's troubleshooting page also notes `prepare: false` makes queries *uncacheable*, which would silently cost you the public-content cache.

The remaining runtime-variable part of the policy — `app.uid()` reading `current_setting` — is a `STABLE` function evaluated at execution, not baked into the plan.

---

## 6. Does Hyperdrive support explicit transactions and session state at all?

Yes, with documented costs. Verbatim from [How Hyperdrive works](https://developers.cloudflare.com/hyperdrive/concepts/how-hyperdrive-works/) / [Connection pooling](https://developers.cloudflare.com/hyperdrive/concepts/connection-pooling/):

- "The Hyperdrive connection pooler operates in **transaction mode**, where the client that executes the query communicates through a single connection for the duration of a transaction."
- "`SET` statements within the transaction will take effect… When a connection is returned to the pool, the connection is `RESET` such that the `SET` commands will not take effect on subsequent queries."
- "a single Worker invocation may obtain **multiple connections**… and may need to `SET` any configurations for every query or transaction." ← this is precisely why per-request-scoped, not per-invocation-scoped, identity binding is mandatory.
- "It is not recommended to wrap multiple database operations with a single transaction to maintain the `SET` state. Doing so will affect the performance and scaling of Hyperdrive, as the connection cannot be reused by other Worker isolates for the duration of the transaction."

The last bullet is a real constraint on this design and shapes the rule: **one transaction per request handler, holding one logical unit of work — not one transaction spanning the whole checkout flow.** A booking status transition plus its `booking_events` row is one transaction; a Stripe webhook fan-out is not.

Other operative limits and postgres.js caveats:

| Item | Value / behaviour | Source |
|---|---|---|
| Max origin connections per config | ~20 Free / ~100 Paid; min 5; **soft** limit — set it below the DB's own ceiling | [Limits](https://developers.cloudflare.com/hyperdrive/platform/limits/), [Tune pool](https://developers.cloudflare.com/hyperdrive/configuration/tune-connection-pool/) |
| Max query duration | 60 s (terminated beyond) | Limits |
| Idle / initial connect timeout | 10 min / 15 s | Limits |
| Pool exhaustion symptom | `Failed to acquire a connection from the pool` — "long-running queries/transactions are a common offender" | [Troubleshooting](https://developers.cloudflare.com/hyperdrive/observability/troubleshooting/) |
| Client in module scope | Hard error: `Cannot perform I/O on behalf of a different request` | Troubleshooting |
| `postgres.js` `prepare: false` | Makes queries uncacheable — do not set it | Troubleshooting |
| `fetch_types: false` | Cloudflare's own example; avoids an extra catalog round trip | [Connect to Postgres](https://developers.cloudflare.com/hyperdrive/examples/connect-to-postgres/) |
| Supabase connection string | "use the **Direct connection** connection string rather than the pooled connection strings" | [Hyperdrive → Supabase](https://developers.cloudflare.com/hyperdrive/examples/connect-to-postgres/postgres-database-providers/supabase/) |

**Latency consequence you must plan for.** `withIdentity` is 5 sequential round trips (BEGIN, set role, set claims, query, COMMIT). Cloudflare: "If your Worker makes **multiple sequential queries** per request, use Placement to run your Worker close to your database. Each query adds round-trip latency: **20-30ms from a distant region, or 1-3ms when placed nearby.**" So this design is ~5–15 ms with placement near Frankfurt and ~100–150 ms without. **Smart/regional Placement is a hard requirement of this RLS design, not an optimisation** — which independently reinforces ADR-007's Frankfurt pinning, on performance grounds that do not wait for counsel:

```jsonc
{ "placement": { "region": "aws:eu-central-1" } }
```

Two Hyperdrive configs, both on the **direct** Supabase string:

```sh
# identity-scoped path — RLS, transactions, never cached
npx wrangler hyperdrive create vamos-rls-staging \
  --connection-string="postgres://vamos_edge:...@db.<ref>.supabase.co:5432/postgres" \
  --caching-disabled
npx wrangler hyperdrive update <ID> --origin-connection-limit=25

# public content path — no identity, no transaction, cacheable
npx wrangler hyperdrive create vamos-public-staging \
  --connection-string="postgres://vamos_public:...@db.<ref>.supabase.co:5432/postgres"
npx wrangler hyperdrive update <ID> --origin-connection-limit=15
```

Sum the origin limits across both configs against the Supabase instance's `max_connections` (a Micro instance has far less headroom than 100+25). Also keep the pricing-read path on `HYPERDRIVE_NOCACHE` per Pitfall 4 — the `pricing_live` flip must not wait out a 60 s cache.

Wrangler binding shape to add in Phase 3 (`apps/web/wrangler.jsonc` currently has one placeholder under `env.production` only; both envs need both bindings):

```jsonc
"hyperdrive": [
  { "binding": "HYPERDRIVE",          "id": "<cached config id>",       "localConnectionString": "postgres://postgres:postgres@localhost:54322/postgres" },
  { "binding": "HYPERDRIVE_NOCACHE",  "id": "<cache-disabled config id>", "localConnectionString": "postgres://postgres:postgres@localhost:54322/postgres" }
]
```

---

## 7. The Phase 3 DATA-06 proof (five assertions, all automatable)

1. **Concurrent two-customer isolation.** 200 interleaved requests against the deployed staging Worker, alternating customer A and B tokens, each asserting the returned booking set equals that customer's. Must be run against the deployed Worker over Hyperdrive, not `next dev` — the pool is the thing under test.
2. **Fail-closed proof (P1).** A test-only route that calls `postgres(env.HYPERDRIVE_NOCACHE.connectionString)` and runs `select count(*) from public.bookings` with **no** transaction and **no** `SET ROLE`. Assert it throws SQLSTATE `42501`. If it ever returns a number, P1 is broken and the whole design is void.
3. **Residue probe.** After step 1's traffic, fire 200 concurrent transactions whose first statement is `select coalesce(nullif(current_setting('request.jwt.claims', true), ''), 'EMPTY')`. Must be `EMPTY` every time.
4. **Cache-status assertion.** Query the Hyperdrive GraphQL `hyperdriveQueriesAdaptiveGroups` for the RLS config and assert `cacheStatus` ∈ {`disabled`,`transaction`} and never `hit` over the test window.
5. **pgTAP policy suite** (Supabase-native, `supabase/tests/*.sql`): one file per table, each case `set local role` + `set local request.jwt.claims`, asserting allow/deny with `throws_ok` for `42501` and zero-rows-changed for `using`-clause denials — matching Supabase's documented anatomy. Include a case proving `authenticated` gets `42501` on `public.chauffeurs` (DATA-04) and one proving a wrong manage token returns zero rows (DATA-03).

---

## 8. Flagged as UNCERTAIN

| # | Claim | Check that settles it |
|---|---|---|
| **U1** | Whether Hyperdrive's cache key incorporates session state for a **non-transaction** query. Docs never say. Design makes it moot, but the failure mode if we ever relax "identity ⇒ transaction" is cross-tenant. | On staging: same parameterised `SELECT` outside a transaction as user A then user B on the *cached* binding; assert B does not receive A's rows, and read `cacheStatus`. Run before any latency optimisation removes a transaction. |
| **U2** | Exact round-trip count of `sql.begin(tx => [...])` over Hyperdrive (array form is documented as pipelined; whether `BEGIN`/`COMMIT` join the same flush is not). | `log_statement=all` + `log_line_prefix='%m '` on local Supabase, count flushes; then compare `queryLatency` on the array form vs the sequential form in Hyperdrive metrics. |
| **U3** | Whether Supabase Auth **rejects** a custom access token hook that sets `role` outside `["anon","authenticated"]` (the JSON Schema enumerates only those). | Irrelevant if you follow the recommendation (never touch `role`). If someone proposes it, test on a staging project. |
| **U4** | `set_config('role', $1, true)` ≡ `SET LOCAL ROLE $1`. Near-certain (`role` is a GUC), but not stated in the PG parameter table. | `begin; select set_config('role','authenticated',true); select current_user; commit; select current_user;` — expect `authenticated` then `vamos_edge`. If it ever surprises, fall back to `tx.unsafe('set local role ' + PG_ROLE[kind])` — still injection-free because `PG_ROLE` is a closed map. |
| **U5** | Whether Hyperdrive's pool `RESET` is `RESET ALL` or `DISCARD ALL` (the prepared-statement blog implies statements survive, so not `DISCARD ALL`). | Not relied upon by this design — recorded so nobody later "optimises" by depending on it. |
| **U6** | Whether the managed-Supabase `postgres` role may run `grant authenticated to vamos_edge with inherit false, set true`. | Run it in the staging SQL editor as the first migration step. If refused, fall back to `create role vamos_customer nologin` mirroring `authenticated`'s grants and use `TO vamos_customer` in policies — no other change. |
| **U7** | Org-level "Require MFA" ([platform doc](https://supabase.com/docs/guides/platform/org-mfa-enforcement)) governs **Supabase dashboard members**, not your app's staff users. App-side AUTH-05 is `supabase.auth.mfa.*` enrolment + the `aal2` check in `app.is_staff()`. Confident, but do not let it be conflated in the phase plan. | Read the two docs side by side during Phase 2 planning. |

Also worth correcting in the phase plan: `.planning/research/STACK.md:138` recommends `ctx.waitUntil(client.end())`; Cloudflare's current connection-lifecycle doc says explicitly not to call `end()`.

---

## RECOMMENDATION

**Adopt Option A+B: transaction-scoped `set_config(…, is_local => true)` for both the Postgres role and the JWT claims, over a privilege-less Hyperdrive login role, on a cache-disabled Hyperdrive configuration — with a second, separately-credentialed Hyperdrive configuration for identity-free public content reads.**

Concretely, Phase 2 ships:

1. `vamos_edge` (LOGIN, NOINHERIT, zero table grants, `WITH INHERIT FALSE, SET TRUE` memberships in `anon`/`authenticated`/`vamos_guest`/`vamos_staff`) and `vamos_public` (LOGIN, SELECT on four content tables, no memberships).
2. `app.jwt()`, `app.uid()`, `app.manage_token_hash()`, `app.is_staff()` — our own helpers, so policies do not depend on `auth.*` internals and pgTAP can test them.
3. RLS enabled and **grants revoked from `anon`/`authenticated` on every ops table** — DATA-04 enforced at the grant layer (`42501`), with the role-claim policy as the second layer.
4. Manage tokens stored as `sha256` digests with a unique partial index; DATA-03 enforced by a `vamos_guest`-only policy.
5. Staff = `app_metadata.vamos_role` (custom access token hook, never the `role` claim) **and** `aal = 'aal2'` **and** an active `staff` row — AUTH-05 checked in SQL, not only in middleware.
6. `withIdentity()` as the single exported door to identity-scoped data, with `postgres` importable only from `apps/web/lib/db/*`, and the four CI gates from §5.

Phase 3 then proves DATA-06 with the five assertions in §7 — of which **assertion 2 (a wrapper-less query must return `42501`) is the one that converts "we test for leaks" into "a leak cannot occur"** — and pins the Worker near Frankfurt, which this design needs for latency independent of ADR-007's legal question.

Do not use plain `SET`. Do not use the multi-statement simple-query shortcut. Do not point Hyperdrive at Supavisor `:6543`. Do not grant `postgres` to the Hyperdrive user.

---

### Sources

- [How Hyperdrive works](https://developers.cloudflare.com/hyperdrive/concepts/how-hyperdrive-works/) · [Connection pooling](https://developers.cloudflare.com/hyperdrive/concepts/connection-pooling/) · [Connection lifecycle](https://developers.cloudflare.com/hyperdrive/concepts/connection-lifecycle/) · [Query caching](https://developers.cloudflare.com/hyperdrive/concepts/query-caching/) · [Limits](https://developers.cloudflare.com/hyperdrive/platform/limits/) · [Tune connection pool](https://developers.cloudflare.com/hyperdrive/configuration/tune-connection-pool/) · [Metrics](https://developers.cloudflare.com/hyperdrive/observability/metrics/) · [Troubleshoot and debug](https://developers.cloudflare.com/hyperdrive/observability/troubleshooting/) · [Connect to PostgreSQL](https://developers.cloudflare.com/hyperdrive/examples/connect-to-postgres/) · [Hyperdrive → Supabase](https://developers.cloudflare.com/hyperdrive/examples/connect-to-postgres/postgres-database-providers/supabase/) · [Named prepared statements in Hyperdrive](https://blog.cloudflare.com/postgres-named-prepared-statements-supported-hyperdrive/)
- [Supabase — JWT signing keys](https://supabase.com/docs/guides/auth/signing-keys) · [JWTs](https://supabase.com/docs/guides/auth/jwts) · [Custom Access Token Hook](https://supabase.com/docs/guides/auth/auth-hooks/custom-access-token-hook) · [Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security) · [Server-side client / getClaims](https://supabase.com/docs/guides/auth/server-side/creating-a-client) · [MFA](https://supabase.com/docs/guides/auth/auth-mfa) · [Org MFA enforcement](https://supabase.com/docs/guides/platform/org-mfa-enforcement)
- [PostgreSQL — SET](https://www.postgresql.org/docs/current/sql-set.html) · [SET ROLE](https://www.postgresql.org/docs/current/sql-set-role.html) · [`plancache.c`](https://github.com/postgres/postgres/blob/master/src/backend/utils/cache/plancache.c) · [postgres.js README](https://github.com/porsager/postgres)
- Repo, read-only: `/Users/koss/Developer/VamosTaxi.eu/apps/web/wrangler.jsonc`, `/Users/koss/Developer/VamosTaxi.eu/.planning/research/PITFALLS.md` (Pitfalls 2–4), `/Users/koss/Developer/VamosTaxi.eu/.planning/research/STACK.md` (§2, §4), `/Users/koss/Developer/VamosTaxi.eu/.planning/research/ARCHITECTURE.md`