// A password sign-up posted to the dashboard host created a customer account.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { authPost, resetHarness, state } from "./harness";

vi.mock("@opennextjs/cloudflare", async () => (await import("./harness")).cloudflareMock);
vi.mock("next/headers", async () => (await import("./harness")).headersMock);
vi.mock("@supabase/ssr", async () => (await import("./harness")).ssrMock);
vi.mock("@/lib/db/identity", () => ({
  asSystem: async (_env: unknown, fn: (tx: unknown) => Promise<void>) => {
    await fn(async () => []);
  },
}));

const { POST } = await import("@/app/api/auth/route");
const body = {
  mode: "signup",
  method: "password",
  email: "nobody@example.com",
  password: "a-long-password-1",
  firstName: "Mia",
  lastName: "Keller",
  consent: true,
};

beforeEach(() => resetHarness());

describe("password sign-up on the dashboard host", () => {
  it("answers sent without creating an account", async () => {
    const signUp = vi.fn(async (..._a: unknown[]) => ({ data: {}, error: null }));
    state.auth.signUp = signUp as never;
    const res = await POST(authPost(body, "dashboard.vamostaxi.site"));
    expect(await res.json()).toEqual({ stage: "sent" });
    expect(signUp).not.toHaveBeenCalled();
  });

  it("still signs up on the public site", async () => {
    const signUp = vi.fn(async (..._a: unknown[]) => ({ data: {}, error: null }));
    state.auth.signUp = signUp as never;
    await POST(authPost(body));
    expect(signUp).toHaveBeenCalled();
  });
});
