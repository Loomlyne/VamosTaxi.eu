// apps/web/lib/ops/customer-request-staff-waiting.local.test.ts
//
// 26.2 P6 follow-up (quick 261002-p6-followups, migration 20261007190000) on a real local database through
// the REAL Worker client (asGuest with a manage token, asCustomer with the signed-in owner's claims, asStaff,
// asSystem; `fetch_types: false`, login `vamos_edge`). Only Mapbox, Stripe and the mail sender are replaced.
//   item 4   the owner confirms a dearer change on a paid trip (the request waits for the difference, its
//            Stripe page stubbed); the customer's time request, from the manage link and signed in, is
//            refused with "staff-change-waiting" (the route answers 409), the staff request stays
//            "requested" with its Stripe page id and nothing is written (no customer row, no price record
//            cloned). Once the difference's price record has expired the same request is accepted and the
//            staff request ends "superseded".
//   item 2   PATCH /api/staff/bookings/:id with a party is refused ("use-change") and writes nothing; the
//            trip change's price step marks Van luxury (12 seats) too small at 13 travellers and not at 12.
//   item 1   a paid Van luxury booking of 10 travellers reads 10 on both customer reads the booking
//            pages use (the manage link's read and the signed-in list's read): no cap in the way.
// Skipped unless VAMOS_LOCAL_DB_PORT names a DISPOSABLE local stack (login roles vamos_edge / vamos_public
// with their local password); rows are committed (use a scratch stack); synthetic rappen only. Host fixed
// to 127.0.0.1. The world (price book, drivers, seeding, the facts step) is in trip-change.local-fixture.ts;
// the Van luxury class is added to its live price book here (the frozen-row trigger is skipped for that one
// insert, as the fixture's own snapshot seeding skips others).
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { VamosClaims } from "../db/identity";
import { openWorld } from "./trip-change.local-fixture";

const PORT = process.env["VAMOS_LOCAL_DB_PORT"];

const createCheckoutSession = vi.fn();
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
    createRefund: vi.fn(),
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
// The manage route reads the cookie jar of a Next request; this file calls the handlers directly.
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }) }));
vi.mock("@/lib/ops/staff-json", async () => {
  const actual = await vi.importActual<typeof import("./staff-json")>("./staff-json");
  return {
    ...actual,
    withStaff: (handler: (claims: unknown, request: Request) => Promise<Response> | Response) =>
      (request: Request) => handler(STAFF_CLAIMS, request),
  };
});

const tag = Math.random().toString(16).slice(2, 10).padEnd(8, "0");
const adminId = `${tag}-0000-4000-a000-000000000019`;
const STAFF_CLAIMS = { sub: adminId, role: "authenticated", aal: "aal2", app_metadata: { vamos_role: "admin" } } as VamosClaims;

