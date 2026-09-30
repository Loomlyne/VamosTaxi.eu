// F12: GET ?token_hash= no longer signs anyone in; the confirm POST checks the sealed address.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { sealAddress } from "@/lib/auth/sealed-address";

const SECRET = "v1,whsec_dGVzdHNlY3JldHRlc3RzZWNyZXQ";

const auth = {
  verifyOtp: vi.fn(),
  exchangeCodeForSession: vi.fn(),
  getUser: vi.fn(),
  signOut: vi.fn(),
};

vi.mock("@opennextjs/cloudflare", () => ({
  getCloudflareContext: () => ({ env: { SEND_EMAIL_HOOK_SECRET: SECRET } }),
}));
const staff = { claims: null as unknown, decision: "allow" as string };
vi.mock("@/lib/ops/session", () => ({
  getStaffClaims: async () => staff.claims,
  staffDecisionOf: () => staff.decision,
}));
vi.mock("@/lib/supabase/server", () => ({
  authSetCookieHeader: (c: { name: string; value: string }) => `${c.name}=${c.value}; Path=/`,
  createServerSupabaseClient: async (_r: Request, sink?: { cookies: { name: string; value: string }[] }) => {
    auth.verifyOtp.mockImplementation(async () => {
      sink?.cookies.push({ name: "sb-test-auth-token", value: "session" });
      return { data: { user: { email: "mia@example.com" } }, error: null };
    });
    auth.signOut.mockImplementation(async () => {
      sink?.cookies.push({ name: "sb-test-auth-token", value: "" });
      return { error: null };
    });
    return { auth };
  },
}));

const { GET, POST } = await import("@/app/api/auth/callback/route");

function post(body: unknown, origin: string | null = "https://vamostaxi.site", host = "vamostaxi.site"): Request {
  return new Request(`https://${host}/api/auth/callback`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(origin ? { origin } : {}) },
    body: JSON.stringify(body),
  });
}

describe("callback GET", () => {
  beforeEach(() => vi.clearAllMocks());

  it("does not create a session from ?token_hash=, it sends the visitor to the confirm page", async () => {
    const res = await GET(
      new Request("https://vamostaxi.site/api/auth/callback?token_hash=abc&type=magiclink&next=%2Faccount&e=xyz"),
    );
    expect(auth.verifyOtp).not.toHaveBeenCalled();
    expect(res.status).toBe(302);
    const loc = new URL(res.headers.get("location") as string);
    expect(loc.pathname).toBe("/sign-in/confirm");
    expect(loc.searchParams.get("token_hash")).toBe("abc");
    expect(loc.searchParams.get("e")).toBe("xyz");
    expect(res.headers.get("set-cookie")).toBeNull();
  });

  it("uses /login/confirm on the dashboard host", async () => {
    const res = await GET(
      new Request("https://dashboard.vamostaxi.site/api/auth/callback?token_hash=abc&type=magiclink"),
    );
    expect(new URL(res.headers.get("location") as string).pathname).toBe("/login/confirm");
    expect(auth.verifyOtp).not.toHaveBeenCalled();
  });

  it("keeps the code (PKCE) branch", async () => {
    auth.exchangeCodeForSession.mockResolvedValue({ error: null });
    const res = await GET(new Request("https://vamostaxi.site/api/auth/callback?code=pkce&next=%2Faccount"));
    expect(auth.exchangeCodeForSession).toHaveBeenCalledWith("pkce");
    expect(res.status).toBe(302);
  });
});

