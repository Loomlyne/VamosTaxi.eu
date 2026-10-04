// Cause A: on the Worker, cookies().set does not attach to a hand-built Response, so every
// cookie Supabase writes (PKCE verifier, session) must be copied onto the answer by hand.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { authPost, resetHarness, setCookieHeaders, state, writeCookies } from "./harness";

vi.mock("@opennextjs/cloudflare", async () => (await import("./harness")).cloudflareMock);
vi.mock("next/headers", async () => (await import("./harness")).headersMock);
vi.mock("@supabase/ssr", async () => (await import("./harness")).ssrMock);
vi.mock("@/lib/db/identity", () => ({
  asSystem: async (_env: unknown, fn: (tx: unknown) => Promise<void>) => {
    await fn(async () => []);
  },
}));

const { POST } = await import("@/app/api/auth/route");
const { GET } = await import("@/app/api/auth/callback/route");

const verifier = { name: "sb-x-auth-token-code-verifier", value: "verifier-1", options: { path: "/", maxAge: 3600 } };
const session = { name: "sb-x-auth-token", value: "session-1", options: { path: "/", maxAge: 3600 } };

beforeEach(() => resetHarness());

describe("PKCE verifier reaches the browser", () => {
  it("signup sends the verifier cookie", async () => {
    state.auth.signUp = (async () => {
      writeCookies(verifier);
      return { error: null };
    }) as never;
    const res = await POST(
      authPost({ mode: "signup", method: "password", email: "a@b.co", password: "12345678", firstName: "A", lastName: "B", consent: true }),
    );
    expect(await res.json()).toEqual({ stage: "sent" });
    expect(setCookieHeaders(res).join("\n")).toContain("sb-x-auth-token-code-verifier=verifier-1");
  });

  it("magic link sends the verifier cookie", async () => {
    state.auth.signInWithOtp = (async () => {
      writeCookies(verifier);
      return { error: null };
    }) as never;
    const res = await POST(authPost({ mode: "signin", method: "magic", email: "a@b.co" }));
    expect(await res.json()).toEqual({ stage: "sent" });
    expect(setCookieHeaders(res).join("\n")).toContain("code-verifier=verifier-1");
  });

  it("forgot password sends the verifier cookie, same body when Supabase errors", async () => {
    state.auth.resetPasswordForEmail = (async () => {
      writeCookies(verifier);
      return { error: { code: "over_email_send_rate_limit" } };
    }) as never;
    const res = await POST(authPost({ mode: "forgot", email: "a@b.co" }));
    expect(await res.json()).toEqual({ stage: "sent" });
    expect(setCookieHeaders(res).join("\n")).toContain("code-verifier=verifier-1");
  });

  it("update-password copies the refreshed session cookies", async () => {
    state.auth.getUser = (async () => ({ data: { user: { id: "u1" } }, error: null })) as never;
    state.auth.updateUser = (async () => {
      writeCookies(session);
      return { error: null };
    }) as never;
    const res = await POST(authPost({ action: "update-password", password: "12345678" }));
    expect(await res.json()).toEqual({ ok: true });
    expect(setCookieHeaders(res).join("\n")).toContain("sb-x-auth-token=session-1");
  });

  it("update-profile copies the refreshed session cookies", async () => {
    state.auth.getUser = (async () => ({ data: { user: { id: "u1" } }, error: null })) as never;
    state.auth.updateUser = (async () => {
      writeCookies(session);
      return { error: null };
    }) as never;
    const res = await POST(authPost({ action: "update-profile", firstName: "A", lastName: "B", consent: true }));
    expect(await res.json()).toEqual({ ok: true });
    expect(setCookieHeaders(res).join("\n")).toContain("sb-x-auth-token=session-1");
  });
});

describe("callback", () => {
  const cb = (q: string) =>
    new Request(`https://vamostaxi.site/api/auth/callback?${q}`, { headers: { cookie: "a=b" } });

  it("puts the session cookie on the redirect after a good exchange", async () => {
    state.auth.exchangeCodeForSession = (async () => {
      writeCookies(session);
      return { error: null };
    }) as never;
    const res = await GET(cb("code=abc&next=%2F"));
    expect(res.status).toBe(302);
    expect(setCookieHeaders(res).join("\n")).toContain("sb-x-auth-token=session-1");
  });

  it("still copies the verifier removal on a failed exchange", async () => {
    state.auth.exchangeCodeForSession = (async () => {
      writeCookies({ ...verifier, value: "", options: { path: "/", maxAge: 0 } });
      return { error: { code: "flow_state_not_found" } };
    }) as never;
    const res = await GET(cb("code=abc&next=%2F"));
    expect(res.headers.get("location")).toContain("/sign-in?error=1");
    expect(setCookieHeaders(res).join("\n")).toContain("code-verifier=; Path=/; Max-Age=0");
  });
});
