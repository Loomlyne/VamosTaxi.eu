// packages/db/test/local/meta-purchase.test.ts
//
// Phase 29 plan 05 (META-10..13). public.meta_purchase_claim / _finish / _clear_ids through the SAME
// options the Worker's client uses (`fetch_types: false`), as role vamos_system exactly as
// `withIdentity(..., "system")` sets it. No arrays. Every case runs in its own transaction that is
// rolled back. Local only: the host is fixed to 127.0.0.1; the port comes from VAMOS_LOCAL_DB_PORT.
import { describe, expect, it } from "vitest";
import { withIdentity } from "../../src/identity.js";
import { workerSql } from "../support/worker-client.js";

const PORT = process.env["VAMOS_LOCAL_DB_PORT"] ?? "62322";
const SUPER = `postgres://postgres:postgres@127.0.0.1:${PORT}/postgres`;
const B1 = "c2905000-0000-4000-8000-000000000a01";
const B2 = "c2905000-0000-4000-8000-000000000a02";
const SUBJECT = "29a05000-0000-4000-8000-000000000001";
const POLICY = "2026-10-01";
const FBP = "fb.1.1727771234567.1234567890";
const FBC = "fb.1.1727771234567.IwAR0abc_DEF-123";

class Rollback extends Error {}

type Tx = Parameters<Parameters<typeof withIdentity>[3]>[0];

type ClaimRow = {
  decision: string;
  reason: string | null;
  event_id: string | null;
  fbp: string | null;
  fbc: string | null;
  charged_rappen: number | null;
  captured_at: Date | string | null;
};

