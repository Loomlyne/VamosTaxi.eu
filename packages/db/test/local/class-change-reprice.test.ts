// packages/db/test/local/class-change-reprice.test.ts
//
// 26.2 P1. The class-change functions of migration 20261007140000 driven through the SAME client
// options the Worker uses (`publicSql`: `fetch_types: false`, the registered array types,
// prepared statements) under the role the Worker uses (`vamos_system`). Everything runs inside
// ONE rolled-back transaction per case. Local only: 127.0.0.1, port from VAMOS_LOCAL_DB_PORT.
//
// Finding pinned here (2026-10-01, before the fix): the payload writer
// `${JSON.stringify(payload)}::jsonb` sends a JSON STRING through this client (the parameter is
// described as jsonb and serialised a second time), and booking_edit_requests' check
// `jsonb_typeof(payload) = 'object'` refuses the insert with 23514. Every customer time-change
// request failed that way. The writer now uses `tx.json(payload)`; the upsert and the apply step
// also read a string payload as the object it holds.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import postgres from "postgres";
import { publicSql } from "../../src/public.js";

const PORT = process.env["VAMOS_LOCAL_DB_PORT"] ?? "54322";
const SUPER = `postgres://postgres:postgres@127.0.0.1:${PORT}/postgres`;
const here = dirname(fileURLToPath(import.meta.url));
const FIXTURE = readFileSync(join(here, "fixtures", "class-change.sql"), "utf8");
const ADMIN = "26020002-0000-4000-a000-000000000002";

class Rollback extends Error {}

type Fx = {
  booking_id: string;
  snapshot_id: string;
  reference: string;
  rate_version_id: string;
  chauffeur_id: string;
};

async function inRolledBackTx<T>(body: (tx: postgres.TransactionSql, fx: Fx) => Promise<T>): Promise<T> {
  const sql = publicSql(SUPER);
  let out: T | undefined;
  try {
    await sql
      .begin(async (tx) => {
        await tx.unsafe(FIXTURE);
        const rows = await tx.unsafe("select * from p1c");
        const fx = rows[0] as unknown as Fx;
        await tx.unsafe("set local role vamos_system");
        out = await body(tx, fx);
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

const lines = (total: number) => [
  { seq: 1, leg_seq: 1, code: "distance_fare", kind: "fare", i18n_key: "price.line.transfer", params: { vehicleClass: "p1c-biz" }, amount_rappen: total - 1 },
  { seq: 2, leg_seq: 1, code: "vat", kind: "vat", i18n_key: "price.line.vat", params: { vatRateBps: 81 }, amount_rappen: 1 },
];

describe("P1 class change through the Worker's client options (fetch_types: false)", () => {
  it("the old writer form (JSON.stringify(...)::jsonb) is read as an object, the fixed writer (tx.json) too", async () => {
    const out = await inRolledBackTx(async (tx, fx) => {
      const legacy = await tx<{ request_id: string }[]>`
        select * from public.booking_edit_request_upsert(
          ${fx.booking_id}::uuid, 'staff', ${ADMIN}::uuid,
          ${JSON.stringify({ note: "legacy writer" })}::jsonb, ${fx.snapshot_id}::bigint)`;
      const fixed = await tx<{ request_id: string }[]>`
        select * from public.booking_edit_request_upsert(
          ${fx.booking_id}::uuid, 'staff', ${ADMIN}::uuid,
          ${tx.json({ note: "fixed writer" })}, ${fx.snapshot_id}::bigint)`;
      await tx.unsafe("reset role");
      const read = await tx<{ t: string; note: string }[]>`
        select jsonb_typeof(payload) as t, payload ->> 'note' as note
          from public.booking_edit_requests
         where id in (${legacy[0]!.request_id}::uuid, ${fixed[0]!.request_id}::uuid)
         order by created_at, (payload ->> 'note')`;
      return read;
    });
    expect(out.map((r) => `${r.t}:${r.note}`).sort()).toEqual(["object:fixed writer", "object:legacy writer"]);
  });

  it("a dearer class: typed row back, trip unchanged; paid: class changes, driver named for the mail", async () => {
    const out = await inRolledBackTx(async (tx, fx) => {
      const change = await tx<
        {
          request_id: string;
          outcome: string;
          difference_rappen: number;
          new_total_rappen: number;
          paid_rappen: number;
          quote_snapshot_id: string;
          extra_snapshot_id: string;
          unassigned_chauffeur_id: string | null;
        }[]
      >`
        select * from public.booking_staff_change(
          ${fx.booking_id}::uuid, ${ADMIN}::uuid, 'p1c-biz', ${fx.rate_version_id}::bigint,
          13, ${tx.json(lines(13))}, 'quote-engine@p1c-test', 10)`;
      const row = change[0]!;
      await tx`select public.booking_edit_request_set_extra_session(${row.request_id}::uuid, 'cs_p1c_dear')`;
      const settled = await tx<
        { applied: boolean; class_changed: boolean; unassigned_chauffeur_id: string | null; already_settled: boolean }[]
      >`
        select * from public.checkout_extra_payment_settle(
          'evt_p1c', 'cs_p1c_dear', 'pi_p1c_dear', 'succeeded', 'CHF', null, null, null::timestamptz, null)`;
      const facts = await tx<{ email: string; languages_csv: string; reference: string; scheduled_local: string }[]>`
        select * from public.booking_change_mail_facts(${fx.booking_id}::uuid, ${fx.chauffeur_id}::uuid)`;
      return { row, settled: settled[0]!, facts: facts[0]!, fx };
    });
    expect(out.row.outcome).toBe("extra_required");
    expect(out.row.difference_rappen).toBe(3);
    expect(typeof out.row.difference_rappen).toBe("number");
    expect(out.row.paid_rappen).toBe(10);
    expect(out.row.new_total_rappen).toBe(13);
    // int8 crosses this client as a string: the Worker maps it with Number().
    expect(Number(out.row.extra_snapshot_id)).toBeGreaterThan(0);
    expect(out.row.unassigned_chauffeur_id).toBeNull();
    expect(out.settled).toMatchObject({ applied: true, class_changed: true, already_settled: false });
    expect(out.settled.unassigned_chauffeur_id).toBe(out.fx.chauffeur_id);
    expect(out.facts.email).toBe("p1c-driver@vamostaxi.eu");
    expect(out.facts.languages_csv).toBe("fr,en");
    expect(out.facts.reference).toBe(out.fx.reference);
    expect(typeof out.facts.scheduled_local).toBe("string");
  });

  it("a refusal crosses the client as its message (mapped around the wrapper by the Worker)", async () => {
    await expect(
      inRolledBackTx(async (tx, fx) => {
        await tx`
          select * from public.booking_staff_change(
            ${fx.booking_id}::uuid, ${ADMIN}::uuid, 'p1c-eco', ${fx.rate_version_id}::bigint,
            10, ${tx.json(lines(10))}, 'quote-engine@p1c-test', 10)`;
      }),
    ).rejects.toMatchObject({ message: "same-class", code: "P0001" });
  });
});
