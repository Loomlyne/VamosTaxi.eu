// Cause E: e-mail code sign-in (a code box next to the link).
import { beforeEach, describe, expect, it, vi } from "vitest";
import { authPost, limiter, resetHarness, setCookieHeaders, state, writeCookies } from "./harness";

vi.mock("@opennextjs/cloudflare", async () => (await import("./harness")).cloudflareMock);
vi.mock("next/headers", async () => (await import("./harness")).headersMock);
vi.mock("@supabase/ssr", async () => (await import("./harness")).ssrMock);

const { POST } = await import("@/app/api/auth/route");
const session = { name: "sb-x-auth-token", value: "session-1", options: { path: "/" } };
const removal = { name: "sb-x-auth-token", value: "", options: { path: "/", maxAge: 0 } };

beforeEach(() => resetHarness());

describe("verify-code", () => {
  it("signs in with the digits, spaces stripped, and sends the session cookie", async () => {
    const verify = vi.fn(async () => {
      writeCookies(session);
      return { error: null };
    });
    state.auth.verifyOtp = verify as never;
    const res = await POST(authPost({ mode: "verify-code", email: "a@b.co", code: "123 456" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(verify).toHaveBeenCalledWith({ email: "a@b.co", token: "123456", type: "email" });
    expect(setCookieHeaders(res).join("\n")).toContain("sb-x-auth-token=session-1");
  });

  it("wrong code: 400 code-invalid, no cookie", async () => {
    state.auth.verifyOtp = (async () => ({ error: { code: "otp_expired" } })) as never;
    const res = await POST(authPost({ mode: "verify-code", email: "a@b.co", code: "123456" }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ ok: false, reason: "code-invalid" });
    expect(setCookieHeaders(res)).toEqual([]);
  });

  it("malformed code never reaches Supabase", async () => {
    const verify = vi.fn();
    state.auth.verifyOtp = verify as never;
    const res = await POST(authPost({ mode: "verify-code", email: "a@b.co", code: "12ab56" }));
    expect(res.status).toBe(400);
    expect(verify).not.toHaveBeenCalled();
  });

  it("dashboard: a customer's code is refused as not-staff and the session is cleared", async () => {
    state.auth.verifyOtp = (async () => {
      writeCookies(session);
      return { error: null };
    }) as never;
    state.auth.getUser = (async () => ({ data: { user: { id: "u1", app_metadata: {} } }, error: null })) as never;
    state.auth.signOut = (async () => {
      writeCookies(removal);
      return { error: null };
    }) as never;
    const res = await POST(
      authPost({ mode: "verify-code", email: "a@b.co", code: "123456" }, "dashboard.vamostaxi.site"),
    );
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ ok: false, reason: "not-staff" });
    expect(setCookieHeaders(res).join("\n")).not.toContain("session-1");
  });

  it("counts attempts per address on the auth limiter", async () => {
    state.env.AUTH_RATE_LIMITER = {
      limit: async ({ key }: { key: string }) => ({ success: !key.startsWith("auth-code:") }),
    };
    const verify = vi.fn();
    state.auth.verifyOtp = verify as never;
    const res = await POST(authPost({ mode: "verify-code", email: "A@b.co", code: "123456" }));
    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({ ok: false, reason: "rate-limited" });
    expect(verify).not.toHaveBeenCalled();
    void limiter;
  });
});
