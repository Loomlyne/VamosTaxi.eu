// Security S5 (owner, 2026-10-05): the check on /sign-in must not be walkable around. lib/auth/actions.ts is a
// "use server" file, so signUpAction and requestPasswordResetAction can be posted straight at any Next route with a
// Next-Action header (proved on the test lab: a sign-up mail went out with no token). Both now need a passed
// Turnstile check, with the same helper, action name and neutral answer as the rate limit in that file.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { resetHarness, state } from "./harness";

const seen = vi.hoisted(() => ({ agreements: 0 }));

vi.mock("@opennextjs/cloudflare", async () => (await import("./harness")).cloudflareMock);
vi.mock("next/headers", async () => (await import("./harness")).headersMock);
vi.mock("@/lib/turnstile", async () => (await import("./harness")).turnstileMock);
vi.mock("next-intl/navigation", () => ({ createNavigation: () => ({ redirect: () => undefined }) }));
vi.mock("next-intl/server", () => ({ getLocale: async () => "en" }));
vi.mock("@/lib/auth/signup-agreement", () => ({
  recordSignupAgreement: async () => {
    seen.agreements += 1;
    return true;
  },
}));
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: async () => ({
    auth: new Proxy({} as Record<string, unknown>, { get: (_t, prop: string) => state.auth[prop] }),
  }),
}));

const { signUpAction, requestPasswordResetAction, requestOtpAction } = await import("@/lib/auth/actions");

const signUpBody = {
  mode: "signup",
  method: "password",
  email: "mia@example.test",
  password: "12345678",
  firstName: "Mia",
  lastName: "K",
  consent: true,
} as never;

function mails() {
  const calls: string[] = [];
  state.auth.signUp = (async () => {
    calls.push("signUp");
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
  seen.agreements = 0;
});

describe("S5: the server actions cannot walk around the sign-in check", () => {
  it("sign-up action with a valid token: checked as action 'account', agreement recorded, mail sent", async () => {
    const calls = mails();
    const result = await signUpAction(signUpBody, "en", "tok");
    expect(result).toEqual({ stage: "sent" });
    expect(state.turnstileCalls.map((c) => [c.token, c.action])).toEqual([["tok", "account"]]);
    expect(seen.agreements).toBe(1);
    expect(calls).toEqual(["signUp"]);
  });

  it("forgot-password action with a valid token: checked, mail sent", async () => {
    const calls = mails();
    const result = await requestPasswordResetAction("mia@example.test", "en", "tok");
    expect(result).toEqual({ stage: "sent" });
    expect(state.turnstileCalls.map((c) => [c.token, c.action])).toEqual([["tok", "account"]]);
    expect(calls).toEqual(["reset"]);
  });

  it.each([
    ["no token", undefined],
    ["an empty token", ""],
    ["a refused token", "fail"],
    ["an oversized token", "x".repeat(2049)],
  ])("sign-up action with %s: neutral answer, no agreement record, no mail", async (_n, token) => {
    const calls = mails();
    const result = await signUpAction(signUpBody, "en", token as string | undefined);
    expect(result).toEqual({ stage: "sent" });
    expect(seen.agreements).toBe(0);
    expect(calls).toEqual([]);
  });

  it.each([
    ["no token", undefined],
    ["an empty token", ""],
    ["a refused token", "fail"],
    ["an oversized token", "x".repeat(2049)],
  ])("forgot-password action with %s: neutral answer, no mail", async (_n, token) => {
    const calls = mails();
    const result = await requestPasswordResetAction("mia@example.test", "en", token as string | undefined);
    expect(result).toEqual({ stage: "sent" });
    expect(calls).toEqual([]);
  });

  it("an empty or oversized token never reaches Cloudflare", async () => {
    mails();
    await signUpAction(signUpBody, "en", "");
    await requestPasswordResetAction("mia@example.test", "en", "x".repeat(2049));
    expect(state.turnstileCalls).toEqual([]);
  });
});

describe("S5: the link sign-up action needs the check, the link sign-in action does not", () => {
  const linkSignUp = { mode: "signup", method: "magic", email: "mia@example.test", firstName: "Mia", lastName: "K", consent: true } as never;
  const linkSignIn = { mode: "signin", method: "magic", email: "mia@example.test" } as never;

  function otpCalls() {
    const calls: Array<{ email: string; shouldCreateUser: boolean }> = [];
    state.auth.signInWithOtp = (async (args: { email: string; options: { shouldCreateUser: boolean } }) => {
      calls.push({ email: args.email, shouldCreateUser: args.options.shouldCreateUser });
      return { error: null };
    }) as never;
    return calls;
  }

  it("link sign-up with a valid token: checked as action 'account', agreement recorded, the account request is made", async () => {
    const calls = otpCalls();
    const result = await requestOtpAction(linkSignUp, "en", "tok");
    expect(result).toEqual({ stage: "sent" });
    expect(state.turnstileCalls.map((c) => [c.token, c.action])).toEqual([["tok", "account"]]);
    expect(seen.agreements).toBe(1);
    expect(calls).toEqual([{ email: "mia@example.test", shouldCreateUser: true }]);
  });

  it.each([
    ["no token", undefined],
    ["an empty token", ""],
    ["a refused token", "fail"],
    ["an oversized token", "x".repeat(2049)],
  ])("link sign-up with %s: neutral answer, no agreement record, nothing sent", async (_n, token) => {
    const calls = otpCalls();
    const result = await requestOtpAction(linkSignUp, "en", token as string | undefined);
    expect(result).toEqual({ stage: "sent" });
    expect(seen.agreements).toBe(0);
    expect(calls).toEqual([]);
  });

  it("link sign-in needs no token: it mails an existing customer and never makes an account", async () => {
    const calls = otpCalls();
    const result = await requestOtpAction(linkSignIn, "en");
    expect(result).toEqual({ stage: "sent" });
    expect(state.turnstileCalls).toEqual([]);
    expect(calls).toEqual([{ email: "mia@example.test", shouldCreateUser: false }]);
  });
});
