// apps/web/lib/ops/trip-change-patch.local.test.ts
//
// 26.2 P6 end to end on a real local database through the REAL Worker client, second file (the
// first is trip-change.local.test.ts; one long run used up the local stack's connection slots):
//   take off  a new time onto another trip of the driver with "Take off": written, the driver is
//             off the trip and gets "trip taken off";
//   PATCH     the route refuses a paid trip's places (use-change) and writes nothing; name, phone,
//             note and flight are saved at once through the definer function, recorded in one
//             booking.modified event, and the driver gets the flight-number e-mail.
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

describe.skipIf(!PORT)("take off and the PATCH route on a paid trip through the real Worker client (local, committed rows)", () => {
  let world: Awaited<ReturnType<typeof openWorld>> | null = null;
  afterAll(async () => {
    await world?.close();
  });

  it("take off works; the PATCH route refuses places and saves the contact", { timeout: 60_000 }, async () => {
      const w = await openWorld(PORT!, tag, adminId, STAFF_CLAIMS);
      world = w;
      routeEnv = w.env;
      const { su, drivers, deps, seedBooking, leg, NO, confirmTripChange } = w;
      const { PATCH } = await import("../../app/[locale]/(ops)/api/staff/bookings/[id]/route");
      const claims = w.claims;
      const env = w.env;
      const ECO = w.ECO;

      // Take off still works (another pair, driver b).
      const tFirst = await seedBooking("tfirst", ECO, { local: "2030-01-05T10:00", driver: drivers.b });
      await seedBooking("tother", ECO, { local: "2030-01-05T14:00", driver: drivers.b });
      sendChauffeurUnassign.mockResolvedValue({ ok: true, providerMessageId: "m6" });
      const off = await confirmTripChange(env, claims, tFirst.reference, {
        klass: null, expectTotalRappen: tFirst.paid, expectPaidRappen: tFirst.paid, trip: { ...NO, scheduledLocal: "2030-01-05T14:10", driver: "unassign" },
      }, undefined, deps);
      expect(off).toMatchObject({ ok: true, outcome: "applied", driverTakenOff: true });
      expect(await leg(tFirst.id)).toMatchObject({ scheduled_local: "2030-01-05T14:10", driver: null });
      expect(sendChauffeurUnassign.mock.calls.at(-1)![2]).toBe(`p6e-driver-b-${tag}@example.test`);

      // --- PATCH: places refused on a paid trip; contact saved and recorded --------------------------------
      const patched = await seedBooking("patch", ECO, { local: "2030-01-03T10:00", driver: drivers.a });
      const call = (body: unknown) =>
        (PATCH as unknown as (r: Request) => Promise<Response>)(
          new Request(`https://dashboard.vamostaxi.site/api/staff/bookings/${patched.reference}`, { method: "PATCH", body: JSON.stringify(body) }),
        );
      const refused = await call({ phone: "+41 79 111 22 33", pickup: "" });
      expect(refused.status).toBe(400);
      expect(await refused.json()).toMatchObject({ ok: false, code: "use-change" });
      expect((await su<{ phone: string }[]>`select contact_phone as phone from public.bookings where id = ${patched.id}`)[0]!.phone).toBe("+41 79 000 00 06");
      sendFlightNumber.mockResolvedValue({ ok: true, providerMessageId: "m6" });
      const saved = await call({ customer: "", phone: "+41 79 111 22 33", note: "Gate B", flight: "lx 320" });
      expect(saved.status).toBe(200);
      expect(await saved.json()).toMatchObject({ ok: true, data: { changed: ["contact_phone", "note", "flight_no"], driverMailed: true } });
      const after = (await su<{ name: string; phone: string; note: string; flight: string; pickup: string; pax: number }[]>`
        select b.contact_name as name, b.contact_phone as phone, b.note, l.flight_no as flight, l.pickup_text as pickup, l.pax
          from public.bookings b join public.booking_legs l on l.booking_id = b.id where b.id = ${patched.id}`)[0]!;
      expect(after).toEqual({ name: "P6E patch", phone: "+41 79 111 22 33", note: "Gate B", flight: "LX 320", pickup: "Zurich Oerlikon", pax: 2 });
      const event = (await su<{ fields: unknown; actor: string }[]>`
        select payload -> 'fields' as fields, actor_kind as actor from public.booking_events
         where booking_id = ${patched.id} and kind = 'booking.modified'`)[0]!;
      expect(event).toEqual({ fields: ["contact_phone", "note", "flight_no"], actor: "staff" });
      expect(sendFlightNumber.mock.calls[0]![2]).toBe(`p6e-driver-a-${tag}@example.test`);
  });
});
