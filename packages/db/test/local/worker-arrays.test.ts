// packages/db/test/local/worker-arrays.test.ts
//
// Quick 260929-pga. Every Postgres array the Worker reads or writes, driven through the SAME
// client the Worker builds (`publicSql` and `withIdentity`'s own `client()`, `fetch_types: false`),
// against a real local database. The older tests parsed arrays only because their own client kept
// postgres.js's default `fetch_types: true`; the Worker's client does not, so text[] arrived as the
// string "{cs_...}" and JS arrays went out as "a,b". This file is what would have caught it.
//
// Data scenarios run inside ONE transaction that is rolled back (nothing is committed).
// Local only: the host is fixed to 127.0.0.1; the port comes from VAMOS_LOCAL_DB_PORT (default 54322).
// The `withIdentity` cases log in as `vamos_edge` (password `vamos_edge`, set by `pnpm db:local-roles`).
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import postgres from "postgres";
import { publicSql } from "../../src/public.js";
import { withIdentity } from "../../src/identity.js";

const PORT = process.env["VAMOS_LOCAL_DB_PORT"] ?? "54322";
const SUPER = `postgres://postgres:postgres@127.0.0.1:${PORT}/postgres`;
const EDGE = `postgres://vamos_edge:vamos_edge@127.0.0.1:${PORT}/postgres`;
const here = dirname(fileURLToPath(import.meta.url));
const FIXTURE = readFileSync(join(here, "fixtures", "worker-arrays.sql"), "utf8");

class Rollback extends Error {}

/** Run `body` in one rolled-back transaction on the Worker's own public client. */
async function inRolledBackTx<T>(body: (tx: postgres.TransactionSql) => Promise<T>): Promise<T> {
  const sql = publicSql(SUPER);
  let out: T | undefined;
  try {
    await sql
      .begin(async (tx) => {
        out = await body(tx);
        throw new Rollback();
      })
      .catch((err) => {
        if (!(err instanceof Rollback)) throw err;
      });
  } finally {
    await sql.end({ timeout: 5 });
  }
  return out as T;
}

