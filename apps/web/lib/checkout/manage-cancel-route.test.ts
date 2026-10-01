// apps/web/lib/checkout/manage-cancel-route.test.ts
//
// Guest cancel names its booking (review of 5dcb9e6c, 2026-10-02). vt_manage is one cookie for the whole
// site: opening a second e-mailed link, or paying a second booking (a return trip is a second booking),
// replaces it. A cancel pressed in an older tab of booking A must never cancel booking B, the cookie's
// booking now. POST /api/manage/cancel runs the real paidCancelGuest; the guest database role is
// simulated as row security does it: a token sees its own booking only.

import { beforeEach, describe, expect, it, vi } from "vitest";

const A = { id: "aaaaaaaa-0000-4000-8000-00000000000a", reference: "VT-26-0101" };
const B = { id: "bbbbbbbb-0000-4000-8000-00000000000b", reference: "VT-26-0102" };
const OWN: Record<string, { id: string; reference: string }> = { "hash(token-a)": A, "hash(token-b)": B };
const cancelled: string[] = [];
const notifyCancellation = vi.fn();
let jarCookie = "";

vi.mock("@opennextjs/cloudflare", () => ({
  getCloudflareContext: async () => ({ env: { tag: "env" } }),
}));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => (jarCookie ? { value: jarCookie } : undefined) }),
}));
vi.mock("@/lib/checkout/manage-token", () => ({
  MANAGE_COOKIE_NAME: "vt_manage",
  readManageCookie: (value: string) => value,
  hashManageToken: async (raw: string) => `hash(${raw})`,
}));
vi.mock("@/lib/security/origin", () => ({ csrfForbidden: () => null }));
vi.mock("@/lib/abuse/account-write", () => ({ accountWriteForbidden: async () => null }));
vi.mock("../db/identity", () => ({
  asGuest: async (_env: unknown, hash: string, fn: (sql: unknown) => unknown) => {
    const own = OWN[hash];
    const sql = async (strings: TemplateStringsArray) => {
      const text = strings.join("?");
      if (text.includes("manage_booking_cancel")) {
        if (!own) return [];
        cancelled.push(own.reference);
        return [{ booking_id: own.id, refund_mode: "pending_ops", refund_rappen: null, stripe_payment_intent_id: "pi_1" }];
      }
      if (text.includes("from public.bookings")) return own ? [own] : [];
      throw new Error(`unexpected guest sql: ${text}`);
    };
    return fn(sql);
  },
  asCustomer: vi.fn(),
  asSystem: vi.fn(),
  asStaff: vi.fn(),
}));
vi.mock("../db/system-reads", () => ({ loadPaidCancelMail: async () => null }));
vi.mock("../lifecycle/notify-lifecycle", () => ({
  notifyCancellation: (...a: unknown[]) => notifyCancellation(...a),
}));

import { POST } from "../../app/api/manage/cancel/route";

function post(body: unknown): Request {
  return new Request("https://vamostaxi.site/api/manage/cancel", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  cancelled.length = 0;
  notifyCancellation.mockReset();
  jarCookie = "";
});

describe("POST /api/manage/cancel names the booking it cancels", () => {
  it("cookie for B, page of A: 409 wrong-booking and nothing is cancelled", async () => {
    jarCookie = "token-b";
    const res = await POST(post({ ref: A.reference }));
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ ok: false, code: "wrong-booking" });
    expect(cancelled).toEqual([]);
    expect(notifyCancellation).not.toHaveBeenCalled();
  });

  it("cookie for B and no reference: refused the same way, nothing cancelled", async () => {
    jarCookie = "token-b";
    const res = await POST(post({}));
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ ok: false, code: "wrong-booking" });
    expect(cancelled).toEqual([]);
  });

  it("cookie and reference match: B is cancelled (by reference, any case, or by id)", async () => {
    jarCookie = "token-b";
    const byRef = await POST(post({ ref: B.reference }));
    expect(byRef.status).toBe(200);
    expect(await byRef.json()).toMatchObject({ ok: true, bookingId: B.id });
    expect(await (await POST(post({ ref: B.reference.toLowerCase() }))).json()).toMatchObject({ ok: true });
    expect(await (await POST(post({ bookingId: B.id }))).json()).toMatchObject({ ok: true });
    expect(cancelled).toEqual([B.reference, B.reference, B.reference]);
  });

  it("no cookie: the token in the body with its own reference cancels that booking; another reference does not", async () => {
    expect((await POST(post({ token: "token-a", ref: B.reference }))).status).toBe(409);
    expect(cancelled).toEqual([]);
    const res = await POST(post({ token: "token-a", ref: A.reference }));
    expect(res.status).toBe(200);
    expect(cancelled).toEqual([A.reference]);
  });

  it("no cookie and no token, or a token that opens nothing: 404, nothing cancelled", async () => {
    expect((await POST(post({ ref: A.reference }))).status).toBe(404);
    expect((await POST(post({ token: "token-gone", ref: A.reference }))).status).toBe(404);
    expect(cancelled).toEqual([]);
  });
});
