// Cause G: an unconfirmed address was shown as "wrong password".
import { beforeEach, describe, expect, it, vi } from "vitest";
import { authPost, resetHarness, state, writeCookies, setCookieHeaders } from "./harness";

vi.mock("@opennextjs/cloudflare", async () => (await import("./harness")).cloudflareMock);
vi.mock("next/headers", async () => (await import("./harness")).headersMock);
vi.mock("@supabase/ssr", async () => (await import("./harness")).ssrMock);

const { POST } = await import("@/app/api/auth/route");
const signin = { mode: "signin", method: "password", email: "a@b.co", password: "12345678" };

beforeEach(() => resetHarness());

describe("unconfirmed e-mail", () => {
  it("answers 400 email-not-confirmed", async () => {
    state.auth.signInWithPassword = (async () => ({ error: { code: "email_not_confirmed" } })) as never;
    const res = await POST(authPost(signin));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ ok: false, reason: "email-not-confirmed" });
  });

  it("a wrong password is still the credentials banner", async () => {
    state.auth.signInWithPassword = (async () => ({ error: { code: "invalid_credentials" } })) as never;
    const res = await POST(authPost(signin));
    expect(await res.json()).toEqual({ stage: "form", banner: "credentials" });
  });
});

describe("resend-confirmation", () => {
  it("re-sends the sign-up mail with the callback url and answers sent", async () => {
    const resend = vi.fn(async () => {
      writeCookies({ name: "sb-x-auth-token-code-verifier", value: "v", options: { path: "/" } });
      return { error: null };
    });
    state.auth.resend = resend as never;
    const res = await POST(authPost({ mode: "resend-confirmation", email: "a@b.co" }));
    expect(await res.json()).toEqual({ stage: "sent" });
    expect(resend).toHaveBeenCalledWith({
      type: "signup",
      email: "a@b.co",
      options: { emailRedirectTo: "https://vamostaxi.site/api/auth/callback?next=%2F" },
    });
    expect(setCookieHeaders(res).join("\n")).toContain("code-verifier=v");
  });

  it("answers sent even when Supabase refuses (unknown or already confirmed)", async () => {
    state.auth.resend = (async () => ({ error: { code: "user_not_found" } })) as never;
    const res = await POST(authPost({ mode: "resend-confirmation", email: "who@b.co" }));
    expect(await res.json()).toEqual({ stage: "sent" });
  });

  it("is limited per address", async () => {
    state.env.AUTH_RATE_LIMITER = {
      limit: async ({ key }: { key: string }) => ({ success: !key.startsWith("auth-resend:") }),
    };
    const resend = vi.fn();
    state.auth.resend = resend as never;
    const res = await POST(authPost({ mode: "resend-confirmation", email: "a@b.co" }));
    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({ ok: false, reason: "rate-limited" });
    expect(resend).not.toHaveBeenCalled();
  });
});
