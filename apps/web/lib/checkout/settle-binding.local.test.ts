// apps/web/lib/checkout/settle-binding.local.test.ts
//
// J3 (W4-07, W5-02) on a real local database, through the REAL asSystem (login `vamos_edge`, then the
// vamos_system role, the client options the Worker uses): the settle functions take the four new amount
// arguments as the Worker binds them (numbers, text, nulls). A call that names an unknown session reaches
// the function body and raises P0002 payment_not_found: proof that the 14-argument and 13-argument forms
// resolve (no ambiguous overload with the old argument lists) and that the driver binds every value.
// Skipped unless VAMOS_LOCAL_DB_PORT names a DISPOSABLE local stack.
import { describe, expect, it } from "vitest";
import { asSystem } from "../db/identity";

const PORT = process.env["VAMOS_LOCAL_DB_PORT"];

describe.skipIf(!PORT)("settle functions with the amount arguments through the real asSystem (local)", () => {
  const env = {
    HYPERDRIVE_NOCACHE: { connectionString: `postgres://vamos_edge:vamos_edge@127.0.0.1:${PORT}/postgres` },
  } as unknown as CloudflareEnv;

  it("checkout_payment_settle: 14 arguments resolve and reach the body (P0002 for an unknown session)", async () => {
    const err = await asSystem(env, async (sql) => {
      await sql`
        select * from public.checkout_payment_settle(
          ${"evt_bind_main"}, ${"cs_test_bind_none"}, ${"pi_bind_none"}, ${"succeeded"},
          ${"CHF"}, ${null}, ${null}, ${null}::timestamptz, ${null}, ${null},
          ${8000}, ${"CHF"}, ${8000}, ${"11111111-1111-4111-8111-111111111111"}
        )`;
    }).catch((x: unknown) => x);
    expect((err as { code?: string }).code).toBe("P0002");
  });

  it("checkout_extra_payment_settle: 13 arguments resolve and reach the body (P0002 for an unknown page)", async () => {
    const err = await asSystem(env, async (sql) => {
      await sql`
        select * from public.checkout_extra_payment_settle(
          ${"evt_bind_extra"}, ${"cs_test_bind_none"}, ${"pi_bind_none"}, ${"succeeded"},
          ${"CHF"}, ${null}, ${null}, ${null}::timestamptz, ${null},
          ${300}, ${"CHF"}, ${300}, ${"11111111-1111-4111-8111-111111111111"}
        )`;
    }).catch((x: unknown) => x);
    expect((err as { code?: string }).code).toBe("P0002");
  });

  it("the old argument lists are gone: the previous 10-argument form still resolves through the defaults", async () => {
    const err = await asSystem(env, async (sql) => {
      await sql`
        select * from public.checkout_payment_settle(
          ${"evt_bind_old"}, ${"cs_test_bind_none"}, ${"pi_bind_none"}, ${"succeeded"},
          ${"CHF"}, ${null}, ${null}, ${null}::timestamptz, ${null}, ${null}
        )`;
    }).catch((x: unknown) => x);
    expect((err as { code?: string }).code).toBe("P0002");
  });
});
