// Security S5 (owner, 2026-10-05, question form): sign-up (password and link) and forgot-password on the public
// sign-in page need the same "Verify you are human" check the booking uses (Cloudflare Turnstile). The route
// refuses without a valid token, before anything is recorded, counted or mailed. Sign-in itself has no check.
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
  staffActiveForEmail: async () => true,
}));

const { POST } = await import("@/app/api/auth/route");

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const base = { email: "Mia@Example.test", firstName: "Mia", lastName: "K", consent: true };
const flows = [
  ["password sign-up", { mode: "signup", method: "password", password: "12345678", ...base }, "signUp"],
  ["link sign-up", { mode: "signup", method: "magic", ...base }, "otp"],
  ["forgot password", { mode: "forgot", email: "Mia@Example.test" }, "reset"],
] as const;

function mailCalls() {
  const calls: Array<{ kind: string; args: unknown }> = [];
  state.auth.signUp = (async (args: unknown) => {
    calls.push({ kind: "signUp", args });
    return { error: null };
  }) as never;
  state.auth.signInWithOtp = (async (args: unknown) => {
    calls.push({ kind: "otp", args });
    return { error: null };
  }) as never;
  state.auth.resetPasswordForEmail = (async (_email: string, args: unknown) => {
    calls.push({ kind: "reset", args });
    return { error: null };
  }) as never;
  return calls;
}

beforeEach(() => {
  resetHarness();
  db.order = [];
});

describe("S5: Turnstile on the public sign-up and forgot-password", () => {
  it.each(flows)("%s with a valid token: checked once as action 'account', then sent", async (_n, body, kind) => {
    const calls = mailCalls();
    const res = await POST(authPost({ ...body, turnstileToken: "tok", idempotencyKey: "key-1" }));
    expect(res.status).toBe(200);
    // The key is made on the server; the "key-1" in the body is ignored (token replay, S5 review).
    expect(state.turnstileCalls).toEqual([
      { secret: undefined, token: "tok", action: "account", idempotencyKey: expect.stringMatching(UUID) },
    ]);
    expect(state.turnstileCalls[0]?.idempotencyKey).not.toBe("key-1");
    expect(calls.map((c) => c.kind)).toEqual([kind]);
    // The token pair never reaches Supabase or the stored metadata.
    expect(JSON.stringify(calls[0]?.args)).not.toContain("tok");
  });

  it.each(flows)("%s with no token: 403 challenge-failed, nothing recorded, counted or mailed", async (_n, body) => {
    const calls = mailCalls();
    const res = await POST(authPost(body));
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ ok: false, reason: "challenge-failed" });
    expect(calls).toEqual([]);
    expect(db.order).toEqual([]);
    // Cloudflare is not even asked about an empty answer.
    expect(state.turnstileCalls).toEqual([]);
    // Only the per-IP bucket was spent: a bot with no token cannot use up a real person's address bucket.
    expect(state.limiterCalls.map((c) => c.key)).toEqual(["auth:203.0.113.9"]);
  });

  it.each(flows)("%s with a token far longer than any Turnstile token: refused without asking Cloudflare", async (_n, body) => {
    const calls = mailCalls();
    const res = await POST(authPost({ ...body, turnstileToken: "x".repeat(2049) }));
    expect(res.status).toBe(403);
    expect(state.turnstileCalls).toEqual([]);
    expect(calls).toEqual([]);
  });

  it.each(flows)("%s with a token Cloudflare refuses: same 403, nothing sent", async (_n, body) => {
    const calls = mailCalls();
    const res = await POST(authPost({ ...body, turnstileToken: "fail" }));
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ ok: false, reason: "challenge-failed" });
    expect(calls).toEqual([]);
    expect(db.order).toEqual([]);
  });

  it.each(flows)("%s: the refusal is the same for a known and an unknown address", async (_n, body) => {
    mailCalls();
    const a = await POST(authPost({ ...body, email: "known@example.test" }));
    const b = await POST(authPost({ ...body, email: "nobody@example.test" }));
    expect([a.status, await a.json()]).toEqual([b.status, await b.json()]);
  });

  it("a sign-up without the tick is refused for the tick first, and the token is not spent", async () => {
    const calls = mailCalls();
    const res = await POST(authPost({ mode: "signup", method: "password", password: "12345678", ...base, consent: false, turnstileToken: "tok" }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ ok: false, reason: "consent-required" });
    expect(state.turnstileCalls).toEqual([]);
    expect(calls).toEqual([]);
  });

  it("an address that is not an address sends nothing and asks for no check", async () => {
    const calls = mailCalls();
    const res = await POST(authPost({ mode: "forgot", email: "not-an-address" }));
    expect(await res.json()).toEqual({ stage: "sent" });
    expect(state.turnstileCalls).toEqual([]);
    expect(calls).toEqual([]);
  });

  it("the per-address bucket still applies after a good token", async () => {
    state.env.AUTH_RATE_LIMITER = {
      limit: async ({ key }: { key: string }) => ({ success: !key.startsWith("auth-") }),
    };
    const calls = mailCalls();
    const res = await POST(authPost({ mode: "forgot", email: "Mia@Example.test", turnstileToken: "tok" }));
    expect(res.status).toBe(429);
    expect(state.turnstileCalls).toHaveLength(1);
    expect(calls).toEqual([]);
  });
});

describe("S5: what stays as it was", () => {
  it("password sign-in, e-mail code and sign-in link ask for no check", async () => {
    mailCalls();
    state.env.AUTH_RATE_LIMITER = limiter("auth");
    await POST(authPost({ mode: "signin", method: "password", email: "a@b.co", password: "12345678" }));
    await POST(authPost({ mode: "verify-code", email: "a@b.co", code: "123456" }));
    await POST(authPost({ mode: "signin", method: "magic", email: "a@b.co" }));
    expect(state.turnstileCalls).toEqual([]);
  });

  it("the dashboard host: sign-up is still answered 'sent' with no check; forgot-password asks the browser for no token (the mail hook keeps its mail to staff)", async () => {
    const calls = mailCalls();
    const signup = await POST(authPost({ mode: "signup", method: "password", password: "12345678", ...base }, "dashboard.vamostaxi.site"));
    expect(await signup.json()).toEqual({ stage: "sent" });
    const forgot = await POST(authPost({ mode: "forgot", email: "mia@example.test" }, "dashboard.vamostaxi.site"));
    expect(forgot.status).toBe(200);
    expect(await forgot.json()).toEqual({ stage: "sent" });
    expect(calls.map((c) => c.kind)).toEqual(["reset"]);
    expect(state.turnstileCalls).toEqual([]);
  });

  it("the checkout sign-in link keeps its own check (action 'account', 403 send_failed)", async () => {
    mailCalls();
    const body = { mode: "signin", method: "magic", origin: "checkout", email: "a@b.co", turnstileToken: "fail" };
    const res = await POST(authPost(body));
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ stage: "form", banner: "send_failed" });
    expect(state.turnstileCalls.map((c) => c.action)).toEqual(["account"]);
  });

  it.each(flows)("%s: the same token posted twice is verified with a different key each time", async (_n, body) => {
    mailCalls();
    await POST(authPost({ ...body, turnstileToken: "tok", idempotencyKey: "same-key" }));
    await POST(authPost({ ...body, email: "other@example.test", turnstileToken: "tok", idempotencyKey: "same-key" }));
    const keys = state.turnstileCalls.map((c) => c.idempotencyKey);
    expect(keys).toHaveLength(2);
    expect(keys).not.toContain("same-key");
    expect(keys[0]).not.toBe(keys[1]);
  });
});
