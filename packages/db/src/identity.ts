// packages/db/src/identity.ts
//
// The ONLY door into identity-scoped data (D-07/D-08/D-09). A caller who forgets this wrapper
// gets SQLSTATE `42501` from `vamos_edge` — which holds no grant on any table — never a stale
// or foreign row (DATA-06 made structural, not merely tested; see
// packages/db/supabase/migrations/20260823000002_roles_and_helpers.sql's own header comment).
// `withIdentity` opens one explicit transaction, drops to the least-privileged Postgres role
// for the caller's identity kind, binds the claim GUCs the RLS policies read, runs the
// caller's queries, and commits. On throw, postgres.js's own `sql.begin()` issues ROLLBACK and
// rethrows the original error unmodified, so a call site can still branch on `err.code`
// (`42501`, `25P02`, `23505`, `23P01`).
//
// Five hard invariants:
//  1. `postgres` is importable from this file and `public.ts` only, nowhere else in this
//     package or in `apps/web` — enforced at compile time by plan 03-06's ESLint rule and by
//     CI grep, not by convention alone.
//  2. The connection this module opens is never explicitly closed here. A per-invocation
//     Workers-to-Hyperdrive connection is cleaned up at request end; closing it explicitly
//     inside the wrapper races that cleanup.
//  3. `fn` returns DATA, never `tx` — a transaction handle captured past COMMIT (e.g. returned
//     to a caller, or held in `waitUntil`) is a correctness bug, not a style issue, so this is
//     a compile-time constraint on `fn`'s return type below, not only a lint rule.
//  4. This module never reads an OpenNext `env`. It takes a connection string as its first
//     argument so the same function the probe Worker imports is the function `apps/web`'s
//     named wrappers call — a copy of this logic living in `apps/web` would make the DATA-06
//     proof worthless.
//  5. The Postgres client is constructed per invocation, never at module scope — a module-
//     scope client is shared across isolates and requests on Workers, and the failure is
//     silent on the first request.

import postgres from "postgres";
import { claimsForSql, type VamosClaims } from "./claims.js";

/**
 * The five identities `withIdentity` can drop into. The fifth, `"quote"`, is D-44a's
 * Phase 3<->4 seam: Phase 4's anonymous `/api/quote` needs a reserved, greppable identity from
 * its first line of code — it will appear in the WAE `blobs[0]`, in the CI fence's wrapper
 * list, and in every later `pg_stat_statements` line — and retrofitting it after Phase 4 has
 * shipped would mean renaming an identity that has already written rows.
 */
export type IdentityKind = "anon" | "customer" | "staff" | "guest" | "quote";

/**
 * D-44a. The anonymous quote path. Phase 2 plan 02-08's
 * `...21_rls_customer.sql` revokes everything from every role and re-grants only the four
 * content tables to `anon`/`vamos_public`, and plan 02-06's `...13_price_snapshots.sql` grants
 * INSERT on `price_snapshots` to nobody — so **no quote write path exists yet**. This constant
 * resolves to the anonymous role today, and Phase 4's first migration must add exactly one of:
 *   (a) `public.create_quote_snapshot(...)` declared `security definer set search_path = ''`,
 *       inserting the snapshot and its legs and reading the live `rate_versions` row, with
 *       `grant execute … to anon, authenticated` and no other new grant — D-44's preferred
 *       shape, called from inside `asQuote`; or
 *   (b) a `vamos_quote nologin` role holding INSERT on `price_snapshots`/`price_snapshot_legs`
 *       and SELECT on the pricing tables, granted to `vamos_edge` `with inherit false, set
 *       true` — which D-44 assigns to **Phase 2's** role set, never a Phase 3 migration
 *       (D-31).
 * If (b) lands, this ONE constant becomes `"vamos_quote"` and nothing else in this file moves.
 */
export const QUOTE_PG_ROLE = "anon" as const;

/**
 * The closed role map, values quoted character-for-character from the applied migration
 * `20260823000002_roles_and_helpers.sql` (lines 27-69) — never retyped from research prose.
 * `as const satisfies Record<IdentityKind, string>` makes a missing or extra key a compile
 * error, so this map can never silently drift from `IdentityKind`.
 */
export const PG_ROLE = {
  anon: "anon",
  // D-32/U1 (RESOLVED 2026-08-24): managed Supabase accepted
  // `grant authenticated to vamos_edge with inherit false, set true` unmodified — this value
  // is unchanged from research. Had Phase 2's managed-grant fallback fired instead, this would
  // become `vamos_customer` in Phase 2's OWN migration file; this map is the one place Phase 3
  // reads the name, so nothing else in this file may hardcode "authenticated".
  customer: "authenticated",
  staff: "vamos_staff",
  guest: "vamos_guest",
  quote: QUOTE_PG_ROLE,
} as const satisfies Record<IdentityKind, string>;

