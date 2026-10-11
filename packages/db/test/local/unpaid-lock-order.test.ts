// packages/db/test/local/unpaid-lock-order.test.ts
//
// J9 W5-18 (migration 20261012170000): checkout_abandon_unpaid, checkout_requote_cancel and
// purge_unpaid_booking lock the booking's payment rows BEFORE the booking, the order of
// checkout_payment_settle. Before, they took the booking first and then wrote the payment rows, so a settle
// that held the payment and waited for the booking deadlocked with them (40P01). Two real connections with
// the Worker's client options: the settle side holds the payment row by hand and then takes the booking; the
// function under test runs as vamos_checkout through withIdentity, as the Worker runs it. It must wait at
// the payment while holding nothing on the booking, so the settle side gets the booking at once and both
// finish. Committed fixtures (two transactions cannot see a rolled-back one), removed in `finally`.
// Synthetic integer rappen only. Local only: host 127.0.0.1, port VAMOS_LOCAL_DB_PORT.
import { describe, expect, it } from "vitest";
import { withIdentity } from "../../src/identity.js";
import { workerSql } from "../support/worker-client.js";

const PORT = process.env["VAMOS_LOCAL_DB_PORT"] ?? "62322";
const SUPER = `postgres://postgres:postgres@127.0.0.1:${PORT}/postgres`;
const T = { timeout: 30_000 };

type Sql = ReturnType<typeof workerSql>;
type Tx = Parameters<Parameters<typeof withIdentity>[3]>[0];
type Failure = { error: string; message: string };

const ID = {
  abandon: "c2928500-0000-4000-8000-0000000000a1",
  requote: "c2928500-0000-4000-8000-0000000000a2",
  purge: "c2928500-0000-4000-8000-0000000000a3",
};
const QUOTE = {
  abandon: "d2928500-0000-4000-8000-0000000000a1",
  requote: "d2928500-0000-4000-8000-0000000000a2",
  purge: "d2928500-0000-4000-8000-0000000000a3",
};

let snapshotSeq = 2928500;

/** A pending unpaid booking with one leg and one requires_payment row. Returns the payment id. */
async function seed(admin: Sql, id: string, quote: string): Promise<number> {
  const rows = await admin.begin(async (tx) => {
    await tx`set local session_replication_role = replica`;
    await tx`
      insert into public.bookings (id, quote_id, contact_name, contact_email, status, is_test)
      values (${id}::uuid, ${quote}::uuid, 'Unpaid Lock Order', 'unpaid-lock-order@example.test', 'pending', false)`;
    await tx`
      insert into public.booking_legs (booking_id, leg_seq, direction, pickup_text, dropoff_text, scheduled_at, original_scheduled_at, scheduled_local, vehicle_class_id, status)
      values (${id}::uuid, 1, 'outbound', 'ZRH Airport', 'Zurich HB', now() + interval '3 days', now() + interval '3 days', to_char(now() + interval '3 days', 'YYYY-MM-DD"T"HH24:MI'),
              (select id from public.vehicle_classes order by id limit 1), 'pending')`;
    return tx<{ id: string }[]>`
      insert into public.booking_payments (booking_id, snapshot_id, stripe_payment_intent_id, stripe_checkout_session_id, charged_rappen, status)
      values (${id}::uuid, ${snapshotSeq++}::int8, ${"cs_unpaid_lo_" + id.slice(-2)}, ${"cs_unpaid_lo_" + id.slice(-2)}, 10, 'requires_payment')
      returning id::text as id`;
  });
  return Number(rows[0]!.id);
}

async function cleanup(admin: Sql, id: string): Promise<void> {
  await admin
    .begin(async (tx) => {
      await tx`set local session_replication_role = replica`;
      await tx`delete from public.booking_events where booking_id = ${id}::uuid`;
      await tx`delete from public.booking_payments where booking_id = ${id}::uuid`;
      await tx`delete from public.booking_legs where booking_id = ${id}::uuid`;
      await tx`delete from public.bookings where id = ${id}::uuid`;
    })
    .catch(() => {});
}

async function backendPid(tx: Tx): Promise<number> {
  const rows = await tx<{ pid: number }[]>`select pg_backend_pid() as pid`;
  return rows[0]!.pid;
}

