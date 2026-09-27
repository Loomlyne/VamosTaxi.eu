// packages/db/test/local/connection-reuse.test.ts
//
// The DATA-06 local half (D-16/D-04/D-45): a `sql.reserve()`d connection pins exactly one
// physical backend, then replays customer A, customer B and a bare entry probe **through the
// shipped `withIdentity`** (`opts.client`) -- because the connection is pinned, a residue bug
// fails 100% of the time here, where Hyperdrive's pool would only fail when it happened to
// reuse the same backend. `sql.reserve()` is banned everywhere in `apps/**`; this file and
// `mutation-gate.mjs` are the allow-listed exceptions plan 03-06's CI fence keys on.
//
// Every assertion in this file drives `packages/db/src/identity.ts`'s shipped `withIdentity`.
// There is no second, inlined copy of the identity SQL anywhere below (D-16).
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import postgres from "postgres";
import { withIdentity, type EntryProbeRow } from "../../src/identity.js";
import { claimsForSql } from "../../src/claims.js";
import { assertNoLiveRateVersion, seedTwoCustomers, type LocalIdentity } from "./local-fixtures.js";

// The local `vamos_edge` login (D-04) -- fixed local development credentials set by
// `pnpm db:local-roles`, matching `packages/db/scripts/local-role-passwords.mjs` and the
// `localConnectionString` plan 03-03 writes into `apps/web/wrangler.jsonc`. This is the ONLY
// connection string this file ever opens; the superuser string lives in `local-fixtures.ts`
// alone (D-04 -- BYPASSRLS makes `42501` untestable on a superuser connection).
const CS = "postgres://vamos_edge:vamos_edge@127.0.0.1:54322/postgres";

/**
 * DEVIATION (Rule 3, blocking-issue auto-fix): `postgres@3.4.9`'s reserved connection object
 * carries no `.begin()` at runtime -- confirmed empirically
 * (`Object.getOwnPropertyNames(await sql.reserve())` omits `begin`; the type declaration
 * `ReservedSql extends Sql` promises it, `reserve()`'s own implementation never attaches it).
 * `withIdentity` calls `sql.begin(fn)` on whatever `opts.client` names, so this polyfills
 * exactly that one method directly on the reserved connection: raw `BEGIN`/`COMMIT`/`ROLLBACK`
 * on the SAME pinned connection `conn` already wraps, then invokes `fn(conn)` -- `conn` itself
 * already supports tagged-template queries and `.unsafe()`, everything a `TransactionSql`
 * callback needs. This changes nothing about `withIdentity` itself; it only makes the object
 * this file hands it, via `opts.client`, satisfy the runtime contract the shipped function
 * already assumes.
 */
function withBeginPolyfill(reserved: postgres.ReservedSql): postgres.Sql {
  const begin = async (fn: (tx: postgres.TransactionSql) => Promise<unknown>) => {
    await reserved.unsafe("begin");
    try {
      const result = await fn(reserved as unknown as postgres.TransactionSql);
      await reserved.unsafe("commit");
      return result;
    } catch (err) {
      await reserved.unsafe("rollback").catch(() => undefined);
      throw err;
    }
  };
  // Reserved's own overloaded `Sql.begin` type expects a `TransactionSql` param (`savepoint`,
  // `prepare`) that a bare reserved connection never carries -- neither `withIdentity`'s test
  // callers nor `withIdentity` itself use either method, so the escape hatch below is confined
  // to this one polyfill assignment, not to any assertion in the tests that follow.
  (reserved as unknown as { begin: typeof begin }).begin = begin;
  return reserved as unknown as postgres.Sql;
}

let identities: { a: LocalIdentity; b: LocalIdentity };
let sql: postgres.Sql;
let reserved: postgres.ReservedSql;
let conn: postgres.Sql;

beforeAll(async () => {
  identities = await seedTwoCustomers();
  expect(await assertNoLiveRateVersion(), "D-21: no rate_versions row may be live for this suite").toBe(true);

  sql = postgres(CS, { max: 1, fetch_types: false, prepare: true, connect_timeout: 10 });
  // DEVIATION (Rule 3, blocking-issue auto-fix): `postgres@3.4.9`'s `sql.reserve()` hangs
  // indefinitely when called against a completely cold pool (confirmed empirically -- `open`
  // has nothing to shift and the `closed`-slot connect path never resolves the reserve
  // promise on a pool that has never opened a connection). A single warm-up query establishes
  // the pool's one physical connection first; `reserve()` then pins it deterministically.
  await sql`select 1`;
  // Pin exactly one physical backend. Everything below runs on this same connection --
  // reserving it is what makes the residue proof deterministic instead of probabilistic.
  reserved = await sql.reserve();
  conn = withBeginPolyfill(reserved);
}, 30_000);

afterAll(async () => {
  // Optional chaining: if beforeAll threw before these were assigned, the real error is the
  // one vitest should report -- not a secondary TypeError from this teardown.
  reserved?.release();
  // The one place `sql.end()` is permitted (the Node process's own test-file teardown).
  await sql?.end();
});

