// Cause D: the staff e-mail link created customer accounts (shouldCreateUser true).
import { beforeEach, describe, expect, it, vi } from "vitest";
import { authPost, resetHarness, state } from "./harness";

vi.mock("@opennextjs/cloudflare", async () => (await import("./harness")).cloudflareMock);
vi.mock("next/headers", async () => (await import("./harness")).headersMock);
vi.mock("@supabase/ssr", async () => (await import("./harness")).ssrMock);

const { POST } = await import("@/app/api/auth/route");
const body = { mode: "signin", method: "magic", email: "nobody@example.com" };

beforeEach(() => resetHarness());

describe("e-mail link", () => {
  it("dashboard never creates a user and still answers sent", async () => {
    const otp = vi.fn(async (..._a: unknown[]) => ({ error: { code: "otp_disabled" } }));
    state.auth.signInWithOtp = otp as never;
    const res = await POST(authPost(body, "dashboard.vamostaxi.site"));
    expect(await res.json()).toEqual({ stage: "sent" });
    expect(otp.mock.calls[0]?.[0]).toMatchObject({ options: { shouldCreateUser: false } });
  });

  it("public site sign-in link never creates users either (27 D-36)", async () => {
    const otp = vi.fn(async (..._a: unknown[]) => ({ error: null }));
    state.auth.signInWithOtp = otp as never;
    await POST(authPost(body));
    expect(otp.mock.calls[0]?.[0]).toMatchObject({ options: { shouldCreateUser: false } });
  });
});
