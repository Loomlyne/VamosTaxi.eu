// packages/db/test/local/refund-lock-order.test.ts
//
// 20261007280000: the refund, change-request and difference-settle functions lock the payment row
// before the booking row, the order of checkout_payment_settle and meta_purchase_claim, and under
// the booking lock refuse with 'payment-changed' (40001) when a payment settled in between. Two real
// connections with the Worker's client options. The functions under test run as vamos_system through
// withIdentity, as the Worker runs them; where the interleaving must be exact, a raw superuser
// connection takes the other side's locks by hand, in that side's order. Also the branch the 270000
// review found untested: the sweep skips a booking whose first payment changed under its booking
// lock. Committed fixtures (two transactions cannot see a rolled-back one), removed in `finally`.
// Synthetic integer rappen only. Local only: host 127.0.0.1, port VAMOS_LOCAL_DB_PORT.
import { describe, expect, it } from "vitest";
import { withIdentity } from "../../src/identity.js";
import { workerSql } from "../support/worker-client.js";

const PORT = process.env["VAMOS_LOCAL_DB_PORT"] ?? "62322";
const SUPER = `postgres://postgres:postgres@127.0.0.1:${PORT}/postgres`;
const POLICY = "2026-10-01";
const FBP = "fb.1.1727771234567.1234567890";
const T = { timeout: 30_000 };

class Rollback extends Error {}

type Sql = ReturnType<typeof workerSql>;
type Tx = Parameters<Parameters<typeof withIdentity>[3]>[0];
type Failure = { error: string; message: string };

const ID = {
  plan: "c2928000-0000-4000-8000-0000000000a1",
  accept: "c2928000-0000-4000-8000-0000000000b1",
  claim: "c2928000-0000-4000-8000-0000000000b2",
  changed: "c2928000-0000-4000-8000-0000000000c1",
  extra: "c2928000-0000-4000-8000-0000000000c2",
  // The sweep test needs the first candidate: the sweep stops at the first candidate's booking lock.
  sweep: "00000000-2928-4000-8000-0000000000d1",
};
const SUBJECT = {
  claim: "29a28000-0000-4000-8000-0000000000b2",
  sweep: "29a28000-0000-4000-8000-0000000000d1",
};

// One succeeded payment per price record (booking_payments_one_success_per_snapshot): a fresh
// made-up snapshot id per payment row (foreign keys are off while fixtures are written).
let snapshotSeq = 2928100;
const nextSnapshot = (): number => snapshotSeq++;

/** A booking, with fbp and a consented subject when `subject` is given, idle for `idleHours`. */
async function seedBooking(admin: Sql, id: string, opts: { subject?: string; idleHours?: number } = {}): Promise<void> {
  await admin.begin(async (tx) => {
    await tx`set local session_replication_role = replica`;
    if (opts.subject) {
      await tx`
        insert into public.consent_log (consent_subject_id, policy_version, method, necessary, functional, analytics, marketing, locale, recorded_at)
        values (${opts.subject}::uuid, ${POLICY}, 'accept_all', true, true, true, true, 'en', now() - interval '3 hours')`;
    }
    await tx`
      insert into public.bookings (id, contact_name, contact_email, status, is_test, meta_fbp, meta_consent_subject, updated_at)
      values (${id}::uuid, 'Lock Order', 'lock-order@example.test', 'paid', false,
              ${opts.subject ? FBP : null}, ${opts.subject ?? null}::uuid, now() - make_interval(hours => ${opts.idleHours ?? 0}::int4))`;
  });
}

/** One succeeded payment of `rappen`, captured `minutesAgo` minutes ago. Returns its id. */
async function seedPayment(admin: Sql, booking: string, pi: string, rappen: number, minutesAgo: number): Promise<number> {
  const rows = await admin.begin(async (tx) => {
    await tx`set local session_replication_role = replica`;
    return tx<{ id: string }[]>`
      insert into public.booking_payments (booking_id, snapshot_id, stripe_payment_intent_id, charged_rappen, status, captured_at)
      values (${booking}::uuid, ${nextSnapshot()}::int8, ${pi}, ${rappen}::int4, 'succeeded', now() - make_interval(mins => ${minutesAgo}::int4))
      returning id::text as id`;
  });
  return Number(rows[0]!.id);
}