/** Polls until backend `pid` waits on a lock, then names the table it waits for. Throws after `ms`. */
async function waitingOnTable(admin: Sql, pid: () => number | undefined, ms = 3000): Promise<string> {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    const p = pid();
    if (p !== undefined) {
      const rows = await admin<{ wait: string | null; rel: string | null }[]>`
        select a.wait_event_type as wait,
               coalesce(
                 (select l.relation::regclass::text from pg_locks l
                   where l.pid = a.pid and l.locktype = 'tuple' and l.granted limit 1),
                 (select l.relation::regclass::text from pg_locks l
                   where l.pid = a.pid and l.locktype = 'relation' and not l.granted limit 1)) as rel
          from pg_stat_activity a where a.pid = ${p}::int4`;
      const r = rows[0];
      if (r && r.wait === "Lock" && r.rel) return r.rel;
    }
    await new Promise((res) => setTimeout(res, 25));
  }
  throw new Error(`backend ${String(pid())} never waited on a lock`);
}

async function outcome<T>(p: Promise<T>): Promise<T | Failure> {
  return p.then(
    (v) => v,
    (e: unknown) => ({
      error: (e as { code?: string }).code ?? String(e),
      message: (e as { message?: string }).message ?? "",
    }),
  );
}

/**
 * Settle holds the payment row; `call` starts; it must wait at booking_payments; settle then takes the booking
 * (3 s lock timeout: a deadlock or a held booking lock fails here); settle commits; `call` finishes.
 */
async function race(
  id: string,
  quote: string,
  call: (tx: Tx) => Promise<unknown>,
): Promise<{ waitsOn: string; bookingLockMs: number; result: unknown; payment: number }> {
  const admin = workerSql(SUPER, "identity");
  const settle = workerSql(SUPER, "identity");
  const checkout = workerSql(SUPER, "identity");
  try {
    await cleanup(admin, id);
    const pay = await seed(admin, id, quote);
    let callPid: number | undefined;
    let callP: Promise<unknown> | undefined;

    const steps = await settle.begin(async (s) => {
      await s`select set_config('lock_timeout', '3s', true)`;
      // Settle step 1: its booking_payments row FOR UPDATE.
      await s`select 1 from public.booking_payments where id = ${pay}::int8 for update`;

      callP = withIdentity(
        SUPER,
        "checkout",
        null,
        async (tx) => {
          callPid = await backendPid(tx);
          return call(tx);
        },
        { client: checkout },
      );
      const waitsOn = await waitingOnTable(admin, () => callPid);

      // Settle step 2: the booking FOR UPDATE. In the old order the function held it here and waited for the
      // payment: this statement then deadlocked (40P01). Now the function holds nothing on the booking.
      const t0 = Date.now();
      await s`select 1 from public.bookings where id = ${id}::uuid for update`;
      return { waitsOn, bookingLockMs: Date.now() - t0 };
    });

    const result = await outcome(callP!);
    return { ...steps, result, payment: pay };
  } finally {
    await cleanup(admin, id);
    await Promise.all([settle.end({ timeout: 5 }), checkout.end({ timeout: 5 }), admin.end({ timeout: 5 })]);
  }
}

describe("abandon, requote cancel and purge lock the payment before the booking (20261012170000)", () => {
  it("refuses any host but 127.0.0.1", () => {
    expect(new URL(SUPER).hostname).toBe("127.0.0.1");
  });

  it("checkout_abandon_unpaid waits at the payment holding nothing; settle takes the booking at once; both finish", T, async () => {
    const r = await race(ID.abandon, QUOTE.abandon, (tx) =>
      tx`select * from public.checkout_abandon_unpaid(${QUOTE.abandon}::uuid)`,
    );
    expect(r.waitsOn).toBe("booking_payments");
    expect(r.bookingLockMs).toBeLessThan(500);
    expect((r.result as Failure).error).toBeUndefined();
  });

  it("checkout_requote_cancel waits at the payment holding nothing; settle takes the booking at once; both finish", T, async () => {
    const r = await race(ID.requote, QUOTE.requote, (tx) =>
      tx`select * from public.checkout_requote_cancel(${QUOTE.requote}::uuid)`,
    );
    expect(r.waitsOn).toBe("booking_payments");
    expect(r.bookingLockMs).toBeLessThan(500);
    expect((r.result as Failure).error).toBeUndefined();
  });

  it("purge_unpaid_booking waits at the payment holding nothing; settle takes the booking at once; both finish", T, async () => {
    const r = await race(ID.purge, QUOTE.purge, (tx) =>
      tx`select public.purge_unpaid_booking(${ID.purge}::uuid, 'unpaid_expired') as purged`,
    );
    expect(r.waitsOn).toBe("booking_payments");
    expect(r.bookingLockMs).toBeLessThan(500);
    expect((r.result as Failure).error).toBeUndefined();
  });
});
