// apps/web/lib/ops/settle-safety.local.test.ts
//
// 261002 settle safety (migration 20261007200000) on a real local database through the REAL Worker
// client (asSystem: `fetch_types: false`, login `vamos_edge`, then the role). Only Mapbox, Stripe and the
// mail sender are replaced.
//   P-1 lock order   A second real connection takes the booking row and then the change request, in the
//                    order a customer's request takes them (booking_edit_request_upsert), while the
//                    difference settle (and, separately, the dashboard's Accept) runs. Before this job
//                    those two took the request first: the database broke the cycle with a deadlock
//                    (40P01), and the settle's error was acknowledged, so a captured difference was never
//                    recorded. Now both take the booking first: the settle waits, then records and applies.
//   P-2 cancel       A dearer change waits for its difference; the customer cancels. The cancel ends the
//                    change and names its Stripe page for the Worker to close; a payment that still lands
//                    is recorded, never applied, and is Refund due on the cancelled booking.
// Skipped unless VAMOS_LOCAL_DB_PORT names a DISPOSABLE local stack; rows are committed (use a scratch
// stack); synthetic rappen only. Host fixed to 127.0.0.1. The world is trip-change.local-fixture.ts.
// Test-only raw client for the second connection; named in scripts/db-access-fence-allowlist.json.
// eslint-disable-next-line @typescript-eslint/no-restricted-imports
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { VamosClaims } from "../db/identity";
import { openWorld } from "./trip-change.local-fixture";

const PORT = process.env["VAMOS_LOCAL_DB_PORT"];

const createCheckoutSession = vi.fn();
const expireCheckoutSession = vi.fn(async (..._a: unknown[]) => ({ status: "expired" }));
const retrieveCheckoutSession = vi.fn(async (..._a: unknown[]): Promise<unknown> => null);
const sendTripChangePay = vi.fn(async () => ({ ok: true, providerMessageId: "m" }));

vi.mock("../checkout/stripe", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../checkout/stripe")>();
  return {
    ...actual,
    stripeFromEnv: () => ({}),
    createCheckoutSession: (...a: unknown[]) => createCheckoutSession(...a),
    retrieveCheckoutSession: (...a: unknown[]) => retrieveCheckoutSession(...a),
    expireCheckoutSession: (...a: unknown[]) => expireCheckoutSession(...a),
    createRefund: vi.fn(),
  };
});
vi.mock("@vamos/emails/confirmation", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@vamos/emails/confirmation")>();
  return {
    ...actual,
    sendTripChangePay: (...a: unknown[]) => sendTripChangePay(...(a as [])),
    sendConfirmation: vi.fn(async () => ({ ok: true, providerMessageId: "m" })),
    sendChauffeurAssign: vi.fn(async () => ({ ok: true, providerMessageId: "m" })),
    sendChauffeurUnassign: vi.fn(async () => ({ ok: true, providerMessageId: "m" })),
    sendTimeChange: vi.fn(async () => ({ ok: true, providerMessageId: "m" })),
    sendOpsMustFix: vi.fn(async () => ({ ok: true, providerMessageId: "m" })),
  };
});

const tag = Math.random().toString(16).slice(2, 10).padEnd(8, "0");
const adminId = `${tag}-0000-4000-a000-00000000005a`;
const STAFF_CLAIMS = { sub: adminId, role: "authenticated", aal: "aal2", app_metadata: { vamos_role: "admin" } } as VamosClaims;

type Settled = { applied: boolean; already_settled: boolean; booking_id: string; request_id: string | null };

function sqlStateOf(err: unknown): string | null {
  return err && typeof err === "object" && "code" in err ? String((err as { code: unknown }).code) : null;
}

