// apps/web/lib/ops/trip-change.local.test.ts
//
// 26.2 P6 end to end on a real local database through the REAL Worker client (asStaff / asSystem /
// asQuote, `fetch_types: false`, login `vamos_edge` then the role). The quote pipeline, the signed
// lock, P1's price step, the change functions of migration 20261007150000 and the PATCH route run
// for real; only Mapbox (retrieve, reverse, directions), Stripe and the mail sender are replaced.
// Bookings are seeded the way checkout writes them (lines from checkoutCharge, shown class totals,
// 10 m distance, coordinates and Mapbox ids) on a live price book; then:
//   dearer   a new pickup: preview (signed facts) -> confirm (request waits, trip unchanged, Stripe
//            page for the difference, the owner's D14 e-mail) -> the difference is paid (extra
//            settle) -> the new place, its id, coordinates and duration are written, the driver
//            stays and gets "trip assigned" again;
//   cheaper  a nearer destination: written at once, Refund due with the full difference;
//   time     a new time only: no price, written at once, the driver gets the time-change e-mail;
//   clash    a new time onto another trip of the driver: the preview names it; Keep (D11, D17)
//            keeps him on both and he gets the time-change e-mail; an ordinary Assign onto the kept
//            trip is still refused.
// Skipped unless VAMOS_LOCAL_DB_PORT names a DISPOSABLE local stack; rows are committed (use a scratch
// stack); synthetic rappen only. Host fixed to 127.0.0.1.
// The world (price book, drivers, seeding, the facts step with Mapbox replaced) is in
// trip-change.local-fixture.ts; the PATCH route and Take off run in trip-change-patch.local.test.ts.
import { afterAll, describe, expect, it, vi } from "vitest";
import type { VamosClaims } from "../db/identity";
import { openWorld } from "./trip-change.local-fixture";

const PORT = process.env["VAMOS_LOCAL_DB_PORT"];

const createCheckoutSession = vi.fn();
const createRefund = vi.fn();
const expireCheckoutSession = vi.fn(async (..._a: unknown[]) => ({ status: "expired" }));
const sendTripChangePay = vi.fn();
const sendConfirmation = vi.fn();
const sendChauffeurAssign = vi.fn();
const sendChauffeurUnassign = vi.fn();
const sendTimeChange = vi.fn();
const sendFlightNumber = vi.fn();
let routeEnv: CloudflareEnv | null = null;

vi.mock("../checkout/stripe", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../checkout/stripe")>();
  return {
    ...actual,
    stripeFromEnv: () => ({}),
    createCheckoutSession: (...a: unknown[]) => createCheckoutSession(...a),
    retrieveCheckoutSession: vi.fn(async () => null),
    expireCheckoutSession: (...a: unknown[]) => expireCheckoutSession(...a),
    createRefund: (...a: unknown[]) => createRefund(...a),
  };
});
vi.mock("@vamos/emails/confirmation", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@vamos/emails/confirmation")>();
  return {
    ...actual,
    sendTripChangePay: (...a: unknown[]) => sendTripChangePay(...a),
    sendConfirmation: (...a: unknown[]) => sendConfirmation(...a),
    sendChauffeurAssign: (...a: unknown[]) => sendChauffeurAssign(...a),
    sendChauffeurUnassign: (...a: unknown[]) => sendChauffeurUnassign(...a),
    sendTimeChange: (...a: unknown[]) => sendTimeChange(...a),
    sendFlightNumber: (...a: unknown[]) => sendFlightNumber(...a),
  };
});
vi.mock("@opennextjs/cloudflare", () => ({ getCloudflareContext: () => ({ env: routeEnv }) }));
vi.mock("@/lib/ops/staff-json", async () => {
  const actual = await vi.importActual<typeof import("./staff-json")>("./staff-json");
  return {
    ...actual,
    withStaff: (handler: (claims: unknown, request: Request) => Promise<Response> | Response) =>
      (request: Request) => handler(STAFF_CLAIMS, request),
  };
});

