// Cause F: a customer signing in on the dashboard got a session and no message.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { authPost, resetHarness, setCookieHeaders, state, writeCookies } from "./harness";

vi.mock("@opennextjs/cloudflare", async () => (await import("./harness")).cloudflareMock);
vi.mock("next/headers", async () => (await import("./harness")).headersMock);
vi.mock("@supabase/ssr", async () => (await import("./harness")).ssrMock);

vi.mock("@/lib/auth/staff-sign-in-method", async (orig) => ({
  ...(await orig<typeof import("@/lib/auth/staff-sign-in-method")>()),
  readOwnSignInMethod: async () => "password",
}));

const { POST } = await import("@/app/api/auth/route");
const password = { mode: "signin", method: "password", email: "a@b.co", password: "12345678" };
const session = { name: "sb-x-auth-token", value: "session-1", options: { path: "/" } };
const removal = { name: "sb-x-auth-token", value: "", options: { path: "/", maxAge: 0 } };

function signedIn(user: Record<string, unknown>, signOut = vi.fn()) {
  state.auth.signInWithPassword = (async () => {
    writeCookies(session);
    return { error: null };
  }) as never;
  state.auth.getUser = (async () => ({ data: { user }, error: null })) as never;
  state.auth.signOut = (async () => {
    signOut();
    writeCookies(removal);
    return { error: null };
  }) as never;
  return signOut;
}

beforeEach(() => resetHarness());

describe("dashboard sign-in", () => {
  it("customer: 403 not-staff, session signed out, no session cookie sent", async () => {
    const signOut = signedIn({ id: "u1", email: "a@b.co", app_metadata: {} });
    const res = await POST(authPost(password, "dashboard.vamostaxi.site"));
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ ok: false, reason: "not-staff" });
    expect(signOut).toHaveBeenCalled();
    const cookies = setCookieHeaders(res).join("\n");
    expect(cookies).not.toContain("session-1");
    expect(cookies).toContain("Max-Age=0");
  });

  it("customer on the public site is unchanged", async () => {
    signedIn({ id: "u1", email: "a@b.co", app_metadata: {} });
    const res = await POST(authPost(password));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(setCookieHeaders(res).join("\n")).toContain("session-1");
  });

  it("admin stays signed in on the dashboard", async () => {
    signedIn({ id: "u2", email: "a@b.co", app_metadata: { vamos_role: "admin" } });
    const res = await POST(authPost(password, "dashboard.vamostaxi.site"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(setCookieHeaders(res).join("\n")).toContain("session-1");
  });

  it("passkey sign-in by a customer is refused the same way", async () => {
    signedIn({ id: "u1", email: "a@b.co", app_metadata: {} });
    state.auth.passkey = {
      verifyAuthentication: async () => {
        writeCookies(session);
        return { data: { session: { access_token: "x" } }, error: null };
      },
    } as never;
    const res = await POST(
      authPost({ action: "passkey-verify", challengeId: "c", credential: { id: "x" } }, "dashboard.vamostaxi.site"),
    );
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ ok: false, reason: "not-staff" });
  });
});