/** A price record of `total` rappen for the booking (shape only: the reconcile trigger is off). */
async function seedSnapshot(admin: Sql, booking: string, total: number): Promise<number> {
  const rows = await admin.begin(async (tx) => {
    await tx`set local session_replication_role = replica`;
    return tx<{ id: string }[]>`
      insert into public.price_snapshots (
        quote_id, vehicle_class_id, rate_version_id, rate_version_is_live, settings_version_id, engine_version, pax, bags,
        lines, policy, subtotal_rappen, surcharges_rappen, discount_rappen, total_rappen, expires_at, quote_lock_expires_at,
        booking_id, source)
      values (
        gen_random_uuid(), (select id from public.vehicle_classes order by id limit 1),
        (select id from public.rate_versions order by id limit 1), true,
        (select id from public.settings_versions order by id limit 1), 'lock-order-test', 2, 1, '[]'::jsonb,
        jsonb_build_object('cancellation_tiers', '[]'::jsonb, 'free_cancel_hours', 24, 'airport_waiting_minutes', 60,
                           'city_waiting_minutes', 15, 'settings_version_id', 1, 'modification_deadline_hours', 24,
                           'min_advance_minutes', 180, 'policy_doc', 'test'),
        ${total}::int4, 0, 0, ${total}::int4, now() + interval '1 day', now() + interval '1 day', ${booking}::uuid, 'modification')
      returning id::text as id`;
  });
  return Number(rows[0]!.id);
}

/** A waiting change request. Returns its id. */
async function seedRequest(
  admin: Sql,
  booking: string,
  r: { quote: number; extra: number | null; session: string | null },
): Promise<string> {
  const rows = await admin.begin(async (tx) => {
    await tx`set local session_replication_role = replica`;
    return tx<{ id: string }[]>`
      insert into public.booking_edit_requests (booking_id, actor, payload, quote_snapshot_id, extra_snapshot_id, extra_session_id, status)
      values (${booking}::uuid, 'staff', '{}'::jsonb, ${r.quote}::int8, ${r.extra}::int8, ${r.session}, 'requested')
      returning id::text as id`;
  });
  return rows[0]!.id;
}

/** Append-only tables and payments that do not cascade: triggers off for this clean-up only. */
async function cleanup(admin: Sql, booking: string, subject?: string): Promise<void> {
  await admin
    .begin(async (tx) => {
      await tx`set local session_replication_role = replica`;
      await tx`delete from public.meta_purchase_events where booking_id = ${booking}::uuid`;
      await tx`delete from public.booking_refund_intents where booking_id = ${booking}::uuid`;
      await tx`delete from public.booking_events where booking_id = ${booking}::uuid`;
      await tx`delete from public.booking_edit_requests where booking_id = ${booking}::uuid`;
      await tx`delete from public.booking_payments where booking_id = ${booking}::uuid`;
      await tx`delete from public.price_snapshots where booking_id = ${booking}::uuid`;
      await tx`delete from public.bookings where id = ${booking}::uuid`;
      if (subject) await tx`delete from public.consent_log where consent_subject_id = ${subject}::uuid`;
    })
    .catch(() => {});
}

async function backendPid(tx: Tx): Promise<number> {
  const rows = await tx<{ pid: number }[]>`select pg_backend_pid() as pid`;
  return rows[0]!.pid;
}

/**
 * Polls until backend `pid` waits on a lock, then names the table it waits for: the table of the row
 * (the waiter holds that row's tuple lock) or, for a table lock, the table itself. Throws after `ms`.
 */
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

/** The value, or the SQLSTATE and message it failed with. */
async function outcome<T>(p: Promise<T>): Promise<T | Failure> {
  return p.then(
    (v) => v,
    (e: unknown) => ({
      error: (e as { code?: string }).code ?? String(e),
      message: (e as { message?: string }).message ?? "",
    }),
  );
}

type PlanRow = { payment_id: string; amount_rappen: number; resumed: boolean };

function plan(tx: Tx, booking: string): Promise<PlanRow[]> {
  return tx<PlanRow[]>`
    select payment_id::text as payment_id, amount_rappen, resumed
      from public.ops_refund_plan(${booking}::uuid, ${null}::uuid, ${null}::int8, ${null}::numeric, ${null}::text, ${false}::bool, ${null}::int4)`;
}

