// apps/web/lib/checkout/customer-paths.local.test.ts
//
// 26.2 P6, D13 + D19 on a real local database through the REAL Worker client (asGuest with a
// manage token, asCustomer with the signed-in owner's claims; `fetch_types: false`, login
// `vamos_edge`). The customer's own doors the two booking views call: the time-change request, the
// flight number, and (new) the confirmation sent again. Found 2026-10-01: the customer lookup of the
// first two filtered on bookings.erased_at, a column neither customer role may read, so every call
// failed with 42501 before it reached its own check. Only the mail sender is replaced.
// Skipped unless VAMOS_LOCAL_DB_PORT names a DISPOSABLE local stack; rows are committed.
import { afterAll, describe, expect, it, vi } from "vitest";
import type { VamosClaims } from "../db/identity";
import { openWorld } from "../ops/trip-change.local-fixture";

const PORT = process.env["VAMOS_LOCAL_DB_PORT"];
const sendConfirmation = vi.fn();
const sendFlightNumber = vi.fn();

vi.mock("@vamos/emails/confirmation", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@vamos/emails/confirmation")>();
  return {
    ...actual,
    sendConfirmation: (...a: unknown[]) => sendConfirmation(...a),
    sendFlightNumber: (...a: unknown[]) => sendFlightNumber(...a),
  };
});

const tag = Math.random().toString(16).slice(2, 10).padEnd(8, "0");
const adminId = `${tag}-0000-4000-a000-000000000007`;
const STAFF = { sub: adminId, role: "authenticated", aal: "aal2", app_metadata: { vamos_role: "admin" } } as VamosClaims;

describe.skipIf(!PORT)("the customer's own doors through the real Worker client (local, committed rows)", () => {
  let world: Awaited<ReturnType<typeof openWorld>> | null = null;
  afterAll(async () => {
    await world?.close();
  });

  it("time change, flight number and resend work for the manage link and for the signed-in owner", { timeout: 60_000 }, async () => {
    const w = await openWorld(PORT!, tag, adminId, STAFF);
    world = w;
    const { su, env, ECO, seedBooking, leg } = w;
    const { requestCustomerTimeChange, writeCustomerFlightNo } = await import("../ops/edit-request");
    const { resendCustomerConfirmation } = await import("./customer-resend");
    const { hashManageToken } = await import("./manage-token");

    const b = await seedBooking("cust", ECO, { local: "2030-01-06T10:00" });
    const raw = `tok-${tag}-manage-link-0123456789`;
    const hex = await hashManageToken(raw);
    await su`insert into public.booking_access_tokens (booking_id, token_hash, expires_at, purpose)
             values (${b.id}, decode(${hex}, 'hex'), now() + interval '30 days', 'manage')`;
    const guest = { kind: "guest" as const, manageTokenHashHex: hex };
    // The signed-in owner is a real account (the request row names it), seen by the booking's address.
    const ownerId = `${tag}-0000-4000-a000-0000000000c1`;
    await su`insert into auth.users (id, email, aud, role, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
             values (${ownerId}, ${`p6e-${tag}-cust@example.test`}, 'authenticated', 'authenticated', '{}'::jsonb, '{}'::jsonb, now(), now())`;
    const owner = {
      kind: "customer" as const,
      claims: { sub: ownerId, email: `p6e-${tag}-cust@example.test`, role: "authenticated" } as VamosClaims,
    };

    // Time change (D13): the manage link, then the signed-in owner (replaces the first request).
    expect(await requestCustomerTimeChange(env, guest, b.reference, { scheduledLocal: "2030-01-06T11:00" })).toMatchObject({ ok: true, status: "requested" });
    expect(await requestCustomerTimeChange(env, owner, b.reference, { scheduledLocal: "2030-01-06T12:00" })).toMatchObject({ ok: true, status: "requested" });
    const reqs = await su<{ status: string; local: string }[]>`
      select status, payload ->> 'scheduled_local' as local from public.booking_edit_requests where booking_id = ${b.id} order by created_at`;
    expect(reqs).toEqual([{ status: "superseded", local: "2030-01-06T11:00" }, { status: "requested", local: "2030-01-06T12:00" }]);

    // Flight number (D19): saved at once by either door.
    sendFlightNumber.mockResolvedValue({ ok: true, providerMessageId: "f1" });
    expect(await writeCustomerFlightNo(env, guest, b.reference, "lx 77")).toMatchObject({ ok: true, flightNo: "LX 77" });
    expect(await writeCustomerFlightNo(env, owner, b.reference, "lx 78")).toMatchObject({ ok: true, flightNo: "LX 78" });
    expect((await su<{ flight_no: string }[]>`select flight_no from public.booking_legs where booking_id = ${b.id}`)[0]!.flight_no).toBe("LX 78");
    // The account list (signed in) reads the flight number too, so the account view shows the row.
    const { asCustomer } = await import("../db/identity");
    const listed = await asCustomer(env, owner.claims, (sql) => sql<{ flight_no: string | null }[]>`
      select l.flight_no from public.bookings b join public.booking_legs l on l.booking_id = b.id and l.leg_seq = 1
       where b.reference = ${b.reference} and lower(b.contact_email::text) = lower(${owner.claims.email!})`);
    expect(listed).toEqual([{ flight_no: "LX 78" }]);

    // Resend (D19): the confirmation again, to the booking's own address, by either door.
    sendConfirmation.mockResolvedValue({ ok: true, providerMessageId: "c1" });
    expect(await resendCustomerConfirmation(env, guest, b.reference)).toEqual({ ok: true, bookingId: b.id, email: `p6e-${tag}-cust@example.test` });
    expect(await resendCustomerConfirmation(env, owner, b.reference)).toMatchObject({ ok: true });
    expect(sendConfirmation).toHaveBeenCalledTimes(2);
    expect(sendConfirmation.mock.calls[0]![1]).toMatchObject({ reference: b.reference, contactEmail: `p6e-${tag}-cust@example.test` });

    // Someone else's booking is not found through either door.
    const other = await seedBooking("other-cust", ECO, { local: "2030-01-06T15:00" });
    expect(await resendCustomerConfirmation(env, guest, other.reference)).toEqual({ ok: false, code: "not-found" });
    expect(await resendCustomerConfirmation(env, owner, other.reference)).toEqual({ ok: false, code: "not-found" });
    expect(await leg(b.id)).toMatchObject({ scheduled_local: "2030-01-06T10:00" });
  });
});
