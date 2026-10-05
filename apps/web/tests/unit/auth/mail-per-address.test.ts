// Security S5 (2026-10-05): sign-up (password and link) and forgot-password spend a per-address
// bucket on top of the per-IP one, so one address cannot be sent branded mail from many IPs.
// Over the bucket: 429 rate-limited, no agreement row, no Supabase call, no mail.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { authPost, limiter, resetHarness, state } from "./harness";

const db = vi.hoisted(() => ({ order: [] as string[] }));

vi.mock("@opennextjs/cloudflare", async () => (await import("./harness")).cloudflareMock);
vi.mock("next/headers", async () => (await import("./harness")).headersMock);
vi.mock("@supabase/ssr", async () => (await import("./harness")).ssrMock);
vi.mock("@/lib/turnstile", async () => (await import("./harness")).turnstileMock);
vi.mock("@/lib/db/identity", () => ({
  asSystem: async (_env: unknown, fn: (tx: unknown) => Promise<unknown>) => {
    db.order.push("record");
    return fn(async () => []);
  },
}));
vi.mock("@/lib/db/system-reads", () => ({
  markAccountFinishPending: async () => undefined,
}));

const { POST } = await import("@/app/api/auth/route");

const pw = { mode: "signup", method: "password", email: "Mia@Example.test", password: "12345678", firstName: "Mia", lastName: "K", consent: true, turnstileToken: "tok" };
const magic = { mode: "signup", method: "magic", email: "Mia@Example.test", firstName: "Mia", lastName: "K", consent: true, turnstileToken: "tok" };
const forgot = { mode: "forgot", email: "Mia@Example.test", turnstileToken: "tok" };

/** The per-IP key passes; any `auth-<kind>:` per-address key answers `perAddress`. */
function perAddressLimiter(perAddress: boolean) {
  const inner = limiter("auth");
  return {
    limit: async ({ key }: { key: string }) => {
      await inner.limit({ key });
      return { success: key.startsWith("auth-") ? perAddress : true };
    },
  };
}

function mailCalls() {
  const calls: string[] = [];
  state.auth.signUp = (async () => {
    calls.push("signUp");
    return { error: null };
  }) as never;
  state.auth.signInWithOtp = (async () => {
    calls.push("otp");
    return { error: null };
  }) as never;
  state.auth.resetPasswordForEmail = (async () => {
    calls.push("reset");
    return { error: null };
  }) as never;
  return calls;
}

beforeEach(() => {
  resetHarness();
  db.order = [];
});

describe("S5: per-address limit on the mail-sending sign-up and forgot-password", () => {
  it.each([
    ["password sign-up", pw, "auth-signup:mia@example.test"],
    ["link sign-up", magic, "auth-signup:mia@example.test"],
    ["forgot password", forgot, "auth-forgot:mia@example.test"],
  ])("%s spends the address bucket (lower-cased) as well as the IP one", async (_name, body, key) => {
    state.env.AUTH_RATE_LIMITER = perAddressLimiter(true);
    const calls = mailCalls();
    const res = await POST(authPost(body));
    expect(res.status).toBe(200);
    expect(state.limiterCalls.map((c) => c.key)).toEqual(["auth:203.0.113.9", key]);
    expect(calls.length).toBe(1);
  });

  it.each([
    ["password sign-up", pw],
    ["link sign-up", magic],
    ["forgot password", forgot],
  ])("%s over the address bucket: 429, no agreement row, no mail", async (_name, body) => {
    state.env.AUTH_RATE_LIMITER = perAddressLimiter(false);
    const calls = mailCalls();
    const res = await POST(authPost(body));
    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({ ok: false, reason: "rate-limited" });
    expect(calls).toEqual([]);
    expect(db.order).toEqual([]);
  });
});
