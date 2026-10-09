// packages/db/test/local/meta-purchase-lock-order.test.ts
//
// 20261007270000: meta_purchase_claim and meta_purchase_sweep lock the payment row before the booking
// row, the order of checkout_payment_settle (payment FOR UPDATE, then booking FOR UPDATE). Two real
// connections with the Worker's client options. The claim, the sweep and the real settle run as
// vamos_system through withIdentity, as the Worker runs them; where the interleaving must be exact, a
// raw superuser connection takes settle's two locks by hand, in settle's order. Committed fixtures (two
// transactions cannot see a rolled-back one), removed in `finally`. Local only: host 127.0.0.1, port
// VAMOS_LOCAL_DB_PORT.
import { describe, expect, it } from "vitest";
import { withIdentity } from "../../src/identity.js";
import { workerSql } from "../support/worker-client.js";

const PORT = process.env["VAMOS_LOCAL_DB_PORT"] ?? "62322";
const SUPER = `postgres://postgres:postgres@127.0.0.1:${PORT}/postgres`;
const POLICY = "2026-10-09";
const FBP = "fb.1.1727771234567.1234567890";

class Rollback extends Error {}

type Sql = ReturnType<typeof workerSql>;
type Tx = Parameters<Parameters<typeof withIdentity>[3]>[0];

type Fixture = { booking: string; subject: string; pi: string; snapshot: number; idleHours: number };

const A: Fixture = {
  booking: "c2927000-0000-4000-8000-000000000a01",
  subject: "29a27000-0000-4000-8000-000000000a01",
  pi: "pi_29_27_lock_a",
  snapshot: 292701,
  idleHours: 0,
};
const B: Fixture = {
  booking: "c2927000-0000-4000-8000-000000000a02",
  subject: "29a27000-0000-4000-8000-000000000a02",
  pi: "pi_29_27_lock_b",
  snapshot: 292702,
  idleHours: 0,
};
const C: Fixture = {
  booking: "c2927000-0000-4000-8000-000000000a03",
  subject: "29a27000-0000-4000-8000-000000000a03",
  pi: "pi_29_27_lock_c",
  snapshot: 292703,
  idleHours: 2,
};

/** A paid booking holding fbp and a consented subject, with one succeeded payment. Returns the payment id. */
async function seed(admin: Sql, f: Fixture): Promise<number> {
  await admin.begin(async (tx) => {
    await tx`set local session_replication_role = replica`;
    await tx`
      insert into public.consent_log (consent_subject_id, policy_version, method, necessary, functional, analytics, marketing, locale, recorded_at)
      values (${f.subject}::uuid, ${POLICY}, 'accept_all', true, true, true, true, 'en', now() - interval '3 hours')`;
    await tx`
      insert into public.bookings (id, contact_name, contact_email, status, is_test, meta_fbp, meta_fbc, meta_consent_subject, updated_at)
      values (${f.booking}::uuid, 'Lock Order', 'lock-order@example.test', 'paid', false, ${FBP}, ${null}, ${f.subject}::uuid,
              now() - make_interval(hours => ${f.idleHours}::int4))`;
    await tx`
      insert into public.booking_payments (booking_id, snapshot_id, stripe_payment_intent_id, charged_rappen, status, captured_at)
      values (${f.booking}::uuid, ${f.snapshot}::int8, ${f.pi}, 12000, 'succeeded', now() - interval '1 hour')`;
  });
  const rows = await admin<{ id: string }[]>`select id::text as id from public.booking_payments where booking_id = ${f.booking}::uuid`;
  return Number(rows[0]!.id);
}

/** consent_log is append-only and payments do not cascade: triggers off for this clean-up only. */
async function cleanup(admin: Sql, f: Fixture): Promise<void> {
  await admin
    .begin(async (tx) => {
      await tx`set local session_replication_role = replica`;
      await tx`delete from public.meta_purchase_events where booking_id = ${f.booking}::uuid`;
      await tx`delete from public.booking_events where booking_id = ${f.booking}::uuid`;
      await tx`delete from public.booking_payments where booking_id = ${f.booking}::uuid`;
      await tx`delete from public.bookings where id = ${f.booking}::uuid`;
      await tx`delete from public.consent_log where consent_subject_id = ${f.subject}::uuid`;
    })
    .catch(() => {});
}

async function backendPid(tx: Tx): Promise<number> {
  const rows = await tx<{ pid: number }[]>`select pg_backend_pid() as pid`;
  return rows[0]!.pid;
}

/**
 * Polls until backend `pid` waits on a row lock, then names the table of the row it waits for
 * (the waiter holds the tuple lock of that row). Throws after `ms`.
 */
