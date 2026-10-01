// apps/web/lib/checkout/customer-resend-routes.test.ts
//
// 26.2 P6, D19: the two "Resend email" doors. POST /api/manage/resend (the manage link: cookie or
// token) and POST /api/account/bookings/resend (the signed-in owner). CSRF first, then the shared
// account write limit, like the flight number and time-change routes. A send that did not happen is
// an error answer, never "ok".

import { beforeEach, describe, expect, it, vi } from "vitest";

const resend = vi.fn();
let claims: { sub: string; email: string } | null = { sub: "u1", email: "anna@example.test" };
let jarCookie = "";

vi.mock("@opennextjs/cloudflare", () => ({
  getCloudflareContext: async () => ({ env: { tag: "env" } }),
}));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => (jarCookie ? { value: jarCookie } : undefined) }),
}));
vi.mock("@/lib/account/session", () => ({
  customerClaims: async () => claims,
}));
vi.mock("@/lib/checkout/manage-token", () => ({
  MANAGE_COOKIE_NAME: "vt_manage",
  readManageCookie: (value: string) => value,
  hashManageToken: async (raw: string) => `hash(${raw})`,
}));
vi.mock("@/lib/checkout/customer-resend", () => ({
  resendCustomerConfirmation: (...a: unknown[]) => resend(...a),
}));
vi.mock("@/lib/security/origin", () => ({ csrfForbidden: () => null }));
vi.mock("@/lib/abuse/account-write", () => ({ accountWriteForbidden: async () => null }));

import { POST as guestPost } from "../../app/api/manage/resend/route";
import { POST as accountPost } from "../../app/api/account/bookings/resend/route";

function post(body: unknown): Request {
  return new Request("https://vamostaxi.site/api/x", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  claims = { sub: "u1", email: "anna@example.test" };
  jarCookie = "";
});

describe("POST /api/manage/resend (D19)", () => {
  it("sends with the manage token and answers with the address", async () => {
    resend.mockResolvedValue({ ok: true, bookingId: "b1", email: "anna@example.test" });
    const res = await guestPost(post({ token: "raw-token", ref: "VT-26-0801" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, bookingId: "b1", email: "anna@example.test" });
    expect(resend).toHaveBeenCalledWith({ tag: "env" }, { kind: "guest", manageTokenHashHex: "hash(raw-token)" }, "VT-26-0801");
  });

  it("the cookie wins over the body token", async () => {
    jarCookie = "cookie-token";
    resend.mockResolvedValue({ ok: true, bookingId: "b1", email: "anna@example.test" });
    await guestPost(post({ token: "body-token", ref: "VT-26-0801" }));
    expect(resend.mock.calls[0]![1]).toEqual({ kind: "guest", manageTokenHashHex: "hash(cookie-token)" });
  });

  it("no token or no reference: not found, nothing sent", async () => {
    expect((await guestPost(post({ ref: "VT-26-0801" }))).status).toBe(404);
    expect((await guestPost(post({ token: "raw-token" }))).status).toBe(404);
    expect(resend).not.toHaveBeenCalled();
  });

  it("a send that did not happen is an error answer", async () => {
    resend.mockResolvedValue({ ok: false, code: "not-sent" });
    const res = await guestPost(post({ token: "raw-token", ref: "VT-26-0801" }));
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ ok: false, code: "not-sent" });
    resend.mockResolvedValue({ ok: false, code: "not-found" });
    expect((await guestPost(post({ token: "raw-token", ref: "VT-26-0801" }))).status).toBe(404);
  });
});

describe("POST /api/account/bookings/resend (D19)", () => {
  it("sends for the signed-in owner", async () => {
    resend.mockResolvedValue({ ok: true, bookingId: "b2", email: "anna@example.test" });
    const res = await accountPost(post({ ref: "VT-26-0802" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, bookingId: "b2", email: "anna@example.test" });
    expect(resend).toHaveBeenCalledWith({ tag: "env" }, { kind: "customer", claims }, "VT-26-0802");
  });

  it("signed out: 401, nothing sent", async () => {
    claims = null;
    expect((await accountPost(post({ ref: "VT-26-0802" }))).status).toBe(401);
    expect(resend).not.toHaveBeenCalled();
  });

  it("a send that did not happen is an error answer", async () => {
    resend.mockResolvedValue({ ok: false, code: "not-sent" });
    const res = await accountPost(post({ ref: "VT-26-0802" }));
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ ok: false, code: "not-sent" });
  });
});
