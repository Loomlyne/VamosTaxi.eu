// 27 D-36: the sign-in link never creates an account, answers the same for every
// address, and holds the same minimum time for every address (T-27-57).
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { authPost, resetHarness, state } from "./harness";

const floor = vi.hoisted(() => ({ calls: 0, release: null as null | (() => void) }));

vi.mock("@opennextjs/cloudflare", async () => (await import("./harness")).cloudflareMock);
vi.mock("next/headers", async () => (await import("./harness")).headersMock);
vi.mock("@supabase/ssr", async () => (await import("./harness")).ssrMock);
vi.mock("@/lib/db/identity", () => ({
  asSystem: async (_env: unknown, fn: (tx: unknown) => Promise<void>) => {
    await fn(async () => []);
  },
}));
vi.mock("@/lib/auth/checkout-sign-in", async () => {
  const actual = await vi.importActual<typeof import("@/lib/auth/checkout-sign-in")>("@/lib/auth/checkout-sign-in");
  return {
    ...actual,
    holdCheckoutFloor: async () => {
      floor.calls += 1;
    },
  };
});

const { POST } = await import("@/app/api/auth/route");
const body = { mode: "signin", method: "magic", email: "someone@example.com" };

beforeEach(() => {
  resetHarness();
  floor.calls = 0;
});

describe("sign-in link on the public host (D-36)", () => {
  it("never creates an account, with or without a returnTo", async () => {
    for (const extra of [{}, { returnTo: "/checkout?class=economy" }]) {
      const otp = vi.fn(async (..._a: unknown[]) => ({ error: null }));
      state.auth.signInWithOtp = otp as never;
      const res = await POST(authPost({ ...body, ...extra }));
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ stage: "sent" });
      expect(otp).toHaveBeenCalledTimes(1);
      expect(otp.mock.calls[0]?.[0]).toMatchObject({ options: { shouldCreateUser: false } });
    }
  });

  it("answers an unknown address byte-for-byte like a known one", async () => {
    state.auth.signInWithOtp = (async () => ({ error: null })) as never;
    const known = await POST(authPost(body));
    state.auth.signInWithOtp = (async () => ({ error: { code: "otp_disabled" } })) as never;
    const unknown = await POST(authPost({ ...body, email: "nobody@example.com" }));
    expect(unknown.status).toBe(known.status);
    expect(await unknown.text()).toBe(await known.text());
  });

  it("awaits the shared response floor for a known and an unknown address", async () => {
    state.auth.signInWithOtp = (async () => ({ error: null })) as never;
    await POST(authPost(body));
    expect(floor.calls).toBe(1);
    state.auth.signInWithOtp = (async () => ({ error: { code: "otp_disabled" } })) as never;
    await POST(authPost({ ...body, email: "nobody@example.com" }));
    expect(floor.calls).toBe(2);
  });

  it("sign-up still creates the account and is not held", async () => {
    const otp = vi.fn(async (..._a: unknown[]) => ({ error: null }));
    state.auth.signInWithOtp = otp as never;
    await POST(authPost({ mode: "signup", method: "magic", email: "n@example.com", firstName: "A", lastName: "B", consent: true }));
    expect(otp.mock.calls[0]?.[0]).toMatchObject({ options: { shouldCreateUser: true } });
    expect(floor.calls).toBe(0);
  });
});

describe("sign-in link on the dashboard host", () => {
  it("never creates an account", async () => {
    const otp = vi.fn(async (..._a: unknown[]) => ({ error: null }));
    state.auth.signInWithOtp = otp as never;
    await POST(authPost(body, "dashboard.vamostaxi.site"));
    expect(otp.mock.calls[0]?.[0]).toMatchObject({ options: { shouldCreateUser: false } });
  });
});

describe("requestOtpAction", () => {
  it("passes createUser false for sign-in only", () => {
    const src = readFileSync(resolve(__dirname, "../../../lib/auth/actions.ts"), "utf8");
    expect(src).toMatch(/mode: "signin", email: body\.data\.email, locale: loc\.data, createUser: false/);
    expect(src.match(/createUser: false/g)?.length).toBe(1);
  });
});