describe("callback POST (confirm)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    auth.getUser.mockResolvedValue({ data: { user: null }, error: null });
    auth.signOut.mockResolvedValue({ error: null });
    staff.claims = null;
    staff.decision = "allow";
  });

  it("refuses a cross-site or missing Origin", async () => {
    const e = await sealAddress("mia@example.com", "abc", SECRET);
    const evil = await POST(post({ token_hash: "abc", type: "magiclink", e }, "https://evil.example"));
    expect(evil.status).toBe(403);
    const none = await POST(post({ token_hash: "abc", type: "magiclink", e }, null));
    expect(none.status).toBe(403);
    expect(auth.verifyOtp).not.toHaveBeenCalled();
  });

  it("refuses a missing or foreign e", async () => {
    const missing = await POST(post({ token_hash: "abc", type: "magiclink" }));
    expect(missing.status).toBe(400);
    expect(await missing.json()).toMatchObject({ ok: false, code: "expired" });
    const moved = await sealAddress("mia@example.com", "other-hash", SECRET);
    const foreign = await POST(post({ token_hash: "abc", type: "magiclink", e: moved }));
    expect(foreign.status).toBe(400);
    expect(auth.verifyOtp).not.toHaveBeenCalled();
  });

  it("refuses an invite type and an unknown type", async () => {
    const e = await sealAddress("mia@example.com", "abc", SECRET);
    expect((await POST(post({ token_hash: "abc", type: "invite", e }))).status).toBe(400);
    expect((await POST(post({ token_hash: "abc", type: "nope", e }))).status).toBe(400);
    expect(auth.verifyOtp).not.toHaveBeenCalled();
  });

  it("refuses when the session belongs to another address and signs it out", async () => {
    const e = await sealAddress("attacker@example.com", "abc", SECRET);
    const res = await POST(post({ token_hash: "abc", type: "magiclink", e }));
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ ok: false, code: "expired" });
    expect(auth.signOut).toHaveBeenCalled();
  });

  it("signs in, copies Set-Cookie by hand and returns the validated target", async () => {
    const e = await sealAddress("mia@example.com", "abc", SECRET);
    const res = await POST(post({ token_hash: "abc", type: "magiclink", e, next: "/account" }));
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toContain("no-store");
    expect(res.headers.get("set-cookie")).toContain("sb-test-auth-token=session");
    expect(await res.json()).toEqual({ ok: true, target: "/account" });
    expect(auth.verifyOtp).toHaveBeenCalledWith({ type: "magiclink", token_hash: "abc" });
  });

  it("never returns an off-site target", async () => {
    const e = await sealAddress("mia@example.com", "abc", SECRET);
    const res = await POST(post({ token_hash: "abc", type: "magiclink", e, next: "https://evil.example/" }));
    expect(((await res.json()) as { target: string }).target).toBe("/account");
  });

  it("switches from another signed-in account", async () => {
    auth.getUser.mockResolvedValue({ data: { user: { email: "ana@example.com" } }, error: null });
    const e = await sealAddress("mia@example.com", "abc", SECRET);
    const res = await POST(post({ token_hash: "abc", type: "magiclink", e }));
    expect(res.status).toBe(200);
    expect(auth.signOut).toHaveBeenCalledWith({ scope: "local" });
  });

  it("dashboard host: a non-staff account is signed straight back out and told why", async () => {
    staff.claims = null;
    const e = await sealAddress("mia@example.com", "abc", SECRET);
    const res = await POST(
      post({ token_hash: "abc", type: "magiclink", e }, "https://dashboard.vamostaxi.site", "dashboard.vamostaxi.site"),
    );
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ ok: false, code: "not-staff" });
    expect(auth.signOut).toHaveBeenCalled();
    // The refused session's cookie must not ride on the answer.
    expect(res.headers.get("set-cookie")).toContain("sb-test-auth-token=;");
    expect(res.headers.get("set-cookie")).not.toContain("sb-test-auth-token=session");
  });

  it("dashboard host: a staff account signs in", async () => {
    staff.claims = { sub: "u1" };
    staff.decision = "step-up";
    const e = await sealAddress("mia@example.com", "abc", SECRET);
    const res = await POST(
      post({ token_hash: "abc", type: "magiclink", e }, "https://dashboard.vamostaxi.site", "dashboard.vamostaxi.site"),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("set-cookie")).toContain("sb-test-auth-token=session");
  });

  it("public host: no staff check (customers sign in)", async () => {
    const e = await sealAddress("mia@example.com", "abc", SECRET);
    const res = await POST(post({ token_hash: "abc", type: "magiclink", e }));
    expect(res.status).toBe(200);
  });
});
