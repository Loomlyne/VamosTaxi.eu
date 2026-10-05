// Security S5 (owner, question form, 2026-10-05): "Email me a sign-in link" for an address with NO account makes the
// account and mails a confirmation, so for a new address the same invisible Turnstile check as sign-up runs first.
// An existing customer signs in as before, with no check. Nothing tells the two apart from outside: same body, status,
// verifier cookie and floor, and a new address without a passed check is answered with a call for an address no
// account can have, so nothing is mailed or made.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { authPost, resetHarness, state, writeCookies } from "./harness";

const db = vi.hoisted(() => ({
  user: { user_exists: false, confirmed: false, checkout_origin: false } as { user_exists: boolean; confirmed: boolean; checkout_origin: boolean },
  readFails: false,
  reads: [] as string[],
  marked: [] as string[],
  floor: 0,
}));

vi.mock("@opennextjs/cloudflare", async () => (await import("./harness")).cloudflareMock);
vi.mock("next/headers", async () => (await import("./harness")).headersMock);
vi.mock("@supabase/ssr", async () => (await import("./harness")).ssrMock);
vi.mock("@/lib/turnstile", async () => (await import("./harness")).turnstileMock);
vi.mock("@/lib/db/identity", () => ({
  asSystem: async (_env: unknown, fn: (tx: unknown) => Promise<unknown>) => fn(async () => []),
}));
vi.mock("@/lib/db/system-reads", () => ({
  readCheckoutAccountUserState: async (_env: unknown, email: string) => {
    db.reads.push(email);
    if (db.readFails) throw new Error("db down");
    return db.user;
  },
  markAccountFinishPending: async (_env: unknown, email: string) => {
    db.marked.push(email);
  },
  staffActiveForEmail: async () => true,
}));
vi.mock("@/lib/auth/checkout-sign-in", async () => {
  const actual = await vi.importActual<typeof import("@/lib/auth/checkout-sign-in")>("@/lib/auth/checkout-sign-in");
  return {
    ...actual,
    holdCheckoutFloor: async () => {
      db.floor += 1;
    },
  };
});

const { POST } = await import("@/app/api/auth/route");

const EXISTING = { user_exists: true, confirmed: true, checkout_origin: false };
const NEW = { user_exists: false, confirmed: false, checkout_origin: false };
const UNCONFIRMED = { user_exists: true, confirmed: false, checkout_origin: false };
const DECOY = /^no-link-[0-9a-f-]{36}@invalid\.invalid$/;

type OtpArgs = { email: string; options: { shouldCreateUser: boolean } };
let otpCalls: OtpArgs[];

beforeEach(() => {
  resetHarness();
  db.user = NEW;
  db.readFails = false;
  db.reads = [];
  db.marked = [];
  db.floor = 0;
  otpCalls = [];
  // The PKCE flow stores its verifier cookie before it asks Supabase, whoever the address is.
  state.auth.signInWithOtp = (async (args: OtpArgs) => {
    otpCalls.push(args);
    writeCookies({ name: "sb-lab-auth-token-code-verifier", value: "v", options: { path: "/" } } as never);
    return { error: DECOY.test(args.email) ? { code: "otp_disabled" } : null };
  }) as never;
});

async function link(email: string, extra: Record<string, unknown> = {}, host = "vamostaxi.site") {
  const res = await POST(authPost({ mode: "signin", method: "magic", email, ...extra }, host));
  return { status: res.status, body: await res.json(), cookies: res.headers.getSetCookie().length };
}