describe("Worker client array crossings (fetch_types: false)", () => {
  /** Fixture in the rolled-back transaction, then `body` under the definer role the Worker uses. */
  const asSystem = <T,>(body: (tx: postgres.TransactionSql, id: (t: string) => string) => Promise<T>) =>
    inRolledBackTx(async (tx) => {
      await tx.unsafe(FIXTURE);
      // Resolve ids first: the fixture tables are temp tables owned by the superuser.
      const ids: Record<string, string> = {};
      for (const t of ["pga_a", "pga_link", "pga_settle", "pga_note"]) {
        ids[t] = (await tx.unsafe(`select booking_id::text as id from ${t}`))[0]!["id"] as string;
      }
      await tx.unsafe("set local role vamos_system");
      return body(tx, (t) => ids[t]!);
    });

  it("purge_candidates.session_ids arrives as an array", async () => {
    const { aId, rows } = await asSystem(async (tx, id) => ({
      aId: id("pga_a"),
      rows: await tx<{ booking_id: string; session_ids: string[] | null }[]>`
        select booking_id, session_ids from public.purge_candidates('-1 minute'::interval)`,
    }));
    const a = rows.find((c) => c.booking_id === aId);
    expect(Array.isArray(a?.session_ids)).toBe(true);
    expect(a?.session_ids).toEqual(["cs_pga_a1", "cs_pga_a2"]);
  });

  it("checkout_booking_session_ids arrives as an array", async () => {
    const rows = await asSystem(async (tx, id) => {
      const aId = id("pga_a");
      return tx<{ ids: string[] | null }[]>`select public.checkout_booking_session_ids(${aId}::uuid) as ids`;
    });
    expect(rows[0]?.ids).toEqual(["cs_pga_a1", "cs_pga_a2"]);
  });

  it("notification_sweep takes a kinds array (one, two and unmatched kinds)", async () => {
    const r = await asSystem(async (tx, id) => {
      const kinds = async (k: string[]) =>
        (
          await tx<{ booking_id: string }[]>`
            select * from public.notification_sweep('-1 minute'::interval, ${tx.array(k, 1009)}::text[])`
        ).map((row) => row.booking_id);
      return {
        noteId: id("pga_note"),
        one: await kinds(["confirmation"]),
        two: await kinds(["no_such_kind", "confirmation"]),
        none: await kinds(["no_such_kind"]),
      };
    });
    expect(r.one).toContain(r.noteId);
    expect(r.two).toContain(r.noteId);
    expect(r.none).not.toContain(r.noteId);
  });

  it("checkout_payment_settle.other_open_session_ids arrives as an array", async () => {
    const rows = await asSystem((tx) =>
      tx<{ other_open_session_ids: string[] }[]>`
        select * from public.checkout_payment_settle(
          'evt_pga_settle', 'cs_pga_s1', 'pi_pga_s1', 'succeeded', 'CHF', null, null, null, null)`,
    );
    expect(rows[0]?.other_open_session_ids).toEqual(["cs_pga_s2"]);
  });

  it("checkout_expire_unpaid.stripe_checkout_session_ids arrives as an array", async () => {
    const { linkId, rows } = await asSystem(async (tx, id) => ({
      linkId: id("pga_link"),
      rows: await tx<{ booking_id: string; stripe_checkout_session_ids: string[] | null }[]>`
        select * from public.checkout_expire_unpaid()`,
    }));
    const link = rows.find((e) => e.booking_id === linkId);
    expect(link?.stripe_checkout_session_ids).toEqual(["cs_pga_l1"]);
  });

  it("round-trips text[], int2[], int4[], uuid[] with commas, quotes, backslashes, NULL and empty", async () => {
    const r = await inRolledBackTx(async (tx) => {
      const text = ["a,b", 'c"d', "e\\f", "NULL", ""];
      const back = await tx<{ v: string[] }[]>`select ${tx.array(text, 1009)}::text[] as v`;
      const withNull = await tx<{ v: (string | null)[] }[]>`
        select array['x', null, 'y {z}']::text[] as v`;
      const empty = await tx<{ v: string[] }[]>`select ${tx.array([], 1009)}::text[] as v`;
      const one = await tx<{ v: string[] }[]>`select ${tx.array(["cs_only"], 1009)}::text[] as v`;
      const i2 = await tx<{ v: number[] }[]>`select array[1,2,7]::int2[] as v`;
      const i4 = await tx<{ v: number[] }[]>`select ${tx.array([3, 4], 1007)}::int4[] as v`;
      const u = await tx<{ v: string[] }[]>`
        select ${tx.array(["7d8c9c3e-1f5a-4b0e-9a55-0c4a3a1f2b10"], 2951)}::uuid[] as v`;
      const nested = await tx<{ v: string[] }[]>`select '{}'::text[] as v`;
      return { back, withNull, empty, one, i2, i4, u, nested, text };
    });
    expect(r.back[0]?.v).toEqual(r.text);
    expect(r.withNull[0]?.v).toEqual(["x", null, "y {z}"]);
    expect(r.empty[0]?.v).toEqual([]);
    expect(r.one[0]?.v).toEqual(["cs_only"]);
    expect(r.i2[0]?.v).toEqual([1, 2, 7]);
    expect(r.i4[0]?.v).toEqual([3, 4]);
    expect(r.u[0]?.v).toEqual(["7d8c9c3e-1f5a-4b0e-9a55-0c4a3a1f2b10"]);
    expect(r.nested[0]?.v).toEqual([]);
  });

  it("withIdentity (the Worker's identity client, vamos_edge then SET ROLE vamos_system) parses and serializes text[]", async () => {
    const out = await withIdentity(EDGE, "system", undefined, async (tx) => {
      const ids = await tx<{ ids: string[] | null }[]>`
        select public.checkout_booking_session_ids(gen_random_uuid()) as ids`;
      const sweep = await tx<{ id: string }[]>`
        select * from public.notification_sweep('1 hour'::interval, ${tx.array(["confirmation", "reminder_24h"], 1009)}::text[])`;
      return { ids: ids[0]?.ids, sweepIsArray: Array.isArray(sweep) };
    });
    expect(out.ids).toEqual([]);
    expect(out.sweepIsArray).toBe(true);
  });

  it("both Worker clients take their array types from the one shared helper", () => {
    for (const f of ["identity.ts", "public.ts"]) {
      const src = readFileSync(join(here, "..", "..", "src", f), "utf8");
      expect(src, f).toContain("pgArrayTypes");
      expect(src, f).toMatch(/fetch_types:\s*false/);
    }
  });
});
