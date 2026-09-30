import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { decodeNextParam } from "@/lib/auth/redirect-target";

type Fn = ReturnType<typeof vi.fn<(...args: any[]) => any>>;
const state = vi.hoisted(() => ({
  otp: null as unknown as Fn,
  limit: null as unknown as Fn,
  ipLimit: null as unknown as Fn,
  turnstile: null as unknown as Fn,
}));

vi.mock("@opennextjs/cloudflare", () => ({
  getCloudflareContext: () => ({
    env: {
      AUTH_RATE_LIMITER: {
        // The first call of each request is the IP bucket (key "auth:"), the rest per-address.
        limit: (arg: { key: string }) => (arg.key.startsWith("auth-checkout:") ? state.limit(arg) : state.ipLimit(arg)),
      },
    },
  }),
}));
vi.mock("@/lib/turnstile", () => ({ verifyTurnstile: (...a: unknown[]) => state.turnstile(...a) }));
vi.mock("@/lib/supabase/server", async () => {
  const actual = await vi.importActual<typeof import("@/lib/supabase/server")>("@/lib/supabase/server");
  return {
    ...actual,
    createServerSupabaseClient: async (_req: Request, sink?: { cookies: unknown[] }) => ({
      auth: {
        signInWithOtp: async (args: unknown) => {
          // The PKCE verifier cookie the real client writes while starting the flow.
          sink?.cookies.push({ name: "sb-pkce-code-verifier", value: "v", options: { path: "/", httpOnly: true } });
          return state.otp(args);
        },
      },
    }),
  };
});

import { POST } from "./route";

function post(body: Record<string, unknown>, host = "vamostaxi.site"): Promise<Response> {
  const promise = POST(
    new Request(`https://${host}/api/auth`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: `https://${host}`, "cf-connecting-ip": "1.2.3.4" },
      body: JSON.stringify(body),
    }),
  );
  return promise;
}

const good = {
  locale: "en",
  returnTo: "/checkout?class=economy",
  method: "magic",
  mode: "signin",
  email: "guest@example.com",
  origin: "checkout",
  turnstileToken: "tok",
  idempotencyKey: "k1",
};

/** Runs the request while fake time moves past the response floor. */
async function run(body: Record<string, unknown>, host?: string): Promise<Response> {
  const p = post(body, host);
  await vi.advanceTimersByTimeAsync(2000);
  return p;
}

beforeEach(() => {
  vi.useFakeTimers();
  state.otp = vi.fn(async (..._a: unknown[]) => ({ error: null as unknown }));
  state.limit = vi.fn(async (..._a: unknown[]) => ({ success: true }));
  state.ipLimit = vi.fn(async (..._a: unknown[]) => ({ success: true }));
  state.turnstile = vi.fn(async (..._a: unknown[]) => ({ ok: true as boolean }));
});
afterEach(() => vi.useRealTimers());

describe("POST /api/auth origin checkout", () => {
  it("answers a known and an unknown address identically and never creates a user", async () => {
    const known = await run(good);
    state.otp = vi.fn(async () => ({ error: { code: "otp_disabled", message: "Signups not allowed for otp" } }));
    const unknown = await run({ ...good, email: "nobody@example.com" });
    expect(known.status).toBe(200);
    expect(unknown.status).toBe(200);
    expect(await known.text()).toBe('{"stage":"sent"}');
    expect(await unknown.text()).toBe('{"stage":"sent"}');
    const arg = state.otp.mock.calls[0]?.[0] as { options: { shouldCreateUser: boolean; emailRedirectTo: string } };
    expect(arg.options.shouldCreateUser).toBe(false);
    expect(decodeNextParam(new URL(arg.options.emailRedirectTo).searchParams.get("nextb"))).toContain("/checkout?class=economy");
  });

  it("carries the PKCE verifier cookie and no session cookie", async () => {
    const res = await run(good);
    const cookies = res.headers.getSetCookie();
    expect(cookies.some((c) => c.startsWith("sb-pkce-code-verifier="))).toBe(true);
    expect(cookies.some((c) => /auth-token/.test(c))).toBe(false);
  });

  it("holds the response until the floor", async () => {
    let done = false;
    const p = post(good).then((r) => { done = true; return r; });
    await vi.advanceTimersByTimeAsync(1000);
    expect(done).toBe(false);
    await vi.advanceTimersByTimeAsync(1000);
    await p;
    expect(done).toBe(true);
  });

  it("refuses on a failed Turnstile without calling Supabase", async () => {
    state.turnstile = vi.fn(async () => ({ ok: false, codes: ["x"] }));
    const res = await run(good);
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ stage: "form", banner: "send_failed" });
    expect(state.otp).not.toHaveBeenCalled();
    expect((state.turnstile.mock.calls[0]?.[2] as { action: string }).action).toBe("account");
  });

  it("answers 429 when the per-address limiter refuses", async () => {
    state.limit = vi.fn(async () => ({ success: false }));
    const res = await run(good);
    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({ ok: false, reason: "rate-limited" });
    expect(state.otp).not.toHaveBeenCalled();
  });

  it("checks the IP limiter first", async () => {
    state.ipLimit = vi.fn(async () => ({ success: false }));
    const res = await run(good);
    expect(res.status).toBe(429);
    expect(state.turnstile).not.toHaveBeenCalled();
    expect(state.limit).not.toHaveBeenCalled();
  });

  it("does not send on the dashboard host", async () => {
    const res = await run(good, "dashboard.vamostaxi.site");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ stage: "sent" });
    expect(state.otp).not.toHaveBeenCalled();
  });

  it("answers sent for a malformed body without sending", async () => {
    const res = await run({ ...good, email: "not-an-email" });
    expect(await res.json()).toEqual({ stage: "sent" });
    expect(state.otp).not.toHaveBeenCalled();
  });
});

describe("POST /api/auth magic from /sign-in", () => {
  const plain = { locale: "en", method: "magic", mode: "signin", email: "guest@example.com" };

  it("never creates an account when returnTo is a checkout URL", async () => {
    await run({ ...plain, returnTo: "/checkout?class=economy" });
    expect((state.otp.mock.calls[0]?.[0] as { options: { shouldCreateUser: boolean } }).options.shouldCreateUser).toBe(false);
  });

  it("never creates an account without a checkout returnTo either (27 D-36)", async () => {
    await run(plain);
    expect((state.otp.mock.calls[0]?.[0] as { options: { shouldCreateUser: boolean } }).options.shouldCreateUser).toBe(false);
  });

  it("sign-up is never affected", async () => {
    await run({ locale: "en", method: "magic", mode: "signup", email: "n@example.com", firstName: "A", lastName: "B", returnTo: "/checkout?class=economy" });
    expect((state.otp.mock.calls[0]?.[0] as { options: { shouldCreateUser: boolean } }).options.shouldCreateUser).toBe(true);
  });
});
