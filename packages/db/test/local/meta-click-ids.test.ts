// packages/db/test/local/meta-click-ids.test.ts
//
// Phase 28 plan 01 (META-09). public.checkout_set_meta_click_ids through the SAME options the
// Worker's client uses (`fetch_types: false`), as role vamos_checkout exactly as
// `withIdentity(..., "checkout")` sets it. Text parameters and NULLs only, no arrays. Every case runs
// in its own transaction that is rolled back. Local only: the host is fixed to 127.0.0.1; the port comes
// from VAMOS_LOCAL_DB_PORT (this session's own stack, never another session's).
import { describe, expect, it } from "vitest";
import { withIdentity } from "../../src/identity.js";
import { workerSql } from "../support/worker-client.js";

const PORT = process.env["VAMOS_LOCAL_DB_PORT"] ?? "61322";
const SUPER = `postgres://postgres:postgres@127.0.0.1:${PORT}/postgres`;
const PENDING = "c2800000-0000-4000-8000-000000000a01";
const PAID = "c2800000-0000-4000-8000-000000000a02";
const FBP = "fb.1.1727771234567.1234567890";
const FBC = "fb.1.1727771234567.IwAR0abc_DEF-123";

class Rollback extends Error {}

type Tx = Parameters<Parameters<typeof withIdentity>[3]>[0];

/** One rolled-back transaction as the checkout role, fixtures inserted as the superuser first. */
async function inTx<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  const sql = workerSql(SUPER, "identity");
  let out: T | undefined;
  try {
    await withIdentity(
      SUPER,
      "checkout",
      null,
      async (tx) => {
        await tx`select set_config('role', 'postgres', true)`;
        await tx`
          insert into public.bookings (id, contact_name, contact_email, status) values
            (${PENDING}::uuid, 'Meta Pending', 'meta-pending@example.test', 'pending'),
            (${PAID}::uuid, 'Meta Paid', 'meta-paid@example.test', 'paid')`;
        await tx`select set_config('role', 'vamos_checkout', true)`;
        out = await fn(tx);
        throw new Rollback();
      },
      { client: sql },
    ).catch((err) => {
      if (!(err instanceof Rollback)) throw err;
    });
  } finally {
    await sql.end({ timeout: 5 });
  }
  return out as T;
}

async function readBack(tx: Tx, id: string) {
  await tx`select set_config('role', 'postgres', true)`;
  const rows = await tx<{ meta_fbp: string | null; meta_fbc: string | null }[]>`
    select meta_fbp, meta_fbc from public.bookings where id = ${id}::uuid`;
  await tx`select set_config('role', 'vamos_checkout', true)`;
  return rows[0]!;
}

describe("checkout_set_meta_click_ids through the Worker client options (fetch_types: false)", () => {
  it("refuses any host but 127.0.0.1", () => {
    expect(new URL(SUPER).hostname).toBe("127.0.0.1");
  });

  it("stores text on a pending booking and clears it with NULLs", async () => {
    const r = await inTx(async (tx) => {
      await tx`select public.checkout_set_meta_click_ids(${PENDING}::uuid, ${FBP}, ${FBC})`;
      const stored = await readBack(tx, PENDING);
      await tx`select public.checkout_set_meta_click_ids(${PENDING}::uuid, ${null}, ${null})`;
      const cleared = await readBack(tx, PENDING);
      return { stored, cleared };
    });
    expect(r.stored).toEqual({ meta_fbp: FBP, meta_fbc: FBC });
    expect(typeof r.stored.meta_fbp).toBe("string");
    expect(r.cleared).toEqual({ meta_fbp: null, meta_fbc: null });
  });

  // postgres.js begin() rethrows an error caught inside the callback (memory
  // postgres-begin-rethrows-caught-errors), so the refusals are asserted around inTx, not inside.
  it("rejects a paid booking with SQLSTATE 55000", async () => {
    await expect(
      inTx(async (tx) => {
        await tx`select public.checkout_set_meta_click_ids(${PAID}::uuid, ${FBP}, ${null})`;
      }),
    ).rejects.toMatchObject({ code: "55000" });
  });

  it("rejects a malformed value with SQLSTATE 23514", async () => {
    await expect(
      inTx(async (tx) => {
        await tx`select public.checkout_set_meta_click_ids(${PENDING}::uuid, ${"abc"}, ${null})`;
      }),
    ).rejects.toMatchObject({ code: "23514" });
  });
});