describe.skipIf(!PORT)("a customer's time request vs a staff change waiting for payment, and the seat checks (local, committed rows)", () => {
  let world: Awaited<ReturnType<typeof openWorld>> | null = null;
  let VAN = "";
  let guest: { kind: "guest"; manageTokenHashHex: string };
  let owner: { kind: "customer"; claims: VamosClaims };
  let rawToken = "";
  let ownerEmail = "";
  let dearId = "";
  let dearRef = "";
  let dearPaid = 0;

  afterAll(async () => {
    await world?.close();
  });

  beforeAll(async () => {
    const w = await openWorld(PORT!, tag, adminId, STAFF_CLAIMS);
    world = w;
    // The write limiter is a Workers binding (an outside service): a stand-in that lets the call through.
    routeEnv = { ...w.env, QUOTE_RATE_LIMITER_BARE: { limit: async () => ({ success: true }) } } as unknown as CloudflareEnv;
    const { su } = w;
    // Van luxury, 12 seats, in the fixture's live price book (live has 12; the fixture has only 4 and 7).
    VAN = `p6e-van-${tag}`;
    await su.begin(async (tx) => {
      await tx`insert into public.vehicle_classes (slug, passenger_capacity, luggage_capacity, sort_order, name)
               values (${VAN}, 12, 12, 3, 'Van luxury')`;
      await tx`set local session_replication_role = replica`;
      await tx`insert into public.distance_rates (rate_version_id, vehicle_class_id, max_pax, base_fare_rappen, per_km_rappen, min_fare_rappen)
               select rv.id, vc.id, 12, 1500, 500, null
                 from public.rate_versions rv cross join public.vehicle_classes vc
                where rv.slug = ${`p6e-${tag}`} and vc.slug = ${VAN}`;
    });
  }, 60_000);

  it("item 4: a dearer staff change waits; the customer's time request is refused from the manage link and signed in, and nothing is written", { timeout: 60_000 }, async () => {
    const w = world!;
    const { su, env, claims, ECO, deps, charged, seedBooking, zug, NO, previewTripChange, confirmTripChange } = w;
    const { requestCustomerTimeChange } = await import("./edit-request");
    const { hashManageToken } = await import("../checkout/manage-token");

    const dear = await seedBooking("dear", ECO, { local: "2030-01-08T10:00" });
    dearId = dear.id;
    dearRef = dear.reference;
    dearPaid = dear.paid;

    // The customer's two doors: the manage link, and the signed-in owner (a real account seen by the address).
    rawToken = `tok-${tag}-crw-manage-link-0123456789`;
    const hex = await hashManageToken(rawToken);
    await su`insert into public.booking_access_tokens (booking_id, token_hash, expires_at, purpose)
             values (${dear.id}, decode(${hex}, 'hex'), now() + interval '30 days', 'manage')`;
    guest = { kind: "guest", manageTokenHashHex: hex };
    const ownerId = `${tag}-0000-4000-a000-0000000000c2`;
    ownerEmail = `p6e-${tag}-dear@example.test`;
    await su`insert into auth.users (id, email, aud, role, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
             values (${ownerId}, ${ownerEmail}, 'authenticated', 'authenticated', '{}'::jsonb, '{}'::jsonb, now(), now())`;
    owner = { kind: "customer", claims: { sub: ownerId, email: ownerEmail, role: "authenticated" } as VamosClaims };

    // The owner confirms a dearer change (a new pickup at Zug): the request waits for the difference.
    const p1 = await previewTripChange(env, claims, dear.reference, { ...NO, pickup: zug }, deps);
    if (!p1.ok) throw new Error(`preview refused: ${JSON.stringify(p1)}`);
    const want = charged(ECO, 42_517, 3_300).chargedRappen;
    createCheckoutSession.mockResolvedValue({ id: `cs_crw_${tag}`, url: `https://checkout.stripe.test/c/pay/cs_crw_${tag}` });
    sendTripChangePay.mockResolvedValue({ ok: true, providerMessageId: "crw1" });
    const c1 = await confirmTripChange(env, claims, dear.reference, {
      klass: null, expectTotalRappen: want, expectPaidRappen: p1.paidRappen,
      trip: { ...NO, pickup: { ...zug, text: "Typed elsewhere" }, lock: p1.lock! },
    }, "https://dashboard.vamostaxi.site", deps);
    expect(c1).toMatchObject({ ok: true, outcome: "extra_required", mailed: true, differenceRappen: want - dear.paid });

    const staffRow = async () =>
      (await su<{ id: string; status: string; actor: string; session: string | null; alive: boolean }[]>`
        select r.id::text as id, r.status, r.actor, r.extra_session_id as session, x.expires_at > now() as alive
          from public.booking_edit_requests r join public.price_snapshots x on x.id = r.extra_snapshot_id
         where r.booking_id = ${dear.id} and r.actor = 'staff'`)[0]!;
    const before = await staffRow();
    expect(before).toMatchObject({ status: "requested", actor: "staff", session: `cs_crw_${tag}`, alive: true });
    const counts = async () =>
      (await su<{ requests: number; snapshots: number; events: number }[]>`
        select (select count(*)::int from public.booking_edit_requests where booking_id = ${dear.id}) as requests,
               (select count(*)::int from public.price_snapshots where booking_id = ${dear.id}) as snapshots,
               (select count(*)::int from public.booking_events where booking_id = ${dear.id}) as events`)[0]!;
    const countsBefore = await counts();
    expect(countsBefore.requests).toBe(1);

    // From the manage link and signed in: refused by name; the database wrote nothing.
    expect(await requestCustomerTimeChange(env, guest, dear.reference, { scheduledLocal: "2030-01-08T11:00" }))
      .toEqual({ ok: false, code: "staff-change-waiting" });
    expect(await requestCustomerTimeChange(env, owner, dear.reference, { scheduledLocal: "2030-01-08T12:00" }))
      .toEqual({ ok: false, code: "staff-change-waiting" });
    expect(await staffRow()).toEqual(before);
    expect(await counts()).toEqual(countsBefore);
    expect(await su`select 1 from public.booking_edit_requests where booking_id = ${dear.id} and actor = 'customer'`).toHaveLength(0);
    expect(createCheckoutSession).toHaveBeenCalledTimes(1);
    expect(expireCheckoutSession).not.toHaveBeenCalled();

    // The route the manage page calls answers 409 with the name.
    const { POST } = await import("../../app/api/manage/time-change/route");
    const asked = await POST(new Request("https://vamostaxi.site/api/manage/time-change", {
      method: "POST",
      headers: { "content-type": "application/json", origin: "https://vamostaxi.site" },
      body: JSON.stringify({ token: rawToken, ref: dear.reference, scheduled_local: "2030-01-08T11:00" }),
    }));
    expect(asked.status).toBe(409);
    expect(await asked.json()).toEqual({ ok: false, code: "staff-change-waiting" });
    expect(await counts()).toEqual(countsBefore);
  });

  it("item 4: once the difference's price record has expired the same request is accepted and the staff request ends superseded", { timeout: 60_000 }, async () => {
    const { su, env } = world!;
    const { requestCustomerTimeChange } = await import("./edit-request");
    // price_snapshots is append-only: the update is made with triggers off (replica role), on this scratch stack only.
    await su.begin(async (tx) => {
      await tx`set local session_replication_role = replica`;
      await tx`update public.price_snapshots
                  set expires_at = now() - interval '1 minute', quote_lock_expires_at = now() - interval '1 minute'
                where id = (select extra_snapshot_id from public.booking_edit_requests
                             where booking_id = ${dearId} and actor = 'staff' and status = 'requested')`;
    });
    expect(await requestCustomerTimeChange(env, guest, dearRef, { scheduledLocal: "2030-01-08T11:00" }))
      .toMatchObject({ ok: true, status: "requested", bookingId: dearId });
    const mid = await su<{ actor: string; status: string; local: string | null }[]>`
      select actor, status, payload ->> 'scheduled_local' as local from public.booking_edit_requests
       where booking_id = ${dearId} order by created_at, actor`;
    expect(mid).toEqual(expect.arrayContaining([
      { actor: "staff", status: "superseded", local: null },
      { actor: "customer", status: "requested", local: "2030-01-08T11:00" },
    ]));
    expect(mid).toHaveLength(2);
    // The signed-in door asks again: a customer request replaces a customer request, as before.
    expect(await requestCustomerTimeChange(env, owner, dearRef, { scheduledLocal: "2030-01-08T12:00" }))
      .toMatchObject({ ok: true, status: "requested" });
    const end = await su<{ actor: string; status: string }[]>`
      select actor, status from public.booking_edit_requests where booking_id = ${dearId} order by created_at, actor`;
    expect(end.filter((r) => r.status === "requested")).toEqual([{ actor: "customer", status: "requested" }]);
    expect(end.filter((r) => r.status === "superseded")).toHaveLength(2);
    // The booking itself was never touched by any of it.
    expect((await su<{ local: string; paid: number }[]>`
      select l.scheduled_local as local, s.total_rappen::int as paid
        from public.booking_legs l join public.bookings b on b.id = l.booking_id join public.price_snapshots s on s.id = b.price_snapshot_id
       where b.id = ${dearId}`)[0]).toEqual({ local: "2030-01-08T10:00", paid: dearPaid });
  });

  it("item 2: PATCH refuses a party and writes nothing; the price step marks a class too small at seats + 1 (Van luxury 12) and not at 12", { timeout: 60_000 }, async () => {
    const w = world!;
    const { su, env, claims, ECO, BIZ, deps, seedBooking, leg, NO, previewTripChange } = w;
    const { PATCH } = await import("../../app/[locale]/(ops)/api/staff/bookings/[id]/route");

    const capacity = (await su<{ n: number }[]>`select passenger_capacity as n from public.vehicle_classes where slug = ${VAN}`)[0]!.n;
    expect(capacity).toBe(12);
    const vanBooking = await seedBooking("patch-van", ECO, { local: "2030-01-09T10:00" });
    await su`update public.booking_legs set vehicle_class_id = (select id from public.vehicle_classes where slug = ${VAN}), pax = 10
              where booking_id = ${vanBooking.id}`;
    const before = await leg(vanBooking.id);
    expect(before.pax).toBe(10);
    const eventsBefore = (await su<{ n: number }[]>`select count(*)::int as n from public.booking_events where booking_id = ${vanBooking.id}`)[0]!.n;

    const patch = (body: unknown) =>
      (PATCH as unknown as (r: Request) => Promise<Response>)(
        new Request(`https://dashboard.vamostaxi.site/api/staff/bookings/${vanBooking.reference}`, { method: "PATCH", body: JSON.stringify(body) }),
      );
    for (const party of [{ pax: capacity + 1 }, { pax: 11 }, { pax: capacity + 1, bags: 2 }, { klass: "economy", pax: 2 }]) {
      const refused = await patch(party);
      expect(refused.status).toBe(400);
      expect(await refused.json()).toMatchObject({ ok: false, code: "use-change" });
    }
    expect(await leg(vanBooking.id)).toEqual(before);
    expect((await su<{ n: number }[]>`select count(*)::int as n from public.booking_events where booking_id = ${vanBooking.id}`)[0]!.n).toBe(eventsBefore);
    expect((await su<{ n: number }[]>`select count(*)::int as n from public.booking_edit_requests where booking_id = ${vanBooking.id}`)[0]!.n).toBe(0);

    // The trip change's price step on a trip of the fixture world: a party of 13 fits no class; 12 fits Van luxury only.
    const trip = await seedBooking("party", ECO, { local: "2030-01-10T10:00" });
    const tooMany = await previewTripChange(env, claims, trip.reference, { ...NO, pax: capacity + 1 }, deps);
    if (!tooMany.ok) throw new Error(`preview refused: ${JSON.stringify(tooMany)}`);
    for (const slug of [ECO, BIZ, VAN]) {
      expect(tooMany.classes.find((c) => c.slug === slug), `class ${slug} at ${capacity + 1} travellers`)
        .toMatchObject({ ok: false, code: "class-too-small" });
    }
    const exactly = await previewTripChange(env, claims, trip.reference, { ...NO, pax: capacity }, deps);
    if (!exactly.ok) throw new Error(`preview refused: ${JSON.stringify(exactly)}`);
    expect(exactly.classes.find((c) => c.slug === ECO)).toMatchObject({ ok: false, code: "class-too-small" });
    expect(exactly.classes.find((c) => c.slug === BIZ)).toMatchObject({ ok: false, code: "class-too-small" });
    // At 12 the seats of Van luxury are enough: its row is not "class-too-small". (It reads "trip-data", not a
    // price: the fixture's saved price record was written before the Van luxury rate existed and carries no
    // total for it. That is the fixture's data, not a seat limit.)
    const vanAt12 = exactly.classes.find((c) => c.slug === VAN)!;
    expect(vanAt12).toMatchObject({ name: "Van luxury", ok: false });
    expect((vanAt12 as { code?: string }).code).not.toBe("class-too-small");
    expect(await leg(trip.id)).toMatchObject({ pax: 2 });
  });

  it("item 1: a paid Van luxury booking of 10 travellers reads 10 on the manage link's read and on the signed-in list's read", { timeout: 60_000 }, async () => {
    const w = world!;
    const { su, env, ECO, seedBooking } = w;
    const { hashManageToken } = await import("../checkout/manage-token");
    const { asCustomer } = await import("../db/identity");
    const { GET } = await import("../../app/api/manage/booking/route");

    const van = await seedBooking("van10", ECO, { local: "2030-01-11T10:00" });
    await su`update public.booking_legs set vehicle_class_id = (select id from public.vehicle_classes where slug = ${VAN}), pax = 10
              where booking_id = ${van.id}`;
    const raw = `tok-${tag}-crw-van-link-0123456789`;
    const hex = await hashManageToken(raw);
    await su`insert into public.booking_access_tokens (booking_id, token_hash, expires_at, purpose)
             values (${van.id}, decode(${hex}, 'hex'), now() + interval '30 days', 'manage')`;

    // The manage page's read: GET /api/manage/booking -> manage_booking_read.
    const res = await GET(new Request(`https://vamostaxi.site/api/manage/booking?token=${raw}`));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; booking: { reference: string; pax: number; bags: number; status: string } };
    expect(body.ok).toBe(true);
    expect(body.booking).toMatchObject({ reference: van.reference, pax: 10, status: "confirmed" });

    // The signed-in list's read (the same select /api/account/bookings runs for the account views).
    const email = `p6e-${tag}-van10@example.test`;
    const ownerId = `${tag}-0000-4000-a000-0000000000c3`;
    await su`insert into auth.users (id, email, aud, role, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
             values (${ownerId}, ${email}, 'authenticated', 'authenticated', '{}'::jsonb, '{}'::jsonb, now(), now())`;
    const listed = await asCustomer(env, { sub: ownerId, email, role: "authenticated" } as VamosClaims, (sql) => sql<{ pax: number }[]>`
      select l.pax from public.bookings b join public.booking_legs l on l.booking_id = b.id and l.leg_seq = 1
       where b.reference = ${van.reference} and lower(b.contact_email::text) = lower(${email})`);
    expect(listed).toEqual([{ pax: 10 }]);
  });
});