/** The claims shape `withIdentity` requires for each identity kind. */
export type ClaimsFor<K extends IdentityKind> = K extends "customer" | "staff"
  ? VamosClaims
  : K extends "guest"
    ? { manageTokenHashHex: string }
    : undefined;

/**
 * Five columns, selected with no interpolation. The third column (D-45) is the guest-token
 * GUC: without it, an adjacency run can pass while a guest credential survives across a pooled
 * backend, because the check never looked. Only meaningful as the **first** statement inside
 * the transaction `withIdentity` opens — `opts.probe` is what asks for it.
 */
export const ENTRY_PROBE = `select current_user as user_at_entry,
       coalesce(nullif(current_setting('request.jwt.claims', true), ''), 'EMPTY') as claims_at_entry,
       coalesce(nullif(current_setting('request.vamos.manage_token_hash', true), ''), 'EMPTY') as guest_at_entry,
       pg_backend_pid() as pid,
       clock_timestamp() as t0`;

// Per-invocation client, never module scope (invariant 5 above). A pool size of exactly one —
// this connection exists for exactly one request's identity-scoped work. `fetch_types: false`
// keeps startup light; the prepared-statement option below is load-bearing — Hyperdrive's own
// query cache depends on prepared statements, and disabling it would silently defeat that
// cache. No connection-idle option is set — the connection's lifetime is the request's, not a
// pool policy this module owns.
function client(connectionString: string): postgres.Sql {
  return postgres(connectionString, {
    max: 1,
    fetch_types: false,
    prepare: true,
    connect_timeout: 10,
  });
}

/**
 * The single door into identity-scoped data. Opens one explicit transaction, drops to the
 * least-privileged role for `kind`, binds the identity GUCs the RLS policies read, runs `fn`,
 * commits. `fn` must return data — the return type below resolves to `never` when it would
 * resolve to a transaction handle, so `return tx` inside `fn` is a compile error.
 *
 * `opts.client` is test-only: it lets the local isolation simulator hand this exact, shipped
 * function a `sql.reserve()`d connection pinned to one backend, so the DATA-06 proof drives
 * real production code, not a second copy of this SQL (D-16).
 *
 * `opts.probe` makes `ENTRY_PROBE` the first statement inside the transaction — the only place
 * residue from a previous request is observable. Production never sets it; the probe Worker
 * always does (D-15).
 */
export async function withIdentity<K extends IdentityKind, T>(
  connectionString: string,
  kind: K,
  claims: ClaimsFor<K>,
  fn: (
    tx: postgres.TransactionSql,
  ) => Promise<T extends postgres.TransactionSql | postgres.Sql ? never : T>,
  opts?: { probe?: boolean; client?: postgres.Sql },
): Promise<T> {
  const sql = opts?.client ?? client(connectionString);

  return sql.begin(async (tx) => {
    if (opts?.probe) {
      // The one allow-listed raw-SQL call in the identity path (plan 03-06's CI fence keys on
      // this comment) — ENTRY_PROBE interpolates nothing, it is a fixed module constant.
      await tx.unsafe(ENTRY_PROBE);
    }

    // 1. Drop to the least-privileged role. Bound parameter, extended protocol — never string
    //    concatenation. D-33 (U2): `set_config('role', $1, true)` is already proven equivalent
    //    to `SET LOCAL ROLE $1` on this Postgres by the committed
    //    `packages/db/supabase/tests/identity_helpers.test.sql` (lines 50-56), re-proved on
    //    every `supabase db reset` — this is not new work to re-check.
    //
    //    If that ever reopens, the fallback is a closed-map SWITCH over five literal
    //    "set local role <name>" statements, issued through a raw-SQL call one case at a time
    //    for each PG_ROLE value — never string concatenation, which would turn PG_ROLE's
    //    values into an injection surface. Described here, not implemented: this fallback
    //    stays unused unless D-33's re-check above ever comes back negative.
    await tx`select set_config('role', ${PG_ROLE[kind]}, true)`;

    // 2. Bind the identity the policies read. Postgres reverts both of the statements below at
    //    COMMIT or ROLLBACK unconditionally — Hyperdrive's pool RESET is measured (D-39), never
    //    relied on for this guarantee. Both calls pass `true` (is_local) as the third argument;
    //    a `false` here would leak the setting past this transaction onto the next request that
    //    borrows the same pooled backend.
    if (kind === "customer" || kind === "staff") {
      await tx`select set_config('request.jwt.claims', ${claimsForSql(claims as VamosClaims)}, true)`;
    } else if (kind === "guest") {
      await tx`select set_config('request.vamos.manage_token_hash', ${(claims as { manageTokenHashHex: string }).manageTokenHashHex}, true)`;
    }
    // kind === "anon" | "quote": no claim to bind — the quote path's authority is the grant or
    // the definer RPC (D-44a), never a claim.

    return fn(tx);
  }) as Promise<T>;
}
