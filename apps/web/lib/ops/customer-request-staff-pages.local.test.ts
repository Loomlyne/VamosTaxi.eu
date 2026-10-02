// apps/web/lib/ops/customer-request-staff-pages.local.test.ts
//
// 261002, review of item 4 (REVIEW-ITEM4.md), on a real local database through the REAL Worker client
// (asStaff / asSystem / asGuest, `fetch_types: false`, login `vamos_edge`). Only Mapbox, Stripe and the
// mail sender are replaced.
//   finding 1  one Stripe page belongs to one request: the owner confirms the same dearer change twice
//              (same difference, the first page still open and payable); the second request gets a new
//              page, the first is closed; paying the second applies the change, its request is
//              "accepted", nothing is owed, and the customer may then ask for a new time.
//   finding 2  a staff change that never got a page (Stripe failed and the clean-up failed) blocks the
//              customer; the owner's Withdraw ends it with no Stripe step, and the customer may ask again.
// Skipped unless VAMOS_LOCAL_DB_PORT names a DISPOSABLE local stack (login roles vamos_edge / vamos_public
// with their local password); rows are committed (use a scratch stack); synthetic rappen only. Host fixed
// to 127.0.0.1. The rest of item 4 is in customer-request-staff-waiting.local.test.ts (a second file: one
// long run used up the local stack's 100 connection slots). Run the two files one after the other.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { VamosClaims } from "../db/identity";
import { openWorld } from "./trip-change.local-fixture";

const PORT = process.env["VAMOS_LOCAL_DB_PORT"];

const createCheckoutSession = vi.fn();
const expireCheckoutSession = vi.fn(async (..._a: unknown[]) => ({ status: "expired" }));
const retrieveCheckoutSession = vi.fn(async (..._a: unknown[]): Promise<unknown> => null);
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
    retrieveCheckoutSession: (...a: unknown[]) => retrieveCheckoutSession(...a),
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
vi.mock("@/lib/ops/staff-json", async () => {
  const actual = await vi.importActual<typeof import("./staff-json")>("./staff-json");
  return {
    ...actual,
    withStaff: (handler: (claims: unknown, request: Request) => Promise<Response> | Response) =>
      (request: Request) => handler(STAFF_CLAIMS, request),
  };
});

const tag = Math.random().toString(16).slice(2, 10).padEnd(8, "0");
const adminId = `${tag}-0000-4000-a000-00000000001a`;
const STAFF_CLAIMS = { sub: adminId, role: "authenticated", aal: "aal2", app_metadata: { vamos_role: "admin" } } as VamosClaims;