describe("S5: the sign-in link needs the human check for a new address only", () => {
  it("an existing customer with no token: the link is sent to the real address, no check is asked", async () => {
    db.user = EXISTING;
    const out = await link("mia@example.test");
    expect(out).toMatchObject({ status: 200, body: { stage: "sent" } });
    expect(otpCalls).toHaveLength(1);
    expect(otpCalls[0]).toMatchObject({ email: "mia@example.test", options: { shouldCreateUser: true } });
    expect(state.turnstileCalls).toEqual([]);
  });

  it("an existing customer who sends a token anyway: still no check is asked", async () => {
    db.user = EXISTING;
    await link("mia@example.test", { turnstileToken: "tok", idempotencyKey: "k" });
    expect(otpCalls[0]).toMatchObject({ email: "mia@example.test" });
    expect(state.turnstileCalls).toEqual([]);
  });

  it("a new address with no token: nothing is sent to it or made, the answer is the neutral 'sent'", async () => {
    const out = await link("new@example.test");
    expect(out).toMatchObject({ status: 200, body: { stage: "sent" } });
    expect(otpCalls).toHaveLength(1);
    expect(otpCalls[0]?.email).toMatch(DECOY);
    expect(otpCalls[0]?.options.shouldCreateUser).toBe(false);
    expect(JSON.stringify(otpCalls)).not.toContain("new@example.test");
    expect(db.marked).toEqual([]);
    // Cloudflare is not even asked about an empty answer.
    expect(state.turnstileCalls).toEqual([]);
  });

  it("a new address with a refused token: same, and the check was asked once", async () => {
    const out = await link("new@example.test", { turnstileToken: "fail", idempotencyKey: "k" });
    expect(out).toMatchObject({ status: 200, body: { stage: "sent" } });
    expect(otpCalls[0]?.email).toMatch(DECOY);
    expect(state.turnstileCalls.map((c) => [c.token, c.action])).toEqual([["fail", "account"]]);
    expect(db.marked).toEqual([]);
  });

  it("a new address with a good token: checked as action 'account', then the account is made and marked", async () => {
    const out = await link("new@example.test", { turnstileToken: "tok", idempotencyKey: "k" });
    expect(out).toMatchObject({ status: 200, body: { stage: "sent" } });
    expect(state.turnstileCalls.map((c) => [c.token, c.action])).toEqual([["tok", "account"]]);
    expect(otpCalls).toHaveLength(1);
    expect(otpCalls[0]).toMatchObject({ email: "new@example.test", options: { shouldCreateUser: true } });
    expect(db.marked).toEqual(["new@example.test"]);
  });

  it("an account whose sign-up was never confirmed counts as new", async () => {
    db.user = UNCONFIRMED;
    await link("half@example.test");
    expect(otpCalls[0]?.email).toMatch(DECOY);
    otpCalls = [];
    await link("half@example.test", { turnstileToken: "tok" });
    expect(otpCalls[0]).toMatchObject({ email: "half@example.test" });
  });

  it("an account-state read that fails counts as new (fails closed): no token, nothing mailed; with a token it goes on", async () => {
    db.readFails = true;
    const err = vi.spyOn(console, "error").mockImplementation(() => undefined);
    await link("mia@example.test");
    expect(otpCalls[0]?.email).toMatch(DECOY);
    otpCalls = [];
    await link("mia@example.test", { turnstileToken: "tok" });
    err.mockRestore();
    expect(otpCalls[0]).toMatchObject({ email: "mia@example.test" });
  });

  it("existing and new addresses without a token get the same body, status and cookies, and the same floor", async () => {
    db.user = EXISTING;
    const existing = await link("mia@example.test");
    const floorAfterExisting = db.floor;
    db.user = NEW;
    const fresh = await link("new@example.test");
    expect(fresh).toEqual(existing);
    expect(existing.cookies).toBeGreaterThan(0);
    expect(floorAfterExisting).toBe(1);
    expect(db.floor).toBe(2);
  });

  it("the per-address bucket is spent first for every address, so a 429 says nothing about an account", async () => {
    state.env.AUTH_RATE_LIMITER = { limit: async ({ key }: { key: string }) => ({ success: !key.startsWith("auth-link:") }) };
    db.user = EXISTING;
    const existing = await link("mia@example.test");
    db.user = NEW;
    const fresh = await link("new@example.test");
    expect(existing).toMatchObject({ status: 429 });
    expect(fresh).toEqual(existing);
    expect(db.reads).toEqual([]);
    expect(otpCalls).toEqual([]);
  });

  it("the same token posted for two new addresses: the second is refused by the server's own fresh key", async () => {
    // The fake of Cloudflare's rule lives in signup-turnstile-real.test.ts with the real helper; here the harness
    // fake records the key, which must be different for every check.
    await link("a@example.test", { turnstileToken: "tok", idempotencyKey: "same" });
    await link("b@example.test", { turnstileToken: "tok", idempotencyKey: "same" });
    const keys = state.turnstileCalls.map((c) => c.idempotencyKey);
    expect(keys).toHaveLength(2);
    expect(keys).not.toContain("same");
    expect(keys[0]).not.toBe(keys[1]);
  });

  it("the dashboard host is unchanged: never makes an account, never reads the account state, never asks for a check", async () => {
    const out = await link("new@example.test", {}, "dashboard.vamostaxi.site");
    expect(out).toMatchObject({ status: 200, body: { stage: "sent" } });
    expect(otpCalls).toHaveLength(1);
    expect(otpCalls[0]).toMatchObject({ email: "new@example.test", options: { shouldCreateUser: false } });
    expect(db.reads).toEqual([]);
    expect(state.turnstileCalls).toEqual([]);
  });

  it("the link SIGN-UP is as before: still 403 without a token", async () => {
    const res = await POST(authPost({ mode: "signup", method: "magic", email: "n@example.test", firstName: "A", lastName: "B", consent: true }));
    expect(res.status).toBe(403);
    expect(otpCalls).toEqual([]);
  });
});
