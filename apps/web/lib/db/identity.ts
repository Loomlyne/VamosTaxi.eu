// apps/web/lib/db/identity.ts
//
// The ONLY door `apps/web` may knock on to reach identity-scoped data (D-08). Every other
// file under `apps/web/app` and `apps/web/lib` is fenced by plan 03-06's CI grep from
// importing `@vamos/db` directly — a route handler that reaches for the core door itself, or
// for `postgres`, skips this file's WAE instrumentation and the request-time env plumbing
// below, and is a build-time violation, not a style preference.
//
// Four hard invariants:
//  1. Every wrapper below runs on the cache-disabled Hyperdrive binding — never the cacheable
//     one `lib/db/public.ts` owns. An authenticated read answered from the wrong binding is
//     the exact leak T-03-02 names.
//  2. `fn` returns DATA, never a transaction handle — `@vamos/db/identity`'s own frozen
//     signature already makes `return tx` a compile error; this file adds nothing on top,
//     it only forwards the same constraint through seven narrower call shapes.
//  3. Errors are rethrown unmodified on both the success and the failure path — a call site
//     still branches on `err.code` (`42501`, `25P02`, `23505`, `23P01`) after this file's
//     latency instrumentation runs, never on a message string.
//  4. `env` arrives from `getCloudflareContext()` on fetch/RSC only (D-06) — this file itself
//     takes `env` as a plain parameter and never calls that function, so the same seven
//     wrappers work unmodified from a Route Handler, from `ctx.waitUntil(...)` in a Cron/Queue
//     handler that already has a real `env` argument, or from a future test harness.

import {
  withIdentity as withIdentityCore,
  type ClaimsFor,
  type IdentityKind,
} from "@vamos/db/identity";
import type { VamosClaims } from "@vamos/db/claims";
import type postgres from "postgres";

export type { IdentityKind, VamosClaims };

/**
 * The shape every wrapper's `fn` parameter carries — one place, reused by the module-private
 * door below and by all five exported wrappers, so it can never quietly drift between them.
 * The conditional return type is the same compile-time guard `@vamos/db/identity`'s own
 * `withIdentity` enforces (invariant 2 above): `T` resolves to `never` when a call site's
 * callback would resolve to a transaction handle, turning `return tx` into a real `tsc` error
 * at the one place TypeScript can actually infer `T` from a real callback literal.
 */
type QueryFn<T> = (
  tx: postgres.TransactionSql,
) => Promise<T extends postgres.TransactionSql | postgres.Sql ? never : T>;

/**
 * The WAE-instrumented door onto the cache-disabled binding — module-private (D-08): the seven
 * named wrappers below are the only exported shapes, so a call site can never pass an
 * arbitrary `kind` string that skips the closed set the RLS policies were written against.
 *
 * Times the call from before the core door opens to after it settles, on both branches, and
 * writes one Analytics Engine data point either way (D-23) — `blobs: [kind, "ok" | sqlstate]`,
 * `doubles: [ms]`, `indexes: [kind]`, queried later with `quantileExactWeighted(0.5)`. The
 * dataset binding is read with `?.` even though `CloudflareEnv` types it as required: a local
 * `wrangler dev` session may not have it bound, and instrumentation must never be the thing
 * that fails a query that would otherwise have succeeded.
 */
function writeLatency(env: CloudflareEnv, kind: IdentityKind, status: string, ms: number): void {
  try {
    env.DB_LATENCY?.writeDataPoint({
      blobs: [kind, status],
      doubles: [ms],
      indexes: [kind],
    });
  } catch {
    // Instrumentation must never fail the query (D-23). WAE quota/misconfig is a
    // measurement miss, not a product 500.
  }
}

async function withIdentity<K extends IdentityKind, T>(
  env: CloudflareEnv,
  kind: K,
  claims: ClaimsFor<K>,
  fn: QueryFn<T>,
): Promise<T> {
  const t0 = Date.now();
  try {
    const result = await withIdentityCore(env.HYPERDRIVE_NOCACHE.connectionString, kind, claims, fn);
    writeLatency(env, kind, "ok", Date.now() - t0);
    return result;
  } catch (err) {
    writeLatency(env, kind, (err as { code?: string })?.code ?? "unknown", Date.now() - t0);
    throw err;
  }
}

