// packages/db/test/local/checkout-account.test.ts
//
// Phase 26.5 plan 01. The five account-choice functions, driven through the SAME client options
// the Worker uses (`publicSql`, `withIdentity`; `fetch_types: false`) as the roles the Worker uses
// (`vamos_checkout`, `vamos_system`, anon). Writes run inside ONE rolled-back transaction:
// account_agreement_records is append-only, so nothing may be committed here.
// Local only: 127.0.0.1, port from VAMOS_LOCAL_DB_PORT (default 54322; the 26.5 stack is 61322).
// Reuses the worker-arrays fixture (bookings `pga_a` unpaid, `pga_settle` made paid below).
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

describe("account choice functions through the Worker's client options", () => {
  it("checkout_email_has_account arrives as a JS boolean (vamos_checkout)", async () => {
    const out = await withIdentity(EDGE, "checkout", null, async (tx) => {
      const r = await tx<{ v: boolean }[]>`select public.checkout_email_has_account('nobody-265@example.test') as v`;
      return r[0]?.v;
    });
    expect(out).toBe(false);
  });

  it("checkout_account_settings arrives as a boolean for the anon public client", async () => {
    const sql = publicSql(EDGE);
    try {
      const r = await sql.begin(async (tx) => {
        await tx.unsafe("set local role anon");
        return tx<{ v: boolean }[]>`select public.checkout_account_settings() as v`;
      });
      expect(typeof r[0]?.v).toBe("boolean");
      expect(r[0]?.v).toBe(false);
    } finally {
      await sql.end({ timeout: 5 });
    }
  });

  it("checkout_account_user_state gives three booleans (vamos_system)", async () => {
    const row = await withIdentity(EDGE, "system", undefined, async (tx) => {
      const r = await tx<{ user_exists: boolean; confirmed: boolean; checkout_origin: boolean }[]>`
        select * from public.checkout_account_user_state('nobody-265@example.test')`;
      return r[0];
    });
    expect(row).toEqual({ user_exists: false, confirmed: false, checkout_origin: false });
  });

  it("record_account_agreement takes a null e-mail and an inet string; the request reader returns plain strings", async () => {
    const out = await inRolledBackTx(async (tx) => {
      await tx.unsafe(FIXTURE);
      const paid = (await tx.unsafe("select booking_id::text as id from pga_settle"))[0]!["id"] as string;
      await tx.unsafe(
        "set local session_replication_role = replica; " +
          `update public.booking_payments set status = 'succeeded', captured_at = now() where booking_id = '${paid}' and stripe_payment_intent_id = 'cs_pga_s1'; ` +
          "set local session_replication_role = origin",
      );
      await tx.unsafe("set local role vamos_checkout");
      const ins = await tx<{ id: string | number | bigint }[]>`
        select public.record_account_agreement(
          'checkout', ${paid}::uuid, null, 'create', '2026-09-29', 'de', 'vitest', '203.0.113.0'::inet) as id`;
      await tx.unsafe("reset role");
      await tx.unsafe("set local role vamos_system");
      const req = await tx<{ email: string; choice: string; full_name: string; locale: string }[]>`
        select * from public.checkout_account_request_for_booking(${paid}::uuid)`;
      return { id: ins[0]?.id, req: req[0] };
    });
    expect(Number(out.id)).toBeGreaterThan(0);
    expect(out.req).toEqual({
      email: "pga-settle@example.test",
      choice: "create",
      full_name: expect.any(String),
      locale: "de",
    });
    expect(typeof out.req?.email).toBe("string");
  });

  it("a passed e-mail on the checkout surface is refused through the Worker client (22023)", async () => {
    await expect(
      inRolledBackTx(async (tx) => {
        await tx.unsafe(FIXTURE);
        const a = (await tx.unsafe("select booking_id::text as id from pga_a"))[0]!["id"] as string;
        await tx.unsafe("set local role vamos_checkout");
        await tx`select public.record_account_agreement('checkout', ${a}::uuid, 'x@example.test', 'create', 'v1', 'en', null, null)`;
      }),
    ).rejects.toMatchObject({ code: "22023" });
  });
});