describe.skipIf(!PORT)("difference settle safety through the real Worker client (local, committed rows)", () => {
  let world: Awaited<ReturnType<typeof openWorld>> | null = null;
  // The second connection: the customer's request side, holding the booking and then the request.
  let other: postgres.Sql | null = null;

  beforeAll(async () => {
    world = await openWorld(PORT!, tag, adminId, STAFF_CLAIMS);
    other = postgres(`postgres://postgres:postgres@127.0.0.1:${PORT}/postgres`, { max: 1, onnotice: () => undefined });
  }, 60_000);

  afterAll(async () => {
    await other?.end({ timeout: 5 });
    await world?.close();
  });

  /** A dearer staff change (new pickup at Zug) waiting for its difference, with its Stripe page stored. */
  async function waitingChange(key: string) {
    const w = world!;
    const { env, claims, ECO, deps, charged, seedBooking, zug, NO, previewTripChange, confirmTripChange } = w;
    const booking = await seedBooking(key, ECO);
    const preview = await previewTripChange(env, claims, booking.reference, { ...NO, pickup: zug }, deps);
    if (!preview.ok) throw new Error(`preview refused: ${JSON.stringify(preview)}`);
    const want = charged(ECO, 42_517, 3_300).chargedRappen;
    const page = `cs_ss_${tag}_${key}`;
    createCheckoutSession.mockResolvedValueOnce({ id: page, url: `https://checkout.stripe.test/c/pay/${page}` });
    const confirmed = await confirmTripChange(env, claims, booking.reference, {
      klass: null, expectTotalRappen: want, expectPaidRappen: preview.paidRappen,
      trip: { ...NO, pickup: zug, lock: preview.lock! },
    }, "https://dashboard.vamostaxi.site", deps);
    expect(confirmed).toMatchObject({ ok: true, outcome: "extra_required", differenceRappen: want - booking.paid });
    const request = (await w.su<{ id: string }[]>`
      select id from public.booking_edit_requests where booking_id = ${booking.id} and status = 'requested'`)[0]!;
    return { booking, page, requestId: request.id, difference: want - booking.paid };
  }

  /** Until the given call is waiting on a row lock in another backend. */
  async function untilWaiting(fn: string) {
    const deadline = Date.now() + 5_000;
    while (Date.now() < deadline) {
      const rows = await world!.su<{ n: number }[]>`
        select count(*)::int as n from pg_stat_activity
         where wait_event_type = 'Lock' and query ilike ${`%${fn}%`} and pid <> pg_backend_pid()`;
      if (rows[0]!.n > 0) return;
      await new Promise((r) => setTimeout(r, 25));
    }
    throw new Error(`${fn} never waited on a lock`);
  }

  /**
   * The customer side holds the booking, the call starts and waits, then the customer side asks for the
   * request row. Returns what each side saw. Before this job the call held the request already: deadlock.
   */
  async function collide<T>(bookingId: string, requestId: string, fn: string, call: () => Promise<T>) {
    let callResult: T | null = null;
    let callError: unknown = null;
    let sideError: unknown = null;
    let running: Promise<void> | null = null;
    try {
      await other!.begin(async (tx) => {
        await tx`set local lock_timeout = '8s'`;
        await tx`select id from public.bookings where id = ${bookingId} for update`;
        running = call().then((r) => { callResult = r; }, (e) => { callError = e; });
        await untilWaiting(fn);
        await tx`select id from public.booking_edit_requests where id = ${requestId} for update`;
      });
    } catch (err) {
      sideError = err;
    }
    await running;
    return { callResult: callResult as T | null, callError, sideError };
  }

  it("P-1: the difference settle waits for the booking instead of deadlocking with a customer request, then records and applies", { timeout: 60_000 }, async () => {
    const w = world!;
    const { su, env, asSystem, leg } = w;
    const { booking, page, requestId } = await waitingChange("lock");
    const seen = await collide(booking.id, requestId, "checkout_extra_payment_settle", () =>
      asSystem(env, async (sql) =>
        (await sql<Settled[]>`
          select * from public.checkout_extra_payment_settle(${`evt_ss_${tag}_lock`}, ${page}, ${`pi_ss_${tag}_lock`}, 'succeeded',
                                                             'CHF', null, null, null::timestamptz, null)`)[0]!),
    );
    expect({ call: sqlStateOf(seen.callError), side: sqlStateOf(seen.sideError) }).toEqual({ call: null, side: null });
    expect(seen.callResult).toMatchObject({ applied: true, already_settled: false, request_id: requestId });
    expect(await leg(booking.id)).toMatchObject({ pickup_text: "Zug station", pickup_place_id: "mb-zug" });
    const paid = await su<{ n: number }[]>`
      select count(*)::int as n from public.booking_payments where booking_id = ${booking.id} and stripe_checkout_session_id = ${page} and status = 'succeeded'`;
    expect(paid[0]!.n).toBe(1);
  });

  it("P-1: the dashboard's Accept of a customer request waits for the booking instead of deadlocking with a new customer request", { timeout: 60_000 }, async () => {
    const w = world!;
    const { su, env, asSystem, ECO, seedBooking } = w;
    const booking = await seedBooking("accept", ECO);
    const bound = (await su<{ id: string }[]>`select price_snapshot_id::text as id from public.bookings where id = ${booking.id}`)[0]!.id;
    // The customer's own time request, through the real upsert (priced at the booking's own total).
    const asked = await asSystem(env, async (sql) =>
      (await sql<{ request_id: string }[]>`
        select * from public.booking_edit_request_upsert(
          ${booking.id}::uuid, 'customer', null,
          ${sql.json({ scheduled_local: "2030-01-01T11:00", scheduled_at: "2030-01-01T10:00:00.000Z" })},
          ${bound}::bigint)`)[0]!);
    const seen = await collide(booking.id, asked.request_id, "booking_edit_request_accept", () =>
      asSystem(env, async (sql) =>
        (await sql<{ outcome: string }[]>`select * from public.booking_edit_request_accept(${asked.request_id}::uuid, ${adminId}::uuid)`)[0]!),
    );
    expect({ call: sqlStateOf(seen.callError), side: sqlStateOf(seen.sideError) }).toEqual({ call: null, side: null });
    expect(seen.callResult).toMatchObject({ outcome: "applied" });
    const status = await su<{ status: string }[]>`select status from public.booking_edit_requests where id = ${asked.request_id}`;
    expect(status[0]!.status).toBe("accepted");
  });

  it("P-2: a cancel ends the waiting change and names its page; a difference paid after it is Refund due, never applied", { timeout: 60_000 }, async () => {
    const w = world!;
    const { su, env, asSystem, leg } = w;
    const { booking, page, requestId, difference } = await waitingChange("cancel");

    const cancelled = await asSystem(env, async (sql) =>
      (await sql<{ booking_id: string; refund_mode: string }[]>`select * from public.customer_paid_cancel(${booking.id}::uuid)`)[0]!);
    expect(cancelled.refund_mode).toBe("auto_full");
    const ended = await su<{ status: string }[]>`select status from public.booking_edit_requests where id = ${requestId}`;
    expect(ended[0]!.status).toBe("superseded");
    const pages = await asSystem(env, async (sql) =>
      sql<{ extra_session_id: string }[]>`select * from public.booking_cancel_change_pages(${booking.id}::uuid)`);
    expect(pages.map((p) => p.extra_session_id)).toEqual([page]);

    const settled = await asSystem(env, async (sql) =>
      (await sql<Settled[]>`
        select * from public.checkout_extra_payment_settle(${`evt_ss_${tag}_cancel`}, ${page}, ${`pi_ss_${tag}_cancel`}, 'succeeded',
                                                           'CHF', null, null, null::timestamptz, null)`)[0]!);
    expect(settled).toMatchObject({ applied: false, already_settled: false, request_id: requestId });
    expect(await leg(booking.id)).toMatchObject({ pickup_text: "Zurich Oerlikon", pickup_place_id: "mb-oerlikon" });
    const money = await su<{ status: string; refund_status: string; owed: number }[]>`
      select status::text as status, refund_status, refund_owed_rappen::int as owed from public.bookings where id = ${booking.id}`;
    // Cancelled more than 24 h ahead: the whole amount was due; the difference paid after the cancel is added.
    expect(money[0]).toEqual({ status: "cancelled", refund_status: "pending_ops", owed: booking.paid + difference });
    const recorded = await su<{ n: number }[]>`
      select count(*)::int as n from public.booking_payments where booking_id = ${booking.id} and stripe_checkout_session_id = ${page} and captured_at is not null`;
    expect(recorded[0]!.n).toBe(1);
    // The page is no longer listed once its payment is recorded.
    const after = await asSystem(env, async (sql) =>
      sql<{ extra_session_id: string }[]>`select * from public.booking_cancel_change_pages(${booking.id}::uuid)`);
    expect(after).toHaveLength(0);
  });
});