const tag = Math.random().toString(16).slice(2, 10).padEnd(8, "0");
const adminId = `${tag}-0000-4000-a000-000000000006`;
const STAFF_CLAIMS = { sub: adminId, role: "authenticated", aal: "aal2", app_metadata: { vamos_role: "admin" } } as VamosClaims;

describe.skipIf(!PORT)("place and time changes on a paid trip through the real Worker client (local, committed rows)", () => {
  let world: Awaited<ReturnType<typeof openWorld>> | null = null;
  afterAll(async () => {
    await world?.close();
  });

  it("dearer waits and is written when paid; cheaper, time only, and Keep on a clash behave as decided", { timeout: 60_000 }, async () => {
      const w = await openWorld(PORT!, tag, adminId, STAFF_CLAIMS);
      world = w;
      const { su, env, kv, claims, ECO, drivers, deps, retrieve, charged, seedBooking, leg, zug, NO, previewTripChange, confirmTripChange, afterExtraSettled, asSystem } = w;
      // --- dearer: a new pickup at Zug, driver a stays --------------------------------------------------
      const dear = await seedBooking("dear", ECO, { driver: drivers.a });
      const p1 = await previewTripChange(env, claims, dear.reference, { ...NO, pickup: zug }, deps);
      if (!p1.ok) throw new Error(`preview refused: ${JSON.stringify(p1)}`);
      const want = charged(ECO, 42_517, 3_300).chargedRappen;
      const eco = p1.classes.find((c) => c.slug === ECO)!;
      expect(eco).toMatchObject({ ok: true, current: true, newTotalRappen: want, differenceRappen: want - dear.paid });
      expect(p1.lock).toEqual(expect.any(String));
      expect(p1.pickupIsAirport).toBe(false);
      expect(p1).not.toHaveProperty("driverClash");
      const unitsAfterPreview = [...kv.values()].map(Number).reduce((a, b) => a + b, 0);
      expect(unitsAfterPreview).toBe(3);

      createCheckoutSession.mockResolvedValue({ id: `cs_p6e_${tag}`, url: `https://checkout.stripe.test/c/pay/cs_p6e_${tag}` });
      sendTripChangePay.mockResolvedValue({ ok: true, providerMessageId: "m1" });
      retrieve.mockClear();
      const c1 = await confirmTripChange(env, claims, dear.reference, {
        klass: null, expectTotalRappen: want, expectPaidRappen: p1.paidRappen,
        trip: { ...NO, pickup: { ...zug, text: "Typed elsewhere" }, lock: p1.lock! },
      }, "https://dashboard.vamostaxi.site", deps);
      expect(c1).toMatchObject({ ok: true, outcome: "extra_required", mailed: true, differenceRappen: want - dear.paid });
      // The confirm made no Mapbox call; the units stay where the preview left them.
      expect(retrieve).not.toHaveBeenCalled();
      expect([...kv.values()].map(Number).reduce((a, b) => a + b, 0)).toBe(unitsAfterPreview);
      expect(createCheckoutSession.mock.calls[0]![1]).toMatchObject({ chargedRappen: want - dear.paid, uiMode: "hosted_page" });
      expect(sendTripChangePay.mock.calls[0]![1]).toMatchObject({ changes: { pickup: "Zug station" }, newTotalRappen: want, paidRappen: dear.paid });
      expect(await leg(dear.id)).toMatchObject({ pickup_text: "Zurich Oerlikon", pickup_place_id: "mb-oerlikon", estimated_duration_minutes: 40 });
      const waiting = (await su<{ status: string; t: string; place: string; session: string }[]>`
        select status, jsonb_typeof(payload) as t, payload ->> 'pickup_place_id' as place, extra_session_id as session
          from public.booking_edit_requests where booking_id = ${dear.id}`)[0]!;
      expect(waiting).toEqual({ status: "requested", t: "object", place: "mb-zug", session: `cs_p6e_${tag}` });

      // The difference is paid: the Stripe webhook's settle, as the system role.
      const settled = await asSystem(env, async (sql) =>
        (await sql<{ applied: boolean; class_changed: boolean; unassigned_chauffeur_id: string | null; booking_id: string; request_id: string }[]>`
          select * from public.checkout_extra_payment_settle(${`evt_p6e_${tag}`}, ${`cs_p6e_${tag}`}, ${`pi_p6e_${tag}_x`}, 'succeeded',
                                                             'CHF', null, null, null::timestamptz, null)`)[0]!,
      );
      expect(settled).toMatchObject({ applied: true, class_changed: false, unassigned_chauffeur_id: null });
      expect(await leg(dear.id)).toMatchObject({
        pickup_text: "Zug station", pickup_place_id: "mb-zug", pickup_lat: "47.173700", pickup_lng: "8.515200",
        dropoff_text: "Zurich Airport", estimated_duration_minutes: 55, driver: drivers.a,
      });
      const snap = (await su<{ km: string; min: number; total: number }[]>`
        select s.distance_km::text as km, s.duration_min as min, s.total_rappen::int as total
          from public.bookings b join public.price_snapshots s on s.id = b.price_snapshot_id where b.id = ${dear.id}`)[0]!;
      expect(snap).toEqual({ km: "42.52", min: 55, total: want });
      sendConfirmation.mockResolvedValue({ ok: true, providerMessageId: "m2" });
      sendChauffeurAssign.mockResolvedValue({ ok: true, providerMessageId: "m3" });
      await afterExtraSettled(env, { booking_id: settled.booking_id, applied: true, unassigned_chauffeur_id: null, request_id: settled.request_id });
      expect(sendConfirmation).toHaveBeenCalledTimes(1);
      expect(sendChauffeurAssign).toHaveBeenCalledTimes(1);
      expect(sendChauffeurAssign.mock.calls[0]![1]).toMatchObject({ pickupText: "Zug station", dropoffText: "Zurich Airport" });
      expect(sendChauffeurAssign.mock.calls[0]![2]).toBe(`p6e-driver-a-${tag}@example.test`);

      // --- cheaper: a nearer destination -----------------------------------------------------------------
      const cheap = await seedBooking("cheap", ECO);
      const nearer = { kind: "retrieve" as const, mapbox_id: "mb-wallisellen", session_token: `tok2-${tag}`, text: "Wallisellen" };
      const p2 = await previewTripChange(env, claims, cheap.reference, { ...NO, dropoff: nearer }, deps);
      if (!p2.ok) throw new Error(`preview refused: ${JSON.stringify(p2)}`);
      const short = charged(ECO, 6_210, 660).chargedRappen;
      expect(p2.classes.find((c) => c.slug === ECO)).toMatchObject({ newTotalRappen: short });
      const c2 = await confirmTripChange(env, claims, cheap.reference, {
        klass: null, expectTotalRappen: short, expectPaidRappen: p2.paidRappen, trip: { ...NO, dropoff: nearer, lock: p2.lock! },
      }, undefined, deps);
      const due = cheap.paid - short;
      expect(c2).toMatchObject({ ok: true, outcome: "refund_due", differenceRappen: -due, confirmationSent: true });
      expect((await su<{ s: string; owed: string }[]>`select refund_status as s, refund_owed_rappen::text as owed from public.bookings where id = ${cheap.id}`)[0])
        .toEqual({ s: "pending_ops", owed: String(due) });
      expect(await leg(cheap.id)).toMatchObject({ dropoff_text: "Wallisellen", dropoff_lat: "47.414800", estimated_duration_minutes: 11 });
      expect(createRefund).not.toHaveBeenCalled();

      // --- time only: driver b stays and gets the time-change e-mail -------------------------------------
      const timed = await seedBooking("time", ECO, { driver: drivers.b });
      const p3 = await previewTripChange(env, claims, timed.reference, { ...NO, scheduledLocal: "2030-01-01T12:00" }, deps);
      if (!p3.ok) throw new Error(`preview refused: ${JSON.stringify(p3)}`);
      expect(p3.classes.find((c) => c.current)).toMatchObject({ ok: true, newTotalRappen: timed.paid, differenceRappen: 0 });
      sendTimeChange.mockResolvedValue({ ok: true, providerMessageId: "m4" });
      const c3 = await confirmTripChange(env, claims, timed.reference, {
        klass: null, expectTotalRappen: timed.paid, expectPaidRappen: p3.paidRappen, trip: { ...NO, scheduledLocal: "2030-01-01T12:00" },
      }, undefined, deps);
      expect(c3).toMatchObject({ ok: true, outcome: "applied", driverUpdated: true, confirmationSent: true });
      expect(await leg(timed.id)).toMatchObject({ scheduled_local: "2030-01-01T12:00", driver: drivers.b, pickup_text: "Zurich Oerlikon" });
      expect(sendTimeChange.mock.calls[0]![1]).toMatchObject({ scheduledLocal: "2030-01-01T12:00", outcome: "confirmed" });
      expect(sendTimeChange.mock.calls[0]![2]).toBe(`p6e-driver-b-${tag}@example.test`);
      expect((await su<{ n: number }[]>`select count(*)::int as n from public.booking_events where booking_id = ${timed.id} and kind = 'booking.modified'`)[0]!.n).toBe(1);

      // --- clash (D11, D17): driver c on two trips; moving one onto the other and keeping him ------------
      const first = await seedBooking("first", ECO, { local: "2030-01-02T10:00", driver: drivers.c });
      const other = await seedBooking("other", ECO, { local: "2030-01-02T14:00", driver: drivers.c });
      const p4 = await previewTripChange(env, claims, first.reference, { ...NO, scheduledLocal: "2030-01-02T14:10" }, deps);
      expect(p4).toMatchObject({ ok: true, driverClash: { reference: other.reference, time: "14:00" } });
      const move = { klass: null, expectTotalRappen: first.paid, expectPaidRappen: first.paid };
      expect(await confirmTripChange(env, claims, first.reference, { ...move, trip: { ...NO, scheduledLocal: "2030-01-02T14:10" } }, undefined, deps))
        .toEqual({ ok: false, code: "driver-choice-needed" });
      expect(await leg(first.id)).toMatchObject({ scheduled_local: "2030-01-02T10:00", driver: drivers.c });
      sendTimeChange.mockResolvedValue({ ok: true, providerMessageId: "m5" });
      const kept = await confirmTripChange(env, claims, first.reference, { ...move, trip: { ...NO, scheduledLocal: "2030-01-02T14:10", driver: "keep" } }, undefined, deps);
      expect(kept).toMatchObject({ ok: true, outcome: "applied", driverTakenOff: false, driverUpdated: true });
      expect(await leg(first.id)).toMatchObject({ scheduled_local: "2030-01-02T14:10", driver: drivers.c });
      expect(await leg(other.id)).toMatchObject({ driver: drivers.c });
      expect((await su<{ kept: boolean }[]>`select overlap_kept_range = scheduled_range as kept from public.booking_legs where booking_id = ${first.id}`)[0]!.kept).toBe(true);
      expect(sendTimeChange.mock.calls.at(-1)![2]).toBe(`p6e-driver-c-${tag}@example.test`);

      // An ordinary Assign of another trip onto the kept trip's window is still refused (D17).
      const { assignBooking } = await import("./assign");
      const justAfter = (await su<{ local: string }[]>`
        select to_char((upper(scheduled_range) + interval '1 minute') at time zone 'Europe/Zurich', 'YYYY-MM-DD"T"HH24:MI') as local
          from public.booking_legs where booking_id = ${other.id}`)[0]!.local;
      const intruder = await seedBooking("intruder", ECO, { local: justAfter });
      expect(await assignBooking(env, claims, intruder.reference, drivers.c!)).toMatchObject({ ok: false, code: "overlap" });
      expect(await leg(intruder.id)).toMatchObject({ driver: null });
  });
});
