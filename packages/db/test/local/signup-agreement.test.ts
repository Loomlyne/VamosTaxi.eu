// packages/db/test/local/signup-agreement.test.ts
//
// Phase 27 plan 17 (D-03a). The /sign-up agreement write as vamos_system, through the SAME client
// options the Worker uses (`publicSql`). account_agreement_records is
// append-only, so every write runs inside ONE rolled-back transaction: nothing is committed.
// Local only: 127.0.0.1, port from VAMOS_LOCAL_DB_PORT (the phase 27 stack is 59322).
import { describe, expect, it } from "vitest";
import postgres from "postgres";
import { publicSql } from "../../src/public.js";

const PORT = process.env["VAMOS_LOCAL_DB_PORT"] ?? "54322";
const SUPER = `postgres://postgres:postgres@127.0.0.1:${PORT}/postgres`;

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

const EMAIL = "  Signup.Test-27@Example.TEST ";

async function write(tx: postgres.TransactionSql) {
  return tx<{ id: string }[]>`
    select public.record_account_agreement(
      'sign-up', null, ${EMAIL}, 'create', '2026-09-29', 'de', 'ua-27-test', '203.0.113.0'::inet) as id`;
}

describe("sign-up agreement write through the Worker's client options", () => {
  it("vamos_system writes a consent row and never touches consent_log", async () => {
    const out = await inRolledBackTx(async (tx) => {
      const before = await tx<{ n: string }[]>`select count(*)::text as n from public.consent_log`;
      await tx.unsafe("set local role vamos_system");
      const r = await write(tx);
      await tx.unsafe("reset role");
      const row = await tx<
        { surface: string; choice: string; record_kind: string; email: string; locale: string; text_version: string; ip: string }[]
      >`select surface, choice, record_kind, email, locale, text_version, host(ip_truncated) as ip
          from public.account_agreement_records where id = ${r[0]!.id}`;
      const after = await tx<{ n: string }[]>`select count(*)::text as n from public.consent_log`;
      return { id: r[0]?.id, row: row[0], before: before[0]?.n, after: after[0]?.n };
    });
    expect(Number(out.id)).toBeGreaterThan(0);
    expect(out.row).toEqual({
      surface: "sign-up",
      choice: "create",
      record_kind: "consent",
      email: "signup.test-27@example.test",
      locale: "de",
      text_version: "2026-09-29",
      ip: "203.0.113.0",
    });
    expect(out.after).toBe(out.before);
  });

  for (const role of ["anon", "authenticated"]) {
    it(`${role} is refused with 42501`, async () => {
      await expect(
        inRolledBackTx(async (tx) => {
          await tx.unsafe(`set local role ${role}`);
          return write(tx);
        }),
      ).rejects.toMatchObject({ code: "42501" });
    });
  }
});
