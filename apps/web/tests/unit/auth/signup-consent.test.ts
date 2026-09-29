// Cause H: sign-up consent never landed (no session at sign-up). Now the confirmation
// callback writes it once, using the new session.
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

describe("sign-up consent on confirmation", () => {
  it("writes one consent row for the new user and marks it done", async () => {
    const updateUser = confirmedUser("pending");
    const res = await GET(cb());
    expect(res.status).toBe(302);
    expect(db.claims).toEqual([{ sub: "u1", role: "authenticated", email: "a@b.co" }]);
    // set_config(subject) then record_consent(..., method, locale, ...)
    expect(db.calls).toHaveLength(2);
    expect(db.calls[0]).toEqual(["3b241101-e2bb-4255-8caf-4136c566a962"]);
    expect(db.calls[1]).toContain("de");
    expect(db.calls[1]).toContain("settings_change");
    expect(updateUser).toHaveBeenCalledWith({ data: { signup_consent: "2026-09-12" } });
    expect(setCookieHeaders(res).join("\n")).toContain("sb-x-auth-token=refreshed");
  });

  it("does not write a second row once the flag holds the policy version", async () => {
    const updateUser = confirmedUser("2026-09-12");
    await GET(cb());
    expect(db.calls).toHaveLength(0);
    expect(updateUser).not.toHaveBeenCalled();
  });

  it("a database failure never breaks the redirect", async () => {
    confirmedUser("pending");
    db.fail = true;
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const res = await GET(cb());
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).not.toContain("error=1");
  });
});

describe("sign-up leaves the flag for the callback", () => {
  it("password sign-up stores signup_consent pending in user_metadata", async () => {
    const signUp = vi.fn(async (..._a: unknown[]) => ({ error: null }));
    state.auth.signUp = signUp as never;
    await POST(
      authPost({ mode: "signup", method: "password", email: "a@b.co", password: "12345678", firstName: "A", lastName: "B" }),
    );
    expect(signUp.mock.calls[0]?.[0]).toMatchObject({ options: { data: { signup_consent: "pending" } } });
  });

  it("magic-link sign-up stores it too", async () => {
    const otp = vi.fn(async (..._a: unknown[]) => ({ error: null }));
    state.auth.signInWithOtp = otp as never;
    await POST(authPost({ mode: "signup", method: "magic", email: "a@b.co", firstName: "A", lastName: "B" }));
    expect(otp.mock.calls[0]?.[0]).toMatchObject({ options: { data: { signup_consent: "pending" } } });
  });
});
