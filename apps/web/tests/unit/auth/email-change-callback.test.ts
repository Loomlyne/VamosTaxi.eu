// Secure e-mail change at the confirm button: two clicks, one per address.
// First click: Supabase answers with no user and no session -> { ok, pending }. Second click: the user comes
// back with the new address and a session.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { sealAddress } from "@/lib/auth/sealed-address";

const SECRET = "v1,whsec_dGVzdHNlY3JldHRlc3RzZWNyZXQ";
const verify = { result: null as unknown };
const auth = { verifyOtp: vi.fn(), getUser: vi.fn(), signOut: vi.fn(), exchangeCodeForSession: vi.fn() };

vi.mock("@opennextjs/cloudflare", () => ({
  getCloudflareContext: () => ({ env: { SEND_EMAIL_HOOK_SECRET: SECRET } }),
}));
vi.mock("@/lib/ops/session", () => ({ getStaffClaims: async () => null, staffDecisionOf: () => "allow" }));
vi.mock("@/lib/supabase/server", () => ({
  authSetCookieHeader: (c: { name: string; value: string }) => `${c.name}=${c.value}; Path=/`,
  createServerSupabaseClient: async (_r: Request, sink?: { cookies: { name: string; value: string }[] }) => {
    auth.verifyOtp.mockImplementation(async () => {
      const r = verify.result as { data: { user: unknown; session?: unknown }; error: unknown };
      if (r.data.user) sink?.cookies.push({ name: "sb-test-auth-token", value: "session" });
      return r;
    });
    auth.signOut.mockImplementation(async () => {
      sink?.cookies.push({ name: "sb-test-auth-token", value: "" });
      return { error: null };
    });
    return { auth };
  },
}));

const { POST } = await import("@/app/api/auth/callback/route");

function post(body: unknown): Request {
  return new Request("https://vamostaxi.site/api/auth/callback", {
    method: "POST",
    headers: { "content-type": "application/json", origin: "https://vamostaxi.site" },
    body: JSON.stringify(body),
  });
}

describe("callback POST: e-mail change", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    auth.getUser.mockResolvedValue({ data: { user: { email: "old@example.com" } }, error: null });
  });

  it("first click (no user, no session) answers pending, sets no cookie and does not sign out", async () => {
    verify.result = { data: { user: null, session: null }, error: null };
    const e = await sealAddress("new@example.com", "h1", SECRET);
    const res = await POST(post({ token_hash: "h1", type: "email_change", e, next: "/account" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, pending: true });
    expect(res.headers.get("set-cookie")).toBeNull();
    expect(auth.signOut).not.toHaveBeenCalled();
  });

  it("a verify failure on e-mail change is still expired", async () => {
    verify.result = { data: { user: null, session: null }, error: { code: "otp_expired" } };
    const e = await sealAddress("new@example.com", "h1", SECRET);
    const res = await POST(post({ token_hash: "h1", type: "email_change", e }));
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ ok: false, code: "expired" });
  });

  it("the pending answer is only for e-mail change (a magic link with no user is expired)", async () => {
    verify.result = { data: { user: null, session: null }, error: null };
    const e = await sealAddress("old@example.com", "h1", SECRET);
    const res = await POST(post({ token_hash: "h1", type: "magiclink", e }));
    expect(res.status).toBe(400);
  });

  it("second click from the NEW address link completes and signs in (address = user.email)", async () => {
    verify.result = { data: { user: { email: "new@example.com", new_email: "" }, session: {} }, error: null };
    const e = await sealAddress("new@example.com", "h2", SECRET);
    const res = await POST(post({ token_hash: "h2", type: "email_change", e, next: "/account" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, target: "/account" });
    expect(res.headers.get("set-cookie")).toContain("sb-test-auth-token=session");
  });

  it("second click from the OLD address link completes and signs in (change is done, old address is gone from the account)", async () => {
    verify.result = { data: { user: { email: "new@example.com", new_email: "" }, session: {} }, error: null };
    const e = await sealAddress("old@example.com", "h2", SECRET);
    const res = await POST(post({ token_hash: "h2", type: "email_change", e }));
    expect(res.status).toBe(200);
    expect((await res.json()) as { ok: boolean }).toMatchObject({ ok: true });
  });

  it("accepts the account's current address and its pending new_email", async () => {
    verify.result = { data: { user: { email: "old@example.com", new_email: "new@example.com" }, session: {} }, error: null };
    for (const who of ["old@example.com", "new@example.com"]) {
      const e = await sealAddress(who, "h3", SECRET);
      const res = await POST(post({ token_hash: "h3", type: "email_change", e }));
      expect(res.status).toBe(200);
    }
  });

  it("refuses an address that is neither the current nor the pending one, and signs out", async () => {
    verify.result = { data: { user: { email: "old@example.com", new_email: "new@example.com" }, session: {} }, error: null };
    const e = await sealAddress("stranger@example.com", "h3", SECRET);
    const res = await POST(post({ token_hash: "h3", type: "email_change", e }));
    expect(res.status).toBe(400);
    expect(auth.signOut).toHaveBeenCalled();
    expect(res.headers.get("set-cookie")).not.toContain("sb-test-auth-token=session");
  });

  it("keeps the seal bound to the token: a seal made for another token is refused before verify", async () => {
    const e = await sealAddress("new@example.com", "other", SECRET);
    const res = await POST(post({ token_hash: "h3", type: "email_change", e }));
    expect(res.status).toBe(400);
    expect(auth.verifyOtp).not.toHaveBeenCalled();
  });
});