async function waitingOnTable(admin: Sql, pid: () => number | undefined, ms = 3000): Promise<string> {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    const p = pid();
    if (p !== undefined) {
      const rows = await admin<{ wait: string | null; rel: string | null }[]>`
        select a.wait_event_type as wait,
               (select l.relation::regclass::text from pg_locks l
                 where l.pid = a.pid and l.locktype = 'tuple' and l.granted limit 1) as rel
          from pg_stat_activity a where a.pid = ${p}::int4`;
      const r = rows[0];
      if (r && r.wait === "Lock" && r.rel) return r.rel;
    }
    await new Promise((res) => setTimeout(res, 25));
  }
  throw new Error(`backend ${String(pid())} never waited on a row lock`);
}

function settledFlag<T>(p: Promise<T>): () => boolean {
  let done = false;
  p.then(
    () => {
      done = true;
    },
    () => {
      done = true;
    },
  );
  return () => done;
}

type ClaimRow = { decision: string; reason: string | null; event_id: string | null };

async function claim(tx: Tx, f: Fixture, pid: number): Promise<ClaimRow> {
  const rows = await tx<ClaimRow[]>`
    select decision, reason, event_id::text as event_id
      from public.meta_purchase_claim(${f.booking}::uuid, ${pid}::int8, ${POLICY}, ${false}, ${false}, ${null})`;
  return rows[0]!;
}