describe.skipIf(!PORT)("one Stripe page per request, and Withdraw without a page (local, committed rows)", () => {
  let world: Awaited<ReturnType<typeof openWorld>> | null = null;

  afterAll(async () => {
    await world?.close();
  });

  beforeAll(async () => {
    const w = await openWorld(PORT!, tag, adminId, STAFF_CLAIMS);
    world = w;
    routeEnv = w.env;
  }, 60_000);

  it("review finding 1: two dearer staff changes with the same difference get two pages; paying the second applies it and the customer may ask again", { timeout: 60_000 }, async () => {
    const w = world!;
    const { su, env, claims, ECO, deps, charged, seedBooking, zug, NO, previewTripChange, confirmTripChange, asSystem, leg } = w;
    const { requestCustomerTimeChange } = await import("./edit-request");
    const { hashManageToken } = await import("../checkout/manage-token");

    const twice = await seedBooking("twice", ECO, { local: "2030-01-12T10:00" });
    const raw = `tok-${tag}-crw-twice-link-0123456789`;
    const hex = await hashManageToken(raw);
    await su`insert into public.booking_access_tokens (booking_id, token_hash, expires_at, purpose)
             values (${twice.id}, decode(${hex}, 'hex'), now() + interval '30 days', 'manage')`;
    const link = { kind: "guest" as const, manageTokenHashHex: hex };

    const want = charged(ECO, 42_517, 3_300).chargedRappen;
    const difference = want - twice.paid;
    const first = `cs_crw_${tag}_1`;
    const second = `cs_crw_${tag}_2`;
    createCheckoutSession.mockReset();
    createCheckoutSession
      .mockResolvedValueOnce({ id: first, url: `https://checkout.stripe.test/c/pay/${first}` })
      .mockResolvedValueOnce({ id: second, url: `https://checkout.stripe.test/c/pay/${second}` });
    // The first page is still open and payable for exactly this difference: the old code reused it.
    retrieveCheckoutSession.mockImplementation(async (..._a: unknown[]) =>
      _a[1] === first
        ? { id: first, status: "open", url: `https://checkout.stripe.test/c/pay/${first}`, currency: "chf", amount_total: difference }
        : null);
    expireCheckoutSession.mockClear();
    sendTripChangePay.mockResolvedValue({ ok: true, providerMessageId: "crw-twice" });

    // The owner confirms the same dearer change twice (e.g. to send the e-mail again): same difference.
    for (const round of [1, 2]) {
      const p = await previewTripChange(env, claims, twice.reference, { ...NO, pickup: zug }, deps);
      if (!p.ok) throw new Error(`preview ${round} refused: ${JSON.stringify(p)}`);
      const c = await confirmTripChange(env, claims, twice.reference, {
        klass: null, expectTotalRappen: want, expectPaidRappen: p.paidRappen, trip: { ...NO, pickup: zug, lock: p.lock! },
      }, "https://dashboard.vamostaxi.site", deps);
      expect(c).toMatchObject({ ok: true, outcome: "extra_required", differenceRappen: difference });
    }
    const rows = await su<{ status: string; session: string | null }[]>`
      select status, extra_session_id as session from public.booking_edit_requests
       where booking_id = ${twice.id} and actor = 'staff' order by created_at, status desc`;
    expect(rows).toHaveLength(2);
    expect(rows).toEqual(expect.arrayContaining([
      { status: "superseded", session: first },
      { status: "requested", session: second },
    ]));
    expect(first).not.toBe(second);
    expect(createCheckoutSession).toHaveBeenCalledTimes(2);
    expect(expireCheckoutSession.mock.calls.map((c) => c[1])).toContain(first);
    // No two requests of this booking share a page (scoped: a scratch stack keeps other runs' rows).
    expect((await su<{ n: number }[]>`
      select count(*)::int as n from (select extra_session_id from public.booking_edit_requests
        where booking_id = ${twice.id} and extra_session_id is not null
        group by extra_session_id having count(*) > 1) d`)[0]!.n).toBe(0);

    // The customer pays the second page (the Stripe webhook's settle, as the system role).
    const settled = await asSystem(env, async (sql) =>
      (await sql<{ applied: boolean; request_id: string }[]>`
        select * from public.checkout_extra_payment_settle(${`evt_crw_${tag}_2`}, ${second}, ${`pi_crw_${tag}_2`}, 'succeeded',
                                                           'CHF', null, null, null::timestamptz, null)`)[0]!,
    );
    expect(settled.applied).toBe(true);
    const after = await su<{ status: string; session: string | null; paid: boolean }[]>`
      select status, extra_session_id as session, extra_payment_id is not null as paid
        from public.booking_edit_requests where booking_id = ${twice.id} and actor = 'staff' and extra_session_id = ${second}`;
    expect(after).toEqual([{ status: "accepted", session: second, paid: true }]);
    expect(await leg(twice.id)).toMatchObject({ pickup_text: "Zug station", pickup_place_id: "mb-zug" });
    expect((await su<{ s: string }[]>`select refund_status as s from public.bookings where id = ${twice.id}`)[0]!.s).toBe("none");

    // Nothing waits any more: the customer may ask for a new time.
    expect(await requestCustomerTimeChange(env, link, twice.reference, { scheduledLocal: "2030-01-12T11:00" }))
      .toMatchObject({ ok: true, status: "requested", bookingId: twice.id });
    retrieveCheckoutSession.mockReset();
    retrieveCheckoutSession.mockImplementation(async () => null);
  });

  it("review finding 2: a staff change that never got a page is withdrawn with no Stripe step, and the customer may ask again", { timeout: 60_000 }, async () => {
    const w = world!;
    const { su, env, claims, ECO, deps, charged, seedBooking, zug, NO, previewTripChange, confirmTripChange } = w;
    const { requestCustomerTimeChange } = await import("./edit-request");
    const { withdrawBookingChange } = await import("./booking-change");
    const { hashManageToken } = await import("../checkout/manage-token");

    const nopage = await seedBooking("nopage", ECO, { local: "2030-01-13T10:00" });
    const raw = `tok-${tag}-crw-nopage-link-0123456789`;
    const hex = await hashManageToken(raw);
    await su`insert into public.booking_access_tokens (booking_id, token_hash, expires_at, purpose)
             values (${nopage.id}, decode(${hex}, 'hex'), now() + interval '30 days', 'manage')`;
    const link = { kind: "guest" as const, manageTokenHashHex: hex };

    const want = charged(ECO, 42_517, 3_300).chargedRappen;
    createCheckoutSession.mockReset();
    createCheckoutSession.mockResolvedValue({ id: `cs_crw_${tag}_np`, url: `https://checkout.stripe.test/c/pay/cs_crw_${tag}_np` });
    sendTripChangePay.mockResolvedValue({ ok: true, providerMessageId: "crw-np" });
    const p = await previewTripChange(env, claims, nopage.reference, { ...NO, pickup: zug }, deps);
    if (!p.ok) throw new Error(`preview refused: ${JSON.stringify(p)}`);
    expect(await confirmTripChange(env, claims, nopage.reference, {
      klass: null, expectTotalRappen: want, expectPaidRappen: p.paidRappen, trip: { ...NO, pickup: zug, lock: p.lock! },
    }, "https://dashboard.vamostaxi.site", deps)).toMatchObject({ ok: true, outcome: "extra_required" });
    // The state the review found reachable: Stripe failed, so no page was stored, and the clean-up that
    // ends the request failed too. Made on this scratch row by SQL.
    await su`update public.booking_edit_requests set extra_session_id = null
              where booking_id = ${nopage.id} and actor = 'staff' and status = 'requested'`;
    expect((await su<{ alive: boolean }[]>`
      select x.expires_at > now() as alive from public.booking_edit_requests r join public.price_snapshots x on x.id = r.extra_snapshot_id
       where r.booking_id = ${nopage.id} and r.status = 'requested'`)[0]!.alive).toBe(true);
    expect(await requestCustomerTimeChange(env, link, nopage.reference, { scheduledLocal: "2030-01-13T11:00" }))
      .toEqual({ ok: false, code: "staff-change-waiting" });

    // The owner withdraws it: no page, so no Stripe step; the database ends it.
    expireCheckoutSession.mockClear();
    retrieveCheckoutSession.mockClear();
    expect(await withdrawBookingChange(env, claims, nopage.reference))
      .toEqual({ ok: true, bookingId: nopage.id, reference: nopage.reference });
    expect(expireCheckoutSession).not.toHaveBeenCalled();
    expect(retrieveCheckoutSession).not.toHaveBeenCalled();
    expect((await su<{ status: string }[]>`
      select status from public.booking_edit_requests where booking_id = ${nopage.id} and actor = 'staff'`)).toEqual([{ status: "withdrawn" }]);

    // The customer may ask again.
    expect(await requestCustomerTimeChange(env, link, nopage.reference, { scheduledLocal: "2030-01-13T11:00" }))
      .toMatchObject({ ok: true, status: "requested", bookingId: nopage.id });
  });
});
