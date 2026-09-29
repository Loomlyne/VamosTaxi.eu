// apps/web/lib/db/system-reads.local.test.ts
//
// Quick 260929-pga. End to end on a real local database: every function behind a Worker job that
// used to read or write tables as vamos_system is called through the REAL asSystem (login
// `vamos_edge`, then the vamos_system role, the client options the Worker uses), plus the
// 24 h reminder job itself. Skipped unless VAMOS_LOCAL_DB_PORT names a DISPOSABLE local stack:
// the fixture is COMMITTED (a private stack, e.g. `supabase start --workdir` with shifted ports;
// `pnpm db:reset` clears it). Host is fixed to 127.0.0.1.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import postgres from "postgres";
import { describe, expect, it } from "vitest";
import {
  loadCapturedPaymentRow,
  loadEditBookingContact,
  loadEditExtraSession,
  loadEditPendingPayload,
  loadEditSnapshotTotal,
  loadExpiredBookingContact,
  loadManageReviewState,
  loadMustFixTrip,
  loadPaidCancelMail,
  loadPhoneBookingUnpaid,
  loadPriceChangedUnpaidContacts,
  loadTripForMail,
  markRefundProcessing,
  supersedePendingEditRequest,
  writeFlightNumber,
} from "./system-reads";
import { runReminder24h } from "../lifecycle/reminder";

const PORT = process.env["VAMOS_LOCAL_DB_PORT"];
const REPO = join(__dirname, "..", "..", "..", "..");

describe.skipIf(!PORT)("system-role reads through the real asSystem (local, committed fixture)", () => {
  it("every narrow function answers as vamos_system and the reminder job selects the leg", async () => {
    const env = {
      HYPERDRIVE_NOCACHE: { connectionString: `postgres://vamos_edge:vamos_edge@127.0.0.1:${PORT}/postgres` },
    } as unknown as CloudflareEnv;
    const su = postgres(`postgres://postgres:postgres@127.0.0.1:${PORT}/postgres`, { max: 1, onnotice: () => undefined });
    try {
      // Unique names so the committed fixture can be loaded more than once on the same stack.
      const tag = `e${Math.random().toString(36).slice(2, 8)}`;
      const uuid = (n: number) => `${tag.replace(/[^0-9a-f]/g, "0").padEnd(8, "0").slice(0, 8)}-0000-4000-8000-${String(n).padStart(12, "0")}`;
      let fixture = readFileSync(join(REPO, "packages/db/test/local/fixtures/worker-arrays.sql"), "utf8")
        .replaceAll("pga-", `${tag}-`)
        .replaceAll("cs_pga_", `cs_${tag}_`);
      for (let n = 1; n <= 4; n += 1) {
        fixture = fixture.replaceAll(`50000000-0000-4000-8000-00000000000${n}`, uuid(n + 0));
      }
      for (let n = 1; n <= 4; n += 1) {
        fixture = fixture.replaceAll(`decode(repeat('c${n}',32),'hex')`, `decode(md5('${tag}${n}') || md5('${tag}${n}'),'hex')`);
      }
      await su.begin(async (tx) => {
        // One live rate version at a time: retire the previous run's fixture version.
        await tx`update public.rate_versions set status = 'retired' where status = 'live' and slug like 'e%-rv'`;
        await tx.unsafe(fixture);
      });

      const [a] = await su<{ id: string; reference: string; snap: string }[]>`
        select b.id, b.reference, b.price_snapshot_id::text as snap from public.bookings b
         where b.contact_email = ${`${tag}-a@example.test`}`;
      const [settle] = await su<{ id: string; reference: string }[]>`
        select id, reference from public.bookings where contact_email = ${`${tag}-settle@example.test`}`;
      expect(a && settle).toBeTruthy();

      // reads, unpaid booking
      const mail = await loadPaidCancelMail(env, a!.id);
      expect(mail?.reference).toBe(a!.reference);
      expect(await loadCapturedPaymentRow(env, a!.id)).toBeNull();
      const pending = await loadPriceChangedUnpaidContacts(env);
      expect(pending.some((r) => r.contact_email === `${tag}-a@example.test`)).toBe(true);
      const expired = await loadExpiredBookingContact(env, a!.id);
      expect(expired?.contact_email).toBe(`${tag}-a@example.test`);
      expect((await loadMustFixTrip(env, a!.reference))?.reference).toBe(a!.reference);
      expect((await loadMustFixTrip(env, a!.id))?.reference).toBe(a!.reference);
      const phone = await loadPhoneBookingUnpaid(env, a!.reference);
      expect(phone?.status).toBe("pending");
      expect(phone?.stripe_checkout_session_id).toMatch(/^cs_/);
      expect((await loadManageReviewState(env, a!.id))?.review_submitted).toBe(false);
      expect(await loadEditSnapshotTotal(env, a!.snap)).toBe(6);
      expect((await loadEditBookingContact(env, a!.id))?.reference).toBe(a!.reference);
      expect((await loadTripForMail(env, a!.id))?.reference).toBe(a!.reference);

      // captured payment on another booking
      await su.begin(async (tx) => {
        await tx`set local session_replication_role = replica`;
        await tx`update public.booking_payments set status = 'succeeded', captured_at = now()
         where id = (select min(id) from public.booking_payments where booking_id = ${settle!.id})`;
      });
      expect((await loadCapturedPaymentRow(env, settle!.id))?.charged_rappen).toBe(6);

      // writes
      await markRefundProcessing(env, settle!.id);
      const [rs] = await su<{ refund_status: string }[]>`select refund_status from public.bookings where id = ${settle!.id}`;
      expect(rs?.refund_status).toBe("processing");

      await su`
        insert into public.booking_edit_requests (booking_id, actor, quote_snapshot_id, status, extra_session_id, payload)
        values (${a!.id}, 'customer', ${a!.snap}::bigint, 'requested', ${`cs_${tag}_x`}, '{"scheduled_local":"2031-01-01T10:00"}'::jsonb)`;
      expect(await loadEditPendingPayload(env, a!.reference)).toMatchObject({ scheduled_local: "2031-01-01T10:00" });
      expect((await loadEditExtraSession(env, a!.reference))?.extra_session_id).toBe(`cs_${tag}_x`);
      const trip = await writeFlightNumber(env, { bookingId: a!.id, flightNo: "LX 318", actorKind: "guest", actorId: null });
      expect(trip?.reference).toBe(a!.reference);
      const [leg] = await su<{ flight_no: string }[]>`select flight_no from public.booking_legs where booking_id = ${a!.id}`;
      expect(leg?.flight_no).toBe("LX 318");
      const done = await supersedePendingEditRequest(env, a!.reference);
      expect(done?.booking_id).toBe(a!.id);
      expect(await supersedePendingEditRequest(env, a!.reference)).toBeNull();

      // the reminder job itself (its window is scheduledAt + 24 h .. + 25 h)
      const [lg] = await su<{ at: Date }[]>`select original_scheduled_at as at from public.booking_legs where booking_id = ${a!.id}`;
      const res = await runReminder24h(env, new Date(lg!.at.getTime() - 24.5 * 3600_000));
      expect(res.selected).toBeGreaterThanOrEqual(1);
    } finally {
      await su.end({ timeout: 5 });
    }
  });
});