describe("meta_purchase claim and sweep take the payment lock before the booking lock (20261007270000)", () => {
  it("refuses any host but 127.0.0.1", () => {
    expect(new URL(SUPER).hostname).toBe("127.0.0.1");
  });

  it("settle holds the payment: the claim waits at the payment holding nothing, settle takes the booking, the claim finishes after the commit", async () => {
    const admin = workerSql(SUPER, "identity");
    const settle = workerSql(SUPER, "identity");
    const system = workerSql(SUPER, "identity");
    try {
      await cleanup(admin, A);
      const pid = await seed(admin, A);
      let claimPid: number | undefined;
      let claimP: Promise<ClaimRow> | undefined;

      const steps = await settle.begin(async (s) => {
        await s`select set_config('lock_timeout', '3s', true)`;
        // Settle step 1: its booking_payments row FOR UPDATE.
        await s`select 1 from public.booking_payments where id = ${pid}::int8 for update`;

        claimP = withIdentity(
          SUPER,
          "system",
          undefined,
          async (tx) => {
            claimPid = await backendPid(tx);
            return claim(tx, A, pid);
          },
          { client: system },
        );
        const claimDone = settledFlag(claimP);
        const waitsOn = await waitingOnTable(admin, () => claimPid);

        // Settle step 2: the booking FOR UPDATE. Before 270000 the claim held it here and waited for
        // the payment: this statement then deadlocked (40P01). Now the claim holds nothing on it.
        const t0 = Date.now();
        await s`select 1 from public.bookings where id = ${A.booking}::uuid for update`;
        const bookingLockMs = Date.now() - t0;
        await new Promise((res) => setTimeout(res, 200));
        return { waitsOn, bookingLockMs, claimDoneBeforeCommit: claimDone() };
      });

      // Before 270000 this was { error: "40P01" } (deadlock detected; settle's booking lock waited ~1 s).
      const outcome = await claimP!.then(
        (r) => ({ decision: r.decision }),
        (e: unknown) => ({ error: (e as { code?: string }).code ?? String(e) }),
      );
      expect(outcome).toEqual({ decision: "send" });
      expect(steps.waitsOn).toBe("booking_payments");
      expect(steps.bookingLockMs).toBeLessThan(500);
      expect(steps.claimDoneBeforeCommit).toBe(false);
      const events = await admin<{ state: string }[]>`select state from public.meta_purchase_events where booking_id = ${A.booking}::uuid`;
      expect(events).toEqual([{ state: "sending" }]);
    } finally {
      await cleanup(admin, A);
      await Promise.all([settle.end({ timeout: 5 }), system.end({ timeout: 5 }), admin.end({ timeout: 5 })]);
    }
  });

  it("the claim holds the payment and the booking: a repeated real settle waits at the payment and answers already settled after the commit", async () => {
    const admin = workerSql(SUPER, "identity");
    const c1 = workerSql(SUPER, "identity");
    const c2 = workerSql(SUPER, "identity");
    try {
      await cleanup(admin, B);
      const pid = await seed(admin, B);
      let settlePid: number | undefined;
      let settleP: Promise<{ already_settled: boolean; payment_id: string }[]> | undefined;

      const first = await withIdentity(
        SUPER,
        "system",
        undefined,
        async (tx1) => {
          const row = await claim(tx1, B, pid);
          settleP = withIdentity(
            SUPER,
            "system",
            undefined,
            async (tx2) => {
              settlePid = await backendPid(tx2);
              return tx2<{ already_settled: boolean; payment_id: string }[]>`
                select already_settled, payment_id::text as payment_id
                  from public.checkout_payment_settle(${"evt_29_27_lock_b"}, ${null}, ${B.pi}, ${"succeeded"},
                    ${null}, ${null}, ${null}, ${null}::timestamptz, ${null}, ${null})`;
            },
            { client: c2 },
          );
          const settleDone = settledFlag(settleP);
          const waitsOn = await waitingOnTable(admin, () => settlePid);
          await new Promise((res) => setTimeout(res, 200));
          return { row, waitsOn, settleDoneBeforeCommit: settleDone() };
        },
        { client: c1 },
      );

      expect(first.row.decision).toBe("send");
      expect(first.waitsOn).toBe("booking_payments");
      expect(first.settleDoneBeforeCommit).toBe(false);
      const settled = await settleP!;
      expect(settled).toEqual([{ already_settled: true, payment_id: String(pid) }]);
      const events = await admin<{ n: number }[]>`select count(*)::int4 as n from public.meta_purchase_events where booking_id = ${B.booking}::uuid`;
      expect(events[0]!.n).toBe(1);
    } finally {
      await cleanup(admin, B);
      await Promise.all([c1.end({ timeout: 5 }), c2.end({ timeout: 5 }), admin.end({ timeout: 5 })]);
    }
  });

  it("the sweep skips a booking whose payment settle holds, without waiting and without holding the booking, and cleans it on the next run", async () => {
    const admin = workerSql(SUPER, "identity");
    const settle = workerSql(SUPER, "identity");
    const system = workerSql(SUPER, "identity");
    type Seen = { meta_fbp: string | null; state: string | null; skip_reason: string | null };
    const seen = async (tx: Tx): Promise<Seen> => {
      await tx`select set_config('role', 'postgres', true)`;
      const rows = await tx<Seen[]>`
        select b.meta_fbp, e.state, e.skip_reason
          from public.bookings b left join public.meta_purchase_events e on e.booking_id = b.id
         where b.id = ${C.booking}::uuid`;
      await tx`select set_config('role', 'vamos_system', true)`;
      return rows[0]!;
    };
    /** One sweep as vamos_system in a transaction that is rolled back; `during` runs before the rollback. */
    const sweepRolledBack = async (during: (tx: Tx) => Promise<unknown>): Promise<unknown> => {
      let out: unknown;
      await withIdentity(
        SUPER,
        "system",
        undefined,
        async (tx) => {
          out = await during(tx);
          throw new Rollback();
        },
        { client: system },
      ).catch((err) => {
        if (!(err instanceof Rollback)) throw err;
      });
      return out;
    };
    try {
      await cleanup(admin, C);
      const pid = await seed(admin, C);

      const held = await settle.begin(async (s) => {
        await s`select set_config('lock_timeout', '3s', true)`;
        await s`select 1 from public.booking_payments where id = ${pid}::int8 for update`;
        return sweepRolledBack(async (tx) => {
          const t0 = Date.now();
          const n = await tx<{ n: number }[]>`select public.meta_purchase_sweep() as n`;
          const sweepMs = Date.now() - t0;
          const after = await seen(tx);
          // The sweep's transaction is still open: it must hold nothing on this booking.
          const t1 = Date.now();
          await s`select 1 from public.bookings where id = ${C.booking}::uuid for update`;
          return { n: n[0]!.n, sweepMs, after, bookingLockMs: Date.now() - t1 };
        });
      });

      const h = held as { n: number; sweepMs: number; after: Seen; bookingLockMs: number };
      expect(typeof h.n).toBe("number");
      expect(h.sweepMs).toBeLessThan(1000);
      expect(h.after).toEqual({ meta_fbp: FBP, state: null, skip_reason: null });
      expect(h.bookingLockMs).toBeLessThan(500);

      const next = (await sweepRolledBack(async (tx) => {
        const n = await tx<{ n: number }[]>`select public.meta_purchase_sweep() as n`;
        return { n: n[0]!.n, after: await seen(tx) };
      })) as { n: number; after: Seen };
      expect(next.n).toBeGreaterThanOrEqual(1);
      expect(next.after).toEqual({ meta_fbp: null, state: "skipped", skip_reason: "interrupted" });
    } finally {
      await cleanup(admin, C);
      await Promise.all([settle.end({ timeout: 5 }), system.end({ timeout: 5 }), admin.end({ timeout: 5 })]);
    }
  });
});
