// apps/web/lib/checkout/account-details-window.local.test.ts
//
// 261002 booking pages polish, item 1, on a real local database through the REAL Worker client: the real
// GET of /api/account/bookings/details (asCustomer, login `vamos_edge`, the signed-in owner's claims; then
// asSystem for compute_cancellation_refund, outside the customer transaction). Only the Cloudflare context
// (the world's env) and the session claims are replaced; none of the SQL is. The unit tests with a mocked SQL
// layer (booking-pages-polish.test.ts) cannot see a grant the customer or system role lacks or a column the
// route reads that the role may not, which is what this file is for.
// Skipped unless VAMOS_LOCAL_DB_PORT names a DISPOSABLE local stack; rows are committed (random tag).
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { VamosClaims } from "../db/identity";
import { openWorld } from "../ops/trip-change.local-fixture";

const PORT = process.env["VAMOS_LOCAL_DB_PORT"];

// The route reads the Cloudflare context and the session; both are set per test from the world below.
const hoisted = vi.hoisted(() => ({ env: null as unknown, claims: null as unknown }));
vi.mock("@opennextjs/cloudflare", () => ({ getCloudflareContext: async () => ({ env: hoisted.env }) }));
vi.mock("@/lib/account/session", () => ({ customerClaims: async () => hoisted.claims }));

const tag = Math.random().toString(16).slice(2, 10).padEnd(8, "0");
const adminId = `${tag}-0000-4000-a000-000000000008`;
const STAFF = { sub: adminId, role: "authenticated", aal: "aal2", app_metadata: { vamos_role: "admin" } } as VamosClaims;

/** The Zurich wall clock `hours` from now as text (YYYY-MM-DDTHH:MM). The fixture takes text: postgres.js sends a
 *  timestamp param through new Date() in the client's time zone (a Mac in Dubai shifted it by 4 h; Workers run in UTC). */
function zurichLocalIn(hours: number): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Zurich", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(new Date(Date.now() + hours * 3_600_000));
  const g = (t: string) => parts.find((p) => p.type === t)!.value;
  return `${g("year")}-${g("month")}-${g("day")}T${g("hour")}:${g("minute")}`;
}

describe.skipIf(!PORT)("GET /api/account/bookings/details through the real Worker client (local, committed rows)", () => {
  let world: Awaited<ReturnType<typeof openWorld>> | null = null;
  let GET: (request: Request) => Promise<Response>;
  let far: { id: string; reference: string };
  let near: { id: string; reference: string };

  const emailOf = (key: string) => `p6e-${tag}-${key}@example.test`;
  const claimsOf = (key: string, n: number) => ({ sub: `${tag}-0000-4000-a000-0000000000d${n}`, email: emailOf(key), role: "authenticated" }) as VamosClaims;
  const call = async (reference: string, as: VamosClaims) => {
    hoisted.claims = as;
    const res = await GET(new Request(`http://localhost/api/account/bookings/details?ref=${encodeURIComponent(reference)}`));
    return { status: res.status, body: (await res.json()) as Record<string, unknown> };
  };

  beforeAll(async () => {
    const w = await openWorld(PORT!, tag, adminId, STAFF);
    world = w;
    hoisted.env = w.env;
    ({ GET } = await import("@/app/api/account/bookings/details/route"));
    // Three real accounts: the owner of each booking (its contact e-mail), and a stranger.
    for (const [key, n] of [["win-far", 1], ["win-near", 2], ["win-stranger", 3]] as const) {
      await w.su`insert into auth.users (id, email, aud, role, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
                 values (${claimsOf(key, n).sub}, ${emailOf(key)}, 'authenticated', 'authenticated', '{}'::jsonb, '{}'::jsonb, now(), now())`;
    }
    // Paid bookings as checkout writes them (captured payment, status confirmed): one years ahead, one a few hours ahead.
    far = await w.seedBooking("win-far", w.ECO, { local: "2030-01-06T10:00" });
    near = await w.seedBooking("win-near", w.ECO, { local: zurichLocalIn(5) });
  }, 60_000);

  afterAll(async () => {
    await world?.close();
  });

  const rowOf = async (id: string) =>
    (await world!.su<{ status: string }[]>`select status::text as status from public.bookings where id = ${id}`)[0]!;

  it("a paid booking more than 24 h ahead: its own status, Cancel, and the automatic full-refund window", { timeout: 60_000 }, async () => {
    const dbMode = (await world!.su<{ refund_mode: string }[]>`select refund_mode from public.compute_cancellation_refund(${far.id}::uuid)`)[0]!;
    expect(dbMode.refund_mode).toBe("auto_full");
    const { status, body } = await call(far.reference, claimsOf("win-far", 1));
    expect(status).toBe(200);
    expect(body).toMatchObject({ ok: true, status: (await rowOf(far.id)).status, canCancel: true, cancelWindow: "auto_full", reviewSubmitted: false });
    // the answer the account view already relied on is still there
    expect(body).toMatchObject({ refundStatus: expect.any(String), refundOwedRappen: expect.any(Number), refundedRappen: expect.any(Number) });
  });

  it("a paid booking less than 24 h ahead: Cancel is offered, the window is the owner's review", { timeout: 60_000 }, async () => {
    const dbMode = (await world!.su<{ refund_mode: string }[]>`select refund_mode from public.compute_cancellation_refund(${near.id}::uuid)`)[0]!;
    expect(dbMode.refund_mode).toBe("pending_ops");
    const { status, body } = await call(near.reference, claimsOf("win-near", 2));
    expect(status).toBe(200);
    expect(body).toMatchObject({ ok: true, status: (await rowOf(near.id)).status, canCancel: true, cancelWindow: "pending_ops", reviewSubmitted: false });
  });

  it("the same booking once it is cancelled: no Cancel and no window", { timeout: 60_000 }, async () => {
    await world!.su`update public.bookings set status = 'cancelled' where id = ${near.id}`;
    const { status, body } = await call(near.reference, claimsOf("win-near", 2));
    expect(status).toBe(200);
    expect(body).toMatchObject({ ok: true, status: "cancelled", canCancel: false, cancelWindow: "none" });
  });

  it("another customer's e-mail finds nothing: 404, the same as a reference that does not exist", { timeout: 60_000 }, async () => {
    const stranger = claimsOf("win-stranger", 3);
    const theirs = await call(far.reference, stranger);
    expect(theirs.status).toBe(404);
    expect(theirs.body).toEqual({ ok: false });
    const none = await call("VT-00-0000", stranger);
    expect(none.status).toBe(404);
    expect(none.body).toEqual({ ok: false });
  });
});