describe("connection-reuse (DATA-06 local half, pinned backend)", () => {
  it("test 1 — entry is clean, every time: vamos_edge, EMPTY claims, EMPTY guest GUC, one physical pid across A, B and a bare probe", async () => {
    const probes: EntryProbeRow[] = [];

    await withIdentity(CS, "customer", identities.a.claims, async () => "ok", {
      client: conn,
      probe: true,
      onProbe: (row) => probes.push(row),
    });
    await withIdentity(CS, "customer", identities.b.claims, async () => "ok", {
      client: conn,
      probe: true,
      onProbe: (row) => probes.push(row),
    });
    await withIdentity(CS, "anon", undefined, async () => "ok", {
      client: conn,
      probe: true,
      onProbe: (row) => probes.push(row),
    });

    expect(probes).toHaveLength(3);
    for (const probe of probes) {
      expect(probe.user_at_entry).toBe("vamos_edge");
      expect(probe.claims_at_entry).toBe("EMPTY");
      expect(probe.guest_at_entry).toBe("EMPTY");
    }

    // The coverage instrument: two probes reporting the same pid demonstrably ran on the same
    // physical connection. Without this, the whole test is theatre.
    const distinctPids = new Set(probes.map((p) => p.pid));
    expect(distinctPids.size, "connection was not reused").toBe(1);
  });

  it("test 2 — the identity actually bound (A2 tripwire): current_user and app.uid() reflect the caller's own claim, not a no-op set_config", async () => {
    await withIdentity(
      CS,
      "customer",
      identities.a.claims,
      async (tx) => {
        const [row] = await tx<[{ current_user: string; uid: string }]>`select current_user, app.uid() as uid`;
        expect(row.current_user).toBe("authenticated");
        expect(row.uid).toBe(identities.a.uid);
        return "ok";
      },
      { client: conn },
    );

    await withIdentity(
      CS,
      "customer",
      identities.b.claims,
      async (tx) => {
        const [row] = await tx<[{ current_user: string; uid: string }]>`select current_user, app.uid() as uid`;
        expect(row.current_user).toBe("authenticated");
        expect(row.uid).toBe(identities.b.uid);
        return "ok";
      },
      { client: conn },
    );
  });

  it("test 3 — rows are the caller's own: A sees A's references and never B's, on the same pinned backend", async () => {
    await withIdentity(
      CS,
      "customer",
      identities.a.claims,
      async (tx) => {
        const rows = await tx<{ reference: string }[]>`select reference from public.bookings`;
        const seen = rows.map((r) => r.reference);
        expect(seen).toEqual(expect.arrayContaining(identities.a.references));
        expect(seen).not.toEqual(expect.arrayContaining(identities.b.references));
        return "ok";
      },
      { client: conn },
    );
  });

  it("test 4 — a guest transaction leaves no guest GUC behind on the next entry", async () => {
    const manageTokenHashHex = "deadbeef".repeat(8); // 64 hex chars, matches the sha256 shape

    await withIdentity(CS, "guest", { manageTokenHashHex }, async () => "ok", { client: conn });

    const followUp: EntryProbeRow[] = [];
    await withIdentity(CS, "anon", undefined, async () => "ok", {
      client: conn,
      probe: true,
      onProbe: (row) => followUp.push(row),
    });

    expect(followUp).toHaveLength(1);
    expect(followUp[0]!.guest_at_entry, "D-45: a guest GUC survived onto the next entry probe").toBe("EMPTY");
    expect(followUp[0]!.user_at_entry).toBe("vamos_edge");
  });

  it("test 5 — the local negative control (D-39/D-17): a session-scoped SET *inside* BEGIN/COMMIT leaves residue on this pinned backend, on purpose", async () => {
    // The session-scoped variant NC1 mirrors -- `is_local => false` inside a transaction, D-01's
    // actual footgun. Deliberately bypasses withIdentity: this is the mutation the control is
    // built to catch, not a call through the shipped door.
    await conn.begin(async (tx) => {
      await tx`select set_config('role', 'authenticated', false)`;
      await tx`select set_config('request.jwt.claims', ${claimsForSql(identities.a.claims)}, false)`;
    });

    const controlProbes: EntryProbeRow[] = [];
    await withIdentity(CS, "anon", undefined, async () => "ok", {
      client: conn,
      probe: true,
      onProbe: (row) => controlProbes.push(row),
    });

    const residueSeen =
      controlProbes[0]!.claims_at_entry !== "EMPTY" || controlProbes[0]!.user_at_entry !== "vamos_edge";
    // A control that can pass while the bug is present is worthless -- this MUST fail if no
    // residue is observed, not merely note it (shipped assertion, not a diagnostic toBe(false)).
    expect(residueSeen, "the session-scoped SET (is_local=false) inside BEGIN/COMMIT left no residue -- the one failure mode local can catch deterministically did not fire").toBe(true);

    // Leave the pinned backend clean for anything that runs after this file.
    await conn.unsafe("reset all");
  });
});
