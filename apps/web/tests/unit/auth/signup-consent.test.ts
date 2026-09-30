// 27 D-01: the sign-up confirmation writes no consent_log row; an earlier Accept survives sign-up.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { resetHarness, state, writeCookies, setCookieHeaders } from "./harness";

const db = vi.hoisted(() => ({ calls: [] as unknown[][], claims: [] as unknown[], fail: false }));

vi.mock("@opennextjs/cloudflare", async () => (await import("./harness")).cloudflareMock);
vi.mock("next/headers", async () => (await import("./harness")).headersMock);
vi.mock("@supabase/ssr", async () => (await import("./harness")).ssrMock);
vi.mock("@/lib/db/identity", () => ({
  asCustomer: async (_env: unknown, claims: unknown, fn: (tx: unknown) => Promise<void>) => {
    if (db.fail) throw new Error("db down");
    db.claims.push(claims);
    const tx = async (_strings: TemplateStringsArray, ...values: unknown[]) => {
      db.calls.push(values);
      return [];
    };
    await fn(tx);
  },
}));

const { GET } = await import("@/app/api/auth/callback/route");
const { authPost } = await import("./harness");
const { POST } = await import("@/app/api/auth/route");

const cb = () =>
  new Request("https://vamostaxi.site/api/auth/callback?code=abc&next=%2F", {
    headers: { cookie: "consent_subject=3b241101-e2bb-4255-8caf-4136c566a962", "user-agent": "UA" },
  });

function confirmedUser(signupConsent: string) {
  const updateUser = vi.fn(async () => {
    writeCookies({ name: "sb-x-auth-token", value: "refreshed", options: { path: "/" } });
    return { error: null };
  });
  state.auth.exchangeCodeForSession = (async () => ({ error: null })) as never;
  state.auth.getUser = (async () => ({
    data: {
      user: { id: "u1", email: "a@b.co", user_metadata: { signup_consent: signupConsent, locale: "de" } },
    },
    error: null,
  })) as never;
  state.auth.updateUser = updateUser as never;
  return updateUser;
}

beforeEach(() => {
  resetHarness();
  db.calls = [];
  db.claims = [];
  db.fail = false;
});

describe("confirming a sign-up writes no cookie row (27 D-01)", () => {
  it("the callback route does not import or call any consent writer", () => {
    const src = readFileSync(join(process.cwd(), "app/api/auth/callback/route.ts"), "utf8");
    expect(src).not.toMatch(/signup-consent/);
    expect(src).not.toMatch(/recordSignupConsentOnConfirm/);
    expect(src).not.toMatch(/recordConsent|record_consent/);
  });

  it("a confirm neither calls asCustomer nor touches the pending flag", async () => {
    const updateUser = confirmedUser("pending");
    const res = await GET(cb());
    expect(res.status).toBe(302);
    expect(db.claims).toHaveLength(0);
    expect(db.calls).toHaveLength(0);
    expect(updateUser).not.toHaveBeenCalled();
  });
});

describe("sign-up sets no consent flag", () => {
  it("password sign-up sets no signup_consent key", async () => {
    const signUp = vi.fn(async (..._a: unknown[]) => ({ error: null }));
    state.auth.signUp = signUp as never;
    await POST(
      authPost({ mode: "signup", method: "password", email: "a@b.co", password: "12345678", firstName: "A", lastName: "B" }),
    );
    expect((signUp.mock.calls[0]?.[0] as { options: { data: object } }).options.data).not.toHaveProperty("signup_consent");
  });

  it("magic-link sign-up sets none either", async () => {
    const otp = vi.fn(async (..._a: unknown[]) => ({ error: null }));
    state.auth.signInWithOtp = otp as never;
    await POST(authPost({ mode: "signup", method: "magic", email: "a@b.co", firstName: "A", lastName: "B" }));
    expect((otp.mock.calls[0]?.[0] as { options: { data: object } }).options.data).not.toHaveProperty("signup_consent");
  });
});