/** The anonymous public visitor — quote browsing, content reads that need row-level policy. */
export const asAnon = <T,>(env: CloudflareEnv, fn: QueryFn<T>) =>
  withIdentity(env, "anon", undefined, fn);

/**
 * Worker-only system work — SET ROLE `vamos_system`. Legitimate callers: the Stripe webhook
 * route, the `queue()` consumer, and the notification sweep in `scheduled()`. No claims:
 * authority is the grant.
 */
export const asSystem = <T,>(env: CloudflareEnv, fn: QueryFn<T>) =>
  withIdentity(env, "system", undefined, fn);

/**
 * POST `/api/checkout/intent` — SET ROLE `vamos_checkout`. Guest checkout passes `null`
 * claims; a signed-in checkout passes the verified JWT so `p_actor_customer_id` can be bound.
 * Stays on HYPERDRIVE_NOCACHE (invariant 1).
 */
export const asCheckout = <T,>(
  env: CloudflareEnv,
  claims: VamosClaims | null,
  fn: QueryFn<T>,
) => withIdentity(env, "checkout", claims, fn);

/** A signed-in customer — `claims` is the JWT payload `claimsForSql` narrows before binding. */
export const asCustomer = <T,>(
  env: CloudflareEnv,
  claims: VamosClaims,
  fn: QueryFn<T>,
) => withIdentity(env, "customer", claims, fn);

/** A signed-in staff member (dispatcher/admin) — same claims shape as a customer. */
export const asStaff = <T,>(
  env: CloudflareEnv,
  claims: VamosClaims,
  fn: QueryFn<T>,
) => withIdentity(env, "staff", claims, fn);

/** A guest holding a manage-booking link — the hashed token is the only credential. */
export const asGuest = <T,>(
  env: CloudflareEnv,
  manageTokenHashHex: string,
  fn: QueryFn<T>,
) => withIdentity(env, "guest", { manageTokenHashHex }, fn);

/**
 * The anonymous quote path — the fifth, reserved identity kind (D-44a), not the anonymous
 * visitor above. It resolves through the same role as `asAnon` today (`QUOTE_PG_ROLE` in
 * `packages/db/src/identity.ts` is the anonymous role), so the SQL behaviour is identical
 * while the identity stays distinct in the WAE `blobs[0]` and in every later
 * `pg_stat_statements` line — retrofitting a distinct identity after Phase 4 has shipped rows
 * under it would mean renaming something already written.
 *
 * Stays on this cache-disabled binding on purpose (D-12): pricing tables are never granted to
 * the public-content role, so the quote/ledger path never touches the cacheable binding
 * `lib/db/public.ts` owns. Phase 4's own research proposes loading the rate book through that
 * cacheable binding instead — that proposal is refused here; correcting Phase 4's own
 * document is Phase 4's planning job, not this file's.
 *
 * The preferred writer behind this door is a `SECURITY DEFINER` RPC called from inside
 * `asAnon`/`asCustomer` (Phase 7's checkout INSERT is the first real caller) — never a table
 * grant to the anonymous role directly. The fallback, a dedicated nologin role backing its own
 * identity kind, is a **Phase 2** role-set addition (D-44/U59), never a Phase 3 migration
 * (Phase 3 adds none — see the phase CONTEXT).
 *
 * What a Phase 4 executor needs and cannot infer from the schema alone: Phase 2 grants INSERT
 * on the price-snapshot tables to no role at all, and grants no pricing table to the anonymous
 * or public-content role — so this door opens onto a schema with no write permission behind it
 * yet. Phase 4's first migration must add either a `security definer` snapshot-writing
 * function granted to the anonymous and authenticated roles, or the dedicated nologin role
 * above; only the one constant `QUOTE_PG_ROLE` in `packages/db/src/identity.ts` moves if the
 * second path is chosen, nothing in this file.
 */
export const asQuote = <T,>(env: CloudflareEnv, fn: QueryFn<T>) =>
  withIdentity(env, "quote", undefined, fn);

// Compile-time only: asSystem's second argument is the query callback, never claims.
type _AsSystemTakesNoClaims = Parameters<typeof asSystem>[1] extends VamosClaims
  ? never
  : true;
const _asSystemTakesNoClaims: _AsSystemTakesNoClaims = true;
void _asSystemTakesNoClaims;
