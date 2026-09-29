// Cause C: sign-in had the 4/60 quote bucket and answered "wrong password" when limited.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { authPost, limiter, resetHarness, state } from "./harness";

vi.mock("@opennextjs/cloudflare", async () => (await import("./harness")).cloudflareMock);
vi.mock("next/headers", async () => (await import("./harness")).headersMock);
vi.mock("@supabase/ssr", async () => (await import("./harness")).ssrMock);

const { POST } = await import("@/app/api/auth/route");
const signin = { mode: "signin", method: "password", email: "a@b.co", password: "12345678" };

beforeEach(() => resetHarness());

describe("sign-in rate limit", () => {
  it("uses AUTH_RATE_LIMITER, not the quote bucket", async () => {
    await POST(authPost(signin));
    expect(state.limiterCalls.map((c) => c.name)).toEqual(["auth"]);
  });

  it("answers 429 rate-limited, not the credentials banner", async () => {
    state.env.AUTH_RATE_LIMITER = limiter("auth", false);
    const res = await POST(authPost(signin));
    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({ ok: false, reason: "rate-limited" });
  });

  it("allows the attempt when the binding is missing", async () => {
    delete state.env.AUTH_RATE_LIMITER;
    const res = await POST(authPost(signin));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });
});