describe("refund, change and difference-settle functions lock the payment before the booking (20261007280000)", () => {
  it("refuses any host but 127.0.0.1", () => {
    expect(new URL(SUPER).hostname).toBe("127.0.0.1");
  });

  it("(a) settle holds the payment: the refund plan waits at the payment holding nothing, settle takes the booking at once, both finish", T, async () => {
    const admin = workerSql(SUPER, "identity");
    const settle = workerSql(SUPER, "identity");
    const system = workerSql(SUPER, "identity");
    try {
      await cleanup(admin, ID.plan);
      await seedBooking(admin, ID.plan);
      const pay = await seedPayment(admin, ID.plan, "pi_29_28_plan", 10, 60);
      let planPid: number | undefined;
      let planP: Promise<PlanRow[]> | undefined;

      const steps = await settle.begin(async (s) => {
        await s`select set_config('lock_timeout', '3s', true)`;
        // Settle step 1: its booking_payments row FOR UPDATE.
        await s`select 1 from public.booking_payments where id = ${pay}::int8 for update`;

        planP = withIdentity(
          SUPER,
          "system",
          undefined,
          async (tx) => {
            planPid = await backendPid(tx);
            return plan(tx, ID.plan);
          },
          { client: system },
        );
        const planDone = settledFlag(planP);
        const waitsOn = await waitingOnTable(admin, () => planPid);

        // Settle step 2: the booking FOR UPDATE. Before 280000 the plan held it here and waited for
        // the payment: this statement then deadlocked (40P01). Now the plan holds nothing on it.
        const t0 = Date.now();
        await s`select 1 from public.bookings where id = ${ID.plan}::uuid for update`;
        const bookingLockMs = Date.now() - t0;
        await new Promise((res) => setTimeout(res, 200));
        return { waitsOn, bookingLockMs, planDoneBeforeCommit: planDone() };
      });

      const out = await outcome(planP!);
      expect(out).toEqual([{ payment_id: String(pay), amount_rappen: 10, resumed: false }]);
      expect(steps.waitsOn).toBe("booking_payments");
      expect(steps.bookingLockMs).toBeLessThan(500);
      expect(steps.planDoneBeforeCommit).toBe(false);
      const intents = await admin<{ n: number }[]>`select count(*)::int4 as n from public.booking_refund_intents where booking_id = ${ID.plan}::uuid`;
      expect(intents[0]!.n).toBe(1);
    } finally {
      await cleanup(admin, ID.plan);
      await Promise.all([settle.end({ timeout: 5 }), system.end({ timeout: 5 }), admin.end({ timeout: 5 })]);
    }
  });

  it("(b) the claim holds the payment: Accept waits at the payment holding nothing, the claim takes the booking at once, both finish", T, async () => {
    const admin = workerSql(SUPER, "identity");
    const claimSide = workerSql(SUPER, "identity");
    const system = workerSql(SUPER, "identity");
    try {
      await cleanup(admin, ID.accept);
      await seedBooking(admin, ID.accept);
      const pay = await seedPayment(admin, ID.accept, "pi_29_28_accept", 10, 60);
      const quote = await seedSnapshot(admin, ID.accept, 13);
      const extra = await seedSnapshot(admin, ID.accept, 3);
      const request = await seedRequest(admin, ID.accept, { quote, extra, session: null });
      let acceptPid: number | undefined;
      let acceptP: Promise<{ outcome: string; difference_rappen: number }[]> | undefined;

      const steps = await claimSide.begin(async (c) => {
        await c`select set_config('lock_timeout', '3s', true)`;
        // meta_purchase_claim step 1: its payment FOR KEY SHARE.
        await c`select 1 from public.booking_payments where id = ${pay}::int8 for key share`;

        acceptP = withIdentity(
          SUPER,
          "system",
          undefined,
          async (tx) => {
            acceptPid = await backendPid(tx);
            return tx<{ outcome: string; difference_rappen: number }[]>`
              select outcome, difference_rappen from public.booking_edit_request_accept(${request}::uuid, ${null}::uuid)`;
          },
          { client: system },
        );
        const acceptDone = settledFlag(acceptP);
        const waitsOn = await waitingOnTable(admin, () => acceptPid);

        // Claim step 2: the booking FOR UPDATE. Before 280000 Accept held the booking (and the request)
        // here and waited for the payment: this deadlocked (40P01).
        const t0 = Date.now();
        await c`select 1 from public.bookings where id = ${ID.accept}::uuid for update`;
        const bookingLockMs = Date.now() - t0;
        await new Promise((res) => setTimeout(res, 200));
        return { waitsOn, bookingLockMs, acceptDoneBeforeCommit: acceptDone() };
      });

      const out = await outcome(acceptP!);
      expect(out).toEqual([{ outcome: "extra_required", difference_rappen: 3 }]);
      expect(steps.waitsOn).toBe("booking_payments");
      expect(steps.bookingLockMs).toBeLessThan(500);
      expect(steps.acceptDoneBeforeCommit).toBe(false);
    } finally {
      await cleanup(admin, ID.accept);
      await Promise.all([claimSide.end({ timeout: 5 }), system.end({ timeout: 5 }), admin.end({ timeout: 5 })]);
    }
  });

  it("(b) Accept holds the payment and the booking: the real claim waits at the payment and sends after the commit", T, async () => {
    const admin = workerSql(SUPER, "identity");
    const c1 = workerSql(SUPER, "identity");
    const c2 = workerSql(SUPER, "identity");
    try {
      await cleanup(admin, ID.claim, SUBJECT.claim);
      await seedBooking(admin, ID.claim, { subject: SUBJECT.claim });
      const pay = await seedPayment(admin, ID.claim, "pi_29_28_claim", 10, 60);
      const quote = await seedSnapshot(admin, ID.claim, 13);
      const extra = await seedSnapshot(admin, ID.claim, 3);
      const request = await seedRequest(admin, ID.claim, { quote, extra, session: null });
      let claimPid: number | undefined;
      let claimP: Promise<{ decision: string }[]> | undefined;

      const first = await withIdentity(
        SUPER,
        "system",
        undefined,
        async (tx1) => {
          const accepted = await tx1<{ outcome: string }[]>`
            select outcome from public.booking_edit_request_accept(${request}::uuid, ${null}::uuid)`;
          claimP = withIdentity(
            SUPER,
            "system",
            undefined,
            async (tx2) => {
              claimPid = await backendPid(tx2);
              return tx2<{ decision: string }[]>`
                select decision from public.meta_purchase_claim(${ID.claim}::uuid, ${pay}::int8, ${POLICY}, ${false}, ${false}, ${null})`;
            },
            { client: c2 },
          );
          const claimDone = settledFlag(claimP);
          const waitsOn = await waitingOnTable(admin, () => claimPid);
          await new Promise((res) => setTimeout(res, 200));
          return { accepted: accepted[0]!.outcome, waitsOn, claimDoneBeforeCommit: claimDone() };
        },
        { client: c1 },
      );

      expect(first).toEqual({ accepted: "extra_required", waitsOn: "booking_payments", claimDoneBeforeCommit: false });
      expect(await outcome(claimP!)).toEqual([{ decision: "send" }]);
    } finally {
      await cleanup(admin, ID.claim, SUBJECT.claim);
      await Promise.all([c1.end({ timeout: 5 }), c2.end({ timeout: 5 }), admin.end({ timeout: 5 })]);
    }
  });

  it("(c) a payment settles while the refund plan waits for the booking: payment-changed (40001), nothing written; pressed again, it plans both", T, async () => {
    const admin = workerSql(SUPER, "identity");
    const other = workerSql(SUPER, "identity");
    const system = workerSql(SUPER, "identity");
    try {
      await cleanup(admin, ID.changed);
      await seedBooking(admin, ID.changed);
      const p1 = await seedPayment(admin, ID.changed, "pi_29_28_changed_1", 10, 60);
      let planPid: number | undefined;
      let planP: Promise<PlanRow[]> | undefined;
      let p2 = 0;

      const waitsOn = await other.begin(async (o) => {
        // A second payment settles: it holds the booking and its new row is not committed yet.
        await o`select 1 from public.bookings where id = ${ID.changed}::uuid for update`;
        await o`set local session_replication_role = replica`;
        const rows = await o<{ id: string }[]>`
          insert into public.booking_payments (booking_id, snapshot_id, stripe_payment_intent_id, charged_rappen, status, captured_at)
          values (${ID.changed}::uuid, ${nextSnapshot()}::int8, 'pi_29_28_changed_2', 3, 'succeeded', now())
          returning id::text as id`;
        p2 = Number(rows[0]!.id);
        planP = withIdentity(
          SUPER,
          "system",
          undefined,
          async (tx) => {
            planPid = await backendPid(tx);
            return plan(tx, ID.changed);
          },
          { client: system },
        );
        // The plan has locked the one payment it saw and now waits for the booking.
        return waitingOnTable(admin, () => planPid);
      });

      expect(waitsOn).toBe("bookings");
      // Before 280000 the plan took FOR UPDATE on the new payment under the booking lock and planned both.
      expect(await outcome(planP!)).toEqual({ error: "40001", message: "payment-changed" });
      const written = await admin<{ intents: number; status: string }[]>`
        select (select count(*)::int4 from public.booking_refund_intents where booking_id = ${ID.changed}::uuid) as intents,
               (select refund_status from public.bookings where id = ${ID.changed}::uuid) as status`;
      expect(written).toEqual([{ intents: 0, status: "none" }]);

      const again = await withIdentity(SUPER, "system", undefined, (tx) => plan(tx, ID.changed), { client: system });
      expect(again.map((r) => [Number(r.payment_id), r.amount_rappen])).toEqual([
        [p1, 10],
        [p2, 3],
      ]);
    } finally {
      await cleanup(admin, ID.changed);
      await Promise.all([other.end({ timeout: 5 }), system.end({ timeout: 5 }), admin.end({ timeout: 5 })]);
    }
  });

  it("(c) two deliveries of one difference payment: the second finds the payment the first recorded, answers 40001 instead of locking it, and its retry is already settled", T, async () => {
    const admin = workerSql(SUPER, "identity");
    const first = workerSql(SUPER, "identity");
    const system = workerSql(SUPER, "identity");
    const page = "cs_29_28_extra";
    type Settled = { already_settled: boolean };
    const settleCall = (tx: Tx, event: string) =>
      tx<Settled[]>`
        select already_settled from public.checkout_extra_payment_settle(
          ${event}, ${page}, ${"pi_29_28_extra"}, 'succeeded', 'CHF', ${null}::numeric, ${null}, ${null}::timestamptz, ${null}::int8)`;
    try {
      await cleanup(admin, ID.extra);
      await seedBooking(admin, ID.extra);
      await seedPayment(admin, ID.extra, "pi_29_28_extra_trip", 10, 60);
      const recorded = await seedPayment(admin, ID.extra, "pi_29_28_extra", 3, 1);
      const quote = await seedSnapshot(admin, ID.extra, 13);
      const request = await seedRequest(admin, ID.extra, { quote, extra: null, session: page });
      let secondPid: number | undefined;
      let secondP: Promise<Settled[]> | undefined;

      const waitsOn = await first.begin(async (f) => {
        // The first delivery holds the booking and records the payment on the request (not committed yet).
        await f`select 1 from public.bookings where id = ${ID.extra}::uuid for update`;
        await f`update public.booking_edit_requests set extra_payment_id = ${recorded}::int8 where id = ${request}::uuid`;
        secondP = withIdentity(
          SUPER,
          "system",
          undefined,
          async (tx) => {
            secondPid = await backendPid(tx);
            return settleCall(tx, "evt_29_28_extra_2");
          },
          { client: system },
        );
        return waitingOnTable(admin, () => secondPid);
      });

      expect(waitsOn).toBe("bookings");
      // Before 280000 it took FOR UPDATE on that payment under the booking lock and answered already settled.
      expect(await outcome(secondP!)).toEqual({ error: "40001", message: "payment-changed" });
      const retry = await withIdentity(SUPER, "system", undefined, (tx) => settleCall(tx, "evt_29_28_extra_2"), { client: system });
      expect(retry).toEqual([{ already_settled: true }]);
    } finally {
      await cleanup(admin, ID.extra);
      await Promise.all([first.end({ timeout: 5 }), system.end({ timeout: 5 }), admin.end({ timeout: 5 })]);
    }
  });

  it("(d) the sweep skips a booking whose first payment changed under its booking lock, and cleans it on the next run", T, async () => {
    const admin = workerSql(SUPER, "identity");
    const other = workerSql(SUPER, "identity");
    const system = workerSql(SUPER, "identity");
    type Seen = { meta_fbp: string | null; state: string | null; skip_reason: string | null; payment_id: string | null };
    const seen = async (tx: Tx): Promise<Seen> => {
      await tx`select set_config('role', 'postgres', true)`;
      const rows = await tx<Seen[]>`
        select b.meta_fbp, e.state, e.skip_reason, e.payment_id::text as payment_id
          from public.bookings b left join public.meta_purchase_events e on e.booking_id = b.id
         where b.id = ${ID.sweep}::uuid`;
      await tx`select set_config('role', 'vamos_system', true)`;
      return rows[0]!;
    };
    /** One sweep as vamos_system in a transaction that is rolled back; `during` runs before the rollback. */
    const sweepRolledBack = async <R>(during: (tx: Tx) => Promise<R>): Promise<R> => {
      let out: R | undefined;
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
      return out as R;
    };
    try {
      await cleanup(admin, ID.sweep, SUBJECT.sweep);
      await seedBooking(admin, ID.sweep, { subject: SUBJECT.sweep, idleHours: 2 });
      const old = await seedPayment(admin, ID.sweep, "pi_29_28_sweep_old", 10, 120);
      // This booking is the sweep's first candidate (the sweep stops at that candidate's booking lock).
      const firstCandidate = await admin<{ id: string }[]>`
        select b.id::text as id from public.bookings b
         where b.status <> 'pending'
           and (b.meta_fbp is not null or b.meta_fbc is not null or b.meta_consent_subject is not null)
           and (exists (select 1 from public.meta_purchase_events e where e.booking_id = b.id)
                or exists (select 1 from public.booking_payments p where p.booking_id = b.id and p.status = 'succeeded'
                             and coalesce(p.captured_at, p.created_at) < now() - interval '7 days')
                or b.updated_at < now() - interval '1 hour')
         order by b.id limit 1`;
      expect(firstCandidate).toEqual([{ id: ID.sweep }]);

      let sweepPid: number | undefined;
      let newer = 0;
      let sweepP: Promise<{ n: number; after: Seen }> | undefined;
      const waitsOn = await other.begin(async (o) => {
        // A table lock that lets the sweep read (candidates, first payment, its KEY SHARE) but stops it at
        // its booking lock (ROW SHARE on bookings). Meanwhile an earlier payment of the booking settles.
        await o`lock table public.bookings in exclusive mode`;
        sweepP = sweepRolledBack(async (tx) => {
          sweepPid = await backendPid(tx);
          const n = await tx<{ n: number }[]>`select public.meta_purchase_sweep() as n`;
          return { n: n[0]!.n, after: await seen(tx) };
        });
        const rel = await waitingOnTable(admin, () => sweepPid);
        await o`set local session_replication_role = replica`;
        const rows = await o<{ id: string }[]>`
          insert into public.booking_payments (booking_id, snapshot_id, stripe_payment_intent_id, charged_rappen, status, captured_at)
          values (${ID.sweep}::uuid, ${nextSnapshot()}::int8, 'pi_29_28_sweep_new', 10, 'succeeded', now() - interval '3 hours')
          returning id::text as id`;
        newer = Number(rows[0]!.id);
        return rel;
      });

      expect(waitsOn).toBe("bookings");
      const run1 = await sweepP!;
      // Without the re-read the sweep would write skipped / interrupted for the old payment here.
      expect(run1.after).toEqual({ meta_fbp: FBP, state: null, skip_reason: null, payment_id: null });

      const run2 = await sweepRolledBack(async (tx) => {
        const n = await tx<{ n: number }[]>`select public.meta_purchase_sweep() as n`;
        return { n: n[0]!.n, after: await seen(tx) };
      });
      expect(run2.n).toBeGreaterThanOrEqual(1);
      expect(run2.after).toEqual({ meta_fbp: null, state: "skipped", skip_reason: "interrupted", payment_id: String(newer) });
      expect(newer).not.toBe(old);
    } finally {
      await cleanup(admin, ID.sweep, SUBJECT.sweep);
      await Promise.all([other.end({ timeout: 5 }), system.end({ timeout: 5 }), admin.end({ timeout: 5 })]);
    }
  });
});
