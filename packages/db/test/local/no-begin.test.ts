// packages/db/test/local/no-begin.test.ts
//
// Failure mode #4 (ISOL-10): a `BEGIN` that never happens because `sql` was used instead of
// `tx`. pgTAP structurally cannot prove this -- it runs every test file inside one open
// transaction of its own, so a savepoint body is failure mode 3 (throw -> rollback), never
// failure mode 4 (no BEGIN at all, autocommit). This file has no `sql.begin` anywhere in it:
// each statement below is its own autocommit round trip on the same `max: 1` connection --
// exactly the shape a lost BEGIN produces. Postgres discards a `SET LOCAL` issued outside a
// transaction with a warning, so `vamos_edge` never actually becomes `authenticated`, and its
// zero grants (D-02) answer with `42501`.
import { afterAll, describe, expect, it } from "vitest";
import { testDbUrl, workerSql } from "../support/worker-client.js";

const CS = testDbUrl("edge");

describe("no-begin (ISOL-10, failure mode #4, autocommit)", () => {
  const sql = workerSql(CS);

  afterAll(async () => {
    await sql.end();
  });

  it("a lost BEGIN never binds the identity -- vamos_edge's zero grants raise 42501, no row count ever comes back", async () => {
    // One statement at a time, in autocommit -- no transaction wraps these two calls.
    await sql.unsafe(`select set_config('role', 'authenticated', true)`);

    let caught: unknown;
    try {
      await sql.unsafe(`select count(*) from public.bookings`);
    } catch (err) {
      caught = err;
    }

    expect(
      caught,
      "no error was thrown and a row count came back -- the entire design is void",
    ).toBeDefined();
    expect((caught as { code?: string }).code).toBe("42501");
  });
});