/** One rolled-back transaction as vamos_system; fixtures inserted as postgres first. */
async function inTx<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  const sql = workerSql(SUPER, "identity");
  let out: T | undefined;
  try {
    await withIdentity(
      SUPER,
      "system",
      undefined,
      async (tx) => {
        await tx`select set_config('role', 'postgres', true)`;
        await tx`set local session_replication_role = replica`;
        await tx`
          insert into public.consent_log (consent_subject_id, policy_version, method, necessary, functional, analytics, marketing, locale, recorded_at)
          values (${SUBJECT}::uuid, ${POLICY}, 'accept_all', true, true, true, true, 'en', now() - interval '3 hours')`;
        await tx`
          insert into public.bookings (id, contact_name, contact_email, status, is_test, meta_fbp, meta_fbc, meta_consent_subject)
          values
            (${B1}::uuid, 'Claim One', 'claim-one@example.test', 'paid', false, ${FBP}, ${null}, ${SUBJECT}::uuid),
            (${B2}::uuid, 'Claim Two', 'claim-two@example.test', 'paid', false, ${FBP}, ${null}, ${SUBJECT}::uuid)`;
        await tx`
          insert into public.booking_payments (booking_id, snapshot_id, stripe_payment_intent_id, charged_rappen, status, captured_at)
          values
            (${B1}::uuid, 0, 'pi_29_05_a', 12000, 'succeeded', now() - interval '1 hour'),
            (${B2}::uuid, 1, 'pi_29_05_b', 12000, 'succeeded', now() - interval '1 hour')`;
        await tx`set local session_replication_role = origin`;
        await tx`select set_config('role', 'vamos_system', true)`;
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

/** Runs `fn` as postgres inside the transaction, then returns to vamos_system. */
async function asPostgres<T>(tx: Tx, fn: () => Promise<T>): Promise<T> {
  await tx`select set_config('role', 'postgres', true)`;
  try {
    return await fn();
  } finally {
    await tx`select set_config('role', 'vamos_system', true)`;
  }
}

async function paymentId(tx: Tx, bookingId: string): Promise<number> {
  const rows = await asPostgres(
    tx,
    () => tx<{ id: string }[]>`select id::text as id from public.booking_payments where booking_id = ${bookingId}::uuid`,
  );
  return Number(rows[0]!.id);
}

async function claim(tx: Tx, bookingId: string, pid: number, skip: string | null): Promise<ClaimRow> {
  const rows = await tx<ClaimRow[]>`
    select * from public.meta_purchase_claim(${bookingId}::uuid, ${pid}::int8, ${POLICY}, ${false}, ${false}, ${skip})`;
  return rows[0]!;
}

describe("meta_purchase_claim / finish / clear_ids through the Worker client options (fetch_types: false)", () => {
  it("refuses any host but 127.0.0.1", () => {
    expect(new URL(SUPER).hostname).toBe("127.0.0.1");
  });

  it("claims 'send' with typed values, answers 'already' the second time, and finish records the outcome", async () => {
    const r = await inTx(async (tx) => {
      const pid = await paymentId(tx, B1);
      const first = await claim(tx, B1, pid, null);
      const second = await claim(tx, B1, pid, null);
      const events = await asPostgres(
        tx,
        () => tx<{ event_id: string }[]>`select event_id::text as event_id from public.meta_purchase_events where booking_id = ${B1}::uuid`,
      );
      await tx`select public.meta_purchase_finish(${B1}::uuid, ${first.event_id}::uuid, ${"sent"}, ${200}::int4, ${null}::int4, ${null}::int4)`;
      const done = await asPostgres(
        tx,
        () => tx<{ state: string; http_status: number }[]>`select state, http_status from public.meta_purchase_events where booking_id = ${B1}::uuid`,
      );
      return { pid, first, second, events, done };
    });
    expect(typeof r.pid).toBe("number");
    expect(r.first.decision).toBe("send");
    expect(typeof r.first.event_id).toBe("string");
    expect(r.first.event_id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    expect(r.first.fbp).toBe(FBP);
    expect(r.first.fbc).toBeNull();
    expect(typeof r.first.charged_rappen).toBe("number");
    expect(r.first.charged_rappen).toBe(12000);
    expect(Number.isNaN(new Date(r.first.captured_at as string | Date).getTime())).toBe(false);
    expect(r.second.decision).toBe("already");
    expect(r.events).toEqual([{ event_id: r.first.event_id }]);
    expect(r.done).toEqual([{ state: "sent", http_status: 200 }]);
  });

  it("records a worker skip and wipes the ids", async () => {
    const r = await inTx(async (tx) => {
      const pid = await paymentId(tx, B2);
      const c = await claim(tx, B2, pid, "no_test_code");
      const b = await asPostgres(
        tx,
        () => tx<{ meta_fbp: string | null }[]>`select meta_fbp from public.bookings where id = ${B2}::uuid`,
      );
      return { c, b: b[0]! };
    });
    expect(r.c.decision).toBe("skip");
    expect(r.c.reason).toBe("no_test_code");
    expect(r.b.meta_fbp).toBeNull();
  });

  it("clear_ids empties fbp, fbc and the consent subject", async () => {
    const b = await inTx(async (tx) => {
      await tx`select public.meta_purchase_clear_ids(${B1}::uuid)`;
      const rows = await asPostgres(
        tx,
        () =>
          tx<{ meta_fbp: string | null; meta_fbc: string | null; meta_consent_subject: string | null }[]>`
            select meta_fbp, meta_fbc, meta_consent_subject::text as meta_consent_subject from public.bookings where id = ${B1}::uuid`,
      );
      return rows[0]!;
    });
    expect(b).toEqual({ meta_fbp: null, meta_fbc: null, meta_consent_subject: null });
  });

  it("meta_purchase_sweep returns one JS number and wipes an idle paid booking (WR-02)", async () => {
    const r = await inTx(async (tx) => {
      await asPostgres(tx, async () => {
        await tx`set local session_replication_role = replica`;
        await tx`update public.bookings set updated_at = now() - interval '2 hours' where id = ${B2}::uuid`;
        await tx`set local session_replication_role = origin`;
      });
      const swept = await tx<{ n: unknown }[]>`select public.meta_purchase_sweep() as n`;
      const again = await tx<{ n: unknown }[]>`select public.meta_purchase_sweep() as n`;
      const after = await asPostgres(
        tx,
        () =>
          tx<{ meta_fbp: string | null; state: string | null; skip_reason: string | null }[]>`
            select b.meta_fbp, e.state, e.skip_reason
              from public.bookings b left join public.meta_purchase_events e on e.booking_id = b.id
             where b.id = ${B2}::uuid`,
      );
      return { first: swept[0]!.n, again: again[0]!.n, after: after[0]! };
    });
    expect(typeof r.first).toBe("number");
    expect(r.first as number).toBeGreaterThanOrEqual(1);
    expect(r.again).toBe(0);
    expect(r.after).toEqual({ meta_fbp: null, state: "skipped", skip_reason: "interrupted" });
  });

  it("two concurrent claims for one booking: exactly one 'send', the other 'already' (IN-04)", async () => {
    const B3 = "c2905000-0000-4000-8000-000000000a03";
    const SUBJECT3 = "29a05000-0000-4000-8000-000000000003";
    const admin = workerSql(SUPER, "identity");
    const c1 = workerSql(SUPER, "identity");
    const c2 = workerSql(SUPER, "identity");
    try {
      // Committed fixtures (two real transactions cannot see a rolled-back one); removed in `finally`.
      await admin.begin(async (tx) => {
        await tx`set local session_replication_role = replica`;
        await tx`
          insert into public.consent_log (consent_subject_id, policy_version, method, necessary, functional, analytics, marketing, locale, recorded_at)
          values (${SUBJECT3}::uuid, ${POLICY}, 'accept_all', true, true, true, true, 'en', now() - interval '3 hours')`;
        await tx`
          insert into public.bookings (id, contact_name, contact_email, status, is_test, meta_fbp, meta_fbc, meta_consent_subject)
          values (${B3}::uuid, 'Claim Race', 'claim-race@example.test', 'paid', false, ${FBP}, ${null}, ${SUBJECT3}::uuid)`;
        await tx`
          insert into public.booking_payments (booking_id, snapshot_id, stripe_payment_intent_id, charged_rappen, status, captured_at)
          values (${B3}::uuid, 0, 'pi_29_05_race', 12000, 'succeeded', now() - interval '1 hour')`;
      });
      const pidRows = await admin<{ id: string }[]>`select id::text as id from public.booking_payments where booking_id = ${B3}::uuid`;
      const pid = Number(pidRows[0]!.id);

      let second: Promise<ClaimRow> | undefined;
      let secondSettled = false;
      const first = await withIdentity(
        SUPER,
        "system",
        undefined,
        async (tx1) => {
          const row = await claim(tx1, B3, pid, null);
          // The first transaction still holds the booking lock; the second must block on it.
          second = withIdentity(SUPER, "system", undefined, (tx2) => claim(tx2, B3, pid, null), { client: c2 });
          void second.then(
            () => {
              secondSettled = true;
            },
            () => {
              secondSettled = true;
            },
          );
          await new Promise((r) => setTimeout(r, 500));
          expect(secondSettled).toBe(false);
          return row;
        },
        { client: c1 },
      );
      const other = await second!;
      expect(first.decision).toBe("send");
      expect(other.decision).toBe("already");
      const rows = await admin<{ event_id: string }[]>`select event_id::text as event_id from public.meta_purchase_events where booking_id = ${B3}::uuid`;
      expect(rows).toHaveLength(1);
      expect(rows[0]!.event_id).toBe(first.event_id);
      expect(other.event_id).toBeNull();
    } finally {
      // consent_log is append-only and payments do not cascade: triggers off for this clean-up only.
      await admin
        .begin(async (tx) => {
          await tx`set local session_replication_role = replica`;
          await tx`delete from public.meta_purchase_events where booking_id = ${B3}::uuid`;
          await tx`delete from public.booking_payments where booking_id = ${B3}::uuid`;
          await tx`delete from public.bookings where id = ${B3}::uuid`;
          await tx`delete from public.consent_log where consent_subject_id = ${SUBJECT3}::uuid`;
        })
        .catch(() => {});
      await Promise.all([c1.end({ timeout: 5 }), c2.end({ timeout: 5 }), admin.end({ timeout: 5 })]);
    }
  });
});
